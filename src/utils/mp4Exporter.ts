import { ArrayBufferTarget, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmArrayBufferTarget, Muxer as WebmMuxer } from 'webm-muxer';
import {
  ExportProgressState,
  LyricLine,
  MocapClipData,
  MotionBlurState,
  Particle,
  resolveExportDimensions,
  StudioSettings,
} from '../types/studio';
import type {
  StartWorkerExportPayload,
  WorkerFontDescriptor,
  WorkerOutgoingMessage,
} from '../workers/mp4ExportWorker';
import {
  preparePcmChannelsForEncoder,
  resolveSupportedAudioConfig,
} from './audioCodecConfig';
import {
  createInitialBeatState,
  estimateBpmFromTracker,
  OfflineAudioAnalyzer,
  OfflineLowPassBeatTracker,
  sliceAudioBufferWithFade,
  stepBeatDetector,
} from './audioEngine';
import { RenderImageSource, renderVisualizerFrame } from './canvasRenderer';
import { resolveAutoCycledColors } from './colorHarmony';
import {
  ResolvedVideoConfig,
  resolveSupportedVideoConfigForContainer,
} from './videoConfig';
import { selectBestMediaRecorderMime } from './videoMimeSupport';

export type DynamicBgResolver = (
  trackTimeSec: number,
  width: number,
  height: number
) => Promise<RenderImageSource | null> | RenderImageSource | null;

export interface ExportMp4Options {
  audioBuffer: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  resolveBgImageAtTime?: DynamicBgResolver;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
  autoDownload?: boolean;
  customFileName?: string;
  mocapClip?: MocapClipData | null;
}

export interface ExportMp4Result {
  downloadUrl: string;
  downloadFileName: string;
  fileSizeBytes: number;
  elapsedMs: number;
  totalFrames: number;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'pulsewave-track';
}

const yieldChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;

function yieldToEventLoop(): Promise<void> {
  if (yieldChannel) {
    return new Promise((resolve) => {
      yieldChannel.port1.onmessage = () => resolve();
      yieldChannel.port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function waitForEncoderDequeue(
  encoder: VideoEncoder,
  targetMaxQueue: number,
  signal: AbortSignal,
  hasError: () => boolean
): Promise<void> {
  if (encoder.encodeQueueSize <= targetMaxQueue || signal.aborted || hasError()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      encoder.removeEventListener?.('dequeue', onDequeue);
      clearTimeout(safetyTimer);
      resolve();
    };
    const onDequeue = () => {
      if (encoder.encodeQueueSize <= targetMaxQueue || signal.aborted || hasError()) {
        finish();
      }
    };
    encoder.addEventListener?.('dequeue', onDequeue);
    const safetyTimer = setTimeout(finish, 12);
  });
}

function collectWorkerFonts(): WorkerFontDescriptor[] {
  const collected: WorkerFontDescriptor[] = [];
  if (typeof document === 'undefined' || !document.styleSheets) return collected;

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) {
          const family = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
          const src = rule.style.getPropertyValue('src').trim();
          const weight = rule.style.getPropertyValue('font-weight').trim();
          const style = rule.style.getPropertyValue('font-style').trim();
          if (
            src &&
            (family === 'Plus Jakarta Sans' || family === 'JetBrains Mono')
          ) {
            collected.push({
              family,
              source: src,
              weight: weight || '400',
              style: style || 'normal',
            });
          }
        }
      }
    } catch {
      // Cross-origin stylesheets without CORS headers are skipped safely
    }
  }
  return collected;
}

function canUseWorkerPipeline(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

async function createTransferableBitmap(
  img: HTMLImageElement | null
): Promise<ImageBitmap | null> {
  if (!img || !img.complete || img.naturalWidth <= 0) return null;
  try {
    return await createImageBitmap(img);
  } catch {
    return null;
  }
}

class WorkerStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerStartupError';
  }
}

class WebCodecsUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebCodecsUnsupportedError';
  }
}

function isWebCodecsUnavailable(): boolean {
  return (
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof AudioData === 'undefined'
  );
}

async function exportProjectViaWorker(options: {
  slicedBuffer: AudioBuffer;
  trimStart: number;
  trackDuration: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  mocapClip?: MocapClipData | null;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
}): Promise<{
  buffer: ArrayBuffer;
  totalFrames: number;
  elapsedMs: number;
  mimeType: string;
  fileExtension: 'mp4' | 'webm';
}> {
  const {
    slicedBuffer,
    trimStart,
    trackDuration,
    settings,
    lyrics,
    bgImage,
    albumImage,
    mocapClip,
    signal,
    onProgress,
  } = options;

  if (signal.aborted) {
    throw new DOMException('Export cancelled', 'AbortError');
  }

  const numberOfChannels = Math.min(2, slicedBuffer.numberOfChannels);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    // Copy slice data so underlying buffers can be zero-copy transferred to the worker
    channels.push(new Float32Array(slicedBuffer.getChannelData(ch)));
  }

  const [bgBitmap, albumBitmap] = await Promise.all([
    createTransferableBitmap(bgImage),
    createTransferableBitmap(albumImage),
  ]);

  if (signal.aborted) {
    bgBitmap?.close();
    albumBitmap?.close();
    throw new DOMException('Export cancelled', 'AbortError');
  }

  const fonts = collectWorkerFonts();
  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/mp4ExportWorker.ts', import.meta.url), {
      type: 'module',
    });
  } catch (err) {
    bgBitmap?.close();
    albumBitmap?.close();
    throw new WorkerStartupError(
      err instanceof Error ? err.message : 'Unable to initialize export worker.'
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let receivedProgress = false;

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    const onAbort = () => {
      try {
        worker.postMessage({ type: 'cancel' });
      } catch {
        // ignore postMessage errors on terminate
      }
      if (!settled) {
        settled = true;
        cleanup();
        reject(new DOMException('Export cancelled', 'AbortError'));
      }
    };

    signal.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
      if (settled) return;
      const msg = event.data;
      if (msg.type === 'progress') {
        receivedProgress = true;
        onProgress(msg.state);
      } else if (msg.type === 'done') {
        settled = true;
        cleanup();
        resolve({
          buffer: msg.buffer,
          totalFrames: msg.totalFrames,
          elapsedMs: msg.elapsedMs,
          mimeType: msg.mimeType,
          fileExtension: msg.fileExtension,
        });
      } else if (msg.type === 'cancelled') {
        settled = true;
        cleanup();
        reject(new DOMException('Export cancelled', 'AbortError'));
      } else if (msg.type === 'error') {
        settled = true;
        cleanup();
        if (msg.message.startsWith('WEBCODECS_UNSUPPORTED:')) {
          reject(
            new WebCodecsUnsupportedError(
              msg.message.replace(/^WEBCODECS_UNSUPPORTED:\s*/, '')
            )
          );
        } else if (!receivedProgress && /OffscreenCanvas|Worker|WebCodecs/i.test(msg.message)) {
          reject(new WorkerStartupError(msg.message));
        } else {
          reject(new Error(msg.message));
        }
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      const message = err.message || 'Export worker encountered an unexpected error.';
      if (!receivedProgress) {
        reject(new WorkerStartupError(message));
      } else {
        reject(new Error(message));
      }
    };

    const payload: StartWorkerExportPayload = {
      type: 'start',
      sampleRate: slicedBuffer.sampleRate,
      length: slicedBuffer.length,
      numberOfChannels,
      channels,
      trimStart,
      trackDuration,
      settings,
      lyrics,
      bgBitmap,
      albumBitmap,
      fonts,
      mocapClip: mocapClip ?? null,
    };

    const transferList: Transferable[] = channels.map((c) => c.buffer);
    if (bgBitmap) transferList.push(bgBitmap);
    if (albumBitmap) transferList.push(albumBitmap);

    try {
      worker.postMessage(payload, transferList);
    } catch (err) {
      if (!settled) {
        settled = true;
        cleanup();
        bgBitmap?.close();
        albumBitmap?.close();
        reject(
          new WorkerStartupError(
            err instanceof Error ? err.message : 'Failed to transfer assets to worker.'
          )
        );
      }
    }
  });
}

async function exportProjectOnMainThread(options: {
  slicedBuffer: AudioBuffer;
  trimStart: number;
  trackDuration: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  resolveBgImageAtTime?: DynamicBgResolver;
  mocapClip?: MocapClipData | null;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
  startTimeMs: number;
}): Promise<{
  buffer: ArrayBuffer;
  totalFrames: number;
  elapsedMs: number;
  mimeType: string;
  fileExtension: 'mp4' | 'webm';
}> {
  const {
    slicedBuffer,
    trimStart,
    trackDuration,
    settings,
    lyrics,
    bgImage,
    albumImage,
    resolveBgImageAtTime,
    mocapClip,
    signal,
    onProgress,
    startTimeMs,
  } = options;

  const { width, height } = resolveExportDimensions(
    settings.aspectRatio,
    settings.exportResolution
  );
  const fps = settings.exportFps;
  const clipDuration = slicedBuffer.duration;
  const totalFrames = Math.max(1, Math.ceil(clipDuration * fps));
  const numberOfChannels = Math.min(2, slicedBuffer.numberOfChannels);
  const sampleRate = slicedBuffer.sampleRate;
  const videoBitrateBps = Math.round((settings.videoBitrateMbps || 8) * 1_000_000);
  const audioBitrateBps = (settings.audioBitrateKbps || 192) * 1000;

  const audioSelection = await resolveSupportedAudioConfig(
    numberOfChannels,
    sampleRate,
    audioBitrateBps
  );
  if (!audioSelection) {
    throw new WebCodecsUnsupportedError(
      'Neither AAC nor Opus audio encoding is supported by WebCodecs in this browser.'
    );
  }

  let containerFormat: 'mp4' | 'webm' =
    audioSelection.muxerCodec === 'aac' ? 'mp4' : 'webm';

  let videoSelection: ResolvedVideoConfig | null =
    await resolveSupportedVideoConfigForContainer(
      containerFormat,
      width,
      height,
      fps,
      videoBitrateBps
    );

  if (!videoSelection && containerFormat === 'webm') {
    containerFormat = 'mp4';
    videoSelection = await resolveSupportedVideoConfigForContainer(
      'mp4',
      width,
      height,
      fps,
      videoBitrateBps
    );
  }

  if (!videoSelection) {
    throw new WebCodecsUnsupportedError(
      'No supported video encoder codec found for MP4 or WebM in this browser.'
    );
  }

  const rawChannels: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    rawChannels.push(slicedBuffer.getChannelData(ch));
  }
  const preparedAudio = preparePcmChannelsForEncoder(
    rawChannels,
    slicedBuffer.length,
    sampleRate,
    audioSelection.targetSampleRate,
    audioSelection.targetChannels
  );

  const mp4Target = containerFormat === 'mp4' ? new ArrayBufferTarget() : null;
  const webmTarget = containerFormat === 'webm' ? new WebmArrayBufferTarget() : null;

  const mp4Muxer =
    containerFormat === 'mp4' && mp4Target
      ? new Mp4Muxer({
          target: mp4Target,
          video: {
            codec: videoSelection.muxerCodec,
            width,
            height,
            frameRate: fps,
          },
          audio: {
            codec: audioSelection.muxerCodec,
            numberOfChannels: preparedAudio.numberOfChannels,
            sampleRate: preparedAudio.sampleRate,
          },
          fastStart: 'in-memory',
          firstTimestampBehavior: 'offset',
        })
      : null;

  const webmMuxer =
    containerFormat === 'webm' && webmTarget
      ? new WebmMuxer({
          target: webmTarget,
          video: {
            codec: videoSelection.webmMuxerCodec || 'V_VP9',
            width,
            height,
            frameRate: fps,
          },
          audio: {
            codec: 'A_OPUS',
            numberOfChannels: preparedAudio.numberOfChannels,
            sampleRate: preparedAudio.sampleRate,
          },
          firstTimestampBehavior: 'offset',
        })
      : null;

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (webmMuxer) {
        webmMuxer.addVideoChunk(chunk, meta);
        return;
      }
      if (
        videoSelection?.muxerCodec === 'vp9' &&
        meta?.decoderConfig &&
        !meta.decoderConfig.colorSpace
      ) {
        meta = {
          ...meta,
          decoderConfig: {
            ...meta.decoderConfig,
            colorSpace: {
              fullRange: false,
              matrix: 'bt709',
              primaries: 'bt709',
              transfer: 'bt709',
            },
          },
        };
      }
      mp4Muxer?.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      if (webmMuxer) {
        webmMuxer.addAudioChunk(chunk, meta);
      } else {
        mp4Muxer?.addAudioChunk(chunk, meta);
      }
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure(videoSelection.encoderConfig);
  audioEncoder.configure(audioSelection.encoderConfig);

  try {
    const chunkSamples = 4096;
    const totalSamples = preparedAudio.length;
    const encSampleRate = preparedAudio.sampleRate;
    const encNumChannels = preparedAudio.numberOfChannels;
    const ch0 = preparedAudio.channels[0];
    const ch1 = encNumChannels > 1 ? preparedAudio.channels[1] : null;
    const planarScratch = new Float32Array(chunkSamples * encNumChannels);

    for (let offset = 0; offset < totalSamples; offset += chunkSamples) {
      if (signal.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      if (encoderError) throw encoderError;

      const framesInChunk = Math.min(chunkSamples, totalSamples - offset);
      const planar =
        framesInChunk === chunkSamples
          ? planarScratch
          : planarScratch.subarray(0, framesInChunk * encNumChannels);
      planar.set(ch0.subarray(offset, offset + framesInChunk), 0);
      if (encNumChannels > 1 && ch1) {
        planar.set(ch1.subarray(offset, offset + framesInChunk), framesInChunk);
      }

      const timestampUs = Math.round((offset / encSampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: encSampleRate,
        numberOfFrames: framesInChunk,
        numberOfChannels: encNumChannels,
        timestamp: timestampUs,
        data: planar,
      });

      audioEncoder.encode(audioData);
      audioData.close();
    }

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to create 2D context for offline rendering.');
    }

    const analyzer = new OfflineAudioAnalyzer(slicedBuffer, 2048);
    const needsBeatDetector =
      settings.beatDetection ||
      Boolean(settings.beatFlash) ||
      Boolean(settings.danceEnabled) ||
      (settings.glitchIntensity ?? 0) > 0 ||
      (settings.bassShake ?? 0) > 0 ||
      (settings.beatShake ?? 0) > 0 ||
      (Boolean(settings.lyricBeatSync) && (settings.lyricPulseIntensity ?? 1) > 0);
    const beatTracker = needsBeatDetector
      ? new OfflineLowPassBeatTracker(slicedBuffer, 140, 1.2)
      : null;
    const exportTrackBpm = beatTracker
      ? estimateBpmFromTracker(
          beatTracker,
          Math.min(25, slicedBuffer.duration),
          settings.beatSensitivity
        )
      : null;
    const beatState = createInitialBeatState();
    const minDim = Math.min(width, height);
    const frequencyData = new Uint8Array(1024);
    const timeDomainData = new Uint8Array(1024);
    const particles: Particle[] = [];
    const motionBlurState: MotionBlurState = { canvas: null, hasFrame: false };
    const albumRotationRef = { angle: 0 };
    const dt = 1 / fps;
    const frameDurationUs = Math.round(1_000_000 / fps);

    let lastUiYieldMs = performance.now();
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      if (encoderError) throw encoderError;

      const localTime = frameIdx / fps;
      const absoluteTrackTime = trimStart + localTime;

      analyzer.analyzeAt(localTime, settings.smoothing, frequencyData, timeDomainData);

      const cycled = resolveAutoCycledColors(settings, absoluteTrackTime, trackDuration);

      let beatBurst = 0;
      let beatTriggered = false;
      if (beatTracker && needsBeatDetector) {
        const lowPassRms = beatTracker.getLowPassRmsAt(localTime, 1024);
        const step = stepBeatDetector(
          beatState,
          lowPassRms,
          dt,
          settings.beatSensitivity,
          minDim,
          cycled.primaryColor,
          cycled.secondaryColor
        );
        beatBurst = step.burstIntensity;
        beatTriggered = step.triggered;
      }

      const dynamicBg = resolveBgImageAtTime
        ? await resolveBgImageAtTime(absoluteTrackTime, width, height)
        : null;

      renderVisualizerFrame({
        ctx,
        width,
        height,
        currentTime: absoluteTrackTime,
        dt,
        frequencyData,
        timeDomainData,
        settings,
        lyrics,
        bgImage: dynamicBg ?? bgImage,
        albumImage,
        particles,
        isExport: true,
        albumRotationRef,
        beatBurst,
        beatTriggered,
        bpm: beatState.estimatedBpm ?? exportTrackBpm ?? 120,
        beatShockwaves: beatState.shockwaves,
        motionBlurState,
        trackDuration,
        mocapClip,
      });

      const timestampUs = Math.round(localTime * 1_000_000);
      const videoFrame = new VideoFrame(offscreenCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });

      const isKeyFrame = frameIdx % (fps * 2) === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      const nowMs = performance.now();
      const needsBackpressure = videoEncoder.encodeQueueSize >= 32;
      if (needsBackpressure || nowMs - lastUiYieldMs >= 75 || frameIdx === totalFrames - 1) {
        const pct = Math.min(97, Math.round(((frameIdx + 1) / totalFrames) * 96));
        onProgress({
          status: 'rendering',
          currentFrame: frameIdx + 1,
          totalFrames,
          percentage: pct,
          message: `Rendering frame ${frameIdx + 1} of ${totalFrames} — ${pct}%`,
        });

        if (needsBackpressure) {
          while (videoEncoder.encodeQueueSize >= 20 && !signal.aborted && !encoderError) {
            await waitForEncoderDequeue(
              videoEncoder,
              18,
              signal,
              () => Boolean(encoderError)
            );
          }
        }
        await yieldToEventLoop();
        lastUiYieldMs = performance.now();
      }
    }

    if (signal.aborted) {
      throw new DOMException('Export cancelled', 'AbortError');
    }

    const containerLabel = containerFormat.toUpperCase();
    onProgress({
      status: 'muxing',
      currentFrame: totalFrames,
      totalFrames,
      percentage: 98,
      message: `Finalizing ${videoSelection.codecLabel} + ${audioSelection.codecLabel} ${containerLabel} container...`,
    });

    await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
    if (encoderError) throw encoderError;

    let buffer: ArrayBuffer;
    if (webmMuxer && webmTarget) {
      webmMuxer.finalize();
      buffer = webmTarget.buffer;
    } else if (mp4Muxer && mp4Target) {
      mp4Muxer.finalize();
      buffer = mp4Target.buffer;
    } else {
      throw new Error('Muxer target failed to initialize.');
    }

    return {
      buffer,
      totalFrames,
      elapsedMs: Math.round(performance.now() - startTimeMs),
      mimeType: containerFormat === 'webm' ? 'video/webm' : 'video/mp4',
      fileExtension: containerFormat,
    };
  } finally {
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore close errors
    }
    try {
      if (audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // ignore close errors
    }
  }
}

async function exportProjectViaMediaRecorder(options: {
  slicedBuffer: AudioBuffer;
  trimStart: number;
  trackDuration: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  resolveBgImageAtTime?: DynamicBgResolver;
  mocapClip?: MocapClipData | null;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
  startTimeMs: number;
}): Promise<{
  buffer: ArrayBuffer;
  totalFrames: number;
  elapsedMs: number;
  mimeType: string;
  fileExtension: string;
}> {
  const {
    slicedBuffer,
    trimStart,
    trackDuration,
    settings,
    lyrics,
    bgImage,
    albumImage,
    resolveBgImageAtTime,
    mocapClip,
    signal,
    onProgress,
    startTimeMs,
  } = options;

  if (typeof MediaRecorder === 'undefined') {
    throw new Error(
      'Neither WebCodecs audio/video encoding nor MediaRecorder fallback is supported in this browser.'
    );
  }

  const { width, height } = resolveExportDimensions(
    settings.aspectRatio,
    settings.exportResolution
  );
  const fps = settings.exportFps;
  const clipDuration = slicedBuffer.duration;
  const totalFrames = Math.max(1, Math.ceil(clipDuration * fps));
  const videoBitrateBps = Math.round((settings.videoBitrateMbps || 8) * 1_000_000);
  const audioBitrateBps = (settings.audioBitrateKbps || 192) * 1000;

  const chosenMime = selectBestMediaRecorderMime();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Failed to create 2D context for MediaRecorder fallback.');
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is unavailable for MediaRecorder fallback.');
  }

  const audioCtx = new AudioCtx({ sampleRate: slicedBuffer.sampleRate });
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const destination = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = slicedBuffer;
  source.connect(destination);

  const canvasStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);

  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: videoBitrateBps,
    audioBitsPerSecond: audioBitrateBps,
    ...(chosenMime.mimeType ? { mimeType: chosenMime.mimeType } : {}),
  };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(combinedStream, recorderOptions);
  } catch {
    recorder = new MediaRecorder(combinedStream);
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const analyzer = new OfflineAudioAnalyzer(slicedBuffer, 2048);
  const needsBeatDetector =
    settings.beatDetection ||
    Boolean(settings.beatFlash) ||
    Boolean(settings.danceEnabled) ||
    (settings.glitchIntensity ?? 0) > 0 ||
    (settings.bassShake ?? 0) > 0 ||
    (settings.beatShake ?? 0) > 0 ||
    (Boolean(settings.lyricBeatSync) && (settings.lyricPulseIntensity ?? 1) > 0);
  const beatTracker = needsBeatDetector
    ? new OfflineLowPassBeatTracker(slicedBuffer, 140, 1.2)
    : null;
  const exportTrackBpm = beatTracker
    ? estimateBpmFromTracker(
        beatTracker,
        Math.min(25, slicedBuffer.duration),
        settings.beatSensitivity
      )
    : null;
  const beatState = createInitialBeatState();
  const minDim = Math.min(width, height);
  const frequencyData = new Uint8Array(1024);
  const timeDomainData = new Uint8Array(1024);
  const particles: Particle[] = [];
  const motionBlurState: MotionBlurState = { canvas: null, hasFrame: false };
  const albumRotationRef = { angle: 0 };
  const dt = 1 / fps;

  onProgress({
    status: 'rendering',
    currentFrame: 0,
    totalFrames,
    percentage: 1,
    message: 'Using real-time MediaRecorder compatibility encoder...',
  });

  const recordingPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    let rafId = 0;
    let stopTimeoutId = 0;
    let settled = false;

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (stopTimeoutId) window.clearTimeout(stopTimeoutId);
      signal.removeEventListener('abort', onAbort);
      try {
        source.stop();
      } catch {
        // ignore if already stopped
      }
      combinedStream.getTracks().forEach((t) => t.stop());
      canvasStream.getTracks().forEach((t) => t.stop());
      void audioCtx.close().catch(() => {});
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // ignore stop errors
      }
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('MediaRecorder fallback encoding failed.'));
    };

    recorder.onstop = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const blob = new Blob(chunks, {
          type: recorder.mimeType || chosenMime.mimeType || 'video/webm',
        });
        const buf = await blob.arrayBuffer();
        resolve(buf);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const renderStartPerfMs = performance.now();
    let lastProgressPerfMs = renderStartPerfMs;

    recorder.start(250);
    source.start();

    let latestResolvedBg: RenderImageSource | null = null;
    let bgResolveInFlight = false;

    const tick = () => {
      if (settled || signal.aborted) return;
      const elapsedSec = Math.min(clipDuration, (performance.now() - renderStartPerfMs) / 1000);
      const absoluteTrackTime = trimStart + elapsedSec;
      const currentFrame = Math.min(totalFrames, Math.max(1, Math.round(elapsedSec * fps)));

      if (resolveBgImageAtTime && !bgResolveInFlight) {
        bgResolveInFlight = true;
        Promise.resolve(resolveBgImageAtTime(absoluteTrackTime, width, height))
          .then((resolved) => {
            latestResolvedBg = resolved;
          })
          .catch(() => {})
          .finally(() => {
            bgResolveInFlight = false;
          });
      }

      analyzer.analyzeAt(elapsedSec, settings.smoothing, frequencyData, timeDomainData);

      const cycled = resolveAutoCycledColors(settings, absoluteTrackTime, trackDuration);

      let beatBurst = 0;
      let beatTriggered = false;
      if (beatTracker && needsBeatDetector) {
        const lowPassRms = beatTracker.getLowPassRmsAt(elapsedSec, 1024);
        const step = stepBeatDetector(
          beatState,
          lowPassRms,
          dt,
          settings.beatSensitivity,
          minDim,
          cycled.primaryColor,
          cycled.secondaryColor
        );
        beatBurst = step.burstIntensity;
        beatTriggered = step.triggered;
      }

      renderVisualizerFrame({
        ctx,
        width,
        height,
        currentTime: absoluteTrackTime,
        dt,
        frequencyData,
        timeDomainData,
        settings,
        lyrics,
        bgImage: latestResolvedBg ?? bgImage,
        albumImage,
        particles,
        isExport: true,
        albumRotationRef,
        beatBurst,
        beatTriggered,
        bpm: beatState.estimatedBpm ?? exportTrackBpm ?? 120,
        beatShockwaves: beatState.shockwaves,
        motionBlurState,
        trackDuration,
        mocapClip,
      });

      const nowMs = performance.now();
      if (nowMs - lastProgressPerfMs >= 100 || elapsedSec >= clipDuration) {
        const pct = Math.min(97, Math.round((elapsedSec / Math.max(0.001, clipDuration)) * 96));
        onProgress({
          status: 'rendering',
          currentFrame,
          totalFrames,
          percentage: pct,
          message: `Compatibility recording frame ${currentFrame} of ${totalFrames} — ${pct}%`,
        });
        lastProgressPerfMs = nowMs;
      }

      if (elapsedSec < clipDuration) {
        rafId = requestAnimationFrame(tick);
      } else {
        onProgress({
          status: 'muxing',
          currentFrame: totalFrames,
          totalFrames,
          percentage: 98,
          message: 'Finalizing compatibility video container...',
        });
        stopTimeoutId = window.setTimeout(() => {
          if (!settled && recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 120);
      }
    };

    rafId = requestAnimationFrame(tick);
  });

  const buffer = await recordingPromise;
  const actualMime = chosenMime.mimeType || 'video/webm';
  const actualExt = actualMime.includes('mp4') ? 'mp4' : chosenMime.extension;

  return {
    buffer,
    totalFrames,
    elapsedMs: Math.round(performance.now() - startTimeMs),
    mimeType: actualMime,
    fileExtension: actualExt,
  };
}

export async function exportProjectToMp4(options: ExportMp4Options): Promise<ExportMp4Result> {
  const {
    audioBuffer,
    trimStart,
    trimEnd,
    settings,
    lyrics,
    bgImage,
    albumImage,
    resolveBgImageAtTime,
    mocapClip,
    signal,
    onProgress,
    autoDownload = true,
    customFileName,
  } = options;

  const startTimeMs = performance.now();

  onProgress({
    status: 'preparing',
    currentFrame: 0,
    totalFrames: 1,
    percentage: 0,
    message: `Slicing audio clip with 0.15s ${settings.fadeType} boundary fades...`,
  });

  // 1. Slice decoded AudioBuffer cleanly with 0.15s fade-in/fade-out
  const slicedBuffer = sliceAudioBufferWithFade(
    audioBuffer,
    trimStart,
    trimEnd,
    0.15,
    settings.fadeType
  );

  let exportResult: {
    buffer: ArrayBuffer;
    totalFrames: number;
    elapsedMs: number;
    mimeType?: string;
    fileExtension?: string;
  };

  const fullTrackDuration = audioBuffer.duration;
  const shouldUseWorker = !resolveBgImageAtTime && canUseWorkerPipeline();

  if (isWebCodecsUnavailable()) {
    exportResult = await exportProjectViaMediaRecorder({
      slicedBuffer,
      trimStart,
      trackDuration: fullTrackDuration,
      settings,
      lyrics,
      bgImage,
      albumImage,
      resolveBgImageAtTime,
      mocapClip,
      signal,
      onProgress,
      startTimeMs,
    });
  } else if (shouldUseWorker) {
    try {
      onProgress({
        status: 'preparing',
        currentFrame: 0,
        totalFrames: 1,
        percentage: 0,
        message: 'Starting background render worker...',
      });
      exportResult = await exportProjectViaWorker({
        slicedBuffer,
        trimStart,
        trackDuration: fullTrackDuration,
        settings,
        lyrics,
        bgImage,
        albumImage,
        mocapClip,
        signal,
        onProgress,
      });
    } catch (err) {
      if (err instanceof WebCodecsUnsupportedError) {
        exportResult = await exportProjectViaMediaRecorder({
          slicedBuffer,
          trimStart,
          trackDuration: fullTrackDuration,
          settings,
          lyrics,
          bgImage,
          albumImage,
          resolveBgImageAtTime,
          mocapClip,
          signal,
          onProgress,
          startTimeMs,
        });
      } else if (err instanceof WorkerStartupError) {
        try {
          exportResult = await exportProjectOnMainThread({
            slicedBuffer,
            trimStart,
            trackDuration: fullTrackDuration,
            settings,
            lyrics,
            bgImage,
            albumImage,
            resolveBgImageAtTime,
            mocapClip,
            signal,
            onProgress,
            startTimeMs,
          });
        } catch (mainErr) {
          if (mainErr instanceof WebCodecsUnsupportedError) {
            exportResult = await exportProjectViaMediaRecorder({
              slicedBuffer,
              trimStart,
              trackDuration: fullTrackDuration,
              settings,
              lyrics,
              bgImage,
              albumImage,
              resolveBgImageAtTime,
              mocapClip,
              signal,
              onProgress,
              startTimeMs,
            });
          } else {
            throw mainErr;
          }
        }
      } else {
        throw err;
      }
    }
  } else {
    try {
      exportResult = await exportProjectOnMainThread({
        slicedBuffer,
        trimStart,
        trackDuration: fullTrackDuration,
        settings,
        lyrics,
        bgImage,
        albumImage,
        resolveBgImageAtTime,
        mocapClip,
        signal,
        onProgress,
        startTimeMs,
      });
    } catch (mainErr) {
      if (mainErr instanceof WebCodecsUnsupportedError) {
        exportResult = await exportProjectViaMediaRecorder({
          slicedBuffer,
          trimStart,
          trackDuration: fullTrackDuration,
          settings,
          lyrics,
          bgImage,
          albumImage,
          resolveBgImageAtTime,
          mocapClip,
          signal,
          onProgress,
          startTimeMs,
        });
      } else {
        throw mainErr;
      }
    }
  }

  const outputMime = exportResult.mimeType || 'video/mp4';
  const outputExt = exportResult.fileExtension || 'mp4';
  const mp4Blob = new Blob([exportResult.buffer], { type: outputMime });
  const downloadUrl = URL.createObjectURL(mp4Blob);
  const trackSlug = sanitizeFileName(settings.trackTitle || 'pulsewave-video');
  const ratioSlug = settings.aspectRatio.replace(':', 'x');
  const downloadFileName = customFileName
    ? `${sanitizeFileName(customFileName)}.${outputExt}`
    : `${trackSlug}-${ratioSlug}.${outputExt}`;

  // Trigger automatic download unless batch caller suppresses it
  if (autoDownload) {
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = downloadFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  const elapsedMs = Math.round(performance.now() - startTimeMs);
  const fileSizeBytes = mp4Blob.size;
  onProgress({
    status: 'completed',
    currentFrame: exportResult.totalFrames,
    totalFrames: exportResult.totalFrames,
    percentage: 100,
    message: `Rendered ${exportResult.totalFrames} frames in ${(elapsedMs / 1000).toFixed(1)}s`,
    downloadUrl,
    downloadFileName,
    fileSizeBytes,
    elapsedMs,
  });

  return {
    downloadUrl,
    downloadFileName,
    fileSizeBytes,
    elapsedMs,
    totalFrames: exportResult.totalFrames,
  };
}

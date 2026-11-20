import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  ExportProgressState,
  LyricLine,
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
  createInitialBeatState,
  OfflineAudioAnalyzer,
  OfflineLowPassBeatTracker,
  sliceAudioBufferWithFade,
  stepBeatDetector,
} from './audioEngine';
import { renderVisualizerFrame } from './canvasRenderer';
import { resolveSupportedVideoConfig } from './videoConfig';

export interface ExportMp4Options {
  audioBuffer: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
  autoDownload?: boolean;
  customFileName?: string;
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

function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
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

async function exportProjectViaWorker(options: {
  slicedBuffer: AudioBuffer;
  trimStart: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
}): Promise<{ buffer: ArrayBuffer; totalFrames: number; elapsedMs: number }> {
  const {
    slicedBuffer,
    trimStart,
    settings,
    lyrics,
    bgImage,
    albumImage,
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
        });
      } else if (msg.type === 'cancelled') {
        settled = true;
        cleanup();
        reject(new DOMException('Export cancelled', 'AbortError'));
      } else if (msg.type === 'error') {
        settled = true;
        cleanup();
        if (!receivedProgress && /OffscreenCanvas|Worker|WebCodecs/i.test(msg.message)) {
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
      settings,
      lyrics,
      bgBitmap,
      albumBitmap,
      fonts,
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
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  signal: AbortSignal;
  onProgress: (state: ExportProgressState) => void;
  startTimeMs: number;
}): Promise<{ buffer: ArrayBuffer; totalFrames: number; elapsedMs: number }> {
  const {
    slicedBuffer,
    trimStart,
    settings,
    lyrics,
    bgImage,
    albumImage,
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

  const videoConfig = await resolveSupportedVideoConfig(width, height, fps, videoBitrateBps);
  const audioConfig: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    numberOfChannels,
    sampleRate,
    bitrate: audioBitrateBps,
  };

  const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
  if (!audioSupport.supported) {
    throw new Error('AAC audio encoding (mp4a.40.2) is not supported in this browser.');
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
      frameRate: fps,
    },
    audio: {
      codec: 'aac',
      numberOfChannels,
      sampleRate,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure(videoConfig);
  audioEncoder.configure(audioConfig);

  try {
    const chunkSamples = 4096;
    const totalSamples = slicedBuffer.length;
    const ch0 = slicedBuffer.getChannelData(0);
    const ch1 = numberOfChannels > 1 ? slicedBuffer.getChannelData(1) : null;

    for (let offset = 0; offset < totalSamples; offset += chunkSamples) {
      if (signal.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      if (encoderError) throw encoderError;

      const framesInChunk = Math.min(chunkSamples, totalSamples - offset);
      const planar = new Float32Array(framesInChunk * numberOfChannels);
      planar.set(ch0.subarray(offset, offset + framesInChunk), 0);
      if (numberOfChannels > 1 && ch1) {
        planar.set(ch1.subarray(offset, offset + framesInChunk), framesInChunk);
      }

      const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: framesInChunk,
        numberOfChannels,
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
    const beatTracker = settings.beatDetection
      ? new OfflineLowPassBeatTracker(slicedBuffer, 140, 1.2)
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

      let beatBurst = 0;
      let beatTriggered = false;
      if (beatTracker && settings.beatDetection) {
        const lowPassRms = beatTracker.getLowPassRmsAt(localTime, 1024);
        const step = stepBeatDetector(
          beatState,
          lowPassRms,
          dt,
          settings.beatSensitivity,
          minDim,
          settings.primaryColor,
          settings.secondaryColor
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
        bgImage,
        albumImage,
        particles,
        isExport: true,
        albumRotationRef,
        beatBurst,
        beatTriggered,
        beatShockwaves: beatState.shockwaves,
        motionBlurState,
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
      const needsBackpressure = videoEncoder.encodeQueueSize >= 24;
      if (needsBackpressure || nowMs - lastUiYieldMs >= 75 || frameIdx === totalFrames - 1) {
        const pct = Math.min(97, Math.round(((frameIdx + 1) / totalFrames) * 96));
        onProgress({
          status: 'rendering',
          currentFrame: frameIdx + 1,
          totalFrames,
          percentage: pct,
          message: `Rendering frame ${frameIdx + 1} of ${totalFrames} — ${pct}%`,
        });

        while (videoEncoder.encodeQueueSize >= 24 && !signal.aborted && !encoderError) {
          await new Promise((r) => setTimeout(r, 4));
        }
        await yieldToEventLoop();
        lastUiYieldMs = performance.now();
      }
    }

    if (signal.aborted) {
      throw new DOMException('Export cancelled', 'AbortError');
    }

    onProgress({
      status: 'muxing',
      currentFrame: totalFrames,
      totalFrames,
      percentage: 98,
      message: 'Finalizing H.264 + AAC MP4 container...',
    });

    await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
    if (encoderError) throw encoderError;

    muxer.finalize();

    return {
      buffer: target.buffer,
      totalFrames,
      elapsedMs: Math.round(performance.now() - startTimeMs),
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

export async function exportProjectToMp4(options: ExportMp4Options): Promise<ExportMp4Result> {
  const {
    audioBuffer,
    trimStart,
    trimEnd,
    settings,
    lyrics,
    bgImage,
    albumImage,
    signal,
    onProgress,
    autoDownload = true,
    customFileName,
  } = options;

  if (
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof AudioData === 'undefined'
  ) {
    throw new Error(
      'Your browser does not support WebCodecs (VideoEncoder / AudioEncoder). Please use Chrome, Edge, or Safari 16.4+.'
    );
  }

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

  let exportResult: { buffer: ArrayBuffer; totalFrames: number; elapsedMs: number };

  if (canUseWorkerPipeline()) {
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
        settings,
        lyrics,
        bgImage,
        albumImage,
        signal,
        onProgress,
      });
    } catch (err) {
      if (err instanceof WorkerStartupError) {
        exportResult = await exportProjectOnMainThread({
          slicedBuffer,
          trimStart,
          settings,
          lyrics,
          bgImage,
          albumImage,
          signal,
          onProgress,
          startTimeMs,
        });
      } else {
        throw err;
      }
    }
  } else {
    exportResult = await exportProjectOnMainThread({
      slicedBuffer,
      trimStart,
      settings,
      lyrics,
      bgImage,
      albumImage,
      signal,
      onProgress,
      startTimeMs,
    });
  }

  const mp4Blob = new Blob([exportResult.buffer], { type: 'video/mp4' });
  const downloadUrl = URL.createObjectURL(mp4Blob);
  const trackSlug = sanitizeFileName(settings.trackTitle || 'pulsewave-video');
  const ratioSlug = settings.aspectRatio.replace(':', 'x');
  const downloadFileName = customFileName
    ? `${sanitizeFileName(customFileName)}.mp4`
    : `${trackSlug}-${ratioSlug}.mp4`;

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

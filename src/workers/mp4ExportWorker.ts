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
import {
  preparePcmChannelsForEncoder,
  resolveSupportedAudioConfig,
} from '../utils/audioCodecConfig';
import {
  createInitialBeatState,
  OfflineAudioAnalyzer,
  OfflineLowPassBeatTracker,
  PcmAudioInput,
  stepBeatDetector,
} from '../utils/audioEngine';
import { renderVisualizerFrame } from '../utils/canvasRenderer';
import { resolveAutoCycledColors } from '../utils/colorHarmony';
import {
  ResolvedVideoConfig,
  resolveSupportedVideoConfigForContainer,
} from '../utils/videoConfig';

export interface WorkerFontDescriptor {
  family: string;
  source: string;
  weight?: string;
  style?: string;
}

export interface StartWorkerExportPayload {
  type: 'start';
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  channels: Float32Array[];
  trimStart: number;
  trackDuration?: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgBitmap: ImageBitmap | null;
  albumBitmap: ImageBitmap | null;
  fonts: WorkerFontDescriptor[];
  mocapClip?: MocapClipData | null;
}

export type WorkerIncomingMessage = StartWorkerExportPayload | { type: 'cancel' };

export type WorkerOutgoingMessage =
  | { type: 'progress'; state: ExportProgressState }
  | {
      type: 'done';
      buffer: ArrayBuffer;
      totalFrames: number;
      elapsedMs: number;
      mimeType: string;
      fileExtension: 'mp4' | 'webm';
    }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

interface WorkerScopeLike {
  postMessage: (message: WorkerOutgoingMessage, transfer?: Transferable[]) => void;
  fonts?: FontFaceSet;
  onmessage: ((ev: MessageEvent<WorkerIncomingMessage>) => void) | null;
}

const workerScope = self as unknown as WorkerScopeLike;

let isCancelled = false;

function yieldWorkerTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function ensureWorkerFonts(fonts: WorkerFontDescriptor[]): Promise<void> {
  if (!workerScope.fonts || fonts.length === 0 || typeof FontFace === 'undefined') return;
  try {
    const loadTasks = fonts.map(async (f) => {
      try {
        const face = new FontFace(f.family, f.source, {
          weight: f.weight || '400',
          style: f.style || 'normal',
        });
        const loaded = await face.load();
        workerScope.fonts?.add(loaded);
      } catch {
        // Ignore individual font load failures cleanly
      }
    });
    await Promise.race([
      Promise.all(loadTasks),
      new Promise<void>((resolve) => setTimeout(resolve, 750)),
    ]);
  } catch {
    // Non-fatal fallback to system fonts
  }
}

async function runWorkerExport(payload: StartWorkerExportPayload): Promise<void> {
  const startTimeMs = performance.now();
  const {
    sampleRate,
    length,
    numberOfChannels,
    channels,
    trimStart,
    trackDuration,
    settings,
    lyrics,
    bgBitmap,
    albumBitmap,
    fonts,
    mocapClip,
  } = payload;

  if (
    typeof OffscreenCanvas === 'undefined' ||
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof AudioData === 'undefined'
  ) {
    throw new Error('Worker OffscreenCanvas or WebCodecs APIs are unavailable.');
  }

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;

  try {
    await ensureWorkerFonts(fonts);
    if (isCancelled) {
      workerScope.postMessage({ type: 'cancelled' });
      return;
    }

    const { width, height } = resolveExportDimensions(
      settings.aspectRatio,
      settings.exportResolution
    );
    const fps = settings.exportFps;
    const clipDuration = length / sampleRate;
    const totalFrames = Math.max(1, Math.ceil(clipDuration * fps));
    const videoBitrateBps = Math.round((settings.videoBitrateMbps || 8) * 1_000_000);
    const audioBitrateBps = (settings.audioBitrateKbps || 192) * 1000;

    const audioSelection = await resolveSupportedAudioConfig(
      numberOfChannels,
      sampleRate,
      audioBitrateBps
    );
    if (!audioSelection) {
      throw new Error(
        'WEBCODECS_UNSUPPORTED: Neither AAC nor Opus audio encoding is supported by WebCodecs in this browser.'
      );
    }

    // Prioritize MP4 (H.264 + AAC). If AAC is unsupported and Opus is chosen,
    // prefer standard WebM (VP9/VP8/AV1 + Opus) for universal browser playback.
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
      throw new Error(
        'WEBCODECS_UNSUPPORTED: No supported video encoder codec found for MP4 or WebM in this browser.'
      );
    }

    const preparedAudio = preparePcmChannelsForEncoder(
      channels,
      length,
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

    videoEncoder = new VideoEncoder({
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

    audioEncoder = new AudioEncoder({
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

    // 1. Encode audio (AAC or Opus fallback) in 4096-sample planar f32 chunks
    const chunkSamples = 4096;
    const encChannels = preparedAudio.channels;
    const encLength = preparedAudio.length;
    const encSampleRate = preparedAudio.sampleRate;
    const encNumChannels = preparedAudio.numberOfChannels;
    const ch0 = encChannels[0];
    const ch1 = encNumChannels > 1 ? encChannels[1] ?? null : null;

    for (let offset = 0; offset < encLength; offset += chunkSamples) {
      if (isCancelled) {
        workerScope.postMessage({ type: 'cancelled' });
        return;
      }
      if (encoderError) throw encoderError;

      const framesInChunk = Math.min(chunkSamples, encLength - offset);
      const planar = new Float32Array(framesInChunk * encNumChannels);
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

    // 2. Setup worker OffscreenCanvas & deterministic offline audio analyzers
    const offscreenCanvas = new OffscreenCanvas(width, height);
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to create worker OffscreenCanvas 2D context.');
    }

    const pcmInput: PcmAudioInput = {
      sampleRate,
      length,
      numberOfChannels,
      channels,
    };

    const analyzer = new OfflineAudioAnalyzer(pcmInput, 2048);
    const needsBeatDetector =
      settings.beatDetection ||
      Boolean(settings.beatFlash) ||
      Boolean(settings.danceEnabled) ||
      (settings.glitchIntensity ?? 0) > 0 ||
      (settings.bassShake ?? 0) > 0 ||
      (Boolean(settings.lyricBeatSync) && (settings.lyricPulseIntensity ?? 1) > 0);
    const beatTracker = needsBeatDetector
      ? new OfflineLowPassBeatTracker(pcmInput, 140, 1.2)
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

    // 3. Worker frame rendering + encoding loop (runs off the main UI thread)
    let lastProgressMs = performance.now();
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (isCancelled) {
        workerScope.postMessage({ type: 'cancelled' });
        return;
      }
      if (encoderError) throw encoderError;

      const localTime = frameIdx / fps;
      const absoluteTrackTime = trimStart + localTime;

      analyzer.analyzeAt(localTime, settings.smoothing, frequencyData, timeDomainData);

      const trackDurationForCycle =
        trackDuration && trackDuration > 0 ? trackDuration : trimStart + length / sampleRate;
      const cycled = resolveAutoCycledColors(
        settings,
        absoluteTrackTime,
        trackDurationForCycle
      );

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
        bgImage: bgBitmap,
        albumImage: albumBitmap,
        particles,
        isExport: true,
        albumRotationRef,
        beatBurst,
        beatTriggered,
        beatShockwaves: beatState.shockwaves,
        motionBlurState,
        trackDuration: trackDurationForCycle,
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

      // Backpressure & throttled main-thread progress updates
      const nowMs = performance.now();
      const needsBackpressure = videoEncoder.encodeQueueSize >= 24;
      if (needsBackpressure || nowMs - lastProgressMs >= 75 || frameIdx === totalFrames - 1) {
        const pct = Math.min(97, Math.round(((frameIdx + 1) / totalFrames) * 96));
        workerScope.postMessage({
          type: 'progress',
          state: {
            status: 'rendering',
            currentFrame: frameIdx + 1,
            totalFrames,
            percentage: pct,
            message: `Worker rendering frame ${frameIdx + 1} of ${totalFrames} — ${pct}%`,
          },
        });

        while (videoEncoder.encodeQueueSize >= 24 && !isCancelled && !encoderError) {
          await new Promise((r) => setTimeout(r, 4));
        }
        // Allow cancel messages to be processed inside worker event queue
        if (frameIdx % 16 === 0 || needsBackpressure) {
          await yieldWorkerTick();
        }
        lastProgressMs = performance.now();
      }
    }

    if (isCancelled) {
      workerScope.postMessage({ type: 'cancelled' });
      return;
    }

    const containerLabel = containerFormat.toUpperCase();
    workerScope.postMessage({
      type: 'progress',
      state: {
        status: 'muxing',
        currentFrame: totalFrames,
        totalFrames,
        percentage: 98,
        message: `Finalizing ${videoSelection.codecLabel} + ${audioSelection.codecLabel} ${containerLabel} container...`,
      },
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

    const elapsedMs = Math.round(performance.now() - startTimeMs);
    const mimeType = containerFormat === 'webm' ? 'video/webm' : 'video/mp4';

    workerScope.postMessage(
      {
        type: 'done',
        buffer,
        totalFrames,
        elapsedMs,
        mimeType,
        fileExtension: containerFormat,
      },
      [buffer]
    );
  } finally {
    try {
      bgBitmap?.close();
    } catch {
      // ignore bitmap close errors
    }
    try {
      albumBitmap?.close();
    } catch {
      // ignore bitmap close errors
    }
    try {
      if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore encoder close errors
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // ignore encoder close errors
    }
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerIncomingMessage>) => {
  const data = event.data;
  if (data.type === 'cancel') {
    isCancelled = true;
    return;
  }
  if (data.type === 'start') {
    isCancelled = false;
    runWorkerExport(data).catch((err) => {
      if (isCancelled) {
        workerScope.postMessage({ type: 'cancelled' });
        return;
      }
      workerScope.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
};

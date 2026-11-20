import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  ASPECT_RATIOS,
  ExportProgressState,
  LyricLine,
  MotionBlurState,
  Particle,
  StudioSettings,
} from '../types/studio';
import {
  createInitialBeatState,
  OfflineAudioAnalyzer,
  OfflineLowPassBeatTracker,
  PcmAudioInput,
  stepBeatDetector,
} from '../utils/audioEngine';
import { renderVisualizerFrame } from '../utils/canvasRenderer';
import { resolveSupportedVideoConfig } from '../utils/videoConfig';

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
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgBitmap: ImageBitmap | null;
  albumBitmap: ImageBitmap | null;
  fonts: WorkerFontDescriptor[];
}

export type WorkerIncomingMessage = StartWorkerExportPayload | { type: 'cancel' };

export type WorkerOutgoingMessage =
  | { type: 'progress'; state: ExportProgressState }
  | { type: 'done'; buffer: ArrayBuffer; totalFrames: number; elapsedMs: number }
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
    settings,
    lyrics,
    bgBitmap,
    albumBitmap,
    fonts,
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

    const { width, height } = ASPECT_RATIOS[settings.aspectRatio];
    const fps = settings.exportFps;
    const clipDuration = length / sampleRate;
    const totalFrames = Math.max(1, Math.ceil(clipDuration * fps));

    const videoConfig = await resolveSupportedVideoConfig(width, height, fps);
    const audioConfig: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      numberOfChannels,
      sampleRate,
      bitrate: 192_000,
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

    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (err) => {
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });

    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (err) => {
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });

    videoEncoder.configure(videoConfig);
    audioEncoder.configure(audioConfig);

    // 1. Encode AAC audio in 4096-sample planar f32 chunks
    const chunkSamples = 4096;
    const ch0 = channels[0];
    const ch1 = numberOfChannels > 1 ? channels[1] ?? null : null;

    for (let offset = 0; offset < length; offset += chunkSamples) {
      if (isCancelled) {
        workerScope.postMessage({ type: 'cancelled' });
        return;
      }
      if (encoderError) throw encoderError;

      const framesInChunk = Math.min(chunkSamples, length - offset);
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
    const beatTracker = settings.beatDetection
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
        bgImage: bgBitmap,
        albumImage: albumBitmap,
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

    workerScope.postMessage({
      type: 'progress',
      state: {
        status: 'muxing',
        currentFrame: totalFrames,
        totalFrames,
        percentage: 98,
        message: 'Finalizing H.264 + AAC MP4 container...',
      },
    });

    await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
    if (encoderError) throw encoderError;

    muxer.finalize();
    const buffer = target.buffer;
    const elapsedMs = Math.round(performance.now() - startTimeMs);

    workerScope.postMessage(
      {
        type: 'done',
        buffer,
        totalFrames,
        elapsedMs,
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

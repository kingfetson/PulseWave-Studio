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
  sliceAudioBufferWithFade,
  stepBeatDetector,
} from './audioEngine';
import { renderVisualizerFrame } from './canvasRenderer';

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

async function resolveSupportedVideoConfig(
  width: number,
  height: number,
  fps: number
): Promise<VideoEncoderConfig> {
  // Prefer avc1.420028 (H.264 Baseline Profile Level 4.0) as requested,
  // with clean fallbacks for hardware/OS encoder variance.
  const candidates = ['avc1.420028', 'avc1.4d002a', 'avc1.640028', 'avc1.42E01F'];
  const bitrate = width * height > 1000000 ? 6_500_000 : 4_800_000;

  for (const codec of candidates) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        return config;
      }
    } catch {
      // Try next candidate
    }
  }

  return {
    codec: 'avc1.420028',
    width,
    height,
    bitrate,
    framerate: fps,
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
  const { width, height } = ASPECT_RATIOS[settings.aspectRatio];
  const fps = settings.exportFps;

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
  const clipDuration = slicedBuffer.duration;
  const totalFrames = Math.max(1, Math.ceil(clipDuration * fps));
  const numberOfChannels = Math.min(2, slicedBuffer.numberOfChannels);
  const sampleRate = slicedBuffer.sampleRate;

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

  // 2. Initialize mp4-muxer with ArrayBufferTarget
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
    // 3. Encode AudioBuffer in 4096-sample planar f32 chunks
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

    // 4. Prepare offscreen canvas & deterministic offline FFT analyzer
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

    // 5. Fast offline frame rendering + encoding loop
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

      // Backpressure + UI responsiveness yield
      if (videoEncoder.encodeQueueSize > 8 || frameIdx % 4 === 0) {
        const pct = Math.min(97, Math.round(((frameIdx + 1) / totalFrames) * 96));
        onProgress({
          status: 'rendering',
          currentFrame: frameIdx + 1,
          totalFrames,
          percentage: pct,
          message: `Rendering frame ${frameIdx + 1} of ${totalFrames} — ${pct}%`,
        });

        while (videoEncoder.encodeQueueSize > 10 && !signal.aborted && !encoderError) {
          await new Promise((r) => setTimeout(r, 4));
        }
        await new Promise((r) => setTimeout(r, 0));
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

    const mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
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
    onProgress({
      status: 'completed',
      currentFrame: totalFrames,
      totalFrames,
      percentage: 100,
      message: `Rendered ${totalFrames} frames in ${(elapsedMs / 1000).toFixed(1)}s`,
      downloadUrl,
      downloadFileName,
      elapsedMs,
    });

    return {
      downloadUrl,
      downloadFileName,
      elapsedMs,
      totalFrames,
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

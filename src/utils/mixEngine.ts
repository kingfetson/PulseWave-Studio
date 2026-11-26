import { MixClipItem, MixVideoBlendMode } from '../types/studio';
import { audioBufferToWavBlob, extractWaveformPeaks } from './audioEngine';

export interface MixRenderResult {
  audioBuffer: AudioBuffer;
  wavBlob: Blob;
  duration: number;
  waveformPeaks: number[];
}

export interface MixVideoFrameResolver {
  hasActiveVideo: () => boolean;
  updateClips: (nextClips: MixClipItem[]) => void;
  resolvePreviewFrame: (
    trackTimeSec: number,
    targetW: number,
    targetH: number
  ) => HTMLCanvasElement | null;
  resolveExportFrame: (
    trackTimeSec: number,
    targetW: number,
    targetH: number
  ) => Promise<HTMLCanvasElement | null>;
  dispose: () => void;
}

let mixIdCounter = 0;
export function createMixClipId(): string {
  mixIdCounter += 1;
  return `mix-clip-${Date.now().toString(36)}-${mixIdCounter}`;
}

function isLikelyVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(file.name);
}

interface ProbeVideoResult {
  hasVideo: boolean;
  videoWidth: number;
  videoHeight: number;
  duration: number;
}

async function probeVideoMetadata(objectUrl: string): Promise<ProbeVideoResult> {
  if (typeof document === 'undefined') {
    return { hasVideo: false, videoWidth: 0, videoHeight: 0, duration: 0 };
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const finish = (res: ProbeVideoResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(res);
    };

    const timer = window.setTimeout(() => {
      finish({ hasVideo: false, videoWidth: 0, videoHeight: 0, duration: 0 });
    }, 5000);

    video.onloadedmetadata = () => {
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      finish({
        hasVideo: vw > 0 && vh > 0,
        videoWidth: vw,
        videoHeight: vh,
        duration: dur,
      });
    };

    video.onerror = () => {
      finish({ hasVideo: false, videoWidth: 0, videoHeight: 0, duration: 0 });
    };

    video.src = objectUrl;
  });
}

export async function decodeMixClipFile(
  file: File,
  audioCtx: AudioContext
): Promise<MixClipItem> {
  const likelyVideo = isLikelyVideoFile(file);
  const objectUrl = likelyVideo ? URL.createObjectURL(file) : null;

  let videoMeta: ProbeVideoResult = {
    hasVideo: false,
    videoWidth: 0,
    videoHeight: 0,
    duration: 0,
  };
  if (objectUrl) {
    videoMeta = await probeVideoMetadata(objectUrl);
  }

  let decodedAudio: AudioBuffer | null = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    decodedAudio = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    if (!videoMeta.hasVideo || videoMeta.duration <= 0) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      throw new Error(
        err instanceof Error
          ? `Unable to decode "${file.name}": ${err.message}`
          : `Unable to decode "${file.name}".`
      );
    }
    // Silent video file (no audio stream) — allowed when video stream is valid
    decodedAudio = null;
  }

  const duration = Math.max(
    0.1,
    decodedAudio?.duration ?? videoMeta.duration
  );
  const hasVideo = videoMeta.hasVideo;

  if (!hasVideo && objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  const waveformPeaks = decodedAudio
    ? extractWaveformPeaks(decodedAudio, 72)
    : new Array(72).fill(0.06);

  return {
    id: createMixClipId(),
    name: file.name,
    kind: hasVideo ? 'video' : 'audio',
    file,
    objectUrl: hasVideo ? objectUrl : null,
    duration,
    trimStart: 0,
    trimEnd: Number(duration.toFixed(2)),
    startTime: 0,
    volume: 1,
    muted: false,
    solo: false,
    fadeIn: 0,
    fadeOut: 0,
    videoOpacity: 1,
    videoBlendMode: 'normal',
    hasVideo,
    videoWidth: videoMeta.videoWidth,
    videoHeight: videoMeta.videoHeight,
    audioBuffer: decodedAudio,
    waveformPeaks,
  };
}

export function createMixClipFromBuffer(
  audioBuffer: AudioBuffer,
  name: string
): MixClipItem {
  const duration = Math.max(0.1, audioBuffer.duration);
  return {
    id: createMixClipId(),
    name,
    kind: 'audio',
    file: null,
    objectUrl: null,
    duration,
    trimStart: 0,
    trimEnd: Number(duration.toFixed(2)),
    startTime: 0,
    volume: 1,
    muted: false,
    solo: false,
    fadeIn: 0,
    fadeOut: 0,
    videoOpacity: 1,
    videoBlendMode: 'normal',
    hasVideo: false,
    videoWidth: 0,
    videoHeight: 0,
    audioBuffer,
    waveformPeaks: extractWaveformPeaks(audioBuffer, 72),
  };
}

export function getMixClipPlayLength(clip: MixClipItem): number {
  return Math.max(0.05, Math.min(clip.duration, clip.trimEnd) - Math.max(0, clip.trimStart));
}

export function computeMixTotalDuration(clips: MixClipItem[]): number {
  if (clips.length === 0) return 0;
  let maxEnd = 0;
  for (const clip of clips) {
    const end = Math.max(0, clip.startTime) + getMixClipPlayLength(clip);
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}

export function arrangeMixClipsSequential(
  clips: MixClipItem[],
  crossfadeSec = 0
): MixClipItem[] {
  const requestedFade = Math.max(0, Math.min(8, crossfadeSec));
  let cursor = 0;
  return clips.map((clip, index) => {
    const playLen = getMixClipPlayLength(clip);
    if (index === 0) {
      const next = {
        ...clip,
        startTime: 0,
        fadeIn: clip.fadeIn,
        fadeOut: clips.length > 1 && requestedFade > 0 ? Math.min(requestedFade, playLen * 0.45) : 0,
      };
      cursor = playLen;
      return next;
    }

    const prevClip = clips[index - 1];
    const prevPlayLen = getMixClipPlayLength(prevClip);
    const overlap =
      requestedFade > 0
        ? Math.min(requestedFade, prevPlayLen * 0.45, playLen * 0.45)
        : 0;
    const startTime = Math.max(0, Number((cursor - overlap).toFixed(2)));
    cursor = startTime + playLen;

    return {
      ...clip,
      startTime,
      fadeIn: overlap > 0 ? Number(overlap.toFixed(2)) : 0,
      fadeOut:
        index < clips.length - 1 && requestedFade > 0
          ? Number(Math.min(requestedFade, playLen * 0.45).toFixed(2))
          : 0,
    };
  });
}

export function arrangeMixClipsLayered(clips: MixClipItem[]): MixClipItem[] {
  return clips.map((clip) => ({
    ...clip,
    startTime: 0,
  }));
}

export function isMixClipAudioActive(clip: MixClipItem, allClips: MixClipItem[]): boolean {
  if (clip.muted) return false;
  const hasSolo = allClips.some((c) => c.solo);
  if (hasSolo && !clip.solo) return false;
  return Boolean(clip.audioBuffer);
}

export async function renderCombinedMixAudioBuffer(
  clips: MixClipItem[],
  options: { normalize?: boolean; sampleRate?: number } = {}
): Promise<MixRenderResult> {
  if (clips.length === 0) {
    throw new Error('Add at least one audio or video clip before mixing.');
  }

  const totalDuration = Math.max(0.5, computeMixTotalDuration(clips));
  const firstWithAudio = clips.find((c) => c.audioBuffer);
  const sampleRate = options.sampleRate || firstWithAudio?.audioBuffer?.sampleRate || 44100;
  const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) {
    throw new Error('OfflineAudioContext is not supported in this browser.');
  }

  const offlineCtx = new OfflineCtx(2, totalSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(1, 0);
  masterGain.connect(offlineCtx.destination);

  for (const clip of clips) {
    if (!isMixClipAudioActive(clip, clips) || !clip.audioBuffer) continue;

    const trimStart = Math.max(0, Math.min(clip.duration - 0.05, clip.trimStart));
    const trimEnd = Math.max(trimStart + 0.05, Math.min(clip.duration, clip.trimEnd));
    const playDuration = trimEnd - trimStart;
    const startAt = Math.max(0, clip.startTime);
    const endAt = startAt + playDuration;
    const volume = Math.max(0, Math.min(1.5, clip.volume));

    if (volume <= 0.0001) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = clip.audioBuffer;

    const gainNode = offlineCtx.createGain();
    const fadeIn = Math.max(0, Math.min(clip.fadeIn, playDuration * 0.49));
    const fadeOut = Math.max(0, Math.min(clip.fadeOut, playDuration * 0.49));

    if (fadeIn > 0.005) {
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
    } else {
      gainNode.gain.setValueAtTime(volume, startAt);
    }

    if (fadeOut > 0.005) {
      const fadeOutStart = Math.max(startAt + fadeIn, endAt - fadeOut);
      gainNode.gain.setValueAtTime(volume, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0.0001, endAt);
    } else {
      gainNode.gain.setValueAtTime(volume, endAt);
    }

    source.connect(gainNode);
    gainNode.connect(masterGain);
    source.start(startAt, trimStart, playDuration);
  }

  const rendered = await offlineCtx.startRendering();

  // Optional auto-leveling & gentle peak limiting so layered audio never clips harshly
  let peak = 0;
  const chCount = rendered.numberOfChannels;
  for (let ch = 0; ch < chCount; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }

  if (peak > 0.0001 && (options.normalize ? peak > 0.94 || peak < 0.7 : peak > 0.99)) {
    const targetPeak = options.normalize ? 0.94 : 0.98;
    const scale = Math.min(options.normalize ? 2.2 : 1, targetPeak / peak);
    for (let ch = 0; ch < chCount; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        let s = data[i] * scale;
        if (s > 0.985 || s < -0.985) {
          s = Math.tanh(s);
        }
        data[i] = s;
      }
    }
  }

  const wavBlob = audioBufferToWavBlob(rendered);
  const waveformPeaks = extractWaveformPeaks(rendered, 200);

  return {
    audioBuffer: rendered,
    wavBlob,
    duration: rendered.duration,
    waveformPeaks,
  };
}

interface ActiveVideoSample {
  clip: MixClipItem;
  video: HTMLVideoElement;
  localTime: number;
  opacity: number;
}

function computeVideoClipEnvelopeOpacity(clip: MixClipItem, localOffset: number, playLen: number): number {
  const baseOpacity = Math.max(0, Math.min(1, clip.videoOpacity));
  if (baseOpacity <= 0.005) return 0;

  let fadeFactor = 1;
  if (clip.fadeIn > 0.01 && localOffset < clip.fadeIn) {
    fadeFactor = Math.min(fadeFactor, Math.max(0, localOffset / clip.fadeIn));
  }
  const timeToEnd = playLen - localOffset;
  if (clip.fadeOut > 0.01 && timeToEnd < clip.fadeOut) {
    fadeFactor = Math.min(fadeFactor, Math.max(0, timeToEnd / clip.fadeOut));
  }
  return baseOpacity * fadeFactor;
}

function drawVideoFrameCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetW: number,
  targetH: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return;

  const videoRatio = vw / vh;
  const targetRatio = targetW / targetH;
  let drawW: number;
  let drawH: number;
  if (videoRatio > targetRatio) {
    drawH = targetH;
    drawW = drawH * videoRatio;
  } else {
    drawW = targetW;
    drawH = drawW / videoRatio;
  }
  const dx = (targetW - drawW) * 0.5;
  const dy = (targetH - drawH) * 0.5;
  ctx.drawImage(video, dx, dy, drawW, drawH);
}

async function seekVideoElementToTime(
  video: HTMLVideoElement,
  targetTime: number
): Promise<void> {
  const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : targetTime + 1;
  const clamped = Math.max(0, Math.min(safeDuration - 0.008, targetTime));

  if (video.readyState < 1) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('error', done);
        resolve();
      };
      const timer = window.setTimeout(done, 1000);
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('error', done, { once: true });
    });
  }

  if (Math.abs(video.currentTime - clamped) > 0.012) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', done);
        resolve();
      };
      const timer = window.setTimeout(done, 450);
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', done, { once: true });
      try {
        video.currentTime = clamped;
      } catch {
        done();
      }
    });
  }

  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener('canplay', done);
        video.removeEventListener('loadeddata', done);
        resolve();
      };
      const timer = window.setTimeout(done, 350);
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('loadeddata', done, { once: true });
    });
  }
}

function resolveCanvasCompositeOp(blendMode?: MixVideoBlendMode): GlobalCompositeOperation {
  switch (blendMode) {
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'multiply':
      return 'multiply';
    case 'lighten':
      return 'lighten';
    case 'darken':
      return 'darken';
    case 'color-dodge':
      return 'color-dodge';
    case 'hard-light':
      return 'hard-light';
    case 'soft-light':
      return 'soft-light';
    case 'normal':
    default:
      return 'source-over';
  }
}

export function createMixVideoFrameResolver(clips: MixClipItem[]): MixVideoFrameResolver {
  let orderedVideoClips = clips.filter((c) => c.hasVideo && Boolean(c.objectUrl));

  const videoMap = new Map<string, HTMLVideoElement>();
  const lastPreviewSeekMs = new Map<string, number>();

  const ensureVideoElement = (clip: MixClipItem) => {
    if (typeof document === 'undefined' || !clip.objectUrl) return;
    if (videoMap.has(clip.id)) return;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = clip.objectUrl;
    v.load();
    videoMap.set(clip.id, v);
  };

  for (const clip of orderedVideoClips) {
    ensureVideoElement(clip);
  }

  let compositeCanvas: HTMLCanvasElement | null = null;

  const collectActiveSamples = (trackTimeSec: number): ActiveVideoSample[] => {
    const active: ActiveVideoSample[] = [];
    for (const clip of orderedVideoClips) {
      if (clip.videoOpacity <= 0.01) continue;
      const video = videoMap.get(clip.id);
      if (!video) continue;
      const playLen = getMixClipPlayLength(clip);
      const start = Math.max(0, clip.startTime);
      const end = start + playLen;
      if (trackTimeSec < start || trackTimeSec > end) continue;

      const localOffset = trackTimeSec - start;
      const localTime = Math.max(
        0,
        Math.min(clip.duration - 0.01, clip.trimStart + localOffset)
      );
      const opacity = computeVideoClipEnvelopeOpacity(clip, localOffset, playLen);
      if (opacity <= 0.005) continue;

      active.push({ clip, video, localTime, opacity });
    }
    return active;
  };

  const compositeSamples = (
    samples: ActiveVideoSample[],
    targetW: number,
    targetH: number
  ): HTMLCanvasElement | null => {
    const readySamples = samples.filter(
      (s) => s.video.readyState >= 2 && s.video.videoWidth > 0 && s.video.videoHeight > 0
    );
    if (readySamples.length === 0 || typeof document === 'undefined') return null;

    if (!compositeCanvas) {
      compositeCanvas = document.createElement('canvas');
    }
    if (compositeCanvas.width !== targetW || compositeCanvas.height !== targetH) {
      compositeCanvas.width = targetW;
      compositeCanvas.height = targetH;
    }

    const ctx = compositeCanvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, targetW, targetH);

    for (let i = 0; i < readySamples.length; i++) {
      const sample = readySamples[i];
      ctx.save();
      ctx.globalAlpha = sample.opacity;
      // Bottom active layer composites normally over canvas backdrop; upper stacked layers apply their blend mode
      ctx.globalCompositeOperation =
        i === 0 ? 'source-over' : resolveCanvasCompositeOp(sample.clip.videoBlendMode);
      drawVideoFrameCover(ctx, sample.video, targetW, targetH);
      ctx.restore();
    }

    return compositeCanvas;
  };

  return {
    hasActiveVideo: () =>
      orderedVideoClips.some((c) => c.hasVideo && Boolean(c.objectUrl) && c.videoOpacity > 0.01),

    updateClips: (nextClips: MixClipItem[]) => {
      const nextVideoClips = nextClips.filter((c) => c.hasVideo && Boolean(c.objectUrl));
      const activeIds = new Set(nextVideoClips.map((c) => c.id));

      for (const [id, video] of videoMap.entries()) {
        if (!activeIds.has(id)) {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch {
            // ignore cleanup errors
          }
          videoMap.delete(id);
          lastPreviewSeekMs.delete(id);
        }
      }

      for (const clip of nextVideoClips) {
        ensureVideoElement(clip);
      }
      orderedVideoClips = nextVideoClips;
    },

    resolvePreviewFrame: (trackTimeSec: number, targetW: number, targetH: number) => {
      const samples = collectActiveSamples(trackTimeSec);
      if (samples.length === 0) return null;

      const nowMs = performance.now();
      for (const sample of samples) {
        const diff = Math.abs(sample.video.currentTime - sample.localTime);
        const lastSeek = lastPreviewSeekMs.get(sample.clip.id) ?? 0;
        if (!sample.video.seeking && diff > 0.045 && nowMs - lastSeek > 32) {
          lastPreviewSeekMs.set(sample.clip.id, nowMs);
          try {
            sample.video.currentTime = sample.localTime;
          } catch {
            // ignore seek failures while metadata warms up
          }
        }
      }

      return compositeSamples(samples, targetW, targetH);
    },

    resolveExportFrame: async (trackTimeSec: number, targetW: number, targetH: number) => {
      const samples = collectActiveSamples(trackTimeSec);
      if (samples.length === 0) return null;

      await Promise.all(
        samples.map((sample) => seekVideoElementToTime(sample.video, sample.localTime))
      );

      return compositeSamples(samples, targetW, targetH);
    },

    dispose: () => {
      for (const video of videoMap.values()) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {
          // ignore cleanup errors
        }
      }
      videoMap.clear();
      lastPreviewSeekMs.clear();
      compositeCanvas = null;
    },
  };
}

export function disposeMixClips(clips: MixClipItem[]): void {
  for (const clip of clips) {
    if (clip.objectUrl) {
      URL.revokeObjectURL(clip.objectUrl);
    }
  }
}

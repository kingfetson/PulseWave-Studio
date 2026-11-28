import {
  DjCuePoint,
  DjMixTriggerMode,
  DjTrackAsset,
  DjTransitionStyle,
  DjTriBandPeaks,
  DjVideoMixStyle,
  LyricLine,
  MixVideoBlendMode,
} from '../types/studio';
import {
  audioBufferToWavBlob,
  extractWaveformPeaks,
  generateDemoBeat,
} from './audioEngine';
import { detectMusicalKeyFromBuffer } from './djKeyDetection';
import { extractSpectrogramWindow } from './djSpectrogram';
import { createLyricId, parseCaptionsFile } from './lrcParser';
import {
  analyzeBeatsFromAudioBuffer,
  autoAlignLyricsToAmplitudePeaks,
  suggestTimestampsForPlainLyrics,
} from './lyricBeatAutoSync';
import { MixVideoFrameResolver } from './mixEngine';

let djIdCounter = 0;
export function createDjTrackId(): string {
  djIdCounter += 1;
  return `dj-track-${Date.now().toString(36)}-${djIdCounter}`;
}

function isLikelyVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(file.name);
}

interface ProbeVideoMeta {
  hasVideo: boolean;
  videoWidth: number;
  videoHeight: number;
  duration: number;
}

async function probeDjVideoMetadata(objectUrl: string): Promise<ProbeVideoMeta> {
  if (typeof document === 'undefined') {
    return { hasVideo: false, videoWidth: 0, videoHeight: 0, duration: 0 };
  }
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const finish = (res: ProbeVideoMeta) => {
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

function parseArtistTitleFromFilename(fileName: string): { title: string; artist: string } {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const dashSplit = stem.split(/\s+-\s+/);
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim(),
      title: dashSplit.slice(1).join(' - ').trim(),
    };
  }
  return {
    artist: 'DJ Crate',
    title: stem || 'Untitled Track',
  };
}

/**
 * Extracts tri-band spectral peaks (low bass, mid vocals/synth, high hats/air)
 * using fast sample-domain filtering so DJ waveforms render rich frequency colors.
 */
export function extractTriBandPeaks(
  buffer: AudioBuffer,
  bucketCount = 220
): DjTriBandPeaks {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const totalSamples = ch0.length;
  const sampleRate = Math.max(8000, buffer.sampleRate);

  const low = new Array<number>(bucketCount).fill(0);
  const mid = new Array<number>(bucketCount).fill(0);
  const high = new Array<number>(bucketCount).fill(0);
  const overall = new Array<number>(bucketCount).fill(0);

  if (totalSamples <= 0) {
    return { low, mid, high, overall };
  }

  // Single-pole IIR filters for low (<240Hz), high (>2600Hz), and mid band residual
  const alphaLow = Math.min(0.99, (2 * Math.PI * 240) / sampleRate);
  const alphaHigh = Math.min(0.99, (2 * Math.PI * 2600) / sampleRate);

  const blockSize = Math.max(1, Math.floor(totalSamples / bucketCount));
  const step = Math.max(1, Math.floor(blockSize / 96));

  let lpState = 0;
  let hpLpState = 0;

  let maxLow = 0.001;
  let maxMid = 0.001;
  let maxHigh = 0.001;
  let maxAll = 0.001;

  for (let b = 0; b < bucketCount; b++) {
    const start = b * blockSize;
    const end = Math.min(totalSamples, start + blockSize);
    let sumLow = 0;
    let sumMid = 0;
    let sumHigh = 0;
    let peakAll = 0;
    let count = 0;

    for (let i = start; i < end; i += step) {
      const s = ch1 ? 0.5 * (ch0[i] + ch1[i]) : ch0[i];
      const absS = Math.abs(s);
      if (absS > peakAll) peakAll = absS;

      lpState += alphaLow * (s - lpState);
      hpLpState += alphaHigh * (s - hpLpState);

      const lowSample = lpState;
      const highSample = s - hpLpState;
      const midSample = hpLpState - lpState;

      sumLow += lowSample * lowSample;
      sumMid += midSample * midSample;
      sumHigh += highSample * highSample;
      count++;
    }

    const rmsLow = count > 0 ? Math.sqrt(sumLow / count) : 0;
    const rmsMid = count > 0 ? Math.sqrt(sumMid / count) : 0;
    const rmsHigh = count > 0 ? Math.sqrt(sumHigh / count) : 0;

    low[b] = rmsLow;
    mid[b] = rmsMid;
    high[b] = rmsHigh;
    overall[b] = peakAll;

    if (rmsLow > maxLow) maxLow = rmsLow;
    if (rmsMid > maxMid) maxMid = rmsMid;
    if (rmsHigh > maxHigh) maxHigh = rmsHigh;
    if (peakAll > maxAll) maxAll = peakAll;
  }

  for (let b = 0; b < bucketCount; b++) {
    low[b] = Math.min(1, low[b] / maxLow);
    mid[b] = Math.min(1, mid[b] / maxMid);
    high[b] = Math.min(1, high[b] / maxHigh);
    overall[b] = Math.min(1, overall[b] / maxAll);
  }

  return { low, mid, high, overall };
}

/**
 * Generates a quantized 4/4 beat grid anchored onto the track's strongest bass peaks
 * and finds both the strongest energy drop timestamp and optimal mix-out breakdown.
 */
export function analyzeBeatGridAndDrops(
  audioBuffer: AudioBuffer,
  beatSensitivity = 1.25
): {
  bpm: number;
  beatTimes: number[];
  downbeatTimes: number[];
  dropTime: number;
  recommendedOutTime: number;
  energyScore: number;
} {
  const duration = Math.max(0.5, audioBuffer.duration);
  const analysis = analyzeBeatsFromAudioBuffer(audioBuffer, {
    startSec: 0,
    endSec: duration,
    beatSensitivity,
  });

  let bpm = analysis.estimatedBpm ?? 120;
  bpm = Math.max(68, Math.min(176, Math.round(bpm)));
  const beatPeriod = 60 / bpm;

  // Find best phase anchor within the first 8 beats by scoring alignment against detected peaks
  const candidateAnchorEnd = Math.min(duration, beatPeriod * 8);
  const anchorCandidates = analysis.beats.filter((b) => b.timeSec <= candidateAnchorEnd);
  let bestAnchor = anchorCandidates[0]?.timeSec ?? 0;

  if (anchorCandidates.length > 0 && analysis.beats.length > 3) {
    let bestScore = -1;
    for (const cand of anchorCandidates) {
      let score = cand.energy * 1.25;
      for (const b of analysis.beats) {
        const phase = Math.abs(((b.timeSec - cand.timeSec) % beatPeriod + beatPeriod) % beatPeriod);
        const dist = Math.min(phase, beatPeriod - phase);
        if (dist < 0.065) {
          score += b.energy;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestAnchor = cand.timeSec;
      }
    }
  }

  // Rewind anchor cleanly toward track start while keeping beat phase aligned
  while (bestAnchor - beatPeriod >= 0.01) {
    bestAnchor -= beatPeriod;
  }

  const beatTimes: number[] = [];
  for (let t = bestAnchor; t < duration - 0.05; t += beatPeriod) {
    beatTimes.push(Number(t.toFixed(3)));
  }
  if (beatTimes.length === 0) {
    beatTimes.push(0);
  }

  // Pick downbeat phase (0..3) where kicks have highest average energy
  let bestDownbeatOffset = 0;
  let bestPhaseEnergy = -1;
  for (let offset = 0; offset < Math.min(4, beatTimes.length); offset++) {
    let phaseSum = 0;
    for (let i = offset; i < beatTimes.length; i += 4) {
      const bt = beatTimes[i];
      const near = analysis.beats.find((b) => Math.abs(b.timeSec - bt) < 0.09);
      if (near) phaseSum += near.energy;
    }
    if (phaseSum > bestPhaseEnergy) {
      bestPhaseEnergy = phaseSum;
      bestDownbeatOffset = offset;
    }
  }

  const downbeatTimes: number[] = [];
  for (let i = bestDownbeatOffset; i < beatTimes.length; i += 4) {
    downbeatTimes.push(beatTimes[i]);
  }
  if (downbeatTimes.length === 0) {
    downbeatTimes.push(beatTimes[0]);
  }

  // Locate peak energy drop window (after at least 12% into the track, before 72%)
  const peaks = extractWaveformPeaks(audioBuffer, 120);
  const avgEnergy = peaks.reduce((s, v) => s + v, 0) / Math.max(1, peaks.length);
  const minDropTime = Math.min(duration * 0.12, Math.max(2, duration * 0.1));
  const maxDropTime = Math.max(minDropTime + 1, duration * 0.72);
  let bestDropTime = downbeatTimes[Math.min(downbeatTimes.length - 1, 2)] ?? 0;
  let bestJump = -1;

  for (const db of downbeatTimes) {
    if (db < minDropTime || db > maxDropTime) continue;
    const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor((db / duration) * peaks.length)));
    const preSlice = peaks.slice(Math.max(0, idx - 4), idx);
    const postSlice = peaks.slice(idx, Math.min(peaks.length, idx + 6));
    const preMean = preSlice.reduce((s, v) => s + v, 0) / Math.max(1, preSlice.length);
    const postMean = postSlice.reduce((s, v) => s + v, 0) / Math.max(1, postSlice.length);
    const jump = postMean * 1.15 - preMean * 0.65;
    if (jump > bestJump) {
      bestJump = jump;
      bestDropTime = db;
    }
  }

  // Recommended mix-out downbeat near ~76% of the track
  const targetOut = duration * 0.76;
  let recommendedOutTime = Math.max(0, duration - Math.min(10, beatPeriod * 8));
  let bestOutDist = Infinity;
  for (const db of downbeatTimes) {
    if (db < duration * 0.4 || db > duration - Math.max(2, beatPeriod * 4)) continue;
    const dist = Math.abs(db - targetOut);
    if (dist < bestOutDist) {
      bestOutDist = dist;
      recommendedOutTime = db;
    }
  }

  return {
    bpm,
    beatTimes,
    downbeatTimes,
    dropTime: Number(bestDropTime.toFixed(3)),
    recommendedOutTime: Number(recommendedOutTime.toFixed(3)),
    energyScore: Math.round(Math.min(100, Math.max(15, avgEnergy * 135))),
  };
}

export const DJ_CUE_PRESETS: Array<{ label: string; color: string }> = [
  { label: 'Intro', color: '#22d3ee' },
  { label: 'Verse', color: '#38bdf8' },
  { label: 'Build', color: '#a78bfa' },
  { label: 'Drop', color: '#fb7185' },
  { label: 'Bridge', color: '#f59e0b' },
  { label: 'Break', color: '#34d399' },
  { label: 'Chorus', color: '#e879f9' },
  { label: 'Outro', color: '#94a3b8' },
];

export function createDjCuePointId(): string {
  return `dj-cue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function detectDefaultDjCuePoints(track: {
  duration: number;
  downbeatTimes: number[];
  beatTimes: number[];
  dropTime: number;
  recommendedOutTime: number;
}): DjCuePoint[] {
  const cues: DjCuePoint[] = [];
  const introTime = Number((track.downbeatTimes[0] ?? 0).toFixed(2));
  cues.push({
    id: createDjCuePointId(),
    label: 'Intro',
    timeSec: Math.max(0, Math.min(track.duration - 0.5, introTime)),
    color: '#22d3ee',
  });

  if (track.duration >= 6 && track.dropTime > introTime + 1.2) {
    cues.push({
      id: createDjCuePointId(),
      label: 'Drop',
      timeSec: Number(Math.max(0, Math.min(track.duration - 0.5, track.dropTime)).toFixed(2)),
      color: '#fb7185',
    });
  }

  const bridgeTarget = track.duration * 0.62;
  const bridgeBeat =
    track.downbeatTimes.length > 0
      ? findNearestBeat(track.downbeatTimes, bridgeTarget)
      : findNearestBeat(track.beatTimes, bridgeTarget);
  if (
    track.duration >= 12 &&
    Math.abs(bridgeBeat - track.dropTime) > 2.5 &&
    track.recommendedOutTime - bridgeBeat > 2.0
  ) {
    cues.push({
      id: createDjCuePointId(),
      label: 'Bridge',
      timeSec: Number(Math.max(0, Math.min(track.duration - 0.5, bridgeBeat)).toFixed(2)),
      color: '#f59e0b',
    });
  }

  if (track.recommendedOutTime > introTime + 2.0) {
    cues.push({
      id: createDjCuePointId(),
      label: 'Outro',
      timeSec: Number(
        Math.max(0, Math.min(track.duration - 0.3, track.recommendedOutTime)).toFixed(2)
      ),
      color: '#94a3b8',
    });
  }

  return cues.sort((a, b) => a.timeSec - b.timeSec);
}

export function analyzeDjTrackFromBuffer(
  audioBuffer: AudioBuffer,
  name: string,
  options: {
    file?: File | null;
    objectUrl?: string | null;
    hasVideo?: boolean;
    videoWidth?: number;
    videoHeight?: number;
    lyrics?: LyricLine[];
    beatSensitivity?: number;
    title?: string;
    artist?: string;
  } = {}
): DjTrackAsset {
  const parsed = parseArtistTitleFromFilename(name);
  const grid = analyzeBeatGridAndDrops(audioBuffer, options.beatSensitivity ?? 1.25);
  const triBandPeaks = extractTriBandPeaks(audioBuffer, 220);
  const keyAnalysis = detectMusicalKeyFromBuffer(audioBuffer);
  const duration = Math.max(0.2, audioBuffer.duration);
  const spectrogram = extractSpectrogramWindow(audioBuffer, 0, duration, 160, 24);
  const cuePoints = detectDefaultDjCuePoints({
    duration,
    downbeatTimes: grid.downbeatTimes,
    beatTimes: grid.beatTimes,
    dropTime: grid.dropTime,
    recommendedOutTime: grid.recommendedOutTime,
  });

  return {
    id: createDjTrackId(),
    name,
    title: options.title?.trim() || parsed.title,
    artist: options.artist?.trim() || parsed.artist,
    kind: options.hasVideo ? 'video' : 'audio',
    file: options.file ?? null,
    objectUrl: options.hasVideo ? options.objectUrl ?? null : null,
    duration,
    hasVideo: Boolean(options.hasVideo),
    videoWidth: options.videoWidth ?? 0,
    videoHeight: options.videoHeight ?? 0,
    audioBuffer,
    bpm: grid.bpm,
    bpmHalfDoubleFactor: 1,
    autoBpm: grid.bpm,
    autoDownbeatAnchorSec: grid.downbeatTimes[0] ?? grid.beatTimes[0] ?? 0,
    beatGridOffsetMs: 0,
    beatGridLocked: false,
    beatTimes: grid.beatTimes,
    downbeatTimes: grid.downbeatTimes,
    dropTime: grid.dropTime,
    recommendedOutTime: grid.recommendedOutTime,
    triBandPeaks,
    lyrics: options.lyrics ? [...options.lyrics].sort((a, b) => a.time - b.time) : [],
    cuePoints,
    energyScore: grid.energyScore,
    musicalKey: keyAnalysis.musicalKey,
    camelotKey: keyAnalysis.camelotKey,
    keyConfidence: keyAnalysis.confidence,
    spectrogram,
  };
}

export async function analyzeDjTrackFromFile(
  file: File,
  audioCtx: AudioContext,
  beatSensitivity = 1.25
): Promise<DjTrackAsset> {
  const likelyVideo = isLikelyVideoFile(file);
  const objectUrl = likelyVideo ? URL.createObjectURL(file) : null;

  let videoMeta: ProbeVideoMeta = {
    hasVideo: false,
    videoWidth: 0,
    videoHeight: 0,
    duration: 0,
  };
  if (objectUrl) {
    videoMeta = await probeDjVideoMetadata(objectUrl);
  }

  let decodedAudio: AudioBuffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    decodedAudio = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw new Error(
      err instanceof Error
        ? `Unable to decode audio from "${file.name}": ${err.message}`
        : `Unable to decode audio from "${file.name}".`
    );
  }

  if (!videoMeta.hasVideo && objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  return analyzeDjTrackFromBuffer(decodedAudio, file.name, {
    file,
    objectUrl: videoMeta.hasVideo ? objectUrl : null,
    hasVideo: videoMeta.hasVideo,
    videoWidth: videoMeta.videoWidth,
    videoHeight: videoMeta.videoHeight,
    beatSensitivity,
  });
}

/**
 * Parses uploaded .lrc / .srt / .vtt / plain-text lyrics and snaps plain lines
 * onto the track's detected beat grid automatically.
 */
export function parseAndSyncDjTrackLyrics(
  content: string,
  fileName: string | undefined,
  track: DjTrackAsset,
  beatSensitivity = 1.25
): LyricLine[] {
  const hasExplicitTimestamps =
    /\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\]/.test(content) || content.includes('-->');
  const rawParsed = parseCaptionsFile(content, fileName, track.duration);
  if (rawParsed.length === 0) return [];

  if (hasExplicitTimestamps) {
    return rawParsed;
  }

  // Plain lines without timestamps -> snap cleanly onto detected beat grid!
  const beatAnalysis = analyzeBeatsFromAudioBuffer(track.audioBuffer, {
    startSec: 0,
    endSec: track.duration,
    beatSensitivity,
  });
  const suggestions = suggestTimestampsForPlainLyrics(
    rawParsed.map((l) => l.text),
    beatAnalysis,
    2
  );
  return suggestions.map((s) => ({
    id: createLyricId(),
    time: s.suggestedTime,
    text: s.text,
  }));
}

export function snapDjLyricsToTrackBeats(
  track: DjTrackAsset,
  beatSensitivity = 1.25
): LyricLine[] {
  if (track.lyrics.length === 0) return [];
  const res = autoAlignLyricsToAmplitudePeaks(track.lyrics, track.audioBuffer, {
    beatSensitivity,
    maxSnapSec: 0.6,
  });
  return res.alignedLyrics;
}

export function getEffectiveBpm(track: DjTrackAsset): number {
  return Math.max(
    40,
    Math.min(240, Number((track.bpm * track.bpmHalfDoubleFactor).toFixed(2)))
  );
}

export function findNearestBeat(beatTimes: number[], timeSec: number): number {
  if (beatTimes.length === 0) return Math.max(0, timeSec);
  let best = beatTimes[0];
  let bestDist = Infinity;
  for (const bt of beatTimes) {
    const d = Math.abs(bt - timeSec);
    if (d < bestDist) {
      bestDist = d;
      best = bt;
    } else if (bt > timeSec && d > bestDist) {
      break;
    }
  }
  return best;
}

export interface BeatGridPoint {
  timeSec: number;
  isDownbeat: boolean;
  barNumber: number;
  beatInBar: 1 | 2 | 3 | 4;
}

/**
 * Generates an effective 4/4 beat grid across the entire track honoring
 * the track's half/double BPM factor and calibrated downbeat anchor.
 */
export function getEffectiveBeatGridPoints(track: DjTrackAsset): BeatGridPoint[] {
  const effBpm = getEffectiveBpm(track);
  const beatPeriod = 60 / Math.max(40, effBpm);
  const anchor = track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;

  const kStart = Math.ceil((-0.0005 - anchor) / beatPeriod);
  const points: BeatGridPoint[] = [];
  let barCounter = 0;

  for (let k = kStart; ; k++) {
    const t = anchor + k * beatPeriod;
    if (t > track.duration - 0.02) break;
    if (t < 0) continue;
    const mod4 = ((k % 4) + 4) % 4;
    const beatInBar = (mod4 + 1) as 1 | 2 | 3 | 4;
    if (points.length === 0 || mod4 === 0) {
      barCounter += 1;
    }
    points.push({
      timeSec: Number(t.toFixed(4)),
      isDownbeat: mod4 === 0,
      barNumber: barCounter,
      beatInBar,
    });
  }

  return points;
}

function rebuildUniformBeatArrays(
  duration: number,
  bpm: number,
  downbeatAnchorSec: number
): { beatTimes: number[]; downbeatTimes: number[] } {
  const beatPeriod = 60 / Math.max(40, bpm);
  const kStart = Math.ceil((-0.0005 - downbeatAnchorSec) / beatPeriod);
  const beatTimes: number[] = [];
  const downbeatTimes: number[] = [];

  for (let k = kStart; ; k++) {
    const t = downbeatAnchorSec + k * beatPeriod;
    if (t > duration - 0.02) break;
    if (t < 0) continue;
    const rounded = Number(t.toFixed(4));
    beatTimes.push(rounded);
    if (((k % 4) + 4) % 4 === 0) {
      downbeatTimes.push(rounded);
    }
  }

  if (beatTimes.length === 0) beatTimes.push(0);
  if (downbeatTimes.length === 0) downbeatTimes.push(beatTimes[0]);
  return { beatTimes, downbeatTimes };
}

/**
 * Slips a track's beat grid and 4/4 downbeat markers by deltaSec while keeping
 * uniform beat spacing across the entire track.
 */
export function shiftTrackBeatGrid(track: DjTrackAsset, deltaSec: number): DjTrackAsset {
  if (track.beatGridLocked) return track;
  const baseAnchor = track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;
  const autoAnchor = track.autoDownbeatAnchorSec ?? baseAnchor;
  const nextAnchor = baseAnchor + deltaSec;
  const { beatTimes, downbeatTimes } = rebuildUniformBeatArrays(
    track.duration,
    track.bpm,
    nextAnchor
  );
  const nextOffsetMs = Number(((track.beatGridOffsetMs ?? 0) + deltaSec * 1000).toFixed(1));
  return {
    ...track,
    autoBpm: track.autoBpm ?? track.bpm,
    autoDownbeatAnchorSec: autoAnchor,
    beatGridOffsetMs: nextOffsetMs,
    beatTimes,
    downbeatTimes,
  };
}

/**
 * Sets a track's beat-grid phase offset in milliseconds relative to its
 * auto-detected downbeat anchor.
 */
export function setTrackBeatGridOffsetMs(track: DjTrackAsset, offsetMs: number): DjTrackAsset {
  if (track.beatGridLocked) return track;
  const autoAnchor =
    track.autoDownbeatAnchorSec ?? track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;
  const clampedMs = Math.max(-500, Math.min(500, Number(offsetMs.toFixed(1))));
  const { beatTimes, downbeatTimes } = rebuildUniformBeatArrays(
    track.duration,
    track.bpm,
    autoAnchor + clampedMs / 1000
  );
  return {
    ...track,
    autoBpm: track.autoBpm ?? track.bpm,
    autoDownbeatAnchorSec: autoAnchor,
    beatGridOffsetMs: clampedMs,
    beatTimes,
    downbeatTimes,
  };
}

/**
 * Anchors Beat 1.1 (downbeat phase) directly onto the given timestamp.
 */
export function setTrackDownbeatAtTime(track: DjTrackAsset, timeSec: number): DjTrackAsset {
  if (track.beatGridLocked) return track;
  const clamped = Math.max(0, Math.min(track.duration - 0.05, timeSec));
  const autoAnchor =
    track.autoDownbeatAnchorSec ?? track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;
  const { beatTimes, downbeatTimes } = rebuildUniformBeatArrays(
    track.duration,
    track.bpm,
    clamped
  );
  const beatPeriod = 60 / Math.max(40, getEffectiveBpm(track));
  const rawDelta = (downbeatTimes[0] ?? clamped) - autoAnchor;
  const wrappedOffsetSec =
    (((rawDelta + beatPeriod * 2) % (beatPeriod * 4)) + beatPeriod * 4) % (beatPeriod * 4) -
    beatPeriod * 2;
  return {
    ...track,
    autoBpm: track.autoBpm ?? track.bpm,
    autoDownbeatAnchorSec: autoAnchor,
    beatGridOffsetMs: Number((wrappedOffsetSec * 1000).toFixed(1)),
    beatTimes,
    downbeatTimes,
  };
}

/**
 * Shifts which beat within the 4/4 bar is designated as Beat 1.1 (downbeat)
 * by deltaBeats without losing tempo alignment.
 */
export function cycleTrackDownbeatPhase(track: DjTrackAsset, deltaBeats: 1 | -1): DjTrackAsset {
  if (track.beatGridLocked) return track;
  const beatPeriod = 60 / Math.max(40, getEffectiveBpm(track));
  const baseAnchor = track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;
  const nextAnchor = baseAnchor + deltaBeats * beatPeriod;
  const { beatTimes, downbeatTimes } = rebuildUniformBeatArrays(
    track.duration,
    track.bpm,
    nextAnchor
  );
  return {
    ...track,
    autoBpm: track.autoBpm ?? track.bpm,
    autoDownbeatAnchorSec:
      track.autoDownbeatAnchorSec ?? track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0,
    beatTimes,
    downbeatTimes,
  };
}

/**
 * Fine-tunes the track's detected base BPM while keeping the current downbeat anchor intact.
 */
export function adjustTrackFineBpm(track: DjTrackAsset, nextBpm: number): DjTrackAsset {
  if (track.beatGridLocked) return track;
  const clampedBpm = Math.max(40, Math.min(240, Number(nextBpm.toFixed(1))));
  const baseAnchor = track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;
  const { beatTimes, downbeatTimes } = rebuildUniformBeatArrays(
    track.duration,
    clampedBpm,
    baseAnchor
  );
  return {
    ...track,
    autoBpm: track.autoBpm ?? track.bpm,
    autoDownbeatAnchorSec:
      track.autoDownbeatAnchorSec ?? track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0,
    bpm: clampedBpm,
    beatTimes,
    downbeatTimes,
  };
}

/**
 * Analyzes local low-frequency kick transient peaks around centerSec and snaps
 * the nearest beat grid line directly onto the sharpest kick onset.
 */
export function snapTrackBeatGridToNearestTransient(
  track: DjTrackAsset,
  centerSec: number
): DjTrackAsset {
  if (track.beatGridLocked) return track;
  const sr = Math.max(8000, track.audioBuffer.sampleRate);
  const ch0 = track.audioBuffer.getChannelData(0);
  const ch1 = track.audioBuffer.numberOfChannels > 1 ? track.audioBuffer.getChannelData(1) : null;
  const searchRadius = 0.24;
  const startSec = Math.max(0, centerSec - searchRadius);
  const endSec = Math.min(track.duration, centerSec + searchRadius);

  const frameSec = 0.004; // 4ms transient resolution
  const frameSamples = Math.max(16, Math.floor(frameSec * sr));
  const startIdx = Math.floor(startSec * sr);
  const endIdx = Math.min(ch0.length, Math.floor(endSec * sr));

  const alphaLow = Math.min(0.99, (2 * Math.PI * 190) / sr);
  let lp = 0;
  let prevEnergy = 0;
  let bestTime = centerSec;
  let bestScore = -1;

  for (let i = startIdx; i + frameSamples < endIdx; i += frameSamples) {
    let sumSq = 0;
    for (let j = i; j < i + frameSamples; j += 2) {
      const s = ch1 ? 0.5 * (ch0[j] + ch1[j]) : ch0[j];
      lp += alphaLow * (s - lp);
      sumSq += lp * lp;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, frameSamples / 2));
    const flux = Math.max(0, rms - prevEnergy);
    const score = rms * 0.55 + flux * 1.45;
    prevEnergy = rms;
    if (score > bestScore) {
      bestScore = score;
      bestTime = i / sr;
    }
  }

  const gridPoints = getEffectiveBeatGridPoints(track);
  if (gridPoints.length === 0) return track;
  let nearestBeat = gridPoints[0].timeSec;
  let minDist = Infinity;
  for (const pt of gridPoints) {
    const d = Math.abs(pt.timeSec - bestTime);
    if (d < minDist) {
      minDist = d;
      nearestBeat = pt.timeSec;
    }
  }
  const deltaSec = bestTime - nearestBeat;
  return shiftTrackBeatGrid(track, deltaSec);
}

/**
 * Resets manual beat-grid phase offset and BPM edits back to auto-detected values.
 */
export function resetTrackBeatGridToAuto(track: DjTrackAsset): DjTrackAsset {
  const autoBpm = track.autoBpm ?? track.bpm;
  const autoAnchor =
    track.autoDownbeatAnchorSec ?? track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;
  const { beatTimes, downbeatTimes } = rebuildUniformBeatArrays(
    track.duration,
    autoBpm,
    autoAnchor
  );
  return {
    ...track,
    bpm: autoBpm,
    beatGridOffsetMs: 0,
    beatGridLocked: false,
    beatTimes,
    downbeatTimes,
  };
}

export interface BeatPhaseMetrics {
  effectiveBpm: number;
  beatPeriodRealSec: number;
  rawBeatPeriodSec: number;
  anchorSec: number;
  nearestBeatOffset: number; // [-0.5, +0.5] fractional beat relative to nearest beat
  phaseMs: number;
  barNumber: number;
  beatInBar: 1 | 2 | 3 | 4;
}

export function computeBeatPhaseMetrics(
  track: DjTrackAsset,
  playheadSec: number,
  playbackRate = 1
): BeatPhaseMetrics {
  const safeRate = Math.max(0.5, Math.min(2, playbackRate));
  const rawBpm = getEffectiveBpm(track);
  const effectiveBpm = rawBpm * safeRate;
  const rawBeatPeriodSec = 60 / Math.max(40, rawBpm);
  const beatPeriodRealSec = 60 / Math.max(20, effectiveBpm);
  const anchorSec = track.downbeatTimes[0] ?? track.beatTimes[0] ?? 0;

  const beatFloat = (playheadSec - anchorSec) / rawBeatPeriodSec;
  const nearestBeatIdx = Math.round(beatFloat);
  const nearestBeatOffset = beatFloat - nearestBeatIdx;
  const phaseMs = nearestBeatOffset * beatPeriodRealSec * 1000;

  const kStart = Math.ceil((-0.0005 - anchorSec) / rawBeatPeriodSec);
  const floorBeatIdx = Math.floor(beatFloat + 0.0005);
  const mod4 = ((floorBeatIdx % 4) + 4) % 4;
  const barNumber = Math.max(1, Math.floor((floorBeatIdx - kStart) / 4) + 1);

  return {
    effectiveBpm,
    beatPeriodRealSec,
    rawBeatPeriodSec,
    anchorSec,
    nearestBeatOffset,
    phaseMs,
    barNumber,
    beatInBar: (mod4 + 1) as 1 | 2 | 3 | 4,
  };
}

export interface BeatMatchPhaseComparison {
  phaseA: BeatPhaseMetrics;
  phaseB: BeatPhaseMetrics;
  bpmA: number;
  bpmB: number;
  bpmDelta: number;
  beatPhaseDelta: number; // [-0.5, +0.5) B relative to A
  phaseOffsetMs: number;
  status: 'locked' | 'drifting' | 'misaligned';
  correctionSecForB: number;
}

export function computeBeatMatchPhaseComparison(
  deckA: DjTrackAsset,
  timeA: number,
  rateA: number,
  deckB: DjTrackAsset,
  timeB: number,
  rateB: number
): BeatMatchPhaseComparison {
  const phaseA = computeBeatPhaseMetrics(deckA, timeA, rateA);
  const phaseB = computeBeatPhaseMetrics(deckB, timeB, rateB);

  const rawDelta = phaseB.nearestBeatOffset - phaseA.nearestBeatOffset;
  const beatPhaseDelta = (((rawDelta + 0.5) % 1) + 1) % 1 - 0.5;
  const phaseOffsetMs = beatPhaseDelta * phaseA.beatPeriodRealSec * 1000;
  const absMs = Math.abs(phaseOffsetMs);

  const status: BeatMatchPhaseComparison['status'] =
    absMs <= 10 ? 'locked' : absMs <= 32 ? 'drifting' : 'misaligned';

  return {
    phaseA,
    phaseB,
    bpmA: phaseA.effectiveBpm,
    bpmB: phaseB.effectiveBpm,
    bpmDelta: phaseB.effectiveBpm - phaseA.effectiveBpm,
    beatPhaseDelta,
    phaseOffsetMs,
    status,
    correctionSecForB: -beatPhaseDelta * phaseB.rawBeatPeriodSec,
  };
}

/**
 * Extracts high-resolution tri-band spectral peaks over a zoomed time window
 * [startSec, endSec] so zoomed beat-grid waveforms clearly reveal transients.
 */
export function extractTriBandWindowPeaks(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  bars = 128
): DjTriBandPeaks {
  const low = new Array<number>(bars).fill(0);
  const mid = new Array<number>(bars).fill(0);
  const high = new Array<number>(bars).fill(0);
  const overall = new Array<number>(bars).fill(0);

  const sr = Math.max(8000, buffer.sampleRate);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const totalSamples = ch0.length;
  const winSpan = Math.max(0.05, endSec - startSec);

  const alphaLow = Math.min(0.99, (2 * Math.PI * 240) / sr);
  const alphaHigh = Math.min(0.99, (2 * Math.PI * 2600) / sr);

  let lpState = 0;
  let hpLpState = 0;
  let maxLow = 0.001;
  let maxMid = 0.001;
  let maxHigh = 0.001;
  let maxAll = 0.001;

  for (let b = 0; b < bars; b++) {
    const t0 = startSec + (b / bars) * winSpan;
    const t1 = startSec + ((b + 1) / bars) * winSpan;
    const s0 = Math.floor(t0 * sr);
    const s1 = Math.floor(t1 * sr);

    if (s1 <= 0 || s0 >= totalSamples) {
      continue;
    }

    const clampedStart = Math.max(0, s0);
    const clampedEnd = Math.min(totalSamples, Math.max(clampedStart + 1, s1));
    const blockLen = clampedEnd - clampedStart;
    const step = Math.max(1, Math.floor(blockLen / 48));

    let sumLow = 0;
    let sumMid = 0;
    let sumHigh = 0;
    let peakAll = 0;
    let count = 0;

    for (let i = clampedStart; i < clampedEnd; i += step) {
      const s = ch1 ? 0.5 * (ch0[i] + ch1[i]) : ch0[i];
      const absS = Math.abs(s);
      if (absS > peakAll) peakAll = absS;

      lpState += alphaLow * (s - lpState);
      hpLpState += alphaHigh * (s - hpLpState);

      const lowSample = lpState;
      const highSample = s - hpLpState;
      const midSample = hpLpState - lpState;

      sumLow += lowSample * lowSample;
      sumMid += midSample * midSample;
      sumHigh += highSample * highSample;
      count++;
    }

    const rmsLow = count > 0 ? Math.sqrt(sumLow / count) : 0;
    const rmsMid = count > 0 ? Math.sqrt(sumMid / count) : 0;
    const rmsHigh = count > 0 ? Math.sqrt(sumHigh / count) : 0;

    low[b] = rmsLow;
    mid[b] = rmsMid;
    high[b] = rmsHigh;
    overall[b] = peakAll;

    if (rmsLow > maxLow) maxLow = rmsLow;
    if (rmsMid > maxMid) maxMid = rmsMid;
    if (rmsHigh > maxHigh) maxHigh = rmsHigh;
    if (peakAll > maxAll) maxAll = peakAll;
  }

  for (let b = 0; b < bars; b++) {
    low[b] = Math.min(1, low[b] / maxLow);
    mid[b] = Math.min(1, mid[b] / maxMid);
    high[b] = Math.min(1, high[b] / maxHigh);
    overall[b] = Math.min(1, overall[b] / maxAll);
  }

  return { low, mid, high, overall };
}

/**
 * Generates two distinct musical DJ demo tracks with contrasting tempos (124 & 128 BPM)
 * and synced lyric cues so users can test Beat-Mix & Lyric-Mix immediately.
 */
export async function generateDjDemoPair(
  audioCtx: AudioContext
): Promise<{ deckA: DjTrackAsset; deckB: DjTrackAsset }> {
  const demoA = await generateDemoBeat();
  URL.revokeObjectURL(demoA.blobUrl);

  // Synthesize contrasting Deck B at 128 BPM with melodic bass + arps + riser
  const durationB = 28;
  const sampleRate = audioCtx.sampleRate || 44100;
  const lengthB = Math.floor(durationB * sampleRate);
  const bufferB = audioCtx.createBuffer(2, lengthB, sampleRate);
  const left = bufferB.getChannelData(0);
  const right = bufferB.getChannelData(1);

  const bpmB = 128;
  const beatSecB = 60 / bpmB;
  const bassNotes = [55.0, 55.0, 65.41, 73.42, 61.74, 61.74, 73.42, 82.41];
  const arpNotes = [220, 261.63, 329.63, 440, 329.63, 261.63, 392, 493.88];

  for (let i = 0; i < lengthB; i++) {
    const t = i / sampleRate;
    const beatPos = t / beatSecB;
    const beatIndex = Math.floor(beatPos);
    const beatFrac = beatPos - beatIndex;
    const barIndex = Math.floor(beatIndex / 4);

    // Punchy 4-on-the-floor kick
    const kickEnv = Math.exp(-beatFrac * 10.5);
    const kickFreq = 46 + 110 * Math.exp(-beatFrac * 24);
    const kick = Math.sin(2 * Math.PI * kickFreq * beatFrac * beatSecB) * kickEnv * 0.65;

    // Offbeat hi-hat & clap on 2 & 4
    const offFrac = (beatPos + 0.5) % 1;
    const hatNoise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const hat = hatNoise * Math.exp(-offFrac * 22) * 0.14;
    const clap =
      beatIndex % 2 === 1 ? hatNoise * Math.exp(-beatFrac * 18) * 0.22 : 0;

    // Driving offbeat bassline
    const bassFreq = bassNotes[barIndex % bassNotes.length];
    const duck = 0.28 + 0.72 * Math.min(1, beatFrac * 2.6);
    const bass =
      (Math.sin(2 * Math.PI * bassFreq * t) * 0.65 +
        Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.22) *
      duck *
      0.34;

    // Shimmering synth arp (16th notes)
    const sixteenthIdx = Math.floor(beatPos * 4);
    const sixteenthFrac = (beatPos * 4) % 1;
    const arpFreq = arpNotes[sixteenthIdx % arpNotes.length];
    const arpGate = barIndex >= 1 ? 1 : 0.35;
    const arp =
      Math.sin(2 * Math.PI * arpFreq * t) *
      Math.exp(-sixteenthFrac * 6.5) *
      0.16 *
      arpGate;

    // Smooth energy build into drop at beat 16 (bar 4)
    const dropBoost = barIndex >= 4 ? 1.0 : 0.72;
    const fadeOut = t > durationB - 1.2 ? Math.max(0, (durationB - t) / 1.2) : 1;
    const mono = (kick + hat + clap + bass + arp) * dropBoost * fadeOut;
    const stereoArp = Math.sin(t * 2.1) * arp * 0.35;

    left[i] = Math.max(-0.96, Math.min(0.96, mono - stereoArp));
    right[i] = Math.max(-0.96, Math.min(0.96, mono + stereoArp));
  }

  const lyricsB: LyricLine[] = [
    { id: createLyricId(), time: Number((beatSecB * 2).toFixed(2)), text: 'Feel the skyline rising in the midnight glow' },
    { id: createLyricId(), time: Number((beatSecB * 8).toFixed(2)), text: 'Lock the tempo steady, let the bassline flow' },
    { id: createLyricId(), time: Number((beatSecB * 16).toFixed(2)), text: 'Drop into the strobe light, hands up to the sky' },
    { id: createLyricId(), time: Number((beatSecB * 24).toFixed(2)), text: 'Echoes in the laser beam, never say goodbye' },
    { id: createLyricId(), time: Number((beatSecB * 32).toFixed(2)), text: 'Every beat collides inside the neon tide' },
    { id: createLyricId(), time: Number((beatSecB * 40).toFixed(2)), text: 'Ride the synth horizon till the morning light' },
  ];

  const deckA = analyzeDjTrackFromBuffer(demoA.audioBuffer, demoA.fileName, {
    title: demoA.trackTitle,
    artist: demoA.artistName,
    lyrics: demoA.lyrics,
  });
  const deckB = analyzeDjTrackFromBuffer(bufferB, 'midnight-skyline-128bpm.wav', {
    title: 'Midnight Skyline',
    artist: 'Club Echo',
    lyrics: lyricsB,
  });

  return { deckA, deckB };
}

/**
 * Picks creative automatic Mix-Out (Deck A) and Mix-In (Deck B) lyric cue IDs
 * so vocals hand off naturally without talking over one another.
 */
export function findBestLyricHandoffPair(
  deckA: DjTrackAsset,
  deckB: DjTrackAsset
): {
  outLyricId: string | null;
  inLyricId: string | null;
  outTime: number;
  inTime: number;
} {
  let outLyric: LyricLine | null = null;
  if (deckA.lyrics.length > 0) {
    // Prefer a lyric in the last 45% of Deck A that leaves at least 3.5s before track end
    const candidatesA = deckA.lyrics.filter(
      (l) => l.time >= deckA.duration * 0.45 && l.time <= Math.max(deckA.duration * 0.5, deckA.duration - 2.5)
    );
    outLyric =
      candidatesA[candidatesA.length - 1] ??
      deckA.lyrics[Math.max(0, deckA.lyrics.length - 2)] ??
      deckA.lyrics[0];
  }

  let inLyric: LyricLine | null = null;
  if (deckB.lyrics.length > 0) {
    // Prefer the first chorus/hook line inside the first 40% of Deck B
    inLyric =
      deckB.lyrics.find((l) => l.time >= 0.4 && l.time <= deckB.duration * 0.4) ??
      deckB.lyrics[0];
  }

  return {
    outLyricId: outLyric?.id ?? null,
    inLyricId: inLyric?.id ?? null,
    outTime: outLyric ? outLyric.time : deckA.recommendedOutTime,
    inTime: inLyric ? inLyric.time : 0,
  };
}

export interface DjTransitionPlan {
  triggerMode: DjMixTriggerMode;
  transitionStyle: DjTransitionStyle;
  videoMixStyle: DjVideoMixStyle;
  crossfadeBeats: 4 | 8 | 16 | 32;
  beatMatchTempo: boolean;
  alignPhaseToBeat: boolean;
  deckAOutTime: number;
  deckBInTime: number;
  deckAOutLyricText: string | null;
  deckBInLyricText: string | null;
  deckBPlaybackRate: number;
  targetBpm: number;
  overlapDurationSec: number;
  deckBTimelineStartSec: number;
  deckAEndSec: number;
  deckBTimelineDurationSec: number;
  totalDurationSec: number;
  transitionStartSec: number;
  transitionEndSec: number;
  mergedLyrics: LyricLine[];
}

export interface DjMultiTrackSegment {
  track: DjTrackAsset;
  timelineStartSec: number;
  sourceOffsetSec: number;
  sourcePlayDurationSec: number;
  playbackRate: number;
  targetBpm: number;
  fadeInSec: number;
  fadeOutSec: number;
  transitionInStyle: DjTransitionStyle;
  transitionOutStyle: DjTransitionStyle;
  inCueTime: number;
  outCueTime: number;
  cueReason: string;
}

export interface DjScheduleRenderPlan {
  segments: DjMultiTrackSegment[];
  totalDurationSec: number;
  mergedLyrics: LyricLine[];
  videoMixStyle: DjVideoMixStyle;
  videoBlendMode?: MixVideoBlendMode;
  videoLayerOpacity?: number;
  beatTimesTimeline: number[];
}

/**
 * Computes an exact DJ Mix Transition Plan between Deck A and Deck B using either
 * Beat Grid phase alignment OR Lyric Cue handoff timing.
 */
export function buildDualDeckMixPlan(
  deckA: DjTrackAsset,
  deckB: DjTrackAsset,
  options: {
    triggerMode: DjMixTriggerMode;
    transitionStyle: DjTransitionStyle;
    videoMixStyle: DjVideoMixStyle;
    crossfadeBeats: 4 | 8 | 16 | 32;
    beatMatchTempo: boolean;
    alignPhaseToBeat: boolean;
    customOutTimeA?: number | null;
    customInTimeB?: number | null;
    outLyricIdA?: string | null;
    inLyricIdB?: string | null;
  }
): DjTransitionPlan {
  const bpmA = getEffectiveBpm(deckA);
  const bpmB = getEffectiveBpm(deckB);
  const targetBpm = bpmA;
  const deckBPlaybackRate = options.beatMatchTempo
    ? Math.max(0.72, Math.min(1.38, bpmA / Math.max(40, bpmB)))
    : 1;

  const beatSecA = 60 / Math.max(40, bpmA);
  const requestedBeats = options.transitionStyle === 'beat-drop' ? 4 : options.crossfadeBeats;
  const rawOverlapSec = requestedBeats * beatSecA;

  // Determine Mix-Out point on Deck A and Mix-In point on Deck B
  let outTimeA = options.customOutTimeA ?? deckA.recommendedOutTime;
  let inTimeB = options.customInTimeB ?? 0;
  let outLyricText: string | null = null;
  let inLyricText: string | null = null;

  if (options.triggerMode === 'lyrics') {
    const outLyric =
      (options.outLyricIdA
        ? deckA.lyrics.find((l) => l.id === options.outLyricIdA)
        : null) ?? null;
    const inLyric =
      (options.inLyricIdB
        ? deckB.lyrics.find((l) => l.id === options.inLyricIdB)
        : null) ?? null;

    if (outLyric) {
      outTimeA = outLyric.time;
      outLyricText = outLyric.text;
    } else if (deckA.lyrics.length > 0) {
      const auto = findBestLyricHandoffPair(deckA, deckB);
      outTimeA = auto.outTime;
      outLyricText =
        deckA.lyrics.find((l) => l.id === auto.outLyricId)?.text ?? null;
    }

    if (inLyric) {
      // Enter slightly before the chosen Deck B vocal cue (up to 4 beats) so the groove builds into the vocal!
      const preRollSource = Math.min(
        inLyric.time,
        (Math.min(4, requestedBeats * 0.5) * beatSecA) * deckBPlaybackRate
      );
      inTimeB = Math.max(0, inLyric.time - preRollSource);
      inLyricText = inLyric.text;
    }
  }

  // Snap transitions cleanly to nearest beat/downbeat when phase lock is active
  if (options.alignPhaseToBeat) {
    outTimeA = findNearestBeat(
      deckA.downbeatTimes.length > 0 ? deckA.downbeatTimes : deckA.beatTimes,
      outTimeA
    );
    inTimeB = findNearestBeat(
      deckB.downbeatTimes.length > 0 ? deckB.downbeatTimes : deckB.beatTimes,
      inTimeB
    );
  }

  outTimeA = Math.max(1.0, Math.min(deckA.duration - 0.5, outTimeA));
  inTimeB = Math.max(0, Math.min(deckB.duration - 1.5, inTimeB));

  const deckBRemainingSource = Math.max(1, deckB.duration - inTimeB);
  const deckBTimelineDuration = deckBRemainingSource / deckBPlaybackRate;

  const maxAllowedOverlap = Math.max(
    0.8,
    Math.min(rawOverlapSec, deckA.duration - 0.8, deckBTimelineDuration * 0.65)
  );

  // Transition happens starting at outTimeA and finishing overlapDurationSec later
  const transitionStartSec = Math.max(
    0.5,
    Math.min(outTimeA, deckA.duration - Math.min(maxAllowedOverlap, 1.5))
  );
  const overlapDurationSec = Math.min(
    maxAllowedOverlap,
    Math.max(0.8, deckA.duration - transitionStartSec)
  );

  const deckAEndSec = Math.min(deckA.duration, transitionStartSec + overlapDurationSec);
  const deckBTimelineStartSec = transitionStartSec;
  const totalDurationSec = deckBTimelineStartSec + deckBTimelineDuration;

  // Build merged timeline lyrics across Deck A -> Deck B transition
  const mergedLyrics: LyricLine[] = [];
  for (const line of deckA.lyrics) {
    if (line.time <= transitionStartSec + overlapDurationSec * 0.45) {
      mergedLyrics.push({
        id: createLyricId(),
        time: Number(line.time.toFixed(2)),
        text: line.text,
      });
    }
  }
  for (const line of deckB.lyrics) {
    if (line.time < inTimeB - 0.05) continue;
    const offsetInDeckB = (line.time - inTimeB) / deckBPlaybackRate;
    const timelineT = deckBTimelineStartSec + offsetInDeckB;
    if (timelineT >= transitionStartSec + overlapDurationSec * 0.2) {
      mergedLyrics.push({
        id: createLyricId(),
        time: Number(timelineT.toFixed(2)),
        text: line.text,
      });
    }
  }
  mergedLyrics.sort((a, b) => a.time - b.time);

  return {
    triggerMode: options.triggerMode,
    transitionStyle: options.transitionStyle,
    videoMixStyle: options.videoMixStyle,
    crossfadeBeats: options.crossfadeBeats,
    beatMatchTempo: options.beatMatchTempo,
    alignPhaseToBeat: options.alignPhaseToBeat,
    deckAOutTime: Number(outTimeA.toFixed(2)),
    deckBInTime: Number(inTimeB.toFixed(2)),
    deckAOutLyricText: outLyricText,
    deckBInLyricText: inLyricText,
    deckBPlaybackRate: Number(deckBPlaybackRate.toFixed(4)),
    targetBpm,
    overlapDurationSec: Number(overlapDurationSec.toFixed(2)),
    deckBTimelineStartSec: Number(deckBTimelineStartSec.toFixed(2)),
    deckAEndSec: Number(deckAEndSec.toFixed(2)),
    deckBTimelineDurationSec: Number(deckBTimelineDuration.toFixed(2)),
    totalDurationSec: Number(totalDurationSec.toFixed(2)),
    transitionStartSec: Number(transitionStartSec.toFixed(2)),
    transitionEndSec: Number((transitionStartSec + overlapDurationSec).toFixed(2)),
    mergedLyrics,
  };
}

export type DjBpmTimingPreset =
  | 'slam-4b'
  | 'phrase-8b'
  | 'smooth-16b'
  | 'club-32b'
  | 'align-drop';

export interface DjAutoCalculatedTiming {
  preset: DjBpmTimingPreset;
  crossfadeBeats: 4 | 8 | 16 | 32;
  transitionStyle: DjTransitionStyle;
  deckAOutTime: number;
  deckBInTime: number;
  targetBpm: number;
  beatDurationSec: number;
  overlapSec: number;
  deckBPlaybackRate: number;
  summary: string;
}

/**
 * Auto-calculates exact DJ transition timing (Mix-Out on Deck A, Mix-In on Deck B,
 * crossfade beat length, and recommended transition EQ/filter style) from detected BPMs.
 */
export function calculateBpmTransitionTiming(
  deckA: DjTrackAsset,
  deckB: DjTrackAsset,
  preset: DjBpmTimingPreset,
  currentBeats: 4 | 8 | 16 | 32 = 8
): DjAutoCalculatedTiming {
  const bpmA = getEffectiveBpm(deckA);
  const bpmB = getEffectiveBpm(deckB);
  const beatDurationSec = 60 / Math.max(40, bpmA);
  const deckBPlaybackRate = Math.max(0.72, Math.min(1.38, bpmA / Math.max(40, bpmB)));

  let crossfadeBeats: 4 | 8 | 16 | 32 = currentBeats;
  let transitionStyle: DjTransitionStyle = 'bass-swap';

  if (preset === 'slam-4b') {
    crossfadeBeats = 4;
    transitionStyle = 'beat-drop';
  } else if (preset === 'phrase-8b') {
    crossfadeBeats = 8;
    transitionStyle = 'bass-swap';
  } else if (preset === 'smooth-16b') {
    crossfadeBeats = 16;
    transitionStyle = 'bass-swap';
  } else if (preset === 'club-32b') {
    crossfadeBeats = 32;
    transitionStyle = 'filter-sweep';
  } else if (preset === 'align-drop') {
    crossfadeBeats = currentBeats;
    transitionStyle = 'bass-swap';
  }

  const desiredOverlapSec = Math.min(
    deckA.duration * 0.55,
    (deckB.duration / deckBPlaybackRate) * 0.55,
    crossfadeBeats * beatDurationSec
  );

  // Pick a clean Deck A Mix-Out downbeat leaving room for the full overlap before Deck A finishes
  const idealOutSec = Math.max(
    beatDurationSec * 4,
    deckA.duration - desiredOverlapSec - beatDurationSec * 2
  );
  const poolA = deckA.downbeatTimes.length > 0 ? deckA.downbeatTimes : deckA.beatTimes;
  let deckAOutTime = findNearestBeat(poolA, idealOutSec);
  deckAOutTime = Math.max(
    Math.min(deckA.duration - 1.2, 1.0),
    Math.min(deckA.duration - Math.max(1.2, desiredOverlapSec * 0.85), deckAOutTime)
  );
  deckAOutTime = Number(deckAOutTime.toFixed(2));

  // Pick Deck B Mix-In downbeat
  const poolB = deckB.downbeatTimes.length > 0 ? deckB.downbeatTimes : deckB.beatTimes;
  let deckBInTime = poolB[0] ?? 0;

  if (preset === 'align-drop') {
    // Enter exactly `crossfadeBeats` beats before Deck B's detected drop so the drop lands right at crossfade completion!
    const leadInSourceSec = desiredOverlapSec * deckBPlaybackRate;
    const rawIn = Math.max(0, deckB.dropTime - leadInSourceSec);
    deckBInTime = findNearestBeat(poolB, rawIn);
  } else if (preset === 'slam-4b') {
    // Slam straight into Deck B's first strong downbeat or drop-ready bar
    const earlyDrop = deckB.dropTime <= deckB.duration * 0.35 ? deckB.dropTime : (poolB[0] ?? 0);
    deckBInTime = findNearestBeat(poolB, earlyDrop);
  } else {
    // Enter on Deck B's opening downbeat (skipping silence if intro beat starts later)
    deckBInTime = findNearestBeat(poolB, Math.min(2.0, deckB.duration * 0.1));
  }
  deckBInTime = Number(Math.max(0, Math.min(deckB.duration - 1.5, deckBInTime)).toFixed(2));

  const actualOverlap = Number(
    Math.max(0.8, Math.min(desiredOverlapSec, deckA.duration - deckAOutTime)).toFixed(2)
  );

  const labelMap: Record<DjBpmTimingPreset, string> = {
    'slam-4b': '4-Beat Drop Slam',
    'phrase-8b': '8-Beat Phrase Blend',
    'smooth-16b': '16-Beat Smooth Mix',
    'club-32b': '32-Beat Club Journey',
    'align-drop': 'Drop-Aligned Sync',
  };

  return {
    preset,
    crossfadeBeats,
    transitionStyle,
    deckAOutTime,
    deckBInTime,
    targetBpm: bpmA,
    beatDurationSec: Number(beatDurationSec.toFixed(3)),
    overlapSec: actualOverlap,
    deckBPlaybackRate: Number(deckBPlaybackRate.toFixed(4)),
    summary: `${labelMap[preset]}: Out ${deckAOutTime.toFixed(1)}s -> In ${deckBInTime.toFixed(1)}s (${crossfadeBeats} beats · ${actualOverlap.toFixed(2)}s @ ${bpmA} BPM)`,
  };
}

/**
 * Converts a 2-deck plan or a multi-track crate queue into a unified render schedule.
 */
export function buildScheduleFromDualPlan(
  deckA: DjTrackAsset,
  deckB: DjTrackAsset,
  plan: DjTransitionPlan,
  videoLayer?: {
    videoBlendMode?: MixVideoBlendMode;
    videoLayerOpacity?: number;
  }
): DjScheduleRenderPlan {
  const segA: DjMultiTrackSegment = {
    track: deckA,
    timelineStartSec: 0,
    sourceOffsetSec: 0,
    sourcePlayDurationSec: plan.deckAEndSec,
    playbackRate: 1,
    targetBpm: getEffectiveBpm(deckA),
    fadeInSec: 0,
    fadeOutSec: plan.overlapDurationSec,
    transitionInStyle: plan.transitionStyle,
    transitionOutStyle: plan.transitionStyle,
    inCueTime: 0,
    outCueTime: plan.deckAOutTime,
    cueReason:
      plan.triggerMode === 'lyrics' && plan.deckAOutLyricText
        ? `Lyric Out: "${plan.deckAOutLyricText}"`
        : `Beat Out @ ${plan.deckAOutTime.toFixed(1)}s`,
  };

  const segB: DjMultiTrackSegment = {
    track: deckB,
    timelineStartSec: plan.deckBTimelineStartSec,
    sourceOffsetSec: plan.deckBInTime,
    sourcePlayDurationSec: Math.max(0.5, deckB.duration - plan.deckBInTime),
    playbackRate: plan.deckBPlaybackRate,
    targetBpm: plan.targetBpm,
    fadeInSec: plan.overlapDurationSec,
    fadeOutSec: 0.4,
    transitionInStyle: plan.transitionStyle,
    transitionOutStyle: plan.transitionStyle,
    inCueTime: plan.deckBInTime,
    outCueTime: deckB.duration,
    cueReason:
      plan.triggerMode === 'lyrics' && plan.deckBInLyricText
        ? `Lyric In: "${plan.deckBInLyricText}"`
        : `Beat Sync (${plan.targetBpm} BPM)`,
  };

  const beatTimesTimeline: number[] = [];
  for (const bt of deckA.beatTimes) {
    if (bt <= plan.transitionStartSec + plan.overlapDurationSec * 0.5) {
      beatTimesTimeline.push(bt);
    }
  }
  for (const bt of deckB.beatTimes) {
    if (bt < plan.deckBInTime) continue;
    const t = plan.deckBTimelineStartSec + (bt - plan.deckBInTime) / plan.deckBPlaybackRate;
    if (t > plan.transitionStartSec + plan.overlapDurationSec * 0.5) {
      beatTimesTimeline.push(Number(t.toFixed(3)));
    }
  }

  return {
    segments: [segA, segB],
    totalDurationSec: plan.totalDurationSec,
    mergedLyrics: plan.mergedLyrics,
    videoMixStyle: plan.videoMixStyle,
    videoBlendMode: videoLayer?.videoBlendMode ?? 'normal',
    videoLayerOpacity: videoLayer?.videoLayerOpacity ?? 1,
    beatTimesTimeline,
  };
}

export function buildCrateSetSchedule(
  tracks: DjTrackAsset[],
  options: {
    triggerMode: DjMixTriggerMode;
    transitionStyle: DjTransitionStyle;
    videoMixStyle: DjVideoMixStyle;
    videoBlendMode?: MixVideoBlendMode;
    videoLayerOpacity?: number;
    crossfadeBeats: 4 | 8 | 16 | 32;
    beatMatchTempo: boolean;
  }
): DjScheduleRenderPlan {
  if (tracks.length === 0) {
    return {
      segments: [],
      totalDurationSec: 0,
      mergedLyrics: [],
      videoMixStyle: options.videoMixStyle,
      videoBlendMode: options.videoBlendMode ?? 'normal',
      videoLayerOpacity: options.videoLayerOpacity ?? 1,
      beatTimesTimeline: [],
    };
  }
  if (tracks.length === 1) {
    const t = tracks[0];
    return {
      segments: [
        {
          track: t,
          timelineStartSec: 0,
          sourceOffsetSec: 0,
          sourcePlayDurationSec: t.duration,
          playbackRate: 1,
          targetBpm: getEffectiveBpm(t),
          fadeInSec: 0,
          fadeOutSec: 0.4,
          transitionInStyle: options.transitionStyle,
          transitionOutStyle: options.transitionStyle,
          inCueTime: 0,
          outCueTime: t.duration,
          cueReason: 'Solo Set Track',
        },
      ],
      totalDurationSec: t.duration,
      mergedLyrics: [...t.lyrics],
      videoMixStyle: options.videoMixStyle,
      videoBlendMode: options.videoBlendMode ?? 'normal',
      videoLayerOpacity: options.videoLayerOpacity ?? 1,
      beatTimesTimeline: [...t.beatTimes],
    };
  }

  const masterBpm = getEffectiveBpm(tracks[0]);
  const segments: DjMultiTrackSegment[] = [];
  const mergedLyrics: LyricLine[] = [];
  const beatTimesTimeline: number[] = [];

  let cursorTimeline = 0;

  for (let idx = 0; idx < tracks.length; idx++) {
    const tr = tracks[idx];
    const trBpm = getEffectiveBpm(tr);
    const rate = options.beatMatchTempo
      ? Math.max(0.75, Math.min(1.35, masterBpm / Math.max(40, trBpm)))
      : 1;
    const prevTrack = idx > 0 ? tracks[idx - 1] : null;
    const handoff = prevTrack
      ? findBestLyricHandoffPair(prevTrack, tr)
      : { outTime: tr.recommendedOutTime, inTime: 0, outLyricId: null, inLyricId: null };

    const inSource =
      idx === 0
        ? 0
        : options.triggerMode === 'lyrics' && tr.lyrics.length > 0
          ? findNearestBeat(tr.beatTimes, Math.max(0, handoff.inTime - 1.5))
          : findNearestBeat(tr.downbeatTimes, 0);

    const outSource =
      idx === tracks.length - 1
        ? tr.duration
        : options.triggerMode === 'lyrics' && tr.lyrics.length > 0
          ? findNearestBeat(
              tr.beatTimes,
              tr.lyrics[Math.max(0, tr.lyrics.length - 1)].time
            )
          : tr.recommendedOutTime;

    const beatSec = 60 / Math.max(40, options.beatMatchTempo ? masterBpm : trBpm);
    const fadeSec = Math.min(
      options.crossfadeBeats * beatSec,
      Math.max(1.2, (outSource - inSource) / rate * 0.4)
    );

    const playSourceDur = Math.max(1.2, outSource - inSource + (idx < tracks.length - 1 ? fadeSec * rate : 0));
    const clampedPlaySourceDur = Math.min(tr.duration - inSource, playSourceDur);
    const timelineDur = clampedPlaySourceDur / rate;

    const seg: DjMultiTrackSegment = {
      track: tr,
      timelineStartSec: Number(cursorTimeline.toFixed(2)),
      sourceOffsetSec: Number(inSource.toFixed(2)),
      sourcePlayDurationSec: Number(clampedPlaySourceDur.toFixed(2)),
      playbackRate: Number(rate.toFixed(4)),
      targetBpm: options.beatMatchTempo ? masterBpm : trBpm,
      fadeInSec: idx === 0 ? 0 : Number(fadeSec.toFixed(2)),
      fadeOutSec: idx === tracks.length - 1 ? 0.4 : Number(fadeSec.toFixed(2)),
      transitionInStyle: options.transitionStyle,
      transitionOutStyle: options.transitionStyle,
      inCueTime: inSource,
      outCueTime: outSource,
      cueReason:
        idx === 0
          ? `Lead Deck (${trBpm} BPM)`
          : options.triggerMode === 'lyrics'
            ? `Lyric Cue Sync`
            : `Beat Sync @ ${options.beatMatchTempo ? masterBpm : trBpm} BPM`,
    };
    segments.push(seg);

    for (const line of tr.lyrics) {
      if (line.time < inSource || line.time > inSource + clampedPlaySourceDur) continue;
      const t = cursorTimeline + (line.time - inSource) / rate;
      mergedLyrics.push({
        id: createLyricId(),
        time: Number(t.toFixed(2)),
        text: line.text,
      });
    }

    for (const bt of tr.beatTimes) {
      if (bt < inSource || bt > inSource + clampedPlaySourceDur) continue;
      beatTimesTimeline.push(Number((cursorTimeline + (bt - inSource) / rate).toFixed(3)));
    }

    if (idx < tracks.length - 1) {
      cursorTimeline = Math.max(0, cursorTimeline + timelineDur - fadeSec);
    } else {
      cursorTimeline += timelineDur;
    }
  }

  mergedLyrics.sort((a, b) => a.time - b.time);

  return {
    segments,
    totalDurationSec: Number(Math.max(1, cursorTimeline).toFixed(2)),
    mergedLyrics,
    videoMixStyle: options.videoMixStyle,
    videoBlendMode: options.videoBlendMode ?? 'normal',
    videoLayerOpacity: options.videoLayerOpacity ?? 1,
    beatTimesTimeline,
  };
}

/**
 * Renders the complete DJ Mix offline using Web Audio BiquadFilters (EQ Bass Swap & Sweep)
 * and tempo-matched playbackRate buffers into a crisp stereo AudioBuffer + WAV blob.
 */
export function scanAudioBufferPeakLinear(buffer: AudioBuffer | null | undefined): number {
  if (!buffer) return 0;
  let peak = 0;
  const step = Math.max(1, Math.floor(buffer.length / 120000));
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += step) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export function createBrickWallClipperCurve(
  ceilingLinear: number,
  samples = 8192
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const safeCeiling = Math.max(0.2, Math.min(0.995, ceilingLinear));
  const kneeStart = safeCeiling * 0.92;
  const kneeSpan = Math.max(0.005, safeCeiling - kneeStart);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const ax = Math.abs(x);
    if (ax <= kneeStart) {
      curve[i] = x;
    } else {
      const excess = (ax - kneeStart) / kneeSpan;
      const shaped = kneeStart + kneeSpan * Math.tanh(excess);
      curve[i] = Math.sign(x) * Math.min(safeCeiling, shaped);
    }
  }
  return curve;
}

export async function renderOfflineDjSchedule(
  schedule: DjScheduleRenderPlan,
  options: {
    normalize?: boolean;
    sampleRate?: number;
    limiterEnabled?: boolean;
    limiterCeilingDb?: number;
    autoGainFromPeak?: boolean;
  } = {}
): Promise<{
  audioBuffer: AudioBuffer;
  wavBlob: Blob;
  duration: number;
  waveformPeaks: number[];
  peakBeforeLimitDb: number;
  appliedAutoGainDb: number;
  peakAfterLimitDb: number;
}> {
  if (schedule.segments.length === 0) {
    throw new Error('Load tracks into Deck A & Deck B before rendering a DJ mix.');
  }

  const totalDuration = Math.max(0.5, schedule.totalDurationSec);
  const sampleRate =
    options.sampleRate || schedule.segments[0].track.audioBuffer.sampleRate || 44100;
  const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) {
    throw new Error('OfflineAudioContext is not supported in this browser.');
  }

  const limiterEnabled = options.limiterEnabled !== false;
  const ceilingDb = Math.max(-6, Math.min(-0.1, options.limiterCeilingDb ?? -0.3));
  const ceilingLinear = Math.pow(10, ceilingDb / 20);
  const autoGainFromPeak = options.autoGainFromPeak !== false;

  const offlineCtx = new OfflineCtx(2, totalSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(1, 0);

  if (limiterEnabled) {
    const offlineLimiter = offlineCtx.createDynamicsCompressor();
    offlineLimiter.threshold.setValueAtTime(Math.max(-24, ceilingDb - 0.6), 0);
    offlineLimiter.knee.setValueAtTime(0, 0);
    offlineLimiter.ratio.setValueAtTime(20, 0);
    offlineLimiter.attack.setValueAtTime(0.001, 0);
    offlineLimiter.release.setValueAtTime(0.08, 0);

    const offlineClipper = offlineCtx.createWaveShaper();
    offlineClipper.oversample = '4x';
    offlineClipper.curve = createBrickWallClipperCurve(ceilingLinear);

    masterGain.connect(offlineLimiter);
    offlineLimiter.connect(offlineClipper);
    offlineClipper.connect(offlineCtx.destination);
  } else {
    masterGain.connect(offlineCtx.destination);
  }

  for (let idx = 0; idx < schedule.segments.length; idx++) {
    const seg = schedule.segments[idx];
    const source = offlineCtx.createBufferSource();
    source.buffer = seg.track.audioBuffer;
    source.playbackRate.setValueAtTime(seg.playbackRate, 0);

    const lowEq = offlineCtx.createBiquadFilter();
    lowEq.type = 'lowshelf';
    lowEq.frequency.value = 230;
    lowEq.gain.value = 0;

    const sweepFilter = offlineCtx.createBiquadFilter();
    sweepFilter.type = 'allpass';
    sweepFilter.frequency.value = 1000;
    sweepFilter.Q.value = 1.6;

    const deckGain = offlineCtx.createGain();
    const startAt = Math.max(0, seg.timelineStartSec);
    const playRealDur = Math.max(0.1, seg.sourcePlayDurationSec / seg.playbackRate);
    const endAt = startAt + playRealDur;

    // Equal-power fade-in & style-aware EQ/Filter transitions
    const fadeIn = Math.max(0, Math.min(seg.fadeInSec, playRealDur * 0.48));
    const fadeOut = Math.max(0, Math.min(seg.fadeOutSec, playRealDur * 0.48));

    if (fadeIn > 0.05) {
      if (seg.transitionInStyle === 'beat-drop') {
        // Punchy beat drop: tease highs at half fade then full slam at midpoint
        const mid = startAt + fadeIn * 0.5;
        deckGain.gain.setValueAtTime(0.001, startAt);
        deckGain.gain.linearRampToValueAtTime(0.32, mid - 0.04);
        deckGain.gain.linearRampToValueAtTime(1.0, mid + 0.04);
        lowEq.gain.setValueAtTime(-16, startAt);
        lowEq.gain.setValueAtTime(-16, mid - 0.03);
        lowEq.gain.linearRampToValueAtTime(0, mid + 0.05);
      } else if (seg.transitionInStyle === 'filter-sweep') {
        sweepFilter.type = 'lowpass';
        sweepFilter.frequency.setValueAtTime(260, startAt);
        sweepFilter.frequency.exponentialRampToValueAtTime(18000, startAt + fadeIn);
        deckGain.gain.setValueAtTime(0.001, startAt);
        deckGain.gain.linearRampToValueAtTime(1.0, startAt + fadeIn);
      } else if (seg.transitionInStyle === 'stutter-cut') {
        // Rhythmic 1/4-beat gating chop on entry
        const steps = 6;
        const stepDur = fadeIn / steps;
        deckGain.gain.setValueAtTime(0.001, startAt);
        for (let s = 0; s < steps; s++) {
          const t0 = startAt + s * stepDur;
          deckGain.gain.setValueAtTime(s % 2 === 0 ? 0.92 : 0.14, t0);
        }
        deckGain.gain.setValueAtTime(1.0, startAt + fadeIn);
      } else {
        // bass-swap & echo-out smooth equal-power entry with bass entering at midpoint
        const mid = startAt + fadeIn * 0.52;
        deckGain.gain.setValueAtTime(0.001, startAt);
        deckGain.gain.linearRampToValueAtTime(0.75, mid);
        deckGain.gain.linearRampToValueAtTime(1.0, startAt + fadeIn);
        if (seg.transitionInStyle === 'bass-swap') {
          lowEq.gain.setValueAtTime(-15, startAt);
          lowEq.gain.setValueAtTime(-12, mid - 0.05);
          lowEq.gain.linearRampToValueAtTime(0, mid + 0.2);
        }
      }
    } else {
      deckGain.gain.setValueAtTime(1.0, startAt);
    }

    if (fadeOut > 0.05) {
      const fadeOutStart = Math.max(startAt + fadeIn, endAt - fadeOut);
      const midOut = fadeOutStart + fadeOut * 0.5;
      if (seg.transitionOutStyle === 'filter-sweep') {
        sweepFilter.type = 'highpass';
        sweepFilter.frequency.setValueAtTime(30, fadeOutStart);
        sweepFilter.frequency.exponentialRampToValueAtTime(3400, endAt);
      } else if (seg.transitionOutStyle === 'bass-swap') {
        lowEq.gain.setValueAtTime(0, fadeOutStart);
        lowEq.gain.linearRampToValueAtTime(-16, midOut);
      }
      deckGain.gain.setValueAtTime(1.0, fadeOutStart);
      deckGain.gain.linearRampToValueAtTime(0.68, midOut);
      deckGain.gain.linearRampToValueAtTime(0.0001, endAt);
    } else {
      deckGain.gain.setValueAtTime(1.0, Math.max(startAt, endAt - 0.05));
      deckGain.gain.linearRampToValueAtTime(0.0001, endAt);
    }

    source.connect(lowEq);
    lowEq.connect(sweepFilter);
    sweepFilter.connect(deckGain);
    deckGain.connect(masterGain);

    source.start(startAt, seg.sourceOffsetSec, seg.sourcePlayDurationSec);
  }

  const rendered = await offlineCtx.startRendering();

  let rawPeak = 0;
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > rawPeak) rawPeak = a;
    }
  }
  const peakBeforeLimitDb =
    rawPeak > 0.00001 ? 20 * Math.log10(rawPeak) : -60;

  let appliedScale = 1;
  if (rawPeak > 0.0001) {
    if (autoGainFromPeak || options.normalize) {
      if (rawPeak > ceilingLinear) {
        appliedScale = ceilingLinear / rawPeak;
      } else if (rawPeak < ceilingLinear * 0.78) {
        appliedScale = Math.min(1.65, ceilingLinear / rawPeak);
      }
    } else if (limiterEnabled && rawPeak > ceilingLinear) {
      appliedScale = ceilingLinear / rawPeak;
    }
  }

  const kneeStart = ceilingLinear * 0.92;
  const kneeSpan = Math.max(0.005, ceilingLinear - kneeStart);
  let postPeak = 0;

  if (Math.abs(appliedScale - 1) > 0.002 || (limiterEnabled && rawPeak > ceilingLinear)) {
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        let s = data[i] * appliedScale;
        if (limiterEnabled) {
          const ax = Math.abs(s);
          if (ax > kneeStart) {
            const shaped = kneeStart + kneeSpan * Math.tanh((ax - kneeStart) / kneeSpan);
            s = Math.sign(s) * Math.min(ceilingLinear, shaped);
          }
        }
        data[i] = s;
        const ap = Math.abs(s);
        if (ap > postPeak) postPeak = ap;
      }
    }
  } else {
    postPeak = rawPeak;
  }

  const appliedAutoGainDb = 20 * Math.log10(Math.max(0.001, appliedScale));
  const peakAfterLimitDb =
    postPeak > 0.00001 ? 20 * Math.log10(postPeak) : -60;

  const wavBlob = audioBufferToWavBlob(rendered);
  const waveformPeaks = extractWaveformPeaks(rendered, 200);
  return {
    audioBuffer: rendered,
    wavBlob,
    duration: rendered.duration,
    waveformPeaks,
    peakBeforeLimitDb,
    appliedAutoGainDb,
    peakAfterLimitDb,
  };
}

export interface DjTransitionPreviewRender {
  id: string;
  suggestionId: string;
  label: string;
  plan: DjTransitionPlan;
  audioBuffer: AudioBuffer;
  previewStartSec: number;
  previewEndSec: number;
  durationSec: number;
  triBandPeaks: DjTriBandPeaks;
  transitionStyle: DjTransitionStyle;
  crossfadeBeats: 4 | 8 | 16 | 32;
  deckAOutSec: number;
  deckBInSec: number;
  deckBDropSec: number;
}

interface AutomationKeyframe {
  t: number;
  v: number;
  curve?: 'linear' | 'exp' | 'step';
}

function scheduleSlicedAutomation(
  param: AudioParam,
  keyframes: AutomationKeyframe[],
  winStart: number,
  winEnd: number
): void {
  if (keyframes.length === 0 || winEnd <= winStart) return;
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);

  const evalAt = (t: number): number => {
    if (t <= sorted[0].t) return sorted[0].v;
    const last = sorted[sorted.length - 1];
    if (t >= last.t) return last.v;
    for (let i = 1; i < sorted.length; i++) {
      const k0 = sorted[i - 1];
      const k1 = sorted[i];
      if (t <= k1.t) {
        if (k1.curve === 'step' || k1.t <= k0.t) return k0.v;
        const frac = Math.max(0, Math.min(1, (t - k0.t) / (k1.t - k0.t)));
        if (k1.curve === 'exp' && k0.v > 0 && k1.v > 0) {
          return k0.v * Math.pow(k1.v / k0.v, frac);
        }
        return k0.v + (k1.v - k0.v) * frac;
      }
    }
    return last.v;
  };

  param.setValueAtTime(evalAt(winStart), 0);
  const localDur = Math.max(0.01, winEnd - winStart);

  for (let i = 0; i < sorted.length; i++) {
    const k = sorted[i];
    if (k.t <= winStart + 0.0005) continue;
    if (k.t >= winEnd - 0.0005) {
      const endVal = evalAt(winEnd);
      if (k.curve === 'step') {
        param.setValueAtTime(endVal, localDur);
      } else if (k.curve === 'exp') {
        param.exponentialRampToValueAtTime(Math.max(0.0001, endVal), localDur);
      } else {
        param.linearRampToValueAtTime(endVal, localDur);
      }
      return;
    }
    const tLocal = k.t - winStart;
    if (k.curve === 'step') {
      param.setValueAtTime(k.v, tLocal);
    } else if (k.curve === 'exp') {
      param.exponentialRampToValueAtTime(Math.max(0.0001, k.v), tLocal);
    } else {
      param.linearRampToValueAtTime(k.v, tLocal);
    }
  }
}

/**
 * Generates a fast 5-second offline preview render centered on a proposed Deck A -> Deck B
 * transition so users can audition & scrub inside the waveform area before committing.
 */
export async function renderTransitionPreview5s(
  deckA: DjTrackAsset,
  deckB: DjTrackAsset,
  proposal: {
    id: string;
    label: string;
    deckAOutSec: number;
    deckBInSec: number;
    deckBDropSec?: number;
    crossfadeBeats: 4 | 8 | 16 | 32;
    transitionStyle: DjTransitionStyle;
    videoMixStyle: DjVideoMixStyle;
    triggerMode?: DjMixTriggerMode;
    beatMatchTempo?: boolean;
    alignPhaseToBeat?: boolean;
  },
  options: {
    limiterEnabled?: boolean;
    limiterCeilingDb?: number;
    autoGainFromPeak?: boolean;
    windowSeconds?: number;
  } = {}
): Promise<DjTransitionPreviewRender> {
  const plan = buildDualDeckMixPlan(deckA, deckB, {
    triggerMode: proposal.triggerMode ?? 'beats',
    transitionStyle: proposal.transitionStyle,
    videoMixStyle: proposal.videoMixStyle,
    crossfadeBeats: proposal.crossfadeBeats,
    beatMatchTempo: proposal.beatMatchTempo ?? true,
    alignPhaseToBeat: proposal.alignPhaseToBeat ?? true,
    customOutTimeA: proposal.deckAOutSec,
    customInTimeB: proposal.deckBInSec,
  });

  const targetDur = Math.min(
    options.windowSeconds ?? 5.0,
    Math.max(1.2, plan.totalDurationSec)
  );
  const transitionMid = plan.transitionStartSec + plan.overlapDurationSec * 0.5;

  let previewStartSec: number;
  if (plan.overlapDurationSec <= targetDur * 0.72) {
    const leadPad = Math.min(2.0, (targetDur - plan.overlapDurationSec) * 0.45);
    previewStartSec = Math.max(0, plan.transitionStartSec - leadPad);
  } else {
    previewStartSec = Math.max(0, transitionMid - targetDur * 0.5);
  }
  if (previewStartSec + targetDur > plan.totalDurationSec) {
    previewStartSec = Math.max(0, plan.totalDurationSec - targetDur);
  }
  const previewEndSec = Math.min(plan.totalDurationSec, previewStartSec + targetDur);
  const actualDuration = Math.max(0.5, previewEndSec - previewStartSec);

  const sampleRate = deckA.audioBuffer.sampleRate || 44100;
  const totalSamples = Math.max(1, Math.ceil(actualDuration * sampleRate));

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) {
    throw new Error('OfflineAudioContext is not supported in this browser.');
  }

  const limiterEnabled = options.limiterEnabled !== false;
  const ceilingDb = Math.max(-6, Math.min(-0.1, options.limiterCeilingDb ?? -0.3));
  const ceilingLinear = Math.pow(10, ceilingDb / 20);

  const offlineCtx = new OfflineCtx(2, totalSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0.001, 0);
  masterGain.gain.linearRampToValueAtTime(1.0, Math.min(0.03, actualDuration * 0.1));
  if (actualDuration > 0.08) {
    masterGain.gain.setValueAtTime(1.0, actualDuration - 0.035);
    masterGain.gain.linearRampToValueAtTime(0.001, actualDuration);
  }

  if (limiterEnabled) {
    const offlineLimiter = offlineCtx.createDynamicsCompressor();
    offlineLimiter.threshold.setValueAtTime(Math.max(-24, ceilingDb - 0.6), 0);
    offlineLimiter.knee.setValueAtTime(0, 0);
    offlineLimiter.ratio.setValueAtTime(20, 0);
    offlineLimiter.attack.setValueAtTime(0.001, 0);
    offlineLimiter.release.setValueAtTime(0.08, 0);

    const offlineClipper = offlineCtx.createWaveShaper();
    offlineClipper.oversample = '4x';
    offlineClipper.curve = createBrickWallClipperCurve(ceilingLinear);

    masterGain.connect(offlineLimiter);
    offlineLimiter.connect(offlineClipper);
    offlineClipper.connect(offlineCtx.destination);
  } else {
    masterGain.connect(offlineCtx.destination);
  }

  // Schedule Deck A outgoing slice inside [previewStartSec, previewEndSec]
  const aWinStart = Math.max(previewStartSec, 0);
  const aWinEnd = Math.min(previewEndSec, plan.deckAEndSec);
  if (aWinEnd > aWinStart + 0.02) {
    const srcA = offlineCtx.createBufferSource();
    srcA.buffer = deckA.audioBuffer;
    srcA.playbackRate.setValueAtTime(1, 0);

    const lowEqA = offlineCtx.createBiquadFilter();
    lowEqA.type = 'lowshelf';
    lowEqA.frequency.value = 230;

    const sweepA = offlineCtx.createBiquadFilter();
    sweepA.type = 'allpass';
    sweepA.frequency.value = 1000;
    sweepA.Q.value = 1.6;

    const gainA = offlineCtx.createGain();
    const fadeOutStart = plan.transitionStartSec;
    const endAt = plan.deckAEndSec;
    const fadeOut = Math.max(0.08, endAt - fadeOutStart);
    const midOut = fadeOutStart + fadeOut * 0.5;

    if (plan.transitionStyle === 'filter-sweep') {
      sweepA.type = 'highpass';
      scheduleSlicedAutomation(
        sweepA.frequency,
        [
          { t: 0, v: 30, curve: 'linear' },
          { t: fadeOutStart, v: 30, curve: 'linear' },
          { t: endAt, v: 3400, curve: 'exp' },
        ],
        aWinStart,
        aWinEnd
      );
    } else if (plan.transitionStyle === 'bass-swap') {
      scheduleSlicedAutomation(
        lowEqA.gain,
        [
          { t: 0, v: 0, curve: 'linear' },
          { t: fadeOutStart, v: 0, curve: 'linear' },
          { t: midOut, v: -16, curve: 'linear' },
          { t: endAt, v: -16, curve: 'linear' },
        ],
        aWinStart,
        aWinEnd
      );
    }

    scheduleSlicedAutomation(
      gainA.gain,
      [
        { t: 0, v: 1.0, curve: 'linear' },
        { t: fadeOutStart, v: 1.0, curve: 'linear' },
        { t: midOut, v: 0.68, curve: 'linear' },
        { t: endAt, v: 0.0001, curve: 'linear' },
      ],
      aWinStart,
      aWinEnd
    );

    srcA.connect(lowEqA);
    lowEqA.connect(sweepA);
    sweepA.connect(gainA);
    gainA.connect(masterGain);

    const localStartA = Math.max(0, aWinStart - previewStartSec);
    const srcOffsetA = Math.max(0, Math.min(deckA.duration - 0.02, aWinStart));
    const srcDurA = Math.max(0.02, Math.min(deckA.duration - srcOffsetA, aWinEnd - aWinStart));
    srcA.start(localStartA, srcOffsetA, srcDurA);
  }

  // Schedule Deck B incoming slice inside [previewStartSec, previewEndSec]
  const bWinStart = Math.max(previewStartSec, plan.deckBTimelineStartSec);
  const bWinEnd = Math.min(previewEndSec, plan.totalDurationSec);
  if (bWinEnd > bWinStart + 0.02) {
    const srcB = offlineCtx.createBufferSource();
    srcB.buffer = deckB.audioBuffer;
    srcB.playbackRate.setValueAtTime(plan.deckBPlaybackRate, 0);

    const lowEqB = offlineCtx.createBiquadFilter();
    lowEqB.type = 'lowshelf';
    lowEqB.frequency.value = 230;

    const sweepB = offlineCtx.createBiquadFilter();
    sweepB.type = 'allpass';
    sweepB.frequency.value = 1000;
    sweepB.Q.value = 1.6;

    const gainB = offlineCtx.createGain();
    const startB = plan.deckBTimelineStartSec;
    const fadeIn = Math.max(0.08, plan.overlapDurationSec);
    const endFadeB = startB + fadeIn;
    const midB = startB + fadeIn * 0.5;

    if (plan.transitionStyle === 'beat-drop') {
      scheduleSlicedAutomation(
        gainB.gain,
        [
          { t: startB, v: 0.001, curve: 'linear' },
          { t: midB - 0.04, v: 0.32, curve: 'linear' },
          { t: midB + 0.04, v: 1.0, curve: 'linear' },
          { t: plan.totalDurationSec, v: 1.0, curve: 'linear' },
        ],
        bWinStart,
        bWinEnd
      );
      scheduleSlicedAutomation(
        lowEqB.gain,
        [
          { t: startB, v: -16, curve: 'linear' },
          { t: midB - 0.03, v: -16, curve: 'linear' },
          { t: midB + 0.05, v: 0, curve: 'linear' },
          { t: plan.totalDurationSec, v: 0, curve: 'linear' },
        ],
        bWinStart,
        bWinEnd
      );
    } else if (plan.transitionStyle === 'filter-sweep') {
      sweepB.type = 'lowpass';
      scheduleSlicedAutomation(
        sweepB.frequency,
        [
          { t: startB, v: 260, curve: 'exp' },
          { t: endFadeB, v: 18000, curve: 'exp' },
          { t: plan.totalDurationSec, v: 18000, curve: 'linear' },
        ],
        bWinStart,
        bWinEnd
      );
      scheduleSlicedAutomation(
        gainB.gain,
        [
          { t: startB, v: 0.001, curve: 'linear' },
          { t: endFadeB, v: 1.0, curve: 'linear' },
          { t: plan.totalDurationSec, v: 1.0, curve: 'linear' },
        ],
        bWinStart,
        bWinEnd
      );
    } else if (plan.transitionStyle === 'stutter-cut') {
      const steps = 6;
      const stepDur = fadeIn / steps;
      const stutterKeys: AutomationKeyframe[] = [{ t: startB, v: 0.001, curve: 'step' }];
      for (let s = 0; s < steps; s++) {
        stutterKeys.push({
          t: startB + s * stepDur,
          v: s % 2 === 0 ? 0.92 : 0.14,
          curve: 'step',
        });
      }
      stutterKeys.push({ t: endFadeB, v: 1.0, curve: 'step' });
      stutterKeys.push({ t: plan.totalDurationSec, v: 1.0, curve: 'linear' });
      scheduleSlicedAutomation(gainB.gain, stutterKeys, bWinStart, bWinEnd);
    } else {
      const midSmooth = startB + fadeIn * 0.52;
      scheduleSlicedAutomation(
        gainB.gain,
        [
          { t: startB, v: 0.001, curve: 'linear' },
          { t: midSmooth, v: 0.75, curve: 'linear' },
          { t: endFadeB, v: 1.0, curve: 'linear' },
          { t: plan.totalDurationSec, v: 1.0, curve: 'linear' },
        ],
        bWinStart,
        bWinEnd
      );
      if (plan.transitionStyle === 'bass-swap') {
        scheduleSlicedAutomation(
          lowEqB.gain,
          [
            { t: startB, v: -15, curve: 'linear' },
            { t: midSmooth - 0.05, v: -12, curve: 'linear' },
            { t: midSmooth + 0.2, v: 0, curve: 'linear' },
            { t: plan.totalDurationSec, v: 0, curve: 'linear' },
          ],
          bWinStart,
          bWinEnd
        );
      }
    }

    srcB.connect(lowEqB);
    lowEqB.connect(sweepB);
    sweepB.connect(gainB);
    gainB.connect(masterGain);

    const localStartB = Math.max(0, bWinStart - previewStartSec);
    const offsetBTimeline = bWinStart - plan.deckBTimelineStartSec;
    const srcOffsetB = Math.max(
      0,
      Math.min(deckB.duration - 0.02, plan.deckBInTime + offsetBTimeline * plan.deckBPlaybackRate)
    );
    const srcDurB = Math.max(
      0.02,
      Math.min(deckB.duration - srcOffsetB, (bWinEnd - bWinStart) * plan.deckBPlaybackRate)
    );
    srcB.start(localStartB, srcOffsetB, srcDurB);
  }

  const rendered = await offlineCtx.startRendering();
  const rawPeak = scanAudioBufferPeakLinear(rendered);
  const autoGainFromPeak = options.autoGainFromPeak !== false;
  let appliedScale = 1;
  if (rawPeak > 0.0001) {
    if (autoGainFromPeak) {
      if (rawPeak > ceilingLinear) {
        appliedScale = ceilingLinear / rawPeak;
      } else if (rawPeak < ceilingLinear * 0.78) {
        appliedScale = Math.min(1.65, ceilingLinear / rawPeak);
      }
    } else if (limiterEnabled && rawPeak > ceilingLinear) {
      appliedScale = ceilingLinear / rawPeak;
    }
  }
  if (Math.abs(appliedScale - 1) > 0.002) {
    const kneeStart = ceilingLinear * 0.92;
    const kneeSpan = Math.max(0.005, ceilingLinear - kneeStart);
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        let s = data[i] * appliedScale;
        if (limiterEnabled) {
          const ax = Math.abs(s);
          if (ax > kneeStart) {
            const shaped = kneeStart + kneeSpan * Math.tanh((ax - kneeStart) / kneeSpan);
            s = Math.sign(s) * Math.min(ceilingLinear, shaped);
          }
        }
        data[i] = s;
      }
    }
  }

  const triBandPeaks = extractTriBandPeaks(rendered, 140);

  return {
    id: `preview-${proposal.id}-${Date.now()}`,
    suggestionId: proposal.id,
    label: proposal.label,
    plan,
    audioBuffer: rendered,
    previewStartSec: Number(previewStartSec.toFixed(2)),
    previewEndSec: Number(previewEndSec.toFixed(2)),
    durationSec: Number(rendered.duration.toFixed(2)),
    triBandPeaks,
    transitionStyle: proposal.transitionStyle,
    crossfadeBeats: proposal.crossfadeBeats,
    deckAOutSec: proposal.deckAOutSec,
    deckBInSec: proposal.deckBInSec,
    deckBDropSec: proposal.deckBDropSec ?? deckB.dropTime,
  };
}

function drawCoverVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetW: number,
  targetH: number,
  scaleBoost = 1
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return;
  const videoRatio = vw / vh;
  const targetRatio = targetW / targetH;
  let drawW: number;
  let drawH: number;
  if (videoRatio > targetRatio) {
    drawH = targetH * scaleBoost;
    drawW = drawH * videoRatio;
  } else {
    drawW = targetW * scaleBoost;
    drawH = drawW / videoRatio;
  }
  const dx = (targetW - drawW) * 0.5;
  const dy = (targetH - drawH) * 0.5;
  ctx.drawImage(video, dx, dy, drawW, drawH);
}

async function seekVideoTime(video: HTMLVideoElement, targetTime: number): Promise<void> {
  const safeDur =
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : targetTime + 1;
  const clamped = Math.max(0, Math.min(safeDur - 0.01, targetTime));
  if (Math.abs(video.currentTime - clamped) > 0.015) {
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
      const timer = window.setTimeout(done, 420);
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', done, { once: true });
      try {
        video.currentTime = clamped;
      } catch {
        done();
      }
    });
  }
}

/**
 * Video compositor for DJ Studio mixes supporting crossfade, beat-flash,
 * horizontal deck wipes, split-screen dual decks, and beat zoom-punch!
 */
export function createDjVideoFrameResolver(
  schedule: DjScheduleRenderPlan
): MixVideoFrameResolver {
  const videoSegments = schedule.segments.filter(
    (s) => s.track.hasVideo && Boolean(s.track.objectUrl)
  );
  const videoMap = new Map<string, HTMLVideoElement>();
  const lastSeekMap = new Map<string, number>();

  for (const seg of videoSegments) {
    if (typeof document === 'undefined' || !seg.track.objectUrl) continue;
    if (videoMap.has(seg.track.id)) continue;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = seg.track.objectUrl;
    v.load();
    videoMap.set(seg.track.id, v);
  }

  let compositeCanvas: HTMLCanvasElement | null = null;

  const getActiveSamples = (timelineTime: number) => {
    const active: Array<{
      seg: DjMultiTrackSegment;
      video: HTMLVideoElement;
      localTime: number;
      weight: number;
      inTransitionFrac: number | null;
    }> = [];

    for (const seg of videoSegments) {
      const video = videoMap.get(seg.track.id);
      if (!video) continue;
      const realDur = seg.sourcePlayDurationSec / seg.playbackRate;
      const start = seg.timelineStartSec;
      const end = start + realDur;
      if (timelineTime < start || timelineTime > end) continue;

      const offset = timelineTime - start;
      const localTime = Math.max(
        0,
        Math.min(seg.track.duration - 0.02, seg.sourceOffsetSec + offset * seg.playbackRate)
      );

      let weight = 1;
      let inTransitionFrac: number | null = null;
      if (seg.fadeInSec > 0.05 && offset < seg.fadeInSec) {
        inTransitionFrac = Math.max(0, Math.min(1, offset / seg.fadeInSec));
        weight = inTransitionFrac;
      }
      const rem = realDur - offset;
      if (seg.fadeOutSec > 0.05 && rem < seg.fadeOutSec) {
        weight = Math.min(weight, Math.max(0, rem / seg.fadeOutSec));
      }
      active.push({ seg, video, localTime, weight, inTransitionFrac });
    }
    return active;
  };

  const composite = (
    samples: ReturnType<typeof getActiveSamples>,
    timelineTime: number,
    targetW: number,
    targetH: number
  ): HTMLCanvasElement | null => {
    const ready = samples.filter((s) => s.video.readyState >= 2 && s.video.videoWidth > 0);
    if (ready.length === 0 || typeof document === 'undefined') return null;

    if (!compositeCanvas) compositeCanvas = document.createElement('canvas');
    if (compositeCanvas.width !== targetW || compositeCanvas.height !== targetH) {
      compositeCanvas.width = targetW;
      compositeCanvas.height = targetH;
    }

    const ctx = compositeCanvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, targetW, targetH);

    const layerAlpha = Math.max(0.1, Math.min(1, schedule.videoLayerOpacity ?? 1));
    const blendOp: GlobalCompositeOperation =
      schedule.videoBlendMode && schedule.videoBlendMode !== 'normal'
        ? (schedule.videoBlendMode as GlobalCompositeOperation)
        : 'source-over';

    if (ready.length === 1) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, Math.min(1, ready[0].weight * layerAlpha));
      drawCoverVideo(ctx, ready[0].video, targetW, targetH);
      ctx.restore();
      return compositeCanvas;
    }

    // Two overlapping DJ video decks -> apply chosen DJ video mix transition + Layer Blend mode!
    const outgoing = ready[0];
    const incoming = ready[ready.length - 1];
    const frac = incoming.inTransitionFrac ?? incoming.weight;
    const style = schedule.videoMixStyle;

    if (style === 'split-dual') {
      // Side-by-side club split deck view during overlap
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, targetW * 0.5, targetH);
      ctx.clip();
      ctx.globalAlpha = 0.95 * layerAlpha;
      drawCoverVideo(ctx, outgoing.video, targetW, targetH);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(targetW * 0.5, 0, targetW * 0.5, targetH);
      ctx.clip();
      ctx.globalAlpha = 0.95 * layerAlpha;
      drawCoverVideo(ctx, incoming.video, targetW, targetH);
      ctx.restore();

      ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
      ctx.fillRect(targetW * 0.5 - 2, 0, 4, targetH);
    } else if (style === 'wipe-slide') {
      ctx.save();
      ctx.globalAlpha = layerAlpha;
      drawCoverVideo(ctx, outgoing.video, targetW, targetH);
      ctx.restore();
      const wipeX = targetW * frac;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, wipeX, targetH);
      ctx.clip();
      ctx.globalAlpha = layerAlpha;
      drawCoverVideo(ctx, incoming.video, targetW, targetH);
      ctx.restore();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
      ctx.fillRect(wipeX - 2, 0, 4, targetH);
    } else if (style === 'beat-flash') {
      const nearestBeatDist = schedule.beatTimesTimeline.reduce((best, bt) => {
        const d = Math.abs(bt - timelineTime);
        return d < best ? d : best;
      }, 99);
      const flashCut = nearestBeatDist < 0.08 ? 1 : frac;
      ctx.save();
      ctx.globalAlpha = (1 - flashCut * 0.85) * layerAlpha;
      drawCoverVideo(ctx, outgoing.video, targetW, targetH);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = flashCut * layerAlpha;
      drawCoverVideo(ctx, incoming.video, targetW, targetH);
      ctx.restore();
      if (nearestBeatDist < 0.06) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(0, 0, targetW, targetH);
      }
    } else if (style === 'zoom-punch') {
      const punchScale = 1 + Math.sin(frac * Math.PI) * 0.16;
      ctx.save();
      ctx.globalAlpha = (1 - frac) * layerAlpha;
      drawCoverVideo(ctx, outgoing.video, targetW, targetH, 1 + frac * 0.12);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = frac * layerAlpha;
      drawCoverVideo(ctx, incoming.video, targetW, targetH, punchScale);
      ctx.restore();
    } else {
      // crossfade default (respects Video Blend Mode from Multi-Track Layering!)
      ctx.save();
      ctx.globalAlpha = layerAlpha;
      drawCoverVideo(ctx, outgoing.video, targetW, targetH);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = Math.max(0, Math.min(1, frac)) * layerAlpha;
      drawCoverVideo(ctx, incoming.video, targetW, targetH);
      ctx.restore();
    }

    return compositeCanvas;
  };

  return {
    hasActiveVideo: () => videoSegments.length > 0,
    updateClips: () => {
      // Static per rendered DJ schedule
    },
    resolvePreviewFrame: (trackTimeSec, targetW, targetH) => {
      const samples = getActiveSamples(trackTimeSec);
      if (samples.length === 0) return null;
      const nowMs = performance.now();
      for (const s of samples) {
        const last = lastSeekMap.get(s.seg.track.id) ?? 0;
        if (!s.video.seeking && Math.abs(s.video.currentTime - s.localTime) > 0.05 && nowMs - last > 34) {
          lastSeekMap.set(s.seg.track.id, nowMs);
          try {
            s.video.currentTime = s.localTime;
          } catch {
            // ignore transient seek state
          }
        }
      }
      return composite(samples, trackTimeSec, targetW, targetH);
    },
    resolveExportFrame: async (trackTimeSec, targetW, targetH) => {
      const samples = getActiveSamples(trackTimeSec);
      if (samples.length === 0) return null;
      await Promise.all(samples.map((s) => seekVideoTime(s.video, s.localTime)));
      return composite(samples, trackTimeSec, targetW, targetH);
    },
    dispose: () => {
      for (const v of videoMap.values()) {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch {
          // ignore
        }
      }
      videoMap.clear();
      lastSeekMap.clear();
      compositeCanvas = null;
    },
  };
}

export interface DjEqCrossoverCalibration {
  lowCrossoverHz: number;
  midCenterHz: number;
  highCrossoverHz: number;
  voicingLabel: string;
}

/**
 * Computes frequency crossover points for a DJ 3-band EQ calibrated to track BPM:
 * - Slower tempos (60-96 BPM): lower Low/Mid split to isolate heavy sub/808 sustain.
 * - Mid tempos (97-129 BPM): classic club house punch and vocal mid separation.
 * - Fast tempos (130+ BPM): higher Low/Mid & High split for crisp rapid transients.
 */
export function computeBpmCalibratedEqCrossovers(bpm: number): DjEqCrossoverCalibration {
  const safeBpm = Math.max(60, Math.min(190, bpm || 120));
  const norm = Math.max(0, Math.min(1, (safeBpm - 65) / 115));
  const lowCrossoverHz = Math.round(170 + norm * 140);
  const midCenterHz = Math.round(920 + norm * 540);
  const highCrossoverHz = Math.round(3300 + norm * 1800);

  const voicingLabel =
    safeBpm < 98
      ? 'Sub / Halftime'
      : safeBpm < 130
        ? 'Club / House'
        : 'Techno / DnB';

  return {
    lowCrossoverHz,
    midCenterHz,
    highCrossoverHz,
    voicingLabel,
  };
}


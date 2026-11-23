import { LyricLine } from '../types/studio';
import {
  createInitialBeatState,
  OfflineLowPassBeatTracker,
  stepBeatDetector,
} from './audioEngine';
import { createLyricId } from './lrcParser';

export interface DetectedBeatPoint {
  timeSec: number;
  energy: number;
}

export interface BeatDetectionAnalysis {
  beats: DetectedBeatPoint[];
  estimatedBpm: number | null;
  averageEnergy: number;
  startSec: number;
  endSec: number;
}

export interface LyricBeatSuggestion {
  id: string;
  text: string;
  originalTime: number | null;
  suggestedTime: number;
  deltaMs: number;
  matchedBeat: boolean;
}

export function analyzeBeatsFromAudioBuffer(
  audioBuffer: AudioBuffer,
  options: {
    startSec?: number;
    endSec?: number;
    beatSensitivity: number;
  }
): BeatDetectionAnalysis {
  const safeStart = Math.max(0, Math.min(options.startSec ?? 0, audioBuffer.duration));
  const safeEnd = Math.max(
    safeStart + 0.5,
    Math.min(options.endSec ?? audioBuffer.duration, audioBuffer.duration)
  );

  const tracker = new OfflineLowPassBeatTracker(audioBuffer, 140, 1.2);
  const beatState = createInitialBeatState();
  const dt = 0.01; // 100 Hz analysis -> 10ms timestamp precision
  const beats: DetectedBeatPoint[] = [];

  for (let t = safeStart; t <= safeEnd; t += dt) {
    const lowPassRms = tracker.getLowPassRmsAt(t, 1024);
    const step = stepBeatDetector(
      beatState,
      lowPassRms,
      dt,
      options.beatSensitivity,
      100,
      '#22d3ee',
      '#ec4899'
    );
    if (step.triggered) {
      beats.push({
        timeSec: Number(t.toFixed(2)),
        energy: lowPassRms,
      });
    }
  }

  // Estimate dominant BPM from plausible inter-beat intervals (40-200 BPM range)
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const diff = beats[i].timeSec - beats[i - 1].timeSec;
    if (diff >= 0.28 && diff <= 1.5) {
      intervals.push(diff);
    }
  }

  let estimatedBpm: number | null = null;
  if (intervals.length > 0) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const medianSec = sorted[Math.floor(sorted.length / 2)];
    let bpm = 60 / medianSec;
    while (bpm < 68) bpm *= 2;
    while (bpm > 175) bpm /= 2;
    estimatedBpm = Math.round(bpm);
  }

  const averageEnergy =
    beats.length > 0
      ? beats.reduce((sum, b) => sum + b.energy, 0) / beats.length
      : 0;

  return {
    beats,
    estimatedBpm,
    averageEnergy,
    startSec: safeStart,
    endSec: safeEnd,
  };
}

export function suggestBeatSyncedTimestamps(
  lyrics: LyricLine[],
  analysis: BeatDetectionAnalysis,
  maxSnapSec = 0.45
): LyricBeatSuggestion[] {
  const ordered = [...lyrics].sort((a, b) => a.time - b.time);
  const suggestions: LyricBeatSuggestion[] = [];
  let minNextTime = analysis.startSec;

  for (const cue of ordered) {
    let bestBeat: DetectedBeatPoint | null = null;
    let bestDist = Infinity;

    for (const beat of analysis.beats) {
      if (beat.timeSec < minNextTime - 0.01) continue;
      const dist = Math.abs(beat.timeSec - cue.time);
      if (dist <= maxSnapSec && dist < bestDist) {
        bestDist = dist;
        bestBeat = beat;
      }
      if (beat.timeSec > cue.time + maxSnapSec) break;
    }

    let suggestedTime = bestBeat ? bestBeat.timeSec : cue.time;
    if (suggestedTime < minNextTime) {
      suggestedTime = minNextTime;
    }
    suggestedTime = Number(
      Math.max(0, Math.min(analysis.endSec - 0.1, suggestedTime)).toFixed(2)
    );

    const deltaMs = Math.round((suggestedTime - cue.time) * 1000);
    suggestions.push({
      id: cue.id,
      text: cue.text,
      originalTime: cue.time,
      suggestedTime,
      deltaMs,
      matchedBeat: Boolean(bestBeat),
    });

    minNextTime = suggestedTime + 0.15;
  }

  return suggestions;
}

export function suggestTimestampsForPlainLyrics(
  plainLines: string[],
  analysis: BeatDetectionAnalysis,
  beatsPerLine: 1 | 2 | 4 = 2
): LyricBeatSuggestion[] {
  const cleaned = plainLines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const clipSpan = Math.max(1, analysis.endSec - analysis.startSec);
  const strongBeats = analysis.beats.filter(
    (b) => b.energy >= analysis.averageEnergy * 0.45
  );
  const candidateBeats =
    strongBeats.length >= cleaned.length ? strongBeats : analysis.beats;

  // Determine effective stride so we try to fit all lines cleanly inside the clip
  let stride = beatsPerLine;
  while (stride > 1 && candidateBeats.length > 0 && candidateBeats.length / stride < cleaned.length) {
    stride = stride === 4 ? 2 : 1;
  }

  const pickedTimes: number[] = [];

  if (candidateBeats.length >= cleaned.length) {
    // Use detected beats directly, respecting stride if enough beats exist
    const maxStartOffset = Math.max(0, candidateBeats.length - cleaned.length * stride);
    const useStride = maxStartOffset >= 0 && candidateBeats.length >= cleaned.length * stride ? stride : 1;
    const stepRatio =
      useStride > 1
        ? useStride
        : candidateBeats.length / cleaned.length;

    for (let i = 0; i < cleaned.length; i++) {
      const idx = Math.min(
        candidateBeats.length - 1,
        Math.floor(i * stepRatio)
      );
      pickedTimes.push(candidateBeats[idx].timeSec);
    }
  } else {
    // Fallback hybrid: anchor on detected beats if any, or use estimated BPM / even spacing
    const beatPeriodSec = analysis.estimatedBpm ? 60 / analysis.estimatedBpm : clipSpan / (cleaned.length + 1);
    const firstAnchor = candidateBeats[0]?.timeSec ?? analysis.startSec + Math.min(0.5, clipSpan * 0.05);
    const availableSpan = Math.max(0.5, analysis.endSec - 0.4 - firstAnchor);
    const stepSec = Math.min(
      beatPeriodSec * beatsPerLine,
      availableSpan / Math.max(1, cleaned.length)
    );

    for (let i = 0; i < cleaned.length; i++) {
      const rawTime = firstAnchor + i * stepSec;
      // Snap to nearest detected beat if one falls closely around this slot
      let best = rawTime;
      let bestDist = stepSec * 0.35;
      for (const b of candidateBeats) {
        const d = Math.abs(b.timeSec - rawTime);
        if (d < bestDist) {
          bestDist = d;
          best = b.timeSec;
        }
      }
      pickedTimes.push(best);
    }
  }

  // Enforce strictly increasing timestamps within [startSec, endSec - 0.1]
  const suggestions: LyricBeatSuggestion[] = [];
  let minAllowed = analysis.startSec;

  for (let i = 0; i < cleaned.length; i++) {
    const t = Number(
      Math.max(minAllowed, Math.min(analysis.endSec - 0.1, pickedTimes[i] ?? minAllowed)).toFixed(2)
    );
    const matchedBeat = analysis.beats.some((b) => Math.abs(b.timeSec - t) <= 0.05);

    suggestions.push({
      id: createLyricId(),
      text: cleaned[i],
      originalTime: null,
      suggestedTime: t,
      deltaMs: 0,
      matchedBeat,
    });

    minAllowed = t + 0.15;
  }

  return suggestions;
}

export interface AutoAlignLyricsResult {
  alignedLyrics: LyricLine[];
  alignedCount: number;
  totalCount: number;
  highEnergyPeakCount: number;
  estimatedBpm: number | null;
}

/**
 * Refines all existing lyric cue timestamps by extracting audio broadband amplitude peaks
 * alongside low-pass beat triggers and snapping each cue to the nearest high-energy beat.
 */
export function autoAlignLyricsToAmplitudePeaks(
  lyrics: LyricLine[],
  audioBuffer: AudioBuffer,
  options: {
    beatSensitivity: number;
    maxSnapSec?: number;
  }
): AutoAlignLyricsResult {
  const ordered = [...lyrics].sort((a, b) => a.time - b.time);
  const duration = audioBuffer.duration;
  if (ordered.length === 0 || duration <= 0.2) {
    return {
      alignedLyrics: ordered,
      alignedCount: 0,
      totalCount: ordered.length,
      highEnergyPeakCount: 0,
      estimatedBpm: null,
    };
  }

  const maxSnapSec = Math.max(0.15, Math.min(1.2, options.maxSnapSec ?? 0.55));
  const analysis = analyzeBeatsFromAudioBuffer(audioBuffer, {
    startSec: 0,
    endSec: duration,
    beatSensitivity: options.beatSensitivity,
  });

  // Build broadband 10ms RMS amplitude envelope across the track
  const sampleRate = audioBuffer.sampleRate;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const totalSamples = ch0.length;
  const hopSec = 0.01;
  const winHalfSamples = Math.max(64, Math.floor(sampleRate * 0.014));
  const frameCount = Math.max(1, Math.floor(duration / hopSec) + 1);
  const rmsEnvelope = new Float32Array(frameCount);

  let envelopeSum = 0;
  for (let f = 0; f < frameCount; f++) {
    const center = Math.min(totalSamples - 1, Math.floor(f * hopSec * sampleRate));
    const start = Math.max(0, center - winHalfSamples);
    const end = Math.min(totalSamples, center + winHalfSamples);
    let sumSq = 0;
    let count = 0;
    for (let i = start; i < end; i += 2) {
      const s = ch1 ? 0.5 * (ch0[i] + ch1[i]) : ch0[i];
      sumSq += s * s;
      count++;
    }
    const rms = count > 0 ? Math.min(1, Math.sqrt(sumSq / count) * 1.45) : 0;
    rmsEnvelope[f] = rms;
    envelopeSum += rms;
  }

  const meanBroadband = envelopeSum / frameCount;

  interface AmplitudeBeatPeak {
    timeSec: number;
    score: number;
  }

  const peaks: AmplitudeBeatPeak[] = [];

  // 1. Refine each detected low-pass beat to the exact nearby amplitude crest (±35ms)
  for (const beat of analysis.beats) {
    const baseIdx = Math.round(beat.timeSec / hopSec);
    const searchFrom = Math.max(0, baseIdx - 3);
    const searchTo = Math.min(frameCount - 1, baseIdx + 4);
    let bestIdx = Math.max(0, Math.min(frameCount - 1, baseIdx));
    let bestRms = rmsEnvelope[bestIdx] ?? 0;

    for (let idx = searchFrom; idx <= searchTo; idx++) {
      if (rmsEnvelope[idx] > bestRms) {
        bestRms = rmsEnvelope[idx];
        bestIdx = idx;
      }
    }

    const score = beat.energy * 0.55 + bestRms * 0.45;
    peaks.push({
      timeSec: Number((bestIdx * hopSec).toFixed(2)),
      score,
    });
  }

  // 2. Capture prominent broadband amplitude peaks (snare hits, vocal onsets) between bass kicks
  const broadbandPeakThreshold = Math.max(0.06, meanBroadband * 1.28);
  for (let f = 2; f < frameCount - 2; f++) {
    const v = rmsEnvelope[f];
    if (
      v >= broadbandPeakThreshold &&
      v >= rmsEnvelope[f - 1] &&
      v >= rmsEnvelope[f + 1] &&
      v >= rmsEnvelope[f - 2] &&
      v >= rmsEnvelope[f + 2]
    ) {
      const t = Number((f * hopSec).toFixed(2));
      const hasNearbyBeat = peaks.some((p) => Math.abs(p.timeSec - t) < 0.13);
      if (!hasNearbyBeat) {
        peaks.push({
          timeSec: t,
          score: v * 0.85,
        });
      }
    }
  }

  peaks.sort((a, b) => a.timeSec - b.timeSec);

  // 3. Identify high-energy beats from merged amplitude peaks
  const meanPeakScore =
    peaks.length > 0
      ? peaks.reduce((sum, p) => sum + p.score, 0) / peaks.length
      : 0;
  const highThreshold = Math.max(0.04, meanPeakScore * 0.85);
  const highEnergyPeaks = peaks.filter((p) => p.score >= highThreshold);
  const primaryPool = highEnergyPeaks.length > 0 ? highEnergyPeaks : peaks;

  // 4. Snap each cue chronologically to its nearest high-energy amplitude beat
  const maxTrackTime = Math.max(0, duration - 0.1);
  let minNextTime = 0;
  let alignedCount = 0;

  const findBestInPool = (
    pool: AmplitudeBeatPeak[],
    cueTime: number,
    windowSec: number
  ): AmplitudeBeatPeak | null => {
    let best: AmplitudeBeatPeak | null = null;
    let bestCost = Infinity;
    for (const p of pool) {
      if (p.timeSec < minNextTime - 0.01) continue;
      const dist = Math.abs(p.timeSec - cueTime);
      if (dist > windowSec) {
        if (p.timeSec > cueTime + windowSec) break;
        continue;
      }
      // Prioritize proximity while letting stronger amplitude peaks break near-ties
      const cost = dist - Math.min(0.045, p.score * 0.055);
      if (cost < bestCost) {
        bestCost = cost;
        best = p;
      }
    }
    return best;
  };

  const alignedLyrics: LyricLine[] = ordered.map((cue) => {
    const matched =
      findBestInPool(primaryPool, cue.time, maxSnapSec) ??
      findBestInPool(peaks, cue.time, Math.min(0.35, maxSnapSec));

    let nextTime = matched ? matched.timeSec : cue.time;
    if (nextTime < minNextTime) nextTime = minNextTime;
    nextTime = Number(Math.max(0, Math.min(maxTrackTime, nextTime)).toFixed(2));

    if (Math.abs(nextTime - cue.time) >= 0.01) {
      alignedCount++;
    }
    minNextTime = nextTime + 0.15;

    return {
      ...cue,
      time: nextTime,
    };
  });

  alignedLyrics.sort((a, b) => a.time - b.time);

  return {
    alignedLyrics,
    alignedCount,
    totalCount: ordered.length,
    highEnergyPeakCount: primaryPool.length,
    estimatedBpm: analysis.estimatedBpm,
  };
}


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

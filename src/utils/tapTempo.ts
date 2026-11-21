export interface TapSample {
  tapTimeMs: number;
  bassRms: number;
  rollingRms: number;
}

export interface TapTempoCalibration {
  bpm: number;
  beatSensitivity: number;
  tapCount: number;
  usedEnergyCalibration: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const TAP_TEMPO_IDLE_RESET_MS = 2200;

/**
 * Computes BPM from user tap intervals and calibrates `beatSensitivity` (0.8 - 2.0)
 * to match stepBeatDetector's adaptive threshold formula.
 */
export function computeTapTempoCalibration(
  samples: TapSample[],
  playbackRate = 1
): TapTempoCalibration | null {
  if (samples.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tapTimeMs - samples[i - 1].tapTimeMs;
    if (dt >= 200 && dt <= TAP_TEMPO_IDLE_RESET_MS) {
      intervals.push(dt);
    }
  }

  if (intervals.length === 0) return null;

  // Reject gross outliers relative to median interval so accidental slips don't skew BPM
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const consistent = intervals.filter(
    (dt) => dt >= median * 0.65 && dt <= median * 1.45
  );
  const activeIntervals = consistent.length > 0 ? consistent : intervals;

  // Slightly weight recent taps higher for responsive live locking
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < activeIntervals.length; i++) {
    const weight = 1 + i * 0.2;
    weightedSum += activeIntervals[i] * weight;
    weightTotal += weight;
  }

  const avgIntervalMs = weightedSum / Math.max(1, weightTotal);
  const safeRate = Math.max(0.25, playbackRate || 1);
  const trackIntervalSec = (avgIntervalMs / 1000) * safeRate;
  const bpm = Math.round(clamp(60 / Math.max(0.15, trackIntervalSec), 40, 240));

  // Baseline sensitivity curve mapped from tempo cadence (60 BPM -> 1.05x, 120 BPM -> 1.40x, 180+ BPM -> 1.75x)
  const tempoNorm = clamp((bpm - 60) / 120, 0, 1);
  const tempoSensitivity = 1.05 + tempoNorm * 0.7;

  // If the track was actively playing during taps, inspect low-pass bass energy at tap moments
  // and solve stepBeatDetector's threshold formula so kicks reliably cross threshold.
  const energySamples = samples.filter((s) => s.bassRms > 0.015 && s.rollingRms > 0.005);
  let usedEnergyCalibration = false;
  let finalSensitivity = tempoSensitivity;

  if (energySamples.length >= 2) {
    let sumEnergySens = 0;
    for (const sample of energySamples) {
      const ratio = sample.bassRms / Math.max(0.035, sample.rollingRms);
      // Place threshold ~16% below tapped bass spike peak
      const targetMultiplier = clamp(ratio * 0.84, 1.14, 1.56);
      const ratioSens = (1.82 - targetMultiplier) / 0.34;
      // Also ensure minFloor = 0.14 - s * 0.04 sits safely below tapped peak RMS
      const floorSens = (0.14 - sample.bassRms * 0.82) / 0.04;
      const sampleSens = clamp(Math.max(ratioSens, floorSens), 0.8, 2.0);
      sumEnergySens += sampleSens;
    }
    const avgEnergySens = sumEnergySens / energySamples.length;
    finalSensitivity = 0.65 * avgEnergySens + 0.35 * tempoSensitivity;
    usedEnergyCalibration = true;
  }

  const beatSensitivity = Number(clamp(finalSensitivity, 0.8, 2.0).toFixed(2));

  return {
    bpm,
    beatSensitivity,
    tapCount: samples.length,
    usedEnergyCalibration,
  };
}

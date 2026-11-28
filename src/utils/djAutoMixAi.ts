import { DjTrackAsset, DjTransitionStyle, DjVideoMixStyle } from '../types/studio';
import { findNearestBeat, getEffectiveBpm } from './djEngine';

export type AutoMixPreference = 'balanced' | 'drop-slam' | 'smooth-blend';

export interface TrackEnergyWindow {
  startSec: number;
  endSec: number;
  rmsEnergy: number; // 0-100 normalized energy
  bassEnergy: number; // 0-100 sub/kick intensity
  hint: 'Intro' | 'Groove' | 'Build' | 'Drop' | 'Breakdown' | 'Outro';
}

export interface TrackStructurePayload {
  title: string;
  durationSec: number;
  bpm: number;
  musicalKey: string;
  camelotKey: string;
  detectedDropSec: number;
  recommendedOutSec: number;
  downbeatSampleSec: number[];
  windows: TrackEnergyWindow[];
  lyricHighlights: Array<{ timeSec: number; text: string }>;
}

export interface AiTrackSectionSegment {
  startSec: number;
  endSec: number;
  label: string;
  energy: number; // 0-100
}

export interface AiAutoMixSuggestion {
  id: string;
  label: string;
  energyMatchScore: number; // 0-100
  deckAOutSec: number;
  deckASectionLabel: string;
  deckBInSec: number;
  deckBDropSec: number;
  deckBSectionLabel: string;
  crossfadeBeats: 4 | 8 | 16 | 32;
  transitionStyle: DjTransitionStyle;
  videoMixStyle: DjVideoMixStyle;
  rationale: string;
}

export interface AiAutoMixAnalysisResult {
  deckAStructure: AiTrackSectionSegment[];
  deckBStructure: AiTrackSectionSegment[];
  suggestions: AiAutoMixSuggestion[];
  harmonicSummary: string;
}

/**
 * Extracts normalized multi-window overall RMS & sub-bass energy profiles from an
 * AudioBuffer so server-side AI can locate exact structural drops, breakdowns, and outros.
 */
export function extractTrackStructurePayload(
  track: DjTrackAsset,
  windowCount = 24
): TrackStructurePayload {
  const buf = track.audioBuffer;
  const durationSec = Math.max(1, track.duration || buf.duration);
  const count = Math.max(8, Math.min(32, windowCount));
  const totalSamples = buf.length;
  const sr = buf.sampleRate || 44100;
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;

  // 1-pole lowpass (~150Hz) for kick/bass energy extraction
  const lpCoeff = 1 - Math.exp((-2 * Math.PI * 150) / sr);
  const stride = Math.max(1, Math.floor(sr / 6000)); // ~6kHz effective subsample rate
  const effLpCoeff = Math.min(0.95, lpCoeff * stride);

  const rawRms: number[] = [];
  const rawBass: number[] = [];

  for (let w = 0; w < count; w++) {
    const s0 = Math.floor((w / count) * totalSamples);
    const s1 = Math.min(totalSamples, Math.floor(((w + 1) / count) * totalSamples));
    let sumSq = 0;
    let bassSumSq = 0;
    let lpState = 0;
    let n = 0;

    for (let i = s0; i < s1; i += stride) {
      const m = (ch0[i] + ch1[i]) * 0.5;
      lpState += (m - lpState) * effLpCoeff;
      sumSq += m * m;
      bassSumSq += lpState * lpState;
      n++;
    }

    rawRms.push(n > 0 ? Math.sqrt(sumSq / n) : 0);
    rawBass.push(n > 0 ? Math.sqrt(bassSumSq / n) : 0);
  }

  const maxRms = Math.max(0.001, ...rawRms);
  const maxBass = Math.max(0.001, ...rawBass);

  const windows: TrackEnergyWindow[] = [];
  for (let w = 0; w < count; w++) {
    const startSec = Number(((w / count) * durationSec).toFixed(2));
    const endSec = Number((((w + 1) / count) * durationSec).toFixed(2));
    const rmsEnergy = Math.round((rawRms[w] / maxRms) * 100);
    const bassEnergy = Math.round((rawBass[w] / maxBass) * 100);
    const prevRms = w > 0 ? Math.round((rawRms[w - 1] / maxRms) * 100) : rmsEnergy;
    const nextRms = w < count - 1 ? Math.round((rawRms[w + 1] / maxRms) * 100) : rmsEnergy;

    let hint: TrackEnergyWindow['hint'] = 'Groove';
    if (w <= Math.max(1, Math.floor(count * 0.14)) && rmsEnergy < 65) {
      hint = 'Intro';
    } else if (w >= Math.floor(count * 0.78) && rmsEnergy < 68) {
      hint = 'Outro';
    } else if (bassEnergy >= 72 && rmsEnergy >= 72) {
      hint = 'Drop';
    } else if (rmsEnergy - prevRms >= 14 || nextRms - rmsEnergy >= 16) {
      hint = 'Build';
    } else if (rmsEnergy < 52 && bassEnergy < 45) {
      hint = 'Breakdown';
    }

    windows.push({ startSec, endSec, rmsEnergy, bassEnergy, hint });
  }

  const downbeatPool =
    track.downbeatTimes.length > 0 ? track.downbeatTimes : track.beatTimes;
  const maxDownbeatSamples = 48;
  const stepDb = Math.max(1, Math.floor(downbeatPool.length / maxDownbeatSamples));
  const downbeatSampleSec: number[] = [];
  for (let i = 0; i < downbeatPool.length; i += stepDb) {
    downbeatSampleSec.push(Number(downbeatPool[i].toFixed(2)));
  }

  const lyricHighlights = track.lyrics
    .filter((_, idx) => idx % Math.max(1, Math.floor(track.lyrics.length / 8)) === 0)
    .slice(0, 8)
    .map((l) => ({ timeSec: Number(l.time.toFixed(2)), text: l.text.slice(0, 60) }));

  return {
    title: track.title,
    durationSec: Number(durationSec.toFixed(2)),
    bpm: getEffectiveBpm(track),
    musicalKey: track.musicalKey ?? 'Unknown',
    camelotKey: track.camelotKey ?? '--',
    detectedDropSec: Number(track.dropTime.toFixed(2)),
    recommendedOutSec: Number(track.recommendedOutTime.toFixed(2)),
    downbeatSampleSec,
    windows,
    lyricHighlights,
  };
}

/**
 * Calls server-side Gemini AI to analyze both tracks' structural energy timelines
 * and return ranked Energy Match transition suggestions.
 */
export async function requestAiAutoMixSuggestions(
  deckA: DjTrackAsset,
  deckB: DjTrackAsset,
  preference: AutoMixPreference
): Promise<AiAutoMixAnalysisResult> {
  const payload = {
    preference,
    deckA: extractTrackStructurePayload(deckA, 24),
    deckB: extractTrackStructurePayload(deckB, 24),
  };

  const response = await fetch('/api/dj/automix-suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<AiAutoMixAnalysisResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error || `AI Auto-Mix analysis failed (HTTP ${response.status}).`
    );
  }

  if (!Array.isArray(data.suggestions) || data.suggestions.length === 0) {
    throw new Error('AI Auto-Mix did not return transition suggestions.');
  }

  const poolA = deckA.downbeatTimes.length > 0 ? deckA.downbeatTimes : deckA.beatTimes;
  const poolB = deckB.downbeatTimes.length > 0 ? deckB.downbeatTimes : deckB.beatTimes;

  const snapCue = (pool: number[], raw: number, min: number, max: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    if (pool.length === 0) return Number(clamped.toFixed(2));
    const snapped = findNearestBeat(pool, clamped);
    return Number(Math.max(min, Math.min(max, snapped)).toFixed(2));
  };

  const suggestions: AiAutoMixSuggestion[] = data.suggestions.map((item, idx) => ({
    id: item.id || `ai-mix-${idx + 1}`,
    label: item.label || `Energy Match #${idx + 1}`,
    energyMatchScore: Math.max(
      1,
      Math.min(100, Math.round(Number(item.energyMatchScore) || 85))
    ),
    deckAOutSec: snapCue(
      poolA,
      Number(item.deckAOutSec ?? deckA.recommendedOutTime),
      1,
      Math.max(1.5, deckA.duration - 1.2)
    ),
    deckASectionLabel: item.deckASectionLabel || 'Outro Wind-Down',
    deckBInSec: snapCue(
      poolB,
      Number(item.deckBInSec ?? 0),
      0,
      Math.max(0.5, deckB.duration - 1.8)
    ),
    deckBDropSec: Number(
      Math.max(0, Math.min(deckB.duration, Number(item.deckBDropSec ?? deckB.dropTime))).toFixed(2)
    ),
    deckBSectionLabel: item.deckBSectionLabel || 'Incoming Drop',
    crossfadeBeats: ([4, 8, 16, 32].includes(Number(item.crossfadeBeats))
      ? Number(item.crossfadeBeats)
      : 8) as 4 | 8 | 16 | 32,
    transitionStyle: ([
      'bass-swap',
      'filter-sweep',
      'beat-drop',
      'echo-out',
      'stutter-cut',
    ].includes(item.transitionStyle)
      ? item.transitionStyle
      : 'bass-swap') as DjTransitionStyle,
    videoMixStyle: ([
      'crossfade',
      'beat-flash',
      'wipe-slide',
      'split-dual',
      'zoom-punch',
    ].includes(item.videoMixStyle)
      ? item.videoMixStyle
      : 'crossfade') as DjVideoMixStyle,
    rationale:
      item.rationale ||
      'Balances outgoing energy fade with incoming percussion drop on phase-locked downbeats.',
  }));

  return {
    deckAStructure: Array.isArray(data.deckAStructure) ? data.deckAStructure : [],
    deckBStructure: Array.isArray(data.deckBStructure) ? data.deckBStructure : [],
    suggestions,
    harmonicSummary:
      data.harmonicSummary ||
      `${deckA.camelotKey ?? '--'} (${getEffectiveBpm(deckA)} BPM) → ${deckB.camelotKey ?? '--'} (${getEffectiveBpm(deckB)} BPM)`,
  };
}

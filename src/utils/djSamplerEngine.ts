export type SamplerQuantizeMode = 'off' | 0.25 | 0.5 | 1;

export type SamplerRecordSource = 'mic' | 'deckA' | 'deckB' | 'master';

export type SamplerSourceKind = 'empty' | 'mic' | 'deck' | 'master' | 'file' | 'synth';

export type SamplerStarterKind =
  | 'kick'
  | 'clap'
  | 'hat'
  | 'horn'
  | 'riser'
  | 'sub'
  | 'stab'
  | 'rim';

export interface SamplerPadData {
  id: string;
  slotIndex: number;
  keyHint: string;
  name: string;
  colorHex: string;
  audioBuffer: AudioBuffer | null;
  peaks: number[];
  durationSec: number;
  gain: number;
  sourceKind: SamplerSourceKind;
  recordedBpm: number | null;
}

export const SAMPLER_QUANTIZE_OPTIONS: { value: SamplerQuantizeMode; label: string }[] = [
  { value: 'off', label: 'Off (Free)' },
  { value: 0.25, label: '1/4 Beat' },
  { value: 0.5, label: '1/2 Beat' },
  { value: 1, label: '1 Beat' },
];

export const SAMPLER_PAD_META: {
  name: string;
  colorHex: string;
  starterKind: SamplerStarterKind;
}[] = [
  { name: '808 Kick', colorHex: '#22d3ee', starterKind: 'kick' },
  { name: 'Crisp Clap', colorHex: '#34d399', starterKind: 'clap' },
  { name: 'Drop Horn', colorHex: '#f59e0b', starterKind: 'horn' },
  { name: 'Noise Riser', colorHex: '#e879f9', starterKind: 'riser' },
  { name: 'Rec Pad 5', colorHex: '#fb7185', starterKind: 'hat' },
  { name: 'Rec Pad 6', colorHex: '#38bdf8', starterKind: 'sub' },
  { name: 'Rec Pad 7', colorHex: '#a78bfa', starterKind: 'stab' },
  { name: 'Rec Pad 8', colorHex: '#fb923c', starterKind: 'rim' },
];

export function createInitialSamplerPads(): SamplerPadData[] {
  return SAMPLER_PAD_META.map((meta, idx) => ({
    id: `sampler-pad-${idx + 1}`,
    slotIndex: idx,
    keyHint: String(idx + 1),
    name: meta.name,
    colorHex: meta.colorHex,
    audioBuffer: null,
    peaks: [],
    durationSec: 0,
    gain: 0.95,
    sourceKind: 'empty',
    recordedBpm: null,
  }));
}

export function extractSamplerPeaks(buffer: AudioBuffer, bars = 28): number[] {
  const ch0 = buffer.getChannelData(0);
  if (ch0.length === 0) return [];
  const step = Math.max(1, Math.floor(ch0.length / bars));
  const raw: number[] = [];
  let maxVal = 0.001;
  for (let i = 0; i < bars; i++) {
    const start = i * step;
    const end = Math.min(ch0.length, start + step);
    let pk = 0;
    for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 16))) {
      const v = Math.abs(ch0[j]);
      if (v > pk) pk = v;
    }
    raw.push(pk);
    if (pk > maxVal) maxVal = pk;
  }
  return raw.map((v) => Math.max(0.08, Math.min(1, v / maxVal)));
}

/**
 * Automatically trims leading & trailing silence from recorded microphone/master clips
 * with short fade-in/fade-out envelopes so one-shots fire tightly on the beat grid.
 */
export function trimSilentEdgesFromBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  threshold = 0.014
): AudioBuffer {
  const sr = buffer.sampleRate || 44100;
  const numChannels = Math.max(1, buffer.numberOfChannels);
  const len = buffer.length;
  if (len === 0) return buffer;

  let firstActive = -1;
  let lastActive = -1;

  for (let i = 0; i < len; i++) {
    let peak = 0;
    for (let c = 0; c < numChannels; c++) {
      const s = Math.abs(buffer.getChannelData(c)[i]);
      if (s > peak) peak = s;
    }
    if (peak >= threshold) {
      if (firstActive === -1) firstActive = i;
      lastActive = i;
    }
  }

  if (firstActive === -1 || lastActive <= firstActive) {
    return buffer;
  }

  const preRollSamples = Math.min(firstActive, Math.floor(sr * 0.004));
  const postTailSamples = Math.min(len - 1 - lastActive, Math.floor(sr * 0.04));
  const startIdx = Math.max(0, firstActive - preRollSamples);
  const endIdx = Math.min(len, lastActive + postTailSamples + 1);
  const outLen = Math.max(Math.floor(sr * 0.04), endIdx - startIdx);

  const out = ctx.createBuffer(numChannels, outLen, sr);
  const fadeInSamples = Math.min(Math.floor(sr * 0.003), Math.floor(outLen * 0.1));
  const fadeOutSamples = Math.min(Math.floor(sr * 0.018), Math.floor(outLen * 0.25));

  for (let c = 0; c < numChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = Math.min(len - 1, startIdx + i);
      let sample = src[srcIdx];
      if (i < fadeInSamples && fadeInSamples > 0) {
        sample *= i / fadeInSamples;
      }
      if (i >= outLen - fadeOutSamples && fadeOutSamples > 0) {
        sample *= (outLen - i) / fadeOutSamples;
      }
      dst[i] = sample;
    }
  }
  return out;
}

/**
 * Extracts a clean beat-length one-shot slice from an existing deck track buffer.
 */
export function sliceDeckOneShotBuffer(
  ctx: BaseAudioContext,
  sourceBuffer: AudioBuffer,
  startSec: number,
  durationSec: number
): AudioBuffer {
  const sr = sourceBuffer.sampleRate || 44100;
  const numChannels = Math.max(1, sourceBuffer.numberOfChannels);
  const startSample = Math.max(0, Math.min(sourceBuffer.length - 1, Math.floor(startSec * sr)));
  const desiredLen = Math.max(Math.floor(sr * 0.08), Math.floor(durationSec * sr));
  const outLen = Math.min(sourceBuffer.length - startSample, desiredLen);
  const safeOutLen = Math.max(1, outLen);

  const out = ctx.createBuffer(numChannels, safeOutLen, sr);
  const fadeIn = Math.min(Math.floor(sr * 0.004), Math.floor(safeOutLen * 0.1));
  const fadeOut = Math.min(Math.floor(sr * 0.025), Math.floor(safeOutLen * 0.35));

  for (let c = 0; c < numChannels; c++) {
    const src = sourceBuffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < safeOutLen; i++) {
      let s = src[startSample + i];
      if (i < fadeIn && fadeIn > 0) {
        s *= i / fadeIn;
      }
      if (i >= safeOutLen - fadeOut && fadeOut > 0) {
        s *= (safeOutLen - i) / fadeOut;
      }
      dst[i] = s;
    }
  }
  return out;
}

export interface QuantizedScheduleResult {
  delaySec: number;
  waitMs: number;
  gridStepLabel: string;
}

/**
 * Calculates exact delay in seconds to align a sampler one-shot trigger to the next
 * quantized beat subdivision (`1/4`, `1/2`, or `1` beat) locked to the active BPM grid.
 */
export function computeNextQuantizedTriggerDelay(params: {
  quantize: SamplerQuantizeMode;
  projectBpm: number;
  ctxCurrentTime: number;
  anchorDeck?: {
    isPlaying: boolean;
    trackTimeSec: number;
    firstBeatSec: number;
    trackBpm: number;
    playbackRate: number;
  } | null;
}): QuantizedScheduleResult {
  const { quantize, projectBpm, ctxCurrentTime, anchorDeck } = params;
  if (quantize === 'off') {
    return {
      delaySec: 0,
      waitMs: 0,
      gridStepLabel: 'FREE',
    };
  }

  const label =
    quantize === 0.25 ? '1/4B' : quantize === 0.5 ? '1/2B' : '1B';

  if (anchorDeck && anchorDeck.isPlaying && anchorDeck.trackBpm > 0) {
    const safeRate = Math.max(0.25, anchorDeck.playbackRate || 1);
    const trackBeatSec = 60 / Math.max(40, Math.min(240, anchorDeck.trackBpm));
    const trackGridSec = trackBeatSec * quantize;
    const elapsedFromBeatZero = anchorDeck.trackTimeSec - anchorDeck.firstBeatSec;
    const modTrack =
      ((elapsedFromBeatZero % trackGridSec) + trackGridSec) % trackGridSec;
    const remTrackSec = trackGridSec - modTrack;
    const realDelaySec = remTrackSec / safeRate;

    // If right on the beat (within 15ms), fire immediately for zero-slop feel
    if (modTrack / safeRate < 0.015 || realDelaySec < 0.012) {
      return { delaySec: 0, waitMs: 0, gridStepLabel: label };
    }
    return {
      delaySec: realDelaySec,
      waitMs: Math.round(realDelaySec * 1000),
      gridStepLabel: label,
    };
  }

  const safeBpm = Math.max(40, Math.min(240, projectBpm || 120));
  const gridSec = (60 / safeBpm) * quantize;
  const mod = ((ctxCurrentTime % gridSec) + gridSec) % gridSec;
  const remSec = gridSec - mod;

  if (mod < 0.015 || remSec < 0.012) {
    return { delaySec: 0, waitMs: 0, gridStepLabel: label };
  }

  return {
    delaySec: remSec,
    waitMs: Math.round(remSec * 1000),
    gridStepLabel: label,
  };
}

/**
 * Synthesizes punchy studio DJ one-shots cleanly using OfflineAudioContext.
 */
export async function synthesizeStarterOneShot(
  kind: SamplerStarterKind,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const durationMap: Record<SamplerStarterKind, number> = {
    kick: 0.42,
    clap: 0.34,
    hat: 0.28,
    horn: 0.85,
    riser: 1.15,
    sub: 0.68,
    stab: 0.45,
    rim: 0.16,
  };
  const duration = durationMap[kind];
  const off = new OfflineAudioContext(2, Math.floor(sampleRate * duration), sampleRate);

  if (kind === 'kick' || kind === 'sub') {
    const osc = off.createOscillator();
    const gain = off.createGain();
    osc.type = 'sine';
    const startFreq = kind === 'kick' ? 148 : 88;
    const endFreq = kind === 'kick' ? 44 : 36;
    osc.frequency.setValueAtTime(startFreq, 0);
    osc.frequency.exponentialRampToValueAtTime(endFreq, kind === 'kick' ? 0.085 : 0.28);
    gain.gain.setValueAtTime(0.95, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration - 0.02);
    osc.connect(gain);
    gain.connect(off.destination);
    osc.start(0);
    osc.stop(duration);
  } else if (kind === 'clap' || kind === 'hat' || kind === 'riser') {
    const noiseLen = Math.floor(sampleRate * duration);
    const noiseBuf = off.createBuffer(2, noiseLen, sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = noiseBuf.getChannelData(c);
      for (let i = 0; i < noiseLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    const noise = off.createBufferSource();
    noise.buffer = noiseBuf;
    const filter = off.createBiquadFilter();
    const gain = off.createGain();

    if (kind === 'clap') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1650, 0);
      filter.Q.setValueAtTime(1.4, 0);
      gain.gain.setValueAtTime(0.01, 0);
      gain.gain.linearRampToValueAtTime(0.9, 0.006);
      gain.gain.setValueAtTime(0.3, 0.018);
      gain.gain.linearRampToValueAtTime(0.85, 0.026);
      gain.gain.exponentialRampToValueAtTime(0.001, duration - 0.02);
    } else if (kind === 'hat') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7200, 0);
      gain.gain.setValueAtTime(0.65, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, duration - 0.01);
    } else {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(280, 0);
      filter.frequency.exponentialRampToValueAtTime(6400, duration - 0.08);
      filter.Q.setValueAtTime(2.6, 0);
      gain.gain.setValueAtTime(0.02, 0);
      gain.gain.linearRampToValueAtTime(0.75, duration - 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, duration - 0.01);
    }

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(off.destination);
    noise.start(0);
    noise.stop(duration);
  } else if (kind === 'horn' || kind === 'stab') {
    const freqs = kind === 'horn' ? [349.23, 440, 523.25] : [261.63, 311.13, 392.0, 466.16];
    const filter = off.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'horn' ? 3200 : 2600, 0);
    filter.frequency.exponentialRampToValueAtTime(900, duration - 0.05);
    const masterGain = off.createGain();
    masterGain.gain.setValueAtTime(0.01, 0);
    masterGain.gain.linearRampToValueAtTime(0.72, 0.015);
    masterGain.gain.setValueAtTime(0.65, duration * 0.55);
    masterGain.gain.exponentialRampToValueAtTime(0.001, duration - 0.02);
    filter.connect(masterGain);
    masterGain.connect(off.destination);

    freqs.forEach((f) => {
      const osc = off.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, 0);
      if (kind === 'horn') {
        osc.frequency.linearRampToValueAtTime(f * 0.985, duration);
      }
      osc.connect(filter);
      osc.start(0);
      osc.stop(duration);
    });
  } else {
    // rim
    const osc = off.createOscillator();
    const gain = off.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1180, 0);
    osc.frequency.exponentialRampToValueAtTime(420, 0.05);
    gain.gain.setValueAtTime(0.85, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration - 0.01);
    osc.connect(gain);
    gain.connect(off.destination);
    osc.start(0);
    osc.stop(duration);
  }

  return off.startRendering();
}

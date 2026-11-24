import { BeatState, FadeType, LyricLine } from '../types/studio';
import { createLyricId } from './lrcParser';

export interface DemoBeatPayload {
  audioBuffer: AudioBuffer;
  blob: Blob;
  blobUrl: string;
  fileName: string;
  trackTitle: string;
  artistName: string;
  lyrics: LyricLine[];
}

const DEMO_LYRICS_DATA: Array<{ time: number; text: string }> = [
  { time: 0.4, text: 'City lights flicker on the midnight glass' },
  { time: 3.8, text: 'Every frequency rises as the shadows pass' },
  { time: 7.4, text: 'Feel the sub-bass rolling underneath the street' },
  { time: 11.1, text: 'Neon horizons moving to a steady beat' },
  { time: 15.0, text: 'Turn the signal higher till the colors collide' },
  { time: 18.8, text: 'Chasing electric echoes on the midnight tide' },
  { time: 22.6, text: 'Hold the frame steady as the chorus breaks free' },
  { time: 26.4, text: 'Every pulse in motion is a memory' },
];

/**
 * Encodes an AudioBuffer into a stereo 16-bit PCM WAV Blob
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;
  let offset = 44;

  for (let i = 0; i < numFrames; i++) {
    const s0 = Math.max(-1, Math.min(1, ch0[i]));
    view.setInt16(offset, s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff, true);
    offset += 2;

    if (numChannels > 1) {
      const s1 = Math.max(-1, Math.min(1, ch1[i]));
      view.setInt16(offset, s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Generates a 32-second 120 BPM electronic synthwave beat using OfflineAudioContext
 */
export async function generateDemoBeat(): Promise<DemoBeatPayload> {
  const sampleRate = 44100;
  const duration = 32;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.82;
  masterGain.connect(offlineCtx.destination);

  // Subtle compressor to glue drums and synth together
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.15;
  compressor.connect(masterGain);

  // Pre-build noise buffer for snare & hi-hats
  const noiseBuffer = offlineCtx.createBuffer(1, sampleRate * 0.5, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const bpm = 120;
  const beatDur = 60 / bpm; // 0.5s per beat
  const totalBeats = Math.floor(duration / beatDur); // 64 beats

  // F minor progression across 4-bar phrases: Fm -> Db -> Ab -> Eb
  const bassNotes = [43.65, 34.65, 51.91, 38.89]; // F1, Db1, Ab1, Eb1
  const padChords = [
    [174.61, 207.65, 261.63], // Fm
    [138.59, 174.61, 207.65], // Db
    [207.65, 261.63, 311.13], // Ab
    [155.56, 196.0, 233.08],  // Eb
  ];
  const arpScale = [349.23, 415.3, 523.25, 622.25, 698.46, 523.25, 415.3, 392.0];

  for (let beat = 0; beat < totalBeats; beat++) {
    const t = beat * beatDur;
    const bar = Math.floor(beat / 4);
    const chordIdx = Math.floor(bar / 2) % 4;
    const isDrop = beat >= 16; // Fuller arrangement after beat 16

    // 1. Punchy Kick on every beat
    {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.95, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(compressor);
      osc.start(t);
      osc.stop(t + 0.3);
    }

    // 2. Snare / Clap on beats 2 & 4
    if (beat % 2 === 1) {
      const noise = offlineCtx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1850;
      filter.Q.value = 0.8;

      const gain = offlineCtx.createGain();
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);
      noise.start(t);
      noise.stop(t + 0.2);

      // Snare tonal body
      const bodyOsc = offlineCtx.createOscillator();
      const bodyGain = offlineCtx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(195, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
      bodyGain.gain.setValueAtTime(0.32, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(compressor);
      bodyOsc.start(t);
      bodyOsc.stop(t + 0.13);
    }

    // 3. Crisp 8th-note hi-hats
    for (let sub = 0; sub < 2; sub++) {
      const ht = t + sub * (beatDur / 2);
      const hat = offlineCtx.createBufferSource();
      hat.buffer = noiseBuffer;

      const hp = offlineCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7200;

      const gain = offlineCtx.createGain();
      const amp = sub === 1 ? 0.18 : 0.09;
      gain.gain.setValueAtTime(amp, ht);
      gain.gain.exponentialRampToValueAtTime(0.001, ht + 0.055);

      hat.connect(hp);
      hp.connect(gain);
      gain.connect(compressor);
      hat.start(ht);
      hat.stop(ht + 0.06);
    }

    // 4. Rolling 16th-note Synthwave Bassline
    const bassFreq = bassNotes[chordIdx];
    for (let step = 0; step < 4; step++) {
      const bt = t + step * (beatDur / 4);
      const osc = offlineCtx.createOscillator();
      osc.type = 'sawtooth';
      // Octave bounce on step 2
      osc.frequency.setValueAtTime(step === 2 ? bassFreq * 2 : bassFreq, bt);

      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isDrop ? 950 : 620, bt);
      filter.frequency.exponentialRampToValueAtTime(180, bt + 0.11);
      filter.Q.value = 3.2;

      const gain = offlineCtx.createGain();
      const sidechain = step === 0 ? 0.16 : 0.34;
      gain.gain.setValueAtTime(0.001, bt);
      gain.gain.linearRampToValueAtTime(sidechain, bt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, bt + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);
      osc.start(bt);
      osc.stop(bt + 0.125);
    }

    // 5. Lush Pad on start of every 2-bar chord change
    if (beat % 8 === 0 && t + 4 <= duration) {
      const notes = padChords[chordIdx];
      for (const freq of notes) {
        const osc1 = offlineCtx.createOscillator();
        const osc2 = offlineCtx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.005; // warm chorus detune

        const lp = offlineCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(700, t);
        lp.frequency.linearRampToValueAtTime(1600, t + 2.0);
        lp.frequency.linearRampToValueAtTime(800, t + 3.9);

        const gain = offlineCtx.createGain();
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.075, t + 0.45);
        gain.gain.setValueAtTime(0.075, t + 3.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 3.98);

        osc1.connect(lp);
        osc2.connect(lp);
        lp.connect(gain);
        gain.connect(compressor);
        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 4.0);
        osc2.stop(t + 4.0);
      }
    }

    // 6. Shimmering Lead Arp (active in second half & intro accent)
    if (isDrop || beat < 8) {
      for (let sub = 0; sub < 2; sub++) {
        const at = t + sub * (beatDur / 2);
        const noteIdx = (beat * 2 + sub) % arpScale.length;
        const freq = arpScale[noteIdx];

        const osc = offlineCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, at);

        const gain = offlineCtx.createGain();
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.linearRampToValueAtTime(isDrop ? 0.14 : 0.08, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.21);

        osc.connect(gain);
        gain.connect(compressor);
        osc.start(at);
        osc.stop(at + 0.22);
      }
    }
  }

  // Master fade out at very end (last 1.2s)
  masterGain.gain.setValueAtTime(0.82, duration - 1.2);
  masterGain.gain.linearRampToValueAtTime(0.0, duration);

  const audioBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(audioBuffer);
  const blobUrl = URL.createObjectURL(wavBlob);

  return {
    audioBuffer,
    blob: wavBlob,
    blobUrl,
    fileName: 'Neon Horizon (Demo Beat).wav',
    trackTitle: 'Neon Horizon',
    artistName: 'PulseWave Demo',
    lyrics: DEMO_LYRICS_DATA.map((item) => ({
      id: createLyricId(),
      time: item.time,
      text: item.text,
    })),
  };
}

/**
 * Extracts normalized waveform peak amplitudes (0..1) for the scrubber timeline
 */
export function extractWaveformPeaks(buffer: AudioBuffer, bucketCount = 200): number[] {
  const channel0 = buffer.getChannelData(0);
  const channel1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const totalSamples = channel0.length;
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / bucketCount));
  const peaks: number[] = new Array(bucketCount).fill(0);

  let maxPeak = 0.0001;
  for (let b = 0; b < bucketCount; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(totalSamples, start + samplesPerBucket);
    let peak = 0;
    // Step for speed on very long tracks while preserving transient accuracy
    const step = Math.max(1, Math.floor((end - start) / 64));
    for (let i = start; i < end; i += step) {
      const v0 = Math.abs(channel0[i]);
      const v1 = channel1 ? Math.abs(channel1[i]) : 0;
      const v = Math.max(v0, v1);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > maxPeak) maxPeak = peak;
  }

  // Normalize gently so quiet songs still show readable waveform peaks
  const norm = maxPeak > 0.05 ? 1 / maxPeak : 1;
  return peaks.map((p) => Math.min(1, p * norm));
}

/**
 * Computes a consistent global peak amplitude across an AudioBuffer so zoomed
 * waveform views maintain proportional dynamics.
 */
export function computeBufferMaxPeak(buffer: AudioBuffer): number {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const totalSamples = ch0.length;
  const step = Math.max(1, Math.floor(totalSamples / 16000));
  let maxPeak = 0.0001;

  for (let i = 0; i < totalSamples; i += step) {
    const v0 = Math.abs(ch0[i]);
    const v1 = ch1 ? Math.abs(ch1[i]) : 0;
    const v = v0 > v1 ? v0 : v1;
    if (v > maxPeak) maxPeak = v;
  }

  return maxPeak;
}

/**
 * Extracts high-resolution normalized waveform peaks (0..1) for a specific [startSec, endSec] time window.
 */
export function extractWaveformWindowPeaks(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  bucketCount: number,
  globalMaxPeak?: number
): number[] {
  const count = Math.max(16, Math.floor(bucketCount));
  const safeDur = Math.max(0.01, buffer.duration);
  const clampedStart = Math.max(0, Math.min(safeDur, startSec));
  const clampedEnd = Math.max(clampedStart + 0.01, Math.min(safeDur, endSec));

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const totalSamples = ch0.length;
  const sampleRate = buffer.sampleRate;

  const startSample = Math.max(0, Math.min(totalSamples - 1, Math.floor(clampedStart * sampleRate)));
  const endSample = Math.max(startSample + 1, Math.min(totalSamples, Math.ceil(clampedEnd * sampleRate)));
  const spanSamples = endSample - startSample;

  const peaks: number[] = new Array(count).fill(0);
  let localMax = 0.0001;

  for (let b = 0; b < count; b++) {
    const bStart = startSample + Math.floor((b / count) * spanSamples);
    const bEnd = Math.min(
      endSample,
      Math.max(bStart + 1, startSample + Math.floor(((b + 1) / count) * spanSamples))
    );
    const step = Math.max(1, Math.floor((bEnd - bStart) / 64));
    let peak = 0;
    for (let i = bStart; i < bEnd; i += step) {
      const v0 = Math.abs(ch0[i]);
      const v1 = ch1 ? Math.abs(ch1[i]) : 0;
      const v = v0 > v1 ? v0 : v1;
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > localMax) localMax = peak;
  }

  const refMax = globalMaxPeak && globalMaxPeak > 0.05 ? globalMaxPeak : localMax;
  const norm = refMax > 0.05 ? 1 / refMax : 1;
  return peaks.map((p) => Math.min(1, p * norm));
}

/**
 * Evaluates a normalized fade gain in [0, 1] for progress p in [0, 1] (0 = silence, 1 = unity)
 */
export function computeFadeGain(progress: number, fadeType: FadeType): number {
  const p = Math.max(0, Math.min(1, progress));
  switch (fadeType) {
    case 'logarithmic':
      // Concave curve: fast initial rise / slow initial decay (log10(1 + 9p) in [0, 1])
      return Math.log10(1 + 9 * p);
    case 'exponential':
      // Convex curve: gentle initial swell / rapid fade-out tail ((e^(3p) - 1) / (e^3 - 1))
      return Math.expm1(3 * p) / Math.expm1(3);
    case 'linear':
    default:
      return p;
  }
}

/**
 * Slices an AudioBuffer between [trimStart, trimEnd] and applies a 0.15s fade-in/fade-out
 * using the selected mathematical fade curve.
 */
export function sliceAudioBufferWithFade(
  source: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  fadeSec = 0.15,
  fadeType: FadeType = 'linear'
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const safeStart = Math.max(0, Math.min(trimStart, source.duration));
  const safeEnd = Math.max(safeStart + 0.1, Math.min(trimEnd, source.duration));

  const startSample = Math.floor(safeStart * sampleRate);
  const endSample = Math.min(source.length, Math.floor(safeEnd * sampleRate));
  const length = Math.max(1, endSample - startSample);
  const numChannels = source.numberOfChannels;

  // Allocate target AudioBuffer directly without spinning up an OfflineAudioContext
  const sliced = new AudioBuffer({
    numberOfChannels: numChannels,
    length,
    sampleRate,
  });

  const actualFadeSamples = Math.min(
    Math.floor(fadeSec * sampleRate),
    Math.floor(length * 0.25)
  );

  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = sliced.getChannelData(ch);

    for (let i = 0; i < length; i++) {
      let sample = srcData[startSample + i] ?? 0;

      if (actualFadeSamples > 0) {
        if (i < actualFadeSamples) {
          const progress = i / actualFadeSamples;
          sample *= computeFadeGain(progress, fadeType);
        } else if (i >= length - actualFadeSamples) {
          const remaining = length - 1 - i;
          const progress = remaining / actualFadeSamples;
          sample *= computeFadeGain(progress, fadeType);
        }
      }

      dstData[i] = sample;
    }
  }

  return sliced;
}

export interface PcmAudioInput {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  channels: Float32Array[];
}

function getInputChannels(buffer: AudioBuffer | PcmAudioInput): {
  sampleRate: number;
  length: number;
  ch0: Float32Array;
  ch1: Float32Array | null;
} {
  if ('getChannelData' in buffer) {
    return {
      sampleRate: buffer.sampleRate,
      length: buffer.length,
      ch0: buffer.getChannelData(0),
      ch1: buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null,
    };
  }
  return {
    sampleRate: buffer.sampleRate,
    length: buffer.length,
    ch0: buffer.channels[0],
    ch1: buffer.numberOfChannels > 1 ? buffer.channels[1] ?? null : null,
  };
}

/**
 * Fast mathematical N/2-packed Real-to-Complex Radix-2 FFT Analyzer for deterministic
 * offline frame-by-frame frequency & waveform extraction matching Web Audio API AnalyserNode.
 */
export class OfflineAudioAnalyzer {
  private readonly fftSize: number;
  private readonly halfN: number;
  private readonly binCount: number;
  private readonly monoSamples: Float32Array;
  private readonly sampleRate: number;
  private readonly hannWindow: Float32Array;
  private readonly real: Float32Array;
  private readonly imag: Float32Array;
  private readonly prevMagnitudes: Float32Array;
  private readonly bitRev: Uint16Array;
  private readonly stageCos: Float32Array[];
  private readonly stageSin: Float32Array[];
  private readonly unpackCos: Float32Array;
  private readonly unpackSin: Float32Array;
  private readonly minDecibels = -100;
  private readonly maxDecibels = -28;

  constructor(buffer: AudioBuffer | PcmAudioInput, fftSize = 2048) {
    this.fftSize = fftSize;
    this.halfN = fftSize >> 1;
    this.binCount = this.halfN;

    const { sampleRate, length, ch0, ch1 } = getInputChannels(buffer);
    this.sampleRate = sampleRate;

    // Mix down to mono once for rapid FFT slicing
    this.monoSamples = new Float32Array(length);
    if (ch1) {
      for (let i = 0; i < length; i++) {
        this.monoSamples[i] = 0.5 * (ch0[i] + ch1[i]);
      }
    } else {
      this.monoSamples.set(ch0);
    }

    this.hannWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      this.hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    // Half-size complex buffers for N-point real FFT via N/2 complex FFT
    const M = this.halfN;
    this.real = new Float32Array(M);
    this.imag = new Float32Array(M);
    this.prevMagnitudes = new Float32Array(this.binCount);

    // Precompute bit-reversal table for M-point complex FFT
    this.bitRev = new Uint16Array(M);
    const logM = Math.round(Math.log2(M));
    for (let i = 0; i < M; i++) {
      let x = i;
      let rev = 0;
      for (let b = 0; b < logM; b++) {
        rev = (rev << 1) | (x & 1);
        x >>= 1;
      }
      this.bitRev[i] = rev;
    }

    // Precompute butterfly twiddle tables per stage
    this.stageCos = [];
    this.stageSin = [];
    for (let len = 2; len <= M; len <<= 1) {
      const half = len >> 1;
      const cosArr = new Float32Array(half);
      const sinArr = new Float32Array(half);
      const step = (-2 * Math.PI) / len;
      for (let k = 0; k < half; k++) {
        cosArr[k] = Math.cos(step * k);
        sinArr[k] = Math.sin(step * k);
      }
      this.stageCos.push(cosArr);
      this.stageSin.push(sinArr);
    }

    // Precompute unpack twiddle factors for N-point real spectrum extraction
    this.unpackCos = new Float32Array(M);
    this.unpackSin = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      const ang = (-2 * Math.PI * k) / fftSize;
      this.unpackCos[k] = Math.cos(ang);
      this.unpackSin[k] = Math.sin(ang);
    }
  }

  public analyzeAt(
    timeSec: number,
    smoothing: number,
    outFreq: Uint8Array,
    outWave: Uint8Array
  ): void {
    const N = this.fftSize;
    const M = this.halfN;
    const mono = this.monoSamples;
    const monoLen = mono.length;
    const hann = this.hannWindow;
    const reArr = this.real;
    const imArr = this.imag;
    const centerSample = Math.floor(timeSec * this.sampleRate);
    const startSample = centerSample - M;
    const waveLen = outWave.length;

    // 1. Fill time-domain bytes & pack real signal (even -> real, odd -> imag)
    for (let k = 0; k < M; k++) {
      const i0 = k << 1;
      const i1 = i0 + 1;
      const idx0 = startSample + i0;
      const idx1 = startSample + i1;
      const s0 = idx0 >= 0 && idx0 < monoLen ? mono[idx0] : 0;
      const s1 = idx1 >= 0 && idx1 < monoLen ? mono[idx1] : 0;

      if (i0 < waveLen) {
        const c0 = s0 < -1 ? -1 : s0 > 1 ? 1 : s0;
        outWave[i0] = ((c0 * 0.5 + 0.5) * 255 + 0.5) | 0;
      }
      if (i1 < waveLen) {
        const c1 = s1 < -1 ? -1 : s1 > 1 ? 1 : s1;
        outWave[i1] = ((c1 * 0.5 + 0.5) * 255 + 0.5) | 0;
      }

      reArr[k] = s0 * hann[i0];
      imArr[k] = s1 * hann[i1];
    }

    // 2. M-point in-place Radix-2 FFT using precomputed bit-reversal & twiddle tables
    const bitRev = this.bitRev;
    for (let i = 0; i < M; i++) {
      const j = bitRev[i];
      if (i < j) {
        const tr = reArr[i];
        reArr[i] = reArr[j];
        reArr[j] = tr;
        const ti = imArr[i];
        imArr[i] = imArr[j];
        imArr[j] = ti;
      }
    }

    let stageIdx = 0;
    for (let len = 2; len <= M; len <<= 1) {
      const half = len >> 1;
      const cosArr = this.stageCos[stageIdx];
      const sinArr = this.stageSin[stageIdx];
      stageIdx++;

      for (let i = 0; i < M; i += len) {
        for (let k = 0; k < half; k++) {
          const evenIdx = i + k;
          const oddIdx = evenIdx + half;
          const wRe = cosArr[k];
          const wIm = sinArr[k];

          const oddRe = reArr[oddIdx] * wRe - imArr[oddIdx] * wIm;
          const oddIm = reArr[oddIdx] * wIm + imArr[oddIdx] * wRe;

          reArr[oddIdx] = reArr[evenIdx] - oddRe;
          imArr[oddIdx] = imArr[evenIdx] - oddIm;
          reArr[evenIdx] += oddRe;
          imArr[evenIdx] += oddIm;
        }
      }
    }

    // 3. Unpack N-point real FFT bins [0 .. M-1] and convert to smoothed dB-scaled bytes
    const invN2 = 2 / N;
    const minDb = this.minDecibels;
    const invRangeDb = 1 / (this.maxDecibels - minDb);
    const smooth = smoothing < 0 ? 0 : smoothing > 0.95 ? 0.95 : smoothing;
    const oneMinusSmooth = 1 - smooth;
    const bins = M < outFreq.length ? M : outFreq.length;
    const prevMags = this.prevMagnitudes;
    const uCos = this.unpackCos;
    const uSin = this.unpackSin;
    const log10Scale = 20 * Math.LOG10E;

    // Bin 0 (DC): F[0] = Z_re[0] + Z_im[0]
    if (bins > 0) {
      const mag0 = Math.abs(reArr[0] + imArr[0]) * invN2;
      const sm0 = smooth * prevMags[0] + oneMinusSmooth * mag0;
      prevMags[0] = sm0;
      const db0 = sm0 > 1e-7 ? log10Scale * Math.log(sm0) : minDb;
      const norm0 = (db0 - minDb) * invRangeDb;
      outFreq[0] = norm0 <= 0 ? 0 : norm0 >= 1 ? 255 : (norm0 * 255 + 0.5) | 0;
    }

    for (let k = 1; k < bins; k++) {
      const mk = M - k;
      const zkRe = reArr[k];
      const zkIm = imArr[k];
      const zmkRe = reArr[mk];
      const zmkIm = imArr[mk];

      const evenRe = 0.5 * (zkRe + zmkRe);
      const evenIm = 0.5 * (zkIm - zmkIm);
      const oddRe = 0.5 * (zkIm + zmkIm);
      const oddIm = 0.5 * (zmkRe - zkRe);

      const c = uCos[k];
      const s = uSin[k];
      const re = evenRe + (c * oddRe - s * oddIm);
      const im = evenIm + (c * oddIm + s * oddRe);

      const mag = Math.sqrt(re * re + im * im) * invN2;
      const smoothedMag = smooth * prevMags[k] + oneMinusSmooth * mag;
      prevMags[k] = smoothedMag;

      const db = smoothedMag > 1e-7 ? log10Scale * Math.log(smoothedMag) : minDb;
      const norm = (db - minDb) * invRangeDb;
      outFreq[k] = norm <= 0 ? 0 : norm >= 1 ? 255 : (norm * 255 + 0.5) | 0;
    }
  }
}

/**
 * Slices [trimStart, trimEnd] from an AudioBuffer, downsamples to 16kHz mono 16-bit PCM WAV,
 * and returns a base64 string (~32 KB/s) suitable for server-side Gemini audio transcription.
 */
export function audioBufferToCompactWavBase64(
  source: AudioBuffer,
  trimStart: number,
  trimEnd: number
): { base64: string; mimeType: string; durationSec: number } {
  const targetRate = 16000;
  const srcRate = source.sampleRate;
  const safeStart = Math.max(0, Math.min(trimStart, source.duration));
  const safeEnd = Math.max(safeStart + 0.2, Math.min(trimEnd, source.duration));
  // Cap single transcription upload at 180 seconds (~5.7 MB WAV)
  const durationSec = Math.min(180, safeEnd - safeStart);

  const startSample = Math.floor(safeStart * srcRate);
  const srcLength = Math.min(
    source.length - startSample,
    Math.floor(durationSec * srcRate)
  );
  const outLength = Math.max(1, Math.floor(durationSec * targetRate));

  const ch0 = source.getChannelData(0);
  const ch1 = source.numberOfChannels > 1 ? source.getChannelData(1) : null;

  const dataSize = outLength * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const ratio = srcLength / outLength;
  let offset = 44;
  for (let i = 0; i < outLength; i++) {
    const srcPos = startSample + i * ratio;
    const idx0 = Math.min(source.length - 1, Math.floor(srcPos));
    const idx1 = Math.min(source.length - 1, idx0 + 1);
    const frac = srcPos - idx0;

    const s0 = ch1 ? 0.5 * (ch0[idx0] + ch1[idx0]) : ch0[idx0];
    const s1 = ch1 ? 0.5 * (ch0[idx1] + ch1[idx1]) : ch0[idx1];
    const sample = Math.max(-1, Math.min(1, s0 + (s1 - s0) * frac));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return {
    base64: btoa(binary),
    mimeType: 'audio/wav',
    durationSec,
  };
}

export function createInitialBeatState(): BeatState {
  return {
    rollingEnergy: 0.04,
    cooldown: 0,
    burstIntensity: 0,
    lastEnergy: 0,
    shockwaves: [],
  };
}

/**
 * Computes RMS energy (0..1) from a low-pass filtered time-domain Uint8Array (center 128)
 */
export function computeLowPassRms(timeDomainBytes: Uint8Array): number {
  const len = timeDomainBytes.length;
  if (len === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const norm = (timeDomainBytes[i] - 128) / 128;
    sumSq += norm * norm;
  }
  return Math.min(1, Math.sqrt(sumSq / len) * 1.45);
}

/**
 * Advances adaptive bass-drum beat detection and shockwave animations
 */
export function stepBeatDetector(
  state: BeatState,
  lowPassRms: number,
  dt: number,
  beatSensitivity: number,
  minDim: number,
  primaryColor: string,
  secondaryColor: string
): { triggered: boolean; burstIntensity: number } {
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.lastEnergy = lowPassRms;

  // Adaptive rolling energy floor
  state.rollingEnergy = state.rollingEnergy * 0.94 + lowPassRms * 0.06;

  // Higher beatSensitivity lowers the required spike multiplier
  const spikeMultiplier = Math.max(1.12, 1.82 - beatSensitivity * 0.34);
  const minFloor = Math.max(0.055, 0.14 - beatSensitivity * 0.04);
  const threshold = Math.max(minFloor, state.rollingEnergy * spikeMultiplier);

  let triggered = false;
  if (lowPassRms > threshold && state.cooldown <= 0) {
    triggered = true;
    state.burstIntensity = 1.0;
    state.cooldown = 0.16; // 160ms refractory guard against double-triggering

    if (state.shockwaves.length >= 6) {
      state.shockwaves.shift();
    }
    state.shockwaves.push({
      radius: minDim * 0.08,
      maxRadius: minDim * 0.56,
      alpha: 0.92,
      color: state.shockwaves.length % 2 === 0 ? primaryColor : secondaryColor,
    });
  }

  // Smooth exponential decay on burst envelope & expanding shockwaves
  state.burstIntensity *= Math.exp(-dt * 8.5);
  if (state.burstIntensity < 0.005) state.burstIntensity = 0;

  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const sw = state.shockwaves[i];
    sw.radius += dt * minDim * 0.95;
    sw.alpha *= Math.exp(-dt * 4.4);
    if (sw.alpha < 0.02 || sw.radius >= sw.maxRadius) {
      state.shockwaves.splice(i, 1);
    }
  }

  return { triggered, burstIntensity: state.burstIntensity };
}

/**
 * Offline 2nd-order Biquad Low-Pass Filter (140 Hz, Q = 1.2) matching Web Audio API
 * BiquadFilterNode so offline MP4 exports match live beat-detection bursts.
 */
export class OfflineLowPassBeatTracker {
  private readonly filteredMono: Float32Array;
  private readonly sampleRate: number;
  private prevStart = -1;
  private prevWindowSize = 0;
  private prevSumSq = 0;

  constructor(buffer: AudioBuffer | PcmAudioInput, cutoffHz = 140, q = 1.2) {
    const { sampleRate, length: len, ch0, ch1 } = getInputChannels(buffer);
    this.sampleRate = sampleRate;

    // Biquad low-pass coefficients (RBJ Audio EQ Cookbook / Web Audio spec)
    const w0 = (2 * Math.PI * cutoffHz) / this.sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * q);

    const b0 = (1 - cosW0) / 2;
    const b1 = 1 - cosW0;
    const b2 = (1 - cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    const nb0 = b0 / a0;
    const nb1 = b1 / a0;
    const nb2 = b2 / a0;
    const na1 = a1 / a0;
    const na2 = a2 / a0;

    this.filteredMono = new Float32Array(len);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;

    if (ch1) {
      for (let i = 0; i < len; i++) {
        const x0 = 0.5 * (ch0[i] + ch1[i]);
        const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
        this.filteredMono[i] = y0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
      }
    } else {
      for (let i = 0; i < len; i++) {
        const x0 = ch0[i];
        const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
        this.filteredMono[i] = y0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
      }
    }
  }

  public getLowPassRmsAt(timeSec: number, windowSize = 1024): number {
    const arr = this.filteredMono;
    const len = arr.length;
    const center = Math.floor(timeSec * this.sampleRate);
    const start = center - (windowSize >> 1);
    const end = start + windowSize;

    let sumSq = 0;
    if (
      this.prevWindowSize === windowSize &&
      start >= this.prevStart &&
      start < this.prevStart + windowSize &&
      start - this.prevStart <= (windowSize >> 1) &&
      start >= 0 &&
      end <= len
    ) {
      // Incremental sliding-window update when advancing monotonically inside bounds
      sumSq = this.prevSumSq;
      for (let idx = this.prevStart; idx < start; idx++) {
        const v = arr[idx];
        sumSq -= v * v;
      }
      for (let idx = this.prevStart + windowSize; idx < end; idx++) {
        const v = arr[idx];
        sumSq += v * v;
      }
      if (sumSq < 0) sumSq = 0;
    } else {
      const clampedStart = start > 0 ? start : 0;
      const clampedEnd = end < len ? end : len;
      for (let idx = clampedStart; idx < clampedEnd; idx++) {
        const sample = arr[idx];
        sumSq += sample * sample;
      }
    }

    if (start >= 0 && end <= len) {
      this.prevStart = start;
      this.prevWindowSize = windowSize;
      this.prevSumSq = sumSq;
    } else {
      this.prevStart = -1;
    }

    return Math.min(1, Math.sqrt(sumSq / windowSize) * 1.45);
  }
}


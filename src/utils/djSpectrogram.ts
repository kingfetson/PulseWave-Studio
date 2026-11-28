export type DjSpectrogramMode = 'overlay' | 'full' | 'off';

export interface DjSpectrogramData {
  cols: number;
  rows: number;
  minFreqHz: number;
  maxFreqHz: number;
  /** Row-major [col * rows + row] where row 0 = lowest freq (45 Hz), rows-1 = highest freq (11 kHz), 0..255 */
  cells: Uint8Array;
  /** Per-column normalized band intensities 0..255 for frequency-colored waveform peaks */
  kickPeaks: Uint8Array;
  melodicPeaks: Uint8Array;
  snarePeaks: Uint8Array;
}

const FFT_SIZE = 512;
const HALF_FFT = FFT_SIZE / 2;

// Precomputed Hann window and radix-2 FFT bit-reversal & twiddle tables
const HANN_WINDOW = new Float32Array(FFT_SIZE);
const BIT_REV = new Uint16Array(FFT_SIZE);
const COS_TABLE = new Float32Array(HALF_FFT);
const SIN_TABLE = new Float32Array(HALF_FFT);

(() => {
  for (let i = 0; i < FFT_SIZE; i++) {
    HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  const bits = Math.round(Math.log2(FFT_SIZE));
  for (let i = 0; i < FFT_SIZE; i++) {
    let rev = 0;
    for (let b = 0; b < bits; b++) {
      rev = (rev << 1) | ((i >> b) & 1);
    }
    BIT_REV[i] = rev;
  }
  for (let i = 0; i < HALF_FFT; i++) {
    const angle = (-2 * Math.PI * i) / FFT_SIZE;
    COS_TABLE[i] = Math.cos(angle);
    SIN_TABLE[i] = Math.sin(angle);
  }
})();

function fft512(re: Float32Array, im: Float32Array): void {
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = BIT_REV[i];
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const stride = FFT_SIZE / size;
    for (let start = 0; start < FFT_SIZE; start += size) {
      for (let k = 0; k < half; k++) {
        const twIdx = k * stride;
        const wr = COS_TABLE[twIdx];
        const wi = SIN_TABLE[twIdx];
        const evenIdx = start + k;
        const oddIdx = evenIdx + half;
        const or = re[oddIdx];
        const oi = im[oddIdx];
        const tr = wr * or - wi * oi;
        const ti = wr * oi + wi * or;
        re[oddIdx] = re[evenIdx] - tr;
        im[oddIdx] = im[evenIdx] - ti;
        re[evenIdx] += tr;
        im[evenIdx] += ti;
      }
    }
  }
}

/**
 * Extracts a 2D log-frequency STFT spectrogram matrix + per-column Kick / Melodic / Snare
 * intensity envelopes over [startSec, endSec].
 */
export function extractSpectrogramWindow(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  cols = 160,
  rows = 24
): DjSpectrogramData {
  const minFreqHz = 45;
  const maxFreqHz = 11025;
  const cells = new Uint8Array(cols * rows);
  const kickPeaks = new Uint8Array(cols);
  const melodicPeaks = new Uint8Array(cols);
  const snarePeaks = new Uint8Array(cols);

  const sr = Math.max(8000, buffer.sampleRate);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const totalSamples = ch0.length;
  if (totalSamples <= 0 || cols <= 0 || rows <= 0) {
    return { cols, rows, minFreqHz, maxFreqHz, cells, kickPeaks, melodicPeaks, snarePeaks };
  }

  // Decimate by 2 for 44.1/48 kHz -> ~22.05/24 kHz effective rate (~43 Hz bin resolution)
  const decim = Math.max(1, Math.floor(sr / 22050));
  const srEff = sr / decim;
  const nyquistEff = srEff * 0.5;
  const effectiveMaxHz = Math.min(maxFreqHz, nyquistEff * 0.96);
  const binHz = srEff / FFT_SIZE;

  // Precompute logarithmic frequency bin ranges for each vertical spectrogram row
  const rowBinLo = new Float32Array(rows);
  const rowBinHi = new Float32Array(rows);
  const logRatio = Math.log(effectiveMaxHz / minFreqHz);
  for (let r = 0; r < rows; r++) {
    const f0 = minFreqHz * Math.exp((r / rows) * logRatio);
    const f1 = minFreqHz * Math.exp(((r + 1) / rows) * logRatio);
    rowBinLo[r] = Math.max(1, Math.min(HALF_FFT - 2, f0 / binHz));
    rowBinHi[r] = Math.max(rowBinLo[r] + 0.35, Math.min(HALF_FFT - 1, f1 / binHz));
  }

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(HALF_FFT);

  const rawSpanSamples = FFT_SIZE * decim;
  const winSpan = Math.max(0.05, endSec - startSec);
  const rawRowEnergy = new Float32Array(cols * rows);
  const rawKick = new Float32Array(cols);
  const rawMelodic = new Float32Array(cols);
  const rawSnare = new Float32Array(cols);

  let maxKick = 1e-6;
  let maxMelodic = 1e-6;
  let maxSnare = 1e-6;

  // FFT bin boundaries for 3 primary DJ frequency bands
  const kickEndBin = Math.max(2, Math.min(HALF_FFT - 1, Math.round(220 / binHz)));
  const melodicEndBin = Math.max(kickEndBin + 2, Math.min(HALF_FFT - 1, Math.round(2400 / binHz)));
  const snareEndBin = Math.max(melodicEndBin + 2, Math.min(HALF_FFT - 1, Math.round(10500 / binHz)));

  for (let c = 0; c < cols; c++) {
    const tCenter = startSec + ((c + 0.5) / cols) * winSpan;
    if (tCenter < 0 || tCenter > buffer.duration) continue;

    const centerSample = Math.round(tCenter * sr);
    const startSample = Math.max(
      0,
      Math.min(totalSamples - rawSpanSamples, centerSample - Math.floor(rawSpanSamples * 0.5))
    );
    if (startSample + rawSpanSamples > totalSamples) continue;

    let mean = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const base = startSample + i * decim;
      let acc = 0;
      for (let d = 0; d < decim; d++) {
        const idx = base + d;
        acc += ch1 ? 0.5 * (ch0[idx] + ch1[idx]) : ch0[idx];
      }
      const s = acc / decim;
      re[i] = s;
      mean += s;
    }
    mean /= FFT_SIZE;

    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (re[i] - mean) * HANN_WINDOW[i];
      im[i] = 0;
    }

    fft512(re, im);

    for (let k = 1; k < HALF_FFT; k++) {
      const m = Math.hypot(re[k], im[k]) / (FFT_SIZE * 0.35);
      // Slight high-frequency spectral tilt compensation (+3dB/octave style boost)
      // so snares & hi-hats show clear intensity alongside sub kicks
      const tilt = 1 + (k / HALF_FFT) * 2.4;
      mag[k] = m * tilt;
    }

    // Aggregate Kick / Melodic / Snare band RMS energy for frequency-colored peaks
    let kickSum = 0;
    for (let k = 1; k <= kickEndBin; k++) kickSum += mag[k] * mag[k];
    const kickRms = Math.sqrt(kickSum / Math.max(1, kickEndBin));

    let melodicSum = 0;
    for (let k = kickEndBin + 1; k <= melodicEndBin; k++) melodicSum += mag[k] * mag[k];
    const melodicRms = Math.sqrt(melodicSum / Math.max(1, melodicEndBin - kickEndBin));

    let snareSum = 0;
    for (let k = melodicEndBin + 1; k <= snareEndBin; k++) snareSum += mag[k] * mag[k];
    const snareRms = Math.sqrt(snareSum / Math.max(1, snareEndBin - melodicEndBin));

    rawKick[c] = kickRms;
    rawMelodic[c] = melodicRms;
    rawSnare[c] = snareRms;
    if (kickRms > maxKick) maxKick = kickRms;
    if (melodicRms > maxMelodic) maxMelodic = melodicRms;
    if (snareRms > maxSnare) maxSnare = snareRms;

    // Sample peak magnitude within each log-frequency spectrogram row
    for (let r = 0; r < rows; r++) {
      const bLo = rowBinLo[r];
      const bHi = rowBinHi[r];
      const kStart = Math.floor(bLo);
      const kEnd = Math.min(HALF_FFT - 1, Math.ceil(bHi));
      let peak = 0;
      if (kStart === kEnd) {
        const frac = bLo - Math.floor(bLo);
        const m0 = mag[kStart];
        const m1 = mag[Math.min(HALF_FFT - 1, kStart + 1)];
        peak = m0 + (m1 - m0) * frac;
      } else {
        for (let k = kStart; k <= kEnd; k++) {
          if (mag[k] > peak) peak = mag[k];
        }
      }
      // Perceptual dB scale [-50 dB .. -3 dB] -> [0 .. 1]
      const db = 20 * Math.log10(peak + 1e-5);
      const norm = Math.max(0, Math.min(1, (db + 50) / 47));
      rawRowEnergy[c * rows + r] = norm;
    }
  }

  for (let c = 0; c < cols; c++) {
    // Soft power curve enhances transient contrast between kicks, snares, and sustain
    kickPeaks[c] = Math.min(255, Math.round(Math.pow(rawKick[c] / maxKick, 0.72) * 255));
    melodicPeaks[c] = Math.min(255, Math.round(Math.pow(rawMelodic[c] / maxMelodic, 0.72) * 255));
    snarePeaks[c] = Math.min(255, Math.round(Math.pow(rawSnare[c] / maxSnare, 0.72) * 255));
    for (let r = 0; r < rows; r++) {
      const v = rawRowEnergy[c * rows + r];
      cells[c * rows + r] = Math.min(255, Math.round(Math.pow(v, 0.9) * 255));
    }
  }

  return { cols, rows, minFreqHz, maxFreqHz, cells, kickPeaks, melodicPeaks, snarePeaks };
}

/**
 * Maps spectrogram cell frequency band (rowFrac 0=sub/kick -> 1=snare/hats) + intensity (0..1)
 * to a vivid frequency-intensity RGBA string.
 */
export function spectrogramIntensityToRgba(
  rowFrac: number,
  intensity: number,
  alphaMult = 1
): string {
  const t = Math.max(0, Math.min(1, intensity));
  if (t < 0.05) return 'rgba(0,0,0,0)';

  let r = 0;
  let g = 0;
  let b = 0;

  if (rowFrac < 0.3) {
    // Sub & Bass Kicks (45 - 240 Hz): Deep Crimson -> Hot Red-Orange -> Bright Peach Peak
    if (t < 0.65) {
      const k = t / 0.65;
      r = 155 + k * 95;
      g = 18 + k * 76;
      b = 58 - k * 14;
    } else {
      const k = (t - 0.65) / 0.35;
      r = 250 + k * 5;
      g = 94 + k * 124;
      b = 44 + k * 110;
    }
  } else if (rowFrac < 0.68) {
    // Melodic Basslines, Keys, Vocals & Snare Body (240 Hz - 2.4 kHz): Teal -> Emerald/Cyan -> Ice Cyan
    if (t < 0.65) {
      const k = t / 0.65;
      r = 8 + k * 28;
      g = 95 + k * 118;
      b = 115 + k * 125;
    } else {
      const k = (t - 0.65) / 0.35;
      r = 36 + k * 165;
      g = 213 + k * 38;
      b = 240 + k * 15;
    }
  } else {
    // Snare Crack, Claps & Hi-Hats (2.4 - 11 kHz): Violet -> Amber-Gold -> White-Hot Peak
    if (t < 0.6) {
      const k = t / 0.6;
      r = 110 + k * 135;
      g = 52 + k * 136;
      b = 210 - k * 125;
    } else {
      const k = (t - 0.6) / 0.4;
      r = 245 + k * 10;
      g = 188 + k * 64;
      b = 85 + k * 162;
    }
  }

  const alpha = Math.min(0.92, (0.14 + t * 0.76) * alphaMult);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha.toFixed(2)})`;
}

/**
 * Computes a blended waveform peak color based on relative Kick (low), Melodic (mid),
 * and Snare/Hat (high) spectral intensity at a specific time column.
 */
export function frequencyPeakToColor(
  kickNorm: number,
  melodicNorm: number,
  snareNorm: number,
  overallNorm: number,
  played: boolean
): string {
  const k = Math.max(0, kickNorm);
  const m = Math.max(0, melodicNorm);
  const s = Math.max(0, snareNorm);
  const total = k + m + s + 1e-4;

  const wk = k / total;
  const wm = m / total;
  const ws = s / total;

  // Bass Kick = Crimson-Coral (251, 90, 72)
  // Melodic = Electric Cyan-Emerald (34, 218, 224)
  // Snare/Hat = Warm Amber-Gold / Magenta Lift (250, 204, 65)
  let r = wk * 251 + wm * 34 + ws * 250;
  let g = wk * 90 + wm * 218 + ws * 204;
  let b = wk * 72 + wm * 224 + ws * 65;

  // High-intensity peak whitening so hard transients pop cleanly
  const boost = Math.max(0, overallNorm - 0.68) / 0.32;
  r = Math.min(255, r + boost * (255 - r) * 0.55);
  g = Math.min(255, g + boost * (255 - g) * 0.55);
  b = Math.min(255, b + boost * (255 - b) * 0.55);

  const alpha = played ? 0.64 + overallNorm * 0.34 : 0.3 + overallNorm * 0.28;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha.toFixed(2)})`;
}

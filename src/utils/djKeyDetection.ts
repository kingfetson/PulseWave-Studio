export interface CamelotKeyEntry {
  camelotKey: string;
  number: number; // 1..12
  letter: 'A' | 'B';
  musicalKey: string;
  fullName: string;
  rootPitchClass: number; // 0=C .. 11=B
  mode: 'minor' | 'major';
  colorHex: string;
}

export interface DetectedMusicalKey {
  musicalKey: string;
  camelotKey: string;
  fullName: string;
  mode: 'minor' | 'major';
  confidence: number; // 0..1
  colorHex: string;
}

export type HarmonicMatchTier =
  | 'perfect'
  | 'harmonic'
  | 'relative'
  | 'energy'
  | 'clash'
  | 'unknown';

export interface HarmonicCompatibilityResult {
  tier: HarmonicMatchTier;
  isCompatible: boolean;
  label: string;
  detail: string;
  score: number; // 0..100
  accentHex: string;
  recommendedTargets: string[];
}

const CAMELOT_WHEEL_COLORS: Record<number, string> = {
  1: '#2dd4bf', // Teal
  2: '#34d399', // Emerald
  3: '#4ade80', // Green
  4: '#a3e635', // Lime
  5: '#facc15', // Yellow
  6: '#fbbf24', // Amber
  7: '#fb923c', // Orange
  8: '#f87171', // Coral Red
  9: '#f472b6', // Rose Pink
  10: '#c084fc', // Violet
  11: '#818cf8', // Indigo
  12: '#38bdf8', // Sky Blue
};

export const CAMELOT_WHEEL: CamelotKeyEntry[] = [
  // Minor keys (A inner ring)
  { camelotKey: '1A', number: 1, letter: 'A', musicalKey: 'Abm', fullName: 'A♭ Minor', rootPitchClass: 8, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[1] },
  { camelotKey: '2A', number: 2, letter: 'A', musicalKey: 'Ebm', fullName: 'E♭ Minor', rootPitchClass: 3, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[2] },
  { camelotKey: '3A', number: 3, letter: 'A', musicalKey: 'Bbm', fullName: 'B♭ Minor', rootPitchClass: 10, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[3] },
  { camelotKey: '4A', number: 4, letter: 'A', musicalKey: 'Fm', fullName: 'F Minor', rootPitchClass: 5, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[4] },
  { camelotKey: '5A', number: 5, letter: 'A', musicalKey: 'Cm', fullName: 'C Minor', rootPitchClass: 0, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[5] },
  { camelotKey: '6A', number: 6, letter: 'A', musicalKey: 'Gm', fullName: 'G Minor', rootPitchClass: 7, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[6] },
  { camelotKey: '7A', number: 7, letter: 'A', musicalKey: 'Dm', fullName: 'D Minor', rootPitchClass: 2, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[7] },
  { camelotKey: '8A', number: 8, letter: 'A', musicalKey: 'Am', fullName: 'A Minor', rootPitchClass: 9, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[8] },
  { camelotKey: '9A', number: 9, letter: 'A', musicalKey: 'Em', fullName: 'E Minor', rootPitchClass: 4, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[9] },
  { camelotKey: '10A', number: 10, letter: 'A', musicalKey: 'Bm', fullName: 'B Minor', rootPitchClass: 11, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[10] },
  { camelotKey: '11A', number: 11, letter: 'A', musicalKey: 'F#m', fullName: 'F♯ Minor', rootPitchClass: 6, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[11] },
  { camelotKey: '12A', number: 12, letter: 'A', musicalKey: 'C#m', fullName: 'C♯ Minor', rootPitchClass: 1, mode: 'minor', colorHex: CAMELOT_WHEEL_COLORS[12] },
  // Major keys (B outer ring)
  { camelotKey: '1B', number: 1, letter: 'B', musicalKey: 'B', fullName: 'B Major', rootPitchClass: 11, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[1] },
  { camelotKey: '2B', number: 2, letter: 'B', musicalKey: 'F#', fullName: 'F♯ Major', rootPitchClass: 6, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[2] },
  { camelotKey: '3B', number: 3, letter: 'B', musicalKey: 'Db', fullName: 'D♭ Major', rootPitchClass: 1, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[3] },
  { camelotKey: '4B', number: 4, letter: 'B', musicalKey: 'Ab', fullName: 'A♭ Major', rootPitchClass: 8, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[4] },
  { camelotKey: '5B', number: 5, letter: 'B', musicalKey: 'Eb', fullName: 'E♭ Major', rootPitchClass: 3, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[5] },
  { camelotKey: '6B', number: 6, letter: 'B', musicalKey: 'Bb', fullName: 'B♭ Major', rootPitchClass: 10, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[6] },
  { camelotKey: '7B', number: 7, letter: 'B', musicalKey: 'F', fullName: 'F Major', rootPitchClass: 5, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[7] },
  { camelotKey: '8B', number: 8, letter: 'B', musicalKey: 'C', fullName: 'C Major', rootPitchClass: 0, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[8] },
  { camelotKey: '9B', number: 9, letter: 'B', musicalKey: 'G', fullName: 'G Major', rootPitchClass: 7, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[9] },
  { camelotKey: '10B', number: 10, letter: 'B', musicalKey: 'D', fullName: 'D Major', rootPitchClass: 2, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[10] },
  { camelotKey: '11B', number: 11, letter: 'B', musicalKey: 'A', fullName: 'A Major', rootPitchClass: 9, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[11] },
  { camelotKey: '12B', number: 12, letter: 'B', musicalKey: 'E', fullName: 'E Major', rootPitchClass: 4, mode: 'major', colorHex: CAMELOT_WHEEL_COLORS[12] },
];

const CAMELOT_BY_CODE = new Map<string, CamelotKeyEntry>(
  CAMELOT_WHEEL.map((entry) => [entry.camelotKey, entry])
);

const CAMELOT_BY_PITCH_MODE = new Map<string, CamelotKeyEntry>(
  CAMELOT_WHEEL.map((entry) => [`${entry.rootPitchClass}:${entry.mode}`, entry])
);

// Krumhansl-Schmuckler tonal key profiles (C=0 .. B=11)
const KS_MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KS_MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function pearsonCorrelation(chroma: number[], profileRotated: number[]): number {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < 12; i++) {
    sumX += chroma[i];
    sumY += profileRotated[i];
  }
  const meanX = sumX / 12;
  const meanY = sumY / 12;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < 12; i++) {
    const dx = chroma[i] - meanX;
    const dy = profileRotated[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom > 1e-9 ? num / denom : 0;
}

/**
 * Extracts a 12-bin harmonic chroma vector across representative tonal frames
 * using anti-aliased decimation + Hann-windowed Goertzel bank (A1..G#5),
 * then correlates against Krumhansl-Schmuckler major/minor profiles.
 */
export function detectMusicalKeyFromBuffer(audioBuffer: AudioBuffer): DetectedMusicalKey {
  const sr = Math.max(8000, audioBuffer.sampleRate);
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const totalSamples = ch0.length;

  // Decimate to ~11,025 Hz so 4096-sample frames span ~371 ms with 2.7 Hz resolution
  const decim = Math.max(1, Math.floor(sr / 11025));
  const srEff = sr / decim;
  const frameLen = Math.min(4096, Math.max(512, Math.floor(totalSamples / decim)));

  // Precompute Hann window & Goertzel coefficients for MIDI 33 (A1=55Hz) .. MIDI 80 (G#5=830.6Hz)
  const hann = new Float32Array(frameLen);
  for (let n = 0; n < frameLen; n++) {
    hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / Math.max(1, frameLen - 1)));
  }

  const midiSpecs: Array<{
    pc: number;
    coeff: number;
    weight: number;
  }> = [];
  for (let midi = 33; midi <= 80; midi++) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    if (freq >= srEff * 0.44) continue;
    const omega = (2 * Math.PI * freq) / srEff;
    const coeff = 2 * Math.cos(omega);
    // Favor core harmonic octaves (C2..B4), slightly tame sub-kick bias & high percussion
    const octave = Math.floor(midi / 12) - 1;
    const weight = octave <= 1 ? 0.78 : octave === 2 ? 0.95 : octave <= 4 ? 1.15 : 0.72;
    midiSpecs.push({
      pc: ((midi % 12) + 12) % 12,
      coeff,
      weight,
    });
  }

  const numWindows = Math.min(14, Math.max(3, Math.floor(audioBuffer.duration / 2.2) + 2));
  const rawSpanSamples = frameLen * decim;
  const startMargin = Math.floor(totalSamples * 0.06);
  const endMargin = Math.max(startMargin + 1, Math.floor(totalSamples * 0.92) - rawSpanSamples);

  const globalChroma = new Array<number>(12).fill(0);
  const frameSamples = new Float32Array(frameLen);
  let activeFrames = 0;

  for (let w = 0; w < numWindows; w++) {
    const frac = numWindows <= 1 ? 0.5 : w / (numWindows - 1);
    const startIdx = Math.max(
      0,
      Math.min(
        totalSamples - rawSpanSamples,
        Math.round(startMargin + frac * (endMargin - startMargin))
      )
    );
    if (startIdx + rawSpanSamples > totalSamples) continue;

    // Anti-aliased decimation + DC mean subtraction
    let mean = 0;
    let sumSq = 0;
    for (let i = 0; i < frameLen; i++) {
      const base = startIdx + i * decim;
      let acc = 0;
      for (let d = 0; d < decim; d++) {
        const idx = base + d;
        acc += ch1 ? 0.5 * (ch0[idx] + ch1[idx]) : ch0[idx];
      }
      const val = acc / decim;
      frameSamples[i] = val;
      mean += val;
    }
    mean /= frameLen;

    for (let i = 0; i < frameLen; i++) {
      const centered = frameSamples[i] - mean;
      sumSq += centered * centered;
      frameSamples[i] = centered * hann[i];
    }

    const rms = Math.sqrt(sumSq / frameLen);
    if (rms < 0.008) continue;

    const frameChroma = new Array<number>(12).fill(0);
    for (let m = 0; m < midiSpecs.length; m++) {
      const spec = midiSpecs[m];
      const coeff = spec.coeff;
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < frameLen; i++) {
        s0 = frameSamples[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const power = Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
      frameChroma[spec.pc] += Math.sqrt(power) * spec.weight;
    }

    let frameMax = 1e-9;
    for (let pc = 0; pc < 12; pc++) {
      if (frameChroma[pc] > frameMax) frameMax = frameChroma[pc];
    }
    for (let pc = 0; pc < 12; pc++) {
      // Soft compression prevents a single resonant bass note from masking chord harmony
      globalChroma[pc] += Math.pow(frameChroma[pc] / frameMax, 0.85) * Math.min(1.4, 0.5 + rms * 2);
    }
    activeFrames++;
  }

  if (activeFrames === 0) {
    const fallback = CAMELOT_BY_CODE.get('8A')!;
    return {
      musicalKey: fallback.musicalKey,
      camelotKey: fallback.camelotKey,
      fullName: fallback.fullName,
      mode: fallback.mode,
      confidence: 0.4,
      colorHex: fallback.colorHex,
    };
  }

  let bestScore = -Infinity;
  let secondBestScore = -Infinity;
  let bestTonic = 9; // A
  let bestMode: 'minor' | 'major' = 'minor';

  for (let tonic = 0; tonic < 12; tonic++) {
    const majRot = new Array<number>(12);
    const minRot = new Array<number>(12);
    for (let pc = 0; pc < 12; pc++) {
      const interval = (pc - tonic + 12) % 12;
      majRot[pc] = KS_MAJOR_PROFILE[interval];
      minRot[pc] = KS_MINOR_PROFILE[interval];
    }

    const majCorr = pearsonCorrelation(globalChroma, majRot);
    if (majCorr > bestScore) {
      secondBestScore = bestScore;
      bestScore = majCorr;
      bestTonic = tonic;
      bestMode = 'major';
    } else if (majCorr > secondBestScore) {
      secondBestScore = majCorr;
    }

    const minCorr = pearsonCorrelation(globalChroma, minRot);
    if (minCorr > bestScore) {
      secondBestScore = bestScore;
      bestScore = minCorr;
      bestTonic = tonic;
      bestMode = 'minor';
    } else if (minCorr > secondBestScore) {
      secondBestScore = minCorr;
    }
  }

  const entry =
    CAMELOT_BY_PITCH_MODE.get(`${bestTonic}:${bestMode}`) ?? CAMELOT_BY_CODE.get('8A')!;
  const margin = Math.max(0, bestScore - Math.max(-1, secondBestScore));
  const confidence = Math.max(
    0.35,
    Math.min(0.99, Number((0.46 + bestScore * 0.34 + margin * 1.15).toFixed(2)))
  );

  return {
    musicalKey: entry.musicalKey,
    camelotKey: entry.camelotKey,
    fullName: entry.fullName,
    mode: entry.mode,
    confidence,
    colorHex: entry.colorHex,
  };
}

export function getCamelotEntry(camelotKey?: string | null): CamelotKeyEntry | null {
  if (!camelotKey) return null;
  return CAMELOT_BY_CODE.get(camelotKey.trim().toUpperCase()) ?? null;
}

export function wrapCamelotNumber(num: number): number {
  return ((((num - 1) % 12) + 12) % 12) + 1;
}

export function getCompatibleCamelotKeys(camelotKey?: string | null): string[] {
  const entry = getCamelotEntry(camelotKey);
  if (!entry) return [];
  const prev = `${wrapCamelotNumber(entry.number - 1)}${entry.letter}`;
  const next = `${wrapCamelotNumber(entry.number + 1)}${entry.letter}`;
  const rel = `${entry.number}${entry.letter === 'A' ? 'B' : 'A'}`;
  return [entry.camelotKey, prev, next, rel];
}

export function cycleCamelotKey(
  currentCamelotKey: string | undefined,
  action: 'prev' | 'next' | 'toggle-mode'
): CamelotKeyEntry {
  const cur = getCamelotEntry(currentCamelotKey) ?? CAMELOT_BY_CODE.get('8A')!;
  if (action === 'toggle-mode') {
    const code = `${cur.number}${cur.letter === 'A' ? 'B' : 'A'}`;
    return CAMELOT_BY_CODE.get(code) ?? cur;
  }
  const step = action === 'next' ? 1 : -1;
  const code = `${wrapCamelotNumber(cur.number + step)}${cur.letter}`;
  return CAMELOT_BY_CODE.get(code) ?? cur;
}

export function evaluateHarmonicCompatibility(
  camelotA?: string | null,
  camelotB?: string | null
): HarmonicCompatibilityResult {
  const a = getCamelotEntry(camelotA);
  const b = getCamelotEntry(camelotB);

  if (!a || !b) {
    return {
      tier: 'unknown',
      isCompatible: false,
      label: 'Awaiting Keys',
      detail: 'Load both decks to check Camelot harmonic compatibility',
      score: 0,
      accentHex: '#94a3b8',
      recommendedTargets: a ? getCompatibleCamelotKeys(a.camelotKey) : [],
    };
  }

  const wheelDist = Math.min(
    Math.abs(a.number - b.number),
    12 - Math.abs(a.number - b.number)
  );
  const forwardStep = ((b.number - a.number) % 12 + 12) % 12;
  const sameLetter = a.letter === b.letter;
  const recommendedTargets = getCompatibleCamelotKeys(a.camelotKey);

  if (a.number === b.number && sameLetter) {
    return {
      tier: 'perfect',
      isCompatible: true,
      label: 'Key Lock',
      detail: `Exact match (${a.camelotKey} ${a.musicalKey}) — seamless harmonic blend`,
      score: 100,
      accentHex: '#34d399',
      recommendedTargets,
    };
  }

  if (a.number === b.number && !sameLetter) {
    return {
      tier: 'relative',
      isCompatible: true,
      label: 'Relative A↔B',
      detail: `${a.camelotKey} ↔ ${b.camelotKey} relative ${a.mode === 'minor' ? 'major' : 'minor'} mood shift`,
      score: 94,
      accentHex: '#e879f9',
      recommendedTargets,
    };
  }

  if (wheelDist === 1 && sameLetter) {
    return {
      tier: 'harmonic',
      isCompatible: true,
      label: forwardStep === 1 ? 'Harmonic +1' : 'Harmonic -1',
      detail: `Adjacent wheel step (${a.camelotKey} → ${b.camelotKey}) for clean energy flow`,
      score: 92,
      accentHex: '#22d3ee',
      recommendedTargets,
    };
  }

  if ((forwardStep === 2 || forwardStep === 7) && sameLetter) {
    return {
      tier: 'energy',
      isCompatible: true,
      label: forwardStep === 2 ? 'Energy +2' : 'Lift +7',
      detail: `${a.camelotKey} → ${b.camelotKey} harmonic boost transition`,
      score: 78,
      accentHex: '#fbbf24',
      recommendedTargets,
    };
  }

  return {
    tier: 'clash',
    isCompatible: false,
    label: `Key Clash (Δ${wheelDist})`,
    detail: `${a.camelotKey} vs ${b.camelotKey} clash — try ${recommendedTargets.join(' · ')}`,
    score: Math.max(15, 60 - wheelDist * 8),
    accentHex: '#fb7185',
    recommendedTargets,
  };
}

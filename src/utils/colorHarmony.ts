import { THEME_PRESETS, ThemePresetKey } from '../types/studio';

export type ColorHarmonyCategory =
  | 'all'
  | 'neon'
  | 'cinematic'
  | 'cool'
  | 'warm'
  | 'pastel'
  | 'monochrome';

export type ColorHarmonyRule =
  | 'Complementary'
  | 'Analogous'
  | 'Triadic'
  | 'Split-Comp'
  | 'Monochrome';

export interface ColorHarmonyPalette {
  id: string;
  name: string;
  category: Exclude<ColorHarmonyCategory, 'all'>;
  rule: ColorHarmonyRule;
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  themePresetKey?: ThemePresetKey;
}

export const COLOR_HARMONY_CATEGORIES: Array<{
  id: ColorHarmonyCategory;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'neon', label: 'Neon' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'cool', label: 'Cool' },
  { id: 'warm', label: 'Warm' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'monochrome', label: 'Mono' },
];

export const CURATED_COLOR_PALETTES: ColorHarmonyPalette[] = [
  {
    id: 'cyberpunk',
    name: THEME_PRESETS[0].name,
    category: 'neon',
    rule: 'Split-Comp',
    primaryColor: THEME_PRESETS[0].primaryColor,
    secondaryColor: THEME_PRESETS[0].secondaryColor,
    bgColor: THEME_PRESETS[0].bgColor,
    themePresetKey: 'cyberpunk',
  },
  {
    id: 'sunset',
    name: THEME_PRESETS[1].name,
    category: 'warm',
    rule: 'Analogous',
    primaryColor: THEME_PRESETS[1].primaryColor,
    secondaryColor: THEME_PRESETS[1].secondaryColor,
    bgColor: THEME_PRESETS[1].bgColor,
    themePresetKey: 'sunset',
  },
  {
    id: 'emerald',
    name: THEME_PRESETS[2].name,
    category: 'cool',
    rule: 'Analogous',
    primaryColor: THEME_PRESETS[2].primaryColor,
    secondaryColor: THEME_PRESETS[2].secondaryColor,
    bgColor: THEME_PRESETS[2].bgColor,
    themePresetKey: 'emerald',
  },
  {
    id: 'minimal',
    name: THEME_PRESETS[3].name,
    category: 'monochrome',
    rule: 'Monochrome',
    primaryColor: THEME_PRESETS[3].primaryColor,
    secondaryColor: THEME_PRESETS[3].secondaryColor,
    bgColor: THEME_PRESETS[3].bgColor,
    themePresetKey: 'minimal',
  },
  {
    id: 'electric-ultraviolet',
    name: 'Ultraviolet Pulse',
    category: 'neon',
    rule: 'Complementary',
    primaryColor: '#a855f7',
    secondaryColor: '#22d3ee',
    bgColor: '#0b0714',
  },
  {
    id: 'acid-magenta',
    name: 'Acid Voltage',
    category: 'neon',
    rule: 'Complementary',
    primaryColor: '#a3e635',
    secondaryColor: '#ec4899',
    bgColor: '#080c07',
  },
  {
    id: 'laser-tangerine',
    name: 'Laser Arcade',
    category: 'neon',
    rule: 'Complementary',
    primaryColor: '#fb923c',
    secondaryColor: '#38bdf8',
    bgColor: '#0c0810',
  },
  {
    id: 'hyper-coral',
    name: 'Hyper Coral',
    category: 'neon',
    rule: 'Analogous',
    primaryColor: '#fb7185',
    secondaryColor: '#fde047',
    bgColor: '#13080c',
  },
  {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    category: 'cinematic',
    rule: 'Complementary',
    primaryColor: '#f59e0b',
    secondaryColor: '#38bdf8',
    bgColor: '#070b14',
  },
  {
    id: 'crimson-noir',
    name: 'Crimson Noir',
    category: 'cinematic',
    rule: 'Analogous',
    primaryColor: '#ef4444',
    secondaryColor: '#f97316',
    bgColor: '#110608',
  },
  {
    id: 'deep-abyssal',
    name: 'Deep Abyssal',
    category: 'cinematic',
    rule: 'Analogous',
    primaryColor: '#38bdf8',
    secondaryColor: '#6366f1',
    bgColor: '#050811',
  },
  {
    id: 'blade-teal',
    name: 'Teal & Amber',
    category: 'cinematic',
    rule: 'Complementary',
    primaryColor: '#14b8a6',
    secondaryColor: '#fb923c',
    bgColor: '#070f11',
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    category: 'cool',
    rule: 'Monochrome',
    primaryColor: '#67e8f9',
    secondaryColor: '#e0f2fe',
    bgColor: '#060d14',
  },
  {
    id: 'cobalt-mint',
    name: 'Cobalt Mint',
    category: 'cool',
    rule: 'Analogous',
    primaryColor: '#2dd4bf',
    secondaryColor: '#3b82f6',
    bgColor: '#060e13',
  },
  {
    id: 'northern-aurora',
    name: 'Northern Aurora',
    category: 'cool',
    rule: 'Triadic',
    primaryColor: '#4ade80',
    secondaryColor: '#a855f7',
    bgColor: '#060d10',
  },
  {
    id: 'glacier-indigo',
    name: 'Glacier Indigo',
    category: 'cool',
    rule: 'Analogous',
    primaryColor: '#818cf8',
    secondaryColor: '#22d3ee',
    bgColor: '#070914',
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    category: 'warm',
    rule: 'Analogous',
    primaryColor: '#fde047',
    secondaryColor: '#fb7185',
    bgColor: '#140b07',
  },
  {
    id: 'vinyl-velvet',
    name: 'Vinyl Velvet',
    category: 'warm',
    rule: 'Triadic',
    primaryColor: '#e879f9',
    secondaryColor: '#fb923c',
    bgColor: '#120812',
  },
  {
    id: 'volcanic-ember',
    name: 'Volcanic Ember',
    category: 'warm',
    rule: 'Analogous',
    primaryColor: '#f97316',
    secondaryColor: '#dc2626',
    bgColor: '#120706',
  },
  {
    id: 'lofi-peach',
    name: 'Lo-Fi Peach',
    category: 'pastel',
    rule: 'Split-Comp',
    primaryColor: '#fdba74',
    secondaryColor: '#c4b5fd',
    bgColor: '#110d16',
  },
  {
    id: 'dreamy-lavender',
    name: 'Dreamy Lavender',
    category: 'pastel',
    rule: 'Analogous',
    primaryColor: '#d8b4fe',
    secondaryColor: '#f9a8d4',
    bgColor: '#0f0a14',
  },
  {
    id: 'matcha-cream',
    name: 'Matcha Cream',
    category: 'pastel',
    rule: 'Analogous',
    primaryColor: '#86efac',
    secondaryColor: '#fde68a',
    bgColor: '#09110c',
  },
  {
    id: 'obsidian-silver',
    name: 'Obsidian Silver',
    category: 'monochrome',
    rule: 'Monochrome',
    primaryColor: '#e2e8f0',
    secondaryColor: '#64748b',
    bgColor: '#060709',
  },
  {
    id: 'champagne-slate',
    name: 'Champagne Slate',
    category: 'monochrome',
    rule: 'Monochrome',
    primaryColor: '#fef3c7',
    secondaryColor: '#94a3b8',
    bgColor: '#0b0b0e',
  },
];

function normalizeHex(hex: string): string {
  const cleaned = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(cleaned)) {
    return `#${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}${cleaned[3]}${cleaned[3]}`;
  }
  return cleaned;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHex(hex);
  const value = /^#[0-9a-f]{6}$/.test(norm) ? norm.slice(1) : '22d3ee';
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  return { h: (h / 6) * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toByteHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
}

export function deriveHarmonyFromPrimary(
  primaryHex: string,
  rule: ColorHarmonyRule
): {
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
} {
  const { r, g, b } = hexToRgb(primaryHex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const normalizedPrimary = normalizeHex(primaryHex);

  let secondaryHue = h;
  let secondarySat = Math.max(48, Math.min(92, s));
  let secondaryLig = Math.max(48, Math.min(72, l));
  let bgHue = (h + 210) % 360;
  let bgSat = Math.min(42, Math.max(18, s * 0.45));

  switch (rule) {
    case 'Complementary':
      secondaryHue = (h + 180) % 360;
      bgHue = h;
      break;
    case 'Split-Comp':
      secondaryHue = (h + 150) % 360;
      bgHue = (h + 210) % 360;
      break;
    case 'Analogous':
      secondaryHue = (h + 38) % 360;
      bgHue = (h + 18) % 360;
      break;
    case 'Triadic':
      secondaryHue = (h + 120) % 360;
      bgHue = (h + 240) % 360;
      break;
    case 'Monochrome':
      secondaryHue = h;
      secondarySat = Math.max(10, s * 0.48);
      secondaryLig = l > 65 ? Math.max(38, l - 26) : Math.min(82, l + 18);
      bgHue = h;
      bgSat = Math.min(24, s * 0.32);
      break;
  }

  return {
    primaryColor: normalizedPrimary,
    secondaryColor: hslToHex(secondaryHue, secondarySat, secondaryLig),
    bgColor: hslToHex(bgHue, bgSat, 5.5),
  };
}

export function findMatchingHarmonyPalette(
  palettes: ColorHarmonyPalette[],
  primaryColor: string,
  secondaryColor: string,
  bgColor: string
): ColorHarmonyPalette | undefined {
  const p = normalizeHex(primaryColor);
  const s = normalizeHex(secondaryColor);
  const bg = normalizeHex(bgColor);
  return palettes.find(
    (item) =>
      normalizeHex(item.primaryColor) === p &&
      normalizeHex(item.secondaryColor) === s &&
      normalizeHex(item.bgColor) === bg
  );
}

export function cyclePaletteIndex(
  length: number,
  currentIndex: number,
  direction: 1 | -1
): number {
  if (length <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= length) {
    return direction === 1 ? 0 : length - 1;
  }
  return (currentIndex + direction + length) % length;
}

export function pickRandomPaletteIndex(length: number, currentIndex: number): number {
  if (length <= 0) return -1;
  if (length === 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (next === currentIndex) {
    next = (currentIndex + 1 + Math.floor(Math.random() * (length - 1))) % length;
  }
  return next;
}

const rotateHexHueCache = new Map<string, string>();

export function rotateHexHue(hex: string, hueShiftDeg: number): string {
  const normalized = normalizeHex(hex);
  const shift = ((hueShiftDeg % 360) + 360) % 360;
  if (shift < 0.05 || shift > 359.95) {
    return normalized;
  }
  const cacheKey = `${normalized}|${Math.round(shift * 20)}`;
  const cached = rotateHexHueCache.get(cacheKey);
  if (cached) return cached;

  const { r, g, b } = hexToRgb(normalized);
  const { h, s, l } = rgbToHsl(r, g, b);
  const rotated = hslToHex(h + shift, s, l);
  if (rotateHexHueCache.size > 512) rotateHexHueCache.clear();
  rotateHexHueCache.set(cacheKey, rotated);
  return rotated;
}

export interface AutoCycledColorResult {
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  danceRimColor?: string;
  scanlineColor?: string;
  hueShiftDeg: number;
  globalHueRotationDeg: number;
  cycleHueShiftDeg: number;
  progress: number;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

export function resolveAutoCycledColors(
  settings: {
    primaryColor: string;
    secondaryColor: string;
    bgColor?: string;
    autoCycleColor?: boolean;
    colorCycleSpeed?: number;
    globalHueRotation?: number;
    danceRimColor?: string;
    scanlineColor?: string;
  },
  currentTime: number,
  trackDuration?: number
): AutoCycledColorResult {
  const globalHueRotationDeg =
    ((Number.isFinite(settings.globalHueRotation) ? settings.globalHueRotation ?? 0 : 0) % 360 +
      360) %
    360;

  let cycleHueShiftDeg = 0;
  let progress = 0;

  if (settings.autoCycleColor) {
    const speed = Math.max(0.25, Math.min(8, settings.colorCycleSpeed ?? 1));
    const hasDuration =
      typeof trackDuration === 'number' && Number.isFinite(trackDuration) && trackDuration > 0.1;
    const cycleSpan = hasDuration ? trackDuration : 30;
    progress = hasDuration
      ? Math.max(0, Math.min(1, currentTime / cycleSpan))
      : (Math.max(0, currentTime) % cycleSpan) / cycleSpan;
    cycleHueShiftDeg = (progress * speed * 360) % 360;
  }

  const hueShiftDeg = (globalHueRotationDeg + cycleHueShiftDeg) % 360;
  const baseBg = settings.bgColor ?? '#090b10';
  const rawRim = typeof settings.danceRimColor === 'string' ? settings.danceRimColor.trim() : '';
  const rawScan = typeof settings.scanlineColor === 'string' ? settings.scanlineColor.trim() : '';

  return {
    primaryColor: rotateHexHue(settings.primaryColor, hueShiftDeg),
    secondaryColor: rotateHexHue(settings.secondaryColor, hueShiftDeg),
    bgColor: rotateHexHue(baseBg, globalHueRotationDeg),
    danceRimColor: HEX_COLOR_RE.test(rawRim)
      ? rotateHexHue(rawRim, hueShiftDeg)
      : settings.danceRimColor,
    scanlineColor: HEX_COLOR_RE.test(rawScan)
      ? rotateHexHue(rawScan, hueShiftDeg)
      : settings.scanlineColor,
    hueShiftDeg,
    globalHueRotationDeg,
    cycleHueShiftDeg,
    progress,
  };
}

export const resolveThemeColors = resolveAutoCycledColors;

export function interpolateHexColors(hexA: string, hexB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * clamped);
  const g = Math.round(a.g + (b.g - a.g) * clamped);
  const bl = Math.round(a.b + (b.b - a.b) * clamped);
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

export function resolveBeatMappedColors(params: {
  lowColor: string;
  midColor: string;
  highColor: string;
  bass: number;
  mid: number;
  treble: number;
  beatEnergy: number;
  hueShiftDeg?: number;
}): { primaryColor: string; secondaryColor: string } {
  const shift = params.hueShiftDeg ?? 0;
  const low = shift !== 0 ? rotateHexHue(params.lowColor, shift) : normalizeHex(params.lowColor);
  const midC = shift !== 0 ? rotateHexHue(params.midColor, shift) : normalizeHex(params.midColor);
  const high = shift !== 0 ? rotateHexHue(params.highColor, shift) : normalizeHex(params.highColor);

  const bass = Math.max(0, params.bass);
  const mid = Math.max(0, params.mid);
  const treble = Math.max(0, params.treble);
  const energy = Math.max(0, Math.min(1, params.beatEnergy));

  // Weighted 3-band spectral blend (bass -> low, mid -> mid, treble -> high)
  const wLow = bass * 1.15 + 0.05;
  const wMid = mid * 1.05 + 0.05;
  const wHigh = treble * 1.2 + 0.05;
  const total = wLow + wMid + wHigh;

  const aLow = hexToRgb(low);
  const aMid = hexToRgb(midC);
  const aHigh = hexToRgb(high);

  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const freqBlend = `#${toHex((aLow.r * wLow + aMid.r * wMid + aHigh.r * wHigh) / total)}${toHex(
    (aLow.g * wLow + aMid.g * wMid + aHigh.g * wHigh) / total
  )}${toHex((aLow.b * wLow + aMid.b * wMid + aHigh.b * wHigh) / total)}`;

  // Beat-energy 3-stop sweep: low -> mid -> high as beat energy surges
  const beatSweep =
    energy < 0.5
      ? interpolateHexColors(low, midC, energy * 2)
      : interpolateHexColors(midC, high, (energy - 0.5) * 2);

  const primaryColor = interpolateHexColors(freqBlend, beatSweep, 0.35 + 0.55 * energy);
  const secondaryTarget = energy < 0.5 ? high : low;
  const secondaryColor = interpolateHexColors(
    midC,
    secondaryTarget,
    Math.max(0.18, Math.min(0.95, treble * 0.55 + energy * 0.65))
  );

  return { primaryColor, secondaryColor };
}

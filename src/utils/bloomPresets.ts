import { BloomPresetKey, StudioSettings } from '../types/studio';

export interface BloomPresetConfig {
  key: Exclude<BloomPresetKey, 'custom'>;
  name: string;
  description: string;
  bloomIntensity: number;
  bloomRadius: number;
  bloomSpread: number;
  bloomSaturation: number;
}

export const DEFAULT_BLOOM_SHADER_PARAMS = {
  bloomPreset: 'off' as BloomPresetKey,
  bloomRadius: 1.0,
  bloomSpread: 0.5,
  bloomSaturation: 1.05,
};

export const BLOOM_PRESETS: BloomPresetConfig[] = [
  {
    key: 'off',
    name: 'Off (Crisp)',
    description: 'Zero post-blur passes; pure sharp vector & bar edges.',
    bloomIntensity: 0,
    bloomRadius: 1.0,
    bloomSpread: 0.5,
    bloomSaturation: 1.0,
  },
  {
    key: 'subtle-glow',
    name: 'Subtle Glow',
    description: 'Tight core rim glow preserving clean foreground contrast.',
    bloomIntensity: 0.35,
    bloomRadius: 0.72,
    bloomSpread: 0.25,
    bloomSaturation: 1.05,
  },
  {
    key: 'dreamy-haze',
    name: 'Dreamy Haze',
    description: 'Wide velvety atmospheric diffusion across outer mist layers.',
    bloomIntensity: 0.8,
    bloomRadius: 1.9,
    bloomSpread: 0.9,
    bloomSaturation: 0.92,
  },
  {
    key: 'neon-bloom',
    name: 'Neon Bloom',
    description: 'High-chroma electric core with vivid mid-band halation.',
    bloomIntensity: 0.95,
    bloomRadius: 1.15,
    bloomSpread: 0.52,
    bloomSaturation: 1.48,
  },
  {
    key: 'aggressive-flare',
    name: 'Aggressive Flare',
    description: 'Overdriven wide specular flare tuned for heavy bass drops.',
    bloomIntensity: 1.4,
    bloomRadius: 1.68,
    bloomSpread: 0.78,
    bloomSaturation: 1.72,
  },
];

function approxEqual(a: number | undefined, b: number, fallback: number, eps = 0.025): boolean {
  const val = typeof a === 'number' && Number.isFinite(a) ? a : fallback;
  return Math.abs(val - b) <= eps;
}

export function resolveActiveBloomPreset(settings: StudioSettings): BloomPresetKey {
  if (settings.bloomIntensity <= 0.005) {
    return 'off';
  }

  const matched = BLOOM_PRESETS.find(
    (p) =>
      p.key !== 'off' &&
      approxEqual(settings.bloomIntensity, p.bloomIntensity, 0) &&
      approxEqual(settings.bloomRadius, p.bloomRadius, DEFAULT_BLOOM_SHADER_PARAMS.bloomRadius) &&
      approxEqual(settings.bloomSpread, p.bloomSpread, DEFAULT_BLOOM_SHADER_PARAMS.bloomSpread) &&
      approxEqual(
        settings.bloomSaturation,
        p.bloomSaturation,
        DEFAULT_BLOOM_SHADER_PARAMS.bloomSaturation
      )
  );

  if (matched) {
    return matched.key;
  }

  return 'custom';
}

export function getBloomPresetPatch(
  presetKey: Exclude<BloomPresetKey, 'custom'>
): Partial<StudioSettings> {
  const preset = BLOOM_PRESETS.find((p) => p.key === presetKey) ?? BLOOM_PRESETS[0];
  return {
    bloomPreset: preset.key,
    bloomIntensity: preset.bloomIntensity,
    bloomRadius: preset.bloomRadius,
    bloomSpread: preset.bloomSpread,
    bloomSaturation: preset.bloomSaturation,
  };
}

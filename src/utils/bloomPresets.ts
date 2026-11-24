import { BloomPresetKey, StudioSettings } from '../types/studio';

export type PrimaryBloomPresetKey = 'off' | 'soft' | 'glow' | 'intense' | 'cinematic';

export interface BloomPresetConfig {
  key: PrimaryBloomPresetKey;
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
    name: 'Off',
    description: 'Zero post-blur passes; pure crisp vector and bar edges.',
    bloomIntensity: 0,
    bloomRadius: 1.0,
    bloomSpread: 0.5,
    bloomSaturation: 1.0,
  },
  {
    key: 'soft',
    name: 'Soft',
    description: 'Tight gentle rim glow preserving sharp foreground contrast.',
    bloomIntensity: 0.35,
    bloomRadius: 0.78,
    bloomSpread: 0.28,
    bloomSaturation: 1.05,
  },
  {
    key: 'glow',
    name: 'Glow',
    description: 'Balanced neon halation with luminous mid-band radiance.',
    bloomIntensity: 0.75,
    bloomRadius: 1.15,
    bloomSpread: 0.52,
    bloomSaturation: 1.28,
  },
  {
    key: 'intense',
    name: 'Intense',
    description: 'Overdriven electric specular flare tuned for heavy drops.',
    bloomIntensity: 1.3,
    bloomRadius: 1.55,
    bloomSpread: 0.72,
    bloomSaturation: 1.62,
  },
  {
    key: 'cinematic',
    name: 'Cinematic',
    description: 'Wide velvety atmospheric diffusion with filmic highlight roll-off.',
    bloomIntensity: 0.9,
    bloomRadius: 1.95,
    bloomSpread: 0.92,
    bloomSaturation: 0.94,
  },
];

const LEGACY_BLOOM_PRESET_MAP: Partial<Record<BloomPresetKey, PrimaryBloomPresetKey>> = {
  'subtle-glow': 'soft',
  'neon-bloom': 'glow',
  'aggressive-flare': 'intense',
  'dreamy-haze': 'cinematic',
};

export function normalizeBloomPresetKey(key: BloomPresetKey | undefined): BloomPresetKey {
  if (!key) return 'off';
  return LEGACY_BLOOM_PRESET_MAP[key] ?? key;
}

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
  const normalized = normalizeBloomPresetKey(presetKey);
  const preset = BLOOM_PRESETS.find((p) => p.key === normalized) ?? BLOOM_PRESETS[0];
  return {
    bloomPreset: preset.key,
    bloomIntensity: preset.bloomIntensity,
    bloomRadius: preset.bloomRadius,
    bloomSpread: preset.bloomSpread,
    bloomSaturation: preset.bloomSaturation,
  };
}

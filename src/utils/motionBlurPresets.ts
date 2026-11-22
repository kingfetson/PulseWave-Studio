import { MotionBlurPresetKey, StudioSettings } from '../types/studio';

export interface MotionBlurPresetConfig {
  key: MotionBlurPresetKey;
  name: string;
  description: string;
  defaultIntensity: number;
}

export const MOTION_BLUR_PRESETS: MotionBlurPresetConfig[] = [
  {
    key: 'none',
    name: 'None',
    description: 'Zero frame accumulation; crisp per-frame rendering.',
    defaultIntensity: 0,
  },
  {
    key: 'trails',
    name: 'Trails',
    description: 'Radial zoom + Gaussian persistence kernel for silky kinetic trails.',
    defaultIntensity: 0.55,
  },
  {
    key: 'ghosting',
    name: 'Ghosting',
    description: 'Dual-tap delayed spectral echo with offset screen afterimages.',
    defaultIntensity: 0.6,
  },
  {
    key: 'stutter',
    name: 'Stutter',
    description: 'Quantized shutter-hold cadence with directional film-drag smear.',
    defaultIntensity: 0.65,
  },
];

export function resolveActiveMotionBlurPreset(settings: StudioSettings): MotionBlurPresetKey {
  const intensity = Math.max(0, settings.motionBlur || 0);
  if (intensity <= 0.005) {
    return 'none';
  }
  if (
    settings.motionBlurPreset === 'trails' ||
    settings.motionBlurPreset === 'ghosting' ||
    settings.motionBlurPreset === 'stutter'
  ) {
    return settings.motionBlurPreset;
  }
  return 'trails';
}

export function getMotionBlurPresetPatch(
  presetKey: MotionBlurPresetKey,
  currentIntensity: number
): Partial<StudioSettings> {
  const preset =
    MOTION_BLUR_PRESETS.find((p) => p.key === presetKey) ?? MOTION_BLUR_PRESETS[0];
  if (preset.key === 'none') {
    return {
      motionBlurPreset: 'none',
      motionBlur: 0,
    };
  }
  return {
    motionBlurPreset: preset.key,
    motionBlur: currentIntensity > 0.02 ? currentIntensity : preset.defaultIntensity,
  };
}

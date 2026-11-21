import { StudioSettings, VisualizerMode } from '../types/studio';

export interface AutoArrangeResult {
  patch: Pick<StudioSettings, 'visualizerScale' | 'lyricPosition' | 'bloomIntensity' | 'bloomPreset'>;
  summary: string;
}

const RADIAL_OR_3D_MODES = new Set<VisualizerMode>([
  'circular-ring',
  'hybrid-particles',
  'harmonic-orb',
  'cube-3d',
  'galaxy-spiral',
  'cyber-tunnel',
  'radar-sonar',
  'lissajous-scope',
  'flower-mandala',
  'vortex-rings',
  'isometric-city',
  'kaleido-shards',
  'flame-corona',
]);

const HIGH_GLOW_MODES = new Set<VisualizerMode>([
  'hybrid-particles',
  'harmonic-orb',
  'dual-ribbon',
  'stereo-prism',
  'cube-3d',
  'galaxy-spiral',
  'cyber-tunnel',
  'seismic-ridges',
  'dna-helix',
  'lissajous-scope',
  'rain-matrix',
  'flower-mandala',
  'vortex-rings',
  'kaleido-shards',
  'flame-corona',
]);

export function computeAutoArrangeFraming(
  settings: StudioSettings,
  hasLyrics: boolean
): AutoArrangeResult {
  const isRadialOr3D = RADIAL_OR_3D_MODES.has(settings.visualizerMode);
  const isHighGlow = HIGH_GLOW_MODES.has(settings.visualizerMode);

  let visualizerScale = 1.0;
  let lyricPosition = 80;
  let bloomIntensity = 0.5;

  if (settings.aspectRatio === '16:9') {
    visualizerScale = isRadialOr3D
      ? hasLyrics
        ? 0.98
        : 1.08
      : hasLyrics
      ? 1.08
      : 1.15;

    lyricPosition =
      settings.lyricStyle === 'subtitle-bar'
        ? 86
        : settings.lyricStyle === 'single-pop'
        ? 83
        : 82;

    bloomIntensity = isHighGlow ? 0.45 : 0.55;
  } else if (settings.aspectRatio === '9:16') {
    // Keep visuals inside TikTok/Reels/Shorts safe margins & captions above bottom UI band
    visualizerScale = isRadialOr3D ? 0.85 : 0.88;

    lyricPosition =
      settings.lyricStyle === 'subtitle-bar'
        ? 75
        : settings.lyricStyle === 'single-pop'
        ? 73
        : 72;

    bloomIntensity = isHighGlow ? 0.35 : 0.42;
  } else {
    // 1:1 Square
    visualizerScale = isRadialOr3D
      ? hasLyrics
        ? 0.94
        : 1.02
      : hasLyrics
      ? 1.02
      : 1.08;

    lyricPosition =
      settings.lyricStyle === 'subtitle-bar'
        ? 83
        : settings.lyricStyle === 'single-pop'
        ? 80
        : 79;

    bloomIntensity = isHighGlow ? 0.4 : 0.5;
  }

  const patch = {
    visualizerScale: Number(visualizerScale.toFixed(2)),
    lyricPosition: Math.round(lyricPosition),
    bloomIntensity: Number(bloomIntensity.toFixed(2)),
    bloomPreset: 'custom' as const,
  };

  return {
    patch,
    summary: `Framed for ${settings.aspectRatio} · Scale ${Math.round(
      patch.visualizerScale * 100
    )}% · Lyrics ${patch.lyricPosition}% · Bloom ${Math.round(
      patch.bloomIntensity * 100
    )}%`,
  };
}

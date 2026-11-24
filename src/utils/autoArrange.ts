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
  'radial-bars-inward',
  'hex-hive',
  'orbit-atoms',
  'ripple-pond',
  'spiral-bars',
  'pyramid-3d',
  'ribbon-knot',
  'starburst-rays',
  'glass-shards',
  'vinyl-grooves',
  'chromatic-rings',
  'cyber-compass',
  'nebula-clouds',
  'torus-3d',
  'icosahedron-3d',
  'octahedron-3d',
  'sphere-dots-3d',
  'cylinder-eq-3d',
  'helix-double-3d',
  'terrain-mesh-3d',
  'prism-stack-3d',
  'dodecahedron-3d',
  'saturn-rings-3d',
  'cube-lattice-3d',
  'ribbon-mobius-3d',
  'cone-vortex-3d',
  'diamond-cut-3d',
  'city-blocks-3d',
  'wave-tunnel-3d',
  'atom-cage-3d',
  'ribbon-helix-3d',
  'star-poly-3d',
  'arch-bridge-3d',
  'dna-spiral-3d',
  'crystal-cluster-3d',
  'radar-dome-3d',
  'portal-gate-3d',
  'hypercube-4d',
  'origami-fold',
  'vinyl-turntable',
  'pendulum-clockwork',
  'seismic-circular',
  'bioluminescent-jelly',
  'stained-glass',
  'magnetic-ferrofluid',
  'kaleido-tunnels',
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
  'spectrum-waterfall',
  'constellation-net',
  'plasma-field',
  'laser-fan',
  'synth-grid',
  'orbit-atoms',
  'lightning-bolts',
  'pyramid-3d',
  'ribbon-knot',
  'starburst-rays',
  'infinity-loop',
  'chromatic-rings',
  'nebula-clouds',
  'torus-3d',
  'icosahedron-3d',
  'octahedron-3d',
  'sphere-dots-3d',
  'dodecahedron-3d',
  'saturn-rings-3d',
  'ribbon-mobius-3d',
  'diamond-cut-3d',
  'wave-tunnel-3d',
  'atom-cage-3d',
  'star-poly-3d',
  'portal-gate-3d',
  'hypercube-4d',
  'aurora-curtains',
  'bioluminescent-jelly',
  'magnetic-ferrofluid',
  'kaleido-tunnels',
]);

export function computeAutoArrangeFraming(
  settings: StudioSettings,
  hasLyrics: boolean
): AutoArrangeResult {
  const isBottomBarStyle =
    settings.lyricStyle === 'subtitle-bar' ||
    settings.lyricStyle === 'ticker-ribbon' ||
    settings.lyricStyle === 'vinyl-sleeve';
  const isBoxedCardStyle =
    settings.lyricStyle === 'single-pop' ||
    settings.lyricStyle === 'glass-card' ||
    settings.lyricStyle === 'duotone-badge' ||
    settings.lyricStyle === 'cyber-hud';

  if (settings.lyricsOnly) {
    const lyricPosition = isBottomBarStyle
      ? settings.aspectRatio === '9:16'
        ? 75
        : settings.aspectRatio === '1:1'
        ? 83
        : 86
      : 50;
    const patch = {
      visualizerScale: Number(settings.visualizerScale.toFixed(2)),
      lyricPosition,
      bloomIntensity: 0,
      bloomPreset: 'off' as const,
    };
    return {
      patch,
      summary: `Framed for ${settings.aspectRatio} · Lyrics Only · Lyrics ${patch.lyricPosition}%`,
    };
  }

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

    lyricPosition = isBottomBarStyle ? 86 : isBoxedCardStyle ? 83 : 82;

    bloomIntensity = isHighGlow ? 0.45 : 0.55;
  } else if (settings.aspectRatio === '9:16') {
    // Keep visuals inside TikTok/Reels/Shorts safe margins & captions above bottom UI band
    visualizerScale = isRadialOr3D ? 0.85 : 0.88;

    lyricPosition = isBottomBarStyle ? 75 : isBoxedCardStyle ? 73 : 72;

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

    lyricPosition = isBottomBarStyle ? 83 : isBoxedCardStyle ? 80 : 79;

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

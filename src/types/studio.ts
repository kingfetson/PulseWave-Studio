import type { DjSpectrogramData } from '../utils/djSpectrogram';

export type AspectRatioKey = '16:9' | '9:16' | '1:1';

export interface AspectRatioConfig {
  key: AspectRatioKey;
  label: string;
  platformHint: string;
  width: number;
  height: number;
}

export const ASPECT_RATIOS: Record<AspectRatioKey, AspectRatioConfig> = {
  '16:9': {
    key: '16:9',
    label: '16:9 Landscape',
    platformHint: 'YouTube & Desktop',
    width: 1280,
    height: 720,
  },
  '9:16': {
    key: '9:16',
    label: '9:16 Vertical',
    platformHint: 'TikTok, Reels & Shorts',
    width: 720,
    height: 1280,
  },
  '1:1': {
    key: '1:1',
    label: '1:1 Square',
    platformHint: 'Instagram & Spotify Canvas',
    width: 1080,
    height: 1080,
  },
};

export type VisualizerMode =
  | 'mirrored-bars'
  | 'circular-ring'
  | 'neon-wave'
  | 'hybrid-particles'
  | 'dual-ribbon'
  | 'led-matrix'
  | 'harmonic-orb'
  | 'stereo-prism'
  | 'cube-3d'
  | 'galaxy-spiral'
  | 'cyber-tunnel'
  | 'seismic-ridges'
  | 'dna-helix'
  | 'radar-sonar'
  | 'lissajous-scope'
  | 'rain-matrix'
  | 'flower-mandala'
  | 'vortex-rings'
  | 'isometric-city'
  | 'analog-vu'
  | 'kaleido-shards'
  | 'flame-corona'
  | 'radial-bars-inward'
  | 'spectrum-waterfall'
  | 'pendulum-wave'
  | 'constellation-net'
  | 'waveform-mirror'
  | 'hex-hive'
  | 'plasma-field'
  | 'laser-fan'
  | 'synth-grid'
  | 'orbit-atoms'
  | 'bar-arc'
  | 'dot-equalizer'
  | 'lightning-bolts'
  | 'pixel-mosaic'
  | 'ripple-pond'
  | 'spiral-bars'
  | 'pyramid-3d'
  | 'heartbeat-ecg'
  | 'ribbon-knot'
  | 'starburst-rays'
  | 'glass-shards'
  | 'vinyl-grooves'
  | 'staircase-eq'
  | 'infinity-loop'
  | 'chromatic-rings'
  | 'sound-curtain'
  | 'cyber-compass'
  | 'nebula-clouds'
  | 'torus-3d'
  | 'icosahedron-3d'
  | 'octahedron-3d'
  | 'sphere-dots-3d'
  | 'cylinder-eq-3d'
  | 'helix-double-3d'
  | 'terrain-mesh-3d'
  | 'prism-stack-3d'
  | 'dodecahedron-3d'
  | 'saturn-rings-3d'
  | 'cube-lattice-3d'
  | 'ribbon-mobius-3d'
  | 'cone-vortex-3d'
  | 'diamond-cut-3d'
  | 'city-blocks-3d'
  | 'wave-tunnel-3d'
  | 'atom-cage-3d'
  | 'ribbon-helix-3d'
  | 'star-poly-3d'
  | 'arch-bridge-3d'
  | 'dna-spiral-3d'
  | 'crystal-cluster-3d'
  | 'radar-dome-3d'
  | 'portal-gate-3d'
  | 'hypercube-4d'
  | 'origami-fold'
  | 'vinyl-turntable'
  | 'pendulum-clockwork'
  | 'aurora-curtains'
  | 'seismic-circular'
  | 'bioluminescent-jelly'
  | 'stained-glass'
  | 'sonar-ripples'
  | 'magnetic-ferrofluid'
  | 'kaleido-tunnels';

export type ParticleShape =
  | 'circle'
  | 'diamond'
  | 'star'
  | 'square'
  | 'triangle'
  | 'ring';

export const PARTICLE_FLOW_COLS = 16;
export const PARTICLE_FLOW_ROWS = 12;

export function createEmptyParticleFlowMap(): number[] {
  return new Array(PARTICLE_FLOW_COLS * PARTICLE_FLOW_ROWS * 2).fill(0);
}

export type LyricStyle =
  | 'karaoke'
  | 'single-pop'
  | 'subtitle-bar'
  | 'neon-outline'
  | 'typewriter'
  | 'cinematic-serif'
  | 'word-sweep'
  | 'glass-card'
  | 'bold-impact'
  | 'split-reveal'
  | 'ticker-ribbon'
  | 'floating-cloud'
  | 'cyber-hud'
  | 'retro-arcade'
  | 'editorial-quote'
  | 'vinyl-sleeve'
  | 'glitch-flash'
  | 'duotone-badge'
  | 'vertical-spine'
  | 'wave-bounce';

export type LyricsOnlyLayout = 'half-verse' | 'full-verse' | 'full-lyrics';

export type DisplayLayerMode =
  | 'visualizer-lyrics'
  | 'visualizer-only'
  | 'lyrics-only'
  | 'dance-only';

export type LyricFontKey = 'auto' | 'sans' | 'serif' | 'mono' | 'display' | 'geometric';

export type DanceStyleKey =
  | 'hip-hop'
  | 'shuffle'
  | 'robot'
  | 'groove'
  | 'break-freeze'
  | 'mocap-salsa'
  | 'mocap-ballet'
  | 'mocap-breakdance'
  | 'mocap-moonwalk'
  | 'mocap-house'
  | 'mocap-contemporary'
  | 'mocap-afrobeat'
  | 'mocap-tango'
  | 'mocap-shuffle'
  | 'mocap-kpop'
  | 'mocap-disco'
  | 'mocap-waltz'
  | 'mocap-popping'
  | 'mocap-locking'
  | 'mocap-krump'
  | 'mocap-tutting'
  | 'mocap-waving'
  | 'mocap-boogaloo'
  | 'mocap-cwalk'
  | 'mocap-jerkin'
  | 'mocap-harlem-shake'
  | 'mocap-dougie'
  | 'mocap-voguing'
  | 'mocap-waacking'
  | 'mocap-tektonik'
  | 'mocap-jumpstyle'
  | 'mocap-cutting-shapes'
  | 'mocap-hakken'
  | 'mocap-cyber-goth'
  | 'mocap-trance-flow'
  | 'mocap-robot-boogie'
  | 'mocap-bachata'
  | 'mocap-samba'
  | 'mocap-merengue'
  | 'mocap-cumbia'
  | 'mocap-reggaeton'
  | 'mocap-chacha'
  | 'mocap-rumba'
  | 'mocap-pasodoble'
  | 'mocap-dancehall'
  | 'mocap-amapiano'
  | 'mocap-foxtrot'
  | 'mocap-quickstep'
  | 'mocap-jive'
  | 'mocap-lindy-hop'
  | 'mocap-charleston'
  | 'mocap-twist'
  | 'mocap-mashed-potato'
  | 'mocap-swing-out'
  | 'mocap-flamenco'
  | 'mocap-bollywood'
  | 'mocap-bhangra'
  | 'mocap-capoeira'
  | 'mocap-irish-step'
  | 'mocap-kazachok'
  | 'mocap-bellydance'
  | 'mocap-jazz-square'
  | 'mocap-tap'
  | 'mocap-fosse'
  | 'mocap-aerial-leap'
  | 'mocap-headbang'
  | 'mocap-chill-sway'
  | 'mocap-custom';

export type DanceAvatarStyle =
  | 'robot'
  | 'ninja'
  | 'casual'
  | 'formal'
  | 'human-dancer'
  | 'human-ballerina'
  | 'human-bboy'
  | 'human-diva'
  | 'human-suit'
  | 'human-neon'
  | 'silhouette'
  | 'human-skater'
  | 'human-graffiti'
  | 'human-dj'
  | 'human-raver'
  | 'human-kpop'
  | 'human-tracksuit'
  | 'human-punk'
  | 'human-rockstar'
  | 'human-android'
  | 'human-astronaut'
  | 'human-cyborg'
  | 'human-valkyrie'
  | 'human-phantom'
  | 'human-samurai'
  | 'human-laser-mage'
  | 'human-mecha-pilot'
  | 'human-disco'
  | 'human-synthwave'
  | 'human-glam'
  | 'human-jazz-cat'
  | 'human-flapper'
  | 'human-mariachi'
  | 'human-cowboy'
  | 'human-matador'
  | 'human-kimono'
  | 'human-contemporary'
  | 'human-opera'
  | 'human-gothic'
  | 'human-monarch'
  | 'human-zen'
  | 'neon-cyber'
  | 'holo-wire'
  | 'minimal-rig'
  | 'prism-rig'
  | 'laser-frame'
  | 'chrome-doll'
  | 'pulse-nodes'
  | 'shadow-wire'
  | 'voxel-rig';

export type DancePlacement = 'left' | 'center' | 'right';

export type DanceMedleyTriggerMode = 'beats' | 'seconds' | 'lyrics';

export interface MocapClipData {
  name: string;
  fps: number;
  frameCount: number;
  jointNames: string[];
  bones: Array<[number, number]>;
  frames: number[][];
  headJointIndex: number;
  hipsJointIndex: number;
}

export type BackgroundFitMode = 'cover' | 'contain-blur' | 'stretch';

export type CoverCardSource = 'auto' | 'bg' | 'album';

export type CoverCardPosition = 'top-left' | 'top-center' | 'center';

export type FadeType = 'linear' | 'logarithmic' | 'exponential';

export type SceneTransitionType =
  | 'none'
  | 'crossfade'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down';

export type SceneTransitionTarget = 'both' | 'lyrics' | 'visualizer';

export type BloomPresetKey =
  | 'off'
  | 'soft'
  | 'glow'
  | 'intense'
  | 'cinematic'
  | 'subtle-glow'
  | 'dreamy-haze'
  | 'neon-bloom'
  | 'aggressive-flare'
  | 'custom';

export type MotionBlurPresetKey = 'none' | 'trails' | 'ghosting' | 'stutter';

export type ExportResolution = '720p' | '1080p' | '1440p';

export type ExportBitratePreset = 'compact' | 'balanced' | 'high' | 'master' | 'custom';

export type AudioBitrateKbps = 128 | 192 | 256 | 320;

export const EXPORT_RESOLUTION_DIMENSIONS: Record<
  AspectRatioKey,
  Record<ExportResolution, { width: number; height: number }>
> = {
  '16:9': {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '1440p': { width: 2560, height: 1440 },
  },
  '9:16': {
    '720p': { width: 720, height: 1280 },
    '1080p': { width: 1080, height: 1920 },
    '1440p': { width: 1440, height: 2560 },
  },
  '1:1': {
    '720p': { width: 720, height: 720 },
    '1080p': { width: 1080, height: 1080 },
    '1440p': { width: 1440, height: 1440 },
  },
};

export function resolveExportDimensions(
  aspectRatio: AspectRatioKey,
  resolution: ExportResolution = '720p'
): { width: number; height: number } {
  return (
    EXPORT_RESOLUTION_DIMENSIONS[aspectRatio]?.[resolution] ??
    ASPECT_RATIOS[aspectRatio]
  );
}

export const EXPORT_BITRATE_PRESETS: Array<{
  id: Exclude<ExportBitratePreset, 'custom'>;
  label: string;
  videoBitrateMbps: number;
  audioBitrateKbps: AudioBitrateKbps;
  hint: string;
}> = [
  {
    id: 'compact',
    label: 'Compact',
    videoBitrateMbps: 4,
    audioBitrateKbps: 128,
    hint: '4 Mbps · Fast upload',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    videoBitrateMbps: 8,
    audioBitrateKbps: 192,
    hint: '8 Mbps · Standard HD',
  },
  {
    id: 'high',
    label: 'High Quality',
    videoBitrateMbps: 14,
    audioBitrateKbps: 256,
    hint: '14 Mbps · Social crisp',
  },
  {
    id: 'master',
    label: 'Master',
    videoBitrateMbps: 24,
    audioBitrateKbps: 320,
    hint: '24 Mbps · Studio master',
  },
];

export interface ExportProfile {
  id: string;
  name: string;
  description?: string;
  isBuiltIn?: boolean;
  createdAt: string;
  aspectRatio: AspectRatioKey;
  resolution: ExportResolution;
  fps: 30 | 60;
  bitratePreset: ExportBitratePreset;
  videoBitrateMbps: number;
  audioBitrateKbps: AudioBitrateKbps;
  fadeType: FadeType;
}

export type ThemePresetKey = 'cyberpunk' | 'sunset' | 'emerald' | 'minimal';

export interface ThemePreset {
  key: ThemePresetKey;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'cyberpunk',
    name: 'Cyberpunk Neon',
    primaryColor: '#22d3ee',
    secondaryColor: '#ec4899',
    bgColor: '#090b10',
  },
  {
    key: 'sunset',
    name: 'Sunset Gold',
    primaryColor: '#fbbf24',
    secondaryColor: '#f43f5e',
    bgColor: '#130b14',
  },
  {
    key: 'emerald',
    name: 'Emerald Matrix',
    primaryColor: '#34d399',
    secondaryColor: '#06b6d4',
    bgColor: '#07120e',
  },
  {
    key: 'minimal',
    name: 'Minimal White',
    primaryColor: '#f8fafc',
    secondaryColor: '#94a3b8',
    bgColor: '#0b0d12',
  },
];

export interface LyricLine {
  id: string;
  time: number; // seconds
  text: string;
}

export type SidebarTab = 'media' | 'format' | 'visualizer' | 'lyrics' | 'style' | 'presets';

export interface SavedPreset {
  id: string;
  name: string;
  createdAt: string;
  version: 1;
  settings: StudioSettings;
}

export interface StudioSettings {
  aspectRatio: AspectRatioKey;
  visualizerMode: VisualizerMode;
  displayLayer?: DisplayLayerMode;
  lyricsOnly: boolean;
  lyricsOnlyLayout: LyricsOnlyLayout;
  lyricStyle: LyricStyle;
  themePreset: ThemePresetKey | 'custom';
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  autoCycleColor?: boolean;
  colorCycleSpeed?: number; // 0.25 - 8.0 rotations across track progress
  globalHueRotation?: number; // 0 - 360 degrees global palette hue shift
  sensitivity: number; // 0.5 - 2.5
  barCount: number; // 32 - 160
  smoothing: number; // 0.1 - 0.95
  visualizerScale: number; // 0.55 - 1.5
  motionBlur: number; // 0 - 0.85 (previous frame trail opacity)
  motionBlurPreset?: MotionBlurPresetKey;
  bloomIntensity: number; // 0 - 1.5 (additive lighter blur bloom)
  bloomPreset?: BloomPresetKey;
  bloomRadius?: number; // 0.5 - 2.2 (multi-pass blur kernel multiplier)
  bloomSpread?: number; // 0 - 1 (core vs atmospheric haze balance)
  bloomSaturation?: number; // 0.7 - 1.8 (bloom extraction color saturation & brightness)
  globalGlow?: number; // 0 - 1 (uniform scene-wide emission glow intensity)
  glitchIntensity: number; // 0 - 1 (beat-triggered frame drop & chromatic aberration)
  bassShake: number; // 0 - 1 (beat-triggered camera oscillation on bass hits)
  beatShake?: number; // 0 - 1 (rapid, subtle screen-shake on every detected beat)
  scanlineIntensity?: number; // 0 - 1 (brightness-reactive vintage CRT scanline texture)
  scanlineColor?: string; // 'auto' (follows active theme) or custom hex CRT tint color
  beatDetection: boolean;
  beatSensitivity: number; // 0.8 - 2.0
  beatFlash?: boolean; // briefly invert/flash background on beat triggers
  beatColorMappingEnabled?: boolean; // interpolate visualizer colors across low/mid/high ranges on beat energy
  beatColorLow?: string; // hex color for low-frequency beat range
  beatColorMid?: string; // hex color for mid-frequency beat range
  beatColorHigh?: string; // hex color for high-frequency beat range
  danceEnabled?: boolean;
  danceStyle?: DanceStyleKey;
  danceMedleyEnabled?: boolean; // Auto-cycle through multiple dance moves during a song
  danceMedleyStyles?: DanceStyleKey[]; // Ordered rotation of dance/mocap styles
  danceMedleyTrigger?: DanceMedleyTriggerMode; // 'beats' | 'seconds' | 'lyrics'
  danceMedleyIntervalBeats?: number; // 2 - 32 beats before switching move
  danceMedleyIntervalSeconds?: number; // 2 - 30 seconds before switching move
  danceMedleyBlendDuration?: number; // 0.15 - 1.5 seconds smooth 3D pose crossfade
  avatarStyle?: DanceAvatarStyle;
  danceAvatarStyle?: DanceAvatarStyle;
  dancePlacement?: DancePlacement;
  danceCount?: number; // 1 - 3 synchronized dancers on stage
  danceScale?: number; // 0.5 - 1.6
  danceEnergy?: number; // 0.3 - 2.0
  danceLyricSync?: boolean;
  danceStrobe?: number; // 0 - 1 (post-processing beat-peak strobe on dancing avatars)
  danceGlow?: number; // 0 - 1.5 (soft emission glow around 3D dancer characters)
  danceMirror?: boolean; // horizontally flip dancing avatars for symmetric stage look
  danceSpotlightIntensity?: number; // 0 - 2.0 (stage spotlight cone, floor pool & key-light intensity)
  danceRimColor?: string; // 'auto' (follows active theme) or custom hex rim light color
  danceShadow?: boolean; // floor-mapped drop shadow reactive to stage lighting position
  trackTitle: string;
  artistName: string;
  showTrackOverlay: boolean;
  lyricPosition: number; // 15 - 92 (% from top)
  lyricFont?: LyricFontKey; // typography override ('auto' uses display style default)
  lyricSize?: number; // 0.7 - 1.5 typography scale multiplier (default 1.0)
  lyricLetterSpacing?: number; // -0.06 - 0.30 em (character tracking / kerning)
  lyricShadowIntensity?: number; // 0 - 2.0 (0 = off, 1 = standard, 2 = deep contrast)
  lyricBeatSync?: boolean; // scale up & glow active lyrics on detected beats
  lyricPulseIntensity?: number; // 0 - 2.0 (beat sync scale/glow multiplier)
  bgBlur: number; // 0 - 30
  bgDim: number; // 0 - 0.9
  bgFit?: BackgroundFitMode;
  bgScale?: number; // 1.0 - 2.0
  bgOffsetX?: number; // -50 - 50 (%)
  bgOffsetY?: number; // -50 - 50 (%)
  bgBrightness?: number; // 0.4 - 1.6
  bgContrast?: number; // 0.5 - 1.6
  bgSaturation?: number; // 0 - 2.0
  bgVignette?: number; // 0 - 1.0
  bgTintStrength?: number; // 0 - 0.65
  showCoverCard?: boolean;
  coverCardSource?: CoverCardSource;
  coverCardPosition?: CoverCardPosition;
  coverCardSize?: number; // 0.6 - 1.4
  coverCardRadius?: number; // 0 - 32px
  exportFps: 30 | 60;
  exportResolution: ExportResolution;
  bitratePreset: ExportBitratePreset;
  videoBitrateMbps: number; // 2 - 35
  audioBitrateKbps: AudioBitrateKbps;
  fadeType: FadeType;
  showSafeZone: boolean;
  sceneTransitionType: SceneTransitionType;
  sceneTransitionDuration: number; // 0.15 - 1.5 seconds
  sceneTransitionTarget: SceneTransitionTarget;
  particleEnabled: boolean;
  particleShape: ParticleShape;
  particleVelocity: number; // 0.2 - 3.0 multiplier
  particleLifespan: number; // 0.3 - 3.5 seconds
  particleFlowMap: number[]; // interleaved [vx, vy] grid (16x12x2)
  djFilterCutoff?: number; // 0 - 1 (LPF sweep: 160 Hz - 18 kHz)
  djFilterResonance?: number; // 0.7 - 12 Q
  djAutoFilterDepth?: number; // 0 - 1 BPM-synced LFO filter sweep depth
  djDelayMix?: number; // 0 - 1 Beat-synced delay wet mix
  djDelayFeedback?: number; // 0 - 0.85 Beat-synced delay feedback
  djBeatGateDepth?: number; // 0 - 1 BPM-synced beat gate/pump depth
  djTransientAttack?: number; // -1 to +1 Transient Shaper attack punch/soften
  djTransientSustain?: number; // -1 to +1 Transient Shaper drum tail sustain/tighten
  djTransientDither?: number; // 0 to 1 TPDF high-pass dither noise floor shaping
  djNoiseGateThreshold?: number; // -80 (Off) to -18 dBFS noise gate threshold
}

export interface BeatShockwave {
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

export interface BeatState {
  rollingEnergy: number;
  cooldown: number;
  burstIntensity: number;
  lastEnergy: number;
  shockwaves: BeatShockwave[];
  elapsedTime?: number;
  lastBeatTime?: number;
  beatIntervals?: number[];
  estimatedBpm?: number;
}

export interface MotionBlurState {
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
  secondaryCanvas?: HTMLCanvasElement | OffscreenCanvas | null;
  hasFrame: boolean;
  frameIndex?: number;
  lastPreset?: MotionBlurPresetKey;
}

export interface SceneTransitionState {
  activeMode: VisualizerMode | null;
  fromMode: VisualizerMode | null;
  elapsed: number;
  duration: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface ExportProgressState {
  status: 'idle' | 'preparing' | 'rendering' | 'muxing' | 'completed' | 'error' | 'cancelled';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  message: string;
  error?: string;
  downloadUrl?: string;
  downloadFileName?: string;
  fileSizeBytes?: number;
  elapsedMs?: number;
}

export interface BatchExportJob {
  id: string;
  label: string;
  trimStart: number;
  trimEnd: number;
  settings: StudioSettings;
  status: 'queued' | 'rendering' | 'completed' | 'error' | 'cancelled';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  message: string;
  elapsedMs?: number;
  downloadUrl?: string;
  downloadFileName?: string;
  fileSizeBytes?: number;
  error?: string;
}

export interface BatchCompletionSummary {
  completedCount: number;
  failedCount: number;
  totalElapsedMs: number;
  totalClipDurationMs: number;
  totalOutputBytes: number;
  totalFramesRendered: number;
  desktopSent: boolean;
}

export interface ShareableVideoAsset {
  id: string;
  label: string;
  downloadUrl: string;
  downloadFileName: string;
  fileSizeBytes?: number;
  aspectRatio: AspectRatioKey;
  exportResolution?: ExportResolution;
  durationSec: number;
  trackTitle: string;
  artistName: string;
  visualizerMode: VisualizerMode;
  createdAt: string;
}

export type ProjectStatus = 'completed' | 'in-progress';

export const DEFAULT_PROJECT_TAGS = ['Work', 'Personal', 'Draft', 'Client', 'Social'] as const;

export function normalizeProjectTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function normalizeProjectTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of tags) {
    if (typeof item !== 'string') continue;
    const clean = normalizeProjectTag(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export type SnapshotKind = 'settings' | 'lyrics' | 'media' | 'project-state';

export interface ProjectMediaSnapshot {
  audioFileName: string | null;
  audioBlob: Blob | null;
  audioBuffer: AudioBuffer | null;
  waveformPeaks: number[];
  duration: number;
  trimStart: number;
  trimEnd: number;
  bgImageName: string | null;
  bgImageBlob: Blob | null;
  bgImage: HTMLImageElement | null;
  albumImageName: string | null;
  albumImageBlob: Blob | null;
  albumImage: HTMLImageElement | null;
  mocapClip: MocapClipData | null;
  mixClips: MixClipItem[];
  mixOptions: MixProjectOptions;
}

export interface ProjectMetaSnapshot {
  id: string | null;
  name: string;
  createdAt: string;
  status: ProjectStatus;
  completedAt?: string;
  lastExportedAt?: string;
  exportCount?: number;
  tags: string[];
}

export interface ProjectStateVersionSummary {
  id: string;
  label: string;
  createdAt: string;
  reason: 'save' | 'export' | 'checkpoint' | 'media';
  audioFileName: string | null;
  bgImageName: string | null;
  albumImageName: string | null;
  mocapName: string | null;
  mixClipCount: number;
  lyricsCount: number;
  trimStart: number;
  trimEnd: number;
  duration: number;
  visualizerMode: VisualizerMode;
  aspectRatio: AspectRatioKey;
  thumbnailDataUrl: string | null;
}

export interface ProjectStateVersionRecord extends ProjectStateVersionSummary {
  settings: StudioSettings;
  lyrics: LyricLine[];
  waveformPeaks: number[];
  audioBlob: Blob | null;
  bgImageBlob: Blob | null;
  albumImageBlob: Blob | null;
  mocapClip?: MocapClipData | null;
}

export interface StudioProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status?: ProjectStatus;
  completedAt?: string;
  lastExportedAt?: string;
  exportCount?: number;
  tags?: string[];
  settings: StudioSettings;
  lyrics: LyricLine[];
  trimStart: number;
  trimEnd: number;
  duration: number;
  waveformPeaks: number[];
  audioFileName: string | null;
  bgImageName: string | null;
  albumImageName: string | null;
  thumbnailDataUrl: string | null;
  hasAudioBlob: boolean;
  versions?: ProjectStateVersionSummary[];
}

export function isProjectCompleted(
  project: Pick<StudioProjectSummary, 'status' | 'lastExportedAt' | 'exportCount'>
): boolean {
  if (project.status === 'completed') return true;
  if (project.status === 'in-progress') return false;
  return Boolean(project.lastExportedAt) || (project.exportCount ?? 0) > 0;
}

export interface StudioProjectRecord extends StudioProjectSummary {
  audioBlob: Blob | null;
  bgImageBlob: Blob | null;
  albumImageBlob: Blob | null;
  mocapClip?: MocapClipData | null;
  versions?: ProjectStateVersionRecord[];
}

export function resolveDisplayLayer(
  settings: Pick<StudioSettings, 'displayLayer' | 'lyricsOnly'>
): DisplayLayerMode {
  if (
    settings.displayLayer === 'visualizer-only' ||
    settings.displayLayer === 'lyrics-only' ||
    settings.displayLayer === 'dance-only' ||
    settings.displayLayer === 'visualizer-lyrics'
  ) {
    return settings.displayLayer;
  }
  return settings.lyricsOnly ? 'lyrics-only' : 'visualizer-lyrics';
}

export type MixClipKind = 'audio' | 'video';

export type MixVideoBlendMode =
  | 'normal'
  | 'screen'
  | 'overlay'
  | 'multiply'
  | 'lighten'
  | 'darken'
  | 'color-dodge'
  | 'hard-light'
  | 'soft-light';

export const MIX_VIDEO_BLEND_MODES: Array<{
  id: MixVideoBlendMode;
  label: string;
}> = [
  { id: 'normal', label: 'Normal' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'darken', label: 'Darken' },
  { id: 'color-dodge', label: 'Color Dodge' },
  { id: 'hard-light', label: 'Hard Light' },
  { id: 'soft-light', label: 'Soft Light' },
];

export interface MixClipItem {
  id: string;
  name: string;
  kind: MixClipKind;
  file: File | null;
  objectUrl: string | null;
  duration: number;
  trimStart: number;
  trimEnd: number;
  startTime: number;
  volume: number; // 0 - 1.5
  muted: boolean;
  solo: boolean;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  videoOpacity: number; // 0 - 1
  videoBlendMode?: MixVideoBlendMode;
  hasVideo: boolean;
  videoWidth: number;
  videoHeight: number;
  audioBuffer: AudioBuffer | null;
  waveformPeaks: number[];
}

export interface MixProjectOptions {
  normalizeMixAudio: boolean;
  defaultCrossfadeSec: number;
}

export type DjMixTriggerMode = 'beats' | 'lyrics' | 'manual';

export type DjTransitionStyle =
  | 'bass-swap'
  | 'filter-sweep'
  | 'echo-out'
  | 'beat-drop'
  | 'stutter-cut';

export type DjVideoMixStyle =
  | 'crossfade'
  | 'beat-flash'
  | 'wipe-slide'
  | 'split-dual'
  | 'zoom-punch';

export interface DjTriBandPeaks {
  low: number[];
  mid: number[];
  high: number[];
  overall: number[];
}

export interface DjCuePoint {
  id: string;
  label: string;
  timeSec: number;
  color: string;
}

export interface DjTrackAsset {
  id: string;
  name: string;
  title: string;
  artist: string;
  kind: 'audio' | 'video';
  file: File | null;
  objectUrl: string | null;
  duration: number;
  hasVideo: boolean;
  videoWidth: number;
  videoHeight: number;
  audioBuffer: AudioBuffer;
  bpm: number;
  bpmHalfDoubleFactor: 0.5 | 1 | 2;
  autoBpm?: number;
  autoDownbeatAnchorSec?: number;
  beatGridOffsetMs?: number;
  beatGridLocked?: boolean;
  beatTimes: number[];
  downbeatTimes: number[];
  dropTime: number;
  recommendedOutTime: number;
  triBandPeaks: DjTriBandPeaks;
  lyrics: LyricLine[];
  cuePoints?: DjCuePoint[];
  energyScore: number;
  musicalKey?: string;
  camelotKey?: string;
  keyConfidence?: number;
  spectrogram?: DjSpectrogramData;
}

export interface DjDeckEqSettings {
  lowGainDb: number; // -18 to +9
  midGainDb: number; // -18 to +9
  highGainDb: number; // -18 to +9
  filterSweep: number; // -1 (HPF) to 0 (flat) to +1 (LPF)
  trimGain: number; // 0 to 1.5
  lowCrossoverHz?: number; // 120 to 380 Hz
  midCenterHz?: number; // 600 to 2000 Hz
  highCrossoverHz?: number; // 2600 to 6500 Hz
}



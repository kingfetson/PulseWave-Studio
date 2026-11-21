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
  | 'flame-corona';

export type LyricStyle = 'karaoke' | 'single-pop' | 'subtitle-bar';

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
  | 'subtle-glow'
  | 'dreamy-haze'
  | 'neon-bloom'
  | 'aggressive-flare'
  | 'custom';

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
  lyricStyle: LyricStyle;
  themePreset: ThemePresetKey | 'custom';
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  sensitivity: number; // 0.5 - 2.5
  barCount: number; // 32 - 160
  smoothing: number; // 0.1 - 0.95
  visualizerScale: number; // 0.55 - 1.5
  motionBlur: number; // 0 - 0.85 (previous frame trail opacity)
  bloomIntensity: number; // 0 - 1.5 (additive lighter blur bloom)
  bloomPreset?: BloomPresetKey;
  bloomRadius?: number; // 0.5 - 2.2 (multi-pass blur kernel multiplier)
  bloomSpread?: number; // 0 - 1 (core vs atmospheric haze balance)
  bloomSaturation?: number; // 0.7 - 1.8 (bloom extraction color saturation & brightness)
  glitchIntensity: number; // 0 - 1 (beat-triggered frame drop & chromatic aberration)
  bassShake: number; // 0 - 1 (beat-triggered camera oscillation on bass hits)
  beatDetection: boolean;
  beatSensitivity: number; // 0.8 - 2.0
  trackTitle: string;
  artistName: string;
  showTrackOverlay: boolean;
  lyricPosition: number; // 15 - 92 (% from top)
  bgBlur: number; // 0 - 30
  bgDim: number; // 0 - 0.9
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
}

export interface MotionBlurState {
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
  hasFrame: boolean;
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

export interface StudioProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastExportedAt?: string;
  exportCount?: number;
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
}

export interface StudioProjectRecord extends StudioProjectSummary {
  audioBlob: Blob | null;
  bgImageBlob: Blob | null;
  albumImageBlob: Blob | null;
}

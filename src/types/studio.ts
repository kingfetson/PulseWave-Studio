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
  | 'hybrid-particles';

export type LyricStyle = 'karaoke' | 'single-pop' | 'subtitle-bar';

export type FadeType = 'linear' | 'logarithmic' | 'exponential';

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
  motionBlur: number; // 0 - 0.85 (previous frame trail opacity)
  bloomIntensity: number; // 0 - 1.5 (additive lighter blur bloom)
  beatDetection: boolean;
  beatSensitivity: number; // 0.8 - 2.0
  trackTitle: string;
  artistName: string;
  showTrackOverlay: boolean;
  bgBlur: number; // 0 - 30
  bgDim: number; // 0 - 0.9
  exportFps: 30 | 60;
  fadeType: FadeType;
  showSafeZone: boolean;
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
  canvas: HTMLCanvasElement | null;
  hasFrame: boolean;
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
  error?: string;
}

export interface StudioProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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

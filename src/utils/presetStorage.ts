import {
  ASPECT_RATIOS,
  AspectRatioKey,
  FadeType,
  LyricStyle,
  SavedPreset,
  StudioSettings,
  ThemePresetKey,
  VisualizerMode,
} from '../types/studio';

const STORAGE_KEY = 'pulsewave_saved_presets_v1';

const VALID_ASPECT_RATIOS: AspectRatioKey[] = ['16:9', '9:16', '1:1'];
const VALID_VISUALIZERS: VisualizerMode[] = [
  'mirrored-bars',
  'circular-ring',
  'neon-wave',
  'hybrid-particles',
];
const VALID_LYRIC_STYLES: LyricStyle[] = ['karaoke', 'single-pop', 'subtitle-bar'];
const VALID_FADE_TYPES: FadeType[] = ['linear', 'logarithmic', 'exponential'];
const VALID_THEME_PRESETS: Array<ThemePresetKey | 'custom'> = [
  'cyberpunk',
  'sunset',
  'emerald',
  'minimal',
  'custom',
];

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function isHexColor(val: unknown): val is string {
  return typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val.trim());
}

export function createPresetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadSavedPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedPreset =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.settings === 'object' &&
        item.settings !== null
    );
  } catch {
    return [];
  }
}

export function persistSavedPresets(presets: SavedPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function validateAndNormalizeSettings(
  raw: unknown,
  fallback: StudioSettings
): StudioSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Require at least one core StudioSettings key to avoid accepting unrelated JSON files
  const recognizedKeys = [
    'aspectRatio',
    'visualizerMode',
    'lyricStyle',
    'primaryColor',
    'secondaryColor',
    'bgColor',
    'sensitivity',
    'barCount',
    'smoothing',
  ];
  const hasRecognized = recognizedKeys.some((k) => k in obj);
  if (!hasRecognized) {
    return null;
  }

  const aspectRatio = VALID_ASPECT_RATIOS.includes(obj.aspectRatio as AspectRatioKey)
    ? (obj.aspectRatio as AspectRatioKey)
    : fallback.aspectRatio;

  const visualizerMode = VALID_VISUALIZERS.includes(obj.visualizerMode as VisualizerMode)
    ? (obj.visualizerMode as VisualizerMode)
    : fallback.visualizerMode;

  const lyricStyle = VALID_LYRIC_STYLES.includes(obj.lyricStyle as LyricStyle)
    ? (obj.lyricStyle as LyricStyle)
    : fallback.lyricStyle;

  const fadeType = VALID_FADE_TYPES.includes(obj.fadeType as FadeType)
    ? (obj.fadeType as FadeType)
    : fallback.fadeType;

  const themePreset = VALID_THEME_PRESETS.includes(obj.themePreset as ThemePresetKey | 'custom')
    ? (obj.themePreset as ThemePresetKey | 'custom')
    : 'custom';

  const barCountRaw = clampNumber(obj.barCount, 32, 160, fallback.barCount);
  const barCount = Math.round(barCountRaw / 4) * 4;

  return {
    aspectRatio,
    visualizerMode,
    lyricStyle,
    themePreset,
    primaryColor: isHexColor(obj.primaryColor) ? obj.primaryColor.trim() : fallback.primaryColor,
    secondaryColor: isHexColor(obj.secondaryColor)
      ? obj.secondaryColor.trim()
      : fallback.secondaryColor,
    bgColor: isHexColor(obj.bgColor) ? obj.bgColor.trim() : fallback.bgColor,
    sensitivity: Number(clampNumber(obj.sensitivity, 0.5, 2.5, fallback.sensitivity).toFixed(2)),
    barCount,
    smoothing: Number(clampNumber(obj.smoothing, 0.1, 0.95, fallback.smoothing).toFixed(2)),
    motionBlur: Number(clampNumber(obj.motionBlur, 0, 0.85, fallback.motionBlur).toFixed(2)),
    bloomIntensity: Number(
      clampNumber(obj.bloomIntensity, 0, 1.5, fallback.bloomIntensity).toFixed(2)
    ),
    beatDetection:
      typeof obj.beatDetection === 'boolean' ? obj.beatDetection : fallback.beatDetection,
    beatSensitivity: Number(
      clampNumber(obj.beatSensitivity, 0.8, 2.0, fallback.beatSensitivity).toFixed(2)
    ),
    trackTitle: typeof obj.trackTitle === 'string' ? obj.trackTitle : fallback.trackTitle,
    artistName: typeof obj.artistName === 'string' ? obj.artistName : fallback.artistName,
    showTrackOverlay:
      typeof obj.showTrackOverlay === 'boolean'
        ? obj.showTrackOverlay
        : fallback.showTrackOverlay,
    bgBlur: Math.round(clampNumber(obj.bgBlur, 0, 30, fallback.bgBlur)),
    bgDim: Number(clampNumber(obj.bgDim, 0, 0.9, fallback.bgDim).toFixed(2)),
    exportFps: obj.exportFps === 60 ? 60 : obj.exportFps === 30 ? 30 : fallback.exportFps,
    fadeType,
    showSafeZone:
      typeof obj.showSafeZone === 'boolean' ? obj.showSafeZone : fallback.showSafeZone,
  };
}

export function parsePresetJson(
  jsonText: string,
  fileName: string,
  fallback: StudioSettings
): { name: string; settings: StudioSettings } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file. Please select a valid PulseWave preset JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Preset file must contain a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const candidateSettings =
    record.settings && typeof record.settings === 'object' ? record.settings : record;

  const normalized = validateAndNormalizeSettings(candidateSettings, fallback);
  if (!normalized) {
    throw new Error(
      'This JSON file does not contain valid PulseWave StudioSettings fields.'
    );
  }

  const cleanFileName = fileName
    .replace(/\.preset\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : cleanFileName || 'Imported Preset';

  return { name, settings: normalized };
}

export function slugifyPresetName(name: string, fallback = 'pulsewave-preset'): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadPresetJson(name: string, settings: StudioSettings): string {
  const cleanName = name.trim() || 'PulseWave Preset';
  const payload: SavedPreset = {
    id: createPresetId(),
    name: cleanName,
    createdAt: new Date().toISOString(),
    version: 1,
    settings,
  };

  const slug = slugifyPresetName(cleanName);
  const filename = `${slug}.preset.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  downloadBlob(blob, filename);
  return filename;
}

export function captureCanvasSnapshotPng(
  canvas: HTMLCanvasElement,
  name: string
): Promise<string> {
  const slug = slugifyPresetName(name, 'pulsewave-snapshot');
  const filename = `${slug}-snapshot.png`;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to capture PNG snapshot from preview canvas.'));
          return;
        }
        downloadBlob(blob, filename);
        resolve(filename);
      },
      'image/png'
    );
  });
}

export function formatPresetSummary(settings: StudioSettings): string {
  const ratio = ASPECT_RATIOS[settings.aspectRatio].key;
  const modeLabel: Record<VisualizerMode, string> = {
    'mirrored-bars': 'Mirrored Bars',
    'circular-ring': 'Circular Ring',
    'neon-wave': 'Neon Wave',
    'hybrid-particles': 'Hybrid Particles',
  };
  return `${ratio} · ${modeLabel[settings.visualizerMode]} · ${settings.exportFps} FPS`;
}

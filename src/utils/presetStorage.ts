import {
  ASPECT_RATIOS,
  AspectRatioKey,
  AudioBitrateKbps,
  BackgroundFitMode,
  BloomPresetKey,
  CoverCardPosition,
  CoverCardSource,
  createEmptyParticleFlowMap,
  DanceAvatarStyle,
  DancePlacement,
  DanceStyleKey,
  ExportBitratePreset,
  ExportResolution,
  FadeType,
  LyricFontKey,
  LyricsOnlyLayout,
  LyricStyle,
  MotionBlurPresetKey,
  PARTICLE_FLOW_COLS,
  PARTICLE_FLOW_ROWS,
  ParticleShape,
  SavedPreset,
  SceneTransitionTarget,
  SceneTransitionType,
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
  'dual-ribbon',
  'led-matrix',
  'harmonic-orb',
  'stereo-prism',
  'cube-3d',
  'galaxy-spiral',
  'cyber-tunnel',
  'seismic-ridges',
  'dna-helix',
  'radar-sonar',
  'lissajous-scope',
  'rain-matrix',
  'flower-mandala',
  'vortex-rings',
  'isometric-city',
  'analog-vu',
  'kaleido-shards',
  'flame-corona',
  'radial-bars-inward',
  'spectrum-waterfall',
  'pendulum-wave',
  'constellation-net',
  'waveform-mirror',
  'hex-hive',
  'plasma-field',
  'laser-fan',
  'synth-grid',
  'orbit-atoms',
  'bar-arc',
  'dot-equalizer',
  'lightning-bolts',
  'pixel-mosaic',
  'ripple-pond',
  'spiral-bars',
  'pyramid-3d',
  'heartbeat-ecg',
  'ribbon-knot',
  'starburst-rays',
  'glass-shards',
  'vinyl-grooves',
  'staircase-eq',
  'infinity-loop',
  'chromatic-rings',
  'sound-curtain',
  'cyber-compass',
  'nebula-clouds',
];
const VALID_PARTICLE_SHAPES: ParticleShape[] = [
  'circle',
  'diamond',
  'star',
  'square',
  'triangle',
  'ring',
];
const VALID_LYRIC_STYLES: LyricStyle[] = [
  'karaoke',
  'single-pop',
  'subtitle-bar',
  'neon-outline',
  'typewriter',
  'cinematic-serif',
  'word-sweep',
  'glass-card',
  'bold-impact',
  'split-reveal',
  'ticker-ribbon',
  'floating-cloud',
  'cyber-hud',
  'retro-arcade',
  'editorial-quote',
  'vinyl-sleeve',
  'glitch-flash',
  'duotone-badge',
  'vertical-spine',
  'wave-bounce',
];
const VALID_LYRIC_FONTS: LyricFontKey[] = [
  'auto',
  'sans',
  'serif',
  'mono',
  'display',
  'geometric',
];
const VALID_LYRICS_ONLY_LAYOUTS: LyricsOnlyLayout[] = [
  'half-verse',
  'full-verse',
  'full-lyrics',
];
const VALID_BG_FIT_MODES: BackgroundFitMode[] = ['cover', 'contain-blur', 'stretch'];
const VALID_COVER_CARD_SOURCES: CoverCardSource[] = ['auto', 'bg', 'album'];
const VALID_COVER_CARD_POSITIONS: CoverCardPosition[] = [
  'top-left',
  'top-center',
  'center',
];
const VALID_FADE_TYPES: FadeType[] = ['linear', 'logarithmic', 'exponential'];
const VALID_EXPORT_RESOLUTIONS: ExportResolution[] = ['720p', '1080p', '1440p'];
const VALID_BITRATE_PRESETS: ExportBitratePreset[] = [
  'compact',
  'balanced',
  'high',
  'master',
  'custom',
];
const VALID_AUDIO_BITRATES: AudioBitrateKbps[] = [128, 192, 256, 320];
const VALID_THEME_PRESETS: Array<ThemePresetKey | 'custom'> = [
  'cyberpunk',
  'sunset',
  'emerald',
  'minimal',
  'custom',
];
const VALID_BLOOM_PRESETS: BloomPresetKey[] = [
  'off',
  'subtle-glow',
  'dreamy-haze',
  'neon-bloom',
  'aggressive-flare',
  'custom',
];
const VALID_MOTION_BLUR_PRESETS: MotionBlurPresetKey[] = [
  'none',
  'trails',
  'ghosting',
  'stutter',
];
const VALID_SCENE_TRANSITION_TYPES: SceneTransitionType[] = [
  'none',
  'crossfade',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
];
const VALID_SCENE_TRANSITION_TARGETS: SceneTransitionTarget[] = [
  'both',
  'lyrics',
  'visualizer',
];
const VALID_DANCE_STYLES: DanceStyleKey[] = [
  'hip-hop',
  'shuffle',
  'robot',
  'groove',
  'break-freeze',
  'mocap-salsa',
  'mocap-ballet',
  'mocap-breakdance',
  'mocap-moonwalk',
  'mocap-house',
  'mocap-contemporary',
  'mocap-afrobeat',
  'mocap-tango',
  'mocap-shuffle',
  'mocap-kpop',
  'mocap-disco',
  'mocap-waltz',
  'mocap-custom',
];
const VALID_DANCE_AVATARS: DanceAvatarStyle[] = [
  'robot',
  'ninja',
  'casual',
  'formal',
  'human-dancer',
  'human-ballerina',
  'human-bboy',
  'human-diva',
  'human-suit',
  'human-neon',
  'silhouette',
  'neon-cyber',
  'holo-wire',
  'minimal-rig',
];
const VALID_DANCE_PLACEMENTS: DancePlacement[] = ['left', 'center', 'right'];

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
    'lyricsOnly',
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
    lyricsOnly:
      typeof obj.lyricsOnly === 'boolean' ? obj.lyricsOnly : fallback.lyricsOnly,
    lyricsOnlyLayout: VALID_LYRICS_ONLY_LAYOUTS.includes(
      obj.lyricsOnlyLayout as LyricsOnlyLayout
    )
      ? (obj.lyricsOnlyLayout as LyricsOnlyLayout)
      : fallback.lyricsOnlyLayout,
    lyricStyle,
    lyricFont: VALID_LYRIC_FONTS.includes(obj.lyricFont as LyricFontKey)
      ? (obj.lyricFont as LyricFontKey)
      : fallback.lyricFont ?? 'auto',
    themePreset,
    primaryColor: isHexColor(obj.primaryColor) ? obj.primaryColor.trim() : fallback.primaryColor,
    secondaryColor: isHexColor(obj.secondaryColor)
      ? obj.secondaryColor.trim()
      : fallback.secondaryColor,
    bgColor: isHexColor(obj.bgColor) ? obj.bgColor.trim() : fallback.bgColor,
    autoCycleColor:
      typeof obj.autoCycleColor === 'boolean'
        ? obj.autoCycleColor
        : fallback.autoCycleColor ?? false,
    colorCycleSpeed: Number(
      clampNumber(obj.colorCycleSpeed, 0.25, 8, fallback.colorCycleSpeed ?? 1).toFixed(2)
    ),
    sensitivity: Number(clampNumber(obj.sensitivity, 0.5, 2.5, fallback.sensitivity).toFixed(2)),
    barCount,
    smoothing: Number(clampNumber(obj.smoothing, 0.1, 0.95, fallback.smoothing).toFixed(2)),
    visualizerScale: Number(
      clampNumber(obj.visualizerScale, 0.55, 1.5, fallback.visualizerScale).toFixed(2)
    ),
    motionBlur: Number(clampNumber(obj.motionBlur, 0, 0.85, fallback.motionBlur).toFixed(2)),
    motionBlurPreset: VALID_MOTION_BLUR_PRESETS.includes(
      obj.motionBlurPreset as MotionBlurPresetKey
    )
      ? (obj.motionBlurPreset as MotionBlurPresetKey)
      : fallback.motionBlurPreset ??
        (clampNumber(obj.motionBlur, 0, 0.85, fallback.motionBlur) > 0.005
          ? 'trails'
          : 'none'),
    bloomIntensity: Number(
      clampNumber(obj.bloomIntensity, 0, 1.5, fallback.bloomIntensity).toFixed(2)
    ),
    bloomPreset: VALID_BLOOM_PRESETS.includes(obj.bloomPreset as BloomPresetKey)
      ? (obj.bloomPreset as BloomPresetKey)
      : fallback.bloomPreset ?? 'custom',
    bloomRadius: Number(
      clampNumber(obj.bloomRadius, 0.5, 2.2, fallback.bloomRadius ?? 1.0).toFixed(2)
    ),
    bloomSpread: Number(
      clampNumber(obj.bloomSpread, 0, 1, fallback.bloomSpread ?? 0.5).toFixed(2)
    ),
    bloomSaturation: Number(
      clampNumber(obj.bloomSaturation, 0.7, 1.8, fallback.bloomSaturation ?? 1.05).toFixed(2)
    ),
    glitchIntensity: Number(
      clampNumber(obj.glitchIntensity, 0, 1, fallback.glitchIntensity).toFixed(2)
    ),
    bassShake: Number(
      clampNumber(obj.bassShake, 0, 1, fallback.bassShake ?? 0).toFixed(2)
    ),
    beatDetection:
      typeof obj.beatDetection === 'boolean' ? obj.beatDetection : fallback.beatDetection,
    beatSensitivity: Number(
      clampNumber(obj.beatSensitivity, 0.8, 2.0, fallback.beatSensitivity).toFixed(2)
    ),
    beatFlash:
      typeof obj.beatFlash === 'boolean'
        ? obj.beatFlash
        : fallback.beatFlash ?? false,
    danceEnabled:
      typeof obj.danceEnabled === 'boolean'
        ? obj.danceEnabled
        : fallback.danceEnabled ?? false,
    danceStyle: VALID_DANCE_STYLES.includes(obj.danceStyle as DanceStyleKey)
      ? (obj.danceStyle as DanceStyleKey)
      : fallback.danceStyle ?? 'hip-hop',
    avatarStyle: VALID_DANCE_AVATARS.includes(obj.avatarStyle as DanceAvatarStyle)
      ? (obj.avatarStyle as DanceAvatarStyle)
      : VALID_DANCE_AVATARS.includes(obj.danceAvatarStyle as DanceAvatarStyle)
      ? (obj.danceAvatarStyle as DanceAvatarStyle)
      : fallback.avatarStyle ?? fallback.danceAvatarStyle ?? 'human-dancer',
    danceAvatarStyle: VALID_DANCE_AVATARS.includes(obj.avatarStyle as DanceAvatarStyle)
      ? (obj.avatarStyle as DanceAvatarStyle)
      : VALID_DANCE_AVATARS.includes(obj.danceAvatarStyle as DanceAvatarStyle)
      ? (obj.danceAvatarStyle as DanceAvatarStyle)
      : fallback.avatarStyle ?? fallback.danceAvatarStyle ?? 'human-dancer',
    dancePlacement: VALID_DANCE_PLACEMENTS.includes(obj.dancePlacement as DancePlacement)
      ? (obj.dancePlacement as DancePlacement)
      : fallback.dancePlacement ?? 'center',
    danceCount: Math.round(clampNumber(obj.danceCount, 1, 3, fallback.danceCount ?? 1)),
    danceScale: Number(
      clampNumber(obj.danceScale, 0.5, 1.6, fallback.danceScale ?? 1).toFixed(2)
    ),
    danceEnergy: Number(
      clampNumber(obj.danceEnergy, 0.3, 2.0, fallback.danceEnergy ?? 1).toFixed(2)
    ),
    danceLyricSync:
      typeof obj.danceLyricSync === 'boolean'
        ? obj.danceLyricSync
        : fallback.danceLyricSync ?? true,
    danceStrobe: Number(
      clampNumber(obj.danceStrobe, 0, 1, fallback.danceStrobe ?? 0).toFixed(2)
    ),
    danceMirror:
      typeof obj.danceMirror === 'boolean'
        ? obj.danceMirror
        : fallback.danceMirror ?? false,
    danceSpotlightIntensity: Number(
      clampNumber(
        obj.danceSpotlightIntensity,
        0,
        2,
        fallback.danceSpotlightIntensity ?? 1
      ).toFixed(2)
    ),
    danceRimColor:
      typeof obj.danceRimColor === 'string' &&
      (obj.danceRimColor.trim().toLowerCase() === 'auto' || isHexColor(obj.danceRimColor))
        ? obj.danceRimColor.trim().toLowerCase() === 'auto'
          ? 'auto'
          : obj.danceRimColor.trim()
        : fallback.danceRimColor ?? 'auto',
    danceShadow:
      typeof obj.danceShadow === 'boolean'
        ? obj.danceShadow
        : fallback.danceShadow ?? true,
    trackTitle: typeof obj.trackTitle === 'string' ? obj.trackTitle : fallback.trackTitle,
    artistName: typeof obj.artistName === 'string' ? obj.artistName : fallback.artistName,
    showTrackOverlay:
      typeof obj.showTrackOverlay === 'boolean'
        ? obj.showTrackOverlay
        : fallback.showTrackOverlay,
    lyricPosition: Math.round(clampNumber(obj.lyricPosition, 15, 92, fallback.lyricPosition)),
    lyricLetterSpacing: Number(
      clampNumber(obj.lyricLetterSpacing, -0.06, 0.3, fallback.lyricLetterSpacing ?? 0).toFixed(2)
    ),
    lyricShadowIntensity: Number(
      clampNumber(obj.lyricShadowIntensity, 0, 2, fallback.lyricShadowIntensity ?? 1).toFixed(2)
    ),
    lyricBeatSync:
      typeof obj.lyricBeatSync === 'boolean'
        ? obj.lyricBeatSync
        : fallback.lyricBeatSync ?? false,
    lyricPulseIntensity: Number(
      clampNumber(obj.lyricPulseIntensity, 0, 2, fallback.lyricPulseIntensity ?? 1).toFixed(2)
    ),
    bgBlur: Math.round(clampNumber(obj.bgBlur, 0, 30, fallback.bgBlur)),
    bgDim: Number(clampNumber(obj.bgDim, 0, 0.9, fallback.bgDim).toFixed(2)),
    bgFit: VALID_BG_FIT_MODES.includes(obj.bgFit as BackgroundFitMode)
      ? (obj.bgFit as BackgroundFitMode)
      : fallback.bgFit ?? 'cover',
    bgScale: Number(clampNumber(obj.bgScale, 1, 2, fallback.bgScale ?? 1).toFixed(2)),
    bgOffsetX: Math.round(clampNumber(obj.bgOffsetX, -50, 50, fallback.bgOffsetX ?? 0)),
    bgOffsetY: Math.round(clampNumber(obj.bgOffsetY, -50, 50, fallback.bgOffsetY ?? 0)),
    bgBrightness: Number(
      clampNumber(obj.bgBrightness, 0.4, 1.6, fallback.bgBrightness ?? 1).toFixed(2)
    ),
    bgContrast: Number(
      clampNumber(obj.bgContrast, 0.5, 1.6, fallback.bgContrast ?? 1).toFixed(2)
    ),
    bgSaturation: Number(
      clampNumber(obj.bgSaturation, 0, 2, fallback.bgSaturation ?? 1).toFixed(2)
    ),
    bgVignette: Number(
      clampNumber(obj.bgVignette, 0, 1, fallback.bgVignette ?? 0).toFixed(2)
    ),
    bgTintStrength: Number(
      clampNumber(obj.bgTintStrength, 0, 0.65, fallback.bgTintStrength ?? 0).toFixed(2)
    ),
    showCoverCard:
      typeof obj.showCoverCard === 'boolean'
        ? obj.showCoverCard
        : fallback.showCoverCard ?? false,
    coverCardSource: VALID_COVER_CARD_SOURCES.includes(obj.coverCardSource as CoverCardSource)
      ? (obj.coverCardSource as CoverCardSource)
      : fallback.coverCardSource ?? 'auto',
    coverCardPosition: VALID_COVER_CARD_POSITIONS.includes(
      obj.coverCardPosition as CoverCardPosition
    )
      ? (obj.coverCardPosition as CoverCardPosition)
      : fallback.coverCardPosition ?? 'top-left',
    coverCardSize: Number(
      clampNumber(obj.coverCardSize, 0.6, 1.4, fallback.coverCardSize ?? 1).toFixed(2)
    ),
    coverCardRadius: Math.round(
      clampNumber(obj.coverCardRadius, 0, 32, fallback.coverCardRadius ?? 14)
    ),
    exportFps: obj.exportFps === 60 ? 60 : obj.exportFps === 30 ? 30 : fallback.exportFps,
    exportResolution: VALID_EXPORT_RESOLUTIONS.includes(obj.exportResolution as ExportResolution)
      ? (obj.exportResolution as ExportResolution)
      : fallback.exportResolution,
    bitratePreset: VALID_BITRATE_PRESETS.includes(obj.bitratePreset as ExportBitratePreset)
      ? (obj.bitratePreset as ExportBitratePreset)
      : fallback.bitratePreset,
    videoBitrateMbps: Math.round(
      clampNumber(obj.videoBitrateMbps, 2, 35, fallback.videoBitrateMbps)
    ),
    audioBitrateKbps: VALID_AUDIO_BITRATES.includes(obj.audioBitrateKbps as AudioBitrateKbps)
      ? (obj.audioBitrateKbps as AudioBitrateKbps)
      : fallback.audioBitrateKbps,
    fadeType,
    showSafeZone:
      typeof obj.showSafeZone === 'boolean' ? obj.showSafeZone : fallback.showSafeZone,
    sceneTransitionType: VALID_SCENE_TRANSITION_TYPES.includes(
      obj.sceneTransitionType as SceneTransitionType
    )
      ? (obj.sceneTransitionType as SceneTransitionType)
      : fallback.sceneTransitionType,
    sceneTransitionDuration: Number(
      clampNumber(
        obj.sceneTransitionDuration,
        0.15,
        1.5,
        fallback.sceneTransitionDuration
      ).toFixed(2)
    ),
    sceneTransitionTarget: VALID_SCENE_TRANSITION_TARGETS.includes(
      obj.sceneTransitionTarget as SceneTransitionTarget
    )
      ? (obj.sceneTransitionTarget as SceneTransitionTarget)
      : fallback.sceneTransitionTarget,
    particleEnabled:
      typeof obj.particleEnabled === 'boolean'
        ? obj.particleEnabled
        : fallback.particleEnabled,
    particleShape: VALID_PARTICLE_SHAPES.includes(obj.particleShape as ParticleShape)
      ? (obj.particleShape as ParticleShape)
      : fallback.particleShape,
    particleVelocity: Number(
      clampNumber(obj.particleVelocity, 0.2, 3.0, fallback.particleVelocity).toFixed(2)
    ),
    particleLifespan: Number(
      clampNumber(obj.particleLifespan, 0.3, 3.5, fallback.particleLifespan).toFixed(2)
    ),
    particleFlowMap: (() => {
      const expectedLen = PARTICLE_FLOW_COLS * PARTICLE_FLOW_ROWS * 2;
      if (Array.isArray(obj.particleFlowMap) && obj.particleFlowMap.length === expectedLen) {
        return obj.particleFlowMap.map((v) =>
          typeof v === 'number' && Number.isFinite(v)
            ? Number(Math.max(-1, Math.min(1, v)).toFixed(3))
            : 0
        );
      }
      return fallback.particleFlowMap.length === expectedLen
        ? [...fallback.particleFlowMap]
        : createEmptyParticleFlowMap();
    })(),
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
    'dual-ribbon': 'Aurora Ribbons',
    'led-matrix': 'LED Matrix',
    'harmonic-orb': 'Harmonic Orbital',
    'stereo-prism': 'Stereo Prism',
    'cube-3d': '3D Cube',
    'galaxy-spiral': 'Galaxy Vortex',
    'cyber-tunnel': 'Warp Tunnel',
    'seismic-ridges': 'Seismic Ridges',
    'dna-helix': 'DNA Helix',
    'radar-sonar': 'Sonar Radar',
    'lissajous-scope': 'Lissajous Scope',
    'rain-matrix': 'Digital Rain',
    'flower-mandala': 'Lotus Mandala',
    'vortex-rings': '3D Gyroscope',
    'isometric-city': 'Iso Equalizer',
    'analog-vu': 'Dual VU Meters',
    'kaleido-shards': 'Kaleidoscope',
    'flame-corona': 'Solar Corona',
    'radial-bars-inward': 'Implosion Ring',
    'spectrum-waterfall': 'Neon Waterfall',
    'pendulum-wave': 'Harmonic Pendulum',
    'constellation-net': 'Constellation Net',
    'waveform-mirror': 'Mirrored Scope',
    'hex-hive': 'Hex Honeycomb',
    'plasma-field': 'EM Flux Field',
    'laser-fan': 'Concert Laser Fan',
    'synth-grid': 'Synthwave Horizon',
    'orbit-atoms': 'Atomic Orbital',
    'bar-arc': 'Archway EQ',
    'dot-equalizer': 'LED Dot Matrix',
    'lightning-bolts': 'Tesla Arcs',
    'pixel-mosaic': 'Pixel Mosaic',
    'ripple-pond': 'Acoustic Ripples',
    'spiral-bars': 'Fibonacci Spiral',
    'pyramid-3d': '3D Wire Pyramid',
    'heartbeat-ecg': 'Pulse ECG Trace',
    'ribbon-knot': 'Toroidal Knot',
    'starburst-rays': 'Hypernova Rays',
    'glass-shards': 'Prismatic Shards',
    'vinyl-grooves': 'Vinyl Resonance',
    'staircase-eq': 'Stepped Skyline',
    'infinity-loop': 'Infinity Loop',
    'chromatic-rings': 'Chromatic Halo',
    'sound-curtain': 'Acoustic Curtain',
    'cyber-compass': 'HUD Compass',
    'nebula-clouds': 'Cosmic Nebula',
  };
  if (settings.lyricsOnly) {
    const layoutLabels: Record<LyricsOnlyLayout, string> = {
      'half-verse': 'Half Verse',
      'full-verse': 'Full Verse',
      'full-lyrics': 'Full Lyrics',
    };
    const layoutText = layoutLabels[settings.lyricsOnlyLayout ?? 'full-verse'] ?? 'Full Verse';
    return `${ratio} · Lyrics Only (${layoutText}) · ${settings.exportFps} FPS`;
  }
  return `${ratio} · ${modeLabel[settings.visualizerMode]} · ${settings.exportFps} FPS`;
}

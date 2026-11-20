import {
  AspectRatioKey,
  AudioBitrateKbps,
  ExportBitratePreset,
  ExportProfile,
  ExportResolution,
  FadeType,
  resolveExportDimensions,
  StudioSettings,
} from '../types/studio';

const EXPORT_PROFILES_STORAGE_KEY = 'pulsewave_export_profiles_v1';

const VALID_RATIOS: AspectRatioKey[] = ['16:9', '9:16', '1:1'];
const VALID_RESOLUTIONS: ExportResolution[] = ['720p', '1080p', '1440p'];
const VALID_BITRATE_PRESETS: ExportBitratePreset[] = [
  'compact',
  'balanced',
  'high',
  'master',
  'custom',
];
const VALID_AUDIO_BITRATES: AudioBitrateKbps[] = [128, 192, 256, 320];
const VALID_FADES: FadeType[] = ['linear', 'logarithmic', 'exponential'];

export const BUILT_IN_EXPORT_PROFILES: ExportProfile[] = [
  {
    id: 'builtin-tiktok-9x16-hq',
    name: 'TikTok 9:16 High Quality',
    description: '1080×1920 vertical 60fps for crisp TikTok, Reels & Shorts uploads',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    aspectRatio: '9:16',
    resolution: '1080p',
    fps: 60,
    bitratePreset: 'high',
    videoBitrateMbps: 14,
    audioBitrateKbps: 256,
    fadeType: 'logarithmic',
  },
  {
    id: 'builtin-youtube-16x9-60fps',
    name: 'YouTube 16:9 60fps',
    description: 'Full HD 1920×1080 at 60fps with high-bitrate H.264 & 256k AAC',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    aspectRatio: '16:9',
    resolution: '1080p',
    fps: 60,
    bitratePreset: 'high',
    videoBitrateMbps: 14,
    audioBitrateKbps: 256,
    fadeType: 'linear',
  },
  {
    id: 'builtin-youtube-16x9-1440p-master',
    name: 'YouTube 16:9 1440p Master',
    description: '2560×1440 QHD 60fps master for maximum YouTube VP9/AV1 transcode quality',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    aspectRatio: '16:9',
    resolution: '1440p',
    fps: 60,
    bitratePreset: 'master',
    videoBitrateMbps: 24,
    audioBitrateKbps: 320,
    fadeType: 'linear',
  },
  {
    id: 'builtin-reels-9x16-fast',
    name: 'Reels & Shorts 9:16 Fast',
    description: '720×1280 30fps balanced bitrate for quick mobile drafts',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    aspectRatio: '9:16',
    resolution: '720p',
    fps: 30,
    bitratePreset: 'balanced',
    videoBitrateMbps: 8,
    audioBitrateKbps: 192,
    fadeType: 'linear',
  },
  {
    id: 'builtin-instagram-1x1-hd',
    name: 'Instagram 1:1 Square HD',
    description: '1080×1080 square feed master with balanced compression',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    aspectRatio: '1:1',
    resolution: '1080p',
    fps: 30,
    bitratePreset: 'balanced',
    videoBitrateMbps: 8,
    audioBitrateKbps: 192,
    fadeType: 'linear',
  },
];

export function createExportProfileId(): string {
  return `exp-profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeExportProfile(raw: unknown): ExportProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.name !== 'string' || !obj.name.trim()) {
    return null;
  }

  const aspectRatio = VALID_RATIOS.includes(obj.aspectRatio as AspectRatioKey)
    ? (obj.aspectRatio as AspectRatioKey)
    : '16:9';
  const resolution = VALID_RESOLUTIONS.includes(obj.resolution as ExportResolution)
    ? (obj.resolution as ExportResolution)
    : '1080p';
  const fps = obj.fps === 60 ? 60 : 30;
  const bitratePreset = VALID_BITRATE_PRESETS.includes(obj.bitratePreset as ExportBitratePreset)
    ? (obj.bitratePreset as ExportBitratePreset)
    : 'balanced';
  const videoBitrateMbps =
    typeof obj.videoBitrateMbps === 'number' && Number.isFinite(obj.videoBitrateMbps)
      ? Math.max(2, Math.min(35, Math.round(obj.videoBitrateMbps)))
      : 8;
  const audioBitrateKbps = VALID_AUDIO_BITRATES.includes(obj.audioBitrateKbps as AudioBitrateKbps)
    ? (obj.audioBitrateKbps as AudioBitrateKbps)
    : 192;
  const fadeType = VALID_FADES.includes(obj.fadeType as FadeType)
    ? (obj.fadeType as FadeType)
    : 'linear';

  return {
    id: obj.id,
    name: obj.name.trim(),
    description: typeof obj.description === 'string' ? obj.description : undefined,
    isBuiltIn: false,
    createdAt:
      typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    aspectRatio,
    resolution,
    fps,
    bitratePreset,
    videoBitrateMbps,
    audioBitrateKbps,
    fadeType,
  };
}

export function loadCustomExportProfiles(): ExportProfile[] {
  try {
    const raw = localStorage.getItem(EXPORT_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeExportProfile)
      .filter((p): p is ExportProfile => p !== null);
  } catch {
    return [];
  }
}

export function persistCustomExportProfiles(profiles: ExportProfile[]): void {
  try {
    const customOnly = profiles.filter((p) => !p.isBuiltIn);
    localStorage.setItem(EXPORT_PROFILES_STORAGE_KEY, JSON.stringify(customOnly));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function buildExportProfileFromSettings(
  name: string,
  settings: StudioSettings,
  description?: string
): ExportProfile {
  const dims = resolveExportDimensions(settings.aspectRatio, settings.exportResolution);
  const trimmedName =
    name.trim() ||
    `${settings.aspectRatio} ${settings.exportResolution} ${settings.exportFps}fps`;

  return {
    id: createExportProfileId(),
    name: trimmedName,
    description:
      description?.trim() ||
      `${dims.width}×${dims.height} · ${settings.exportFps}fps · ${settings.videoBitrateMbps} Mbps`,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    aspectRatio: settings.aspectRatio,
    resolution: settings.exportResolution,
    fps: settings.exportFps,
    bitratePreset: settings.bitratePreset,
    videoBitrateMbps: settings.videoBitrateMbps,
    audioBitrateKbps: settings.audioBitrateKbps,
    fadeType: settings.fadeType,
  };
}

export function exportProfileToSettingsPatch(
  profile: ExportProfile
): Pick<
  StudioSettings,
  | 'aspectRatio'
  | 'exportResolution'
  | 'exportFps'
  | 'bitratePreset'
  | 'videoBitrateMbps'
  | 'audioBitrateKbps'
  | 'fadeType'
> {
  return {
    aspectRatio: profile.aspectRatio,
    exportResolution: profile.resolution,
    exportFps: profile.fps,
    bitratePreset: profile.bitratePreset,
    videoBitrateMbps: profile.videoBitrateMbps,
    audioBitrateKbps: profile.audioBitrateKbps,
    fadeType: profile.fadeType,
  };
}

export function findMatchingExportProfile(
  settings: StudioSettings,
  profiles: ExportProfile[]
): ExportProfile | null {
  return (
    profiles.find(
      (p) =>
        p.aspectRatio === settings.aspectRatio &&
        p.resolution === settings.exportResolution &&
        p.fps === settings.exportFps &&
        p.videoBitrateMbps === settings.videoBitrateMbps &&
        p.audioBitrateKbps === settings.audioBitrateKbps &&
        p.fadeType === settings.fadeType
    ) ?? null
  );
}

export function estimateMp4SizeMb(
  durationSec: number,
  videoBitrateMbps: number,
  audioBitrateKbps: number
): number {
  const safeDuration = Math.max(0, durationSec);
  const totalBitsPerSec = videoBitrateMbps * 1_000_000 + audioBitrateKbps * 1000;
  return (safeDuration * totalBitsPerSec) / 8 / (1024 * 1024);
}

export function formatExportProfileMeta(
  profile: Pick<
    ExportProfile,
    'aspectRatio' | 'resolution' | 'fps' | 'videoBitrateMbps' | 'audioBitrateKbps'
  >
): string {
  const dims = resolveExportDimensions(profile.aspectRatio, profile.resolution);
  return `${dims.width}×${dims.height} · ${profile.fps}fps · ${profile.videoBitrateMbps}M / ${profile.audioBitrateKbps}k`;
}

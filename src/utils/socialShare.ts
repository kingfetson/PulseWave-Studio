import {
  AspectRatioKey,
  LyricLine,
  ShareableVideoAsset,
} from '../types/studio';

export type SocialPlatformId =
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'linkedin';

export interface SocialPlatformSpec {
  id: SocialPlatformId;
  name: string;
  shortLabel: string;
  accentHex: string;
  recommendedRatios: AspectRatioKey[];
  preferredRatio: AspectRatioKey;
  maxDurationSec: number | null;
  captionLimit: number;
  actionLabel: string;
  uploadInstructions: string;
  getUploadUrl: (asset: ShareableVideoAsset, postText: string) => string;
}

export const SOCIAL_PLATFORMS: SocialPlatformSpec[] = [
  {
    id: 'youtube',
    name: 'YouTube & Shorts',
    shortLabel: 'YouTube',
    accentHex: '#ef4444',
    recommendedRatios: ['16:9', '9:16'],
    preferredRatio: '16:9',
    maxDurationSec: null,
    captionLimit: 5000,
    actionLabel: 'Open YouTube Studio Upload',
    uploadInstructions:
      'Downloads your MP4 and copies the title & description. Drag the MP4 into YouTube Studio and paste.',
    getUploadUrl: () => 'https://www.youtube.com/upload',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    shortLabel: 'TikTok',
    accentHex: '#22d3ee',
    recommendedRatios: ['9:16'],
    preferredRatio: '9:16',
    maxDurationSec: 600,
    captionLimit: 2200,
    actionLabel: 'Open TikTok Uploader',
    uploadInstructions:
      'Downloads your MP4 and copies your caption & hashtags. Drop the MP4 into TikTok Creator Center.',
    getUploadUrl: () => 'https://www.tiktok.com/creator-center/upload',
  },
  {
    id: 'facebook',
    name: 'Facebook & Reels',
    shortLabel: 'Facebook',
    accentHex: '#3b82f6',
    recommendedRatios: ['9:16', '16:9', '1:1'],
    preferredRatio: '9:16',
    maxDurationSec: null,
    captionLimit: 63206,
    actionLabel: 'Open Facebook Uploader',
    uploadInstructions:
      'Downloads your MP4 and copies your post text. Paste into Facebook Reels or Feed video composer.',
    getUploadUrl: (asset) =>
      asset.aspectRatio === '9:16'
        ? 'https://www.facebook.com/reels/create'
        : 'https://www.facebook.com/',
  },
  {
    id: 'instagram',
    name: 'Instagram Reels',
    shortLabel: 'Instagram',
    accentHex: '#ec4899',
    recommendedRatios: ['9:16', '1:1'],
    preferredRatio: '9:16',
    maxDurationSec: 90,
    captionLimit: 2200,
    actionLabel: 'Open Instagram Web',
    uploadInstructions:
      'Downloads your MP4 and copies your caption. Click Create (+) on Instagram or use mobile device share.',
    getUploadUrl: () => 'https://www.instagram.com/',
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    shortLabel: 'X',
    accentHex: '#e2e8f0',
    recommendedRatios: ['16:9', '1:1', '9:16'],
    preferredRatio: '16:9',
    maxDurationSec: 140,
    captionLimit: 280,
    actionLabel: 'Open X Post Composer',
    uploadInstructions:
      'Opens X with your post text pre-filled and downloads the MP4 so you can attach the video.',
    getUploadUrl: (_asset, postText) =>
      `https://x.com/compose/post?text=${encodeURIComponent(postText.slice(0, 280))}`,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    shortLabel: 'LinkedIn',
    accentHex: '#0ea5e9',
    recommendedRatios: ['16:9', '1:1'],
    preferredRatio: '16:9',
    maxDurationSec: 600,
    captionLimit: 3000,
    actionLabel: 'Open LinkedIn Composer',
    uploadInstructions:
      'Downloads your MP4 and copies your post copy. Select Add Media in the LinkedIn post composer.',
    getUploadUrl: () => 'https://www.linkedin.com/feed/?shareActive=true',
  },
];

export interface ShareDraft {
  title: string;
  caption: string;
  hashtags: string[];
}

export interface PlatformCompatibility {
  status: 'optimal' | 'compatible' | 'ratio-mismatch';
  summary: string;
  recommendedRatio?: AspectRatioKey;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return 'MP4';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function evaluatePlatformCompatibility(
  platformId: SocialPlatformId,
  asset: ShareableVideoAsset
): PlatformCompatibility {
  const spec = SOCIAL_PLATFORMS.find((p) => p.id === platformId) ?? SOCIAL_PLATFORMS[0];
  const ratioOk = spec.recommendedRatios.includes(asset.aspectRatio);
  const durationOk =
    spec.maxDurationSec === null || asset.durationSec <= spec.maxDurationSec + 0.5;

  if (platformId === 'youtube') {
    if (asset.aspectRatio === '9:16' && asset.durationSec <= 180) {
      return {
        status: 'optimal',
        summary: 'Matches YouTube Shorts (9:16 vertical, under 3 min).',
      };
    }
    if (asset.aspectRatio === '16:9') {
      return {
        status: 'optimal',
        summary: 'Matches standard 16:9 widescreen YouTube video.',
      };
    }
    return {
      status: 'compatible',
      summary: '1:1 square uploads to YouTube; 16:9 fills widescreen players without side bars.',
      recommendedRatio: '16:9',
    };
  }

  if (!ratioOk) {
    return {
      status: 'ratio-mismatch',
      summary: `Rendered in ${asset.aspectRatio}. ${spec.shortLabel} performs best in ${spec.preferredRatio}.`,
      recommendedRatio: spec.preferredRatio,
    };
  }

  if (!durationOk && spec.maxDurationSec) {
    return {
      status: 'compatible',
      summary: `Clip is ${asset.durationSec.toFixed(0)}s (${spec.shortLabel} limit is ${spec.maxDurationSec}s).`,
    };
  }

  if (platformId === 'facebook') {
    return {
      status: 'optimal',
      summary:
        asset.aspectRatio === '9:16'
          ? 'Ready for Facebook Reels (9:16 vertical).'
          : `Ready for Facebook Feed (${asset.aspectRatio}).`,
    };
  }

  return {
    status: 'optimal',
    summary: `Optimal ${asset.aspectRatio} MP4 H.264/AAC format for ${spec.shortLabel}.`,
  };
}

export function buildDefaultShareDraft(
  asset: ShareableVideoAsset,
  lyrics: LyricLine[]
): ShareDraft {
  const cleanTitle = asset.trackTitle.trim() || asset.label.trim() || 'New Audio Visual';
  const cleanArtist = asset.artistName.trim();
  const title = cleanArtist ? `${cleanTitle} — ${cleanArtist}` : cleanTitle;

  const firstLyric = lyrics.find((l) => l.text.trim().length > 0)?.text.trim();
  const captionParts = [
    cleanArtist ? `${cleanTitle} by ${cleanArtist}` : cleanTitle,
    firstLyric ? `"${firstLyric}"` : '',
  ].filter(Boolean);

  const hashtags = ['#musicvisualizer', '#newmusic', '#audio'];
  if (asset.aspectRatio === '9:16') {
    hashtags.push('#shorts', '#reels');
  }

  return {
    title,
    caption: captionParts.join('\n'),
    hashtags,
  };
}

export function formatPlatformPostText(
  platformId: SocialPlatformId,
  draft: ShareDraft,
  asset: ShareableVideoAsset
): string {
  const tags = [...draft.hashtags];
  if (
    platformId === 'youtube' &&
    asset.aspectRatio === '9:16' &&
    asset.durationSec <= 180 &&
    !tags.some((t) => t.toLowerCase() === '#shorts')
  ) {
    tags.unshift('#Shorts');
  }

  const tagLine = tags
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t) => t.length > 1)
    .join(' ');

  if (platformId === 'youtube') {
    const blocks = [
      draft.title.trim() ? `Title: ${draft.title.trim()}` : '',
      draft.caption.trim(),
      tagLine,
    ].filter(Boolean);
    return blocks.join('\n\n').slice(0, 5000);
  }

  const body = [draft.caption.trim() || draft.title.trim(), tagLine]
    .filter(Boolean)
    .join('\n\n');

  if (platformId === 'x') {
    if (body.length <= 280) return body;
    const base = draft.caption.trim() || draft.title.trim();
    if (base.length <= 280) return base;
    return `${base.slice(0, 277)}...`;
  }

  const spec = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
  const limit = spec?.captionLimit ?? 2200;
  return body.slice(0, limit);
}

export function supportsNativeFileShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  );
}

export type NativeShareResult =
  | { status: 'shared' }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

export async function shareVideoViaWebShare(
  asset: ShareableVideoAsset,
  title: string,
  text: string
): Promise<NativeShareResult> {
  if (!supportsNativeFileShare()) {
    return { status: 'unsupported' };
  }

  try {
    const response = await fetch(asset.downloadUrl);
    const blob = await response.blob();
    const fallbackMime = asset.downloadFileName.toLowerCase().endsWith('.webm')
      ? 'video/webm'
      : 'video/mp4';
    const file = new File([blob], asset.downloadFileName, {
      type: blob.type || fallbackMime,
    });

    if (!navigator.canShare({ files: [file] })) {
      return { status: 'unsupported' };
    }

    await navigator.share({
      files: [file],
      title,
      text,
    });
    return { status: 'shared' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return {
        status: 'error',
        message:
          'Native share sheet is restricted in this embedded preview. Use "Download MP4 & Copy Post" below.',
      };
    }
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unable to open device share sheet.',
    };
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function triggerMp4Download(downloadUrl: string, downloadFileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = downloadFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = '/usr/bin/ffmpeg';
const FFPROBE_BIN = '/usr/bin/ffprobe';
const PYTHON_BIN = '/usr/bin/python3';

const MEDIA_TMP_DIR = path.resolve(os.tmpdir(), 'pulsewave-link-media');
const YTDLP_BIN_DIR = path.resolve(MEDIA_TMP_DIR, 'bin');
const YTDLP_CACHE_PATH = path.resolve(YTDLP_BIN_DIR, 'yt-dlp');
const YTDLP_DOWNLOAD_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const YTDLP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB HTML/RSS cap
const MAX_PROBE_BYTES = 2 * 1024 * 1024; // 2 MB partial probe cap
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024; // 10 MB cover art cap
const MAX_EMBEDDED_ART_BYTES = 1.5 * 1024 * 1024; // 1.5 MB inline embedded art cap
const MAX_MEDIA_BYTES = 150 * 1024 * 1024; // 150 MB download cap
const MAX_REDIRECTS = 5;
const INSPECT_TIMEOUT_MS = 35_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;

export type DownloadMediaFormat =
  | 'original'
  | 'mp4'
  | 'webm'
  | 'mp3'
  | 'wav'
  | 'm4a';

export type MediaQualityTier =
  | 'best'
  | '2160'
  | '1440'
  | '1080'
  | '720'
  | '480'
  | '360';

export interface MediaQualityOption {
  id: MediaQualityTier;
  label: string;
  height: number | null;
}

export interface ExtractedMediaMetadata {
  trackName: string;
  artistName: string;
  albumName: string | null;
  albumArtUrl: string | null;
  albumArtDataUrl: string | null;
  metadataSource: string;
}

export interface MediaStreamCandidate {
  id: string;
  url: string;
  previewUrl: string | null;
  sourceType: 'direct' | 'yt-dlp';
  platform: string;
  uploader: string | null;
  thumbnailUrl: string | null;
  title: string;
  filename: string;
  mimeType: string;
  extension: string;
  mediaKind: 'video' | 'audio';
  hasVideo: boolean;
  hasAudio: boolean;
  sizeBytes: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sourceLabel: string;
  qualityOptions: MediaQualityOption[];
  metadata: ExtractedMediaMetadata;
}

export interface InspectMediaResult {
  inputUrl: string;
  resolvedUrl: string;
  sourceHost: string;
  pageTitle: string;
  thumbnailUrl: string | null;
  candidates: MediaStreamCandidate[];
  notice: string | null;
}

export class MediaLinkError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'MediaLinkError';
    this.statusCode = statusCode;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return -1;
  }
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0)
  );
}

function isBlockedIpv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  if (num < 0) return true;

  const first = (num >>> 24) & 0xff;
  const second = (num >>> 16) & 0xff;

  if (first === 0) return true;
  if (first === 10) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 0 && ((num >>> 8) & 0xff) === 0) return true;
  if (first === 192 && second === 0 && ((num >>> 8) & 0xff) === 2) return true;
  if (first === 192 && second === 168) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first === 198 && second === 51 && ((num >>> 8) & 0xff) === 100) return true;
  if (first === 203 && second === 0 && ((num >>> 8) & 0xff) === 113) return true;
  if (first >= 224) return true;
  return false;
}

function isBlockedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) {
    return isBlockedIpv4(ip);
  }
  if (ipVersion === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice('::ffff:'.length);
      if (net.isIPv4(mapped)) {
        return isBlockedIpv4(mapped);
      }
    }
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
    if (
      ip.startsWith('fe8') ||
      ip.startsWith('fe9') ||
      ip.startsWith('fea') ||
      ip.startsWith('feb')
    ) {
      return true;
    }
    if (ip.startsWith('ff')) return true;
    if (ip.startsWith('64:ff9b:')) return true;
    if (ip.startsWith('100::')) return true;
    return false;
  }
  return true;
}

export async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new MediaLinkError('Please paste a valid HTTP or HTTPS link.', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new MediaLinkError('Invalid URL format. Include https:// or http://.', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MediaLinkError('Only HTTP and HTTPS links are supported.', 400);
  }

  if (parsed.username || parsed.password) {
    throw new MediaLinkError('Links with embedded credentials are not allowed.', 400);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new MediaLinkError('URL must contain a valid hostname.', 400);
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localdomain')
  ) {
    throw new MediaLinkError('Local or private network addresses cannot be accessed.', 403);
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new MediaLinkError('Private or reserved IP addresses cannot be accessed.', 403);
    }
    return parsed;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new MediaLinkError(`Could not resolve host "${hostname}".`, 400);
  }

  if (!records || records.length === 0) {
    throw new MediaLinkError(`Could not resolve host "${hostname}".`, 400);
  }

  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      throw new MediaLinkError('Target host resolves to a restricted network address.', 403);
    }
  }

  return parsed;
}

async function safeFetch(
  initialUrl: string,
  init: {
    method?: 'GET' | 'HEAD';
    headers?: Record<string, string>;
    timeoutMs: number;
  }
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await assertSafeRemoteUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(validated.toString(), {
        method: init.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: '*/*',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new MediaLinkError('The remote server timed out while responding.', 504);
      }
      throw new MediaLinkError(
        err instanceof Error ? `Network request failed: ${err.message}` : 'Network request failed.',
        502
      );
    }
    clearTimeout(timer);

    if (
      resp.status === 301 ||
      resp.status === 302 ||
      resp.status === 303 ||
      resp.status === 307 ||
      resp.status === 308
    ) {
      await resp.body?.cancel().catch(() => {});
      const location = resp.headers.get('location');
      if (!location) {
        throw new MediaLinkError('Remote server returned a redirect without a destination.', 502);
      }
      try {
        currentUrl = new URL(location, validated.toString()).toString();
      } catch {
        throw new MediaLinkError('Remote server returned an invalid redirect URL.', 502);
      }
      continue;
    }

    return { response: resp, finalUrl: validated.toString() };
  }

  throw new MediaLinkError('Too many redirects while resolving that link.', 502);
}

function createConfinedTempPath(ext: string): string {
  fs.mkdirSync(MEDIA_TMP_DIR, { recursive: true });
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'bin';
  const fileName = `${crypto.randomUUID()}.${safeExt}`;
  const resolved = path.resolve(MEDIA_TMP_DIR, fileName);
  if (!resolved.startsWith(MEDIA_TMP_DIR + path.sep)) {
    throw new MediaLinkError('Invalid temporary storage path.', 500);
  }
  return resolved;
}

function createConfinedJobDir(): string {
  fs.mkdirSync(MEDIA_TMP_DIR, { recursive: true });
  const dirPath = path.resolve(MEDIA_TMP_DIR, `job-${crypto.randomUUID()}`);
  if (!dirPath.startsWith(MEDIA_TMP_DIR + path.sep)) {
    throw new MediaLinkError('Invalid job directory path.', 500);
  }
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function removeFileQuietly(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    const resolved = path.resolve(filePath);
    if (resolved.startsWith(MEDIA_TMP_DIR + path.sep) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch {
    // ignore cleanup errors
  }
}

function removeDirQuietly(dirPath: string | null | undefined): void {
  if (!dirPath) return;
  try {
    const resolved = path.resolve(dirPath);
    if (resolved.startsWith(MEDIA_TMP_DIR + path.sep) && fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

let ytDlpEnsurePromise: Promise<string> | null = null;

async function ensureYtDlpBinary(): Promise<string> {
  if (fs.existsSync(YTDLP_CACHE_PATH)) {
    try {
      const stat = fs.statSync(YTDLP_CACHE_PATH);
      if (stat.size > 100_000 && Date.now() - stat.mtimeMs < YTDLP_MAX_AGE_MS) {
        return YTDLP_CACHE_PATH;
      }
    } catch {
      // fall through and refresh
    }
  }

  if (ytDlpEnsurePromise) {
    return ytDlpEnsurePromise;
  }

  ytDlpEnsurePromise = (async () => {
    fs.mkdirSync(YTDLP_BIN_DIR, { recursive: true });
    if (!YTDLP_CACHE_PATH.startsWith(MEDIA_TMP_DIR + path.sep)) {
      throw new MediaLinkError('Invalid extractor binary path.', 500);
    }

    const { response } = await safeFetch(YTDLP_DOWNLOAD_URL, {
      method: 'GET',
      timeoutMs: 30_000,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      if (fs.existsSync(YTDLP_CACHE_PATH)) {
        return YTDLP_CACHE_PATH;
      }
      throw new MediaLinkError('Unable to initialize universal media extractor.', 503);
    }

    const buf = await readStreamUpToLimit(response.body, 15 * 1024 * 1024);
    if (buf.byteLength < 100_000) {
      throw new MediaLinkError('Downloaded media extractor binary was incomplete.', 503);
    }

    const tmpBin = path.resolve(YTDLP_BIN_DIR, `yt-dlp.${crypto.randomUUID()}.tmp`);
    if (!tmpBin.startsWith(YTDLP_BIN_DIR + path.sep)) {
      throw new MediaLinkError('Invalid temporary binary path.', 500);
    }
    fs.writeFileSync(tmpBin, buf, { mode: 0o755 });
    fs.renameSync(tmpBin, YTDLP_CACHE_PATH);
    return YTDLP_CACHE_PATH;
  })().finally(() => {
    ytDlpEnsurePromise = null;
  });

  return ytDlpEnsurePromise;
}

function getBaseYtDlpArgs(): string[] {
  return [
    '--no-config',
    '--no-exec',
    '--no-playlist',
    '--no-warnings',
    '--ffmpeg-location',
    '/usr/bin',
    '--js-runtimes',
    `node:${process.execPath}`,
    '--remote-components',
    'ejs:github',
    '--socket-timeout',
    '20',
    '--max-filesize',
    '150M',
  ];
}

function cleanYtDlpError(stderr: string, fallback: string): string {
  const cleaned = stderr
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('ERROR:'))
    .map((line) => line.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]*:\s*)?/i, '').trim())
    .join(' ');

  if (!cleaned) return fallback;
  if (/sign in to confirm|cookies|authentication|login/i.test(cleaned)) {
    return 'This link requires account sign-in or age verification on the source platform.';
  }
  if (/private video|unavailable|removed|deleted|copyright/i.test(cleaned)) {
    return 'This video or audio is private, deleted, or unavailable in this region.';
  }
  if (/drm/i.test(cleaned)) {
    return 'This media stream uses DRM copy protection and cannot be downloaded.';
  }
  return cleaned.slice(0, 260);
}

export function sanitizeBaseFilename(name: string, fallback = 'media_download'): string {
  const stripped = name
    .replace(/\.[^./\\]+$/, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return stripped || fallback;
}

function sanitizeMetadataText(raw: string | null | undefined, maxLen = 120): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function cleanTrackNoiseSuffixes(title: string): string {
  return title
    .replace(
      /\s*[\[(](?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer|mv)|lyric\s*video|lyrics|audio\s*only|music\s*video|hd|4k|uhd|hq|explicit|remastered(?:\s*\d{4})?)[\])]\s*/gi,
      ' '
    )
    .replace(/\s*\|\s*(?:YouTube|SoundCloud|Vimeo|TikTok|Instagram|Bandcamp|Mixcloud|Reddit|Twitch)\s*$/i, '')
    .replace(/\s*-\s*(?:YouTube|SoundCloud|Vimeo|Bandcamp)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanChannelOrArtist(raw: string): string {
  return sanitizeMetadataText(
    raw
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .replace(/\s*Official$/i, '')
  );
}

function parseTrackAndArtist(params: {
  explicitTrack?: string | null;
  explicitArtist?: string | null;
  explicitAlbum?: string | null;
  uploader?: string | null;
  rawTitle?: string | null;
  fallbackTitle: string;
  albumArtUrl?: string | null;
  albumArtDataUrl?: string | null;
  metadataSource: string;
}): ExtractedMediaMetadata {
  const explicitTrack = sanitizeMetadataText(params.explicitTrack);
  const explicitArtist = sanitizeMetadataText(params.explicitArtist);
  const explicitAlbum = sanitizeMetadataText(params.explicitAlbum) || null;
  const uploader = cleanChannelOrArtist(sanitizeMetadataText(params.uploader));
  const rawTitle = cleanTrackNoiseSuffixes(sanitizeMetadataText(params.rawTitle));

  if (explicitTrack && explicitArtist) {
    return {
      trackName: cleanTrackNoiseSuffixes(explicitTrack) || explicitTrack,
      artistName: explicitArtist,
      albumName: explicitAlbum,
      albumArtUrl: params.albumArtUrl ?? null,
      albumArtDataUrl: params.albumArtDataUrl ?? null,
      metadataSource: params.metadataSource,
    };
  }

  // Attempt "Artist - Track" split from rawTitle (or explicitTrack if it contains separator)
  const titleCandidate = explicitTrack || rawTitle || sanitizeMetadataText(params.fallbackTitle);
  const dashMatch = titleCandidate.match(/^(.{2,55}?)\s+(?:-|–|—)\s+(.{2,100})$/);

  let trackName = titleCandidate || params.fallbackTitle;
  let artistName = explicitArtist || uploader;

  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = cleanTrackNoiseSuffixes(dashMatch[2].trim()) || dashMatch[2].trim();

    if (!explicitArtist) {
      artistName = left;
      trackName = right;
    } else if (left.toLowerCase() === explicitArtist.toLowerCase()) {
      trackName = right;
    } else {
      trackName = cleanTrackNoiseSuffixes(titleCandidate) || titleCandidate;
    }
  } else {
    trackName = cleanTrackNoiseSuffixes(titleCandidate) || titleCandidate;
  }

  return {
    trackName: trackName || params.fallbackTitle,
    artistName: artistName || '',
    albumName: explicitAlbum,
    albumArtUrl: params.albumArtUrl ?? null,
    albumArtDataUrl: params.albumArtDataUrl ?? null,
    metadataSource: params.metadataSource,
  };
}

function parseContentDispositionFilename(headerVal: string | null): string | null {
  if (!headerVal) return null;
  const utfMatch = headerVal.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/^"|"$/g, '').trim());
    } catch {
      // fall through
    }
  }
  const plainMatch = headerVal.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);
  return plainMatch?.[1]?.trim() || null;
}

const MIME_TO_EXT: Array<[string, string, 'video' | 'audio']> = [
  ['video/mp4', 'mp4', 'video'],
  ['video/webm', 'webm', 'video'],
  ['video/quicktime', 'mov', 'video'],
  ['video/x-matroska', 'mkv', 'video'],
  ['video/x-msvideo', 'avi', 'video'],
  ['audio/mpeg', 'mp3', 'audio'],
  ['audio/mp3', 'mp3', 'audio'],
  ['audio/wav', 'wav', 'audio'],
  ['audio/x-wav', 'wav', 'audio'],
  ['audio/wave', 'wav', 'audio'],
  ['audio/mp4', 'm4a', 'audio'],
  ['audio/x-m4a', 'm4a', 'audio'],
  ['audio/aac', 'aac', 'audio'],
  ['audio/ogg', 'ogg', 'audio'],
  ['application/ogg', 'ogg', 'audio'],
  ['audio/flac', 'flac', 'audio'],
  ['audio/x-flac', 'flac', 'audio'],
  ['audio/opus', 'opus', 'audio'],
  ['audio/webm', 'webm', 'audio'],
];

const MEDIA_EXTENSION_KIND: Record<string, 'video' | 'audio'> = {
  mp4: 'video',
  m4v: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  avi: 'video',
  ogv: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
};

function inferExtensionAndKind(urlStr: string, mimeRaw: string | null): {
  ext: string;
  mime: string;
  kind: 'video' | 'audio' | null;
} {
  const mime = (mimeRaw || '').split(';')[0].trim().toLowerCase();
  for (const [mPrefix, ext, kind] of MIME_TO_EXT) {
    if (mime === mPrefix) {
      return { ext, mime, kind };
    }
  }

  let urlExt = '';
  try {
    const pathname = new URL(urlStr).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match?.[1]) {
      urlExt = match[1].toLowerCase();
    }
  } catch {
    // ignore
  }

  if (urlExt && MEDIA_EXTENSION_KIND[urlExt]) {
    const kind = MEDIA_EXTENSION_KIND[urlExt];
    const resolvedMime =
      mime && mime !== 'application/octet-stream'
        ? mime
        : kind === 'video'
          ? `video/${urlExt === 'mov' ? 'quicktime' : urlExt}`
          : `audio/${urlExt === 'mp3' ? 'mpeg' : urlExt}`;
    return { ext: urlExt, mime: resolvedMime, kind };
  }

  if (mime.startsWith('video/')) {
    const sub = mime.slice('video/'.length).replace(/[^a-z0-9]/g, '') || 'mp4';
    return { ext: sub === 'quicktime' ? 'mov' : sub, mime, kind: 'video' };
  }
  if (mime.startsWith('audio/')) {
    const sub = mime.slice('audio/'.length).replace(/[^a-z0-9]/g, '') || 'mp3';
    return { ext: sub === 'mpeg' ? 'mp3' : sub, mime, kind: 'audio' };
  }

  return { ext: urlExt || 'bin', mime: mime || 'application/octet-stream', kind: null };
}

function parseTotalSizeFromHeaders(headers: Headers): number | null {
  const contentRange = headers.get('content-range');
  if (contentRange) {
    const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const len = headers.get('content-length');
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function readStreamUpToLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        const remaining = maxBytes - total;
        if (remaining > 0) {
          chunks.push(Buffer.from(value.subarray(0, remaining)));
        }
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(Buffer.from(value));
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

async function streamResponseToTempFile(
  response: Response,
  ext: string,
  maxBytes: number
): Promise<{ filePath: string; bytesWritten: number }> {
  const tempPath = createConfinedTempPath(ext);
  const body = response.body;
  if (!body) {
    throw new MediaLinkError('Remote server returned an empty media stream.', 502);
  }

  const reader = body.getReader();
  const ws = fs.createWriteStream(tempPath);
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new MediaLinkError(
          `Media file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`,
          413
        );
      }
      if (!ws.write(value)) {
        await new Promise<void>((resolve, reject) => {
          ws.once('drain', resolve);
          ws.once('error', reject);
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      ws.once('finish', resolve);
      ws.once('error', reject);
      ws.end();
    });

    if (total === 0) {
      throw new MediaLinkError('Downloaded media stream was empty.', 502);
    }

    return { filePath: tempPath, bytesWritten: total };
  } catch (err) {
    ws.destroy();
    removeFileQuietly(tempPath);
    throw err;
  } finally {
    reader.releaseLock();
  }
}

interface FfprobeSummary {
  durationSec: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  formatName: string | null;
  tagTitle: string | null;
  tagArtist: string | null;
  tagAlbum: string | null;
  embeddedArtDataUrl: string | null;
}

function lookupTagCaseInsensitive(
  tags: Record<string, string> | undefined,
  keys: string[]
): string | null {
  if (!tags) return null;
  const lowerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(tags)) {
    if (typeof v === 'string' && v.trim()) {
      lowerMap.set(k.toLowerCase(), v.trim());
    }
  }
  for (const key of keys) {
    const found = lowerMap.get(key.toLowerCase());
    if (found) return found;
  }
  return null;
}

async function extractEmbeddedCoverArtDataUrl(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-i',
        filePath,
        '-an',
        '-map',
        '0:v:0',
        '-vcodec',
        'mjpeg',
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-',
      ],
      {
        encoding: 'buffer',
        timeout: 6000,
        maxBuffer: Math.ceil(MAX_EMBEDDED_ART_BYTES * 1.2),
      }
    );

    if (!stdout || stdout.byteLength < 64 || stdout.byteLength > MAX_EMBEDDED_ART_BYTES) {
      return null;
    }
    return `data:image/jpeg;base64,${stdout.toString('base64')}`;
  } catch {
    return null;
  }
}

async function probeLocalMediaFile(filePath: string): Promise<FfprobeSummary | null> {
  try {
    const { stdout } = await execFileAsync(
      FFPROBE_BIN,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { timeout: 8000, maxBuffer: 1024 * 1024 }
    );

    const parsed = JSON.parse(stdout || '{}') as {
      format?: {
        duration?: string;
        format_name?: string;
        tags?: Record<string, string>;
      };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        duration?: string;
        disposition?: { attached_pic?: number };
        tags?: Record<string, string>;
      }>;
    };

    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const attachedPicStream = streams.find(
      (s) =>
        s.disposition?.attached_pic === 1 ||
        (s.codec_type === 'video' &&
          streams.some((st) => st.codec_type === 'audio') &&
          ['mjpeg', 'png', 'webp', 'bmp'].includes((s.codec_name || '').toLowerCase()))
    );
    const videoStream = streams.find(
      (s) => s.codec_type === 'video' && s !== attachedPicStream
    );
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const rawDuration =
      parsed.format?.duration ?? videoStream?.duration ?? audioStream?.duration;
    const durationNum = rawDuration ? Number(rawDuration) : NaN;

    const mergedTags = {
      ...(audioStream?.tags ?? {}),
      ...(parsed.format?.tags ?? {}),
    };

    const tagTitle = lookupTagCaseInsensitive(mergedTags, ['title', 'track']);
    const tagArtist = lookupTagCaseInsensitive(mergedTags, [
      'artist',
      'album_artist',
      'albumartist',
      'author',
      'composer',
      'performer',
    ]);
    const tagAlbum = lookupTagCaseInsensitive(mergedTags, ['album']);

    const embeddedArtDataUrl = attachedPicStream
      ? await extractEmbeddedCoverArtDataUrl(filePath)
      : null;

    return {
      durationSec: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : null,
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      width: typeof videoStream?.width === 'number' ? videoStream.width : null,
      height: typeof videoStream?.height === 'number' ? videoStream.height : null,
      videoCodec: videoStream?.codec_name ?? null,
      audioCodec: audioStream?.codec_name ?? null,
      formatName: parsed.format?.format_name ?? null,
      tagTitle,
      tagArtist,
      tagAlbum,
      embeddedArtDataUrl,
    };
  } catch {
    return null;
  }
}

interface YtDlpThumbnailEntry {
  url?: string;
  width?: number;
  height?: number;
  preference?: number;
}

interface YtDlpFormatEntry {
  url?: string;
  ext?: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
}

interface YtDlpJsonInfo {
  id?: string;
  title?: string;
  fulltitle?: string;
  uploader?: string;
  channel?: string;
  creator?: string;
  artist?: string;
  track?: string;
  album?: string;
  extractor?: string;
  extractor_key?: string;
  webpage_url?: string;
  original_url?: string;
  thumbnail?: string;
  thumbnails?: YtDlpThumbnailEntry[];
  duration?: number;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
  url?: string;
  formats?: YtDlpFormatEntry[];
  entries?: YtDlpJsonInfo[];
}

function pickBestYtDlpThumbnail(item: YtDlpJsonInfo): string | null {
  const thumbs = Array.isArray(item.thumbnails) ? item.thumbnails : [];
  const validHttp = thumbs
    .filter((t) => typeof t.url === 'string' && /^https?:\/\//i.test(t.url))
    .sort((a, b) => {
      const areaA = (a.width ?? 0) * (a.height ?? 0);
      const areaB = (b.width ?? 0) * (b.height ?? 0);
      if (areaB !== areaA) return areaB - areaA;
      return (b.preference ?? 0) - (a.preference ?? 0);
    });

  if (validHttp[0]?.url) return validHttp[0].url;
  if (typeof item.thumbnail === 'string' && /^https?:\/\//i.test(item.thumbnail)) {
    return item.thumbnail;
  }
  return null;
}

function buildQualityOptionsFromFormats(
  formats: YtDlpFormatEntry[],
  fallbackHeight: number | null
): MediaQualityOption[] {
  const heights = new Set<number>();
  for (const f of formats) {
    if (typeof f.height === 'number' && f.height >= 240 && f.vcodec && f.vcodec !== 'none') {
      heights.add(f.height);
    }
  }
  if (fallbackHeight && fallbackHeight >= 240) {
    heights.add(fallbackHeight);
  }

  const maxH = heights.size > 0 ? Math.max(...heights) : 0;
  const options: MediaQualityOption[] = [
    { id: 'best', label: maxH > 0 ? `Best (${maxH}p)` : 'Best Quality', height: maxH || null },
  ];

  const tiers: Array<{ id: MediaQualityTier; label: string; cap: number }> = [
    { id: '2160', label: '2160p 4K', cap: 2160 },
    { id: '1440', label: '1440p QHD', cap: 1440 },
    { id: '1080', label: '1080p HD', cap: 1080 },
    { id: '720', label: '720p HD', cap: 720 },
    { id: '480', label: '480p SD', cap: 480 },
    { id: '360', label: '360p Compact', cap: 360 },
  ];

  for (const tier of tiers) {
    if (maxH > tier.cap || Array.from(heights).some((h) => h <= tier.cap && h > tier.cap - 240)) {
      if (tier.cap < maxH || (tier.cap <= maxH && heights.has(tier.cap))) {
        options.push({ id: tier.id, label: tier.label, height: tier.cap });
      }
    }
  }

  return options.slice(0, 5);
}

function formatPlatformLabel(extractorKey?: string): string {
  const raw = (extractorKey || '').trim();
  if (!raw || raw.toLowerCase() === 'generic') return 'Web Media';
  const map: Record<string, string> = {
    youtube: 'YouTube',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    twitter: 'X / Twitter',
    soundcloud: 'SoundCloud',
    vimeo: 'Vimeo',
    reddit: 'Reddit',
    facebook: 'Facebook',
    twitch: 'Twitch',
    bandcamp: 'Bandcamp',
    dailymotion: 'Dailymotion',
    bilibili: 'Bilibili',
    mixcloud: 'Mixcloud',
    pinterest: 'Pinterest',
  };
  return map[raw.toLowerCase()] ?? raw;
}

interface PageExtractedMetadata {
  pageTitle: string;
  artistName: string;
  albumName: string;
  thumbnailUrl: string | null;
}

async function inspectViaYtDlp(
  targetUrl: string,
  pageMetaFallback?: PageExtractedMetadata | null
): Promise<{
  candidates: MediaStreamCandidate[];
  pageTitle: string;
  thumbnailUrl: string | null;
  errorNotice: string | null;
}> {
  const ytDlpPath = await ensureYtDlpBinary();

  let stdout = '';
  let stderr = '';
  try {
    const res = await execFileAsync(
      PYTHON_BIN,
      [ytDlpPath, ...getBaseYtDlpArgs(), '-J', '--', targetUrl],
      {
        timeout: INSPECT_TIMEOUT_MS,
        maxBuffer: 12 * 1024 * 1024,
      }
    );
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err) {
    const execErr = err as { stderr?: string; message?: string };
    const errText = execErr.stderr || execErr.message || '';
    return {
      candidates: [],
      pageTitle: '',
      thumbnailUrl: null,
      errorNotice: cleanYtDlpError(errText, 'Could not extract media streams from this link.'),
    };
  }

  let parsed: YtDlpJsonInfo;
  try {
    parsed = JSON.parse(stdout || '{}') as YtDlpJsonInfo;
  } catch {
    return {
      candidates: [],
      pageTitle: '',
      thumbnailUrl: null,
      errorNotice: cleanYtDlpError(stderr, 'Received unreadable metadata from that link.'),
    };
  }

  const entries =
    Array.isArray(parsed.entries) && parsed.entries.length > 0
      ? parsed.entries.filter(Boolean).slice(0, 4)
      : [parsed];

  const candidates: MediaStreamCandidate[] = [];
  for (const item of entries) {
    const formats = Array.isArray(item.formats) ? item.formats : [];
    const hasVideoFormats =
      formats.some((f) => f.vcodec && f.vcodec !== 'none') ||
      Boolean(item.vcodec && item.vcodec !== 'none') ||
      Boolean(item.width && item.height);
    const hasAudioFormats =
      formats.some((f) => f.acodec && f.acodec !== 'none') ||
      Boolean(item.acodec && item.acodec !== 'none') ||
      !hasVideoFormats;

    const progressivePreview = formats
      .filter(
        (f) =>
          typeof f.url === 'string' &&
          /^https?:\/\//i.test(f.url) &&
          (f.protocol === 'https' || f.protocol === 'http') &&
          (hasVideoFormats
            ? f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
            : f.acodec && f.acodec !== 'none')
      )
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

    let previewUrl: string | null = null;
    const rawPreviewCandidate =
      progressivePreview?.url ||
      (typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : null);
    if (rawPreviewCandidate && !/\.m3u8(\?|$)|\.mpd(\?|$)/i.test(rawPreviewCandidate)) {
      try {
        await assertSafeRemoteUrl(rawPreviewCandidate);
        previewUrl = rawPreviewCandidate;
      } catch {
        previewUrl = null;
      }
    }

    const bestVideoFormat = formats
      .filter((f) => f.vcodec && f.vcodec !== 'none')
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    const bestAudioFormat = formats
      .filter((f) => f.acodec && f.acodec !== 'none')
      .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];

    const width = item.width ?? bestVideoFormat?.width ?? null;
    const height = item.height ?? bestVideoFormat?.height ?? null;
    const ext =
      (item.ext || (hasVideoFormats ? 'mp4' : bestAudioFormat?.ext || 'm4a'))
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase() || (hasVideoFormats ? 'mp4' : 'mp3');

    const title = sanitizeBaseFilename(
      item.title || item.fulltitle || item.track || parsed.title || 'Downloaded Media',
      'Downloaded Media'
    );
    const platform = formatPlatformLabel(
      item.extractor_key || item.extractor || parsed.extractor_key
    );
    const uploader = item.uploader || item.channel || item.creator || item.artist || null;

    const safeThumb = pickBestYtDlpThumbnail(item) ?? pageMetaFallback?.thumbnailUrl ?? null;

    const metadata = parseTrackAndArtist({
      explicitTrack: item.track || null,
      explicitArtist: item.artist || item.creator || pageMetaFallback?.artistName || null,
      explicitAlbum: item.album || pageMetaFallback?.albumName || null,
      uploader,
      rawTitle: item.fulltitle || item.title || parsed.title || pageMetaFallback?.pageTitle,
      fallbackTitle: title,
      albumArtUrl: safeThumb,
      metadataSource:
        platform === 'Web Media' ? 'Page Metadata & Embeds' : `${platform} Metadata`,
    });

    const estSize =
      item.filesize ??
      item.filesize_approx ??
      (bestVideoFormat?.filesize || bestVideoFormat?.filesize_approx
        ? (bestVideoFormat.filesize || bestVideoFormat.filesize_approx || 0) +
          (bestAudioFormat?.filesize || bestAudioFormat?.filesize_approx || 0)
        : bestAudioFormat?.filesize || bestAudioFormat?.filesize_approx || null);

    candidates.push({
      id: crypto.randomUUID(),
      url: item.webpage_url || item.original_url || targetUrl,
      previewUrl,
      sourceType: 'yt-dlp',
      platform,
      uploader,
      thumbnailUrl: safeThumb,
      title: metadata.trackName || title,
      filename: `${sanitizeBaseFilename(metadata.trackName || title, 'media')}.${ext}`,
      mimeType: hasVideoFormats ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `audio/${ext}`,
      extension: ext,
      mediaKind: hasVideoFormats ? 'video' : 'audio',
      hasVideo: hasVideoFormats,
      hasAudio: hasAudioFormats,
      sizeBytes: estSize && estSize > 0 ? estSize : null,
      durationSec: typeof item.duration === 'number' && item.duration > 0 ? item.duration : null,
      width,
      height,
      videoCodec:
        bestVideoFormat?.vcodec && bestVideoFormat.vcodec !== 'none'
          ? bestVideoFormat.vcodec.split('.')[0]
          : item.vcodec && item.vcodec !== 'none'
            ? item.vcodec.split('.')[0]
            : null,
      audioCodec:
        bestAudioFormat?.acodec && bestAudioFormat.acodec !== 'none'
          ? bestAudioFormat.acodec.split('.')[0]
          : item.acodec && item.acodec !== 'none'
            ? item.acodec.split('.')[0]
            : null,
      sourceLabel: uploader ? `${platform} · ${uploader}` : platform,
      qualityOptions: hasVideoFormats
        ? buildQualityOptionsFromFormats(formats, height)
        : [{ id: 'best', label: 'Best Audio', height: null }],
      metadata,
    });
  }

  return {
    candidates,
    pageTitle: parsed.title || candidates[0]?.title || '',
    thumbnailUrl: candidates[0]?.thumbnailUrl ?? pageMetaFallback?.thumbnailUrl ?? null,
    errorNotice: null,
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    });
}

function extractTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const val = decodeHtmlEntities((match[2] ?? match[3] ?? match[4] ?? '').trim());
    attrs[key] = val;
  }
  return attrs;
}

interface ExtractedLinkRef {
  url: string;
  label: string;
  hintKind?: 'video' | 'audio';
}

function extractCandidatesFromHtmlOrXml(
  markup: string,
  baseUrl: string
): {
  pageTitle: string;
  artistName: string;
  albumName: string;
  thumbnailUrl: string | null;
  refs: ExtractedLinkRef[];
} {
  let pageTitle = '';
  let artistName = '';
  let albumName = '';
  let thumbnailUrl: string | null = null;
  const refs: ExtractedLinkRef[] = [];
  const seen = new Set<string>();

  const pushRef = (rawHref: string | undefined, label: string, hintKind?: 'video' | 'audio') => {
    if (!rawHref) return;
    const trimmed = decodeHtmlEntities(rawHref.trim());
    if (
      !trimmed ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('javascript:')
    ) {
      return;
    }
    let resolved: string;
    try {
      const u = new URL(trimmed, baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      resolved = u.toString();
    } catch {
      return;
    }
    if (seen.has(resolved)) return;
    seen.add(resolved);
    refs.push({ url: resolved, label, hintKind });
  };

  const titleMatch = markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    pageTitle = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim());
  }

  const itunesAuthorMatch = markup.match(/<itunes:author[^>]*>([\s\S]*?)<\/itunes:author>/i);
  if (itunesAuthorMatch?.[1]) {
    artistName = decodeHtmlEntities(itunesAuthorMatch[1].replace(/\s+/g, ' ').trim());
  }

  const itunesImageMatch = markup.match(/<itunes:image\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (itunesImageMatch?.[1]) {
    try {
      const imgUrl = new URL(decodeHtmlEntities(itunesImageMatch[1].trim()), baseUrl);
      if (imgUrl.protocol === 'http:' || imgUrl.protocol === 'https:') {
        thumbnailUrl = imgUrl.toString();
      }
    } catch {
      // ignore
    }
  }

  const metaMatches = markup.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaMatches) {
    const attrs = extractTagAttributes(tag);
    const prop = (attrs.property || attrs.name || '').toLowerCase();
    const content = attrs.content;
    if (!content) continue;

    if (prop === 'og:title' || prop === 'twitter:title' || prop === 'og:audio:title') {
      pageTitle = content;
    } else if (
      (prop === 'music:musician' ||
        prop === 'og:audio:artist' ||
        prop === 'author' ||
        prop === 'twitter:creator') &&
      !artistName
    ) {
      artistName = content.replace(/^@/, '');
    } else if ((prop === 'music:album' || prop === 'og:audio:album') && !albumName) {
      albumName = content;
    } else if ((prop === 'og:image' || prop === 'og:image:secure_url' || prop === 'twitter:image') && !thumbnailUrl) {
      try {
        const imgUrl = new URL(content, baseUrl);
        if (imgUrl.protocol === 'http:' || imgUrl.protocol === 'https:') {
          thumbnailUrl = imgUrl.toString();
        }
      } catch {
        // ignore
      }
    } else if (
      prop === 'og:video' ||
      prop === 'og:video:url' ||
      prop === 'og:video:secure_url' ||
      prop === 'twitter:player:stream'
    ) {
      pushRef(content, 'Embedded Video Stream', 'video');
    } else if (
      prop === 'og:audio' ||
      prop === 'og:audio:url' ||
      prop === 'og:audio:secure_url'
    ) {
      pushRef(content, 'Embedded Audio Stream', 'audio');
    }
  }

  // Extract JSON-LD metadata & contentUrl
  const jsonLdMatches = markup.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    const jsonText = match[1]?.trim();
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const stack: unknown[] = [parsed];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node)) {
          for (const item of node) stack.push(item);
          continue;
        }
        const obj = node as Record<string, unknown>;
        if (typeof obj.contentUrl === 'string') {
          const objType = typeof obj['@type'] === 'string' ? obj['@type'].toLowerCase() : '';
          pushRef(
            obj.contentUrl,
            typeof obj.name === 'string' ? obj.name : 'Structured Media Link',
            objType.includes('audio') ? 'audio' : objType.includes('video') ? 'video' : undefined
          );
        }
        if (typeof obj.name === 'string' && !pageTitle) {
          pageTitle = obj.name;
        }
        const artistObj = (obj.byArtist ?? obj.author ?? obj.creator) as
          | Record<string, unknown>
          | string
          | undefined;
        if (!artistName && artistObj) {
          if (typeof artistObj === 'string') artistName = artistObj;
          else if (typeof artistObj.name === 'string') artistName = artistObj.name;
        }
        const albumObj = obj.inAlbum as Record<string, unknown> | string | undefined;
        if (!albumName && albumObj) {
          if (typeof albumObj === 'string') albumName = albumObj;
          else if (typeof albumObj.name === 'string') albumName = albumObj.name;
        }
        const imgField = obj.thumbnailUrl ?? obj.image;
        if (!thumbnailUrl && typeof imgField === 'string') {
          try {
            const imgUrl = new URL(imgField, baseUrl);
            if (imgUrl.protocol === 'http:' || imgUrl.protocol === 'https:') {
              thumbnailUrl = imgUrl.toString();
            }
          } catch {
            // ignore
          }
        }
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') stack.push(val);
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }

  const mediaTags =
    markup.match(/<(?:video|audio|source|enclosure|media:content)\b[^>]*>/gi) ?? [];
  for (const tag of mediaTags) {
    const attrs = extractTagAttributes(tag);
    const lowerTag = tag.toLowerCase();
    const src = attrs.src || attrs.url || attrs['data-src'];
    const typeAttr = (attrs.type || '').toLowerCase();
    const hint: 'video' | 'audio' | undefined =
      lowerTag.startsWith('<audio') || typeAttr.startsWith('audio/')
        ? 'audio'
        : lowerTag.startsWith('<video') || typeAttr.startsWith('video/')
          ? 'video'
          : undefined;
    pushRef(src, hint === 'audio' ? 'Page Audio Source' : 'Page Media Source', hint);
  }

  const anchorTags = markup.match(/<a\b[^>]*>/gi) ?? [];
  for (const tag of anchorTags) {
    const attrs = extractTagAttributes(tag);
    const href = attrs.href;
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl);
      const extMatch = resolved.pathname.match(/\.([a-z0-9]{2,5})$/i);
      const ext = extMatch?.[1]?.toLowerCase() || '';
      if (MEDIA_EXTENSION_KIND[ext]) {
        pushRef(
          resolved.toString(),
          `Direct .${ext.toUpperCase()} Link`,
          MEDIA_EXTENSION_KIND[ext]
        );
      }
    } catch {
      // ignore
    }
  }

  return { pageTitle, artistName, albumName, thumbnailUrl, refs };
}

async function probeDirectCandidate(
  candidateUrl: string,
  pageMeta: PageExtractedMetadata,
  sourceLabel: string,
  hintKind?: 'video' | 'audio'
): Promise<MediaStreamCandidate | null> {
  try {
    const { response, finalUrl } = await safeFetch(candidateUrl, {
      method: 'GET',
      headers: { Range: `bytes=0-${MAX_PROBE_BYTES - 1}` },
      timeoutMs: INSPECT_TIMEOUT_MS,
    });

    if (!response.ok && response.status !== 206) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    const contentType = response.headers.get('content-type');
    const lowerCt = (contentType || '').toLowerCase();
    if (
      lowerCt.includes('text/html') ||
      lowerCt.includes('application/xhtml') ||
      lowerCt.includes('mpegurl') ||
      lowerCt.includes('dash+xml')
    ) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    const inferred = inferExtensionAndKind(finalUrl, contentType);
    const sizeBytes = parseTotalSizeFromHeaders(response.headers);
    const dispName = parseContentDispositionFilename(
      response.headers.get('content-disposition')
    );

    const probeBuffer = await readStreamUpToLimit(response.body, MAX_PROBE_BYTES);
    let probeSummary: FfprobeSummary | null = null;
    if (probeBuffer.byteLength > 256) {
      const tempProbe = createConfinedTempPath(inferred.ext);
      try {
        fs.writeFileSync(tempProbe, probeBuffer);
        probeSummary = await probeLocalMediaFile(tempProbe);
      } finally {
        removeFileQuietly(tempProbe);
      }
    }

    const hasVideo = probeSummary
      ? probeSummary.hasVideo
      : inferred.kind === 'video' || hintKind === 'video';
    const hasAudio = probeSummary
      ? probeSummary.hasAudio
      : inferred.kind === 'audio' || inferred.kind === 'video' || hintKind === 'audio';
    const mediaKind: 'video' | 'audio' = hasVideo ? 'video' : 'audio';

    if (!inferred.kind && !probeSummary?.hasVideo && !probeSummary?.hasAudio) {
      return null;
    }

    const rawUrlFilename = (() => {
      try {
        const base = path.basename(new URL(finalUrl).pathname);
        return base && base !== '/' ? decodeURIComponent(base) : '';
      } catch {
        return '';
      }
    })();

    const rawFilename =
      dispName || rawUrlFilename || `${sanitizeBaseFilename(pageMeta.pageTitle)}.${inferred.ext}`;
    const ext = inferred.ext !== 'bin' ? inferred.ext : hasVideo ? 'mp4' : 'mp3';

    const metadata = parseTrackAndArtist({
      explicitTrack: probeSummary?.tagTitle,
      explicitArtist: probeSummary?.tagArtist || pageMeta.artistName,
      explicitAlbum: probeSummary?.tagAlbum || pageMeta.albumName,
      rawTitle: probeSummary?.tagTitle || pageMeta.pageTitle || rawFilename,
      fallbackTitle: sanitizeBaseFilename(rawFilename, 'Downloaded Media'),
      albumArtUrl: pageMeta.thumbnailUrl,
      albumArtDataUrl: probeSummary?.embeddedArtDataUrl ?? null,
      metadataSource:
        probeSummary?.tagTitle || probeSummary?.tagArtist || probeSummary?.embeddedArtDataUrl
          ? 'Embedded File Tags & Page'
          : pageMeta.pageTitle || pageMeta.thumbnailUrl
            ? 'OpenGraph / Page Tags'
            : 'Parsed Filename',
    });

    return {
      id: crypto.randomUUID(),
      url: finalUrl,
      previewUrl: finalUrl,
      sourceType: 'direct',
      platform: 'Direct File',
      uploader: metadata.artistName || null,
      thumbnailUrl: metadata.albumArtUrl,
      title: metadata.trackName,
      filename: `${sanitizeBaseFilename(metadata.trackName, 'media')}.${ext}`,
      mimeType: inferred.mime,
      extension: ext,
      mediaKind,
      hasVideo,
      hasAudio,
      sizeBytes,
      durationSec: probeSummary?.durationSec ?? null,
      width: probeSummary?.width ?? null,
      height: probeSummary?.height ?? null,
      videoCodec: probeSummary?.videoCodec ?? null,
      audioCodec: probeSummary?.audioCodec ?? null,
      sourceLabel,
      qualityOptions: [
        {
          id: 'best',
          label:
            probeSummary?.height && probeSummary.height > 0
              ? `Source (${probeSummary.height}p)`
              : 'Original Quality',
          height: probeSummary?.height ?? null,
        },
      ],
      metadata,
    };
  } catch {
    return null;
  }
}

export async function inspectMediaLink(rawUrl: string): Promise<InspectMediaResult> {
  const validated = await assertSafeRemoteUrl(rawUrl);

  let initialContentType = '';
  let initialStatus = 0;
  let finalUrl = validated.toString();
  let initialHeaders: Headers | null = null;
  let initialResponse: Response | null = null;

  try {
    const fetched = await safeFetch(validated.toString(), {
      method: 'GET',
      headers: { Range: `bytes=0-${MAX_PROBE_BYTES - 1}` },
      timeoutMs: 12_000,
    });
    initialResponse = fetched.response;
    finalUrl = fetched.finalUrl;
    initialStatus = fetched.response.status;
    initialHeaders = fetched.response.headers;
    initialContentType = (fetched.response.headers.get('content-type') || '').toLowerCase();
  } catch {
    // Fall through to universal extractor
  }

  const finalHost = new URL(finalUrl).hostname;
  const isPlaylistOrStreamManifest =
    initialContentType.includes('mpegurl') ||
    initialContentType.includes('dash+xml') ||
    /\.m3u8(\?|$)|\.mpd(\?|$)/i.test(finalUrl);

  const isMarkup =
    initialContentType.includes('text/html') ||
    initialContentType.includes('application/xhtml+xml') ||
    initialContentType.includes('application/rss+xml') ||
    initialContentType.includes('application/atom+xml') ||
    initialContentType.includes('application/xml') ||
    initialContentType.includes('text/xml');

  // Direct binary video/audio link fast path
  if (
    initialResponse &&
    (initialResponse.ok || initialResponse.status === 206) &&
    !isMarkup &&
    !isPlaylistOrStreamManifest
  ) {
    const inferred = inferExtensionAndKind(finalUrl, initialContentType);
    const probeBuffer = await readStreamUpToLimit(initialResponse.body, MAX_PROBE_BYTES);
    let probeSummary: FfprobeSummary | null = null;
    if (probeBuffer.byteLength > 256) {
      const tempProbe = createConfinedTempPath(inferred.ext);
      try {
        fs.writeFileSync(tempProbe, probeBuffer);
        probeSummary = await probeLocalMediaFile(tempProbe);
      } finally {
        removeFileQuietly(tempProbe);
      }
    }

    if (inferred.kind || probeSummary?.hasVideo || probeSummary?.hasAudio) {
      const sizeBytes = initialHeaders ? parseTotalSizeFromHeaders(initialHeaders) : null;
      const dispName = initialHeaders
        ? parseContentDispositionFilename(initialHeaders.get('content-disposition'))
        : null;
      const rawUrlFilename = (() => {
        try {
          const base = path.basename(new URL(finalUrl).pathname);
          return base && base !== '/' ? decodeURIComponent(base) : '';
        } catch {
          return '';
        }
      })();
      const hasVideo = probeSummary ? probeSummary.hasVideo : inferred.kind === 'video';
      const hasAudio = probeSummary ? probeSummary.hasAudio : true;
      const ext = inferred.ext !== 'bin' ? inferred.ext : hasVideo ? 'mp4' : 'mp3';
      const fallbackName = sanitizeBaseFilename(
        dispName || rawUrlFilename || finalHost,
        'Downloaded Media'
      );

      const metadata = parseTrackAndArtist({
        explicitTrack: probeSummary?.tagTitle,
        explicitArtist: probeSummary?.tagArtist,
        explicitAlbum: probeSummary?.tagAlbum,
        rawTitle: probeSummary?.tagTitle || dispName || rawUrlFilename,
        fallbackTitle: fallbackName,
        albumArtDataUrl: probeSummary?.embeddedArtDataUrl ?? null,
        metadataSource:
          probeSummary?.tagTitle || probeSummary?.tagArtist || probeSummary?.embeddedArtDataUrl
            ? 'Embedded File Tags'
            : 'Parsed Filename',
      });

      return {
        inputUrl: rawUrl,
        resolvedUrl: finalUrl,
        sourceHost: finalHost,
        pageTitle: metadata.trackName,
        thumbnailUrl: null,
        candidates: [
          {
            id: crypto.randomUUID(),
            url: finalUrl,
            previewUrl: finalUrl,
            sourceType: 'direct',
            platform: 'Direct Media',
            uploader: metadata.artistName || null,
            thumbnailUrl: null,
            title: metadata.trackName,
            filename: `${sanitizeBaseFilename(metadata.trackName, 'media')}.${ext}`,
            mimeType: inferred.mime,
            extension: ext,
            mediaKind: hasVideo ? 'video' : 'audio',
            hasVideo,
            hasAudio,
            sizeBytes,
            durationSec: probeSummary?.durationSec ?? null,
            width: probeSummary?.width ?? null,
            height: probeSummary?.height ?? null,
            videoCodec: probeSummary?.videoCodec ?? null,
            audioCodec: probeSummary?.audioCodec ?? null,
            sourceLabel: metadata.artistName
              ? `Direct Media · ${metadata.artistName}`
              : 'Direct Media Link',
            qualityOptions: [
              {
                id: 'best',
                label:
                  probeSummary?.height && probeSummary.height > 0
                    ? `Source (${probeSummary.height}p)`
                    : 'Original Quality',
                height: probeSummary?.height ?? null,
              },
            ],
            metadata,
          },
        ],
        notice: null,
      };
    }
  } else {
    let htmlMarkup: string | null = null;
    let extractedPage: ReturnType<typeof extractCandidatesFromHtmlOrXml> | null = null;
    if (initialResponse && isMarkup && (initialResponse.ok || initialResponse.status === 206)) {
      const htmlBuf = await readStreamUpToLimit(initialResponse.body, MAX_HTML_BYTES);
      htmlMarkup = htmlBuf.toString('utf8');
      extractedPage = extractCandidatesFromHtmlOrXml(htmlMarkup, finalUrl);
    } else {
      await initialResponse?.body?.cancel().catch(() => {});
    }

    const pageMetaFallback: PageExtractedMetadata | null = extractedPage
      ? {
          pageTitle: extractedPage.pageTitle,
          artistName: extractedPage.artistName,
          albumName: extractedPage.albumName,
          thumbnailUrl: extractedPage.thumbnailUrl,
        }
      : null;

    const ytDlpResult = await inspectViaYtDlp(finalUrl, pageMetaFallback);
    if (ytDlpResult.candidates.length > 0) {
      return {
        inputUrl: rawUrl,
        resolvedUrl: finalUrl,
        sourceHost: finalHost,
        pageTitle: ytDlpResult.pageTitle || finalHost,
        thumbnailUrl: ytDlpResult.thumbnailUrl,
        candidates: ytDlpResult.candidates,
        notice: null,
      };
    }

    if (extractedPage) {
      const pageMeta: PageExtractedMetadata = {
        pageTitle: extractedPage.pageTitle || finalHost,
        artistName: extractedPage.artistName,
        albumName: extractedPage.albumName,
        thumbnailUrl: extractedPage.thumbnailUrl,
      };
      const probed: MediaStreamCandidate[] = [];
      for (const ref of extractedPage.refs.slice(0, 6)) {
        const candidate = await probeDirectCandidate(
          ref.url,
          pageMeta,
          ref.label,
          ref.hintKind
        );
        if (candidate) probed.push(candidate);
        if (probed.length >= 4) break;
      }

      if (probed.length > 0) {
        return {
          inputUrl: rawUrl,
          resolvedUrl: finalUrl,
          sourceHost: finalHost,
          pageTitle: pageMeta.pageTitle,
          thumbnailUrl: extractedPage.thumbnailUrl,
          candidates: probed,
          notice: null,
        };
      }
    }

    if (ytDlpResult.errorNotice) {
      return {
        inputUrl: rawUrl,
        resolvedUrl: finalUrl,
        sourceHost: finalHost,
        pageTitle: finalHost,
        thumbnailUrl: null,
        candidates: [],
        notice: ytDlpResult.errorNotice,
      };
    }

    if (initialStatus >= 400) {
      throw new MediaLinkError(
        `Remote server responded with HTTP ${initialStatus}.`,
        initialStatus === 404 ? 404 : 502
      );
    }
  }

  return {
    inputUrl: rawUrl,
    resolvedUrl: finalUrl,
    sourceHost: finalHost,
    pageTitle: finalHost,
    thumbnailUrl: null,
    candidates: [],
    notice:
      'No playable video or audio stream could be extracted from that URL. Verify the link is public and not login-gated or DRM-protected.',
  };
}

const ALLOWED_OUTPUT_FORMATS = new Set<DownloadMediaFormat>([
  'original',
  'mp4',
  'webm',
  'mp3',
  'wav',
  'm4a',
]);

const ALLOWED_QUALITY_TIERS = new Set<MediaQualityTier>([
  'best',
  '2160',
  '1440',
  '1080',
  '720',
  '480',
  '360',
]);

const ALLOWED_AUDIO_BITRATES = new Set(['128k', '192k', '320k']);

async function runFfmpegConversion(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) {
        stderr += chunk.toString('utf8');
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new MediaLinkError('Media conversion timed out.', 504));
    }, DOWNLOAD_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new MediaLinkError(`Conversion failed: ${err.message}`, 500));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        const lastLine = stderr.trim().split('\n').pop() || 'Conversion failed.';
        reject(new MediaLinkError(`Media conversion error: ${lastLine}`, 500));
      }
    });
  });
}

async function runYtDlpDownload(args: string[]): Promise<void> {
  const ytDlpPath = await ensureYtDlpBinary();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [ytDlpPath, ...args], {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 6000) {
        stderr += chunk.toString('utf8');
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new MediaLinkError('Download timed out while fetching media.', 504));
    }, DOWNLOAD_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new MediaLinkError(`Extractor execution failed: ${err.message}`, 500));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new MediaLinkError(
            cleanYtDlpError(stderr, 'Unable to download media from this source.'),
            502
          )
        );
      }
    });
  });
}

function buildYtDlpVideoSelector(qualityId: MediaQualityTier): string {
  if (qualityId === 'best') {
    return 'bv*+ba/b';
  }
  const h = Number(qualityId);
  return `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b`;
}

async function prepareViaYtDlpDownload(params: {
  url: string;
  format: DownloadMediaFormat;
  qualityId: MediaQualityTier;
  audioBitrate: string;
  baseName: string;
}): Promise<{
  filePath: string;
  downloadName: string;
  mimeType: string;
  byteLength: number;
  cleanup: () => void;
}> {
  const jobDir = createConfinedJobDir();
  try {
    const args: string[] = [
      ...getBaseYtDlpArgs(),
      '-P',
      jobDir,
      '-o',
      'media.%(ext)s',
    ];

    if (params.format === 'mp3' || params.format === 'wav' || params.format === 'm4a') {
      args.push('-f', 'bestaudio/best', '-x', '--audio-format', params.format);
      if (params.format === 'mp3' || params.format === 'm4a') {
        args.push('--audio-quality', params.audioBitrate.toUpperCase());
      }
    } else {
      args.push('-f', buildYtDlpVideoSelector(params.qualityId));
      if (params.format === 'mp4') {
        args.push(
          '-S',
          'vcodec:h264,acodec:m4a',
          '--merge-output-format',
          'mp4',
          '--remux-video',
          'mp4'
        );
      } else if (params.format === 'webm') {
        args.push(
          '-S',
          'vcodec:vp9,acodec:opus',
          '--merge-output-format',
          'webm',
          '--remux-video',
          'webm'
        );
      } else {
        args.push('--merge-output-format', 'mp4/webm/mkv');
      }
    }

    args.push('--', params.url);
    await runYtDlpDownload(args);

    const files = fs
      .readdirSync(jobDir)
      .filter((name) => !name.endsWith('.part') && !name.endsWith('.ytdl'));
    if (files.length === 0) {
      throw new MediaLinkError('No media file was produced for that link.', 502);
    }

    const targetExt = params.format !== 'original' ? `.${params.format}` : '';
    const chosenFile =
      (targetExt ? files.find((f) => f.toLowerCase().endsWith(targetExt)) : null) ??
      files[0];

    const resolvedFile = path.resolve(jobDir, chosenFile);
    if (!resolvedFile.startsWith(jobDir + path.sep)) {
      throw new MediaLinkError('Invalid downloaded file path.', 500);
    }

    const stat = fs.statSync(resolvedFile);
    if (stat.size <= 0) {
      throw new MediaLinkError('Downloaded media file was empty.', 502);
    }
    if (stat.size > MAX_MEDIA_BYTES) {
      throw new MediaLinkError(
        `Media file exceeds the ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB limit.`,
        413
      );
    }

    const actualExt =
      path.extname(chosenFile).replace(/^\./, '').toLowerCase() ||
      (params.format === 'original' ? 'mp4' : params.format);

    const inferred = inferExtensionAndKind(`https://local/${chosenFile}`, null);
    return {
      filePath: resolvedFile,
      downloadName: `${params.baseName}.${actualExt}`,
      mimeType: inferred.mime || 'application/octet-stream',
      byteLength: stat.size,
      cleanup: () => removeDirQuietly(jobDir),
    };
  } catch (err) {
    removeDirQuietly(jobDir);
    throw err;
  }
}

export async function prepareMediaDownloadFile(params: {
  url: string;
  sourceType?: 'direct' | 'yt-dlp';
  format: DownloadMediaFormat;
  qualityId?: MediaQualityTier;
  audioBitrate?: string;
  filename?: string;
}): Promise<{
  filePath: string;
  downloadName: string;
  mimeType: string;
  byteLength: number;
  cleanup: () => void;
}> {
  const format = params.format;
  if (!ALLOWED_OUTPUT_FORMATS.has(format)) {
    throw new MediaLinkError('Unsupported output format requested.', 400);
  }
  const qualityId: MediaQualityTier = ALLOWED_QUALITY_TIERS.has(
    params.qualityId ?? 'best'
  )
    ? (params.qualityId as MediaQualityTier)
    : 'best';
  const safeBitrate = ALLOWED_AUDIO_BITRATES.has(params.audioBitrate ?? '')
    ? (params.audioBitrate as string)
    : '192k';

  const validated = await assertSafeRemoteUrl(params.url);
  const baseName = sanitizeBaseFilename(
    params.filename || 'pulsewave_media',
    'pulsewave_media'
  );

  if (params.sourceType === 'yt-dlp') {
    return prepareViaYtDlpDownload({
      url: validated.toString(),
      format,
      qualityId,
      audioBitrate: safeBitrate,
      baseName,
    });
  }

  const { response, finalUrl } = await safeFetch(validated.toString(), {
    method: 'GET',
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new MediaLinkError(
      `Remote server responded with HTTP ${response.status}.`,
      response.status === 404 ? 404 : 502
    );
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml') ||
    contentType.includes('mpegurl') ||
    contentType.includes('dash+xml')
  ) {
    await response.body?.cancel().catch(() => {});
    return prepareViaYtDlpDownload({
      url: finalUrl,
      format,
      qualityId,
      audioBitrate: safeBitrate,
      baseName,
    });
  }

  const declaredLen = parseTotalSizeFromHeaders(response.headers);
  if (declaredLen && declaredLen > MAX_MEDIA_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new MediaLinkError(
      `Remote file (${(declaredLen / (1024 * 1024)).toFixed(1)} MB) exceeds the 150 MB download limit.`,
      413
    );
  }

  const inferred = inferExtensionAndKind(finalUrl, contentType);
  const dispName = parseContentDispositionFilename(
    response.headers.get('content-disposition')
  );
  const urlBase = (() => {
    try {
      return path.basename(new URL(finalUrl).pathname);
    } catch {
      return '';
    }
  })();

  const resolvedBaseName = sanitizeBaseFilename(
    params.filename || dispName || urlBase || 'pulsewave_media',
    'pulsewave_media'
  );

  const { filePath: sourcePath, bytesWritten } = await streamResponseToTempFile(
    response,
    inferred.ext,
    MAX_MEDIA_BYTES
  );

  if (format === 'original') {
    const origExt = inferred.ext !== 'bin' ? inferred.ext : 'mp4';
    return {
      filePath: sourcePath,
      downloadName: `${resolvedBaseName}.${origExt}`,
      mimeType: inferred.mime || 'application/octet-stream',
      byteLength: bytesWritten,
      cleanup: () => removeFileQuietly(sourcePath),
    };
  }

  const probe = await probeLocalMediaFile(sourcePath);
  if (!probe || (!probe.hasAudio && !probe.hasVideo)) {
    removeFileQuietly(sourcePath);
    throw new MediaLinkError(
      'The downloaded link does not contain valid audio or video streams.',
      415
    );
  }

  if ((format === 'mp3' || format === 'wav' || format === 'm4a') && !probe.hasAudio) {
    removeFileQuietly(sourcePath);
    throw new MediaLinkError('This video stream has no audio track to extract.', 422);
  }

  if ((format === 'mp4' || format === 'webm') && !probe.hasVideo) {
    removeFileQuietly(sourcePath);
    throw new MediaLinkError('This link is audio-only; choose MP3, WAV, M4A, or Original.', 422);
  }

  const outputPath = createConfinedTempPath(format);
  try {
    let args: string[];
    let outMime = 'application/octet-stream';

    if (format === 'mp3') {
      outMime = 'audio/mpeg';
      args = [
        '-y',
        '-i',
        sourcePath,
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        safeBitrate,
        outputPath,
      ];
    } else if (format === 'wav') {
      outMime = 'audio/wav';
      args = [
        '-y',
        '-i',
        sourcePath,
        '-vn',
        '-c:a',
        'pcm_s16le',
        '-ar',
        '44100',
        outputPath,
      ];
    } else if (format === 'm4a') {
      outMime = 'audio/mp4';
      args = [
        '-y',
        '-i',
        sourcePath,
        '-vn',
        '-c:a',
        'aac',
        '-b:a',
        safeBitrate,
        '-movflags',
        '+faststart',
        outputPath,
      ];
    } else if (format === 'mp4') {
      outMime = 'video/mp4';
      const alreadyMp4Compatible =
        probe.videoCodec === 'h264' &&
        (!probe.hasAudio || probe.audioCodec === 'aac') &&
        inferred.ext === 'mp4';
      args = alreadyMp4Compatible
        ? ['-y', '-i', sourcePath, '-c', 'copy', '-movflags', '+faststart', outputPath]
        : [
            '-y',
            '-i',
            sourcePath,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '22',
            '-pix_fmt',
            'yuv420p',
            ...(probe.hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
            '-movflags',
            '+faststart',
            outputPath,
          ];
    } else {
      outMime = 'video/webm';
      const alreadyWebmCompatible =
        (probe.videoCodec === 'vp8' || probe.videoCodec === 'vp9') &&
        (!probe.hasAudio || probe.audioCodec === 'opus' || probe.audioCodec === 'vorbis') &&
        inferred.ext === 'webm';
      args = alreadyWebmCompatible
        ? ['-y', '-i', sourcePath, '-c', 'copy', outputPath]
        : [
            '-y',
            '-i',
            sourcePath,
            '-c:v',
            'libvpx',
            '-deadline',
            'realtime',
            '-cpu-used',
            '4',
            '-crf',
            '24',
            '-b:v',
            '1M',
            ...(probe.hasAudio ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-an']),
            outputPath,
          ];
    }

    await runFfmpegConversion(args);
    const stat = fs.statSync(outputPath);
    removeFileQuietly(sourcePath);

    return {
      filePath: outputPath,
      downloadName: `${resolvedBaseName}.${format}`,
      mimeType: outMime,
      byteLength: stat.size,
      cleanup: () => removeFileQuietly(outputPath),
    };
  } catch (err) {
    removeFileQuietly(sourcePath);
    removeFileQuietly(outputPath);
    throw err;
  }
}

export async function proxyMediaPreviewStream(
  rawUrl: string,
  rangeHeader?: string
): Promise<{
  status: number;
  contentType: string;
  contentLength: string | null;
  contentRange: string | null;
  acceptRanges: string | null;
  body: ReadableStream<Uint8Array>;
}> {
  const validated = await assertSafeRemoteUrl(rawUrl);
  const headers: Record<string, string> = {};
  if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader.trim())) {
    headers.Range = rangeHeader.trim();
  }

  const { response } = await safeFetch(validated.toString(), {
    method: 'GET',
    headers,
    timeoutMs: INSPECT_TIMEOUT_MS,
  });

  if (!response.ok && response.status !== 206) {
    await response.body?.cancel().catch(() => {});
    throw new MediaLinkError(`Preview stream returned HTTP ${response.status}.`, 502);
  }

  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    await response.body?.cancel().catch(() => {});
    throw new MediaLinkError('Preview blocked for non-media content.', 415);
  }

  if (!response.body) {
    throw new MediaLinkError('Empty preview stream.', 502);
  }

  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    contentLength: response.headers.get('content-length'),
    contentRange: response.headers.get('content-range'),
    acceptRanges: response.headers.get('accept-ranges'),
    body: response.body,
  };
}

const ALLOWED_ARTWORK_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export async function fetchSafeAlbumArtwork(rawUrl: string): Promise<{
  buffer: Buffer;
  contentType: string;
  extension: string;
}> {
  const validated = await assertSafeRemoteUrl(rawUrl);
  const { response } = await safeFetch(validated.toString(), {
    method: 'GET',
    timeoutMs: 15_000,
  });

  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new MediaLinkError(`Album artwork host returned HTTP ${response.status}.`, 502);
  }

  const rawCt = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_ARTWORK_MIMES.has(rawCt)) {
    await response.body?.cancel().catch(() => {});
    throw new MediaLinkError('Artwork URL did not return a supported raster image format.', 415);
  }

  const buf = await readStreamUpToLimit(response.body, MAX_ARTWORK_BYTES);
  if (buf.byteLength < 32) {
    throw new MediaLinkError('Album artwork response was empty.', 502);
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };

  return {
    buffer: buf,
    contentType: rawCt === 'image/jpg' ? 'image/jpeg' : rawCt,
    extension: extMap[rawCt] ?? 'jpg',
  };
}

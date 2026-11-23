import { LyricLine } from '../types/studio';

let lineCounter = 0;
export function createLyricId(): string {
  lineCounter += 1;
  return `lyric-${Date.now()}-${lineCounter}`;
}

/**
 * Formats seconds into [MM:SS.xx] or MM:SS.xx
 */
export function formatLrcTimestamp(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const hundredths = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * Formats seconds into MM:SS.s for compact transport/trim inputs
 */
export function formatShortTime(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

/**
 * Formats seconds into MM:SS
 */
export function formatClockTime(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parses timestamps like "01:23.45", "1:23.4", "83.5", or "[01:23.45]"
 */
export function parseTimeInput(value: string): number | null {
  const cleaned = value.trim().replace(/^\[|\]$/g, '');
  if (!cleaned) return null;

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? Math.max(0, num) : null;
  }

  const match = cleaned.match(/^(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;

  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  const fracRaw = match[3] || '0';
  const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);

  if (secs >= 60) return null;
  return Math.max(0, mins * 60 + secs + frac);
}

/**
 * Parses a standard .lrc file into sorted LyricLine[]
 */
export function parseLrc(content: string): LyricLine[] {
  const lines = content.split(/\r?\n/);
  const parsed: LyricLine[] = [];
  const tagRegex = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const matches = [...rawLine.matchAll(tagRegex)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(tagRegex, '').trim();
    // Skip metadata tags like [ar:Artist], [ti:Title], empty instrumental spacers unless text exists
    if (!text) continue;

    for (const m of matches) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const fracRaw = m[3] || '0';
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      const time = mins * 60 + secs + frac;
      parsed.push({
        id: createLyricId(),
        time: Number(time.toFixed(2)),
        text,
      });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

/**
 * Parses SRT / WebVTT timestamp strings like "00:01:23,450", "01:23.450", "00:01:23.450"
 */
function parseSubtitleTimestamp(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseFloat(parts[1]);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    return Math.max(0, mins * 60 + secs);
  }
  if (parts.length === 3) {
    const hrs = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseFloat(parts[2]);
    if (!Number.isFinite(hrs) || !Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    return Math.max(0, hrs * 3600 + mins * 60 + secs);
  }
  return null;
}

/**
 * Parses .srt or .vtt (WebVTT) caption files into sorted LyricLine[]
 */
export function parseSrtOrVtt(content: string): LyricLine[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const parsed: LyricLine[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    // Skip WebVTT header / NOTE / STYLE / REGION blocks
    const firstUpper = lines[0].toUpperCase();
    if (
      firstUpper.startsWith('WEBVTT') ||
      firstUpper.startsWith('NOTE') ||
      firstUpper.startsWith('STYLE') ||
      firstUpper.startsWith('REGION')
    ) {
      continue;
    }

    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx < 0) continue;

    const timingLine = lines[timingIdx];
    const startRaw = timingLine.split('-->')[0]?.trim().split(/\s+/)[0] ?? '';
    const startTime = parseSubtitleTimestamp(startRaw);
    if (startTime === null) continue;

    const textLines = lines.slice(timingIdx + 1);
    const cleanText = textLines
      .join(' ')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) continue;

    parsed.push({
      id: createLyricId(),
      time: Number(startTime.toFixed(2)),
      text: cleanText,
    });
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

/**
 * Parses plain text lines into evenly spaced LyricLine[] across an optional clip duration
 */
export function parsePlainLyricsLines(
  content: string,
  clipDurationSec?: number
): LyricLine[] {
  const rawLines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  const usableSpan =
    clipDurationSec && Number.isFinite(clipDurationSec) && clipDurationSec > 2
      ? Math.max(2, clipDurationSec - 1.2)
      : rawLines.length * 3.0;
  const startOffset = clipDurationSec && clipDurationSec > 2 ? 0.5 : 0;
  const step = Math.max(0.8, usableSpan / Math.max(1, rawLines.length));

  return rawLines.map((text, idx) => ({
    id: createLyricId(),
    time: Number((startOffset + idx * step).toFixed(2)),
    text,
  }));
}

/**
 * Unified caption/lyric parser supporting .lrc, .srt, .vtt, and plain .txt
 */
export function parseCaptionsFile(
  content: string,
  fileName?: string,
  clipDurationSec?: number
): LyricLine[] {
  const lowerName = (fileName || '').toLowerCase();

  // Check LRC timestamp format first unless explicitly srt/vtt
  if (!lowerName.endsWith('.srt') && !lowerName.endsWith('.vtt')) {
    const lrcParsed = parseLrc(content);
    if (lrcParsed.length > 0) return lrcParsed;
  }

  // Try SRT / VTT cue blocks
  if (content.includes('-->') || lowerName.endsWith('.srt') || lowerName.endsWith('.vtt')) {
    const subParsed = parseSrtOrVtt(content);
    if (subParsed.length > 0) return subParsed;
  }

  // Fallback LRC check (in case file extension was unusual)
  const fallbackLrc = parseLrc(content);
  if (fallbackLrc.length > 0) return fallbackLrc;

  // Fallback plain text lines spaced smoothly
  return parsePlainLyricsLines(content, clipDurationSec);
}

/**
 * Exports LyricLine[] back into standard .lrc format
 */
export function serializeLrc(lyrics: LyricLine[]): string {
  return [...lyrics]
    .sort((a, b) => a.time - b.time)
    .map((line) => `[${formatLrcTimestamp(line.time)}] ${line.text}`)
    .join('\n');
}

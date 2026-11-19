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
 * Exports LyricLine[] back into standard .lrc format
 */
export function serializeLrc(lyrics: LyricLine[]): string {
  return [...lyrics]
    .sort((a, b) => a.time - b.time)
    .map((line) => `[${formatLrcTimestamp(line.time)}] ${line.text}`)
    .join('\n');
}

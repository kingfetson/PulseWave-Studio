import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  DownloadMediaFormat,
  fetchSafeAlbumArtwork,
  inspectMediaLink,
  MediaLinkError,
  MediaQualityTier,
  prepareMediaDownloadFile,
  proxyMediaPreviewStream,
} from './server/mediaDownloader.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface CaptionCue {
  timeSec: number;
  text: string;
}

interface GenerateCaptionsBody {
  audioBase64?: unknown;
  mimeType?: unknown;
  durationSec?: unknown;
  trackTitle?: unknown;
  artistName?: unknown;
}

const CAPTIONS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    captions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timeSec: {
            type: Type.NUMBER,
            description: 'Start timestamp in seconds relative to the start of the clip.',
          },
          text: {
            type: Type.STRING,
            description: 'Short, readable caption line for video display.',
          },
        },
        required: ['timeSec', 'text'],
      },
    },
  },
  required: ['captions'],
};

function isAuthOrInvalidKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('GEMINI_API_KEY') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('"code":403')
  );
}

function isTransientApiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('500') ||
    msg.includes('INTERNAL') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientApiError(err)) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

function extractReadableError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  let message = raw || 'Failed to generate captions.';
  let status = 500;

  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
      if (typeof parsed.error?.code === 'number') {
        status = parsed.error.code;
      }
    } catch {
      // Keep raw string if JSON parsing fails
    }
  }

  if (message.includes('GEMINI_API_KEY')) status = 500;
  else if (raw.includes('PERMISSION_DENIED') || status === 403) status = 403;
  else if (raw.includes('API_KEY_INVALID') || status === 400) status = 400;
  else if (raw.includes('RESOURCE_EXHAUSTED') || status === 429) status = 429;
  else if (raw.includes('UNAVAILABLE') || status === 503) status = 503;

  return { status, message };
}

function parseCaptionsJson(rawJson: string, safeDuration: number): CaptionCue[] {
  const cleaned = rawJson
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  const parsed = JSON.parse(cleaned || '{"captions":[]}') as {
    captions?: Array<{ timeSec?: unknown; text?: unknown }>;
  };

  return (Array.isArray(parsed.captions) ? parsed.captions : [])
    .map((item) => ({
      timeSec:
        typeof item.timeSec === 'number' && Number.isFinite(item.timeSec)
          ? Math.max(0, Math.min(safeDuration - 0.1, Number(item.timeSec.toFixed(2))))
          : 0,
      text: typeof item.text === 'string' ? item.text.trim() : '',
    }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => a.timeSec - b.timeSec);
}

async function generateCaptionsJsonWithFallback(
  ai: GoogleGenAI,
  contents: string | { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> }
): Promise<string> {
  const models: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  ];

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const { model, thinkingLevel } = models[i];
    try {
      const resp = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents,
            config: {
              thinkingConfig: { thinkingLevel },
              responseMimeType: 'application/json',
              responseSchema: CAPTIONS_RESPONSE_SCHEMA,
            },
          }),
        2
      );
      return resp.text ?? '{"captions":[]}';
    } catch (err) {
      lastErr = err;
      if (isAuthOrInvalidKeyError(err) || !isTransientApiError(err) || i === models.length - 1) {
        throw err;
      }
      console.warn(`${model} transiently unavailable, trying fallback model:`, err);
    }
  }
  throw lastErr;
}

async function generateTimedCaptions(params: {
  audioBase64: string;
  mimeType: string;
  durationSec: number;
  trackTitle: string;
  artistName: string;
}): Promise<{ captions: CaptionCue[]; transcriptText: string }> {
  const ai = getGeminiClient();
  const safeDuration = Math.max(1, Number.isFinite(params.durationSec) ? params.durationSec : 30);
  const maxTimestamp = Math.max(0.5, safeDuration - 0.5).toFixed(2);

  const metadataContext = [
    params.trackTitle ? `Track Title: ${params.trackTitle}` : '',
    params.artistName ? `Artist: ${params.artistName}` : '',
    `Clip Duration: ${safeDuration.toFixed(2)} seconds`,
  ]
    .filter(Boolean)
    .join('\n');

  // Step 1: Attempt dedicated speech transcription with gemini-3.5-transcribe
  let transcriptText = '';
  try {
    const transcribeResp = await withRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: params.mimeType,
                  data: params.audioBase64,
                },
              },
              {
                text:
                  'Transcribe all spoken words, vocals, and lyrics in this audio accurately. ' +
                  'Include approximate [MM:SS] timestamps for each line or phrase when audible.',
              },
            ],
          },
        }),
      2
    );
    transcriptText = (transcribeResp.text ?? '').trim();
  } catch (err) {
    // Propagate authentication/API key failures immediately; allow multimodal fallback for transient outages
    if (isAuthOrInvalidKeyError(err)) {
      throw err;
    }
    console.warn('gemini-3.5-transcribe unavailable, falling back to multimodal captioning:', err);
  }

  // Step 2a: Structure spoken/vocal transcript into timed video captions
  if (transcriptText) {
    const rawJson = await generateCaptionsJsonWithFallback(
      ai,
      `Convert the following audio transcription into synchronized short video caption cues.\n\n` +
        `${metadataContext}\n\n` +
        `Transcription:\n${transcriptText}\n\n` +
        `Rules:\n` +
        `1. Preserve spoken words and sung lyrics faithfully, split into short 3-8 word caption lines.\n` +
        `2. If the transcription indicates purely instrumental music without speech, create concise musical-moment captions.\n` +
        `3. Every timeSec must be monotonically increasing between 0.0 and ${maxTimestamp}.`
    );

    const captions = parseCaptionsJson(rawJson, safeDuration);
    if (captions.length > 0) {
      return { captions, transcriptText };
    }
  }

  // Step 2b: Direct multimodal audio captioning (handles instrumental tracks or transcribe empty/outage)
  const rawJson = await generateCaptionsJsonWithFallback(ai, {
    parts: [
      {
        inlineData: {
          mimeType: params.mimeType,
          data: params.audioBase64,
        },
      },
      {
        text:
          `Listen to this audio clip and generate synchronized short video caption cues.\n\n` +
          `${metadataContext}\n\n` +
          `Rules:\n` +
          `1. If spoken words, rap, or sung lyrics are audible, transcribe them accurately as short 3-8 word caption lines aligned to when they occur.\n` +
          `2. If the audio is purely instrumental or electronic without vocals, generate 4 to 8 concise, evocative musical-moment captions paced evenly across the clip (for example: "Warm synth pulse builds", "Sub-bass kick drops in", "Bright arpeggio shimmer").\n` +
          `3. Every timeSec must be monotonically increasing between 0.0 and ${maxTimestamp}.`,
      },
    ],
  });

  const captions = parseCaptionsJson(rawJson, safeDuration);
  if (captions.length === 0) {
    throw new Error('Could not extract timed caption cues from this audio.');
  }

  return {
    captions,
    transcriptText: captions.map((c) => c.text).join('\n'),
  };
}

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '25mb' }));

  app.post('/api/captions/generate', async (req, res) => {
    try {
      const body = (req.body ?? {}) as GenerateCaptionsBody;
      const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'audio/wav';
      const durationSec = typeof body.durationSec === 'number' ? body.durationSec : 30;
      const trackTitle = typeof body.trackTitle === 'string' ? body.trackTitle : '';
      const artistName = typeof body.artistName === 'string' ? body.artistName : '';

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio payload is required to generate captions.' });
        return;
      }

      const result = await generateTimedCaptions({
        audioBase64,
        mimeType,
        durationSec,
        trackTitle,
        artistName,
      });

      res.json(result);
    } catch (err) {
      const { status, message } = extractReadableError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/dj/automix-suggest', async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        preference?: string;
        deckA?: Record<string, unknown>;
        deckB?: Record<string, unknown>;
      };

      if (!body.deckA || !body.deckB) {
        res.status(400).json({ error: 'Both Deck A and Deck B structure profiles are required.' });
        return;
      }

      const ai = getGeminiClient();
      const preference = typeof body.preference === 'string' ? body.preference : 'balanced';

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          harmonicSummary: {
            type: Type.STRING,
            description: 'Concise 1-line summary comparing BPM, Camelot key, and energy compatibility.',
          },
          deckAStructure: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startSec: { type: Type.NUMBER },
                endSec: { type: Type.NUMBER },
                label: { type: Type.STRING },
                energy: { type: Type.NUMBER },
              },
              required: ['startSec', 'endSec', 'label', 'energy'],
            },
          },
          deckBStructure: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startSec: { type: Type.NUMBER },
                endSec: { type: Type.NUMBER },
                label: { type: Type.STRING },
                energy: { type: Type.NUMBER },
              },
              required: ['startSec', 'endSec', 'label', 'energy'],
            },
          },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                energyMatchScore: { type: Type.NUMBER },
                deckAOutSec: { type: Type.NUMBER },
                deckASectionLabel: { type: Type.STRING },
                deckBInSec: { type: Type.NUMBER },
                deckBDropSec: { type: Type.NUMBER },
                deckBSectionLabel: { type: Type.STRING },
                crossfadeBeats: { type: Type.INTEGER },
                transitionStyle: { type: Type.STRING },
                videoMixStyle: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
              required: [
                'id',
                'label',
                'energyMatchScore',
                'deckAOutSec',
                'deckASectionLabel',
                'deckBInSec',
                'deckBDropSec',
                'deckBSectionLabel',
                'crossfadeBeats',
                'transitionStyle',
                'videoMixStyle',
                'rationale',
              ],
            },
          },
        },
        required: ['harmonicSummary', 'deckAStructure', 'deckBStructure', 'suggestions'],
      };

      const prompt =
        `You are an expert pro club DJ & music producer analyzing two tracks for an optimal "Energy Match" transition.\n` +
        `Mix Preference: ${preference} ('balanced' = seamless energy continuity; 'drop-slam' = high-impact outro-to-drop switch; 'smooth-blend' = long 16-32 beat phrase blend).\n\n` +
        `DECK A (Outgoing Track):\n${JSON.stringify(body.deckA)}\n\n` +
        `DECK B (Incoming Track):\n${JSON.stringify(body.deckB)}\n\n` +
        `Instructions:\n` +
        `1. Segment Deck A and Deck B into 4 to 6 clean structural phases each (e.g., Intro, Verse/Groove, Build, Main Drop, Breakdown, Outro) covering 0 to full durationSec with average energy (0-100).\n` +
        `2. Propose 3 ranked "Energy Match" transition options ordered best-first:\n` +
        `   - deckAOutSec: choose an exact downbeat timestamp from Deck A's downbeatSampleSec (or valid timestamp < durationSec - 2) where Deck A's energy naturally tapers, enters a breakdown, or starts its outro.\n` +
        `   - deckBInSec: choose an exact downbeat timestamp from Deck B's downbeatSampleSec where Deck B enters cleanly so that after crossfadeBeats beats (at Deck A's BPM), Deck B lands cleanly on its drop (deckBDropSec) or main groove.\n` +
        `   - crossfadeBeats MUST be one of: 4, 8, 16, 32.\n` +
        `   - transitionStyle MUST be one of: "bass-swap", "filter-sweep", "beat-drop", "echo-out", "stutter-cut".\n` +
        `   - videoMixStyle MUST be one of: "crossfade", "beat-flash", "wipe-slide", "split-dual", "zoom-punch".\n` +
        `   - energyMatchScore is 1-100.\n` +
        `   - rationale explains concisely (1-2 sentences) how outgoing energy, bass contour, BPM, and Camelot key align.`;

      const models: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
        { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      ];

      let rawJson = '';
      let lastErr: unknown;
      for (let i = 0; i < models.length; i++) {
        const { model, thinkingLevel } = models[i];
        try {
          const resp = await withRetry(
            () =>
              ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                  thinkingConfig: { thinkingLevel },
                  responseMimeType: 'application/json',
                  responseSchema,
                },
              }),
            2
          );
          rawJson = (resp.text ?? '').trim();
          break;
        } catch (err) {
          lastErr = err;
          if (isAuthOrInvalidKeyError(err) || !isTransientApiError(err) || i === models.length - 1) {
            throw err;
          }
          console.warn(`${model} transiently unavailable for automix-suggest, trying fallback:`, err);
        }
      }

      if (!rawJson) {
        throw lastErr instanceof Error ? lastErr : new Error('Empty AI Auto-Mix response.');
      }

      const cleaned = rawJson
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (err) {
      const { status, message } = extractReadableError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/media/inspect', async (req, res) => {
    try {
      const body = (req.body ?? {}) as { url?: unknown };
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!url) {
        res.status(400).json({ error: 'Please paste a valid HTTP or HTTPS media link.' });
        return;
      }
      const result = await inspectMediaLink(url);
      res.json(result);
    } catch (err) {
      if (err instanceof MediaLinkError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to inspect that link.',
      });
    }
  });

  app.post('/api/media/download', async (req, res) => {
    let prepared: Awaited<ReturnType<typeof prepareMediaDownloadFile>> | null = null;
    try {
      const body = (req.body ?? {}) as {
        url?: unknown;
        sourceType?: unknown;
        format?: unknown;
        qualityId?: unknown;
        audioBitrate?: unknown;
        filename?: unknown;
      };

      const url = typeof body.url === 'string' ? body.url.trim() : '';
      const sourceType =
        body.sourceType === 'yt-dlp' ? 'yt-dlp' : body.sourceType === 'direct' ? 'direct' : undefined;
      const format = (
        typeof body.format === 'string' ? body.format.trim().toLowerCase() : 'original'
      ) as DownloadMediaFormat;
      const qualityId = (
        typeof body.qualityId === 'string' ? body.qualityId.trim() : 'best'
      ) as MediaQualityTier;
      const audioBitrate =
        typeof body.audioBitrate === 'string' ? body.audioBitrate.trim() : undefined;
      const filename =
        typeof body.filename === 'string' ? body.filename.trim() : undefined;

      if (!url) {
        res.status(400).json({ error: 'A media URL is required to download.' });
        return;
      }

      prepared = await prepareMediaDownloadFile({
        url,
        sourceType,
        format,
        qualityId,
        audioBitrate,
        filename,
      });

      const safeHeaderName = prepared.downloadName.replace(/["\\\r\n]/g, '_');
      res.setHeader('Content-Type', prepared.mimeType);
      res.setHeader('Content-Length', String(prepared.byteLength));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeHeaderName}"; filename*=UTF-8''${encodeURIComponent(prepared.downloadName)}`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Download-Filename', encodeURIComponent(prepared.downloadName));

      const cleanup = prepared.cleanup;
      const stream = fs.createReadStream(prepared.filePath);
      let cleaned = false;
      const runCleanup = () => {
        if (!cleaned) {
          cleaned = true;
          cleanup();
        }
      };

      res.on('close', runCleanup);
      res.on('finish', runCleanup);
      stream.on('error', (streamErr) => {
        runCleanup();
        if (!res.headersSent) {
          res.status(500).json({ error: streamErr.message });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch (err) {
      prepared?.cleanup();
      if (err instanceof MediaLinkError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to download media from link.',
      });
    }
  });

  app.get('/api/media/preview', async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ error: 'Missing url parameter.' });
        return;
      }
      const rangeHeader =
        typeof req.headers.range === 'string' ? req.headers.range : undefined;
      const upstream = await proxyMediaPreviewStream(rawUrl, rangeHeader);

      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (upstream.contentLength) {
        res.setHeader('Content-Length', upstream.contentLength);
      }
      if (upstream.contentRange) {
        res.setHeader('Content-Range', upstream.contentRange);
      }
      if (upstream.acceptRanges) {
        res.setHeader('Accept-Ranges', upstream.acceptRanges);
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as import('node:stream/web').ReadableStream<Uint8Array>
      );
      req.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.destroy();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (err instanceof MediaLinkError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Unable to stream media preview.' });
    }
  });

  app.get('/api/media/artwork', async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ error: 'Missing url parameter.' });
        return;
      }
      const art = await fetchSafeAlbumArtwork(rawUrl);
      res.setHeader('Content-Type', art.contentType);
      res.setHeader('Content-Length', String(art.buffer.byteLength));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Artwork-Extension', art.extension);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(art.buffer);
    } catch (err) {
      if (err instanceof MediaLinkError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Unable to fetch album artwork.' });
    }
  });

  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseWave Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

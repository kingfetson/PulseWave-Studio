import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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

  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseWave Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const MAX_TEXT_LENGTH = 1200;
const MAX_CACHE_ENTRIES = 240;

interface ServerTtsModelSpec {
  id: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
  label: string;
  description: string;
  tier: 'default' | 'comparison';
}

const GEMINI_TTS_MODELS: readonly ServerTtsModelSpec[] = [
  {
    id: 'gemini-3.8-flash-lite-tts',
    label: 'Flash-Lite TTS (Default)',
    description: 'Low-latency, cost-optimized Gemini neural voice for standard tutorial walkthroughs.',
    tier: 'default',
  },
  {
    id: 'gemini-3.8-flash-tts',
    label: 'Flash TTS (Compare Expressiveness)',
    description: 'Flagship Gemini neural voice for controlled A/B comparison on the same API key.',
    tier: 'comparison',
  },
] as const;

const ALLOWED_MODEL_MAP = new Map<string, ServerTtsModelSpec>(
  GEMINI_TTS_MODELS.map((m) => [m.id, m])
);

interface ServerVoiceSpec {
  id: 'Kore' | 'Charon';
  label: string;
  description: string;
  locale: 'en-US';
  style: string;
}

const GEMINI_TRAINER_VOICES: readonly ServerVoiceSpec[] = [
  {
    id: 'Kore',
    label: 'Natural Voice 1 — Kore (Warm Instructor)',
    description: 'Calm, warm, clear American English clinical software trainer',
    locale: 'en-US',
    style:
      'Calm, warm, clear, professional American English healthcare software instructor demonstrating an EHR workflow over a screen share at a steady, natural conversational pace.',
  },
  {
    id: 'Charon',
    label: 'Natural Voice 2 — Charon (Steady Instructor)',
    description: 'Confident, steady, articulate American English clinical software trainer',
    locale: 'en-US',
    style:
      'Confident, friendly, articulate American English healthcare software instructor demonstrating an EHR workflow over a screen share at a steady, natural conversational pace.',
  },
] as const;

const ALLOWED_VOICE_MAP = new Map<string, ServerVoiceSpec>(
  GEMINI_TRAINER_VOICES.map((v) => [v.id, v])
);

interface CachedWavEntry {
  wavBuffer: Buffer;
  durationSec: number;
  createdAt: number;
  voiceId: string;
  modelId: string;
}

const wavCache = new Map<string, CachedWavEntry>();

function isValidApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.length < 16) return false;
  if (trimmed === 'MY_GEMINI_API_KEY' || trimmed.includes('YOUR_')) return false;
  return true;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isValidApiKey(apiKey)) return null;
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Verifies a WAV RIFF/WAVE header and computes exact audio duration in seconds.
 * Gemini 3.8 unary TTS returns 24 kHz, 16-bit mono WAV (44-byte RIFF header).
 */
export function parseWavDurationSeconds(buf: Buffer): { valid: boolean; durationSec: number } {
  if (buf.length < 44) return { valid: false, durationSec: 0 };
  const riff = buf.subarray(0, 4).toString('ascii');
  const wave = buf.subarray(8, 12).toString('ascii');
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return { valid: false, durationSec: 0 };
  }

  let byteRate = 0;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 20 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, buf.length - (offset + 8));
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (byteRate <= 0 || dataSize <= 0) {
    // Fallback for standard 24kHz mono 16-bit PCM (48,000 bytes/sec)
    const fallbackBytes = Math.max(0, buf.length - 44);
    return { valid: fallbackBytes > 0, durationSec: Number((fallbackBytes / 48000).toFixed(3)) };
  }

  return {
    valid: true,
    durationSec: Number((dataSize / byteRate).toFixed(3)),
  };
}

function cacheKeyForClip(params: {
  model: string;
  text: string;
  voiceId: string;
  locale: string;
  scriptVersion: string;
}): string {
  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        model: params.model,
        voiceId: params.voiceId,
        locale: params.locale,
        scriptVersion: params.scriptVersion,
        text: params.text,
      })
    )
    .digest('hex');
  return hash;
}

function storeInCache(key: string, entry: CachedWavEntry): void {
  if (wavCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = wavCache.keys().next().value;
    if (oldestKey) wavCache.delete(oldestKey);
  }
  wavCache.set(key, entry);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function synthesizeWithGeminiTTS(
  ai: GoogleGenAI,
  text: string,
  voice: ServerVoiceSpec,
  modelId: ServerTtsModelSpec['id']
): Promise<Buffer> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style: voice.style,
                },
              } as unknown as { text: string },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice.id },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('Gemini TTS response did not include inline audio data.');
      }

      const wavBuffer = Buffer.from(base64Audio, 'base64');
      const parsed = parseWavDurationSeconds(wavBuffer);
      if (!parsed.valid || parsed.durationSec <= 0.05) {
        throw new Error('Generated WAV clip failed RIFF/WAVE header or duration verification.');
      }
      return wavBuffer;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /429|500|502|503|504|temporarily|rate|timeout/i.test(msg);
      if (!retryable || attempt === 2) {
        break;
      }
      await sleep(350 * Math.pow(2, attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini TTS synthesis failed.');
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Health & Neural TTS configuration status (never returns any API key)
  app.get('/api/tts/status', (_req, res) => {
    const configured = isValidApiKey(process.env.GEMINI_API_KEY);
    res.json({
      neuralConfigured: configured,
      provider: configured ? 'gemini-neural' : 'none',
      model: DEFAULT_TTS_MODEL,
      availableModels: configured ? GEMINI_TTS_MODELS : [],
      locale: 'en-US',
      voices: configured
        ? GEMINI_TRAINER_VOICES.map(({ id, label, description, locale }) => ({
            id,
            label,
            description,
            locale,
            provider: 'gemini-neural',
          }))
        : [],
      cacheEntries: wavCache.size,
      missingReason: configured
        ? undefined
        : 'GEMINI_API_KEY is not configured in server environment (add it in Settings > Secrets to enable Gemini Neural TTS).',
    });
  });

  // Synthesize a complete sentence/paragraph into a verified cached WAV clip
  app.post('/api/tts/synthesize', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'NEURAL_TTS_UNCONFIGURED',
        error:
          'Gemini Neural TTS is not configured because GEMINI_API_KEY is missing on the server. Using synchronized browser-voice fallback.',
      });
      return;
    }

    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const requestedVoice = typeof req.body?.voiceId === 'string' ? req.body.voiceId.trim() : 'Kore';
    const requestedModel =
      typeof req.body?.model === 'string' && req.body.model.trim()
        ? req.body.model.trim()
        : DEFAULT_TTS_MODEL;
    const locale = typeof req.body?.locale === 'string' ? req.body.locale.trim() : 'en-US';
    const scriptVersion =
      typeof req.body?.scriptVersion === 'string' ? req.body.scriptVersion.trim().slice(0, 40) : 'v2';

    if (!rawText) {
      res.status(400).json({ code: 'INVALID_TEXT', error: 'Narration text must be a non-empty string.' });
      return;
    }
    if (rawText.length > MAX_TEXT_LENGTH) {
      res.status(400).json({
        code: 'TEXT_TOO_LONG',
        error: `Narration segment exceeds ${MAX_TEXT_LENGTH} characters.`,
      });
      return;
    }

    const voice = ALLOWED_VOICE_MAP.get(requestedVoice);
    if (!voice) {
      res.status(400).json({
        code: 'INVALID_VOICE',
        error: 'Requested voice is not in the supported Gemini trainer voice allowlist.',
      });
      return;
    }

    const modelSpec = ALLOWED_MODEL_MAP.get(requestedModel);
    if (!modelSpec) {
      res.status(400).json({
        code: 'INVALID_MODEL',
        error: 'Requested TTS model is not in the supported Gemini TTS model allowlist.',
      });
      return;
    }

    const key = cacheKeyForClip({
      model: modelSpec.id,
      text: rawText,
      voiceId: voice.id,
      locale,
      scriptVersion,
    });
    const cached = wavCache.get(key);
    if (cached) {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-TTS-Provider', 'gemini-neural');
      res.setHeader('X-TTS-Model', modelSpec.id);
      res.setHeader('X-TTS-Voice', voice.id);
      res.setHeader('X-TTS-Cache', 'HIT');
      res.setHeader('X-Audio-Duration-Sec', String(cached.durationSec));
      res.send(cached.wavBuffer);
      return;
    }

    try {
      const wavBuffer = await synthesizeWithGeminiTTS(ai, rawText, voice, modelSpec.id);
      const parsed = parseWavDurationSeconds(wavBuffer);
      storeInCache(key, {
        wavBuffer,
        durationSec: parsed.durationSec,
        createdAt: Date.now(),
        voiceId: voice.id,
        modelId: modelSpec.id,
      });

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-TTS-Provider', 'gemini-neural');
      res.setHeader('X-TTS-Model', modelSpec.id);
      res.setHeader('X-TTS-Voice', voice.id);
      res.setHeader('X-TTS-Cache', 'MISS');
      res.setHeader('X-Audio-Duration-Sec', String(parsed.durationSec));
      res.send(wavBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream Gemini TTS request failed.';
      const status = /API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(message)
        ? 502
        : /429|RESOURCE_EXHAUSTED/i.test(message)
        ? 429
        : 502;
      res.status(status).json({
        code: 'NEURAL_TTS_ERROR',
        error: message,
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[EigenH Server] Listening on http://0.0.0.0:${PORT} | Gemini Neural TTS (${DEFAULT_TTS_MODEL}, compare: gemini-3.8-flash-tts): ${
        isValidApiKey(process.env.GEMINI_API_KEY) ? 'CONFIGURED' : 'NOT CONFIGURED (fallback mode)'
      }`
    );
  });
}

// Only auto-start when invoked directly (allows importing parseWavDurationSeconds in node:test)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void startServer();
}

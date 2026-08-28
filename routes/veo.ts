/**
 * AI proxy for Plajah Pixels — Veo video generation, Gemini content calls, and
 * ephemeral Live-API tokens, all with SERVER-HELD keys.
 *
 * History: Pixels used to call Gemini straight from the browser with an API key
 * baked into the public bundle via vite `define`. That key leaked and was
 * revoked; the define now injects '' and the features went dead. This router is
 * the replacement: the browser talks to /api/ai/veo/** with a Firebase ID
 * token, and only this process ever sees the Google AI key.
 *
 * Mount with: app.use('/api/ai/veo', express.json({ limit: '48mb' }), veoRouter)
 * (48mb because /content carries base64 inlineData audio for LRC transcription.)
 *
 * THE RULE: the Google AI key never leaves this file's process. The Veo
 * download URI Google returns requires the key as a query param, so /operation
 * rewrites it to our own /video proxy and /video appends the key server-side
 * while streaming the bytes through.
 */
import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import { GoogleGenAI, type GenerateVideosOperation } from '@google/genai';
import { verifyIdToken, adminConfig } from '../services/firebaseAdminRest';

export const veoRouter = Router();

// ── config ────────────────────────────────────────────────────────────────────

const DEFAULT_VEO_MODEL = 'veo-3.1-fast-generate-preview';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

/** Google only serves Veo results from here; anything else is refused. */
const VIDEO_HOST_PREFIX = 'https://generativelanguage.googleapis.com/';

/** Ephemeral live tokens: usable for 30 min, new sessions only in the first 2. */
const LIVE_TOKEN_TTL_MS = 30 * 60 * 1000;
const LIVE_NEW_SESSION_WINDOW_MS = 2 * 60 * 1000;

function serverKey(): string {
  return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function client(): GoogleGenAI | null {
  const key = serverKey();
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

// ── auth (same shape as routes/kithSightings.ts) ──────────────────────────────

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

/**
 * Every route gates identically: server must be configured with both Firebase
 * admin credentials (to verify the caller) and a Google AI key (to do the work).
 */
async function gate(req: Request, res: Response): Promise<GoogleGenAI | null> {
  if (!adminConfig.hasCredentials()) {
    res.status(503).json({ error: 'Server not configured.' });
    return null;
  }
  const ai = client();
  if (!ai) {
    res.status(503).json({ error: 'AI features are not configured on this server.' });
    return null;
  }
  const uid = await callerUid(req);
  if (!uid) {
    res.status(401).json({ error: 'Sign in required.' });
    return null;
  }
  return ai;
}

// ── POST /api/ai/veo/generate ─────────────────────────────────────────────────
/** Kick off a Veo video generation. Returns { operationName } to poll. */
veoRouter.post('/generate', async (req: Request, res: Response) => {
  const ai = await gate(req, res);
  if (!ai) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const requested = String(body.model || '');
  const model = /^veo-/.test(requested) ? requested : DEFAULT_VEO_MODEL;

  // Optional first-frame image, exactly the shape the client SDK used.
  let image: { imageBytes: string; mimeType: string } | undefined;
  const rawImage = body.image as Record<string, unknown> | undefined;
  if (rawImage && typeof rawImage.imageBytes === 'string' && typeof rawImage.mimeType === 'string') {
    image = { imageBytes: rawImage.imageBytes, mimeType: rawImage.mimeType };
  }
  if (!prompt && !image) return res.status(400).json({ error: 'prompt or image required.' });

  // Whitelist the config knobs Pixels actually uses; never pass the body through raw.
  const rawConfig = (body.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = { numberOfVideos: 1 };
  if (typeof rawConfig.resolution === 'string') config.resolution = rawConfig.resolution;
  if (typeof rawConfig.aspectRatio === 'string') config.aspectRatio = rawConfig.aspectRatio;

  try {
    const operation = await ai.models.generateVideos({ model, prompt, image, config });
    if (!operation.name) return res.status(502).json({ error: 'Upstream returned no operation.' });
    return res.json({ operationName: operation.name });
  } catch (e: any) {
    console.error('[veo] generate failed:', e?.message || e);
    return res.status(502).json({ error: 'Video generation failed to start.' });
  }
});

// ── GET /api/ai/veo/operation?name=... ────────────────────────────────────────
/**
 * Poll a generation operation. When done, the Google download URI (which needs
 * the API key appended) is rewritten to our own /video proxy path so the key
 * stays server-side.
 */
veoRouter.get('/operation', async (req: Request, res: Response) => {
  const ai = await gate(req, res);
  if (!ai) return;

  const name = String(req.query.name || '');
  if (!name || !/^[\w./-]+$/.test(name)) return res.status(400).json({ error: 'Valid operation name required.' });

  try {
    const operation = await ai.operations.getVideosOperation({
      operation: { name } as GenerateVideosOperation,
    });
    if (!operation.done) return res.json({ done: false });

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
      return res.json({ done: true, error: 'Generation finished but produced no video.' });
    }
    return res.json({ done: true, videoUri: `/api/ai/veo/video?uri=${encodeURIComponent(videoUri)}` });
  } catch (e: any) {
    console.error('[veo] operation poll failed:', e?.message || e);
    return res.status(502).json({ error: 'Failed to poll operation.' });
  }
});

// ── GET /api/ai/veo/video?uri=... ─────────────────────────────────────────────
/**
 * Stream the finished video through, appending the server key upstream.
 * Only Google's generativelanguage host is ever fetched.
 */
veoRouter.get('/video', async (req: Request, res: Response) => {
  const ai = await gate(req, res);
  if (!ai) return;

  const uri = String(req.query.uri || '');
  if (!uri.startsWith(VIDEO_HOST_PREFIX)) {
    return res.status(400).json({ error: 'Invalid video uri.' });
  }

  try {
    const sep = uri.includes('?') ? '&' : '?';
    const upstream = await fetch(`${uri}${sep}key=${encodeURIComponent(serverKey())}`);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'Upstream video fetch failed.' });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (e: any) {
    console.error('[veo] video proxy failed:', e?.message || e);
    if (!res.headersSent) res.status(502).json({ error: 'Video download failed.' });
  }
});

// ── POST /api/ai/veo/content ──────────────────────────────────────────────────
/**
 * Plain Gemini generateContent proxy for the two non-video Pixels features
 * (mood→theme JSON, audio→LRC transcription). Model clamped to gemini-*.
 */
veoRouter.post('/content', async (req: Request, res: Response) => {
  const ai = await gate(req, res);
  if (!ai) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const requested = String(body.model || '');
  const model = /^gemini-/.test(requested) ? requested : DEFAULT_GEMINI_MODEL;
  const contents = body.contents;
  if (!contents) return res.status(400).json({ error: 'contents required.' });

  // Whitelist config: the JSON-schema knobs the theme generator needs.
  const rawConfig = (body.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  if (typeof rawConfig.responseMimeType === 'string') config.responseMimeType = rawConfig.responseMimeType;
  if (rawConfig.responseSchema && typeof rawConfig.responseSchema === 'object') config.responseSchema = rawConfig.responseSchema;
  if (typeof rawConfig.systemInstruction === 'string') config.systemInstruction = rawConfig.systemInstruction;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: contents as any,
      config: Object.keys(config).length ? config : undefined,
    });
    return res.json({ text: response.text ?? '' });
  } catch (e: any) {
    console.error('[veo] content failed:', e?.message || e);
    return res.status(502).json({ error: 'Generation failed.' });
  }
});

// ── POST /api/ai/veo/live-token ───────────────────────────────────────────────
/**
 * Mint a short-lived ephemeral Live-API token, constrained to the live-lyrics
 * model, so the browser can open its own realtime connection without ever
 * holding the real key. Single use, model locked via liveConnectConstraints.
 */
veoRouter.post('/live-token', async (req: Request, res: Response) => {
  const ai = await gate(req, res);
  if (!ai) return;

  try {
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + LIVE_TOKEN_TTL_MS).toISOString(),
        newSessionExpireTime: new Date(now + LIVE_NEW_SESSION_WINDOW_MS).toISOString(),
        liveConnectConstraints: { model: LIVE_MODEL },
        lockAdditionalFields: [],
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    if (!token.name) return res.status(502).json({ error: 'Token mint returned no token.' });
    return res.json({ token: token.name, model: LIVE_MODEL });
  } catch (e: any) {
    console.error('[veo] live-token failed:', e?.message || e);
    return res.status(502).json({ error: 'Could not mint live token.' });
  }
});

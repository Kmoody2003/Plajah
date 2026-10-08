/**
 * Aria's spoken voice — a thin, authenticated proxy to ElevenLabs text-to-speech.
 *
 *   GET  /api/aria/speak/status  → { available }  (is a voice configured at all?)
 *   POST /api/aria/speak         → audio/mpeg of { text } in Aria's voice
 *
 * The API key and voice id live only in server env (never the client):
 *   ELEVENLABS_API_KEY            required
 *   ELEVENLABS_ARIA_VOICE_ID      required — the voice chosen in Aria voice development
 *   ELEVENLABS_ARIA_MODEL         optional (default eleven_v4)
 *   ARIA_TTS_DAILY_CHARS          optional per-user daily character cap (default 20000; admins exempt)
 *
 * ACCESS: premium voice is for paid plans (active/trialing Plajah+) and admins — resolved
 * server-side by the resolveAccess dep (see the mount in server.ts), never from client input.
 *
 * Voice settings mirror the approved sample (speed 1.0, stability 0.5, similarity 0.75).
 * Text is cleaned and product names are respelled by prepareSpeechText — see ariaSpeech.ts.
 * The daily cap is per server instance (in-memory); it is a cost guard, not a ledger.
 */
import { Router, json } from 'express';
import { prepareSpeechText } from '../services/aria/ariaSpeech';
import { isVerifiedAdmin, type VerifiedFacts } from '../services/aria/ariaTier';

/** Who may use the premium (ElevenLabs) voice. `null` = nobody (free account). */
export type AriaVoiceAccess = 'admin' | 'paid' | null;

/**
 * Pure entitlement decision, built on the same server-side facts as Aria's tier (see ariaTier.ts):
 * the verified token email, the admins collection and Stripe-written subscriptions — never the
 * client and never the self-editable users profile (role/tier there prove nothing).
 */
export function decideAriaVoiceAccess(f: VerifiedFacts): AriaVoiceAccess {
  if (isVerifiedAdmin(f)) return 'admin';
  if (f.hasActiveSubscription) return 'paid';
  return null;
}

interface Deps {
  authMiddleware: any;
  requireRegisteredUser: any;
  /** express-rate-limit instance (the shared aiLimiter). */
  limiter: any;
  /** Server-side entitlement check — never trusts anything the client sends. */
  resolveAccess: (req: any) => Promise<AriaVoiceAccess>;
}

const DEFAULT_MODEL = 'eleven_v4';
const usage = new Map<string, { day: string; chars: number }>();

function dailyCap(): number {
  const n = Number(process.env.ARIA_TTS_DAILY_CHARS);
  return Number.isFinite(n) && n > 0 ? n : 20000;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function configured() {
  const key = process.env.ELEVENLABS_API_KEY || '';
  const voiceId = process.env.ELEVENLABS_ARIA_VOICE_ID || '';
  return key && voiceId ? { key, voiceId } : null;
}

export function createAriaSpeakRouter({ authMiddleware, requireRegisteredUser, limiter, resolveAccess }: Deps): Router {
  const r = Router();

  // available = a voice is configured on the server; eligible = THIS user may use it.
  r.get('/status', authMiddleware, async (req: any, res: any) => {
    const access = req.isAnonymous ? null : await resolveAccess(req).catch(() => null);
    res.json({ available: !!configured(), eligible: access !== null, access });
  });

  r.post('/', limiter, authMiddleware, requireRegisteredUser, json({ limit: '32kb' }), async (req: any, res: any) => {
    const cfg = configured();
    if (!cfg) return res.status(503).json({ error: 'Aria voice not configured' });

    const access = await resolveAccess(req).catch(() => null);
    if (!access) {
      return res.status(403).json({ error: "Aria's studio voice is part of Plajah+.", code: 'PAID_ONLY' });
    }

    const text = prepareSpeechText(req.body?.text);
    if (!text) return res.status(400).json({ error: 'text required' });

    const uid: string = req.uid;
    const day = today();
    const u = usage.get(uid);
    const used = u && u.day === day ? u.chars : 0;
    // Admin (the owner testing the experience) is exempt from the daily cap.
    if (access !== 'admin' && used + text.length > dailyCap()) {
      return res.status(429).json({ error: 'Daily voice limit reached. Aria will be back to talking tomorrow.' });
    }

    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text,
            model_id: process.env.ELEVENLABS_ARIA_MODEL || DEFAULT_MODEL,
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!upstream.ok) {
        console.error('[Aria voice] ElevenLabs responded', upstream.status);
        return res.status(502).json({ error: 'Voice request failed' });
      }
      const audio = Buffer.from(await upstream.arrayBuffer());
      usage.set(uid, { day, chars: used + text.length });
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'Content-Length': String(audio.length) });
      res.send(audio);
    } catch (err: any) {
      console.error('[Aria voice] request failed:', err?.message || err);
      res.status(502).json({ error: 'Voice request failed' });
    }
  });

  return r;
}

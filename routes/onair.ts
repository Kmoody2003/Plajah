// Plajah FM on-air staff — the server is the one station brain.
//
//   GET  /now        who is on air (station time), the next host, and the clock
//   GET  /roster     the nine personas' public cards (hosts + artists) for the radio page and the side pillar
//   GET  /schedule   the weekly show grid
//   POST /link       {kind, prev?, next?, channelName?} → the host's line for this moment (+ audioUrl when voiced)
//   GET  /voice      which personas have a voice and this month's render spend
//   POST /durations  {tracks:[{id,url}]} → real song lengths for the station clock (read once, cached)
//
// Why server-side: every listener must hear the same host say the same line at the same moment, the
// model key never reaches a browser, and each line is written ONCE per song change (cached), not once
// per listener — that is what keeps the running cost flat as the audience grows.
//
// The live mind (Gemini) is off unless ONAIR_MIND=1; without it every line is a grounded template.
// A model line only airs if policy.checkLine passes with the facts given (see services/onair/segments).
//
// Mounted in server.ts as: app.use('/api/onair', apiLimiter, express.json({ limit: '128kb' }), createOnAirRouter())  (128kb: /durations carries the rotation's URLs)

import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { ALL_PERSONAS, weeklyGrid } from '../services/onair/roster';
import { HOSTS } from '../services/onair/hosts';
import { planLink, type LinkKind, type SongFacts } from '../services/onair/segments';
import { buildPersonaPrompt } from '../services/onair/prompt';
import { onAirNow, nextOnAir, stationClock, showHoursLabel, STATION_TZ } from '../services/onair/station';
import type { PersonaSheet } from '../services/onair/types';
import { createGeminiLane, geminiConfigured, laneModel, type LaneFn } from '../services/ai/geminiLane';
import type { Voicer } from '../services/onair/voice';
import { probeDuration } from '../services/onair/audioDuration';

/** The public card for a persona: what the radio page and the side pillar show. No prompts, no voice ids. */
export function publicCard(p: PersonaSheet) {
  return {
    id: p.id,
    kind: p.kind,
    stageName: p.stageName,
    pronouns: p.pronouns,
    handle: p.account.handle,
    disclosure: p.account.disclosure,
    tagline: p.backstory.tagline,
    portrait: p.look.portrait,
    palette: p.look.palette,
    show: p.show ? { name: p.show.name, days: p.show.days, hours: p.show.hours, label: showHoursLabel(p), genres: p.show.genres, format: p.show.format } : null,
    artist: p.artist ? { genre: p.artist.genre, subgenres: p.artist.subgenres } : null,
  };
}

const LINK_KINDS: LinkKind[] = ['between', 'talk-up', 'into-break', 'out-of-break', 'top-of-hour', 'fill-in'];
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** Only the fields a host may speak, length-capped. Anything else in the body is ignored. */
export function cleanSong(v: any): SongFacts | null {
  if (!v || typeof v !== 'object') return null;
  const title = str(v.title);
  const artist = str(v.artist);
  if (!title || !artist) return null;
  const plays = Number(v.plays);
  return {
    id: str(v.id, 80) || title,
    title,
    artist,
    plajahCreator: v.plajahCreator === true,
    plays: Number.isFinite(plays) && plays >= 0 && plays < 1e9 ? Math.floor(plays) : undefined,
    isPersonaArtist: v.isPersonaArtist === true,
  };
}

/** A small LRU so a song change is written once and every listener gets the same line. */
class LineCache<V> {
  private m = new Map<string, V>();
  constructor(private max = 500) {}
  get(k: string) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k: string, v: V) { this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string); }
}

/** Only the station's own storage is probed — this endpoint must never become a URL fetcher. */
export function isStationMediaUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return false;
    return x.hostname === 'firebasestorage.googleapis.com' || x.hostname === 'storage.googleapis.com' || x.hostname.endsWith('.firebasestorage.app');
  } catch { return false; }
}

export interface OnAirDeps {
  now?: () => number;
  /** The model lane for live lines. Omit (or ONAIR_MIND unset) for templates only. */
  mind?: LaneFn | null;
  /** Renders lines in the persona's ElevenLabs voice (services/onair/voice). Omit for captions only. */
  voicer?: Voicer | null;
  /** Reads a song's length (tests stub it). */
  probe?: (url: string) => Promise<number | null>;
}

export function createOnAirRouter(deps: OnAirDeps = {}): Router {
  const r = Router();
  const now = deps.now ?? (() => Date.now());
  const mind: LaneFn | null = deps.mind !== undefined
    ? deps.mind
    : process.env.ONAIR_MIND === '1' && geminiConfigured() ? createGeminiLane({ model: laneModel('ONAIR_MODEL'), temperature: 0.8, timeoutMs: 6000 }) : null;
  type Line = { text: string; estSec: number; source: string; audioUrl?: string | null };
  const cache = new LineCache<Line>();
  const pending = new Map<string, Promise<Line>>();
  const voicer = deps.voicer ?? null;

  r.get('/now', (_req: Request, res: Response) => {
    const t = now();
    const host = onAirNow(t);
    const next = nextOnAir(t);
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      at: t,
      tz: STATION_TZ,
      clock: stationClock(t),
      host: host ? publicCard(host) : null,
      next: next ? { host: publicCard(next.host), inHours: next.inHours } : null,
    });
  });

  r.get('/roster', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ personas: ALL_PERSONAS.map(publicCard) });
  });

  // Which personas have a voice, and this month's render spend (no ids or keys).
  r.get('/voice', (_req, res) => {
    const s = voicer?.status();
    res.json(s ? { on: true, voiced: s.voiced, charsThisMonth: s.charsThisMonth, cap: s.cap, paused: s.pausedUntil > now() } : { on: false });
  });

  r.get('/schedule', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ tz: STATION_TZ, grid: weeklyGrid(), shows: HOSTS.map(publicCard) });
  });

  // ── Station clock: real song lengths ───────────────────────────────────────────────────────────
  // Uploads never stored a duration, so the satellite clock guessed 3 minutes for every song and
  // drifted off what was really playing. Each file's header is read ONCE (a small range request) and
  // cached for every listener; the browser builds the same clock from the same numbers.
  const probe = deps.probe ?? probeDuration;
  const lengths = new Map<string, number | null>();          // url → seconds (0 = empty file, null = unreadable)
  const probing = new Map<string, Promise<void>>();
  let active = 0; const waiting: (() => void)[] = [];
  const slot = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (active >= 6) await new Promise<void>(r => waiting.push(r));
    active++;
    try { return await fn(); } finally { active--; waiting.shift()?.(); }
  };
  const measure = (url: string) => {
    let p = probing.get(url);
    if (!p) {
      p = slot(() => probe(url)).then(sec => { lengths.set(url, sec == null ? null : Math.round(sec * 10) / 10); }, () => { lengths.set(url, null); })
        .finally(() => probing.delete(url));
      probing.set(url, p);
    }
    return p;
  };

  r.post('/durations', async (req: Request, res: Response) => {
    const list = Array.isArray(req.body?.tracks) ? req.body.tracks.slice(0, 400) : [];
    const items = list
      .map((t: any) => ({ id: str(t?.id, 80), url: typeof t?.url === 'string' ? t.url.slice(0, 2000) : '' }))
      .filter((t: { id: string; url: string }) => t.id && isStationMediaUrl(t.url));
    const todo = items.filter((t: { url: string }) => !lengths.has(t.url)).map((t: { url: string }) => measure(t.url));
    // Wait a little for a cold cache; whatever isn't read yet comes back as pending (ask again).
    if (todo.length) await Promise.race([Promise.allSettled(todo), new Promise(r => setTimeout(r, 6000))]);
    const durations: Record<string, number | null> = {};
    let pending = 0;
    for (const t of items) {
      if (lengths.has(t.url)) durations[t.id] = lengths.get(t.url)!;
      else pending++;
    }
    res.json({ durations, pending });
  });

  r.post('/link', async (req: Request, res: Response) => {
    const kind = str(req.body?.kind, 20) as LinkKind;
    if (!LINK_KINDS.includes(kind)) return res.status(400).json({ error: 'Unknown link kind.' });
    const host = onAirNow(now());
    if (!host) return res.json({ host: null, line: null });
    const prev = cleanSong(req.body?.prev);
    const next = cleanSong(req.body?.next);
    const channelName = str(req.body?.channelName, 60) || undefined;
    const maxSecIn = Number(req.body?.maxSec);
    const maxSec = Number.isFinite(maxSecIn) && maxSecIn >= 2 && maxSecIn <= 30 ? maxSecIn : undefined;

    // Same host + moment + facts → same line for everyone. The hour is in the key so a show change rewrites it.
    const key = createHash('sha1').update(JSON.stringify([host.id, kind, prev, next, channelName, maxSec, Math.floor(now() / 3_600_000)])).digest('hex');
    const hit = cache.get(key);
    if (hit) return res.json({ host: host.id, line: hit, cached: true });

    let job = pending.get(key);
    if (!job) {
      job = (async () => {
        const ctx = { kind, host, prev, next, channelName, maxSec, seed: key };
        let mindLine: string | null = null;
        // The model only writes song links; fill-ins and station IDs stay on the grounded templates.
        if (mind && kind !== 'fill-in' && kind !== 'top-of-hour') {
          try {
            const p = buildPersonaPrompt(host, { kind, prev, next, maxSec });
            mindLine = (await mind(p.system, p.user, Math.max(40, p.maxWords * 3), { temperature: 0.8 })).trim().replace(/^["“]|["”]$/g, '');
          } catch { mindLine = null; }
        }
        const l = planLink(ctx, mindLine);
        const out: Line = { text: l.text, estSec: l.estSec, source: l.source };
        // Voice it once for everyone; a failed render leaves the caption.
        if (voicer) out.audioUrl = await voicer.voice(host.id, l.text).catch(() => null);
        cache.set(key, out);
        return out;
      })().finally(() => pending.delete(key));
      pending.set(key, job);
    }
    res.json({ host: host.id, line: await job });
  });

  return r;
}

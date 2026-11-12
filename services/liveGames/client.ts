// Live party games — browser client for /api/live-game (routes/liveGames.ts). Non-throwing like the gamer
// client: every call resolves to { ok, ... } so a dropped connection shows a message instead of breaking play.

import { auth } from '../firebase';
import type { LiveGameDoc, LiveGameSettings, PlayerDoc, StrokeOp } from './core';
import type { PartyGameDoc, PartyKind, PartySettings } from './party';

const origin = () => (import.meta as any).env?.VITE_APP_URL ?? window.location.origin;
const base = () => `${origin()}/api/live-game`;

export interface Fail { ok: false; error: string; httpStatus: number }
export type Res<T> = ({ ok: true } & T) | Fail;
export const failed = <T,>(r: Res<T>): r is Fail => r.ok === false;

export interface GameView { game: LiveGameDoc; me: PlayerDoc | null; secret?: { word?: string; choices?: string[] }; serverNow: number }
export type GuessVerdict = 'correct' | 'close' | 'wrong' | 'already' | 'closed';

async function call<T>(method: string, path: string, body?: object, root = base()): Promise<Res<T>> {
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${root}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `Request failed (${res.status})`, httpStatus: res.status };
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, error: 'Connection lost — retrying', httpStatus: 0 };
  }
}

const g = (id: string) => `/${encodeURIComponent(id)}`;
export const liveGame = {
  create: (opts: { title?: string; settings?: Partial<LiveGameSettings>; streamId?: string }) => call<{ game: LiveGameDoc; packs: Array<{ id: string; title: string }> }>('POST', '/', opts),
  live: () => call<{ games: LiveGameDoc[] }>('GET', '/live'),
  packs: () => call<{ packs: Array<{ id: string; title: string; size: number }> }>('GET', '/packs'),
  get: (id: string) => call<GameView>('GET', g(id)),
  join: (id: string, name?: string) => call<{ me: PlayerDoc }>('POST', `${g(id)}/join`, { name }),
  start: (id: string) => call<{ game: LiveGameDoc }>('POST', `${g(id)}/start`),
  choose: (id: string, i: number) => call<{ game: LiveGameDoc; secret: { word: string } }>('POST', `${g(id)}/choose`, { i }),
  strokes: (id: string, round: number, seq: number, ops: StrokeOp[]) => call<{ ok: boolean; dup?: boolean }>('POST', `${g(id)}/strokes`, { round, seq, ops }),
  guess: (id: string, text: string) => call<{ verdict: GuessVerdict; points?: number; score?: number }>('POST', `${g(id)}/guess`, { text }),
  tick: (id: string) => call<{ game: LiveGameDoc; serverNow: number }>('POST', `${g(id)}/tick`),
  skip: (id: string) => call<{ game: LiveGameDoc }>('POST', `${g(id)}/skip`),
  end: (id: string) => call<{ game: LiveGameDoc }>('POST', `${g(id)}/end`),
  setStream: (id: string, streamId: string) => call<{ ok: boolean }>('POST', `${g(id)}/stream`, { streamId }),
  poll: (id: string, round: number, after: number, feedAfter: number) =>
    call<{ game: LiveGameDoc; strokes: any[]; feed: any[]; serverNow: number }>('GET', `${g(id)}/poll?round=${round}&after=${after}&feedAfter=${feedAfter}`),
};

// ───────────────────────────────────────────── Brain Rush / Crowd Says / Impostor Night (routes/liveParty.ts)
export interface PartyMine { choice?: number; text?: string; target?: string; role?: 'crew' | 'impostor' | 'watcher'; word?: string; category?: string }
const pbase = () => `${origin()}/api/live-party`;
const pc = <T,>(method: string, path: string, body?: object) => call<T>(method, path, body, pbase());
export const liveParty = {
  create: (kind: PartyKind, opts: { title?: string; settings?: Partial<PartySettings>; streamId?: string }) => pc<{ game: PartyGameDoc }>('POST', '/', { kind, ...opts }),
  packs: (kind: PartyKind) => pc<{ packs: Array<{ id: string; title: string; size: number }> }>('GET', `/packs?kind=${kind}`),
  get: (id: string) => pc<{ game: PartyGameDoc; me: PlayerDoc | null; mine: PartyMine; serverNow: number }>('GET', g(id)),
  join: (id: string, name?: string) => pc<{ me: PlayerDoc }>('POST', `${g(id)}/join`, { name }),
  start: (id: string) => pc<{ game: PartyGameDoc }>('POST', `${g(id)}/start`),
  answer: (id: string, a: { choice?: number; text?: string }) => pc<{ result: 'locked' | 'already' | 'closed' }>('POST', `${g(id)}/answer`, a),
  vote: (id: string, target: string) => pc<{ result: 'locked' | 'already' | 'closed' }>('POST', `${g(id)}/vote`, { target }),
  tick: (id: string) => pc<{ game: PartyGameDoc; serverNow: number }>('POST', `${g(id)}/tick`),
  skip: (id: string) => pc<{ game: PartyGameDoc }>('POST', `${g(id)}/skip`),
  end: (id: string) => pc<{ game: PartyGameDoc }>('POST', `${g(id)}/end`),
  setStream: (id: string, streamId: string) => pc<{ ok: boolean }>('POST', `${g(id)}/stream`, { streamId }),
};

export const myUid = () => auth.currentUser?.uid ?? null;
export const isGuest = () => !!(auth.currentUser as any)?.isAnonymous;

/** Signed out? Become a guest (Firebase anonymous auth) so one tap from the feed is enough to play.
 *  A guest who signs up later keeps the same uid, so their points come with them. */
export async function ensurePlayable(): Promise<boolean> {
  if (auth.currentUser) return true;
  try { const { ensureGuestAuth } = await import('../backendService'); return !!(await ensureGuestAuth()); } catch { return false; }
}

// ───────────────────────────────────────────── posting a game to the timeline
export type AnyLiveKind = 'sketch' | PartyKind;
export const LIVE_KINDS: ReadonlyArray<AnyLiveKind> = ['sketch', 'trivia', 'crowd', 'impostor'];
export interface LiveGameEmbed { v: 1; kind: AnyLiveKind; gid: string }
const GID = /^[A-Za-z0-9_-]{6,40}$/;
export function sanitizeLiveGameEmbed(x: unknown): LiveGameEmbed | null {
  const o = x as Record<string, unknown> | null;
  return o && typeof o === 'object' && LIVE_KINDS.includes(o.kind as AnyLiveKind) && typeof o.gid === 'string' && GID.test(o.gid) ? { v: 1, kind: o.kind as AnyLiveKind, gid: o.gid } : null;
}

const POST_TEXT: Record<AnyLiveKind, string> = {
  sketch: `🎨 I'm live with Sketch Rush — guess what I'm drawing and score points! Jump in right here.`,
  trivia: `🧠 Brain Rush is live — fast trivia, faster answers score more. Play right here!`,
  crowd: `📊 Crowd Says is live — answer with the crowd and score when you match. Jump in!`,
  impostor: `🕵️ Impostor Night is live — give a clue, find the impostor. Play right here!`,
};
const POST_TAG: Record<AnyLiveKind, string> = { sketch: 'SketchRush', trivia: 'BrainRush', crowd: 'CrowdSays', impostor: 'ImpostorNight' };

/** Publish a timeline post carrying the live game, so anyone who scrolls past it can jump in. */
export async function postLiveGame(game: { id: string; kind: AnyLiveKind; hostName: string }): Promise<string | null> {
  const user = auth.currentUser; if (!user) return null;
  const { createPost } = await import('../backendService');
  const id = await createPost({
    text: POST_TEXT[game.kind] ?? POST_TEXT.sketch,
    authorId: user.uid, authorName: user.displayName || game.hostName, authorPhoto: user.photoURL || '',
    likesCount: 0, commentsCount: 0, timestamp: Date.now(), isPublic: true, tags: ['PlajahGames', POST_TAG[game.kind] ?? 'SketchRush'],
    liveGameEmbed: { v: 1, kind: game.kind, gid: game.id },
  } as any).catch(() => null);
  return typeof id === 'string' ? id : (id as any)?.id ?? null;
}

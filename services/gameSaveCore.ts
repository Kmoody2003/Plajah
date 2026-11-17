// Cloud saves for first-party games: the rules of the protocol, with no Firebase or DOM in it so they can be tested.
//
// A save is one opaque JSON string per player per game, with a revision number. The game decides what is in it and how two saves merge; the host only guarantees
// that a store never silently overwrites a newer save (optimistic concurrency on `rev`), and that nothing oversized or malformed is kept.
//
// Messages, game -> host (window.postMessage):
//   { type: 'plajah.save.hello', gameId }                       "is cloud save available?"
//   { type: 'plajah.save.load',  gameId, reqId }
//   { type: 'plajah.save.store', gameId, reqId, baseRev, data }  baseRev = the rev this save was built on (0 = no cloud save yet); data = JSON string
// host -> game:
//   { type: 'plajah.save.hello.result', available }             false for guests
//   { type: 'plajah.save.result', reqId, op, ok, rev, data, updatedAt, conflict?, error? }
//     load: data is the cloud JSON string or null when there is none yet.
//     store: ok=true gives the new rev; ok=false with conflict=true gives the cloud rev and data so the game can merge and store again.

export const SAVE_MAX_BYTES = 200_000;            // per save; the ops rules allow up to 262,144 characters
export const SAVE_MIN_INTERVAL_MS = 2_000;        // stores faster than this are refused, not queued
export const SAVE_MAX_PER_HOUR = 180;
export const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export interface CloudSaveDoc { rev: number; data: string; updatedAt: number | null }
export type StoreOutcome = { ok: true; doc: CloudSaveDoc } | { ok: false; conflict: true; doc: CloudSaveDoc | null } | { ok: false; conflict?: false; error: string };

/** what the Firestore layer provides */
export interface SaveStore {
  load(uid: string, gameId: string): Promise<CloudSaveDoc | null>;
  /** writes rev = baseRev + 1 only if the cloud save is still at baseRev; otherwise reports the conflict with the current doc */
  store(uid: string, gameId: string, baseRev: number, data: string, device: string): Promise<StoreOutcome>;
}

export const docIdFor = (uid: string, gameId: string): string => `${uid}_${gameId}`;

export function validData(data: unknown): data is string {
  if (typeof data !== 'string' || data.length === 0) return false;
  if (new TextEncoder().encode(data).length > SAVE_MAX_BYTES) return false;
  try { const v = JSON.parse(data); return typeof v === 'object' && v !== null; } catch { return false; }
}

export interface ResultMsg { type: 'plajah.save.result'; reqId: string; op: 'load' | 'store'; ok: boolean; rev: number; data: string | null; updatedAt: number | null; conflict?: boolean; error?: string }

export class SaveHost {
  private lastStore = 0;
  private hour: number[] = [];

  constructor(private store: SaveStore, private uid: string, private gameId: string, private device = 'web', private now: () => number = Date.now) {}

  /** answers one game message; returns the message to send back, or null if it is not for us */
  async handle(msg: unknown): Promise<{ type: string; [k: string]: unknown } | null> {
    if (typeof msg !== 'object' || msg === null) return null;
    const m = msg as Record<string, unknown>;
    if (typeof m.type !== 'string' || !m.type.startsWith('plajah.save.')) return null;
    if (m.gameId !== this.gameId) return null;
    if (m.type === 'plajah.save.hello') return { type: 'plajah.save.hello.result', available: true };
    const reqId = typeof m.reqId === 'string' && m.reqId.length > 0 && m.reqId.length <= 64 ? m.reqId : null;
    if (!reqId) return null;
    if (m.type === 'plajah.save.load') {
      try {
        const d = await this.store.load(this.uid, this.gameId);
        return { type: 'plajah.save.result', reqId, op: 'load', ok: true, rev: d?.rev ?? 0, data: d?.data ?? null, updatedAt: d?.updatedAt ?? null } satisfies ResultMsg;
      } catch (e) { return fail(reqId, 'load', 'Could not read the cloud save.'); }
    }
    if (m.type === 'plajah.save.store') {
      const baseRev = m.baseRev;
      if (typeof baseRev !== 'number' || !Number.isInteger(baseRev) || baseRev < 0) return fail(reqId, 'store', 'Bad revision.');
      if (!validData(m.data)) return fail(reqId, 'store', 'The save is not valid JSON or is too large.');
      const t = this.now();
      this.hour = this.hour.filter((x) => t - x < 3_600_000);
      if (t - this.lastStore < SAVE_MIN_INTERVAL_MS) return fail(reqId, 'store', 'Saving too fast; try again in a moment.');
      if (this.hour.length >= SAVE_MAX_PER_HOUR) return fail(reqId, 'store', 'Too many saves this hour.');
      try {
        const r = await this.store.store(this.uid, this.gameId, baseRev, m.data, this.device);
        if (r.ok) this.lastStore = t, this.hour.push(t);          // only writes that landed count; a conflict is answered at once so the game can merge and retry
        if (r.ok) return { type: 'plajah.save.result', reqId, op: 'store', ok: true, rev: r.doc.rev, data: null, updatedAt: r.doc.updatedAt } satisfies ResultMsg;
        if (r.conflict) return { type: 'plajah.save.result', reqId, op: 'store', ok: false, conflict: true, rev: r.doc?.rev ?? 0, data: r.doc?.data ?? null, updatedAt: r.doc?.updatedAt ?? null } satisfies ResultMsg;
        return fail(reqId, 'store', r.error);
      } catch (e) { return fail(reqId, 'store', 'Could not write the cloud save.'); }
    }
    return null;
  }
}

function fail(reqId: string, op: 'load' | 'store', error: string): ResultMsg {
  return { type: 'plajah.save.result', reqId, op, ok: false, rev: 0, data: null, updatedAt: null, error };
}

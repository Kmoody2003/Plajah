// Cloud save, game side. Dependency-free so any first-party game (a Vite app in games/, a bundled page, an iframe) can import it.
//
//   const cloud = new CloudSave('apex-elohim');
//   const sync = await cloud.sync(localJson, (local, cloud) => ({ json: pickBetter(local, cloud), source: 'cloud' }));   // at start
//   cloud.save(json);                                                                                                     // after every change; it batches and retries
//
// The game keeps its own copy on the device (localStorage) and works with no cloud at all: for a guest, a standalone tab, or a dropped connection the calls
// resolve with `available: false` / `offline` and the game carries on. The host page (services/gameSaves.ts) does the storing; the protocol is in
// services/gameSaveCore.ts. The game decides how two saves merge, because only it knows what its progress means.

export type SaveStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error';
export interface Transport { post(msg: unknown): void; listen(cb: (msg: unknown) => void): () => void }
export interface CloudResult { rev: number; data: string | null; updatedAt: number | null }
export interface MergeResult { json: string; source: 'local' | 'cloud' | 'merged' }
export type Merge = (localJson: string | null, cloudJson: string) => MergeResult;

export function windowTransport(): Transport | null {
  if (typeof window === 'undefined' || window.parent === window) return null;     // not embedded: no host to talk to
  return {
    post: (m) => window.parent.postMessage(m, window.location.origin),
    listen: (cb) => { const f = (e: MessageEvent): void => { if (e.source === window.parent && e.origin === window.location.origin) cb(e.data); }; window.addEventListener('message', f); return () => window.removeEventListener('message', f); },
  };
}

export class CloudSave {
  status: SaveStatus = 'idle';
  rev = 0;
  onStatus?: (s: SaveStatus) => void;
  private pending = new Map<string, (m: Record<string, unknown>) => void>();
  private seq = 0;
  private avail: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty: string | null = null;
  private busy = false;
  private lastStore = 0;
  private merge: Merge | null = null;
  private off: (() => void) | null = null;

  constructor(readonly gameId: string, private transport: Transport | null = windowTransport(), private timeoutMs = 8000) {
    this.off = this.transport?.listen((m) => this.onMessage(m)) ?? null;
    if (typeof window !== 'undefined') {
      const flush = (): void => { if (document.visibilityState === 'hidden') void this.flush(); };
      document.addEventListener('visibilitychange', flush);
      window.addEventListener('pagehide', () => void this.flush());
    }
  }

  private set(s: SaveStatus): void { if (this.status !== s) { this.status = s; this.onStatus?.(s); } }

  private onMessage(m: unknown): void {
    if (typeof m !== 'object' || m === null) return;
    const d = m as Record<string, unknown>;
    if (d.type === 'plajah.save.hello.result' || d.type === 'plajah.save.result') {
      const key = d.type === 'plajah.save.result' ? String(d.reqId) : 'hello';
      const cb = this.pending.get(key); if (cb) { this.pending.delete(key); cb(d); }
    }
  }

  private ask(msg: Record<string, unknown>, key: string): Promise<Record<string, unknown> | null> {
    if (!this.transport) return Promise.resolve(null);
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.pending.delete(key); resolve(null); }, this.timeoutMs);
      this.pending.set(key, (d) => { clearTimeout(t); resolve(d); });
      this.transport!.post({ ...msg, gameId: this.gameId });
    });
  }

  /** is there a cloud to save to? false for guests, standalone tabs and hosts that do not serve saves */
  available(): Promise<boolean> {
    if (!this.avail) {
      this.avail = this.transport
        ? (async () => {
            for (let i = 0; i < 3; i++) {                        // the host may attach a moment after the game starts
              const r = await new Promise<Record<string, unknown> | null>((res) => {
                const t = setTimeout(() => { this.pending.delete('hello'); res(null); }, 700);
                this.pending.set('hello', (d) => { clearTimeout(t); res(d); });
                this.transport!.post({ type: 'plajah.save.hello', gameId: this.gameId });
              });
              if (r) return r.available === true;
            }
            return false;
          })()
        : Promise.resolve(false);
    }
    return this.avail;
  }

  async load(): Promise<CloudResult | null> {
    if (!(await this.available())) return null;
    const reqId = `l${++this.seq}`;
    const r = await this.ask({ type: 'plajah.save.load', reqId }, reqId);
    if (!r || r.ok !== true) return null;
    this.rev = Number(r.rev) || 0;
    return { rev: this.rev, data: typeof r.data === 'string' ? r.data : null, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null };
  }

  /** one store attempt; on a conflict hands back the newer cloud save */
  private async storeOnce(json: string): Promise<{ ok: boolean; conflict?: CloudResult; error?: string }> {
    const reqId = `s${++this.seq}`;
    const r = await this.ask({ type: 'plajah.save.store', reqId, baseRev: this.rev, data: json }, reqId);
    this.lastStore = Date.now();
    if (!r) return { ok: false, error: 'no answer' };
    if (r.ok === true) { this.rev = Number(r.rev) || this.rev + 1; return { ok: true }; }
    if (r.conflict === true) return { ok: false, conflict: { rev: Number(r.rev) || 0, data: typeof r.data === 'string' ? r.data : null, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null } };
    return { ok: false, error: String(r.error ?? 'refused') };
  }

  /**
   * At game start: bring the cloud and the device into agreement. Loads the cloud save, lets `merge` choose or combine, stores the result if it differs,
   * and returns the JSON the game should now use (null = nothing to do: no cloud, or the cloud is empty and the device has nothing).
   */
  async sync(localJson: string | null, merge: Merge): Promise<{ json: string | null; source: MergeResult['source'] | 'none'; available: boolean }> {
    this.merge = merge;
    if (!(await this.available())) { this.set('offline'); return { json: localJson, source: 'none', available: false }; }
    this.set('syncing');
    const cloud = await this.load();
    if (!cloud) { this.set('offline'); return { json: localJson, source: 'none', available: true }; }
    if (cloud.data === null) {
      if (localJson) await this.pushWithMerge(localJson);          // first device: its progress becomes the cloud save
      this.set(localJson ? 'synced' : 'idle');
      return { json: localJson, source: localJson ? 'local' : 'none', available: true };
    }
    const m = merge(localJson, cloud.data);
    if (m.json !== cloud.data) await this.pushWithMerge(m.json);
    this.set('synced');
    return { json: m.json, source: m.source, available: true };
  }

  /** store, and if another device got there first, merge with what it saved and try again (a few times) */
  private async pushWithMerge(json: string): Promise<boolean> {
    let cur = json;
    for (let i = 0; i < 4; i++) {
      const r = await this.storeOnce(cur);
      if (r.ok) return true;
      if (r.conflict) {
        this.set('conflict');
        this.rev = r.conflict.rev;
        if (r.conflict.data === null || !this.merge) return false;
        cur = this.merge(cur, r.conflict.data).json;
        continue;
      }
      this.set('error');
      return false;
    }
    return false;
  }

  /** after a change: save soon. Batches rapid changes, and never stores more than about once every 5 seconds */
  save(json: string): void {
    this.dirty = json;
    if (this.timer) return;
    const wait = Math.max(1500, 5000 - (Date.now() - this.lastStore));
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, wait);
  }

  /** store what is waiting now (also called when the tab is hidden or closed) */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.busy || this.dirty === null || !this.transport || !(await this.available())) return;
    const json = this.dirty; this.dirty = null; this.busy = true;
    this.set('syncing');
    try {
      const ok = await this.pushWithMerge(json);
      if (ok) this.set('synced'); else if (this.status !== 'error') this.set('offline');
      if (!ok) this.dirty = this.dirty ?? json;                      // keep it for the next try
    } finally { this.busy = false; }
  }

  dispose(): void { this.off?.(); this.off = null; if (this.timer) clearTimeout(this.timer); }
}

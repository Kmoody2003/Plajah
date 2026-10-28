// services/coedit/session.ts — one person's live connection to a shared creative project.
//
// Local first. Every edit is applied to the local CRDT state at once and written to an IndexedDB
// outbox before it goes anywhere, so work survives a dropped connection, a closed tab or a whole day
// offline; the outbox drains when the network returns. Remote edits stream in from Firestore and fold
// in through crdt.ts, which converges whatever order things arrive in.
//
//   coedit/{id}/ops/{batchId}        small op batches (JSON), serverTimestamp `at`
//   coedit/{id}/snap/head            pointer to the latest compacted state (chunks.ts)
//   coedit/{id}/versions/{vid}       shared history (+ private "my version" saves)
//   coedit/{id}/drafts/{uid}         a member's held, unpublished edits (follows them across devices)
//   coedit/{id}/presence/{uid_tab}   who's here, what they have selected, where their cursor is
//
// Two ways to work:
//   live  — edits are shared as you make them (Google Docs / Figma feel);
//   draft — edits are held as your own version on top of the live document, which keeps updating
//           underneath; "Share my changes" publishes them (with a preview of anything someone else
//           changed in the same places), "Discard" drops them.

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { auth, opsDb } from '../firebase';
import { thisDevice } from '../creativeCloud/cloudStore';
import { versionsToPrune, type VersionStub } from '../creativeCloud/history';
import {
  applyOps,
  coalesce,
  deepEqual,
  diff,
  fromDoc,
  getIn,
  idOf,
  opsToReach,
  overlay,
  pathKey,
  restamp,
  type ApplyEvent,
  type CrdtState,
  type Op,
  type Path,
} from './crdt';
import { newClock, observe, stampSite, tick, type Clock } from './hlc';
import { readChunks, writeChunks, deleteChunks } from './chunks';
import { describePath, sentence, summarize, type ChangeGroup, type PathLabeler } from './labels';
import { COEDIT, canEdit, personColor, type CoProject } from './project';

// ── public types ────────────────────────────────────────────────────────────

export type Connection = 'connecting' | 'live' | 'offline' | 'read-only' | 'error';
export type WorkMode = 'live' | 'draft';

export interface Presence {
  key: string;
  uid: string;
  name: string;
  photo?: string | null;
  color: string;
  site: string;
  mode: WorkMode;
  at: number;
  /** App-defined selection (ids), shown as coloured rings by the app. */
  sel?: string[];
  /** Cursor in the app's own space (`s` names the space, e.g. a page id). */
  cur?: { x: number; y: number; s?: string } | null;
  /** What they're working on, in words ("Back page › Headline"). */
  focus?: string;
}

export interface Notice {
  id: string;
  at: number;
  kind: 'overwritten' | 'kept-deleted' | 'text-overlap' | 'offline-lost' | 'info';
  path?: Path;
  label: string;
  by?: string;
  byName?: string;
  /** Your value before theirs replaced it (for "Keep mine"). */
  mine?: unknown;
  text: string;
}

export interface Activity {
  id: string;
  at: number;
  uid: string;
  name: string;
  summary: string;
  groups: ChangeGroup[];
}

export interface VersionMeta {
  id: string;
  label?: string;
  reason: 'checkpoint' | 'named' | 'personal' | 'before-restore' | 'before-publish' | 'import' | 'line';
  /** For reason 'line': whose version of the project this is (their uid). */
  line?: string;
  at: number;
  by: string;
  byName: string;
  private?: boolean;
  chunks: number;
  size: number;
  summary?: string;
  contributors?: string[];
  pinned?: boolean;
}

export interface DraftConflict {
  path: Path;
  label: string;
  byName: string;
  theirs: unknown;
  mine: unknown;
}

export interface SessionSnapshot<T> {
  doc: T;
  connection: Connection;
  mode: WorkMode;
  pending: number;
  draftCount: number;
  presence: Presence[];
  notices: Notice[];
  activity: Activity[];
  lastSyncedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface SessionOptions<T> {
  project: CoProject;
  /** The document as this device has it right now (seeds a brand-new shared project). */
  initialDoc: T;
  labeler?: PathLabeler;
  /** Apps that mutate their document in place (Chora's GrooveDoc) must set this. */
  mutableDocs?: boolean;
}

// ── internals ───────────────────────────────────────────────────────────────

interface Batch {
  id: string;
  ops: Op[];
  mode: 'live' | 'publish' | 'restore' | 'undo';
  label?: string;
}

interface LocalCache<T> {
  v: 1;
  state: CrdtState<T>;
  outbox: Batch[];
  draft: Op[];
  draftBase?: string;
  wall: number;
  counter: number;
  seq: number;
  savedAt: number;
}

const OPS_BATCH_MS = 120;
const PRESENCE_BEAT_MS = 20_000;
const PRESENCE_STALE_MS = 65_000;
const CURSOR_MS = 220;
const SNAPSHOT_EVERY_OPS = 400;
const SNAPSHOT_IDLE_MS = 90_000;
const CHECKPOINT_MS = 10 * 60_000;
const LOG_KEEP_MS = 15 * 60_000;
const LOG_REPLAY_MARGIN_MS = 3 * 60_000;
const RECENT_WRITE_MS = 45_000;
const MAX_BATCH_CHARS = 800_000;
const UNDO_GROUP_MS = 800;

const cacheKey = (id: string) => `coedit:v1:${id}`;
const tabId = Math.random().toString(36).slice(2, 7);

let _uidShort = '';
function siteId(): string {
  const uid = auth.currentUser?.uid ?? 'anon';
  _uidShort = uid.slice(0, 8);
  return `${_uidShort}${thisDevice().id.slice(1, 6)}${tabId}`.replace(/[^A-Za-z0-9]/g, '');
}

function inverseOf(op: Op, before: CrdtState): Op | null {
  const doc = before.doc;
  switch (op.k) {
    case 'set': {
      const prev = getIn(doc, op.p);
      return prev === undefined ? { k: 'del', p: op.p, s: '' } : { k: 'set', p: op.p, v: prev, s: '' };
    }
    case 'del': {
      const prev = getIn(doc, op.p);
      return prev === undefined ? null : { k: 'set', p: op.p, v: prev, s: '' };
    }
    case 'txt':
      return { k: 'txt', p: op.p, from: op.to, to: op.from, s: '' };
    case 'ins':
      return { k: 'rm', p: op.p, id: op.id, s: '' };
    case 'rm': {
      const prev = getIn(doc, [...op.p, `#${op.id}`]);
      const pos = before.meta.pos[`${pathKey(op.p)}\u0001${op.id}`];
      return prev === undefined ? null : { k: 'ins', p: op.p, id: op.id, v: prev, pos: pos ?? 'i', s: '' };
    }
    case 'mv': {
      const pos = before.meta.pos[`${pathKey(op.p)}\u0001${op.id}`];
      return pos ? { k: 'mv', p: op.p, id: op.id, pos, s: '' } : null;
    }
  }
}

// ── the session ─────────────────────────────────────────────────────────────

export class CoeditSession<T = unknown> {
  readonly id: string;
  private project: CoProject;
  private labeler?: PathLabeler;
  private mutable: boolean;
  private clock: Clock;
  private site: string;
  private uid: string;
  private name: string;

  private shared: CrdtState<T>;
  private view: T;
  private draft: Op[] = [];
  private draftBase: string | undefined;
  private mode: WorkMode = 'live';
  private outbox: Batch[] = [];
  private inflight = new Set<string>();
  private sentIds = new Set<string>();
  private pendingOps: Op[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  private connection: Connection = 'connecting';
  private presence = new Map<string, Presence>();
  private myPresence: Presence;
  private notices: Notice[] = [];
  private activity: Activity[] = [];
  private recentWrites = new Map<string, { at: number; v: unknown; s: string }>();
  private undoStack: Op[][] = [];
  private lastUndoAt = 0;
  private redoStack: Op[][] = [];
  private lastSyncedAt: number | null = null;

  private opsSinceSnapshot = 0;
  private lastSnapshotAt = 0;
  private lastOpAtMs = 0;
  private contributorsSinceCheckpoint = new Set<string>();
  private lastCheckpointAt = 0;
  private headGen = '';
  private headChunks = 0;

  private unsubs: Unsubscribe[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private listeners = new Set<() => void>();
  private remoteListeners = new Set<(doc: T) => void>();
  private snapshotCache: SessionSnapshot<T> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private bootstrapped = false;
  private disposed = false;

  constructor(opts: SessionOptions<T>) {
    this.project = opts.project;
    this.id = opts.project.id;
    this.labeler = opts.labeler;
    this.mutable = !!opts.mutableDocs;
    const u = auth.currentUser;
    this.uid = u?.uid ?? 'anon';
    this.name = u?.displayName || opts.project.names?.[this.uid] || 'Me';
    this.site = siteId();
    this.clock = newClock(this.site);
    const seed = this.mutable ? structuredClone(opts.initialDoc) : opts.initialDoc;
    this.shared = fromDoc(seed);
    this.view = seed;
    this.myPresence = {
      key: `${this.uid}_${tabId}`,
      uid: this.uid,
      name: this.name,
      photo: u?.photoURL ?? null,
      color: personColor(this.uid),
      site: this.site,
      mode: 'live',
      at: Date.now(),
    };
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /** Shows the local copy at once, then connects (or keeps working offline). */
  async start(): Promise<T> {
    const cached = await idbGet<LocalCache<T>>(cacheKey(this.id)).catch(() => undefined);
    if (cached?.v === 1) {
      this.shared = cached.state;
      this.outbox = cached.outbox ?? [];
      this.draft = cached.draft ?? [];
      this.draftBase = cached.draftBase;
      this.mode = this.draft.length ? 'draft' : 'live';
      this.seq = cached.seq ?? 0;
      this.clock.wall = Math.max(this.clock.wall, cached.wall ?? 0);
      this.clock.counter = cached.counter ?? 0;
      this.recomputeView();
    }
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    window.addEventListener('pagehide', this.onPageHide);
    if (navigator.onLine === false) this.setConnection('offline');
    else void this.bootstrap();
    return this.view;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.flushPending();
    void this.persistNow();
    this.unsubs.forEach((u) => u());
    this.timers.forEach((t) => clearInterval(t));
    if (this.batchTimer) clearTimeout(this.batchTimer);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('pagehide', this.onPageHide);
    void deleteDoc(doc(opsDb, COEDIT, this.id, 'presence', this.myPresence.key)).catch(() => {});
  }

  private onOnline = () => {
    if (!this.bootstrapped) void this.bootstrap();
    else {
      this.setConnection(canEdit(this.project, this.uid) ? 'live' : 'read-only');
      void this.drainOutbox();
    }
  };
  private onOffline = () => this.setConnection('offline');
  private onPageHide = () => {
    this.flushPending();
    void this.persistNow();
    void deleteDoc(doc(opsDb, COEDIT, this.id, 'presence', this.myPresence.key)).catch(() => {});
  };

  private async bootstrap() {
    if (this.bootstrapped || this.disposed) return;
    try {
      const headSnap = await getDoc(doc(opsDb, COEDIT, this.id, 'snap', 'head'));
      let sinceMs = 0;
      if (headSnap.exists()) {
        const h = headSnap.data() as { gen: string; chunks: number; uptoMs: number; checkpointAt?: number };
        const json = await readChunks(this.id, `snap_${h.gen}`, h.chunks);
        const remote = JSON.parse(json) as CrdtState<T>;
        this.headGen = h.gen;
        this.headChunks = h.chunks;
        this.lastCheckpointAt = h.checkpointAt ?? 0;
        this.lastSnapshotAt = Date.now();
        sinceMs = Math.max(0, (h.uptoMs ?? 0) - LOG_REPLAY_MARGIN_MS);
        // Remote state is the truth; this device's unsent work (outbox) is re-applied on top below.
        this.shared = remote;
      } else if (canEdit(this.project, this.uid)) {
        // First open of a newly shared project: this device's copy becomes the shared one.
        await this.writeSnapshot(0);
      }
      // Re-apply this device's unsent edits; whatever lost to newer remote edits is reported.
      if (this.outbox.length) {
        const all = this.outbox.flatMap((b) => b.ops);
        const r = applyOps(this.shared, all);
        this.shared = r.state;
        const lost = all.filter((o) => !r.applied.includes(o) && !deepEqual(getIn(r.state.doc, o.p), (o as any).v ?? (o as any).to));
        if (lost.length) this.noteOfflineLost(lost);
      }
      this.recomputeView();
      this.emitRemote();
      this.subscribeOps(sinceMs);
      this.subscribePresence();
      this.timers.push(setInterval(() => void this.beat(), PRESENCE_BEAT_MS));
      this.timers.push(setInterval(() => void this.maybeCompact(), 15_000));
      this.bootstrapped = true;
      this.setConnection(canEdit(this.project, this.uid) ? 'live' : 'read-only');
      void this.beat();
      void this.loadCloudDraft();
      void this.drainOutbox();
    } catch (err) {
      console.warn('[coedit] connect failed; working offline', err);
      this.setConnection(navigator.onLine === false ? 'offline' : 'error');
      setTimeout(() => !this.bootstrapped && !this.disposed && navigator.onLine !== false && void this.bootstrap(), 8000);
    }
  }

  updateProject(p: CoProject) {
    this.project = p;
    if (this.bootstrapped && this.connection !== 'offline') this.setConnection(canEdit(p, this.uid) ? 'live' : 'read-only');
    this.changed();
  }

  // ── reading state ─────────────────────────────────────────────────────────

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Called with the new document whenever someone else's change (or a restore) lands. */
  onRemote(fn: (doc: T) => void): () => void {
    this.remoteListeners.add(fn);
    return () => this.remoteListeners.delete(fn);
  }

  getSnapshot(): SessionSnapshot<T> {
    if (this.snapshotCache) return this.snapshotCache;
    const now = Date.now();
    this.snapshotCache = {
      doc: this.view,
      connection: this.connection,
      mode: this.mode,
      pending: this.outbox.reduce((n, b) => n + b.ops.length, 0) + this.pendingOps.length,
      draftCount: this.draft.length,
      presence: [...this.presence.values()].filter((p) => now - p.at < PRESENCE_STALE_MS && p.key !== this.myPresence.key),
      notices: this.notices,
      activity: this.activity,
      lastSyncedAt: this.lastSyncedAt,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
    return this.snapshotCache;
  }

  get me() {
    return this.myPresence;
  }

  describe(path: Path): string {
    return describePath(this.view, path, this.labeler);
  }

  private changed() {
    this.snapshotCache = null;
    this.listeners.forEach((l) => l());
  }

  private emitRemote() {
    const d = this.mutable ? structuredClone(this.view) : this.view;
    this.remoteListeners.forEach((l) => l(d));
  }

  private setConnection(c: Connection) {
    if (this.connection === c) return;
    this.connection = c;
    this.changed();
  }

  private recomputeView() {
    this.view = this.draft.length ? overlay(this.shared, this.draft) : this.shared.doc;
  }

  // ── local edits ───────────────────────────────────────────────────────────

  /** Hand the app's latest document here after every edit (cheap when nothing changed). */
  local(next: T) {
    if (this.disposed || next === this.view) return;
    if (!canEdit(this.project, this.uid)) return; // viewers and commenters don't write
    const incoming = this.mutable ? structuredClone(next) : next;
    if (this.mode === 'draft') {
      const ops = diff(this.view, incoming, this.shared.meta, () => tick(this.clock));
      if (!ops.length) return;
      if (!this.draftBase) this.draftBase = ops[0].s;
      this.draft = coalesce([...this.draft, ...ops]);
      this.recomputeView();
      this.schedulePersist();
      this.scheduleDraftSave();
      this.changed();
      return;
    }
    const ops = diff(this.shared.doc, incoming, this.shared.meta, () => tick(this.clock));
    if (!ops.length) return;
    this.applyLocal(ops, 'live');
  }

  private applyLocal(ops: Op[], mode: Batch['mode'], opts: { recordUndo?: boolean; label?: string } = {}) {
    const before = this.shared;
    const inverse = ops.map((o) => inverseOf(o, before)).filter(Boolean) as Op[];
    this.shared = applyOps(this.shared, ops).state;
    this.recomputeView();
    const now = Date.now();
    for (const o of ops) this.recentWrites.set(pathKey(o.p), { at: now, v: getIn(this.shared.doc, o.p), s: o.s });
    if (opts.recordUndo !== false && mode !== 'undo') {
      // A burst of edits (typing, a drag) is one undo step.
      if (mode === 'live' && now - this.lastUndoAt < UNDO_GROUP_MS && this.undoStack.length) {
        this.undoStack[this.undoStack.length - 1] = [...inverse.reverse(), ...this.undoStack[this.undoStack.length - 1]];
      } else {
        this.undoStack.push(inverse.reverse());
        if (this.undoStack.length > 200) this.undoStack.shift();
      }
      this.lastUndoAt = now;
      this.redoStack = [];
    }
    this.pendingOps.push(...ops);
    this.opsSinceSnapshot += ops.length;
    this.contributorsSinceCheckpoint.add(this.uid);
    if (mode === 'live') this.scheduleBatch();
    else this.flushPending(mode, opts.label);
    this.schedulePersist();
    this.changed();
  }

  private scheduleBatch() {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushPending();
    }, OPS_BATCH_MS);
  }

  private flushPending(mode: Batch['mode'] = 'live', label?: string) {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (!this.pendingOps.length) return;
    const ops = coalesce(this.pendingOps);
    this.pendingOps = [];
    // Split very large edits (pasted images, imported pages) across batches.
    let cur: Op[] = [];
    let chars = 0;
    const push = () => {
      if (!cur.length) return;
      this.outbox.push({ id: `${this.site}_${(++this.seq).toString(36)}`, ops: cur, mode, ...(label ? { label } : {}) });
      cur = [];
      chars = 0;
    };
    for (const o of ops) {
      const n = JSON.stringify(o).length;
      if (chars + n > MAX_BATCH_CHARS) push();
      cur.push(o);
      chars += n;
    }
    push();
    this.schedulePersist();
    void this.drainOutbox();
  }

  private draining = false;
  private async drainOutbox() {
    if (this.draining || !this.bootstrapped || this.connection === 'offline' || !canEdit(this.project, this.uid)) return;
    this.draining = true;
    try {
      while (this.outbox.length && !this.disposed) {
        const b = this.outbox[0];
        if (this.inflight.has(b.id)) break;
        this.inflight.add(b.id);
        const json = JSON.stringify(b.ops);
        if (json.length > 1_000_000) {
          console.warn('[coedit] dropping an edit too large to share live; it is kept in your local copy', b.id);
          this.outbox.shift();
          continue;
        }
        try {
          await setDoc(doc(opsDb, COEDIT, this.id, 'ops', b.id), {
            u: this.uid,
            name: this.name,
            site: this.site,
            ops: json,
            n: b.ops.length,
            mode: b.mode,
            ...(b.label ? { label: b.label } : {}),
            at: serverTimestamp(),
          });
          this.sentIds.add(b.id);
          this.outbox.shift();
          this.lastSyncedAt = Date.now();
          this.schedulePersist();
          this.changed();
        } catch (err) {
          console.warn('[coedit] send failed; will retry', err);
          this.setConnection(navigator.onLine === false ? 'offline' : 'error');
          setTimeout(() => {
            if (this.connection === 'error') this.setConnection('live');
            void this.drainOutbox();
          }, 5000);
          break;
        } finally {
          this.inflight.delete(b.id);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  // ── remote edits ──────────────────────────────────────────────────────────

  private subscribeOps(sinceMs: number) {
    const q = query(
      collection(opsDb, COEDIT, this.id, 'ops'),
      where('at', '>', Timestamp.fromMillis(sinceMs)),
      orderBy('at')
    );
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const batches: Array<{ id: string; u: string; name: string; ops: Op[]; atMs: number; mode?: string }> = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue;
          const d = ch.doc.data();
          const atMs = d.at instanceof Timestamp ? d.at.toMillis() : Date.now();
          this.lastOpAtMs = Math.max(this.lastOpAtMs, atMs);
          if (this.sentIds.has(ch.doc.id) || ch.type === 'modified') continue;
          try {
            batches.push({ id: ch.doc.id, u: String(d.u), name: String(d.name ?? 'Someone'), ops: JSON.parse(String(d.ops)), atMs, mode: d.mode });
          } catch {
            /* malformed batch: ignore */
          }
        }
        if (batches.length) this.receive(batches);
        if (this.connection === 'error') this.setConnection('live');
      },
      (err) => {
        console.warn('[coedit] live stream stopped', err);
        this.setConnection(navigator.onLine === false ? 'offline' : 'error');
      }
    );
    this.unsubs.push(unsub);
  }

  private localSource: (() => T | null | undefined) | null = null;

  /** Lets the session read the app's latest document right before merging a remote edit, so a
   *  keystroke that hasn't reached local() yet is never overwritten. */
  setLocalSource(fn: (() => T | null | undefined) | null) {
    this.localSource = fn;
  }

  private receive(batches: Array<{ id: string; u: string; name: string; ops: Op[]; atMs: number; mode?: string }>) {
    // Anything typed but not yet handed over or batched goes first, so remote edits merge against it.
    const latest = this.localSource?.();
    if (latest) this.local(latest);
    this.flushPending();
    const now = Date.now();
    let changed = false;
    for (const b of batches) {
      for (const o of b.ops) observe(this.clock, o.s);
      const before = this.shared;
      const r = applyOps(this.shared, b.ops);
      this.shared = r.state;
      if (!r.applied.length) continue;
      changed = true;
      this.opsSinceSnapshot += b.ops.length;
      if (b.u !== this.uid) this.contributorsSinceCheckpoint.add(b.u);
      this.noticeConflicts(b, r.applied, r.events, before, now);
      if (b.u !== this.uid) this.logActivity(b.u, b.name, r.applied, before.doc, b.atMs);
    }
    if (!changed) return;
    this.lastSyncedAt = now;
    // Undo entries that touch paths someone else just rewrote would clobber them; drop those paths.
    this.recomputeView();
    this.schedulePersist();
    this.emitRemote();
    this.changed();
  }

  private noticeConflicts(b: { u: string; name: string; mode?: string }, applied: Op[], events: ApplyEvent[], before: CrdtState<T>, now: number) {
    if (b.u === this.uid) return;
    for (const o of applied) {
      const key = pathKey(o.p);
      const mine = this.recentWrites.get(key);
      if (!mine || now - mine.at > RECENT_WRITE_MS) continue;
      if (o.k === 'txt' && typeof getIn(this.shared.doc, o.p) === 'string' && String(getIn(this.shared.doc, o.p)).includes(String(mine.v ?? ''))) continue;
      this.recentWrites.delete(key);
      this.pushNotice({
        kind: 'overwritten',
        path: o.p,
        label: describePath(this.shared.doc, o.p, this.labeler),
        by: b.u,
        byName: b.name,
        mine: getIn(before.doc, o.p),
        text: `${b.name} changed ${describePath(this.shared.doc, o.p, this.labeler)} right after you.`,
      });
    }
    for (const e of events) {
      if (e.kind === 'resurrected' && stampSite(e.stamp) !== this.site) {
        this.pushNotice({
          kind: 'kept-deleted',
          path: e.path,
          label: describePath(this.shared.doc, e.path, this.labeler),
          by: b.u,
          byName: b.name,
          text: `${b.name} was still working on ${describePath(this.shared.doc, e.path, this.labeler)}, so it was kept.`,
        });
      }
      if (e.kind === 'text-overlap') {
        const mine = this.recentWrites.get(pathKey(e.path));
        if (!mine) continue;
        this.pushNotice({
          kind: 'text-overlap',
          path: e.path,
          label: describePath(this.shared.doc, e.path, this.labeler),
          by: b.u,
          byName: b.name,
          mine: mine.v,
          text: `You and ${b.name} rewrote the same words in ${describePath(this.shared.doc, e.path, this.labeler)}.`,
        });
      }
    }
  }

  private noteOfflineLost(lost: Op[]) {
    for (const o of lost.slice(0, 8)) {
      if (o.k !== 'set' && o.k !== 'txt') continue;
      const label = describePath(this.shared.doc, o.p, this.labeler);
      this.pushNotice({
        kind: 'offline-lost',
        path: o.p,
        label,
        mine: o.k === 'set' ? o.v : o.to,
        text: `While you were offline, someone changed ${label} after you. Their newer change is showing.`,
      });
    }
  }

  private pushNotice(n: Omit<Notice, 'id' | 'at'>) {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    this.notices = [{ ...n, id, at: Date.now() }, ...this.notices.filter((x) => x.label !== n.label || x.kind !== n.kind)].slice(0, 30);
  }

  dismissNotice(id: string) {
    this.notices = this.notices.filter((n) => n.id !== id);
    this.changed();
  }

  /** "Keep mine": writes your value back over theirs (as a new, newest edit). */
  keepMine(id: string) {
    const n = this.notices.find((x) => x.id === id);
    if (!n?.path) return;
    const op: Op = n.mine === undefined ? { k: 'del', p: n.path, s: tick(this.clock) } : { k: 'set', p: n.path, v: n.mine, s: tick(this.clock) };
    this.applyLocal([op], 'live');
    this.dismissNotice(id);
  }

  /** "Delete anyway" for something kept because someone was editing it. */
  deleteAnyway(id: string) {
    const n = this.notices.find((x) => x.id === id);
    if (!n?.path) return;
    const last = n.path[n.path.length - 1];
    const op: Op = last.startsWith('#')
      ? { k: 'rm', p: n.path.slice(0, -1), id: last.slice(1), s: tick(this.clock) }
      : { k: 'del', p: n.path, s: tick(this.clock) };
    this.applyLocal([op], 'live');
    this.dismissNotice(id);
  }

  private logActivity(uid: string, name: string, ops: Op[], before: unknown, atMs: number) {
    const groups = summarize(ops, this.shared.doc, before, this.labeler);
    const last = this.activity[0];
    // Fold a person's rapid edits to the same things into one line.
    if (last && last.uid === uid && atMs - last.at < 60_000 && groups.every((g) => last.groups.some((x) => x.key === g.key))) {
      this.activity = [{ ...last, at: atMs }, ...this.activity.slice(1)];
      return;
    }
    this.activity = [{ id: `${atMs}_${uid}`, at: atMs, uid, name, groups, summary: `${name} ${sentence(groups)}` }, ...this.activity].slice(0, 80);
    const p = this.presence.get([...this.presence.keys()].find((k) => k.startsWith(`${uid}_`)) ?? '');
    if (p) p.focus = groups[0]?.label;
  }

  // ── selective undo (only your own edits, never someone else's) ───────────

  undo() {
    this.lastUndoAt = 0;
    const inv = this.undoStack.pop();
    if (!inv?.length) return;
    const ops = restamp(inv, () => tick(this.clock));
    const before = this.shared;
    const redo = ops.map((o) => inverseOf(o, before)).filter(Boolean) as Op[];
    this.applyLocal(ops, 'undo');
    this.redoStack.push(redo.reverse());
    this.emitRemote();
  }

  redo() {
    const ops = this.redoStack.pop();
    if (!ops?.length) return;
    const stamped = restamp(ops, () => tick(this.clock));
    const before = this.shared;
    this.undoStack.push((stamped.map((o) => inverseOf(o, before)).filter(Boolean) as Op[]).reverse());
    this.applyLocal(stamped, 'undo');
    this.emitRemote();
  }

  // ── draft mode (your own version, published when you're ready) ───────────

  setMode(mode: WorkMode) {
    if (mode === this.mode) return;
    this.flushPending();
    this.mode = mode;
    this.myPresence.mode = mode;
    void this.beat();
    this.changed();
  }

  /** Places in your draft that someone else changed after you started it. */
  draftConflicts(): DraftConflict[] {
    if (!this.draft.length || !this.draftBase) return [];
    const out: DraftConflict[] = [];
    const seen = new Set<string>();
    for (const o of this.draft) {
      const key = pathKey(o.p);
      if (seen.has(key)) continue;
      seen.add(key);
      const st = this.shared.meta.stamps[key];
      if (!st || st < this.draftBase || stampSite(st) === this.site) continue;
      out.push({
        path: o.p,
        label: describePath(this.view, o.p, this.labeler),
        byName: this.nameForSite(stampSite(st)),
        theirs: getIn(this.shared.doc, o.p),
        mine: getIn(this.view, o.p),
      });
    }
    return out;
  }

  /** Publishes the draft. `keepTheirs` lists conflicting paths where the live value should win. */
  async publishDraft(keepTheirs: Path[] = [], label?: string) {
    if (!this.draft.length) return;
    const skip = new Set(keepTheirs.map(pathKey));
    const ops = restamp(
      this.draft.filter((o) => !skip.has(pathKey(o.p))),
      () => tick(this.clock)
    );
    await this.saveVersion('before-publish', `Before ${this.name}'s changes`).catch(() => {});
    this.draft = [];
    this.draftBase = undefined;
    this.mode = 'live';
    this.myPresence.mode = 'live';
    if (ops.length) this.applyLocal(ops, 'publish', { label });
    void this.clearCloudDraft();
    this.emitRemote();
    this.changed();
  }

  discardDraft() {
    this.draft = [];
    this.draftBase = undefined;
    this.recomputeView();
    this.schedulePersist();
    void this.clearCloudDraft();
    this.emitRemote();
    this.changed();
  }

  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleDraftSave() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => void this.saveCloudDraft(), 2500);
  }

  private async saveCloudDraft() {
    if (!this.bootstrapped || this.connection === 'offline') return;
    const json = JSON.stringify(this.draft);
    if (json.length > 900_000) return; // big drafts stay on this device until published
    await setDoc(doc(opsDb, COEDIT, this.id, 'drafts', this.uid), { ops: json, base: this.draftBase ?? '', updatedAt: Date.now(), site: this.site }).catch(() => {});
  }

  private async loadCloudDraft() {
    if (this.draft.length) return; // this device's draft wins
    const s = await getDoc(doc(opsDb, COEDIT, this.id, 'drafts', this.uid)).catch(() => null);
    if (!s?.exists()) return;
    try {
      const ops = JSON.parse(String(s.data().ops)) as Op[];
      if (!ops.length) return;
      this.draft = ops;
      this.draftBase = String(s.data().base || ops[0].s);
      this.mode = 'draft';
      this.myPresence.mode = 'draft';
      this.recomputeView();
      this.emitRemote();
      this.changed();
    } catch {
      /* ignore */
    }
  }

  private async clearCloudDraft() {
    await deleteDoc(doc(opsDb, COEDIT, this.id, 'drafts', this.uid)).catch(() => {});
  }

  // ── presence ──────────────────────────────────────────────────────────────

  private subscribePresence() {
    const unsub = onSnapshot(
      collection(opsDb, COEDIT, this.id, 'presence'),
      (snap) => {
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') this.presence.delete(ch.doc.id);
          else {
            const d = ch.doc.data() as Presence & { sel?: string[] | string };
            this.presence.set(ch.doc.id, { ...d, key: ch.doc.id });
          }
        }
        this.changed();
      },
      () => {}
    );
    this.unsubs.push(unsub);
  }

  private async beat() {
    if (!this.bootstrapped || this.connection === 'offline' || this.disposed) return;
    this.myPresence.at = Date.now();
    const { key: _k, ...rest } = this.myPresence;
    await setDoc(doc(opsDb, COEDIT, this.id, 'presence', this.myPresence.key), JSON.parse(JSON.stringify(rest))).catch(() => {});
  }

  /** Share what you have selected (ids) and, optionally, where your pointer is. */
  setSelection(sel: string[], focus?: string) {
    if (deepEqual(sel, this.myPresence.sel ?? []) && focus === this.myPresence.focus) return;
    this.myPresence.sel = sel.slice(0, 50);
    if (focus !== undefined) this.myPresence.focus = focus;
    this.scheduleCursor();
  }

  setCursor(cur: Presence['cur']) {
    this.myPresence.cur = cur;
    this.scheduleCursor();
  }

  private scheduleCursor() {
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      void this.beat();
    }, CURSOR_MS);
  }

  private nameForSite(site: string): string {
    for (const p of this.presence.values()) if (p.site === site) return p.name;
    for (const [uid, name] of Object.entries(this.project.names ?? {})) if (site.startsWith(uid.slice(0, 8))) return name;
    return 'Someone';
  }

  // ── compaction + checkpoints ──────────────────────────────────────────────

  /** One present editor (lowest key) is the scribe: it compacts the log and takes checkpoints. */
  private isScribe(): boolean {
    if (!canEdit(this.project, this.uid)) return false;
    const now = Date.now();
    const keys = [...this.presence.values()]
      .filter((p) => now - p.at < PRESENCE_STALE_MS && canEdit(this.project, p.uid))
      .map((p) => p.key);
    keys.push(this.myPresence.key);
    return keys.sort()[0] === this.myPresence.key;
  }

  private compacting = false;
  private async maybeCompact() {
    if (this.compacting || !this.bootstrapped || this.connection !== 'live' || !this.isScribe()) return;
    const idle = Date.now() - this.lastSnapshotAt > SNAPSHOT_IDLE_MS;
    if (this.opsSinceSnapshot < SNAPSHOT_EVERY_OPS && !(idle && this.opsSinceSnapshot > 0)) return;
    this.compacting = true;
    try {
      await this.writeSnapshot(this.lastOpAtMs);
      if (Date.now() - this.lastCheckpointAt > CHECKPOINT_MS && this.contributorsSinceCheckpoint.size) {
        await this.saveVersion('checkpoint');
        this.lastCheckpointAt = Date.now();
        await setDoc(doc(opsDb, COEDIT, this.id, 'snap', 'head'), { checkpointAt: this.lastCheckpointAt }, { merge: true }).catch(() => {});
        void this.pruneCheckpoints();
      }
      void this.trimLog(this.lastOpAtMs - LOG_KEEP_MS);
    } catch (err) {
      console.warn('[coedit] compaction failed', err);
    } finally {
      this.compacting = false;
    }
  }

  private async writeSnapshot(uptoMs: number) {
    const gen = `${Date.now().toString(36)}${this.site.slice(-4)}`;
    const json = JSON.stringify(this.shared);
    const { chunks, size } = await writeChunks(this.id, `snap_${gen}`, json);
    const prev = { gen: this.headGen, chunks: this.headChunks };
    await runTransaction(opsDb, async (tx) => {
      const ref = doc(opsDb, COEDIT, this.id, 'snap', 'head');
      const cur = await tx.get(ref);
      tx.set(ref, {
        gen,
        chunks,
        size,
        uptoMs,
        by: this.uid,
        at: Date.now(),
        ...(cur.exists() && cur.data().checkpointAt ? { checkpointAt: cur.data().checkpointAt } : {}),
      });
      if (cur.exists() && cur.data().gen !== prev.gen) {
        prev.gen = cur.data().gen;
        prev.chunks = cur.data().chunks;
      }
    });
    this.headGen = gen;
    this.headChunks = chunks;
    this.opsSinceSnapshot = 0;
    this.lastSnapshotAt = Date.now();
    if (prev.gen) {
      // Give readers that just fetched the old pointer a moment to finish.
      setTimeout(() => void deleteChunks(this.id, `snap_${prev.gen}`, prev.chunks), 60_000);
    }
  }

  private async trimLog(beforeMs: number) {
    if (beforeMs <= 0) return;
    const old = await getDocs(query(collection(opsDb, COEDIT, this.id, 'ops'), where('at', '<', Timestamp.fromMillis(beforeMs)), limit(300))).catch(() => null);
    if (!old || old.empty) return;
    const b = writeBatch(opsDb);
    old.docs.forEach((d) => b.delete(d.ref));
    await b.commit().catch(() => {});
  }

  // ── history ───────────────────────────────────────────────────────────────

  /** Shared history plus your own private saves (two queries: rules aren't filters). */
  async listVersions(): Promise<VersionMeta[]> {
    const col = collection(opsDb, COEDIT, this.id, 'versions');
    const [shared, mine] = await Promise.all([
      getDocs(query(col, where('private', '==', false), limit(300))),
      getDocs(query(col, where('by', '==', this.uid), where('private', '==', true), limit(100))).catch(() => null),
    ]);
    const all = [...shared.docs, ...(mine?.docs ?? [])].map((d) => ({ id: d.id, ...(d.data() as Omit<VersionMeta, 'id'>) }));
    return all.sort((a, b) => b.at - a.at);
  }

  /** Saves the current shared document (or, for 'personal', what YOU see, draft included). */
  async saveVersion(reason: VersionMeta['reason'], label?: string): Promise<VersionMeta> {
    this.flushPending();
    const vid = `${Date.now().toString(36)}_${this.site.slice(-5)}`;
    const docToSave = reason === 'personal' ? this.view : this.shared.doc;
    const { chunks, size } = await writeChunks(this.id, `ver_${vid}`, JSON.stringify(docToSave));
    const v: Omit<VersionMeta, 'id'> = {
      reason,
      at: Date.now(),
      by: this.uid,
      byName: this.name,
      chunks,
      size,
      ...(label ? { label } : {}),
      private: reason === 'personal',
      pinned: reason !== 'checkpoint',
      contributors: [...this.contributorsSinceCheckpoint],
      summary: this.activity
        .slice(0, 3)
        .map((a) => a.summary)
        .join(' · ')
        .slice(0, 300),
    };
    await setDoc(doc(opsDb, COEDIT, this.id, 'versions', vid), v);
    if (reason === 'checkpoint') this.contributorsSinceCheckpoint.clear();
    return { id: vid, ...v };
  }

  // ── lines: the session version and each person's own version ──────────────
  //
  // The shared document is the "session" line. Anyone can save where they are (draft included) as
  // their own line — "Ana's version" — which everyone on the project can see and open. From there:
  // make it the session version for everyone, or go back to yours privately (as a draft on top of the
  // live session, so the session keeps moving underneath and nothing is lost either way).

  /** Saves what you see now as your line's newest version. */
  async saveMyLine(label?: string): Promise<VersionMeta> {
    this.flushPending();
    const vid = `${Date.now().toString(36)}_${this.site.slice(-5)}`;
    const { chunks, size } = await writeChunks(this.id, `ver_${vid}`, JSON.stringify(this.view));
    const editor = canEdit(this.project, this.uid);
    const v: Omit<VersionMeta, 'id'> = {
      reason: 'line',
      line: this.uid,
      label: label?.trim() || `${this.name.split(' ')[0]}'s version`,
      at: Date.now(),
      by: this.uid,
      byName: this.name,
      chunks,
      size,
      private: !editor, // viewers/commenters keep theirs to themselves
      pinned: true,
    };
    await setDoc(doc(opsDb, COEDIT, this.id, 'versions', vid), v);
    return { id: vid, ...v };
  }

  /** The session line plus the newest saved version of each person's line. */
  async listLines(): Promise<Array<{ id: string; label: string; byName?: string; at: number; version?: VersionMeta; mine: boolean }>> {
    const versions = await this.listVersions();
    const newest = new Map<string, VersionMeta>();
    for (const v of versions) if (v.reason === 'line' && v.line && !newest.has(v.line)) newest.set(v.line, v);
    return [
      { id: 'session', label: 'Session version', at: this.lastSyncedAt ?? Date.now(), mine: false },
      ...[...newest.entries()].map(([uid, v]) => ({ id: uid, label: v.label || `${v.byName}'s version`, byName: v.byName, at: v.at, version: v, mine: uid === this.uid })),
    ];
  }

  /** Shows a saved version as your private draft over the live session ("go back to mine"). */
  async openAsMine(v: VersionMeta) {
    const mine = await this.loadVersion(v);
    const ops = opsToReach(this.shared.doc, mine, this.shared.meta, () => tick(this.clock));
    this.draft = coalesce(ops);
    this.draftBase = ops[0]?.s;
    this.mode = 'draft';
    this.myPresence.mode = 'draft';
    this.recomputeView();
    this.schedulePersist();
    this.scheduleDraftSave();
    this.emitRemote();
    this.changed();
  }

  /** Follow the session again: keep a copy of your line, then drop your private differences. */
  async adoptSession() {
    if (this.draft.length) await this.saveMyLine().catch(() => {});
    this.discardDraft();
    this.setMode('live');
  }

  /** Makes a line's version the session version for everyone (the session is saved first). */
  async promoteLine(v: VersionMeta) {
    await this.restore(v);
  }

  async renameVersion(v: VersionMeta, label: string) {
    await setDoc(doc(opsDb, COEDIT, this.id, 'versions', v.id), { label: label.trim(), pinned: true }, { merge: true });
  }

  async deleteVersion(v: VersionMeta) {
    await deleteDoc(doc(opsDb, COEDIT, this.id, 'versions', v.id));
    await deleteChunks(this.id, `ver_${v.id}`, v.chunks);
  }

  async loadVersion(v: VersionMeta): Promise<T> {
    return JSON.parse(await readChunks(this.id, `ver_${v.id}`, v.chunks)) as T;
  }

  /** What restoring `old` would change, grouped by element — for a partial restore picker. */
  compare(old: T): ChangeGroup[] {
    const ops = opsToReach(this.shared.doc, old, this.shared.meta, () => '');
    return summarize(ops, old, this.shared.doc, this.labeler);
  }

  /**
   * Restores a version for everyone — the whole thing, or only the chosen parts (`targets` from
   * compare()). The current state is saved first, so a restore is always undoable.
   */
  async restore(v: VersionMeta, targets?: Path[]) {
    const old = await this.loadVersion(v);
    await this.saveVersion('before-restore', `Before restoring ${v.label || new Date(v.at).toLocaleString()}`);
    const stamp = () => tick(this.clock);
    let ops: Op[];
    if (!targets) ops = opsToReach(this.shared.doc, old, this.shared.meta, stamp);
    else {
      ops = [];
      for (const t of targets) {
        const last = t[t.length - 1];
        const inOld = getIn(old, t);
        const inCur = getIn(this.shared.doc, t);
        if (last?.startsWith('#') && inCur === undefined && inOld !== undefined) {
          // bring a deleted element back where it was
          const listPath = t.slice(0, -1);
          const oldList = (getIn(old, listPath) as unknown[]) ?? [];
          const idx = oldList.findIndex((e) => idOf(e) === last.slice(1));
          const curList = (getIn(this.shared.doc, listPath) as unknown[]) ?? [];
          const merged = [...curList];
          const after = idx > 0 ? idOf(oldList[idx - 1]) : null;
          const at = after ? merged.findIndex((e) => idOf(e) === after) + 1 : 0;
          merged.splice(at, 0, oldList[idx]);
          ops.push(...diff(curList, merged, this.shared.meta, stamp, listPath));
        } else if (last?.startsWith('#') && inOld === undefined) {
          ops.push({ k: 'rm', p: t.slice(0, -1), id: last.slice(1), s: stamp() });
        } else {
          ops.push(...opsToReach(this.shared.doc, old, this.shared.meta, stamp, t));
        }
      }
    }
    if (!ops.length) return;
    this.applyLocal(ops, 'restore', { label: v.label || 'Restored version' });
    this.emitRemote();
  }

  private async pruneCheckpoints() {
    const all = await this.listVersions().catch(() => [] as VersionMeta[]);
    const stubs: VersionStub[] = all
      .filter((v) => !v.private)
      .map((v) => ({ id: v.id, createdAt: v.at, reason: v.reason === 'checkpoint' ? 'checkpoint' : 'named', pinned: v.pinned }));
    const doomed = new Set(versionsToPrune(stubs, Date.now()));
    for (const v of all) if (doomed.has(v.id)) await this.deleteVersion(v).catch(() => {});
  }

  // ── local persistence ─────────────────────────────────────────────────────

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 400);
  }

  private async persistNow() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const cache: LocalCache<T> = {
      v: 1,
      state: this.shared,
      outbox: this.outbox,
      draft: this.draft,
      draftBase: this.draftBase,
      wall: this.clock.wall,
      counter: this.clock.counter,
      seq: this.seq,
      savedAt: Date.now(),
    };
    await idbSet(cacheKey(this.id), cache).catch((e) => console.warn('[coedit] local save failed', e));
  }

  /** Forget this device's copy (after leaving a project). */
  static async forgetLocal(projectId: string) {
    await idbDel(cacheKey(projectId)).catch(() => {});
  }
}

/**
 * The current shared document, read once (opening a project someone shared with you on a device
 * that has no copy yet). Falls back to this device's cached copy when offline.
 */
export async function loadSharedDoc<T>(projectId: string): Promise<T | null> {
  try {
    const head = await getDoc(doc(opsDb, COEDIT, projectId, 'snap', 'head'));
    if (!head.exists()) throw new Error('no snapshot yet');
    const h = head.data() as { gen: string; chunks: number; uptoMs: number };
    let state = JSON.parse(await readChunks(projectId, `snap_${h.gen}`, h.chunks)) as CrdtState<T>;
    const since = Math.max(0, (h.uptoMs ?? 0) - LOG_REPLAY_MARGIN_MS);
    const ops = await getDocs(query(collection(opsDb, COEDIT, projectId, 'ops'), where('at', '>', Timestamp.fromMillis(since)), orderBy('at')));
    for (const d of ops.docs) {
      try {
        state = applyOps(state, JSON.parse(String(d.data().ops)) as Op[]).state;
      } catch {
        /* skip malformed */
      }
    }
    return state.doc;
  } catch {
    const cached = await idbGet<LocalCache<T>>(cacheKey(projectId)).catch(() => undefined);
    return cached?.v === 1 ? (cached.draft?.length ? overlay(cached.state, cached.draft) : cached.state.doc) : null;
  }
}

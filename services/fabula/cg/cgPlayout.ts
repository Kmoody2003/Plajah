// cgPlayout — the live CG playout engine (the "character generator" brain).
//
// Broadcast CG model: a stack of keyed SLOTS (lower third, ticker, bug, full
// page, stinger). A rundown of prepared items feeds a PREVIEW; TAKE puts the
// preview on air in its slot (whatever was there animates out at the same time),
// OUT plays the exit, NEXT advances the rundown cursor. Fields can be updated
// while on air (score changes, ticker items) without re-taking.
//
// Time is wall-clock milliseconds (Date.now()) so every same-origin window —
// the Fabula Graphics workspace, the TV Studio switcher, the Stage outputs, a
// standalone key/fill output — renders identical frames from the same state.
// State is plain JSON and mirrored over a BroadcastChannel (CgBus).
import { findCgGraphic } from './cgLibrary';
import { cgDefaultDuration } from './cgEvaluate';
import type { CgCategory, CgGraphic, CgGraphicRef } from './cgTypes';

export type CgSlotId = 'L1' | 'L2' | 'TICKER' | 'BUG' | 'FULL' | 'STINGER';
export const CG_SLOTS: { id: CgSlotId; label: string; z: number; hint: string }[] = [
  { id: 'L1', label: 'Lower Third', z: 10, hint: 'Supers, quotes, callouts, polls' },
  { id: 'L2', label: 'Lower Third 2', z: 11, hint: 'A second simultaneous super' },
  { id: 'TICKER', label: 'Ticker', z: 12, hint: 'Crawls' },
  { id: 'BUG', label: 'Bug / Score / Clock', z: 13, hint: 'Persistent corner graphics' },
  { id: 'FULL', label: 'Full Frame', z: 20, hint: 'Full pages, openers, end cards' },
  { id: 'STINGER', label: 'Stinger', z: 30, hint: 'Transitions over a cut' },
];
const SLOT_Z: Record<CgSlotId, number> = Object.fromEntries(CG_SLOTS.map(s => [s.id, s.z])) as Record<CgSlotId, number>;

export function defaultSlotFor(g: Pick<CgGraphic, 'category' | 'coverage' | 'live'>): CgSlotId {
  if (g.live === 'transition' || g.category === 'transition') return 'STINGER';
  const c: CgCategory = g.category;
  if (c === 'ticker') return 'TICKER';
  if (c === 'bug' || c === 'clock' || c === 'scoreboard') return 'BUG';
  if (g.coverage === 'full') return 'FULL';
  return 'L1';
}

export interface CgRundownItem { uid: string; ref: CgGraphicRef; label: string; slot?: CgSlotId; notes?: string }
export interface CgOnAir {
  uid: string; ref: CgGraphicRef; slot: CgSlotId; label: string;
  /** ms epoch the IN started. */
  takenAt: number;
  /** ms epoch the OUT starts (null = holding). */
  outAt: number | null;
  /** seconds of OUT animation (from the graphic timing). */
  outDur: number;
}
export interface CgPlayoutState {
  rundown: CgRundownItem[];
  cursor: number;            // index of the item in preview
  onAir: CgOnAir[];          // includes items animating out
  /** Program output resolution for keyed outputs. */
  format: { w: number; h: number };
  rev: number;
}

export const emptyPlayoutState = (): CgPlayoutState => ({ rundown: [], cursor: 0, onAir: [], format: { w: 1920, h: 1080 }, rev: 0 });

const uid = () => Math.random().toString(36).slice(2, 10);

export interface CgDrawItem { graphic: CgGraphic; ref: CgGraphicRef; t: number; D: number; z: number; uid: string; slot: CgSlotId }

/** Seconds-on-air → evaluator args. Pure — used by every output. */
export function drawListAt(state: CgPlayoutState, now: number): CgDrawItem[] {
  const out: CgDrawItem[] = [];
  for (const a of state.onAir) {
    const g = findCgGraphic(a.ref); if (!g) continue;
    const t = (now - a.takenAt) / 1000;
    if (t < 0) continue;
    const D = a.outAt == null ? Infinity : (a.outAt - a.takenAt) / 1000 + a.outDur;
    if (t >= D) continue;
    out.push({ graphic: g, ref: a.ref, t, D, z: SLOT_Z[a.slot] ?? 10, uid: a.uid, slot: a.slot });
  }
  return out.sort((x, y) => x.z - y.z);
}

type Listener = (s: CgPlayoutState) => void;

export interface CgTakeResult { uid: string; slot: CgSlotId; graphic: CgGraphic; cutAt?: number }

export class CgPlayout {
  state: CgPlayoutState;
  private listeners = new Set<Listener>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private cutListeners = new Set<(info: { uid: string; graphic: CgGraphic }) => void>();
  private clock: () => number;
  constructor(initial?: CgPlayoutState, clock: () => number = () => Date.now()) {
    this.clock = clock;
    this.state = initial ? { ...initial } : emptyPlayoutState();
  }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  /** Fires when a transition graphic reaches its cut point (switchers cut PGM here). */
  onCut(fn: (info: { uid: string; graphic: CgGraphic }) => void) { this.cutListeners.add(fn); return () => { this.cutListeners.delete(fn); }; }

  private commit(next: Partial<CgPlayoutState>) {
    this.state = { ...this.state, ...next, rev: this.state.rev + 1 };
    this.listeners.forEach(fn => fn(this.state));
  }
  /** Replace state wholesale (bus mirror). */
  replace(s: CgPlayoutState) { this.state = s; this.listeners.forEach(fn => fn(this.state)); }

  // ── rundown ──
  addToRundown(ref: CgGraphicRef, label?: string, slot?: CgSlotId, at?: number): CgRundownItem {
    const g = findCgGraphic(ref);
    const item: CgRundownItem = { uid: uid(), ref, label: label || g?.name || ref.graphicId, slot };
    const list = [...this.state.rundown];
    list.splice(at == null ? list.length : Math.max(0, Math.min(list.length, at)), 0, item);
    this.commit({ rundown: list });
    return item;
  }
  updateRundownItem(itemUid: string, patch: Partial<CgRundownItem>) {
    this.commit({ rundown: this.state.rundown.map(r => r.uid === itemUid ? { ...r, ...patch, ref: patch.ref ? { ...r.ref, ...patch.ref } : r.ref } : r) });
  }
  removeFromRundown(itemUid: string) {
    const idx = this.state.rundown.findIndex(r => r.uid === itemUid);
    const list = this.state.rundown.filter(r => r.uid !== itemUid);
    this.commit({ rundown: list, cursor: Math.min(idx < this.state.cursor ? this.state.cursor - 1 : this.state.cursor, Math.max(0, list.length - 1)) });
  }
  moveRundownItem(itemUid: string, to: number) {
    const list = [...this.state.rundown];
    const from = list.findIndex(r => r.uid === itemUid); if (from < 0) return;
    const [it] = list.splice(from, 1); list.splice(Math.max(0, Math.min(list.length, to)), 0, it);
    this.commit({ rundown: list });
  }
  cue(index: number) { this.commit({ cursor: Math.max(0, Math.min(index, this.state.rundown.length - 1)) }); }
  get preview(): CgRundownItem | undefined { return this.state.rundown[this.state.cursor]; }

  // ── on air ──
  private prune(now: number): CgOnAir[] {
    return this.state.onAir.filter(a => a.outAt == null || now < a.outAt + a.outDur * 1000 + 50);
  }

  /** Put a graphic on air. Returns null if the graphic can't be resolved. */
  take(ref: CgGraphicRef, opts: { slot?: CgSlotId; label?: string } = {}): CgTakeResult | null {
    const g = findCgGraphic(ref); if (!g) return null;
    const now = this.clock();
    const slot = opts.slot || defaultSlotFor(g);
    // Whatever holds this slot animates out now (overlapping with the new IN).
    let onAir = this.prune(now).map(a => (a.slot === slot && a.outAt == null ? { ...a, outAt: now } : a));
    const item: CgOnAir = { uid: uid(), ref, slot, label: opts.label || g.name, takenAt: now, outAt: null, outDur: g.timing.out };
    if (g.live === 'transition') item.outAt = now + (g.timing.cutPoint ?? g.timing.in) * 1000;
    else if (g.live === 'auto') item.outAt = now + (cgDefaultDuration(g) - g.timing.out) * 1000;
    onAir = [...onAir, item];
    this.commit({ onAir });
    const res: CgTakeResult = { uid: item.uid, slot, graphic: g };
    if (g.live === 'transition') {
      const cutMs = (g.timing.cutPoint ?? g.timing.in) * 1000;
      res.cutAt = now + cutMs;
      this.schedule(cutMs, () => this.cutListeners.forEach(fn => fn({ uid: item.uid, graphic: g })));
    }
    if (item.outAt != null) this.schedule(item.outAt - now + item.outDur * 1000 + 60, () => this.commit({ onAir: this.prune(this.clock()) }));
    return res;
  }

  /** TAKE the previewed rundown item and advance the cursor. */
  takePreview(): CgTakeResult | null {
    const it = this.preview; if (!it) return null;
    const r = this.take(it.ref, { slot: it.slot, label: it.label });
    if (r && this.state.cursor < this.state.rundown.length - 1) this.commit({ cursor: this.state.cursor + 1 });
    return r;
  }

  /** Play the OUT of a slot (or a specific on-air uid). */
  out(slotOrUid: CgSlotId | string) {
    const now = this.clock();
    let changed = false;
    const onAir = this.prune(now).map(a => {
      if ((a.slot === slotOrUid || a.uid === slotOrUid) && a.outAt == null) { changed = true; return { ...a, outAt: now }; }
      return a;
    });
    if (!changed) return;
    this.commit({ onAir });
    const longest = Math.max(0, ...onAir.filter(a => a.outAt === now).map(a => a.outDur));
    this.schedule(longest * 1000 + 60, () => this.commit({ onAir: this.prune(this.clock()) }));
  }
  /** Animate everything off. */
  outAll() { for (const s of CG_SLOTS) this.out(s.id); }
  /** Hard clear (panic): removes everything with no animation. */
  clear() { this.commit({ onAir: [] }); }

  /** Live field update on an on-air item (or every on-air item showing graphicId). */
  updateFields(target: string, fields: Record<string, string>) {
    this.commit({ onAir: this.state.onAir.map(a => (a.uid === target || a.slot === target || a.ref.graphicId === target) ? { ...a, ref: { ...a.ref, fields: { ...(a.ref.fields || {}), ...fields } } } : a) });
  }

  isOnAir(slot: CgSlotId): boolean { return this.state.onAir.some(a => a.slot === slot && a.outAt == null); }
  setFormat(w: number, h: number) { this.commit({ format: { w, h } }); }

  private schedule(ms: number, fn: () => void) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, Math.max(0, ms));
    this.timers.add(t);
  }
  dispose() { this.timers.forEach(clearTimeout); this.timers.clear(); this.listeners.clear(); this.cutListeners.clear(); }
}

// ── bus: one shared playout per origin, mirrored across windows ──────────────
const BUS = 'fabula-cg-v1';
type BusMsg = { type: 'STATE'; state: CgPlayoutState; from: string } | { type: 'HELLO'; from: string } | { type: 'CMD'; cmd: CgBusCommand; from: string };
export type CgBusCommand =
  | { op: 'take'; ref: CgGraphicRef; slot?: CgSlotId; label?: string }
  | { op: 'takePreview' } | { op: 'out'; target: string } | { op: 'outAll' } | { op: 'clear' }
  | { op: 'add'; ref: CgGraphicRef; label?: string; slot?: CgSlotId }
  | { op: 'fields'; target: string; fields: Record<string, string> };

let shared: CgPlayout | null = null;
let channel: BroadcastChannel | null = null;
let isMaster = false;
let masterSeen = false;
const selfId = uid();

/**
 * The origin-wide playout. The first window to call this with `master: true`
 * (the Fabula Graphics workspace or the switcher) owns the state; other windows
 * mirror it and send commands. Without BroadcastChannel (node, old browsers)
 * it is a plain local engine.
 */
export function sharedPlayout(opts: { master?: boolean } = {}): CgPlayout {
  if (!shared) {
    shared = new CgPlayout();
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(BUS);
      channel.onmessage = (e: MessageEvent<BusMsg>) => {
        const m = e.data; if (!m || m.from === selfId) return;
        if (m.type === 'STATE') { masterSeen = true; if (!isMaster) shared!.replace(m.state); }
        else if (m.type === 'HELLO' && isMaster) channel!.postMessage({ type: 'STATE', state: shared!.state, from: selfId } satisfies BusMsg);
        else if (m.type === 'CMD' && isMaster) runCommand(shared!, m.cmd);
      };
      shared.subscribe(s => { if (isMaster) channel?.postMessage({ type: 'STATE', state: s, from: selfId } satisfies BusMsg); });
      channel.postMessage({ type: 'HELLO', from: selfId } satisfies BusMsg);
    }
  }
  if (opts.master && !isMaster) { isMaster = true; channel?.postMessage({ type: 'STATE', state: shared.state, from: selfId } satisfies BusMsg); }
  return shared;
}

export function runCommand(p: CgPlayout, c: CgBusCommand) {
  switch (c.op) {
    case 'take': p.take(c.ref, { slot: c.slot, label: c.label }); break;
    case 'takePreview': p.takePreview(); break;
    case 'out': p.out(c.target); break;
    case 'outAll': p.outAll(); break;
    case 'clear': p.clear(); break;
    case 'add': p.addToRundown(c.ref, c.label, c.slot); break;
    case 'fields': p.updateFields(c.target, c.fields); break;
  }
}

/** Send a command to whichever window is master (or run it locally if this one is / none is). */
export function cgCommand(c: CgBusCommand) {
  let p = sharedPlayout();
  // Nobody has announced a master yet → this window takes the role.
  if (!isMaster && (!channel || !masterSeen)) p = sharedPlayout({ master: true });
  if (isMaster) runCommand(p, c);
  else channel.postMessage({ type: 'CMD', cmd: c, from: selfId } satisfies BusMsg);
}
export const isPlayoutMaster = () => isMaster;

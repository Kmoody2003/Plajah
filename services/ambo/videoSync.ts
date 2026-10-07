// videoSync — Ambo's single video clock (runtime half; the maths is in videoSyncMath.ts).
//
// ROLES (per window — each window has its own copy of this module)
//   studio window, audible renderer  -> MASTER: its <video> is the truth for 'program:<src>'.
//                                       Publishes a transport snapshot at 4 Hz and on every
//                                       play/pause/seek/rate/loop/volume event.
//   studio window, silent renderer   -> LOCAL (scope 'preview:<src>'): free-running, silent,
//                                       commandable by the transport bar, never published.
//   output window (setVideoSyncRole('follower')) -> FOLLOWER of 'program:<src>': seeks to the
//                                       predicted position, then nudges playbackRate / hard-seeks.
//   a 2nd audible renderer of the same clip in the studio (device monitors, multiview)
//                                    -> SHADOW: muted + unrouted follower, so the room never
//                                       hears the clip twice.
//
// Wire: BroadcastChannel 'ambo-video-sync-v1' {VSYNC | VHELLO | VCMD}.
import {
  applyCommand, driftDecision, predictedPosition, signedDrift, DEFAULT_DRIFT,
  type VideoCommand, type VideoTransport,
} from './videoSyncMath';
import { ClockEstimator, clockNow, setClockOffset } from './clockSync';

export const VIDEO_SYNC_CHANNEL = 'ambo-video-sync-v1';
export type VideoScope = 'program' | 'preview';
export const videoId = (scope: VideoScope, key: string) => `${scope}:${key}`;

/** 'operator' = a console window with no video elements: it sees Program video state and relays commands. */
export type VideoRole = 'studio' | 'follower' | 'operator';
let role: VideoRole = 'studio';
/** Output windows call this once, before any renderer is built. */
export function setVideoSyncRole(r: VideoRole) { role = r; if (r === 'follower' || r === 'operator') ensureChannel(); }
export const getVideoSyncRole = () => role;

type Wire =
  | { type: 'VSYNC'; at: number; items: VideoTransport[] }
  | { type: 'VHELLO' }
  | { type: 'VCMD'; id: string; cmd: VideoCommand }
  | { type: 'CPING'; from: string; t0: number }
  | { type: 'CPONG'; to: string; t0: number; t1: number; t2: number };

interface Reg { el: HTMLVideoElement; key: string; origMuted: boolean; origVolume: number }

const masters = new Map<string, Reg[]>();      // program:<key> -> [master, ...shadows]
const locals = new Map<string, Set<HTMLVideoElement>>();   // preview:<key>
const followers = new Map<string, Set<HTMLVideoElement>>(); // program:<key> (output windows)
const latest = new Map<string, { t: VideoTransport; rxAt: number }>();
const lastSent = new Map<string, VideoTransport>();
const lastSeek = new WeakMap<HTMLVideoElement, number>();
/** Measured seek-to-seeked latency per element (ms) — a seek must land where the clip WILL be, not where it was. */
const seekLatency = new WeakMap<HTMLVideoElement, number>();
const listeners = new Map<string, Set<(t: VideoTransport | null) => void>>();

let ch: BroadcastChannel | null = null;
let tick: ReturnType<typeof setInterval> | null = null;

/** The shared timebase (the master's clock). On one machine this is exactly Date.now(). */
const now = () => clockNow();
const num = (n: number, d = 0) => (Number.isFinite(n) ? n : d);

export function snapshot(el: HTMLVideoElement, key: string): VideoTransport {
  const live = !Number.isFinite(el.duration) && el.readyState >= 1; // HLS live etc.
  return {
    key,
    // Buffering counts as "not playing" so followers hold still instead of running ahead.
    playing: !el.paused && !el.ended && el.readyState >= 3,
    rate: num(el.playbackRate, 1) || 1,
    pos: num(el.currentTime),
    anchorMs: now(),
    loop: !!el.loop,
    duration: live ? 0 : num(el.duration),
    volume: num(el.volume, 1),
    muted: !!el.muted,
    ended: !!el.ended,
  };
}

function ensureChannel() {
  if (ch || typeof BroadcastChannel === 'undefined') return;
  try {
    ch = new BroadcastChannel(VIDEO_SYNC_CHANNEL);
    (ch as any).unref?.();   // node: never keep the process alive
    ch.addEventListener('message', (e: MessageEvent) => onWire(e.data as Wire));
    if (role === 'follower') { post({ type: 'VHELLO' }); startClockSync(); }
  } catch { ch = null; }
}
function post(m: Wire) { try { ch?.postMessage(m); } catch { /* */ } }

function onWire(m: Wire) {
  if (!m) return;
  if (m.type === 'VHELLO') { if (role === 'studio') publishAll(); return; }
  if (m.type === 'VCMD') { if (role === 'studio') command(m.id, m.cmd); return; }
  if (m.type === 'CPING') { if (role === 'studio') { const t1 = Date.now(); post({ type: 'CPONG', to: m.from, t0: m.t0, t1, t2: Date.now() }); } return; }
  if (m.type === 'CPONG') { if (m.to === clientId) onPong(m); return; }
  if (m.type === 'VSYNC' && role === 'operator') {
    // An operator console keeps the newest Program video state for display and relays commands.
    const rx = Date.now();
    for (const t of m.items) {
      latest.set(videoId('program', t.key), { t, rxAt: rx });
    }
    for (const cb of remoteListeners) { try { cb(); } catch { /* */ } }
    return;
  }
  if (m.type === 'VSYNC' && role === 'follower') {
    const rx = now();
    for (const t of m.items) {
      const id = videoId('program', t.key);
      latest.set(id, { t, rxAt: rx });
      const set = followers.get(id);
      if (set) for (const el of set) follow(el, t, id);
    }
  }
}

// ── clock sync (follower) ────────────────────────────────────────────────────

const clientId = Math.random().toString(36).slice(2, 10);
const estimator = new ClockEstimator();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function ping() { post({ type: 'CPING', from: clientId, t0: Date.now() }); }
function onPong(m: { t0: number; t1: number; t2: number }) {
  if (estimator.add({ t0: m.t0, t1: m.t1, t2: m.t2, t3: Date.now() })) setClockOffset(estimator.applied());
}
function startClockSync() {
  if (clockTimer) return;
  // A quick burst to converge, then a slow refresh (clocks drift).
  for (let i = 0; i < 5; i++) setTimeout(ping, i * 120);
  clockTimer = setInterval(ping, 15000);
  (clockTimer as any).unref?.();
}

// ── operator side: read-only view of Program video + command relay ───────────

const remoteListeners = new Set<() => void>();
export interface RemoteVideo { id: string; key: string; transport: VideoTransport; ageMs: number }
/** Program videos an operator console can see (state newer than 2 s). */
export function remoteVideos(): RemoteVideo[] {
  const t = Date.now(), out: RemoteVideo[] = [];
  for (const [id, v] of latest) if (id.startsWith('program:') && t - v.rxAt < 2000) out.push({ id, key: v.t.key, transport: v.t, ageMs: t - v.rxAt });
  return out;
}
export function subscribeRemoteVideos(cb: () => void): () => void {
  remoteListeners.add(cb);
  return () => { remoteListeners.delete(cb); };
}

// ── master side ──────────────────────────────────────────────────────────────

function publishAll() {
  const items: VideoTransport[] = [];
  for (const [id, regs] of masters) {
    const r = regs[0];
    if (!r) continue;
    const s = snapshot(r.el, r.key);
    lastSent.set(id, s);
    items.push(s);
    for (const cb of listeners.get(id) ?? []) cb(s);
    // Shadows ride the master.
    for (let i = 1; i < regs.length; i++) follow(regs[i].el, s, id);
  }
  if (items.length) post({ type: 'VSYNC', at: now(), items });
}

function startTick() {
  if (tick) return;
  tick = setInterval(() => {
    publishAll();
    for (const [id, set] of followers) { const l = latest.get(id); if (l) for (const el of set) follow(el, l.t, id); }
    for (const [id, set] of locals) {
      const el = set.values().next().value as HTMLVideoElement | undefined;
      if (el) for (const cb of listeners.get(id) ?? []) cb(snapshot(el, id.slice(id.indexOf(':') + 1)));
    }
  }, 250);
  (tick as any).unref?.();
}
function stopTickIfIdle() {
  if (tick && masters.size === 0 && followers.size === 0 && locals.size === 0) { clearInterval(tick); tick = null; }
}

const EVENTS = ['play', 'pause', 'seeked', 'ratechange', 'volumechange', 'loadedmetadata', 'durationchange', 'ended', 'waiting', 'playing'] as const;

export interface AttachOpts {
  key: string;
  /** True for the renderer that is audible (the studio Program monitor / audible slide host). */
  master: boolean;
}

/** Register a video element with the sync system. Returns detach(). */
export function attachVideo(el: HTMLVideoElement, o: AttachOpts): () => void {
  if (!o.key || typeof el?.addEventListener !== 'function') return () => {};
  ensureChannel();
  startTick();

  if (role === 'follower') {
    const id = videoId('program', o.key);
    follower(id).add(el);
    el.muted = true; el.volume = 0;
    const l = latest.get(id);
    const apply = () => { const x = latest.get(id); if (x) follow(el, x.t, id); };
    el.addEventListener('loadedmetadata', apply);
    el.addEventListener('canplay', apply);
    if (l) follow(el, l.t, id);
    post({ type: 'VHELLO' });
    return () => {
      el.removeEventListener('loadedmetadata', apply); el.removeEventListener('canplay', apply);
      followers.get(id)?.delete(el); if (!followers.get(id)?.size) followers.delete(id);
      stopTickIfIdle();
    };
  }

  if (!o.master) {
    const id = videoId('preview', o.key);
    let s = locals.get(id); if (!s) locals.set(id, s = new Set());
    s.add(el);
    return () => { s!.delete(el); if (!s!.size) locals.delete(id); stopTickIfIdle(); };
  }

  const id = videoId('program', o.key);
  let regs = masters.get(id); if (!regs) masters.set(id, regs = []);
  const reg: Reg = { el, key: o.key, origMuted: el.muted, origVolume: el.volume };
  const isShadow = regs.length > 0;
  regs.push(reg);
  if (isShadow) { el.muted = true; el.volume = 0; }
  const onEv = () => { if (masters.get(id)?.[0] === reg) publishAll(); };
  for (const ev of EVENTS) el.addEventListener(ev, onEv);
  publishAll();
  return () => {
    for (const ev of EVENTS) el.removeEventListener(ev, onEv);
    const list = masters.get(id);
    if (list) {
      const i = list.indexOf(reg);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) { masters.delete(id); lastSent.delete(id); for (const cb of listeners.get(id) ?? []) cb(null); }
      else if (i === 0) { const nx = list[0]; nx.el.muted = nx.origMuted; nx.el.volume = nx.origVolume; publishAll(); }
    }
    stopTickIfIdle();
  };
}
const follower = (id: string) => { let s = followers.get(id); if (!s) followers.set(id, s = new Set()); return s; };

/** True when an audible master already exists for this clip (the caller should not route its audio). */
export const hasMaster = (key: string) => (masters.get(videoId('program', key))?.length ?? 0) > 0;

// ── follower side ────────────────────────────────────────────────────────────

const STALE_MS = 2000;
const SEEK_COOLDOWN_MS = 500;
const LEAD_SEC = 0.05;
const MAX_LEAD_MS = 800;

function follow(el: HTMLVideoElement, t: VideoTransport, id: string) {
  try {
    const rx = latest.get(id)?.rxAt;
    // Authority gone quiet (closed / crashed): free-run rather than freeze on stale numbers.
    if (rx !== undefined && now() - rx > STALE_MS && role === 'follower') return;
    const n = now();
    const pred = predictedPosition(t, n);
    el.loop = t.loop;
    if (!t.playing || t.ended) {
      if (!el.paused) el.pause();
      if (el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - pred) > 0.04) el.currentTime = pred;
      return;
    }
    if (el.paused) void el.play().catch(() => { /* autoplay */ });
    if (el.readyState < 1 || el.seeking) return;
    const dur = Number.isFinite(el.duration) ? el.duration : t.duration;
    const d = signedDrift(el.currentTime, pred, t.loop, dur);
    const dec = driftDecision(d, pred, t.rate, DEFAULT_DRIFT);
    if (dec.action === 'seek') {
      const last = lastSeek.get(el) ?? 0;
      if (n - last < SEEK_COOLDOWN_MS) {
        // Just seeked: ride the max nudge while the decoder catches up.
        const r = t.rate * (1 + (d > 0 ? -DEFAULT_DRIFT.maxNudge : DEFAULT_DRIFT.maxNudge));
        if (Math.abs(el.playbackRate - r) > 0.001) el.playbackRate = r;
        return;
      }
      lastSeek.set(el, n);
      const lead = Math.min(MAX_LEAD_MS, Math.max(LEAD_SEC * 1000, seekLatency.get(el) ?? 0));
      el.currentTime = predictedPosition(t, n + lead);
      el.playbackRate = t.rate;
      el.addEventListener('seeked', () => {
        const took = now() - n;
        const prev = seekLatency.get(el);
        seekLatency.set(el, prev === undefined ? took : prev * 0.5 + took * 0.5);
      }, { once: true });
      return;
    }
    if (Math.abs(el.playbackRate - dec.rate) > 0.0005) el.playbackRate = dec.rate;
  } catch { /* element mid-teardown */ }
}

// ── commands / state for the UI ──────────────────────────────────────────────

export interface VideoInfo {
  transport: VideoTransport | null;
  controllable: boolean;
  /** Why it is not controllable (shown disabled in the bar). */
  reason?: string;
  /** Volume/mute only make sense on the audible program clip. */
  audioControllable: boolean;
}

function elementsFor(id: string): HTMLVideoElement[] {
  const m = masters.get(id);
  if (m?.length) return m.map(r => r.el);
  return [...(locals.get(id) ?? [])];
}

export function getInfo(id: string): VideoInfo {
  const els = elementsFor(id);
  const el = els[0];
  if (!el) return { transport: null, controllable: false, reason: 'No video element is playing in this window', audioControllable: false };
  const key = id.slice(id.indexOf(':') + 1);
  const transport = snapshot(el, key);
  const isLive = !Number.isFinite(el.duration) && el.readyState >= 1;
  const audible = id.startsWith('program:');
  if (isLive) return { transport, controllable: false, reason: 'Live stream: no timeline to seek (play/pause only)', audioControllable: audible };
  return { transport, controllable: true, audioControllable: audible };
}

export function subscribe(id: string, cb: (t: VideoTransport | null) => void): () => void {
  let s = listeners.get(id); if (!s) listeners.set(id, s = new Set());
  s.add(cb);
  startTick();
  return () => { s!.delete(cb); if (!s!.size) listeners.delete(id); stopTickIfIdle(); };
}

/** Route a command to the clip. In the studio this drives the element(s) directly; elsewhere it is relayed. */
export function command(id: string, cmd: VideoCommand): boolean {
  if (role !== 'studio') { ensureChannel(); post({ type: 'VCMD', id, cmd }); return true; }
  const els = elementsFor(id);
  if (!els.length) return false;
  const isProgram = id.startsWith('program:');
  const key = id.slice(id.indexOf(':') + 1);
  for (const el of els) {
    const cur = snapshot(el, key);
    const next = applyCommand({ ...cur, playing: !el.paused && !el.ended }, cmd, now());
    el.loop = next.loop;
    el.playbackRate = next.rate;
    if (isProgram && (cmd.type === 'volume' || cmd.type === 'mute')) {
      // Only the master is audible; shadows stay silent.
      if (els[0] === el) { el.volume = next.volume; el.muted = next.muted; const r = masters.get(id)?.[0]; if (r) { r.origVolume = next.volume; r.origMuted = next.muted; } }
    }
    if (cmd.type === 'seek' || cmd.type === 'skip' || cmd.type === 'restart' || cmd.type === 'play') {
      if (Math.abs(el.currentTime - next.pos) > 0.01) el.currentTime = next.pos;
    }
    if (cmd.type === 'play' || cmd.type === 'restart' || (cmd.type === 'toggle' && next.playing)) void el.play().catch(() => {});
    else if (cmd.type === 'pause' || (cmd.type === 'toggle' && !next.playing)) el.pause();
  }
  if (isProgram) publishAll();
  return true;
}

/** Test hook. */
export function _resetVideoSyncForTests() {
  masters.clear(); locals.clear(); followers.clear(); latest.clear(); lastSent.clear(); listeners.clear();
  if (tick) { clearInterval(tick); tick = null; }
  try { ch?.close(); } catch { /* */ }
  ch = null; role = 'studio';
  remoteListeners.clear(); estimator.reset(); setClockOffset(0);
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

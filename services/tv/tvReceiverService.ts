// tvReceiverService — makes a Plajah TV an OUTPUT / RECEIVER target.
//
// A TV signed in to an account registers itself in the same mesh Ambo's Party/Event mode already
// reads (`users/{uid}/event_devices/{deviceId}` — services/ambo/amboPartyEventService), so it shows
// up in Ambo Central Command's device list and in the switcher's "Send to TV" list, and can be
// handed a duty: Ambo program / stage / presentation, Chora playlist, Reello video, ambient
// signage, a switcher PROGRAM_FEED (Plajah live 'stage' stream), or a PARTY_DISPLAY.
//
// Cost on a 2 GB / Mali-G31 TV is kept small on purpose:
//   • one heartbeat write every 10 s (Ambo treats a device as stale after 25 s — the 4 s the
//     browser receiver uses is far more than needed), paused while the document is hidden;
//   • one snapshot listener on THIS device's doc (+ the account's party-event session doc only
//     while the device is slaved to master sync);
//   • subscribers are notified only when the receiver state actually changes, never per heartbeat.
//
// The last assigned duty is persisted in localStorage and replayed at boot BEFORE Firestore
// answers, so a signage TV that loses power comes back to its signage by itself (and keeps
// showing it if the network is slow to return).
//
// Pairing (cross-account or phone-to-TV): `tv_pairings/{CODE}` — the TV writes a short code doc
// with a TTL; anyone signed in who knows the code can claim it and push a duty into it; the TV
// applies the duty to its own device doc. Same-account controllers skip pairing entirely and
// assign duties straight onto event_devices (assignDeviceDuty).

import { auth, db } from '../backendService';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, getDocs, limit,
} from 'firebase/firestore';
import { onSnapshot } from '../safeSnapshot';
import { getPlatformInfo } from '../../hooks/usePlatform';
import {
  getOrCreateDeviceId, getFriendlyDeviceName, setCustomDeviceName, assignDeviceDuty,
  listenToEventDevices,
  type EventDeviceDuty, type PartyEventDevice, type PartyEventSession,
} from '../ambo/amboPartyEventService';

// ── Constants / storage keys ─────────────────────────────────────────────────

const HEARTBEAT_MS = 10_000;              // < amboPartyEventService DEVICE_STALE_TIMEOUT_MS (25 s)
const PAIR_TTL_MS = 10 * 60_000;          // a pairing code is claimable for 10 minutes
const PAIRINGS = 'tv_pairings';

const LS_AVAILABLE = 'plajah_tv_receiver_available';      // '0' = opted out (default ON)
const LS_LAST_DUTY = 'plajah_tv_receiver_last_duty';      // JSON EventDeviceDuty
const LS_DEVICE_TYPE = 'plajah_party_device_type';        // read by detectDeviceType()
const LS_NAME = 'plajah_party_device_name';               // shared with amboPartyEventService
const LS_PAIR_CODE = 'plajah_tv_pair_code';               // JSON { code, expiresAt }
const LS_PAIR_CLAIMED = 'plajah_tv_pair_claimed';         // code that a controller has claimed

export const STANDBY_DUTY: EventDeviceDuty = { dutyType: 'STANDBY', title: 'Standby', subtitle: 'Waiting for cues' };

/** Every duty a TV receiver can render (advertised on the device doc). */
export const TV_RECEIVER_CAPABILITIES: EventDeviceDuty['dutyType'][] = [
  'AMBO_PROGRAM', 'AMBO_STAGE', 'AMBO_PRESENTATION', 'CHORA_PLAYLIST', 'REELLO_VIDEO',
  'AMBIENT_SIGNAGE', 'PROGRAM_FEED', 'PARTY_DISPLAY', 'STANDBY',
];

// ── Small helpers ────────────────────────────────────────────────────────────

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* blocked */ } };

/** Firestore throws on `undefined` anywhere in a write — strip deeply. */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as any;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o: any = {};
    for (const [k, x] of Object.entries(v as any)) if (x !== undefined) o[k] = clean(x);
    return o;
  }
  return v;
}

const sameDuty = (a?: EventDeviceDuty | null, b?: EventDeviceDuty | null) => JSON.stringify(a || null) === JSON.stringify(b || null);

export function isTvReceiverPlatform(): boolean {
  try { return getPlatformInfo().isTV; } catch { return false; }
}

export function isAvailableAsDisplay(): boolean { return lsGet(LS_AVAILABLE) !== '0'; }

export function getTvDisplayName(): string {
  const saved = lsGet(LS_NAME);
  if (saved) return saved;
  return 'Living Room TV';
}

function readLastDuty(): EventDeviceDuty | null {
  try { const raw = lsGet(LS_LAST_DUTY); return raw ? JSON.parse(raw) as EventDeviceDuty : null; } catch { return null; }
}
function writeLastDuty(d: EventDeviceDuty | null) {
  lsSet(LS_LAST_DUTY, d && d.dutyType !== 'STANDBY' ? JSON.stringify(d) : null);
}

/** Human label for the "Receiving from …" badge. */
export function dutySourceLabel(d: EventDeviceDuty, sessionName?: string): string {
  if (d.sourceData?.sourceLabel) return d.sourceData.sourceLabel;
  switch (d.dutyType) {
    case 'AMBO_PROGRAM': case 'AMBO_STAGE': case 'AMBO_PRESENTATION': return sessionName || 'Ambo';
    case 'PROGRAM_FEED': return d.title || 'Video Switcher';
    case 'PARTY_DISPLAY': return d.title || 'Party';
    case 'CHORA_PLAYLIST': return d.title || 'Chora';
    case 'REELLO_VIDEO': return d.title || 'Reello';
    case 'AMBIENT_SIGNAGE': return d.title || 'Signage';
    default: return d.title || 'Plajah';
  }
}

// ── Receiver state store ─────────────────────────────────────────────────────

export interface TvReceiverState {
  /** Running on a TV and the store is started. */
  active: boolean;
  signedIn: boolean;
  available: boolean;
  uid: string | null;
  deviceId: string;
  deviceName: string;
  /** The duty to render right now (STANDBY = nothing takes over the screen). */
  duty: EventDeviceDuty;
  /** True while the duty came from the boot cache and Firestore has not confirmed it yet. */
  fromCache: boolean;
  isSlaved: boolean;
  /** Ambo master sync is engaged and this TV is slaved → the receiver follows the master. */
  followingMaster: boolean;
  sessionName?: string;
  /** Short label for the corner badge. */
  sourceLabel: string;
  /** The current pairing code, when one is live. */
  pairing: { code: string; expiresAt: number } | null;
  /** The code a controller has claimed (persisted until unpaired). */
  claimedCode: string | null;
}

type Listener = (s: TvReceiverState) => void;

const listeners = new Set<Listener>();
let state: TvReceiverState = initialState();
let refCount = 0;
let teardown: (() => void) | null = null;

function initialState(): TvReceiverState {
  const cached = readLastDuty();
  const available = isAvailableAsDisplay();
  const duty = available && cached ? cached : STANDBY_DUTY;
  return {
    active: false, signedIn: false, available,
    uid: null, deviceId: typeof window !== 'undefined' ? getOrCreateDeviceId() : 'server',
    deviceName: typeof window !== 'undefined' ? getTvDisplayName() : 'TV',
    duty, fromCache: !!(available && cached), isSlaved: false, followingMaster: false,
    sourceLabel: dutySourceLabel(duty), pairing: null, claimedCode: lsGet(LS_PAIR_CLAIMED),
  };
}

function emit(patch: Partial<TvReceiverState>) {
  const next = { ...state, ...patch };
  next.sourceLabel = next.followingMaster ? (next.sessionName || 'Ambo master') : dutySourceLabel(next.duty, next.sessionName);
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  listeners.forEach(l => { try { l(state); } catch { /* */ } });
}

export function getTvReceiverState(): TvReceiverState { return state; }

/** Subscribe to "my assigned duty / source". Starts the receiver on a TV; stops with the last subscriber. */
export function subscribeTvReceiver(cb: Listener): () => void {
  listeners.add(cb);
  cb(state);
  retain();
  return () => { listeners.delete(cb); release(); };
}

function retain() {
  refCount++;
  if (refCount === 1 && isTvReceiverPlatform()) teardown = start();
}
function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && teardown) { teardown(); teardown = null; }
}

// ── The engine: auth → registration + heartbeat + own-doc listener ───────────

function start(): () => void {
  lsSet(LS_DEVICE_TYPE, 'TV');   // so amboPartyEventService.registerEventDevice also says TV
  emit({ active: true });
  let stopUser: (() => void) | null = null;

  const unAuth = auth.onAuthStateChanged(user => {
    stopUser?.(); stopUser = null;
    if (user && !user.isAnonymous) {
      emit({ signedIn: true, uid: user.uid });
      if (state.available) stopUser = runForUser(user.uid);
    } else {
      emit({ signedIn: false, uid: null, isSlaved: false, followingMaster: false });
    }
  });

  return () => {
    unAuth();
    stopUser?.(); stopUser = null;
    emit({ active: false });
  };
}

let beatNow: (() => void) | null = null;

function runForUser(uid: string): () => void {
  const deviceId = state.deviceId;
  const ref = doc(db, 'users', uid, 'event_devices', deviceId);
  let disposed = false;
  let timer: number | null = null;
  let firstSnap = true;
  let sessionUnsub: (() => void) | null = null;
  let pairUnsubs: Array<() => void> = [];
  let session: PartyEventSession | null = null;
  let device: Partial<PartyEventDevice> | null = null;

  const beat = async () => {
    if (disposed || document.hidden) return;
    try {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round((window.screen?.width || window.innerWidth) * dpr);
      const h = Math.round((window.screen?.height || window.innerHeight) * dpr);
      await setDoc(ref, clean({
        deviceId, uid,
        deviceName: state.deviceName,
        deviceType: 'TV',
        receiverKind: 'tv',
        availableAsDisplay: true,
        capabilities: TV_RECEIVER_CAPABILITIES,
        screen: { width: w, height: h, dpr, aspectRatio: `${Math.round((w / (h || 1)) * 10) / 10}:1` },
        isOnline: true,
        lastSeen: Date.now(),
        userAgent: navigator.userAgent,
      }), { merge: true });
    } catch { /* offline / rules — next beat retries */ }
  };
  beatNow = () => { void beat(); };

  const startTimer = () => { if (timer == null) timer = window.setInterval(beat, HEARTBEAT_MS); };
  const stopTimer = () => { if (timer != null) { window.clearInterval(timer); timer = null; } };
  const onVis = () => {
    if (document.hidden) stopTimer();
    else { void beat(); startTimer(); }
  };
  document.addEventListener('visibilitychange', onVis);

  // First registration: a TV must never inherit amboPartyEventService's DEFAULT_DUTY (AMBO_PROGRAM)
  // or default to slaved — that would let any Ambo session hijack the living-room screen. Seed
  // STANDBY + unslaved unless the doc already carries an explicit duty, then replay the cached
  // duty if Firestore lost it (fresh doc after a wipe).
  (async () => {
    try {
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() as any : null;
      const seed: any = {};
      if (!data?.duty) seed.duty = clean(readLastDuty() || STANDBY_DUTY);
      if (typeof data?.isSlaved !== 'boolean') seed.isSlaved = false;
      if (Object.keys(seed).length) await setDoc(ref, seed, { merge: true });
    } catch { /* */ }
    if (!disposed) { await beat(); if (!document.hidden) startTimer(); }
  })();

  const recompute = () => {
    const isSlaved = device?.isSlaved === true;
    const followingMaster = !!(isSlaved && session?.isActive && session?.masterSyncEngaged);
    const duty = (device?.duty as EventDeviceDuty | undefined) || STANDBY_DUTY;
    emit({ duty, fromCache: false, isSlaved, followingMaster, sessionName: session?.isActive ? session.eventName : undefined });
  };

  const unDev = onSnapshot(ref, snap => {
    const data = snap.exists() ? (snap.data() as Partial<PartyEventDevice>) : null;
    const prevDuty = device?.duty;
    device = data;
    if (data?.duty && !sameDuty(prevDuty, data.duty as EventDeviceDuty)) writeLastDuty(data.duty as EventDeviceDuty);
    // Only follow the session doc while slaved — a free-running TV never pays for it.
    const wantSession = data?.isSlaved === true;
    if (wantSession && !sessionUnsub) {
      sessionUnsub = onSnapshot(doc(db, 'users', uid, 'ambo_party_event', 'session'),
        s => { session = s.exists() ? (s.data() as PartyEventSession) : null; recompute(); },
        () => { session = null; recompute(); });
    } else if (!wantSession && sessionUnsub) { sessionUnsub(); sessionUnsub = null; session = null; }
    // The very first snapshot may be the empty pre-seed read; keep the cached duty until a real one lands.
    if (firstSnap && !data?.duty && state.fromCache) { firstSnap = false; return; }
    firstSnap = false;
    recompute();
  }, () => { /* rules missing / offline: keep the cached duty on screen */ });

  // Pairing listeners: the live code (to show "claimed") and the persisted claimed code (duties from a controller).
  const watchPair = (code: string) => {
    const un = onSnapshot(doc(db, PAIRINGS, code), s => {
      if (!s.exists()) {
        if (state.claimedCode === code) { lsSet(LS_PAIR_CLAIMED, null); emit({ claimedCode: null }); }
        return;
      }
      const p = s.data() as TvPairing;
      if (p.uid !== uid || p.deviceId !== deviceId) return;
      if (p.claimedBy && state.claimedCode !== code) { lsSet(LS_PAIR_CLAIMED, code); emit({ claimedCode: code }); }
      // A controller pushed a duty → apply to our own device doc (the doc is the single source of truth).
      if (p.duty && p.dutySeq && p.dutySeq !== lastAppliedSeq(code)) {
        setLastAppliedSeq(code, p.dutySeq);
        void applyOwnDuty(uid, deviceId, p.duty as EventDeviceDuty);
      }
    }, () => { /* */ });
    pairUnsubs.push(un);
  };
  const watched = new Set<string>();
  const syncPairWatch = () => {
    const codes = [state.pairing?.code, state.claimedCode].filter(Boolean) as string[];
    for (const c of codes) if (!watched.has(c)) { watched.add(c); watchPair(c); }
  };
  syncPairWatch();
  const pairListener: Listener = () => syncPairWatch();
  listeners.add(pairListener);

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stopTimer();
    document.removeEventListener('visibilitychange', onVis);
    unDev();
    sessionUnsub?.(); sessionUnsub = null;
    pairUnsubs.forEach(u => u()); pairUnsubs = [];
    listeners.delete(pairListener);
    beatNow = null;
  }
  return cleanup;
}

const appliedSeqs: Record<string, number> = {};
const lastAppliedSeq = (code: string) => appliedSeqs[code] ?? Number(lsGet(`plajah_tv_pair_seq_${code}`) || 0);
const setLastAppliedSeq = (code: string, n: number) => { appliedSeqs[code] = n; lsSet(`plajah_tv_pair_seq_${code}`, String(n)); };

async function applyOwnDuty(uid: string, deviceId: string, duty: EventDeviceDuty) {
  try { await setDoc(doc(db, 'users', uid, 'event_devices', deviceId), { duty: clean(duty) }, { merge: true }); } catch { /* */ }
}

// ── Local controls (TV side) ─────────────────────────────────────────────────

/** Remote Back → "Stop receiving": release this TV to STANDBY (local + its own device doc). */
export async function releaseTvDuty(): Promise<void> {
  writeLastDuty(null);
  emit({ duty: STANDBY_DUTY, fromCache: false });
  const uid = state.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid, 'event_devices', state.deviceId), { duty: clean(STANDBY_DUTY), isSlaved: false }, { merge: true });
  } catch { /* */ }
  beatNow?.();
}

/** The TV assigns itself a duty (e.g. joining a party or an Ambo session from TvReceiverPanel). */
export async function setOwnTvDuty(duty: EventDeviceDuty, opts: { slaved?: boolean } = {}): Promise<void> {
  writeLastDuty(duty);
  emit({ duty, fromCache: false });
  const uid = state.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid, 'event_devices', state.deviceId),
      clean({ duty, ...(typeof opts.slaved === 'boolean' ? { isSlaved: opts.slaved } : {}) }), { merge: true });
  } catch { /* */ }
}

export function renameTvDisplay(name: string): void {
  const n = name.trim().slice(0, 40);
  if (!n) return;
  setCustomDeviceName(n);
  emit({ deviceName: n });
  beatNow?.();
}

export async function setAvailableAsDisplay(on: boolean): Promise<void> {
  lsSet(LS_AVAILABLE, on ? '1' : '0');
  const uid = state.uid;
  if (!on) {
    writeLastDuty(null);
    // Restart the engine: with availability off, start() registers no user loop / heartbeat.
    if (teardown) { teardown(); teardown = null; }
    emit({ available: false, duty: STANDBY_DUTY, fromCache: false, followingMaster: false });
    if (uid) {
      try {
        await setDoc(doc(db, 'users', uid, 'event_devices', state.deviceId),
          { isOnline: false, availableAsDisplay: false, duty: clean(STANDBY_DUTY), lastSeen: Date.now() }, { merge: true });
      } catch { /* */ }
    }
    if (refCount > 0 && isTvReceiverPlatform()) teardown = start();
  } else {
    emit({ available: true });
    if (teardown) { teardown(); teardown = null; }
    if (refCount > 0 && isTvReceiverPlatform()) teardown = start();
  }
}

// ── Pairing (Firestore, TTL) ─────────────────────────────────────────────────

export interface TvPairing {
  code: string;
  uid: string;              // the TV's account
  deviceId: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;        // claim window
  claimedBy?: string;       // controller uid
  claimedByName?: string;
  claimedAt?: number;
  duty?: EventDeviceDuty;   // last duty a controller pushed
  dutySeq?: number;         // increases per push so the TV applies each once
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export function tvPairUrl(code: string): string {
  const base = (typeof window !== 'undefined' && window.location?.origin && !/^capacitor:|^file:/.test(window.location.origin))
    ? window.location.origin : 'https://plajah.com';
  return `${base}/?tvPair=${encodeURIComponent(code)}`;
}

/** TV: get (or mint) a live pairing code. Reuses an unexpired one so the QR on screen stays stable. */
export async function ensureTvPairingCode(): Promise<{ code: string; expiresAt: number } | null> {
  const uid = state.uid;
  if (!uid) return null;
  try {
    const raw = lsGet(LS_PAIR_CODE);
    const cur = raw ? JSON.parse(raw) as { code: string; expiresAt: number } : null;
    if (cur && cur.expiresAt - Date.now() > 60_000) { emit({ pairing: cur }); return cur; }
    if (cur && cur.code !== state.claimedCode) await deleteDoc(doc(db, PAIRINGS, cur.code)).catch(() => {});
  } catch { /* */ }
  const now = Date.now();
  const code = newCode();
  const p: TvPairing = { code, uid, deviceId: state.deviceId, deviceName: state.deviceName, createdAt: now, expiresAt: now + PAIR_TTL_MS };
  try { await setDoc(doc(db, PAIRINGS, code), p); } catch { return null; }
  const out = { code, expiresAt: p.expiresAt };
  lsSet(LS_PAIR_CODE, JSON.stringify(out));
  emit({ pairing: out });
  return out;
}

/** TV: forget the controller that claimed this TV by code. */
export async function unpairTv(): Promise<void> {
  const code = state.claimedCode;
  lsSet(LS_PAIR_CLAIMED, null);
  emit({ claimedCode: null });
  if (code) await deleteDoc(doc(db, PAIRINGS, code)).catch(() => {});
}

/** Controller (phone / Ambo / switcher): look up a TV by its on-screen code. */
export async function lookupTvPairing(code: string): Promise<TvPairing | null> {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)) return null;
  try {
    const s = await getDoc(doc(db, PAIRINGS, c));
    return s.exists() ? (s.data() as TvPairing) : null;
  } catch { return null; }
}

/** Controller: claim a TV by code. Same-account TVs need no claim (they're already in the mesh). */
export async function claimTvPairing(code: string): Promise<TvPairing> {
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in to pair a TV.');
  const p = await lookupTvPairing(code);
  if (!p) throw new Error('No TV is showing that code.');
  if (p.uid === me.uid) return p;
  if (p.claimedBy && p.claimedBy !== me.uid) throw new Error('That TV is already paired to someone else.');
  if (!p.claimedBy && p.expiresAt < Date.now()) throw new Error('That code expired — ask for a new one on the TV.');
  const patch = { claimedBy: me.uid, claimedByName: me.displayName || 'Controller', claimedAt: Date.now() };
  await updateDoc(doc(db, PAIRINGS, p.code), patch);
  return { ...p, ...patch };
}

// ── Controller side: send a duty to a TV ─────────────────────────────────────

export type TvTarget =
  | { kind: 'own'; deviceId: string; name: string; online: boolean; duty?: EventDeviceDuty }
  | { kind: 'paired'; code: string; deviceId: string; name: string; online: boolean; duty?: EventDeviceDuty };

/** Push a duty to a TV — straight onto the device doc for my own TVs, via the pairing doc otherwise. */
export async function sendDutyToTv(target: TvTarget, duty: EventDeviceDuty): Promise<void> {
  if (target.kind === 'own') {
    // assignDeviceDuty also mirrors into the party-event session doc (no-op when no session exists).
    await assignDeviceDuty(target.deviceId, duty);
    return;
  }
  const me = auth.currentUser;
  if (!me) throw new Error('Sign in first.');
  await updateDoc(doc(db, PAIRINGS, target.code), { duty: clean(duty), dutySeq: Date.now() });
}

/**
 * Controller: every TV I can drive — my own account's TV receivers (live, via the event-device
 * mesh) plus TVs on other accounts I have claimed by code.
 */
export function listenToMyTvTargets(cb: (targets: TvTarget[]) => void): () => void {
  const me = auth.currentUser;
  if (!me) { cb([]); return () => {}; }
  let own: TvTarget[] = [];
  let paired: TvTarget[] = [];
  const push = () => cb([...own, ...paired]);

  const unDevices = listenToEventDevices(me.uid, devices => {
    own = devices
      .filter(d => d.deviceType === 'TV' || (d as any).receiverKind === 'tv')
      .filter(d => (d as any).availableAsDisplay !== false)
      .map(d => ({ kind: 'own' as const, deviceId: d.deviceId, name: d.deviceName || 'TV', online: d.isOnline, duty: d.duty }));
    push();
  });

  // Claimed foreign TVs: equality-only query (no composite index needed). Polled lightly, not live.
  let alive = true;
  const loadPaired = async () => {
    try {
      const snap = await getDocs(query(collection(db, PAIRINGS), where('claimedBy', '==', me.uid), limit(20)));
      if (!alive) return;
      paired = snap.docs.map(d => d.data() as TvPairing).map(p => ({
        kind: 'paired' as const, code: p.code, deviceId: p.deviceId, name: p.deviceName || 'TV', online: true, duty: p.duty,
      }));
      push();
    } catch { /* rules not deployed yet */ }
  };
  void loadPaired();
  const t = window.setInterval(loadPaired, 30_000);

  return () => { alive = false; unDevices(); window.clearInterval(t); };
}

// ── Duty builders (shared by Ambo / switcher / phone controllers) ────────────

export function programFeedDuty(streamId: string, title = 'Video Switcher Program', sourceLabel?: string): EventDeviceDuty {
  return { dutyType: 'PROGRAM_FEED', title, subtitle: 'Live program feed', sourceData: { streamId, sourceLabel: sourceLabel || title } };
}
export function partyDisplayDuty(partyId: string, title = 'Watch Party', sourceLabel?: string): EventDeviceDuty {
  return { dutyType: 'PARTY_DISPLAY', title, subtitle: 'Party display', sourceData: { partyId, sourceLabel: sourceLabel || title } };
}
export function signageDuty(opts: { pageId?: string; headline?: string; subheadline?: string; title?: string } = {}): EventDeviceDuty {
  return {
    dutyType: 'AMBIENT_SIGNAGE', title: opts.title || 'Signage', subtitle: 'Digital signage',
    sourceData: clean({ signagePageId: opts.pageId, headline: opts.headline, subheadline: opts.subheadline }),
  };
}

// ── Joinable sessions for the TV panel ───────────────────────────────────────

export interface JoinableSession {
  id: string;
  kind: 'PARTY' | 'AMBO_EVENT';
  title: string;
  subtitle: string;
  duty: EventDeviceDuty;
  slaved?: boolean;
}

/** Parties this account hosts that are still active, plus the account's Ambo event session if live. */
export async function fetchJoinableSessions(): Promise<JoinableSession[]> {
  const uid = state.uid || auth.currentUser?.uid;
  if (!uid) return [];
  const out: JoinableSession[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'parties'), where('hostId', '==', uid), where('isActive', '==', true), limit(10)));
    snap.docs.forEach(d => {
      const p = d.data() as any;
      const kind = p.kind === 'LISTEN' ? 'Listening party' : p.kind === 'READ' ? 'Read-along' : 'Watch party';
      const title = p.content?.title || kind;
      out.push({ id: d.id, kind: 'PARTY', title, subtitle: kind, duty: partyDisplayDuty(d.id, title, `${kind} · ${p.hostName || 'you'}`) });
    });
  } catch { /* */ }
  try {
    const s = await getDoc(doc(db, 'users', uid, 'ambo_party_event', 'session'));
    const sess = s.exists() ? (s.data() as PartyEventSession) : null;
    if (sess?.isActive) {
      out.push({
        id: 'ambo_session', kind: 'AMBO_EVENT', title: sess.eventName || 'Ambo event', subtitle: 'Ambo Central Command',
        duty: { dutyType: 'AMBO_PROGRAM', title: 'Ambo Program Out', subtitle: sess.eventName, sourceData: { sourceLabel: sess.eventName || 'Ambo' } },
        slaved: true,
      });
    }
  } catch { /* */ }
  return out;
}

/** Parse ?tvPair=CODE (phone side). */
export function tvPairCodeFromUrl(search = typeof location !== 'undefined' ? location.search : ''): string | null {
  try { const c = new URLSearchParams(search).get('tvPair'); return c && /^[A-Za-z0-9]{6}$/.test(c) ? c.toUpperCase() : null; } catch { return null; }
}

// Keep the friendly-name default sane on a TV (amboPartyEventService would say "Android (Chrome)").
export function defaultTvName(): string { return lsGet(LS_NAME) || getFriendlyDeviceName(); }

/** Controller: my streams that are live right now (switcher / Ambo programs published to Plajah live). */
export async function fetchMyLiveStreams(): Promise<Array<{ streamId: string; title: string }>> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'streams'), where('ownerUid', '==', uid), where('isLive', '==', true), limit(10)));
    return snap.docs.map(d => ({ streamId: d.id, title: (d.data() as any).title || 'Live' }));
  } catch { return []; }
}

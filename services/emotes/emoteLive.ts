// emoteLive — emotes on the live rails (Firestore): sending, the audience feed, the host's chorus
// authority, Crowd Light → real room lights, channel emotes, recents/favourites.
//
// Overlay-first. Every viewer draws the audience's emotes on their own device (EmoteOverlay) from
// `streams/{id}/events`, so emotes are crisp at any resolution, arrive as fast as Firestore (usually
// ahead of the video), and cost the streamer's phone nothing — the WebGL composer stays off unless the
// creator wants effects. The HOST is the single authority for a chorus: it counts distinct senders and
// writes `streams/{id}.emoteChorus`, which every viewer renders at the same moment. A creator who
// records or restreams can turn on "bake into stream" (`streams/{id}.emotes.bake`); then the host
// draws the stage into the published frame and viewers only draw their own taps.
//
// Data
//   streams/{id}/events/{auto}   { type:'emote', emoteId, emoji?, n, uid, name, ts }   (append-only)
//   streams/{id}.emoteChorus     { emoteId, tier, count, ts }                          (host)
//   streams/{id}.emotes          StreamEmoteSettings                                   (host)
//   users/{uid}/channelEmotes/{id} { code, name, url, access, gel, motion, animated, createdAt }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref as sref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { onSnapshot } from '../safeSnapshot';
import { smartLightingService } from '../smartLightingService';
import type { ChorusState, EmoteAccess, EmoteDef, EmoteMotion, StreamEmoteSettings } from './emoteTypes';
import { emoteById, emoteForUnicode, registerChannelEmotes } from './emoteLibrary';
import { ChorusDetector, RELAY_TICK_MS, RelayBuffer, TapBatcher, TokenBucket, spreadTick, type CrowdLightState, type ViewerAccess } from './emoteEngine';
import { rememberRecent } from './emoteShelf';

// ── sending ──────────────────────────────────────────────────────────────────────────────────────
export async function sendEmoteEvent(streamId: string, def: EmoteDef, n = 1) {
  const u = auth.currentUser;
  if (!u) return;
  const ev: Record<string, unknown> = {
    type: 'emote', emoteId: def.id, n: Math.max(1, Math.min(30, Math.round(n))),
    uid: u.uid, name: (u.displayName || 'Viewer').slice(0, 24), ts: Date.now(),
  };
  if (def.unicode) ev.emoji = def.unicode;   // old clients still render something
  await addDoc(collection(db, 'streams', streamId, 'events'), ev);
}

/**
 * Taps are free and instant locally; writes are batched (one per ~650 ms per emote, carrying the tap
 * count) and rate-limited, so holding the button doesn't hammer Firestore.
 */
export function useEmoteSender(streamId: string | null) {
  const sidRef = useRef(streamId); sidRef.current = streamId;
  const bucket = useMemo(() => new TokenBucket(5, 1.6), []);
  const batcher = useMemo(() => new TapBatcher((id, n) => {
    const sid = sidRef.current, def = emoteById(id);
    if (!sid || !def || !bucket.take()) return;
    sendEmoteEvent(sid, def, n).catch(() => {});
  }), [bucket]);
  useEffect(() => () => batcher.drain(), [batcher]);
  return useCallback((def: EmoteDef, n = 1) => { batcher.tap(def.id, n); noteOwn(def.id, n); rememberRecent(def.id); }, [batcher]);
}

/** Taps this device drew locally since the last relay tick (so the tick doesn't draw them twice). */
const ownSince = new Map<string, number>();
function noteOwn(id: string, n: number) { ownSince.set(id, (ownSince.get(id) ?? 0) + n); }
function takeOwn() { const m = new Map(ownSince); ownSince.clear(); return m; }

// ── the audience feed ────────────────────────────────────────────────────────────────────────────
export interface EmoteFeedHandlers {
  /** Someone sent an emote (`mine` = this device's user; usually already drawn locally). */
  onEmote?: (def: EmoteDef, n: number, uid: string, mine: boolean) => void;
  onChorus?: (c: ChorusState, def: EmoteDef) => void;
}

/**
 * Subscribes to the audience's emotes + the stream's chorus/settings fields.
 * Viewers on a busy stream (`settings.relay`, set by the host) listen to the host's one-doc relay
 * instead of the raw events; the host always reads the raw events (it IS the relay + chorus).
 */
export function useStreamEmoteFeed(streamId: string | null, h: EmoteFeedHandlers, role: 'host' | 'viewer' = 'viewer') {
  const hRef = useRef(h); hRef.current = h;
  const [settings, setSettings] = useState<StreamEmoteSettings>({});
  const relayed = role === 'viewer' && !!settings.relay;
  useEffect(() => {
    if (!streamId || relayed) return;
    const since = Date.now();
    // the host sees every event (it relays them); 30 is plenty for a small stream's viewers
    const qy = query(collection(db, 'streams', streamId, 'events'), orderBy('ts', 'desc'), limit(role === 'host' ? 120 : 30));
    return onSnapshot(qy, (snap: any) => {
      const me = auth.currentUser?.uid;
      snap.docChanges().forEach((ch: any) => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (!d || d.type !== 'emote' || !(d.ts > since)) return;
        const def = emoteById(typeof d.emoteId === 'string' ? d.emoteId : null)
          ?? (typeof d.emoji === 'string' ? emoteForUnicode(d.emoji.slice(0, 8)) : null);
        if (!def) return;
        hRef.current.onEmote?.(def, Math.max(1, Math.min(30, Number(d.n) || 1)), String(d.uid || ''), d.uid === me);
      });
    });
  }, [streamId, relayed, role]);
  // relay mode: one doc, one tick every ~1.2 s, spread back out over the tick
  useEffect(() => {
    if (!streamId || !relayed) return;
    let lastSeq = -1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    takeOwn();
    const off = onSnapshot(doc(db, 'streams', streamId, 'live', 'emotes'), (snap: any) => {
      const d = snap.data();
      if (!d || typeof d.seq !== 'number' || d.seq === lastSeq || !Array.isArray(d.items)) return;
      const first = lastSeq < 0; lastSeq = d.seq;
      if (first || Date.now() - (d.ts ?? 0) > 5000) return;   // don't replay a stale tick on join
      // Firestore can't hold nested arrays, so a tick's items are {e, n} maps
      const items: [string, number][] = (d.items as { e?: unknown; n?: unknown }[])
        .filter(x => x && typeof x.e === 'string' && typeof x.n === 'number').map(x => [x.e as string, x.n as number]);
      for (const s of spreadTick(items, Number(d.dur) || RELAY_TICK_MS, takeOwn())) {
        const def = emoteById(s.id);
        if (def) timers.push(setTimeout(() => hRef.current.onEmote?.(def, s.n, 'relay', false), s.at));
      }
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, [streamId, relayed]);
  useEffect(() => {
    if (!streamId) return;
    let lastTs = Date.now();
    return onSnapshot(doc(db, 'streams', streamId), (snap: any) => {
      const data = snap.data() || {};
      setSettings(data.emotes || {});
      const c = data.emoteChorus as ChorusState | undefined;
      if (c && c.ts > lastTs) {
        lastTs = c.ts;
        const def = emoteById(c.emoteId);
        if (def) hRef.current.onChorus?.(c, def);
      }
    });
  }, [streamId]);
  return settings;
}

/**
 * Host side: count distinct senders per emote and publish chorus tiers to the stream doc. Returns
 * a function to feed it (call it from the feed's onEmote, including the host's own taps).
 */
export function useChorusAuthority(streamId: string | null, audience: number, enabled = true) {
  const det = useMemo(() => new ChorusDetector(), []);
  det.audience = audience;
  const lastWrite = useRef(0);
  return useCallback((def: EmoteDef, uid: string, onLocal?: (c: ChorusState, def: EmoteDef) => void) => {
    if (!enabled || !streamId) return;
    const hit = det.add(def.id, uid || 'anon');
    if (!hit) return;
    const now = Date.now();
    const c: ChorusState = { emoteId: hit.emoteId, tier: hit.tier, count: hit.count, ts: now };
    onLocal?.(c, def);
    if (now - lastWrite.current < 600 && hit.tier < 3) return;   // tier-3 always goes out
    lastWrite.current = now;
    updateDoc(doc(db, 'streams', streamId), { emoteChorus: c }).catch(() => {});
  }, [det, streamId, enabled]);
}

/**
 * Host side: fold every audience emote into one summary doc per tick (streams/{id}/live/emotes) while
 * relay mode is on. Returns the function to feed it from the host's raw event feed.
 */
export function useEmoteRelay(streamId: string | null, enabled: boolean) {
  const buf = useMemo(() => new RelayBuffer(), []);
  const seq = useRef(0);
  useEffect(() => {
    if (!streamId || !enabled) return;
    const t = setInterval(() => {
      if (!buf.size) return;
      const items = buf.drain().map(([e, n]) => ({ e, n }));
      setDoc(doc(db, 'streams', streamId, 'live', 'emotes'), { seq: ++seq.current, ts: Date.now(), dur: RELAY_TICK_MS, items }).catch(() => {});
    }, RELAY_TICK_MS);
    return () => clearInterval(t);
  }, [streamId, enabled, buf]);
  return useCallback((def: EmoteDef, n: number) => { if (enabled) buf.add(def.id, n); }, [buf, enabled]);
}

export async function saveStreamEmoteSettings(streamId: string, s: StreamEmoteSettings) {
  await updateDoc(doc(db, 'streams', streamId), { emotes: s });
}

// ── crowd light → the creator's real lights ──────────────────────────────────────────────────────
/**
 * Pushes the crowd's light to connected smart lights (Hue / Nanoleaf / Govee / Razer). Slow on
 * purpose: at most once every 1.5 s, eased, brightness floored and capped, so the room breathes with
 * the chat — never flashes (photosensitivity) and never goes dark on the creator's face.
 */
export class CrowdRoomLights {
  private last = 0;
  private cur: [number, number, number] | null = null;
  enabled = false;
  constructor(private minGapMs = 1500, private floor = 0.35, private cap = 0.85) {}
  get available() { return smartLightingService.lights.some(l => l.on); }
  update(s: CrowdLightState | null, now = Date.now()) {
    if (!this.enabled || !s || s.intensity < 0.05 || now - this.last < this.minGapMs) return;
    this.last = now;
    const target = s.rgb;
    this.cur = this.cur ? this.cur.map((v, i) => Math.round(v + (target[i] - v) * 0.6)) as [number, number, number] : target;
    const bri = Math.min(this.cap, this.floor + s.intensity * (this.cap - this.floor));
    smartLightingService.pushCrowdColor(this.cur, bri).catch(() => {});
  }
}

// ── channel emotes ───────────────────────────────────────────────────────────────────────────────
export interface ChannelEmoteDoc {
  code: string; name: string; url: string; access: EmoteAccess; gel: string; motion: EmoteMotion; animated?: boolean; createdAt: number;
}
export const channelEmoteId = (ownerUid: string, code: string) => `ch.${ownerUid}.${code}`;
export function channelDocToDef(ownerUid: string, d: ChannelEmoteDoc): EmoteDef {
  return {
    id: channelEmoteId(ownerUid, d.code), code: d.code, name: d.name || d.code, pack: 'channel', tags: [d.code],
    gel: d.gel || '#B04BFF', motion: d.motion || 'float', access: d.access || 'everyone',
    art: { kind: 'image', url: d.url, animated: !!d.animated },
  };
}

/** A creator's channel emotes (live-updating). Registers them so `:code:` and events resolve. */
export function useChannelEmotes(ownerUid: string | null | undefined) {
  const [list, setList] = useState<EmoteDef[]>([]);
  useEffect(() => {
    if (!ownerUid) { setList([]); return; }
    return onSnapshot(collection(db, 'users', ownerUid, 'channelEmotes'), (snap: any) => {
      const defs: EmoteDef[] = [];
      snap.forEach((d: any) => { const v = d.data(); if (v?.url && v?.code) defs.push(channelDocToDef(ownerUid, v)); });
      registerChannelEmotes(defs);
      setList(defs.sort((a, b) => a.code.localeCompare(b.code)));
    });
  }, [ownerUid]);
  return list;
}

/**
 * What this viewer may send on `ownerUid`'s stream (live: following mid-stream unlocks follower
 * emotes immediately). Creator = it's your stream. Follower = follows/{me}_{owner} exists. Member =
 * an ACTIVE Sanctuary membership (sanctuaryMemberships/{owner}_{me}). This only drives the UI (locks in the picker /
 * tray); firestore.rules enforces the same tiers on every event against server-trusted docs.
 */
export function useViewerEmoteAccess(ownerUid: string | null | undefined): ViewerAccess {
  const me = auth.currentUser?.uid ?? null;
  const [isFollower, setFollower] = useState(false);
  const [isMember, setMember] = useState(false);
  useEffect(() => {
    setFollower(false);
    if (!me || !ownerUid || me === ownerUid) return;
    return onSnapshot(doc(db, 'follows', `${me}_${ownerUid}`), (snap: any) => setFollower(!!snap.exists?.()));
  }, [me, ownerUid]);
  useEffect(() => {
    setMember(false);
    if (!me || !ownerUid || me === ownerUid) return;
    // the server-written Sanctuary membership (Stripe webhook / free join); readable by its member
    return onSnapshot(doc(db, 'sanctuaryMemberships', `${ownerUid}_${me}`), (snap: any) => setMember(snap.data()?.status === 'ACTIVE'));
  }, [me, ownerUid]);
  return useMemo(() => ({ isCreator: !!me && me === ownerUid, isFollower: isFollower || isMember, isMember }), [me, ownerUid, isFollower, isMember]);
}

export const CHANNEL_CODE_RE = /^[a-z0-9_]{2,24}$/;
export const CHANNEL_EMOTE_MAX_BYTES = 512 * 1024;

export async function uploadChannelEmote(file: File, meta: Omit<ChannelEmoteDoc, 'url' | 'createdAt' | 'animated'>) {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to add channel emotes.');
  if (!CHANNEL_CODE_RE.test(meta.code)) throw new Error('Codes are 2–24 lowercase letters, numbers or _.');
  if (!/^image\/(png|gif|webp)$/.test(file.type)) throw new Error('Use a PNG, GIF or WebP (transparent backgrounds look best).');
  if (file.size > CHANNEL_EMOTE_MAX_BYTES) throw new Error('Keep emotes under 512 KB.');
  const ext = file.type.split('/')[1];
  const obj = sref(storage, `users/${u.uid}/channelEmotes/${meta.code}.${ext}`);
  await uploadBytes(obj, file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
  const url = await getDownloadURL(obj);
  const docData: ChannelEmoteDoc = { ...meta, url, animated: file.type !== 'image/png', createdAt: Date.now() };
  await setDoc(doc(db, 'users', u.uid, 'channelEmotes', meta.code), docData);
  return channelDocToDef(u.uid, docData);
}

export async function deleteChannelEmote(code: string) {
  const u = auth.currentUser;
  if (!u) return;
  await deleteDoc(doc(db, 'users', u.uid, 'channelEmotes', code));
}

// recents + favourites live in ./emoteShelf (no Firebase, so the lab and tests can use them)
export { rememberRecent, toggleFavorite, useEmoteShelf } from './emoteShelf';

/**
 * Linked internet-radio stations — "bring your station on by link".
 *
 * A creator who already runs an internet radio station off-platform pastes its public stream URL;
 * we verify it best-effort in the browser, then store it in the `linked_stations` collection
 * (public read, owner write — see firestore.rules) so it appears in the Radio directory and on the
 * owner's profile. Playback reuses the platform's shared RADIO transport, exactly like the external
 * TuneIn-style stations in `radioBrowser.ts` — a linked station is just a station the owner claims.
 *
 * VERIFICATION IS HONEST, NOT DECORATIVE. The browser cannot read ICY/Shoutcast metadata (codec,
 * bitrate, station name) off a raw stream — those headers aren't exposed to `fetch`, and a custom
 * request header would trip a CORS preflight. So we verify only what a browser genuinely can:
 *   • URL shape + protocol (https vs http → mixed-content blocked on our https page),
 *   • HLS (.m3u8) detection (Chrome/Firefox can't play these via <audio> — see radioBrowser),
 *   • reachability, by pointing a muted <audio> element at it and waiting for real audio data.
 * Codec is a guess from the URL; bitrate/genre/name are the owner's to declare. Nothing here throws
 * on a probe — a dead stream resolves to `reachable:false`, never an exception.
 */

import { db, auth } from './firebase';
import {
  collection, doc, setDoc, getDocs, deleteDoc, query, where, orderBy, limit as fbLimit,
} from 'firebase/firestore';
import type { LinkedRadioStation } from '../types';
import type { RadioStation } from './radioBrowser';
import { isMixedContentBlocked, isSecurePage } from './radioBrowser';

const COLLECTION = 'linked_stations';
const PROBE_TIMEOUT_MS = 9000;

// ── URL + probe ──────────────────────────────────────────────────────────────

/** Add a protocol if the user pasted a bare host, then validate. Returns null if unparseable. */
export function normalizeStreamUrl(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

const isHlsUrl = (url: string): boolean => /\.m3u8(\?|#|$)/i.test(url);

/** A codec guess from the URL — the only thing the browser can infer without server help. */
function guessCodec(url: string): string | undefined {
  if (/\.m3u8(\?|#|$)/i.test(url)) return 'HLS';
  if (/\.aac(\?|#|$)/i.test(url)) return 'AAC';
  if (/\.mp3(\?|#|$)/i.test(url)) return 'MP3';
  if (/\.ogg(\?|#|$)/i.test(url) || /\.opus(\?|#|$)/i.test(url)) return 'OGG';
  if (/\.(m4a|mp4)(\?|#|$)/i.test(url)) return 'AAC';
  return undefined;
}

/** Native HLS via <audio> — WebKit-not-Chromium (Safari) or iOS. Mirrors radioBrowser's test. */
const SUPPORTS_NATIVE_HLS: boolean = (() => {
  try {
    const ua = navigator.userAgent || '';
    const isChromium = /Chrome|Chromium|Edg\/|OPR\//.test(ua);
    const isWebKit = /AppleWebKit/.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!((isWebKit && !isChromium) || isIOS)) return false;
    return !!document.createElement('audio').canPlayType('application/vnd.apple.mpegurl');
  } catch {
    return false;
  }
})();

export interface StreamProbe {
  /** Reachable, playable on this page, and not blocked — safe to publish as live-verified. */
  ok: boolean;
  /** A muted <audio> element reached real audio data. Unknown (false) for HLS in Chrome/Firefox. */
  reachable: boolean;
  isSecure: boolean;
  isHls: boolean;
  blockedMixedContent: boolean;
  codec?: string;
  /** Human explanation when `ok` is false — shown verbatim in the Add-station dialog. */
  reason?: string;
}

/**
 * Verify a pasted stream URL as far as a browser honestly can. Never throws.
 *
 * `ok` gates the "live-verified" badge, NOT publishing — an http-only or HLS station can still be
 * added (the owner may be on Safari, or a proxy may come later), it's just stored with
 * `lastCheckOk:false` and the UI says why.
 */
export async function verifyStreamUrl(rawUrl: string): Promise<StreamProbe> {
  const url = normalizeStreamUrl(rawUrl);
  if (!url) {
    return { ok: false, reachable: false, isSecure: false, isHls: false, blockedMixedContent: false, reason: 'That doesn’t look like a valid stream URL.' };
  }

  const isSecure = /^https:\/\//i.test(url);
  const isHls = isHlsUrl(url);
  const blockedMixedContent = isMixedContentBlocked(url);
  const codec = guessCodec(url);
  const base: StreamProbe = { ok: false, reachable: false, isSecure, isHls, blockedMixedContent, codec };

  if (blockedMixedContent) {
    return { ...base, reason: 'This stream is http-only. Plajah is served over https, so browsers block it. Use an https URL, or your listeners on the web won’t hear it.' };
  }
  if (isHls && !SUPPORTS_NATIVE_HLS) {
    // Can't play it here to confirm, but it's a legitimate stream on Safari/iOS — allow it through
    // unverified rather than lying with a play button that dead-ends in this browser.
    return { ...base, reachable: false, reason: 'This looks like an HLS (.m3u8) stream. It plays on Safari and iOS; other browsers need HLS support in the shared player first, so it can’t be verified from here.' };
  }

  const reachable = await probeAudio(url);
  if (!reachable) {
    return { ...base, reason: 'Couldn’t reach audio at that URL. The station may be offline, or it may block cross-origin playback.' };
  }
  return { ...base, ok: true, reachable: true };
}

/** Point a muted <audio> at the URL and resolve true if it reaches playable data before timeout. */
function probeAudio(url: string): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const a = new Audio();
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { a.pause(); a.removeAttribute('src'); a.load(); } catch { /* */ }
      a.removeEventListener('canplay', ok);
      a.removeEventListener('loadeddata', ok);
      a.removeEventListener('playing', ok);
      a.removeEventListener('error', bad);
      resolve(v);
    };
    const ok = () => finish(true);
    const bad = () => finish(false);
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    a.muted = true;
    a.preload = 'auto';
    a.addEventListener('canplay', ok);
    a.addEventListener('loadeddata', ok);
    a.addEventListener('playing', ok);
    a.addEventListener('error', bad);
    try {
      a.src = url;
      a.load();
      // A live stream often needs play() to actually start pulling bytes. Muted, so inaudible.
      a.play().then(() => finish(true)).catch(() => { /* metadata events still decide */ });
    } catch {
      finish(false);
    }
  });
}

// ── Persistence ────────────────────────────────────────────────────────────────

/** Firestore rejects `undefined` — drop those keys before every write. */
function clean<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export interface AddLinkedStationInput {
  name: string;
  streamUrl: string;
  homepage?: string;
  favicon?: string;
  tags?: string[];
  country?: string;
  countryCode?: string;
  language?: string;
  genre?: string;
  codec?: string;
  bitrate?: number;
  ownerName: string;
  ownerAvatar?: string;
}

/**
 * Publish a linked station to the directory + the owner's profile. Verifies once more so the stored
 * `lastCheckOk`/`isHls`/`isSecure` reflect reality at publish time. Throws on a write failure so the
 * dialog can surface it; the caller passes a normalized, non-empty name + URL.
 */
export async function addLinkedStation(input: AddLinkedStationInput): Promise<LinkedRadioStation> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You need to be signed in to link a station.');

  const url = normalizeStreamUrl(input.streamUrl);
  if (!url) throw new Error('That stream URL is not valid.');
  const name = input.name.trim();
  if (!name) throw new Error('Give your station a name.');

  const probe = await verifyStreamUrl(url);
  const now = Date.now();
  const ref = doc(collection(db, COLLECTION));

  const station: LinkedRadioStation = {
    id: ref.id,
    ownerUid: uid,
    ownerName: input.ownerName,
    ownerAvatar: input.ownerAvatar,
    name,
    streamUrl: url,
    homepage: input.homepage?.trim() || undefined,
    favicon: input.favicon?.trim() || undefined,
    tags: (input.tags || []).map(t => t.trim()).filter(Boolean),
    country: input.country?.trim() || undefined,
    countryCode: input.countryCode?.trim().toUpperCase() || undefined,
    language: input.language?.trim() || undefined,
    genre: input.genre?.trim() || undefined,
    codec: input.codec?.trim() || probe.codec || undefined,
    bitrate: input.bitrate && input.bitrate > 0 ? input.bitrate : undefined,
    isHls: probe.isHls,
    isSecure: probe.isSecure,
    lastCheckOk: probe.reachable,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // id is the doc id — don't duplicate it inside the document body.
  const { id, ...body } = station;
  await setDoc(ref, clean(body));
  return station;
}

/** The current owner's linked stations, newest first. Resolves to `[]` on any failure. */
export async function fetchMyLinkedStations(uid: string): Promise<LinkedRadioStation[]> {
  if (!uid) return [];
  try {
    // Single-field `where` only — no composite index needed. Sorted client-side.
    const snap = await getDocs(query(collection(db, COLLECTION), where('ownerUid', '==', uid)));
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<LinkedRadioStation, 'id'>) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

/** The most recently linked creator stations across the platform, for the directory shelf. */
export async function fetchRecentLinkedStations(max = 80): Promise<LinkedRadioStation[]> {
  try {
    // Single-field `orderBy` only — auto-indexed. No `where`, so no composite index.
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), fbLimit(max)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LinkedRadioStation, 'id'>) }));
  } catch {
    return [];
  }
}

/** Remove a linked station. Rules enforce owner-only; we don't re-check here. */
export async function removeLinkedStation(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/**
 * Present a linked station as a `RadioStation` so the directory's StationCard and the shared RADIO
 * transport treat it identically to an external station. The `linked:` uuid prefix distinguishes it
 * from external (`radio:`) stations wherever ids are compared.
 */
export function linkedToRadioStation(s: LinkedRadioStation): RadioStation {
  return {
    uuid: `linked:${s.id}`,
    name: s.name,
    url: s.streamUrl,
    homepage: s.homepage || '',
    favicon: s.favicon || '',
    tags: s.tags || [],
    country: s.country || '',
    countryCode: s.countryCode || '',
    language: s.language || '',
    codec: s.codec || 'UNKNOWN',
    bitrate: s.bitrate || 0,
    isHls: s.isHls,
    lastCheckOk: s.lastCheckOk,
    votes: 0,
    clickCount: 0,
    blockedMixedContent: !s.isSecure && isSecurePage(),
  };
}

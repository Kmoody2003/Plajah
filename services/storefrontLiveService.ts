// storefrontLiveService — the in-store live layer that connects a physical location to customers'
// phones. Three linked pieces:
//   • Now Playing — the business publishes the current in-store track; checked-in customers see a live
//     "Now playing at {business}" card and can TIP the artist or BUY the track on the spot.
//   • Presence    — a customer checks in to a business (opt-in); the business sees who is in-store.
//   • Music Pulse — as tracks change while a customer is checked in, snapshots are saved to their
//     private "Heard at {business}" feed so they can revisit / tip / buy later.
//
// Docs: businesses/{b}/nowPlaying/current, businesses/{b}/presence/{uid}, users/{uid}/musicPulse/{id}.

import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, addDoc } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';

export interface NowPlayingTrack {
  trackId?: string;
  title: string;
  artist: string;
  artwork?: string;
  artistUid?: string;               // if a Plajah artist is linked → enables Tip
  artistStripeAccountId?: string;   // their Stripe Connect account → destination for the tip
  productId?: string;               // a store product to Buy on the spot
  startedAt?: number;
}

export interface PresenceEntry { uid: string; name?: string; photoURL?: string; checkedInAt: number; }
export interface PulseEntry extends NowPlayingTrack { id: string; businessUid: string; businessName: string; heardAt: number; }

const NOW_DOC = 'current';

// ── Geo (opt-in auto check-in) ───────────────────────────────────────────────
const GEO_PREF_KEY = 'plajah_geo_checkin';
/** Whether the customer has opted into location-based auto check-in (device-local preference). */
export function isGeoCheckinEnabled(): boolean {
  try { return localStorage.getItem(GEO_PREF_KEY) === '1'; } catch { return false; }
}
export function setGeoCheckinEnabled(on: boolean): void {
  try { localStorage.setItem(GEO_PREF_KEY, on ? '1' : '0'); } catch { /* */ }
}
/** Great-circle distance between two lat/lng points, in metres (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Read the device's current position once (promise). Rejects if denied/unavailable. */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

// ── Now Playing ────────────────────────────────────────────────────────────────
export async function publishNowPlaying(businessUid: string, track: NowPlayingTrack): Promise<void> {
  await setDoc(doc(db, 'businesses', businessUid, 'nowPlaying', NOW_DOC), {
    ...track, startedAt: track.startedAt || Date.now(),
  });
}
export async function clearNowPlaying(businessUid: string): Promise<void> {
  await deleteDoc(doc(db, 'businesses', businessUid, 'nowPlaying', NOW_DOC)).catch(() => {});
}
export async function fetchNowPlaying(businessUid: string): Promise<NowPlayingTrack | null> {
  const snap = await getDoc(doc(db, 'businesses', businessUid, 'nowPlaying', NOW_DOC));
  return snap.exists() ? (snap.data() as NowPlayingTrack) : null;
}
/** Live subscription to the business's current track (null when nothing is playing). */
export function subscribeNowPlaying(businessUid: string, cb: (t: NowPlayingTrack | null) => void): () => void {
  return onSnapshot(doc(db, 'businesses', businessUid, 'nowPlaying', NOW_DOC),
    (snap: any) => cb(snap.exists() ? (snap.data() as NowPlayingTrack) : null),
    () => cb(null));
}

// ── Presence (check-in) ──────────────────────────────────────────────────────
export async function checkIn(businessUid: string, name?: string, photoURL?: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to check in.');
  await setDoc(doc(db, 'businesses', businessUid, 'presence', uid), {
    uid, name: name || auth.currentUser?.displayName || 'Guest', photoURL: photoURL || auth.currentUser?.photoURL || '', checkedInAt: Date.now(),
  });
}
export async function checkOut(businessUid: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, 'businesses', businessUid, 'presence', uid)).catch(() => {});
}
export async function isCheckedIn(businessUid: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'businesses', businessUid, 'presence', uid));
  return snap.exists();
}
/** Business view — live list of checked-in customers. */
export function subscribePresence(businessUid: string, cb: (list: PresenceEntry[]) => void): () => void {
  return onSnapshot(collection(db, 'businesses', businessUid, 'presence'),
    (snap: any) => cb(snap.docs.map((d: any) => d.data() as PresenceEntry).sort((a: PresenceEntry, b: PresenceEntry) => b.checkedInAt - a.checkedInAt)),
    () => cb([]));
}

// ── Music Pulse ────────────────────────────────────────────────────────────────
/** Snapshot a heard track into the signed-in customer's private pulse feed. */
export async function capturePulse(businessUid: string, businessName: string, track: NowPlayingTrack): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !track?.title) return;
  await addDoc(collection(db, 'users', uid, 'musicPulse'), {
    businessUid, businessName,
    trackId: track.trackId || '', title: track.title, artist: track.artist || '',
    artwork: track.artwork || '', artistUid: track.artistUid || '',
    artistStripeAccountId: track.artistStripeAccountId || '', productId: track.productId || '',
    heardAt: Date.now(),
  }).catch(() => {});
}
/** The signed-in customer's "Heard at …" feed (newest first). */
export async function fetchMyPulse(limitN = 50): Promise<PulseEntry[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'musicPulse'));
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }) as PulseEntry)
      .sort((a, b) => b.heardAt - a.heardAt)
      .slice(0, limitN);
  } catch { return []; }
}

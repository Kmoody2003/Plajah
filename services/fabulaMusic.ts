// fabulaMusic.ts — Phase 3: on-platform music in Fabula.
// Pulls the signed-in artist's released tracks into a Fabula "Music" bin, and turns
// a track's synced lyrics (timeCodedLyrics) into animated caption clips (Pixels
// text scenes on V2). This is also the hook point for Phase 4 sync-licensing — a
// track carries its license/price/rightsOwner so "used in an edit" becomes billable.

import { auth } from './firebase';
import { fetchUserAlbums, fetchPersonalTracks, fetchAllPublicAlbums } from './backendService';
import { getLicense, type ContentLicenseId } from './licensingService';

export interface MusicBinTrack {
  id: string; title: string; artist: string; url?: string; duration?: number;
  timeCodedLyrics?: { time: number; text: string }[];
  license?: string; price?: number; rightsOwnerId?: string; albumTitle?: string;
  albumId?: string; syncLicenseFee?: number; syncLicenseTerms?: string;
  cover?: string; genre?: string;
  /** From the user's private music locker — usable in THEIR edit, but never
   *  licensable/shareable (personal-use only; excluded from sync-licensing). */
  isPersonal?: boolean;
}

/**
 * The signed-in user's music available to edit with: released MUSIC tracks
 * (flattened from their albums) PLUS their private locker (personal_tracks).
 * Locker tracks are flagged `isPersonal` — usable in the user's own edit but
 * NEVER offered for sync-licensing or sharing.
 */
export async function getMyMusicTracks(): Promise<MusicBinTrack[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const [albums, personal] = await Promise.all([
      fetchUserAlbums(uid).catch(() => []),
      fetchPersonalTracks().catch(() => []),
    ]);
    const out: MusicBinTrack[] = [];
    for (const al of albums || []) {
      if (al.type && al.type !== 'MUSIC') continue;
      for (const t of (al.tracks || [])) {
        if (!t.url) continue;
        out.push({
          id: t.id, title: t.title, artist: t.artist || al.artist, url: t.url, duration: t.duration,
          timeCodedLyrics: t.timeCodedLyrics, license: t.license, price: t.price,
          rightsOwnerId: t.rightsOwnerId || al.ownerId, albumTitle: al.title,
          albumId: al.id, syncLicenseFee: t.syncLicenseFee, syncLicenseTerms: t.syncLicenseTerms,
        });
      }
    }
    // Private locker — the user's own collection, playable in their edit only.
    for (const t of (personal || [])) {
      if (!t.url) continue;
      out.push({
        id: t.id, title: t.title, artist: t.artist || 'My Collection', url: t.url, duration: t.duration,
        albumTitle: t.albumTitle, rightsOwnerId: uid, isPersonal: true,
      });
    }
    return out;
  } catch (e) { console.warn('[fabulaMusic] fetch failed', e); return []; }
}

/**
 * The music sync-licensing STORE: every OTHER artist's released track that carries a
 * sync-license fee (syncLicenseFee > 0). A filmmaker browses, previews, and licenses
 * these for their Fabula edit. Excludes the user's own tracks (nothing to buy).
 */
export async function getLicensableTracks(limitN = 80): Promise<MusicBinTrack[]> {
  const uid = auth.currentUser?.uid;
  try {
    const albums = await fetchAllPublicAlbums().catch(() => []);
    const out: MusicBinTrack[] = [];
    for (const al of albums || []) {
      if (al.type && al.type !== 'MUSIC') continue;
      if (al.ownerId && al.ownerId === uid) continue; // your own tracks aren't a purchase
      for (const t of (al.tracks || [])) {
        const fee = Number((t as any).syncLicenseFee || 0);
        if (!t.url || fee <= 0) continue;
        out.push({
          id: t.id, title: t.title, artist: t.artist || al.artist, url: t.url, duration: t.duration,
          license: t.license, rightsOwnerId: t.rightsOwnerId || al.ownerId, albumTitle: al.title, albumId: al.id,
          syncLicenseFee: fee, syncLicenseTerms: (t as any).syncLicenseTerms, cover: al.coverImage, genre: (t as any).genre || al.genre,
        });
        if (out.length >= limitN) return out;
      }
    }
    return out;
  } catch (e) { console.warn('[fabulaMusic] licensable fetch failed', e); return []; }
}

export interface SyncLicenseInfo {
  licenseId: ContentLicenseId;
  label: string;       // short license code, e.g. "CC BY-NC"
  human: string;       // plain-language description
  usable: boolean;     // freely usable for sync (music-in-video) as-is
  attribution: boolean; // credit required when used
  personal: boolean;   // private-locker track — never licensable for distribution
  reason: string;      // why it's restricted (empty when usable)
}

/**
 * Whether a music-bin track can be dropped into a film/video freely, or needs a
 * sync license. `allowsCommercial` is the gate: CC-BY / CC-BY-SA / CC-BY-ND / CC0
 * clear sync use (with credit where required); All-Rights-Reserved and every
 * NonCommercial variant need a license from the rights holder. Personal-locker
 * tracks are never distributable. (Slice 1: surfacing only — the actual
 * license-grant/marketplace is Slice 2.)
 */
export function syncLicenseInfo(meta?: Partial<MusicBinTrack> | null): SyncLicenseInfo {
  const licenseId = ((meta?.license as ContentLicenseId) || 'ALL_RIGHTS_RESERVED');
  const def = getLicense(licenseId);
  const personal = !!meta?.isPersonal;
  const usable = !personal && def.allowsCommercial;
  let reason = '';
  if (personal) reason = 'Personal locker track — for your own use only; not cleared for distribution.';
  else if (!def.allowsCommercial) {
    reason = licenseId === 'ALL_RIGHTS_RESERVED'
      ? 'All Rights Reserved — a sync license from the rights holder is required to use this in a film.'
      : 'NonCommercial license — film/commercial use needs a sync license from the rights holder.';
  }
  return { licenseId, label: def.label, human: def.human, usable, attribution: !!def.requiresAttribution, personal, reason };
}

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Turn a track's synced lyrics into SUBTITLE clips on the given subtitle track.
 * Each line is a self-contained subtitle clip (kind:'subtitle', carries its own
 * text) — rendered as a crisp lower-third in the monitor and burned in on export
 * via the text engine. `audioStart` aligns them to where the song sits.
 */
export function buildSubtitleClips(track: MusicBinTrack, audioStart: number, trackId: string): any[] {
  const lyrics = (track.timeCodedLyrics || []).filter(l => l && l.text);
  const clips: any[] = [];
  if (!lyrics.length) return clips;

  const maxT = Math.max(...lyrics.map(l => l.time));
  const scale = maxT > 1000 ? 0.001 : 1;   // on-platform timeCodedLyrics times are ms
  const songEnd = track.duration || maxT * scale + 4;

  for (let i = 0; i < lyrics.length; i++) {
    const lineT = lyrics[i].time * scale;
    const nextT = i + 1 < lyrics.length ? lyrics[i + 1].time * scale : songEnd;
    const dur = Math.max(0.4, Math.min(nextT - lineT, 8)); // hold a line up to 8s
    const text = lyrics[i].text.trim();
    clips.push({
      id: uid(), trackId, start: audioStart + lineT, duration: dur, kind: 'subtitle', text, label: text.slice(0, 40), srcIn: 0,
      fx: { op: 1, sc: 1, x: 0, y: 0, rot: 0, blur: 0, bri: 1, con: 1, sat: 1, blend: 'screen', fadeIn: 0.15, fadeOut: 0.2, matte: { t: 'none', x: 50, y: 50, w: 60, h: 60, f: 0 }, genNote: '' },
    });
  }
  return clips;
}

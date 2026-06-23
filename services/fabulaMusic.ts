// fabulaMusic.ts — Phase 3: on-platform music in Fabula.
// Pulls the signed-in artist's released tracks into a Fabula "Music" bin, and turns
// a track's synced lyrics (timeCodedLyrics) into animated caption clips (Pixels
// text scenes on V2). This is also the hook point for Phase 4 sync-licensing — a
// track carries its license/price/rightsOwner so "used in an edit" becomes billable.

import { auth } from './firebase';
import { fetchUserAlbums } from './backendService';

export interface MusicBinTrack {
  id: string; title: string; artist: string; url?: string; duration?: number;
  timeCodedLyrics?: { time: number; text: string }[];
  license?: string; price?: number; rightsOwnerId?: string; albumTitle?: string;
}

/** The signed-in user's released MUSIC tracks (flattened from their albums). */
export async function getMyMusicTracks(): Promise<MusicBinTrack[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const albums = await fetchUserAlbums(uid);
    const out: MusicBinTrack[] = [];
    for (const al of albums || []) {
      if (al.type && al.type !== 'MUSIC') continue;
      for (const t of (al.tracks || [])) {
        if (!t.url) continue;
        out.push({
          id: t.id, title: t.title, artist: t.artist || al.artist, url: t.url, duration: t.duration,
          timeCodedLyrics: t.timeCodedLyrics, license: t.license, price: t.price,
          rightsOwnerId: t.rightsOwnerId || al.ownerId, albumTitle: al.title,
        });
      }
    }
    return out;
  } catch (e) { console.warn('[fabulaMusic] fetch failed', e); return []; }
}

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Turn a track's synced lyrics into caption clips on V2 + their mediaPool text
 * items. Each line is a Pixels text scene; the clip uses a SCREEN blend so the
 * black caption frame drops out and only the text overlays the picture.
 * `audioStart` aligns captions to where the song sits on the timeline.
 */
export function buildCaptionClips(track: MusicBinTrack, audioStart: number): { items: any[]; clips: any[] } {
  const lyrics = (track.timeCodedLyrics || []).filter(l => l && l.text);
  const items: any[] = []; const clips: any[] = [];
  if (!lyrics.length) return { items, clips };

  const maxT = Math.max(...lyrics.map(l => l.time));
  const scale = maxT > 1000 ? 0.001 : 1;   // on-platform timeCodedLyrics times are ms
  const songEnd = track.duration || maxT * scale + 4;

  for (let i = 0; i < lyrics.length; i++) {
    const lineT = lyrics[i].time * scale;
    const nextT = i + 1 < lyrics.length ? lyrics[i + 1].time * scale : songEnd;
    const dur = Math.max(0.4, Math.min(nextT - lineT, 8)); // hold a line up to 8s
    const text = lyrics[i].text.trim();
    const itemId = uid();
    items.push({
      id: itemId, name: text.slice(0, 40) || 'caption', type: 'graphic', bin: 'Captions', offline: true, tags: ['caption'],
      pixels: { name: 'caption', layers: [{ id: 'text', blendMode: 'normal', opacity: 1, clip: { type: 'text', text, opacity: 1 } }] },
    });
    clips.push({
      id: uid(), trackId: 'v2', start: audioStart + lineT, duration: dur, kind: 'media', assetId: itemId, label: text.slice(0, 40), srcIn: 0,
      fx: { op: 1, sc: 1, x: 0, y: 0, rot: 0, blur: 0, bri: 1, con: 1, sat: 1, blend: 'screen', fadeIn: 0.15, fadeOut: 0.2, matte: { t: 'none', x: 50, y: 50, w: 60, h: 60, f: 0 }, genNote: '' },
    });
  }
  return { items, clips };
}

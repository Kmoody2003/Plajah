// musicLocker — client-side helpers for the private My Library music locker.
// Reads embedded ID3/metadata tags from local audio files so an uploaded
// collection is organised by real Artist / Album / Title + embedded artwork,
// like Google Play Music / iTunes Match. Locker media is PRIVATE to the owner
// (personal_tracks / personal_albums, owner-only rules) and must never be shared.
import jsmediatags from 'jsmediatags';

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  trackNo?: number;
  year?: string;
  genre?: string;
  pictureBlob?: Blob;
}

const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|aiff?|alac)$/i;

/** True for files the locker should ingest as playable audio. */
export const isAudioFile = (f: File): boolean =>
  (f.type && f.type.startsWith('audio/')) || AUDIO_RE.test(f.name);

/** Read embedded tags from an audio file; resolves to {} if none/unreadable. */
export function readAudioTags(file: File): Promise<AudioTags> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: (result: any) => {
          const t = result?.tags || {};
          let pictureBlob: Blob | undefined;
          if (t.picture?.data?.length) {
            try {
              const { data, format } = t.picture;
              const bytes = new Uint8Array(data);
              pictureBlob = new Blob([bytes], { type: format || 'image/jpeg' });
            } catch { /* ignore artwork failures */ }
          }
          const trackRaw = t.track ? String(t.track).split('/')[0] : '';
          resolve({
            title: t.title?.trim() || undefined,
            artist: (t.artist || t.albumartist)?.trim() || undefined,
            album: t.album?.trim() || undefined,
            trackNo: trackRaw ? (parseInt(trackRaw, 10) || undefined) : undefined,
            year: t.year ? String(t.year) : undefined,
            genre: t.genre?.trim() || undefined,
            pictureBlob,
          });
        },
        onError: () => resolve({}),
      });
    } catch {
      resolve({});
    }
  });
}

/** Fallback title from a filename: strip extension + a leading track number. */
export const titleFromFilename = (name: string): string =>
  name.replace(/\.[^/.]+$/, '').replace(/^\s*\d{1,3}\s*[-_.)]*\s*/, '').trim() || name;

const PLAYLIST_RE = /\.(m3u8?|pls|xml)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

/** A playlist sidecar file bundled with a music folder (m3u / pls / iTunes xml). */
export const isPlaylistFile = (f: File): boolean => PLAYLIST_RE.test(f.name);

/** An image file (a folder cover: cover.jpg / folder.jpg / front.png / …). */
export const isImageFile = (f: File): boolean =>
  (f.type && f.type.startsWith('image/')) || IMAGE_RE.test(f.name);

/** Rank an image name as a likely album cover (conventional names score higher). */
export const coverScore = (name: string): number => {
  const n = name.toLowerCase();
  if (/(cover|folder|front|album|artwork|albumart)/.test(n)) return 2;
  return IMAGE_RE.test(name) ? 1 : 0;
};

/** basename without extension, lowercased — matches playlist entries to files. */
export const baseNoExt = (p: string): string =>
  (p.split(/[\\/]/).pop() || p).replace(/\.[^/.]+$/, '').trim().toLowerCase();

/** Parse a playlist file into an ordered list of track basenames (lowercased),
 *  used to sequence a folder's tracks the way the user arranged them. */
export function parsePlaylistOrder(text: string, filename: string): string[] {
  const lower = filename.toLowerCase();
  const order: string[] = [];
  if (lower.endsWith('.xml')) {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const nodes = doc.getElementsByTagName('track');
      for (let i = 0; i < nodes.length; i++) {
        const loc = nodes[i].getElementsByTagName('location')[0]?.textContent;
        const ttl = nodes[i].getElementsByTagName('title')[0]?.textContent;
        if (loc) order.push(baseNoExt(decodeURIComponent(loc)));
        else if (ttl) order.push(ttl.trim().toLowerCase());
      }
    } catch { /* ignore malformed xml */ }
    return order;
  }
  if (lower.endsWith('.pls')) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^File\d+\s*=\s*(.+)$/i);
      if (m) order.push(baseNoExt(m[1]));
    }
    return order;
  }
  // .m3u / .m3u8 — every non-comment line is a file path.
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    order.push(baseNoExt(t));
  }
  return order;
}

/** Group key for organising uploaded tracks into albums (Artist — Album). */
export const albumKeyFor = (tags: AudioTags, folderName?: string): string => {
  const album = tags.album || folderName || 'Unsorted';
  const artist = tags.artist || '';
  return artist ? `${artist} — ${album}` : album;
};

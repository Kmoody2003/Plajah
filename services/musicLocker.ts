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

/** Group key for organising uploaded tracks into albums (Artist — Album). */
export const albumKeyFor = (tags: AudioTags, folderName?: string): string => {
  const album = tags.album || folderName || 'Unsorted';
  const artist = tags.artist || '';
  return artist ? `${artist} — ${album}` : album;
};

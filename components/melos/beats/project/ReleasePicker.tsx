// "Open a release" — turn a finished Chora album back into something you can work on.
//
// Lists the creator's releases and back-ports the chosen one: the album's details become the
// Project's publishing info, its tracks become both Project tracks (audio pulled in so they can
// be re-mastered) and Melos songs, and any lyrics — typed or transcribed — land in the writing
// pad as blocks. A released record stops being a dead end.

import React, { useEffect, useState } from 'react';
import { X, Disc3, Music4 } from 'lucide-react';
import type { Album } from '../../../../types';
import { auth, fetchUserAlbums } from '../../../../services/backendService';
import { importAlbumToMelos, trackLyricText } from '../../../../services/melos/albumImport';
import { SELECT } from '../theme';

interface ReleasePickerProps {
  /** Land the import in the production you're working in; omit for the album's own. */
  productionId?: string;
  onClose: () => void;
  onImported: (summary: string) => void;
}

export const ReleasePicker: React.FC<ReleasePickerProps> = ({ productionId, onClose, onImported }) => {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setAlbums([]); return; }
    let cancelled = false;
    void fetchUserAlbums(uid)
      .then((rows) => { if (!cancelled) setAlbums(rows.filter((a) => (a.type ?? 'MUSIC') === 'MUSIC')); })
      .catch(() => { if (!cancelled) setAlbums([]); });
    return () => { cancelled = true; };
  }, []);

  const run = async (album: Album) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setBusyId(album.id);
    try {
      const res = await importAlbumToMelos(album, uid, {
        productionId,
        onProgress: (m, done, total) => setProgress(`${m} (${done}/${total})`),
      });
      const bits = [`${res.tracksImported} track${res.tracksImported === 1 ? '' : 's'}`];
      if (res.lyricsImported) bits.push(`${res.lyricsImported} with lyrics`);
      if (res.audioMissing.length) bits.push(`${res.audioMissing.length} without audio`);
      onImported(`Imported “${album.title}” — ${bits.join(' · ')}`);
      onClose();
    } finally { setBusyId(null); setProgress(''); }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[560px] max-h-[76vh] rounded-[18px] border border-white/15 bg-[#12101a] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-white/10">
          <Disc3 size={15} className="text-[#D0BCFF]" />
          <span className="text-[12.5px] font-bold text-white">Open a release</span>
          <span className="text-[10px] text-white/35">its songs, lyrics and details come back with it</span>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white" aria-label="Close"><X size={15} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-2">
          {albums === null && <div className="py-8 text-center text-[11.5px] text-white/35">Finding your releases…</div>}
          {albums?.length === 0 && (
            <div className="py-8 text-center text-[11.5px] text-white/35">
              No releases found on this account yet.
            </div>
          )}
          {albums?.map((a) => {
            const tracks = Array.isArray(a.tracks) ? a.tracks : [];
            const withLyrics = tracks.filter((t) => !!trackLyricText(t)).length;
            const busy = busyId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => { void run(a); }}
                disabled={!!busyId}
                className="w-full flex items-center gap-3 p-2 rounded-[12px] hover:bg-white/[0.06] disabled:opacity-50 text-left"
                style={busy ? { outline: `1px solid ${SELECT}` } : undefined}
              >
                <div className="w-11 h-11 rounded-[8px] overflow-hidden bg-white/[0.06] grid place-items-center flex-none">
                  {a.coverImage
                    ? <img src={a.coverImage} alt="" className="w-full h-full object-cover" />
                    : <Music4 size={16} className="text-white/25" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-white truncate">{a.title || 'Untitled'}</div>
                  <div className="text-[9.5px] text-white/40 truncate">
                    {a.artist || 'Unknown artist'} · {tracks.length} track{tracks.length === 1 ? '' : 's'}
                    {withLyrics > 0 && <span className="text-[#06D6A0]"> · {withLyrics} with lyrics</span>}
                  </div>
                </div>
                {busy && <span className="text-[9.5px] font-mono text-[#FF8C00] max-w-[170px] truncate">{progress || 'Importing…'}</span>}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-white/10 text-[9px] text-white/30">
          Audio is pulled in so tracks can be re-mastered · lyrics become writing-pad blocks · importing again refreshes without losing work.
        </div>
      </div>
    </div>
  );
};

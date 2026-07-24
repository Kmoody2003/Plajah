import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Sparkles, Globe, Users, Shuffle } from 'lucide-react';
import type { Video, Character } from '../../types';
import { fetchAllVideos, fetchWorldContentByWorldId, fetchWorldCharacters } from '../../services/backendService';
import { useTvGrid, isFocused } from '../../hooks/useTvGrid';
import { tvCardRing, RAIL_GUTTER } from './tvFocusRing';
import { thumb, THUMB } from '../../src/lib/imageThumb';

/**
 * The Reello "up next", shown when a video ends on a television.
 *
 * The viewer asked for it here rather than as a page before playback: watch, then get offered where
 * to go next. Three things, exactly as the desktop content pages carry them:
 *   • Suggest Next — TWO picks, one RELEVANT (same world → same genre → same creator) and one RANDOM,
 *     so there's both a considered next thing and a chance to stumble onto something new;
 *   • More From This World — other videos from the same universe (worldId);
 *   • Characters — the world's cast, shown for context.
 * The relevant pick auto-plays on a short countdown (this is an "up next", not a dead end), and any
 * D-pad move cancels the countdown so the viewer stays in control. Back leaves to the Reello grid.
 */

interface Props {
  video: Video;
  onPlay: (v: Video) => void;
  onDismiss: () => void;
}

const imgOf = (v: any) => v?.thumbnailUrl || v?.coverImageUrl || v?.coverImage;

const TvVideoUpNext: React.FC<Props> = ({ video, onPlay, onDismiss }) => {
  const [pool, setPool] = useState<Video[]>([]);
  const [worldVideos, setWorldVideos] = useState<Video[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Pull the candidate pool + this world's content once.
  useEffect(() => {
    let alive = true;
    const jobs: Promise<any>[] = [fetchAllVideos().then(v => { if (alive) setPool(v || []); }).catch(() => {})];
    const wid = (video as any).worldId as string | undefined;
    if (wid) {
      jobs.push(fetchWorldContentByWorldId(wid).then(c => { if (alive) setWorldVideos((c?.videos || []).filter(v => v.id !== video.id)); }).catch(() => {}));
      jobs.push(fetchWorldCharacters(wid).then(c => { if (alive) setCharacters(c || []); }).catch(() => {}));
    }
    Promise.all(jobs).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [video.id]);

  // The two Suggest Next picks: one relevant, one random. Relevance ladder: same world, then genre,
  // then creator; the random pick is anything else so it never duplicates the relevant one.
  const suggestions = useMemo(() => {
    const others = pool.filter(v => v.id !== video.id);
    if (!others.length) return [] as Video[];
    const wid = (video as any).worldId;
    const relevant =
      (wid && others.find(v => (v as any).worldId === wid)) ||
      (video.genre && others.find(v => v.genre === video.genre)) ||
      (video.artist && others.find(v => v.artist === video.artist)) ||
      others[0];
    // Deterministic-ish "random" that isn't the relevant one: step in from the end.
    const random = [...others].reverse().find(v => v.id !== relevant?.id) || null;
    const out: Video[] = [];
    if (relevant) out.push(relevant);
    if (random && random.id !== relevant?.id) out.push(random);
    return out;
  }, [pool, video]);

  const world = useMemo(
    () => worldVideos.filter(v => !suggestions.some(s => s.id === v.id)).slice(0, 12),
    [worldVideos, suggestions],
  );

  // Nothing to offer → behave like the old auto-return rather than showing an empty screen.
  useEffect(() => {
    if (loaded && !suggestions.length && !world.length && !characters.length) onDismiss();
  }, [loaded, suggestions.length, world.length, characters.length, onDismiss]);

  // Start the auto-play countdown once we have a relevant pick.
  useEffect(() => {
    if (suggestions.length && countdown === null) setCountdown(12);
  }, [suggestions.length]); // eslint-disable-line

  const rows = useMemo(() => ([
    { id: 'next', count: suggestions.length },
    { id: 'world', count: world.length },
  ]), [suggestions.length, world.length]);

  const { pos, zone } = useTvGrid({
    rows,
    onBack: () => { onDismiss(); return true; },
    onSelect: (p, rowId) => {
      setCountdown(null);
      if (rowId === 'next') { const v = suggestions[p.col]; if (v) onPlay(v); return; }
      if (rowId === 'world') { const v = world[p.col]; if (v) onPlay(v); return; }
    },
  });

  // Any navigation cancels the countdown — an "up next" the viewer is steering shouldn't yank the
  // video out from under them.
  useEffect(() => { if (pos.row !== 0 || pos.col !== 0) setCountdown(null); }, [pos]);

  // Tick, and fire the relevant pick at zero.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { const v = suggestions[0]; if (v) onPlay(v); return; }
    const t = setTimeout(() => setCountdown(c => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, suggestions, onPlay]);

  const focusedCellRef = useRef<HTMLDivElement>(null);
  useEffect(() => { focusedCellRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [pos]);

  if (loaded && !suggestions.length && !world.length && !characters.length) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/92 flex flex-col justify-center px-16 py-12 overflow-y-auto no-scrollbar" data-tv-no-trap>
      {/* Suggest Next */}
      {suggestions.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-4 text-white/70">
            <Sparkles size={18} /><h2 className="text-sm font-black uppercase tracking-[0.2em]">Up Next</h2>
            {countdown !== null && <span className="text-xs text-white/45">· playing in {countdown}s</span>}
          </div>
          <div className={`flex gap-6 ${RAIL_GUTTER}`}>
            {suggestions.map((v, col) => {
              const focused = zone === 'CONTENT' && isFocused(pos, 0, col);
              return (
                <div key={v.id} ref={focused ? focusedCellRef : undefined}
                  className="shrink-0 w-[26rem] cursor-pointer transition-transform" style={focused ? { transform: 'scale(1.03)' } : undefined}
                  onClick={() => { setCountdown(null); onPlay(v); }}>
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/[0.05]" style={{ boxShadow: tvCardRing(focused) }}>
                    {imgOf(v) ? <img src={thumb(imgOf(v), THUMB.large)} alt="" className="w-full h-full object-cover" /> : null}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/85 to-transparent flex items-center gap-2">
                      {col === 0 ? <Play size={16} className="text-[#FF8C00]" fill="currentColor" /> : <Shuffle size={15} className="text-white/60" />}
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/70">{col === 0 ? 'Relevant' : 'Random'}</span>
                    </div>
                  </div>
                  <p className="mt-2.5 text-lg font-black truncate">{v.title}</p>
                  <p className="text-sm text-white/45 truncate">{v.artist || ''}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* More From This World */}
      {world.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-4 text-white/70">
            <Globe size={17} /><h2 className="text-sm font-black uppercase tracking-[0.2em]">More From This World</h2>
          </div>
          <div className={`flex gap-5 overflow-x-auto no-scrollbar ${RAIL_GUTTER}`}>
            {world.map((v, col) => {
              const focused = zone === 'CONTENT' && isFocused(pos, 1, col);
              return (
                <div key={v.id} ref={focused ? focusedCellRef : undefined}
                  className="shrink-0 w-64 cursor-pointer transition-transform" style={focused ? { transform: 'scale(1.05)' } : undefined}
                  onClick={() => { setCountdown(null); onPlay(v); }}>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-white/[0.05]" style={{ boxShadow: tvCardRing(focused) }}>
                    {imgOf(v) ? <img src={thumb(imgOf(v), THUMB.card)} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <p className="mt-2 text-sm font-bold truncate">{v.title}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Characters — context strip, not a focus target. */}
      {characters.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3 text-white/60">
            <Users size={16} /><h2 className="text-[11px] font-black uppercase tracking-[0.2em]">Characters</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar">
            {characters.slice(0, 12).map(c => (
              <div key={c.id} className="shrink-0 w-20 text-center">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-white/[0.06] grid place-items-center">
                  {c.imageUrl ? <img src={thumb(c.imageUrl, THUMB.small)} alt="" className="w-full h-full object-cover" /> : <Users size={20} className="text-white/20" />}
                </div>
                <p className="mt-1.5 text-[11px] font-bold truncate">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mt-10 text-center">◀ ▶ ▲ ▼ choose · OK play · Back to exit</p>
    </div>,
    document.body,
  );
};

export default TvVideoUpNext;

// MixPlayerView — the dedicated Chora Mixes player (Mixcloud/SoundCloud-class).
//
// A long-form DJ set built on the album framework: the mix master is album.tracks[0]. The layout
// puts the Plajah Pixels reactive canvas center-stage above a large waveform, timestamped comments
// pinned to the wave and threaded below, and a vertical rail of other mixes to the right. When the
// source was a Reello video the player is audio-only by nature (we only ever play the audio track).
//
// Reuses: GlobalPlayerContext (audio + shared analyser), ScrollingWaveform (peaks), the
// albums/{id}/comments subcollection keyed by trackId + mediaTimestamp, and MixPixelsStage (the
// intelligent one-generator-at-a-time auto-show). Part of the Chora Mixes feature (Phase 1).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Album, Track, Comment } from '../types';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { getOrComputeAnalysis, getCachedAnalysis } from '../services/djAnalysis';
import { subscribeToComments, postComment, fetchAllPublicAlbums, createPost } from '../services/backendService';
import { buildShareUrl } from '../services/deepLinkService';
import ScrollingWaveform from './ScrollingWaveform';
import MixPixelsStage, { type MixPixelsInfo } from './MixPixelsStage';
import ShareButton from './ShareButton';

interface MixPlayerViewProps {
  album: Album;
  onBack: () => void;
  user?: any;
  /** Open another mix (routed through App's handleSelectItem). */
  onOpenMix?: (album: Album) => void;
}

const fmt = (s: number): string => {
  if (!isFinite(s) || s < 0) s = 0;
  const t = Math.floor(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? `${h}:` : '') + `${mm}:${String(sec).padStart(2, '0')}`;
};

const Icon: React.FC<{ path: string; size?: number; fill?: boolean }> = ({ path, size = 20, fill }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
);
const PLAY = 'M8 5v14l11-7z', PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const BACK = 'M19 12H5M12 19l-7-7 7 7z';

const MixPlayerView: React.FC<MixPlayerViewProps> = ({ album, onBack, user, onOpenMix }) => {
  const gp = useGlobalPlayer();
  const track: Track | undefined = album.tracks?.[0];
  const isThisMix = !!track && gp.currentTrack?.id === track.id;
  const playing = gp.isPlaying && isThisMix;

  const meta = album.mixMeta || {};
  const allowComments = meta.allowComments !== false;

  // ── waveform peaks ──
  const [peaks, setPeaks] = useState<number[] | null>(() => (track ? getCachedAnalysis(track)?.peaks ?? null : null));
  useEffect(() => {
    if (!track?.url || peaks) return;
    let cancelled = false;
    getOrComputeAnalysis(track).then(a => { if (!cancelled && a?.peaks) setPeaks(a.peaks); }).catch(() => {});
    return () => { cancelled = true; };
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mobile the shared analyser is fed silence (Web Audio is bypassed there to protect
  // background playback), so the Pixels stage would sit frozen. Open the passive captureStream
  // tap once the mix is actually playing (a user gesture has happened, the element has an audio
  // track) so the visuals react. No-op on desktop; best-effort where captureStream is unsupported.
  useEffect(() => {
    if (playing) gp.ensureAnalyserTap();
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── generator badge ──
  const [gen, setGen] = useState<MixPixelsInfo | null>(null);
  const onGen = useCallback((info: MixPixelsInfo) => setGen(info), []);

  // ── comments (timestamped) ──
  const [comments, setComments] = useState<Comment[]>([]);
  useEffect(() => {
    if (!track?.id || !allowComments) return;
    const unsub = subscribeToComments(album.id, track.id, null, setComments);
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, [album.id, track?.id, allowComments]);

  const [draft, setDraft] = useState('');
  const submitComment = useCallback(async () => {
    const text = draft.trim();
    if (!text || !track?.id) return;
    if (!user?.uid) { alert('Sign in to leave a comment.'); return; }
    setDraft('');
    try {
      await postComment(album.id, {
        author: user.displayName || user.name || 'Listener',
        text,
        timestamp: Date.now(),
        trackId: track.id,
        uid: user.uid,
        mediaTimestamp: Math.floor(gp.currentTime || 0),
      });
    } catch (e) { console.error('[Mix] comment failed', e); }
  }, [draft, track?.id, album.id, user, gp.currentTime]);

  // ── other mixes rail ──
  const [rail, setRail] = useState<Album[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchAllPublicAlbums().then(list => {
      if (cancelled) return;
      const mixes = (list || []).filter(a => a.subType === 'MIX' && a.id !== album.id);
      // Prefer same-artist first, then the rest.
      mixes.sort((a, b) => (b.ownerId === album.ownerId ? 1 : 0) - (a.ownerId === album.ownerId ? 1 : 0));
      setRail(mixes.slice(0, 24));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [album.id, album.ownerId]);

  // ── transport ──
  const play = useCallback(() => {
    if (!track) return;
    if (isThisMix) gp.togglePlay();
    else gp.playTrack(track, album, 'LIBRARY');
  }, [track, isThisMix, gp, album]);

  const dur = isThisMix ? (gp.duration || meta.durationSec || track?.duration || 0) : (meta.durationSec || track?.duration || 0);
  const cur = isThisMix ? gp.currentTime || 0 : 0;

  const onWaveClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!track) return;
    if (!isThisMix) { play(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (dur > 0) gp.seek(pct * dur);
  }, [track, isThisMix, dur, gp, play]);

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => (a.mediaTimestamp ?? 0) - (b.mediaTimestamp ?? 0)),
    [comments],
  );
  const pinned = useMemo(
    () => comments.filter(c => typeof c.mediaTimestamp === 'number' && dur > 0),
    [comments, dur],
  );

  if (!track) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-[#08060d] text-white">
        <div className="text-center">
          <p className="text-white/60">This mix has no audio yet.</p>
          <button onClick={onBack} className="mt-4 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">Back</button>
        </div>
      </div>
    );
  }

  const genLabel = gen
    ? (gen.authored ? 'Pixels · Artist show' : `Pixels · Auto-Show · ${gen.name}`)
    : 'Pixels · Auto-Show';

  const cover = album.coverThumb || album.coverImage;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#08060d] text-white"
      style={{ backgroundImage: 'radial-gradient(900px 500px at 80% -10%, rgba(212,0,85,.16), transparent 60%), radial-gradient(800px 520px at 5% 5%, rgba(107,0,153,.20), transparent 62%)' }}>
      {/* top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 h-14 backdrop-blur-xl bg-[#08060d]/70 border-b border-white/10">
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10"><Icon path={BACK} size={18} /></button>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Chora · Mixes</span>
      </div>

      <div className="max-w-[1180px] mx-auto px-4 py-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── LEFT: stage + waveform + comments ── */}
        <div className="min-w-0">
          {/* Pixels stage */}
          <div className="relative rounded-2xl overflow-hidden border border-white/12 bg-[#050409]" style={{ aspectRatio: '16 / 9' }}>
            <MixPixelsStage
              analyser={gp.analyser}
              isPlaying={playing}
              visualMode={meta.visualMode}
              pixelsProjectId={meta.pixelsProjectId}
              ownerId={album.ownerId}
              onGeneratorChange={onGen}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(5,4,9,.72), transparent 42%)' }} />
            {/* badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#08060d]/60 backdrop-blur border border-white/15 text-[11px] font-semibold">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'linear-gradient(120deg,#6B0099,#00DAF3)' }} />
              <span className="text-white/85">{genLabel}</span>
            </div>
            {meta.source === 'REELLO' && (
              <div className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#00DAF3] px-2.5 py-1.5 rounded-full bg-[#00DAF3]/10 border border-[#00DAF3]/30">audio-only · from Reello</div>
            )}
            {/* now playing overlay */}
            <div className="absolute left-4 right-4 bottom-3 flex items-end gap-3">
              {cover && <img src={cover} alt="" className="w-14 h-14 rounded-xl object-cover shadow-lg" />}
              <div className="min-w-0 flex-1">
                <h1 className="font-black uppercase tracking-tight leading-[0.95] text-2xl sm:text-3xl truncate">{album.title}</h1>
                <div className="text-white/70 text-sm truncate">by <b className="text-[#D0BCFF]">{album.artist}</b></div>
              </div>
              {!playing && (
                <button onClick={play} aria-label="Play mix"
                  className="w-14 h-14 rounded-full grid place-items-center text-white shrink-0 shadow-xl"
                  style={{ background: 'linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                  <Icon path={PLAY} size={24} fill />
                </button>
              )}
            </div>
          </div>

          {/* tags */}
          <div className="flex flex-wrap gap-2 mt-4">
            {album.genre && <span className="text-[11px] font-semibold text-white/70 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">{album.genre}</span>}
            {meta.bpm ? <span className="text-[11px] font-semibold text-white/70 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">{meta.bpm} BPM</span> : null}
            {dur > 0 && <span className="text-[11px] font-semibold text-white/70 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">{fmt(dur)}</span>}
            <span className="ml-auto text-[11px] font-mono text-white/40">{(album.playCount || 0).toLocaleString()} plays</span>
          </div>

          {/* waveform + transport */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="relative cursor-pointer select-none" onClick={onWaveClick} title="Scrub the mix">
              <div className="h-[92px]">
                <ScrollingWaveform currentTime={cur} duration={dur} trackId={track.id} isPlaying={playing} peaks={peaks} />
              </div>
              {/* comment pins */}
              {pinned.map(c => (
                <button key={c.id} onClick={(e) => { e.stopPropagation(); if (dur > 0) gp.seek(Math.min(dur, c.mediaTimestamp!)); }}
                  title={`${c.author} @ ${fmt(c.mediaTimestamp!)}`}
                  className="absolute -top-1 w-3.5 h-3.5 -ml-[7px] rounded-full border-2 border-[#08060d] hover:scale-125 transition-transform"
                  style={{ left: `${(c.mediaTimestamp! / dur) * 100}%`, background: '#00DAF3', boxShadow: '0 0 0 1px #00DAF3' }} />
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 font-mono text-[11px] text-white/40">
              <span>{fmt(cur)}</span><span>{fmt(dur)}</span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={play} aria-label={playing ? 'Pause' : 'Play'}
                className="w-12 h-12 rounded-full grid place-items-center text-white shadow-lg"
                style={{ background: 'linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                <Icon path={playing ? PAUSE : PLAY} size={22} fill={!playing} />
              </button>
              <div className="ml-auto flex items-center gap-2">
                <ShareButton
                  title={album.title}
                  artist={album.artist}
                  text={`Check out the mix "${album.title}" by ${album.artist} on Plajah`}
                  url={buildShareUrl('album', album.id)}
                  imageUrl={cover || album.coverImage}
                  label="Share"
                  iconSize={15}
                  plajahLabel="Share to Plajah feed"
                  onPostToPlajah={async () => {
                    await createPost({
                      text: `🎧 ${album.title} — ${album.artist} (mix)`,
                      media: [{ type: 'AUDIO', url: track.url || '', id: track.id, title: album.title, thumbnail: cover || album.coverImage } as any],
                      albumEmbed: album,
                    } as any);
                  }}
                  className="flex items-center gap-2 text-[12px] font-semibold text-white/70 hover:text-white px-3 py-2 rounded-full bg-white/5 border border-white/10"
                />
              </div>
            </div>
          </div>

          {/* cue sheet (optional tracklist) */}
          {meta.cueSheet && meta.cueSheet.length > 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-white/50 mb-3">Tracklist</h4>
              <div className="flex flex-col">
                {meta.cueSheet.map(cue => (
                  <button key={cue.id} onClick={() => { if (isThisMix && dur > 0) gp.seek(Math.min(dur, cue.time)); else play(); }}
                    className="flex items-center gap-3 py-2 border-t border-white/5 first:border-t-0 text-left hover:bg-white/5 -mx-2 px-2 rounded">
                    <span className="font-mono text-[11px] text-[#00DAF3] w-12 shrink-0">{fmt(cue.time)}</span>
                    <span className="min-w-0 truncate text-sm"><b>{cue.title}</b>{cue.artist && <span className="text-white/50"> — {cue.artist}</span>}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* comments */}
          {allowComments && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h4 className="text-[13px] font-black uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                Comments <span className="font-mono text-[11px] text-white/35 normal-case font-medium">· {comments.length} on the wave</span>
              </h4>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0" style={{ background: 'linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                  {(user?.displayName || 'Y').slice(0, 1).toUpperCase()}
                </div>
                <input value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitComment(); }}
                  placeholder="Add a comment…"
                  className="flex-1 text-sm px-4 py-2.5 rounded-full bg-white/5 border border-white/10 outline-none focus:border-white/25 placeholder:text-white/35" />
                <span className="font-mono text-[11px] font-bold text-[#00DAF3] shrink-0 px-2.5 py-1.5 rounded-full bg-[#00DAF3]/10 border border-[#00DAF3]/25">@ {fmt(cur)}</span>
              </div>
              {sortedComments.length === 0 && <p className="text-white/40 text-sm py-2">Be the first to pin a comment to this mix.</p>}
              <div className="flex flex-col">
                {sortedComments.map(c => (
                  <div key={c.id} className="flex gap-3 py-2.5 border-t border-white/5 first:border-t-0">
                    <div className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0 bg-white/10 text-[#D0BCFF]">{(c.author || '?').slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[12px]">
                        <b className="font-semibold">{c.author}</b>
                        {typeof c.mediaTimestamp === 'number' && (
                          <button onClick={() => { if (isThisMix && dur > 0) gp.seek(Math.min(dur, c.mediaTimestamp!)); else play(); }}
                            className="font-mono text-[10.5px] font-bold text-[#00DAF3] px-2 py-0.5 rounded-full bg-[#00DAF3]/10 border border-[#00DAF3]/25">{fmt(c.mediaTimestamp!)}</button>
                        )}
                      </div>
                      <div className="text-white/70 text-[13.5px] mt-0.5 break-words">{c.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: more mixes ── */}
        <aside className="min-w-0">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <b className="text-[12px] font-black uppercase tracking-wider text-white/60">More mixes</b>
              <span className="ml-auto font-mono text-[11px] text-white/35">{rail.length}</span>
            </div>
            {rail.length === 0 && <p className="px-4 pb-4 text-white/40 text-sm">No other mixes yet.</p>}
            {rail.map(m => (
              <button key={m.id} onClick={() => onOpenMix?.(m)}
                className="w-full flex items-center gap-3 px-4 py-2.5 border-t border-white/5 hover:bg-white/5 text-left">
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/10">
                  {(m.coverThumb || m.coverImage) && <img src={m.coverThumb || m.coverImage} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold truncate">{m.title}</b>
                  <span className="text-[11.5px] text-white/55 truncate block">{m.artist}{m.genre ? ` · ${m.genre}` : ''}</span>
                </div>
                {m.mixMeta?.durationSec ? <span className="font-mono text-[11px] text-white/35 shrink-0">{fmt(m.mixMeta.durationSec)}</span> : null}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MixPlayerView;

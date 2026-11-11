// Music on a social post — the song's own backdrop and actions, shared by Plajah posts (Chora
// releases, PostCard) and Audius posts (ExternalPostCard).
//
//  • MusicPostBackdrop: at rest the post wears the release's album art, blurred and scrimmed so the
//    text and buttons stay legible. While THIS post's song is playing, Show Mode's FX stage
//    (MixPixelsStage — the same energy-aware auto-show) fades in over the art; when the music stops
//    it fades back out and unmounts, so the post is a normal music post again and no WebGL context
//    is left running. Off-screen posts never mount the stage.
//  • MusicPostActions: Favorite · Add to library · Add to playlist · Follow the artist, right on the post.

import React, { useEffect, useRef, useState } from 'react';
import { Heart, LibraryBig, ListPlus, UserPlus, UserCheck, Check, Clock } from 'lucide-react';
import MixPixelsStage from '../MixPixelsStage';
import PlaylistPickerModal from '../PlaylistPickerModal';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { auth } from '../../services/backendService';
import {
  loadMyMusicLists, subscribeMyMusicLists, setChoraFavorite, setInLibrary, isChoraFavorite, isInLibrary,
  isFollowingArtist, setFollowArtist,
} from '../../services/postMusicActions';
import { followAudiusUser, unfollowAudiusUser } from '../../services/audiusService';
import { getAudiusSession, startAudiusAuth } from '../../services/audiusAuth';
import { followedAudiusOwnerIds, invalidateAudiusLibrary } from '../../services/audiusLibrary';
import type { Album, Track } from '../../types';

const FADE_MS = 1200;

/** A visual that throws must never take the feed down with it: the post just keeps its album art. */
class StageBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[MusicPostBackdrop] visualizer failed; showing album art', e); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** True while the global player is playing one of these tracks (or this album). */
export function usePostMusicPlaying(album: Album | null | undefined, extraIds: string[] = []): boolean {
  const { currentTrack, currentAlbum, isPlaying } = useGlobalPlayerState();
  if (!isPlaying || !currentTrack) return false;
  if (album?.id && currentAlbum?.id === album.id) return true;
  if (album?.tracks?.some(t => t.id === currentTrack.id || (t.url && t.url === currentTrack.url))) return true;
  return extraIds.includes(currentTrack.id);
}

export const MusicPostBackdrop: React.FC<{ cover?: string | null; active: boolean; ownerId?: string }> = ({ cover, active, ownerId }) => {
  const { analyser, ensureAnalyserTap, getAudioContext } = useGlobalPlayerState();
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  // Stage lifecycle: mounted while playing (on screen) and for one fade after the music stops.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return; }
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const want = active && onScreen;
  useEffect(() => {
    if (want) {
      try { ensureAnalyserTap(); getAudioContext(); } catch { /* best effort, like Show Mode */ }
      setMounted(true);
      // next frame so the opacity transition runs from 0
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [want, ensureAnalyserTap, getAudioContext]);

  return (
    <div ref={ref} className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {cover && (
        <img
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover scale-110 blur-[3px] transition-[opacity,transform] duration-[1200ms] group-hover/card:scale-[1.14]"
          style={{ opacity: shown ? 0.3 : 0.45 }}
        />
      )}
      {mounted && (
        <div className="absolute inset-0 transition-opacity ease-out" style={{ opacity: shown ? 0.9 : 0, transitionDuration: `${FADE_MS}ms`, mixBlendMode: 'screen' }}>
          <StageBoundary>
            <MixPixelsStage analyser={analyser} isPlaying={active} visualMode="AUTO" ownerId={ownerId} />
          </StageBoundary>
        </div>
      )}
      {/* Legibility scrim — always on top of art and visuals, a touch heavier at the bottom where the actions sit. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/65 to-black/85" />
      {!shown && <div className="absolute inset-0 backdrop-blur-[3px]" />}
    </div>
  );
};

export type MusicPostArtist =
  | { kind: 'plajah'; uid: string; name?: string }
  | { kind: 'audius'; id: string; name?: string };

export interface MusicPostActionsProps {
  track: Track | null;
  album: Album | null;
  artist: MusicPostArtist | null;
  /** Audius posts: the card's own Audius favorite (the same heart as its like). Chora posts omit this. */
  favorite?: { on: boolean; busy?: boolean; onToggle: () => void };
  accent?: string;
}

const pill = 'tap inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50';
const off = 'border-white/15 bg-black/35 text-white/70 hover:text-white hover:border-white/35 backdrop-blur-sm';

export const MusicPostActions: React.FC<MusicPostActionsProps> = ({ track, album, artist, favorite, accent = '#FF6B2C' }) => {
  const signedIn = Boolean(auth.currentUser);
  const lists = useMyMusicLists();
  const [busy, setBusy] = useState<'fav' | 'lib' | 'follow' | null>(null);
  const [picker, setPicker] = useState(false);
  const [follow, setFollow] = useState<boolean | 'requested'>(false);
  const [flash, setFlash] = useState<string | null>(null);

  const myUid = auth.currentUser?.uid;
  const isOwnArtist = artist?.kind === 'plajah' && artist.uid === myUid;

  useEffect(() => {
    let alive = true;
    if (!artist || !signedIn) return;
    if (artist.kind === 'plajah') isFollowingArtist(artist.uid).then(v => { if (alive) setFollow(v); });
    else setFollow(followedAudiusOwnerIds().includes(`audius:${artist.id.replace(/^audius:/, '')}`));
    return () => { alive = false; };
  }, [artist?.kind, artist && (artist.kind === 'plajah' ? artist.uid : artist.id), signedIn]);

  const say = (msg: string) => { setFlash(msg); window.setTimeout(() => setFlash(f => (f === msg ? null : f)), 1800); };
  const needSignIn = () => say('Sign in to save music');

  if (!track) return null;
  const faved = favorite ? favorite.on : isChoraFavorite(track.id, lists);
  const saved = isInLibrary(track.id, lists);

  const toggleFav = async () => {
    if (favorite) return favorite.onToggle();
    if (!signedIn) return needSignIn();
    setBusy('fav');
    const r = await setChoraFavorite(track.id, !faved);
    setBusy(null);
    if (r === null) say('Couldn’t save that — try again');
  };

  const toggleLib = async () => {
    if (!signedIn) return needSignIn();
    setBusy('lib');
    const r = await setInLibrary(track, album, !saved);
    setBusy(null);
    if (r === null) say('Couldn’t update your library');
    else say(r ? 'Added to your library' : 'Removed from your library');
  };

  const toggleFollow = async () => {
    if (!artist) return;
    if (!signedIn) return needSignIn();
    setBusy('follow');
    try {
      if (artist.kind === 'plajah') {
        const r = await setFollowArtist(artist.uid, follow !== true);
        if (r === null) say('Couldn’t follow right now');
        else setFollow(r);
      } else {
        let session = getAudiusSession();
        if (!session || session.scope !== 'write') session = await startAudiusAuth({ scope: 'write' });
        if (!session) return;
        const next = follow !== true;
        const ok = next ? await followAudiusUser(artist.id) : await unfollowAudiusUser(artist.id);
        if (ok) { setFollow(next); invalidateAudiusLibrary(); } else say('Audius didn’t accept that — try again');
      }
    } finally { setBusy(null); }
  };

  const artistName = artist?.name || track.artist || album?.artist || 'artist';

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={toggleFav} disabled={busy === 'fav' || favorite?.busy}
        title={faved ? 'Remove from favorites' : favorite ? 'Favorite on Audius' : 'Favorite'}
        aria-pressed={faved}
        className={`${pill} ${faved ? 'border-red-400/50 bg-red-500/20 text-red-300' : off}`}>
        <Heart size={13} fill={faved ? 'currentColor' : 'none'} /> {faved ? 'Favorited' : 'Favorite'}
      </button>
      <button type="button" onClick={toggleLib} disabled={busy === 'lib'}
        title={saved ? 'Remove from your library' : 'Add to your library'} aria-pressed={saved}
        className={`${pill} ${saved ? 'text-white' : off}`}
        style={saved ? { borderColor: `${accent}88`, background: `${accent}33` } : undefined}>
        {saved ? <Check size={13} /> : <LibraryBig size={13} />} {saved ? 'In library' : 'Library'}
      </button>
      <button type="button" onClick={() => (signedIn ? setPicker(true) : needSignIn())} title="Add to a playlist" className={`${pill} ${off}`}>
        <ListPlus size={14} /> Playlist
      </button>
      {artist && !isOwnArtist && (
        <button type="button" onClick={toggleFollow} disabled={busy === 'follow' || follow === 'requested'}
          title={follow === true ? `Unfollow ${artistName}` : follow === 'requested' ? 'Follow request sent' : `Follow ${artistName}`}
          className={`${pill} ${follow === true ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : off} max-w-[14rem]`}>
          {follow === true ? <UserCheck size={13} /> : follow === 'requested' ? <Clock size={13} /> : <UserPlus size={13} />}
          <span className="truncate">{follow === true ? 'Following' : follow === 'requested' ? 'Requested' : `Follow ${artistName}`}</span>
        </button>
      )}
      {flash && <span role="status" className="text-[10px] font-bold text-white/60 ml-1">{flash}</span>}
      {picker && <PlaylistPickerModal track={track} onClose={() => setPicker(false)} onDone={() => say('Playlist updated')} />}
    </div>
  );
};

// One users/{uid} read shared by every post; re-renders when any post changes a list.
let listsSnapshot: Awaited<ReturnType<typeof loadMyMusicLists>> = null;
let listsVersion = 0;
function useMyMusicLists() {
  const [, force] = useState(0);
  useEffect(() => {
    let alive = true;
    loadMyMusicLists().then(l => { listsSnapshot = l; listsVersion++; if (alive) force(listsVersion); });
    const off = subscribeMyMusicLists(() => { listsVersion++; force(listsVersion); });
    return () => { alive = false; off(); };
  }, [auth.currentUser?.uid]);
  return listsSnapshot;
}

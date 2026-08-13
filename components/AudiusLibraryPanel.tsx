/**
 * AudiusLibraryPanel — "Your Audius" inside Chora.
 *
 * Connect an Audius account (real OAuth 2.0 + PKCE, see services/audiusAuth.ts) and your
 * favorites, reposts, playlists, albums and follows appear here — every one of them opening
 * in the NATIVE Chora surfaces (PlayerView album, artist page, Breakdown, Pixels, DJ), not a
 * separate Audius shell. Read-only and consented: we only ever read the library of the
 * account that just authorized us.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Music2, Heart, Repeat2, ListMusic, Disc3, Users, LogIn, LogOut,
  RefreshCw, Loader2, AlertCircle, Play, BadgeCheck, ExternalLink,
} from 'lucide-react';
import type { ArchiveTrack } from '../services/archiveContentService';
import type { AudiusAlbum, AudiusArtist } from '../services/audiusService';
import {
  loginWithAudius, logoutAudius, getAudiusSession,
  AUDIUS_SESSION_EVENT, type AudiusSession,
} from '../services/audiusAuth';
import { fetchAudiusLibrary, invalidateAudiusLibrary, type AudiusLibrary } from '../services/audiusLibrary';
import { resetRecommenderCaches } from '../services/musicRecommender';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { AdaptiveGrid } from '../src/lib/designSystem';

const PURPLE = '#7e22ce';
const card = { background: 'rgba(126,34,206,0.08)', border: '1px solid rgba(168,85,247,0.15)' };

type TabId = 'favorites' | 'reposts' | 'playlists' | 'albums' | 'following';

const TABS: { id: TabId; label: string; Icon: typeof Heart }[] = [
  { id: 'favorites', label: 'Favorites', Icon: Heart },
  { id: 'reposts',   label: 'Reposts',   Icon: Repeat2 },
  { id: 'playlists', label: 'Playlists', Icon: ListMusic },
  { id: 'albums',    label: 'Albums',    Icon: Disc3 },
  { id: 'following', label: 'Following', Icon: Users },
];

interface Props {
  /** Open an Audius collection in the native PlayerView album UI. */
  onOpenCollection: (collection: AudiusAlbum) => void;
  /** Play a single Audius track (opens the native single-track album view). */
  onPlayTrack: (track: ArchiveTrack) => void;
  /** Open an Audius artist's landing page. */
  onOpenArtist: (artist: AudiusArtist) => void;
}

const AudiusLibraryPanel: React.FC<Props> = ({ onOpenCollection, onPlayTrack, onOpenArtist }) => {
  const [session, setSession] = useState<AudiusSession | null>(() => getAudiusSession());
  const [library, setLibrary] = useState<AudiusLibrary | null>(null);
  const [tab, setTab] = useState<TabId>('favorites');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep in sync with logins/logouts triggered anywhere else in the app.
  useEffect(() => {
    const onChange = (e: Event) => setSession((e as CustomEvent).detail ?? null);
    window.addEventListener(AUDIUS_SESSION_EVENT, onChange);
    return () => window.removeEventListener(AUDIUS_SESSION_EVENT, onChange);
  }, []);

  const load = useCallback(async (force = false) => {
    if (!getAudiusSession()) { setLibrary(null); return; }
    setBusy(true);
    setError(null);
    try {
      const lib = await fetchAudiusLibrary({ force });
      setLibrary(lib);
      // A fresh follow list changes what the radio should play next.
      resetRecommenderCaches();
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your Audius library.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [session?.userId, load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await loginWithAudius({ scope: 'read' });
      invalidateAudiusLibrary();
    } catch (err: any) {
      setError(err?.message ?? 'Audius login failed.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await logoutAudius();
    invalidateAudiusLibrary();
    resetRecommenderCaches();
    setLibrary(null);
  };

  // ── Not connected — the invitation ──────────────────────────────────────────
  if (!session) {
    return (
      <section className="animate-in fade-in duration-500">
        <div className="rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5" style={card}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: PURPLE }}>
            <Music2 size={20} className="text-purple-100" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: '#a855f7' }}>
              Bring your Audius library
            </h3>
            <p className="text-xs text-white/50 mt-2 leading-relaxed max-w-xl">
              Connect your Audius account and your favorites, reposts, playlists and the artists you
              follow show up right here — playing in Chora's own player, with the Breakdown, Pixels
              and DJ mode on every track. Read-only: Chora never posts or changes anything on Audius.
            </p>
            {error && (
              <p className="flex items-start gap-1.5 text-[10px] mt-3 text-red-300">
                <AlertCircle size={12} className="shrink-0 mt-px" />{error}
              </p>
            )}
          </div>
          <button
            onClick={connect}
            disabled={busy}
            className="tap shrink-0 flex items-center gap-2 px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
            style={{ background: PURPLE, color: '#e9d5ff', boxShadow: '0 0 20px rgba(126,34,206,0.45)' }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
            {busy ? 'Connecting…' : 'Log in with Audius'}
          </button>
        </div>
      </section>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────────
  const counts: Record<TabId, number> = {
    favorites: library?.favorites.length ?? 0,
    reposts: library?.reposts.length ?? 0,
    playlists: library?.playlists.length ?? 0,
    albums: library?.albums.length ?? 0,
    following: library?.following.length ?? 0,
  };

  const tracks = tab === 'favorites' ? library?.favorites ?? []
    : tab === 'reposts' ? library?.reposts ?? [] : [];
  const collections = tab === 'playlists' ? library?.playlists ?? []
    : tab === 'albums' ? library?.albums ?? [] : [];
  const artists = tab === 'following' ? library?.following ?? [] : [];
  const isEmpty = !busy && !tracks.length && !collections.length && !artists.length;

  return (
    <section className="animate-in fade-in duration-500 space-y-4">
      {/* Header — who's connected */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: PURPLE }}>
          <Music2 size={10} className="text-purple-200" />
        </div>
        <h2 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: '#a855f7' }}>Your Audius</h2>
        <a
          href={`https://audius.co/${session.handle}`}
          target="_blank" rel="noopener noreferrer"
          className="tap flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold"
          style={{ background: 'rgba(126,34,206,0.2)', color: '#c084fc' }}
        >
          {session.profilePicture && (
            <img src={session.profilePicture} alt="" className="w-4 h-4 rounded-full object-cover" />
          )}
          @{session.handle}
          {session.verified && <BadgeCheck size={10} />}
          <ExternalLink size={8} />
        </a>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => load(true)} disabled={busy}
            title="Refresh from Audius"
            className="tap w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
            style={{ background: 'rgba(126,34,206,0.15)', color: '#c084fc' }}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
          <button
            onClick={disconnect}
            title="Disconnect Audius"
            className="tap w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white/80"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <LogOut size={11} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="tap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all"
            style={tab === id
              ? { background: PURPLE, color: '#e9d5ff' }
              : { background: 'rgba(126,34,206,0.1)', color: 'rgba(168,85,247,0.75)' }}
          >
            <Icon size={10} />
            {label}
            {counts[id] > 0 && <span className="opacity-60">{counts[id]}</span>}
          </button>
        ))}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[10px] text-red-300">
          <AlertCircle size={12} className="shrink-0 mt-px" />{error}
        </p>
      )}

      {busy && !library && (
        <div className="flex items-center gap-2 text-[10px] text-white/40 py-6">
          <Loader2 size={12} className="animate-spin" /> Loading your Audius library…
        </div>
      )}

      {isEmpty && (
        <p className="text-[10px] text-white/35 py-6 leading-relaxed">
          Nothing here yet. Favorite a track or follow an artist on Audius and it shows up next time
          you refresh. (If you've turned off third-party API access in your Audius settings, Chora
          can't read your library — that's by design.)
        </p>
      )}

      {/* Tracks — favorites / reposts */}
      {!!tracks.length && (
        <AdaptiveGrid phone={2} tablet={3} desktop={5} gap="1rem">
          {tracks.map(track => (
            <motion.div
              key={track.id} whileHover={{ y: -4 }}
              className="group cursor-pointer rounded-2xl p-3 transition-all"
              style={card}
              onClick={() => onPlayTrack(track)}
            >
              <div className="aspect-square rounded-xl overflow-hidden mb-3 relative">
                <img
                  src={thumb(track.thumbnailUrl, THUMB.small)}
                  onError={onThumbError(track.thumbnailUrl)}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                  loading="lazy" decoding="async"
                />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: PURPLE }}>
                    <Play size={14} fill="currentColor" className="text-purple-100 ml-0.5" />
                  </div>
                </div>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest truncate">{track.title}</p>
              <p className="text-[8px] truncate mt-0.5" style={{ color: 'rgba(168,85,247,0.7)' }}>{track.artist}</p>
            </motion.div>
          ))}
        </AdaptiveGrid>
      )}

      {/* Collections — playlists / albums */}
      {!!collections.length && (
        <AdaptiveGrid phone={2} tablet={4} desktop={6} gap="1rem">
          {collections.map(c => (
            <motion.div
              key={c.id} whileHover={{ y: -4 }}
              className="group cursor-pointer rounded-2xl p-3 transition-all"
              style={card}
              onClick={() => onOpenCollection(c)}
            >
              <div className="aspect-square rounded-xl overflow-hidden mb-3 relative">
                {c.artworkUrl
                  ? <img src={thumb(c.artworkUrl, THUMB.card) || undefined} onError={onThumbError(c.artworkUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(126,34,206,0.3)' }}><ListMusic size={24} style={{ color: '#a855f7' }} /></div>}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: PURPLE }}>
                    <Play size={14} fill="currentColor" className="text-purple-100 ml-0.5" />
                  </div>
                </div>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest truncate">{c.title}</p>
              <p className="text-[8px] truncate mt-0.5" style={{ color: 'rgba(168,85,247,0.7)' }}>
                by {c.curator} · {c.trackCount} tracks
              </p>
            </motion.div>
          ))}
        </AdaptiveGrid>
      )}

      {/* Following */}
      {!!artists.length && (
        <AdaptiveGrid phone={3} tablet={5} desktop={8} gap="1rem">
          {artists.map(a => (
            <motion.div
              key={a.id} whileHover={{ y: -4 }}
              className="group cursor-pointer text-center"
              onClick={() => onOpenArtist(a)}
            >
              <div className="aspect-square rounded-full overflow-hidden mb-2 relative" style={{ border: '1px solid rgba(168,85,247,0.25)' }}>
                {a.profilePicture
                  ? <img src={thumb(a.profilePicture, THUMB.small) || undefined} onError={onThumbError(a.profilePicture)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" decoding="async" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(126,34,206,0.3)' }}><Users size={18} style={{ color: '#a855f7' }} /></div>}
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest truncate flex items-center justify-center gap-1">
                <span className="truncate">{a.name}</span>
                {a.verified && <BadgeCheck size={9} style={{ color: '#c084fc' }} className="shrink-0" />}
              </p>
              <p className="text-[8px] truncate" style={{ color: 'rgba(168,85,247,0.7)' }}>
                {a.trackCount} tracks
              </p>
            </motion.div>
          ))}
        </AdaptiveGrid>
      )}
    </section>
  );
};

export default AudiusLibraryPanel;

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Music2, User, Newspaper, Library, ExternalLink, Play, Disc,
  ChevronRight, Sparkles, Calendar, Film, MapPin, Ticket,
} from 'lucide-react';
import { Track } from '../types';
import {
  fetchArtistProfile, fetchDiscography, fetchArtistNews,
  fetchArtistEvents, fetchArtistVideos,
  ArtistProfile, ReleaseGroup, NewsItem, ArtistEvent, ArtistVideo,
} from '../services/musicEnrichment';
import { fetchPersonalTracks } from '../services/backendService';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  PersonalArtistPage — rich artist page for music locker artists
 *  (external artists not on Plajah). Fetches bio from Wikipedia,
 *  discography from MusicBrainz + Cover Art Archive, social links
 *  from MusicBrainz URL relations, news via Google News, tour dates
 *  from Bandsintown, and videos from YouTube RSS.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Tab = 'MUSIC' | 'ABOUT' | 'EVENTS' | 'VIDEOS' | 'NEWS' | 'LIBRARY';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'MUSIC',   label: 'Music',        icon: Music2 },
  { id: 'ABOUT',   label: 'About',        icon: User },
  { id: 'EVENTS',  label: 'Events',       icon: Calendar },
  { id: 'VIDEOS',  label: 'Videos',       icon: Film },
  { id: 'NEWS',    label: 'News',         icon: Newspaper },
  { id: 'LIBRARY', label: 'Your Library', icon: Library },
];

interface Props {
  artistName: string;
  lockerTracks?: Track[];       // optional — if not provided, we fetch ourselves
  onBack: () => void;
  onPlayTrack?: (track: Track) => void;
}

const SOCIAL_ICONS: Record<string, string> = {
  instagram: '📷', x: '𝕏', facebook: '📘', tiktok: '🎵',
  spotify: '🎧', appleMusic: '🍎', youtube: '▶️', soundcloud: '☁️',
  bandcamp: '🎸', website: '🌐',
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return d; }
};

const fmtYear = (d?: string) => d?.slice(0, 4) || '';

const PersonalArtistPage: React.FC<Props> = ({ artistName, lockerTracks: lockerTracksProp, onBack, onPlayTrack }) => {
  const { playTrack, currentTrack, isPlaying, pause, resume } = useGlobalPlayer();

  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [discography, setDiscography] = useState<ReleaseGroup[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<ArtistEvent[]>([]);
  const [videos, setVideos] = useState<ArtistVideo[]>([]);
  const [myTracks, setMyTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [discoLoading, setDiscoLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('MUSIC');
  const [bioExpanded, setBioExpanded] = useState(false);
  const [discoFilter, setDiscoFilter] = useState<string>('All');
  const [coverErrors, setCoverErrors] = useState<Set<string>>(new Set());

  // ── Fetch locker tracks for this artist ──
  useEffect(() => {
    if (lockerTracksProp && lockerTracksProp.length > 0) {
      setMyTracks(lockerTracksProp);
      return;
    }
    // Fetch from Firestore and filter by artist name (case-insensitive, fuzzy)
    fetchPersonalTracks().then(all => {
      const lowerName = artistName.toLowerCase();
      const matched = all.filter(t => {
        const tArtist = (t.artist || '').toLowerCase();
        // Exact match, or the track artist contains the name, or the name contains the track artist
        return tArtist === lowerName
          || tArtist.includes(lowerName)
          || lowerName.includes(tArtist)
          // Handle "feat." variations: "Drake feat. Rihanna" should match "Drake"
          || tArtist.split(/\s*(?:feat\.?|ft\.?|&|,|×|x)\s*/i).some(part => part.trim().toLowerCase() === lowerName);
      });
      setMyTracks(matched);
    }).catch(() => setMyTracks([]));
  }, [artistName, lockerTracksProp]);

  // ── Fetch all enrichment data ──
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDiscoLoading(true);
    setProfile(null);
    setDiscography([]);
    setNews([]);
    setEvents([]);
    setVideos([]);
    setCoverErrors(new Set());

    (async () => {
      // Phase 1: Profile (Wikipedia + MusicBrainz — the "above the fold" data)
      const p = await fetchArtistProfile(artistName);
      if (!alive) return;
      setProfile(p);
      setLoading(false);

      // Phase 2: Everything else in parallel (discography needs MBID from profile)
      const [disco, newsItems, evts, vids] = await Promise.all([
        p.mbid ? fetchDiscography(p.mbid) : Promise.resolve([]),
        fetchArtistNews(artistName),
        fetchArtistEvents(artistName),
        fetchArtistVideos(artistName, p.youtubeChannelUrl),
      ]);
      if (!alive) return;
      setDiscography(disco);
      setNews(newsItems);
      setEvents(evts);
      setVideos(vids);
      setDiscoLoading(false);
    })();

    return () => { alive = false; };
  }, [artistName]);

  // ── Discography type filter ──
  const discoTypes = useMemo(() => {
    const types = new Set(discography.map(r => r.primaryType));
    return ['All', ...Array.from(types).sort()];
  }, [discography]);

  const filteredDisco = useMemo(() =>
    discoFilter === 'All' ? discography : discography.filter(r => r.primaryType === discoFilter),
  [discography, discoFilter]);

  // Separate upcoming releases (future dates)
  const upcomingReleases = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    return discography.filter(r => r.firstReleaseDate && r.firstReleaseDate > now);
  }, [discography]);

  // ── Play locker track ──
  const handlePlay = (track: Track) => {
    if (onPlayTrack) { onPlayTrack(track); return; }
    const isActive = currentTrack?.id === track.id;
    if (isActive && isPlaying) { pause(); return; }
    if (isActive) { resume(); return; }
    playTrack(track, null, 'LIBRARY');
  };

  const isTrackActive = (t: Track) => currentTrack?.id === t.id;

  const heroImg = profile?.portrait || myTracks[0]?.albumCover || myTracks[0]?.images?.[0];

  // Hide tabs that have no data
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'EVENTS' && events.length === 0 && !loading) return false;
    if (tab.id === 'VIDEOS' && videos.length === 0 && !loading) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0610] text-white overflow-y-auto overscroll-contain">
      {/* ── Hero ── */}
      <div className="relative h-[340px] sm:h-[400px] overflow-hidden">
        {heroImg ? (
          <img
            src={heroImg}
            className="absolute inset-0 w-full h-full object-cover object-top scale-105 blur-[2px]"
            loading="eager"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #005f73 0%, #0a9396 50%, #94d2bd 100%)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,14,20,0.3) 0%, rgba(10,14,20,0.7) 60%, #080c10 100%)' }} />

        <button
          onClick={onBack}
          className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl transition-all hover:scale-110"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <ArrowLeft size={18} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 flex items-end gap-5">
          {profile?.thumbnail && (
            <img
              src={profile.thumbnail}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-2xl shrink-0"
              style={{ border: '2px solid rgba(0,218,243,0.3)' }}
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight truncate">{artistName}</h1>
            {profile?.subtitle && (
              <p className="text-sm text-white/50 mt-1 capitalize">{profile.subtitle}</p>
            )}
            {profile?.tags && profile.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {profile.tags.slice(0, 5).map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                    style={{ background: 'rgba(0,218,243,0.15)', border: '1px solid rgba(0,218,243,0.35)', color: '#67e8f9' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {profile && profile.socials.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {profile.socials.map(s => (
                  <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all hover:scale-105"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(0,218,243,0.2)' }}>
                    <span>{SOCIAL_ICONS[s.platform] || '🔗'}</span>
                    <span>{s.label}</span>
                    <ExternalLink size={8} className="opacity-40" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Upcoming releases banner ── */}
      {upcomingReleases.length > 0 && (
        <div className="mx-6 sm:mx-8 -mt-2 mb-2 p-3 rounded-xl flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, rgba(0,218,243,0.2), rgba(14,165,233,0.15))', border: '1px solid rgba(0,218,243,0.35)' }}>
          <Sparkles size={16} className="text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Upcoming Release</p>
            <p className="text-xs font-bold truncate">{upcomingReleases[0].title} · {fmtDate(upcomingReleases[0].firstReleaseDate)}</p>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="sticky top-0 z-40 backdrop-blur-xl border-b px-4 sm:px-8"
        style={{ background: 'rgba(8,12,16,0.85)', borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex gap-1 overflow-x-auto py-2 hide-scrollbar">
          {visibleTabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap transition-all"
                style={{
                  background: active ? 'rgba(0,218,243,0.2)' : 'transparent',
                  color: active ? '#a5f3fc' : 'rgba(255,255,255,0.35)',
                }}>
                <tab.icon size={13} />
                {tab.label}
                {tab.id === 'LIBRARY' && myTracks.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px]"
                    style={{ background: 'rgba(0,218,243,0.35)', color: '#cffafe' }}>
                    {myTracks.length}
                  </span>
                )}
                {tab.id === 'EVENTS' && events.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px]"
                    style={{ background: 'rgba(255,140,0,0.4)', color: '#fdba74' }}>
                    {events.length}
                  </span>
                )}
                {active && (
                  <motion.div layoutId="personal-artist-tab" className="absolute inset-0 rounded-full -z-10"
                    style={{ background: 'rgba(0,218,243,0.2)', border: '1px solid rgba(0,218,243,0.4)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="p-6 sm:p-8 space-y-6 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-white/5" />
          <div className="h-4 w-1/2 rounded bg-white/5" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-square rounded-xl bg-white/5" />
                <div className="h-3 w-2/3 rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      {!loading && (
        <AnimatePresence mode="sync">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="p-6 sm:p-8 pb-32">

            {/* ── MUSIC tab ── */}
            {activeTab === 'MUSIC' && (
              <div>
                {discoLoading && discography.length === 0 ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-3 w-40 rounded bg-white/5" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="aspect-square rounded-xl bg-white/5" />
                          <div className="h-2.5 w-2/3 rounded bg-white/5" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : discography.length === 0 ? (
                  <div className="text-center py-16">
                    <Disc className="mx-auto text-white/10 mb-4" size={48} />
                    <p className="text-xs font-black uppercase tracking-widest text-white/20">
                      No discography found on MusicBrainz
                    </p>
                  </div>
                ) : (
                  <>
                    {discoTypes.length > 2 && (
                      <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar">
                        {discoTypes.map(t => (
                          <button key={t} onClick={() => setDiscoFilter(t)}
                            className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all"
                            style={{
                              background: discoFilter === t ? 'rgba(0,218,243,0.25)' : 'rgba(255,255,255,0.05)',
                              color: discoFilter === t ? '#a5f3fc' : 'rgba(255,255,255,0.35)',
                              border: `1px solid ${discoFilter === t ? 'rgba(0,218,243,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            }}>
                            {t} {t !== 'All' && <span className="ml-1 opacity-50">({discography.filter(r => r.primaryType === t).length})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                      {filteredDisco.map(release => (
                        <div key={release.id} className="group">
                          <div className="aspect-square rounded-xl overflow-hidden mb-2 relative"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {!coverErrors.has(release.id) ? (
                              <img
                                src={release.coverUrl}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                                onError={() => setCoverErrors(prev => new Set(prev).add(release.id))}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Disc size={32} className="text-white/10" />
                              </div>
                            )}
                            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider"
                              style={{
                                background: release.primaryType === 'Album' ? 'rgba(0,180,216,0.85)'
                                  : release.primaryType === 'Single' ? 'rgba(0,119,182,0.8)'
                                  : 'rgba(72,202,228,0.8)',
                                color: 'rgba(255,255,255,0.95)',
                              }}>
                              {release.primaryType}
                            </div>
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest truncate group-hover:text-cyan-300 transition-colors">
                            {release.title}
                          </h4>
                          <p className="text-[9px] text-white/30 font-bold tracking-widest">
                            {fmtYear(release.firstReleaseDate)}
                            {release.secondaryTypes?.length ? ` · ${release.secondaryTypes.join(', ')}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── ABOUT tab ── */}
            {activeTab === 'ABOUT' && (
              <div className="max-w-3xl space-y-8">
                {profile?.bio ? (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Biography</h3>
                    <div className="relative">
                      <p className={`text-sm leading-relaxed text-white/70 ${!bioExpanded ? 'line-clamp-4' : ''}`}>
                        {profile.bio}
                      </p>
                      {profile.bio.length > 300 && (
                        <button onClick={() => setBioExpanded(!bioExpanded)}
                          className="mt-2 text-[10px] font-black uppercase tracking-widest transition-colors"
                          style={{ color: '#00daf3' }}>
                          {bioExpanded ? 'Show Less' : 'Read More'}
                        </button>
                      )}
                    </div>
                    {profile.wikiUrl && (
                      <a href={profile.wikiUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-3 text-[9px] font-bold uppercase tracking-widest transition-colors hover:text-cyan-300"
                        style={{ color: 'rgba(0,218,243,0.7)' }}>
                        Full article on Wikipedia <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <User className="mx-auto text-white/10 mb-3" size={32} />
                    <p className="text-xs text-white/20 font-bold">No biography found</p>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {profile?.type && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1">Type</p>
                      <p className="text-sm font-bold">{profile.type}</p>
                    </div>
                  )}
                  {profile?.area && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1">Origin</p>
                      <p className="text-sm font-bold">{profile.area}</p>
                    </div>
                  )}
                  {discography.length > 0 && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1">Releases</p>
                      <p className="text-sm font-bold">{discography.length}</p>
                    </div>
                  )}
                  <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1">In Your Locker</p>
                    <p className="text-sm font-bold">{myTracks.length} {myTracks.length === 1 ? 'track' : 'tracks'}</p>
                  </div>
                </div>
                {profile && profile.socials.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Links</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.socials.map(s => (
                        <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <span className="text-base">{SOCIAL_ICONS[s.platform] || '🔗'}</span>
                          {s.label}
                          <ExternalLink size={10} className="opacity-30" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── EVENTS tab ── */}
            {activeTab === 'EVENTS' && (
              <div className="max-w-3xl space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-4">Upcoming Tour Dates</h3>
                {events.map((event, i) => (
                  <a key={i} href={event.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-4 p-4 rounded-xl group transition-all hover:bg-white/[0.03]"
                    style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
                      style={{ background: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.2)' }}>
                      <span className="text-[9px] font-black uppercase tracking-wider text-orange-300">
                        {event.date ? new Date(event.date).toLocaleDateString('en-US', { month: 'short' }) : ''}
                      </span>
                      <span className="text-lg font-black text-orange-200">
                        {event.date ? new Date(event.date).getDate() : '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold leading-snug group-hover:text-cyan-300 transition-colors truncate">
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin size={10} className="text-white/25 shrink-0" />
                        <span className="text-[10px] text-white/40 truncate">{event.venue} · {event.city}{event.country ? `, ${event.country}` : ''}</span>
                      </div>
                    </div>
                    <Ticket size={14} className="text-white/15 shrink-0 mt-1 group-hover:text-orange-300 transition-colors" />
                  </a>
                ))}
              </div>
            )}

            {/* ── VIDEOS tab ── */}
            {activeTab === 'VIDEOS' && (
              <div className="max-w-4xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map((video, i) => (
                    <a key={i} href={video.url} target="_blank" rel="noopener noreferrer"
                      className="group rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
                      style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="relative aspect-video bg-black/30">
                        <img src={video.thumbnail} className="w-full h-full object-cover" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-sm"
                            style={{ background: 'rgba(0,218,243,0.85)' }}>
                            <Play size={20} className="text-black ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="text-xs font-bold line-clamp-2 group-hover:text-cyan-300 transition-colors">
                          {video.title}
                        </h4>
                        {video.pubDate && (
                          <p className="text-[9px] text-white/25 mt-1">{fmtDate(video.pubDate)}</p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── NEWS tab ── */}
            {activeTab === 'NEWS' && (
              <div className="max-w-3xl space-y-3">
                {news.length === 0 ? (
                  <div className="text-center py-16">
                    <Newspaper className="mx-auto text-white/10 mb-4" size={48} />
                    <p className="text-xs font-black uppercase tracking-widest text-white/20">
                      No recent news found
                    </p>
                  </div>
                ) : (
                  news.map((item, i) => (
                    <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-4 p-4 rounded-xl group transition-all hover:bg-white/[0.03]"
                      style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold leading-snug group-hover:text-cyan-300 transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          {item.source && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{item.source}</span>
                          )}
                          {item.pubDate && (
                            <span className="text-[9px] text-white/20">{fmtDate(item.pubDate)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-white/15 shrink-0 mt-1 group-hover:text-white/40 transition-colors" />
                    </a>
                  ))
                )}
              </div>
            )}

            {/* ── YOUR LIBRARY tab ── */}
            {activeTab === 'LIBRARY' && (
              <div className="max-w-3xl">
                {myTracks.length === 0 ? (
                  <div className="text-center py-16">
                    <Library className="mx-auto text-white/10 mb-4" size={48} />
                    <p className="text-xs font-black uppercase tracking-widest text-white/20">
                      No tracks by {artistName} in your locker
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-4">
                      {myTracks.length} {myTracks.length === 1 ? 'track' : 'tracks'} in your Music Locker
                    </p>
                    {myTracks.map((track, i) => {
                      const active = isTrackActive(track);
                      return (
                        <button key={track.id || i} onClick={() => handlePlay(track)}
                          className="w-full flex items-center gap-4 p-3 rounded-xl text-left group transition-all"
                          style={{
                            background: active ? 'rgba(0,218,243,0.15)' : 'transparent',
                            border: `1px solid ${active ? 'rgba(0,218,243,0.35)' : 'transparent'}`,
                          }}>
                          <span className="text-sm font-bold w-6 text-center shrink-0"
                            style={{ color: active ? '#00daf3' : 'rgba(255,255,255,0.2)' }}>
                            {active && isPlaying ? '▶' : i + 1}
                          </span>
                          {(track.albumCover || track.images?.[0]) && (
                            <img src={track.albumCover || track.images?.[0] || ''}
                              className="w-10 h-10 rounded-lg object-cover shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} loading="lazy" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold uppercase tracking-widest truncate transition-colors ${active ? 'text-cyan-300' : 'group-hover:text-white'}`}>
                              {track.title || 'Untitled'}
                            </p>
                            {track.albumTitle && (
                              <p className="text-[9px] text-white/25 truncate">{track.albumTitle}</p>
                            )}
                          </div>
                          {track.duration && (
                            <span className="text-[9px] text-white/20 shrink-0 tabular-nums">
                              {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default PersonalArtistPage;

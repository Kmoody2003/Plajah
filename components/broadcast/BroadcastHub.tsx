import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Radio, Tv, Wifi, Play, Signal, ChevronRight } from 'lucide-react';
import { useBroadcastDirectory, FastChannelListing, LiveSourceEntry } from '../../hooks/useBroadcastDirectory';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import type { LiveFeed } from '../../types';
import type { RadioStation } from '../../services/radioBrowser';

const FastChannelPlayer = lazy(() => import('../FastChannelPlayer'));
const TvLiveSourcePlayer = lazy(() => import('../tv/TvLiveSourcePlayer'));

// The Broadcast mega-guide: everything on air on Plajah — live streams, FAST channels, external live
// feeds and streaming radio — with the people you follow pulled to the front. One card taps you in.

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';

const Rail: React.FC<{ title: string; icon: React.ReactNode; count?: number; children: React.ReactNode }> = ({ title, icon, count, children }) => (
  <section className="mb-7">
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-white/70">{icon}</span>
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">{title}</h3>
      {count != null && <span className="text-[10px] font-black text-white/30 tabular-nums">{count}</span>}
    </div>
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>{children}</div>
  </section>
);

const LiveBadge = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[7px] font-black uppercase tracking-widest leading-none">
    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />Live
  </span>
);

const CardShell: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="group relative shrink-0 w-40 h-52 rounded-2xl overflow-hidden border border-white/10 bg-[#141019] text-left hover:border-white/25 transition-all">
    {children}
  </button>
);

const cover = (url?: string, seed?: string) =>
  url || `https://picsum.photos/seed/${encodeURIComponent(seed || 'plajah')}/320/420`;

const BroadcastHub: React.FC<{ currentUserId?: string | null }> = ({ currentUserId }) => {
  const dir = useBroadcastDirectory(currentUserId);
  const { playTrack } = useGlobalPlayerState();
  const [openFast, setOpenFast] = useState<FastChannelListing | null>(null);
  const [openSource, setOpenSource] = useState<LiveSourceEntry | null>(null);

  const openStream = (f: LiveFeed) => window.dispatchEvent(new CustomEvent('PLAY_LIVE_FEED', { detail: { feed: f } }));

  const playRadio = (s: RadioStation) => {
    const track: any = { id: `radio:${s.uuid}`, title: s.name, artist: [s.country, s.language].filter(Boolean).join(' · ') || 'Live Radio', url: s.url, albumCover: s.favicon || undefined, images: s.favicon ? [s.favicon] : undefined, genre: s.tags?.[0], tags: s.tags };
    const album: any = { id: `radio_${s.uuid}`, title: s.name, artist: track.artist, coverImage: s.favicon || '', type: 'MUSIC', tracks: [track] };
    playTrack(track, album, 'RADIO', undefined, true);
  };

  // Personalise: split out the things owned by people you follow.
  const { followingStreams, followingFast, followingSources } = useMemo(() => {
    const f = dir.followingIds;
    return {
      followingStreams: dir.liveStreams.filter(s => f.has((s as any).ownerId)),
      followingFast: dir.fastChannels.filter(c => f.has(c.ownerId)),
      followingSources: dir.liveSources.filter(s => f.has(s.ownerId)),
    };
  }, [dir]);

  const hasFollowing = followingStreams.length + followingFast.length + followingSources.length > 0;

  const StreamCard = (f: LiveFeed) => (
    <CardShell key={(f as any).id} onClick={() => openStream(f)}>
      <img src={cover((f as any).ownerPhoto, (f as any).ownerId)} alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,9,16,.1) 30%, rgba(11,9,16,.92) 100%)' }} />
      <div className="absolute top-2 left-2"><LiveBadge /></div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">{(f as any).ownerName || 'Creator'}</p>
        <p className="text-[10px] text-white/60 truncate">{(f as any).title || 'Live stream'}</p>
      </div>
      <div className="absolute right-2 bottom-2 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all" style={{ background: BRAND }}><Play size={13} className="text-white" fill="currentColor" /></div>
    </CardShell>
  );

  const FastCard = (c: FastChannelListing) => (
    <CardShell key={`fast_${c.ownerId}`} onClick={() => setOpenFast(c)}>
      <img src={cover(c.logoUrl || c.profile?.coverArt || c.profile?.photoURL, c.ownerId)} alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,9,16,.1) 30%, rgba(11,9,16,.92) 100%)' }} />
      <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white text-[7px] font-black uppercase tracking-widest" style={{ background: BRAND }}><Tv size={9} /> Channel{c.number != null ? ` ${c.number}` : ''}</div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">{c.name}</p>
        {c.category && <p className="text-[10px] text-white/60 truncate">{c.category}</p>}
      </div>
    </CardShell>
  );

  const SourceCard = (e: LiveSourceEntry) => (
    <CardShell key={`src_${e.ownerId}_${e.source.id}`} onClick={() => setOpenSource(e)}>
      <img src={cover((e.source as any).logoUrl, e.ownerId)} alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,9,16,.1) 30%, rgba(11,9,16,.92) 100%)' }} />
      <div className="absolute top-2 left-2"><LiveBadge /></div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">{e.source.name || 'Live feed'}</p>
        <p className="text-[10px] text-white/60 truncate">{e.source.type === 'REELLO_LIVE' ? 'Reello Live' : 'External live'}</p>
      </div>
    </CardShell>
  );

  const RadioCard = (s: RadioStation) => (
    <button key={s.uuid} onClick={() => playRadio(s)} className="group shrink-0 w-40 h-52 rounded-2xl overflow-hidden border border-white/10 bg-[#141019] hover:border-white/25 transition-all flex flex-col">
      <div className="flex-1 relative flex items-center justify-center bg-white/[0.04]">
        {s.favicon ? <img src={s.favicon} alt="" className="w-20 h-20 object-contain" crossOrigin="anonymous" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <Radio size={30} className="text-white/25" />}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 text-white/80 text-[7px] font-black uppercase tracking-widest"><Signal size={8} /> Radio</div>
      </div>
      <div className="p-3 text-left">
        <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">{s.name}</p>
        <p className="text-[10px] text-white/50 truncate">{[s.country, s.tags?.[0]].filter(Boolean).join(' · ') || 'Live radio'}</p>
      </div>
    </button>
  );

  const nothing = !dir.loading && !dir.liveStreams.length && !dir.fastChannels.length && !dir.liveSources.length && !dir.streamingRadio.length;

  return (
    <div className="max-w-[1500px] mx-auto w-full px-1">
      <div className="mb-5 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ background: BRAND, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>The Broadcast Guide</p>
        <p className="text-white/40 text-xs mt-1">Everything on air right now — live streams, channels &amp; radio, all in one place.</p>
      </div>

      {hasFollowing && (
        <Rail title="From people you follow" icon={<Signal size={14} />}>
          {followingStreams.map(StreamCard)}
          {followingSources.map(SourceCard)}
          {followingFast.map(FastCard)}
        </Rail>
      )}

      {dir.liveStreams.length > 0 && (
        <Rail title="Live now" icon={<Wifi size={14} />} count={dir.liveStreams.length}>
          {dir.liveStreams.map(StreamCard)}
        </Rail>
      )}

      {dir.fastChannels.length > 0 && (
        <Rail title="FAST channels" icon={<Tv size={14} />} count={dir.fastChannels.length}>
          {dir.fastChannels.map(FastCard)}
        </Rail>
      )}

      {dir.liveSources.length > 0 && (
        <Rail title="Live feeds &amp; channels" icon={<Signal size={14} />} count={dir.liveSources.length}>
          {dir.liveSources.map(SourceCard)}
        </Rail>
      )}

      {dir.streamingRadio.length > 0 && (
        <Rail title="Radio stations" icon={<Radio size={14} />}>
          {dir.streamingRadio.map(RadioCard)}
        </Rail>
      )}

      {dir.loading && <div className="py-16 text-center text-white/30 text-[11px] font-black uppercase tracking-widest">Tuning the guide…</div>}
      {nothing && <div className="py-16 text-center text-white/30 text-[11px] font-black uppercase tracking-widest">Nothing's on air right now — check back soon.</div>}

      {/* Players */}
      {openFast && (
        <Suspense fallback={null}>
          <FastChannelPlayer profile={openFast.profile} onClose={() => setOpenFast(null)} />
        </Suspense>
      )}
      {openSource && (
        <Suspense fallback={null}>
          <TvLiveSourcePlayer ownerId={openSource.ownerId} source={openSource.source} onClose={() => setOpenSource(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default BroadcastHub;

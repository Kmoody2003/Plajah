import React from 'react';
import { Radio, Tv, Play, Eye } from 'lucide-react';
import type { LiveFeed, Organization } from '../../types';
import MediaThumb from '../ui/MediaThumb';
import { useOrgLive, useOrgChannels, type OrgChannel } from '../../services/orgMedia';

/**
 * "On air now" — the very top of an org's public page. Renders NOTHING (no space) unless the org's
 * media account is live right now or has a TV channel on air. Realtime. Sanctuary / members-only
 * streams and sources are gated in services/orgMedia (never bypassed here).
 */
interface Props {
  org: Organization;
  /** True when the viewer is an active member of the org (unlocks its members-only sources). */
  viewerIsOrgMember?: boolean;
  onOpenLive?: (feed: LiveFeed) => void;
  onOpenChannel?: (channelOwnerId: string, sourceId?: string) => void;
}

const liveThumb = (f: LiveFeed, org: Organization): string | undefined =>
  f.muxPlaybackId ? `https://image.mux.com/${f.muxPlaybackId}/thumbnail.jpg?time=0` : (org.coverUrl || f.ownerPhoto || org.logoUrl);

const OrgLiveNow: React.FC<Props> = ({ org, viewerIsOrgMember = false, onOpenLive, onOpenChannel }) => {
  const live = useOrgLive(org, viewerIsOrgMember);
  const channels = useOrgChannels(org, viewerIsOrgMember);
  if (!live.length && !channels.length) return null;

  const accent = org.accentColor || '#FF6A00';
  const watch = (f: LiveFeed) => {
    if (onOpenLive) onOpenLive(f);
    else { try { window.dispatchEvent(new CustomEvent('PLAY_LIVE_FEED', { detail: { feed: f } })); } catch { /* */ } }
  };
  const tune = (c: OrgChannel) => onOpenChannel?.(c.ownerId, c.sourceId);
  const hero = live.length > 0;

  return (
    <section aria-label="On air now" className="mt-6 space-y-3">
      {live.map((f, i) => (
        <div key={f.id} className="relative overflow-hidden rounded-3xl border" style={{ borderColor: `${accent}66`, background: `linear-gradient(135deg, ${accent}22, rgba(255,255,255,0.03))` }}>
          <div className="flex flex-col sm:flex-row">
            <button onClick={() => watch(f)} aria-label={`Watch live: ${f.title}`}
              className={`relative w-full sm:w-72 shrink-0 bg-black overflow-hidden ${i === 0 ? 'aspect-video' : 'aspect-video sm:aspect-auto sm:min-h-[8rem]'} focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}>
              <MediaThumb src={liveThumb(f, org)} alt="" fallback={<div className="absolute inset-0 grid place-items-center bg-[#111]"><Radio size={28} className="text-white/20" /></div>} />
              <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
              </span>
              <span className="absolute inset-0 grid place-items-center opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity bg-black/30"><Play size={34} className="text-white" fill="white" /></span>
            </button>
            <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-center gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>{org.name} is live</p>
                <h2 className="text-lg sm:text-xl font-black text-white leading-tight line-clamp-2 mt-1">{f.title || 'Live now'}</h2>
                {typeof (f as any).viewerCount === 'number' && (f as any).viewerCount > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px] text-white/50 mt-1"><Eye size={12} /> {(f as any).viewerCount.toLocaleString()} watching</p>
                )}
              </div>
              <div>
                <button onClick={() => watch(f)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ background: accent }}>
                  <Play size={14} fill="currentColor" /> Watch live
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {channels.map(c => (
        <div key={c.key} className={`flex items-center gap-3 rounded-2xl border bg-white/[0.04] ${hero ? 'p-3' : 'p-4'}`} style={{ borderColor: `${accent}44` }}>
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#111] border border-white/10 grid place-items-center shrink-0 relative">
            {c.logoUrl ? <MediaThumb src={c.logoUrl} alt="" fit="contain" /> : <Tv size={20} className="text-white/40" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40">
              <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> On air</span>
              {typeof c.number === 'number' && <span>Ch {c.number}</span>}
            </p>
            <p className="text-sm font-black text-white truncate">{c.name}</p>
            {c.nowPlaying && <p className="text-[11px] text-white/50 truncate">Now playing: {c.nowPlaying}</p>}
          </div>
          {onOpenChannel && (
            <button onClick={() => tune(c)} className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ background: accent }}>
              <Tv size={13} /> Watch channel
            </button>
          )}
        </div>
      ))}
    </section>
  );
};

export default OrgLiveNow;

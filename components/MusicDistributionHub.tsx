import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Music2, Radio, Users, DollarSign, Globe, Check, ArrowRight,
  Zap, TrendingUp, Play, Star, Headphones, ChevronRight, Film,
} from 'lucide-react';
import { fetchUserAlbums, fetchUserProfile, auth } from '../services/backendService';
import type { Album, UserProfile } from '../types';
import ArtistRadioBuilder from './ArtistRadioBuilder';
import PodcastDistributionHub from './PodcastDistributionHub';

interface Props {
  user: UserProfile;
  onCreateAlbum: () => void;
}

type HubTab = 'OVERVIEW' | 'RADIO' | 'PODCAST';

// ── Tier cards ────────────────────────────────────────────────────────────────

const TIERS = [
  {
    id: 'AUDIUS',
    label: 'Audius',
    subtitle: 'Decentralized Streaming',
    desc: 'Publish directly to the Audius decentralized network. Your music streams on Audius\'s 8M+ user platform — no label required.',
    color: '#7e22ce',
    metrics: ['8M+ Audius listeners', 'Decentralized ownership', 'No royalty split'],
  },
  {
    id: 'DIRECT',
    label: 'Direct Sales',
    subtitle: 'Per-Track · Per-Album',
    desc: 'Set your own prices. Fans buy directly from your Plajah page. You keep 100% of sales revenue via Stripe.',
    color: '#FF8C00',
    metrics: ['Per-track pricing', 'Full album purchase', 'Fan-to-artist, zero middleman'],
  },
  {
    id: 'RADIO',
    label: 'Artist Radio',
    subtitle: 'Your 24/7 Station',
    desc: 'Run your own artist radio station. Choose which tracks play, schedule shows, add stingers, and earn from ad breaks.',
    color: '#22c55e',
    metrics: ['Custom track rotation', 'Scheduled live shows', 'Ad break revenue'],
  },
  {
    id: 'MEMBERSHIP',
    label: 'Fan Membership',
    subtitle: 'Exclusive Access',
    desc: 'Gate exclusive tracks, early releases, and behind-the-scenes content behind your fan membership tiers.',
    color: '#f472b6',
    metrics: ['Exclusive track flag', 'Membership-gated content', 'Tiered access levels'],
  },
];

export default function MusicDistributionHub({ user, onCreateAlbum }: Props) {
  const [tab, setTab]                 = useState<HubTab>('OVERVIEW');
  const [musicAlbums, setMusicAlbums] = useState<Album[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      setMusicAlbums(a.filter(x => x.type === 'MUSIC' || !x.type));
      setLoading(false);
    });
  }, []);

  const backBtn = (
    <button onClick={() => setTab('OVERVIEW')}
      className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors mb-6">
      ← Music Studio
    </button>
  );

  if (tab === 'RADIO')   return <div>{backBtn}<ArtistRadioBuilder user={user} /></div>;
  if (tab === 'PODCAST') return <div>{backBtn}<PodcastDistributionHub /></div>;

  const published      = musicAlbums.filter(a => !a.isDraft);
  const audiusLinked   = musicAlbums.filter(a => a.audiusPublishStatus === 'published');
  const paywalled      = musicAlbums.filter(a => a.isPaywalled);
  const totalTracks    = musicAlbums.reduce((s, a) => s + (a.tracks?.length ?? 0), 0);
  const exclusiveTracks = musicAlbums.reduce((s, a) => s + (a.tracks?.filter(t => t.isExclusive).length ?? 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Music<br />Studio</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Audius · Direct Sales · Radio · Memberships</p>
        </div>
        <button onClick={onCreateAlbum}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-[#FF8C00] text-black hover:scale-105 active:scale-95 transition-all shadow-xl flex-shrink-0">
          <Music2 size={14} /> New Release
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Albums',          value: published.length,      icon: Music2,     color: 'text-[#FF8C00]',  bg: 'bg-[#FF8C00]/15'  },
          { label: 'Total Tracks',    value: totalTracks,           icon: Headphones, color: 'text-sky-400',    bg: 'bg-sky-400/15'    },
          { label: 'On Audius',       value: audiusLinked.length,   icon: Globe,      color: 'text-purple-400', bg: 'bg-purple-400/15' },
          { label: 'For Sale',        value: paywalled.length,      icon: DollarSign, color: 'text-green-400',  bg: 'bg-green-400/15'  },
          { label: 'Exclusive Tracks',value: exclusiveTracks,       icon: Star,       color: 'text-pink-400',   bg: 'bg-pink-400/15'   },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
            <div className={`p-3 ${s.bg} rounded-xl w-fit mb-3`}><s.icon className={s.color} size={16} /></div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
            <p className="text-2xl font-black">{loading ? '–' : s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Distribution tiers */}
      <section>
        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20 mb-5">Distribution Channels</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TIERS.map((tier, i) => (
            <motion.div key={tier.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
              className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 hover:bg-white/[0.04] transition-all">
              <div className="flex items-start gap-4 mb-5">
                <div className="p-3 rounded-2xl flex-shrink-0" style={{ background: `${tier.color}15`, color: tier.color }}>
                  <Radio size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">{tier.label}</h3>
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ background: `${tier.color}15`, color: tier.color }}>{tier.subtitle}</span>
                  </div>
                  <p className="text-[10px] text-white/35 mt-1.5 leading-relaxed">{tier.desc}</p>
                </div>
              </div>
              <ul className="space-y-1.5 mb-4">
                {tier.metrics.map((m, mi) => (
                  <li key={mi} className="flex items-center gap-2">
                    <Check size={10} style={{ color: tier.color }} className="flex-shrink-0" />
                    <span className="text-[9px] text-white/40">{m}</span>
                  </li>
                ))}
              </ul>
              {tier.id === 'RADIO' && (
                <button onClick={() => setTab('RADIO')}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all hover:gap-2.5"
                  style={{ color: tier.color }}>
                  Manage Station <ArrowRight size={11} />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Podcast section */}
      <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-purple-500/15">
              <Headphones size={20} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Podcast Distribution</h3>
              <p className="text-[10px] text-white/35 mt-1">Generate RSS 2.0 feeds · Submit to Apple, Spotify, Amazon, Google</p>
            </div>
          </div>
          <button onClick={() => setTab('PODCAST')}
            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-purple-400 hover:gap-2.5 transition-all">
            Manage Podcasts <ArrowRight size={11} />
          </button>
        </div>
      </section>

      {/* Audius status per album */}
      {musicAlbums.length > 0 && (
        <section>
          <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20 mb-5">Audius Publishing Status</p>
          <div className="space-y-2">
            {musicAlbums.slice(0, 8).map(a => (
              <div key={a.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                {a.coverImage ? (
                  <img src={a.coverImage} alt={a.title} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center flex-shrink-0">
                    <Music2 size={14} className="text-white/20" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest text-white truncate">{a.title}</p>
                  <p className="text-[9px] text-white/30">{a.tracks?.length ?? 0} tracks</p>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex-shrink-0"
                  style={{
                    background: a.audiusPublishStatus === 'published' ? 'rgba(124,58,237,0.12)' :
                                a.audiusPublishStatus === 'publishing' ? 'rgba(245,158,11,0.12)' :
                                a.audiusPublishStatus === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                    color:      a.audiusPublishStatus === 'published' ? '#a78bfa' :
                                a.audiusPublishStatus === 'publishing' ? '#fbbf24' :
                                a.audiusPublishStatus === 'failed' ? '#f87171' : 'rgba(255,255,255,0.2)',
                  }}>
                  {a.audiusPublishStatus ?? 'Not published'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}

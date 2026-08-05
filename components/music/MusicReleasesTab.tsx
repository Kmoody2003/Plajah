/**
 * Music Releases — Artist Manager › Music.
 *
 * Auto-populates a signed-in artist's real albums (from the `albums` collection),
 * then spins up a release campaign whose marketing assets are prefilled from the
 * album's own artwork + description/liner notes captured at upload time.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Music2, Plus, Sparkles, Rocket, Copy, Check, Calendar, Megaphone, Radio,
  ListChecks, Image as ImageIcon, TrendingUp, ExternalLink, Disc3,
} from 'lucide-react';
import { UserProfile, Album } from '../../types';
import { fetchUserContent } from '../../services/backendService';

const askAria = (prompt: string) => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));
const navigate = (target: string, extra: object = {}) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target, ...extra } }));

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';

function fmtDate(ts?: number) { return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }

function releaseStatus(a: Album): { label: string; color: string } {
  if (a.isScheduled && a.releaseDate && a.releaseDate > Date.now()) return { label: 'Scheduled', color: 'text-blue-400 bg-blue-500/15' };
  if (a.isDraft) return { label: 'Draft', color: 'text-white/40 bg-white/5' };
  if (a.isPublic) return { label: 'Released', color: 'text-emerald-400 bg-emerald-500/15' };
  return { label: 'Private', color: 'text-yellow-400 bg-yellow-500/10' };
}

// ─── Marketing asset generation (prefilled from the album itself) ────────────

interface MarketingKit {
  captions: { key: string; label: string; text: string }[];
  hashtags: string;
  checklist: string[];
}

function buildKit(a: Album): MarketingKit {
  const title = a.title || 'my new release';
  const artist = a.artist || 'the artist';
  const genre = a.genre || 'music';
  const trackCount = a.tracks?.length || 0;
  const blurb = (a.description || a.linerNotes || '').trim();
  const short = blurb.length > 160 ? blurb.slice(0, 157).trim() + '…' : blurb;
  const dateStr = a.releaseDate ? fmtDate(a.releaseDate) : 'soon';

  const captions = [
    { key: 'announce', label: 'Announcement', text: `📢 It's official — "${title}" is coming ${dateStr}.${short ? `\n\n${short}` : ''}\n\n${trackCount ? `${trackCount} tracks. ` : ''}Save it. Share it. See you on release day. 🎶` },
    { key: 'countdown', label: 'Countdown', text: `⏳ Not long now… "${title}" drops ${dateStr}.\n\nTurn on notifications so you don't miss it. Which track are you most excited for? 👀 #${genre.replace(/\s+/g, '')}` },
    { key: 'releaseday', label: 'Release Day', text: `🚀 "${title}" is OUT NOW.\n\n${short || `The one I've been working toward. This is ${artist} like you haven't heard yet.`}\n\nStream it, add it to your playlists, and let me know your favorite. Link in bio. ❤️` },
    { key: 'thankyou', label: 'Thank-You / Momentum', text: `🙏 The love for "${title}" has been unreal. Thank you for streaming, sharing, and showing up.\n\nIf it's on repeat, drop a 🎧 below — and tell a friend who needs to hear it.` },
  ];

  const tagBase = [genre, 'newmusic', 'nowplaying', 'newrelease', 'independentartist']
    .concat(artist.split(/\s+/).join('').toLowerCase())
    .concat(title.split(/\s+/).join('').toLowerCase());
  const hashtags = tagBase.filter(Boolean).map(t => `#${t.replace(/[^a-z0-9]/gi, '')}`).join(' ');

  const checklist = [
    'Set a release date & schedule the drop',
    'Submit to playlist curators 2–4 weeks out',
    'Post the announcement (artwork + caption above)',
    'Run a pre-save / release landing page',
    `Line up ${trackCount > 1 ? 'a focus-track' : 'a'} teaser clip for Reels/TikTok`,
    'Schedule the countdown + release-day posts',
    'Boost the release with a paid campaign',
    'Send it to your mailing list',
    'Thank fans + keep momentum in week one',
  ];

  return { captions, hashtags, checklist };
}

// ─── Component ───────────────────────────────────────────────────────────────

export const MusicReleasesTab: React.FC<{ currentUser?: UserProfile | null }> = ({ currentUser }) => {
  const uid = currentUser?.uid;
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string>('');

  useEffect(() => {
    let alive = true;
    if (!uid) { setLoading(false); return; }
    fetchUserContent(uid)
      .then((rows: Album[]) => { if (!alive) return; const music = (rows || []).filter(a => a.type === 'MUSIC' || !a.type); setAlbums(music); setSelId(music[0]?.id || ''); })
      .catch(() => { if (alive) setAlbums([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  const selected = albums.find(a => a.id === selId) || null;

  if (loading) return <div className="py-20 text-center text-white/30 text-xs font-black uppercase tracking-widest">Loading your releases…</div>;

  if (albums.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center border border-dashed border-white/15 text-white/20"><Disc3 size={24} /></div>
        <div className="max-w-xs"><p className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">No Releases Yet</p><p className="text-xs text-white/25 leading-relaxed">Upload an album or single and it appears here automatically — with a release campaign built from its artwork and description.</p></div>
        <button onClick={() => navigate('UPLOAD')} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/25 transition-all"><Plus size={13} /> Upload a Release</button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <p className="text-[10px] text-white/30 font-bold flex items-center gap-1.5"><Music2 size={11} className="text-[#FF8C00]" /> {albums.length} release{albums.length !== 1 ? 's' : ''} synced from your catalog</p>

      {/* Album grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {albums.map(a => {
          const st = releaseStatus(a);
          return (
            <button key={a.id} onClick={() => setSelId(a.id)} className={`text-left rounded-2xl overflow-hidden border transition-all ${selId === a.id ? 'border-[#FF8C00]/60' : 'border-white/[0.06] hover:border-white/15'}`}>
              <div className="aspect-square bg-white/5 relative">
                {a.coverImage ? <img src={a.coverImage} alt={a.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/15"><Music2 size={28} /></div>}
                <span className={`absolute top-2 left-2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full backdrop-blur ${st.color}`}>{st.label}</span>
              </div>
              <div className="p-2.5"><p className="text-[11px] font-black text-white truncate">{a.title}</p><p className="text-[9px] text-white/40 truncate">{a.tracks?.length || 0} track{(a.tracks?.length || 0) !== 1 ? 's' : ''}{a.genre ? ` · ${a.genre}` : ''}</p></div>
            </button>
          );
        })}
      </div>

      {selected && <ReleaseCampaign key={selected.id} album={selected} />}
    </motion.div>
  );
};

const ReleaseCampaign: React.FC<{ album: Album }> = ({ album }) => {
  const kit = useMemo(() => buildKit(album), [album.id]);
  const [copied, setCopied] = useState<string>('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const copy = (key: string, text: string) => { try { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* noop */ } };
  const toggle = (i: number) => setChecked(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const st = releaseStatus(album);
  const progress = Math.round((checked.size / kit.checklist.length) * 100);

  return (
    <div className="space-y-4">
      {/* Campaign hero — artwork-driven */}
      <div className={`${card} overflow-hidden`}>
        <div className="p-5 flex gap-4 items-center" style={{ background: `linear-gradient(135deg, ${album.themeColor || '#FF8C00'}22, transparent)` }}>
          {album.coverImage
            ? <img src={album.coverImage} alt={album.title} className="w-20 h-20 rounded-xl object-cover shrink-0 shadow-lg" />
            : <div className="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center text-white/20 shrink-0"><Music2 size={26} /></div>}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FF8C00]">Release Campaign</p>
            <h3 className="text-xl font-black text-white truncate">{album.title}</h3>
            <p className="text-[11px] text-white/40">{album.artist}{album.genre ? ` · ${album.genre}` : ''}{album.releaseDate ? ` · ${fmtDate(album.releaseDate)}` : ''}</p>
            <span className={`inline-flex mt-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
          </div>
        </div>
      </div>

      {/* Quick actions — reuse the platform's existing promo tooling */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Action icon={<Rocket size={15} />} label="Boost / Ads" desc="Paid campaign" color="#FF8C00" onClick={() => navigate('AD_PACKAGES')} />
        <Action icon={<ImageIcon size={15} />} label="Billboard Ad" desc="From cover art" color="#a855f7" onClick={() => navigate('AD_CREATOR', { promotedAssetId: album.id })} />
        <Action icon={<TrendingUp size={15} />} label="Analytics" desc="Track streams" color="#10b981" onClick={() => navigate('ANALYTICS', { albumId: album.id })} />
        <Action icon={<Megaphone size={15} />} label="Promote Hub" desc="Channels" color="#6366f1" onClick={() => navigate('ARTIST_MANAGER')} />
      </div>

      {/* Prefilled marketing copy */}
      <div className={`${card} p-5 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><Sparkles size={12} className="text-[#FF8C00]" /> Marketing Copy — prefilled from your album</p>
          <button onClick={() => askAria(`Act as my music marketing strategist. My release "${album.title}" by ${album.artist} (${album.genre || 'music'}) ${album.releaseDate ? `drops ${fmtDate(album.releaseDate)}` : 'is coming soon'}. Description: "${album.description || album.linerNotes || 'n/a'}". Write me a full 2-week rollout: platform-by-platform posts (IG, TikTok, X), a pre-save push, playlist pitch angles, and a paid-ad hook. Keep captions punchy.`)} className="flex items-center gap-1.5 text-[#FF8C00] text-[10px] font-black uppercase tracking-widest hover:text-[#ffa733]"><Sparkles size={11} /> Expand with Aria</button>
        </div>
        {kit.captions.map(c => (
          <div key={c.key} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{c.label}</span>
              <button onClick={() => copy(c.key, `${c.text}\n\n${kit.hashtags}`)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/80">{copied === c.key ? <><Check size={11} className="text-emerald-400" /> Copied</> : <><Copy size={11} /> Copy</>}</button>
            </div>
            <p className="text-[11px] text-white/70 whitespace-pre-line leading-relaxed">{c.text}</p>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-white/40 break-words flex-1">{kit.hashtags}</p>
          <button onClick={() => copy('tags', kit.hashtags)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/80 shrink-0 ml-2">{copied === 'tags' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}</button>
        </div>
      </div>

      {/* Release checklist */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><ListChecks size={12} className="text-[#FF8C00]" /> Release Week Checklist</p>
          <p className="text-[10px] font-black text-white/50">{progress}%</p>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3"><div className="h-full rounded-full bg-[#FF8C00]" style={{ width: `${progress}%` }} /></div>
        <div className="space-y-1.5">
          {kit.checklist.map((item, i) => (
            <button key={i} onClick={() => toggle(i)} className="w-full flex items-center gap-2.5 text-left py-1">
              <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${checked.has(i) ? 'bg-[#FF8C00] border-[#FF8C00]' : 'border-white/20'}`}>{checked.has(i) && <Check size={11} className="text-black" />}</span>
              <span className={`text-[11px] ${checked.has(i) ? 'text-white/30 line-through' : 'text-white/70'}`}>{item}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Action: React.FC<{ icon: React.ReactNode; label: string; desc: string; color: string; onClick: () => void }> = ({ icon, label, desc, color, onClick }) => (
  <button onClick={onClick} className={`${card} p-3 text-left hover:border-white/15 transition-all`}>
    <span className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5" style={{ background: `${color}20`, color }}>{icon}</span>
    <p className="text-[11px] font-black text-white leading-none">{label}</p>
    <p className="text-[9px] text-white/30 mt-1">{desc}</p>
  </button>
);

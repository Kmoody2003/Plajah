// ReelloChannelHeader — a creator's channel banner for the profile Videos tab. YouTube/Twitch
// channel-page energy, rendered in Plajah's brand aesthetic: a cover-art banner washed in the
// purple→magenta→orange gradient, a big gradient-ringed avatar, bold stats, and a Subscribe CTA.

import React from 'react';
import { UserProfile, NotifyLevel } from '../types';
import { BadgeCheck, Bell, BellOff, BellRing, Check, ChevronDown, Share2, Upload, Radio } from 'lucide-react';
import { canUpload, canGoLive } from '../services/tvCapabilities';
import { thumb as thumbUrl, onThumbError, THUMB } from '../src/lib/imageThumb';
import { getNotifyLevel, setNotifyLevel } from '../services/backendService';

const BRAND = 'linear-gradient(115deg,#6B0099 0%,#B4008C 42%,#D40055 66%,#FF8C00 100%)';

const fmt = (n?: number) => {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return `${v}`;
};

// ── Subscription bell ────────────────────────────────────────────────────────
// YouTube's bell, Plajah-flavoured: All / Highlights / None, persisted per-follow on the
// follow_relations doc. Only rendered once you're actually subscribed.
type BellIcon = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
const BELL_OPTIONS: { level: NotifyLevel; label: string; hint: string; icon: BellIcon }[] = [
  { level: 'ALL',        label: 'All',        hint: 'Every upload and every post',  icon: BellRing },
  { level: 'HIGHLIGHTS', label: 'Highlights', hint: 'New videos and going live only', icon: Bell },
  { level: 'NONE',       label: 'None',       hint: 'Subscribed, but stay quiet',   icon: BellOff },
];

const SubscriptionBell: React.FC<{ targetUid: string }> = ({ targetUid }) => {
  const [level, setLevel] = React.useState<NotifyLevel>('ALL');
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let alive = true;
    getNotifyLevel(targetUid).then(l => { if (alive && l !== 'NONE') setLevel(l); }).catch(() => {});
    return () => { alive = false; };
  }, [targetUid]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = async (next: NotifyLevel) => {
    setLevel(next);           // optimistic
    setOpen(false);
    try { await setNotifyLevel(targetUid, next); } catch { /* non-critical */ }
  };

  const Active = BELL_OPTIONS.find(o => o.level === level)?.icon || Bell;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notification settings"
        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-full border font-black text-[9px] uppercase tracking-widest transition-all ${
          level === 'NONE' ? 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
                           : 'bg-white/10 border-white/15 text-white/85 hover:bg-white/15'
        }`}
      >
        <Active size={13} />
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-60 p-1.5 bg-[#0a0a0a]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
          <p className="px-3 pt-2 pb-2 text-[7.5px] font-black uppercase tracking-[0.25em] text-white/30">Notify me</p>
          {BELL_OPTIONS.map(opt => (
            <button
              key={opt.level}
              onClick={() => pick(opt.level)}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                level === opt.level ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <opt.icon size={13} className={`mt-0.5 shrink-0 ${level === opt.level ? 'text-small-orange' : 'text-white/40'}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-[9.5px] font-black uppercase tracking-widest text-white">{opt.label}</span>
                <span className="block text-[9px] text-white/35 mt-0.5 leading-snug">{opt.hint}</span>
              </span>
              {level === opt.level && <Check size={12} className="text-small-orange mt-0.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="flex flex-col leading-none">
    <span className="text-base sm:text-lg font-black tabular-nums text-white">{value}</span>
    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mt-1">{label}</span>
  </div>
);

interface Props {
  profile: UserProfile;
  isOwner: boolean;
  videoCount: number;
  /** Cover art for the banner (a top video thumbnail or the creator's slideshow art). */
  bannerUrl?: string;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  onUpload?: () => void;
  onGoLive?: () => void;
  onShare?: () => void;
}

const ReelloChannelHeader: React.FC<Props> = ({
  profile, isOwner, videoCount, bannerUrl, isFollowing, onToggleFollow, onUpload, onGoLive, onShare,
}) => {
  const handle = '@' + (profile.displayName || 'creator').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  return (
    <div className="mb-8">
      {/* ── Banner ── */}
      <div className="relative h-40 sm:h-52 lg:h-60 rounded-[2rem] overflow-hidden">
        {bannerUrl
          ? <img src={thumbUrl(bannerUrl, THUMB.card) || bannerUrl} onError={onThumbError(bannerUrl)} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-[1px]" loading="lazy" decoding="async" />
          : <div className="absolute inset-0" style={{ background: BRAND }} />}
        {/* Brand wash + legibility scrim */}
        <div className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ background: BRAND }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2rem]" />
      </div>

      {/* ── Identity row (avatar overlaps the banner) ── */}
      <div className="px-2 sm:px-4 -mt-12 sm:-mt-16 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
        {/* Avatar with gradient ring */}
        <div className="shrink-0 rounded-full p-[3px] shadow-2xl" style={{ background: BRAND }}>
          <div className="rounded-full p-[3px] bg-[#0a0a0a]">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-white/10">
              {profile.photoURL
                ? <img src={thumbUrl(profile.photoURL, THUMB.small) || profile.photoURL} onError={onThumbError(profile.photoURL)} alt={profile.displayName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/50">{profile.displayName?.[0] || '?'}</div>}
            </div>
          </div>
        </div>

        {/* Name + meta + actions */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-end gap-4 pb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black tracking-tight text-white truncate">{profile.displayName || 'Creator'}</h1>
              {profile.isArtist && <BadgeCheck size={20} className="text-small-orange shrink-0" fill="rgba(255,140,0,0.15)" />}
            </div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-white/35 mt-1.5">{handle}</p>
            {profile.bio && <p className="text-xs sm:text-sm text-white/55 mt-2.5 line-clamp-2 max-w-2xl leading-relaxed">{profile.bio}</p>}

            {/* Stats */}
            <div className="flex items-center gap-6 sm:gap-8 mt-4">
              <Stat value={fmt(profile.followerCount)} label="Followers" />
              <span className="w-px h-8 bg-white/10" />
              <Stat value={fmt(videoCount)} label="Videos" />
              <span className="w-px h-8 bg-white/10" />
              <Stat value={fmt(profile.followingCount)} label="Following" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {isOwner ? (
              <>
                {canGoLive() && (
                  <button onClick={onGoLive} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-600/90 text-white font-black text-[9px] uppercase tracking-widest hover:bg-red-600 transition-all">
                    <Radio size={13} /> Go Live
                  </button>
                )}
                {canUpload() && (
                  <button onClick={onUpload} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-black text-[9px] uppercase tracking-widest shadow-lg hover:brightness-110 transition-all" style={{ background: BRAND }}>
                    <Upload size={13} /> Upload
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={onToggleFollow}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-black text-[9px] uppercase tracking-widest transition-all shadow-lg ${
                  isFollowing ? 'bg-white/10 text-white/80 border border-white/15 hover:bg-white/15' : 'text-white hover:brightness-110'
                }`}
                style={isFollowing ? undefined : { background: BRAND }}
              >
                {isFollowing ? <><Check size={13} /> Following</> : <><Bell size={13} /> Subscribe</>}
              </button>
            )}
            {/* Bell — only meaningful once subscribed */}
            {!isOwner && isFollowing && profile.uid && <SubscriptionBell targetUid={profile.uid} />}
            <button onClick={onShare} title="Share channel" className="w-10 h-10 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/12 transition-all shrink-0">
              <Share2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReelloChannelHeader;

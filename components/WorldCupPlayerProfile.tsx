import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Star, Bell, BellOff, Shield, TrendingUp, Newspaper, ImageIcon, User } from 'lucide-react';
import { WC26Player, WC26Position, getPositionLabel, getPositionColor } from '../data/worldCupPlayers';
import { WC26Team } from '../data/worldCup2026';
import { auth } from '../services/backendService';
import { db } from '../services/backendService';
import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ── Wikipedia photo lookup via Wikimedia REST API ─────────────────────────────
async function fetchWikiPhoto(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
const StatPill: React.FC<{ label: string; value: string | number; color: string; icon?: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/8 min-w-[72px]">
    {icon && <span style={{ color }} className="opacity-70">{icon}</span>}
    <span className="text-xl font-black text-white">{value}</span>
    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">{label}</span>
  </div>
);

// ── Position badge ────────────────────────────────────────────────────────────
const PosBadge: React.FC<{ pos: WC26Position }> = ({ pos }) => (
  <span
    className="inline-block px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
    style={{ background: `${getPositionColor(pos)}22`, color: getPositionColor(pos) }}
  >
    {getPositionLabel(pos)}
  </span>
);

// ── Gallery placeholder grid ───────────────────────────────────────────────────
const GalleryPlaceholder: React.FC<{ color: string; name: string }> = ({ color, name }) => (
  <div className="space-y-2">
    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">Photo Gallery</p>
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="aspect-square rounded-xl flex items-center justify-center"
          style={{ background: `${color}${i === 0 ? '22' : '11'}` }}
        >
          {i === 0 ? (
            <ImageIcon size={22} style={{ color: `${color}88` }} />
          ) : (
            <span className="text-white/10 text-[9px] font-bold">No image</span>
          )}
        </div>
      ))}
    </div>
    <p className="text-[7px] text-white/15 text-center">Official gallery coming soon for {name}</p>
  </div>
);

// ── News feed placeholder ──────────────────────────────────────────────────────
const NewsFeed: React.FC<{ player: WC26Player; color: string }> = ({ player, color }) => {
  const items = [
    { headline: `${player.name} named in squad for World Cup 2026`, time: '2d ago' },
    { headline: `${player.name}: "We can go all the way this year"`, time: '5d ago' },
    { headline: `Watch: ${player.name}'s best goals this season`, time: '1w ago' },
  ];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center" style={{ background: `${color}22` }}>
            <Newspaper size={14} style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-white/80 leading-snug">{item.headline}</p>
            <p className="text-[8px] text-white/25 mt-1">{item.time} · World Cup News</p>
          </div>
        </div>
      ))}
      <p className="text-[8px] text-center text-white/20 pt-1">Live news will stream in during the tournament</p>
    </div>
  );
};

// ── Main profile ──────────────────────────────────────────────────────────────
interface Props {
  player: WC26Player;
  team: WC26Team;
  onBack: () => void;
}

type ProfileTab = 'stats' | 'gallery' | 'news';

const WorldCupPlayerProfile: React.FC<Props> = ({ player, team, onBack }) => {
  const [tab, setTab] = useState<ProfileTab>('stats');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const uid = auth.currentUser?.uid;
  const followDocRef = uid ? doc(db, 'wcFollowedPlayers', uid, 'players', player.id) : null;

  const primaryColor  = team.primaryColor;
  const secondaryColor = team.secondaryColor;

  // Load Wikipedia photo — try explicit slug first, fall back to name search
  useEffect(() => {
    setPhotoUrl(null);
    const slug = player.wikiSlug ?? player.name.replace(/ /g, '_');
    fetchWikiPhoto(slug).then(url => {
      if (url) { setPhotoUrl(url); return; }
      // Second attempt: append "(footballer)" disambiguation
      if (!player.wikiSlug) {
        fetchWikiPhoto(`${player.name.replace(/ /g, '_')}_(footballer)`).then(u => {
          if (u) setPhotoUrl(u);
        });
      }
    });
  }, [player.id, player.wikiSlug, player.name]);

  // Subscribe to follow state
  useEffect(() => {
    if (!followDocRef) return;
    return onSnapshot(followDocRef, snap => setIsFollowing(snap.exists()));
  }, [player.id, uid]);

  const toggleFollow = useCallback(async () => {
    if (!followDocRef || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await deleteDoc(followDocRef);
      } else {
        await setDoc(followDocRef, {
          playerId: player.id,
          playerName: player.name,
          teamId: player.teamId,
          followedAt: Date.now(),
        });
      }
    } finally {
      setFollowLoading(false);
    }
  }, [followDocRef, isFollowing, followLoading, player]);

  const TABS: { id: ProfileTab; label: string; icon: React.ElementType }[] = [
    { id: 'stats',   label: 'Stats',   icon: TrendingUp },
    { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    { id: 'news',    label: 'News',    icon: Newspaper },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* ── Breadcrumb nav ── */}
      <nav className="flex items-center gap-2 px-1 py-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.1] transition-all"
        >
          <ArrowLeft size={13} />
          {team.flag} {team.name}
        </button>
        <span className="text-white/20 text-xs">›</span>
        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">{player.name}</span>
      </nav>

      {/* ── Jersey-themed hero ── */}
      <div
        className="relative rounded-[2rem] overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${primaryColor} 0%, ${secondaryColor} 60%, #000 100%)` }}
      >
        {/* Jersey number watermark */}
        <div
          className="absolute right-4 top-0 bottom-0 flex items-center select-none pointer-events-none"
          style={{ fontSize: '160px', fontWeight: 900, lineHeight: 1, color: 'rgba(255,255,255,0.06)', letterSpacing: '-0.05em' }}
        >
          {player.number}
        </div>

        <div className="relative px-7 py-8">

          <div className="flex items-start gap-5">
            {/* Avatar / photo */}
            <div
              className="w-24 h-24 rounded-2xl shrink-0 flex items-center justify-center overflow-hidden border-2"
              style={{ borderColor: `${primaryColor}66`, background: `${primaryColor}22` }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={player.name} className="w-full h-full object-cover object-top" />
              ) : (
                <User size={38} className="text-white/20" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {player.isCaptain && (
                <div className="flex items-center gap-1 mb-1">
                  <Shield size={10} style={{ color: primaryColor }} />
                  <span className="text-[7px] font-black uppercase tracking-[0.3em]" style={{ color: primaryColor }}>Captain</span>
                </div>
              )}
              <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none">{player.name}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[8px] font-black text-white/50">#{player.number}</span>
                <span className="text-white/20">·</span>
                <PosBadge pos={player.position} />
                <span className="text-white/20">·</span>
                <span className="text-[8px] font-black text-white/50">{team.flag} {team.name}</span>
              </div>
              <p className="text-[9px] text-white/40 mt-1">Age {player.age} · {player.club}</p>
            </div>
          </div>

          {/* Quick stats strip */}
          <div className="flex items-center gap-3 mt-5 overflow-x-auto pb-1 scrollbar-none">
            <StatPill label="Caps" value={player.caps} color={primaryColor} />
            <StatPill label="Goals" value={player.goals} color="#FF8C00" />
            <StatPill label="Assists" value={player.assists} color="#10B981" />
            <StatPill label="Age" value={player.age} color={secondaryColor} />
          </div>

          {/* Follow button */}
          {uid && (
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              style={isFollowing
                ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }
                : { background: primaryColor, color: '#000', border: `1px solid ${primaryColor}` }
              }
            >
              {isFollowing ? <BellOff size={13} /> : <Bell size={13} />}
              {isFollowing ? 'Following' : 'Follow Player'}
            </button>
          )}
        </div>

        {/* Color bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 flex">
          <div className="flex-1" style={{ background: primaryColor }} />
          <div className="flex-1" style={{ background: secondaryColor }} />
        </div>
      </div>

      {/* ── Bio ── */}
      <div className="px-1">
        <p className="text-sm text-white/60 leading-relaxed">{player.bio}</p>
      </div>

      {/* ── Key Player badge ── */}
      {player.isKeyPlayer && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
          style={{ background: `${primaryColor}15`, border: `1px solid ${primaryColor}30` }}
        >
          <Star size={13} style={{ color: primaryColor }} />
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>
            Key Player · Watch closely this tournament
          </span>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              tab === t.id ? 'text-black shadow-lg' : 'text-white/40 hover:text-white/70'
            }`}
            style={tab === t.id ? { background: primaryColor } : {}}
          >
            {React.createElement(t.icon as any, { size: 10 })}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'stats' && (
            <div className="space-y-4">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">International Career</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Caps',    value: player.caps },
                  { label: 'Goals',   value: player.goals },
                  { label: 'Assists', value: player.assists },
                  { label: 'Club',    value: player.club },
                  { label: 'Goals / Cap', value: player.caps > 0 ? (player.goals / player.caps).toFixed(2) : '—' },
                  { label: 'Position',    value: getPositionLabel(player.position) },
                ].map(stat => (
                  <div key={stat.label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                    <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/25 mb-1">{stat.label}</p>
                    <p className="text-base font-black text-white leading-none">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* WC2026 tracker placeholder */}
              <div
                className="p-4 rounded-2xl border"
                style={{ background: `${primaryColor}08`, borderColor: `${primaryColor}25` }}
              >
                <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: primaryColor }}>
                  WC 2026 Tournament Tracker
                </p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: 'Matches', value: '—' },
                    { label: 'Goals',   value: '—' },
                    { label: 'Assists', value: '—' },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-lg font-black text-white">{s.value}</p>
                      <p className="text-[7px] font-black uppercase tracking-wider text-white/25">{s.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[8px] text-center text-white/20 mt-3">Updates live during the tournament</p>
              </div>
            </div>
          )}

          {tab === 'gallery' && (
            <GalleryPlaceholder color={primaryColor} name={player.name} />
          )}

          {tab === 'news' && (
            <NewsFeed player={player} color={primaryColor} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WorldCupPlayerProfile;

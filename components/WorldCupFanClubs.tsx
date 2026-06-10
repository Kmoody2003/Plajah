// World Cup Fan Clubs — unofficial open fan communities for all 48 WC2026 nations
// Each club uses the team's colors/flag as its identity.
// Includes a live scores ticker, team roster, community timeline, and video chat room.
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Users, MessageCircle, Clock, Trophy, Star, Bell,
  BellOff, Hash, Video, X, ChevronRight, Sparkles, ExternalLink,
} from 'lucide-react';
import { WC26_TEAMS, WC26_MATCHES, getTeam, ROUND_LABELS, type WC26Team, type WC26Match } from '../data/worldCup2026';
import { WC26Player, getPlayersByTeam, getPositionLabel, getPositionColor } from '../data/worldCupPlayers';
import { auth, db, listenToClubPosts, createClubPost, toggleClubPostLike, deleteClubPost } from '../services/backendService';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, setDoc, deleteDoc, getCountFromServer, onSnapshot,
} from 'firebase/firestore';
import { UserProfile, ClubPost } from '../types';
import UniversalPostComposer, { ComposerPostData } from './UniversalPostComposer';
import { type ClubCoverItem } from '../hooks/useClubCoverMedia';

const WCVideoChatRoom = lazy(() => import('./WCVideoChatRoom'));

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000' : '#fff';
}

// ── Cover media cycler — random order, cross-fade ─────────────────────────────

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const IMAGE_HOLD_MS = 7000;
const VIDEO_MAX_MS  = 14000;

export const CoverMediaCycler: React.FC<{ items: ClubCoverItem[]; order?: 'random' | 'sequential' }> = ({ items, order = 'random' }) => {
  const deckRef  = useRef<ClubCoverItem[]>(order === 'random' ? shuffled(items) : [...items]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [idx, setIdx] = useState(0);

  // Re-seed when items or order changes
  useEffect(() => {
    if (items.length === 0) return;
    deckRef.current = order === 'random' ? shuffled(items) : [...items];
    setIdx(0);
  }, [items.length, order]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    setIdx(prev => {
      const next = prev + 1;
      if (next >= deckRef.current.length) {
        if (order === 'random') deckRef.current = shuffled(deckRef.current);
        return 0;
      }
      return next;
    });
  }, [order]);

  useEffect(() => {
    if (deckRef.current.length <= 1) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const current = deckRef.current[idx];
    const delay = current?.type === 'video' ? VIDEO_MAX_MS : IMAGE_HOLD_MS;
    timerRef.current = setTimeout(advance, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, advance]);

  if (deckRef.current.length === 0) return null;
  const current = deckRef.current[idx] ?? deckRef.current[0];

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={current.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ zIndex: 0 }}
      >
        {current.type === 'video' ? (
          <video
            src={current.url}
            autoPlay
            muted
            playsInline
            onEnded={advance}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <img
            src={current.url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// ── Live scores ticker ─────────────────────────────────────────────────────────

export const LiveScoresTicker: React.FC<{ teamId?: string }> = ({ teamId }) => {
  const now = Date.now();
  const relevant = WC26_MATCHES.filter(m => {
    if (teamId) return m.homeTeamId === teamId || m.awayTeamId === teamId;
    // Show any live or recently finished match
    const isRecent = m.kickoffMs > now - 24 * 3600_000 && m.kickoffMs <= now + 3 * 3600_000;
    return isRecent || m.status === 'LIVE' || m.status === 'FINISHED';
  }).slice(0, 10);

  if (relevant.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/8 rounded-2xl">
        <Clock size={10} className="text-white/30" />
        <span className="text-[9px] text-white/30">No matches in the next 3 hours</span>
        <span className="text-[8px] text-white/20 ml-auto">Tournament begins Jun 11, 2026</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex items-stretch gap-2 pb-1 min-w-max">
        {relevant.map(match => {
          const home = getTeam(match.homeTeamId);
          const away = getTeam(match.awayTeamId);
          if (!home || !away) return null;
          const isLive = match.status === 'LIVE';
          const isDone = match.status === 'FINISHED';
          const isTeamMatch = teamId && (match.homeTeamId === teamId || match.awayTeamId === teamId);

          return (
            <div
              key={match.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border shrink-0 transition-all ${
                isLive
                  ? 'bg-red-500/8 border-red-500/25'
                  : isTeamMatch
                  ? 'bg-[#FF8C00]/5 border-[#FF8C00]/20'
                  : 'bg-white/[0.02] border-white/6'
              }`}
            >
              {isLive && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />}
              <span className="text-base leading-none">{home.flag}</span>
              <div className="text-center min-w-[36px]">
                {(match.homeScore !== undefined && match.awayScore !== undefined) ? (
                  <span className={`text-[11px] font-black ${isLive ? 'text-red-400' : 'text-white/70'}`}>
                    {match.homeScore}–{match.awayScore}
                  </span>
                ) : (
                  <span className="text-[8px] font-black text-white/30">
                    {new Date(match.kickoffMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <span className="text-base leading-none">{away.flag}</span>
              {isDone && <span className="text-[6px] font-black text-white/25 uppercase tracking-wider">FT</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Club card in the grid ──────────────────────────────────────────────────────

const ClubCard: React.FC<{ team: WC26Team; onClick: () => void }> = ({ team, onClick }) => {
  const playerCount = getPlayersByTeam(team.id).length;
  const primary     = team.primaryColor;
  const secondary   = team.secondaryColor;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="relative rounded-[1.5rem] overflow-hidden border text-left group"
      style={{ borderColor: `${primary}40`, background: primary, minHeight: 160 }}
    >
      {/* Flag fills the entire card */}
      <div
        className="absolute inset-0 flex items-center justify-center select-none pointer-events-none"
        style={{ fontSize: 96, lineHeight: 1 }}
      >
        {team.flag}
      </div>

      {/* Subtle dark scrim so text is readable — light enough flag stays visible */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.10) 100%)' }}
      />

      {/* Top: group badge */}
      <div className="absolute top-2.5 left-2.5">
        <span
          className="px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest"
          style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}
        >
          Group {team.group}
        </span>
      </div>

      {/* Bottom: name + player count */}
      <div className="absolute bottom-0 left-0 right-0 p-3" style={{ zIndex: 1 }}>
        <p className="text-[11px] font-black text-white leading-tight">{team.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Users size={7} className="text-white/45" />
          <span className="text-[7px] text-white/45">{playerCount} players</span>
        </div>
      </div>
    </motion.button>
  );
};

// ── Player profile modal ───────────────────────────────────────────────────────

const WCPlayerProfileModal: React.FC<{
  player: WC26Player;
  team: WC26Team;
  uid?: string;
  onClose: () => void;
}> = ({ player, team, uid, onClose }) => {
  const [followed, setFollowed] = useState(false);
  const [following, setFollowing] = useState(false);

  const followDoc = useMemo(
    () => uid ? doc(db, 'wcFollowedPlayers', uid, 'players', player.id) : null,
    [uid, player.id],
  );

  useEffect(() => {
    if (!followDoc) return;
    return onSnapshot(followDoc, snap => setFollowed(snap.exists()));
  }, [followDoc]);

  const toggleFollow = async () => {
    if (!followDoc || following) return;
    setFollowing(true);
    try {
      if (followed) {
        await deleteDoc(followDoc);
      } else {
        await setDoc(followDoc, {
          playerId: player.id, teamId: player.teamId,
          name: player.name, number: player.number,
          followedAt: Date.now(),
        });
      }
    } finally { setFollowing(false); }
  };

  const primary   = team.primaryColor;
  const secondary = team.secondaryColor;
  const posColor  = getPositionColor(player.position);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full rounded-t-3xl overflow-hidden border border-white/10 max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: 520, background: '#0d0d0d' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header banner */}
        <div
          className="relative px-6 pt-5 pb-6"
          style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary}88 60%, #0d0d0d 100%)` }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center"
          >
            <X size={13} className="text-white/70" />
          </button>

          <div className="flex items-end gap-4 mb-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0"
              style={{ background: 'rgba(0,0,0,0.25)', color: '#fff', border: '2px solid rgba(255,255,255,0.2)' }}
            >
              #{player.number}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-2xl leading-none">{team.flag}</span>
                {player.isCaptain && (
                  <span className="px-2 py-0.5 bg-yellow-500/25 border border-yellow-400/40 rounded-lg text-[7px] font-black text-yellow-300 uppercase tracking-wider">
                    Captain
                  </span>
                )}
                {player.isKeyPlayer && (
                  <Star size={10} className="text-yellow-400 fill-yellow-400" />
                )}
              </div>
              <h3 className="text-xl font-black text-white leading-tight">{player.name}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest"
              style={{ background: `${posColor}22`, color: posColor, border: `1px solid ${posColor}33` }}
            >
              {getPositionLabel(player.position)}
            </span>
            <span className="text-[9px] text-white/55">{player.club}</span>
            <span className="text-[8px] text-white/30">· Age {player.age}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-stretch border-b border-white/8">
          {([
            { label: 'Caps',    value: player.caps },
            { label: 'Goals',   value: player.goals },
            { label: 'Assists', value: player.assists },
          ] as const).map((stat, i) => (
            <div key={stat.label} className={`flex-1 py-4 text-center ${i < 2 ? 'border-r border-white/8' : ''}`}>
              <p className="text-xl font-black text-white mb-0.5">{stat.value}</p>
              <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/30">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Bio + actions */}
        <div className="px-6 py-5">
          {player.bio && (
            <p className="text-sm text-white/55 leading-relaxed mb-5">{player.bio}</p>
          )}

          <div className="flex items-center gap-3">
            {uid && (
              <button
                onClick={toggleFollow}
                disabled={following}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border"
                style={followed
                  ? { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }
                  : { background: primary, borderColor: primary, color: contrastText(primary) }
                }
              >
                {followed ? <BellOff size={12} /> : <Bell size={12} />}
                {followed ? 'Unfollow' : 'Follow Player'}
              </button>
            )}
            {player.wikiSlug && (
              <a
                href={`https://en.wikipedia.org/wiki/${player.wikiSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
              >
                <ExternalLink size={11} />
                Wiki
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Fan club detail ────────────────────────────────────────────────────────────

type ClubTab = 'timeline' | 'roster' | 'video';

export const FanClubDetail: React.FC<{
  team: WC26Team;
  currentUser: { displayName?: string | null; uid?: string; photoURL?: string | null } | null;
  onBack: () => void;
}> = ({ team, currentUser, onBack }) => {
  const [tab, setTab]               = useState<ClubTab>('timeline');
  const [posts, setPosts]           = useState<ClubPost[]>([]);
  const [isMember, setIsMember]     = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [uid, setUid]               = useState<string | undefined>(auth.currentUser?.uid);
  const [showVideoRoom, setShowVideoRoom] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<WC26Player | null>(null);

  const clubId    = `wc2026_${team.id}`;
  const memberDoc = useMemo(() => uid ? doc(db, 'wcFanClubs', clubId, 'members', uid) : null, [clubId, uid]);

  // Track auth state reactively
  useEffect(() => {
    return onAuthStateChanged(auth, u => setUid(u?.uid));
  }, []);

  // Subscribe to posts — same clubPosts collection as all other clubs
  useEffect(() => {
    return listenToClubPosts(clubId, setPosts);
  }, [clubId]);

  // Subscribe to own membership (still stored in wcFanClubs/members for WC-specific tracking)
  useEffect(() => {
    if (!memberDoc) return;
    return onSnapshot(memberDoc, snap => setIsMember(snap.exists()));
  }, [memberDoc]);

  // Member count estimate from wcFanClubs members subcollection
  useEffect(() => {
    getCountFromServer(collection(db, 'wcFanClubs', clubId, 'members'))
      .then(snap => setMemberCount(snap.data().count))
      .catch(() => setMemberCount(0));
  }, [clubId]);

  const toggleMembership = useCallback(async () => {
    if (!memberDoc || memberLoading) return;
    setMemberLoading(true);
    try {
      if (isMember) {
        await deleteDoc(memberDoc);
      } else {
        await setDoc(memberDoc, {
          uid, displayName: currentUser?.displayName ?? 'Fan',
          joinedAt: Date.now(),
        });
      }
    } finally { setMemberLoading(false); }
  }, [memberDoc, isMember, memberLoading, uid, currentUser]);

  const handleFanClubPost = useCallback(async (data: ComposerPostData) => {
    if (!uid || !data.text.trim()) return;
    try {
      await createClubPost({ clubId, content: data.text.trim(), type: 'POST' });
    } catch (err: any) {
      const isPermission = err?.code === 'permission-denied';
      alert(isPermission
        ? 'Could not post — please sign in and try again.'
        : 'Could not post. Please try again in a moment.');
    }
  }, [uid, clubId]);

  const players = getPlayersByTeam(team.id);
  const grouped = (['GK', 'DEF', 'MID', 'FWD'] as const).reduce((acc, pos) => {
    acc[pos] = players.filter(p => p.position === pos);
    return acc;
  }, {} as Record<string, WC26Player[]>);

  const primary    = team.primaryColor;
  const secondary  = team.secondaryColor;
  const primaryFg  = contrastText(primary);

  // Video room needs a user object with uid
  const videoRoomUser = uid && currentUser ? {
    uid,
    displayName: (currentUser as any).displayName ?? null,
    photoURL: (currentUser as any).photoURL ?? null,
  } : null;

  return (
    <div className="pb-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 px-1 py-3 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.1] transition-all"
        >
          <ArrowLeft size={13} />
          Fan Clubs
        </button>
        <span className="text-white/20 text-xs">›</span>
        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">{team.flag} {team.name}</span>
      </nav>

      {/* Hero banner — full-bleed, tall like regular clubs */}
      <div
        className="relative overflow-hidden mb-6"
        style={{ borderRadius: '1.75rem', minHeight: '220px', background: '#000' }}
      >
        {/* Team-color gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${primary}ff 0%, ${secondary}bb 55%, #000ff 100%)`,
            zIndex: 1,
          }}
        />

        {/* Large flag watermark */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[160px] leading-none opacity-[0.10] select-none pointer-events-none" style={{ zIndex: 2 }}>
          {team.flag}
        </div>

        <div className="relative px-8 py-10" style={{ zIndex: 2 }}>
          {/* UNOFFICIAL badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-4 rounded-lg bg-white/10 border border-white/20">
            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/60">Unofficial Fan Club · Open to All · WC2026</span>
          </div>

          <h2 className="text-4xl font-black uppercase tracking-tight text-white leading-none mb-1">{team.name}</h2>
          <p className="text-sm text-white/50 mb-5">Group {team.group} · Supporters Club</p>

          <div className="flex items-center gap-5 flex-wrap mb-6">
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-white/40" />
              <span className="text-[10px] text-white/40">{memberCount > 0 ? `${memberCount.toLocaleString()} member${memberCount !== 1 ? 's' : ''}` : 'Be the first to join'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Hash size={12} className="text-white/40" />
              <span className="text-[10px] text-white/40">{players.length} players in roster</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Join / Leave */}
            {uid && (
              <button
                onClick={toggleMembership}
                disabled={memberLoading}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                style={isMember
                  ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)' }
                  : { background: '#fff', color: '#000', border: '1px solid rgba(255,255,255,0.8)' }
                }
              >
                {isMember ? <BellOff size={13} /> : <Bell size={13} />}
                {isMember ? 'Leave Club' : 'Join Club'}
              </button>
            )}

            {/* Video Room button */}
            {uid && (
              <button
                onClick={() => setShowVideoRoom(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border"
                style={{ background: `${primary}22`, borderColor: `${primary}50`, color: '#fff' }}
              >
                <Video size={13} />
                Video Room
              </button>
            )}
          </div>
        </div>

        {/* Team-color accent bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 flex" style={{ zIndex: 2 }}>
          <div className="flex-1" style={{ background: primary }} />
          <div className="flex-1" style={{ background: secondary }} />
        </div>
      </div>

      {/* Live scores ticker */}
      <div className="mb-5">
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#FF8C00] rounded-full animate-pulse" /> Live Scores
        </p>
        <LiveScoresTicker teamId={team.id} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl mb-5">
        {([
          { id: 'timeline', label: 'Timeline',  icon: MessageCircle },
          { id: 'roster',   label: 'Roster',    icon: Users },
          { id: 'video',    label: 'Video Room', icon: Video },
        ] as { id: ClubTab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'video') {
                if (uid) setShowVideoRoom(true);
                // If not signed in, do nothing (tab stays on current content)
              } else {
                setTab(t.id as ClubTab);
              }
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${tab === t.id && t.id !== 'video' ? 'shadow-lg' : 'text-white/40 hover:text-white/70'}`}
            style={tab === t.id && t.id !== 'video' ? { background: primary, color: primaryFg } : {}}
          >
            {React.createElement(t.icon as any, { size: 11 })}{t.label}
          </button>
        ))}
      </div>

      {/* Video Room overlay */}
      {showVideoRoom && (
        <Suspense fallback={null}>
          <WCVideoChatRoom
            team={team}
            currentUser={videoRoomUser}
            onClose={() => setShowVideoRoom(false)}
          />
        </Suspense>
      )}

      {/* Player profile modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <WCPlayerProfileModal
            key={selectedPlayer.id}
            player={selectedPlayer}
            team={team}
            uid={uid}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>

          {/* TIMELINE */}
          {tab === 'timeline' && (
            <div className="space-y-4">
              {/* Compose */}
              {uid ? (
                <UniversalPostComposer
                  currentUser={auth.currentUser}
                  placeholder={`Say something to ${team.name} fans…`}
                  onPost={handleFanClubPost}
                />
              ) : (
                <div
                  className="py-4 px-5 rounded-2xl text-center border"
                  style={{ background: `${primary}08`, borderColor: `${primary}20` }}
                >
                  <p className="text-[9px] text-white/40">Sign in to join the {team.name} fan club conversation</p>
                </div>
              )}

              {/* Posts */}
              {posts.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageCircle size={28} className="text-white/10 mx-auto mb-3" />
                  <p className="text-sm text-white/30">Be the first to post in this fan club</p>
                  <p className="text-[9px] text-white/20 mt-1">Share your excitement for {team.name}!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.map(post => {
                    const ts = post.timestamp ? new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                    const isOwn = post.authorId === uid;
                    const liked = uid ? post.likes?.includes(uid) : false;
                    return (
                      <motion.div
                        key={post.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8"
                      >
                        {post.authorPhoto ? (
                          <img src={post.authorPhoto} className="w-8 h-8 rounded-xl object-cover shrink-0" alt="" />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-black"
                            style={{ background: `${primary}25`, color: primary }}
                          >
                            {post.authorName?.[0]?.toUpperCase() ?? '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black text-white/70">{post.authorName}</span>
                            <span className="text-[7px] text-white/20">{ts}</span>
                            {isOwn && <span className="text-[6px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/25 uppercase tracking-wider">You</span>}
                          </div>
                          <p className="text-sm text-white/80 leading-relaxed break-words">{post.content}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <button
                              onClick={() => uid && toggleClubPostLike(post.id, uid, !!liked)}
                              className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest transition-colors"
                              style={{ color: liked ? primary : 'rgba(255,255,255,0.2)' }}
                            >
                              ♥ {post.likes?.length || 0}
                            </button>
                            {isOwn && (
                              <button
                                onClick={() => deleteClubPost(post.id)}
                                className="text-[8px] font-black uppercase tracking-widest text-white/15 hover:text-red-400 transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ROSTER */}
          {tab === 'roster' && (
            <div className="space-y-5">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">
                WC2026 Squad · {players.length} Players
              </p>
              {(['GK', 'DEF', 'MID', 'FWD'] as const).map(pos => {
                const group = grouped[pos];
                if (!group || group.length === 0) return null;
                return (
                  <div key={pos}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: getPositionColor(pos) }} />
                      <p className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: getPositionColor(pos) }}>
                        {getPositionLabel(pos)}s
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {group.map(player => (
                        <button
                          key={player.id}
                          onClick={() => setSelectedPlayer(player)}
                          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 transition-all text-left"
                        >
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-black"
                            style={{ background: `${primary}25`, color: primary }}
                          >
                            {player.number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[10px] font-black text-white">{player.name}</p>
                              {player.isCaptain && (
                                <span className="px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded text-[6px] font-black text-yellow-400 uppercase tracking-wider">C</span>
                              )}
                              {player.isKeyPlayer && (
                                <Star size={8} style={{ color: primary }} />
                              )}
                            </div>
                            <p className="text-[8px] text-white/35 mt-0.5">{player.club}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[9px] font-black text-white/50">{player.goals}G</p>
                            <p className="text-[7px] text-white/25">{player.caps} caps</p>
                          </div>
                          <ChevronRight size={11} className="text-white/20 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ── Main clubs grid ────────────────────────────────────────────────────────────

interface Props {
  currentUser: UserProfile | null;
}

const WorldCupFanClubs: React.FC<Props> = ({ currentUser }) => {
  const [selectedTeam, setSelectedTeam] = useState<WC26Team | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateBanner, setShowCreateBanner] = useState(true);

  const filtered = WC26_TEAMS.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.shortName.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedTeam) {
    return (
      <FanClubDetail
        team={selectedTeam}
        currentUser={currentUser}
        onBack={() => setSelectedTeam(null)}
      />
    );
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.5em] text-[#FF8C00] mb-1">WC2026 Unofficial</p>
        <h2 className="text-2xl font-black uppercase tracking-tight text-white">Fan Clubs</h2>
        <p className="text-[9px] text-white/35 mt-1">Open communities for every nation — join, post, and celebrate together</p>
      </div>

      {/* Create Your Own Club — bold banner, WC-exclusive */}
      <AnimatePresence>
        {showCreateBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="relative overflow-hidden rounded-[1.5rem] border border-[#FF8C00]/30"
            style={{ background: 'linear-gradient(135deg, rgba(255,140,0,0.14) 0%, rgba(255,60,0,0.06) 100%)' }}
          >
            <button
              onClick={() => setShowCreateBanner(false)}
              className="absolute top-3 right-3 p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] transition-colors z-10"
            >
              <X size={11} className="text-white/40" />
            </button>

            {/* Background emoji watermark */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-[80px] leading-none opacity-[0.08] select-none pointer-events-none">🏟️</div>

            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                  style={{ background: 'rgba(255,140,0,0.18)', border: '1.5px solid rgba(255,140,0,0.3)' }}>
                  <Sparkles size={22} style={{ color: '#FF8C00' }} />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#FF8C00] mb-1">Build Your Own Community</p>
                  <p className="text-lg font-black text-white leading-tight">
                    Create a Club on Plajah
                  </p>
                  <p className="text-[10px] text-white/50 mt-1.5 leading-relaxed">
                    These WC fan clubs are the template — but your own club is fully customizable. Invite fans, post exclusive content, host live events, and build your community.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      // Navigate user to Clubs section — emits a custom event the parent can handle
                      window.dispatchEvent(new CustomEvent('plajah:navigate', { detail: { view: 'clubs' } }));
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                    style={{ background: '#FF8C00', color: '#000' }}
                  >
                    <Sparkles size={12} />
                    Create a Club
                    <ChevronRight size={12} />
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live scores ticker */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#FF8C00] rounded-full animate-pulse" /> Live Scores
        </p>
        <LiveScoresTicker />
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search nations…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Trophy size={28} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No nations match "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(team => (
            <ClubCard key={team.id} team={team} onClick={() => setSelectedTeam(team)} />
          ))}
        </div>
      )}

      <p className="text-center text-[7px] font-black uppercase tracking-[0.3em] text-white/15">
        All fan clubs are unofficial community spaces. Not affiliated with FIFA, national associations, or the players.
      </p>
    </div>
  );
};

export default WorldCupFanClubs;

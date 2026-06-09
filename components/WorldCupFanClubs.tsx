// World Cup Fan Clubs — unofficial open fan communities for all 48 WC2026 nations
// Each club uses the team's colors/flag as its identity.
// Includes a live scores ticker, team roster, and community timeline.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Users, MessageCircle, Clock, Trophy, Star, Bell,
  BellOff, Hash, Pin, MoreHorizontal, ChevronRight,
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

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="relative rounded-[1.5rem] overflow-hidden border text-left group"
      style={{ borderColor: `${team.primaryColor}30`, background: `linear-gradient(145deg, ${team.primaryColor}18 0%, ${team.secondaryColor}08 100%)` }}
    >
      {/* Hero strip */}
      <div
        className="relative h-16 flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor}88 100%)` }}
      >
        <span className="text-4xl opacity-80 select-none">{team.flag}</span>
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/40 rounded text-[6px] font-black uppercase tracking-wider text-white/70">
          Unofficial
        </div>
      </div>

      <div className="p-3">
        <p className="text-[10px] font-black text-white leading-none">{team.name}</p>
        <p className="text-[7px] text-white/35 mt-0.5">Open Fan Club · WC2026</p>
        <div className="flex items-center gap-1 mt-2">
          <Users size={8} className="text-white/25" />
          <span className="text-[7px] text-white/25">{playerCount} players in roster</span>
        </div>
      </div>
    </motion.button>
  );
};

// ── Fan club detail ────────────────────────────────────────────────────────────

type ClubTab = 'timeline' | 'roster';

export const FanClubDetail: React.FC<{
  team: WC26Team;
  currentUser: { displayName?: string | null } | null;
  onBack: () => void;
}> = ({ team, currentUser, onBack }) => {
  const [tab, setTab]               = useState<ClubTab>('timeline');
  const [posts, setPosts]           = useState<ClubPost[]>([]);
  const [isMember, setIsMember]     = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [uid, setUid]               = useState<string | undefined>(auth.currentUser?.uid);

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

  const primary   = team.primaryColor;
  const secondary = team.secondaryColor;

  return (
    <div className="space-y-5 pb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 px-1 py-2 flex-wrap">
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

      {/* Hero banner */}
      <div
        className="relative rounded-[2rem] overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary}88 60%, #000 100%)` }}
      >
        {/* Flag watermark */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[120px] leading-none opacity-[0.12] select-none pointer-events-none">
          {team.flag}
        </div>

        <div className="relative px-8 py-8">
          {/* UNOFFICIAL badge */}
          <div className="inline-flex items-center gap-1 px-2 py-1 mb-3 rounded-lg bg-white/10 border border-white/20">
            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/60">Unofficial Fan Club · Open to All</span>
          </div>

          <h2 className="text-3xl font-black uppercase tracking-tight text-white leading-none">{team.name}</h2>
          <p className="text-[9px] text-white/50 mt-2">WC2026 Supporters Club · Group {team.group}</p>

          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Users size={11} className="text-white/40" />
              <span className="text-[9px] text-white/40">{memberCount > 0 ? `${memberCount} member${memberCount !== 1 ? 's' : ''}` : 'Be the first to join'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Hash size={11} className="text-white/40" />
              <span className="text-[9px] text-white/40">{players.length} players in roster</span>
            </div>
          </div>

          {/* Join / Leave */}
          {uid && (
            <button
              onClick={toggleMembership}
              disabled={memberLoading}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              style={isMember
                ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }
                : { background: primary, color: '#000', border: `1px solid ${primary}` }
              }
            >
              {isMember ? <BellOff size={13} /> : <Bell size={13} />}
              {isMember ? 'Leave Club' : 'Join Club'}
            </button>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1 flex">
          <div className="flex-1" style={{ background: primary }} />
          <div className="flex-1" style={{ background: secondary }} />
        </div>
      </div>

      {/* Live scores ticker */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#FF8C00] rounded-full" /> Live Scores
        </p>
        <LiveScoresTicker teamId={team.id} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {([
          { id: 'timeline', label: 'Timeline',  icon: MessageCircle },
          { id: 'roster',   label: 'Roster',    icon: Users },
        ] as { id: ClubTab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'text-black shadow-lg' : 'text-white/40 hover:text-white/70'}`}
            style={tab === t.id ? { background: primary } : {}}
          >
            {React.createElement(t.icon as any, { size: 10 })}{t.label}
          </button>
        ))}
      </div>

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
                        <div
                          key={player.id}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8"
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
                        </div>
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

      {/* Live scores ticker */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#FF8C00] rounded-full" /> Live Scores
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

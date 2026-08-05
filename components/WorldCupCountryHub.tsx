import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { ArrowLeft, MessageSquare, Music, Sword, Calendar, Users, ShirtIcon, ChevronRight } from 'lucide-react';
import { WC26Team, getMatchesForTeam, getTeam, ROUND_LABELS } from '../data/worldCup2026';
import { WC26Player, WC26Position, getPlayersByTeam, getPositionColor, getPositionLabel } from '../data/worldCupPlayers';
import { fetchSquadByName, SquadPlayer, fetchGroupStandings, StandingRow } from '../services/worldCupDepth';

type RosterPlayer = WC26Player & { photo?: string; live?: SquadPlayer };
const normName = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
import { Post, UserProfile } from '../types';
import { auth, listenToGlobalPosts, createPost, uploadFile } from '../services/backendService';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';
import AnthemPlayer from './AnthemPlayer';
import WorldCupPlayerProfile from './WorldCupPlayerProfile';

interface Props {
  team: WC26Team;
  currentUser: UserProfile | null;
  onBack: () => void;
}

type CountryTab = 'community' | 'roster' | 'music' | 'debates' | 'matches';

const WorldCupCountryHub: React.FC<Props> = ({ team, currentUser, onBack }) => {
  const [activeTab, setActiveTab] = useState<CountryTab>('roster');
  const [selectedPlayer, setSelectedPlayer] = useState<RosterPlayer | null>(null);
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  useEffect(() => { let a = true; fetchSquadByName(team.name).then(s => { if (a) setSquad(s || []); }).catch(() => {}); return () => { a = false; }; }, [team.name]);
  const [groupTable, setGroupTable] = useState<StandingRow[]>([]);
  useEffect(() => { let a = true; fetchGroupStandings().then(m => { if (a) setGroupTable((m && m[team.group]) || []); }).catch(() => {}); return () => { a = false; }; }, [team.group]);
  const nn = (x: string) => (x || '').toLowerCase().replace(/[^a-z]/g, '');
  const myRow = groupTable.find(r => nn(r.team) === nn(team.name) || (nn(r.team).length > 3 && (nn(r.team).includes(nn(team.name)) || nn(team.name).includes(nn(r.team)))));
  // The LIVE ESPN squad (same source as the FIFA tab) is the source of truth — accurate
  // to the day. Each live player is enriched with static bio/flags (captain, key player,
  // wikiSlug) when a name matches. The projected roster is only a fallback when ESPN is
  // unavailable, so the World Cup roster always matches the up-to-date FIFA roster.
  const players = useMemo<RosterPlayer[]>(() => {
    const base = getPlayersByTeam(team.id);
    if (!squad.length) return base as RosterPlayer[];
    const baseByName = new Map(base.map(p => [normName(p.name), p] as const));
    return squad.map(s => {
      const b = baseByName.get(normName(s.name));
      const num = s.jersey ? (parseInt(String(s.jersey), 10) || b?.number || 0) : (b?.number || 0);
      return {
        id: b?.id || ('live_' + s.id),
        teamId: team.id,
        name: s.name,
        number: num,
        position: (s.group as WC26Position) ?? b?.position ?? 'MID',
        age: s.age ?? b?.age ?? 0,
        club: b?.club || s.club || s.citizenship || '',
        caps: b?.caps ?? 0,
        goals: b?.goals ?? 0,
        assists: b?.assists ?? 0,
        bio: b?.bio || `${s.name} is part of ${team.name}'s squad at the FIFA World Cup 2026.`,
        wikiSlug: b?.wikiSlug,
        isCaptain: b?.isCaptain,
        isKeyPlayer: b?.isKeyPlayer,
        photo: s.headshot,
        live: s,
      } as RosterPlayer;
    });
  }, [team.id, team.name, squad]);
  const isLiveSquad = squad.length > 0;
  const [posts, setPosts] = useState<Post[]>([]);
  const [debateTopics] = useState([
    `Will ${team.name} make it out of Group ${team.group}?`,
    `Who is ${team.name}'s most important player?`,
    `How far will ${team.name} go in 2026?`,
    `Best ${team.name} World Cup performance in history?`,
  ]);

  const countryTag = `wc2026_${team.id}`;
  const countryMatches = getMatchesForTeam(team.id);
  const now = Date.now();

  useEffect(() => {
    if (activeTab !== 'community') return;
    return listenToGlobalPosts(all => {
      const filtered = all.filter(p =>
        p.tags?.includes(countryTag) ||
        (p.text || '').toLowerCase().includes(team.name.toLowerCase()) ||
        (p.text || '').toLowerCase().includes(team.shortName.toLowerCase())
      );
      setPosts(filtered);
    });
  }, [activeTab, countryTag, team.name, team.shortName]);

  const handlePost = useCallback(async (data: any) => {
    const resolvedMedia = (await Promise.all(
      (data.attachments || []).map(async (att: any) => {
        if (att.file && att.url.startsWith('blob:')) {
          try {
            const url = await uploadFile(`posts/${auth.currentUser!.uid}/${Date.now()}_${att.file.name}`, att.file);
            return { type: att.type, url, title: att.title };
          } catch { return null; }
        }
        return { type: att.type, url: att.url, title: att.title };
      })
    )).filter(Boolean) as any[];

    await createPost({
      text: data.text,
      isPublic: true,
      tags: [countryTag, 'worldcup2026', team.id],
      ...(data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
      ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
    });
  }, [countryTag, team.id]);

  const TABS: { id: CountryTab; label: string; icon: React.ElementType }[] = [
    { id: 'roster',    label: 'Roster',     icon: ShirtIcon },
    { id: 'community', label: 'Community',  icon: MessageSquare },
    { id: 'music',     label: 'Music',      icon: Music },
    { id: 'debates',   label: 'Debates',    icon: Sword },
    { id: 'matches',   label: 'Matches',    icon: Calendar },
  ];

  // Show player profile view
  if (selectedPlayer) {
    return createPortal(
      <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm overflow-y-auto p-3 sm:p-6"
        onClick={() => setSelectedPlayer(null)}>
        <div onClick={e => e.stopPropagation()} className="max-w-2xl mx-auto my-1 sm:my-4 rounded-3xl border border-white/10 bg-[#0b0b0f] p-4 sm:p-5 shadow-2xl">
          <WorldCupPlayerProfile
            player={selectedPlayer}
            team={team}
            livePhoto={selectedPlayer.photo}
            live={selectedPlayer.live}
            onBack={() => setSelectedPlayer(null)}
          />
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb nav ── */}
      <nav className="flex items-center gap-2 px-1 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.1] transition-all"
        >
          <ArrowLeft size={13} />
          World Cup Hub
        </button>
        <span className="text-white/20 text-xs">›</span>
        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider flex items-center gap-1.5">
          <span>{team.flag}</span>
          {team.name}
        </span>
      </nav>

      {/* ── Hero header ── */}
      <div
        className="relative rounded-[2rem] overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${team.primaryColor}55 0%, ${team.secondaryColor}33 100%)` }}
      >
        <div className="absolute inset-0 bg-black/50" />

        {/* Flag watermark */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-[100px] leading-none opacity-20 select-none pointer-events-none">
          {team.flag}
        </div>

        <div className="relative px-7 py-8">

          <div className="flex items-center gap-5">
            <span className="text-4xl sm:text-6xl leading-none">{team.flag}</span>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.5em] text-white/40 mb-1">Group {team.group} · {team.confederation}</p>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white">{team.name}</h2>
              <p className="text-xs text-white/40 mt-1">{team.anthem}</p>
            </div>
          </div>

          {/* Fan stats */}
          <div className="flex items-center gap-6 mt-5">
            <div className="flex items-center gap-1.5 text-white/40">
              <Users size={11} />
              <span className="text-[9px] font-bold">{posts.length} posts</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/40">
              <Music size={11} />
              <span className="text-[9px] font-bold">{team.popularArtists.length} featured artists</span>
            </div>
          </div>
        </div>

        {/* Color bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 flex">
          <div className="flex-1" style={{ background: team.primaryColor }} />
          <div className="flex-1" style={{ background: team.secondaryColor }} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === t.id
                ? 'text-black shadow-lg'
                : 'text-white/40 hover:text-white/70'
            }`}
            style={activeTab === t.id ? { background: team.primaryColor } : {}}
          >
            {React.createElement(t.icon as any, { size: 10 })}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Roster tab ── */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
            {team.name} · {isLiveSquad ? 'Live Squad' : 'Projected Squad'} · {players.length} Players
          </p>

          {/* Position groups */}
          {(['GK', 'DEF', 'MID', 'FWD'] as const).map(pos => {
            const group = players.filter(p => p.position === pos);
            if (!group.length) return null;
            return (
              <div key={pos}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: getPositionColor(pos) }} />
                  <span className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: getPositionColor(pos) }}>
                    {getPositionLabel(pos)}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {group.map(player => {
                    const st = player.live?.stats;
                    const hasStats = !!st && (st.goals !== undefined || st.appearances !== undefined || st.assists !== undefined);
                    return (
                    <motion.button
                      key={player.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPlayer(player)}
                      className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-[#FF8C00]/20 transition-all text-left group w-full"
                    >
                      {/* Player headshot — FIFA-card style */}
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/10 border border-white/10">
                        {player.photo ? (
                          <img src={player.photo} alt="" loading="lazy" className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform" onError={e => { const t = e.currentTarget as HTMLImageElement; t.style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-black text-sm" style={{ color: team.primaryColor }}>{player.number || '–'}</div>
                        )}
                        {player.live?.injured && <span title="Injured" className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-black" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-black uppercase tracking-tight text-white truncate group-hover:text-[#FF8C00] transition-colors">{player.name}</p>
                          {player.isCaptain && <span className="text-[7px] px-1 rounded bg-white/10 text-white/50 shrink-0">C</span>}
                          {player.isKeyPlayer && <span style={{ color: team.primaryColor }} className="text-[10px] shrink-0">★</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[8px] font-bold text-white/40 uppercase">{player.live?.posName || getPositionLabel(player.position)}</span>
                          {!!player.number && <span className="text-[8px] font-bold text-white/25">#{player.number}</span>}
                          {!!(player.live?.age ?? player.age) && <span className="text-[8px] font-bold text-white/20">{player.live?.age ?? player.age} yrs</span>}
                        </div>
                      </div>

                      {/* Live tournament stats (goals / assists) — WC is richer than the base FIFA row */}
                      {hasStats ? (
                        <div className="hidden sm:flex items-center gap-3.5 shrink-0 pr-0.5">
                          <div className="text-center"><p className="text-sm font-black leading-none" style={{ color: '#FF8C00' }}>{st!.goals ?? 0}</p><p className="text-[6px] font-black uppercase tracking-wider text-white/25 mt-0.5">Goals</p></div>
                          <div className="text-center"><p className="text-sm font-black leading-none text-[#10B981]">{st!.assists ?? 0}</p><p className="text-[6px] font-black uppercase tracking-wider text-white/25 mt-0.5">Asst</p></div>
                          <div className="text-center"><p className="text-sm font-black leading-none text-white">{st!.appearances ?? 0}</p><p className="text-[6px] font-black uppercase tracking-wider text-white/25 mt-0.5">Apps</p></div>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 border border-white/10" style={{ background: `${team.primaryColor}30` }}>{player.number || '–'}</div>
                      )}
                      <ChevronRight size={13} className="text-white/15 group-hover:text-[#FF8C00]/50 transition-colors shrink-0" />
                    </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {players.length === 0 && (
            <div className="py-16 text-center">
              <ShirtIcon size={28} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">Roster data not available</p>
            </div>
          )}

          <p className="text-[7px] text-white/15 text-center pt-2">
            {isLiveSquad
              ? 'Live squad · headshots, positions & tournament stats from ESPN, updated daily. Tap a player for full stats & history.'
              : 'Projected squad. Official FIFA squads are announced 10 days before the tournament.'}
          </p>
        </div>
      )}

      {/* ── Community tab ── */}
      {activeTab === 'community' && (
        <div className="space-y-4">
          {auth.currentUser && (
            <UniversalPostComposer
              currentUser={auth.currentUser}
              placeholder={`Share your ${team.name} thoughts…`}
              avatarUrl={auth.currentUser.photoURL || undefined}
              onPost={handlePost}
            />
          )}
          {posts.length > 0 ? (
            <div className="space-y-3">
              {posts.map(p => <PostCard key={p.id} post={p} />)}
            </div>
          ) : (
            <div className="py-16 text-center">
              <span className="text-4xl mb-4 block">{team.flag}</span>
              <p className="text-sm text-white/30">No posts for {team.name} yet</p>
              <p className="text-[10px] text-white/20 mt-1">Be the first {team.name} fan on Plajah</p>
            </div>
          )}
        </div>
      )}

      {/* ── Music tab ── */}
      {activeTab === 'music' && (
        <div className="space-y-5">
          {/* Live anthem player */}
          <AnthemPlayer team={team} />

          {/* Popular artists */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Popular Artists from {team.name}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {team.popularArtists.map(artist => (
                <div
                  key={artist}
                  className="flex items-center gap-3 p-3.5 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/[0.06] transition-colors group cursor-pointer"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${team.primaryColor}33` }}
                  >
                    🎵
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate">{artist}</p>
                    <p className="text-[8px] text-white/30 mt-0.5">{team.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fan playlist prompt */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center">
            <Music size={20} className="text-white/20 mx-auto mb-2" />
            <p className="text-xs text-white/30">Know a great {team.name} artist?</p>
            <p className="text-[9px] text-white/20 mt-1">Post in Community and tag #{team.shortName}Playlist</p>
          </div>
        </div>
      )}

      {/* ── Debates tab ── */}
      {activeTab === 'debates' && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Debate Topics · {team.name}</p>
          {debateTopics.map((topic, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/[0.06] hover:border-white/15 transition-all group cursor-pointer"
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${team.primaryColor}33` }}
              >
                <Sword size={14} style={{ color: team.primaryColor }} />
              </div>
              <p className="flex-1 text-sm font-bold text-white/80 group-hover:text-white transition-colors">
                {topic}
              </p>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white/50 transition-colors">
                Start debate →
              </span>
            </motion.div>
          ))}

          <div className="pt-2 text-center">
            <p className="text-[9px] text-white/20">Debates run for 24 hours · Aria judges the winner</p>
          </div>
        </div>
      )}

      {/* ── Matches tab ── */}
      {activeTab === 'matches' && (
        <div className="space-y-3">
          {/* Live group standing */}
          {groupTable.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-y-hidden overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Group {team.group}</span>
                {myRow && <span className="ml-auto text-[9px] font-black" style={{ color: (myRow.rank || 9) <= 2 ? '#39B54A' : 'rgba(255,255,255,0.5)' }}>{myRow.rank ? `#${myRow.rank}` : ''} · {myRow.pts} pts{(myRow.rank || 9) <= 2 ? ' · Advancing' : ''}</span>}
              </div>
              <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/5 text-[8px] font-black uppercase tracking-widest text-white/25 tabular-nums">
                <span className="w-4" /><span className="flex-1">Team</span>
                <span className="w-3.5 text-center">P</span><span className="w-3.5 text-center">W</span><span className="w-3.5 text-center">D</span><span className="w-3.5 text-center">L</span><span className="w-5 text-center text-white/40">Pts</span>
              </div>
              <div className="divide-y divide-white/5">
                {groupTable.map((r, i) => {
                  const isMe = myRow && r.team === myRow.team;
                  return (
                    <div key={r.team + i} className="flex items-center gap-3 px-4 py-2" style={isMe ? { background: `${team.primaryColor}22` } : (r.rank || i + 1) <= 2 ? { background: 'rgba(57,181,74,0.05)' } : undefined}>
                      <span className="w-4 text-[9px] font-black tabular-nums" style={{ color: (r.rank || i + 1) <= 2 ? '#39B54A' : 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
                      {r.logo ? <img src={r.logo} alt="" className="w-4 h-4 object-contain" /> : null}
                      <span className="flex-1 text-[10px] font-black text-white truncate">{r.team}</span>
                      <div className="flex items-center gap-3 text-[9px] font-black tabular-nums">
                        <span className="w-3.5 text-center text-white/55">{r.p}</span><span className="w-3.5 text-center text-white/55">{r.w}</span><span className="w-3.5 text-center text-white/55">{r.d}</span><span className="w-3.5 text-center text-white/55">{r.l}</span><span className="w-5 text-center text-[#FF8C00]">{r.pts}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">{team.name} Schedule</p>
          {countryMatches.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar size={28} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">Schedule not yet loaded</p>
            </div>
          ) : (
            countryMatches.map(match => {
              const opp = match.homeTeamId === team.id ? getTeam(match.awayTeamId) : getTeam(match.homeTeamId);
              const isHome = match.homeTeamId === team.id;
              const kickoff = new Date(match.kickoffMs);
              const isPast = match.kickoffMs < now && match.status !== 'LIVE';

              return (
                <div key={match.id} className={`p-4 rounded-2xl border ${isPast ? 'border-white/5 opacity-60' : 'border-white/8'} bg-white/[0.03]`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/30">
                      {match.group ? `Group ${match.group}` : ROUND_LABELS[match.round]}
                    </span>
                    <span className="text-[8px] text-white/25">
                      {kickoff.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{team.flag}</span>
                    <span className="text-[9px] font-bold text-white/40">{isHome ? 'vs' : '@'}</span>
                    <span className="text-2xl">{opp?.flag}</span>
                    <span className="text-xs font-black text-white/70 ml-1">{opp?.name}</span>
                    {match.homeScore !== undefined && (
                      <span className="ml-auto text-sm font-black text-white">
                        {isHome ? match.homeScore : match.awayScore} – {isHome ? match.awayScore : match.homeScore}
                      </span>
                    )}
                  </div>
                  <p className="text-[8px] text-white/20 mt-2">{match.city} · {match.venue}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default WorldCupCountryHub;

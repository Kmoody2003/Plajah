import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, MessageSquare, Music, Sword, Calendar, Users, ShirtIcon } from 'lucide-react';
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
  // The player profile replaces the view at the top; bring it into view so the
  // user isn't left staring at their old scroll position down the roster.
  const playerViewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedPlayer) return;
    const raf = requestAnimationFrame(() =>
      playerViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(raf);
  }, [selectedPlayer]);
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  useEffect(() => { let a = true; fetchSquadByName(team.name).then(s => { if (a) setSquad(s || []); }).catch(() => {}); return () => { a = false; }; }, [team.name]);
  const [groupTable, setGroupTable] = useState<StandingRow[]>([]);
  useEffect(() => { let a = true; fetchGroupStandings().then(m => { if (a) setGroupTable((m && m[team.group]) || []); }).catch(() => {}); return () => { a = false; }; }, [team.group]);
  const nn = (x: string) => (x || '').toLowerCase().replace(/[^a-z]/g, '');
  const myRow = groupTable.find(r => nn(r.team) === nn(team.name) || (nn(r.team).length > 3 && (nn(r.team).includes(nn(team.name)) || nn(team.name).includes(nn(r.team)))));
  // Live squad (real headshots/positions/ages from ESPN) merged over the projected roster.
  const players = useMemo<RosterPlayer[]>(() => {
    const base = getPlayersByTeam(team.id);
    const byName = new Map(squad.map(s => [normName(s.name), s] as const));
    const used = new Set(base.map(p => normName(p.name)));
    const merged: RosterPlayer[] = base.map(p => {
      const s = byName.get(normName(p.name));
      return { ...p, number: s?.jersey ? (parseInt(String(s.jersey), 10) || p.number) : p.number, photo: s?.headshot, live: s };
    });
    const extra: RosterPlayer[] = squad.filter(s => !used.has(normName(s.name))).map(s => ({
      id: 'live_' + s.id, teamId: team.id, name: s.name, number: s.jersey ? (parseInt(String(s.jersey), 10) || 0) : 0,
      position: s.group as WC26Position, age: s.age || 0, club: s.citizenship || '', caps: 0, goals: 0, assists: 0,
      bio: `${s.name} is part of ${team.name}'s squad at the FIFA World Cup 2026.`, photo: s.headshot, live: s,
    } as RosterPlayer));
    const all = [...merged, ...extra];
    return all.length ? all : (base as RosterPlayer[]);
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
    return (
      <div ref={playerViewRef} style={{ scrollMarginTop: 72 }}>
        <WorldCupPlayerProfile
          player={selectedPlayer}
          team={team}
          livePhoto={selectedPlayer.photo}
          live={selectedPlayer.live}
          onBack={() => setSelectedPlayer(null)}
        />
      </div>
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
            <span className="text-6xl leading-none">{team.flag}</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.map(player => (
                    <motion.button
                      key={player.id}
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPlayer(player)}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15 transition-all text-left group"
                    >
                      {/* Player headshot (live) or jersey number */}
                      {player.photo ? (
                        <div className="relative w-10 h-10 shrink-0">
                          <img src={player.photo} alt="" loading="lazy" className="w-10 h-10 rounded-xl object-cover object-top bg-white/10" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                          {!!player.number && <span className="absolute -bottom-1 -right-1 text-[8px] font-black px-1 rounded" style={{ background: team.primaryColor, color: '#000' }}>{player.number}</span>}
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm" style={{ background: `${team.primaryColor}22`, color: team.primaryColor }}>
                          {player.number}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black text-white truncate">{player.name}</p>
                          {player.isCaptain && <span className="text-[7px] px-1 rounded bg-white/10 text-white/50 shrink-0">C</span>}
                          {player.isKeyPlayer && <span style={{ color: team.primaryColor }} className="text-[10px] shrink-0">★</span>}
                        </div>
                        <p className="text-[8px] text-white/35 truncate mt-0.5">{player.live?.posName || player.club}</p>
                      </div>

                      <div className="text-right shrink-0">
                        {player.live ? (
                          <>
                            <p className="text-xs font-black text-white">{player.live.age ?? '–'}</p>
                            <p className="text-[7px] text-white/25">years</p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-black text-white">{player.goals}</p>
                            <p className="text-[7px] text-white/25">goals</p>
                          </>
                        )}
                      </div>
                    </motion.button>
                  ))}
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
            Squads are projected. Official FIFA squads announced 10 days before tournament.
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
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

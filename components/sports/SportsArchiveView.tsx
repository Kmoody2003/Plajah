/**
 * SportsArchiveView — the Plajah Sports Archive Vault.
 *
 * Deep historical explorer backed by non-ESPN repositories and official
 * league APIs (sportsArchiveSourcesService):
 *   NFL  — full season rosters w/ bios + headshots (nflverse, 1960s→today)
 *   MLB  — official historical rosters for any season since 1901
 *   NHL  — franchise rosters by season with headshots (official NHL API)
 *   F1   — every race result + championship since 1950 (Jolpica/Ergast)
 * Plus the source registry with licensing/attribution for transparency.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  X, Search, Database, User, Trophy, Flag, ChevronDown, Library, ExternalLink,
} from 'lucide-react';
import {
  fetchNflverseRosterSeason, fetchMlbTeams, fetchMlbHistoricalRoster,
  fetchNhlHistoricalRoster, fetchF1SeasonArchive,
  ARCHIVE_SOURCES, type ArchiveRosterPlayer,
} from '../../services/sportsArchiveSourcesService';

type ArchiveLeague = 'NFL' | 'MLB' | 'NHL' | 'F1' | 'SOURCES';

const SEASON_RANGES: Record<string, [number, number]> = {
  NFL: [1970, new Date().getFullYear()],
  MLB: [1901, new Date().getFullYear()],
  NHL: [1960, new Date().getFullYear() - 1],
  F1:  [1950, new Date().getFullYear()],
};

const NHL_TEAMS = ['ANA','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL','DET','EDM','FLA','LAK','MIN','MTL','NSH','NJD','NYI','NYR','OTT','PHI','PIT','SEA','SJS','STL','TBL','TOR','UTA','VAN','VGK','WPG','WSH'];

const PlayerArchiveCard: React.FC<{ p: ArchiveRosterPlayer }> = ({ p }) => (
  <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/[0.06] hover:border-[#FF8C00]/30 transition-all">
    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 shrink-0">
      {p.headshot
        ? <img src={p.headshot} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
        : <div className="w-full h-full flex items-center justify-center"><User size={16} className="text-white/20" /></div>}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-black truncate">{p.name}</p>
      <p className="text-[8px] font-bold uppercase tracking-widest text-white/35 truncate">
        {[p.position, p.jersey && `#${p.jersey}`, p.team].filter(Boolean).join(' · ')}
      </p>
      {(p.height || p.college || p.birthDate) && (
        <p className="text-[7px] text-white/25 truncate mt-0.5">
          {[p.height, p.weight, p.college, p.birthDate && `b. ${p.birthDate}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  </div>
);

export const SportsArchiveView: React.FC<{ initialLeague?: string; onClose: () => void }> = ({ initialLeague, onClose }) => {
  const startLeague: ArchiveLeague = (['NFL', 'MLB', 'NHL', 'F1'] as const).includes(initialLeague as any)
    ? (initialLeague as ArchiveLeague) : 'NFL';

  const [league, setLeague] = useState<ArchiveLeague>(startLeague);
  const [season, setSeason] = useState<number>(SEASON_RANGES[startLeague === 'SOURCES' ? 'NFL' : startLeague]?.[1] ?? 2024);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const [players, setPlayers] = useState<ArchiveRosterPlayer[]>([]);
  const [mlbTeams, setMlbTeams] = useState<{ id: number; name: string }[]>([]);
  const [mlbTeamId, setMlbTeamId] = useState<number | null>(null);
  const [nhlTeam, setNhlTeam] = useState('TOR');
  const [f1Archive, setF1Archive] = useState<any>(null);

  // Clamp season into range when switching league
  useEffect(() => {
    if (league === 'SOURCES') return;
    const [lo, hi] = SEASON_RANGES[league];
    setSeason(s => Math.min(hi, Math.max(lo, s)));
    setPlayers([]);
    setF1Archive(null);
  }, [league]);

  useEffect(() => {
    if (league !== 'MLB') return;
    fetchMlbTeams(season).then(ts => {
      setMlbTeams(ts);
      setMlbTeamId(prev => (prev && ts.some(t => t.id === prev) ? prev : ts[0]?.id ?? null));
    }).catch(() => {});
  }, [league, season]);

  useEffect(() => {
    if (league === 'SOURCES') return;
    setLoading(true);
    let cancelled = false;
    const done = (ps: ArchiveRosterPlayer[]) => { if (!cancelled) { setPlayers(ps); setLoading(false); } };

    if (league === 'NFL') fetchNflverseRosterSeason(season).then(done).catch(() => done([]));
    else if (league === 'MLB' && mlbTeamId) fetchMlbHistoricalRoster(mlbTeamId, season).then(done).catch(() => done([]));
    else if (league === 'NHL') fetchNhlHistoricalRoster(nhlTeam, season).then(done).catch(() => done([]));
    else if (league === 'F1') {
      fetchF1SeasonArchive(season)
        .then(a => { if (!cancelled) { setF1Archive(a); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    } else setLoading(false);

    return () => { cancelled = true; };
  }, [league, season, mlbTeamId, nhlTeam]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players.slice(0, 400);
    return players.filter(p =>
      p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q) || p.college?.toLowerCase().includes(q)
    ).slice(0, 400);
  }, [players, query]);

  const [lo, hi] = SEASON_RANGES[league === 'SOURCES' ? 'NFL' : league];
  const seasons = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[900] bg-black/90 backdrop-blur-xl overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF8C00]/15 border border-[#FF8C00]/30 flex items-center justify-center">
              <Library size={16} className="text-[#FF8C00]" />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30">Plajah Sports</p>
              <h2 className="text-xl font-black uppercase tracking-tight italic">Archive Vault</h2>
            </div>
          </div>
          <button onClick={onClose}
            className="p-3 bg-white/5 border border-white/10 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* League tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['NFL', 'MLB', 'NHL', 'F1', 'SOURCES'] as ArchiveLeague[]).map(l => (
            <button key={l} onClick={() => setLeague(l)}
              className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                league === l ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
              {l === 'SOURCES' ? <span className="flex items-center gap-1.5"><Database size={10} /> Data Sources</span> : l}
            </button>
          ))}
        </div>

        {/* Controls */}
        {league !== 'SOURCES' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select value={season} onChange={e => setSeason(Number(e.target.value))}
                className="appearance-none bg-white/5 border border-white/10 rounded-2xl pl-4 pr-9 py-2.5 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-[#FF8C00]/50">
                {seasons.map(y => <option key={y} value={y} className="bg-[#0c0c14]">{league === 'NHL' ? `${y}–${String(y + 1).slice(2)}` : y}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            </div>

            {league === 'MLB' && (
              <div className="relative">
                <select value={mlbTeamId ?? ''} onChange={e => setMlbTeamId(Number(e.target.value))}
                  className="appearance-none bg-white/5 border border-white/10 rounded-2xl pl-4 pr-9 py-2.5 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-[#FF8C00]/50 max-w-56">
                  {mlbTeams.map(t => <option key={t.id} value={t.id} className="bg-[#0c0c14]">{t.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            )}

            {league === 'NHL' && (
              <div className="relative">
                <select value={nhlTeam} onChange={e => setNhlTeam(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 rounded-2xl pl-4 pr-9 py-2.5 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-[#FF8C00]/50">
                  {NHL_TEAMS.map(t => <option key={t} value={t} className="bg-[#0c0c14]">{t}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            )}

            {league !== 'F1' && (
              <div className="relative flex-1 min-w-48">
                <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search player, team, college…"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-[10px] font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF8C00]/50" />
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" />
          </div>
        )}

        {/* Roster grids (NFL / MLB / NHL) */}
        {!loading && league !== 'F1' && league !== 'SOURCES' && (
          <>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/25">
              {players.length.toLocaleString()} players archived for {league === 'NHL' ? `${nhlTeam} ${season}–${String(season + 1).slice(2)}` : season}
              {filtered.length < players.length ? ` — showing ${filtered.length}` : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map((p, i) => <PlayerArchiveCard key={`${p.name}-${p.team}-${i}`} p={p} />)}
            </div>
            {players.length === 0 && (
              <div className="py-16 text-center">
                <User size={32} className="mx-auto text-white/10 mb-3" />
                <p className="text-[9px] font-black uppercase tracking-widest text-white/25">No archive data for this selection</p>
              </div>
            )}
          </>
        )}

        {/* F1 season archive */}
        {!loading && league === 'F1' && f1Archive && (
          <div className="space-y-6">
            {/* Championship standings */}
            <div>
              <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2 mb-3">
                <Trophy size={10} /> {season} World Championship
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(f1Archive.driverStandings as any[]).slice(0, 10).map((d: any) => (
                  <div key={d.position} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-2xl">
                    <span className={`text-sm font-black w-7 text-center ${d.position === '1' ? 'text-[#FF8C00]' : 'text-white/30'}`}>{d.position}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black truncate">{d.Driver?.givenName} {d.Driver?.familyName}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-white/35">{d.Constructors?.[0]?.name} · {d.wins} wins</p>
                    </div>
                    <span className="text-[11px] font-black tabular-nums">{d.points} pts</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Race results */}
            <div>
              <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2 mb-3">
                <Flag size={10} /> Race Results — {f1Archive.results.length} rounds
              </h3>
              <div className="space-y-2">
                {(f1Archive.results as any[]).map((race: any) => (
                  <div key={race.round} className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-[11px] font-black">{race.raceName}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-white/30">
                          R{race.round} · {race.Circuit?.circuitName} · {race.date}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {(race.Results ?? []).slice(0, 3).map((r: any) => (
                          <div key={r.position} className="text-right">
                            <p className={`text-[10px] font-black ${r.position === '1' ? 'text-[#FF8C00]' : 'text-white/60'}`}>
                              P{r.position} {r.Driver?.familyName}
                            </p>
                            <p className="text-[7px] text-white/25 uppercase tracking-widest">{r.Constructor?.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {!loading && league === 'F1' && !f1Archive && (
          <div className="py-16 text-center">
            <Flag size={32} className="mx-auto text-white/10 mb-3" />
            <p className="text-[9px] font-black uppercase tracking-widest text-white/25">Season archive unavailable</p>
          </div>
        )}

        {/* Source registry */}
        {league === 'SOURCES' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ARCHIVE_SOURCES.map(src => (
              <a key={src.id} href={src.url} target="_blank" rel="noopener noreferrer"
                className="p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:border-[#FF8C00]/30 transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-black uppercase tracking-wide group-hover:text-[#FF8C00] transition-colors">{src.label}</p>
                  <ExternalLink size={11} className="text-white/20 group-hover:text-[#FF8C00]" />
                </div>
                <p className="text-[9px] text-white/45 leading-relaxed">{src.description}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {src.leagues.map(l => (
                    <span key={l} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[7px] font-black uppercase tracking-widest text-white/40">{l}</span>
                  ))}
                  <span className="px-2 py-0.5 rounded-full bg-[#FF8C00]/10 border border-[#FF8C00]/20 text-[7px] font-black uppercase tracking-widest text-[#FF8C00]/70">{src.kind}</span>
                </div>
                <p className="text-[7px] text-white/20 mt-2">{src.licenseNote}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default SportsArchiveView;

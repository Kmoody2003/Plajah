import React from 'react';
import {
  ControlSideMode,
  PlayStyleMode,
  PlayType,
  SkillLevel,
} from '../types';
import { SOL_TEAM_LIST, SOL_TEAMS } from '../game/leagueData';
import { Flame, Trophy, Shield, UserCheck, Box, Sparkles, Clock } from 'lucide-react';

interface PreDriveModalProps {
  playStyle: PlayStyleMode;
  skillLevel: SkillLevel;
  controlSide: ControlSideMode;
  playerMode: 'ATHLETE' | 'BLOCK';
  userTeamId: string;
  cpuTeamId: string;
  quarterLengthSeconds: number;
  isGuided: boolean;
  selectedPlay: PlayType;
  onChangePlayStyle: (style: PlayStyleMode) => void;
  onChangeSkillLevel: (skill: SkillLevel) => void;
  onChangeControlSide: (side: ControlSideMode) => void;
  onChangePlayerMode: (mode: 'ATHLETE' | 'BLOCK') => void;
  onChangeUserTeam: (id: string) => void;
  onChangeCpuTeam: (id: string) => void;
  onChangeQuarterLength: (secs: number) => void;
  onChangeGuided: (guided: boolean) => void;
  onChangePlay: (play: PlayType) => void;
  onEnterField: () => void;
  onBackToMenu: () => void;
}

const SKILL_CARDS: { id: SkillLevel; label: string; badge: string; desc: string }[] = [
  { id: 'ROOKIE', label: 'Rookie', badge: 'Newcomer', desc: 'Guided Coach Picks, wide windows & slower rush' },
  { id: 'PRO', label: 'Pro', badge: 'Balanced', desc: 'Authentic blocking, balanced zones & skill moves' },
  { id: 'ALL_PRO', label: 'All-Pro', badge: 'Veteran', desc: 'Tight Madden windows, sharp DBs & fast pass rush' },
  { id: 'LEGEND', label: 'Elohim Legend', badge: 'Master', desc: 'Elite blitzes, ball-hawk picks & no hand-holding' },
];

export const PreDriveModal: React.FC<PreDriveModalProps> = ({
  playStyle,
  skillLevel,
  controlSide,
  playerMode,
  userTeamId,
  cpuTeamId,
  quarterLengthSeconds,
  onChangePlayStyle,
  onChangeSkillLevel,
  onChangeControlSide,
  onChangePlayerMode,
  onChangeUserTeam,
  onChangeCpuTeam,
  onChangeQuarterLength,
  onEnterField,
  onBackToMenu,
}) => {
  const userTeam = SOL_TEAMS[userTeamId] || SOL_TEAMS.AURORA;
  const cpuTeam = SOL_TEAMS[cpuTeamId] || SOL_TEAMS.CURRENT;

  return (
    <div
      id="pre-drive-modal"
      className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md select-none font-sans overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl p-5 sm:p-7 rounded-3xl bg-[#0E0C1A]/95 backdrop-blur-2xl border border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.95)] flex flex-col gap-4 text-white max-h-[94vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#00DAF3] font-['Chakra_Petch']">
              <Sparkles size={13} />
              <span>Legends of Elohim · SOL Timeline Gridiron</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-['Rajdhani'] uppercase tracking-wide text-white mt-0.5">
              Matchup &amp; Experience Setup
            </h2>
          </div>

          {/* Mode Pill Switcher: Simulation vs Arcade */}
          <div className="flex items-center p-1 rounded-2xl bg-slate-900 border border-white/15">
            <button
              type="button"
              onClick={() => onChangePlayStyle('SIMULATION')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider font-['Rajdhani'] flex items-center gap-1.5 cursor-pointer transition ${
                playStyle === 'SIMULATION'
                  ? 'bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Trophy size={14} /> Simulation (SOL)
            </button>
            <button
              type="button"
              onClick={() => onChangePlayStyle('ARCADE')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider font-['Rajdhani'] flex items-center gap-1.5 cursor-pointer transition ${
                playStyle === 'ARCADE'
                  ? 'bg-gradient-to-r from-[#6B0099] to-[#00DAF3] text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Flame size={14} /> Fever Jam Arcade
            </button>
          </div>
        </div>

        {/* Team Select Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* YOUR TEAM (HOME) */}
          <div className="p-4 rounded-2xl bg-slate-900/75 border border-white/15 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-amber-300 font-['Chakra_Petch']">
                Your Franchise (Home)
              </span>
              <span className="text-[11px] font-mono text-slate-400">{userTeam.division}</span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl font-['Teko'] border border-white/30 shadow-lg shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${userTeam.primaryColor}, ${userTeam.helmetColor})`,
                  color: '#fff',
                }}
              >
                {userTeam.abbr}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black font-['Rajdhani'] uppercase leading-tight truncate">
                  {userTeam.city} {userTeam.name}
                </div>
                <div className="text-[11px] text-cyan-300 font-semibold truncate">
                  {userTeam.stadiumName} · {userTeam.schemeOffense}
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{userTeam.loreTagline}</div>
              </div>
              <div className="px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 text-center">
                <div className="text-[9px] text-slate-400 uppercase font-bold">OVR</div>
                <div className="text-lg font-black font-['Teko'] text-amber-300 leading-none">{userTeam.ratings.ovr}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {SOL_TEAM_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeUserTeam(t.id)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold font-['Rajdhani'] uppercase border transition cursor-pointer truncate ${
                    userTeamId === t.id
                      ? 'border-amber-400 text-white shadow-md'
                      : 'bg-slate-950/70 border-white/10 text-slate-400 hover:text-white'
                  }`}
                  style={userTeamId === t.id ? { backgroundColor: t.primaryColor } : undefined}
                >
                  {t.abbr} · {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* OPPONENT TEAM (AWAY) */}
          <div className="p-4 rounded-2xl bg-slate-900/75 border border-white/15 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-cyan-300 font-['Chakra_Petch']">
                Opponent (Away CPU)
              </span>
              <span className="text-[11px] font-mono text-slate-400">{cpuTeam.division}</span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl font-['Teko'] border border-white/30 shadow-lg shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${cpuTeam.primaryColor}, ${cpuTeam.helmetColor})`,
                  color: '#fff',
                }}
              >
                {cpuTeam.abbr}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black font-['Rajdhani'] uppercase leading-tight truncate">
                  {cpuTeam.city} {cpuTeam.name}
                </div>
                <div className="text-[11px] text-amber-300 font-semibold truncate">
                  {cpuTeam.schemeDefense} · Star: {cpuTeam.starPlayers.qb.name}
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{cpuTeam.loreTagline}</div>
              </div>
              <div className="px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 text-center">
                <div className="text-[9px] text-slate-400 uppercase font-bold">OVR</div>
                <div className="text-lg font-black font-['Teko'] text-cyan-300 leading-none">{cpuTeam.ratings.ovr}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {SOL_TEAM_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeCpuTeam(t.id)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold font-['Rajdhani'] uppercase border transition cursor-pointer truncate ${
                    cpuTeamId === t.id
                      ? 'border-cyan-400 text-white shadow-md'
                      : 'bg-slate-950/70 border-white/10 text-slate-400 hover:text-white'
                  }`}
                  style={cpuTeamId === t.id ? { backgroundColor: t.primaryColor } : undefined}
                >
                  {t.abbr} · {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scalable Experience / Skill Tier */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-['Chakra_Petch']">
              Experience &amp; Skill Level (Scales AI, Windows &amp; Coaching)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SKILL_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onChangeSkillLevel(card.id)}
                className={`p-3 rounded-2xl text-left border transition cursor-pointer ${
                  skillLevel === card.id
                    ? 'bg-purple-950/75 border-orange-400 ring-1 ring-orange-400 shadow-[0_0_16px_rgba(249,115,22,0.3)]'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-sm font-['Rajdhani'] uppercase text-white">{card.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-bold uppercase">
                    {card.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1 leading-snug">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Row: Character Style (Pro vs Blocky), Control Scope & Quarter Length */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Character Models */}
          <div className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <UserCheck size={12} className="text-amber-300" /> Player Models
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onChangePlayerMode('ATHLETE')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border cursor-pointer transition ${
                  playerMode === 'ATHLETE'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950/60 border-white/10 text-slate-400'
                }`}
              >
                Pro Football
              </button>
              <button
                type="button"
                onClick={() => onChangePlayerMode('BLOCK')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border cursor-pointer transition flex items-center justify-center gap-1 ${
                  playerMode === 'BLOCK'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-slate-950/60 border-white/10 text-slate-400'
                }`}
              >
                <Box size={12} /> Blocky Classic
              </button>
            </div>
          </div>

          {/* Offense + Defense vs Offense Only */}
          <div className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Shield size={12} className="text-cyan-300" /> Play Control
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onChangeControlSide('FULL_GAME')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer transition ${
                  controlSide === 'FULL_GAME'
                    ? 'bg-purple-500/25 border-purple-400 text-white'
                    : 'bg-slate-950/60 border-white/10 text-slate-400'
                }`}
              >
                Full Game (O+D)
              </button>
              <button
                type="button"
                onClick={() => onChangeControlSide('OFFENSE_ONLY')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer transition ${
                  controlSide === 'OFFENSE_ONLY'
                    ? 'bg-purple-500/25 border-purple-400 text-white'
                    : 'bg-slate-950/60 border-white/10 text-slate-400'
                }`}
              >
                Offense Only
              </button>
            </div>
          </div>

          {/* Quarter Length */}
          <div className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Clock size={12} className="text-emerald-300" /> Quarter Length
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {[120, 180, 300].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onChangeQuarterLength(sec)}
                  className={`py-2 rounded-xl text-xs font-bold border cursor-pointer transition ${
                    quarterLengthSeconds === sec
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-slate-950/60 border-white/10 text-slate-400'
                  }`}
                >
                  {sec / 60} min
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onBackToMenu}
            className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-slate-300 hover:text-white text-sm font-bold uppercase tracking-wider font-['Rajdhani'] cursor-pointer transition"
          >
            Back
          </button>
          <button
            id="enter-field-btn"
            type="button"
            onClick={onEnterField}
            className="flex-1 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#FF8C00] via-[#F97316] to-[#D40055] hover:brightness-110 text-slate-950 font-black text-lg tracking-wider font-['Rajdhani'] uppercase shadow-[0_0_28px_rgba(249,115,22,0.55)] cursor-pointer transition active:scale-[0.98] border border-orange-300/50 text-center"
          >
            KICK OFF · ENTER {userTeam.stadiumName.toUpperCase()} [SPACE]
          </button>
        </div>
      </div>
    </div>
  );
};

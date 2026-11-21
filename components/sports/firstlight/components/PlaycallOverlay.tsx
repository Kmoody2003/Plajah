import React, { useState } from 'react';
import {
  DefensePlayType,
  DriveState,
  PlayCategory,
  PlayType,
} from '../types';
import {
  DEFENSIVE_PLAYBOOK,
  OFFENSIVE_PLAYBOOK,
  PlayDiagramPath,
  recommendCoachPlay,
  recommendDefensePlay,
} from '../game/playbook';
import { formatDownLabel, formatYardSpot } from '../game/GameRules';
import { Sparkles, Repeat, Shield, Zap } from 'lucide-react';

interface PlaycallOverlayProps {
  driveState: DriveState;
  isDefenseCall: boolean;
  onCallOffensePlay: (play: PlayType) => void;
  onCallDefensePlay: (play: DefensePlayType) => void;
  onFlipPlay: () => void;
}

const PlayDiagramSVG: React.FC<{ paths: PlayDiagramPath[]; isDefense?: boolean }> = ({ paths, isDefense }) => (
  <svg viewBox="0 0 100 100" className="w-full h-20 rounded-xl bg-emerald-950/85 border border-emerald-500/25">
    {/* Yard Stripes */}
    {[22, 44, 66, 86].map((y) => (
      <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
    ))}
    {/* Line of Scrimmage */}
    <line x1="0" y1="76" x2="100" y2="76" stroke="#00DAF3" strokeWidth="1.4" strokeDasharray="3 2" />
    {/* Linemen dots */}
    {[38, 44, 50, 56, 62].map((x) => (
      <circle key={x} cx={x} cy={76} r={2.2} fill={isDefense ? '#38bdf8' : '#e2e8f0'} />
    ))}
    {paths.map((p, idx) => {
      const pts = [p.from, ...p.points];
      const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
      const end = pts[pts.length - 1];
      return (
        <g key={idx}>
          <circle cx={p.from[0]} cy={p.from[1]} r={2.6} fill={p.color} />
          <path
            d={d}
            fill="none"
            stroke={p.color}
            strokeWidth={p.isBlock ? 1.8 : 2.3}
            strokeDasharray={p.dashed ? '3 2' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={end[0]} cy={end[1]} r={2.2} fill={p.color} />
        </g>
      );
    })}
  </svg>
);

export const PlaycallOverlay: React.FC<PlaycallOverlayProps> = ({
  driveState,
  isDefenseCall,
  onCallOffensePlay,
  onCallDefensePlay,
  onFlipPlay,
}) => {
  const [offTab, setOffTab] = useState<'COACH' | PlayCategory>('COACH');
  const [defTab, setDefTab] = useState<'COACH' | 'ZONE' | 'MAN' | 'BLITZ' | 'GOAL_LINE'>('COACH');

  const coachOffId = recommendCoachPlay(driveState);
  const coachDefId = recommendDefensePlay(driveState);

  const visibleOffPlays =
    offTab === 'COACH'
      ? [
          OFFENSIVE_PLAYBOOK.find((p) => p.id === coachOffId)!,
          ...OFFENSIVE_PLAYBOOK.filter((p) => p.id !== coachOffId && p.category !== 'SPECIAL').slice(0, 2),
          ...(driveState.down === 4 ? OFFENSIVE_PLAYBOOK.filter((p) => p.category === 'SPECIAL' && p.id !== coachOffId) : []),
        ].slice(0, 4)
      : OFFENSIVE_PLAYBOOK.filter((p) => p.category === offTab);

  const visibleDefPlays =
    defTab === 'COACH'
      ? [
          DEFENSIVE_PLAYBOOK.find((p) => p.id === coachDefId)!,
          ...DEFENSIVE_PLAYBOOK.filter((p) => p.id !== coachDefId).slice(0, 2),
        ]
      : DEFENSIVE_PLAYBOOK.filter((p) => p.category === defTab);

  const downText = formatDownLabel(driveState.down, driveState.yardsToGo, driveState.ballYardLine);
  const spotText = formatYardSpot(
    driveState.ballYardLine,
    driveState.offenseTeam.abbr || 'OWN',
    driveState.defenseTeam.abbr || 'OPP'
  );

  return (
    <div
      id="playcall-overlay"
      className="absolute inset-x-0 bottom-0 z-30 p-3 sm:p-5 pointer-events-none flex justify-center select-none"
    >
      <div className="pointer-events-auto w-full max-w-5xl rounded-3xl bg-[#0B0A16]/92 backdrop-blur-2xl border border-white/20 shadow-[0_-10px_50px_rgba(0,0,0,0.85)] p-4 sm:p-5 flex flex-col gap-3 text-white">
        {/* Top Row: Situation + Category Tabs + Flip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest font-['Chakra_Petch'] flex items-center gap-1.5 ${
                isDefenseCall
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                  : 'bg-orange-500/20 text-orange-300 border border-orange-400/40'
              }`}
            >
              {isDefenseCall ? <Shield size={13} /> : <Zap size={13} />}
              {isDefenseCall ? 'CALL DEFENSE' : 'CALL OFFENSE'}
            </span>
            <span className="text-sm sm:text-base font-black font-['Rajdhani'] uppercase text-white">
              {downText} · <span className="text-cyan-300">{spotText}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {!isDefenseCall ? (
              (
                [
                  { id: 'COACH', label: "Coach's Pick" },
                  { id: 'PASS', label: 'Pass' },
                  { id: 'RUN', label: 'Run' },
                  { id: 'PLAY_ACTION', label: 'Play Action' },
                  { id: 'SPECIAL', label: 'Special Teams' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOffTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider font-['Rajdhani'] cursor-pointer transition ${
                    offTab === tab.id
                      ? 'bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 font-black'
                      : 'bg-white/5 hover:bg-white/15 text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            ) : (
              (
                [
                  { id: 'COACH', label: "Coach's Pick" },
                  { id: 'ZONE', label: 'Zone' },
                  { id: 'MAN', label: 'Man' },
                  { id: 'BLITZ', label: 'Blitz' },
                  { id: 'GOAL_LINE', label: 'Goal Line' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDefTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider font-['Rajdhani'] cursor-pointer transition ${
                    defTab === tab.id
                      ? 'bg-gradient-to-r from-[#00DAF3] to-[#6B0099] text-white font-black'
                      : 'bg-white/5 hover:bg-white/15 text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            )}

            {!isDefenseCall && (
              <button
                onClick={onFlipPlay}
                title="Flip Play Direction [Q]"
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <Repeat size={13} /> Flip
              </button>
            )}
          </div>
        </div>

        {/* Play Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 max-h-[34vh] overflow-y-auto pr-1">
          {!isDefenseCall
            ? visibleOffPlays.map((play, idx) => {
                const isRecommended = play.id === coachOffId;
                return (
                  <button
                    key={play.id}
                    id={`playcall-card-${play.id}`}
                    onClick={() => onCallOffensePlay(play.id)}
                    className={`p-3 rounded-2xl text-left border transition-all cursor-pointer flex flex-col gap-2 hover:scale-[1.01] active:scale-[0.98] ${
                      isRecommended
                        ? 'bg-purple-950/65 border-amber-400/70 hover:border-amber-300 shadow-[0_0_20px_rgba(255,140,0,0.2)]'
                        : 'bg-slate-900/75 border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-black font-['Rajdhani'] uppercase text-white truncate">
                        {play.name}
                      </span>
                      {isRecommended ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase flex items-center gap-0.5 shrink-0">
                          <Sparkles size={9} /> Best
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400">[{idx + 1}]</span>
                      )}
                    </div>
                    <PlayDiagramSVG paths={play.diagram} />
                    <div className="flex items-center justify-between text-[10px] text-cyan-300 font-semibold">
                      <span>{play.formationLabel}</span>
                      <span className="text-slate-400">{play.idealSituation}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">{play.coachTip}</p>
                  </button>
                );
              })
            : visibleDefPlays.map((play, idx) => {
                const isRecommended = play.id === coachDefId;
                return (
                  <button
                    key={play.id}
                    id={`playcall-def-${play.id}`}
                    onClick={() => onCallDefensePlay(play.id)}
                    className={`p-3 rounded-2xl text-left border transition-all cursor-pointer flex flex-col gap-2 hover:scale-[1.01] active:scale-[0.98] ${
                      isRecommended
                        ? 'bg-cyan-950/65 border-cyan-400/70 hover:border-cyan-300 shadow-[0_0_20px_rgba(0,218,243,0.2)]'
                        : 'bg-slate-900/75 border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-black font-['Rajdhani'] uppercase text-white truncate">
                        {play.name}
                      </span>
                      {isRecommended ? (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[9px] font-black uppercase shrink-0">
                          Coach Pick
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400">[{idx + 1}]</span>
                      )}
                    </div>
                    <PlayDiagramSVG paths={play.diagram} isDefense />
                    <div className="text-[10px] text-amber-300 font-semibold">{play.shellLabel}</div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">{play.coachTip}</p>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
};

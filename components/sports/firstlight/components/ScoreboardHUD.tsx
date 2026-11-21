import React, { useRef } from 'react';
import {
  ArcadeState,
  DriveState,
  GameMode,
  KickMeterState,
  PlayerActionMove,
  ReceiverRoute,
} from '../types';
import { formatDownLabel, formatYardSpot } from '../game/GameRules';
import {
  Volume2,
  VolumeX,
  Eye,
  ArrowLeftRight,
  Radio,
  Flame,
  Shield,
  BookOpen,
  Timer,
  Repeat,
  Zap,
} from 'lucide-react';

interface ScoreboardHUDProps {
  driveState: DriveState;
  gameMode: GameMode;
  arcadeState: ArcadeState;
  kickMeter: KickMeterState;
  pocketTime: number;
  receivers: ReceiverRoute[];
  selectedReceiverIdx: number;
  isBallSnapped: boolean;
  isPassInAir: boolean;
  isGuidedMode: boolean;
  hasBallCarrier?: boolean;
  invertControls: boolean;
  onToggleInvertControls: () => void;
  onSelectReceiver: (idx: number) => void;
  onSnapOrThrow: (isBullet?: boolean) => void;
  onAdvanceKick: () => void;
  onTriggerSkillMove: (move: PlayerActionMove) => void;
  onSwitchDefender: () => void;
  onOpenPlaybook: () => void;
  onFlipPlay: () => void;
  onCallTimeout: () => void;
  onMoveQB: (dir: 'LEFT' | 'RIGHT') => void;
  onMoveInput?: (forward: number, lateral: number, sprint?: boolean, juke?: boolean) => void;
  onNextDown: () => void;
  onOpenControls: () => void;
  onOpenStadiumCreator: () => void;
  onToggleSound: () => void;
  isMuted: boolean;
  onPause: () => void;
}

export const ScoreboardHUD: React.FC<ScoreboardHUDProps> = ({
  driveState,
  gameMode,
  arcadeState,
  kickMeter,
  pocketTime,
  receivers,
  selectedReceiverIdx,
  isBallSnapped,
  isPassInAir,
  isGuidedMode,
  hasBallCarrier = false,
  invertControls,
  onToggleInvertControls,
  onSelectReceiver,
  onSnapOrThrow,
  onAdvanceKick,
  onTriggerSkillMove,
  onSwitchDefender,
  onOpenPlaybook,
  onFlipPlay,
  onCallTimeout,
  onMoveInput,
  onOpenControls,
  onOpenStadiumCreator,
  onToggleSound,
  isMuted,
  onPause,
}) => {
  const pointers = useRef(new Map<number, { forward: number; lateral: number; sprint: boolean }>());
  const held = (forward: number, lateral: number, sprint = false) => {
    const publish = () => {
      const values = [...pointers.current.values()];
      onMoveInput?.(
        Math.max(-1, Math.min(1, values.reduce((n, v) => n + v.forward, 0))),
        Math.max(-1, Math.min(1, values.reduce((n, v) => n + v.lateral, 0))),
        values.some((v) => v.sprint)
      );
    };
    const release = (e: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
      publish();
    };
    return {
      style: { touchAction: 'none' },
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { forward, lateral, sprint });
        publish();
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
    };
  };

  const isArcade = driveState.playStyle === 'ARCADE';
  const isUserDefense = driveState.possession === 'CPU';
  const home = driveState.homeTeam || driveState.offenseTeam;
  const away = driveState.awayTeam || driveState.defenseTeam;
  const downText = formatDownLabel(driveState.down, driveState.yardsToGo, driveState.ballYardLine);
  const spotText = formatYardSpot(
    driveState.ballYardLine,
    driveState.offenseTeam.abbr || 'OWN',
    driveState.defenseTeam.abbr || 'OPP'
  );

  let pocketColor = 'bg-sky-500/20 text-sky-300 border-sky-400/40';
  if (pocketTime <= 1.6) pocketColor = 'bg-red-500/30 text-red-300 border-red-500/60 animate-pulse';
  else if (pocketTime <= 3.2) pocketColor = 'bg-amber-500/25 text-amber-300 border-amber-400/50';

  const activeReceiver = receivers[selectedReceiverIdx];
  const quarterLabel = driveState.quarter > 4 ? 'OT' : `Q${driveState.quarter}`;

  return (
    <div
      id="gameplay-hud"
      className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 select-none z-10 font-sans"
    >
      {/* 1. PRO NFL / SOL BROADCAST SCOREBUG */}
      <div className="w-full flex flex-col items-center gap-1.5 pointer-events-auto">
        <div className="w-full max-w-6xl flex items-center justify-between text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-300 px-1 font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] tracking-widest ${
                isArcade
                  ? 'bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950'
                  : 'bg-red-600/90 text-white'
              }`}
            >
              {isArcade ? <Flame size={11} /> : <Radio size={11} />}
              {isArcade ? 'FEVER JAM ARCADE' : 'PSN · SOL PRIME TIME'}
            </span>
            <span className="hidden md:inline text-cyan-300 font-semibold font-['Chakra_Petch']">
              {(home.stadiumName || 'FIRSTLIGHT CITADEL').toUpperCase()} · {driveState.skillLevel || 'PRO'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {driveState.isRedZone && (
              <span className="px-2 py-0.5 rounded bg-red-600/80 text-white font-black text-[10px] animate-pulse">
                RED ZONE
              </span>
            )}
            <button
              onClick={onCallTimeout}
              title="Call Timeout"
              className="px-2 py-0.5 rounded bg-slate-900/85 hover:bg-slate-800 border border-white/15 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Timer size={10} className="text-amber-300" /> TO ({home.timeouts ?? 3})
            </button>
          </div>
        </div>

        {/* Main Broadcast Scorebug Bar */}
        <div className="w-full max-w-6xl flex items-center justify-between gap-2">
          <div
            className={`flex-1 flex items-center justify-between rounded-2xl backdrop-blur-xl border shadow-2xl overflow-hidden ${
              isArcade
                ? 'bg-[#150826]/90 border-[#FF8C00]/50 shadow-[0_0_24px_rgba(255,140,0,0.25)]'
                : 'bg-[#090d18]/92 border-white/15'
            }`}
          >
            {/* USER / HOME TEAM */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 border-r border-white/10">
              <div
                className="w-2.5 h-8 rounded-full"
                style={{ backgroundColor: home.primaryColor, boxShadow: `0 0 10px ${home.secondaryColor}` }}
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-black font-['Rajdhani'] text-sm sm:text-lg uppercase text-white leading-none">
                    {home.abbr || home.name}
                  </span>
                  {driveState.possession === 'USER' && (
                    <span className="w-2 h-2 rounded-full bg-[#FF8C00] shadow-[0_0_8px_#FF8C00]" title="Possession" />
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {[0, 1, 2].map((pip) => (
                    <span
                      key={pip}
                      className={`h-1 w-3 rounded-full ${
                        pip < (home.timeouts ?? 3) ? 'bg-amber-400' : 'bg-white/15'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <span className="font-black text-2xl sm:text-3xl font-['Teko'] text-white ml-1 leading-none">
                {home.score}
              </span>
            </div>

            {/* AWAY / CPU TEAM */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 border-r border-white/10">
              <div
                className="w-2.5 h-8 rounded-full"
                style={{ backgroundColor: away.primaryColor, boxShadow: `0 0 10px ${away.secondaryColor}` }}
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-black font-['Rajdhani'] text-sm sm:text-lg uppercase text-slate-200 leading-none">
                    {away.abbr || away.name}
                  </span>
                  {driveState.possession === 'CPU' && (
                    <span className="w-2 h-2 rounded-full bg-[#00DAF3] shadow-[0_0_8px_#00DAF3]" title="Possession" />
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {[0, 1, 2].map((pip) => (
                    <span
                      key={pip}
                      className={`h-1 w-3 rounded-full ${
                        pip < (away.timeouts ?? 3) ? 'bg-cyan-400' : 'bg-white/15'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <span className="font-black text-2xl sm:text-3xl font-['Teko'] text-cyan-300 ml-1 leading-none">
                {away.score}
              </span>
            </div>

            {/* QUARTER + CLOCK */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-r border-white/10 font-mono text-xs sm:text-sm">
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-bold">{quarterLabel}</span>
              <span className="font-black text-white text-sm sm:text-base">{driveState.timeRemaining}</span>
            </div>

            {/* DOWN & DISTANCE + SPOT */}
            <div className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs sm:text-base font-black font-['Rajdhani'] uppercase">
              <span className={driveState.down === 3 || driveState.down === 4 ? 'text-amber-300' : 'text-[#00DAF3]'}>
                {downText}
              </span>
              <span className="text-white/30 hidden sm:inline">·</span>
              <span className="text-slate-200 hidden sm:inline">{spotText}</span>
            </div>
          </div>

          {/* Right Quick Utility Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleInvertControls}
              title="Toggle Invert Left/Right Controls [I]"
              className={`hidden md:flex items-center gap-1 px-2.5 py-2 rounded-xl border text-[11px] font-bold cursor-pointer transition ${
                invertControls
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                  : 'bg-slate-900/85 text-slate-300 border-white/15 hover:text-white'
              }`}
            >
              <ArrowLeftRight size={13} /> {invertControls ? 'Inv' : 'Std'}
            </button>
            <button
              onClick={onOpenStadiumCreator}
              title="Camera & Weather"
              className="p-2 rounded-xl bg-slate-900/85 border border-white/15 text-slate-300 hover:text-white cursor-pointer"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={onToggleSound}
              title="Mute / Unmute [M]"
              className="p-2 rounded-xl bg-slate-900/85 border border-white/15 text-slate-300 hover:text-white cursor-pointer"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </div>

        {/* ARCADE FEVER JAM HEAT & TURBO STRIP */}
        {isArcade && (
          <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-xl border border-orange-500/40 shadow-lg text-xs">
            <div className="flex items-center gap-1.5">
              <Flame
                size={15}
                className={
                  arcadeState.heatLevel === 2
                    ? 'text-orange-400 animate-bounce'
                    : arcadeState.heatLevel === 1
                    ? 'text-amber-300'
                    : 'text-slate-500'
                }
              />
              <span className="font-black font-['Rajdhani'] uppercase tracking-wider text-amber-200">
                {arcadeState.heatLevel === 2
                  ? '🔥 ON FIRE!'
                  : arcadeState.heatLevel === 1
                  ? 'HEATING UP'
                  : `STREAK ${arcadeState.streakCount}/3`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Zap size={12} className="text-cyan-300" />
              <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden border border-white/15">
                <div
                  className="h-full bg-gradient-to-r from-[#00DAF3] to-[#FF8C00] transition-all duration-75"
                  style={{ width: `${Math.round(arcadeState.turbo)}%` }}
                />
              </div>
            </div>

            <span className="font-mono font-bold text-amber-300">
              STYLE {arcadeState.stylePoints.toLocaleString()} ({arcadeState.comboMultiplier}X)
            </span>
          </div>
        )}

        {/* ARCADE HYPE CALLOUT POPUP */}
        {isArcade && arcadeState.calloutText && (
          <div
            className="px-5 py-1 rounded-full font-black text-sm sm:text-base font-['Chakra_Petch'] uppercase tracking-widest shadow-2xl border border-white/30 animate-bounce"
            style={{ backgroundColor: arcadeState.calloutColor, color: '#070710' }}
          >
            {arcadeState.calloutText}
          </div>
        )}

        {/* Pocket Timer / Defense Banner / Ball Carrier Banner */}
        {!isUserDefense && isBallSnapped && !isPassInAir && !hasBallCarrier && gameMode === 'PLAYING' && (
          <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase border backdrop-blur-md flex items-center gap-2 ${pocketColor}`}>
            <span>Pocket Time:</span>
            <span className="font-mono text-sm font-black">{pocketTime.toFixed(1)}s</span>
          </div>
        )}

        {isUserDefense && gameMode === 'PLAYING' && (
          <div className="px-4 py-1 rounded-full bg-cyan-950/90 border border-cyan-400/50 text-cyan-200 text-xs font-black uppercase tracking-wider flex items-center gap-2">
            <Shield size={13} className="text-cyan-300" />
            <span>USER DEFENSE · [TAB] Switch · [SPACE/F] Hit-Stick · [E] Swat/Pick</span>
          </div>
        )}

        {hasBallCarrier && !isUserDefense && gameMode === 'PLAYING' && (
          <div className="px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-2">
            <span>BALL CARRIER LIVE!</span>
            <span className="hidden sm:inline font-mono text-[10px] bg-black/25 text-white px-2 py-0.5 rounded">
              [SPACE] Juke · [X] Spin · [F] Truck · [E] Dive · [SHIFT] Turbo
            </span>
          </div>
        )}

        {isGuidedMode && !isUserDefense && activeReceiver && isBallSnapped && !hasBallCarrier && gameMode === 'PLAYING' && (
          <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-950/85 border border-emerald-400/40 text-emerald-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              Target [{activeReceiver.targetKey}]: {activeReceiver.isOpen ? 'OPEN WINDOW!' : 'Tight Coverage'}
            </span>
          </div>
        )}
      </div>

      {/* 2. SPECIAL TEAMS KICK METER OVERLAY */}
      {gameMode === 'KICKING' && kickMeter.active && (
        <div className="pointer-events-auto self-center my-auto p-5 rounded-3xl bg-slate-950/92 backdrop-blur-2xl border border-amber-400/50 shadow-2xl flex flex-col items-center gap-3 text-white w-full max-w-sm">
          <div className="text-xs font-black uppercase tracking-widest text-amber-300 font-['Chakra_Petch']">
            {kickMeter.kind === 'PAT' ? 'EXTRA POINT (1 PT)' : kickMeter.kind === 'PUNT' ? 'BOOM PUNT' : `${kickMeter.distanceYards}-YARD FIELD GOAL`}
          </div>

          {/* Power Gauge */}
          <div className="w-full space-y-1">
            <div className="flex justify-between text-[11px] font-bold text-slate-300">
              <span>1. POWER</span>
              <span className="text-amber-300 font-mono">{Math.round(kickMeter.power * 100)}%</span>
            </div>
            <div className="w-full h-4 rounded-full bg-slate-800 border border-white/15 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"
                style={{ width: `${Math.round(kickMeter.power * 100)}%` }}
              />
            </div>
          </div>

          {/* Accuracy Bar */}
          <div className="w-full space-y-1">
            <div className="flex justify-between text-[11px] font-bold text-slate-300">
              <span>2. ACCURACY</span>
              <span className="text-cyan-300 font-mono">
                Wind: {kickMeter.windX >= 0 ? `→ ${kickMeter.windX.toFixed(1)}` : `← ${Math.abs(kickMeter.windX).toFixed(1)}`} mph
              </span>
            </div>
            <div className="w-full h-5 rounded-full bg-slate-800 border border-white/15 relative overflow-hidden">
              {/* Green Sweet Spot */}
              <div className="absolute inset-y-0 left-[41%] right-[41%] bg-emerald-500/45 border-x border-emerald-300" />
              {/* Moving Needle */}
              <div
                className="absolute top-0 bottom-0 w-2 bg-white shadow-[0_0_10px_#fff] rounded-full -translate-x-1/2"
                style={{ left: `${((kickMeter.accuracy + 1) / 2) * 100}%` }}
              />
            </div>
          </div>

          <button
            id="kick-meter-btn"
            onClick={onAdvanceKick}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 font-black text-base uppercase tracking-wider font-['Rajdhani'] cursor-pointer active:scale-95 transition"
          >
            {kickMeter.phase === 'POWER' ? 'LOCK POWER [SPACE]' : 'KICK NOW! [SPACE]'}
          </button>
        </div>
      )}

      {/* 3. BOTTOM CONTROLS CLUSTER (Hidden while Playbook Drawer is open) */}
      {gameMode === 'PLAYING' && (
        <div className="w-full flex items-end justify-between pointer-events-auto gap-3">
          {/* Bottom Left: Receiver Targets OR Touch D-Pad + Skill Moves */}
          <div className="flex flex-col gap-2 max-w-lg">
            {!isUserDefense && !hasBallCarrier && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {!isBallSnapped && (
                  <>
                    <button
                      onClick={onOpenPlaybook}
                      className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-400/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen size={13} /> Playbook
                    </button>
                    <button
                      onClick={onFlipPlay}
                      className="px-2.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Repeat size={13} /> Flip [Q]
                    </button>
                  </>
                )}

                {receivers.map((rec, idx) => {
                  const isSelected = selectedReceiverIdx === idx;
                  const keyNum = idx + 1;
                  return (
                    <button
                      key={rec.id}
                      id={`pass-btn-${idx}`}
                      onClick={() => onSelectReceiver(idx)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-bold backdrop-blur-md border shadow-md cursor-pointer transition active:scale-95 flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-purple-600/90 text-white border-purple-300 shadow-[0_0_12px_#a855f7]'
                          : rec.isOpen
                          ? 'bg-emerald-950/80 text-emerald-200 border-emerald-500/50'
                          : 'bg-slate-900/85 text-slate-300 border-white/20'
                      }`}
                    >
                      <span className="px-1.5 py-0.5 rounded bg-black/45 text-[10px] font-mono text-cyan-300">
                        {keyNum}
                      </span>
                      <span className="truncate max-w-[100px]">{rec.name}</span>
                      {rec.isOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Touch D-Pad + Skill Move Pills */}
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-2xl shadow-xl">
                <div />
                <button {...held(1, 0)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800 text-white text-xs font-bold">
                  ▲
                </button>
                <div />
                <button {...held(0, -1)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800 text-white text-xs font-bold">
                  ◀
                </button>
                <button {...held(-1, 0)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800 text-white text-xs font-bold">
                  ▼
                </button>
                <button {...held(0, 1)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800 text-white text-xs font-bold">
                  ▶
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  {...held(1, 0, true)}
                  className="px-2.5 py-1.5 rounded-xl bg-cyan-600/85 hover:bg-cyan-500 text-white text-[11px] font-black uppercase border border-cyan-300/40 cursor-pointer"
                >
                  ⚡ Turbo [Shift]
                </button>
                {isUserDefense ? (
                  <>
                    <button
                      onClick={onSwitchDefender}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/85 text-slate-950 text-[11px] font-black uppercase cursor-pointer"
                    >
                      Switch [Tab]
                    </button>
                    <button
                      onClick={() => onTriggerSkillMove('HIT_STICK')}
                      className="px-2.5 py-1.5 rounded-xl bg-red-600/85 text-white text-[11px] font-black uppercase cursor-pointer"
                    >
                      Hit-Stick [F]
                    </button>
                    <button
                      onClick={() => onTriggerSkillMove('DIVE')}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-600/85 text-white text-[11px] font-black uppercase cursor-pointer"
                    >
                      Swat/Pick [E]
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onTriggerSkillMove('JUKE')}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-600/85 hover:bg-purple-500 text-white text-[11px] font-black uppercase cursor-pointer"
                    >
                      Juke [Space]
                    </button>
                    <button
                      onClick={() => onTriggerSkillMove('SPIN')}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600/85 hover:bg-indigo-500 text-white text-[11px] font-black uppercase cursor-pointer"
                    >
                      360 Spin [X]
                    </button>
                    <button
                      onClick={() => onTriggerSkillMove('TRUCK')}
                      className="px-2.5 py-1.5 rounded-xl bg-orange-600/85 hover:bg-orange-500 text-white text-[11px] font-black uppercase cursor-pointer"
                    >
                      Truck [F]
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Right: Primary Snap / Pass / Dive Action + Menu */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenControls}
                className="px-3 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-white/15 text-xs font-bold cursor-pointer"
              >
                Guide
              </button>
              <button
                onClick={onPause}
                className="px-3 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-white/15 text-xs font-bold cursor-pointer"
              >
                Menu
              </button>
            </div>

            {!isBallSnapped ? (
              <button
                id="action-snap-btn"
                onClick={() => onSnapOrThrow(true)}
                className="px-6 sm:px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#D40055] hover:brightness-110 text-slate-950 font-black text-base sm:text-lg tracking-wider font-['Rajdhani'] uppercase shadow-[0_0_24px_rgba(249,115,22,0.6)] cursor-pointer transition active:scale-95 border border-orange-300/40"
              >
                {isUserDefense ? 'READY · SNAP [SPACE]' : 'SNAP BALL [SPACE]'}
              </button>
            ) : isUserDefense ? (
              <button
                onClick={() => onTriggerSkillMove('HIT_STICK')}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 text-white font-black text-sm sm:text-base uppercase tracking-wider shadow-lg cursor-pointer active:scale-95"
              >
                HIT-STICK TACKLE [SPACE]
              </button>
            ) : hasBallCarrier ? (
              <button
                onClick={() => onTriggerSkillMove('DIVE')}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-sm sm:text-base uppercase tracking-wider shadow-lg cursor-pointer active:scale-95"
              >
                DIVE FOR END ZONE [E]
              </button>
            ) : !isPassInAir ? (
              <div className="flex items-center gap-2">
                <button
                  id="action-lob-btn"
                  onClick={() => onSnapOrThrow(false)}
                  className="px-4 py-3 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-lg cursor-pointer border border-purple-300/40"
                >
                  Touch Lob
                </button>
                <button
                  id="action-bullet-btn"
                  onClick={() => onSnapOrThrow(true)}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#FF8C00] to-amber-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg cursor-pointer border border-orange-300/50"
                >
                  Bullet Pass [Space]
                </button>
              </div>
            ) : (
              <div className="px-5 py-2.5 rounded-xl bg-slate-950/85 border border-sky-400/50 text-sky-300 font-bold text-sm tracking-wider uppercase animate-pulse">
                Ball In Flight...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

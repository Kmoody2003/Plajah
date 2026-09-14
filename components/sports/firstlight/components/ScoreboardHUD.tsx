import React from 'react';
import { DriveState, ReceiverRoute } from '../types';
import { HelpCircle, Pause, Play, Volume2, VolumeX, Eye, ArrowLeftRight, Radio } from 'lucide-react';

interface ScoreboardHUDProps {
  driveState: DriveState;
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
  onMoveQB,
  onMoveInput,
  onNextDown,
  onOpenControls,
  onOpenStadiumCreator,
  onToggleSound,
  isMuted,
  onPause,
}) => {
  const downOrdinal = ['1st', '2nd', '3rd', '4th'][driveState.down - 1];
  const toGo = driveState.ballYardLine >= 90 ? 'Goal' : `${driveState.yardsToGo}`;
  const yardDisplay = driveState.ballYardLine <= 50 ? driveState.ballYardLine : 100 - driveState.ballYardLine;

  // Pocket timer color styling
  let pocketColor = 'bg-sky-500/20 text-sky-300 border-sky-400/40';
  if (pocketTime <= 1.8) {
    pocketColor = 'bg-red-500/30 text-red-300 border-red-500/60 animate-pulse';
  } else if (pocketTime <= 3.5) {
    pocketColor = 'bg-amber-500/20 text-amber-300 border-amber-400/50';
  }

  const activeReceiver = receivers[selectedReceiverIdx];

  return (
    <div id="gameplay-hud" className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5 select-none z-10 font-sans">
      {/* 1. TOP BROADCAST BAR WITH TV STYLE BRANDING */}
      <div className="w-full flex flex-col items-center gap-1.5 pointer-events-auto">
        {/* TV Broadcast Bug & Prime Time Ticker */}
        <div className="w-full max-w-5xl flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400 px-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600/90 text-white font-bold text-[10px] tracking-widest animate-pulse">
              <Radio size={12} /> LIVE · 4K HDR
            </span>
            <span className="hidden sm:inline text-cyan-400 font-semibold font-['Rajdhani']">PLAJAH SPORTS PRIME TIME FOOTBALL</span>
          </div>

          <div className="flex items-center gap-3">
            {driveState.down === 3 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/30 text-yellow-300 border border-yellow-500/40 font-bold animate-bounce text-[10px]">
                📢 STADIUM NOISE: 116 dB (GET LOUD!)
              </span>
            )}
            <span className="text-slate-300">PLAY CLOCK: <strong className="text-amber-400 font-mono">:25</strong></span>
          </div>
        </div>

        <div className="flex items-center justify-between w-full max-w-5xl">
          {/* Left Team Score (Aurora) */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-purple-500/40 text-white shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]"></span>
            <span className="font-bold tracking-wide font-['Rajdhani'] text-lg sm:text-xl">{driveState.offenseTeam.name}</span>
            <span className="font-extrabold text-2xl sm:text-3xl text-purple-300 ml-1 font-['Teko']">{driveState.offenseTeam.score}</span>
          </div>

          {/* Center Main Pill: Down & Distance + Ball Position */}
          <div className="flex items-center px-4 sm:px-6 py-2 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 text-white shadow-2xl">
            <div className="w-1.5 h-6 bg-cyan-400 rounded-full mr-3 shadow-[0_0_10px_#22d3ee]"></div>
            <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base font-semibold tracking-wide">
              <span className="text-cyan-300 font-['Rajdhani'] uppercase tracking-wider">{downOrdinal} & {toGo}</span>
              <span className="text-white/40">·</span>
              <span className="text-slate-200">Ball on {yardDisplay}</span>
              <span className="text-white/40">·</span>
              <span className="text-slate-300">{driveState.defenseTeam.name}</span>
              <span className="font-extrabold text-xl sm:text-2xl text-cyan-300 font-['Teko']">{driveState.defenseTeam.score}</span>
            </div>
          </div>

          {/* Right Brand & Controls Link */}
          <div className="flex items-center gap-2">
            {/* Invert Controls Indicator / Toggle */}
            <button
              onClick={onToggleInvertControls}
              title="Toggle Invert Left/Right Movement"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border text-xs font-semibold shadow-md cursor-pointer transition ${
                invertControls
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30'
                  : 'bg-slate-900/80 text-slate-300 border-white/20 hover:bg-slate-800'
              }`}
            >
              <ArrowLeftRight size={14} />
              <span>Invert L/R: {invertControls ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={onOpenStadiumCreator}
              title="Weather & Camera"
              className="p-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/20 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Eye size={18} />
            </button>

            <button
              onClick={onToggleSound}
              title={isMuted ? 'Unmute' : 'Mute'}
              className="p-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/20 text-slate-300 hover:text-white transition cursor-pointer"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        </div>

        {/* Pocket Time Pill */}
        {isBallSnapped && !isPassInAir && !hasBallCarrier && (
          <div className={`px-4 py-1 rounded-full text-xs sm:text-sm font-bold tracking-wider uppercase border backdrop-blur-md shadow-md flex items-center gap-2 ${pocketColor}`}>
            <span>Pocket time:</span>
            <span className="font-mono text-base font-black">{pocketTime.toFixed(1)}s</span>
          </div>
        )}

        {/* Ball Carrier Active Banner */}
        {hasBallCarrier && (
          <div className="px-5 py-1.5 rounded-full bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-slate-950 text-xs sm:text-sm font-extrabold uppercase tracking-wider backdrop-blur-md shadow-xl flex items-center gap-2 animate-pulse">
            <span>🏃 RUNNING WITH BALL!</span>
            <span className="text-xs bg-black/30 px-2 py-0.5 rounded text-white font-mono hidden sm:inline">WASD: Steer (Inverted) · Shift: Sprint · Space: Juke</span>
          </div>
        )}

        {/* Catch Point Open Indicator (Screenshot 2: "Catch point: Open") */}
        {isGuidedMode && activeReceiver && isBallSnapped && !hasBallCarrier && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border border-emerald-400/40 text-emerald-300 text-xs sm:text-sm font-medium backdrop-blur-md animate-bounce">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Catch point: {activeReceiver.isOpen ? 'Open' : 'Contested'}</span>
          </div>
        )}
      </div>

      {/* 2. BOTTOM CONTROLS & HUD CLUSTER */}
      <div className="w-full flex items-end justify-between pointer-events-auto gap-4">
        {/* Bottom-Left Controls */}
        <div className="flex flex-col gap-2 max-w-md">
          {/* Receivers Selector Row with Number Pad and Number Key Hints */}
          {!hasBallCarrier && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                id="hud-next-down"
                onClick={onNextDown}
                className="px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 text-slate-200 border border-white/20 text-xs sm:text-sm font-medium backdrop-blur-md shadow-md cursor-pointer transition active:scale-95"
              >
                Next down
              </button>

              {receivers.map((rec, idx) => {
                const isSelected = selectedReceiverIdx === idx;
                const keyNum = idx + 1;
                return (
                  <button
                    key={rec.id}
                    id={`pass-btn-${idx}`}
                    onClick={() => onSelectReceiver(idx)}
                    className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium backdrop-blur-md border shadow-md cursor-pointer transition active:scale-95 flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-purple-600/90 text-white border-purple-300 shadow-[0_0_12px_#a855f7]'
                        : rec.isOpen
                        ? 'bg-emerald-950/70 text-emerald-200 border-emerald-500/40 hover:bg-emerald-900/80'
                        : 'bg-slate-900/80 text-slate-300 border-white/20 hover:bg-slate-800/90'
                    }`}
                  >
                    <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-cyan-300 border border-cyan-500/30">
                      [{keyNum} / NUM {keyNum}]
                    </span>
                    <span>{rec.label}</span>
                    {rec.isOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* D-Pad / Movement Controls for Touch & Quick Mouse Click */}
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 backdrop-blur-md border border-white/15 rounded-2xl shadow-xl">
              <div></div>
              <button
                title="Move Forward / Step Up (W)"
                onMouseDown={() => onMoveInput?.(1, 0)}
                onMouseUp={() => onMoveInput?.(0, 0)}
                onTouchStart={() => onMoveInput?.(1, 0)}
                onTouchEnd={() => onMoveInput?.(0, 0)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center border border-white/20 active:scale-90 transition"
              >
                ▲
              </button>
              <div></div>
              <button
                title={invertControls ? 'Move Left (Inverted: Screen Right)' : 'Move Left (A)'}
                onMouseDown={() => onMoveInput?.(0, -1)}
                onMouseUp={() => onMoveInput?.(0, 0)}
                onTouchStart={() => onMoveInput?.(0, -1)}
                onTouchEnd={() => onMoveInput?.(0, 0)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center border border-white/20 active:scale-90 transition"
              >
                ◀
              </button>
              <button
                title="Move Back / Dropback (S)"
                onMouseDown={() => onMoveInput?.(-1, 0)}
                onMouseUp={() => onMoveInput?.(0, 0)}
                onTouchStart={() => onMoveInput?.(-1, 0)}
                onTouchEnd={() => onMoveInput?.(0, 0)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center border border-white/20 active:scale-90 transition"
              >
                ▼
              </button>
              <button
                title={invertControls ? 'Move Right (Inverted: Screen Left)' : 'Move Right (D)'}
                onMouseDown={() => onMoveInput?.(0, 1)}
                onMouseUp={() => onMoveInput?.(0, 0)}
                onTouchStart={() => onMoveInput?.(0, 1)}
                onTouchEnd={() => onMoveInput?.(0, 0)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center border border-white/20 active:scale-90 transition"
              >
                ▶
              </button>
            </div>

            {/* Quick Action Pills: Sprint & Juke */}
            <div className="flex flex-col gap-1.5">
              <button
                onMouseDown={() => onMoveInput?.(1, 0, true)}
                onMouseUp={() => onMoveInput?.(0, 0, false)}
                onTouchStart={() => onMoveInput?.(1, 0, true)}
                onTouchEnd={() => onMoveInput?.(0, 0, false)}
                className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-black tracking-wider uppercase backdrop-blur-md border border-cyan-400/40 shadow-lg active:scale-95 transition"
              >
                ⚡ Sprint [Shift]
              </button>
              <button
                onClick={() => onMoveInput?.(0, 0, false, true)}
                className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white text-xs font-black tracking-wider uppercase backdrop-blur-md border border-purple-400/40 shadow-lg active:scale-95 transition"
              >
                💨 Juke [Space/Num 0]
              </button>
            </div>
          </div>
        </div>

        {/* Bottom-Right Controls & Action Snap/Pass Buttons */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenControls}
              className="px-3.5 py-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-white/20 text-xs sm:text-sm font-medium backdrop-blur-md shadow-md cursor-pointer transition active:scale-95"
            >
              Controls guide
            </button>
            <button
              onClick={onPause}
              className="px-3.5 py-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-white/20 text-xs sm:text-sm font-medium backdrop-blur-md shadow-md cursor-pointer transition active:scale-95"
            >
              Pause
            </button>
          </div>

          {/* Big Action Button: SNAP / THROW BULLET / THROW LOB / JUKE */}
          <div className="flex items-center gap-2">
            {!isBallSnapped ? (
              <button
                id="action-snap-btn"
                onClick={() => onSnapOrThrow(true)}
                className="px-6 sm:px-8 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-extrabold text-base sm:text-lg tracking-wider font-['Rajdhani'] uppercase shadow-[0_0_24px_rgba(249,115,22,0.6)] cursor-pointer transition active:scale-95 border border-orange-300/40"
              >
                Snap Ball [Space/Num Enter]
              </button>
            ) : hasBallCarrier ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onMoveInput?.(0, 0, false, true)}
                  className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-black text-sm sm:text-base uppercase tracking-wider shadow-[0_0_20px_rgba(168,85,247,0.5)] cursor-pointer transition active:scale-95 border border-purple-300/40"
                >
                  Juke Defender [Space/Num 0]
                </button>
              </div>
            ) : !isPassInAir ? (
              <div className="flex items-center gap-2">
                <button
                  id="action-lob-btn"
                  onClick={() => onSnapOrThrow(false)}
                  className="px-4 py-3 rounded-xl bg-purple-600/90 hover:bg-purple-700 text-white font-bold text-sm tracking-wide shadow-lg cursor-pointer transition active:scale-95 border border-purple-400/40"
                >
                  Touch Lob
                </button>
                <button
                  id="action-bullet-btn"
                  onClick={() => onSnapOrThrow(true)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-sm tracking-wide shadow-[0_0_20px_rgba(249,115,22,0.5)] cursor-pointer transition active:scale-95 border border-orange-300/40"
                >
                  Bullet Pass [Space/Num 1-4]
                </button>
              </div>
            ) : (
              <div className="px-5 py-2.5 rounded-xl bg-slate-950/80 border border-sky-400/40 text-sky-300 font-bold text-sm tracking-wider uppercase animate-pulse">
                Ball In Air...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { PlayType } from '../types';

interface PreDriveModalProps {
  isGuided: boolean;
  selectedPlay: PlayType;
  onChangeGuided: (guided: boolean) => void;
  onChangePlay: (play: PlayType) => void;
  onEnterField: () => void;
  onBackToMenu: () => void;
}

export const PreDriveModal: React.FC<PreDriveModalProps> = ({
  isGuided,
  selectedPlay,
  onChangeGuided,
  onChangePlay,
  onEnterField,
  onBackToMenu,
}) => {
  return (
    <div id="pre-drive-modal" className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md select-none font-sans">
      <div className="relative w-full max-w-xl p-6 sm:p-8 rounded-3xl bg-slate-950/85 backdrop-blur-2xl border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col gap-5 text-white">
        {/* Glow border rim */}
        <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-purple-500/40 via-cyan-500/30 to-orange-500/40 -z-10 blur-[1px]"></div>

        {/* Title Header */}
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold font-['Rajdhani'] uppercase tracking-wide text-white drop-shadow-md">
            Your First Drive
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-medium tracking-wide mt-0.5">
            Matchup: <span className="text-purple-300 font-semibold">Aurora</span> vs <span className="text-cyan-300 font-semibold">Current</span> · Objective: Reach the end zone
          </p>
        </div>

        {/* Team Crests Row (Matches Screenshot 3) */}
        <div className="grid grid-cols-2 gap-4 py-1">
          {/* Aurora Team Shield */}
          <div className="flex flex-col items-center p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30">
            <div className="w-16 h-18 sm:w-20 sm:h-22 rounded-xl bg-gradient-to-b from-purple-600 to-indigo-900 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.5)] border border-purple-300/40 p-2">
              {/* Flame motif */}
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-purple-200 drop-shadow-[0_0_8px_#c084fc]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8 6 6 10 6 14C6 17.31 8.69 20 12 20C15.31 20 18 17.31 18 14C18 9 14 6 12 2ZM12 18C10.34 18 9 16.66 9 15C9 13 11 10.5 12 9.5C13 10.5 15 13 15 15C15 16.66 13.66 18 12 18Z" />
              </svg>
            </div>
            <span className="font-bold text-base sm:text-lg mt-2 font-['Rajdhani'] text-purple-200">Aurora</span>
            <span className="text-[11px] text-purple-400 font-medium uppercase tracking-wider">Offense (You)</span>
          </div>

          {/* Current Team Shield */}
          <div className="flex flex-col items-center p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30">
            <div className="w-16 h-18 sm:w-20 sm:h-22 rounded-xl bg-gradient-to-b from-cyan-500 to-blue-900 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.5)] border border-cyan-300/40 p-2">
              {/* Tidal wave motif */}
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-200 drop-shadow-[0_0_8px_#22d3ee]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3ZM12 18.5C8.41 18.5 5.5 15.59 5.5 12C5.5 8.41 8.41 5.5 12 5.5C14.15 5.5 16.05 6.55 17.22 8.16C15.65 8.04 13.97 8.7 12.8 10.15C11.53 11.73 11.7 13.96 13.19 15.34C13.88 15.98 14.77 16.32 15.68 16.32C16.34 16.32 17 16.14 17.58 15.79C16.45 17.43 14.36 18.5 12 18.5Z" />
              </svg>
            </div>
            <span className="font-bold text-base sm:text-lg mt-2 font-['Rajdhani'] text-cyan-200">Current</span>
            <span className="text-[11px] text-cyan-400 font-medium uppercase tracking-wider">Defense AI</span>
          </div>
        </div>

        {/* Mode Selection Options (Screenshot 3) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeGuided(true)}
            className={`p-3.5 rounded-2xl text-left border transition cursor-pointer flex flex-col justify-between ${
              isGuided
                ? 'bg-purple-950/60 border-orange-400 shadow-[0_0_18px_rgba(249,115,22,0.3)] ring-1 ring-orange-400'
                : 'bg-slate-900/60 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="font-bold text-sm sm:text-base font-['Rajdhani'] uppercase tracking-wider text-amber-300">
              GUIDED <span className="text-xs normal-case text-slate-300 font-normal">(Recommended)</span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Real-time route separation hints, pocket clock, and catch point guidance.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChangeGuided(false)}
            className={`p-3.5 rounded-2xl text-left border transition cursor-pointer flex flex-col justify-between ${
              !isGuided
                ? 'bg-purple-950/60 border-orange-400 shadow-[0_0_18px_rgba(249,115,22,0.3)] ring-1 ring-orange-400'
                : 'bg-slate-900/60 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="font-bold text-sm sm:text-base font-['Rajdhani'] uppercase tracking-wider text-slate-200">
              PRACTICE
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Minimal HUD guidance, pure quarterback coverage reads and timing throws.
            </p>
          </button>
        </div>

        {/* Play Call Selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">First Down Play Call:</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'PASS_SLANTS' as PlayType, name: 'Quick Slants', desc: 'Fast timing inside' },
              { id: 'PASS_POST_OUT' as PlayType, name: 'Post & Out', desc: 'Deep vertical + boundary' },
              { id: 'PASS_VERTS' as PlayType, name: 'Four Verts', desc: 'Air raid deep streaks' },
            ].map((play) => (
              <button
                key={play.id}
                type="button"
                onClick={() => onChangePlay(play.id)}
                className={`px-3 py-2 rounded-xl text-left border transition cursor-pointer ${
                  selectedPlay === play.id
                    ? 'bg-purple-900/60 border-purple-400 text-white shadow-md'
                    : 'bg-slate-900/40 border-white/10 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-xs sm:text-sm font-bold font-['Rajdhani']">{play.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{play.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Keybind Controls Graphic (Exact match to Screenshot 3) */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono font-bold text-[11px]">A</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono font-bold text-[11px]">D</span>
              <span className="text-slate-300 font-medium">— lateral scramble</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono font-bold text-[11px]">1</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono font-bold text-[11px]">2</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono font-bold text-[11px]">3</span>
              <span className="text-slate-300 font-medium">— target receivers</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/20 font-mono font-bold text-[11px]">Space</span>
              <span className="text-slate-300 font-medium">— snap ball / throw</span>
            </div>
          </div>

          {/* Touch graphic indicator */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full border border-cyan-400/50 flex items-center justify-center text-cyan-300">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1">Touch Ready</span>
            </div>
            <span className="text-[11px] text-slate-300 leading-tight">
              On screen touch buttons for mobile and tablet play
            </span>
          </div>
        </div>

        {/* Action Button: ENTER FIELD */}
        <div className="flex flex-col items-center gap-2 mt-1">
          <button
            id="enter-field-btn"
            type="button"
            onClick={onEnterField}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-lg tracking-wider font-['Rajdhani'] uppercase shadow-[0_0_24px_rgba(249,115,22,0.6)] cursor-pointer transition active:scale-95 border border-orange-300/40 text-center"
          >
            ENTER FIELD
          </button>

          <button
            type="button"
            onClick={onBackToMenu}
            className="text-xs text-slate-400 hover:text-white transition font-medium cursor-pointer"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
};

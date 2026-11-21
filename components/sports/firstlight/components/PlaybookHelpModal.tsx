import React from 'react';
import { X, Compass, Flame, Shield, Trophy } from 'lucide-react';

interface PlaybookHelpModalProps {
  onClose: () => void;
}

export const PlaybookHelpModal: React.FC<PlaybookHelpModalProps> = ({ onClose }) => {
  return (
    <div id="playbook-help-modal" className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-sans">
      <div className="relative w-full max-w-2xl p-6 sm:p-7 rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Compass className="text-cyan-400" size={24} />
            <h2 className="text-2xl font-black font-['Rajdhani'] uppercase tracking-wider text-white">
              Project Firstlight 2.0 · Player &amp; Controls Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-white/15 text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-slate-300">
          <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/30 space-y-2">
            <div className="font-black text-amber-300 uppercase tracking-wider font-['Rajdhani'] flex items-center gap-1.5">
              <Trophy size={15} /> SOL Simulation &amp; Skill Scaling
            </div>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li><strong className="text-white">Full 11v11 Rules:</strong> 4 Quarters, Clock, Timeouts, Pass &amp; Run Plays, Field Goals, Punts, Extra Points &amp; 2-Pt Conversions.</li>
              <li><strong className="text-white">SOL Timeline League:</strong> 8 Legends of Elohim franchises with custom uniforms, ratings &amp; home stadiums.</li>
              <li><strong className="text-white">Rookie → Legend:</strong> Newcomers get Coach&apos;s Picks &amp; wide open windows; veterans get Madden-tier pass rush &amp; coverage.</li>
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-orange-950/40 border border-orange-500/30 space-y-2">
            <div className="font-black text-orange-300 uppercase tracking-wider font-['Rajdhani'] flex items-center gap-1.5">
              <Flame size={15} /> Fever Jam Arcade &amp; Blocky Mode
            </div>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li><strong className="text-white">HEATING UP → ON FIRE!:</strong> Chain 3 big plays/completions to ignite flaming passes, speed boosts &amp; 2x–4x combo points!</li>
              <li><strong className="text-white">Bone-Rattling Hits:</strong> Hit-Stick tackles trigger shockwaves &amp; force live fumbles.</li>
              <li><strong className="text-white">Blocky Classic Option:</strong> Toggle Pro Football teams or classic Roblox-style blocky characters anytime!</li>
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/75 border border-white/10 space-y-2">
            <div className="font-black text-emerald-300 uppercase tracking-wider font-['Rajdhani']">
              Offense &amp; Kicking Controls
            </div>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">SPACE</kbd> — Snap ball, Bullet Pass, Juke, or Lock Kick Meter.</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">1–4</kbd> — Throw Bullet Pass to receiver (<kbd className="px-1 rounded bg-slate-800 font-mono">Shift+1–4</kbd> = Touch Lob!).</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">WASD / Arrows</kbd> — Pocket scramble &amp; Ball-Carrier steering.</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">X / F / E / Shift</kbd> — 360 Spin · Truck · Dive · Turbo Sprint.</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">Q</kbd> — Flip play direction pre-snap.</li>
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/75 border border-white/10 space-y-2">
            <div className="font-black text-cyan-300 uppercase tracking-wider font-['Rajdhani'] flex items-center gap-1.5">
              <Shield size={15} /> Defense &amp; Broadcast Controls
            </div>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">TAB</kbd> — Switch to the defender closest to the ball or carrier.</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">SPACE / F</kbd> — Lunge Hit-Stick Tackle (chance to jar ball loose!).</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">E</kbd> — Jump passing lane to Swat or Intercept ball in flight!</li>
              <li><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">C / M / I</kbd> — Cycle Broadcast Cameras · Mute Audio · Invert L/R.</li>
            </ul>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 font-black font-['Rajdhani'] uppercase tracking-wider shadow-lg cursor-pointer transition active:scale-95"
        >
          GOT IT · BACK TO THE FIELD
        </button>
      </div>
    </div>
  );
};

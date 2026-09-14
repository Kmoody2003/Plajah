import React from 'react';
import { X, CheckCircle2, Shield, Flame, Compass } from 'lucide-react';

interface PlaybookHelpModalProps {
  onClose: () => void;
}

export const PlaybookHelpModal: React.FC<PlaybookHelpModalProps> = ({ onClose }) => {
  return (
    <div id="playbook-help-modal" className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-sans">
      <div className="relative w-full max-w-xl p-6 sm:p-8 rounded-3xl bg-slate-950/90 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col gap-5 text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Compass className="text-cyan-400" size={24} />
            <h2 className="text-2xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-white">
              Project Firstlight: Football Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-white/15 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-xs sm:text-sm text-slate-300">
          {/* Rules */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-col gap-2">
            <div className="font-bold text-amber-300 uppercase tracking-wider font-['Rajdhani'] text-sm">
              Standard Football Regulations
            </div>
            <ul className="list-disc pl-4 space-y-1 text-slate-300">
              <li><strong className="text-white">4 Downs to Gain 10 Yards:</strong> Cross the yellow 1st Down line to earn a fresh set of downs.</li>
              <li><strong className="text-white">Line of Scrimmage:</strong> The bright cyan laser line marks where each play begins.</li>
              <li><strong className="text-white">Touchdown:</strong> Reach the opponent end zone at the far end (+6 points).</li>
            </ul>
          </div>

          {/* Quarterback & Ball Carrier Movement */}
          <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex flex-col gap-2">
            <div className="font-bold text-purple-300 uppercase tracking-wider font-['Rajdhani'] text-sm">
              Player Movement & Inverted Lateral Controls
            </div>
            <p className="leading-relaxed">
              Full 360° fluid locomotion for QB pocket scrambling and after-the-catch running:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-slate-300">
              <li><span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono text-white">W / S / A / D</span> (or on-screen D-Pad): Run forward, drop back, cut left, cut right.</li>
              <li><span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-mono">Invert Controls (Key I or Top HUD Button)</span>: Inverted left/right movement enabled by default for natural quarterback steering.</li>
              <li><span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono text-white">Left Shift</span> (or Sprint button): Turbo sprint burst.</li>
              <li><span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono text-white">Space / Num 0 / Num Enter</span>: Snap ball, throw pass, or trigger evasive juke cut!</li>
            </ul>
          </div>

          {/* Route Progression & Number Pad Targeting */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-col gap-2">
            <div className="font-bold text-emerald-300 uppercase tracking-wider font-['Rajdhani'] text-sm">
              Targeting & Number Pad Passing Controls
            </div>
            <ul className="list-disc pl-4 space-y-1 text-slate-300">
              <li><strong className="text-cyan-300">Target Receivers:</strong> Press <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono text-white">1-4</span> or Number Pad <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono text-white">NUM 1 - NUM 4</span> to lock on and throw.</li>
              <li><strong className="text-emerald-300">Green Target Ring:</strong> Receiver is open in green grass (<span className="text-emerald-400 font-semibold">Catch point: Open</span>).</li>
              <li><strong className="text-purple-300">Purple Ring:</strong> Defender is in tight bracket coverage (<span className="text-amber-400 font-semibold">Contested</span>).</li>
              <li><strong className="text-yellow-300">TV Broadcast Cameras:</strong> Press <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 font-mono text-white">C</span> to cycle between Behind QB, TV Broadcast, First Person QB, and All-22 sky camera.</li>
            </ul>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black font-['Rajdhani'] uppercase tracking-wider shadow-lg cursor-pointer transition active:scale-95"
        >
          GOT IT, BACK TO GAME
        </button>
      </div>
    </div>
  );
};

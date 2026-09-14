import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { PlayOutcome } from '../types';
import { Trophy, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

interface PlayResultBannerProps {
  outcome: PlayOutcome | null;
  isTouchdown: boolean;
  isTurnover: boolean;
  onNextDown: () => void;
}

export const PlayResultBanner: React.FC<PlayResultBannerProps> = ({
  outcome,
  isTouchdown,
  isTurnover,
  onNextDown,
}) => {
  useEffect(() => {
    if (isTouchdown) {
      // Explode colorful stadium confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#a855f7', '#06b6d4', '#f97316', '#eab308'],
      });
      const timer = setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 100,
          origin: { y: 0.5 },
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isTouchdown]);

  if (!outcome) return null;

  return (
    <div id="play-result-banner" className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center select-none font-sans animate-in fade-in zoom-in-95 duration-200">
      <div className={`px-6 py-4 rounded-3xl backdrop-blur-2xl border shadow-2xl flex flex-col items-center gap-2 max-w-md text-center ${
        isTouchdown
          ? 'bg-gradient-to-b from-purple-950/95 to-slate-950/95 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.6)]'
          : isTurnover
          ? 'bg-slate-950/90 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
          : outcome.result === 'COMPLETE'
          ? 'bg-slate-950/90 border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.4)]'
          : 'bg-slate-950/90 border-white/20'
      }`}>
        <div className="flex items-center gap-2">
          {isTouchdown ? (
            <Trophy className="text-amber-300 animate-bounce" size={28} />
          ) : outcome.result === 'COMPLETE' ? (
            <CheckCircle className="text-emerald-400" size={24} />
          ) : (
            <AlertTriangle className="text-amber-400" size={24} />
          )}

          <span className={`text-2xl sm:text-3xl font-black font-['Rajdhani'] uppercase tracking-wider ${
            isTouchdown ? 'text-amber-300' : outcome.result === 'COMPLETE' ? 'text-emerald-300' : 'text-slate-100'
          }`}>
            {isTouchdown
              ? 'TOUCHDOWN!'
              : outcome.result === 'COMPLETE'
              ? 'PASS COMPLETE!'
              : outcome.result === 'SACK'
              ? 'SACKED!'
              : outcome.result === 'INTERCEPTION'
              ? 'INTERCEPTION!'
              : 'INCOMPLETE PASS'}
          </span>
        </div>

        <p className="text-sm font-medium text-slate-200">
          {outcome.description}
        </p>

        <button
          onClick={onNextDown}
          className={`mt-2 px-6 py-2.5 rounded-xl font-bold font-['Rajdhani'] text-sm sm:text-base uppercase tracking-wider shadow-md cursor-pointer transition active:scale-95 flex items-center gap-2 ${
            isTouchdown
              ? 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-slate-950'
              : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/20'
          }`}
        >
          <span>{isTouchdown ? 'KICK OFF / NEXT DRIVE' : 'NEXT DOWN [SPACE]'}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

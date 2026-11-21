import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { DriveState, GameMode, MatchBoxScore, PlayOutcome } from '../types';
import { Trophy, AlertTriangle, CheckCircle, ArrowRight, RotateCcw, Film, Flame } from 'lucide-react';

interface PlayResultBannerProps {
  outcome: PlayOutcome | null;
  gameMode: GameMode;
  driveState: DriveState;
  boxScore: MatchBoxScore;
  isReplaying: boolean;
  onNextDown: () => void;
  onChoosePat: (kind: 'KICK' | 'TWO_PT') => void;
  onToggleReplay: () => void;
  onRematch: () => void;
  onBackToMenu: () => void;
}

export const PlayResultBanner: React.FC<PlayResultBannerProps> = ({
  outcome,
  gameMode,
  driveState,
  boxScore,
  isReplaying,
  onNextDown,
  onChoosePat,
  onToggleReplay,
  onRematch,
  onBackToMenu,
}) => {
  const isTouchdown = gameMode === 'TOUCHDOWN' || gameMode === 'PAT_CHOICE';
  const isTurnover = gameMode === 'TURNOVER';
  const isHalftime = gameMode === 'HALFTIME';
  const isGameOver = gameMode === 'GAME_OVER';

  useEffect(() => {
    if (isTouchdown || isGameOver) {
      confetti({
        particleCount: 110,
        spread: 85,
        origin: { y: 0.6 },
        colors: ['#6B0099', '#00DAF3', '#FF8C00', '#fbbf24'],
      });
    }
  }, [isTouchdown, isGameOver]);

  // Halftime or Final Game Over Box Score Modal
  if (isHalftime || isGameOver) {
    const home = driveState.homeTeam || driveState.offenseTeam;
    const away = driveState.awayTeam || driveState.defenseTeam;
    const userWon = home.score >= away.score;

    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
        <div className="w-full max-w-2xl rounded-3xl bg-[#0D0B18]/95 border border-amber-400/40 p-6 sm:p-8 text-white shadow-2xl flex flex-col gap-5">
          <div className="text-center">
            <div className="text-xs font-black uppercase tracking-[0.25em] text-[#00DAF3] font-['Chakra_Petch']">
              {isGameOver ? 'SOL GRIDIRON LEAGUE · FINAL' : 'PSN BROADCAST · HALFTIME REPORT'}
            </div>
            <h2 className="text-3xl sm:text-4xl font-black font-['Teko'] uppercase tracking-wide mt-1">
              {isGameOver
                ? userWon
                  ? `${home.city.toUpperCase()} ${home.name.toUpperCase()} VICTORY!`
                  : `${away.city.toUpperCase()} ${away.name.toUpperCase()} WINS!`
                : 'HALFTIME BOX SCORE'}
            </h2>
          </div>

          <div className="grid grid-cols-3 items-center text-center py-3 px-4 rounded-2xl bg-slate-900/80 border border-white/10">
            <div>
              <div className="text-xs uppercase font-bold text-slate-400">{home.city}</div>
              <div className="text-lg font-black font-['Rajdhani'] uppercase">{home.name}</div>
              <div className="text-4xl font-black font-['Teko'] text-amber-300">{home.score}</div>
            </div>
            <div className="text-xs font-mono text-slate-400 uppercase">{isGameOver ? 'FINAL' : 'HALF'}</div>
            <div>
              <div className="text-xs uppercase font-bold text-slate-400">{away.city}</div>
              <div className="text-lg font-black font-['Rajdhani'] uppercase">{away.name}</div>
              <div className="text-4xl font-black font-['Teko'] text-cyan-300">{away.score}</div>
            </div>
          </div>

          {/* Box Score Stat Rows */}
          <div className="grid grid-cols-3 gap-y-2 text-xs sm:text-sm px-2">
            {[
              ['Passing Yards', boxScore.user.passingYards, boxScore.cpu.passingYards],
              ['Comp / Att', `${boxScore.user.completions}/${boxScore.user.attempts}`, `${boxScore.cpu.completions}/${boxScore.cpu.attempts}`],
              ['Rushing Yards', boxScore.user.rushingYards, boxScore.cpu.rushingYards],
              ['First Downs', boxScore.user.firstDowns, boxScore.cpu.firstDowns],
              ['Sacks / Big Hits', `${boxScore.user.sacks} / ${boxScore.user.bigHits}`, `${boxScore.cpu.sacks} / ${boxScore.cpu.bigHits}`],
              ['Turnovers', boxScore.user.interceptions + boxScore.user.fumblesLost, boxScore.cpu.interceptions + boxScore.cpu.fumblesLost],
            ].map(([label, uVal, cVal]) => (
              <React.Fragment key={String(label)}>
                <div className="text-left font-mono font-bold text-amber-200">{uVal}</div>
                <div className="text-center text-slate-400 font-semibold uppercase text-[11px]">{label}</div>
                <div className="text-right font-mono font-bold text-cyan-200">{cVal}</div>
              </React.Fragment>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {isHalftime ? (
              <button
                onClick={onNextDown}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 font-black text-base uppercase tracking-wider font-['Rajdhani'] cursor-pointer"
              >
                START 2ND HALF [SPACE]
              </button>
            ) : (
              <>
                <button
                  onClick={onRematch}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-slate-950 font-black text-base uppercase tracking-wider font-['Rajdhani'] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw size={16} /> REMATCH
                </button>
                <button
                  onClick={onBackToMenu}
                  className="px-6 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-white font-bold text-sm uppercase tracking-wider font-['Rajdhani'] cursor-pointer"
                >
                  MAIN MENU
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!outcome) return null;

  const isArcade = driveState.playStyle === 'ARCADE';
  const headline =
    outcome.headline ||
    (isTouchdown
      ? 'TOUCHDOWN!'
      : outcome.result === 'COMPLETE'
      ? 'PASS COMPLETE!'
      : outcome.result === 'RUSH_GAIN'
      ? 'SOLID RUN!'
      : outcome.result === 'SACK'
      ? 'SACKED!'
      : outcome.result === 'INTERCEPTION'
      ? 'INTERCEPTION!'
      : 'INCOMPLETE PASS');

  return (
    <div
      id="play-result-banner"
      className="absolute top-28 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center select-none font-sans"
    >
      <div
        className={`px-6 py-4 rounded-3xl backdrop-blur-2xl border shadow-2xl flex flex-col items-center gap-2 max-w-md text-center ${
          isTouchdown
            ? 'bg-gradient-to-b from-purple-950/95 to-slate-950/95 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.55)]'
            : isTurnover
            ? 'bg-slate-950/92 border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
            : outcome.result === 'COMPLETE' || outcome.result === 'RUSH_GAIN' || outcome.result === 'FIELD_GOAL_GOOD'
            ? 'bg-slate-950/92 border-emerald-400/50 shadow-[0_0_28px_rgba(16,185,129,0.35)]'
            : 'bg-slate-950/92 border-white/20'
        }`}
      >
        <div className="flex items-center gap-2">
          {isTouchdown ? (
            isArcade ? <Flame className="text-orange-400 animate-bounce" size={28} /> : <Trophy className="text-amber-300 animate-bounce" size={26} />
          ) : outcome.result === 'COMPLETE' || outcome.result === 'RUSH_GAIN' || outcome.result === 'FIELD_GOAL_GOOD' ? (
            <CheckCircle className="text-emerald-400" size={24} />
          ) : (
            <AlertTriangle className="text-amber-400" size={24} />
          )}

          <span
            className={`text-2xl sm:text-3xl font-black font-['Rajdhani'] uppercase tracking-wider ${
              isTouchdown ? 'text-amber-300' : isTurnover ? 'text-red-400' : 'text-white'
            }`}
          >
            {headline}
          </span>
        </div>

        <p className="text-xs sm:text-sm font-medium text-slate-200">{outcome.description}</p>

        {/* PAT Choice after User Touchdown */}
        {gameMode === 'PAT_CHOICE' ? (
          <div className="flex items-center gap-2 mt-2 w-full">
            <button
              onClick={() => onChoosePat('KICK')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black font-['Rajdhani'] text-sm uppercase tracking-wider cursor-pointer"
            >
              KICK EXTRA PT (+1)
            </button>
            <button
              onClick={() => onChoosePat('TWO_PT')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black font-['Rajdhani'] text-sm uppercase tracking-wider cursor-pointer border border-purple-300/40"
            >
              GO FOR 2 (+2)
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            {outcome.hasReplay && (
              <button
                onClick={onToggleReplay}
                className={`px-4 py-2.5 rounded-xl font-bold font-['Rajdhani'] text-xs sm:text-sm uppercase tracking-wider border cursor-pointer transition flex items-center gap-1.5 ${
                  isReplaying
                    ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-400/40'
                }`}
              >
                <Film size={14} /> {isReplaying ? 'STOP REPLAY' : 'INSTANT REPLAY'}
              </button>
            )}
            <button
              onClick={onNextDown}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8C00] to-amber-500 hover:brightness-110 text-slate-950 font-black font-['Rajdhani'] text-sm sm:text-base uppercase tracking-wider shadow-md cursor-pointer transition active:scale-95 flex items-center gap-2"
            >
              <span>NEXT PLAY [SPACE]</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Ora Tea-House Pause & Dusk Bell Overlay powered by LivingSceneStage:
 *  - Real Anima Jos Stam Stable Fluids curling teacup steam (brush through it with cursor!)
 *  - Anima Verlet swaying veranda wind-bell tassel
 *  - Swimming golden & cream koi beneath the lily pond
 *  - Rhythmic 4-2-4 golden firefly breathing circle + pond tap ripples
 */

import React, { useCallback, useState } from 'react';
import { playBreathSwell } from '../../services/academiaGames/acousticAudio';
import type { DirectorSettings } from '../../services/academiaGames/motionDirector';
import { DecklePaperCard, StitchedClothButton } from './craftPrimitives';
import { LivingSceneStage } from './LivingSceneStage';

interface Props {
  mode: 'pause' | 'dusk-bell';
  soundOn: boolean;
  reducedMotion: boolean;
  director: DirectorSettings;
  journalCount: number;
  onOpenJournal: () => void;
  onReturn: () => void;
}

export const OraTeaHouseOverlay: React.FC<Props> = ({
  mode,
  soundOn,
  reducedMotion,
  director,
  journalCount,
  onOpenJournal,
  onReturn,
}) => {
  const [phaseLabel, setPhaseLabel] = useState('Inhale slowly…');

  const handlePhase = useCallback(
    (phase: 'inhale' | 'hold' | 'exhale', label: string) => {
      setPhaseLabel(label);
      playBreathSwell(soundOn, phase);
    },
    [soundOn],
  );

  return (
    <div className="absolute inset-0 z-40 rounded-[14px] overflow-hidden bg-[#1D1A21]">
      <LivingSceneStage
        world="ora"
        plateUrl="/academia-games/plates/ora-stillness.jpg"
        plateAlt="Twilight cedar tea veranda overlooking a quiet koi pond"
        atmosphere="dusk"
        reducedMotion={reducedMotion}
        soundOn={soundOn}
        director={director}
        intensity={0.8}
        onBreathPhase={handlePhase}
      >
        {mode === 'dusk-bell' && (
          <div className="absolute top-4 right-4 max-w-sm">
            <DecklePaperCard copperplate tone="cream" className="p-4 text-[#35261B]">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A644E] font-semibold">
                Dusk Bell · Healthy Stopping Ritual
              </div>
              <p className="text-[14px] mt-1 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                Golden hour has arrived across the valley. You gathered{' '}
                <strong>{journalCount} {journalCount === 1 ? 'discovery' : 'discoveries'}</strong> in your Living Field Journal. Nothing here ever withers when you rest.
              </p>
              <div className="mt-3 flex gap-2">
                <StitchedClothButton onClick={onOpenJournal} tone="sage" className="!py-1.5 !text-[12px]">
                  Open Field Journal
                </StitchedClothButton>
              </div>
            </DecklePaperCard>
          </div>
        )}

        <div className="absolute left-4 right-4 bottom-4 flex flex-wrap items-center justify-between gap-3">
          <DecklePaperCard tone="cream" className="px-5 py-2.5 text-[#35261B]">
            <div className="text-[16px] sm:text-[18px] font-semibold tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>
              {mode === 'dusk-bell' ? 'Dusk Bell · ' : 'Pause & Breathe · '}
              <span className="italic text-[#6A5138]">{phaseLabel}</span>
            </div>
            <div className="text-[11px] text-[#7A644E]">
              Brush the teacup steam (Anima Fluids) or tap the pond to ripple
            </div>
          </DecklePaperCard>

          <div className="flex items-center gap-2.5">
            <StitchedClothButton onClick={onOpenJournal} tone="linen">
              Open Journal ({journalCount})
            </StitchedClothButton>
            <StitchedClothButton onClick={onReturn} tone="terracotta">
              Return to journey
            </StitchedClothButton>
          </div>
        </div>
      </LivingSceneStage>
    </div>
  );
};

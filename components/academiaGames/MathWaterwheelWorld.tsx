/**
 * Playable Grades 3–5 Math World ("Mill · Math") powered by Plajah's Anima + Living engines:
 *  - Anima Jos Stam Stable Fluids curling valley cottage chimney smoke
 *  - Anima Verlet HairSystem swaying wisteria blossoms
 *  - Anima ParticleSystem bouncing waterwheel splash spray + live rotating oak wheel
 *  - Interactive Singapore CPA Field Journal (Concrete / Pictorial / Abstract)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  evaluateWaterwheel,
  formatFraction,
  MATH_QUESTS,
} from '../../services/academiaGames/pedagogyEngine';
import { playDiscoveryCadence, playWarmPluck } from '../../services/academiaGames/acousticAudio';
import type { AtmospherePreset, CpaStage, JournalEntry, MathWaterwheelQuest, UdlPrefs } from '../../services/academiaGames/contracts';
import type { DirectorSettings } from '../../services/academiaGames/motionDirector';
import { BrassVernierSlider, DecklePaperCard, StitchedClothButton, WaxSealBadge } from './craftPrimitives';
import { LivingSceneStage } from './LivingSceneStage';

interface Props {
  plateUrl: string;
  atmosphere: AtmospherePreset;
  director: DirectorSettings;
  udl: UdlPrefs;
  onActiveStateChange: (quest: MathWaterwheelQuest, a: number, b: number) => void;
  onStruggle: () => void;
  onMastery: (entry: JournalEntry) => void;
}

export const MathWaterwheelWorld: React.FC<Props> = ({
  plateUrl,
  atmosphere,
  director,
  udl,
  onActiveStateChange,
  onStruggle,
  onMastery,
}) => {
  const [qIdx, setQIdx] = useState(0);
  const quest = MATH_QUESTS[qIdx];
  const [gateA, setGateA] = useState(quest.fixedA);
  const [gateB, setGateB] = useState(quest.initialB);
  const [cpa, setCpa] = useState<CpaStage>('pictorial');
  const [solved, setSolved] = useState(false);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const [moves, setMoves] = useState(0);

  const evalRes = useMemo(() => evaluateWaterwheel(quest, gateA, gateB), [quest, gateA, gateB]);

  useEffect(() => {
    setGateA(quest.fixedA);
    setGateB(quest.initialB);
    setSolved(false);
    setMoves(0);
  }, [quest]);

  useEffect(() => {
    onActiveStateChange(quest, gateA, gateB);
  }, [quest, gateA, gateB, onActiveStateChange]);

  const handleAdjust = (which: 'A' | 'B', val: number) => {
    const nextA = which === 'A' ? val : gateA;
    const nextB = which === 'B' ? val : gateB;
    if (which === 'A') setGateA(val);
    else setGateB(val);

    const nextEval = evaluateWaterwheel(quest, nextA, nextB);
    setMoves(m => m + 1);
    playWarmPluck(nextEval.balanced ? 440 : 246.94 + nextEval.total * 18, udl.soundOn, { duration: 0.7, volume: 0.065 });

    if (nextEval.balanced && !solved) {
      setSolved(true);
      setCelebrateTick(c => c + 1);
      playDiscoveryCadence(udl.soundOn);
      onMastery({
        id: quest.id,
        createdAt: Date.now(),
        world: 'math',
        band: quest.band,
        title: `Mill Aqueduct: ${quest.title}`,
        summary: nextEval.feedback,
        artifactNote: `Balanced ${nextA}/${quest.denom} + ${nextB}/${quest.denom}${quest.fixedC ? ` + ${quest.fixedC}/${quest.denom}` : ''} = ${quest.targetTotal}/${quest.denom} (${formatFraction(quest.targetTotal, quest.denom)}) via ${cpa} lens.`,
        standards: quest.standards,
        emblem: 'waterwheel',
      });
    } else if (!nextEval.balanced && moves > 0 && moves % 5 === 0) {
      onStruggle();
    }
  };

  const segs = [
    { label: `A · ${gateA}/${quest.denom}`, val: gateA, color: '#4E8A7E' },
    { label: `B · ${gateB}/${quest.denom}`, val: gateB, color: '#C6923A' },
    ...(quest.fixedC > 0 ? [{ label: `C · ${quest.fixedC}/${quest.denom}`, val: quest.fixedC, color: '#2B3A55' }] : []),
  ];
  const barScale = Math.max(quest.targetTotal, evalRes.total);

  return (
    <LivingSceneStage
      world="math"
      plateUrl={plateUrl}
      plateAlt="Sunlit mountainside oak waterwheel workshop and terraced valley"
      atmosphere={atmosphere}
      director={director}
      reducedMotion={udl.reducedMotion}
      soundOn={udl.soundOn}
      intensity={evalRes.balanced ? 1 : 0.35}
      rpmOrVoltage={evalRes.wheelRpm}
      celebrateSignal={celebrateTick}
      celebrateBurstKind="bubbles"
    >
      {/* Top-Left Quest Scroll */}
      <div className="absolute top-3.5 left-3.5 max-w-sm">
        <DecklePaperCard copperplate tone="linen" className="px-4 py-3 text-[#2B3A55]">
          <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-[#6E5A43] font-semibold">
            <span>Mill Workshop · Quest {qIdx + 1}/{MATH_QUESTS.length}</span>
            <span className="font-mono">{quest.standards[0]?.code}</span>
          </div>
          <h3 className="text-[16px] font-bold mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
            {quest.title}
          </h3>
          <p className={`text-[12.5px] mt-1 leading-relaxed text-[#352A1F] ${udl.dyslexiaSpacing ? 'tracking-[0.06em]' : ''}`}>
            {quest.storyPrompt}
          </p>
        </DecklePaperCard>
      </div>

      {/* Bottom-Right Open Hand-Stitched Field Journal */}
      <div className="absolute right-3.5 bottom-3.5 w-[min(450px,calc(100%-1.75rem))]">
        <DecklePaperCard copperplate tone="cream" className="p-4 text-[#2B3A55]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#CDB998]">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#7A644E] font-semibold">
                Field Journal · Singapore CPA Lens
              </div>
              <div className="flex gap-1 mt-1">
                {(['concrete', 'pictorial', 'abstract'] as const).map(stage => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setCpa(stage)}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold capitalize cursor-pointer"
                    style={{
                      background: cpa === stage ? '#2B3A55' : 'rgba(43,58,85,0.1)',
                      color: cpa === stage ? '#F5ECDC' : '#2B3A55',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>
            {solved && <WaxSealBadge label="1/1" color="emerald" />}
          </div>

          <div className="mt-3">
            {cpa === 'concrete' && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded bg-[#EFE5D1] border border-[#CDB998]">
                {Array.from({ length: barScale }, (_, i) => {
                  const fillColor =
                    i < gateA ? '#4E8A7E' : i < gateA + gateB ? '#C6923A' : i < evalRes.total ? '#2B3A55' : 'transparent';
                  const overflow = i >= quest.targetTotal;
                  return (
                    <span
                      key={i}
                      title={`Unit ${i + 1} of ${quest.targetTotal}`}
                      className="w-6 h-6 rounded-full border-2 transition-colors"
                      style={{ background: fillColor, borderColor: overflow ? '#B84637' : '#7D664E' }}
                    />
                  );
                })}
                <span className="w-full text-[11px] text-[#5B4938] mt-1">
                  Each wooden cup holds 1/{quest.denom} of a full stream (target: {quest.targetTotal} cups).
                </span>
              </div>
            )}

            {cpa === 'pictorial' && (
              <div>
                <div className="h-9 w-full rounded bg-[#EFE5D1] border border-[#7D664E] p-1 flex gap-1 overflow-hidden">
                  {segs.map(s => (
                    <div
                      key={s.label}
                      className="h-full rounded-sm flex items-center justify-center text-[11.5px] font-bold text-[#FAF3E6] transition-all duration-200 overflow-hidden whitespace-nowrap px-1"
                      style={{
                        width: `${Math.max(0, (s.val / barScale) * 100)}%`,
                        background: s.color,
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {s.val > 0 ? s.label : ''}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-[#6E5A43] mt-1 font-mono">
                  <span>Current: {evalRes.total}/{quest.denom}</span>
                  <span>Target: {quest.targetTotal}/{quest.denom} ({formatFraction(quest.targetTotal, quest.denom)})</span>
                </div>
              </div>
            )}

            {cpa === 'abstract' && (
              <div className="p-2.5 rounded bg-[#EFE5D1] border border-[#CDB998] text-center text-[17px] font-bold" style={{ fontFamily: 'Georgia, serif' }}>
                {gateA}/{quest.denom} + {gateB}/{quest.denom}
                {quest.fixedC > 0 ? ` + ${quest.fixedC}/${quest.denom}` : ''} ={' '}
                <span style={{ color: evalRes.balanced ? '#2C6A5B' : '#A94B34' }}>
                  {evalRes.total}/{quest.denom}
                </span>{' '}
                <span className="text-[13px] font-normal text-[#6B5642]">
                  (goal: {formatFraction(quest.targetTotal, quest.denom)})
                </span>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {quest.adjustableA && (
              <BrassVernierSlider
                label="Brass Gate A"
                valueLabel={`${gateA}/${quest.denom} (${formatFraction(gateA, quest.denom)})`}
                min={1}
                max={quest.maxB}
                value={gateA}
                onChange={v => handleAdjust('A', v)}
                ok={evalRes.balanced}
              />
            )}
            <BrassVernierSlider
              label="Brass Gate B"
              valueLabel={`${gateB}/${quest.denom} (${formatFraction(gateB, quest.denom)})`}
              min={quest.minB}
              max={quest.maxB}
              value={gateB}
              onChange={v => handleAdjust('B', v)}
              ok={evalRes.balanced}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[12px] leading-snug text-[#3D2E22]">{evalRes.feedback}</p>
            {solved && (
              <StitchedClothButton onClick={() => setQIdx(i => (i + 1) % MATH_QUESTS.length)} tone="sage" className="!py-1.5 !px-3 !text-[12px] shrink-0">
                Next <ChevronRight size={13} />
              </StitchedClothButton>
            )}
          </div>
        </DecklePaperCard>
      </div>
    </LivingSceneStage>
  );
};

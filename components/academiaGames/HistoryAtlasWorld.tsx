/**
 * Playable History & Social Studies World ("Atlas · History") powered by LivingSceneStage:
 *  - Animated sailing riverboats with wake ripples gliding down the watercolor Niger bend
 *  - Rotating brass astrolabe reté rings + curl-noise caravan dust motes
 *  - Wax-sealed Harbor Ledger primary-source dispatches + sliding brass timeline buttons
 */

import React, { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { HISTORY_QUESTS } from '../../services/academiaGames/pedagogyEngine';
import { playDiscoveryCadence, playWoodTap } from '../../services/academiaGames/acousticAudio';
import type { AtmospherePreset, HistoryDispatchQuest, JournalEntry, UdlPrefs } from '../../services/academiaGames/contracts';
import type { DirectorSettings } from '../../services/academiaGames/motionDirector';
import { DecklePaperCard, StitchedClothButton, WaxSealBadge } from './craftPrimitives';
import { LivingSceneStage } from './LivingSceneStage';

interface Props {
  plateUrl: string;
  atmosphere: AtmospherePreset;
  director: DirectorSettings;
  udl: UdlPrefs;
  onActiveQuestChange: (quest: HistoryDispatchQuest) => void;
  onStruggle: () => void;
  onMastery: (entry: JournalEntry) => void;
}

export const HistoryAtlasWorld: React.FC<Props> = ({
  plateUrl,
  atmosphere,
  director,
  udl,
  onActiveQuestChange,
  onStruggle,
  onMastery,
}) => {
  const [qIdx, setQIdx] = useState(0);
  const quest = HISTORY_QUESTS[qIdx];
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [celebrateTick, setCelebrateTick] = useState(0);

  useEffect(() => {
    onActiveQuestChange(quest);
    setPickedId(null);
  }, [quest, onActiveQuestChange]);

  const pickedChoice = quest.choices.find(c => c.id === pickedId) ?? null;

  const choose = (choiceId: string) => {
    setPickedId(choiceId);
    const c = quest.choices.find(item => item.id === choiceId);
    if (!c) return;
    if (c.accurate) {
      setCelebrateTick(t => t + 1);
      playDiscoveryCadence(udl.soundOn);
      onMastery({
        id: quest.id,
        createdAt: Date.now(),
        world: 'history',
        band: quest.band,
        title: `${quest.ledgerTitle} · ${quest.place}`,
        summary: c.outcome,
        artifactNote: `Corroborated eyewitness accounts from ${quest.sources.map(s => s.speaker).join(' & ')}.`,
        standards: quest.standards,
        emblem: 'astrolabe',
      });
    } else {
      playWoodTap(udl.soundOn, 1);
      onStruggle();
    }
  };

  return (
    <LivingSceneStage
      world="history"
      plateUrl={plateUrl}
      plateAlt="Sunlit watercolor tabletop historical map diorama with brass astrolabe and harbor ledger"
      atmosphere={atmosphere}
      director={director}
      reducedMotion={udl.reducedMotion}
      soundOn={udl.soundOn}
      intensity={pickedChoice?.accurate ? 1 : 0.4}
      celebrateSignal={celebrateTick}
      celebrateBurstKind="leaves"
    >
      <div className="absolute top-3.5 left-3.5 max-w-md space-y-2.5">
        <DecklePaperCard copperplate tone="cream" className="p-4 text-[#35261B]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A634C] font-semibold flex items-center gap-1">
                <Compass size={12} /> {quest.eraLabel} · {quest.yearLabel}
              </div>
              <h3 className="text-[17px] font-bold mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
                {quest.ledgerTitle} — {quest.place}
              </h3>
            </div>
            <WaxSealBadge label={pickedChoice?.accurate ? '✓' : '1324'} color={pickedChoice?.accurate ? 'emerald' : 'terracotta'} />
          </div>
          <p className="text-[12.5px] mt-1.5 leading-relaxed text-[#3F2F22]">{quest.scenario}</p>

          <div className="mt-2.5 space-y-2">
            {quest.sources.map(src => (
              <blockquote key={src.id} className="p-2.5 rounded bg-[#EFE5D1] border-l-[3px] border-[#B86246] text-[12px] text-[#35261B]">
                <div className="font-semibold text-[11px] uppercase tracking-wider text-[#6D5642]">
                  {src.speaker} · <span className="italic normal-case">{src.role}</span>
                </div>
                <p className="mt-0.5 italic leading-snug" style={{ fontFamily: 'Georgia, serif' }}>{src.excerpt}</p>
              </blockquote>
            ))}
          </div>
        </DecklePaperCard>
      </div>

      <div className="absolute right-3.5 bottom-3.5 w-[min(440px,calc(100%-1.75rem))]">
        <DecklePaperCard copperplate tone="parchment" className="p-4 text-[#35261B]">
          <div className="text-[13.5px] font-bold mb-2.5" style={{ fontFamily: 'Georgia, serif' }}>
            {quest.question}
          </div>
          <div className="space-y-1.5">
            {quest.choices.map(c => {
              const selected = pickedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choose(c.id)}
                  className="w-full text-left px-3 py-2 rounded text-[12.5px] transition-colors cursor-pointer"
                  style={{
                    background: selected
                      ? c.accurate
                        ? 'rgba(78, 138, 126, 0.22)'
                        : 'rgba(184, 98, 70, 0.18)'
                      : 'rgba(250, 243, 230, 0.78)',
                    border: `1.5px solid ${selected ? (c.accurate ? '#3F7D6E' : '#B86246') : '#C6B18F'}`,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {c.text}
                </button>
              );
            })}
          </div>
          {pickedChoice && (
            <p className="mt-2.5 text-[12px] leading-relaxed p-2 rounded bg-[#FAF3E6] border border-[#D4C1A2]">
              {pickedChoice.outcome}
            </p>
          )}
        </DecklePaperCard>
      </div>

      <div className="absolute left-3.5 bottom-3.5 flex items-center gap-2">
        <DecklePaperCard tone="cream" className="px-3 py-2 flex items-center gap-2">
          {HISTORY_QUESTS.map((hq, idx) => (
            <StitchedClothButton
              key={hq.id}
              onClick={() => {
                playWoodTap(udl.soundOn, idx);
                setQIdx(idx);
              }}
              active={qIdx === idx}
              tone={qIdx === idx ? 'terracotta' : 'linen'}
              className="!py-1 !px-3 !text-[12px]"
            >
              {hq.era === 'ancient' ? 'Ancient' : 'Crossroads'} · {hq.yearLabel}
            </StitchedClothButton>
          ))}
        </DecklePaperCard>
      </div>
    </LivingSceneStage>
  );
};

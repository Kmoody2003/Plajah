/**
 * Playable Grades 6–8 Science World ("Grove · Science") powered by Plajah's Anima + Living engines:
 *  - Anima Verlet swaying conservatory fern fronds
 *  - Curl-noise rising emerald bioluminescent root spores inside the oak terrarium
 *  - Spring-damped swinging analog brass galvanometer needle + Edison bulb coil flicker
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { evaluateScienceBench, SCIENCE_QUESTS } from '../../services/academiaGames/pedagogyEngine';
import { playDiscoveryCadence, playWarmPluck } from '../../services/academiaGames/acousticAudio';
import type { AtmospherePreset, JournalEntry, ScienceBenchQuest, UdlPrefs } from '../../services/academiaGames/contracts';
import type { DirectorSettings } from '../../services/academiaGames/motionDirector';
import { BrassVernierSlider, DecklePaperCard, StitchedClothButton, WaxSealBadge } from './craftPrimitives';
import { LivingSceneStage } from './LivingSceneStage';

interface Props {
  plateUrl: string;
  atmosphere: AtmospherePreset;
  director: DirectorSettings;
  udl: UdlPrefs;
  onActiveStateChange: (quest: ScienceBenchQuest, light: number, moisture: number, voltage: number) => void;
  onStruggle: () => void;
  onMastery: (entry: JournalEntry) => void;
}

export const ScienceBenchWorld: React.FC<Props> = ({
  plateUrl,
  atmosphere,
  director,
  udl,
  onActiveStateChange,
  onStruggle,
  onMastery,
}) => {
  const [qIdx, setQIdx] = useState(0);
  const quest = SCIENCE_QUESTS[qIdx];
  const [light, setLight] = useState(38);
  const [moisture, setMoisture] = useState(35);
  const [voltage, setVoltage] = useState(84);
  const [solved, setSolved] = useState(false);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const movesRef = useRef(0);

  const evalRes = useMemo(
    () => evaluateScienceBench(quest, light, moisture, voltage),
    [quest, light, moisture, voltage],
  );

  useEffect(() => {
    setLight(qIdx === 0 ? 38 : 74);
    setMoisture(qIdx === 0 ? 35 : 78);
    setVoltage(qIdx === 0 ? 84 : 76);
    setSolved(false);
    movesRef.current = 0;
  }, [qIdx]);

  useEffect(() => {
    onActiveStateChange(quest, light, moisture, voltage);
  }, [quest, light, moisture, voltage, onActiveStateChange]);

  const updateDial = (kind: 'light' | 'moisture' | 'voltage', val: number) => {
    const nl = kind === 'light' ? val : light;
    const nm = kind === 'moisture' ? val : moisture;
    const nv = kind === 'voltage' ? val : voltage;
    if (kind === 'light') setLight(val);
    else if (kind === 'moisture') setMoisture(val);
    else setVoltage(val);

    movesRef.current += 1;
    const check = evaluateScienceBench(quest, nl, nm, nv);
    if (check.equilibrium && !solved) {
      setSolved(true);
      setCelebrateTick(c => c + 1);
      playDiscoveryCadence(udl.soundOn);
      onMastery({
        id: quest.id,
        createdAt: Date.now(),
        world: 'science',
        band: quest.band,
        title: `${quest.specimenLatin} · ${quest.specimenTitle}`,
        summary: quest.explanation,
        artifactNote: `Equilibrium reached: Canopy ${nl}%, Loam Moisture ${nm}%, Galvanic Bench ${check.filamentVolts}V (${check.mycorrhizalFluxPct}% mycorrhizal activity).`,
        standards: quest.standards,
        emblem: 'oak',
      });
    } else if (movesRef.current % 14 === 0 && !check.equilibrium) {
      onStruggle();
    } else if (movesRef.current % 3 === 0) {
      playWarmPluck(220 + check.mycorrhizalFluxPct * 2.1, udl.soundOn, { duration: 0.45, volume: 0.045 });
    }
  };

  return (
    <LivingSceneStage
      world="science"
      plateUrl={plateUrl}
      plateAlt="Dusk wrought-iron botanical conservatory and walnut science workbench"
      atmosphere={atmosphere}
      director={director}
      reducedMotion={udl.reducedMotion}
      soundOn={udl.soundOn}
      intensity={solved ? 1 : evalRes.mycorrhizalFluxPct / 100}
      rpmOrVoltage={voltage / 100}
      bioFlux={evalRes.mycorrhizalFluxPct / 100}
      celebrateSignal={celebrateTick}
      celebrateBurstKind="sparkles"
    >
      {/* Top Specimen Assay Card */}
      <div className="absolute top-3.5 left-3.5 right-3.5 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        <DecklePaperCard copperplate tone="parchment" className="pointer-events-auto p-3.5 max-w-md text-[#2B2118]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A624A] font-semibold">
                {quest.assayTitle} · {quest.standards[0]?.code}
              </div>
              <h3 className="text-[17px] font-bold italic" style={{ fontFamily: 'Georgia, serif' }}>
                {quest.specimenLatin} · <span className="not-italic">{quest.specimenTitle}</span>
              </h3>
            </div>
            <WaxSealBadge label={solved ? 'EQ' : `${evalRes.mycorrhizalFluxPct}%`} color={solved ? 'emerald' : 'crimson'} />
          </div>
          <p className="text-[12.5px] mt-1.5 leading-relaxed text-[#382B1E]">{quest.prompt}</p>
        </DecklePaperCard>

        <DecklePaperCard copperplate tone="cream" className="pointer-events-auto px-4 py-3 text-[#2B2118] min-w-[235px]">
          <div className="text-[11px] uppercase tracking-wider text-[#7A624A] font-semibold mb-1.5">Live Bench Telemetry</div>
          <div className="space-y-1 text-[12px] font-mono">
            <div className="flex justify-between"><span>Mycorrhiza Flux</span><strong>{evalRes.mycorrhizalFluxPct}%</strong></div>
            <div className="flex justify-between"><span>Photosynthesis</span><strong>{evalRes.photosynthesisRate} µmol</strong></div>
            <div className="flex justify-between"><span>Edison Load</span><strong>{evalRes.filamentVolts} V</strong></div>
          </div>
        </DecklePaperCard>
      </div>

      {/* Bottom Stitched Leather & Brass Vernier Bench Bar */}
      <div className="absolute left-3.5 right-3.5 bottom-3.5 rounded-[10px] p-3 border-2 border-[#7E5D36] bg-[#241A13]/92 backdrop-blur-sm shadow-2xl space-y-2.5">
        <div className="grid sm:grid-cols-3 gap-2.5">
          <BrassVernierSlider
            label="Canopy PAR Light"
            valueLabel={`${light}%`}
            min={10}
            max={100}
            value={light}
            onChange={v => updateDial('light', v)}
            ok={evalRes.lightOk}
            dark
          />
          <BrassVernierSlider
            label="Loam Soil Moisture"
            valueLabel={`${moisture}%`}
            min={10}
            max={100}
            value={moisture}
            onChange={v => updateDial('moisture', v)}
            ok={evalRes.moistureOk}
            dark
          />
          <BrassVernierSlider
            label="Galvanic Bench Voltage"
            valueLabel={`${evalRes.filamentVolts} V`}
            min={10}
            max={100}
            value={voltage}
            onChange={v => updateDial('voltage', v)}
            ok={evalRes.voltageOk}
            dark
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#EFE5D1]">
          <span style={{ fontFamily: 'Georgia, serif' }}>{evalRes.feedback}</span>
          {solved && (
            <StitchedClothButton onClick={() => setQIdx(i => (i + 1) % SCIENCE_QUESTS.length)} tone="sage" className="!py-1.5 !px-3 !text-[12px]">
              Next Assay <ChevronRight size={13} />
            </StitchedClothButton>
          )}
        </div>
      </div>
    </LivingSceneStage>
  );
};

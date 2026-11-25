/**
 * Playable Grades 9–12 Studio ("Press · 9–12 Studio") powered by Plajah's Anima + Living engines:
 *  - Interactive 3D 680-particle Flux Torus Knot + golden vitrine base caustics
 *  - Anima ParticleSystem vortex stardust orbiting inside the glass dome
 *  - Deckle-edge archival cotton-rag folio with live copperplate phase etching & Vernier scales
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { evaluateFluxStudio, FLUX_QUESTS } from '../../services/academiaGames/pedagogyEngine';
import { playDiscoveryCadence, playWarmPluck } from '../../services/academiaGames/acousticAudio';
import type { AtmospherePreset, FluxStudioQuest, JournalEntry, UdlPrefs } from '../../services/academiaGames/contracts';
import type { DirectorSettings } from '../../services/academiaGames/motionDirector';
import { BrassVernierSlider, StitchedClothButton, WaxSealBadge } from './craftPrimitives';
import { LivingSceneStage } from './LivingSceneStage';

interface Props {
  plateUrl: string;
  atmosphere: AtmospherePreset;
  director: DirectorSettings;
  udl: UdlPrefs;
  onActiveStateChange: (quest: FluxStudioQuest, p: number, q: number) => void;
  onStruggle: () => void;
  onMastery: (entry: JournalEntry) => void;
}

export const FluxStudioWorld: React.FC<Props> = ({
  plateUrl,
  atmosphere,
  director,
  udl,
  onActiveStateChange,
  onStruggle,
  onMastery,
}) => {
  const [qIdx, setQIdx] = useState(0);
  const quest = FLUX_QUESTS[qIdx];
  const [p, setP] = useState(3);
  const [q, setQ] = useState(5);
  const [solved, setSolved] = useState(false);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const movesRef = useRef(0);

  const evalRes = useMemo(() => evaluateFluxStudio(quest, p, q), [quest, p, q]);

  useEffect(() => {
    setP(qIdx === 0 ? 3 : 4);
    setQ(qIdx === 0 ? 5 : 6);
    setSolved(false);
    movesRef.current = 0;
  }, [qIdx]);

  useEffect(() => {
    onActiveStateChange(quest, p, q);
  }, [quest, p, q, onActiveStateChange]);

  const adjustScale = (which: 'p' | 'q', val: number) => {
    const np = which === 'p' ? val : p;
    const nq = which === 'q' ? val : q;
    if (which === 'p') setP(val);
    else setQ(val);

    movesRef.current += 1;
    playWarmPluck(220 + np * 28 + nq * 19, udl.soundOn, { duration: 0.55, volume: 0.05 });

    const check = evaluateFluxStudio(quest, np, nq);
    if (check.solved && !solved) {
      setSolved(true);
      setCelebrateTick(c => c + 1);
      playDiscoveryCadence(udl.soundOn);
      onMastery({
        id: quest.id,
        createdAt: Date.now(),
        world: 'studio',
        band: quest.band,
        title: `${quest.folioTitle} · (${np}, ${nq})`,
        summary: quest.insight,
        artifactNote: `${check.topologyLabel} verified inside the glass Flux vitrine.`,
        standards: quest.standards,
        emblem: 'knot',
      });
    } else if (movesRef.current % 10 === 0 && !check.solved) {
      onStruggle();
    }
  };

  const phasePoints = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 140; i++) {
      const a = (i / 140) * Math.PI * 2;
      const x = 110 + Math.cos(p * a) * 92;
      const y = 44 + Math.sin(q * a) * 34;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [p, q]);

  return (
    <LivingSceneStage
      world="studio"
      plateUrl={plateUrl}
      plateAlt="Museum drafting table with glass vitrine dome and cream cotton-rag archival folio"
      atmosphere={atmosphere}
      director={director}
      reducedMotion={udl.reducedMotion}
      soundOn={udl.soundOn}
      intensity={solved ? 1 : 0.45}
      fluxP={p}
      fluxQ={q}
      celebrateSignal={celebrateTick}
      celebrateBurstKind="sparkles"
    >
      {/* Live archival typography & Vernier controls printed directly onto the blank hand-painted cotton-rag folio! */}
      <div className="absolute top-[5.5%] bottom-[6.5%] left-[63.2%] right-[4.2%] flex flex-col justify-between overflow-y-auto px-3 py-2 text-[#1B1F26]">
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#B7A282]/70">
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#5F5446] font-mono">
                Flux Manifold · {quest.standards[0]?.code}
              </div>
              <h3 className="text-[19px] font-bold mt-0.5 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                {quest.folioTitle}
              </h3>
            </div>
            <WaxSealBadge label={solved ? 'QED' : `${evalRes.links}`} color={solved ? 'gold' : 'crimson'} />
          </div>

          <p className="text-[12px] leading-relaxed text-[#2A2D33]">{quest.prompt}</p>

          <div className="p-2 rounded bg-[#E6DACA]/65 border border-[#C1AE8E] font-serif text-[12.5px] space-y-0.5 italic">
            <div>x(t) = (R + r · cos({q}t)) cos({p}t)</div>
            <div>y(t) = (R + r · cos({q}t)) sin({p}t)</div>
            <div>z(t) = r · sin({q}t)</div>
          </div>

          <div className="p-1.5 rounded bg-[#FAF4E8]/60 border border-[#CBB89A]">
            <svg viewBox="0 0 220 84" className="w-full h-[70px]" aria-label="Phase curve etching">
              <line x1="10" y1="42" x2="210" y2="42" stroke="rgba(40,34,26,0.18)" strokeWidth="1" />
              <line x1="110" y1="6" x2="110" y2="78" stroke="rgba(40,34,26,0.18)" strokeWidth="1" />
              <polyline fill="none" stroke="#2D625B" strokeWidth="1.65" points={phasePoints} />
            </svg>
            <div className="text-center font-mono text-[10.5px] text-[#4A4135]">{evalRes.topologyLabel}</div>
          </div>

          <div className="space-y-2">
            <BrassVernierSlider label="Vernier Scale p" valueLabel={`p = ${p}`} min={2} max={8} value={p} onChange={v => adjustScale('p', v)} ok={solved} />
            <BrassVernierSlider label="Vernier Scale q" valueLabel={`q = ${q}`} min={3} max={10} value={q} onChange={v => adjustScale('q', v)} ok={solved} />
          </div>
        </div>

        <div className="pt-2.5 mt-2 border-t border-[#B7A282]/70 space-y-2">
          <p className="text-[11.5px] leading-snug text-[#342E26]">{evalRes.feedback}</p>
          {solved && (
            <StitchedClothButton onClick={() => setQIdx(i => (i + 1) % FLUX_QUESTS.length)} tone="indigo" className="w-full justify-center !py-1.5 !text-[12px]">
              Next Archival Plate <ChevronRight size={13} />
            </StitchedClothButton>
          )}
        </div>
      </div>
    </LivingSceneStage>
  );
};

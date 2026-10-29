// SOMA hand map — the panel card. Turn pads and keys into hand strokes on the drum (handMap.ts),
// pick the keys or pads layout, shape the hand with the mod wheel (or this slider), and see which
// key or pad plays which stroke with which hand.

import React, { useEffect, useState } from 'react';
import { Hand } from 'lucide-react';
import type { ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { SOMA_STROKES, handLegend, type SomaHandConfig, type SomaHandLayout } from '../../../../services/melos/instruments/soma/handMap';

const ACCENT = '#E86A33';

export const SomaHandMapCard: React.FC<{ track: ArrangeTrack; hand: SomaHandConfig; explicit: boolean; onChange: (h: SomaHandConfig) => void }> = ({ track, hand, explicit, onChange }) => {
  const [shape, setShape] = useState(0.5);
  // Show the controller's mod wheel as it moves.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const inst = BeatsEngine.get().getInstrument(track.id);
      if (inst && Math.abs(inst.modWheelValue - shape) > 0.01) setShape(inst.modWheelValue);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [track.id, shape]);

  const setWheel = (v: number) => { setShape(v); BeatsEngine.get().setInstrumentModWheel(track, v); };
  const legend = handLegend(hand.layout);

  return (
    <div className="w-full mt-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Hand size={11} style={{ color: ACCENT }} />
        <span className="text-[9.5px] uppercase tracking-wider text-white/55">Play by hand from keys & pads</span>
        <button
          onClick={() => onChange({ ...hand, enabled: !hand.enabled })}
          className="ml-auto h-5 px-2 rounded-md text-[9.5px] font-bold border"
          style={hand.enabled ? { background: `${ACCENT}33`, borderColor: ACCENT, color: '#fff' } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' }}
          title={hand.enabled ? 'Keys and pads are hand strokes on the drum' : 'Keys play the drum\'s pitch (melodic drums)'}
        >
          {hand.enabled ? 'On' : 'Off'}
        </button>
      </div>
      {!explicit && <p className="text-[9px] text-white/35 m-0 mb-1">{hand.enabled ? 'On by default for hand drums.' : 'Off by default for pitched drums — keys play pitch.'}</p>}

      {hand.enabled && (
        <>
          <div className="flex items-center gap-1 mb-1.5">
            {(['keys', 'pads'] as SomaHandLayout[]).map((l) => (
              <button key={l} onClick={() => onChange({ ...hand, layout: l })}
                className="h-5 px-2 rounded-md text-[9.5px] border"
                style={hand.layout === l ? { background: `${ACCENT}33`, borderColor: ACCENT, color: '#fff' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }}>
                {l === 'keys' ? 'Keys (any octave)' : 'Pads 1–16'}
              </button>
            ))}
            <span className="text-[9px] text-white/35 ml-1">{hand.layout === 'keys' ? 'Octaves step to drums a 4th apart' : 'Notes 36–51; the next 16 pads are the next drum'}</span>
          </div>

          <label className="flex items-center gap-2 mb-1.5" title="Mod wheel: the shape of the hand">
            <span className="text-[9px] text-white/50 w-[70px] shrink-0">Hand shape</span>
            <span className="text-[8.5px] text-white/35">relaxed palm</span>
            <input type="range" min={0} max={1} step={0.01} value={shape} onChange={(e) => setWheel(Number(e.target.value))} className="flex-1 accent-[#E86A33]" aria-label="Hand shape (mod wheel)" />
            <span className="text-[8.5px] text-white/35">tight fingers</span>
          </label>

          <div className={`grid gap-0.5 ${hand.layout === 'pads' ? 'grid-cols-4' : 'grid-cols-6'}`}>
            {(hand.layout === 'pads' ? [...legend.slice(12, 16), ...legend.slice(8, 12), ...legend.slice(4, 8), ...legend.slice(0, 4)] : legend).map((e) => (
              <div key={e.slot} title={SOMA_STROKES[e.stroke].how}
                className="rounded-md border border-white/[0.07] bg-black/30 px-1 py-0.5 text-center leading-tight">
                <div className="text-[8.5px] text-white/35">{e.slot}</div>
                <div className="text-[9.5px] font-semibold text-white/80">{SOMA_STROKES[e.stroke].label}<span className="text-white/35 font-normal"> {e.hand}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

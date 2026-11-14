// MEKA's hand-drum pattern library for SOMA: pick a rhythm (by tradition), a mood, a role and which
// side of Amara plays it, and she performs it into the SOMA pad's piano roll — every bar played, not
// pasted. "Another take" plays it again, differently. Rhythms are labelled for what they are
// (traditional / study / studio) with a line about each.

import React, { useMemo, useState } from 'react';
import { Hand, RefreshCw, X } from 'lucide-react';
import { HAND_RHYTHMS, type HandRhythm, type HandTradition } from '../../../../services/melos/beats/patterns/handRhythms';
import { HAND_MOODS, HAND_ROLES, type HandMood, type HandRole } from '../../../../services/melos/beats/patterns/handDrumPerformer';
import { playerById } from '../../../../services/melos/beats/band/roster';

const ACCENT = '#E86A33';
const TRADITIONS: (HandTradition | 'All')[] = ['All', 'Afro-Cuban', 'West African', 'Middle Eastern & North African', 'South Asian', 'Irish', 'Studio'];
const KIND_LABEL = { traditional: 'Traditional', study: 'Study', studio: 'Studio groove' } as const;

export interface HandDrumChoice { rhythm: HandRhythm; mood: HandMood; role: HandRole; personaId: string; bars: 2 | 4; seed: number; setTempo: boolean }

export const HandDrumLibrary: React.FC<{ onApply: (c: HandDrumChoice) => void; onClose: () => void }> = ({ onApply, onClose }) => {
  const amara = playerById('amara');
  const [trad, setTrad] = useState<HandTradition | 'All'>('All');
  const [rhythmId, setRhythmId] = useState(HAND_RHYTHMS[0].id);
  const [mood, setMood] = useState<HandMood>('steady');
  const [role, setRole] = useState<HandRole>('groove');
  const [personaId, setPersonaId] = useState(amara?.personas[1]?.id ?? '');
  const [bars, setBars] = useState<2 | 4>(4);
  const [setTempo, setSetTempo] = useState(true);
  const list = useMemo(() => HAND_RHYTHMS.filter((r) => trad === 'All' || r.tradition === trad), [trad]);
  const rhythm = HAND_RHYTHMS.find((r) => r.id === rhythmId) ?? list[0];
  const apply = () => rhythm && onApply({ rhythm, mood, role, personaId, bars, seed: (Math.random() * 2 ** 31) | 0, setTempo });

  const chip = (on: boolean) => (on ? { background: `${ACCENT}33`, borderColor: ACCENT, color: '#fff' } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' });

  return (
    <div className="absolute z-50 top-7 left-0 w-[420px] max-w-[92vw] rounded-xl border border-white/12 bg-[#0c0d12] shadow-2xl p-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <Hand size={12} style={{ color: ACCENT }} />
        <span className="text-[11px] font-bold text-white">Hand drums for SOMA</span>
        <span className="text-[9.5px] text-white/40">played by Amara · {HAND_RHYTHMS.length * HAND_MOODS.length * HAND_ROLES.length * (amara?.personas.length ?? 1)} combinations</span>
        <button onClick={onClose} className="ml-auto w-5 h-5 grid place-items-center rounded-md text-white/40 hover:text-white" aria-label="Close"><X size={11} /></button>
      </div>

      <div className="flex flex-wrap gap-1">
        {TRADITIONS.map((t) => <button key={t} onClick={() => setTrad(t)} className="h-5 px-2 rounded-full text-[9.5px] border" style={chip(trad === t)}>{t}</button>)}
      </div>

      <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5 pr-1">
        {list.map((r) => (
          <button key={r.id} onClick={() => setRhythmId(r.id)}
            className="text-left rounded-lg px-2 py-1.5 border transition"
            style={r.id === rhythm?.id ? { background: `${ACCENT}1f`, borderColor: `${ACCENT}aa` } : { borderColor: 'transparent' }}>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold text-white">{r.name}</span>
              <span className="text-[9px] text-white/40">{r.meter} · {r.bpm} BPM</span>
              <span className="ml-auto text-[8.5px] uppercase tracking-wider" style={{ color: r.kind === 'studio' ? '#7DD3FC' : '#FCD34D' }}>{KIND_LABEL[r.kind]}</span>
            </div>
            {r.id === rhythm?.id && <p className="text-[10px] leading-snug text-white/55 m-0 mt-0.5">{r.about}</p>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[52px_1fr] gap-x-2 gap-y-1.5 items-center">
        <span className="text-[9px] uppercase tracking-wider text-white/40">Mood</span>
        <div className="flex flex-wrap gap-1">{HAND_MOODS.map((x) => <button key={x.id} title={x.hint} onClick={() => setMood(x.id)} className="h-5 px-2 rounded-md text-[9.5px] border" style={chip(mood === x.id)}>{x.label}</button>)}</div>
        <span className="text-[9px] uppercase tracking-wider text-white/40">Role</span>
        <div className="flex flex-wrap gap-1">{HAND_ROLES.map((x) => <button key={x.id} title={x.hint} onClick={() => setRole(x.id)} className="h-5 px-2 rounded-md text-[9.5px] border" style={chip(role === x.id)}>{x.label}</button>)}</div>
        <span className="text-[9px] uppercase tracking-wider text-white/40">Player</span>
        <div className="flex flex-wrap gap-1">
          {amara?.personas.map((p) => <button key={p.id} title={p.tagline} onClick={() => setPersonaId(p.id)} className="h-5 px-2 rounded-md text-[9.5px] border" style={chip(personaId === p.id)}>{p.name}</button>)}
        </div>
        <span className="text-[9px] uppercase tracking-wider text-white/40">Length</span>
        <div className="flex items-center gap-1">
          {([2, 4] as const).map((b) => <button key={b} onClick={() => setBars(b)} className="h-5 px-2 rounded-md text-[9.5px] border" style={chip(bars === b)}>{b} bars</button>)}
          <label className="ml-2 flex items-center gap-1 text-[9.5px] text-white/50">
            <input type="checkbox" checked={setTempo} onChange={(e) => setSetTempo(e.target.checked)} className="accent-[#E86A33]" /> Use its tempo
          </label>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={apply} className="h-7 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1.5" style={{ background: ACCENT, color: '#000' }}>
          <Hand size={11} /> Play it into SOMA
        </button>
        <button onClick={apply} title="Same choice, a new performance" className="h-7 px-2.5 rounded-lg text-[10.5px] border border-white/15 text-white/70 hover:text-white flex items-center gap-1">
          <RefreshCw size={10} /> Another take
        </button>
        <span className="text-[9px] text-white/35 ml-1 leading-tight">Writes a new pattern into the SOMA pad's piano roll (adds SOMA if there isn't one).</span>
      </div>
    </div>
  );
};

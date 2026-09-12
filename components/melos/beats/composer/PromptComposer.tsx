// PromptComposer — Composer P2 UI: describe a part in words → the model writes MIDI, snapped to key →
// insert onto an instrument track. See services/melos/composition/promptToScore.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, Plus, RefreshCw } from 'lucide-react';
import { promptToScore } from '../../../../services/melos/composition/promptToScore';
import type { NoteEvent } from '../../../../services/melos/beats/grooveDoc';

const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const EXAMPLES = ['a dreamy 8-bar synth arpeggio', 'a walking jazz bass line', 'a triumphant brass melody', 'a lo-fi piano chord loop'];

interface Props { onInsert: (notes: NoteEvent[]) => void; onClose: () => void; target?: string; progression?: string; }

export default function PromptComposer({ onInsert, onClose, target, progression }: Props) {
  const [dir, setDir] = useState('');
  const [keyIdx, setKeyIdx] = useState(0);
  const [mode, setMode] = useState<'major' | 'minor'>('major');
  const [bars, setBars] = useState(4);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<NoteEvent[] | null>(null);

  const generate = async () => {
    if (!dir.trim() || working) return;
    setWorking(true); setErr(''); setResult(null);
    try {
      const r = await promptToScore(dir.trim(), { key: KEY_NAMES[keyIdx], mode, bars, progression });
      if (!r.notes.length) { setErr('The composer returned nothing usable — try rephrasing the direction.'); }
      else setResult(r.notes);
    } catch (e: any) { setErr(e?.message || 'The composer is unavailable right now.'); }
    finally { setWorking(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
      <div className="relative w-full max-w-md bg-[#100e16] border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/8">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/30">Virtual composer{target ? ` · ${target}` : ''}</p>
            <h3 className="text-base font-black tracking-tight text-white">Describe a part</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70"><X size={15} /></button>
        </div>

        <div className="p-6 space-y-4">
          <textarea value={dir} onChange={(e) => setDir(e.target.value)} rows={3} placeholder={`e.g. ${EXAMPLES[0]}`}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#8B5CFF]/60 resize-none" />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => <button key={ex} onClick={() => setDir(ex)} className="text-[9px] font-bold text-white/40 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 rounded-full px-2.5 py-1 transition-colors">{ex}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={keyIdx} onChange={(e) => setKeyIdx(+e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none">
              {KEYS.map((k, i) => <option key={k} value={i} className="bg-[#100e16]">{k}</option>)}
            </select>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(['major', 'minor'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${mode === m ? 'bg-[#8B5CFF] text-white' : 'text-white/45 hover:text-white'}`}>{m}</button>)}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Bars</span>
              <input type="number" min={1} max={32} value={bars} onChange={(e) => setBars(Math.max(1, Math.min(32, +e.target.value || 4)))} className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none" />
            </div>
          </div>
          {progression && <p className="text-[10px] text-white/35">Over your progression: <span className="font-mono text-white/60">{progression}</span></p>}

          {err && <p className="text-[12px] text-red-300 leading-relaxed">{err}</p>}
          {result && !err && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#8B5CFF]/10 border border-[#8B5CFF]/25">
              <Sparkles size={16} className="text-[#D0BCFF] shrink-0" />
              <p className="text-[12px] text-white/70 flex-1"><span className="font-black text-white">{result.length} notes</span> composed, snapped to {KEYS[keyIdx]} {mode}.</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {!result ? (
              <button onClick={generate} disabled={!dir.trim() || working} className="flex-1 h-11 rounded-full bg-[#8B5CFF] text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform">
                {working ? <><Loader2 size={15} className="animate-spin" /> Composing…</> : <><Sparkles size={15} /> Compose</>}
              </button>
            ) : (<>
              <button onClick={generate} disabled={working} className="h-11 px-4 rounded-full bg-white/5 hover:bg-white/10 text-white/70 text-[11px] font-black uppercase tracking-widest flex items-center gap-2"><RefreshCw size={14} /> Again</button>
              <button onClick={() => { onInsert(result); onClose(); }} className="flex-1 h-11 rounded-full bg-[#8B5CFF] text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform"><Plus size={15} /> Insert</button>
            </>)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

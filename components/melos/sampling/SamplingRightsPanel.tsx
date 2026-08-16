// Sampling & rights — the creator panel in the release uploader. A creator decides if and how their
// track can be sampled: whole or a region, sold / free / in the Melos Library / gated, with a split.
// Mounts like the Rights & Identifiers panel in AlbumCreator. The split maps onto the platform's
// creator-split rail; the record is shaped to register on the OCME rights registry.

import React, { useMemo, useState } from 'react';
import { X, Repeat, Plus, Trash2, DollarSign, Gift, Library, Lock } from 'lucide-react';
import {
  newClearance, splitsValid, type SampleClearance, type SampleOffer, type SampleSplit,
} from '../../../services/melos/sampling/clearance';

export interface SamplingSubject { trackId: string; title: string; ownerId: string; ownerName: string; durationSec?: number; }

interface Props {
  subject: SamplingSubject;
  existing?: SampleClearance;
  /** null = sampling turned off for this track. */
  onSave: (clearance: SampleClearance | null) => void;
  onClose: () => void;
}

const OFFERS: { id: SampleOffer; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'sell', label: 'Sell', icon: <DollarSign size={13} />, hint: 'a sample pack listeners buy' },
  { id: 'free', label: 'Free', icon: <Gift size={13} />, hint: 'free to everyone' },
  { id: 'library', label: 'Melos Library', icon: <Library size={13} />, hint: 'listed for producers on Melos' },
  { id: 'gated', label: 'Club / Sanctuary', icon: <Lock size={13} />, hint: 'members-only' },
];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const SamplingRightsPanel: React.FC<Props> = ({ subject, existing, onSave, onClose }) => {
  const dur = subject.durationSec && subject.durationSec > 0 ? subject.durationSec : 180;
  const [c, setC] = useState<SampleClearance>(() => existing || (() => {
    const base = newClearance(subject.trackId, subject.title, subject.ownerId, subject.ownerName);
    base.regionStartSec = Math.round(dur * 0.25); base.regionEndSec = Math.round(dur * 0.55);
    return base;
  })());
  const [enabled, setEnabled] = useState(true);
  const patch = (p: Partial<SampleClearance>) => setC((prev) => ({ ...prev, ...p, updatedAt: Date.now() }));
  const validSplits = splitsValid(c.splits);
  const totalPct = useMemo(() => c.splits.reduce((a, s) => a + (s.pct || 0), 0), [c.splits]);

  const rs = c.regionStartSec ?? 0, re = c.regionEndSec ?? dur;

  const setSplit = (i: number, p: Partial<SampleSplit>) => patch({ splits: c.splits.map((s, j) => j === i ? { ...s, ...p } : s) });
  const addSplit = () => patch({ splits: [...c.splits, { holderId: '', label: 'Collaborator', pct: 0 }] });
  const removeSplit = (i: number) => patch({ splits: c.splits.filter((_, j) => j !== i) });

  const canSave = c.allowOpenClip || c.offer !== 'sell' || (c.priceUSD ?? 0) >= 0;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/15 overflow-hidden shadow-2xl flex flex-col" style={{ background: '#0E0E12', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10 flex-none" style={{ background: '#0C0C10' }}>
          <span className="text-[12px] font-semibold text-white">Sampling &amp; rights</span>
          <span className="text-[11px] text-white/40 truncate">{subject.title}</span>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* allow */}
          <label className="flex items-center gap-3">
            <span className="flex-1"><span className="text-[13px] text-white font-medium">Allow sampling</span><span className="block text-[11px] text-white/45">let other creators build on this track</span></span>
            <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} />
          </label>

          {enabled && (<>
            {/* scope */}
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.16em] text-white/35 font-semibold mb-1.5">Sampleable region</p>
              <div className="flex gap-1.5 mb-2">
                {(['whole', 'region'] as const).map((s) => (
                  <button key={s} onClick={() => patch({ scope: s })} className="h-7 px-3 rounded-lg text-[11px] border" style={c.scope === s ? { borderColor: '#00DAF3', color: '#00DAF3', background: 'rgba(0,218,243,0.12)' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>{s === 'whole' ? 'Whole track' : 'A region'}</button>
                ))}
              </div>
              {c.scope === 'region' && (
                <div>
                  <div className="relative h-9 rounded-lg border border-white/10 overflow-hidden" style={{ background: '#0B0B0F' }}>
                    <div className="absolute inset-0 flex items-center px-2 gap-[2px]">{Array.from({ length: 60 }, (_, i) => <span key={i} className="flex-1" style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 60}%`, background: 'rgba(255,255,255,0.08)', borderRadius: 1 }} />)}</div>
                    <div className="absolute top-0 bottom-0" style={{ left: `${(rs / dur) * 100}%`, width: `${((re - rs) / dur) * 100}%`, background: 'rgba(0,218,243,0.16)', borderLeft: '2px solid #00DAF3', borderRight: '2px solid #00DAF3' }} />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Stepper label="In" value={fmt(rs)} onDown={() => patch({ regionStartSec: Math.max(0, rs - 1) })} onUp={() => patch({ regionStartSec: Math.min(re - 1, rs + 1) })} />
                    <Stepper label="Out" value={fmt(re)} onDown={() => patch({ regionEndSec: Math.max(rs + 1, re - 1) })} onUp={() => patch({ regionEndSec: Math.min(dur, re + 1) })} />
                  </div>
                </div>
              )}
            </div>

            {/* offer */}
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.16em] text-white/35 font-semibold mb-1.5">How it's offered</p>
              <div className="grid grid-cols-2 gap-1.5">
                {OFFERS.map((o) => (
                  <button key={o.id} onClick={() => patch({ offer: o.id })} className="flex items-center gap-2 h-9 px-2.5 rounded-lg border text-left" style={c.offer === o.id ? { borderColor: '#00DAF3', background: 'rgba(0,218,243,0.1)' } : { borderColor: 'rgba(255,255,255,0.1)' }}>
                    <span style={{ color: c.offer === o.id ? '#00DAF3' : 'rgba(255,255,255,0.4)' }}>{o.icon}</span>
                    <span className="min-w-0"><span className="text-[11.5px] text-white block leading-tight">{o.label}</span><span className="text-[9px] text-white/40 block truncate">{o.hint}</span></span>
                  </button>
                ))}
              </div>
              {c.offer === 'sell' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-white/45 flex-1">Price (USD)</span>
                  <input type="number" min={0} step={0.5} value={c.priceUSD ?? 0} onChange={(e) => patch({ priceUSD: Math.max(0, parseFloat(e.target.value) || 0) })} className="w-24 h-8 rounded-lg bg-black/40 border border-white/12 px-2 text-[12px] text-white text-right outline-none focus:border-white/30" />
                </div>
              )}
            </div>

            {/* open clip */}
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="flex-1"><span className="text-[12px] text-white flex items-center gap-1.5"><Repeat size={12} /> Open clipping</span><span className="block text-[10.5px] text-white/45">let listeners clip a section straight into their library</span></span>
              <Toggle on={c.allowOpenClip} onClick={() => patch({ allowOpenClip: !c.allowOpenClip })} />
            </label>

            {/* splits */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9.5px] uppercase tracking-[0.16em] text-white/35 font-semibold">Rights &amp; splits</p>
                <span className="text-[10px] font-mono" style={{ color: validSplits ? '#57E389' : '#FF8C00' }}>{totalPct}%</span>
              </div>
              <div className="space-y-1.5">
                {c.splits.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={s.label} onChange={(e) => setSplit(i, { label: e.target.value })} className="flex-1 h-8 rounded-lg bg-black/40 border border-white/12 px-2 text-[11px] text-white outline-none focus:border-white/30" placeholder="Rights holder" />
                    <input type="number" min={0} max={100} value={s.pct} onChange={(e) => setSplit(i, { pct: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })} className="w-14 h-8 rounded-lg bg-black/40 border border-white/12 px-2 text-[11px] text-white text-right outline-none focus:border-white/30" />
                    <span className="text-[10px] text-white/30">%</span>
                    {c.splits.length > 1 && <button onClick={() => removeSplit(i)} className="w-7 h-7 grid place-items-center text-white/25 hover:text-[#EF4444]"><Trash2 size={12} /></button>}
                  </div>
                ))}
              </div>
              <button onClick={addSplit} className="h-7 px-2.5 mt-1.5 rounded-lg border border-dashed border-white/15 text-white/45 hover:text-white text-[10px] flex items-center gap-1.5"><Plus size={11} /> Add a rights holder</button>
            </div>

            <p className="text-[10px] text-white/30 leading-relaxed">Sampling is an organisational + rights tool — it records terms and a split, and registers on the rights registry for tracking and payout. It doesn't itself assert third-party clearance.</p>
          </>)}
        </div>

        <div className="flex-none border-t border-white/10 p-3 flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-white/12 text-white/60 hover:text-white text-[12px]">Cancel</button>
          <button
            onClick={() => { onSave(enabled ? { ...c } : null); onClose(); }}
            disabled={enabled && (!validSplits || !canSave)}
            className="flex-1 h-9 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40"
            style={{ background: enabled ? 'linear-gradient(135deg, #6B0099, #00A6C0)' : '#2a2a32' }}
          >{enabled ? 'Save sampling terms' : 'Turn off sampling'}</button>
        </div>
      </div>
    </div>
  );
};

const Toggle: React.FC<{ on: boolean; onClick: () => void }> = ({ on, onClick }) => (
  <button onClick={onClick} aria-pressed={on} className="w-10 h-6 rounded-full relative flex-none transition-colors" style={{ background: on ? '#00DAF3' : '#2a2a32' }}>
    <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 20 : 4 }} />
  </button>
);
const Stepper: React.FC<{ label: string; value: string; onDown: () => void; onUp: () => void }> = ({ label, value, onDown, onUp }) => (
  <div className="flex items-center gap-1.5 flex-1">
    <span className="text-[10px] text-white/40 w-6">{label}</span>
    <button onClick={onDown} className="w-6 h-6 rounded-md border border-white/12 text-white/60 hover:text-white text-[12px] leading-none">–</button>
    <span className="flex-1 text-center text-[11px] font-mono text-white/80">{value}</span>
    <button onClick={onUp} className="w-6 h-6 rounded-md border border-white/12 text-white/60 hover:text-white text-[12px] leading-none">+</button>
  </div>
);

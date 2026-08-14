// CareerImportStudio — "point us at your work, come back to a finished Plajah."
//
// Phase 0: the OPEN lane only. Paste profile links, podcast feeds or just a name; every open
// source is queried at once and the results are staged for review. Nothing is written to the
// platform — commit arrives with the ownership gate in a later phase, and the review step is
// deliberately unskippable because a human confirming authorship is both the product decision
// and the legal one.

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Search, Loader2, Plus, X, Check, AlertTriangle, ExternalLink, Music2,
} from 'lucide-react';
import type { ScanResult, StagedItem, Destination } from '../services/careerImport/types';
import { DESTINATION_LABEL } from '../services/careerImport/types';

type Step = 'connect' | 'scanning' | 'review';

const EXAMPLES = [
  { label: 'Audius profile', value: 'audius.co/yourhandle' },
  { label: 'Podcast feed', value: 'https://feeds.example.com/show.xml' },
  { label: 'Your name', value: 'Your Artist Name' },
];

export default function CareerImportStudio({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<Step>('connect');
  const [inputs, setInputs] = useState<string[]>(['']);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);

  const setInput = (i: number, v: string) => setInputs(a => a.map((x, n) => (n === i ? v : x)));
  const addInput = () => setInputs(a => [...a, '']);
  const removeInput = (i: number) => setInputs(a => (a.length === 1 ? [''] : a.filter((_, n) => n !== i)));

  const runScan = async () => {
    const list = inputs.map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    setStep('scanning');
    setLog([]);
    setResult(null);
    try {
      const { scan } = await import('../services/careerImport/scan');
      const r = await scan({
        inputs: list,
        onProgress: m => {
          setLog(l => [...l, m]);
          requestAnimationFrame(() => logRef.current?.scrollTo({ top: 1e6 }));
        },
      });
      setResult(r);
      setStep('review');
    } catch (e: any) {
      setLog(l => [...l, `Scan failed: ${e?.message || e}`]);
    }
  };

  const toggle = (id: string) =>
    setRejected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const kept = (result?.items || []).filter(i => !rejected.has(i.id));
  const grouped = kept.reduce<Record<string, StagedItem[]>>((acc, i) => {
    (acc[i.destination] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0B0710] text-white">
      <div className="max-w-4xl mx-auto px-5 py-8">

        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-8 text-xs font-black uppercase tracking-widest">
          <ArrowLeft size={14} /> Back
        </button>

        {/* ── Connect ─────────────────────────────────────────────────────── */}
        {step === 'connect' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter leading-[0.95] mb-3">
              Bring your work with you
            </h1>
            <p className="text-white/45 text-sm leading-relaxed max-w-xl mb-8">
              Paste anywhere your work already lives — an Audius profile, a podcast feed, or just your
              name. We read what is public, and you confirm what is yours before anything is added.
            </p>

            <div className="space-y-2.5 mb-4">
              {inputs.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={v}
                    onChange={e => setInput(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') runScan(); }}
                    placeholder={EXAMPLES[i % EXAMPLES.length].value}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D40055]/60 transition-colors"
                  />
                  {(inputs.length > 1 || v) && (
                    <button onClick={() => removeInput(i)} className="p-2.5 text-white/25 hover:text-white transition-colors" aria-label="Remove">
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button onClick={addInput} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/35 hover:text-white transition-colors mb-8">
              <Plus size={12} /> Add another
            </button>

            <button
              onClick={runScan}
              disabled={!inputs.some(s => s.trim())}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-30 transition-opacity"
              style={{ background: 'linear-gradient(120deg,#8A14C4,#D40055)' }}
            >
              <Search size={14} /> Find my work
            </button>

            <p className="text-[11px] text-white/25 leading-relaxed mt-8 max-w-xl">
              We only read openly published information. Nothing behind a login is touched, and no
              file is copied from another service unless it is yours to move.
            </p>
          </motion.div>
        )}

        {/* ── Scanning ────────────────────────────────────────────────────── */}
        {step === 'scanning' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
            <Loader2 size={28} className="animate-spin mx-auto mb-6" style={{ color: '#FF8C00' }} />
            <h2 className="text-xl font-black mb-2">Looking for your work…</h2>
            <p className="text-white/35 text-xs mb-8">Every source is checked at once, so this is as fast as the slowest one.</p>
            <div ref={logRef} className="max-w-md mx-auto max-h-52 overflow-y-auto text-left rounded-2xl bg-black/40 border border-white/5 p-4 font-mono text-[11px] text-white/45 space-y-1">
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </motion.div>
        )}

        {/* ── Review ──────────────────────────────────────────────────────── */}
        {step === 'review' && result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter mb-2">
              Found {result.items.length} {result.items.length === 1 ? 'thing' : 'things'}
            </h1>
            <p className="text-white/45 text-sm mb-7 max-w-xl">
              Least certain first — those are the ones worth your eyes. Anything you remove here is
              simply not imported.
            </p>

            {/* Per-source outcome, including what failed and why. */}
            <div className="flex flex-wrap gap-2 mb-8">
              {result.results.map((r, i) => (
                <span key={i} title={r.note || ''}
                  className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border ${
                    r.ok ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10'
                         : 'text-amber-300 border-amber-500/25 bg-amber-500/10'}`}>
                  {r.label} · {r.ok ? `${r.items.length}` : 'none'}
                </span>
              ))}
            </div>

            {result.results.some(r => r.note) && (
              <div className="mb-8 p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1.5">
                {result.results.filter(r => r.note).map((r, i) => (
                  <p key={i} className="text-[11px] text-white/45 leading-relaxed">
                    <span className="text-white/70 font-bold">{r.label}:</span> {r.note}
                  </p>
                ))}
              </div>
            )}

            {Object.entries(grouped).map(([dest, items]) => (
              <div key={dest} className="mb-9">
                <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-3">
                  {DESTINATION_LABEL[dest as Destination]} · {items.length}
                </h2>
                <div className="space-y-2">
                  {items.map(it => (
                    <div key={it.id} className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/8">
                      <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden shrink-0 grid place-items-center">
                        {it.artwork
                          ? <img src={it.artwork} alt="" className="w-full h-full object-cover"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          : <Music2 size={15} className="text-white/15" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white/90 leading-snug">{it.title}</p>
                          {it.confidence < 0.8 && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 flex items-center gap-1">
                              <AlertTriangle size={9} /> check
                            </span>
                          )}
                          {it.lane === 'METADATA_ONLY' && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/8 text-white/40">
                              details only
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/35 mt-0.5">
                          {[it.byline, it.releasedAt ? new Date(it.releasedAt).getUTCFullYear() : null, it.kind.toLowerCase()]
                            .filter(Boolean).join(' · ')}
                          {it.meta?.alsoSeenIn?.length ? ` · also on ${it.meta.alsoSeenIn.join(', ')}` : ''}
                        </p>
                      </div>
                      {it.externalUrl && (
                        <a href={it.externalUrl} target="_blank" rel="noopener noreferrer"
                          className="p-2 text-white/20 hover:text-white transition-colors" aria-label="Open source">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button onClick={() => toggle(it.id)} className="p-2 text-white/25 hover:text-red-400 transition-colors" aria-label="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!kept.length && (
              <p className="text-white/35 text-sm py-10 text-center">
                Nothing left to import. Go back and try another link.
              </p>
            )}

            <div className="sticky bottom-4 mt-10 p-4 rounded-2xl bg-[#140D1C] border border-white/10 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[11px] text-white/45">
                <Check size={12} className="inline mr-1.5 text-emerald-400" />
                {kept.length} ready · {rejected.size} removed
              </p>
              <div className="flex gap-2">
                <button onClick={() => setStep('connect')} className="px-4 py-2.5 rounded-xl bg-white/8 text-[11px] font-black uppercase tracking-widest text-white/70 hover:bg-white/12 transition-colors">
                  Add more
                </button>
                <button disabled title="Committing arrives with the ownership gate"
                  className="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white opacity-40 cursor-not-allowed"
                  style={{ background: 'linear-gradient(120deg,#8A14C4,#D40055)' }}>
                  Add to Plajah — soon
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

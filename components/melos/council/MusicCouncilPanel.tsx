// MusicCouncilPanel — ask the Music Council about your mix. Reads the live master meter (the same tap
// the Meter Bridge uses) into a MeasuredMix so the advice is grounded in real numbers, then renders the
// deliberation: each expert's proposal, where they split, and the ranked plan. Aria is the voice.
import React, { useState } from 'react';
import { Users, Loader2, Sparkles } from 'lucide-react';
import { MeterAnalyser } from '../../../services/shared/meterAnalyser';
import { frameToMeasured } from '../../../services/melos/council/meterToMeasured';
import { deliberate, MUSIC_PERSONAS } from '../../../services/melos/council/musicCouncilService';
import type { MusicDeliberation, MeasuredMix, MusicPersonaId, ApplyAction } from '../../../services/melos/council/musicCouncilTypes';
import { GENRE_PROFILES, LOUDNESS_TARGETS } from '../../../services/melos/council/musicKnowledge';
import { saveSession, markUsed, leadCounts, listSessions } from '../../../services/melos/council/musicCouncilStore';
import { Check, History } from 'lucide-react';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sample the master over ~1.2 s so integrated LUFS settles; returns {} if nothing is playing. */
async function measure(tap: () => { ctx: BaseAudioContext; node: AudioNode } | null): Promise<MeasuredMix> {
  const src = tap();
  if (!src) return {};
  let ma: MeterAnalyser | null = null;
  try {
    ma = new MeterAnalyser(src.ctx, src.node);
    let last = null;
    for (let i = 0; i < 12; i++) { await sleep(100); const f = ma.read(); if (!f.silent) last = f; }
    return last ? frameToMeasured(last) : {};
  } catch { return {}; }
  finally { ma?.dispose(); }
}

export default function MusicCouncilPanel({ tap, onApply }: { tap: () => { ctx: BaseAudioContext; node: AudioNode } | null; onApply?: (a: ApplyAction) => void }) {
  const [ask, setAsk] = useState('Why does my mix sound small?');
  const [genre, setGenre] = useState('pop');
  const [platform, setPlatform] = useState('Spotify');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MusicDeliberation | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0); // bump to re-read the store (history + stats)
  const [showHistory, setShowHistory] = useState(false);
  const counts = leadCounts();
  const topLead = (Object.entries(counts) as [MusicPersonaId, number][]).sort((a, b) => b[1] - a[1])[0];

  const run = async () => {
    if (busy || !ask.trim()) return;
    setBusy(true); setRes(null); setUsed(false); setApplied(new Set());
    try {
      const m = await measure(tap);
      const d = await deliberate({ ask: ask.trim(), genre, platform }, m);
      setRes(d);
      const sess = saveSession({ ask: ask.trim(), genre, platform }, d);
      setSessionId(sess.id); setTick((t) => t + 1);
    } catch { /* deliberate already falls back */ }
    finally { setBusy(false); }
  };
  const doApply = (a: ApplyAction | undefined, key: string) => { if (!a || !onApply) return; onApply(a); setApplied((s) => new Set(s).add(key)); };
  const followed = () => { if (sessionId) { markUsed(sessionId); setUsed(true); setTick((t) => t + 1); } };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0d15] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={15} className="text-[#8B5CFF]" />
        <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Music Council</span>
        <span className="text-[9px] text-white/25">producer · mix · master · musician · composer</span>
      </div>

      <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
        placeholder="Ask about your mix…"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/25 outline-none focus:border-[#8B5CFF]/60 mb-2" />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={genre} onChange={(e) => setGenre(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
          {GENRE_PROFILES.map((g) => <option key={g.genre} value={g.genre} className="bg-[#0f0d15]">{g.genre}</option>)}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
          {LOUDNESS_TARGETS.map((t) => <option key={t.platform} value={t.platform} className="bg-[#0f0d15]">{t.platform}</option>)}
        </select>
        <button onClick={run} disabled={busy || !ask.trim()} className="ml-auto h-8 px-4 rounded-full bg-[#8B5CFF] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5">
          {busy ? <><Loader2 size={13} className="animate-spin" /> Deliberating…</> : <><Sparkles size={13} /> Ask the council</>}
        </button>
      </div>

      {res && (
        <div className="space-y-3">
          <p className="text-[12px] text-white/60 italic leading-relaxed">{res.intro}</p>
          <div className="space-y-2">
            {res.proposals.map((p, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#D0BCFF]">{MUSIC_PERSONAS[p.personaId as MusicPersonaId]?.name || p.personaId}</span>
                  <span className="text-[10px] text-white/40">{p.headline}</span>
                </div>
                <ul className="space-y-0.5">
                  {p.moves.map((m, j) => (
                    <li key={j} className="text-[12px] text-white/70 flex gap-2 items-start">
                      <span className="flex-1">{m.text}</span>
                      {m.where && <span className="shrink-0 text-[9px] font-mono text-[#8B5CFF]/80 bg-[#8B5CFF]/10 border border-[#8B5CFF]/25 rounded px-1.5 py-0.5 self-start">{m.where}</span>}
                      {m.apply && onApply && (
                        applied.has(`${i}:${j}`)
                          ? <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] flex items-center gap-0.5 self-start"><Check size={11} /> applied</span>
                          : <button onClick={() => doApply(m.apply, `${i}:${j}`)} className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#8B5CFF] hover:text-white bg-[#8B5CFF]/10 hover:bg-[#8B5CFF]/25 border border-[#8B5CFF]/30 rounded px-1.5 py-0.5 self-start transition-colors">Apply</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {res.tensions.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/80 mb-1">Where they split</p>
              {res.tensions.map((t, i) => <p key={i} className="text-[12px] text-white/60 leading-snug">{t}</p>)}
            </div>
          )}
          {res.plan.length > 0 && (
            <div className="rounded-xl border border-[#8B5CFF]/25 bg-[#8B5CFF]/[0.06] px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF] mb-1">The plan</p>
              <ol className="space-y-1 list-decimal list-inside">
                {res.plan.map((m, i) => <li key={i} className="text-[12px] text-white/75"><span>{m.text}</span>{m.where && <span className="text-[10px] font-mono text-[#8B5CFF]/80 ml-1">· {m.where}</span>}</li>)}
              </ol>
            </div>
          )}
          {res.summary && <p className="text-[12px] text-white/70 leading-relaxed">{res.summary}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] text-white/25 uppercase tracking-widest">{res.grounded ? '▣ grounded in your master' : '— play the master for numbers-backed advice'} · {res.source}</span>
            {used
              ? <span className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] flex items-center gap-0.5"><Check size={11} /> followed</span>
              : <button onClick={followed} className="text-[9px] font-black uppercase tracking-widest text-white/45 hover:text-white border border-white/12 rounded-full px-2 py-0.5">I followed this</button>}
          </div>
        </div>
      )}

      {/* Persistence: lead stats + recent asks. The team learns which voice you keep following. */}
      {(topLead || listSessions().length > 0) && (
        <div className="mt-3 pt-3 border-t border-white/8" key={tick}>
          <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-white/60">
            <History size={11} /> {topLead ? `${MUSIC_PERSONAS[topLead[0]].name} has led ${topLead[1]} you've kept` : 'Council history'}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1">
              {listSessions().slice(0, 6).map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[11px]">
                  {s.used && <Check size={10} className="text-[#3DFFC0] shrink-0" />}
                  <span className="flex-1 truncate text-white/50">{s.ask}</span>
                  {s.leadPersona && <span className="shrink-0 text-[9px] text-[#8B5CFF]/70 uppercase tracking-widest">{s.leadPersona.toLowerCase()}</span>}
                </div>
              ))}
              {listSessions().length === 0 && <p className="text-[10px] text-white/25">No sessions yet.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

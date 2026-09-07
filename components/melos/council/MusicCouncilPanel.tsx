// MusicCouncilPanel — ask the Music Council about your mix. Reads the live master meter (the same tap
// the Meter Bridge uses) into a MeasuredMix so the advice is grounded in real numbers, then renders the
// deliberation: each expert's proposal, where they split, and the ranked plan. Aria is the voice.
import React, { useState } from 'react';
import { Users, Loader2, Sparkles } from 'lucide-react';
import { MeterAnalyser } from '../../../services/shared/meterAnalyser';
import { frameToMeasured } from '../../../services/melos/council/meterToMeasured';
import { deliberate, MUSIC_PERSONAS } from '../../../services/melos/council/musicCouncilService';
import type { MusicDeliberation, MeasuredMix, MusicPersonaId } from '../../../services/melos/council/musicCouncilTypes';
import { GENRE_PROFILES, LOUDNESS_TARGETS } from '../../../services/melos/council/musicKnowledge';

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

export default function MusicCouncilPanel({ tap }: { tap: () => { ctx: BaseAudioContext; node: AudioNode } | null }) {
  const [ask, setAsk] = useState('Why does my mix sound small?');
  const [genre, setGenre] = useState('pop');
  const [platform, setPlatform] = useState('Spotify');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MusicDeliberation | null>(null);

  const run = async () => {
    if (busy || !ask.trim()) return;
    setBusy(true); setRes(null);
    try {
      const m = await measure(tap);
      setRes(await deliberate({ ask: ask.trim(), genre, platform }, m));
    } catch { /* deliberate already falls back */ }
    finally { setBusy(false); }
  };

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
                    <li key={j} className="text-[12px] text-white/70 flex gap-2">
                      <span className="flex-1">{m.text}</span>
                      {m.where && <span className="shrink-0 text-[9px] font-mono text-[#8B5CFF]/80 bg-[#8B5CFF]/10 border border-[#8B5CFF]/25 rounded px-1.5 py-0.5 self-start">{m.where}</span>}
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
          <p className="text-[9px] text-white/25 uppercase tracking-widest">{res.grounded ? '▣ grounded in your master' : '— play the master for numbers-backed advice'} · {res.source}</p>
        </div>
      )}
    </div>
  );
}

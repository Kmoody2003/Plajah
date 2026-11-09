// "Describe it": say what you are building; we pick a product recipe, show what we heard and what
// we assumed, let you change any of it, then design the whole thing. On the Plajah desktop app an
// on-device model can read the prompt first; it only fills in the same checked parameters.

import React, { useEffect, useMemo, useState } from 'react';
import { Wand2, Cpu } from 'lucide-react';
import { RECIPES, interpret, recipeById, recipeDefaults, llmPrompt, fromLlm, type Build, type Interpretation, type Values } from '../../services/elec/recipes';

const DIM = 'rgba(255,255,255,.55)';

export default function DescribePanel({ onBuild, initialPrompt }: { onBuild: (b: Build) => void; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [it, setIt] = useState<Interpretation | null>(null);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const desktop = useMemo(() => typeof window !== 'undefined' && !!((window as any).__PLAJAH_WINUI__ || (window as any).chrome?.webview), []);

  const read = async (text = prompt, useModel = false) => {
    setErr(''); let r = interpret(text);
    if (useModel) {
      setBusy('Reading with the on-device model…');
      try { const { nativeLlmChat } = await import('../../services/windowsBridgeService'); const reply = await nativeLlmChat(llmPrompt(text), { maxTokens: 300, temperature: 0.1 }); if (reply.success) r = fromLlm(reply.text, text); }
      catch (e: any) { setErr(`On-device model unavailable (${String(e?.message ?? e)}); used the built-in reader.`); } finally { setBusy(''); }
    }
    setIt(r); setValues(r.values);
    if (!r.recipe) setErr('No recipe matches that yet. Try one of the examples, or pick a product below.');
  };
  // A prompt typed elsewhere (the Plajah Build hub) is read as soon as the panel opens.
  useEffect(() => { if (initialPrompt?.trim()) void read(initialPrompt); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const build = () => { const r = it?.recipe; if (!r) return; try { onBuild(r.build(values)); } catch (e: any) { setErr(String(e?.message ?? e)); } };
  const pick = (id: string) => { const r = recipeById(id)!; const v = recipeDefaults(r); setIt({ recipe: r, values: v, heard: [], assumed: r.params.map(p => `${p.label}: ${v[p.key]}`), market: 'both' }); setValues(v); setErr(''); };

  return <div data-testid="elec-describe" className="text-[12px]">
    <div className="font-bold flex items-center gap-1.5 mb-1"><Wand2 size={14} color="#fbbf24"/>What are you building?</div>
    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void read(); }} rows={3} placeholder="e.g. a portable speaker, a MIDI controller with 3 knobs, my own electric guitar…" aria-label="Describe your product"
      className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-[12px] text-white resize-none" data-testid="elec-prompt"/>
    <div className="flex gap-1.5 mt-1.5">
      <button className="elec-btn elec-primary flex-1 justify-center" onClick={() => void read()} disabled={!prompt.trim() || !!busy} data-testid="elec-prompt-read"><Wand2 size={13}/>Read it</button>
      {desktop && <button className="elec-btn" onClick={() => void read(prompt, true)} disabled={!prompt.trim() || !!busy} title="Use the on-device model in the Plajah app"><Cpu size={13}/>On-device</button>}
    </div>
    <div className="flex flex-wrap gap-1 mt-2">{RECIPES.flatMap(r => r.examples.slice(0, 1)).map(ex => <button key={ex} className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10" onClick={() => { setPrompt(ex); void read(ex); }}>{ex}</button>)}</div>
    {busy && <div className="mt-2 text-[11px]" style={{ color: DIM }}>{busy}</div>}
    {err && <div className="mt-2 text-[11px]" style={{ color: '#fbbf24' }}>{err}</div>}

    {it?.recipe && <div className="mt-3 p-2 rounded-lg" style={{ background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.2)' }} data-testid="elec-interpretation">
      <div className="font-bold">{it.recipe.title}</div>
      <div className="text-[11px] mt-0.5" style={{ color: DIM }}>{it.recipe.about}</div>
      {it.heard.length > 0 && <div className="text-[11px] mt-1.5"><b>Heard:</b> {it.heard.join(', ')}</div>}
      {it.assumed.length > 0 && <div className="text-[11px] mt-0.5" style={{ color: DIM }}><b>Assumed:</b> {it.assumed.join(', ')}</div>}
      <div className="mt-2">{it.recipe.params.map(p => <label key={p.key} className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>
        {p.kind === 'choice' ? <select value={String(values[p.key])} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))} className="h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label={p.label}>{p.choices!.map(c => <option key={c} value={c} style={{ background: '#12141b' }}>{c}</option>)}</select>
          : p.kind === 'bool' ? <input type="checkbox" checked={values[p.key] === true} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.checked }))} aria-label={p.label}/>
          : <input type="number" value={Number(values[p.key])} min={p.min} max={p.max} onChange={e => setValues(v => ({ ...v, [p.key]: +e.target.value }))} className="w-20 h-6 rounded bg-white/5 border border-white/10 px-1 text-[11px] text-white text-right" aria-label={p.label}/>}
      </label>)}</div>
      <button className="elec-btn elec-primary w-full justify-center mt-2" onClick={build} data-testid="elec-prompt-build"><Wand2 size={13}/>Design it</button>
      <div className="text-[10px] mt-1.5" style={{ color: DIM }}>Draws the circuit, sizes the parts, fits an enclosure, writes firmware, and lists every safety hazard for this product.</div>
    </div>}

    <div className="mt-3"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Or pick a product</div>
      {RECIPES.map(r => <button key={r.id} onClick={() => pick(r.id)} className="w-full text-left p-2 rounded-lg mb-1" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }} data-testid={`elec-recipe-${r.id}`}>
        <div className="font-bold text-[11.5px]">{r.title}</div><div className="text-[10.5px] leading-snug" style={{ color: DIM }}>{r.about}</div></button>)}
    </div>
  </div>;
}

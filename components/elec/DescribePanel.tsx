// "Describe it": say what you are building. A fixed product recipe takes it when it covers the
// whole request; anything else goes to the block engine, which reads it into a requirement spec
// (functions and counts, board, power, connectivity, market). Either way we show what we heard and
// what we assumed, let you change any of it, then design the whole thing. On the Plajah desktop
// app an on-device model can read the prompt first; it only fills in the same checked spec.

import React, { useEffect, useMemo, useState } from 'react';
import { Wand2, Cpu, X, Plus, Blocks } from 'lucide-react';
import { RECIPES, recipeById, recipeDefaults, fromLlm, type Build, type Interpretation, type Values } from '../../services/elec/recipes';
import { understand, understandFromLlm, designLlmPrompt, type SpecReading } from '../../services/elec/design/spec';
import { designFromSpec } from '../../services/elec/design';
import { BLOCKS, blockById } from '../../services/elec/design/blocks';
import type { BlockId, Conn, PowerChoice, Spec } from '../../services/elec/design/types';

const DIM = 'rgba(255,255,255,.55)';
const SEL = 'h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white';
const NOVEL = ['a plant monitor with soil moisture, OLED and Wi-Fi', 'a 4-channel relay board', 'a battery LED lantern with USB-C charging', 'a robot car with an ultrasonic distance sensor'];
const POWER: Array<[PowerChoice, string]> = [['auto', 'Auto (from the loads)'], ['usb', 'USB 5 V'], ['liion', 'Li-ion + USB-C charging'], ['liion2s', '2-cell Li-ion (motors)'], ['aa', '3 × AA'], ['adapter5', '5 V adapter'], ['adapter12', '12 V adapter'], ['mains', 'Mains (certified module)']];
const MCU: Array<[Spec['mcu'], string]> = [['auto', 'Auto'], ['esp32', 'ESP32 (Wi-Fi)'], ['esp32s3', 'ESP32-S3 (Wi-Fi + USB)'], ['pico', 'Raspberry Pi Pico'], ['picow', 'Pico W (Wi-Fi)'], ['nano', 'Arduino Nano'], ['rpi', 'Raspberry Pi'], ['none', 'No controller']];
const CONN: Array<[Conn, string]> = [['wifi', 'Wi-Fi'], ['homeassistant', 'Home Assistant'], ['bluetooth', 'Bluetooth'], ['usb-midi', 'USB MIDI'], ['usb-hid', 'USB keyboard']];

export default function DescribePanel({ onBuild, initialPrompt }: { onBuild: (b: Build) => void; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [it, setIt] = useState<Interpretation | null>(null);
  const [values, setValues] = useState<Values>({});
  const [reading, setReading] = useState<SpecReading | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [mode, setMode] = useState<'recipe' | 'design' | null>(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const desktop = useMemo(() => typeof window !== 'undefined' && !!((window as any).__PLAJAH_WINUI__ || (window as any).chrome?.webview), []);

  const read = async (text = prompt, useModel = false) => {
    setErr(''); let u = understand(text);
    if (useModel) {
      setBusy('Reading with the on-device model…');
      try { const { nativeLlmChat } = await import('../../services/windowsBridgeService'); const reply = await nativeLlmChat(designLlmPrompt(text), { maxTokens: 500, temperature: 0.1 }); if (reply.success) u = understandFromLlm(reply.text, text); }
      catch (e: any) { setErr(`On-device model unavailable (${String(e?.message ?? e)}); used the built-in reader.`); } finally { setBusy(''); }
    }
    setIt(u.interp); setValues(u.interp.values); setReading(u.reading); setSpec(u.reading.spec);
    setMode(u.kind === 'none' ? null : u.kind);
    if (u.kind === 'none') setErr('Nothing we can build from that yet. Name the parts (knobs, a screen, relays, sensors, LEDs…), try an example, or pick a product below.');
  };
  // A prompt typed elsewhere (the Plajah Build hub) is read as soon as the panel opens.
  useEffect(() => { if (initialPrompt?.trim()) void read(initialPrompt); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const build = () => {
    setErr('');
    try {
      if (mode === 'recipe' && it?.recipe) return onBuild(it.recipe.build(values));
      if (mode === 'design' && spec) { const r = designFromSpec(spec); if (r.build) onBuild(r.build); else setErr(r.errors.join(' ')); }
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const pick = (id: string) => { const r = recipeById(id)!; const v = recipeDefaults(r); setIt({ recipe: r, values: v, heard: [], assumed: r.params.map(p => `${p.label}: ${v[p.key]}`), market: 'both' }); setValues(v); setMode('recipe'); setErr(''); };
  const upd = (f: (s: Spec) => Spec) => setSpec(s => (s ? f(s) : s));
  const setNeed = (k: number, patch: Partial<Spec['needs'][number]>) => upd(s => ({ ...s, needs: s.needs.map((n, j) => (j === k ? { ...n, ...patch } : n)) }));

  return <div data-testid="elec-describe" className="text-[12px]">
    <div className="font-bold flex items-center gap-1.5 mb-1"><Wand2 size={14} color="#fbbf24"/>What are you building?</div>
    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void read(); }} rows={3} placeholder="e.g. a plant monitor with soil moisture, OLED and Wi-Fi; a 4-channel relay board; a MIDI controller with 8 knobs…" aria-label="Describe your product"
      className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-[12px] text-white resize-none" data-testid="elec-prompt"/>
    <div className="flex gap-1.5 mt-1.5">
      <button className="elec-btn elec-primary flex-1 justify-center" onClick={() => void read()} disabled={!prompt.trim() || !!busy} data-testid="elec-prompt-read"><Wand2 size={13}/>Read it</button>
      {desktop && <button className="elec-btn" onClick={() => void read(prompt, true)} disabled={!prompt.trim() || !!busy} title="Use the on-device model in the Plajah app"><Cpu size={13}/>On-device</button>}
    </div>
    <div className="flex flex-wrap gap-1 mt-2">{[...NOVEL, ...RECIPES.flatMap(r => r.examples.slice(0, 1))].map(ex => <button key={ex} className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10" onClick={() => { setPrompt(ex); void read(ex); }}>{ex}</button>)}</div>
    {busy && <div className="mt-2 text-[11px]" style={{ color: DIM }}>{busy}</div>}
    {err && <div className="mt-2 text-[11px]" style={{ color: '#fbbf24' }} data-testid="elec-describe-error">{err}</div>}

    {mode === 'recipe' && it?.recipe && <div className="mt-3 p-2 rounded-lg" style={{ background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.2)' }} data-testid="elec-interpretation">
      <div className="font-bold">{it.recipe.title}</div>
      <div className="text-[11px] mt-0.5" style={{ color: DIM }}>{it.recipe.about}</div>
      {it.heard.length > 0 && <div className="text-[11px] mt-1.5"><b>Heard:</b> {it.heard.join(', ')}</div>}
      {it.assumed.length > 0 && <div className="text-[11px] mt-0.5" style={{ color: DIM }}><b>Assumed:</b> {it.assumed.join(', ')}</div>}
      <div className="mt-2">{it.recipe.params.map(p => <label key={p.key} className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>
        {p.kind === 'choice' ? <select value={String(values[p.key])} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))} className={SEL} aria-label={p.label}>{p.choices!.map(c => <option key={c} value={c} style={{ background: '#12141b' }}>{c}</option>)}</select>
          : p.kind === 'bool' ? <input type="checkbox" checked={values[p.key] === true} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.checked }))} aria-label={p.label}/>
          : <input type="number" value={Number(values[p.key])} min={p.min} max={p.max} onChange={e => setValues(v => ({ ...v, [p.key]: +e.target.value }))} className="w-20 h-6 rounded bg-white/5 border border-white/10 px-1 text-[11px] text-white text-right" aria-label={p.label}/>}
      </label>)}</div>
      <button className="elec-btn elec-primary w-full justify-center mt-2" onClick={build} data-testid="elec-prompt-build"><Wand2 size={13}/>Design it</button>
      {reading && reading.spec.needs.length > 0 && <button className="elec-btn w-full justify-center mt-1" onClick={() => setMode('design')} data-testid="elec-to-blocks"><Blocks size={13}/>Design from blocks instead</button>}
      <div className="text-[10px] mt-1.5" style={{ color: DIM }}>Draws the circuit, sizes the parts, fits an enclosure, writes firmware, and lists every safety hazard for this product.</div>
    </div>}

    {mode === 'design' && spec && <div className="mt-3 p-2 rounded-lg" style={{ background: 'rgba(96,165,250,.05)', border: '1px solid rgba(96,165,250,.25)' }} data-testid="elec-spec">
      <input value={spec.name} onChange={e => upd(s => ({ ...s, name: e.target.value }))} className="w-full font-bold bg-transparent text-white text-[12.5px] outline-none" aria-label="Design name"/>
      <div className="text-[11px] mt-0.5" style={{ color: DIM }}>Built from our block library: we pick the board, map its pins, budget the power, size the supply, wire and simulate it.</div>
      {reading && reading.heard.length > 0 && <div className="text-[11px] mt-1.5"><b>Heard:</b> {reading.heard.join(', ')}</div>}
      {reading && reading.assumed.length > 0 && <div className="text-[11px] mt-0.5" style={{ color: DIM }}><b>Assumed:</b> {reading.assumed.join('; ')}</div>}
      <div className="mt-2 space-y-1">{spec.needs.map((n, k) => { const b = blockById(n.block)!; return <div key={n.block} className="flex items-center gap-1.5" data-testid={`elec-need-${n.block}`}>
        <span className="flex-1 truncate" title={b.about}>{b.label}</span>
        {(b.opts ?? []).map(o => o.choices ? <select key={o.key} value={String(n.opt?.[o.key] ?? o.default)} onChange={e => setNeed(k, { opt: { ...n.opt, [o.key]: e.target.value } })} className={SEL} aria-label={o.label} title={o.label}>{o.choices.map(c => <option key={c} value={c} style={{ background: '#12141b' }}>{c}</option>)}</select>
          : <input key={o.key} type="number" value={Number(n.opt?.[o.key] ?? o.default)} onChange={e => setNeed(k, { opt: { ...n.opt, [o.key]: +e.target.value } })} className="w-12 h-6 rounded bg-white/5 border border-white/10 px-1 text-[11px] text-white text-right" aria-label={o.label} title={o.label}/>)}
        <input type="number" min={1} max={n.block === 'neopixel' ? 120 : n.block === 'lamp' ? 12 : b.max} value={n.count} onChange={e => setNeed(k, { count: Math.max(1, +e.target.value || 1) })} className="w-12 h-6 rounded bg-white/5 border border-white/10 px-1 text-[11px] text-white text-right" aria-label={`${b.label} count`}/>
        <button onClick={() => upd(s => ({ ...s, needs: s.needs.filter((_, j) => j !== k) }))} title="Remove" aria-label={`Remove ${b.label}`}><X size={12}/></button>
      </div>; })}</div>
      <label className="flex items-center gap-1.5 mt-1.5"><Plus size={12}/><select value="" onChange={e => { const id = e.target.value as BlockId; if (id) upd(s => ({ ...s, needs: s.needs.some(x => x.block === id) ? s.needs : [...s.needs, { block: id, count: 1 }] })); }} className={`${SEL} flex-1`} aria-label="Add a block" data-testid="elec-add-block">
        <option value="" style={{ background: '#12141b' }}>Add a function…</option>{BLOCKS.filter(b => !spec.needs.some(n => n.block === b.id)).map(b => <option key={b.id} value={b.id} style={{ background: '#12141b' }}>{b.label}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
        <label className="flex flex-col"><span style={{ color: DIM }}>Board</span><select value={spec.mcu} onChange={e => upd(s => ({ ...s, mcu: e.target.value as Spec['mcu'] }))} className={SEL} aria-label="Board">{MCU.map(([v, l]) => <option key={v} value={v} style={{ background: '#12141b' }}>{l}</option>)}</select></label>
        <label className="flex flex-col"><span style={{ color: DIM }}>Power</span><select value={spec.power} onChange={e => upd(s => ({ ...s, power: e.target.value as PowerChoice }))} className={SEL} aria-label="Power">{POWER.map(([v, l]) => <option key={v} value={v} style={{ background: '#12141b' }}>{l}</option>)}</select></label>
        <label className="flex flex-col"><span style={{ color: DIM }}>Market</span><select value={spec.market} onChange={e => upd(s => ({ ...s, market: e.target.value as Spec['market'] }))} className={SEL} aria-label="Market">{(['both', 'US', 'EU'] as const).map(v => <option key={v} value={v} style={{ background: '#12141b' }}>{v === 'both' ? 'US + EU' : v}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-x-2 mt-1.5">{CONN.map(([c, l]) => <label key={c} className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={spec.conn.includes(c)} onChange={e => upd(s => ({ ...s, conn: e.target.checked ? [...s.conn, c] : s.conn.filter(x => x !== c) }))}/>{l}</label>)}</div>
      <button className="elec-btn elec-primary w-full justify-center mt-2" onClick={build} disabled={!spec.needs.length} data-testid="elec-prompt-build"><Wand2 size={13}/>Design it</button>
      {it?.recipe && <button className="elec-btn w-full justify-center mt-1" onClick={() => setMode('recipe')}>Use the {it.recipe.title} recipe instead</button>}
      <div className="text-[10px] mt-1.5" style={{ color: DIM }}>Schematic, simulation, design review (power, pins, heat, rules), firmware, enclosure, parts with sourcing, and every safety hazard.</div>
    </div>}

    <div className="mt-3"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Or pick a product</div>
      {RECIPES.map(r => <button key={r.id} onClick={() => pick(r.id)} className="w-full text-left p-2 rounded-lg mb-1" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }} data-testid={`elec-recipe-${r.id}`}>
        <div className="font-bold text-[11.5px]">{r.title}</div><div className="text-[10.5px] leading-snug" style={{ color: DIM }}>{r.about}</div></button>)}
    </div>
  </div>;
}
void fromLlm;

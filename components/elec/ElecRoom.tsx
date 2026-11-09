// Electronics Lab: draw a schematic, simulate it with our own engine, see LEDs light and scopes
// trace, check every part against its ratings and the regulations for where it will be sold, then
// put the sheet and its bill of materials into a Tela document.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MousePointer2, Spline, RotateCw, Trash2, Play, Undo2, FilePlus, Download, ShieldCheck, ListChecks, SlidersHorizontal, Activity, Sparkles, Search, Pause, ShieldAlert, Package, Store } from 'lucide-react';
import type { Build } from '../../services/elec/recipes';
import { designHazards, advisoriesFor, recallQueries, needsAck } from '../../services/safety/hazards';
import SafetyPanel, { BuildTermsGate, termsAccepted } from '../safety/SafetyPanel';
import DescribePanel from './DescribePanel';
import BuildPanel from './BuildPanel';
import SourcingPanel from '../supply/SourcingPanel';
import ExchangeRoom from '../supply/ExchangeRoom';
import { COMPONENTS, type CompDef, type Pt, compByKind, compDefaults, parseSi } from '../../services/elec/components';
import { type Circuit, type CPart, bom, netlist, nextRef, pinPos } from '../../services/elec/circuit';
import { simulate, type SimResult, type SimOptions } from '../../services/elec/sim';
import { checkCircuit, summarize, type Finding } from '../../services/elec/checks';
import { DESIGNS, type Design } from '../../services/elec/designs';
import { GRID, partSvg, junctions, circuitSvg, ledGlow, bounds } from '../../services/elec/render';
import { spiceNetlist } from '../../services/elec/exportSpice';

export interface ElecAddArgs { circuit: Circuit; svg: string; width: number; height: number; bom: string[][]; summary: { errors: number; warnings: number; passes: number; nets: number } }
export interface ElecRoomProps {
  initial?: Circuit | null;
  loadInitial?: () => Promise<Circuit>;
  onClose?: () => void;
  onAddToTela?: (args: ElecAddArgs) => Promise<void>;
  onSendTable?: (title: string, rows: string[][]) => Promise<void>;
  /** Signed-in user's Firebase ID token (records terms acceptance, posts to the exchange). */
  getToken?: () => Promise<string | null>;
  /** Where /api lives ('' = same origin). */
  apiBase?: string;
}

const C = { bg: '#0c0d12', panel: '#12141b', line: 'rgba(255,255,255,.08)', text: '#e8eaf0', dim: 'rgba(255,255,255,.5)', wire: '#7dd3fc', accent: '#fbbf24' };
type Tool = { kind: 'select' } | { kind: 'wire' } | { kind: 'place'; comp: CompDef; rot: number };
type Sel = { type: 'part' | 'wire'; id: string } | null;
const clone = (c: Circuit): Circuit => JSON.parse(JSON.stringify(c));
const eq = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
const LEVEL_COLOR: Record<string, string> = { error: '#f87171', warn: '#fbbf24', info: '#93c5fd', pass: '#4ade80' };
const download = (name: string, data: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const fmtV = (v: number) => `${Math.abs(v) < 0.01 ? '0' : v.toFixed(Math.abs(v) >= 10 ? 1 : 2)} V`;
const fmtT = (t: number) => t >= 1 ? `${t.toFixed(2)} s` : t >= 1e-3 ? `${(t * 1e3).toFixed(2)} ms` : `${(t * 1e6).toFixed(0)} µs`;

export default function ElecRoom({ initial, loadInitial, onClose, onAddToTela, onSendTable, getToken, apiBase = '' }: ElecRoomProps) {
  const start = DESIGNS.find(d => d.id === '555-led-blinker')!;
  const [circuit, setCircuit] = useState<Circuit>(() => initial ? clone(initial) : clone(start.circuit));
  const [simOpts, setSimOpts] = useState<SimOptions>(initial ? { mode: 'dc' } : start.sim);
  const [history, setHistory] = useState<Circuit[]>([]);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [sel, setSel] = useState<Sel>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [tIdx, setTIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [left, setLeft] = useState<'describe' | 'parts' | 'starters'>(initial || loadInitial ? 'parts' : 'describe');
  const [right, setRight] = useState<'props' | 'checks' | 'safety' | 'build' | 'bom' | 'scope'>('checks');
  const [build, setBuild] = useState<Build | null>(null);
  const [acks, setAcks] = useState<string[]>([]);
  const [terms, setTerms] = useState(termsAccepted);
  const [exchange, setExchange] = useState(false);
  const [market, setMarket] = useState<'both' | 'US' | 'EU'>('both');
  const [toy, setToy] = useState(false);
  const [probes, setProbes] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<null | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'part'; id: string; dx: number; dy: number; ends: Array<{ w: string; i: number; pin: string }>; moved: boolean }>(null);
  const live = useRef({ view, circuit }); live.current = { view, circuit };

  useEffect(() => { if (!loadInitial) return; let off = false; setBusy('Opening circuit…'); loadInitial().then(c => { if (!off) { setCircuit(c); setSimOpts({ mode: 'dc' }); fitTo(c); } }).catch(e => !off && setError(String(e?.message ?? e))).finally(() => !off && setBusy('')); return () => { off = true; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nl = useMemo(() => netlist(circuit), [circuit]);
  const findings = useMemo<Finding[]>(() => checkCircuit(circuit, sim, { market, toy }), [circuit, sim, market, toy]);
  const counts = summarize(findings);
  const bomRows = useMemo(() => bom(circuit), [circuit]);
  // Safety at every stage: hazards follow the parts on the sheet and the product being built.
  const hazards = useMemo(() => designHazards({ circuit, recipe: build?.recipe, toy }), [circuit, build?.recipe, toy]);
  const advisories = useMemo(() => advisoriesFor(circuit), [circuit]);
  const queries = useMemo(() => recallQueries(circuit, build?.recipe), [circuit, build?.recipe]);
  const openCritical = needsAck(hazards).filter(h => !acks.includes(h.id));
  /** Exports and making wait until every critical hazard is acknowledged. */
  const guard = (fn: () => void) => { if (openCritical.length) { setRight('safety'); setError(`Acknowledge ${openCritical.length === 1 ? 'the critical hazard' : `${openCritical.length} critical hazards`} in Safety first: ${openCritical.map(h => h.title).join('; ')}.`); return; } fn(); };

  /** Edits invalidate the simulation; the old one would describe a different circuit. */
  const commit = useCallback((next: Circuit, keepSim = false) => { setHistory(h => [...h.slice(-80), live.current.circuit]); setCircuit(next); if (!keepSim) { setSim(null); setPlaying(false); } }, []);
  const undo = () => setHistory(h => { if (!h.length) return h; setCircuit(h[h.length - 1]); setSim(null); return h.slice(0, -1); });

  const fitTo = useCallback((c: Circuit) => {
    const el = svgRef.current; if (!el) return; const r = el.getBoundingClientRect(); const b = bounds(c);
    const z = Math.max(0.4, Math.min(2.2, Math.min(r.width / ((b.x1 - b.x0) * GRID), r.height / ((b.y1 - b.y0) * GRID)) * 0.9));
    setView({ z, x: r.width / 2 - ((b.x0 + b.x1) / 2) * GRID * z, y: r.height / 2 - ((b.y0 + b.y1) / 2) * GRID * z });
  }, []);
  useEffect(() => { fitTo(circuit); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onBuild = (b: Build) => {
    commit(clone(b.circuit)); setSimOpts(b.sim); setBuild(b); setMarket(b.market); setSel(null); setTool({ kind: 'select' }); setNote(b.summary);
    run(b.circuit, b.sim); setRight('safety'); setTimeout(() => fitTo(b.circuit), 0);
  };
  const loadDesign = (d: Design) => { commit(clone(d.circuit)); setSimOpts(d.sim); setSel(null); setTool({ kind: 'select' }); setNote(d.about); setTimeout(() => fitTo(d.circuit), 0); setRight('checks'); };
  const newSheet = () => { commit({ name: 'Untitled circuit', parts: [], wires: [] }); setSimOpts({ mode: 'dc' }); setSel(null); setLeft('parts'); setNote(''); setView({ z: 1.4, x: (svgRef.current?.clientWidth ?? 800) / 2, y: (svgRef.current?.clientHeight ?? 600) / 2 }); };

  // ---- Simulation ----
  const run = (circuit_: Circuit = circuit, simOpts_: SimOptions = simOpts) => {
    const circuit = circuit_, simOpts = simOpts_;
    setError('');
    try {
      const r = simulate(circuit, simOpts); setSim(r); setTIdx(r.time.length - 1);
      const tracePins: Array<[string, string]> = [];
      for (const p of circuit.parts) { if (p.kind === 'capacitor' || p.kind === 'electrolytic') tracePins.push([p.id, p.kind === 'electrolytic' ? '+' : '1']); if (p.kind === 'ne555') tracePins.push([p.id, 'OUT']); if (p.kind === 'speaker') tracePins.push([p.id, '-']); }
      const nets = [...new Set(tracePins.map(([id, pin]) => r.netlist.pinNet[id]?.[pin]).filter((x): x is number => !!x))].slice(0, 3);
      setProbes(nets.length ? nets : Array.from({ length: Math.min(2, r.netlist.netCount - 1) }, (_, i) => i + 1));
      if (r.mode === 'tran') { setRight('scope'); setTIdx(0); setPlaying(true); }
    } catch (e: any) { setError(String(e?.message ?? e)); }
  };
  useEffect(() => {
    if (!playing || !sim || sim.mode !== 'tran') return; let raf = 0; const t0 = performance.now(); const span = sim.time[sim.time.length - 1];
    // Slow seconds-long circuits to real time; speed up fast ones so a few cycles show.
    const rate = span >= 0.5 ? 1 : 0.25 / span * 3;
    const tick = () => { const t = ((performance.now() - t0) / 1000) * rate; const i = Math.min(sim.time.length - 1, Math.round(t / span * (sim.time.length - 1))); setTIdx(i); if (i >= sim.time.length - 1) setPlaying(false); else raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, sim]);
  const at = sim ? Math.min(tIdx, sim.time.length - 1) : 0;
  const glow = useMemo(() => { const g: Record<string, number> = {}; if (sim) for (const p of circuit.parts) if (p.kind === 'led') g[p.id] = ledGlow(p, sim.parts[p.id]?.i[at] ?? 0); return g; }, [sim, at, circuit]);

  // ---- Pointer → grid ----
  const toGrid = (e: { clientX: number; clientY: number }): Pt => { const r = svgRef.current!.getBoundingClientRect(); const v = live.current.view; return [Math.round((e.clientX - r.left - v.x) / v.z / GRID), Math.round((e.clientY - r.top - v.y) / v.z / GRID)]; };
  const pinPoints = useMemo(() => circuit.parts.flatMap(p => (compByKind(p.kind)?.pins ?? []).map(pin => ({ part: p, pin: pin.name, p: pinPos(p, pin.at) }))), [circuit]);
  const isConnectionPoint = (pt: Pt) => pinPoints.some(x => eq(x.p, pt)) || circuit.wires.some(w => w.pts.some((q, i) => eq(q, pt) || (i > 0 && onSeg(pt, w.pts[i - 1], q))));

  const finishWire = (pts: Pt[]) => { const clean = simplify(pts); if (clean.length >= 2) commit({ ...circuit, wires: [...circuit.wires, { id: `w${Date.now().toString(36)}`, pts: clean }] }); setDraft(null); };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) { drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; (e.target as Element).setPointerCapture?.(e.pointerId); return; }
    if (e.button !== 0) return; const g = toGrid(e);
    if (tool.kind === 'place') {
      const p: CPart = { id: `p${Date.now().toString(36)}`, kind: tool.comp.kind, ref: tool.comp.kind === 'ground' ? `GND${Date.now().toString(36).slice(-3)}` : nextRef(circuit, tool.comp.prefix), x: g[0], y: g[1], rot: tool.rot, params: compDefaults(tool.comp) };
      commit({ ...circuit, parts: [...circuit.parts, p] }); setSel({ type: 'part', id: p.id }); if (!e.shiftKey) setTool({ kind: 'select' }); return;
    }
    if (tool.kind === 'wire') {
      if (!draft) { setDraft([g]); return; }
      const last = draft[draft.length - 1]; if (eq(last, g)) { finishWire(draft); return; }
      const next = [...draft, ...(last[0] !== g[0] && last[1] !== g[1] ? [[g[0], last[1]] as Pt] : []), g];
      if (isConnectionPoint(g) && draft.length >= 1) finishWire(next); else setDraft(next);
      return;
    }
    // Select tool: a part under the pointer, then a wire, else pan.
    const target = (e.target as Element).closest('[data-part],[data-wire]') as HTMLElement | null;
    if (target?.dataset.part) {
      const p = circuit.parts.find(x => x.id === target.dataset.part)!; setSel({ type: 'part', id: p.id }); setRight('props');
      const ends: Array<{ w: string; i: number; pin: string }> = [];
      for (const pin of compByKind(p.kind)?.pins ?? []) { const pp = pinPos(p, pin.at); for (const w of circuit.wires) { if (eq(w.pts[0], pp)) ends.push({ w: w.id, i: 0, pin: pin.name }); if (w.pts.length > 1 && eq(w.pts[w.pts.length - 1], pp)) ends.push({ w: w.id, i: w.pts.length - 1, pin: pin.name }); } }
      setHistory(h => [...h.slice(-80), circuit]);
      drag.current = { kind: 'part', id: p.id, dx: g[0] - p.x, dy: g[1] - p.y, ends, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); return;
    }
    if (target?.dataset.wire) {
      const w = circuit.wires.find(x => x.id === target.dataset.wire)!; setSel({ type: 'wire', id: w.id });
      const net = nl.wireNet[w.id]; if (sim && net) { setProbes(pr => pr.includes(net) ? pr : [...pr.slice(-3), net]); setRight('scope'); } else setRight('props');
      return;
    }
    setSel(null); drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = toGrid(e); setHover(g); const d = drag.current; if (!d) return;
    if (d.kind === 'pan') { setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })); return; }
    const c = live.current.circuit; const p = c.parts.find(x => x.id === d.id); if (!p) return;
    const nx = g[0] - d.dx, ny = g[1] - d.dy; if (nx === p.x && ny === p.y) return;
    d.moved = true; const moved = { ...p, x: nx, y: ny };
    // Wires follow: the attached end moves and its neighbour keeps the segment straight.
    const wires = c.wires.map(w => {
      const mine = d.ends.filter(x => x.w === w.id); if (!mine.length) return w;
      let pts = w.pts.map(q => [...q] as Pt);
      for (const end of mine) {
        const def = compByKind(p.kind)!; const np = pinPos(moved, def.pins.find(x => x.name === end.pin)!.at);
        if (pts.length === 2) { const other = pts[end.i === 0 ? 1 : 0]; pts = end.i === 0 ? [np, [np[0], other[1]], other] : [other, [np[0], other[1]], np]; if (end.i !== 0) { end.i = 2; } continue; }
        const j = end.i === 0 ? 1 : pts.length - 2; const old = pts[end.i];
        if (pts[j][1] === old[1]) pts[j] = [pts[j][0], np[1]]; else if (pts[j][0] === old[0]) pts[j] = [np[0], pts[j][1]];
        pts[end.i] = np;
      }
      return { ...w, pts };
    });
    setCircuit({ ...c, parts: c.parts.map(x => x.id === p.id ? moved : x), wires }); setSim(null);
  };
  const onUp = () => { const d = drag.current; drag.current = null; if (d?.kind === 'part') { if (!d.moved) setHistory(h => h.slice(0, -1)); else setCircuit(c => ({ ...c, wires: c.wires.map(w => ({ ...w, pts: simplify(w.pts) })) })); } };
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView(v => { const z = Math.max(0.25, Math.min(4, v.z * Math.exp(-e.deltaY * 0.0015))); return { z, x: mx - (mx - v.x) * z / v.z, y: my - (my - v.y) * z / v.z }; });
  };

  const rotateSel = () => { if (tool.kind === 'place') { setTool({ ...tool, rot: (tool.rot + 1) % 4 }); return; } if (sel?.type === 'part') commit({ ...circuit, parts: circuit.parts.map(p => p.id === sel.id ? { ...p, rot: (p.rot + 1) % 4 } : p) }); };
  const deleteSel = () => { if (!sel) return; commit(sel.type === 'part' ? { ...circuit, parts: circuit.parts.filter(p => p.id !== sel.id) } : { ...circuit, wires: circuit.wires.filter(w => w.id !== sel.id) }); setSel(null); };
  const setParam = (id: string, key: string, value: string | number) => commit({ ...circuit, parts: circuit.parts.map(p => p.id === id ? (key === '__ref' ? { ...p, ref: String(value) } : { ...p, params: { ...p.params, [key]: value } }) : p) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t?.closest('input,select,textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Escape') { if (draft) finishWire(draft); else { setTool({ kind: 'select' }); setSel(null); } }
      else if (e.key === 'r' || e.key === 'R') rotateSel();
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSel();
      else if (e.key === 'w' || e.key === 'W') { setTool({ kind: 'wire' }); setSel(null); }
      else if (e.key === 'v' || e.key === 'V') setTool({ kind: 'select' });
      else if (e.key === ' ' && sim) { e.preventDefault(); run(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const addToTela = async () => {
    if (!onAddToTela) return; setBusy('Adding to your document…'); setError('');
    try { const s = circuitSvg(circuit, { glow, title: circuit.name }); await onAddToTela({ circuit, ...s, bom: bomRows, summary: { ...counts, nets: nl.netCount } }); setNote('Added to your document: the schematic and its parts list.'); }
    catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(''); }
  };

  // ---- Render helpers ----
  const selPart = sel?.type === 'part' ? circuit.parts.find(p => p.id === sel.id) ?? null : null;
  const selWire = sel?.type === 'wire' ? circuit.wires.find(w => w.id === sel.id) ?? null : null;
  const junc = useMemo(() => junctions(circuit), [circuit]);
  const netV = (net: number) => (sim ? sim.nets[net]?.[at] ?? 0 : 0);
  const comps = COMPONENTS.filter(c => !q.trim() || `${c.name} ${c.category} ${c.about}`.toLowerCase().includes(q.trim().toLowerCase()));
  const cats = [...new Set(comps.map(c => c.category))];
  const ghost = tool.kind === 'place' && hover ? { id: 'ghost', kind: tool.comp.kind, ref: '', x: hover[0], y: hover[1], rot: tool.rot, params: compDefaults(tool.comp) } as CPart : null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="elec-room">
      <div className="flex items-center gap-2 px-3 h-12 border-b shrink-0 overflow-x-auto elec-bar" style={{ borderColor: C.line }}>
        <Sparkles size={16} color={C.accent}/><span className="font-extrabold text-[13px] mr-1 elec-title">Electronics Lab</span>
        <input value={circuit.name} onChange={e => setCircuit(c => ({ ...c, name: e.target.value }))} aria-label="Circuit name" className="h-8 w-48 rounded-md bg-white/5 border border-white/10 px-2 text-[12px] text-white" data-testid="elec-name"/>
        <button className="elec-btn" onClick={newSheet} data-testid="elec-new"><FilePlus size={14}/><span className="elec-label">New</span></button>
        <span className="w-px h-6 bg-white/10 mx-1"/>
        <button className={`elec-btn${tool.kind === 'select' ? ' elec-on' : ''}`} onClick={() => setTool({ kind: 'select' })} title="Select and move (V)"><MousePointer2 size={14}/></button>
        <button className={`elec-btn${tool.kind === 'wire' ? ' elec-on' : ''}`} onClick={() => { setTool({ kind: 'wire' }); setSel(null); }} title="Draw wires (W): click to bend, end on a pin or click twice" data-testid="elec-wire"><Spline size={14}/><span className="elec-label">Wire</span></button>
        <button className="elec-btn" onClick={rotateSel} disabled={!selPart && tool.kind !== 'place'} title="Rotate (R)"><RotateCw size={14}/></button>
        <button className="elec-btn" onClick={deleteSel} disabled={!sel} title="Delete (Del)"><Trash2 size={14}/></button>
        <button className="elec-btn" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)"><Undo2 size={14}/></button>
        <span className="w-px h-6 bg-white/10 mx-1"/>
        <select value={simOpts.mode} onChange={e => setSimOpts(o => ({ ...o, mode: e.target.value as 'dc' | 'tran', tEnd: o.tEnd ?? 0.01, steps: o.steps ?? 2000 }))} className="h-8 rounded-md bg-white/5 border border-white/10 text-[12px] text-white px-1" aria-label="Simulation type" data-testid="elec-mode">
          <option value="dc" style={{ background: C.panel }}>Steady state (DC)</option><option value="tran" style={{ background: C.panel }}>Over time</option>
        </select>
        {simOpts.mode === 'tran' && <label className="flex items-center gap-1 text-[11px]" style={{ color: C.dim }}>for<input defaultValue={fmtT(simOpts.tEnd ?? 0.01).replace(' ', '')} key={simOpts.tEnd} onBlur={e => { const v = parseSi(e.target.value.replace(/s$/, '').replace('µ', 'u')); if (v > 0) setSimOpts(o => ({ ...o, tEnd: v })); }} className="w-16 h-7 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white" aria-label="Duration"/></label>}
        <button className="elec-btn elec-primary" onClick={() => run()} data-testid="elec-run"><Play size={14}/>Simulate</button>
        <div className="ml-auto flex items-center gap-2">
          <button className="elec-btn" onClick={() => setRight('safety')} title="Safety review" data-testid="elec-safety-chip" style={openCritical.length ? { borderColor: '#f43f5e', color: '#fda4af' } : undefined}><ShieldAlert size={14}/><span className="elec-label">{openCritical.length ? `${openCritical.length} to review` : 'Safety'}</span></button>
          <button className="elec-btn" onClick={() => setExchange(true)} title="Find suppliers, manufacturers and local makers" data-testid="elec-exchange"><Store size={14}/><span className="elec-label">Exchange</span></button>
          <button className="elec-btn" onClick={() => guard(() => download(`${circuit.name}.svg`, circuitSvg(circuit, { title: circuit.name }).svg, 'image/svg+xml'))} title="Schematic as SVG"><Download size={14}/><span className="elec-label">SVG</span></button>
          <button className="elec-btn" onClick={() => guard(() => download(`${circuit.name}.cir`, spiceNetlist(circuit), 'text/plain'))} title="SPICE netlist for ngspice, LTspice, KiCad" data-testid="elec-spice"><Download size={14}/><span className="elec-label">SPICE</span></button>
          <button className="elec-btn" onClick={() => guard(() => download(`${circuit.name}.plajah-circuit.json`, JSON.stringify(circuit, null, 1), 'application/json'))} title="Circuit file"><Download size={14}/><span className="elec-label">JSON</span></button>
          {onAddToTela && <button className="elec-btn elec-primary" onClick={() => guard(() => void addToTela())} disabled={!!busy} data-testid="elec-add"><FilePlus size={14}/>Add to document</button>}
          {onClose && <button className="elec-btn" onClick={onClose} aria-label="Close" data-testid="elec-close"><X size={15}/></button>}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: parts and starters */}
        <aside className="w-60 shrink-0 border-r flex flex-col min-h-0" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex gap-1 p-2">{(['describe', 'starters', 'parts'] as const).map(t => <button key={t} onClick={() => setLeft(t)} className={`elec-tab${left === t ? ' elec-tab-on' : ''}`} data-testid={`elec-left-${t}`}>{t === 'parts' ? 'Parts' : t === 'describe' ? 'Describe' : 'Starters'}</button>)}</div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 text-[12px]">
            {left === 'describe' ? <DescribePanel onBuild={onBuild}/> : left === 'starters' ? <>
              {DESIGNS.map(d => <button key={d.id} onClick={() => loadDesign(d)} className="w-full text-left p-2 rounded-lg mb-1.5" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }} data-testid={`elec-design-${d.id}`}>
                <div className="font-bold text-[12px]">{d.title}</div><div className="text-[10.5px] mt-0.5 leading-snug" style={{ color: C.dim }}>{d.about}</div>
                <div className="flex flex-wrap gap-1 mt-1">{d.tags.map(t => <span key={t} className="text-[9px] px-1.5 rounded-full" style={{ background: 'rgba(251,191,36,.1)', color: C.accent }}>{t}</span>)}</div>
              </button>)}
              <div className="text-[10px] mt-2" style={{ color: C.dim }}>Drawn by Plajah and released to the public domain (CC0). Copy, change, sell what you build.</div>
            </> : <>
              <div className="relative mb-2"><Search size={12} className="absolute left-2 top-2" style={{ color: C.dim }}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search parts…" aria-label="Search parts" className="w-full h-7 rounded-md bg-white/5 border border-white/10 pl-6 pr-2 text-[11px] text-white"/></div>
              {cats.map(cat => <div key={cat} className="mb-2"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: C.dim }}>{cat}</div>
                {comps.filter(c => c.category === cat).map(c => <button key={c.kind} onClick={() => { setTool({ kind: 'place', comp: c, rot: 0 }); setSel(null); }} title={c.about} data-testid={`elec-comp-${c.kind}`}
                  className="w-full flex items-center gap-2 px-1.5 py-1 rounded-md mb-0.5 text-left" style={{ background: tool.kind === 'place' && tool.comp.kind === c.kind ? 'rgba(251,191,36,.12)' : 'transparent' }}>
                  <svg width="34" height="26" viewBox="-60 -50 120 100" className="shrink-0"><g dangerouslySetInnerHTML={{ __html: partSvg({ id: c.kind, kind: c.kind, ref: '', x: 0, y: 0, rot: 0, params: compDefaults(c) }, '#cbd5e1', { labels: false }) }}/></svg>
                  <span className="text-[11.5px]">{c.name}</span></button>)}
              </div>)}
              <div className="text-[10px]" style={{ color: C.dim }}>Click a part, then click the sheet. Shift-click places several. R rotates.</div>
            </>}
          </div>
        </aside>

        {/* Sheet */}
        <div className="flex-1 min-w-0 relative">
          <svg ref={svgRef} className="w-full h-full block select-none" style={{ cursor: tool.kind === 'wire' ? 'crosshair' : tool.kind === 'place' ? 'copy' : 'default', touchAction: 'none' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} onWheel={onWheel} onDoubleClick={() => { if (draft) finishWire(draft); }} data-testid="elec-sheet">
            <defs>
              <pattern id="elec-grid" width={GRID * view.z} height={GRID * view.z} patternUnits="userSpaceOnUse" x={view.x} y={view.y}><circle cx={0.5} cy={0.5} r={0.9} fill="rgba(255,255,255,.12)"/></pattern>
              <filter id="elec-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="6"/></filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#elec-grid)"/>
            <g transform={`translate(${view.x},${view.y}) scale(${view.z})`}>
              {circuit.wires.map(w => {
                const net = nl.wireNet[w.id]; const probed = sim && probes.includes(net);
                return <g key={w.id} data-wire={w.id} style={{ cursor: tool.kind === 'select' ? 'pointer' : undefined }}>
                  <polyline points={w.pts.map(p => `${p[0] * GRID},${p[1] * GRID}`).join(' ')} fill="none" stroke="transparent" strokeWidth={10}/>
                  <polyline points={w.pts.map(p => `${p[0] * GRID},${p[1] * GRID}`).join(' ')} fill="none" stroke={sel?.id === w.id ? '#fff' : probed ? probeColor(probes.indexOf(net)) : C.wire} strokeWidth={sel?.id === w.id ? 2.6 : 1.8} strokeLinejoin="round" strokeLinecap="round"/>
                </g>;
              })}
              {junc.map(p => <circle key={`${p[0]},${p[1]}`} cx={p[0] * GRID} cy={p[1] * GRID} r={3} fill={C.wire}/>)}
              {circuit.parts.map(p => <g key={p.id} data-part={p.id} style={{ cursor: tool.kind === 'select' ? 'move' : undefined }} data-testid={`elec-part-${p.ref}`}>
                <rect x={(p.x - 2.2) * GRID} y={(p.y - 2.2) * GRID} width={4.4 * GRID} height={4.4 * GRID} fill="transparent"/>
                {sel?.id === p.id && <rect x={(p.x - 2.4) * GRID} y={(p.y - 2.4) * GRID} width={4.8 * GRID} height={4.8 * GRID} rx={6} fill="rgba(251,191,36,.06)" stroke={C.accent} strokeDasharray="4 3"/>}
                <g dangerouslySetInnerHTML={{ __html: partSvg(p, '#e2e8f0', { glow: glow[p.id] }) }}/>
              </g>)}
              {/* Net voltages after a simulation. */}
              {sim && circuit.wires.map(w => { const net = nl.wireNet[w.id]; if (!net) return null; const [a, b] = [w.pts[0], w.pts[1] ?? w.pts[0]]; return <text key={`v${w.id}`} x={(a[0] + b[0]) / 2 * GRID + 3} y={(a[1] + b[1]) / 2 * GRID - 4} fontSize={9} fill={C.accent} fontWeight={700} style={{ pointerEvents: 'none' }}>{fmtV(netV(net))}</text>; })}
              {ghost && <g opacity={0.55} style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: partSvg(ghost, C.accent, { labels: false }) }}/>}
              {draft && <polyline points={[...draft, ...(hover ? (() => { const l = draft[draft.length - 1]; return l[0] !== hover[0] && l[1] !== hover[1] ? [[hover[0], l[1]] as Pt, hover] : [hover]; })() : [])].map(p => `${p[0] * GRID},${p[1] * GRID}`).join(' ')} fill="none" stroke={C.accent} strokeWidth={1.8} strokeDasharray="5 4" style={{ pointerEvents: 'none' }}/>}
              {tool.kind === 'wire' && hover && <circle cx={hover[0] * GRID} cy={hover[1] * GRID} r={isConnectionPoint(hover) ? 5 : 3} fill="none" stroke={isConnectionPoint(hover) ? '#4ade80' : C.accent} style={{ pointerEvents: 'none' }}/>}
            </g>
          </svg>
          {sim?.mode === 'tran' && <div className="absolute left-3 right-3 bottom-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(18,20,27,.92)', border: `1px solid ${C.line}` }}>
            <button className="elec-btn" onClick={() => { if (at >= sim.time.length - 1) setTIdx(0); setPlaying(p => !p); }} aria-label={playing ? 'Pause' : 'Play'} data-testid="elec-play">{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
            <input type="range" min={0} max={sim.time.length - 1} value={at} onChange={e => { setPlaying(false); setTIdx(+e.target.value); }} className="flex-1" aria-label="Time"/>
            <span className="text-[11px] tabular-nums w-20 text-right">{fmtT(sim.time[at] ?? 0)}</span>
          </div>}
          {(note || error || busy) && <div className="absolute left-3 top-3 max-w-md text-[11.5px] px-3 py-2 rounded-lg" style={{ background: 'rgba(18,20,27,.92)', border: `1px solid ${error ? '#f87171' : C.line}`, color: error ? '#fca5a5' : C.text }} onClick={() => { setNote(''); setError(''); }}>{busy || error || note}</div>}
          {!circuit.parts.length && <div className="absolute inset-0 grid place-items-center pointer-events-none text-[13px]" style={{ color: C.dim }}>Pick a part on the left, or open a starter circuit.</div>}
        </div>

        {/* Right: properties, checks, BOM, scope */}
        <aside className="w-80 shrink-0 border-l flex flex-col min-h-0" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex gap-1 p-2">
            {([['props', 'Part', SlidersHorizontal], ['checks', 'Checks', ShieldCheck], ['safety', 'Safety', ShieldAlert], ...(build ? [['build', 'Build', Package] as const] : []), ['bom', 'Parts', ListChecks], ['scope', 'Scope', Activity]] as const).map(([k, label, Icon]) => <button key={k} onClick={() => setRight(k)} className={`elec-tab${right === k ? ' elec-tab-on' : ''}`} data-testid={`elec-tab-${k}`}><Icon size={12}/>{label}{k === 'checks' && (counts.errors || counts.warnings) ? <span className="ml-1 px-1 rounded text-[9px]" style={{ background: counts.errors ? '#7f1d1d' : '#78350f' }}>{counts.errors || counts.warnings}</span> : null}</button>)}
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 text-[12px]">
            {right === 'props' && (selPart ? <PartProps part={selPart} sim={sim} at={at} onParam={(k, v) => setParam(selPart.id, k, v)}/> : selWire ? <div>
              <div className="font-bold mb-1">Wire</div><div style={{ color: C.dim }}>Net {nl.wireNet[selWire.id] === 0 ? 'GND' : nl.wireNet[selWire.id]} · connects {nl.members[nl.wireNet[selWire.id]]?.join(', ') || 'nothing yet'}</div>
              {sim && <div className="mt-2">Voltage: <b>{fmtV(netV(nl.wireNet[selWire.id]))}</b></div>}
            </div> : <div style={{ color: C.dim }}>Select a part to edit its values. Click a wire after simulating to add it to the scope.</div>)}

            {right === 'checks' && <div data-testid="elec-checks">
              <div className="flex items-center gap-2 mb-2">
                <select value={market} onChange={e => setMarket(e.target.value as typeof market)} className="h-7 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label="Market" data-testid="elec-market">
                  <option value="both" style={{ background: C.panel }}>US + EU</option><option value="US" style={{ background: C.panel }}>United States</option><option value="EU" style={{ background: C.panel }}>European Union</option>
                </select>
                <label className="flex items-center gap-1 text-[11px]" style={{ color: C.dim }}><input type="checkbox" checked={toy} onChange={e => setToy(e.target.checked)}/>Children's toy</label>
              </div>
              <div className="flex gap-3 mb-2 text-[11px]"><span style={{ color: LEVEL_COLOR.error }}>{counts.errors} problems</span><span style={{ color: LEVEL_COLOR.warn }}>{counts.warnings} warnings</span><span style={{ color: LEVEL_COLOR.pass }}>{counts.passes} passed</span></div>
              {!sim && <button className="elec-btn elec-primary w-full justify-center mb-2" onClick={() => run()}><Play size={13}/>Simulate to check ratings</button>}
              {findings.map(f => <div key={f.id} className="p-2 rounded-lg mb-1.5" style={{ background: 'rgba(255,255,255,.03)', borderLeft: `3px solid ${LEVEL_COLOR[f.level]}` }} data-testid={`elec-finding-${f.id}`}>
                <div className="flex items-start gap-1.5"><span className="text-[9px] font-extrabold uppercase mt-0.5" style={{ color: LEVEL_COLOR[f.level] }}>{f.area}</span>{f.market && <span className="text-[9px] px-1 rounded bg-white/10">{f.market}</span>}</div>
                <div className="font-semibold text-[12px] mt-0.5">{f.title}</div>
                <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,.65)' }}>{f.detail}</div>
                {f.cite && <div className="text-[10px] mt-1" style={{ color: C.accent }}>{f.cite}</div>}
                {f.refs?.length ? <div className="flex gap-1 mt-1">{f.refs.map(r => <button key={r} className="text-[10px] px-1.5 rounded bg-white/10" onClick={() => { const p = circuit.parts.find(x => x.ref === r); if (p) { setSel({ type: 'part', id: p.id }); } }}>{r}</button>)}</div> : null}
              </div>)}
              <div className="text-[10px] mt-2 leading-snug" style={{ color: C.dim }}>Pre-checks to design with compliance in mind, in our own words with the regulation cited so you can read the source. They are not a certification or legal advice; a test lab confirms compliance.</div>
            </div>}

            {right === 'bom' && <div data-testid="elec-bom">
              <table className="w-full text-[11px]"><tbody>{bomRows.map((r, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.line}`, color: i ? C.text : C.dim, fontWeight: i ? 400 : 700 }}>{r.map((v, j) => <td key={j} className="py-1 pr-2 align-top">{v}</td>)}</tr>)}</tbody></table>
              <div className="flex gap-2 mt-3">
                <button className="elec-btn" onClick={() => download(`${circuit.name} parts.csv`, bomRows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv')}><Download size={13}/>CSV</button>
                {onSendTable && <button className="elec-btn" onClick={() => void onSendTable(`${circuit.name} — parts list`, bomRows).then(() => setNote('Parts list added to your document as a table.'))} data-testid="elec-bom-send"><FilePlus size={13}/>To document</button>}
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mt-4 mb-1" style={{ color: C.dim }}>Where to buy</div>
              <SourcingPanel circuit={circuit} apiBase={apiBase}/>
            </div>}

            {right === 'safety' && <SafetyPanel hazards={hazards} advisories={advisories} queries={queries} acked={acks} onAck={(id, v) => { setAcks(a => v ? [...new Set([...a, id])] : a.filter(x => x !== id)); if (v) setError(e => e.startsWith('Acknowledge') ? '' : e); }} apiBase={apiBase} title={`Safety review${build ? `: ${build.title}` : ''}`}/>}
            {right === 'build' && build && <BuildPanel build={build} guard={guard}/>}
            {right === 'scope' && (sim ? <Scope sim={sim} probes={probes} at={at} onRemove={n => setProbes(p => p.filter(x => x !== n))} members={nl.members}/> : <div style={{ color: C.dim }}>Simulate over time to see voltages trace. Click any wire to probe it.</div>)}
          </div>
        </aside>
      </div>
      <style>{`.elec-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,.8);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);flex-shrink:0}.elec-btn:hover{background:rgba(255,255,255,.1);color:#fff}.elec-btn:disabled{opacity:.4}.elec-primary{background:linear-gradient(135deg,#f59e0b,#ef4444);border-color:transparent;color:#fff}.elec-on{background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.45);color:#fbbf24}.elec-tab{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border-radius:7px;font-size:11px;font-weight:700;color:rgba(255,255,255,.55)}.elec-tab-on{background:rgba(255,255,255,.08);color:#fff}.elec-bar{scrollbar-width:none}@media (max-width:899px){.elec-label,.elec-title{display:none}}`}</style>
      {exchange && <ExchangeRoom onClose={() => setExchange(false)} getToken={getToken} apiBase={apiBase} initialCategory="components" prefill={build ? { title: `Build: ${build.title}`, details: build.summary, processes: ['electronics'], hazards: hazards.filter(h => h.severity === 'critical' || h.severity === 'high').map(h => h.title) } : undefined}/>}
      {!terms && <BuildTermsGate onAccepted={() => setTerms(true)} getToken={getToken} apiBase={apiBase} onClose={onClose}/>}
    </div>,
    document.body,
  );
}

const PROBE_COLORS = ['#fbbf24', '#f472b6', '#4ade80', '#a78bfa'];
const probeColor = (i: number) => PROBE_COLORS[i % PROBE_COLORS.length];

function onSeg(p: Pt, a: Pt, b: Pt) { return (a[1] === b[1] && p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])) || (a[0] === b[0] && p[0] === a[0] && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])); }
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) { if (out.length && eq(out[out.length - 1], p)) continue; if (out.length >= 2) { const a = out[out.length - 2], b = out[out.length - 1]; if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) out.pop(); } out.push(p); }
  return out;
}

function PartProps({ part, sim, at, onParam }: { part: CPart; sim: SimResult | null; at: number; onParam: (k: string, v: string | number) => void }) {
  const def = compByKind(part.kind)!; const tr = sim?.parts[part.id];
  return <div data-testid="elec-props">
    <div className="font-bold text-[13px]">{def.name}</div>
    <div className="text-[11px] mb-2" style={{ color: C.dim }}>{def.about}</div>
    {part.kind !== 'ground' && <label className="flex items-center justify-between py-1"><span style={{ color: C.dim }}>Reference</span><input value={part.ref} onChange={e => onParam('__ref', e.target.value)} className="w-24 h-7 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white text-right"/></label>}
    {def.params.map(p => <label key={p.key} className="flex items-center justify-between py-1 gap-2"><span style={{ color: C.dim }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>
      {p.kind === 'choice'
        ? <select value={String(part.params[p.key] ?? p.default)} onChange={e => onParam(p.key, e.target.value)} className="h-7 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label={p.label}>{p.choices!.map(c => <option key={c} value={c} style={{ background: C.panel }}>{c}</option>)}</select>
        : <input defaultValue={String(part.params[p.key] ?? p.default)} key={`${part.id}-${p.key}-${part.params[p.key]}`} onBlur={e => { const v = e.target.value.trim(); if (v && Number.isFinite(parseSi(v))) onParam(p.key, v); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-24 h-7 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white text-right" aria-label={p.label} data-testid={`elec-param-${p.key}`}/>}
    </label>)}
    {tr && <div className="mt-3 p-2 rounded-lg text-[11px]" style={{ background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)' }}>
      <div>Current: <b>{(Math.abs(tr.i[at] ?? 0) * 1000).toFixed(2)} mA</b></div>
      <div>Power: <b>{(Math.abs(tr.p[at] ?? 0) * 1000).toFixed(1)} mW</b></div>
      {Object.entries(tr.extra).map(([k, v]) => <div key={k}>{({ v: 'Voltage', vr: 'Reverse voltage', vce: 'Vce', vds: 'Vds', ib: 'Base current', vin: 'Input', vout: 'Output', q: 'Output state' } as Record<string, string>)[k] ?? k}: <b>{k === 'q' ? (v[at] ? 'high' : 'low') : k === 'ib' ? `${((v[at] ?? 0) * 1000).toFixed(3)} mA` : `${(v[at] ?? 0).toFixed(2)} V`}</b></div>)}
    </div>}
  </div>;
}

function Scope({ sim, probes, at, onRemove, members }: { sim: SimResult; probes: number[]; at: number; onRemove: (n: number) => void; members: string[][] }) {
  const W = 290, H = 170; const t = sim.time; const tEnd = t[t.length - 1] || 1;
  const series = probes.map(n => sim.nets[n] ?? []);
  const all = series.flat(); const lo = Math.min(0, ...all), hi = Math.max(0.1, ...all);
  const xOf = (ti: number) => (t[ti] / tEnd) * W, yOf = (v: number) => H - ((v - lo) / (hi - lo)) * (H - 10) - 5;
  const stride = Math.max(1, Math.floor(t.length / 600));
  return <div data-testid="elec-scope">
    <svg width={W} height={H} className="rounded-lg" style={{ background: '#07080b', border: `1px solid ${C.line}` }}>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.06)"/>)}
      {series.map((s, k) => <polyline key={probes[k]} fill="none" stroke={probeColor(k)} strokeWidth={1.4} points={s.filter((_, i) => i % stride === 0 || i === s.length - 1).map((v, j) => `${xOf(Math.min(t.length - 1, j * stride)).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')}/>)}
      {sim.mode === 'tran' && <line x1={xOf(at)} x2={xOf(at)} y1={0} y2={H} stroke="rgba(255,255,255,.4)" strokeDasharray="3 3"/>}
      <text x={4} y={12} fontSize={9} fill={C.dim}>{hi.toFixed(1)} V</text><text x={4} y={H - 4} fontSize={9} fill={C.dim}>{lo.toFixed(1)} V</text><text x={W - 4} y={H - 4} fontSize={9} fill={C.dim} textAnchor="end">{fmtT(tEnd)}</text>
    </svg>
    {probes.map((n, k) => <div key={n} className="flex items-center gap-2 mt-1.5 text-[11px]"><span className="w-3 h-0.5" style={{ background: probeColor(k) }}/><span className="flex-1 truncate">{members[n]?.slice(0, 3).join(' · ') || `Net ${n}`}</span><b className="tabular-nums">{fmtV(sim.nets[n]?.[at] ?? 0)}</b><button onClick={() => onRemove(n)} aria-label="Remove probe" className="opacity-60 hover:opacity-100"><X size={11}/></button></div>)}
    {Object.entries(sim.freq).map(([id, f]) => <div key={id} className="mt-2 text-[11px]" style={{ color: C.accent }}>Timer runs at {f >= 1000 ? `${(f / 1000).toFixed(3)} kHz` : `${f.toFixed(3)} Hz`}</div>)}
    <div className="text-[10px] mt-2" style={{ color: C.dim }}>Click any wire on the sheet to probe it (up to four).</div>
  </div>;
}

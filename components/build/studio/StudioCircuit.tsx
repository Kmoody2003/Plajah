// Build Studio circuits: a breadboard you wire by clicking, a microcontroller board, and blocks
// that run in the browser against our circuit simulator. LEDs glow with the current the solver
// finds, buttons and knobs work while it runs, and the serial monitor shows what the program prints.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, RotateCcw, RotateCw, Trash2, Volume2, VolumeX, Cable, MousePointer2, Gauge } from 'lucide-react';
import { BOARDS, PARTS, ROWS, COLS, LED_COLORS, holeKey, parseHole, isHole, legHoles, fits, nextPartRef, pinKey, isPinKey, evaluate, holeName, stripOf, type CircuitProject, type SPart, type SWire, type PartKind, type BoardKind, type Readout } from '../../../services/build/studio/breadboard';
import type { Program } from '../../../services/build/studio/blocks';
import { Runtime } from '../../../services/build/studio/runtime';
import BlockEditor from './BlockEditor';

const S = 18, BX = 250, BY = 64;
const hx = (col: number) => BX + 22 + (col - 1) * S, hy = (y: number) => BY + 22 + y * S;
const BB_W = 44 + (COLS - 1) * S, BB_H = 44 + 16 * S;
const VIEW_W = BX + BB_W + 24, VIEW_H = BY + BB_H + 34;
const LED_HEX: Record<string, string> = { red: '#ff3b3b', yellow: '#ffd43b', green: '#40c057', blue: '#4dabf7', white: '#f1f3f5' };
const WIRE_COLORS = ['#2b8a3e', '#e03131', '#212529', '#1971c2', '#f08c00', '#ae3ec9', '#0c8599', '#f8f9fa'];
const PALETTE: PartKind[] = ['led', 'resistor', 'button', 'pot', 'buzzer', 'ldr', 'servo', 'ultrasonic', 'battery'];
const RES_VALUES = [100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000];
const BAND = ['#000', '#7f4f24', '#e03131', '#f76707', '#fab005', '#2f9e44', '#1c7ed6', '#7048e8', '#868e96', '#fff'];
const ohms = (r: number) => (r >= 1e6 ? `${r / 1e6}M` : r >= 1000 ? `${r / 1000}k` : `${r}`) + 'Ω';
function bands(r: number) { const e = Math.max(0, Math.floor(Math.log10(Math.max(10, r))) - 1); const d = Math.round(r / 10 ** e); return [BAND[Math.floor(d / 10) % 10], BAND[d % 10], BAND[Math.min(9, e)]]; }

/** Where each board's header pads sit (one column down the board's right edge). */
function boardPads(kind: BoardKind) {
  const pins = BOARDS[kind].pins; const step = Math.min(15, (BB_H - 24) / pins.length);
  return pins.map((p, i) => ({ ...p, x: 214, y: BY + 14 + i * step + step / 2 }));
}
const endPos = (k: string, board: BoardKind | null): [number, number] | null => {
  if (isPinKey(k)) { if (!board) return null; const pad = boardPads(board).find(p => pinKey(p.id) === k); return pad ? [pad.x, pad.y] : null; }
  const h = parseHole(k); return h ? [hx(h[0]), hy(h[1])] : null;
};

type Tool = { t: 'select' } | { t: 'place'; kind: PartKind; rot: number } | { t: 'wire'; from: string | null };

export interface StudioCircuitProps {
  circuit: CircuitProject; program: Program; commitCircuit: (c: CircuitProject) => void; commitProgram: (p: Program) => void;
  lang: 'cpp' | 'py'; setLang: (l: 'cpp' | 'py') => void; title: string; onRun: (lit: string[]) => void; registerThumb: (fn: () => string | undefined) => void;
}

export default function StudioCircuit(p: StudioCircuitProps) {
  const { circuit } = p;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>({ t: 'select' });
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0]);
  const [sel, setSel] = useState<{ part?: string; wire?: string }>({});
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<{ id: string; dc: number; dy: number; col: number; y: number } | null>(null);
  const [running, setRunning] = useState(false); const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1); const [muted, setMuted] = useState(false);
  const [live, setLive] = useState<{ r: Readout; serial: string; hints: string[]; current: string | null; t: number } | null>(null);
  const rt = useRef<Runtime | null>(null); const pressed = useRef(new Set<string>()); const lit = useRef(new Set<string>());
  const board = circuit.board;
  const staticReadout = useMemo(() => { try { return evaluate(circuit, {}); } catch { return null; } }, [circuit]);
  const r = running && live ? live.r : staticReadout;

  useEffect(() => { p.registerThumb(() => { const svg = svgRef.current; if (!svg) return undefined; const xml = new XMLSerializer().serializeToString(svg); return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`; }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- running
  useEffect(() => { if (rt.current) { rt.current.project = circuit; rt.current.touch(); } }, [circuit]);
  const start = () => {
    rt.current = new Runtime(circuit, p.program, { pressed: pressed.current }); lit.current = new Set(); setRunning(true); setPaused(false);
  };
  const stop = () => { setRunning(false); setPaused(false); rt.current = null; setLive(null); p.onRun([...lit.current]); };
  useEffect(() => {
    // A timer, not animation frames: the program keeps its own time even when frames are throttled.
    if (!running) return; let last = performance.now(); let virt = rt.current?.vm.t ?? 0; let lastUi = 0;
    const tick = () => {
      const now = performance.now(); const R = rt.current; if (!R) return;
      if (!paused) { virt += Math.min(1000, now - last) * speed; R.step(virt); }
      last = now;
      if (now - lastUi > 33) {
        lastUi = now; const rd = R.readout(); let grew = false;
        for (const [id, l] of Object.entries(rd.leds)) if (l.glow > 0.2 && !lit.current.has(id)) { lit.current.add(id); grew = true; }
        if (grew) p.onRun([...lit.current]);
        setLive({ r: rd, serial: R.serial, hints: [...R.hints], current: R.vm.current, t: R.vm.t });
      }
    };
    const id = window.setInterval(tick, 16); return () => window.clearInterval(id);
  }, [running, paused, speed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (running) stop(); }, [p.program]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buzzers sound through Web Audio while they are driven.
  const audio = useRef<{ ctx: AudioContext; osc: Map<string, OscillatorNode> } | null>(null);
  useEffect(() => {
    const want = running && !muted && r ? Object.entries(r.buzzers).filter(([, b]) => b.on) : [];
    if (!want.length && !audio.current) return;
    if (!audio.current) { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (!AC) return; audio.current = { ctx: new AC(), osc: new Map() }; }
    const a = audio.current;
    for (const [id, b] of want) { let o = a.osc.get(id); if (!o) { o = a.ctx.createOscillator(); o.type = 'square'; const g = a.ctx.createGain(); g.gain.value = 0.035; o.connect(g).connect(a.ctx.destination); o.start(); a.osc.set(id, o); } o.frequency.setValueAtTime(b.freq || 2300, a.ctx.currentTime); }
    for (const [id, o] of a.osc) if (!want.some(([w]) => w === id)) { o.stop(); o.disconnect(); a.osc.delete(id); }
  }, [r, running, muted]);
  useEffect(() => () => { audio.current?.osc.forEach(o => o.stop()); void audio.current?.ctx.close(); }, []);

  // ---------------------------------------------------------------- editing
  const setCircuit = (c: CircuitProject) => p.commitCircuit(c);
  const toSvg = (e: { clientX: number; clientY: number }): [number, number] => { const svg = svgRef.current!; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM()!.inverse()); return [q.x, q.y]; };
  const nearestHole = (x: number, y: number): [number, number] | null => { const col = Math.round((x - BX - 22) / S) + 1; const yy = Math.round((y - BY - 22) / S); return isHole(col, yy) && Math.abs(hx(col) - x) < S * 0.6 && Math.abs(hy(yy) - y) < S * 0.6 ? [col, yy] : null; };
  const placeAt = (kind: PartKind, col: number, y: number, rot: number) => {
    const np: SPart = { id: `${kind}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, kind, ref: nextPartRef(circuit, kind), col, y, rot, params: { ...PARTS[kind].defaults } };
    if (!fits(np)) return false; setCircuit({ ...circuit, parts: [...circuit.parts, np] }); setSel({ part: np.id }); return true;
  };
  const clickEnd = (key: string) => {
    if (tool.t === 'place') { const h = parseHole(key); if (h) placeAt(tool.kind, h[0], h[1], tool.rot); return; }
    if (tool.t === 'wire' && tool.from) { if (tool.from !== key) { const w: SWire = { id: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, a: tool.from, b: key, color: wireColor }; setCircuit({ ...circuit, wires: [...circuit.wires, w] }); } setTool({ t: 'wire', from: null }); return; }
    setTool({ t: 'wire', from: key }); setSel({});
  };
  const delSel = () => { if (sel.part) setCircuit({ ...circuit, parts: circuit.parts.filter(x => x.id !== sel.part) }); if (sel.wire) setCircuit({ ...circuit, wires: circuit.wires.filter(x => x.id !== sel.wire) }); setSel({}); };
  const rotate = () => { if (tool.t === 'place') { setTool({ ...tool, rot: (tool.rot + 1) % 4 }); return; } const pt = circuit.parts.find(x => x.id === sel.part); if (!pt) return; for (let k = 1; k <= 3; k++) { const n = { ...pt, rot: (pt.rot + k) % 4 }; if (fits(n)) { setCircuit({ ...circuit, parts: circuit.parts.map(x => (x.id === pt.id ? n : x)) }); return; } } };
  const setParam = (id: string, key: string, v: number | string) => setCircuit({ ...circuit, parts: circuit.parts.map(x => (x.id === id ? { ...x, params: { ...x.params, [key]: v } } : x)) });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; const k = e.key.toLowerCase();
      if (k === 'escape') { setTool({ t: 'select' }); setSel({}); } else if ((k === 'delete' || k === 'backspace') && (sel.part || sel.wire)) { e.preventDefault(); delSel(); } else if (k === 'r') rotate(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = toSvg(e); setHover([x, y]);
    if (drag) { const h = nearestHole(x, y); if (h) setDrag({ ...drag, col: h[0] - drag.dc, y: h[1] - drag.dy }); }
  };
  const onUp = () => {
    if (!drag) return; const pt = circuit.parts.find(x => x.id === drag.id); setDrag(null); if (!pt) return; const n = { ...pt, col: drag.col, y: drag.y };
    if ((n.col !== pt.col || n.y !== pt.y) && fits(n)) setCircuit({ ...circuit, parts: circuit.parts.map(x => (x.id === pt.id ? n : x)) });
  };
  const ghost = tool.t === 'place' && hover ? (() => { const h = nearestHole(hover[0], hover[1]); return h ? { kind: tool.kind, col: h[0], y: h[1], rot: tool.rot } : null; })() : null;

  // ---------------------------------------------------------------- drawing
  const occupied = new Set(circuit.parts.flatMap(pt => legHoles(pt).map(h => holeKey(h.col, h.y))));
  const strips = new Set<string>(); if (sel.part) { const pt = circuit.parts.find(x => x.id === sel.part); if (pt) for (const h of legHoles(pt)) if (isHole(h.col, h.y)) strips.add(stripOf(h.col, h.y)); }
  const wirePath = (a: [number, number], b: [number, number]) => { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(40, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.18); return `M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}`; };

  function drawPart(pt: Pick<SPart, 'kind' | 'col' | 'y' | 'rot' | 'params'> & { id?: string; ref?: string }, isGhost = false) {
    const legs = legHoles(pt).map(h => [hx(h.col), hy(h.y)] as [number, number]); const ok = fits(pt);
    const xs = legs.map(l => l[0]), ys = legs.map(l => l[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ang = (Math.atan2(legs[legs.length - 1][1] - legs[0][1], legs[legs.length - 1][0] - legs[0][0]) * 180) / Math.PI;
    const rd = pt.id && r ? r : null; let body: React.ReactNode = null;
    switch (pt.kind) {
      case 'led': { const st = pt.id ? rd?.leds[pt.id] : undefined; const col = LED_HEX[String(pt.params.color)] ?? '#ff3b3b'; const glow = st?.glow ?? 0;
        body = <g>{glow > 0.02 && <circle cx={cx} cy={cy - 10} r={10 + glow * 14} fill={col} opacity={0.25 + glow * 0.45} filter="url(#bs-glow)"/>}
          <path d={`M${cx - 7} ${cy - 4} V${cy - 12} A7 7 0 0 1 ${cx + 7} ${cy - 12} V${cy - 4} Z`} fill={st?.burnt ? '#495057' : col} opacity={st?.burnt ? 1 : 0.5 + glow * 0.5} stroke="rgba(0,0,0,.35)"/>
          <rect x={cx - 8.5} y={cy - 5} width={17} height={3} rx={1} fill={st?.burnt ? '#343a40' : col} opacity={0.9}/>
          {st?.burnt && <path d={`M${cx - 5} ${cy - 15} l10 9 m0 -9 l-10 9`} stroke="#ffd43b" strokeWidth={1.6}/>}</g>; break; }
      case 'resistor': { const b = bands(Number(pt.params.R ?? 220)); body = <g transform={`rotate(${ang} ${cx} ${cy})`}><rect x={cx - 15} y={cy - 5} width={30} height={10} rx={4} fill="#d9b88f" stroke="#a07a4f"/>{b.map((c, i) => <rect key={i} x={cx - 9 + i * 6} y={cy - 5} width={3} height={10} fill={c}/>)}<rect x={cx + 8} y={cy - 5} width={2.5} height={10} fill="#c9a227"/></g>; break; }
      case 'button': { const on = pt.id ? pressed.current.has(pt.id) && running : false; body = <g><rect x={cx - 15} y={cy - 15} width={30} height={30} rx={3} fill="#343a40" stroke="#212529"/><circle cx={cx} cy={cy} r={on ? 8 : 9} fill={on ? '#c92a2a' : '#e03131'} stroke="#7a1414"/></g>; break; }
      case 'pot': { const pos = Number(pt.params.pos ?? 0.5); const a = (-135 + pos * 270) * Math.PI / 180; body = <g><circle cx={cx} cy={cy - 8} r={13} fill="#1c7ed6" stroke="#0b4f8a"/><circle cx={cx} cy={cy - 8} r={7} fill="#e9ecef"/><line x1={cx} y1={cy - 8} x2={cx + Math.sin(a) * 7} y2={cy - 8 - Math.cos(a) * 7} stroke="#212529" strokeWidth={2}/></g>; break; }
      case 'buzzer': { const on = pt.id ? rd?.buzzers[pt.id]?.on : false; body = <g><circle cx={cx} cy={cy} r={14} fill="#212529" stroke="#000"/><circle cx={cx} cy={cy} r={3} fill="#495057"/><text x={cx - 9} y={cy - 6} fontSize={7} fill="#adb5bd">+</text>{on && running && [18, 23].map(rr => <path key={rr} d={`M${cx + rr * 0.7} ${cy - rr * 0.7} A${rr} ${rr} 0 0 1 ${cx + rr * 0.7} ${cy + rr * 0.7}`} fill="none" stroke="#fab005" strokeWidth={1.5}/>)}</g>; break; }
      case 'ldr': { const light = Number(pt.params.light ?? 0.7); body = <g><circle cx={cx} cy={cy - 6} r={9} fill="#f1e3c8" stroke="#a07a4f"/><path d={`M${cx - 5} ${cy - 9} h3 v4 h3 v-4 h3 v4`} fill="none" stroke="#c92a2a" strokeWidth={1.1}/><circle cx={cx + 12} cy={cy - 16} r={3 + light * 3} fill="#ffd43b" opacity={0.3 + light * 0.7}/></g>; break; }
      case 'servo': { const st = pt.id ? rd?.servos[pt.id] : undefined; const a = ((st?.angle ?? 90) - 90) * Math.PI / 180; const by = cy - 46;
        body = <g><path d={legs.map(l => `M${l[0]} ${l[1]} L${l[0]} ${by + 16}`).join(' ')} stroke="#495057" strokeWidth={2}/><rect x={cx - 26} y={by - 12} width={52} height={28} rx={4} fill="#1864ab" stroke="#0b3d70"/><circle cx={cx - 10} cy={by + 2} r={7} fill="#e9ecef"/>
          <line x1={cx - 10} y1={by + 2} x2={cx - 10 + Math.cos(a - Math.PI / 2) * 18} y2={by + 2 + Math.sin(a - Math.PI / 2) * 18} stroke="#f8f9fa" strokeWidth={5} strokeLinecap="round"/><text x={cx + 12} y={by + 6} fontSize={9} fill="#d0ebff" textAnchor="middle">{st?.angle !== null && st?.angle !== undefined ? `${st.angle}°` : '—'}</text></g>; break; }
      case 'ultrasonic': { const by = cy - 34; body = <g><path d={legs.map(l => `M${l[0]} ${l[1]} L${l[0]} ${by + 14}`).join(' ')} stroke="#868e96" strokeWidth={1.5}/><rect x={cx - 38} y={by - 14} width={76} height={28} rx={3} fill="#1971c2" stroke="#0b3d70"/>{[-18, 18].map(dx => <g key={dx}><circle cx={cx + dx} cy={by} r={11} fill="#ced4da" stroke="#495057"/><circle cx={cx + dx} cy={by} r={7} fill="#343a40"/></g>)}<text x={cx} y={by + 25} fontSize={7} fill="#adb5bd" textAnchor="middle">VCC TRIG ECHO GND</text></g>; break; }
      case 'battery': { const bx = cx + 18; body = <g><path d={`M${legs[0][0]} ${legs[0][1]} C${legs[0][0] + 10} ${legs[0][1]} ${bx - 4} ${cy - 30} ${bx} ${cy - 30} M${legs[1][0]} ${legs[1][1]} C${legs[1][0] + 14} ${legs[1][1]} ${bx + 8} ${cy - 28} ${bx + 12} ${cy - 30}`} fill="none" stroke="#212529" strokeWidth={2}/><rect x={bx - 8} y={cy - 62} width={50} height={32} rx={4} fill="#2b2f36" stroke="#000"/><text x={bx + 17} y={cy - 42} fontSize={10} fill="#ffd43b" textAnchor="middle">{String(pt.params.V ?? 4.5)} V</text></g>; break; }
    }
    const selected = pt.id && sel.part === pt.id;
    return <g key={pt.id ?? 'ghost'} className={`bc-part${selected ? ' sel' : ''}`} opacity={isGhost ? (ok ? 0.65 : 0.3) : 1} style={{ cursor: isGhost ? 'copy' : running && (pt.kind === 'button') ? 'pointer' : 'grab' }}
      onPointerDown={isGhost || !pt.id ? undefined : e => {
        e.stopPropagation(); const id = pt.id!;
        if (running && pt.kind === 'button') { pressed.current.add(id); rt.current?.touch(); (e.target as Element).setPointerCapture?.(e.pointerId); return; }
        if (tool.t !== 'select') setTool({ t: 'select' }); setSel({ part: id }); const h = nearestHole(...toSvg(e)); if (h && !running) setDrag({ id, dc: h[0] - pt.col, dy: h[1] - pt.y, col: pt.col, y: pt.y });
      }}
      onPointerUp={isGhost || pt.kind !== 'button' || !pt.id ? undefined : () => { if (pressed.current.delete(pt.id!)) rt.current?.touch(); }}
      data-testid={pt.id ? `part-${pt.ref}` : undefined}>
      {legs.map((l, i) => <circle key={i} cx={l[0]} cy={l[1]} r={2.6} fill={ok ? '#adb5bd' : '#fa5252'} stroke="#495057" strokeWidth={0.8}/>)}
      {pt.kind === 'led' && <path d={`M${legs[0][0]} ${legs[0][1]} L${cx - 3} ${cy - 4} M${legs[1][0]} ${legs[1][1]} L${cx + 3} ${cy - 4}`} stroke="#adb5bd" strokeWidth={1.4}/>}
      {pt.kind === 'resistor' && <path d={`M${legs[0][0]} ${legs[0][1]} L${legs[1][0]} ${legs[1][1]}`} stroke="#adb5bd" strokeWidth={1.4}/>}
      {body}
      {pt.ref && !isGhost && <text x={cx} y={cy + (pt.kind === 'button' ? 25 : 16)} fontSize={8} textAnchor="middle" className="bc-ref">{pt.ref}</text>}
      {selected && <rect x={Math.min(...xs) - 10} y={Math.min(...ys) - (pt.kind === 'servo' ? 62 : pt.kind === 'ultrasonic' ? 50 : pt.kind === 'battery' ? 64 : 24)} width={Math.max(...xs) - Math.min(...xs) + 20} height={Math.max(...ys) - Math.min(...ys) + (pt.kind === 'servo' ? 72 : pt.kind === 'ultrasonic' ? 60 : pt.kind === 'battery' ? 74 : 34)} rx={6} fill="none" stroke="#ff8c00" strokeDasharray="4 3"/>}
    </g>;
  }

  const selPart = circuit.parts.find(x => x.id === sel.part); const selWire = circuit.wires.find(x => x.id === sel.wire);
  const pads = board ? boardPads(board) : [];
  const warnings = r?.warnings ?? []; const hints = running && live ? live.hints : [];
  const serialRef = useRef<HTMLPreElement>(null); useEffect(() => { const el = serialRef.current; if (el) el.scrollTop = el.scrollHeight; }, [live?.serial]);
  const hoverHole = hover && tool.t !== 'select' ? nearestHole(hover[0], hover[1]) : null;
  const wireFrom = tool.t === 'wire' && tool.from ? endPos(tool.from, board) : null;

  return <div className="bc">
    <aside className="bc-palette" aria-label="Parts">
      <div className="bs-h">Board</div>
      <select className="bc-board" value={board ?? ''} onChange={e => setCircuit({ ...circuit, board: (e.target.value || null) as BoardKind | null, wires: circuit.wires.filter(w => (!isPinKey(w.a) && !isPinKey(w.b)) || !!e.target.value) })} data-testid="board-select">
        <option value="uno">Arduino Uno</option><option value="nano">Arduino Nano</option><option value="pico">Raspberry Pi Pico</option><option value="">No board (battery only)</option></select>
      <div className="bs-h">Tools</div>
      <div className="bc-tools">
        <button className={tool.t === 'select' ? 'on' : ''} onClick={() => setTool({ t: 'select' })}><MousePointer2 size={14}/>Pick</button>
        <button className={tool.t === 'wire' ? 'on' : ''} onClick={() => setTool({ t: 'wire', from: null })} data-testid="tool-wire"><Cable size={14}/>Wire</button>
      </div>
      <div className="bc-wirecolors">{WIRE_COLORS.map(c => <button key={c} style={{ background: c }} className={wireColor === c ? 'on' : ''} onClick={() => { setWireColor(c); if (selWire) setCircuit({ ...circuit, wires: circuit.wires.map(w => (w.id === selWire.id ? { ...w, color: c } : w)) }); }} aria-label={`Wire colour ${c}`}/>)}</div>
      <div className="bs-h">Parts</div>
      <div className="bc-parts">{PALETTE.map(k => <button key={k} className={tool.t === 'place' && tool.kind === k ? 'on' : ''} onClick={() => setTool({ t: 'place', kind: k, rot: 0 })} title={PARTS[k].about} data-testid={`part-btn-${k}`}>{PARTS[k].name}</button>)}</div>
      <p className="bs-tip">{tool.t === 'place' ? 'Click a hole to place it. R turns it. Esc stops.' : tool.t === 'wire' ? (tool.from ? 'Now click where the wire ends.' : 'Click a board pin or a hole to start a wire.') : 'Drag parts to move them. Click a hole or pin to start a wire.'}</p>
    </aside>

    <div className="bc-main">
      <div className="bc-runbar">
        {!running ? <button className="bs-btn run" onClick={start} data-testid="run"><Play size={15}/>Run</button> : <button className="bs-btn stop" onClick={stop} data-testid="stop"><Square size={14}/>Stop</button>}
        {running && <button className="bs-btn" onClick={() => setPaused(x => !x)}>{paused ? 'Resume' : 'Pause'}</button>}
        {running && <button className="bs-btn" onClick={() => { stop(); setTimeout(start, 0); }} title="Restart"><RotateCcw size={14}/></button>}
        <label className="bc-speed" title="Simulation speed"><Gauge size={14}/><select value={speed} onChange={e => setSpeed(+e.target.value)}>{[0.25, 0.5, 1, 2, 4].map(s => <option key={s} value={s}>{s}×</option>)}</select></label>
        <button className="bs-btn" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}</button>
        {running && live && <span className="bc-clock">{(Math.max(0, live.t) / 1000).toFixed(1)} s</span>}
        {(selPart || selWire) && !running && <><i className="bs-sep"/>{selPart && <button className="bs-btn" onClick={rotate}><RotateCw size={14}/>Turn</button>}<button className="bs-btn" onClick={delSel}><Trash2 size={14}/>Delete</button></>}
      </div>
      <div className="bc-board-wrap">
        <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="bc-svg" onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} onPointerDown={() => { if (tool.t === 'select') setSel({}); }} data-testid="breadboard">
          <defs><filter id="bs-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="4"/></filter>
            <pattern id="bs-dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="rgba(255,255,255,.06)"/></pattern></defs>
          <rect width={VIEW_W} height={VIEW_H} fill="url(#bs-dots)"/>
          {/* board */}
          {board && <g data-testid="board">
            <rect x={24} y={BY} width={208} height={BB_H} rx={12} fill={board === 'pico' ? '#1b6b3a' : '#0f5e74'} stroke="rgba(255,255,255,.18)"/>
            <rect x={40} y={BY + 18} width={56} height={56} rx={4} fill="#1d1f24"/><text x={68} y={BY + 50} fontSize={9} fill="#868e96" textAnchor="middle">{board === 'pico' ? 'RP2040' : '328P'}</text>
            <rect x={14} y={BY + BB_H - 70} width={34} height={44} rx={3} fill="#adb5bd"/><text x={31} y={BY + BB_H - 44} fontSize={7} fill="#343a40" textAnchor="middle">USB</text>
            <text x={70} y={BY + BB_H / 2 + 30} fontSize={15} fontWeight={800} fill="rgba(255,255,255,.85)" transform={`rotate(-90 70 ${BY + BB_H / 2 + 30})`} textAnchor="middle">{BOARDS[board].name}</text>
            {pads.map(pd => { const v = r?.pinV[pd.id]; const hi = running && v !== null && v !== undefined && pd.kind === 'io' && v > BOARDS[board].logic / 2; return <g key={pd.id} className="bc-pad" onPointerDown={e => { e.stopPropagation(); clickEnd(pinKey(pd.id)); }} data-testid={`pin-${pd.id}`}>
              <text x={pd.x - 9} y={pd.y + 3} fontSize={8} textAnchor="end" fill={pd.kind === 'gnd' ? '#adb5bd' : pd.kind === 'power' ? '#ffa8a8' : '#e9ecef'}>{pd.label}</text>
              <rect x={pd.x - 5} y={pd.y - 5} width={10} height={10} rx={2} fill={hi ? '#ffd43b' : '#1d1f24'} stroke={tool.t === 'wire' ? '#ff8c00' : '#868e96'}/></g>; })}
          </g>}
          {/* breadboard */}
          <rect x={BX} y={BY} width={BB_W} height={BB_H} rx={10} fill="#f1f3f5" stroke="#ced4da"/>
          <rect x={BX + 8} y={hy(7) + 5} width={BB_W - 16} height={S * 2 - 10} rx={3} fill="#dee2e6"/>
          {[[0, '#1c7ed6'], [1, '#e03131'], [15, '#e03131'], [16, '#1c7ed6']].map(([y, c]) => <line key={y as number} x1={BX + 12} x2={BX + BB_W - 12} y1={hy(y as number) + ((y as number) === 0 || (y as number) === 15 ? -8 : 8)} y2={hy(y as number) + ((y as number) === 0 || (y as number) === 15 ? -8 : 8)} stroke={c as string} strokeWidth={1.5} opacity={0.7}/>)}
          {ROWS.filter(rw => rw.y >= 3 && rw.y <= 13).map(rw => <text key={rw.y} x={BX + 9} y={hy(rw.y) + 3} fontSize={7} fill="#868e96" textAnchor="middle">{rw.label}</text>)}
          {Array.from({ length: COLS }, (_, i) => i + 1).filter(c => c === 1 || c % 5 === 0).map(c => <text key={c} x={hx(c)} y={hy(2) + 3} fontSize={7} fill="#868e96" textAnchor="middle">{c}</text>)}
          {ROWS.map(rw => Array.from({ length: COLS }, (_, i) => i + 1).map(col => { const k = holeKey(col, rw.y); const inStrip = strips.has(stripOf(col, rw.y)); return <rect key={k} x={hx(col) - 3.2} y={hy(rw.y) - 3.2} width={6.4} height={6.4} rx={1.2} className="bc-hole" fill={occupied.has(k) ? '#495057' : inStrip ? '#ffc078' : '#343a40'} opacity={occupied.has(k) ? 0.9 : 0.75}
            onPointerDown={e => { e.stopPropagation(); clickEnd(k); }} data-testid={`hole-${col}-${rw.y}`}><title>{holeName(col, rw.y)}</title></rect>; }))}
          {hoverHole && <rect x={hx(hoverHole[0]) - 5} y={hy(hoverHole[1]) - 5} width={10} height={10} rx={2} fill="none" stroke="#ff8c00" strokeWidth={1.5} pointerEvents="none"/>}
          {/* wires */}
          {circuit.wires.map(w => { const a = endPos(w.a, board), b = endPos(w.b, board); if (!a || !b) return null; const on = sel.wire === w.id; return <g key={w.id} onPointerDown={e => { e.stopPropagation(); if (tool.t === 'select') setSel({ wire: w.id }); }} className="bc-wire">
            <path d={wirePath(a, b)} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={5} strokeLinecap="round"/><path d={wirePath(a, b)} fill="none" stroke={w.color} strokeWidth={on ? 4.5 : 3.2} strokeLinecap="round"/>
            {[a, b].map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r={3} fill={w.color} stroke="rgba(0,0,0,.4)"/>)}{on && <path d={wirePath(a, b)} fill="none" stroke="#ff8c00" strokeWidth={1} strokeDasharray="3 3"/>}</g>; })}
          {wireFrom && hover && <path d={wirePath(wireFrom, hover)} fill="none" stroke={wireColor} strokeWidth={3} strokeDasharray="5 4" pointerEvents="none" opacity={0.8}/>}
          {/* parts */}
          {circuit.parts.map(pt => drawPart(drag && drag.id === pt.id ? { ...pt, col: drag.col, y: drag.y } : pt))}
          {ghost && <g pointerEvents="none">{drawPart({ ...ghost, params: PARTS[ghost.kind].defaults }, true)}</g>}
        </svg>

        {selPart && <div className="bc-inspector" data-testid="part-inspector">
          <b>{selPart.ref} · {PARTS[selPart.kind].name}</b><p>{PARTS[selPart.kind].about}</p>{PARTS[selPart.kind].safety && <p className="bc-safe">{PARTS[selPart.kind].safety}</p>}
          {selPart.kind === 'led' && <div className="bc-colors">{LED_COLORS.map(c => <button key={c} style={{ background: LED_HEX[c] }} className={selPart.params.color === c ? 'on' : ''} onClick={() => setParam(selPart.id, 'color', c)} aria-label={c}/>)}</div>}
          {selPart.kind === 'resistor' && <label className="bs-field"><span>Value</span><select value={Number(selPart.params.R ?? 220)} onChange={e => setParam(selPart.id, 'R', +e.target.value)} data-testid="res-value">{RES_VALUES.map(v => <option key={v} value={v}>{ohms(v)}</option>)}</select></label>}
          {selPart.kind === 'pot' && <label className="bs-range"><span>Knob</span><input type="range" min={0} max={1} step={0.01} value={Number(selPart.params.pos ?? 0.5)} onChange={e => setParam(selPart.id, 'pos', +e.target.value)}/><b>{Math.round(Number(selPart.params.pos ?? 0.5) * 100)}%</b></label>}
          {selPart.kind === 'ldr' && <label className="bs-range"><span>Light</span><input type="range" min={0} max={1} step={0.01} value={Number(selPart.params.light ?? 0.7)} onChange={e => setParam(selPart.id, 'light', +e.target.value)} data-testid="ldr-light"/><b>{Number(selPart.params.light ?? 0.7) < 0.3 ? 'dark' : Number(selPart.params.light ?? 0.7) > 0.7 ? 'bright' : 'dim'}</b></label>}
          {selPart.kind === 'ultrasonic' && <label className="bs-range"><span>Object at</span><input type="range" min={2} max={200} step={1} value={Number(selPart.params.cm ?? 40)} onChange={e => setParam(selPart.id, 'cm', +e.target.value)}/><b>{String(selPart.params.cm ?? 40)} cm</b></label>}
          {selPart.kind === 'battery' && <label className="bs-field"><span>Pack</span><select value={Number(selPart.params.V ?? 4.5)} onChange={e => setParam(selPart.id, 'V', +e.target.value)}><option value={3}>2 × AA (3 V)</option><option value={4.5}>3 × AA (4.5 V)</option><option value={6}>4 × AA (6 V)</option><option value={9}>9 V battery</option></select></label>}
          {selPart.kind === 'led' && r?.leds[selPart.id] && <p className="bc-meter">{r.leds[selPart.id].mA.toFixed(1)} mA</p>}
          {selPart.kind === 'button' && <p className="bc-meter">Press it with the mouse while the program runs.</p>}
        </div>}
      </div>
      <div className="bc-bottom">
        <div className="bc-serial"><div className="bs-h">Serial monitor</div><pre ref={serialRef} data-testid="serial">{running && live ? live.serial || '…' : 'Press Run to start the program.'}</pre></div>
        <div className="bc-notes" data-testid="circuit-notes">{[...warnings.map(w => ({ w, k: 'warn' })), ...hints.map(w => ({ w, k: 'hint' }))].slice(0, 6).map(({ w, k }) => <div key={w} className={`bc-note ${k}`}>{w}</div>)}
          {!warnings.length && !hints.length && <div className="bc-note ok">{running ? 'Running. Click buttons on the breadboard to press them.' : 'No problems found in the wiring.'}</div>}</div>
      </div>
    </div>

    <aside className="bc-code"><BlockEditor program={p.program} onChange={p.commitProgram} board={board} current={running ? live?.current ?? null : null} lang={p.lang} setLang={p.setLang} title={p.title}/></aside>
  </div>;
}

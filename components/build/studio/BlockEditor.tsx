// Build Studio block editor: our own stacking blocks in plain words. Drag blocks from the shelf
// (or click to add), drag to reorder or nest, and switch to the Arduino C++ or MicroPython the
// blocks write.

import React, { useMemo, useState } from 'react';
import { Copy, Download, X, GripVertical, ChevronDown } from 'lucide-react';
import { sid, num, variables, codeFor, type Program, type Stmt, type StmtInput, type Expr, type StmtType } from '../../../services/build/studio/blocks';
import { ioPins, type BoardKind } from '../../../services/build/studio/breadboard';

type Slot = { root: 'setup' | 'loop' } | { parent: string; slot: 'then' | 'else' | 'body' };
const slotKey = (s: Slot) => ('root' in s ? s.root : `${s.parent}.${s.slot}`);

// ---------------------------------------------------------------- tree editing (pure)
function mapStmts(list: Stmt[], fn: (s: Stmt) => Stmt): Stmt[] {
  return list.map(s => { const x = fn(s); if (x.t === 'if') return { ...x, then: mapStmts(x.then, fn), else: x.else ? mapStmts(x.else, fn) : null }; if (x.t === 'repeat' || x.t === 'while') return { ...x, body: mapStmts(x.body, fn) }; return x; });
}
function editList(p: Program, slot: Slot, fn: (l: Stmt[]) => Stmt[]): Program {
  if ('root' in slot) return { ...p, [slot.root]: fn(p[slot.root]) };
  const f = (s: Stmt): Stmt => { if (s.id !== slot.parent) return s; if (s.t === 'if') return slot.slot === 'else' ? { ...s, else: fn(s.else ?? []) } : { ...s, then: fn(s.then) }; if (s.t === 'repeat' || s.t === 'while') return { ...s, body: fn(s.body) }; return s; };
  return { setup: mapStmts(p.setup, f), loop: mapStmts(p.loop, f) };
}
function findStmt(list: Stmt[], id: string): Stmt | null { for (const s of list) { if (s.id === id) return s; const kids = s.t === 'if' ? [...s.then, ...(s.else ?? [])] : s.t === 'repeat' || s.t === 'while' ? s.body : []; const f = findStmt(kids, id); if (f) return f; } return null; }
function removeStmt(p: Program, id: string): Program {
  const strip = (l: Stmt[]): Stmt[] => l.filter(s => s.id !== id).map(s => (s.t === 'if' ? { ...s, then: strip(s.then), else: s.else ? strip(s.else) : null } : s.t === 'repeat' || s.t === 'while' ? { ...s, body: strip(s.body) } : s));
  return { setup: strip(p.setup), loop: strip(p.loop) };
}
const containsId = (s: Stmt, id: string): boolean => !!findStmt([s], id);
const updateStmt = (p: Program, id: string, patch: (s: Stmt) => Stmt): Program => ({ setup: mapStmts(p.setup, s => (s.id === id ? patch(s) : s)), loop: mapStmts(p.loop, s => (s.id === id ? patch(s) : s)) });
const listIn = (p: Program, slot: Slot): Stmt[] => { if ('root' in slot) return p[slot.root]; const s = findStmt([...p.setup, ...p.loop], slot.parent); if (!s) return []; if (s.t === 'if') return slot.slot === 'else' ? s.else ?? [] : s.then; if (s.t === 'repeat' || s.t === 'while') return s.body; return []; };

// ---------------------------------------------------------------- the shelf
type Cat = 'Pins' | 'Time' | 'Sound' | 'Motion' | 'Control' | 'Variables' | 'Serial';
const CAT_COLOR: Record<Cat, string> = { Pins: '#f76707', Time: '#0b98b8', Sound: '#c2255c', Motion: '#6741d9', Control: '#d39e00', Variables: '#2b8a3e', Serial: '#495057' };
const CAT_OF: Record<StmtType, Cat> = { pinMode: 'Pins', digitalWrite: 'Pins', analogWrite: 'Pins', delay: 'Time', waitUntil: 'Time', tone: 'Sound', noTone: 'Sound', servo: 'Motion', if: 'Control', repeat: 'Control', while: 'Control', set: 'Variables', change: 'Variables', print: 'Serial', comment: 'Serial' };
const cmp = (a: Expr, op: '<' | '>' | '==' | '!=' | '<=' | '>=', b: Expr): Expr => ({ t: 'cmp', op, a, b });
function shelf(pin: string, apin: string): Array<{ key: string; label: string; make: () => Stmt }> {
  const S = (s: StmtInput) => () => ({ id: sid(), ...s } as Stmt);
  return [
    { key: 'pinMode', label: 'set pin to output', make: S({ t: 'pinMode', pin, mode: 'OUTPUT' }) },
    { key: 'on', label: 'turn pin on', make: S({ t: 'digitalWrite', pin, value: 'HIGH' }) },
    { key: 'off', label: 'turn pin off', make: S({ t: 'digitalWrite', pin, value: 'LOW' }) },
    { key: 'analogWrite', label: 'dim pin', make: S({ t: 'analogWrite', pin, value: num(128) }) },
    { key: 'delay', label: 'wait ms', make: S({ t: 'delay', ms: num(500) }) },
    { key: 'waitUntil', label: 'wait until', make: S({ t: 'waitUntil', cond: cmp({ t: 'digitalRead', pin: '2' }, '==', num(0)) }) },
    { key: 'tone', label: 'play a note', make: S({ t: 'tone', pin: '8', freq: num(440), ms: num(200) }) },
    { key: 'noTone', label: 'stop sound', make: S({ t: 'noTone', pin: '8' }) },
    { key: 'servo', label: 'turn servo to', make: S({ t: 'servo', pin: '9', angle: num(90) }) },
    { key: 'if', label: 'if … then', make: S({ t: 'if', cond: cmp({ t: 'analogRead', pin: apin }, '<', num(400)), then: [], else: null }) },
    { key: 'ifelse', label: 'if … else', make: S({ t: 'if', cond: cmp({ t: 'digitalRead', pin: '2' }, '==', num(0)), then: [], else: [] }) },
    { key: 'repeat', label: 'repeat times', make: S({ t: 'repeat', times: num(10), body: [] }) },
    { key: 'while', label: 'repeat while', make: S({ t: 'while', cond: cmp({ t: 'digitalRead', pin: '2' }, '==', num(1)), body: [] }) },
    { key: 'set', label: 'set variable', make: S({ t: 'set', name: 'count', value: num(0) }) },
    { key: 'change', label: 'change variable', make: S({ t: 'change', name: 'count', by: num(1) }) },
    { key: 'print', label: 'print', make: S({ t: 'print', value: { t: 'text', v: 'Hello!' }, line: true }) },
    { key: 'printv', label: 'print a reading', make: S({ t: 'print', value: { t: 'analogRead', pin: apin }, line: true }) },
    { key: 'comment', label: 'note', make: S({ t: 'comment', text: 'What this part does' }) },
  ];
}
const shelfCat = (key: string): Cat => (key === 'on' || key === 'off' ? 'Pins' : key === 'ifelse' ? 'Control' : key === 'printv' ? 'Serial' : CAT_OF[key as StmtType]);

// ---------------------------------------------------------------- expressions
type ExprKind = Expr['t'];
const EXPR_MENU: Array<[ExprKind, string]> = [['num', 'number'], ['var', 'variable'], ['analogRead', 'read analog pin'], ['digitalRead', 'read pin (0/1)'], ['distance', 'distance (cm)'], ['millis', 'time since start (ms)'], ['random', 'random number'], ['math', 'math (+ − × ÷)'], ['cmp', 'compare'], ['logic', 'and / or'], ['not', 'not'], ['map', 'map a range']];
interface Ctx { pins: Array<{ id: string; label: string; adc?: boolean }>; vars: string[] }
function defaultExpr(k: ExprKind, ctx: Ctx): Expr {
  const apin = ctx.pins.find(p => p.adc)?.id ?? 'A0', pin = ctx.pins[2]?.id ?? '2';
  switch (k) {
    case 'num': return num(0); case 'bool': return { t: 'bool', v: true }; case 'var': return { t: 'var', name: ctx.vars[0] ?? 'count' };
    case 'analogRead': return { t: 'analogRead', pin: apin }; case 'digitalRead': return { t: 'digitalRead', pin }; case 'millis': return { t: 'millis' };
    case 'distance': return { t: 'distance', trig: '7', echo: '6' }; case 'random': return { t: 'random', min: num(1), max: num(7) };
    case 'math': return { t: 'math', op: '+', a: num(1), b: num(1) }; case 'cmp': return cmp({ t: 'analogRead', pin: apin }, '<', num(400));
    case 'logic': return { t: 'logic', op: 'and', a: cmp(num(1), '<', num(2)), b: cmp(num(2), '<', num(3)) }; case 'not': return { t: 'not', a: cmp({ t: 'digitalRead', pin }, '==', num(1)) };
    case 'map': return { t: 'map', v: { t: 'analogRead', pin: apin }, inLo: 0, inHi: 1023, outLo: 0, outHi: 180 };
  }
}
function PinSel({ value, onChange, ctx, adc }: { value: string; onChange: (v: string) => void; ctx: Ctx; adc?: boolean }) {
  const list = adc ? ctx.pins.filter(p => p.adc) : ctx.pins; const known = list.some(p => p.id === value);
  return <select className="be-pin" value={value} onChange={e => onChange(e.target.value)} aria-label="Pin">{!known && <option value={value}>{value}</option>}{list.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>;
}
function NumIn({ value, onChange, w }: { value: number; onChange: (v: number) => void; w?: number }) { return <input className="be-num" type="number" value={value} style={{ width: w ?? Math.max(44, String(value).length * 8 + 26) }} onChange={e => { const v = parseFloat(e.target.value); onChange(Number.isFinite(v) ? v : 0); }}/>; }
function ExprEdit({ e, set, ctx }: { e: Expr; set: (e: Expr) => void; ctx: Ctx }) {
  const [menu, setMenu] = useState(false);
  let body: React.ReactNode;
  switch (e.t) {
    case 'num': body = <NumIn value={e.v} onChange={v => set({ t: 'num', v })}/>; break;
    case 'bool': body = <select className="be-pin" value={String(e.v)} onChange={x => set({ t: 'bool', v: x.target.value === 'true' })}><option value="true">true</option><option value="false">false</option></select>; break;
    case 'var': body = <VarIn value={e.name} onChange={name => set({ t: 'var', name })} ctx={ctx}/>; break;
    case 'analogRead': body = <>read <PinSel value={e.pin} onChange={pin => set({ ...e, pin })} ctx={ctx} adc/></>; break;
    case 'digitalRead': body = <>pin <PinSel value={e.pin} onChange={pin => set({ ...e, pin })} ctx={ctx}/></>; break;
    case 'millis': body = <>time (ms)</>; break;
    case 'distance': body = <>distance trig <PinSel value={e.trig} onChange={trig => set({ ...e, trig })} ctx={ctx}/> echo <PinSel value={e.echo} onChange={echo => set({ ...e, echo })} ctx={ctx}/></>; break;
    case 'random': body = <>random <ExprEdit e={e.min} set={min => set({ ...e, min })} ctx={ctx}/> to <ExprEdit e={e.max} set={max => set({ ...e, max })} ctx={ctx}/></>; break;
    case 'math': body = <><ExprEdit e={e.a} set={a => set({ ...e, a })} ctx={ctx}/><select className="be-op" value={e.op} onChange={x => set({ ...e, op: x.target.value as typeof e.op })}>{['+', '-', '*', '/', '%'].map(o => <option key={o} value={o}>{o === '*' ? '×' : o === '/' ? '÷' : o === '%' ? 'remainder' : o}</option>)}</select><ExprEdit e={e.b} set={b => set({ ...e, b })} ctx={ctx}/></>; break;
    case 'cmp': body = <><ExprEdit e={e.a} set={a => set({ ...e, a })} ctx={ctx}/><select className="be-op" value={e.op} onChange={x => set({ ...e, op: x.target.value as typeof e.op })}>{['<', '>', '==', '!=', '<=', '>='].map(o => <option key={o} value={o}>{o === '==' ? '=' : o === '!=' ? '≠' : o === '<=' ? '≤' : o === '>=' ? '≥' : o}</option>)}</select><ExprEdit e={e.b} set={b => set({ ...e, b })} ctx={ctx}/></>; break;
    case 'logic': body = <><ExprEdit e={e.a} set={a => set({ ...e, a })} ctx={ctx}/><select className="be-op" value={e.op} onChange={x => set({ ...e, op: x.target.value as 'and' | 'or' })}><option value="and">and</option><option value="or">or</option></select><ExprEdit e={e.b} set={b => set({ ...e, b })} ctx={ctx}/></>; break;
    case 'not': body = <>not <ExprEdit e={e.a} set={a => set({ ...e, a })} ctx={ctx}/></>; break;
    case 'map': body = <>map <ExprEdit e={e.v} set={v => set({ ...e, v })} ctx={ctx}/> from <NumIn value={e.inLo} onChange={inLo => set({ ...e, inLo })} w={46}/>–<NumIn value={e.inHi} onChange={inHi => set({ ...e, inHi })} w={56}/> to <NumIn value={e.outLo} onChange={outLo => set({ ...e, outLo })} w={46}/>–<NumIn value={e.outHi} onChange={outHi => set({ ...e, outHi })} w={56}/></>; break;
  }
  return <span className="be-expr">{body}<span className="be-swap"><button type="button" onClick={() => setMenu(m => !m)} aria-label="Change this value"><ChevronDown size={11}/></button>
    {menu && <span className="be-swap-menu" onMouseLeave={() => setMenu(false)}>{EXPR_MENU.map(([k, l]) => <button type="button" key={k} onClick={() => { set(defaultExpr(k, ctx)); setMenu(false); }}>{l}</button>)}</span>}</span></span>;
}
function VarIn({ value, onChange, ctx }: { value: string; onChange: (v: string) => void; ctx: Ctx }) {
  const id = useMemo(() => `vars-${Math.random().toString(36).slice(2)}`, []);
  return <><input className="be-var" value={value} list={id} onChange={e => onChange(e.target.value.replace(/[^A-Za-z0-9_ ]/g, '').slice(0, 20) || 'v')} style={{ width: Math.max(48, value.length * 8 + 18) }} aria-label="Variable name"/><datalist id={id}>{ctx.vars.map(v => <option key={v} value={v}/>)}</datalist></>;
}

// ---------------------------------------------------------------- editor
export interface BlockEditorProps { program: Program; onChange: (p: Program) => void; board: BoardKind | null; current: string | null; lang: 'cpp' | 'py'; setLang: (l: 'cpp' | 'py') => void; title: string }

export default function BlockEditor({ program, onChange, board, current, lang, setLang, title }: BlockEditorProps) {
  const [tab, setTab] = useState<'blocks' | 'code'>('blocks');
  const [target, setTarget] = useState<Slot>({ root: 'loop' });
  const [over, setOver] = useState<string | null>(null);
  const pins = board ? ioPins(board) : ioPins('uno'); const ctx: Ctx = { pins, vars: variables(program) };
  const defPin = board === 'pico' ? 'GP15' : '13', defA = board === 'pico' ? 'GP26' : 'A0';
  const items = shelf(defPin, defA);
  const code = useMemo(() => codeFor(program, board, lang, title), [program, board, lang, title]);

  const drop = (slot: Slot, index: number, data: DataTransfer) => {
    const nk = data.getData('text/plajah-new'); const mv = data.getData('text/plajah-block'); setOver(null);
    if (nk) { const it = items.find(i => i.key === nk); if (it) onChange(editList(program, slot, l => [...l.slice(0, index), it.make(), ...l.slice(index)])); return; }
    if (!mv) return; const s = findStmt([...program.setup, ...program.loop], mv); if (!s) return;
    if ('parent' in slot && containsId(s, slot.parent)) return; // cannot drop a block inside itself
    const from = listIn(program, slot); const oldIdx = from.findIndex(x => x.id === mv); const idx = oldIdx >= 0 && oldIdx < index ? index - 1 : index;
    onChange(editList(removeStmt(program, mv), slot, l => [...l.slice(0, idx), s, ...l.slice(idx)]));
  };
  const addFromShelf = (key: string) => { const it = items.find(i => i.key === key); if (!it) return; onChange(editList(program, target, l => [...l, it.make()])); };
  const set = (id: string, patch: (s: Stmt) => Stmt) => onChange(updateStmt(program, id, patch));

  const zone = (slot: Slot, index: number) => { const k = `${slotKey(slot)}:${index}`; return <div key={`z${k}`} className={`be-zone${over === k ? ' on' : ''}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (over !== k) setOver(k); }} onDragLeave={() => setOver(o => (o === k ? null : o))} onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(slot, index, e.dataTransfer); }}/>; };
  const list = (slot: Slot, items: Stmt[], empty?: string) => <div className={`be-list${slotKey(target) === slotKey(slot) ? ' target' : ''}`} onClick={e => { e.stopPropagation(); setTarget(slot); }}>
    {zone(slot, 0)}
    {items.map((s, i) => <React.Fragment key={s.id}>{block(s)}{zone(slot, i + 1)}</React.Fragment>)}
    {!items.length && <div className="be-empty">{empty ?? 'drop blocks here'}</div>}
  </div>;

  function block(s: Stmt) {
    const c = CAT_COLOR[CAT_OF[s.t]]; let row: React.ReactNode; let inner: React.ReactNode = null;
    switch (s.t) {
      case 'pinMode': row = <>set pin <PinSel value={s.pin} onChange={pin => set(s.id, x => ({ ...x, pin }) as Stmt)} ctx={ctx}/> to <select className="be-pin" value={s.mode} onChange={e => set(s.id, x => ({ ...x, mode: e.target.value }) as Stmt)}><option value="OUTPUT">output</option><option value="INPUT">input</option><option value="INPUT_PULLUP">input with pull-up</option></select></>; break;
      case 'digitalWrite': row = <>turn pin <PinSel value={s.pin} onChange={pin => set(s.id, x => ({ ...x, pin }) as Stmt)} ctx={ctx}/><select className="be-pin" value={s.value} onChange={e => set(s.id, x => ({ ...x, value: e.target.value }) as Stmt)}><option value="HIGH">on</option><option value="LOW">off</option></select></>; break;
      case 'analogWrite': row = <>dim pin <PinSel value={s.pin} onChange={pin => set(s.id, x => ({ ...x, pin }) as Stmt)} ctx={ctx}/> to <ExprEdit e={s.value} set={value => set(s.id, x => ({ ...x, value }) as Stmt)} ctx={ctx}/><small>of 255</small></>; break;
      case 'delay': row = <>wait <ExprEdit e={s.ms} set={ms => set(s.id, x => ({ ...x, ms }) as Stmt)} ctx={ctx}/> ms</>; break;
      case 'waitUntil': row = <>wait until <ExprEdit e={s.cond} set={cond => set(s.id, x => ({ ...x, cond }) as Stmt)} ctx={ctx}/></>; break;
      case 'tone': row = <>play <ExprEdit e={s.freq} set={freq => set(s.id, x => ({ ...x, freq }) as Stmt)} ctx={ctx}/> Hz on pin <PinSel value={s.pin} onChange={pin => set(s.id, x => ({ ...x, pin }) as Stmt)} ctx={ctx}/>{s.ms ? <> for <ExprEdit e={s.ms} set={ms => set(s.id, x => ({ ...x, ms }) as Stmt)} ctx={ctx}/> ms <button className="be-mini" onClick={() => set(s.id, x => ({ ...x, ms: null }) as Stmt)}>until stopped</button></> : <button className="be-mini" onClick={() => set(s.id, x => ({ ...x, ms: num(200) }) as Stmt)}>for a time</button>}</>; break;
      case 'noTone': row = <>stop sound on pin <PinSel value={s.pin} onChange={pin => set(s.id, x => ({ ...x, pin }) as Stmt)} ctx={ctx}/></>; break;
      case 'servo': row = <>turn servo on pin <PinSel value={s.pin} onChange={pin => set(s.id, x => ({ ...x, pin }) as Stmt)} ctx={ctx}/> to <ExprEdit e={s.angle} set={angle => set(s.id, x => ({ ...x, angle }) as Stmt)} ctx={ctx}/>°</>; break;
      case 'print': row = <>print {s.value.t === 'text' ? <input className="be-text" value={s.value.v} onChange={e => set(s.id, x => ({ ...x, value: { t: 'text', v: e.target.value.slice(0, 80) } }) as Stmt)}/> : <ExprEdit e={s.value as Expr} set={value => set(s.id, x => ({ ...x, value }) as Stmt)} ctx={ctx}/>}
        <button className="be-mini" onClick={() => set(s.id, x => ({ ...x, value: s.value.t === 'text' ? num(0) : { t: 'text', v: 'Hello!' } }) as Stmt)}>{s.value.t === 'text' ? 'a value' : 'words'}</button>
        <label className="be-check"><input type="checkbox" checked={s.line} onChange={e => set(s.id, x => ({ ...x, line: e.target.checked }) as Stmt)}/>new line</label></>; break;
      case 'set': row = <>set <VarIn value={s.name} onChange={name => set(s.id, x => ({ ...x, name }) as Stmt)} ctx={ctx}/> to <ExprEdit e={s.value} set={value => set(s.id, x => ({ ...x, value }) as Stmt)} ctx={ctx}/></>; break;
      case 'change': row = <>change <VarIn value={s.name} onChange={name => set(s.id, x => ({ ...x, name }) as Stmt)} ctx={ctx}/> by <ExprEdit e={s.by} set={by => set(s.id, x => ({ ...x, by }) as Stmt)} ctx={ctx}/></>; break;
      case 'comment': row = <>note <input className="be-text" value={s.text} onChange={e => set(s.id, x => ({ ...x, text: e.target.value.slice(0, 120) }) as Stmt)}/></>; break;
      case 'if': row = <>if <ExprEdit e={s.cond} set={cond => set(s.id, x => ({ ...x, cond }) as Stmt)} ctx={ctx}/> then</>;
        inner = <>{list({ parent: s.id, slot: 'then' }, s.then)}{s.else ? <><div className="be-else">else <button className="be-mini" onClick={() => set(s.id, x => ({ ...x, else: null }) as Stmt)}>remove</button></div>{list({ parent: s.id, slot: 'else' }, s.else)}</> : <button className="be-mini be-addelse" onClick={() => set(s.id, x => ({ ...x, else: [] }) as Stmt)}>+ else</button>}</>; break;
      case 'repeat': row = <>repeat <ExprEdit e={s.times} set={times => set(s.id, x => ({ ...x, times }) as Stmt)} ctx={ctx}/> times</>; inner = list({ parent: s.id, slot: 'body' }, s.body); break;
      case 'while': row = <>repeat while <ExprEdit e={s.cond} set={cond => set(s.id, x => ({ ...x, cond }) as Stmt)} ctx={ctx}/></>; inner = list({ parent: s.id, slot: 'body' }, s.body); break;
    }
    return <div className={`be-block${current === s.id ? ' running' : ''}${inner ? ' c' : ''}`} style={{ ['--bc' as any]: c }} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plajah-block', s.id); e.dataTransfer.effectAllowed = 'move'; }} data-testid={`block-${s.t}`}>
      <div className="be-row"><GripVertical size={13} className="be-grip"/>{row}<button className="be-del" onClick={() => onChange(removeStmt(program, s.id))} aria-label="Delete block"><X size={12}/></button></div>
      {inner && <div className="be-inner">{inner}</div>}
    </div>;
  }

  const ext = lang === 'py' ? 'py' : 'ino';
  return <div className="be" data-testid="block-editor">
    <div className="be-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'blocks'} className={tab === 'blocks' ? 'on' : ''} onClick={() => setTab('blocks')} data-testid="tab-blocks">Blocks</button>
      <button role="tab" aria-selected={tab === 'code' && lang === 'cpp'} className={tab === 'code' && lang === 'cpp' ? 'on' : ''} onClick={() => { setTab('code'); setLang('cpp'); }} data-testid="tab-cpp">Arduino C++</button>
      <button role="tab" aria-selected={tab === 'code' && lang === 'py'} className={tab === 'code' && lang === 'py' ? 'on' : ''} onClick={() => { setTab('code'); setLang('py'); }} data-testid="tab-py">MicroPython</button>
    </div>
    {tab === 'blocks' ? <div className="be-body">
      <div className="be-shelf" aria-label="Blocks shelf">{(Object.keys(CAT_COLOR) as Cat[]).map(cat => <div key={cat} className="be-cat"><div className="be-cat-h" style={{ color: CAT_COLOR[cat] }}>{cat}</div>
        {items.filter(i => shelfCat(i.key) === cat).map(i => <button key={i.key} className="be-chip" style={{ ['--bc' as any]: CAT_COLOR[cat] }} draggable onDragStart={e => { e.dataTransfer.setData('text/plajah-new', i.key); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => addFromShelf(i.key)} data-testid={`shelf-${i.key}`}>{i.label}</button>)}</div>)}</div>
      <div className="be-script" onClick={() => setTarget({ root: 'loop' })}>
        <div className="be-hat setup">when it starts</div>{list({ root: 'setup' }, program.setup, 'set up pins here (runs once)')}
        <div className="be-hat loop">forever</div>{list({ root: 'loop' }, program.loop, 'drag blocks here (repeats forever)')}
        <p className="be-tip">Click a shelf block to add it to the highlighted list, or drag it where you want it.</p>
      </div>
    </div> : <div className="be-code">
      <div className="be-code-bar"><span>{lang === 'py' ? (board === 'pico' ? 'MicroPython for the Pico' : 'MicroPython (runs on a Raspberry Pi Pico, not an Uno)') : `Arduino C++ for the ${board === 'pico' ? 'Pico (Arduino core)' : board === 'nano' ? 'Nano' : 'Uno'}`}</span>
        <button onClick={() => void navigator.clipboard?.writeText(code)}><Copy size={13}/>Copy</button>
        <button onClick={() => { const u = URL.createObjectURL(new Blob([code], { type: 'text/plain' })); const a = document.createElement('a'); a.href = u; a.download = `${(title || 'sketch').replace(/[^\w-]+/g, '_')}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }}><Download size={13}/>.{ext}</button></div>
      <pre data-testid="code-view">{code}</pre>
    </div>}
  </div>;
}

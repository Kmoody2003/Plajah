// Build guide: walks someone from an idea to a set of house drawings, one step at a time. Simple
// explains each step in plain words; Pro uses the trade's terms, code sections and shortcuts. The
// drafting tools stay fully available the whole time: the guide only points at them.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, Lightbulb, HelpCircle, XCircle, AlertTriangle, Wrench } from 'lucide-react';
import type { CadModel } from '../../../services/cad/model';
import type { Room } from '../../../services/cad/rooms';
import type { Finding } from '../../../services/cad/codeCheck';
import { RULES as ADA_RULES, DISCLAIMER as ADA_DISCLAIMER } from '../../../services/cad/codeCheck';
import { STEPS, evaluate, currentStep, type Level, type GuideAction, type StepId } from '../../../services/cad/guide/journey';
import { PROGRAMS, ROOM_KINDS, programRooms, type Program } from '../../../services/cad/guide/programs';
import { HOME_RULES, HOME_DISCLAIMER } from '../../../services/cad/guide/homeChecks';
import { buildableArea, type LotSpec } from '../../../services/cad/guide/starters';

const C = { line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.86)', dim: 'rgba(255,255,255,.55)', accent: '#7dd3fc', ok: '#6ee7b7', bad: '#fca5a5', warn: '#fcd34d', card: 'rgba(255,255,255,.04)' };

export interface GuidePanelProps {
  model: CadModel; rooms: Room[];
  /** Findings the guide judges by: home checks, plus accessibility checks when the home is to be accessible. */
  findings: Finding[];
  level: Level; onLevel: (l: Level) => void;
  program: Program | null; onProgram: (p: Program) => void;
  accessible: boolean; onAccessible: (on: boolean) => void;
  seen3d: boolean; ack: boolean; onAck: () => void;
  imperial: boolean;
  onLot: (s: LotSpec) => void; onShell: (width: number, depth: number) => void;
  onTool: (tool: 'wall' | 'roomtag' | 'dimension' | 'select' | 'measure') => void;
  onPlace: (itemId: string) => void; onView3d: () => void; onPickFinding: (f: Finding) => void;
  placingLabel?: string | null;
}

export default function GuidePanel(p: GuidePanelProps) {
  const { level } = p; const simple = level === 'simple';
  const states = useMemo(() => evaluate(p.model, p.rooms, p.findings, { program: p.program, seen3d: p.seen3d, ack: p.ack }, level), [p.model, p.rooms, p.findings, p.program, p.seen3d, p.ack, level]);
  const current = currentStep(states);
  const [viewing, setViewing] = useState<StepId>(current);
  const [cheer, setCheer] = useState('');
  // Follow along: when the step being looked at gets done, cheer and move on to the next open step.
  const viewedDone = states.find(s => s.id === viewing)?.done ?? false;
  const prev = useRef({ viewing, done: viewedDone });
  useEffect(() => {
    const was = prev.current; prev.current = { viewing, done: viewedDone };
    if (was.viewing !== viewing || was.done || !viewedDone) return;
    const step = STEPS.find(s => s.id === viewing)!;
    setCheer(simple ? `Nice work! "${step.title.simple}" is done.` : `${step.title.pro} complete.`); setTimeout(() => setCheer(''), 3500);
    if (current !== viewing) setViewing(current);
  }, [viewing, viewedDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const i = STEPS.findIndex(s => s.id === viewing); const step = STEPS[i]; const st = states[i];
  const doneCount = states.filter((s, k) => s.done && !STEPS[k].optional).length; const total = STEPS.filter(s => !s.optional).length;
  const T = (two: { simple: string; pro: string }) => (simple ? two.simple : two.pro);

  return <div className="flex flex-col gap-2.5 text-[12.5px]" style={{ color: C.text }} data-testid="cad-guide">
    <div className="flex items-center gap-2 px-1 pt-0.5">
      <div className="w-7 h-7 rounded-full grid place-items-center shrink-0 text-[12px] font-extrabold" style={{ background: 'linear-gradient(135deg,#0ea5e9,#a855f7)', color: '#fff' }} aria-hidden>A</div>
      <div className="flex-1 leading-tight"><div className="font-bold text-[13px]">Aria</div><div className="text-[10.5px]" style={{ color: C.dim }}>{simple ? 'Your build guide' : 'Build coach · design workflow'}</div></div>
      <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }} role="group" aria-label="Explanation level">
        {(['simple', 'pro'] as const).map(l => <button key={l} onClick={() => p.onLevel(l)} className="px-2.5 h-7 text-[11px] font-bold" style={{ background: level === l ? 'rgba(125,211,252,.16)' : 'transparent', color: level === l ? C.accent : C.dim }} data-testid={`guide-level-${l}`} title={l === 'simple' ? 'Plain words, step by step' : 'Trade terms, code sections, shortcuts'}>{l === 'simple' ? 'Simple' : 'Pro'}</button>)}
      </div>
    </div>

    {simple && viewing === 'idea' && !p.program && <p className="px-1 leading-snug" data-testid="guide-hello">Hi, I'm Aria. Let's design a home together, one step at a time. I'll explain what we're doing and why, and I'll check your plan as you go. Switch to Pro any time for the trade terms and shortcuts.</p>}
    {/* Progress: one dot per step */}
    <div className="px-1">
      <div className="flex items-center justify-between text-[10.5px] mb-1" style={{ color: C.dim }}><span>{simple ? `${doneCount} of ${total} steps done` : `${doneCount}/${total} stages`}</span>{viewing !== current && <button className="underline" onClick={() => setViewing(current)} data-testid="guide-go-current">{simple ? 'Go to my next step' : 'Next open stage'}</button>}</div>
      <div className="flex gap-1" role="tablist" aria-label="Steps">
        {STEPS.map((s, k) => { const on = s.id === viewing; const done = states[k].done; return <button key={s.id} role="tab" aria-selected={on} onClick={() => setViewing(s.id)} title={`${k + 1}. ${T(s.title)}${s.optional ? ' (optional)' : ''}`} className="flex-1 h-2 rounded-full" style={{ background: done ? C.ok : on ? C.accent : 'rgba(255,255,255,.12)', outline: on ? `2px solid ${C.accent}` : 'none', outlineOffset: 1, opacity: s.optional && !done ? 0.6 : 1 }} data-testid={`guide-dot-${s.id}`}/>; })}
      </div>
    </div>
    {cheer && <div className="mx-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5" style={{ background: 'rgba(52,211,153,.12)', color: C.ok }} data-testid="guide-cheer"><CheckCircle2 size={13}/>{cheer}</div>}

    {/* The step */}
    <section className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }} data-testid={`guide-step-${step.id}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[10.5px] font-bold tabular-nums" style={{ color: C.dim }}>{simple ? `Step ${i + 1}` : `${String(i + 1).padStart(2, '0')}`}</span>
        <h3 className="text-[16px] font-extrabold leading-tight flex-1">{T(step.title)}</h3>
        {st.done ? <CheckCircle2 size={16} style={{ color: C.ok }} aria-label="Done"/> : step.optional ? <span className="text-[10px]" style={{ color: C.dim }}>optional</span> : null}
      </div>
      <p className={simple ? 'text-[13.5px] leading-snug' : 'leading-snug'}>{T(step.what)}</p>
      <Why simple={simple} text={T(step.why)}/>
      <ol className="flex flex-col gap-1 pl-0 m-0 list-none">
        {(simple ? step.how.simple : step.how.pro).map((h, k) => <li key={k} className="flex gap-2 leading-snug"><span className="shrink-0 w-4 h-4 rounded-full grid place-items-center text-[9.5px] font-bold" style={{ background: 'rgba(125,211,252,.14)', color: C.accent }}>{k + 1}</span><span>{h}</span></li>)}
      </ol>

      <StepTools {...p} id={step.id} actions={step.actions}/>

      {st.lines.length > 0 && <div className="flex flex-col gap-1 pt-1" style={{ borderTop: `1px dashed ${C.line}` }} data-testid="guide-lines">
        <div className="text-[10px] font-bold uppercase tracking-wider pt-1.5" style={{ color: C.dim }}>{simple ? 'How you\'re doing' : 'Status'}</div>
        {st.lines.map((l, k) => <div key={k} className="flex gap-1.5 leading-snug">{l.ok === true ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: C.ok }}/> : l.ok === false ? <XCircle size={13} className="shrink-0 mt-0.5" style={{ color: C.bad }}/> : <Circle size={13} className="shrink-0 mt-0.5" style={{ color: C.dim }}/>}<span>{l.text}</span></div>)}
      </div>}

      {step.words.length > 0 && <Words words={step.words} simple={simple}/>}
    </section>

    <div className="flex gap-1.5 px-0.5">
      <button className="cad-btn" disabled={i === 0} onClick={() => setViewing(STEPS[i - 1].id)} data-testid="guide-back"><ChevronLeft size={14}/>{simple ? 'Back' : 'Prev'}</button>
      <div className="flex-1"/>
      {i < STEPS.length - 1 && <button className={`cad-btn${st.done || step.optional ? ' cad-primary' : ''}`} onClick={() => setViewing(STEPS[i + 1].id)} data-testid="guide-next">{st.done ? (simple ? 'Next step' : 'Next') : step.optional ? (simple ? 'Skip this' : 'Skip') : (simple ? 'Peek ahead' : 'Next')}<ChevronRight size={14}/></button>}
    </div>
  </div>;
}

function Why({ simple, text }: { simple: boolean; text: string }) {
  const [open, setOpen] = useState(simple);
  return <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,176,32,.08)', border: '1px solid rgba(255,176,32,.2)' }}>
    <button className="flex items-center gap-1.5 font-bold text-[11.5px] w-full text-left" style={{ color: '#ffcf70' }} onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="guide-why"><Lightbulb size={13}/>{simple ? 'Why does this matter?' : 'Rationale'}</button>
    {open && <p className="mt-1 leading-snug" style={{ color: C.text }}>{text}</p>}
  </div>;
}

function Words({ words, simple }: { words: Array<{ term: string; simple: string }>; simple: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return <div className="pt-1" style={{ borderTop: `1px dashed ${C.line}` }}>
    <div className="text-[10px] font-bold uppercase tracking-wider pt-1.5 pb-1" style={{ color: C.dim }}>{simple ? 'Words builders use' : 'Terms'}</div>
    <div className="flex flex-wrap gap-1">{words.map(w => <button key={w.term} onClick={() => setOpen(o => (o === w.term ? null : w.term))} className="px-2 h-6 rounded-full text-[11px]" style={{ background: open === w.term ? 'rgba(125,211,252,.16)' : 'rgba(255,255,255,.06)', color: open === w.term ? C.accent : C.text }} aria-expanded={open === w.term}><HelpCircle size={10} className="inline mr-1 -mt-px"/>{w.term}</button>)}</div>
    {open && <p className="mt-1.5 leading-snug" data-testid="guide-word">{words.find(w => w.term === open)?.simple}</p>}
  </div>;
}

/** The controls for one step: pickers, quick starts and buttons that drive the drafting tools. */
function StepTools(p: GuidePanelProps & { id: StepId; actions: GuideAction[] }) {
  const simple = p.level === 'simple'; const unit = p.imperial ? 'ft' : 'm'; const toM = (v: number) => (p.imperial ? v * 0.3048 : v); const fromMm = (mm: number) => +(p.imperial ? mm / 304.8 : mm / 1000).toFixed(1);
  const fp = p.program?.footprint ?? [10000, 8000];
  const [lot, setLot] = useState({ width: fromMm(15000), depth: fromMm(30000), front: fromMm(6000), side: fromMm(1500), rear: fromMm(6000) });
  const [shell, setShell] = useState({ w: fromMm(fp[0]), d: fromMm(fp[1]) });
  useEffect(() => { setShell({ w: fromMm(fp[0]), d: fromMm(fp[1]) }); }, [p.program?.id, p.imperial]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasLot = !!buildableArea(p.model); const hasRooms = p.rooms.length > 0;
  const num = (label: string, v: number, set: (n: number) => void, id: string) => <label className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: C.dim }}>{label}<span className="flex items-center gap-1"><input id={id} type="number" min={0.5} step={0.1} value={v} onChange={e => set(Number(e.target.value))} className="w-full h-7 rounded-md bg-white/5 border border-white/10 px-1.5 text-[12px] text-white" data-testid={id}/><span>{unit}</span></span></label>;
  const fails = p.findings.filter(f => f.status !== 'pass');
  const btn = (key: string, label: string, onClick: () => void, primary = false, disabled = false) => <button key={key} className={`cad-btn${primary ? ' cad-primary' : ''}`} onClick={onClick} disabled={disabled} data-testid={`guide-act-${key}`}>{label}</button>;

  return <div className="flex flex-col gap-2">
    {p.actions.map((a, k) => {
      if (a.kind === 'program') return <div key={k} className="flex flex-col gap-1.5">
        {PROGRAMS.map(pr => { const on = p.program?.id === pr.id; return <button key={pr.id} onClick={() => p.onProgram(pr)} className="text-left rounded-lg px-2.5 py-2" style={{ background: on ? 'rgba(125,211,252,.12)' : 'rgba(255,255,255,.03)', border: `1px solid ${on ? 'rgba(125,211,252,.5)' : C.line}` }} data-testid={`guide-program-${pr.id}`}>
          <div className="font-bold flex items-center gap-1.5">{on && <CheckCircle2 size={13} style={{ color: C.accent }}/>}{pr.name}</div>
          <div className="text-[11.5px] leading-snug" style={{ color: C.dim }}>{simple ? pr.simple : pr.rooms.length ? programRooms(pr).map(r => r.name).join(' · ') : 'Free-form; tag spaces as you go.'}</div>
        </button>; })}
        {p.program && p.program.rooms.length > 0 && <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ border: `1px solid ${C.line}` }}>
          <div className="font-bold mb-1">{simple ? 'Rooms on your list' : 'Program'}</div>
          {p.program.rooms.map(r => { const k2 = ROOM_KINDS[r.kind]; const sz = p.imperial ? `${Math.round(k2.typical[0] * 10.764)}–${Math.round(k2.typical[1] * 10.764)} sq ft` : `${k2.typical[0]}–${k2.typical[1]} m²`; return <div key={r.name} className="flex justify-between gap-2 py-0.5"><span>{r.count && r.count > 1 ? `${r.count} × ` : ''}{r.name}</span><span style={{ color: C.dim }}>{simple ? `usually ${sz}` : `typ. ${sz}`}</span></div>; })}
        </div>}
        <label className="flex items-start gap-2 text-[11.5px] leading-snug cursor-pointer"><input type="checkbox" checked={p.accessible} onChange={e => p.onAccessible(e.target.checked)} className="mt-0.5" data-testid="guide-accessible"/><span>{simple ? 'Someone who lives or visits here uses a wheelchair or walker. Add the wheelchair checks.' : 'Accessible design: include ADA 2010 pre-checks (door clear widths, toilet room turning space).'}</span></label>
      </div>;
      if (a.kind === 'lot') return <div key={k} className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1.5">{num(simple ? 'Land width' : 'Lot width', lot.width, n => setLot({ ...lot, width: n }), 'guide-lot-w')}{num(simple ? 'Land depth' : 'Lot depth', lot.depth, n => setLot({ ...lot, depth: n }), 'guide-lot-d')}</div>
        <div className="grid grid-cols-3 gap-1.5">{num(simple ? 'Gap at front' : 'Front', lot.front, n => setLot({ ...lot, front: n }), 'guide-lot-f')}{num(simple ? 'Gap at sides' : 'Side', lot.side, n => setLot({ ...lot, side: n }), 'guide-lot-s')}{num(simple ? 'Gap at back' : 'Rear', lot.rear, n => setLot({ ...lot, rear: n }), 'guide-lot-r')}</div>
        {btn('lot', hasLot ? (simple ? 'Land is drawn' : 'Lot drawn') : simple ? 'Draw my land' : 'Draw lot and setbacks', () => p.onLot({ width: toM(lot.width) * 1000, depth: toM(lot.depth) * 1000, front: toM(lot.front) * 1000, side: toM(lot.side) * 1000, rear: toM(lot.rear) * 1000 }), !hasLot, hasLot || lot.side * 2 >= lot.width || lot.front + lot.rear >= lot.depth)}
      </div>;
      if (a.kind === 'shell') return <div key={k} className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1.5">{num(simple ? 'House width' : 'Width (outside)', shell.w, n => setShell({ ...shell, w: n }), 'guide-shell-w')}{num(simple ? 'House depth' : 'Depth (outside)', shell.d, n => setShell({ ...shell, d: n }), 'guide-shell-d')}</div>
        {btn('shell', hasRooms ? (simple ? 'Walls are up' : 'Shell closed') : simple ? 'Make the walls for me' : 'Generate rectangular shell', () => p.onShell(toM(shell.w) * 1000, toM(shell.d) * 1000), !hasRooms, hasRooms || shell.w < 2 || shell.d < 2)}
      </div>;
      if (a.kind === 'tool') return null; // grouped below
      if (a.kind === 'place') return null;
      if (a.kind === 'checks') return <div key={k} className="flex flex-col gap-1" data-testid="guide-findings">
        {!fails.length && p.findings.length > 0 && <div className="flex gap-1.5" style={{ color: C.ok }}><CheckCircle2 size={13} className="mt-0.5"/>{simple ? 'Everything we can check looks good!' : 'No open findings.'}</div>}
        {fails.slice(0, 12).map((f, j) => { const rule = HOME_RULES.find(r => r.id === f.rule); const ada = ADA_RULES.find(r => r.id === f.rule); return <button key={j} onClick={() => p.onPickFinding(f)} className="text-left rounded-lg px-2 py-1.5 flex gap-1.5" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }} data-testid={`guide-finding-${f.status}`}>
          {f.status === 'fail' ? <XCircle size={13} className="shrink-0 mt-0.5" style={{ color: C.bad }}/> : <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: C.warn }}/>}
          <span className="leading-snug"><b>{f.title}.</b> {f.detail}{simple && rule ? <span className="block mt-0.5" style={{ color: C.dim }}>{rule.simple}</span> : simple && ada ? <span className="block mt-0.5" style={{ color: C.dim }}>So a wheelchair fits through and can turn around.</span> : <span className="block mt-0.5" style={{ color: C.dim }}>{f.citation}</span>}</span>
        </button>; })}
        <div className="text-[10px] leading-snug" style={{ color: C.dim }}>{HOME_DISCLAIMER}{p.accessible ? ` ${ADA_DISCLAIMER}` : ''}</div>
      </div>;
      if (a.kind === 'view3d') return <div key={k}>{btn('3d', simple ? 'Show 3D' : 'Open 3D model', p.onView3d, !p.seen3d, !p.model.entities.some(e => e.type === 'wall'))}</div>;
      if (a.kind === 'ack') return <div key={k}>{btn('ack', p.ack ? (simple ? 'Thanks for reading!' : 'Acknowledged') : simple ? a.label.simple : a.label.pro, p.onAck, !p.ack, p.ack)}</div>;
      return null;
    })}
    {p.actions.some(a => a.kind === 'tool' || a.kind === 'place') && <div className="flex flex-wrap gap-1.5">
      {p.actions.map((a, k) => a.kind === 'tool' ? <button key={k} className="cad-btn" onClick={() => p.onTool(a.tool)} data-testid={`guide-tool-${a.tool}`}><Wrench size={12}/>{simple ? a.label.simple : a.label.pro}</button>
        : a.kind === 'place' ? <button key={k} className={`cad-btn${p.placingLabel && placeMatch(p.placingLabel, a.item) ? ' cad-on' : ''}`} onClick={() => p.onPlace(a.item)} data-testid={`guide-place-${a.item}`}>{simple ? a.label.simple : a.label.pro}</button> : null)}
    </div>}
    {p.placingLabel && <div className="text-[11px] leading-snug" style={{ color: C.accent }}>{simple ? `Now click on the plan to put the ${p.placingLabel.toLowerCase()} there. Press Esc when you're done.` : `Placing ${p.placingLabel}: click to insert, R rotate, F flip, Esc to finish.`}</div>}
  </div>;
}

const placeMatch = (label: string, id: string) => label.toLowerCase().includes(id.split('-')[0]);

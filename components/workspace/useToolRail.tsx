// The shared "tools appear as the work needs them" layer for every workspace room: which tools the
// rail shows, which are new (with Aria's reason), the next tool Aria suggests, and recording use.
// Rooms keep their own buttons; they ask this hook which ones to draw.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { registry, type ToolDef } from '../../services/workspace/tools';
import { getProfile, subscribe, updateProfile, connectAccount } from '../../services/workspace/profileStore';
import { recordUse, usesOf } from '../../services/workspace/skillProfile';
import type { Level } from '../../services/workspace/guidePath';
import { publishRail, onReveal, setRunner, type Runner } from '../../services/workspace/railBus';

export interface ToolRail {
  /** Every tool the rail should draw right now. */
  visible: Set<string>;
  /** Tools that just joined the rail and haven't been used yet → Aria's reason. */
  fresh: Map<string, string>;
  /** How many registered tools are hidden (for a "+N" button). */
  hidden: number;
  /** The next tool Aria suggests, unless dismissed. */
  suggestion: ToolDef | null;
  /** Shown tools plus hidden ones while "show all" is on. */
  shows: (id: string) => boolean;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  used: (id: string) => void;
  dismiss: () => void;
}

/** `doc` is null while there's nothing to work on; then the rail shows everything (no hiding).
 *  `groups` limits the rail to some tool groups (a room with several panels, e.g. Biology's tabs). */
export function useToolRail<D>(workspace: string, doc: D | null, selection: number[], level: Level, getToken?: () => Promise<string | null>, groups?: string[]): ToolRail {
  const profile = useSyncExternalStore(subscribe, getProfile, getProfile);
  useEffect(() => { connectAccount(getToken); }, [getToken]);
  const [showAll, setShowAll] = useState(false);
  const [off, setOff] = useState('');
  const ctx = useMemo(() => doc === null ? null : { workspace, doc, selection, level, profile }, [workspace, doc, selection, level, profile]);
  const { visible, fresh, hidden } = useMemo(() => {
    const inGroup = (t: ToolDef) => !groups || groups.includes(t.group);
    const all = registry.forWorkspace(workspace).filter(inGroup);
    if (!ctx) return { visible: new Set(all.map(t => t.id)), fresh: new Map<string, string>(), hidden: 0 };
    const shown = registry.visible(ctx).filter(x => inGroup(x.tool));
    const fresh = new Map<string, string>();
    for (const x of shown) if (x.reason === 'needed' && usesOf(profile, workspace, x.tool.id) === 0 && x.tool.because) fresh.set(x.tool.id, x.tool.because[level]);
    return { visible: new Set(shown.map(x => x.tool.id)), fresh, hidden: all.length - shown.length };
  }, [ctx, workspace, profile, level, groups?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => { const t = ctx ? registry.suggest(ctx) : null; return t && (!groups || groups.includes(t.group)) ? t : null; }, [ctx, groups?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const used = useCallback((id: string) => updateProfile(p => recordUse(p, workspace, id)), [workspace]);
  const suggestion = next && next.id !== off ? next : null;
  // Ask Aria reads the rail through railBus, and can ask for every tool ("+N").
  useEffect(() => { if (ctx) publishRail(workspace, { visible: [...visible], fresh: Object.fromEntries(fresh), suggestion: suggestion?.id ?? null }); }, [ctx, workspace, visible, fresh, suggestion]);
  useEffect(() => onReveal(workspace, () => setShowAll(true)), [workspace]);
  return {
    visible, fresh, hidden, showAll, setShowAll,
    suggestion,
    shows: id => showAll || visible.has(id) || !registry.get(workspace, id),
    used, dismiss: () => setOff(next?.id ?? ''),
  };
}

/** Lets Ask Aria's "Show me" run a tool in this room. `run` returns false when it can't, or a sentence
 *  saying what to do first ("pick two shapes"). */
export function useToolRunner(workspace: string, run: Runner): void {
  const ref = useRef(run); ref.current = run;
  useEffect(() => setRunner(workspace, id => ref.current(id)), [workspace]);
}

/** Aria's "new tool" card: why the tool is here, what it does, Try it / Not now. */
export function AriaToolHint({ tool, level, onTry, onDismiss, testid = 'aria-hint', style }: { tool: ToolDef; level: Level; onTry: () => void; onDismiss: () => void; testid?: string; style?: React.CSSProperties }) {
  return <div className="absolute right-3 bottom-14 z-10 max-w-[320px] p-3 rounded-xl text-[12px] flex gap-2.5 items-start shadow-2xl" style={{ background: '#17142a', border: '1px solid rgba(167,139,250,.45)', ...style }} data-testid={testid} role="status">
    <span className="w-7 h-7 rounded-full grid place-items-center shrink-0 text-[12px] font-black" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff' }} aria-hidden="true">A</span>
    <div className="flex-1 min-w-0">
      <div style={{ color: 'rgba(255,255,255,.9)' }}><b>{level === 'simple' ? 'New tool' : 'Tool available'}: {tool.label}</b>{tool.because ? <> {level === 'simple' ? 'is here because' : '·'} {tool.because[level]}.</> : null}</div>
      <div className="mt-0.5" style={{ color: 'rgba(255,255,255,.55)' }}>{tool.teach[level]}</div>
      <div className="mt-2 flex gap-1.5">
        <button className="aria-hint-btn" onClick={onTry} data-testid={`${testid}-try`}>Try it{tool.alias ? ` (${tool.alias})` : ''}</button>
        <button className="aria-hint-btn" onClick={onDismiss} data-testid={`${testid}-dismiss`}>Not now</button>
      </div>
    </div>
    <style>{`.aria-hint-btn{height:26px;padding:0 10px;border-radius:7px;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.85);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}.aria-hint-btn:hover{background:rgba(255,255,255,.12);color:#fff}`}</style>
  </div>;
}

/** The pulsing dot on a tool that just joined the rail. */
export function FreshDot({ reason, testid }: { reason: string; testid?: string }) {
  return <span className="ws-fresh" title={`New: here because ${reason}`} data-testid={testid}>
    <style>{`.ws-fresh{position:absolute;top:3px;right:3px;width:7px;height:7px;border-radius:999px;background:#a78bfa;box-shadow:0 0 0 0 rgba(167,139,250,.7);animation:wsFresh 1.8s ease-out infinite}@keyframes wsFresh{70%{box-shadow:0 0 0 6px rgba(167,139,250,0)}100%{box-shadow:0 0 0 0 rgba(167,139,250,0)}}@media (prefers-reduced-motion:reduce){.ws-fresh{animation:none}}`}</style>
  </span>;
}

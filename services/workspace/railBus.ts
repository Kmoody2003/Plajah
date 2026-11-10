// What each open room's tool rail looks like right now, so Ask Aria can answer "is it on my toolbar?"
// and "what's new?", plus two ways back into the room: run a tool, or reveal every tool.
// Rooms publish through useToolRail automatically; a room that can run tools from outside registers a
// runner with useToolRunner. Pure module state (one browser tab), no React.

import type { RailSnapshot } from './askAria';

type Listener = () => void;
const snaps = new Map<string, RailSnapshot>();
/** A runner returns false when it can't run that tool, or a sentence saying what to do first. */
export type Runner = (id: string) => boolean | string | void;
const runners = new Map<string, Runner>();
const revealers = new Map<string, Set<() => void>>();
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l());

export function publishRail(workspace: string, snap: RailSnapshot): void {
  const old = snaps.get(workspace);
  if (old && same(old, snap)) return;
  snaps.set(workspace, snap); emit();
}
export function railOf(workspace: string): RailSnapshot | null { return snaps.get(workspace) ?? null; }
export function subscribeRail(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/** A room's "run this tool" hook. Returns an unregister function. */
export function setRunner(workspace: string, run: Runner): () => void {
  runners.set(workspace, run);
  return () => { if (runners.get(workspace) === run) runners.delete(workspace); };
}
export function canRun(workspace: string): boolean { return runners.has(workspace); }
/** Runs a tool in the room: ran, couldn't (no runner, or it said no), or a note on what to do first. */
export function runTool(workspace: string, id: string): { ran: boolean; note?: string } {
  const r = runners.get(workspace); if (!r) return { ran: false };
  const out = r(id);
  return typeof out === 'string' ? { ran: false, note: out } : { ran: out !== false };
}

export function onReveal(workspace: string, f: () => void): () => void {
  const set = revealers.get(workspace) ?? new Set(); set.add(f); revealers.set(workspace, set);
  return () => { set.delete(f); };
}
/** Show every tool in the room (the same as its "+N" button). */
export function revealTools(workspace: string): void { revealers.get(workspace)?.forEach(f => f()); }

function same(a: RailSnapshot, b: RailSnapshot) {
  return a.suggestion === b.suggestion && a.visible.join() === b.visible.join()
    && JSON.stringify(a.fresh) === JSON.stringify(b.fresh);
}

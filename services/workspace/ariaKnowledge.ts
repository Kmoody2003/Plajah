// Everything Ask Aria knows about each live workspace: its tools from the registry, its guide paths and
// its safety notes. Used by the shell's panel (lazy-loaded) and by the server route, so both build
// exactly the same facts.

import { registry } from './tools';
import { workspaceById } from './workspaces';
import { factsFor, retrieve, withContext, buildPrompt, checkAnswer, localAnswer, type AriaAnswer, type AriaFact, type AriaHistory, type RailSnapshot, type RoomState } from './askAria';
import type { GuidePath, Level } from './guidePath';
import { registerCadTools, ARCH } from '../cad/workspaceTools';
import { registerElecTools } from '../elec/workspaceTools';
import { registerSewTools } from '../soft/workspaceTools';
import { registerBioTools } from '../bio/workspaceTools';
import { registerStudioTools } from '../build/workspaceTools';
import { HOME_PATH } from '../cad/guide/journey';

registerCadTools(); registerElecTools(); registerSewTools(); registerBioTools(); registerStudioTools();

/** Which registry workspace a tab's tools live in (the CAD room serves Mechanical with the drafting rail). */
export const TOOLS_OF: Record<string, string> = { mechanical: ARCH };
const PATHS: Record<string, GuidePath[]> = { architecture: [HOME_PATH as unknown as GuidePath] };

export function toolSpace(workspace: string): string { return TOOLS_OF[workspace] ?? workspace; }

/** The facts for one workspace tab, or null for a workspace Aria doesn't know (unknown or planned). */
export function workspaceFacts(workspace: string, level: Level, rail?: RailSnapshot | null, state?: RoomState | null, screen?: string | null): AriaFact[] | null {
  const w = workspaceById(workspace);
  if (!w) return null;
  const tools = registry.forWorkspace(toolSpace(workspace));
  return factsFor({ workspace: { id: w.id, name: w.name, door: w.door }, level, tools, rail, paths: PATHS[workspace] ?? [], state, screen });
}

const line = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
/** The room's report from the browser, cleaned: plain short lines, a few of each. */
export function cleanState(raw: unknown): RoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { building?: unknown; lines?: unknown; issues?: unknown };
  const building = line(r.building, 300);
  if (!building) return null;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map(x => line(x, 240)).filter(Boolean).slice(0, n);
  return { building, lines: list(r.lines, 14), issues: list(r.issues, 8) };
}
export const cleanScreen = (v: unknown) => line(v, 1200) || null;
export function cleanHistory(v: unknown): AriaHistory[] {
  return (Array.isArray(v) ? v : []).slice(-2).map(h => ({ q: line((h as AriaHistory)?.q, 300), a: line((h as AriaHistory)?.a, 400) })).filter(h => h.q && h.a);
}

/** Rail state from the browser, cleaned: only real tool ids, and "why it's new" re-read from the registry. */
export function cleanRail(workspace: string, level: Level, raw: unknown): RailSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const space = toolSpace(workspace);
  const real = (id: unknown) => typeof id === 'string' && id.length <= 40 && !!registry.get(space, id);
  const r = raw as { visible?: unknown; fresh?: unknown; suggestion?: unknown };
  const visible = (Array.isArray(r.visible) ? r.visible : []).filter(real).slice(0, 120) as string[];
  const fresh: Record<string, string> = {};
  for (const id of Object.keys(r.fresh && typeof r.fresh === 'object' ? r.fresh as object : {}).slice(0, 20)) {
    const t = real(id) ? registry.get(space, id) : undefined;
    if (t?.because) fresh[id] = t.because[level];
  }
  return { visible, fresh, suggestion: real(r.suggestion) ? r.suggestion as string : null };
}

/** One question, answered: the model when there is one and the facts match, otherwise the facts themselves. */
export async function askWorkspace(o: { workspace: string; level: Level; question: string; rail?: unknown; state?: unknown; screen?: unknown; history?: unknown; model?: ((system: string, user: string) => Promise<string>) | null }): Promise<AriaAnswer | null> {
  const level: Level = o.level === 'pro' ? 'pro' : 'simple';
  const rail = cleanRail(o.workspace, level, o.rail);
  const facts = workspaceFacts(o.workspace, level, rail, cleanState(o.state), cleanScreen(o.screen));
  if (!facts) return null;
  const question = String(o.question ?? '').replace(/\u0000/g, '').trim().slice(0, 500);
  const history = cleanHistory(o.history);
  // A follow-up ("and how do I fix that?") leans on the question before it.
  let hits = retrieve(question, facts, 6);
  if (!hits.length && history.length) hits = retrieve(`${history[history.length - 1].q} ${question}`, facts, 6);
  const shown = withContext(hits, facts);
  if (o.model && shown.length) {
    try {
      const p = buildPrompt(workspaceById(o.workspace)!.name, level, question, shown, history);
      const out = checkAnswer(await o.model(p.system, p.user), shown);
      if (out && !out.unknown) return out;
    } catch { /* fall through to the facts */ }
  }
  return localAnswer(level, question, facts);
}

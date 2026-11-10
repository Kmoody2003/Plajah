// A person's skill profile: which tools they've used and which guide paths they've finished, per
// workspace. It only ever adds tools to the rail. Nothing is locked: Pro mode shows everything.
// Pure data + functions; the browser store is services/workspace/profileStore.ts, and the server copy
// (signed in) is written by routes/makerBuild.ts at /api/build/workspace/profile.

import type { Level } from './guidePath';

export interface WorkspaceSkill {
  /** Tool id -> times used. */
  uses: Record<string, number>;
  /** Path id -> when it was finished (ms). */
  paths: Record<string, number>;
  level?: Level;
}
export interface SkillProfile { v: 1; workspaces: Record<string, WorkspaceSkill>; updatedAt: number }

export const emptyProfile = (): SkillProfile => ({ v: 1, workspaces: {}, updatedAt: 0 });
const ws = (p: SkillProfile, id: string): WorkspaceSkill => p.workspaces[id] ?? { uses: {}, paths: {} };

export function usesOf(p: SkillProfile, workspace: string, tool: string): number { return ws(p, workspace).uses[tool] ?? 0; }
export function finishedPath(p: SkillProfile, workspace: string, path: string): boolean { return !!ws(p, workspace).paths[path]; }

export function recordUse(p: SkillProfile, workspace: string, tool: string, now = Date.now()): SkillProfile {
  const w = ws(p, workspace);
  return { ...p, updatedAt: now, workspaces: { ...p.workspaces, [workspace]: { ...w, uses: { ...w.uses, [tool]: Math.min(1e6, (w.uses[tool] ?? 0) + 1) } } } };
}
export function finishPath(p: SkillProfile, workspace: string, path: string, now = Date.now()): SkillProfile {
  const w = ws(p, workspace); if (w.paths[path]) return p;
  return { ...p, updatedAt: now, workspaces: { ...p.workspaces, [workspace]: { ...w, paths: { ...w.paths, [path]: now } } } };
}
export function setLevel(p: SkillProfile, workspace: string, level: Level, now = Date.now()): SkillProfile {
  const w = ws(p, workspace); if (w.level === level) return p;
  return { ...p, updatedAt: now, workspaces: { ...p.workspaces, [workspace]: { ...w, level } } };
}

/** Two copies (this device and the account) become one: higher counts, earliest finish, newest level. */
export function mergeProfiles(a: SkillProfile, b: SkillProfile): SkillProfile {
  const out: SkillProfile = { v: 1, workspaces: {}, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  for (const id of new Set([...Object.keys(a.workspaces), ...Object.keys(b.workspaces)])) {
    const x = ws(a, id), y = ws(b, id);
    const uses: Record<string, number> = { ...x.uses };
    for (const [k, n] of Object.entries(y.uses)) uses[k] = Math.max(uses[k] ?? 0, n);
    const paths: Record<string, number> = { ...x.paths };
    for (const [k, t] of Object.entries(y.paths)) paths[k] = paths[k] ? Math.min(paths[k], t) : t;
    const level = ws(newer, id).level ?? x.level ?? y.level;
    out.workspaces[id] = level ? { uses, paths, level } : { uses, paths };
  }
  return out;
}

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Untrusted input (localStorage, a request body) -> a well-formed, bounded profile. */
export function sanitizeProfile(raw: unknown): SkillProfile {
  const p = emptyProfile(); if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  p.updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
  const wss = r.workspaces && typeof r.workspaces === 'object' ? Object.entries(r.workspaces as Record<string, unknown>).slice(0, 40) : [];
  for (const [id, w] of wss) {
    if (!ID.test(id) || !w || typeof w !== 'object') continue;
    const o = w as Record<string, unknown>;
    const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0);
    const map = (m: unknown, max: number) => Object.fromEntries((m && typeof m === 'object' ? Object.entries(m as Record<string, unknown>) : []).slice(0, 200).filter(([k]) => ID.test(k)).map(([k, v]) => [k, num(v, max)] as const).filter(([, v]) => v > 0));
    const s: WorkspaceSkill = { uses: map(o.uses, 1e6), paths: map(o.paths, 1e14) };
    if (o.level === 'simple' || o.level === 'pro') s.level = o.level;
    p.workspaces[id] = s;
  }
  return p;
}

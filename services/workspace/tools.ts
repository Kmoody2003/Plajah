// The tool registry: every tool in every workspace says what it acts on, how advanced it is, and
// when it's needed. The shell builds the tool rail from it, and Aria uses it to suggest the next tool.
//
//   starter  always on the rail
//   core     shows once the work calls for it (appearsWhen), or once you've used it before
//   pro      shows in Pro mode, once you've used its core tools a few times, or after a guide path unlocks it
//
// Nothing is locked: Pro mode always shows every tool, and a tool typed by alias always works.

import type { Level, Two } from './guidePath';
import { usesOf, finishedPath, type SkillProfile } from './skillProfile';

export type ToolLevel = 'starter' | 'core' | 'pro';

export interface ToolContext<D = unknown> {
  workspace: string;
  doc: D;
  selection: number[];
  level: Level;
  profile: SkillProfile;
}

export interface ToolDef<D = any> {
  id: string;
  workspace: string;
  label: string;
  /** Device kinds and entity types the tool works on, e.g. ['DRAFT_2D', 'wall']. */
  actsOn: string[];
  level: ToolLevel;
  /** Rail group, e.g. 'Draw', 'Change', 'Building'. */
  group: string;
  /** Typed command (AutoCAD alias where one exists). */
  alias?: string;
  teach: Two;
  /** Core tools: the work calls for this tool now. */
  appearsWhen?: (ctx: ToolContext<D>) => boolean;
  /** Plain words for why it just appeared, e.g. "you closed a loop of walls". */
  because?: Two;
  /** Pro tools: show once any of these has been used EARN_AFTER times. */
  after?: string[];
}

/** Why a tool is on the rail right now. */
export type Reason = 'starter' | 'needed' | 'used' | 'earned' | 'path' | 'pro';
export interface Shown<D = any> { tool: ToolDef<D>; reason: Reason }

export const EARN_AFTER = 3;

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  /** Path id -> tool ids it keeps on the rail once finished. */
  private unlocks = new Map<string, { workspace: string; tools: string[] }>();

  register<D>(...defs: ToolDef<D>[]): this {
    for (const d of defs) { const key = `${d.workspace}:${d.id}`; if (this.tools.has(key)) throw new Error(`Tool registered twice: ${key}`); this.tools.set(key, d); }
    return this;
  }
  unlockOnPath(workspace: string, path: string, tools: string[]): this { this.unlocks.set(path, { workspace, tools }); return this; }

  get(workspace: string, id: string): ToolDef | undefined { return this.tools.get(`${workspace}:${id}`); }
  forWorkspace(workspace: string): ToolDef[] { return [...this.tools.values()].filter(t => t.workspace === workspace); }

  /** Why a tool shows, or null when it stays tucked away for now. */
  reasonFor<D>(t: ToolDef<D>, ctx: ToolContext<D>): Reason | null {
    if (t.level === 'starter') return 'starter';
    if (t.level === 'core') {
      if (safe(() => t.appearsWhen?.(ctx))) return 'needed';
      if (usesOf(ctx.profile, ctx.workspace, t.id) > 0) return 'used';
    }
    for (const [path, u] of this.unlocks) if (u.workspace === ctx.workspace && u.tools.includes(t.id) && finishedPath(ctx.profile, ctx.workspace, path)) return 'path';
    if (t.level === 'pro') {
      if (usesOf(ctx.profile, ctx.workspace, t.id) > 0) return 'used';
      if (t.after?.some(a => usesOf(ctx.profile, ctx.workspace, a) >= EARN_AFTER)) return 'earned';
    }
    return ctx.level === 'pro' ? 'pro' : null;
  }

  /** The rail, in registration order. */
  visible<D>(ctx: ToolContext<D>): Shown<D>[] {
    const out: Shown<D>[] = [];
    for (const t of this.forWorkspace(ctx.workspace)) { const reason = this.reasonFor(t, ctx); if (reason) out.push({ tool: t, reason }); }
    return out;
  }

  /** Aria's next-tool hint: a tool the work just called for that this person hasn't tried yet. */
  suggest<D>(ctx: ToolContext<D>): ToolDef<D> | null {
    for (const t of this.forWorkspace(ctx.workspace)) {
      if (t.level !== 'core' || usesOf(ctx.profile, ctx.workspace, t.id) > 0) continue;
      if (safe(() => t.appearsWhen?.(ctx))) return t;
    }
    return null;
  }
}

/** A predicate that throws on half-built work counts as "not yet". */
function safe(f: () => boolean | undefined): boolean { try { return !!f(); } catch { return false; } }

/** The one registry the app uses. Workspaces register into it from their own module (e.g. cadTools.ts). */
export const registry = new ToolRegistry();

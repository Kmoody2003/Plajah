/**
 * ariaContext.ts — The Aria Context Bus.
 *
 * Aria (Plajah's single AI persona) is only as useful as her awareness of what
 * the user is actually doing.  Historically the agent received nothing but a
 * `currentView` string ("user is in MELOS"), so she could not co-author a
 * document, help with a music patch, or reason about on-screen state.
 *
 * This module is the missing nervous system.  Any surface (a document editor,
 * the Melos DAW, a lesson builder…) publishes a structured snapshot describing
 * what the user is doing — including the working text and the *actions* Aria is
 * allowed to perform — and Aria reads the most-recently-active snapshot at
 * send time.  When Aria decides to act, she names an action id + params and the
 * originating surface's handler runs locally.
 *
 * Design goals:
 *  • Framework-agnostic core (a plain module store) so non-React callers work.
 *  • A React hook (`useAriaSurface`) for the common publish-on-mount case.
 *  • Zero coupling to any model: this is pure context/action plumbing.
 *  • Cheap: publishers may update on every keystroke; consumers read on demand.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** A single thing Aria is permitted to do on the active surface. */
export interface AriaActionDef {
  /** Stable id, unique within the surface, dotted by convention: 'article.appendParagraph'. */
  id: string;
  /** Short human label (shown in UI chips and given to the model). */
  label: string;
  /** When and how Aria should use it — written for the model to read. */
  description: string;
  /** paramName → human description of the param, for the model. */
  params?: Record<string, string>;
}

/** A live description of what the user is doing, published by the active surface. */
export interface AriaContextSnapshot {
  /** Machine id of the surface, e.g. 'article-editor' | 'melos' | 'lesson-builder'. */
  surface: string;
  /** Broad domain — lets Aria pick the right voice/skillset. */
  domain?: 'writing' | 'music' | 'video' | 'image' | 'learning' | 'business' | 'code' | 'general' | (string & {});
  /** Human label of the current object, e.g. "Editing article: The Long Road". */
  title?: string;
  /** Short natural-language description of the current state Aria should know. */
  summary?: string;
  /** The user's current text selection, if the surface tracks one. */
  selection?: string;
  /** The primary working text (document body / lyrics / script). May be large; consumers truncate. */
  documentText?: string;
  /** Structured state the model can reason over (music project, block ids, params…). */
  data?: Record<string, unknown>;
  /** What Aria may DO here. Omit for read-only awareness. */
  actions?: AriaActionDef[];
  /** Filled in automatically by publishAriaContext. */
  updatedAt?: number;
}

/** Result of running an action — surfaced back to the chat as a tool result. */
export interface AriaActionResult {
  ok: boolean;
  /** Short message shown to the user ("Added a paragraph."). */
  message?: string;
  /** Optional structured payload. */
  data?: unknown;
}

export type AriaActionHandler = (
  params: Record<string, unknown>,
) => AriaActionResult | void | Promise<AriaActionResult | void>;

// ── Store ──────────────────────────────────────────────────────────────────────

const snapshots = new Map<string, AriaContextSnapshot>();
const handlers = new Map<string, Map<string, AriaActionHandler>>();
const listeners = new Set<(active: AriaContextSnapshot | null) => void>();

function emit() {
  const active = getActiveAriaContext();
  for (const l of listeners) {
    try { l(active); } catch { /* a bad listener must not break publishing */ }
  }
}

/** Publish (or update) the snapshot for a surface. Call as often as you like. */
export function publishAriaContext(snapshot: AriaContextSnapshot): void {
  if (!snapshot?.surface) return;
  snapshots.set(snapshot.surface, { ...snapshot, updatedAt: Date.now() });
  emit();
}

/** Remove a surface's snapshot (and its action handlers) — call on unmount. */
export function clearAriaContext(surface: string): void {
  const had = snapshots.delete(surface);
  handlers.delete(surface);
  if (had) emit();
}

/** The most-recently-updated snapshot, i.e. what the user is doing *now*. */
export function getActiveAriaContext(): AriaContextSnapshot | null {
  let best: AriaContextSnapshot | null = null;
  for (const s of snapshots.values()) {
    if (!best || (s.updatedAt ?? 0) > (best.updatedAt ?? 0)) best = s;
  }
  return best;
}

/** Subscribe to active-context changes (for UI that shows "Aria sees: …"). */
export function subscribeAriaContext(cb: (active: AriaContextSnapshot | null) => void): () => void {
  listeners.add(cb);
  cb(getActiveAriaContext());
  return () => { listeners.delete(cb); };
}

// ── Actions ─────────────────────────────────────────────────────────────────────

/** Register a handler for one action on a surface. */
export function registerAriaAction(surface: string, id: string, handler: AriaActionHandler): void {
  let m = handlers.get(surface);
  if (!m) { m = new Map(); handlers.set(surface, m); }
  m.set(id, handler);
}

/** Register many handlers at once. */
export function registerAriaActions(surface: string, map: Record<string, AriaActionHandler>): void {
  for (const [id, h] of Object.entries(map)) registerAriaAction(surface, id, h);
}

/**
 * Run an action Aria requested. `id` may be bare ('appendParagraph') or
 * surface-qualified ('article-editor.appendParagraph'); we resolve against the
 * currently-active surface first, then any surface that owns the id.
 */
export async function runAriaAction(
  id: string,
  params: Record<string, unknown> = {},
): Promise<AriaActionResult> {
  const active = getActiveAriaContext();
  const bare = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
  const qualifiedSurface = id.includes('.') ? id.slice(0, id.indexOf('.')) : null;

  const tryRun = async (surface: string, key: string): Promise<AriaActionResult | null> => {
    const h = handlers.get(surface)?.get(key);
    if (!h) return null;
    const r = (await h(params)) as AriaActionResult | undefined;
    return r ?? { ok: true };
  };

  // 1) explicit surface.id  2) active surface + bare  3) active surface + full id
  if (qualifiedSurface) {
    const r = (await tryRun(qualifiedSurface, bare)) ?? (await tryRun(qualifiedSurface, id));
    if (r) return r;
  }
  if (active) {
    const r = (await tryRun(active.surface, bare)) ?? (await tryRun(active.surface, id));
    if (r) return r;
  }
  // 4) last resort: scan every surface for a matching id
  for (const [surface] of handlers) {
    const r = (await tryRun(surface, bare)) ?? (await tryRun(surface, id));
    if (r) return r;
  }
  return { ok: false, message: `Aria tried an action that isn't available here (${id}).` };
}

// ── Wire-format helper (client → server) ────────────────────────────────────────

/**
 * Trim a snapshot to a size that's safe to send over the wire and inject into a
 * prompt. Large text fields are capped; handlers are never sent (only defs).
 */
export function serializeAriaContextForWire(
  s: AriaContextSnapshot | null,
  opts: { maxDoc?: number; maxSelection?: number } = {},
): AriaContextSnapshot | undefined {
  if (!s) return undefined;
  const maxDoc = opts.maxDoc ?? 12000;
  const maxSelection = opts.maxSelection ?? 2000;
  return {
    surface: s.surface,
    domain: s.domain,
    title: s.title,
    summary: s.summary,
    selection: s.selection ? String(s.selection).slice(0, maxSelection) : undefined,
    documentText: s.documentText ? String(s.documentText).slice(0, maxDoc) : undefined,
    data: s.data,
    actions: s.actions,
    updatedAt: s.updatedAt,
  };
}

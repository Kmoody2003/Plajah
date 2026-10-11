// historyBridge — how Image Studio undo interleaves with Tela's document undo.
//
// Two histories exist and must read as ONE timeline to the user:
//   - Tela's document history (telaHistory.ts) snapshots the whole TelaDoc per op. Cheap,
//     because docs are immutable and a raster device stores only JSON (bitmaps by asset id).
//   - Pixels. A stroke mutates a layer bitmap in place; copying 33 MB per stroke into a doc
//     snapshot is impossible, so the engine keeps tile-diff patches (painting.ts UndoPatch).
//
// The bridge: the TelaDoc stays the MASTER timeline. Every studio step dispatches
// SET_IMAGE_RASTER { raster JSON, rev } where rev = "<journal epoch>:<pixel cursor>". Ctrl+Z
// is handled by TelaView as usual (whole-doc snapshot restore); when the studio sees the
// device come back with a different raster/rev it RECONCILES: seek the pixel journal to the
// snapshot's cursor (undo/redo tile patches), then adopt the snapshot's JSON as structure.
// Layer adds/deletes/props are pure JSON and need no journal at all, so pixel and
// structural steps interleave in exactly the order the doc history recorded them — together
// with edits on other devices (Writer typing etc.) which never touch `rev`.
//
// Asset keys: the session paints into runtime (`mem:`) bitmaps; persistence writes PNGs to
// the asset store (content-addressed ids) WITHOUT re-keying the session (re-keying would
// make the engine clone a 4k layer on the next stroke). AssetAliases maps runtime ⇄ stored
// both ways: outgoing JSON carries stored ids for clean assets, incoming snapshots map
// stored ids back to the live runtime bitmaps whose pixels the journal seek just fixed.
//
// Pure (no DOM, no engine imports beyond types) so it is tested in node.

import type { RasterDocument } from '../../../services/tela/raster/model';
import { collectAssetIds } from '../../../services/tela/raster/model';
import { remapAssets } from '../../../services/tela/raster/assets';

// ── Pixel journal ───────────────────────────────────────────────────────────────────────────
export interface JournalOps<P> { undo(p: P): void; redo(p: P): void; bytes(p: P): number; empty?(p: P): boolean }

let epochSeq = 0;
export const newEpoch = () => `${Date.now().toString(36)}${(epochSeq++).toString(36)}`;

/**
 * Linear pixel history with an ABSOLUTE cursor (patches dropped from the front for the byte
 * cap keep their numbers, so a rev minted long ago still means the same point in time).
 * Drop-in for the engine's PaintHistory (push / undo / redo / canUndo / canRedo / bytes).
 */
export class PixelJournal<P> {
  readonly epoch: string;
  private entries: P[] = [];
  /** Absolute index of entries[0]. */
  private base = 0;
  /** Absolute count of applied patches. */
  cursor = 0;
  bytes = 0;
  constructor(private ops: JournalOps<P>, public maxBytes = 384 * 1024 * 1024, epoch = newEpoch()) { this.epoch = epoch; }
  get rev() { return `${this.epoch}:${this.cursor}`; }
  get oldest() { return this.base; }
  get newest() { return this.base + this.entries.length; }
  get canUndo() { return this.cursor > this.base; }
  get canRedo() { return this.cursor < this.newest; }
  /** Record a patch at the cursor; discards the redo tail. Returns false for empty patches. */
  push(p: P | null | undefined): boolean {
    if (!p || this.ops.empty?.(p)) return false;
    const keep = this.cursor - this.base;
    for (const dropped of this.entries.splice(keep)) this.bytes -= this.ops.bytes(dropped);
    this.entries.push(p); this.bytes += this.ops.bytes(p); this.cursor++;
    while (this.bytes > this.maxBytes && this.entries.length > 1 && this.cursor > this.base + 1) { this.bytes -= this.ops.bytes(this.entries.shift()!); this.base++; }
    return true;
  }
  undo(): P | null { if (!this.canUndo) return null; const p = this.entries[this.cursor - 1 - this.base]; this.ops.undo(p); this.cursor--; return p; }
  redo(): P | null { if (!this.canRedo) return null; const p = this.entries[this.cursor - this.base]; this.ops.redo(p); this.cursor++; return p; }
  /** Applied patches recorded at or after absolute cursor `at`, newest first (History Brush). */
  patchesSince(at: number): P[] { const out: P[] = []; for (let i = this.cursor - 1; i >= Math.max(at, this.base); i--) out.push(this.entries[i - this.base]); return out; }
  /** Move to an absolute cursor. `reached` is false when the target fell off the byte cap. */
  seek(target: number): { applied: P[]; reached: boolean } {
    const applied: P[] = [];
    while (this.cursor > target) { const p = this.undo(); if (!p) break; applied.push(p); }
    while (this.cursor < target) { const p = this.redo(); if (!p) break; applied.push(p); }
    return { applied, reached: this.cursor === target };
  }
}

export function parseRev(rev: string | undefined | null): { epoch: string; cursor: number } | null {
  if (!rev) return null; const i = rev.lastIndexOf(':'); if (i <= 0) return null;
  const cursor = Number(rev.slice(i + 1)); return Number.isFinite(cursor) ? { epoch: rev.slice(0, i), cursor } : null;
}

export type ReconcilePlan =
  | { kind: 'none' }
  /** Our own journal: seek pixels to `cursor`, then adopt the snapshot JSON. */
  | { kind: 'seek'; cursor: number }
  /** Unknown epoch (another tab, reopened doc, pre-studio legacy state): adopt the JSON, no pixel seek. */
  | { kind: 'adopt' };

/** What the studio must do when the device it shows changes under it. */
export function planReconcile(journal: { epoch: string; cursor: number }, incoming: { raster?: unknown; rasterRev?: string }, lastSent: { raster?: unknown; rev?: string } | null, baseRev?: string | null): ReconcilePlan {
  if (lastSent && incoming.raster === lastSent.raster && incoming.rasterRev === lastSent.rev) return { kind: 'none' };
  const r = parseRev(incoming.rasterRev);
  if (r && r.epoch === journal.epoch) return { kind: 'seek', cursor: r.cursor };
  // The rev the session opened at (or no rev at all: legacy layers before the first studio
  // edit) is the state before every patch in this journal = cursor 0.
  if ((incoming.rasterRev ?? null) === (baseRev ?? null) || !incoming.rasterRev) return { kind: 'seek', cursor: 0 };
  return { kind: 'adopt' };
}

// ── Asset aliases (runtime ⇄ stored ids) ────────────────────────────────────────────────────
export class AssetAliases {
  /** runtime key → stored id of its last persisted pixels (valid only while the key is clean). */
  readonly stored = new Map<string, string>();
  /** stored id → runtime key that owns those pixels in this session. */
  readonly runtime = new Map<string, string>();
  record(runtimeKey: string, storedId: string) {
    this.stored.set(runtimeKey, storedId);
    if (storedId !== runtimeKey) this.runtime.set(storedId, runtimeKey);
  }
  /** Outgoing: clean runtime keys → stored ids (dirty keys stay runtime until the next persist). */
  toStored(doc: RasterDocument, isDirty: (key: string) => boolean): RasterDocument {
    const ids = collectAssetIds(doc), map = new Map<string, string>();
    for (const k of [...ids.bitmaps, ...ids.masks]) { const s = this.stored.get(k); if (s && s !== k && !isDirty(k)) map.set(k, s); }
    return map.size ? remapAssets(doc, map) : doc;
  }
  /** Incoming: stored ids this session owns → their runtime keys (`has` = runtime pixels still cached). */
  toRuntime(doc: RasterDocument, has: (key: string) => boolean): RasterDocument {
    const ids = collectAssetIds(doc), map = new Map<string, string>();
    for (const k of [...ids.bitmaps, ...ids.masks]) { const r = this.runtime.get(k); if (r && r !== k && has(r)) map.set(k, r); }
    return map.size ? remapAssets(doc, map) : doc;
  }
  /** True when every key in the doc is a stored id or a clean runtime key (safe to save to disk). */
  fullyStored(doc: RasterDocument, isDirty: (key: string) => boolean): boolean {
    const ids = collectAssetIds(doc);
    for (const k of [...ids.bitmaps, ...ids.masks]) if (k.startsWith('mem:') && (isDirty(k) || !this.stored.has(k))) return false;
    return true;
  }
}

// ── Studio history log (History panel) ──────────────────────────────────────────────────────
// Mirrors telaHistory.recordOp's coalescing so each row is one Tela undo step; clicking a
// row = that many TelaView undo/redo steps.
export interface StudioStep { id: number; label: string; rev: string; at: number; key: string | null }
export class StudioHistoryLog {
  steps: StudioStep[] = [];
  /** Index of the current state in `steps` (−1 = the state before the first logged step). */
  index = -1;
  private seq = 0; private lastKey: string | null = null; private lastAt = 0;
  constructor(public coalesceMs = 900, public limit = 200) {}
  record(label: string, rev: string, coalesce: string | null, now = Date.now()): StudioStep {
    if (coalesce && coalesce === this.lastKey && now - this.lastAt < this.coalesceMs && this.index >= 0 && this.index === this.steps.length - 1) {
      const cur = this.steps[this.index]; cur.rev = rev; cur.at = now; this.lastAt = now; return cur;
    }
    this.steps = this.steps.slice(0, this.index + 1);
    const step: StudioStep = { id: ++this.seq, label, rev, at: now, key: coalesce };
    this.steps.push(step); if (this.steps.length > this.limit) this.steps.shift();
    this.index = this.steps.length - 1; this.lastKey = coalesce; this.lastAt = now; return step;
  }
  seal() { this.lastKey = null; }
  /** Undo/redo moved the doc: follow along (the doc history is the source of truth). */
  moved(dir: 'undo' | 'redo') { this.index = dir === 'undo' ? Math.max(-1, this.index - 1) : Math.min(this.steps.length - 1, this.index + 1); this.lastKey = null; }
  /** Undo (negative) / redo (positive) count that brings the doc to step `i` (−1 = before all). */
  distanceTo(i: number) { return i - this.index; }
}

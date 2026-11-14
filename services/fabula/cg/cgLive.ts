// cgLive — resolve the LIVE parts of a graphic ref at draw time:
//   • data bindings → field values from the live data hub's latest snapshot
//   • tracker anchors → a per-frame offset (and scale) that pins the graphic to a subject
// and keep "follow" rundowns in sync with their source (one rundown item per row; new
// rows — a name added to the Tela sheet — append automatically).
//
// Kept apart from cgEvaluate so the evaluator stays pure and node-testable; hosts call
// resolveLiveRef() just before evaluating. The offline export uses data but not anchors.
import { liveTable, onAnyLiveData, subscribeSource } from '../../liveData/liveDataHub';
import { resolveBinding, selectRow } from '../../liveData/binding';
import { trackerState, useTracker } from '../../liveTracking/trackerHub';
import { cgBounds } from './cgEvaluate';
import { CG_W, CG_H, type CgGraphic, type CgGraphicRef } from './cgTypes';
import type { CgPlayout, CgSlotId } from './cgPlayout';

/** Fields from the ref's live binding (empty when the source hasn't loaded). */
export function liveFields(ref: CgGraphicRef | null | undefined): Record<string, string> {
  if (!ref?.data) return {};
  return resolveBinding(ref.data, liveTable(ref.data.sourceId));
}

export interface LiveResolveOpts { tracking?: boolean }

/** A ref with live fields merged and the anchor turned into an offset. Returns `null` when
 *  `hideWhenLost` hides the graphic. Cheap: no allocation when nothing is live. */
export function resolveLiveRef(g: CgGraphic, ref: CgGraphicRef | null | undefined, opts: LiveResolveOpts = { tracking: true }): CgGraphicRef | null | undefined {
  if (!ref || (!ref.data && !ref.anchor)) return ref;
  let out: CgGraphicRef = ref;
  if (ref.data) {
    const f = liveFields(ref);
    if (Object.keys(f).length) out = { ...out, fields: { ...(ref.fields || {}), ...f } };
  }
  if (ref.anchor && opts.tracking !== false) {
    const a = ref.anchor, st = trackerState(a.trackerId), p = st?.anchors[a.point];
    if (!p || st?.status !== 'tracking') {
      if (a.hideWhenLost && st && st.status === 'lost') return null;
      return out;
    }
    const b = cgBounds(g);
    const o = a.origin || { x: b.x + b.w / 2, y: b.y };
    const scale = (a.scaleWithSubject ? Math.max(0.4, Math.min(2.5, st.scale)) : 1) * (ref.offset?.scale ?? 1);
    // offset is applied about the frame centre (see drawCgFrameData), so solve for it:
    const tx = p.x * CG_W + (a.dx || 0), ty = p.y * CG_H + (a.dy || 0);
    out = { ...out, offset: { x: tx - (CG_W / 2 + (o.x - CG_W / 2) * scale), y: ty - (CG_H / 2 + (o.y - CG_H / 2) * scale), scale } };
  }
  return out;
}

/** Keep trackers running for every anchored graphic on air (call once per playout master). */
export function keepAnchoredTrackersRunning(playout: CgPlayout): () => void {
  const held = new Map<string, () => void>();
  const sync = () => {
    const want = new Set(playout.state.onAir.map(a => a.ref.anchor?.trackerId).filter(Boolean) as string[]);
    for (const [id, release] of held) if (!want.has(id)) { release(); held.delete(id); }
    for (const id of want) if (!held.has(id)) held.set(id, useTracker(id));
  };
  sync();
  const off = playout.subscribe(sync);
  return () => { off(); for (const r of held.values()) r(); held.clear(); };
}

/** Keep every live data source used by on-air or rundown graphics subscribed. */
export function keepBoundSourcesLive(playout: CgPlayout): () => void {
  const held = new Map<string, () => void>();
  const sync = () => {
    const ids = new Set<string>();
    for (const a of playout.state.onAir) if (a.ref.data) ids.add(a.ref.data.sourceId);
    for (const r of playout.state.rundown) if (r.ref.data) ids.add(r.ref.data.sourceId);
    for (const f of playout.state.follows || []) ids.add(f.sourceId);
    for (const [id, off] of held) if (!ids.has(id)) { off(); held.delete(id); }
    for (const id of ids) if (!held.has(id)) held.set(id, subscribeSource(id, () => undefined));
  };
  sync();
  const off = playout.subscribe(sync);
  return () => { off(); for (const o of held.values()) o(); held.clear(); };
}

// ── follow rundowns: one item per source row ─────────────────────────────────
export interface CgFollow { id: string; sourceId: string; ref: CgGraphicRef; labelColumn?: string; slot?: CgSlotId; seen: number }

/** Expand rows the follow hasn't seen yet into rundown items (pinned to their row). */
export function syncFollow(playout: CgPlayout, f: CgFollow): number {
  const t = liveTable(f.sourceId); if (!t || !f.ref.data) return 0;
  let added = 0;
  for (let i = f.seen; i < t.rows.length; i++) {
    const { row } = selectRow(t, { mode: 'index', index: i });
    const label = (f.labelColumn && row?.[f.labelColumn]) || Object.values(row || {}).find(Boolean) || `Row ${i + 1}`;
    playout.addToRundown({ ...f.ref, data: { ...f.ref.data, row: { mode: 'row-of-item' }, pinnedRow: i } }, `${label}`, f.slot);
    added++;
  }
  if (t.rows.length !== f.seen) playout.setFollows((playout.state.follows || []).map(x => (x.id === f.id ? { ...x, seen: t.rows.length } : x)));
  return added;
}

/** Master-side: whenever any followed source changes, append its new rows. */
export function runFollows(playout: CgPlayout): () => void {
  const tick = () => { for (const f of playout.state.follows || []) syncFollow(playout, f); };
  const off = onAnyLiveData(() => tick());
  tick();
  return off;
}

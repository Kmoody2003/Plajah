// Set-to-Cut — build a Fabula edit project from a production's takes and hand it off.
// ---------------------------------------------------------------------------------
// The whole "the edit starts as you shoot" thesis. There is NO Fabula-side change:
// a Fabula project is a plain JSON blob, and Fabula boots from a `studio:handoff` intent.
// We write the same keys Fabula reads (see services/melos/beats/sendToFabula.ts and the
// boot consumer at components/Fabula/Fabula.jsx) then fire OPEN_FABULA.
//
// Mapping: one film scene → one media BIN (a string tag on each asset). Every take with a
// proxy → a mediaPool asset in its scene's bin. The select per scene, laid in scene order
// on V1 (+ a linked A1 pair so picture AND sound play), IS the living rough cut.
//
// LIVING: the first assembly creates a Fabula project and remembers it (localStorage link).
// Every later assembly UPDATES that same project's "Live Assembly" edit + media pool in
// place — new takes appear, re-circled selects swap — while any other edit the editor made
// is left untouched.

import { set as idbSet, get as idbGet } from 'idb-keyval';
import type { Production, ProductionScene, ProductionTake } from './filmProductionService';

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

const LINK_KEY = (productionId: string) => `filmEdit:link:${productionId}`;
export const LIVE_EDIT_TITLE = 'Live Assembly';

/** Order scenes the way the cut should read: shoot day, then scene order, then numeric scene number. */
export function orderScenes(scenes: ProductionScene[]): ProductionScene[] {
  return [...scenes].sort((a, b) =>
    (a.shootDay - b.shootDay) ||
    ((a.order ?? 0) - (b.order ?? 0)) ||
    a.sceneNum.localeCompare(b.sceneNum, undefined, { numeric: true }),
  );
}

const hasMedia = (t: ProductionTake) => !!(t.proxyUrl || t.proxyAssetId);

export type SelectReason = 'circled' | 'best-reading' | 'rated' | 'first-take';
export interface SelectPick { take: ProductionTake; reason: SelectReason }

/**
 * The take that represents a scene in the rough cut. The director's circle always wins; then the
 * story-aware pick (highest transcript-vs-script match); then rating; then the earliest take.
 * NG takes and takes with no playable proxy are never candidates.
 */
export function pickSelect(sceneId: string, takes: ProductionTake[]): SelectPick | undefined {
  const c = takes.filter(t => t.sceneId === sceneId && t.status !== 'NG' && hasMedia(t));
  if (!c.length) return undefined;
  const circled = c.filter(t => t.circled).sort((a, b) => a.takeNumber - b.takeNumber)[0];
  if (circled) return { take: circled, reason: 'circled' };
  const scored = c.filter(t => typeof t.matchScore === 'number');
  if (scored.length) {
    const best = [...scored].sort((a, b) => (b.matchScore! - a.matchScore!) || (b.rating || 0) - (a.rating || 0) || a.takeNumber - b.takeNumber)[0];
    return { take: best, reason: 'best-reading' };
  }
  const rated = c.filter(t => t.rating);
  if (rated.length) return { take: [...rated].sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.takeNumber - b.takeNumber)[0], reason: 'rated' };
  return { take: [...c].sort((a, b) => a.takeNumber - b.takeNumber)[0], reason: 'first-take' };
}

export interface AssemblyRow {
  scene: ProductionScene;
  takes: ProductionTake[];       // every take logged for the scene, by take number
  select: SelectPick | null;     // what goes in the cut (null = coverage gap)
  start: number;                 // seconds into the rough cut (valid when select)
  duration: number;
}
export interface AssemblyPlan { rows: AssemblyRow[]; runtime: number; covered: number; total: number; gaps: ProductionScene[] }

/** Pure: the rough cut as data. OMIT scenes are not part of the film, so they are never cut in. */
export function planAssembly(scenes: ProductionScene[], takes: ProductionTake[]): AssemblyPlan {
  const ordered = orderScenes(scenes).filter(s => s.status !== 'OMIT');
  let cursor = 0;
  const rows: AssemblyRow[] = ordered.map(scene => {
    const st = takes.filter(t => t.sceneId === scene.id).sort((a, b) => a.takeNumber - b.takeNumber);
    const select = pickSelect(scene.id, takes) || null;
    const duration = select ? (select.take.duration || 5) : 0;
    const row = { scene, takes: st, select, start: cursor, duration };
    cursor += duration;
    return row;
  });
  const gaps = rows.filter(r => !r.select).map(r => r.scene);
  return { rows, runtime: cursor, covered: rows.length - gaps.length, total: rows.length, gaps };
}

export interface BuildEditResult { prodId: string; editId: string; sceneCount: number; clipCount: number; takeCount: number; runtime: number; updated: boolean; }
export interface BuildEditOpts {
  title?: string;
  /** Hand off to Fabula (OPEN_FABULA) when done. Default true. */
  open?: boolean;
  /** Always create a fresh project instead of updating the linked one. */
  forceNew?: boolean;
}

/** The Fabula project this production's live cut is linked to, if one still exists locally. */
export async function getLinkedFabulaProject(productionId: string): Promise<{ prodId: string; title: string } | null> {
  try {
    const id = localStorage.getItem(LINK_KEY(productionId));
    if (!id) return null;
    const p = (await idbGet(`studio:prod:${id}`)) as { title?: string } | undefined;
    return p ? { prodId: id, title: p.title || 'Live Edit' } : null;
  } catch { return null; }
}

/** The "· A" clip is what the playback engine plays sound from (the picture clip is flagged `av`). */
function clipPair(t: ProductionTake, label: string, start: number, dur: number) {
  const linkId = uid();
  const base = { start, duration: dur, srcIn: 0, kind: 'media', assetId: `a_${t.id}`, linkId };
  return [
    { id: uid(), trackId: 'v1', ...base, label, av: true },
    { id: uid(), trackId: 'a1', ...base, label: `${label} · A` },
  ];
}

async function bumpIndex(id: string, title: string, sceneCount: number, now: number) {
  const idx = ((await idbGet('studio:index')) as { list?: Array<{ id: string }> } | undefined) || {};
  await idbSet('studio:index', {
    list: [{ id, title, type: 'film', updated: now, sceneCount }, ...((idx.list || []).filter(x => x.id !== id))],
  });
}

export async function buildFabulaProjectFromTakes(
  production: Pick<Production, 'id' | 'title'>,
  scenes: ProductionScene[],
  takes: ProductionTake[],
  opts: BuildEditOpts = {},
): Promise<BuildEditResult | null> {
  const shot = takes.filter(hasMedia);
  if (!shot.length) return null;
  const plan = planAssembly(scenes, takes);
  const now = Date.now();
  const sceneById = new Map(orderScenes(scenes).map(s => [s.id, s]));
  const binFor = (sceneId: string) => {
    const s = sceneById.get(sceneId);
    return s ? `Sc ${s.sceneNum} · ${s.set}`.slice(0, 60) : 'Unsorted';
  };

  // Every shot take → a mediaPool asset, tagged into its scene's bin.
  const assets = shot.map(t => ({
    id: `a_${t.id}`,
    name: `Sc ${t.sceneNum} · Take ${t.takeNumber}${t.circled ? ' ◎' : ''}`,
    type: 'video',
    url: t.proxyUrl || undefined,
    cloudUrl: t.proxyUrl || undefined,
    duration: t.duration || 5,
    bin: binFor(t.sceneId),
    tags: ['on-set', t.status.toLowerCase()],
    offline: !t.proxyUrl,
    // Provenance for the round-trip back to the production.
    filmTakeId: t.id, filmSceneId: t.sceneId, filmProductionId: production.id,
  }));
  const bins = [...new Set(plan.rows.map(r => binFor(r.scene.id)))];

  const clips: Array<Record<string, unknown>> = [];
  for (const r of plan.rows) {
    if (!r.select) continue;
    clips.push(...clipPair(r.select.take, `Sc ${r.scene.sceneNum} · T${r.select.take.takeNumber}`, r.start, r.duration));
  }

  // ── Living update: patch the linked project in place instead of spawning a duplicate ──────────
  const linked = opts.forceNew ? null : await getLinkedFabulaProject(production.id);
  if (linked) {
    const prod = (await idbGet(`studio:prod:${linked.prodId}`)) as any;
    const keepAssets = (prod.mediaPool || []).filter((a: any) => a.filmProductionId !== production.id); // editor's own imports survive
    prod.mediaPool = [...keepAssets, ...assets];
    prod.bins = [...new Set([...(prod.bins || []), ...bins])];
    prod.edits = Array.isArray(prod.edits) ? prod.edits : [];
    let live = prod.edits.find((e: any) => e.id === prod.liveEditId) || prod.edits.find((e: any) => e.title === LIVE_EDIT_TITLE);
    if (!live) { live = { id: uid(), title: LIVE_EDIT_TITLE, timeline: { clips: [], trackSettings: {} } }; prod.edits.unshift(live); }
    live.timeline = { ...(live.timeline || {}), clips, trackSettings: live.timeline?.trackSettings || {} };
    live.updatedAt = now; prod.liveEditId = live.id; prod.updatedAt = now;
    await idbSet(`studio:prod:${linked.prodId}`, prod);
    await bumpIndex(linked.prodId, prod.title, plan.covered, now);
    if (opts.open !== false) { await idbSet('studio:handoff', { prodId: linked.prodId, editId: live.id }); window.dispatchEvent(new CustomEvent('OPEN_FABULA')); }
    return { prodId: linked.prodId, editId: live.id, sceneCount: plan.total, clipCount: plan.covered, takeCount: shot.length, runtime: plan.runtime, updated: true };
  }

  const prodId = uid(), editId = uid();
  const title = (opts.title || `${production.title} — Live Edit`).slice(0, 80);
  // Fabula's `migrate` fills tracks/design/etc. defaults — we supply the essentials.
  const prod = {
    id: prodId, title, type: 'film',
    description: `Auto-assembled from ${production.title} · ${plan.covered} scene${plan.covered === 1 ? '' : 's'}`,
    themes: '', world: '', cast: [], mediaPool: assets,
    defaults: { style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific', format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false } },
    acts: [{ id: uid(), number: 1, title: 'ACT I', scenes: [] }],
    edits: [{ id: editId, title: LIVE_EDIT_TITLE, timeline: { clips, trackSettings: {} }, updatedAt: now }],
    liveEditId: editId,
    bins, worldCats: {}, design: {},
    filmProductionId: production.id,
    createdAt: now, updatedAt: now,
  };
  await idbSet(`studio:prod:${prodId}`, prod);
  await bumpIndex(prodId, title, plan.covered, now);
  try { localStorage.setItem(LINK_KEY(production.id), prodId); } catch { /* the link is a convenience */ }
  if (opts.open !== false) { await idbSet('studio:handoff', { prodId, editId }); window.dispatchEvent(new CustomEvent('OPEN_FABULA')); }
  return { prodId, editId, sceneCount: plan.total, clipCount: plan.covered, takeCount: shot.length, runtime: plan.runtime, updated: false };
}

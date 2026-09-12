// Set-to-Cut — build a Fabula edit project from a production's takes and hand it off.
// ---------------------------------------------------------------------------------
// The whole "the edit starts as you shoot" thesis, P1. There is NO Fabula-side change:
// a Fabula project is a plain JSON blob, and Fabula boots from a `studio:handoff` intent.
// We write the same keys Fabula reads (see services/melos/beats/sendToFabula.ts and the
// boot consumer at components/Fabula/Fabula.jsx) then fire OPEN_FABULA.
//
// Mapping: one film scene → one media BIN (a string tag on each asset). Every take with a
// proxy → a mediaPool asset in its scene's bin. The circled/best take per scene, laid in
// scene order on V1, IS the living rough cut (edits[0].timeline.clips).

import { set as idbSet, get as idbGet } from 'idb-keyval';
import type { Production, ProductionScene, ProductionTake } from './filmProductionService';

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export interface BuildEditResult { prodId: string; editId: string; sceneCount: number; clipCount: number; takeCount: number; }
export interface BuildEditOpts { title?: string }

/** Order scenes the way the cut should read: shoot day, then scene order, then numeric scene number. */
function orderScenes(scenes: ProductionScene[]): ProductionScene[] {
  return [...scenes].sort((a, b) =>
    (a.shootDay - b.shootDay) ||
    ((a.order ?? 0) - (b.order ?? 0)) ||
    a.sceneNum.localeCompare(b.sceneNum, undefined, { numeric: true }),
  );
}

/** The take that represents a scene in the rough cut: circled → highest-rated → first non-NG. */
function pickSelect(sceneId: string, takes: ProductionTake[]): ProductionTake | undefined {
  const candidates = takes.filter(t => t.sceneId === sceneId && t.status !== 'NG' && (t.proxyUrl || t.proxyAssetId));
  if (!candidates.length) return undefined;
  return candidates.find(t => t.circled)
    || [...candidates].sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.takeNumber - b.takeNumber)[0];
}

export async function buildFabulaProjectFromTakes(
  production: Pick<Production, 'id' | 'title'>,
  scenes: ProductionScene[],
  takes: ProductionTake[],
  opts: BuildEditOpts = {},
): Promise<BuildEditResult | null> {
  const shot = takes.filter(t => t.proxyUrl || t.proxyAssetId);
  if (!shot.length) return null;

  const now = Date.now();
  const prodId = uid(), editId = uid();
  const title = (opts.title || `${production.title} — Live Edit`).slice(0, 80);

  const ordered = orderScenes(scenes);
  const sceneById = new Map(ordered.map(s => [s.id, s]));
  const binFor = (sceneId: string) => {
    const s = sceneById.get(sceneId);
    return s ? `Sc ${s.sceneNum} · ${s.set}`.slice(0, 60) : 'Unsorted';
  };

  // Every shot take → a mediaPool asset, tagged into its scene's bin.
  const mediaPool = shot.map(t => ({
    id: `a_${t.id}`,
    name: `Sc ${t.sceneNum} · Take ${t.takeNumber}${t.circled ? ' ◎' : ''}`,
    type: 'video',
    url: t.proxyUrl || undefined,
    cloudUrl: t.proxyUrl || undefined,
    duration: t.duration || 5,
    bin: binFor(t.sceneId),
    tags: ['on-set', t.status.toLowerCase()],
    offline: !t.proxyUrl,
    // Provenance for a future round-trip back to the production.
    filmTakeId: t.id, filmSceneId: t.sceneId, filmProductionId: production.id,
  }));
  const bins = [...new Set(ordered.map(s => binFor(s.id)))];

  // Rough cut: the select per scene, in scene order, laid end-to-end on V1.
  const clips: Array<Record<string, unknown>> = [];
  let cursor = 0;
  for (const s of ordered) {
    const t = pickSelect(s.id, shot);
    if (!t) continue;
    const dur = t.duration || 5;
    clips.push({ id: uid(), trackId: 'v1', start: cursor, duration: dur, srcIn: 0, kind: 'media', assetId: `a_${t.id}`, label: `Sc ${t.sceneNum} · T${t.takeNumber}` });
    cursor += dur;
  }

  // Fabula's `migrate` fills tracks/design/etc. defaults — we supply the essentials.
  const prod = {
    id: prodId, title, type: 'film',
    description: `Auto-assembled from ${production.title} · ${clips.length} scene${clips.length === 1 ? '' : 's'}`,
    themes: '', world: '', cast: [], mediaPool,
    defaults: { style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific', format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false } },
    acts: [{ id: uid(), number: 1, title: 'ACT I', scenes: [] }],
    edits: [{ id: editId, title: 'Live Assembly', timeline: { clips, trackSettings: {} }, updatedAt: now }],
    bins, worldCats: {}, design: {},
    // Provenance so an "Edit in Fabula" button can round-trip.
    filmProductionId: production.id,
    createdAt: now, updatedAt: now,
  };

  await idbSet(`studio:prod:${prodId}`, prod);
  const idx = (await idbGet('studio:index')) as { list?: Array<{ id: string }> } | undefined || {};
  await idbSet('studio:index', {
    list: [{ id: prodId, title, type: 'film', updated: now, sceneCount: clips.length }, ...((idx.list || []).filter(x => x.id !== prodId))],
  });
  await idbSet('studio:handoff', { prodId, editId });

  window.dispatchEvent(new CustomEvent('OPEN_FABULA'));
  return { prodId, editId, sceneCount: ordered.length, clipCount: clips.length, takeCount: shot.length };
}

/**
 * Hands a generated dossier film to Fabula: writes the production into Fabula's IndexedDB store,
 * sets the one-shot handoff key Fabula consumes on boot, then asks the app to open Fabula.
 * Same mechanism as services/fabulaBridge.ts, so Fabula needs no changes.
 */
import { get as idbGet, set as idbSet } from 'idb-keyval';

export async function openProductionInFabula(prod: any): Promise<{ prodId: string; editId: string }> {
  const now = Date.now();
  const production = { ...prod, createdAt: now, updatedAt: now, edits: prod.edits.map((e: any) => ({ ...e, updatedAt: now })) };
  const editId: string = production.edits[0].id;
  await idbSet('studio:prod:' + production.id, production);
  const idx = (await idbGet('studio:index')) as { list?: any[] } | undefined;
  const entry = { id: production.id, title: production.title, type: production.type, updated: now, sceneCount: 0 };
  await idbSet('studio:index', { list: [entry, ...((idx?.list || []).filter((x: any) => x.id !== production.id))] });
  await idbSet('studio:handoff', { prodId: production.id, editId });
  window.dispatchEvent(new Event('OPEN_FABULA'));
  return { prodId: production.id, editId };
}

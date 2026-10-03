import type { TelaDoc } from '../../types';
import { TELA_TEMPLATE_GALLERY, type TelaDesignTemplate } from './telaTemplateRegistry';
import { PROMO_SUITES } from '../chora/promoTypes';

export const TEMPLATE_LIBRARY_VERSION = 1 as const;
export const TEMPLATE_LIBRARY_STORAGE_KEY = 'plajah.template-library.v1';
export type TemplatePreview =
  | { kind: 'static'; renderer: 'tela' | 'chora'; sourceId: string }
  | { kind: 'motion'; renderer: 'tela' | 'chora' | 'fabula'; sourceId: string; reducedMotion: 'static' }
  | { kind: 'motion'; renderer: 'tela-keyframes'; sourceId: string; reducedMotion: 'static'; recipe: { duration: number; tracks: Array<{ objectId: string; property: 'rotation' | 'x' | 'y' | 'opacity'; from: number; to: number; delay: number; duration: number }> } }
  | { kind: 'audio'; source: 'synthesized-score'; available: true; recipe: { notes: number[]; tempo: number }; label: string }
  | { kind: 'audio'; source: 'release-track'; available: false; reason: string };
export interface LibraryEntry {
  schemaVersion: 1;
  id: string;
  name: string;
  category: string;
  origin: { kind: 'builtin'; sourceId: string; source: 'tela' | 'chora'; revision: 1 };
  stage: 'available' | 'review';
  previews: TemplatePreview[];
}
export interface CustomTemplate {
  id: string;
  name: string;
  origin: { kind: 'custom'; sourceId: string; sourceRevision: 1 };
  document: TelaDoc;
  updatedAt: number;
}
export interface LibraryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
type PromoSource = { id: string; name: string };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function cleanName(value: string): string {
  const result = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!result || result.length > 200) throw new Error('A name between 1 and 200 characters is required.');
  return result;
}
function validCustom(value: unknown): value is CustomTemplate {
  const v = value as CustomTemplate;
  return !!v && /^custom:[a-zA-Z0-9_-]{1,100}$/.test(v.id) && typeof v.name === 'string'
    && !!v.name.trim() && v.name.length <= 200 && v.origin?.kind === 'custom'
    && typeof v.origin.sourceId === 'string' && v.origin.sourceRevision === 1
    && Number.isFinite(v.updatedAt) && !!v.document && typeof v.document.id === 'string'
    && Array.isArray(v.document.frames) && !!v.document.devices && typeof v.document.devices === 'object';
}

/** Version migrations are explicit. Unknown versions never overwrite the saved payload. */
export function decodeCustomLibrary(raw: string): CustomTemplate[] {
  const data = JSON.parse(raw);
  if (data?.schemaVersion !== TEMPLATE_LIBRARY_VERSION || !Array.isArray(data.customs)) {
    throw new Error('Unsupported or damaged template library; the saved data has been preserved.');
  }
  // Originals always come from application source, never from imported storage.
  const customs = data.customs.filter((v: any) => v?.origin?.kind !== 'builtin');
  if (!customs.every(validCustom) || new Set(customs.map((v: CustomTemplate) => v.id)).size !== customs.length) {
    throw new Error('Invalid custom template data; the saved data has been preserved.');
  }
  return clone(customs);
}

export function createTemplateLibrary(options: {
  reviewTemplates?: TelaDesignTemplate[];
  reviewPromos?: readonly PromoSource[];
  storage?: LibraryStorage;
  previewOverrides?: Record<string, TemplatePreview[]>;
} = {}) {
  const builders = new Map<string, () => TelaDoc>();
  const entries: LibraryEntry[] = [];
  const addTela = (t: TelaDesignTemplate, stage: LibraryEntry['stage']) => {
    const id = `builtin:tela:${t.id}`;
    // Snapshot metadata and each built page: edits to callers or returned copies cannot mutate originals.
    const pages = freeze(t.pages.map(p => ({ label: p.label, objects: clone(p.build()) })));
    const width = t.width, height = t.height, kind = t.frameKind, name = t.name;
    builders.set(id, () => {
      const devices: TelaDoc['devices'] = {};
      const frames = pages.map((p, i) => {
        const deviceId = `vector-${i}`;
        devices[deviceId] = { id: deviceId, type: 'VECTOR', width, height, objects: clone(p.objects) };
        return { id: `frame-${i}`, kind, preset: 'FREE' as const, x: i * (width + 48), y: 0, w: width, h: height, deviceIds: [deviceId], label: p.label };
      });
      return { id: '', ownerId: '', title: name, frames, devices, createdAt: 0, updatedAt: 0 };
    });
    entries.push({ schemaVersion: 1, id, name, category: t.collection,
      origin: { kind: 'builtin', source: 'tela', sourceId: t.id, revision: 1 }, stage,
      previews: [{ kind: 'static', renderer: 'tela', sourceId: t.id },
        ...(t.tags.includes('motion') ? [{ kind: 'motion' as const, renderer: t.collection === 'LOWER_THIRD' ? 'fabula' as const : 'tela' as const, sourceId: t.id, reducedMotion: 'static' as const }] : [])] });
  };
  TELA_TEMPLATE_GALLERY.forEach(t => addTela(t, 'available'));
  options.reviewTemplates?.forEach(t => addTela(t, 'review'));
  const addPromo = (t: PromoSource, stage: LibraryEntry['stage']) => entries.push({
    schemaVersion: 1, id: `builtin:chora:${t.id}`, name: t.name, category: 'PROMO_PACKAGE',
    origin: { kind: 'builtin', source: 'chora', sourceId: t.id, revision: 1 }, stage,
    previews: [{ kind: 'static', renderer: 'chora', sourceId: t.id },
      { kind: 'motion', renderer: 'chora', sourceId: t.id, reducedMotion: 'static' },
      { kind: 'audio', source: 'release-track', available: false, reason: 'Choose a release track to audition an actual audio snippet.' }],
  });
  PROMO_SUITES.forEach(t => addPromo(t, 'available'));
  options.reviewPromos?.forEach(t => addPromo(t, 'review'));
  for (const entry of entries) {
    const preview = options.previewOverrides?.[entry.id];
    if (preview) entry.previews = clone(preview);
  }
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Duplicate original template ID.');
  const originals = freeze(entries);
  let customs: CustomTemplate[] = [];
  let loadError: string | null = null;
  try {
    const raw = options.storage?.getItem(TEMPLATE_LIBRARY_STORAGE_KEY);
    if (raw) {
      const loaded = decodeCustomLibrary(raw);
      if (loaded.some(c => originals.some(e => e.id === c.origin.sourceId && e.stage === 'review'))) {
        throw new Error('Saved library includes an unapproved review preset; saved data has been preserved.');
      }
      customs = loaded;
    }
  }
  catch (error) { loadError = error instanceof Error ? error.message : 'Template library could not be loaded.'; }
  const commit = (next: CustomTemplate[]) => {
    if (loadError) throw new Error(loadError);
    if (next.some(c => originals.some(e => e.id === c.origin.sourceId && e.stage === 'review'))) {
      throw new Error('Review designs cannot be installed as presets.');
    }
    options.storage?.setItem(TEMPLATE_LIBRARY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, customs: next }));
    customs = next;
  };
  return {
    originals,
    get loadError() { return loadError; },
    listCustoms: () => clone(customs),
    exportCustoms: () => JSON.stringify({ schemaVersion: 1, customs }),
    restoreCustoms(raw: string) { const next = decodeCustomLibrary(raw); commit(next); },
    createDocument(id: string, ownerId: string, documentId: string): TelaDoc {
      const entry = originals.find(e => e.id === id);
      if (entry?.stage === 'review') throw new Error('This design is awaiting review and cannot be activated.');
      const build = builders.get(id);
      if (!build) throw new Error('This template requires its source application to create a document.');
      return { ...build(), id: documentId, ownerId, createdAt: Date.now(), updatedAt: Date.now() };
    },
    saveCustom(custom: CustomTemplate) {
      if (!validCustom(custom)) throw new Error('Invalid custom template. Originals cannot be replaced.');
      if (originals.some(e => e.id === custom.origin.sourceId && e.stage === 'review')) throw new Error('Review designs cannot be installed as presets.');
      const next = clone(custom); next.name = cleanName(next.name);
      commit([...customs.filter(c => c.id !== next.id), next]);
    },
    deleteCustom(id: string) {
      if (!id.startsWith('custom:')) throw new Error('Original templates cannot be deleted.');
      commit(customs.filter(c => c.id !== id));
    },
  };
}

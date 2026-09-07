// libraryModel.ts — the normalized item model behind the Universal Library.
//
// One shape (LibraryItem) for everything the library shows across Fabula, Melos,
// Tela and Pixels, plus a `preview` descriptor that tells a tile HOW to render
// (a live GL preview, a Melos pattern grid, a Tela page still, or a media
// thumbnail). The Presets shelf is assembled from the registries the apps already
// ship; Personal / Organization / Business come from the orgAssets DAM. Community
// and Stock are deferred (a future update).
import { FX_EFFECTS } from '../../components/plajahPixels/engine/fx/effects';
import { SIGNATURE_WORKS, signatureSource } from '../../components/plajahPixels/engine/presets/signatureShaders';
import { SCENE_CATALOG } from '../../components/plajahPixels/engine/sceneCatalog';
import { FORGE_LOOKS } from '../fabula/forgeLooks';
import { FORGE_TRANSITIONS } from '../fabula/forgeTransitions';
import { TELA_TEMPLATE_GALLERY } from '../tela/telaTemplateRegistry';
import { GENRE_PRESETS } from '../melos/beats/genrePresets';
import { BASSLINES } from '../melos/beats/bassLines';

export type LibrarySourceId = 'personal' | 'org' | 'business' | 'presets' | 'community' | 'stock';
export type LibraryKind = 'fx' | 'shader' | 'gen' | 'look' | 'trans' | 'template' | 'groove' | 'bassline' | 'media';
export type LibraryFilter = 'all' | 'media' | 'audio' | 'footage' | 'presets' | 'templates' | 'fx' | 'shaders' | 'grooves';

export interface LibraryPreview {
  mode: 'fx' | 'shader' | 'gen' | 'trans' | 'look' | 'groove' | 'bassline' | 'tela' | 'image' | 'video' | 'swatch';
  effectId?: string; params?: number[];
  genMode?: string;
  shaderSrc?: string;
  transId?: string; transParams?: Record<string, number>;
  look?: { effectId: string; params: number[]; mix?: number }[];
  pattern?: unknown; notes?: unknown[]; bpm?: number;
  telaTemplateId?: string;
  url?: string;
  swatch?: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  source: LibrarySourceId;
  kind: LibraryKind;
  category?: string;
  author?: string;
  tags?: string[];
  typeLabel: string;
  preview: LibraryPreview;
}

const paramsForEffect = (e: any): number[] => (e.params || []).map((p: any) => p.default ?? 0);
function resolveLookChain(steps: any[]): { effectId: string; params: number[]; mix?: number }[] {
  const out: { effectId: string; params: number[]; mix?: number }[] = [];
  for (const st of steps || []) {
    const eff: any = FX_EFFECTS.find((x) => x.id === st.effectId); if (!eff) continue;
    const preset = st.presetId ? eff.presets?.find((p: any) => p.id === st.presetId) : null;
    const params = (eff.params || []).map((p: any) => st.params?.[p.key] ?? preset?.params?.[p.key] ?? p.default ?? 0);
    out.push({ effectId: st.effectId, params, ...(st.mix != null ? { mix: st.mix } : {}) });
  }
  return out;
}

// ── The Presets shelf — everything the platform ships, live-previewable ────────
let _presets: LibraryItem[] | null = null;
export function presetShelf(): LibraryItem[] {
  if (_presets) return _presets;
  const out: LibraryItem[] = [];

  for (const e of FX_EFFECTS as any[])
    out.push({ id: 'fx:' + e.id, name: e.name, source: 'presets', kind: 'fx', category: e.category, author: 'Plajah', tags: e.presets?.map((p: any) => p.name), typeLabel: String(e.category || 'effect').toUpperCase(), preview: { mode: 'fx', effectId: e.id, params: paramsForEffect(e) } });

  for (const w of SIGNATURE_WORKS as any[])
    out.push({ id: 'shader:' + w.id, name: w.name, source: 'presets', kind: 'shader', category: 'Series ' + w.series, author: w.setTitle || 'Signature', tags: (w.reacts || []).map((r: any) => r[0]), typeLabel: 'SHADER', preview: { mode: 'shader', effectId: w.id, shaderSrc: signatureSource(w), params: (w.params || []).map((p: any) => p.def ?? 0) } });

  for (const g of SCENE_CATALOG as any[])
    out.push({ id: 'gen:' + g.mode, name: g.name, source: 'presets', kind: 'gen', category: g.cat, author: 'Plajah', typeLabel: 'GENERATOR', preview: { mode: 'gen', genMode: g.mode } });

  for (const lk of FORGE_LOOKS as any[])
    out.push({ id: 'look:' + lk.id, name: lk.name, source: 'presets', kind: 'look', category: lk.category, author: lk.builtIn ? 'Plajah' : 'You', tags: lk.steps?.map((s: any) => s.effectId), typeLabel: 'LOOK', preview: { mode: 'look', effectId: lk.id, look: resolveLookChain(lk.steps) } });

  for (const tr of FORGE_TRANSITIONS as any[]) {
    const preset = tr.presets?.[0];
    out.push({ id: 'trans:' + tr.id, name: tr.name, source: 'presets', kind: 'trans', category: tr.family, author: 'Plajah', typeLabel: 'TRANSITION', preview: { mode: 'trans', transId: tr.id, transParams: preset?.params } });
  }

  for (const t of TELA_TEMPLATE_GALLERY as any[])
    out.push({ id: 'tela:' + t.id, name: t.name, source: 'presets', kind: 'template', category: t.collection || 'template', author: t.group || 'Tela', typeLabel: String(t.collection || 'TEMPLATE').toUpperCase(), preview: { mode: 'tela', telaTemplateId: t.id } });

  for (const g of GENRE_PRESETS as any[])
    out.push({ id: 'groove:' + g.id, name: g.name, source: 'presets', kind: 'groove', category: g.genre, author: 'Plajah', typeLabel: 'GROOVE · ' + g.bpm + 'BPM', preview: { mode: 'groove', pattern: g.make(), bpm: g.bpm } });

  for (const b of BASSLINES as any[])
    out.push({ id: 'bass:' + b.id, name: b.name, source: 'presets', kind: 'bassline', category: b.genre, author: 'Plajah', typeLabel: 'BASSLINE', preview: { mode: 'bassline', notes: b.notes, bpm: b.bpm } });

  _presets = out;
  return out;
}

// ── Filter helpers ─────────────────────────────────────────────────────────────
const FILTER_KINDS: Record<LibraryFilter, LibraryKind[] | null> = {
  all: null,
  media: ['media', 'template'],
  audio: ['bassline', 'groove', 'media'],
  footage: ['media'],
  presets: ['fx', 'shader', 'gen', 'look', 'trans', 'groove', 'bassline'],
  templates: ['template'],
  fx: ['fx', 'gen', 'look', 'trans'],
  shaders: ['shader'],
  grooves: ['groove', 'bassline'],
};

export function filterItems(items: LibraryItem[], filter: LibraryFilter, query: string): LibraryItem[] {
  const ks = FILTER_KINDS[filter];
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (ks && !ks.includes(it.kind)) return false;
    if (!q) return true;
    return it.name.toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q) || (it.author || '').toLowerCase().includes(q) || (it.tags || []).some((t) => String(t).toLowerCase().includes(q));
  });
}

export const LIBRARY_SOURCES: { id: LibrarySourceId; label: string; icon: string; accent: string; later?: boolean }[] = [
  { id: 'personal', label: 'Personal', icon: '👤', accent: '#00DAF3' },
  { id: 'org', label: 'Organization', icon: '🏢', accent: '#D0BCFF' },
  { id: 'business', label: 'Business', icon: '🛍', accent: '#FF8C00' },
  { id: 'presets', label: 'Presets', icon: '✦', accent: '#8B5CFF' },
  { id: 'community', label: 'Community', icon: '🌐', accent: '#D40055', later: true },
  { id: 'stock', label: 'Stock', icon: '🎞', accent: '#06D6A0', later: true },
];

export const LIBRARY_FILTERS: LibraryFilter[] = ['all', 'media', 'audio', 'footage', 'presets', 'templates', 'fx', 'shaders', 'grooves'];

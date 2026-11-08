// Putting a CAD model into a Tela document, and getting it back out.
//
// A model becomes one MEDIA device: `src` is what every surface can show (GLB or SVG),
// `cad.modelSrc` is the semantic JSON, `cad.sourceSrc` is the untouched original. No new
// document format; IFC, STEP, DXF and 3MF are doors in and out.

import type { TelaMediaDevice, TelaCadRef } from '../../types';
import { type CadModel, type CadModelJson, MM_PER_UNIT, toModelJson } from './model';
import { drawingToSvg } from './dxf';
import { modelToGlb } from './scene';

export type Upload = (file: File) => Promise<{ src: string; storagePath?: string; sessionOnly: boolean }>;

const base = (n: string) => n.replace(/\.[^.]+$/, '');

export function cadStats(m: CadModel): TelaCadRef['stats'] {
  const k = MM_PER_UNIT[m.units];
  const size = [0, 1, 2].map(i => Math.max(0, (m.bounds.max[i] - m.bounds.min[i]) * k)) as [number, number, number];
  return { elements: m.elements.length, meshes: m.meshes.length, triangles: m.meshes.reduce((s, x) => s + x.indices.length / 3, 0), layers: m.layers.length, entities: m.entities.length, sizeMm: size };
}

export async function cadToTelaDevice(m: CadModel, source: { name: string; bytes: Uint8Array }, upload: Upload, makeId: () => string): Promise<TelaMediaDevice> {
  const octet = 'application/octet-stream';
  const [src, json, orig] = await Promise.all([
    m.is2D
      ? upload(new File([drawingToSvg(m, { width: 1600 })], `${base(m.name)}.svg`, { type: 'image/svg+xml' }))
      : modelToGlb(m).then(glb => upload(new File([glb as BlobPart], `${base(m.name)}.glb`, { type: 'model/gltf-binary' }))),
    upload(new File([JSON.stringify(toModelJson(m))], `${base(m.name)}.cad.json`, { type: octet })),
    upload(new File([source.bytes as BlobPart], source.name, { type: octet })),
  ]);
  const stats = cadStats(m);
  const aspect = m.is2D && stats.sizeMm[0] > 0 && stats.sizeMm[1] > 0 ? stats.sizeMm[1] / stats.sizeMm[0] : 9 / 16;
  const width = 960; const height = Math.round(Math.min(1.4, Math.max(0.35, aspect)) * width);
  return {
    id: makeId(), type: 'MEDIA', kind: m.is2D ? 'IMAGE' : 'MODEL_3D', name: source.name,
    src: src.src, storagePath: src.storagePath, sessionOnly: src.sessionOnly || json.sessionOnly || orig.sessionOnly,
    mimeType: m.is2D ? 'image/svg+xml' : 'model/gltf-binary', size: source.bytes.length, width, height,
    cad: { role: m.is2D ? 'DRAFT_2D' : 'MODEL', format: m.format, units: m.units, modelSrc: json.src, modelStoragePath: json.storagePath, sourceSrc: orig.src, sourceStoragePath: orig.storagePath, sourceName: source.name, stats },
  };
}

/** Fetch the original file back (the room re-reads it, so every import fix reaches old documents). */
export async function fetchCadSource(ref: TelaCadRef): Promise<{ name: string; bytes: Uint8Array }> {
  const r = await fetch(ref.sourceSrc, { credentials: 'include' });
  if (!r.ok) throw new Error(`Could not load ${ref.sourceName} (${r.status})`);
  return { name: ref.sourceName, bytes: new Uint8Array(await r.arrayBuffer()) };
}

export async function fetchCadJson(ref: TelaCadRef): Promise<CadModelJson> {
  const r = await fetch(ref.modelSrc, { credentials: 'include' });
  if (!r.ok) throw new Error(`Could not load the model data (${r.status})`);
  return r.json();
}

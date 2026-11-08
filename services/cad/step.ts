// STEP / IGES / BREP through occt-import-js (OpenCASCADE, LGPL-2.1, its own WASM module).
// This is the import half of OCCT; the full modelling kernel arrives in a later phase.

import { type CadModel, type CadElement, type CadFormat, emptyModel, cadId } from './model';
import { addMesh, finish } from './mesh';

export interface OcctApi {
  ReadStepFile(content: Uint8Array, params: object | null): OcctResult;
  ReadIgesFile(content: Uint8Array, params: object | null): OcctResult;
  ReadBrepFile(content: Uint8Array, params: object | null): OcctResult;
}
interface OcctNode { name: string; meshes: number[]; children: OcctNode[] }
interface OcctMesh { name: string; color?: number[]; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] }; brep_faces?: Array<{ first: number; last: number; color: number[] | null }> }
interface OcctResult { success: boolean; root: OcctNode; meshes: OcctMesh[] }

const rgb = (c?: number[] | null) => c ? '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('') : undefined;

export function parseStep(occt: OcctApi, bytes: Uint8Array, name: string, format: Extract<CadFormat, 'step' | 'iges' | 'brep'> = 'step'): CadModel {
  const m = emptyModel(name, format, 'occt-import-js'); m.units = 'mm';
  const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 };
  const res = format === 'iges' ? occt.ReadIgesFile(bytes, params) : format === 'brep' ? occt.ReadBrepFile(bytes, params) : occt.ReadStepFile(bytes, params);
  if (!res?.success) { m.warnings.push('OpenCASCADE could not read this file.'); return m; }
  const meshIds: string[] = res.meshes.map(mesh => {
    const faces = mesh.brep_faces?.length ?? 0;
    const created = addMesh(m, { name: mesh.name || 'Body', positions: new Float32Array(mesh.attributes.position.array), indices: new Uint32Array(mesh.index.array), normals: mesh.attributes.normal ? new Float32Array(mesh.attributes.normal.array) : undefined, color: rgb(mesh.color) ?? rgb(mesh.brep_faces?.find(f => f.color)?.color) });
    if (faces) m.meta[`faces:${created.id}`] = String(faces);
    return created.id;
  });
  const walk = (node: OcctNode, parent: string | undefined) => {
    const el: CadElement = { id: cadId('el'), cls: node.children.length ? 'Assembly' : 'Part', name: node.name || (parent ? 'Part' : name.replace(/\.[^.]+$/, '')), parent, meshIds: [], props: {} };
    m.elements.push(el);
    for (const i of node.meshes) { const mid = meshIds[i]; if (!mid) continue; el.meshIds.push(mid); const mesh = m.meshes.find(x => x.id === mid); if (mesh) { mesh.elementId = el.id; const f = m.meta[`faces:${mid}`]; if (f) el.props.Geometry = { 'B-rep faces': Number(f) }; } }
    for (const c of node.children) walk(c, el.id);
  };
  walk(res.root, undefined);
  for (const k of Object.keys(m.meta)) if (k.startsWith('faces:')) delete m.meta[k];
  m.meta.upAxis = 'Z';
  return finish(m);
}

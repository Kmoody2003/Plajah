// IFC (open BIM, ISO 16739: 2x3, 4, 4.3) through web-ifc (MPL-2.0, its own WASM module).
// Elements keep their IFC class, name, storey and property sets, so the model stays BIM
// and not just triangles.

import type { IfcAPI } from 'web-ifc';
import { type CadModel, type CadElement, emptyModel } from './model';
import { addMesh, finish } from './mesh';

const hexOf = (c: { x: number; y: number; z: number }) => '#' + [c.x, c.y, c.z].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const val = (v: any): string | number | boolean | null => v == null ? null : typeof v === 'object' && 'value' in v ? v.value : typeof v === 'object' ? null : v;

/** `api` must already be initialised (see engines.ts). */
export async function parseIfc(api: IfcAPI, bytes: Uint8Array, name = 'model.ifc', opts: { properties?: boolean } = {}): Promise<CadModel> {
  const m = emptyModel(name, 'ifc', 'web-ifc'); m.units = 'm'; // web-ifc scales geometry to metres
  const id = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  if (id < 0) { m.warnings.push('web-ifc could not open this file.'); return m; }
  try {
    m.meta.schema = String(api.GetModelSchema(id) ?? '');
    const elements = new Map<number, CadElement>();
    const elementFor = (expressID: number): CadElement => {
      let el = elements.get(expressID);
      if (!el) {
        let cls = 'IfcProduct', label = `#${expressID}`;
        try { const line = api.GetLine(id, expressID); cls = api.GetNameFromTypeCode(line.type) || cls; label = val(line.Name) as string || val(line.LongName) as string || label; } catch { /* keep defaults */ }
        el = { id: `ifc_${expressID}`, cls: ifcCase(cls), name: label, meshIds: [], props: {} };
        elements.set(expressID, el); m.elements.push(el);
      }
      return el;
    };
    api.StreamAllMeshes(id, (flat) => {
      const el = elementFor(flat.expressID);
      const n = flat.geometries.size();
      for (let g = 0; g < n; g++) {
        const placed = flat.geometries.get(g);
        const geom = api.GetGeometry(id, placed.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const t = placed.flatTransformation; // column-major 4x4
        const count = verts.length / 6; const pos = new Float32Array(count * 3); const nor = new Float32Array(count * 3);
        for (let v = 0; v < count; v++) {
          const x = verts[v * 6], y = verts[v * 6 + 1], z = verts[v * 6 + 2];
          pos[v * 3] = t[0] * x + t[4] * y + t[8] * z + t[12]; pos[v * 3 + 1] = t[1] * x + t[5] * y + t[9] * z + t[13]; pos[v * 3 + 2] = t[2] * x + t[6] * y + t[10] * z + t[14];
          const nx = verts[v * 6 + 3], ny = verts[v * 6 + 4], nz = verts[v * 6 + 5];
          const ox = t[0] * nx + t[4] * ny + t[8] * nz, oy = t[1] * nx + t[5] * ny + t[9] * nz, oz = t[2] * nx + t[6] * ny + t[10] * nz;
          const len = Math.hypot(ox, oy, oz) || 1; nor[v * 3] = ox / len; nor[v * 3 + 1] = oy / len; nor[v * 3 + 2] = oz / len;
        }
        const mesh = addMesh(m, { name: el.name, positions: pos, indices: new Uint32Array(idx), normals: nor, color: hexOf(placed.color), opacity: placed.color.w, elementId: el.id, layer: el.cls });
        el.meshIds.push(mesh.id);
        geom.delete();
      }
    });

    // Spatial tree (project > site > building > storey) as parent links.
    try {
      const root = await api.properties.getSpatialStructure(id, false);
      const walk = (node: any, parent?: string) => {
        const el = elementFor(node.expressID); if (parent && el.id !== parent) el.parent ??= parent;
        if (/IfcBuildingStorey/i.test(el.cls) && !el.meshIds.length) el.cls = 'IfcBuildingStorey';
        for (const c of node.children || []) walk(c, el.id);
      };
      walk(root);
    } catch { m.warnings.push('Spatial structure could not be read.'); }

    if (opts.properties !== false) {
      for (const [expressID, el] of elements) {
        if (!el.meshIds.length) continue;
        try {
          const sets = await api.properties.getPropertySets(id, expressID, true);
          for (const s of sets) {
            const setName = val(s.Name) as string || 'Properties'; const out: Record<string, string | number | boolean | null> = {};
            for (const p of s.HasProperties || s.Quantities || []) {
              const pn = val(p.Name) as string; if (!pn) continue;
              out[pn] = val(p.NominalValue) ?? val(p.LengthValue) ?? val(p.AreaValue) ?? val(p.VolumeValue) ?? val(p.CountValue) ?? val(p.WeightValue) ?? null;
            }
            if (Object.keys(out).length) el.props[setName] = out;
          }
        } catch { /* some elements have no psets */ }
      }
    }
  } finally {
    api.CloseModel(id);
  }
  // web-ifc emits Y-up geometry, matching three.js.
  m.meta.upAxis = 'Y';
  return finish(m);
}

/** "IFCWALLSTANDARDCASE" -> "IfcWallStandardCase" using the known word list, else Ifc + Title. */
const WORDS = ['standard', 'case', 'element', 'proxy', 'building', 'storey', 'opening', 'covering', 'member', 'plate', 'railing', 'flight', 'distribution', 'flow', 'terminal', 'segment', 'fitting', 'furnishing', 'furniture', 'space', 'site', 'project', 'wall', 'slab', 'beam', 'column', 'door', 'window', 'stair', 'ramp', 'roof', 'footing', 'pile', 'curtain', 'type', 'system', 'zone', 'grid', 'annotation', 'virtual', 'alignment', 'road', 'bridge', 'rail', 'facility', 'part', 'course', 'earthworks', 'fill', 'cut', 'reinforcing', 'bar', 'mesh', 'tendon', 'fastener', 'mechanical', 'discrete', 'accessory', 'shading', 'device', 'transport', 'chimney', 'geographic', 'civil', 'controller', 'sensor', 'actuator', 'pipe', 'duct', 'cable', 'carrier', 'tray', 'valve', 'pump', 'fan', 'boiler', 'chiller', 'tank', 'light', 'fixture', 'outlet', 'sanitary', 'air', 'energy', 'conversion', 'storage', 'treatment', 'moving', 'controller'];
export function ifcCase(raw: string): string {
  if (/^Ifc[A-Z]/.test(raw)) return raw;
  let s = raw.toLowerCase().replace(/^ifc/, ''); let out = 'Ifc';
  while (s.length) {
    const w = WORDS.filter(x => s.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    if (!w) { out += s[0].toUpperCase() + s.slice(1); break; }
    out += w[0].toUpperCase() + w.slice(1); s = s.slice(w.length);
  }
  return out;
}


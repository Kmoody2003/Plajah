// 3MF writer: the open 3D Manufacturing Format (3MF Consortium core spec), read by every modern
// slicer and build processor: PrusaSlicer, OrcaSlicer, Bambu Studio, Cura, and metal build prep.
// Millimetre units; one object per mesh; optional uniform scale (sintering shrink compensation).

import { zipSync, strToU8 } from 'fflate';
import type { MeshIn } from './slice';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function write3mf(meshes: Array<MeshIn & { name?: string }>, o: { title?: string; scale?: number; dropToBed?: boolean } = {}): Uint8Array {
  const k = o.scale ?? 1; let zMin = Infinity;
  if (o.dropToBed !== false) for (const m of meshes) for (let i = 2; i < m.positions.length; i += 3) zMin = Math.min(zMin, m.positions[i]);
  if (!Number.isFinite(zMin)) zMin = 0;
  const objects = meshes.map((m, id) => {
    const v: string[] = []; for (let i = 0; i < m.positions.length; i += 3) v.push(`<vertex x="${(m.positions[i] * k).toFixed(5)}" y="${(m.positions[i + 1] * k).toFixed(5)}" z="${((m.positions[i + 2] - zMin) * k).toFixed(5)}"/>`);
    const t: string[] = []; for (let i = 0; i < m.indices.length; i += 3) t.push(`<triangle v1="${m.indices[i]}" v2="${m.indices[i + 1]}" v3="${m.indices[i + 2]}"/>`);
    return `<object id="${id + 1}" type="model" name="${esc(m.name ?? `Part ${id + 1}`)}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${esc(o.title ?? 'Plajah Build part')}</metadata><metadata name="Application">Plajah Build</metadata><resources>${objects.join('')}</resources><build>${meshes.map((_, i) => `<item objectid="${i + 1}"/>`).join('')}</build></model>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(model),
  });
}

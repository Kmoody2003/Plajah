import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { RAVENCREST_RESIDENTIAL_PLAN as plan } from '../../data/ravencrestResidentialLayout';

const out = 'artifacts/ravencrest-review';
mkdirSync(out, { recursive: true });
const rooms = plan.floors.flatMap(floor => floor.rooms);
assert.equal(plan.floors.length, 5, 'The selected concept has five levels');
assert.equal(rooms.filter(room => room.kind === 'bedroom').length, 12, 'Twelve bedrooms includes the royal suites');
assert.equal(new Set(rooms.map(room => room.id)).size, rooms.length, 'Room IDs must be globally unique');
for (const room of rooms) {
  const [x0, z0, x1, z1] = room.rect;
  assert(x0 >= 0 && z0 >= 0 && x1 <= 1 && z1 <= 1 && x0 < x1 && z0 < z1, `Invalid trace for ${room.id}`);
}

const inventory = readdirSync('public/models/halloween').filter(name => name.endsWith('.glb')).map(file => {
  const buffer = readFileSync(`public/models/halloween/${file}`);
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  return {
    file, bytes: buffer.length, meshes: gltf.meshes?.length ?? 0,
    materials: gltf.materials?.length ?? 0, skins: gltf.skins?.length ?? 0,
    vertices: (gltf.meshes ?? []).reduce((sum, mesh) => sum + mesh.primitives.reduce((count, primitive) => count + (gltf.accessors[primitive.attributes.POSITION]?.count ?? 0), 0), 0),
    animations: (gltf.animations ?? []).map(animation => ({ name: animation.name, tracks: animation.channels.length })),
    textures: (gltf.images ?? []).map(image => ({ name: image.name, mimeType: image.mimeType, embedded: image.bufferView !== undefined })),
    caveat: 'Counts describe file contents, not visual fidelity or runtime draw calls.',
  };
});
writeFileSync(`${out}/asset-inventory.json`, JSON.stringify(inventory, null, 2));
writeFileSync(`${out}/residential-layout.json`, JSON.stringify(plan, null, 2));
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const image = readFileSync('public/models/halloween/ravencrest/floorplan_blueprint_2.jpg').toString('base64');
const colors = ['#89c3d6', '#d5b77f', '#b1c799', '#c4ace0', '#e4a892'];
const overlays = plan.floors.map((floor, index) => {
  const [left, top, right, bottom] = floor.sourceRegion;
  return floor.rooms.map(room => {
    const [x0, z0, x1, z1] = room.rect;
    const x = (left + x0 * (right - left)) * 2048;
    const y = (top + z0 * (bottom - top)) * 1158;
    return `<g><title>${escape(floor.name)}: ${escape(room.name)}</title><rect x="${x}" y="${y}" width="${(x1 - x0) * (right - left) * 2048}" height="${(z1 - z0) * (bottom - top) * 1158}" fill="${colors[index]}" fill-opacity=".08" stroke="${colors[index]}" stroke-width="2"/><text x="${x + 4}" y="${y + 12}" fill="white" font-size="10" paint-order="stroke" stroke="#071116" stroke-width="3">${escape(room.name)}</text></g>`;
  }).join('');
}).join('');
writeFileSync(`${out}/residential-plan-review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Ravencrest · Residential Plan Review</title><style>body{margin:0;background:#0a141b;color:#e3e6e6;font:16px Georgia,serif}header{padding:24px 32px}h1{font-weight:400;margin:0 0 12px}p{color:#b9c6cb;max-width:1000px;line-height:1.5}label{cursor:pointer;color:#dcc6a0}svg{width:100%;height:auto}input:not(:checked)~svg .trace{display:none}.schedule{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;padding:32px}.schedule h2{font-size:20px;color:#dcc6a0}li{margin:9px 0}</style><header><h1>Ravencrest · Residential reconstruction</h1><p>Selected source of truth: grand hall → queen’s floor → king’s floor → observatory, with basement. Five levels. Twelve bedrooms including the royal suites.</p><p>Draft room trace for review. Rectangles are approximate observed placement, not approved walls, doorways or measured dimensions. The live game still uses the older mansion layout.</p><label for="trace">Show draft room trace</label></header><input id="trace" type="checkbox" checked style="margin-left:32px"><svg viewBox="0 0 2048 1158"><image href="data:image/jpeg;base64,${image}" width="2048" height="1158"/><g class="trace">${overlays}</g></svg><section class="schedule">${plan.floors.map(floor => `<article><h2>${escape(floor.name)}</h2><ul>${floor.rooms.map(room => `<li>${escape(room.name)}</li>`).join('')}</ul></article>`).join('')}</section></html>`);
console.log(`Validated ${plan.floors.length} floors and ${rooms.length} room/space IDs, including 12 bedrooms. Inspected ${inventory.length} GLBs. Review: ${out}/residential-plan-review.html`);

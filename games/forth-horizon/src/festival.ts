// Chora Fest on the map (docs/apex-elohim/chora-fest-design.md, region/festival.json from tools/plan_festival.py): a stage at every festival site and the
// roadside furniture of the PR stunts (speed-trap gantries, danger signs, drift-zone arches). Each piece is a few boxes and one canvas label; every site is
// merged into one draw per material, so the whole festival costs a few dozen draws however many sites there are.
import * as THREE from 'three';
import type { FestivalData } from './openWorldEvents';
import { mergeByMaterial } from './carBatch';

const PURPLE = '#7b2cbf', ORANGE = '#ff8c00', CYAN = '#00e5ff';

function label(text: string, sub: string, w = 1024, h = 256, bg = '#14001c', fg = '#ffffff', accent = ORANGE): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, bg); grad.addColorStop(0.5, '#2a0a3d'); grad.addColorStop(1, bg);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, h - 14, w, 14);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${Math.round(h * 0.34)}px Outfit, Inter, sans-serif`; g.fillText(text, w / 2, h * 0.4);
  g.fillStyle = accent; g.font = `600 ${Math.round(h * 0.16)}px Outfit, Inter, sans-serif`; g.fillText(sub, w / 2, h * 0.74);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildFestival(d: FestivalData, ground: (x: number, z: number) => number): THREE.Group {
  const root = new THREE.Group(); root.name = 'festival';
  const steel = new THREE.MeshStandardMaterial({ color: 0x1e2430, metalness: 0.8, roughness: 0.35 });
  const deckM = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.8 });
  const speaker = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.6 });
  const neonP = new THREE.MeshStandardMaterial({ color: PURPLE, emissive: PURPLE, emissiveIntensity: 1.6 });
  const neonO = new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 1.4 });
  const neonC = new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.5 });
  const box = (w: number, h: number, dd: number, m: THREE.Material, x: number, y: number, z: number, g: THREE.Object3D): THREE.Mesh => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b;
  };
  // ---- stages ----
  for (const s of d.sites) {
    const g = new THREE.Group(); g.name = 'festival-site:' + s.id;
    const k = s.kind === 'main' ? 1.6 : 1;
    const y = ground(s.x, s.z);
    g.position.set(s.x, y, s.z);
    // face the stage toward the nearest open side: toward the map centre is a fair default for a crowd area between road and stage
    g.rotation.y = Math.atan2(-s.x, -(s.z - 0));
    box(30 * k, 1.4, 18 * k, deckM, 0, 0.7, 0, g);
    for (const sx of [-1, 1]) {
      box(1.1, 13 * k, 1.1, steel, sx * 14.5 * k, 6.5 * k, -7 * k, g);
      box(1.1, 13 * k, 1.1, steel, sx * 14.5 * k, 6.5 * k, 7 * k, g);
      box(3.2, 7 * k, 3.2, speaker, sx * 18.5 * k, 3.5 * k, 5 * k, g);
    }
    box(30 * k, 1.2, 1.2, steel, 0, 13 * k, -7 * k, g); box(30 * k, 1.2, 1.2, steel, 0, 13 * k, 7 * k, g);
    box(1.2, 1.2, 15 * k, steel, -14.5 * k, 13 * k, 0, g); box(1.2, 1.2, 15 * k, steel, 14.5 * k, 13 * k, 0, g);
    box(29 * k, 0.35, 0.35, neonP, 0, 12.2 * k, 7.3 * k, g);
    box(0.35, 11 * k, 0.35, neonO, -13.8 * k, 6.5 * k, 7.3 * k, g); box(0.35, 11 * k, 0.35, neonO, 13.8 * k, 6.5 * k, 7.3 * k, g);
    // the LED wall: CHORA FEST and the site's name
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26 * k, 6.5 * k), new THREE.MeshStandardMaterial({ map: label('CHORA FEST', s.name.toUpperCase() + (s.kind === 'main' ? '  ·  MAIN STAGE' : '  ·  OUTPOST')), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.4 }));
    (wall.material as THREE.MeshStandardMaterial).emissiveMap = (wall.material as THREE.MeshStandardMaterial).map; (wall.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1;
    wall.position.set(0, 8.6 * k, -7.6 * k); g.add(wall);
    mergeByMaterial(g);
    root.add(g);
  }
  // ---- speed trap gantries: posts either side, a board across with the trap's name ----
  for (const t of d.speedTraps) {
    const g = new THREE.Group(); g.name = 'festival-trap:' + t.id;
    const len = Math.hypot(t.dir[0], t.dir[1]) || 1, ux = t.dir[0] / len, uz = t.dir[1] / len;
    g.position.set(t.x, ground(t.x, t.z), t.z); g.rotation.y = Math.atan2(ux, uz);
    for (const sx of [-1, 1]) box(0.5, 7.2, 0.5, steel, sx * 7.5, 3.6, 0, g);
    box(15.6, 0.5, 0.5, steel, 0, 7.0, 0, g);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshStandardMaterial({ map: label(t.name.toUpperCase(), 'SPEED TRAP  ·  ' + t.targetMph + ' MPH', 1024, 256, '#14001c', '#fff', ORANGE), roughness: 0.5, side: THREE.DoubleSide }));
    board.position.set(0, 8.4, 0); g.add(board);
    box(0.6, 0.4, 0.6, neonO, 3.9, 6.6, 0, g);                                                  // the camera
    root.add(g);
  }
  // ---- danger signs: a yellow diamond beside the road, before the crest ----
  for (const j of d.dangerSigns) {
    const g = new THREE.Group(); g.name = 'festival-jump:' + j.id;
    const len = Math.hypot(j.dir[0], j.dir[1]) || 1, ux = j.dir[0] / len, uz = j.dir[1] / len, nx = -uz, nz = ux;
    const x = j.x - ux * 40 + nx * 7, z = j.z - uz * 40 + nz * 7;
    g.position.set(x, ground(x, z), z); g.rotation.y = Math.atan2(ux, uz) + Math.PI;
    box(0.18, 2.6, 0.18, steel, 0, 1.3, 0, g);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({ map: label('!', j.name.replace(' Danger Sign', '').toUpperCase(), 256, 256, '#ffc400', '#14001c', '#14001c'), roughness: 0.5, side: THREE.DoubleSide }));
    sign.rotation.z = Math.PI / 4; sign.position.set(0, 3.6, 0); g.add(sign);
    root.add(g);
  }
  // ---- drift zone arches at both ends ----
  for (const dz of d.driftZones) {
    for (const [p, q] of [[dz.a, dz.b], [dz.b, dz.a]] as number[][][]) {
      const g = new THREE.Group(); g.name = 'festival-drift:' + dz.id;
      const ux = q[0] - p[0], uz = q[1] - p[1];
      g.position.set(p[0], ground(p[0], p[1]), p[1]); g.rotation.y = Math.atan2(ux, uz);
      for (const sx of [-1, 1]) box(0.6, 6.5, 0.6, steel, sx * 7, 3.25, 0, g);
      box(14.6, 0.4, 0.4, neonC, 0, 6.4, 0, g);
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshStandardMaterial({ map: label(dz.name.toUpperCase(), 'DRIFT ZONE', 1024, 192, '#14001c', '#fff', CYAN), side: THREE.DoubleSide }));
      ban.position.set(0, 7.6, 0); g.add(ban);
      root.add(g);
    }
  }
  void yellow;
  return root;
}

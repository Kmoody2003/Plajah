// The player's garage as a real building: a brick shop unit for the city or a converted barn for the farm. Walls, floor, roof structure, a bay door that opens, windows,
// workbench, tool chests, tyres, shelving, a lift, lights and signs. Built from code with painted canvas textures, so it needs no model files.
// Local frame: the origin is the middle of the floor, +z is the front (the bay door and the way the car drives out), +x is the left of a car leaving, +y up, metres.
import * as THREE from 'three';
import { DOOR_H, DOOR_W, GARAGE_D, GARAGE_W, type Home } from './garage/sites';

const W = GARAGE_W, D = GARAGE_D, H = 5.2;

// ---------- painted textures ----------
function rng(seed: number): () => number { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rep?: [number, number], srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
const noise = (g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, seed = 3): void => { const r = rng(seed); for (let i = 0; i < n; i++) { const v = Math.floor(r() * 255); g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); } };

function concreteTex(): THREE.CanvasTexture {
  return tex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#6b6d70'; g.fillRect(0, 0, w, h); noise(g, w, h, 16000, 0.16);
    const r = rng(9);
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 70, gr = g.createRadialGradient(x, y, 2, x, y, rad); gr.addColorStop(0, 'rgba(20,18,16,.55)'); gr.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }     // oil
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 120; g.lineTo(x, y); } g.stroke(); }   // cracks
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);                                      // expansion joints
  }, [3, 4]);
}
function brickTex(): THREE.CanvasTexture {
  return tex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#5a4a42'; g.fillRect(0, 0, w, h);
    const r = rng(5), bw = 64, bh = 28;
    for (let y = 0; y < h / bh; y++) for (let x = -1; x < w / bw + 1; x++) {
      const ox = (y % 2) * bw / 2, base = 120 + r() * 50;
      g.fillStyle = `rgb(${base + 40},${base * 0.45 + 22},${base * 0.36 + 18})`; g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
    noise(g, w, h, 9000, 0.1);
  }, [3, 1.3]);
}
function plankTex(base: string, dark: string, seed: number): THREE.CanvasTexture {
  return tex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(seed), n = 16;
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; g.fillRect(i * (w / n), 0, w / n, h); g.fillStyle = dark; g.fillRect(i * (w / n), 0, 3, h); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let i = 0; i < 260; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, r() * h); g.lineTo(x + (r() - 0.5) * 6, r() * h); g.stroke(); }
    noise(g, w, h, 6000, 0.08, seed);
  }, [1, 1]);
}
function paintedBlockTex(): THREE.CanvasTexture {
  return tex(512, 512, (g, w, h) => {
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#3c4552'; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
    noise(g, w, h, 5000, 0.08);
  }, [3, 1.4]);
}
function corrugatedTex(color: string): THREE.CanvasTexture {
  return tex(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, color); gr.addColorStop(0.5, '#ffffff22'); gr.addColorStop(1, '#00000044'); g.fillStyle = color; g.fillRect(x, 0, 16, h); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    noise(g, w, h, 1800, 0.12);
  }, [4, 1]);
}
function pegboardTex(): THREE.CanvasTexture {
  return tex(512, 256, (g, w, h) => {
    g.fillStyle = '#7b6a55'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.35)'; for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    const r = rng(2); const cols = ['#cfd3d8', '#d24b3a', '#e0b13a', '#3a78d2'];
    for (let i = 0; i < 22; i++) { const x = 16 + i * 22, len = 40 + r() * 80; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 3, 26 + 3, 7, len); g.fillStyle = cols[i % 4]; g.fillRect(x, 26, 7, len); g.fillRect(x - 3, 26, 13, 12); }   // tools hung up
  });
}
function signTex(text: string, sub: string, color: string): THREE.CanvasTexture {
  return tex(1024, 256, (g, w, h) => {
    g.fillStyle = '#10141c'; g.fillRect(0, 0, w, h); g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.font = '800 120px Outfit, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = '#fff'; g.fillText(text, w / 2, h * 0.42);
    g.shadowBlur = 0; g.font = '600 44px Inter, sans-serif'; g.fillStyle = color; g.fillText(sub, w / 2, h * 0.8);
  });
}
function hayTex(): THREE.CanvasTexture {
  return tex(256, 256, (g, w, h) => { g.fillStyle = '#c9a54a'; g.fillRect(0, 0, w, h); const r = rng(4); for (let i = 0; i < 900; i++) { g.strokeStyle = `hsl(${40 + r() * 12},${55 + r() * 20}%,${40 + r() * 28}%)`; g.lineWidth = 1 + r(); g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 8); g.stroke(); } });
}

// ---------- helpers ----------
const std = (map: THREE.Texture | null, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, ...o });
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cyl(parent: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 24, rotX = 0, rotZ = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); mesh.position.set(x, y, z); mesh.rotation.x = rotX; mesh.rotation.z = rotZ; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
/** a copy of a texture tiled so a face of w x h metres shows tiles of the given size */
function tiled(t: THREE.Texture, w: number, h: number, tw: number, th: number): THREE.Texture { const c = t.clone(); c.needsUpdate = true; c.repeat.set(w / tw, h / th); return c; }

export interface GarageBuilding {
  group: THREE.Group;
  /** 0 closed .. 1 open; eased by update() */
  setDoor(open: boolean): void;
  readonly doorT: number;
  update(dt: number): void;
  /** the lights inside, on or off (they are off by day outdoors in the game, on in the garage screen) */
  setLights(on: boolean): void;
  /** where the car stands in the bay, in local coordinates */
  carSpot: THREE.Vector3;
}

export function buildGarage(home: Home): GarageBuilding {
  const g = new THREE.Group(); g.name = 'garage-' + home;
  const farm = home === 'farm';
  const floorMat = std(concreteTex(), { roughness: 0.55, metalness: 0.05 });
  const steel = std(null, { color: 0x30343b, roughness: 0.5, metalness: 0.8 });
  const wallOut = farm ? std(tiled(plankTex('#8b2f24', '#4a1710', 11), W, H, 6, 5), { roughness: 0.9 }) : std(tiled(brickTex(), W, H, 4, 3.4), { roughness: 0.92 });
  const wallIn = farm ? std(tiled(plankTex('#9a7a52', '#4a3822', 14), W, H, 6, 5), { roughness: 0.9 }) : std(tiled(paintedBlockTex(), W, H, 4, 3.4), { roughness: 0.88 });
  const trim = std(null, { color: farm ? 0xece6da : 0x2a2e36, roughness: 0.6 });

  // floor, bay lines, and the apron outside
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const line = (w: number, d: number, x: number, z: number): void => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xe6b422, transparent: true, opacity: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); g.add(m); };
  line(0.1, 7.2, -2.9, -1.2); line(0.1, 7.2, 2.9, -1.2); line(5.9, 0.1, 0, -4.8); line(5.9, 0.1, 0, 2.4);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 4, 9), std(tiled(concreteTex(), W + 4, 9, 4, 4), { color: farm ? 0x8a7d66 : 0x9a9ca0, roughness: 0.9 })); apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.004, D / 2 + 4.5); apron.receiveShadow = true; g.add(apron);

  // walls: back, left, right, and the front with the door opening
  const t = 0.35;
  const wall = (w: number, h: number, x: number, y: number, z: number, rotY = 0): void => {
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallIn), outer = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallOut);
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = rotY;
    inner.position.z = t / 2 - 0.001; inner.rotation.y = Math.PI; outer.position.z = -t / 2 + 0.001; outer.rotation.y = Math.PI; inner.receiveShadow = outer.receiveShadow = true;
    // the planes face inwards: build a slab with real thickness so the opening has a reveal
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), [trim, trim, trim, trim, wallOut, wallIn]); slab.castShadow = true; slab.receiveShadow = true;
    slab.material = [trim, trim, trim, trim, wallOut, wallIn]; grp.add(slab); g.add(grp); void inner; void outer;
  };
  wall(W, H, 0, H / 2, -D / 2 + t / 2, Math.PI);                      // back (outer face turned to face away)
  wall(D, H, -W / 2 + t / 2, H / 2, 0, -Math.PI / 2);                 // left
  wall(D, H, W / 2 - t / 2, H / 2, 0, Math.PI / 2);                   // right
  const sideW = (W - DOOR_W) / 2;
  wall(sideW, H, -(DOOR_W / 2 + sideW / 2), H / 2, D / 2 - t / 2, 0);   // front left of the door
  wall(sideW, H, DOOR_W / 2 + sideW / 2, H / 2, D / 2 - t / 2, 0);
  wall(DOOR_W, H - DOOR_H, 0, DOOR_H + (H - DOOR_H) / 2, D / 2 - t / 2, 0);   // above the door
  // door frame
  box(g, 0.22, DOOR_H, 0.5, -DOOR_W / 2 - 0.11, DOOR_H / 2, D / 2, trim); box(g, 0.22, DOOR_H, 0.5, DOOR_W / 2 + 0.11, DOOR_H / 2, D / 2, trim); box(g, DOOR_W + 0.44, 0.22, 0.5, 0, DOOR_H + 0.11, D / 2, trim);

  // roof: a flat roof with a parapet and steel beams for the city, a gambrel roof on timber trusses for the farm
  const beam = std(null, { color: farm ? 0x5a4126 : 0x2a2f38, roughness: 0.7, metalness: farm ? 0 : 0.6 });
  if (!farm) {
    const roof = std(null, { color: 0x3a3d42, roughness: 0.95 });
    box(g, W + 0.8, 0.25, D + 0.8, 0, H + 0.12, 0, roof); box(g, W + 0.8, 0.6, 0.25, 0, H + 0.4, D / 2 + 0.3, trim); box(g, W + 0.8, 0.6, 0.25, 0, H + 0.4, -D / 2 - 0.3, trim); box(g, 0.25, 0.6, D + 0.8, -W / 2 - 0.3, H + 0.4, 0, trim); box(g, 0.25, 0.6, D + 0.8, W / 2 + 0.3, H + 0.4, 0, trim);
    for (let z = -D / 2 + 1.6; z < D / 2; z += 3.2) box(g, W - 0.4, 0.28, 0.2, 0, H - 0.16, z, beam);             // I-beams under the roof
    for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) for (let z = -D / 2 + 1.6; z < D / 2; z += 3.2) box(g, 0.22, 0.22, 0.22, x, H - 0.4, z, steel);
    box(g, W - 0.4, 0.06, D - 0.4, 0, H - 0.04, 0, std(null, { color: 0xd8dade, roughness: 0.95 }), false);        // ceiling
  } else {
    const roofM = std(corrugatedTex('#6d7077'), { roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    const rise = 3.2, shoulder = 1.7, ex = 0.7;
    const prof = new THREE.Shape(); prof.moveTo(-W / 2 - ex, 0); prof.lineTo(-W / 2 - ex + 0.6, shoulder * 1.2); prof.lineTo(0, rise); prof.lineTo(W / 2 + ex - 0.6, shoulder * 1.2); prof.lineTo(W / 2 + ex, 0);
    for (const sign of [-1, 1]) {
      const pts = [[sign * (W / 2 + ex), 0], [sign * (W / 2 + ex - 0.6), shoulder * 1.2], [0, rise]];
      for (let i = 0; i < 2; i++) {
        const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, D + 1.2), roofM); m.position.set((a[0] + b[0]) / 2, H + (a[1] + b[1]) / 2, 0); m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]); m.castShadow = true; m.receiveShadow = true; g.add(m);
      }
    }
    // gable ends above the walls, and trusses inside
    for (const zz of [-D / 2, D / 2]) {
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(prof), std(tiled(plankTex('#8b2f24', '#4a1710', 11), W, 3, 6, 5), { side: THREE.DoubleSide })); gable.position.set(0, H, zz + (zz > 0 ? -t / 2 : t / 2)); gable.castShadow = true; g.add(gable);
    }
    for (let z = -D / 2 + 2; z < D / 2; z += 3.5) {
      box(g, W, 0.22, 0.2, 0, H + 0.3, z, beam);                                        // tie beam
      for (const sign of [-1, 1]) { const l = Math.hypot(W / 2, rise - 0.3) * 0.62; const m = box(g, l, 0.2, 0.2, sign * (W / 4 - 0.1), H + 1.6, z, beam); m.rotation.z = sign * Math.atan2(rise - 0.4, W / 2) * -1; }
      box(g, 0.2, rise - 0.4, 0.2, 0, H + 0.3 + (rise - 0.4) / 2, z, beam);               // king post
    }
    // hay loft door in the front gable
    box(g, 1.5, 1.7, 0.1, 0, H + 1.2, D / 2 + 0.06, std(tiled(plankTex('#7a2a20', '#3a120c', 6), 1.5, 1.7, 1.5, 1.7))); box(g, 1.7, 0.08, 0.14, 0, H + 2.06, D / 2 + 0.07, trim);
  }

  // windows: high clerestory panes on both side walls, lit by the day outside
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4de, emissive: 0x6aa0c8, emissiveIntensity: 0.9, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 });
  for (const sx of [-1, 1]) for (const z of [-4.8, 0, 4.8]) {
    box(g, 0.1, 0.9, 1.9, sx * (W / 2 - t / 2), 3.9, z, glass, false);
    box(g, 0.16, 1.02, 2.02, sx * (W / 2 - t / 2 + 0.01), 3.9, z, trim, false); box(g, 0.2, 0.06, 2.0, sx * (W / 2 - t / 2 + 0.02), 3.9, z, trim, false);
  }

  // ---------- the bay door ----------
  const doorGroup = new THREE.Group(); doorGroup.position.set(0, 0, D / 2 - 0.12); g.add(doorGroup);
  let doorT = 0, doorTarget = 0;
  let setDoorPose: (t: number) => void;
  if (!farm) {
    // roller shutter: a corrugated slab that gathers up into a drum above the door
    const slab = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.08), std(corrugatedTex('#9aa1a9'), { roughness: 0.45, metalness: 0.6 })); slab.castShadow = true; slab.receiveShadow = true;
    const lightsStrip = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.6, 0.35, 0.1), new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.2, metalness: 0.4 })); lightsStrip.position.set(0, DOOR_H * 0.32, 0.01);
    const sl = new THREE.Group(); sl.add(slab, lightsStrip); doorGroup.add(sl);
    const drum = cyl(doorGroup, 0.24, DOOR_W, 0, DOOR_H + 0.2, 0.02, steel, 20, 0, Math.PI / 2);
    for (const sx of [-1, 1]) box(doorGroup, 0.12, DOOR_H, 0.2, sx * (DOOR_W / 2 + 0.06), DOOR_H / 2, 0, steel);       // guide rails
    setDoorPose = (v) => { const s = THREE.MathUtils.lerp(1, 0.04, v); sl.scale.y = s; sl.position.y = DOOR_H - (DOOR_H * s) / 2; drum.scale.setScalar(1 + v * 0.45); };
  } else {
    // two timber sliding barn doors on a rail, with the white X-bracing
    const leaves: THREE.Group[] = [];
    const brace = std(null, { color: 0xece6da, roughness: 0.7 });
    for (const sx of [-1, 1]) {
      const lf = new THREE.Group(); lf.position.set(sx * DOOR_W / 4, DOOR_H / 2, 0.02);
      const lw = DOOR_W / 2 + 0.25;
      box(lf, lw, DOOR_H + 0.1, 0.1, 0, 0, 0, std(tiled(plankTex('#8b2f24', '#4a1710', 21), lw, DOOR_H, 4, 5)));
      box(lf, lw, 0.14, 0.16, 0, DOOR_H / 2 - 0.1, 0.03, brace); box(lf, lw, 0.14, 0.16, 0, -DOOR_H / 2 + 0.12, 0.03, brace); box(lf, 0.14, DOOR_H, 0.16, -lw / 2 + 0.07, 0, 0.03, brace); box(lf, 0.14, DOOR_H, 0.16, lw / 2 - 0.07, 0, 0.03, brace);
      const dg = Math.hypot(lw, DOOR_H); const d1 = box(lf, dg * 0.96, 0.12, 0.16, 0, 0, 0.03, brace); d1.rotation.z = Math.atan2(DOOR_H, lw); const d2 = box(lf, dg * 0.96, 0.12, 0.16, 0, 0, 0.03, brace); d2.rotation.z = -Math.atan2(DOOR_H, lw);
      doorGroup.add(lf); leaves.push(lf);
    }
    box(doorGroup, DOOR_W * 2.2, 0.1, 0.12, 0, DOOR_H + 0.24, 0.05, steel);                                                     // the rail
    setDoorPose = (v) => { leaves[0].position.x = -DOOR_W / 4 - v * (DOOR_W / 2 + 0.1); leaves[1].position.x = DOOR_W / 4 + v * (DOOR_W / 2 + 0.1); };
  }
  setDoorPose(0);

  // ---------- inside ----------
  const red = std(null, { color: 0xb02a20, roughness: 0.4, metalness: 0.5 });
  const wood = std(null, { color: 0x8a6a40, roughness: 0.7 });
  // workbench along the right wall, with a pegboard of tools above it
  const bx = W / 2 - 1.0;
  box(g, 1.1, 0.07, 4.2, bx, 0.95, -4.4, wood); for (const zz of [-6.3, -2.5]) for (const xx of [bx - 0.45, bx + 0.45]) box(g, 0.07, 0.92, 0.07, xx, 0.46, zz, steel);
  box(g, 1.0, 0.05, 4.0, bx, 0.3, -4.4, steel); box(g, 0.3, 0.2, 0.4, bx - 0.1, 1.1, -3.4, std(null, { color: 0x20262e, metalness: 0.8, roughness: 0.4 }));     // vise
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.4), new THREE.MeshStandardMaterial({ map: pegboardTex(), roughness: 0.8 })); peg.position.set(W / 2 - t - 0.02, 2.2, -4.4); peg.rotation.y = -Math.PI / 2; g.add(peg);
  // tool chests along the left wall
  for (let i = 0; i < 3; i++) {
    const cx = -W / 2 + 0.7, cz = -6.1 + i * 1.1, ch = i === 1 ? 1.45 : 1.1;
    box(g, 0.75, ch, 0.95, cx, ch / 2 + 0.12, cz, red); box(g, 0.78, 0.05, 0.98, cx, ch + 0.15, cz, steel);
    for (let k = 0; k < 4; k++) { box(g, 0.02, 0.17, 0.8, cx + 0.385, 0.35 + k * (ch - 0.3) / 4, cz, steel, false); box(g, 0.025, 0.03, 0.3, cx + 0.4, 0.42 + k * (ch - 0.3) / 4, cz, steel, false); }
    for (const sx of [-1, 1]) cyl(g, 0.05, 0.12, cx, 0.06, cz + sx * 0.4, steel, 10);
  }
  // shelving on the back wall: boxes and cans
  const shelf = std(null, { color: 0x2d4f78, roughness: 0.5, metalness: 0.5 });
  for (const sx of [-3.8, -1.2, 1.4, 3.8]) { box(g, 0.06, 2.3, 0.5, sx - 1.0, 1.15, -D / 2 + 0.55, shelf); box(g, 0.06, 2.3, 0.5, sx + 1.0, 1.15, -D / 2 + 0.55, shelf); for (let k = 0; k < 4; k++) { box(g, 2.0, 0.04, 0.5, sx, 0.2 + k * 0.62, -D / 2 + 0.55, shelf); const r = rng(sx * 13 + k * 7 + 40); for (let q = 0; q < 3; q++) box(g, 0.35 + r() * 0.3, 0.2 + r() * 0.2, 0.3, sx - 0.7 + q * 0.7, 0.34 + k * 0.62, -D / 2 + 0.55, std(null, { color: new THREE.Color().setHSL(r(), 0.45, 0.5), roughness: 0.8 })); } }
  // tyre stacks and drums
  const rubber = std(null, { color: 0x15161a, roughness: 0.85 });
  for (const [sx, sz, n] of [[-W / 2 + 1.0, 4.4, 4], [-W / 2 + 1.0, 5.6, 3], [W / 2 - 1.0, 5.2, 5]] as const) for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.13, 14, 28), rubber); m.rotation.x = Math.PI / 2; m.position.set(sx, 0.14 + i * 0.26, sz); m.castShadow = true; g.add(m); }
  for (const [sx, sz, c] of [[W / 2 - 0.8, 6.6, 0x2e5a9e], [W / 2 - 0.8, 7.2, 0x2e5a9e], [-W / 2 + 0.8, 7.0, 0x4a4f58]] as const) { cyl(g, 0.3, 0.9, sx, 0.45, sz, std(null, { color: c, roughness: 0.5, metalness: 0.5 }), 20); cyl(g, 0.31, 0.04, sx, 0.62, sz, steel, 20); cyl(g, 0.31, 0.04, sx, 0.28, sz, steel, 20); }
  // a two-post lift beside the bay, an air compressor and a floor jack
  for (const sx of [-1, 1]) { box(g, 0.2, 3.4, 0.3, sx * 3.4, 1.7, 0.2, std(null, { color: 0xe3b020, roughness: 0.45, metalness: 0.4 })); box(g, 1.3, 0.12, 0.2, sx * 3.4 - sx * 0.6, 0.3, 0.2, steel); }
  box(g, 7.2, 0.18, 0.25, 0, 3.35, 0.2, std(null, { color: 0xe3b020, roughness: 0.5 }));
  cyl(g, 0.3, 1.0, -W / 2 + 0.9, 0.55, 2.6, std(null, { color: 0x1f6a46, roughness: 0.4, metalness: 0.5 }), 20, 0, Math.PI / 2); box(g, 0.2, 0.5, 0.2, -W / 2 + 0.9, 0.3, 2.6, steel);
  box(g, 0.6, 0.18, 0.28, 3.9, 0.2, 2.2, std(null, { color: 0xc23a2c, roughness: 0.4, metalness: 0.5 }));
  // neon sign over the bay, fluorescent tubes, and the clock
  const signT = signTex(farm ? 'ELOHIM FARM GARAGE' : 'APEX GARAGE', farm ? 'tune · restore · race' : 'ironport · tune · race', farm ? '#ffb14a' : '#00daf3');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signT })); sign.position.set(0, DOOR_H + 0.9, D / 2 + 0.26); g.add(sign);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signT })); sign2.position.set(0, 3.7, -D / 2 + t + 0.02); sign2.rotation.y = 0; g.add(sign2);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  const lamps: THREE.Light[] = [], tubes: THREE.Mesh[] = [];
  for (const z of [-4.8, -0.4, 4.0]) for (const x of [-2.6, 2.6]) {
    const tb = box(g, 0.14, 0.08, 2.6, x, H - 0.45, z, tubeMat, false); tubes.push(tb); box(g, 0.3, 0.05, 2.7, x, H - 0.38, z, steel, false);
  }
  const key = new THREE.SpotLight(0xfff4e0, 220, 18, 0.9, 0.7, 1.4); key.position.set(0.5, H - 0.6, -1.6); key.target.position.set(0, 0.4, -1.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.radius = 5; g.add(key, key.target); lamps.push(key);
  for (const [x, z] of [[-3, -5], [3, -5], [-3, 3.5], [3, 3.5]]) { const pl = new THREE.PointLight(0xfff0d8, 26, 12, 1.7); pl.position.set(x, H - 0.8, z); g.add(pl); lamps.push(pl); }
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ map: tex(128, 128, (c) => { c.fillStyle = '#f4f1e8'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 6; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 24); c.moveTo(64, 64); c.lineTo(92, 74); c.stroke(); }) }));
  clock.position.set(-W / 2 + t + 0.02, 3.2, 1.5); clock.rotation.y = Math.PI / 2; g.add(clock);

  // ---------- outside dressing ----------
  if (farm) {
    // hay bales stacked by the door, a feed trough, and a tractor parked at the side
    const hay = std(hayTex(), { roughness: 1 });
    for (const [x, z, y] of [[W / 2 + 1.0, D / 2 - 2, 0.5], [W / 2 + 1.0, D / 2 - 3.3, 0.5], [W / 2 + 1.0, D / 2 - 2.6, 1.5], [W / 2 + 2.4, D / 2 - 2.2, 0.5]] as const) { const b = cyl(g, 0.55, 1.1, x, y, z, hay, 20); b.rotation.z = Math.PI / 2; }
    const tr = new THREE.Group(); tr.position.set(-W / 2 - 3.6, 0, D / 2 - 3); tr.rotation.y = 0.25; g.add(tr);
    const tg = std(null, { color: 0x2f7a3a, roughness: 0.45, metalness: 0.4 });
    box(tr, 1.3, 0.9, 2.6, 0, 1.0, 0.2, tg); box(tr, 1.2, 1.4, 1.2, 0, 1.9, -0.5, tg); box(tr, 1.3, 0.05, 1.3, 0, 2.65, -0.5, std(null, { color: 0x222 })); box(tr, 0.9, 0.7, 0.5, 0, 0.9, 1.5, tg);
    for (const sx of [-1, 1]) { cyl(tr, 0.75, 0.5, sx * 0.85, 0.75, -0.6, rubber, 28, 0, Math.PI / 2); cyl(tr, 0.45, 0.35, sx * 0.8, 0.45, 1.3, rubber, 24, 0, Math.PI / 2); }
    cyl(tr, 0.08, 1.0, 0.3, 2.0, 1.0, steel, 10);
    // post and rail fence along the yard, and a silo
    const fence = std(null, { color: 0x8a7352, roughness: 0.9 });
    for (let x = -W / 2 - 5; x <= W / 2 + 7; x += 2.2) { box(g, 0.14, 1.2, 0.14, x, 0.6, D / 2 + 9.5, fence); } box(g, W + 12.4, 0.1, 0.1, 1, 0.95, D / 2 + 9.5, fence); box(g, W + 12.4, 0.1, 0.1, 1, 0.55, D / 2 + 9.5, fence);
    const silo = cyl(g, 1.9, 9, -W / 2 - 2.5, 4.5, -D / 2 + 1, std(null, { color: 0xc9ced3, roughness: 0.5, metalness: 0.5 }), 28); void silo; cyl(g, 1.95, 0.4, -W / 2 - 2.5, 9.1, -D / 2 + 1, steel, 28);
  } else {
    // a steel pole light over the door, bollards, and a street-facing pavement strip with a kerb
    for (const sx of [-1, 1]) cyl(g, 0.12, 0.9, sx * (DOOR_W / 2 + 1.0), 0.45, D / 2 + 2.2, std(null, { color: 0xe3b020, roughness: 0.5 }), 12);
    const lamp = box(g, 0.9, 0.14, 0.3, 0, DOOR_H + 1.9, D / 2 + 0.45, steel); void lamp; box(g, 0.7, 0.06, 0.2, 0, DOOR_H + 1.82, D / 2 + 0.5, new THREE.MeshBasicMaterial({ color: 0xfff6dc }), false);
    box(g, W + 4, 0.15, 0.3, 0, 0.07, D / 2 + 9.1, std(null, { color: 0xb5b7ba, roughness: 0.9 }));
  }

  // ---------- control ----------
  const carSpot = new THREE.Vector3(0, 0, -1.5);
  return {
    group: g, carSpot,
    setDoor(open) { doorTarget = open ? 1 : 0; },
    get doorT() { return doorT; },
    update(dt) { if (doorT !== doorTarget) { doorT += Math.sign(doorTarget - doorT) * Math.min(Math.abs(doorTarget - doorT), dt / 2.2); setDoorPose(doorT * doorT * (3 - 2 * doorT)); } },
    setLights(on) { for (const l of lamps) l.visible = on; tubeMat.color.set(on ? 0xfffbe8 : 0x3a3a38); for (const tb of tubes) tb.visible = true; },
  };
}

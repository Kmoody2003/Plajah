import * as THREE from 'three';
import { type AirportLayout, type AirportSim, type Plane, toWorld } from './sim/airport';
import { distToPoly, pointInPoly, type P2 } from './sim/geom';
import { piece } from './library/modelled';
import { mergeByMaterial, mergeStaticScenery } from './carBatch';

/**
 * The airfield in the world: runway with its markings, taxiways, apron with stands, terminal with jet bridges, control tower, hangars,
 * approach and edge lights, a windsock, and the aircraft that the sim moves (their meshes are created on demand).
 */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const rng = (seed: number): (() => number) => { let s = seed | 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

export interface AirportScenes {
  group: THREE.Group;
  update: (now: number, dt: number, cam?: THREE.Vector3) => void;
  /** within `pad` metres of runway, taxiway or apron paving */
  paved: (x: number, z: number, pad: number) => boolean;
  /** anywhere on the airfield, including the grass strip and buildings, with a margin */
  inside: (x: number, z: number, margin: number) => boolean;
  /** meshes the car can drive on */
  surfaces: THREE.Mesh[];
  shots: { name: string; cam: [number, number, number]; at: [number, number, number] }[];
}

export function buildAirportScenes(o: { L: AirportLayout; sim: AirportSim | null; ground: (x: number, z: number) => number }): AirportScenes {
  const { L } = o, group = new THREE.Group(); group.name = 'airport';
  const Y = L.elevation;                      // the field is graded flat at this height
  const surfaces: THREE.Mesh[] = [];
  const asphaltTex = (draw?: (g: CanvasRenderingContext2D) => void, w = 256, h = 256, rep?: [number, number]): THREE.CanvasTexture => canvasTex(w, h, (g) => {
    const r = rng(5); g.fillStyle = '#3d3f42'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 12; i++) { const v = 45 + r() * 38; g.fillStyle = `rgba(${v},${v},${v + 2},0.55)`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    draw?.(g);
  }, rep);
  const mat = (map: THREE.Texture, polyOffset = -2): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: polyOffset, polygonOffsetUnits: polyOffset });
  const quad = (a: P2, b: P2, halfW: number, y: number, m: THREE.Material, vlen: number, drive = true): THREE.Mesh => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * halfW, nz = dx / l * halfW;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] + nx, y, b[1] + nz, b[0] - nx, y, b[1] - nz], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, l / vlen, 1, l / vlen], 2)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; if (drive) surfaces.push(mesh); group.add(mesh); return mesh;
  };

  // ---- runway: markings painted on one long texture ----
  const RW = 45, RL = L.len, shoulder = 7.5;
  {
    const tw = 256, th = 2048, k = th / RL;
    const rwTex = asphaltTex((g) => {
      g.fillStyle = '#f2f2ee';
      const px = tw / (RW + shoulder * 2), x0 = shoulder * px;
      g.fillRect(x0 + 1.2 * px, 0, 0.4 * px, th); g.fillRect(tw - x0 - 1.6 * px, 0, 0.4 * px, th);                            // edge lines
      for (let s = 40; s < RL - 40; s += 50) g.fillRect(tw / 2 - 0.45 * px, th - (s + 30) * k, 0.9 * px, 30 * k);              // centre dashes
      const bars = (u0: number, dir: number): void => { for (let i = 0; i < 8; i++) { const cx = x0 + (4 + i * 4.8) * px; g.fillRect(cx - 0.9 * px, th - (dir > 0 ? u0 + 36 : u0 - 6) * k, 1.8 * px, 30 * k); } };
      bars(0, 1); bars(RL, -1);
      for (const u of [300, 450, 600, 750, 900]) { const w = u === 300 ? 8 : 5, d = u === 300 ? 45 : 22; for (const sd of [-1, 1]) g.fillRect(tw / 2 + sd * 9 * px - (sd > 0 ? 0 : w * px), th - (u + d) * k, w * px, d * k); }  // aiming point and touchdown zone
      for (const u of [RL - 300, RL - 450, RL - 600]) for (const sd of [-1, 1]) g.fillRect(tw / 2 + sd * 9 * px - (sd > 0 ? 0 : 5 * px), th - (u + 22) * k, 5 * px, 22 * k);
      g.save(); g.fillStyle = '#f2f2ee'; g.font = `700 ${Math.round(26 * px)}px Arial, sans-serif`; g.textAlign = 'center';
      const [n1, n2] = L.designator.split('/');
      g.translate(tw / 2, th - 90 * k); g.fillText(n1, 0, 0); g.restore();
      g.save(); g.translate(tw / 2, 90 * k); g.rotate(Math.PI); g.fillText(n2, 0, 0); g.restore();
    }, tw, th);
    rwTex.wrapS = rwTex.wrapT = THREE.ClampToEdgeWrapping;
    // texture v runs from the a end (canvas bottom) to the b end (canvas top)
    const m = mat(rwTex, -3), q = quad(L.a, L.b, RW / 2 + shoulder, Y + 0.05, m, RL); q.name = 'runway';
    (q.geometry.attributes.uv as THREE.BufferAttribute).array.set([0, 0, 1, 0, 0, 1, 1, 1]); q.geometry.attributes.uv.needsUpdate = true;
  }
  // ---- taxiways with a yellow centre line ----
  const taxiMat = mat(asphaltTex((g) => { g.fillStyle = '#e8c52a'; g.fillRect(124, 0, 8, 120); }, 256, 256), -3);
  for (const t of L.taxiways) for (let i = 0; i < t.length - 1; i++) quad(t[i], t[i + 1], 13, Y + 0.04, taxiMat, 60);
  // ---- apron: a concrete polygon with stand lines ----
  const concreteTex = canvasTex(256, 256, (g) => { const r = rng(2); g.fillStyle = '#9b9a95'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { const v = 130 + r() * 50; g.fillStyle = `rgba(${v},${v},${v - 4},0.4)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); } g.strokeStyle = 'rgba(70,70,70,.5)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); }, [1, 1]);
  const polyMesh = (poly: P2[], y: number, m: THREE.Material, uvScale: number): THREE.Mesh | null => {
    if (poly.length < 3) return null;
    const tri = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), []);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(poly.flatMap((p) => [p[0], y, p[1]]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(poly.flatMap((p) => [p[0] / uvScale, p[1] / uvScale]), 2));
    g.setIndex(tri.flat().map((i) => i)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  {
    const t = concreteTex; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = polyMesh(L.apron, Y + 0.04, mat(t, -2), 28); if (m) { surfaces.push(m); if ((m.geometry.attributes.normal.array as Float32Array)[1] < 0) m.material = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }); }
  }
  // stand lines and numbers
  {
    const line = new THREE.MeshBasicMaterial({ color: 0xe8c52a, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    L.gates.forEach((g) => {
      const a = toWorld(L, g.u, g.v - 44), b = toWorld(L, g.u, g.v + 26);
      quad(a, b, 0.2, Y + 0.07, line, 10, false);
      const c = toWorld(L, g.u, g.v + 12); quad([c[0] - L.ux * 12, c[1] - L.uz * 12], [c[0] + L.ux * 12, c[1] + L.uz * 12], 0.2, Y + 0.07, line, 10, false);
    });
  }

  // ---- buildings ----
  const glass = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (g) => { g.fillStyle = '#6a8aa3'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#2b3f50'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 2, 128); g.fillStyle = '#243645'; for (let y = 16; y < 128; y += 32) g.fillRect(0, y, 256, 3); }, [6, 1]), roughness: 0.2, metalness: 0.5 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d8d2, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.7, metalness: 0.3 });
  const orient = (poly: P2[]): { cx: number; cz: number; lu: number; lv: number; u0: number; v0: number } => {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of poly) { const u = (p[0] - L.a[0]) * L.ux + (p[1] - L.a[1]) * L.uz, v = (p[0] - L.a[0]) * L.vx + (p[1] - L.a[1]) * L.vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const c = toWorld(L, (u0 + u1) / 2, (v0 + v1) / 2);
    return { cx: c[0], cz: c[1], lu: u1 - u0, lv: v1 - v0, u0, v0 };
  };
  const yaw = Math.atan2(L.ux, L.uz) - Math.PI / 2;     // a box's local +x runs along the runway
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group): THREE.Mesh => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const tcenters: { x: number; z: number }[] = [];
  if (L.terminal.length >= 3) {
    const T = orient(L.terminal), tg = new THREE.Group(); tg.position.set(T.cx, Y, T.cz); tg.rotation.y = yaw; group.add(tg);
    // local x runs along the runway, local z is (-uz, ux); sgn = +1 when that points to the apron side (toward +v)
    const sgn = Math.sign(L.vx * -L.uz + L.vz * L.ux) || 1;
    const airDepth = 34, landDepth = Math.max(26, T.lv - airDepth), zAir = -sgn * (T.lv / 2 - airDepth / 2), zLand = sgn * (T.lv / 2 - landDepth / 2);
    // the airside concourse faces the runway (toward -v), the main hall is landside
    box(T.lu * 0.92, 13, airDepth, glass, 0, 6.5, zAir, tg);
    box(T.lu * 0.92 + 1, 1.2, airDepth + 3, roofMat, 0, 13.4, zAir, tg);
    box(Math.min(T.lu * 0.5, 340), 22, landDepth, glass, 0, 11, zLand, tg);
    box(Math.min(T.lu * 0.5, 340) + 2, 1.5, landDepth + 6, roofMat, 0, 22.6, zLand, tg);
    // jet bridges: one per gate, from the concourse face out to the nose of the aircraft on its stand
    for (const gt of L.gates) {
      const u = gt.u - T.u0 - T.lu / 2, lb = Math.max(12, T.v0 - (gt.v + 16));
      box(3.2, 3.0, lb, wallMat, u, 5.2, -sgn * (T.lv / 2 + lb / 2), tg);
      box(4.2, 4.2, 4.2, wallMat, u, 5.2, -sgn * (T.lv / 2 + lb), tg);
    }
    // control tower: use the real built Plajah library `control_tower.glb` model (with procedural fallback until loaded!)
    const tw = piece('control_tower', () => {
      const fb = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 48, 16), wallMat); shaft.position.y = 24; shaft.castShadow = true; fb.add(shaft);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 5.5, 7, 16), new THREE.MeshStandardMaterial({ color: 0x3b5d78, emissive: 0x4ca8d8, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.6 })); cab.position.y = 51.5; fb.add(cab);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1.2, 16), roofMat); cap.position.y = 55.5; fb.add(cap);
      return fb;
    });
    tw.userData.keep = true;
    tw.traverse((c) => { c.userData.keep = true; });
    tw.position.set(-T.lu * 0.38, 0, 0);
    tg.add(tw);
    tcenters.push({ x: T.cx, z: T.cz });
  }
  for (const hpoly of L.hangars) {
    const H = orient(hpoly), shortSide = Math.min(H.lu, H.lv), longSide = Math.max(H.lu, H.lv), along = H.lu >= H.lv;
    const shape = new THREE.Shape(); const r = shortSide / 2, wall = 6;
    shape.moveTo(-r, 0); shape.lineTo(-r, wall); shape.absarc(0, wall, r, Math.PI, 0, true); shape.lineTo(r, 0); shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: longSide, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.55, metalness: 0.55 }));
    // extrude runs along local +z; the long side must lie along the runway (u) or across it (v)
    const rot = Math.atan2(L.ux, L.uz) + (along ? 0 : Math.PI / 2);
    mesh.rotation.y = rot; mesh.position.set(H.cx - Math.sin(rot) * longSide / 2, Y, H.cz - Math.cos(rot) * longSide / 2);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    box(shortSide * 0.7, 9, 0.5, new THREE.MeshStandardMaterial({ color: 0x40464c, roughness: 0.6 }), 0, 4.5, 0, mesh);
  }
  // Collapse static airport terminal/jet-bridge/hangar/stand-line boxes into ~8 cell draws (preserving drivable surfaces & control_tower GLB!)
  mergeStaticScenery(group, 600, new Set<THREE.Object3D>(surfaces));

  // ---- lights: approach, runway edge, taxiway edge, PAPI ----
  const lampCount = 70 + 2 * Math.ceil(RL / 60) + 8 + 4;
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampCount + 400);
  lights.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((lampCount + 400) * 3), 3);
  const col = new THREE.Color(), tp = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  let li = 0; const approach: number[] = [];
  const lamp = (p: P2, y: number, c: number, appr = false): void => { lights.setMatrixAt(li, m4.compose(tp.set(p[0], y, p[1]), q, one)); lights.setColorAt(li, col.setHex(c)); if (appr) approach.push(li); li++; };
  for (let u = 30; u <= 900; u += 30) { lamp(toWorld(L, -u, 0), Y + 0.6, 0xfff4d8, true); if (u % 150 === 0) for (let w = -15; w <= 15; w += 3) if (w) lamp(toWorld(L, -u, w), Y + 0.6, 0xfff4d8); }
  for (let u = 0; u <= RL; u += 60) for (const sd of [-1, 1]) lamp(toWorld(L, u, sd * (RW / 2 + 1.5)), Y + 0.3, 0xfff7e0);
  for (let w = -RW / 2; w <= RW / 2; w += 5) { lamp(toWorld(L, -1, w), Y + 0.3, 0x2ee86a); lamp(toWorld(L, RL + 1, w), Y + 0.3, 0xff2a2a); }
  for (const t of L.taxiways) for (let i = 0; i < t.length - 1; i++) {
    const dx = t[i + 1][0] - t[i][0], dz = t[i + 1][1] - t[i][1], l = Math.hypot(dx, dz);
    for (let s = 0; s < l && li < lampCount + 390; s += 50) for (const sd of [-1, 1]) lamp([t[i][0] + dx / l * s - dz / l * 14 * sd, t[i][1] + dz / l * s + dx / l * 14 * sd], Y + 0.25, 0x3f6bff);
  }
  for (let k = 0; k < 4; k++) lamp(toWorld(L, 330, RW / 2 + 18 + k * 3), Y + 0.5, k < 2 ? 0xff3030 : 0xffffff);
  lights.count = li; lights.instanceMatrix.needsUpdate = true; if (lights.instanceColor) lights.instanceColor.needsUpdate = true; group.add(lights);
  // windsock
  {
    const w = toWorld(L, 700, -(RW / 2 + 70)), pole = box(0.35, 9, 0.35, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), w[0], Y + 4.5, w[1]);
    void pole;
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, roughness: 0.7 })); sock.rotation.z = Math.PI / 2; sock.position.set(w[0] + 2, Y + 8.5, w[1]); group.add(sock);
    (sock as unknown as { userData: { w: P2 } }).userData.w = w;
  }

  // ---- aircraft ----
  const planeGroup = new THREE.Group(); planeGroup.name = 'aircraft'; group.add(planeGroup);
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.35, metalness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.6 });
  const navRed = new THREE.MeshBasicMaterial({ color: 0xff2828 });
  const navGreen = new THREE.MeshBasicMaterial({ color: 0x24ff68 });
  const landingLightMat = new THREE.MeshBasicMaterial({ color: 0xfff8dc });
  const liveries = [0x1d4e89, 0xb02a37, 0x1f7a4d, 0xd98a00, 0x5b3cc4].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.25 }));
  const makePlane = (p: Plane): { g: THREE.Group; gear: THREE.Group; prop?: THREE.Mesh; beacon: THREE.Mesh; landing: THREE.Mesh } => {
    const g = new THREE.Group(), gear = new THREE.Group(), tail = liveries[p.id % liveries.length], jet = p.type === 'jet', S = jet ? 1 : 0.55;
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g): THREE.Mesh => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
    const L0 = 30 * S;
    const fus = add(new THREE.CylinderGeometry(1.95 * S, 1.95 * S, L0, 14), white, 0, 4.4 * S, 0); fus.rotation.x = Math.PI / 2;
    const nose = add(new THREE.CylinderGeometry(0.35 * S, 1.95 * S, 6 * S, 14), white, 0, 4.4 * S, L0 / 2 + 3 * S); nose.rotation.x = Math.PI / 2;
    const tcone = add(new THREE.CylinderGeometry(1.95 * S, 0.5 * S, 9 * S, 14), white, 0, 4.9 * S, -L0 / 2 - 4.5 * S); tcone.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(3.95 * S, 0.5 * S, L0 * 0.8), liveries[p.id % liveries.length], 0, 3.0 * S, 0);                                   // belly stripe
    const wingY = jet ? 3.6 * S : 6.0 * S;
    for (const sd of [-1, 1]) {
      const wing = add(new THREE.BoxGeometry((jet ? 17 : 11) * S, 0.35 * S, 5 * S), white, sd * (jet ? 9 : 6) * S, wingY, jet ? -1 * S : 1 * S); wing.rotation.y = sd * (jet ? 0.5 : 0.04);
      if (jet) { add(new THREE.CylinderGeometry(1.15, 1.15, 4.2, 12), grey, sd * 6.5, 2.2, 1.4).rotation.x = Math.PI / 2; add(new THREE.BoxGeometry(0.2, 1.8, 2.2), white, sd * 17, 4.9, -5.6); }
      // Port (red) & Starboard (green) wingtip navigation lights
      const nav = add(new THREE.SphereGeometry(0.42 * S, 6, 6), sd > 0 ? navRed : navGreen, sd * (jet ? 17.1 : 11.4) * S, wingY + 0.4 * S, jet ? -5.4 * S : 1 * S);
      nav.castShadow = false;
      const stab = add(new THREE.BoxGeometry(6.5 * S, 0.3 * S, 2.8 * S), white, sd * 3.8 * S, 5.2 * S, -L0 / 2 - 3.2 * S); stab.rotation.y = sd * 0.35;
    }
    const fin = add(new THREE.BoxGeometry(0.4 * S, 7 * S, 5.5 * S), tail, 0, 8.4 * S, -L0 / 2 - 2.6 * S); fin.rotation.x = -0.28;
    const beacon = add(new THREE.SphereGeometry(0.48 * S, 6, 6), navRed, 0, 6.5 * S, -1.5 * S); beacon.castShadow = false; beacon.userData.keep = true;
    const landing = add(new THREE.SphereGeometry(0.65 * S, 8, 8), landingLightMat, 0, 2.8 * S, L0 / 2 + 4.2 * S); landing.castShadow = false; landing.userData.keep = true;
    let prop: THREE.Mesh | undefined;
    if (!jet) { prop = add(new THREE.BoxGeometry(5.2, 0.35, 0.12), grey, 0, 4.2, L0 / 2 + 5.4 * S); prop.userData.keep = true; }
    add(new THREE.CylinderGeometry(0.28, 0.28, 3.2 * S, 8), grey, 0, 1.6 * S, 7 * S, gear); add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 10), grey, 0, 0.45, 7 * S, gear).rotation.z = Math.PI / 2;
    for (const sd of [-1, 1]) { add(new THREE.CylinderGeometry(0.3, 0.3, 2.6 * S, 8), grey, sd * 2.4 * S, 1.4 * S, -2 * S, gear); add(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 10), grey, sd * 2.4 * S, 0.5, -2 * S, gear).rotation.z = Math.PI / 2; }
    mergeByMaterial(gear);
    gear.traverse((c) => { c.userData.keep = true; });
    g.add(gear);
    mergeByMaterial(g);
    planeGroup.add(g);
    return { g, gear, prop, beacon, landing };
  };
  const planes = new Map<number, ReturnType<typeof makePlane>>();
  const mid = toWorld(L, RL / 2, 0), side = toWorld(L, RL * 0.4, L.taxiV + 220);
  const update = (now: number, dt: number, cam?: THREE.Vector3): void => {
    void dt;
    // Distance-cull the entire airfield (> 2.4 km from runway center) while driving elsewhere in the 150 km² region
    if (cam) {
      const dx = mid[0] - cam.x, dz = mid[1] - cam.z;
      const nearAirfield = dx * dx + dz * dz <= 2400 * 2400;
      group.visible = nearAirfield;
      if (!nearAirfield) return;
    } else {
      group.visible = true;
    }
    // approach lights: a chasing flash toward the runway
    if (approach.length && lights.instanceColor) {
      const head = Math.floor(now * 8) % 14;
      approach.forEach((idx, k) => { const lit = (approach.length - 1 - k) % 14 === head; lights.setColorAt(idx, col.setHex(lit ? 0xffffff : 0x8a826a)); });
      lights.instanceColor.needsUpdate = true;
    }
    if (!o.sim) return;
    const live = new Set<number>();
    for (const p of o.sim.planes) {
      live.add(p.id);
      let rec = planes.get(p.id); if (!rec) { rec = makePlane(p); planes.set(p.id, rec); }
      rec.g.position.set(p.x, Y + p.alt + 0.05, p.z);
      rec.g.rotation.set(0, 0, 0, 'YXZ'); rec.g.rotation.y = p.yaw; rec.g.rotation.x = -p.pitch;
      rec.gear.visible = p.alt < 45 && !(p.state === 'climb' && p.alt > 25);
      rec.beacon.visible = Math.floor(now * 1.8 + p.id * 0.7) % 2 === 0;
      rec.landing.visible = p.state === 'approach' || p.state === 'rollout' || p.state === 'takeoff' || (p.state === 'climb' && p.alt < 220);
      if (rec.prop) rec.prop.rotation.z = now * 60;
    }
    for (const [id, rec] of planes) if (!live.has(id)) { planeGroup.remove(rec.g); planes.delete(id); }
  };

  // ---- queries ----
  const rwHalf = (RW + shoulder * 2) / 2;
  const alongAcross = (x: number, z: number): { u: number; v: number } => ({ u: (x - L.a[0]) * L.ux + (z - L.a[1]) * L.uz, v: (x - L.a[0]) * L.vx + (z - L.a[1]) * L.vz });
  const paved = (x: number, z: number, pad: number): boolean => {
    const { u, v } = alongAcross(x, z);
    if (u > -pad && u < RL + pad && Math.abs(v) < rwHalf + pad) return true;
    for (const t of L.taxiways) for (let i = 0; i < t.length - 1; i++) {
      const a = t[i], b = t[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      if (Math.hypot(a[0] + dx * k - x, a[1] + dz * k - z) < 13 + pad) return true;
    }
    return L.apron.length >= 3 && distToPoly(L.apron, x, z) <= pad;
  };
  const inside = (x: number, z: number, margin: number): boolean => {
    const { u, v } = alongAcross(x, z);
    if (u > -260 - margin && u < RL + 260 + margin && Math.abs(v) < 110 + margin) return true;
    if (paved(x, z, margin + 25)) return true;
    for (const poly of [L.terminal, ...L.hangars]) if (poly.length >= 3 && (pointInPoly(poly, x, z) || distToPoly(poly, x, z) < margin + 20)) return true;
    return false;
  };
  const shots: AirportScenes['shots'] = [
    { name: 'Airport: runway from the lake end', cam: [toWorld(L, -120, 0)[0], Y + 28, toWorld(L, -120, 0)[1]], at: [mid[0], Y + 20, mid[1]] },
    { name: 'Airport: terminal and apron', cam: [side[0], Y + 45, side[1]], at: [L.gates[0] ? L.gates[0].x : mid[0], Y + 4, L.gates[0] ? L.gates[0].z : mid[1]] },
  ];
  return { group, update, paved, inside, surfaces, shots };
}

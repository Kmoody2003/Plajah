// Back yards (tools/relay_houses.py → region/yards.json): a detached garage at the end of each narrow house's drive and a fence along the rear lot line, so a residential
// block reads as lots with yards, not a lawn with houses along its edges. Two instanced meshes each, whatever the number of houses.
// Site plans (tools/site_plan.py adds to the same file): front walks, side-yard fences, foundation shrubs, mailboxes and picket fences for the homes; truck aprons with dock
// doors and trailers, chain-link perimeters and dumpster pads for the businesses. Each kind is one instanced or merged mesh.
import * as THREE from 'three';

export interface YardData {
  garages: number[][]; fences: number[][];
  /** [x0, z0, x1, z1] door to public walk */ walks?: number[][];
  /** [x0, z0, x1, z1] privacy fence along the side lot lines */ sideFences?: number[][];
  /** [x, z, radius, variety] */ shrubs?: number[][];
  /** [x, z, rot] */ mailboxes?: number[][];
  /** [x0, z0, x1, z1] low white picket fence */ pickets?: number[][];
  /** [x0, z0, x1, z1] 2 m chain-link */ chain?: number[][];
  /** [x, z, w, d, rot] concrete truck apron */ aprons?: number[][];
  /** [x, z, rot] dock door on the wall, facing rot */ docks?: number[][];
  /** [x, z, rot, colour] semi-trailer backed onto a dock */ trailers?: number[][];
  /** [x, z, rot] */ dumpsters?: number[][];
}

/** see-through boards or wire mesh: an alpha-tested texture that repeats along each fence run */
function slatTexture(kind: 'picket' | 'chain'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  if (kind === 'picket') {
    g.fillStyle = '#f2f0ea';
    for (let i = 0; i < 4; i++) { const x = i * 32 + 6; g.fillRect(x, 14, 20, 114); g.beginPath(); g.moveTo(x, 14); g.lineTo(x + 10, 2); g.lineTo(x + 20, 14); g.fill(); }
    g.fillRect(0, 40, 128, 9); g.fillRect(0, 100, 128, 9);
  } else {
    g.strokeStyle = '#b9bdc0'; g.lineWidth = 3;
    for (let i = -128; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
    g.fillStyle = '#9fa4a8'; g.fillRect(0, 0, 128, 6);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildYards(d: YardData, ground: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group(); group.name = 'yards';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const siding = [0xd8d2c4, 0xbfb6a3, 0x9a9c97, 0xe4e0d6, 0x8e7f6d, 0xc8c2b4, 0x7d8a86];
  if (d.garages.length) {
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(6.2, 3.0, 6.8).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), d.garages.length);
    const roof = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 4.9, 1.6, 4, 1).rotateY(Math.PI / 4).translate(0, 3.8, 0), new THREE.MeshStandardMaterial({ color: 0x3b3a3c, roughness: 0.9 }), d.garages.length);
    const door = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 2.3, 0.08).translate(0, 1.15, -3.42), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.6 }), d.garages.length);
    d.garages.forEach(([x, z, rot], i) => {
      const y = ground(x, z) - 0.05;
      q.setFromAxisAngle(up, rot); p.set(x, y, z);
      walls.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1))); walls.setColorAt(i, col.setHex(siding[i % siding.length]));
      roof.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1.1)));
      door.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1)));
    });
    walls.castShadow = roof.castShadow = true;
    door.castShadow = false; // flush against garage wall: avoids duplicate shadow geometry
    for (const m of [walls, roof, door]) { m.receiveShadow = true; group.add(m); }
  }
  if (d.fences.length) {
    const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.5, 0.08).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.9 }), d.fences.length);
    d.fences.forEach(([x0, z0, x1, z1], i) => {
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
      q.setFromAxisAngle(up, Math.atan2(-(z1 - z0), x1 - x0)); p.set(x, ground(x, z), z);
      fence.setMatrixAt(i, m4.compose(p, q, s.set(L, 1, 1)));
    });
    fence.receiveShadow = true; group.add(fence);
  }
  if (d.sideFences?.length) {
    const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.8, 0.07).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: 0x86765e, roughness: 0.9 }), d.sideFences.length);
    d.sideFences.forEach(([x0, z0, x1, z1], i) => {
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
      q.setFromAxisAngle(up, Math.atan2(-(z1 - z0), x1 - x0)); p.set(x, Math.min(ground(x0, z0), ground(x1, z1), ground(x, z)) - 0.05, z);
      fence.setMatrixAt(i, m4.compose(p, q, s.set(L, 1, 1))); fence.setColorAt(i, col.setHex([0x86765e, 0x9a8a6e, 0x6f6456, 0xa59b88][i % 4]));
    });
    fence.receiveShadow = true; fence.castShadow = true; group.add(fence);
  }
  // see-through fences, pickets and chain-link: one quad strip per run that follows the ground
  for (const [kind, runs, height, period] of [['picket', d.pickets, 1.0, 0.6], ['chain', d.chain, 2.0, 1.2]] as const) {
    if (!runs?.length) continue;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const postM: THREE.Matrix4[] = [];
    for (const [x0, z0, x1, z1] of runs) {
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
      const n = Math.max(1, Math.ceil(L / 3));
      const b = pos.length / 3;
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = ground(x, z) - 0.03;
        pos.push(x, y, z, x, y + height, z); uv.push((L * t) / period, 0, (L * t) / period, 1);
        if (kind === 'chain') postM.push(m4.compose(p.set(x, y, z), q.identity(), s.set(1, 1, 1)).clone());
      }
      for (let k = 0; k < n; k++) { const a = b + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: slatTexture(kind), alphaTest: 0.5, side: THREE.DoubleSide, roughness: kind === 'chain' ? 0.5 : 0.8, metalness: kind === 'chain' ? 0.5 : 0 }));
    m.name = 'yard-' + kind; m.castShadow = kind === 'picket'; m.receiveShadow = true; group.add(m);
    if (postM.length) {
      const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, height + 0.05, 6).translate(0, (height + 0.05) / 2, 0), new THREE.MeshStandardMaterial({ color: 0x9fa4a8, metalness: 0.6, roughness: 0.4 }), postM.length);
      postM.forEach((mm, i) => posts.setMatrixAt(i, mm)); group.add(posts);
    }
  }
  // flat concrete: front walks (following the ground) and truck aprons (level pads)
  {
    const pos: number[] = [], idx: number[] = [], uv: number[] = [];
    const quad = (pts: number[][], y: number[]): void => { const b = pos.length / 3; pts.forEach((pt, k) => { pos.push(pt[0], y[k], pt[1]); uv.push(pt[0] / 2, pt[1] / 2); }); idx.push(b, b + 2, b + 1, b, b + 3, b + 2); };
    for (const [x0, z0, x1, z1] of d.walks ?? []) {
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz * 0.6, nz = ux * 0.6, n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < n; k++) {
        const a = [x0 + (x1 - x0) * (k / n), z0 + (z1 - z0) * (k / n)], b = [x0 + (x1 - x0) * ((k + 1) / n), z0 + (z1 - z0) * ((k + 1) / n)];
        const pts = [[a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz]];
        quad(pts, pts.map((pt) => ground(pt[0], pt[1]) + 0.06));
      }
    }
    for (const [x, z, w, dd, rot] of d.aprons ?? []) {
      const c = Math.cos(rot), sn = Math.sin(rot);
      const to = (a: number, b: number): number[] => [x + c * a + sn * b, z - sn * a + c * b];
      const pts = [to(-w / 2, -dd / 2), to(w / 2, -dd / 2), to(w / 2, dd / 2), to(-w / 2, dd / 2)];
      const y = Math.max(...pts.map((pt) => ground(pt[0], pt[1])), ground(x, z)) + 0.12;
      quad(pts, [y, y, y, y]);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.receiveShadow = true; m.name = 'yard-concrete'; group.add(m);
    }
  }
  const inst = (list: number[][] | undefined, geo: THREE.BufferGeometry, mat: THREE.Material, place: (row: number[]) => void, shadow = true): THREE.InstancedMesh | null => {
    if (!list?.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((row, i) => { place(row); im.setMatrixAt(i, m4); });
    im.castShadow = shadow; im.receiveShadow = true; group.add(im); return im;
  };
  const stand = ([x, z, rot]: number[], lift = 0): void => { q.setFromAxisAngle(up, rot); m4.compose(p.set(x, ground(x, z) + lift, z), q, s.set(1, 1, 1)); };
  // foundation shrubs: squashed low-poly balls in a few greens
  const shrubCols = [0x3f5a2c, 0x4d6b33, 0x2f4a26, 0x5b6e38];
  const sh = inst(d.shrubs, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), ([x, z, r]) => {
    q.setFromAxisAngle(up, (x * 3.1 + z) % 6.28); m4.compose(p.set(x, ground(x, z) + r * 0.45, z), q, s.set(r, r * 0.8, r));
  });
  if (sh) d.shrubs!.forEach((row, i) => sh.setColorAt(i, col.setHex(shrubCols[row[3] ?? i % 4])));
  // mailboxes: a post and a box facing the street
  inst(d.mailboxes, new THREE.BoxGeometry(0.09, 1.05, 0.09).translate(0, 0.52, 0), new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 }), (r) => stand(r), false);
  const mb = inst(d.mailboxes, new THREE.BoxGeometry(0.24, 0.24, 0.5).translate(0, 1.15, 0), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), (r) => stand(r), false);
  if (mb) d.mailboxes!.forEach((_, i) => mb.setColorAt(i, col.setHex([0x1e1e20, 0x2b2f33, 0x8a8e90, 0xd8d6d0, 0x5a1a1a][i % 5])));
  // dock doors: a roll-up door on the wall facing the apron, a black dock seal and bumper below it
  inst(d.docks, new THREE.BoxGeometry(3.0, 3.1, 0.12).translate(0, 2.75, 0.06), new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.6, metalness: 0.4 }), (r) => stand(r), false);
  inst(d.docks, new THREE.BoxGeometry(3.4, 1.2, 0.5).translate(0, 0.6, 0.25), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }), (r) => stand(r));
  // trailers backed onto the docks: a 13.6 m box van on its wheels
  const tr = inst(d.trailers, new THREE.BoxGeometry(2.6, 2.9, 13.6).translate(0, 2.6, 0), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 }), (r) => stand(r, 0.1));
  if (tr) d.trailers!.forEach((row, i) => tr.setColorAt(i, col.setHex([0xeeeeea, 0xd8dadb, 0x2d5b9e, 0xb5251f][row[3] ?? 0])));
  inst(d.trailers, new THREE.BoxGeometry(2.4, 1.1, 3.2).translate(0, 0.55, 5.0), new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.9 }), (r) => stand(r));
  // dumpsters
  inst(d.dumpsters, new THREE.BoxGeometry(2.0, 1.35, 1.5).translate(0, 0.68, 0), new THREE.MeshStandardMaterial({ color: 0x24533a, roughness: 0.7, metalness: 0.3 }), (r) => stand(r));
  return group;
}

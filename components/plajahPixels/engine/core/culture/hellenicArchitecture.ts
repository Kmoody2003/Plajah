/**
 * Classical architecture + statuary for the Hellenic Marble scene, built procedurally in marble.
 *
 *  - Corinthian columns: fluted shafts with entasis, Attic bases (torus–scotia–torus), bell capitals
 *    dressed with two tiers of curled acanthus leaves, corner volutes and a concave abacus.
 *  - A full entablature across the top: three-fascia architrave, Doric-style triglyph frieze with
 *    carved rosette metopes, egg-and-dart ovolo, dentils, cornice and a gilded meander band.
 *  - Shell-headed niches with draped statues (peplos/himation folds, contrapposto, raised/lowered
 *    arms, held attributes) behind the colonnade, and larger statues on moulded plinths.
 *  - A pediment with a sculpted tympanum and acroteria that lowers into place in the temple moment.
 *
 * Everything shares the scene's marble material(s) so it all lights and shadows as one stone.
 */

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Mat = any;

/** Bake every (non-instanced) mesh under `group` into ONE geometry in the group's space: one draw call. */
function bake(THREE: any, group: any) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), m = new THREE.Matrix4(), geos: any[] = [];
  group.traverse((o: any) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    Object.keys(g.attributes).forEach(k => { if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); });
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); geos.push(g);
  });
  const out = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
  return out;
}
/** A baked, single-mesh version of a builder's group. */
function baked(THREE: any, group: any, mat: Mat) {
  const mesh = new THREE.Mesh(bake(THREE, group), mat); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}

function lathe(THREE: any, pts: [number, number][], seg = 48) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
}

/** Fluted, tapering (entasis) shaft. */
function shaftGeo(THREE: any, h: number, r0: number, r1: number, flutes = 24, depth = 0.07) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 96, 24, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const u = y / h + 0.5, ent = 1 + Math.sin(u * Math.PI) * 0.035;
    const flute = 1 - depth * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.5);   // concave flutes
    const k = ent * flute; if (r > 0) { p.setX(i, x * k); p.setZ(i, z * k); }
  }
  g.computeVertexNormals(); return g;
}

/** A curled acanthus leaf: a bent, serrated, ribbed sheet (unit height). */
function leafGeo(THREE: any) {
  const g = new THREE.PlaneGeometry(0.5, 1, 8, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5;               // y 0..1
    const lobe = 0.5 + 0.5 * Math.cos(y * Math.PI * 5);      // serrated lobes along the edge
    const w = (0.35 + 0.65 * Math.sin(Math.min(1, y * 1.15) * Math.PI)) * (0.82 + 0.18 * lobe);
    const xx = x * w;
    const curl = Math.pow(Math.max(0, y - 0.62) / 0.38, 2) * 0.55;  // tip curls outward and down
    const cup = (x * 2) * (x * 2) * 0.08 - Math.abs(x) * 0.06;      // channelled midrib
    p.setXYZ(i, xx, y - curl * 0.35, cup + curl);
  }
  g.computeVertexNormals(); return g;
}

export function buildCorinthianColumn(THREE: any, mat: Mat, h = 7.2) {
  const g = new THREE.Group();
  const r0 = 0.42, r1 = 0.36, baseH = 0.55, capH = 1.05, shaftH = h - baseH - capH;
  const add = (geo: any, y: number) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  // plinth + Attic base
  add(new THREE.BoxGeometry(1.12, 0.16, 1.12), 0.08);
  add(lathe(THREE, [[0.56, 0], [0.56, 0.03], [0.58, 0.09], [0.55, 0.15], [0.49, 0.17], [0.46, 0.22], [0.44, 0.27], [0.47, 0.3], [0.5, 0.33], [0.48, 0.37], [0.43, 0.39], [0.42, 0.39]], 64), 0.16);
  add(shaftGeo(THREE, shaftH, r0, r1), baseH + shaftH / 2);
  // astragal + bell
  const capY = baseH + shaftH;
  add(lathe(THREE, [[0.37, 0], [0.4, 0.03], [0.4, 0.06], [0.36, 0.09]], 48), capY);
  add(lathe(THREE, [[0.36, 0], [0.37, 0.3], [0.41, 0.6], [0.48, 0.85], [0.52, 0.9]], 48), capY + 0.08);
  // two tiers of acanthus leaves around the bell
  const lg = leafGeo(THREE);
  [[0, 0.42, 0.42, 0], [1, 0.62, 0.4, Math.PI / 8]].forEach(([tier, lh, rr, off]) => {
    for (let k = 0; k < 8; k++) {
      const a = off + k * Math.PI / 4, m = new THREE.Mesh(lg, mat);
      m.scale.set(0.62, lh, 0.62); m.position.set(Math.sin(a) * rr, capY + 0.1 + tier * 0.22, Math.cos(a) * rr);
      m.rotation.y = a; m.castShadow = true; g.add(m);
    }
  });
  // corner volutes + concave abacus
  const vol = new THREE.TorusGeometry(0.1, 0.035, 8, 24);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, m = new THREE.Mesh(vol, mat);
    m.position.set(Math.sin(a) * 0.58, capY + 0.86, Math.cos(a) * 0.58); m.rotation.y = a + Math.PI / 2; g.add(m);
  }
  const ab = new THREE.BoxGeometry(1.24, 0.14, 1.24, 12, 1, 12), ap = ab.attributes.position;
  for (let i = 0; i < ap.count; i++) { const x = ap.getX(i), z = ap.getZ(i); const k = 1 - 0.08 * Math.abs(Math.cos(Math.atan2(z, x) * 2)); ap.setX(i, x * k); ap.setZ(i, z * k); }   // concave sides, corners kept
  ab.computeVertexNormals();
  add(ab, capY + 0.98);
  return g;
}

/** Ionic: Attic base, slimmer fluted shaft, echinus + pulvinus with spiral volutes, thin abacus. */
export function buildIonicColumn(THREE: any, mat: Mat, h = 7.2) {
  const g = new THREE.Group();
  const add = (geo: any, x: number, y: number, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const baseH = 0.5, capH = 0.62, shaftH = h - baseH - capH;
  add(new THREE.BoxGeometry(1.0, 0.14, 1.0), 0, 0.07);
  add(lathe(THREE, [[0.5, 0], [0.52, 0.06], [0.48, 0.13], [0.42, 0.18], [0.4, 0.24], [0.44, 0.28], [0.45, 0.32], [0.39, 0.36], [0.38, 0.36]], 64), 0, 0.14);
  add(shaftGeo(THREE, shaftH, 0.38, 0.33, 24, 0.08), 0, baseH + shaftH / 2);
  const capY = baseH + shaftH;
  add(lathe(THREE, [[0.33, 0], [0.37, 0.03], [0.42, 0.1], [0.44, 0.16], [0.42, 0.2]], 48), 0, capY);
  add(new THREE.BoxGeometry(1.2, 0.2, 0.66), 0, capY + 0.3);                         // pulvinus (bolster)
  [-1, 1].forEach(sd => [-0.34, 0.34].forEach(z => {                                    // a spiral volute each side, front and back
    const pts: any[] = []; for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 5, r = 0.24 * (1 - k / 66); pts.push(new THREE.Vector3(sd * (0.6 + Math.cos(a) * r), capY + 0.18 - Math.sin(a) * r, z)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.035, 8, false), 0, 0);
    add(new THREE.SphereGeometry(0.05, 10, 8), pts[60].x, pts[60].y, z);   // the volute's eye
  }));
  add(new THREE.BoxGeometry(1.0, 0.08, 0.9), 0, capY + 0.44);
  return g;
}

/** Doric: no base, stout tapering shaft with 20 sharp-arrised flutes, cushion echinus, square abacus. */
export function buildDoricColumn(THREE: any, mat: Mat, h = 7.2) {
  const g = new THREE.Group();
  const add = (geo: any, y: number) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
  const capH = 0.55, shaftH = h - capH;
  add(shaftGeo(THREE, shaftH, 0.5, 0.39, 20, 0.05), shaftH / 2);
  add(lathe(THREE, [[0.39, 0], [0.42, 0.04], [0.4, 0.07], [0.43, 0.1], [0.56, 0.24], [0.6, 0.31]], 48), shaftH);
  add(new THREE.BoxGeometry(1.26, 0.22, 1.26), shaftH + 0.42);
  return g;
}

/**
 * Draped statue (~3.3 units tall). `seed` picks pose/attribute: 0 kore with offering bowl, 1 orator
 * with raised arm, 2 figure holding a wreath aloft, 3 athlete leaning on a spear, 4 herm bust on a
 * pillar, 5 hydriaphoros (water-bearer with a hydria on her shoulder).
 */
export function buildStatue(THREE: any, mat: Mat, seed: number) {
  const g = new THREE.Group();
  if (seed === 4) return buildHerm(THREE, mat);
  const rnd = (() => { let s = 1000 + seed * 7919; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  // body: lathe silhouette from hem to neck, flattened front-back, then carved with drapery folds
  const prof: [number, number][] = [[0.0, 0], [0.4, 0.0], [0.43, 0.06], [0.4, 0.2], [0.35, 0.7], [0.31, 1.15], [0.33, 1.45], [0.29, 1.75], [0.25, 1.92], [0.29, 2.15], [0.32, 2.36], [0.335, 2.48], [0.25, 2.58], [0.1, 2.64], [0.085, 2.74], [0.0, 2.76]];
  const body = lathe(THREE, prof, 96);
  const bp = body.attributes.position;
  const sway = (seed % 2 ? 1 : -1) * 0.07;
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), z = bp.getZ(i); const y = bp.getY(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    if (r < 1e-4) { bp.setX(i, x + Math.sin(y * 1.2) * sway); continue; }
    const skirt = Math.max(0, 1 - y / 1.5), chest = Math.max(0, 1 - Math.abs(y - 2.15) / 0.45);
    const folds = 0.045 * skirt * Math.pow(Math.abs(Math.sin(a * 9 + Math.sin(y * 2.3 + seed) * 0.8)), 0.7)
      + 0.022 * chest * Math.sin(a * 7 + y * 9 + seed)                         // diagonal himation folds over the chest
      + 0.012 * Math.sin(a * 23 + y * 4) * skirt;
    const rr = r + folds;
    x = Math.cos(a) * rr; z = Math.sin(a) * rr * 0.7;
    bp.setXYZ(i, x + Math.sin(y * 1.2) * sway - Math.max(0, 0.9 - y) * sway * 0.6, y, z);   // contrapposto S-curve
  }
  body.computeVertexNormals();
  const add = (geo: any, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(body);
  // head with hair (a lumpy cap) and a small nose; slight tilt
  const head = new THREE.Group(); head.position.set(Math.sin(2.9 * 1.2) * sway * 0.4, 2.93, 0.01); head.rotation.set(-0.06 + rnd() * 0.1, (rnd() - 0.5) * 0.5, sway * 0.6); g.add(head);
  const hg = new THREE.SphereGeometry(0.155, 32, 24); hg.scale(0.88, 1.12, 0.98);
  const hm = new THREE.Mesh(hg, mat); hm.castShadow = true; head.add(hm);
  const hair = new THREE.SphereGeometry(0.165, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), hp = hair.attributes.position;
  for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i); const k = 1 + 0.06 * Math.sin(Math.atan2(z, x) * 14 + y * 30) * Math.sin(y * 20); hp.setXYZ(i, x * k, y * k, z * k - 0.012); }
  hair.computeVertexNormals(); const hr = new THREE.Mesh(hair, mat); hr.position.y = 0.02; hr.rotation.x = -0.25; hr.castShadow = true; head.add(hr);
  if (seed % 2 === 0) { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), mat); bun.position.set(0, 0.06, -0.15); head.add(bun); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 8), mat); nose.position.set(0, -0.01, 0.145); nose.rotation.x = Math.PI / 2 + 0.3; head.add(nose);
  // arms: tubes along curves with draped sleeves; poses by seed
  const arm = (pts: number[][], r: number) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const tg = new THREE.TubeGeometry(c, 24, r, 12, false), tp = tg.attributes.position;
    // taper toward the wrist
    const n = tp.count, ring = 13;
    for (let i = 0; i < n; i++) { const seg = Math.floor(i / ring) / 24, P = c.getPointAt(Math.min(1, seg)); const k = 1 - seg * 0.45; tp.setXYZ(i, P.x + (tp.getX(i) - P.x) * k, P.y + (tp.getY(i) - P.y) * k, P.z + (tp.getZ(i) - P.z) * k); }
    tg.computeVertexNormals(); const m = add(tg);
    const end = c.getPointAt(1); add(new THREE.SphereGeometry(r * 0.7, 12, 10), end.x, end.y, end.z);
    return end;
  };
  const sh = 2.45, sx = 0.31;
  const L = seed === 5 ? [[-sx, sh, 0], [-0.4, 2.05, 0.05], [-0.36, 1.6, 0.12]] : seed === 1 ? [[-sx, sh, 0], [-0.55, 2.75, 0.08], [-0.62, 3.15, 0.18]]
    : seed === 2 ? [[-sx, sh, 0], [-0.45, 2.85, 0.05], [-0.25, 3.35, 0.05]]
    : [[-sx, sh, 0], [-0.4, 2.05, 0.05], [-0.36, 1.6, 0.12]];
  const Rr = seed === 5 ? [[sx, sh, 0], [0.52, 2.75, 0.02], [0.4, 3.02, 0.02]] : seed === 2 ? [[sx, sh, 0], [0.45, 2.85, 0.05], [0.25, 3.35, 0.05]]
    : seed === 0 ? [[sx, sh, 0], [0.42, 2.1, 0.12], [0.18, 1.95, 0.35]]
    : seed === 3 ? [[sx, sh, 0], [0.5, 2.1, 0.0], [0.62, 1.75, 0.05]]
    : [[sx, sh, 0], [0.4, 2.0, 0.02], [0.38, 1.55, 0.06]];
  const lEnd = arm(L, 0.075), rEnd = arm(Rr, 0.075);
  // himation sash: a fold of cloth from the shoulder across the body, and a fall from the arm
  const sash = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 2.5, 0.05), new THREE.Vector3(0, 2.05, 0.24), new THREE.Vector3(0.3, 1.6, 0.2), new THREE.Vector3(0.34, 1.2, 0.12)]), 32, 0.07, 10, false);
  sash.scale(1, 1, 0.8); add(sash);
  // attributes
  if (seed === 0) { add(lathe(THREE, [[0, 0], [0.1, 0.01], [0.16, 0.06], [0.17, 0.08]], 24), rEnd.x, rEnd.y - 0.02, rEnd.z + 0.05); }
  if (seed === 2) { const w = add(new THREE.TorusGeometry(0.2, 0.03, 8, 32), 0, 3.42, 0.05); w.rotation.x = Math.PI / 2; }
  if (seed === 3) { const sp = add(new THREE.CylinderGeometry(0.025, 0.025, 3.6, 8), 0.68, 1.8, 0.05); sp.rotation.z = -0.05; }
  if (seed === 5) { const v = add(lathe(THREE, [[0, 0], [0.1, 0.0], [0.17, 0.12], [0.2, 0.28], [0.14, 0.42], [0.07, 0.48], [0.09, 0.56]], 24), 0.32, 2.62, 0.02); v.rotation.z = -0.35; }
  // plinth with mouldings
  const plinth = new THREE.Group(); g.add(plinth); plinth.position.y = -0.0001;
  const pm = (geo: any, y: number) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; plinth.add(m); };
  pm(new THREE.BoxGeometry(1.25, 0.12, 1.0), -0.06); pm(new THREE.BoxGeometry(1.1, 0.5, 0.86), -0.37); pm(new THREE.BoxGeometry(1.3, 0.16, 1.05), -0.7);
  return g;
}

/** Herm: a tall tapering pillar carrying a bearded bust (seed 4). */
function buildHerm(THREE: any, mat: Mat) {
  const g = new THREE.Group();
  const add = (geo: any, x: number, y: number, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const pil = new THREE.CylinderGeometry(0.22, 0.17, 2.2, 4, 1); pil.rotateY(Math.PI / 4); add(pil, 0, 1.1);
  add(lathe(THREE, [[0.0, 0], [0.38, 0], [0.42, 0.12], [0.36, 0.32], [0.3, 0.46], [0.12, 0.56], [0.09, 0.64], [0, 0.66]], 64).scale(1, 1, 0.62), 0, 2.2);
  const head = add(new THREE.SphereGeometry(0.18, 32, 24).scale(0.86, 1.1, 0.96), 0, 3.0);
  add(new THREE.SphereGeometry(0.13, 20, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5).scale(1, 1.3, 1), 0, 2.86, 0.06);   // beard
  add(new THREE.SphereGeometry(0.195, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 3.03, -0.01);                                // hair
  add(new THREE.ConeGeometry(0.022, 0.07, 8).rotateX(Math.PI / 2 + 0.3), 0, 2.99, 0.17);
  head.rotation.y = 0.15;
  const pm = (geo: any, y: number) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); };
  pm(new THREE.BoxGeometry(1.25, 0.12, 1.0), -0.06); pm(new THREE.BoxGeometry(1.1, 0.5, 0.86), -0.37); pm(new THREE.BoxGeometry(1.3, 0.16, 1.05), -0.7);
  return g;
}

/** Shell-headed niche: a recessed half-cylinder with a scalloped half-dome. */
function buildNiche(THREE: any, mat: Mat, w = 1.25, h = 4.2) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.CylinderGeometry(w, w, h, 48, 1, true, Math.PI / 2, Math.PI), mat);
  back.material = mat; back.position.y = h / 2; back.receiveShadow = true; (back as any).geometry.scale(-1, 1, 1); g.add(back);
  const sg = new THREE.SphereGeometry(w, 48, 24, Math.PI / 2, Math.PI, 0, Math.PI / 2), sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i); const a = Math.atan2(x, z); const k = 1 - 0.05 * Math.pow(Math.abs(Math.sin(a * 6)), 0.6) * (y / w); sp.setXYZ(i, x * k, y, z * k); }
  sg.scale(-1, 1, 1); sg.computeVertexNormals();
  const shell = new THREE.Mesh(sg, mat); shell.position.y = h; shell.receiveShadow = true; g.add(shell);
  // archivolt + sill
  const arch = new THREE.Mesh(new THREE.TorusGeometry(w + 0.08, 0.08, 10, 48, Math.PI), mat); arch.position.set(0, h, 0.02); arch.castShadow = true; g.add(arch);
  [-1, 1].forEach(s => { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), mat); pl.position.set(s * (w + 0.08), h / 2, 0.02); pl.castShadow = true; g.add(pl); });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.5, 0.18, 0.7), mat); sill.position.set(0, 0.09, 0.15); sill.castShadow = sill.receiveShadow = true; g.add(sill);
  return g;
}

/** Entablature spanning `width`, its soffit at y = 0 (architrave bottom). Returns the group + a gilded band mesh. */
function buildEntablature(THREE: any, mat: Mat, gold: Mat, width: number) {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, y: number, z = 0, m = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(0, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  // architrave: three stepped fasciae
  box(width, 0.22, 1.0, 0.11, 0); box(width, 0.24, 1.06, 0.33, 0.03); box(width, 0.26, 1.12, 0.58, 0.06);
  box(width, 0.08, 1.18, 0.75, 0.09);   // taenia
  // frieze body, then triglyphs + metope rosettes in front of it
  const fy = 0.79, fh = 1.0; box(width, fh, 1.0, fy + fh / 2, 0);
  const tri = new THREE.BoxGeometry(0.42, fh, 0.1), groove = new THREE.BoxGeometry(0.06, fh * 0.86, 0.05);
  const n = Math.floor(width / 1.3);
  const triM = new THREE.InstancedMesh(tri, mat, n), grM = new THREE.InstancedMesh(groove, mat, n * 2);
  const rosM = new THREE.InstancedMesh(lathe(THREE, [[0, 0.09], [0.14, 0.08], [0.24, 0.04], [0.3, 0.0]], 16).rotateX(Math.PI / 2), mat, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.3;
    triM.setMatrixAt(i, m4.makeTranslation(x, fy + fh / 2, 0.55));
    grM.setMatrixAt(i * 2, m4.makeTranslation(x - 0.09, fy + fh / 2 - 0.04, 0.6)); grM.setMatrixAt(i * 2 + 1, m4.makeTranslation(x + 0.09, fy + fh / 2 - 0.04, 0.6));
    rosM.setMatrixAt(i, m4.makeTranslation(x + 0.65, fy + fh / 2, 0.5));
  }
  [triM, grM, rosM].forEach(m => { m.castShadow = m.receiveShadow = true; g.add(m); });
  // gilded meander band above the frieze
  const band = box(width, 0.12, 1.12, fy + fh + 0.06, 0.06, gold);
  // egg-and-dart ovolo
  const ey = fy + fh + 0.2, ne = Math.floor(width / 0.26);
  const egg = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 10).scale(0.8, 1.15, 0.6), mat, ne);
  const dart = new THREE.InstancedMesh(new THREE.ConeGeometry(0.03, 0.2, 6).rotateX(Math.PI), mat, ne);
  box(width, 0.24, 1.08, ey, 0.04);
  for (let i = 0; i < ne; i++) { const x = (i - (ne - 1) / 2) * 0.26; egg.setMatrixAt(i, m4.makeTranslation(x, ey, 0.6)); dart.setMatrixAt(i, m4.makeTranslation(x + 0.13, ey - 0.02, 0.62)); }
  egg.castShadow = dart.castShadow = true; g.add(egg); g.add(dart);
  // dentils
  const dy = ey + 0.26, nd = Math.floor(width / 0.24);
  box(width, 0.24, 1.1, dy, 0.02);
  const dent = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.2, 0.18), mat, nd);
  for (let i = 0; i < nd; i++) dent.setMatrixAt(i, m4.makeTranslation((i - (nd - 1) / 2) * 0.24, dy, 0.64));
  dent.castShadow = true; g.add(dent);
  // cornice: corona + cyma
  box(width + 0.4, 0.3, 1.6, dy + 0.27, 0.25); box(width + 0.5, 0.12, 1.7, dy + 0.48, 0.28);
  return { g, band, top: dy + 0.54 };
}

/** Pediment with a sculpted tympanum and acroteria. Base centred at origin. */
function buildPediment(THREE: any, mat: Mat, gold: Mat, width: number) {
  const g = new THREE.Group(); const hgt = width * 0.18;
  const tri = (w: number, h: number, d: number, z: number) => {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }), mat); m.position.z = z; m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };
  tri(width, hgt, 0.8, -0.4);
  // raking cornices
  [-1, 1].forEach(sx => {
    const len = Math.hypot(width / 2, hgt), ang = Math.atan2(hgt, width / 2);
    const c = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.28, 1.4), mat); c.position.set(sx * width / 4, hgt / 2 + 0.1, 0.2); c.rotation.z = -sx * ang; c.castShadow = true; g.add(c);
  });
  // tympanum sculpture: a reclining figure pair and a central standing figure (scaled-down statues)
  const st = baked(THREE, buildStatue(THREE, mat, 1), mat); st.scale.setScalar(0.55); st.position.set(0, 0.45, 0.25); g.add(st);
  [-1, 1].forEach((s, k) => { const r = baked(THREE, buildStatue(THREE, mat, 2 + k), mat); r.scale.setScalar(0.4); r.rotation.z = s * 1.2; r.position.set(s * width * 0.3, 0.35, 0.25); g.add(r); });
  // acroteria: palmettes at the apex and corners (gilded)
  const palm = (x: number, y: number, sc: number) => {
    const p = new THREE.Group(); p.position.set(x, y, 0.2); p.scale.setScalar(sc); g.add(p);
    for (let k = -3; k <= 3; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(0.45, 1.6, 0.4), gold); l.position.set(Math.sin(k * 0.32) * 0.3, 0.2 + Math.cos(k * 0.32) * 0.3, 0); l.rotation.z = -k * 0.32; p.add(l); }
  };
  palm(0, hgt + 0.3, 1.4); palm(-width / 2 + 0.3, 0.3, 1); palm(width / 2 - 0.3, 0.3, 1);
  return g;
}

export interface PrecinctKeys {
  kick: number; bass: number; voice: number; temple: number; beats: number;
  snareHit: boolean; drop: boolean; section: number;
}
export interface Precinct {
  group: any; pediment: any; band: any; spots: any[];
  update(t: number, dt: number, k: PrecinctKeys): void;
}

/** A statue material carrying its own dissolve uniforms (uReveal 0..1 from the feet up; uBaseY / uH in world units). */
export type StatueMat = any;

/**
 * The precinct around the decorated wall (wall at z = 0, floor at y = floorY, panel centred at x = 0).
 * Music: every bar one statue TRANSFORMS into a different sculpture (the old one dissolves from the head
 * down along a glowing carved edge, the new one is carved up out of the plinth), all of them on a drop;
 * statues pulse in scale with the kick; on each new section / drop the colonnade changes ORDER —
 * Corinthian → Ionic → Doric — each column sinking into the stylobate as the next rises, staggered
 * outward from the centre like machinery.
 */
export function buildPrecinct(THREE: any, scene: any, marble: Mat, darkMarble: Mat, gold: Mat, floorY: number, statueMat: () => StatueMat): Precinct {
  const group = new THREE.Group(); scene.add(group);
  // stylobate steps across the front
  [0, 1, 2].forEach(k => { const s = new THREE.Mesh(new THREE.BoxGeometry(34 - k * 0.8, 0.26, 6.4 - k * 0.7), marble); s.position.set(0, floorY + 0.13 + k * 0.26, 3.2 - k * 0.35); s.receiveShadow = s.castShadow = true; group.add(s); });
  const baseY = floorY + 0.78;
  // colonnade: every position carries all three orders (baked to one mesh each); one stands, two wait below
  const colH = 9.4, colXs = [-7.6, 7.6, -11.2, 11.2, -14.8, 14.8], DOWN = -colH - 1;
  const orderGeos = [buildCorinthianColumn, buildIonicColumn, buildDoricColumn].map(fn => bake(THREE, fn(THREE, marble, colH)));
  const columns = colXs.map((x, i) => ({
    delay: Math.floor(i / 2) * 0.18,
    y: [0, DOWN, DOWN],
    meshes: orderGeos.map((g, o) => { const m = new THREE.Mesh(g, marble); m.castShadow = m.receiveShadow = true; m.position.set(x, baseY + (o === 0 ? 0 : DOWN), 1.7); m.visible = o === 0; group.add(m); return m; }),
  }));
  let order = 0, orderT = 99;
  // entablature carried by the columns
  const ent = buildEntablature(THREE, marble, gold, 32);
  ent.g.position.set(0, baseY + colH, 1.25); group.add(ent.g);

  // Statue stations: four niches behind the colonnade + two big plinths in front. Each holds a rotation
  // of different sculptures, baked to one mesh each, each with its own dissolve material.
  const geoCache = new Map<number, any>();
  const statueGeo = (seed: number) => { let g = geoCache.get(seed); if (!g) { g = bake(THREE, buildStatue(THREE, marble, seed)); geoCache.set(seed, g); } return g; };
  type Station = { pos: any; rotY: number; scale: number; seeds: number[]; cur: number; next: number; t: number; meshes: any[] };
  const stations: Station[] = [];
  const addStation = (x: number, y: number, z: number, rotY: number, scale: number, seeds: number[]) => {
    const st: Station = { pos: new THREE.Vector3(x, y, z), rotY, scale, seeds, cur: 0, next: -1, t: 0, meshes: [] };
    st.meshes = seeds.map((sd, i) => {
      const mt = statueMat(); mt.userData.U.uBaseY.value = y; mt.userData.U.uH.value = 3.7 * scale; mt.userData.U.uReveal.value = i === 0 ? 1 : 0;
      const m = new THREE.Mesh(statueGeo(sd), mt); m.position.copy(st.pos); m.rotation.y = rotY; m.scale.setScalar(scale);
      m.castShadow = m.receiveShadow = true; m.visible = i === 0; group.add(m); return m;
    });
    stations.push(st);
  };
  [-9.4, 9.4, -13, 13].forEach((x, i) => {
    const n = buildNiche(THREE, darkMarble); n.position.set(x, baseY + 0.9, 0.02); group.add(n);
    addStation(x, baseY + 0.9 + 0.18 + 0.82, 0.55, x < 0 ? 0.18 : -0.18, 1.05, [[0, 2, 4], [1, 5, 3], [3, 0, 5], [2, 4, 1]][i]);
  });
  addStation(-5.4, baseY + 0.98, 4.6, 0.35, 1.25, [1, 5, 4, 3]);
  addStation(5.4, baseY + 0.98, 4.6, -0.35, 1.25, [2, 0, 3, 5]);

  // pediment above the entablature (lowers in the temple moment)
  const pediment = buildPediment(THREE, marble, gold, 32);
  const pedRest = baseY + colH + ent.top; pediment.position.set(0, pedRest + 12, 1.4); group.add(pediment);
  // a warm spot on each niche statue that swells with the kick
  const spots = stations.slice(0, 4).map(st => {
    const tgt = new THREE.Object3D(); tgt.position.copy(st.pos); tgt.position.y += 1.6; group.add(tgt);
    const L = new THREE.SpotLight('#ffe2b0', 0, 9, 0.45, 0.6, 1.2); L.position.set(st.pos.x * 0.92, baseY + 7.5, 4.2); L.target = tgt; group.add(L); return L;
  });

  let ped = 12, lastBar = -1, lastSection = -1, rr = 0;
  const transform = (st: Station) => { if (st.next >= 0) return; st.next = (st.cur + 1) % st.seeds.length; st.t = 0; st.meshes[st.next].visible = true; };
  return {
    group, pediment, band: ent.band, spots,
    update(t, dt, k) {
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
      ped += ((k.temple > 0.5 ? 0 : 12) - ped) * k1(k.temple > 0.5 ? 0.9 : 1.4); pediment.position.y = pedRest + ped;
      // statues: one transforms every bar (round robin), all of them on a drop, extra ones on sung snares
      const bar = Math.floor(k.beats / 4);
      if (bar !== lastBar) { if (lastBar >= 0) transform(stations[rr++ % stations.length]); lastBar = bar; }
      if (k.drop) stations.forEach(transform);
      if (k.snareHit && k.voice > 0.5) transform(stations[(rr + 3) % stations.length]);
      stations.forEach(st => {
        if (st.next >= 0) {
          st.t += dt;
          const old = st.meshes[st.cur], nw = st.meshes[st.next];
          const out = Math.min(1, st.t / 0.55), inn = Math.max(0, Math.min(1, (st.t - 0.4) / 0.8));
          old.material.userData.U.uReveal.value = 1 - out; nw.material.userData.U.uReveal.value = inn;
          old.castShadow = out < 0.7; nw.castShadow = inn > 0.3;
          if (inn >= 1) { old.visible = false; st.cur = st.next; st.next = -1; }
        }
        const s = st.scale * (1 + k.kick * 0.07 + k.bass * 0.03);
        const ry = st.rotY + (st.pos.z > 2 ? Math.sin(t * 0.15 + st.pos.x) * 0.25 + k.bass * 0.15 * Math.sign(st.pos.x) : 0);
        st.meshes.forEach(m => { if (m.visible) { m.scale.setScalar(s); m.rotation.y = ry; } });
      });
      // columns: change order on each new section and on drops; the old order sinks, the new one rises
      if ((k.section !== lastSection && lastSection >= 0) || k.drop) { order = (order + 1) % 3; orderT = 0; }
      lastSection = k.section; orderT += dt;
      columns.forEach(c => {
        const started = orderT - c.delay > 0, risen = orderT - c.delay > 0.35;
        c.meshes.forEach((m, o) => {
          const target = o === order ? (risen ? 0 : DOWN) : (started ? DOWN : c.y[o]);
          c.y[o] += (target - c.y[o]) * k1(o === order ? 0.16 : 0.12);
          m.position.y = baseY + c.y[o]; m.visible = c.y[o] > DOWN + 0.5;
        });
      });
      spots.forEach((L, i) => { L.intensity = 4 + k.kick * 14 + k.voice * 6 * (i % 2); });
    },
  };
}

// Lantern Garden — the first Themed Show. A back yard at dusk: paper lanterns and
// string lights on lines between wooden posts, every photo a polaroid hanging from the
// line on twine with a little clothespin, fireflies, a bench and a candle table, and at
// the end sky lanterns rising. Built for remembering someone: everything moves slowly.
//
// Geometry is primitive (instanced where it repeats) so it runs on the iGPU baseline;
// the art can be upgraded per prop later through `PROP_SLOTS` without touching the show.
// Every animated value is a function of show time t — no timers, no Math.random().

import * as THREE from 'three';
import type { ShowPhoto } from '../types';

export interface Pose { pos: THREE.Vector3; target: THREE.Vector3; fov: number }

export interface PhotoSlot {
  index: number;
  row: number;
  /** Rest position of the polaroid centre. */
  rest: THREE.Vector3;
  /** Pivot on the string (twine top). */
  pivot: THREE.Vector3;
  twine: number;
  /** Unit vector the polaroid faces. */
  normal: THREE.Vector3;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  yaw: number;
  group: THREE.Group;
  front: THREE.Mesh;
}

/** Polaroid size in metres (real 600-type proportions, scaled up so it reads on a line). */
export const POLAROID = { w: 0.345, h: 0.42, window: 0.29, top: 0.028 };

export interface ThemeBuild {
  scene: THREE.Scene;
  slots: PhotoSlot[];
  pickables: THREE.Object3D[];
  rows: number;
  bounds: { x0: number; x1: number; zFront: number; zBack: number };
  introFrom: Pose;
  establish: Pose;
  widePose(k: number, lt: number): Pose;
  outroTo: Pose;
  visitPoses(i: number): { approach: Pose; focus: Pose; pull: Pose };
  /** Swinging centre of photo i at time t (with focus damping). */
  photoCentre(i: number, t: number, damp: number, out: THREE.Vector3): THREE.Vector3;
  update(t: number, focus: { index: number; damp: number }, camPos: THREE.Vector3, outro: number): void;
  setPolaroidTexture(i: number, tex: THREE.Texture): void;
  dispose(): void;
}

// --- deterministic helpers ------------------------------------------------------------

function hash(n: number) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Warm paper tones — saturated enough that they glow amber/peach instead of clipping to white.
const LANTERN_COLOURS = [0xffb766, 0xff9f55, 0xff8f6b, 0xffc884, 0xffa978, 0xf59a9f];

/** How many polaroids sit on one line, and how many lines, for n photos. */
export function gardenLayout(n: number) {
  const perRow = n <= 6 ? Math.max(3, n) : n <= 20 ? 6 : n <= 48 ? 8 : 10;
  const rows = Math.max(1, Math.ceil(n / perRow));
  return { perRow, rows };
}

export function buildLanternGarden(photos: ShowPhoto[]): ThemeBuild {
  const n = photos.length;
  const { perRow, rows } = gardenLayout(n);
  const spacing = 1.08;
  const rowGap = 3.3;
  const span = perRow * spacing + 1.4;
  const x0 = -span / 2, x1 = span / 2;

  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T) => { disposables.push(d); return d; };

  // --- sky + fog ----------------------------------------------------------------------
  const horizon = new THREE.Color(0x3a2a44);
  scene.fog = new THREE.FogExp2(horizon.getHex(), 0.028);
  scene.background = horizon;
  const skyGeo = keep(new THREE.SphereGeometry(120, 32, 16));
  const skyMat = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x0b1028) }, uMid: { value: new THREE.Color(0x2a2350) }, uLow: { value: new THREE.Color(0xc9786a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uTop,uMid,uLow; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){ float y=vP.y;
        vec3 c = mix(uLow, uMid, smoothstep(-0.02, 0.18, y)); c = mix(c, uTop, smoothstep(0.18, 0.7, y));
        vec2 g = floor(vec2(atan(vP.z,vP.x)*220., y*220.)); float s = step(0.9965, h(g)) * smoothstep(0.15,0.5,y);
        gl_FragColor = vec4(c + s*0.8, 1.); }`,
  }));
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // --- lights: dusk ambient + moon + fixed pool of lantern lights --------------------
  scene.add(new THREE.HemisphereLight(0x5b5a8c, 0x2a1d14, 0.55));
  const moon = new THREE.DirectionalLight(0x9fb2ff, 0.35);
  moon.position.set(-8, 14, 6);
  scene.add(moon);
  const POOL = 6;
  const pool: THREE.PointLight[] = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffb870, 2.2, 4.2, 1.6);
    scene.add(l);
    pool.push(l);
  }

  // --- ground ---------------------------------------------------------------------------
  const grassTex = keep(bakeGrass());
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(18, 18);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(90, 90)), keep(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, color: 0x9aa58a })));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const wood = keep(new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 }));
  const darkWood = keep(new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.95 }));

  // --- fence (instanced pickets) -------------------------------------------------------
  const zBack = -rows * rowGap - 3.2;
  const zFront = 4;
  {
    const picket = keep(new THREE.BoxGeometry(0.12, 1.5, 0.04));
    const fx0 = x0 - 5, fx1 = x1 + 5;
    const backCount = Math.ceil((fx1 - fx0) / 0.16);
    const sideCount = Math.ceil((zFront + 6 - zBack) / 0.16);
    const total = backCount + sideCount * 2;
    const inst = new THREE.InstancedMesh(picket, darkWood, total);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < backCount; i++) { m.makeTranslation(fx0 + i * 0.16, 0.75 + hash(i) * 0.04, zBack - 1.5); inst.setMatrixAt(k++, m); }
    for (let s = 0; s < 2; s++) for (let i = 0; i < sideCount; i++) {
      m.makeRotationY(Math.PI / 2).setPosition(s ? fx1 : fx0, 0.75 + hash(i + 99) * 0.04, zBack - 1.5 + i * 0.16);
      inst.setMatrixAt(k++, m);
    }
    scene.add(inst);
  }

  // --- trees (soft silhouettes behind the fence) --------------------------------------
  {
    const leaf = keep(new THREE.MeshStandardMaterial({ color: 0x1c2a22, roughness: 1 }));
    const blob = keep(new THREE.IcosahedronGeometry(1, 1));
    const trunk = keep(new THREE.CylinderGeometry(0.12, 0.2, 3, 6));
    const count = 9;
    for (let i = 0; i < count; i++) {
      const tx = THREE.MathUtils.lerp(x0 - 7, x1 + 7, (i + 0.5) / count) + (hash(i + 3) - 0.5) * 2;
      const tz = zBack - 3.2 - hash(i + 7) * 4;
      const g = new THREE.Group();
      const tr = new THREE.Mesh(trunk, darkWood); tr.position.y = 1.5; g.add(tr);
      for (let b = 0; b < 4; b++) {
        const m = new THREE.Mesh(blob, leaf);
        const s = 1.2 + hash(i * 9 + b) * 1.1;
        m.scale.setScalar(s);
        m.position.set((hash(i + b * 3) - 0.5) * 1.8, 3.2 + b * 0.55 + hash(b + i) * 0.6, (hash(i * 2 + b) - 0.5) * 1.4);
        g.add(m);
      }
      const sc = 0.9 + hash(i + 31) * 0.6;
      g.scale.setScalar(sc);
      g.position.set(tx, 0, tz);
      scene.add(g);
    }
  }

  // --- posts + lines + lanterns + bulbs + polaroids -----------------------------------
  const postGeo = keep(new THREE.CylinderGeometry(0.06, 0.07, 1, 8));
  const twineMat = keep(new THREE.LineBasicMaterial({ color: 0xcbb393, transparent: true, opacity: 0.85 }));
  const lineMat = keep(new THREE.LineBasicMaterial({ color: 0x2b2420 }));
  const lanternGeo = keep(lanternGeometry());
  const capGeo = keep(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10));
  const capMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 }));
  const bulbGeo = keep(new THREE.SphereGeometry(0.025, 8, 6));
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xc89a5a }));
  const frameGeo = keep(polaroidFrameGeometry());
  const frontGeo = keep(new THREE.PlaneGeometry(POLAROID.w, POLAROID.h));
  const backMat = keep(new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.9 }));
  const pinGeo = keep(new THREE.BoxGeometry(0.018, 0.07, 0.022));

  const slots: PhotoSlot[] = [];
  const pickables: THREE.Object3D[] = [];
  const lanterns: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; pos: THREE.Vector3; phase: number }[] = [];
  const lanternMats = LANTERN_COLOURS.map((c) => keep(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.75, roughness: 0.8, side: THREE.DoubleSide })));
  const bulbPositions: THREE.Vector3[] = [];

  const rowHeight = (r: number) => 2.85 + r * 0.32;
  const sag = 0.38;
  const lineY = (r: number, x: number) => {
    const u = (x - x0) / (x1 - x0); // 0..1
    return rowHeight(r) - sag * 4 * u * (1 - u);
  };

  for (let r = 0; r < rows; r++) {
    const z = -r * rowGap;
    // posts
    for (const px of [x0, x1]) {
      const post = new THREE.Mesh(postGeo, wood);
      post.scale.y = rowHeight(r) + 0.15;
      post.position.set(px, post.scale.y / 2, z);
      scene.add(post);
    }
    // the line
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 40; s++) { const x = THREE.MathUtils.lerp(x0, x1, s / 40); pts.push(v3(x, lineY(r, x), z)); }
    const line = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(pts)), lineMat);
    scene.add(line);
    for (let s = 0; s <= (x1 - x0) / 0.24; s++) { const x = x0 + 0.12 + s * 0.24; if (x < x1) bulbPositions.push(v3(x, lineY(r, x) - 0.035, z)); }

    const inRow = Math.min(perRow, n - r * perRow);
    const rowSpan = (inRow - 1) * spacing;
    for (let k = 0; k < inRow; k++) {
      const i = r * perRow + k;
      // Snake order lives in the planner; here row r runs left→right.
      const x = -rowSpan / 2 + k * spacing + (hash(i + 5) - 0.5) * 0.12;
      const top = lineY(r, x);
      const twine = 0.42 + hash(i + 11) * 0.16;
      const pivot = v3(x, top, z);
      const rest = v3(x, top - twine - POLAROID.h / 2, z);
      const yaw = (hash(i + 21) - 0.5) * 0.22;

      const group = new THREE.Group();
      group.position.copy(pivot);
      const card = new THREE.Group();
      card.position.y = -twine - POLAROID.h / 2;
      card.rotation.y = yaw;
      const frame = new THREE.Mesh(frameGeo, backMat);
      card.add(frame);
      const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
      keep(frontMat);
      const front = new THREE.Mesh(frontGeo, frontMat);
      front.position.z = 0.0021;
      front.userData.photoIndex = i;
      card.add(front);
      const pin = new THREE.Mesh(pinGeo, wood);
      pin.position.set(0, POLAROID.h / 2 + 0.012, 0.004);
      card.add(pin);
      group.add(card);
      // twine
      const tw = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(0, -twine + 0.01, 0)])), twineMat);
      group.add(tw);
      scene.add(group);
      pickables.push(front);

      slots.push({
        index: i, row: r, rest, pivot, twine, normal: v3(Math.sin(yaw), 0, Math.cos(yaw)),
        swayAmp: 0.035 + hash(i + 41) * 0.03, swayFreq: 0.32 + hash(i + 51) * 0.18, swayPhase: hash(i + 61) * Math.PI * 2,
        yaw, group, front,
      });

      // a lantern between this polaroid and the next (and one at the row start)
      const lanternXs = k === 0 ? [x - spacing / 2, x + spacing / 2] : [x + spacing / 2];
      for (const lx of lanternXs) {
        if (lx > x1 - 0.2 || lx < x0 + 0.2) continue;
        const li = lanterns.length;
        const mat = lanternMats[li % lanternMats.length];
        const mesh = new THREE.Mesh(lanternGeo, mat);
        const s = 0.62 + hash(li + 71) * 0.3;
        mesh.scale.setScalar(s);
        const ly = lineY(r, lx) - 0.04 - 0.19 * s - hash(li + 81) * 0.06;
        mesh.position.set(lx, ly, z);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.205;
        mesh.add(cap);
        scene.add(mesh);
        lanterns.push({ mesh, mat, pos: mesh.position.clone(), phase: hash(li + 91) * 6.28 });
      }
    }
  }
  // string-light bulbs, instanced
  {
    const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, Math.max(1, bulbPositions.length));
    const m = new THREE.Matrix4();
    bulbPositions.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); inst.setMatrixAt(i, m); });
    inst.count = bulbPositions.length;
    scene.add(inst);
  }

  // --- props: bench, candle table, flower pots ---------------------------------------
  const candles: THREE.Vector3[] = [];
  {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 0.06, 0.42)), wood); seat.position.y = 0.45; bench.add(seat);
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 0.36, 0.05)), wood); back.position.set(0, 0.72, -0.19); bench.add(back);
    const legGeo = keep(new THREE.BoxGeometry(0.06, 0.45, 0.06));
    for (const lx of [-0.72, 0.72]) for (const lz of [-0.16, 0.16]) { const l = new THREE.Mesh(legGeo, darkWood); l.position.set(lx, 0.225, lz); bench.add(l); }
    bench.position.set(x1 + 1.6, 0, -rowGap * 0.4);
    bench.rotation.y = -0.6;
    scene.add(bench);

    const table = new THREE.Group();
    const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24)), wood); top.position.y = 0.72; table.add(top);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.08, 0.72, 8)), darkWood); stem.position.y = 0.36; table.add(stem);
    const candleGeo = keep(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10));
    const candleMat = keep(new THREE.MeshStandardMaterial({ color: 0xf6efe0, emissive: 0xffc070, emissiveIntensity: 0.35 }));
    const flameGeo = keep(new THREE.SphereGeometry(0.018, 8, 6));
    const flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    for (let c = 0; c < 3; c++) {
      const cx = (c - 1) * 0.14, cz = (c % 2) * 0.08 - 0.04, h = 0.1 + c * 0.03;
      const cm = new THREE.Mesh(candleGeo, candleMat); cm.scale.y = h / 0.14; cm.position.set(cx, 0.74 + h / 2, cz); table.add(cm);
      const fl = new THREE.Mesh(flameGeo, flameMat); fl.scale.set(1, 1.8, 1); fl.position.set(cx, 0.76 + h + 0.02, cz); table.add(fl);
    }
    table.position.set(x0 - 1.5, 0, -rowGap * 0.2);
    scene.add(table);
    for (let c = 0; c < 3; c++) candles.push(v3(table.position.x + (c - 1) * 0.14, 0.95, table.position.z));

    const potGeo = keep(new THREE.CylinderGeometry(0.22, 0.16, 0.36, 12));
    const potMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a4b33, roughness: 0.9 }));
    const bushGeo = keep(new THREE.IcosahedronGeometry(0.3, 1));
    const bushMats = [0x2f4a33, 0x3a5a3a].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 1 })));
    const flowerGeo = keep(new THREE.SphereGeometry(0.045, 6, 4));
    const flowerMats = [0xf3e6ef, 0xf2b8c6, 0xfff3c4].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.08 })));
    const spots = [[x0 - 0.8, 1.4], [x1 + 0.7, 1.2], [x0 - 0.4, -rows * rowGap + 1], [x1 + 0.3, -rows * rowGap + 0.6]];
    spots.forEach(([px, pz], i) => {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(potGeo, potMat); pot.position.y = 0.18; g.add(pot);
      const bush = new THREE.Mesh(bushGeo, bushMats[i % 2]); bush.position.y = 0.55; bush.scale.set(1, 0.85, 1); g.add(bush);
      for (let f = 0; f < 9; f++) {
        const fl = new THREE.Mesh(flowerGeo, flowerMats[(f + i) % 3]);
        const a = hash(i * 13 + f) * 6.28, rr = 0.22 + hash(f + i) * 0.08;
        fl.position.set(Math.cos(a) * rr, 0.5 + hash(f * 3 + i) * 0.3, Math.sin(a) * rr);
        g.add(fl);
      }
      g.position.set(px, 0, pz);
      scene.add(g);
    });
  }

  // --- fireflies -----------------------------------------------------------------------
  const FF = 140;
  const ffGeo = keep(new THREE.BufferGeometry());
  const ffPos = new Float32Array(FF * 3);
  const ffCol = new Float32Array(FF * 3);
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('color', new THREE.BufferAttribute(ffCol, 3));
  const ffMat = keep(new THREE.PointsMaterial({ size: 0.06, map: keep(spriteTex()), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // --- sky lanterns (outro release) ---------------------------------------------------
  const SKY = 18;
  const skyGeoL = keep(new THREE.CylinderGeometry(0.16, 0.12, 0.34, 10, 1, true));
  const skyMatL = keep(new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xff9a40, emissiveIntensity: 2.2, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
  const skyInst = new THREE.InstancedMesh(skyGeoL, skyMatL, SKY);
  skyInst.frustumCulled = false;
  scene.add(skyInst);

  // --- poses ---------------------------------------------------------------------------
  const zMid = -((rows - 1) * rowGap) / 2;
  const camH = 1.9;
  const establish: Pose = { pos: v3(0, 2.4, 5.6 + rows * 0.4), target: v3(0, 2.0, zMid), fov: 46 };
  const introFrom: Pose = { pos: v3(-2.5, 9.5, 14 + rows), target: v3(0, 1.8, zMid), fov: 40 };
  const outroTo: Pose = { pos: v3(0, 3.2, 9 + rows * 0.6), target: v3(0, 7.5, zMid - 6), fov: 52 };

  const focusDist = (POLAROID.h / 0.78) / (2 * Math.tan(THREE.MathUtils.degToRad(36) / 2));

  const visitPoses = (i: number) => {
    const s = slots[i];
    const side = i % 2 ? 1 : -1;
    const c = s.rest;
    const nrm = s.normal;
    const focus: Pose = { pos: c.clone().addScaledVector(nrm, focusDist), target: c.clone(), fov: 36 };
    const approach: Pose = {
      pos: c.clone().addScaledVector(nrm, 1.9).add(v3(side * 0.35, 0.12, 0)),
      target: c.clone().add(v3(0, 0.05, 0)), fov: 40,
    };
    const pull: Pose = {
      pos: c.clone().addScaledVector(nrm, 2.7).add(v3(-side * 0.5, 0.45, 0)),
      target: c.clone().add(v3(-side * 0.25, 0.15, -0.6)), fov: 44,
    };
    approach.pos.y = Math.max(approach.pos.y, camH - 0.1);
    return { approach, focus, pull };
  };

  const widePose = (k: number, lt: number): Pose => {
    const side = k % 2 ? 1 : -1;
    const drift = lt * 0.06 * side;
    return { pos: v3(side * 1.8 + drift, 3.4, 6.5 + rows * 0.9), target: v3(drift * 0.4, 2.1, zMid), fov: 48 };
  };

  const tmp = new THREE.Vector3();
  const photoCentre = (i: number, t: number, damp: number, out: THREE.Vector3) => {
    const s = slots[i];
    const ang = s.swayAmp * (1 - damp) * Math.sin(t * s.swayFreq * Math.PI * 2 + s.swayPhase);
    const L = s.twine + POLAROID.h / 2;
    return out.set(s.pivot.x + Math.sin(ang) * L, s.pivot.y - Math.cos(ang) * L, s.pivot.z);
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const lightOrder: number[] = lanterns.map((_, i) => i);

  const update = (t: number, focus: { index: number; damp: number }, camPos: THREE.Vector3, outro: number) => {
    // polaroids swing gently on their twine; the one we're visiting settles
    for (const s of slots) {
      const damp = s.index === focus.index ? focus.damp : 0;
      const ang = s.swayAmp * (1 - damp) * Math.sin(t * s.swayFreq * Math.PI * 2 + s.swayPhase);
      s.group.rotation.z = ang;
      s.group.rotation.y = 0.04 * (1 - damp) * Math.sin(t * 0.21 + s.swayPhase * 1.7);
    }
    // lanterns breathe, sway a touch
    for (let i = 0; i < lanterns.length; i++) {
      const L = lanterns[i];
      L.mesh.position.x = L.pos.x + 0.012 * Math.sin(t * 0.5 + L.phase);
      L.mesh.rotation.y = t * 0.08 + L.phase;
    }
    for (let i = 0; i < lanternMats.length; i++) lanternMats[i].emissiveIntensity = 0.72 + 0.06 * Math.sin(t * 1.3 + i * 1.9);
    // fixed light pool follows the lanterns closest to the camera
    lightOrder.sort((a, b) => lanterns[a].mesh.position.distanceToSquared(camPos) - lanterns[b].mesh.position.distanceToSquared(camPos));
    for (let k = 0; k < POOL; k++) {
      const L = lanterns[lightOrder[k]];
      if (L) { pool[k].position.copy(L.mesh.position); pool[k].visible = true; pool[k].intensity = 2.0 + 0.25 * Math.sin(t * 2.1 + L.phase); }
      else if (candles[k - lanterns.length]) { pool[k].position.copy(candles[k - lanterns.length]); }
      else pool[k].visible = false;
    }
    // fireflies drift on slow Lissajous paths
    for (let i = 0; i < FF; i++) {
      const a = hash(i), b = hash(i + 500), c = hash(i + 900);
      const bx = THREE.MathUtils.lerp(x0 - 3, x1 + 3, a), bz = THREE.MathUtils.lerp(zBack + 1, zFront + 2, b), by = 0.4 + c * 2.6;
      ffPos[i * 3] = bx + Math.sin(t * (0.15 + a * 0.2) + c * 6) * 0.7;
      ffPos[i * 3 + 1] = by + Math.sin(t * (0.22 + b * 0.2) + a * 6) * 0.35;
      ffPos[i * 3 + 2] = bz + Math.cos(t * (0.13 + c * 0.2) + b * 6) * 0.7;
      const blink = Math.max(0, Math.sin(t * (0.6 + a * 0.9) + b * 20));
      const k2 = blink * blink;
      ffCol[i * 3] = 1.0 * k2; ffCol[i * 3 + 1] = 0.92 * k2; ffCol[i * 3 + 2] = 0.45 * k2;
    }
    ffGeo.attributes.position.needsUpdate = true;
    ffGeo.attributes.color.needsUpdate = true;
    // sky lanterns rise during the outro
    skyMatL.opacity = Math.min(1, outro * 3);
    skyInst.visible = outro > 0;
    if (outro > 0) {
      for (let i = 0; i < SKY; i++) {
        const delay = hash(i + 300) * 0.45;
        const u = Math.max(0, outro - delay) / (1 - delay);
        // launched from behind the front line so none drift through the camera's path
        const bx = (hash(i + 310) - 0.5) * (x1 - x0 + 4), bz = -rowGap * 0.6 - hash(i + 320) * (rows * rowGap + 1.5);
        tmp.set(bx + Math.sin(u * 3 + i) * 0.6 + u * 2.5, 1.6 + u * u * 14 + hash(i + 330) * 0.8, bz - u * 6);
        q.setFromEuler(new THREE.Euler(0, u * 2 + i, 0.05 * Math.sin(u * 5 + i)));
        sc.setScalar(u > 0 ? 1 : 0.0001);
        m4.compose(tmp, q, sc);
        skyInst.setMatrixAt(i, m4);
      }
      skyInst.instanceMatrix.needsUpdate = true;
    }
  };

  const setPolaroidTexture = (i: number, tex: THREE.Texture) => {
    const m = slots[i]?.front.material as THREE.MeshStandardMaterial;
    if (!m) return;
    m.map = tex;
    m.needsUpdate = true;
  };

  return {
    scene, slots, pickables, rows,
    bounds: { x0, x1, zFront, zBack },
    introFrom, establish, widePose, outroTo, visitPoses, photoCentre, update, setPolaroidTexture,
    dispose() {
      for (const d of disposables) d.dispose();
      for (const s of slots) { const m = s.front.material as THREE.MeshStandardMaterial; m.map?.dispose(); }
    },
  };
}

// --- geometry + baked textures ---------------------------------------------------------

/** Round paper lantern: a lathe with gentle ribs. */
function lanternGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    pts.push(new THREE.Vector2(Math.max(0.035, Math.sin(a) * 0.19), -Math.cos(a) * 0.19));
  }
  const g = new THREE.LatheGeometry(pts, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const ang = Math.atan2(z, x);
    const rib = 1 - 0.035 * Math.pow(Math.abs(Math.cos(ang * 6)), 8);
    const ry = 1 - 0.02 * Math.pow(Math.abs(Math.sin(y * 60)), 6);
    p.setXYZ(i, x * rib * ry, y, z * rib * ry);
  }
  g.computeVertexNormals();
  return g;
}

/** Thin card with a slight thickness so the edge catches lantern light. */
function polaroidFrameGeometry() {
  return new THREE.BoxGeometry(POLAROID.w, POLAROID.h, 0.004);
}

function bakeGrass(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2d3a26';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = hash(i) * 256, y = hash(i + 7000) * 256, l = 3 + hash(i + 9000) * 6;
    const shade = 30 + hash(i + 3000) * 40;
    g.strokeStyle = `rgb(${shade * 0.8 | 0},${shade * 1.25 | 0},${shade * 0.7 | 0})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i + 11) - 0.5) * 2, y - l); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function spriteTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,240,180,0.6)');
  grd.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

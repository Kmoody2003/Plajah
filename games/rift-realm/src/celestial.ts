// Level 5 — Celestial Void Citadel Ruins (6v6 Team Arena / 12v12 Battleground). See docs/rift-realm-levels.md.
// Built to the concept "Celestial Void Citadel Ruins Map": floating islands in a violet nebula. The cracked stone ledge
// (Team A, foreground), the central ruin island — stairs, broken walls, glowing crystals, a lit cavern hollowed underneath —
// the castle island with waterfalls (W), the twin-tower island (N), the gothic portal island (E, Team B), all linked by
// curving hard-light bridges in cyan and violet, with asteroids, moons and a falling void beneath. Frame: +z = south, y up.
import * as THREE from 'three/webgpu';
import { color, float, fract, luminance, mix, normalWorld, positionWorld, sin, smoothstep, texture as tslTexture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { StaticKit, boulder, fbm3, noise3, rng } from './geom';
import { builders } from './structures';
import { pbr, circuitTexture } from './textures';
import type { Level, LevelInfo, Tier } from './shrine';

interface Island { x: number; y: number; z: number; r: number; depth: number; seed: number }
const ISLANDS: Record<'ledge' | 'centre' | 'castle' | 'towers' | 'portal' | 'west2', Island> = {
  ledge: { x: -30, y: 10, z: 46, r: 13, depth: 34, seed: 1 },   // high: the concept looks down on the ruin court
  centre: { x: 0, y: 0, z: 0, r: 26, depth: 64, seed: 2 },
  castle: { x: -54, y: 9, z: -26, r: 22, depth: 58, seed: 3 },
  towers: { x: 14, y: 12, z: -56, r: 15, depth: 44, seed: 4 },
  portal: { x: 54, y: 4, z: -8, r: 19, depth: 56, seed: 5 },
  west2: { x: -24, y: 16, z: -60, r: 8, depth: 24, seed: 6 },
};

export function buildCelestial(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const B = builders(kit);
  const R = rng(5150);
  const cyan = color(0x3ff0ff), violet = color(0xb06bff);

  const desat = (m: THREE.MeshStandardNodeMaterial, keep: number) => { const c = tslTexture(m.map!, uv()).rgb; m.colorNode = mix(vec3(luminance(c)), c, keep).mul(color(m.color)); return m; };
  const ruin = desat(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x8c8a80, normalScale: 1.3 }), 0.08);
  // the concept's castles are weathered grey stone with moss and ivy; violet/cyan live only in crystals, portal, bridges
  const castleStone = desat(pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x9a968c, normalScale: 1.3 }), 0.06);
  {
    const base = mix(vec3(luminance(tslTexture(castleStone.map!, uv()).rgb)), tslTexture(castleStone.map!, uv()).rgb, 0.06).mul(color(0x9a968c));
    const up = smoothstep(float(0.35), float(0.8), normalWorld.y);
    const patchy = smoothstep(float(0.45), float(0.8), luminance(tslTexture(castleStone.map!, positionWorld.xz.mul(0.031).add(positionWorld.y.mul(0.05))).rgb).mul(2.2)); // creeping moss patches
    castleStone.colorNode = mix(base, vec3(0.13, 0.2, 0.08), up.mul(0.75).add(patchy.mul(0.35)).min(0.85));
  }
  const rockSrc = pbr('celestial-obsidian', { maps: ['normal', 'roughness'], tint: 0x6a6070, normalScale: 1.5 });
  // island rock: obsidian sides, grass + moss on top faces
  const rock = new THREE.MeshStandardNodeMaterial({ map: rockSrc.map, normalMap: rockSrc.normalMap, roughnessMap: rockSrc.roughnessMap, roughness: 1 });
  // the obsidian albedo is near-black: lift its luminance into a weathered grey-brown crag, as in the concept
  rock.colorNode = vec3(luminance(tslTexture(rock.map!, uv()).rgb).mul(2.2).add(0.2)).mul(color(0x9a8c88));
  const grassTop = new THREE.MeshStandardNodeMaterial({ map: rockSrc.map, normalMap: rockSrc.normalMap, roughness: 0.95 });
  // mossy flagstone and turf: stone shows through the grass like the concept's ruined courts
  grassTop.colorNode = mix(mix(vec3(0.05, 0.09, 0.04), vec3(0.17, 0.24, 0.09), luminance(tslTexture(rockSrc.map!, uv().mul(2.3)).rgb).mul(2.2)), tslTexture(castleStone.map!, uv().mul(0.6)).rgb.mul(0.42), smoothstep(float(0.45), float(0.7), luminance(tslTexture(rockSrc.map!, uv().mul(0.35)).rgb).mul(1.8)));
  const crystal = new THREE.MeshStandardNodeMaterial({ color: 0x0a2a30, roughness: 0.1 });
  crystal.emissiveNode = mix(cyan, violet, sin(positionWorld.x.mul(0.3).add(time)).mul(0.5).add(0.5)).mul(float(1.4).add(uBeatPulse.mul(1.2)));
  const circuit = circuitTexture(9);
  const bridgeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flow = fract(uv().y.mul(0.08).sub(time.mul(0.25)));
  const edge = smoothstep(float(0.38), float(0.5), uv().x.sub(0.5).abs());
  bridgeMat.colorNode = mix(cyan, violet, uv().y.mul(0.02).fract()).mul(float(1.0).add(edge.mul(2.5)).add(smoothstep(float(0.9), float(1), flow).mul(2)));
  bridgeMat.opacityNode = float(0.14).add(edge.mul(0.5)).add(tslTexture(circuit, uv().mul(vec2(1, 0.12))).r.mul(0.25));
  const portalMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  portalMat.colorNode = cyan.mul(float(1.3).add(sin(uv().y.mul(30).sub(time.mul(3))).mul(0.3)));
  portalMat.opacityNode = smoothstep(float(0.0), float(0.2), uv().y).mul(0.7);
  const fallsMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fallsMat.colorNode = vec3(0.8, 0.9, 1.0).mul(float(0.9).add(tslTexture(circuit, uv().mul(vec2(0.5, 0.15)).add(vec2(0, time.mul(0.8)))).r.mul(0.4)));
  fallsMat.opacityNode = smoothstep(float(1.0), float(0.6), uv().y.oneMinus()).mul(smoothstep(float(0.0), float(0.15), uv().x)).mul(smoothstep(float(1.0), float(0.85), uv().x)).mul(0.32); // misty sheets, not white boards

  // ── islands: a grassy top disc over an inverted crag of floating rock ────────────────────────────────
  const islandTop = (i: Island) => {
    const g = new THREE.CircleGeometry(i.r, lo ? 40 : 64, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k), d = Math.hypot(x, z) / i.r;
      const edgeR = 1 + (noise3(Math.atan2(z, x) * 2 + i.seed, 0, i.seed) - 0.5) * 0.25;
      p.setXYZ(k, x * edgeR, (fbm3(x * 0.08 + i.seed, 0, z * 0.08) - 0.5) * 0.5 * (1 - d), z * edgeR);
    }
    g.computeVertexNormals();
    return g;
  };
  for (const i of Object.values(ISLANDS)) {
    const top = islandTop(i);
    kit.place(top, i.x, i.y, i.z);
    kit.add(grassTop, top, { tpm: 0.25 });
    const crag = new THREE.ConeGeometry(i.r * 1.04, i.depth, lo ? 20 : 32, 8, true);
    crag.rotateX(Math.PI); crag.translate(0, -i.depth / 2, 0);
    const p = crag.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const n = fbm3(x * 0.12 + i.seed, y * 0.12, z * 0.12) - 0.5;
      p.setXYZ(k, x * (1 + n * 0.5), y * (1 + n * 0.2), z * (1 + n * 0.5));
    }
    kit.place(crag, i.x, i.y + 0.05, i.z);
    kit.add(rock, crag, { tpm: 0.12 });
    // a thick rim course so the edge reads as a cliff, not a paper disc
    const nRim = lo ? 18 : 34;
    for (let k = 0; k < nRim; k++) {
      const a = (k / nRim) * Math.PI * 2 + R() * 0.1, b = boulder(i.r * (0.07 + R() * 0.06), i.seed * 40 + k, 2);
      kit.place(b, i.x + Math.cos(a) * i.r * 0.97, i.y - i.r * 0.05, i.z + Math.sin(a) * i.r * 0.97, R() * 6, 0, 0, 1, 0.7, 1);
      kit.add(rock, b, { tpm: 0.3, shadow: false });
    }
  }

  // ── the ledge (Team A): cracked flagstones and a broken parapet ─────────────────────────────────────
  {
    const L = ISLANDS.ledge;
    for (let k = 0; k < 40; k++) {
      const x = L.x - 8 + (k % 8) * 2.1 + (R() - 0.5) * 0.3, z = L.z - 5 + Math.floor(k / 8) * 2.1;
      kit.box(ruin, 2.0, 0.35, 2.0, x, L.y + 0.12 + R() * 0.08, z, (R() - 0.5) * 0.08, { tpm: 0.5, rx: (R() - 0.5) * 0.05 });
    }
    for (let k = 0; k < 9; k++) kit.box(ruin, 1.6, 0.9 + R() * 0.8, 1.2, L.x + 3 + k * 1.2, L.y + 0.6, L.z - 8 + k * 0.4, -0.35, { tpm: 0.5 });
  }

  // ── centre island: the ruin court (B) with stairs, broken walls, standing stones, crystals, a cavern ─
  {
    const C = ISLANDS.centre;
    kit.prism(ruin, 8, 9, 9.5, 1.4, C.x + 2, C.y, C.z - 2, Math.PI / 8, { tpm: 0.4 });
    B.flight(ruin, C.x + 2, C.y + 0.05, C.z + 8.6, Math.PI, C.y + 1.4, 6, 0.28, 0.4);
    B.flight(ruin, C.x - 6.8, C.y + 0.05, C.z - 2, Math.PI / 2, C.y + 1.4, 5, 0.28, 0.4);
    B.gothicWall(ruin, C.x - 4, C.z - 14, 0, 14, 6, 3, C.y, 1.2, 0.6);
    B.gothicWall(ruin, C.x + 12, C.z - 8, Math.PI / 2, 10, 4.5, 2, C.y, 1.0, 0.55);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rr = 14 + R() * 5;
      kit.box(ruin, 1.2, 1.6 + R() * 2.6, 1.0, C.x + Math.cos(a) * rr, C.y + 1.0, C.z + Math.sin(a) * rr, a, { tpm: 0.5 });
      if (k % 2) { const g = new THREE.OctahedronGeometry(0.7, 0); kit.place(g, C.x + Math.cos(a + 0.3) * (rr - 2), C.y + 1.2, C.z + Math.sin(a + 0.3) * (rr - 2), R(), 0, 0, 0.6, 2.0, 0.6); kit.add(crystal, g, { solid: false, tpm: 1 }); }
    }
    for (let k = 0; k < 6; k++) { const a = R() * 6.28; kit.box(ruin, 2.6, 0.8, 0.9, C.x + Math.cos(a) * 6, C.y + 1.8, C.z - 2 + Math.sin(a) * 6, a, { tpm: 0.5 }); }
    // the lit cavern in the island's underside (art: glowing chamber below the court)
    const cave = new THREE.PointLight(0x3ff0ff, 120, 30, 2); cave.position.set(C.x + 2, C.y - 10, C.z + 6); group.add(cave);
    for (let k = 0; k < 6; k++) { const g = new THREE.OctahedronGeometry(1 + R(), 0); kit.place(g, C.x - 4 + R() * 12, C.y - 13 + R() * 4, C.z + 2 + R() * 8, R(), R(), 0, 0.7, 2.2, 0.7); kit.add(crystal, g, { solid: false, tpm: 1 }); }
  }

  // ── castle island (W, point A): the big keep with waterfalls pouring off the rim ─────────────────────
  {
    const K = ISLANDS.castle;
    // the concept's great keep: a tall gatehouse tower, a hall with arched windows, ruined side towers
    B.tower(castleStone, K.x - 4, K.z - 4, 11, 38, K.y);
    B.tower(castleStone, K.x + 9, K.z + 1, 7, 26, K.y);
    B.tower(castleStone, K.x - 14, K.z + 4, 6, 22, K.y);
    B.gothicWall(castleStone, K.x + 2, K.z + 8, 0, 22, 16, 3, K.y, 1.4, 0.62);
    kit.box(castleStone, 20, 14, 10, K.x + 1, K.y + 7, K.z + 2, 0, { tpm: 0.4 });
    B.gothicWall(castleStone, K.x + 13, K.z + 10, Math.PI / 2 + 0.3, 10, 9, 2, K.y, 1.0, 0.7); // broken arcade
    B.curtain(castleStone, K.x - 12, K.z + 2, Math.PI / 2, 12, 8, K.y, 1.6);
    for (const [ox, oz] of [[-8, 14], [10, 12]]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(5, 60), fallsMat);
      f.position.set(K.x + ox, K.y - 30, K.z + oz); f.rotation.y = 0.2; group.add(f);
    }
  }
  // twin-tower island (N, point C)
  {
    const T = ISLANDS.towers;
    B.tower(castleStone, T.x - 4, T.z, 7, 28, T.y);
    B.tower(castleStone, T.x + 5, T.z - 2, 6, 20, T.y);
    B.gothicWall(castleStone, T.x, T.z + 5, 0, 12, 7, 2, T.y, 1.2, 0.6);
  }
  // portal island (E, Team B spawn): gothic facade with a cyan neon portal
  {
    const P = ISLANDS.portal;
    B.gothicWall(castleStone, P.x + 6, P.z, Math.PI / 2, 18, 16, 1, P.y, 2.2, 0.75);
    B.tower(castleStone, P.x + 7, P.z - 10, 7, 30, P.y); B.tower(castleStone, P.x + 7, P.z + 10, 7, 30, P.y);
    kit.box(castleStone, 8, 22, 34, P.x + 12, P.y + 11, P.z, 0, { tpm: 0.4 }); // the hall behind the portal facade
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(6, 10), portalMat);
    portal.position.set(P.x + 4.7, P.y + 5, P.z); portal.rotation.y = -Math.PI / 2; group.add(portal);
    for (const s of [-1, 1]) kit.box(crystal, 0.3, 11, 0.3, P.x + 4.6, P.y + 5.5, P.z + s * 3.4, 0, { solid: false, tpm: 1 });
    const pl = new THREE.PointLight(0x3ff0ff, 80, 26, 2); pl.position.set(P.x + 1, P.y + 5, P.z); group.add(pl);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(6, 70), fallsMat); f.position.set(P.x + 2, P.y - 35, P.z + 15); group.add(f);
  }

  // ── hard-light bridges: curved ribbons between islands, with invisible walkable decks ────────────────
  const ribbon = (a: Island, b: Island, w = 3.4, lift = 3) => {
    const A = new THREE.Vector3(a.x, a.y + 0.2, a.z), Bv = new THREE.Vector3(b.x, b.y + 0.2, b.z);
    const dir = Bv.clone().sub(A).setY(0).normalize();
    const start = A.clone().addScaledVector(dir, a.r * 0.85), end = Bv.clone().addScaledVector(dir, -b.r * 0.85);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, lift, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const n = 40, pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    let len = 0, prev = curve.getPoint(0);
    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n); len += p.distanceTo(prev); prev = p;
      for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * w / 2); pos.push(q.x, q.y, q.z); uvs.push(s < 0 ? 0 : 1, len); }
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
    group.add(new THREE.Mesh(g, bridgeMat));
    const steps = 10;
    for (let i = 0; i < steps; i++) { // walkable segments + side rails
      const p0 = curve.getPoint(i / steps), p1 = curve.getPoint((i + 1) / steps);
      B.ramp(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, w);
      for (const s of [-1, 1]) {
        const c = p0.clone().lerp(p1, 0.5).addScaledVector(side, s * w / 2);
        kit.box(B.invisible, 0.1, 1.4, p0.distanceTo(p1) + 0.2, c.x, c.y + 0.6, c.z, Math.atan2(p1.x - p0.x, p1.z - p0.z), { shadow: false, rx: -Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z)) });
      }
    }
  };
  const I = ISLANDS;
  ribbon(I.ledge, I.centre); ribbon(I.ledge, I.castle, 3, 6); ribbon(I.centre, I.castle, 3.4, 5); ribbon(I.centre, I.towers, 3, 8);
  ribbon(I.centre, I.portal); ribbon(I.towers, I.portal, 3, 6); ribbon(I.castle, I.west2, 2.6, 6); ribbon(I.west2, I.towers, 2.6, 4);

  kit.build(group);

  // ── space: nebula sky, moons, asteroid field ─────────────────────────────────────────────────────────
  {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
    const g = c.getContext('2d')!;
    g.fillStyle = '#07040f'; g.fillRect(0, 0, 2048, 1024);
    // sparse nebula: banks with dark space between them (dense blobs stacked into a flat purple wall)
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * 2048, y = 200 + Math.random() * 560, r = 60 + Math.random() * 200;
      const hue = [270, 285, 300, 200, 25][Math.floor(Math.random() * 5)];
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, `hsla(${hue} 70% ${30 + Math.random() * 25}% / ${0.03 + Math.random() * 0.06})`); cg.addColorStop(1, 'hsla(270 60% 20% / 0)');
      g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the concept's vertical void beam, a hot orange nebula on the right, deep violet cloud banks
    { const bx = 1180, bg = g.createLinearGradient(bx - 60, 0, bx + 60, 0); bg.addColorStop(0, 'rgba(200,190,255,0)'); bg.addColorStop(0.5, 'rgba(235,230,255,0.85)'); bg.addColorStop(1, 'rgba(200,190,255,0)'); g.fillStyle = bg; g.fillRect(bx - 60, 0, 120, 640);
      const hg = g.createLinearGradient(bx - 220, 0, bx + 220, 0); hg.addColorStop(0, 'rgba(150,110,255,0)'); hg.addColorStop(0.5, 'rgba(170,130,255,0.25)'); hg.addColorStop(1, 'rgba(150,110,255,0)'); g.fillStyle = hg; g.fillRect(bx - 220, 0, 440, 700); }
    for (let i = 0; i < 90; i++) { const x = 1380 + Math.random() * 420, y = 260 + Math.random() * 360, r = 80 + Math.random() * 200; const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `hsla(${18 + Math.random() * 20} 85% ${45 + Math.random() * 15}% / ${0.06 + Math.random() * 0.1})`); cg.addColorStop(1, 'hsla(20 80% 40% / 0)'); g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 50; i++) { const x = Math.random() * 2048, y = 220 + Math.random() * 420, r = 90 + Math.random() * 240; const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `hsla(${265 + Math.random() * 30} 70% ${38 + Math.random() * 20}% / ${0.06 + Math.random() * 0.1})`); cg.addColorStop(1, 'hsla(270 60% 30% / 0)'); g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(230,225,255,${0.25 + Math.random() * 0.75})`; const s = Math.random() * 1.8 + 0.3; g.fillRect(Math.random() * 2048, Math.random() * 1024, s, s); }
    const sky = new THREE.CanvasTexture(c); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.9;
  }
  scene.fog = new THREE.FogExp2(0x2a1c48, 0.0022); // clear space: moons and asteroids stay readable
  const moonMat = new THREE.MeshStandardNodeMaterial({ map: rockSrc.map, color: 0xe6e0ee, roughness: 1, fog: false });
  moonMat.colorNode = vec3(luminance(tslTexture(rockSrc.map!, uv().mul(2)).rgb)).mul(1.6).add(0.25).mul(color(0xe6e0ee));
  for (const [x, y, z, r] of [[160, 110, -260, 26], [240, 150, -200, 14]] as const) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), moonMat); m.position.set(x, y, z); group.add(m); }
  const astGeo = boulder(1, 7, 1);
  const astMat = new THREE.MeshStandardNodeMaterial({ map: rockSrc.map, normalMap: rockSrc.normalMap, roughness: 1, fog: false });
  astMat.colorNode = vec3(luminance(tslTexture(rockSrc.map!, uv()).rgb).mul(2.4).add(0.3)).mul(color(0x9c8f88));
  const asteroids = new THREE.InstancedMesh(astGeo, astMat, lo ? 160 : 420);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < asteroids.count; i++) {
    const a = R() * 6.28, rr = 70 + R() * 160, y = -30 + R() * 110;
    const s = 0.4 + R() * R() * 6;
    m4.compose(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr - 20), q.setFromEuler(e.set(R() * 6, R() * 6, R() * 6)), new THREE.Vector3(s, s, s));
    asteroids.setMatrixAt(i, m4);
  }
  asteroids.frustumCulled = false; group.add(asteroids);
  const key = new THREE.DirectionalLight(0xe8d8ff, 2.4);
  key.position.set(80, 120, 60); key.castShadow = !lo; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 320 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.05;
  const rim = new THREE.DirectionalLight(0xff9a60, 1.6); rim.position.set(-60, 40, -120);
  // fill from the viewer's side so the faces players see read as grey stone; nebula rim stays violet/orange
  const fill = new THREE.DirectionalLight(0xb8b0ff, 1.2); fill.position.set(-90, 50, 120);
  group.add(key, key.target, rim, fill, fill.target, new THREE.HemisphereLight(0xa898d8, 0x2a1838, 2.0));
  scene.add(group);

  const enemySpots = [[0, -2, 0], [8, 6, 0], [-8, -8, 0], [10, -10, 0], [-6, 10, 0], [-52, -20, 9], [-44, -30, 9], [14, -50, 12], [50, -8, 4], [56, 2, 4], [-30, 44, 10]].map(([x, z, y]) => new THREE.Vector3(x, y + 1.6, z));
  const info: LevelInfo = { id: 'celestial-void', name: 'Celestial Void Citadel', track: 'main', accentHex: 0x3ff0ff };
  let elapsed = 0;
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: { a: { pos: new THREE.Vector3(-32, 10.6, 48), yaw: -0.5 }, b: { pos: new THREE.Vector3(50, 4.6, -8), yaw: Math.PI / 2 } },
    enemySpots,
    hazardBelow: -25,
    controlPoints: [
      { id: 'A', name: 'Castle Isle', pos: new THREE.Vector3(-50, 9.2, -16), radius: 6 },
      { id: 'B', name: 'Ruin Court', pos: new THREE.Vector3(2, 1.4, -2), radius: 6.5 },
      { id: 'C', name: 'Twin Towers', pos: new THREE.Vector3(14, 12.2, -50), radius: 5 },
    ],
    setBiome() { return { name: info.name, track: info.track }; },
    update(dt, pulse) {
      elapsed += dt; uBeatPulse.value = pulse;
      asteroids.rotation.y += dt * 0.004;
    },
    resolveDynamicGates() { /* none */ },
  };
}

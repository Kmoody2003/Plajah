// Elderwood Wilds — the water: the river and the pool stream as flowing creek ribbons, the vale's still swamp, spray
// and mist at the falls, the shoreline's soaked banks and the sound of it all. Materials: ../creek.ts.
//
// Each ribbon vertex carries what the creek shader needs to move like a real stream (`wflow`: current, white water,
// depth, bank; `wdir`: downstream), baked here from the RIVER / POOL_STREAM splines and the terrain:
//   • current — the bed's grade sets the pace, narrows speed it up (the same water through less width), it races
//     toward a falls lip and slows into the slough; fastest mid-channel, slack at the banks;
//   • white water — rapids where the grade is steep (in patches, not a uniform carpet), a boil below each falls,
//     a cushion round every boulder in the channel and a wake trailing downstream of it;
//   • depth — the surface over the terrain at that point (the low tier tints and feathers by it; the high tier reads
//     the real thickness from the depth buffer).
import * as THREE from 'three/webgpu';
import { VfxSystem, type Recipe } from '../../../../services/vfx';
import { riftCreek, riftSwamp, waterEnv } from '../creek';
import { setShoreField } from '../wetness';
import type { Kit } from './kit';
import { GREAT_FALLS, HALF, NEON_FALLS, POOL_FALLS, POOL_STREAM, RIVER, WATER_Y, polyNear } from './layout';
import type { WildsCtx } from './registry';
import type { WorldTerrain } from './terrain';
import { StreamAudio } from './streamAudio';

type Pts = readonly (readonly number[])[];
const SURF = 0.85;                       // the surface over the spline's bed height (as waterAt reports it)
const LINES: [Pts, number][] = [[RIVER, 1.5], [POOL_STREAM, 0.8]];
const FALLS: [Pts, { lip: number; foot: number }, number][] = [[RIVER, NEON_FALLS, 10], [RIVER, GREAT_FALLS, 12], [POOL_STREAM, POOL_FALLS, 4]];
const steepSeg = (a: readonly number[], b: readonly number[]) => Math.abs(b[2] - a[2]) / Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5;
const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ── particles ──
const FALL_MIST: Recipe = { id: 'fall_mist', emitters: [
  { layer: 'alpha', shape: 'smoke', count: [1, 2], life: [2.6, 4.6], speed: [0.6, 2.2], spread: 1.1, lift: [0.7, 1.7], radius: 2.2, size: [1.6, 5.5], color: ['tint', 'tint'], alpha: [0.13, 0], drag: 0.55, turbulence: 0.9, spin: [0.04, 0.2] },
] };
const FALL_SPRAY: Recipe = { id: 'fall_spray', emitters: [
  { layer: 'alpha', shape: 'soft', count: [3, 5], life: [0.6, 1.2], speed: [3, 7], spread: 0.85, radius: 1.6, size: [0.12, 0.4], color: ['tint', 'tint'], alpha: [0.32, 0], gravity: 6.5, drag: 0.7 },
] };
const ROCK_SPLASH: Recipe = { id: 'rock_splash', emitters: [
  { layer: 'alpha', shape: 'soft', count: [3, 6], life: [0.35, 0.7], speed: [1.2, 2.8], spread: 0.7, radius: 0.4, size: [0.07, 0.2], color: ['tint', 'tint'], alpha: [0.6, 0], gravity: 7, drag: 0.5 },
] };
const SWAMP_BUBBLE: Recipe = { id: 'swamp_bubble', emitters: [
  { layer: 'alpha', shape: 'ring', count: 1, life: [0.9, 1.6], speed: 0, size: [0.04, 0.55], color: [0x8f9670, 0x5b5f42], alpha: [0.45, 0] },
  { layer: 'alpha', shape: 'soft', count: [1, 3], life: [0.25, 0.45], speed: [0.4, 1], spread: 0.5, size: [0.04, 0.02], color: [0x9aa080, 0x6a6e50], alpha: [0.5, 0], gravity: 5 },
] };

export interface WildsWater {
  /** True under the river or the pool stream's surface (the grass keeps off the bed). */
  under(x: number, z: number): boolean;
  update(dt: number, cam: THREE.Vector3, view: THREE.Camera | null, wind: number, sky: { weather: string; storm: number } | null): void;
}

export function buildWildsWater(ctx: WildsCtx, terrain: WorldTerrain, K: Kit): WildsWater {
  const { group, lo } = ctx;
  const H = (x: number, z: number) => terrain.surface(x, z);

  // ── boulders in the rapids: the steep reaches get rocks to break over (before K.finish batches them) ──
  {
    let s = 4111; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const [pts] of LINES) for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (steepSeg(a, b)) continue;
      const g = (a[2] - b[2]) / L;
      if (g < 0.018 || a[3] < 5) continue;
      for (let d = 12; d < L - 8; d += 16 + R() * 18) {
        if (R() > sm(0.018, 0.04, g) * 0.9 + 0.1) continue;
        const t = d / L, w = a[3] + (b[3] - a[3]) * t, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, o = (R() - 0.5) * w * 0.8;
        K.rocks(a[0] + ux * d + uz * o, a[1] + uz * d - ux * o, 1 + Math.floor(R() * 3), 1.8, [0.7, 1.5], 900 + i * 37 + Math.round(d));
      }
    }
    // the plunge pools: big rocks round the foot of each falls
    for (const [pts, f, w] of FALLS) { const b = pts[f.foot], c = pts[f.foot + 1]; const dx = c[0] - b[0], dz = c[1] - b[1], l = Math.hypot(dx, dz) || 1;
      for (const sd of [-1, 1]) K.rocks(b[0] + (dz / l) * sd * w * 0.55 + dx / l * 5, b[1] - (dx / l) * sd * w * 0.55 + dz / l * 5, 2, 2, [0.9, 1.8], 77 + f.foot * 3 + sd); }
  }
  const rocks = K.rockSpots.filter(([x, z]) => LINES.some(([pts]) => polyNear(pts, x, z).d < 22));

  // ── the ribbons ──
  const creek = riftCreek({ lowTier: lo, deep: 0x06262c, shallow: 0x2a5a52, absorb: [0.62, 0.21, 0.15], glow: 0x5ff4ff, glowAmt: 0.1 });
  const COLS = lo ? 2 : 8, ROW = lo ? 3 : 1.5;
  const whiteSpots: [number, number, number][] = [];        // [x, y, z] of strong white water (splash particles)
  const ribbon = (pts: Pts, pad: number) => {
    const P: number[] = [], U: number[] = [], Fw: number[] = [], Dw: number[] = [], I: number[] = [];
    const total = pts.reduce((acc, p, i) => i ? acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
    let row = 0, prevSteep = true, sAcc = 0, footS = -1e9;
    // metres along the spline to each falls lip (the start of a steep segment)
    const lips: number[] = []; { let acc = 0; for (let i = 0; i < pts.length - 1; i++) { if (steepSeg(pts[i], pts[i + 1])) lips.push(acc); acc += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); } }
    const segDir = (i: number) => { const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (steepSeg(a, b)) { prevSteep = true; sAcc += L; continue; }
      if (prevSteep && i > 0) footS = sAcc;
      const [dx, dz] = segDir(i), grade = Math.max(0, (a[2] - b[2]) / L);
      const nextFlat = i + 2 < pts.length && !steepSeg(pts[i + 1], pts[i + 2]), prevFlat = i > 0 && !steepSeg(pts[i - 1], a);
      const n = Math.max(1, Math.ceil(L / ROW));
      for (let k = prevSteep ? 0 : 1; k <= n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, width = a[3] + (b[3] - a[3]) * t;
        const w = width / 2 + pad, y = a[2] + (b[2] - a[2]) * t + SURF, s = sAcc + L * t;
        // direction: averaged at the joints so the banks don't fold
        let ex = dx, ez = dz;
        if (k === n && nextFlat) { const d2 = segDir(i + 1); ex += d2[0]; ez += d2[1]; }
        if (k === 0 && prevFlat) { const d0 = segDir(i - 1); ex += d0[0]; ez += d0[1]; }
        const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
        // pace: grade, narrows, the run to a lip, the slow end in the slough
        let v = 0.55 + Math.min(grade, 0.06) * 42;
        v *= Math.min(1.5, Math.max(0.7, Math.sqrt(10 / width)));
        const toLip = lips.map((l) => l - s).filter((d) => d >= 0).reduce((m, d) => Math.min(m, d), 1e9);
        v *= 1 + sm(30, 0, toLip) * 0.9;
        v *= 0.35 + 0.65 * sm(0, 140, total - s);
        const fromFoot = s - footS;
        // white water: rapids in patches along steep reaches, the boil under a falls
        const patch = 0.5 + 0.5 * Math.sin(s / 19 + i * 1.7) * Math.sin(s / 7.3 + 0.6);
        const rapids = sm(0.016, 0.04, grade) * (0.25 + 0.75 * patch);
        const boil = fromFoot >= 0 ? Math.pow(sm(38, 0, fromFoot), 1.4) : 0;
        for (let j = 0; j <= COLS; j++) {
          const u = j / COLS, acr = (u * 2 - 1) * w, px = x + ez * acr, pz = z - ex * acr;
          // the mid-channel weight of the rapids' white water
          const prof = 0.72 + 0.28 * (1 - (u * 2 - 1) ** 2);
          // (one pace across the channel: any profile shears the advected ripples into chevrons; rocks still bend it locally)
          let white = Math.max(rapids * (0.5 + 0.5 * prof), boil), spd = v * (1 + boil * 0.3);
          // rocks: a cushion of white round each, a wake streaming off downstream, faster water squeezing past
          for (const [rx, rz, rr] of rocks) {
            const ox = px - rx, oz = pz - rz; if (Math.abs(ox) > rr + 12 || Math.abs(oz) > rr + 12) continue;
            const d = Math.hypot(ox, oz) - rr;
            // a boulder near the surface breaks it white; a deeper one only roughens the water above it
            const sub = y - (H(rx, rz) + rr * 0.65), reach = sm(0.6, -0.1, sub) * 0.85 + 0.15;
            const ring = sm(1.8, 0, d) * reach;
            const along = ox * ex + oz * ez, cross = Math.abs(ox * ez - oz * ex);
            const wake = along > 0 && along < 11 ? (1 - along / 11) * sm(rr + 1.2, rr * 0.3, cross) : 0;
            white = Math.max(white, ring * 0.95, wake * 0.6 * reach);
            spd *= 1 + sm(3, 0.5, d) * 0.25;
          }
          const dep = Math.max(0, y - H(px, pz));
          const bank = Math.max(sm(0.72, 1, Math.abs(u * 2 - 1)), 1 - sm(0.05, 0.45, dep));
          P.push(px, y, pz); U.push(acr, s); Fw.push(spd, white, dep, bank); Dw.push(ex, ez, Math.abs(u * 2 - 1));
          if (white > 0.6 && j > 0 && j < COLS && (row + j) % 3 === 0) whiteSpots.push([px, y, pz]);
        }
        if (!(prevSteep && k === 0) && row > 0) {
          const r0 = (row - 1) * (COLS + 1), r1 = row * (COLS + 1);
          for (let j = 0; j < COLS; j++) I.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
        }
        row++;
      }
      prevSteep = false; sAcc += L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('wflow', new THREE.Float32BufferAttribute(Fw, 4)); g.setAttribute('wdir', new THREE.Float32BufferAttribute(Dw, 3));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, creek); m.receiveShadow = true; m.name = 'wilds-river'; m.renderOrder = 2; group.add(m);
  };
  for (const [pts, pad] of LINES) ribbon(pts, pad);

  // ── the vale: still, murky swamp water round the Mangrove Mire ──
  const swamp = riftSwamp({ lowTier: lo, murk: 0x3a3a1c, scum: 0x56622a, glow: 0x9bdc5a });
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 760, 1, 1), swamp);
  lake.rotation.x = -Math.PI / 2; lake.position.set(0, WATER_Y, 620); lake.name = 'wilds-vale-water'; lake.renderOrder = 1; group.add(lake);

  // ── the soaked shoreline (wetness.ts): closeness to the water's edge and its height, 2 m cells ──
  {
    const N = lo ? 512 : 1000, cell = (HALF * 2) / N, prox = new Float32Array(N * N), wy = new Float32Array(N * N);
    const REACH = 5;
    for (const [pts, pad] of LINES) for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 0; d <= L; d += cell * 0.7) {
        const t = d / L, cx = a[0] + (b[0] - a[0]) * t, cz = a[1] + (b[1] - a[1]) * t, hw = (a[3] + (b[3] - a[3]) * t) / 2 + pad, y = a[2] + (b[2] - a[2]) * t + SURF;
        const rr = hw + REACH, i0 = Math.max(0, Math.floor((cx - rr + HALF) / cell)), i1 = Math.min(N - 1, Math.ceil((cx + rr + HALF) / cell));
        const j0 = Math.max(0, Math.floor((cz - rr + HALF) / cell)), j1 = Math.min(N - 1, Math.ceil((cz + rr + HALF) / cell));
        for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
          const x = -HALF + (ii + 0.5) * cell, z = -HALF + (j + 0.5) * cell, e = Math.hypot(x - cx, z - cz) - hw, p = 1 - sm(0, REACH, e), o = j * N + ii;
          if (p > prox[o]) { prox[o] = p; wy[o] = y; }
        }
      }
    }
    for (let j = 0; j < N; j++) { const z = -HALF + (j + 0.5) * cell; if (Math.abs(z - 620) > 380) continue;
      for (let ii = 0; ii < N; ii++) { const x = -HALF + (ii + 0.5) * cell, h = H(x, z) - WATER_Y, p = 1 - sm(0, 2.5, h), o = j * N + ii; if (h > -3 && p > prox[o]) { prox[o] = p; wy[o] = WATER_Y; } } }
    const data = new Uint16Array(N * N * 2);
    for (let o = 0; o < N * N; o++) { data[o * 2] = THREE.DataUtils.toHalfFloat(prox[o]); data[o * 2 + 1] = THREE.DataUtils.toHalfFloat(wy[o]); }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
    setShoreField(tex, -HALF, -HALF, HALF * 2);
  }

  // ── spray and mist at the falls, splashes off the rocks, bubbles in the swamp ──
  const vfx = new VfxSystem({ caps: { add: 16, alpha: lo ? 260 : 700, shard: 4 }, lights: 0, seed: 31 });
  group.add(vfx.group);
  const falls = FALLS.map(([pts, f, w]) => {
    const a = pts[f.lip], b = pts[f.foot], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return { x: b[0] + dx / l * 2, y: b[2] + SURF, z: b[1] + dz / l * 2, dx: dx / l, dz: dz / l, w, drop: a[2] - b[2] };
  });
  let tMist = 0, tSpray = 0, tSplash = 0, tBub = 0, tAud = 0;
  let seed = 77; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tint = new THREE.Color();

  // ── sound ──
  const audio = new StreamAudio(0.9);
  const fwd = new THREE.Vector3();

  const sunDir = new THREE.Vector3();
  return {
    under(x, z) {
      for (const [pts] of LINES) {
        const n = polyNear(pts, x, z), a = pts[n.i], b = pts[Math.min(pts.length - 1, n.i + 1)];
        if (n.d < (a[3] + (b[3] - a[3]) * n.t) / 2 + 0.6 && H(x, z) < a[2] + (b[2] - a[2]) * n.t + SURF - 0.05) return true;
      }
      return false;
    },
    update(dt, cam, view, wind, sky) {
      // ── the light and weather the water reads ──
      const sun = ctx.scene.userData.godrays as THREE.DirectionalLight | undefined;
      const day = sun ? Math.min(1, Math.max(0, sun.intensity / 5.2)) : 0;
      waterEnv.day.value = day;
      if (sun) {
        sunDir.copy(sun.position).sub(sun.target.position).normalize();
        if (sunDir.y > -0.2) (waterEnv.sunDir.value as THREE.Vector3).copy(sunDir);
        (waterEnv.sunCol.value as THREE.Color).copy(sun.color);
        // a low sun warms the haze the water mirrors
        (waterEnv.haze.value as THREE.Color).setHex(0xa4b8b4).lerp(sun.color, Math.max(0, 0.45 - sunDir.y) * 0.8);
      }
      waterEnv.light.value = 0.22 + 0.78 * day;
      waterEnv.wind.value = Math.min(1, Math.max(0, (wind - 0.55) / 1.4)) * 0.8 + 0.15;
      const rain = sky ? (sky.weather === 'storm' ? Math.max(0.7, sky.storm) : sky.weather === 'rain' ? 0.55 : 0) : 0;
      waterEnv.rain.value += (rain - (waterEnv.rain.value as number)) * Math.min(1, dt * 0.5);

      // ── particles round the camera ──
      const lit = 0.25 + 0.75 * day;
      tint.setRGB(0.6 * lit + 0.04, 0.66 * lit + 0.05, 0.7 * lit + 0.06);
      tMist += dt; tSpray += dt; tSplash += dt; tBub += dt;
      for (const f of falls) {
        const d = Math.hypot(f.x - cam.x, f.z - cam.z);
        if (d > 300) continue;
        const sc = Math.min(1.6, f.w / 9);
        if (tMist > (lo ? 0.7 : 0.35)) vfx.spawn(FALL_MIST, [f.x + (rnd() - 0.5) * f.w, f.y + 0.5, f.z + (rnd() - 0.5) * f.w * 0.6], { dir: [f.dx * 0.6, 1, f.dz * 0.6], tint: tint.getHex(), scale: sc });
        if (d < 140 && tSpray > (lo ? 0.2 : 0.07)) vfx.spawn(FALL_SPRAY, [f.x + (rnd() - 0.5) * f.w * 0.9, f.y + 0.2, f.z], { dir: [f.dx * 0.8, 1, f.dz * 0.8], tint: tint.getHex(), scale: sc * (0.8 + Math.min(1, f.drop / 30) * 0.4) });
      }
      if (tMist > (lo ? 0.7 : 0.35)) tMist = 0;
      if (tSpray > (lo ? 0.2 : 0.07)) tSpray = 0;
      if (tSplash > (lo ? 0.5 : 0.18)) {
        tSplash = 0;
        for (let k = 0; k < 4; k++) {
          const p = whiteSpots[Math.floor(rnd() * whiteSpots.length)];
          if (p && (p[0] - cam.x) ** 2 + (p[2] - cam.z) ** 2 < 45 * 45) { vfx.spawn(ROCK_SPLASH, [p[0], p[1], p[2]], { dir: [0, 1, 0], tint: tint.getHex() }); break; }
        }
      }
      if (tBub > (lo ? 1.2 : 0.45) && Math.abs(cam.z - 620) < 400 && cam.y < WATER_Y + 40) {
        tBub = 0;
        const a = rnd() * 6.283, r = 3 + rnd() * 22, x = cam.x + Math.sin(a) * r, z = cam.z + Math.cos(a) * r;
        if (H(x, z) < WATER_Y - 0.1) vfx.spawn(SWAMP_BUBBLE, [x, WATER_Y + 0.02, z]);
      }
      vfx.update(dt, view ?? undefined);

      // ── what you hear (10 Hz is plenty: the levels glide) ──
      if ((tAud += dt) > 0.1) {
        let yaw = 0;
        if (view) { view.getWorldDirection(fwd); yaw = Math.atan2(fwd.x, fwd.z); }
        const sideOf = (x: number, z: number) => { let a = Math.atan2(x - cam.x, z - cam.z) - yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); return -a; };
        let creekD = 1e9, cs = 0, cx = 0, cz = 0;
        for (const [pts, pad] of LINES) {
          const n = polyNear(pts, cam.x, cam.z), a = pts[n.i], b = pts[Math.min(pts.length - 1, n.i + 1)];
          if (steepSeg(a, b)) continue;
          const hw = (a[3] + (b[3] - a[3]) * n.t) / 2 + pad, y = a[2] + (b[2] - a[2]) * n.t + SURF;
          const e = Math.max(0, n.d - hw) + Math.max(0, Math.abs(cam.y - y) - 3) * 0.6;
          if (e < creekD) { creekD = e; cs = 0.55 + Math.min(0.06, Math.max(0, (a[2] - b[2]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1))) * 42; cx = a[0] + (b[0] - a[0]) * n.t; cz = a[1] + (b[1] - a[1]) * n.t; }
        }
        let fd = 1e9, fx = 0, fz = 0, fsz = 1;
        for (const f of falls) { const d = Math.hypot(f.x - cam.x, f.y - cam.y, f.z - cam.z); if (d < fd) { fd = d; fx = f.x; fz = f.z; fsz = f.w / 10; } }
        audio.update(tAud, { creek: { d: creekD, speed: cs, side: sideOf(cx, cz) }, falls: { d: fd, side: sideOf(fx, fz), size: fsz } });
        tAud = 0;
      }
    },
  };
}

// typoVolumes — the twelve TYPO volumes. Each one builds once, re-spells itself on a lyric change
// (text) and moves every frame (update). References: OneDrive word-art boards (sphere, glass
// lattice, geometric sun, DNA helix, topographic map, gear, CHAOS spiral, skyscraper, butterfly,
// colour waves, constructivist posters, translucent maze).

import * as THREE from 'three';
import {
  TAU, clamp, wrap, smooth, range, rng, MOTION, F, QI, QFLAT, TMPC, C, V3, BASIS_Y,
  basisQ, grad, blobTex, tick, lever, type VolumeDef, type GlyphLayer,
} from './typoEngine';

const sphere: VolumeDef = {
  key: 'SPHERE', name: 'Obsidian & Neon', bg: '#C3C6CA', fog: 0.02, fov: 38,
  build(v) {
    v.cam.position.set(0, 0.6, 13.5); v.cam.lookAt(0, -0.4, 0);
    v.scene.fog = new THREE.Fog(v.def.bg, 16, 42);
    const floor = v.flat(new THREE.PlaneGeometry(120, 120), '#B0B3B7', V3(0, -5.2, 0), v.scene); floor.rotation.x = -Math.PI / 2;
    v.flat(new THREE.PlaneGeometry(120, 50), '#CBCED2', V3(0, 12, -24), v.scene);
    v.flat(new THREE.BoxGeometry(3, 30, 3), '#BABDC1', V3(-11, 8, -14), v.scene);
    v.flat(new THREE.BoxGeometry(3, 30, 3), '#BABDC1', V3(11, 8, -14), v.scene);
    v.s.shadow = v.decal(blobTex([[0, 'rgba(24,26,30,.6)'], [0.5, 'rgba(24,26,30,.22)'], [1, 'rgba(24,26,30,0)']]), 11, 4.4, V3(0, -5.18, 0.4));
    const N = 150, ga = Math.PI * (3 - Math.sqrt(5)), obs: THREE.Vector3[] = [], neo: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = ga * i; const p = V3(Math.cos(th) * r, y, Math.sin(th) * r); (p.x < 0 ? obs : neo).push(p); }
    const Lo = v.layer(obs.length, { font: F.ARCHIVO, layers: 16, depth: 0.62, hi: '#FF2F8E', hiAmt: 1 });
    const Ln = v.layer(neo.length, { font: F.ARCHIVO, layers: 16, depth: 0.62, hi: '#FFFFFF', hiAmt: 0.85 });
    const d = new THREE.Object3D(), all: any[] = [];
    const add = (arr: THREE.Vector3[], L: GlyphLayer) => arr.forEach((p, i) => { d.position.copy(p); d.lookAt(p.x * 2, p.y * 2, p.z * 2); all.push({ p, q: d.quaternion.clone(), L, i, lon: Math.atan2(p.z, p.x) }); });
    add(obs, Lo); add(neo, Ln);
    const W = C('#F3F2EE'), K = C('#111114'), stops = [C('#FF2FA8'), C('#8A3BFF'), C('#20D8FF')];
    all.forEach((o, j) => {
      if (o.L === Lo) Lo.col(o.i, j % 2 ? W : K);
      else { o.c = grad(stops, 0.5 + 0.5 * Math.sin(o.lon * 1.3 + o.p.y * 1.7), new THREE.Color()); Ln.col(o.i, o.c); }
    });
    all.sort((a, b) => (Math.round(b.p.y * 6) - Math.round(a.p.y * 6)) || (a.lon - b.lon));
    all.forEach((o, j) => { o.band = j % 16; });
    v.s.all = all;
  },
  text(v, st, inst) { const S = st.dense, n = S.chars.length; v.s.all.forEach((o: any, j: number) => { const k = j % n; o.L.char(o.i, S.chars[k], inst ? null : (1 - o.p.y) * 0.5); o.L.word[o.i] = S.word[k]; }); },
  update(v, t, dt, A) {
    v.root.rotation.y += dt * (0.12 + A.mid * 0.5) * MOTION; v.root.rotation.x = Math.sin(t * 0.13) * 0.18;
    const R = 3.9 * (1 + A.kick * 0.16);
    v.s.shadow.scale.setScalar(1 + A.kick * 0.14);
    for (const o of v.s.all) {
      const g = o.L.glow[o.i], r = R + g * 0.8 + A.bands[o.band] * 0.55, s = 1.02 * (1 + g * 0.18);
      o.L.put(o.i, o.p.x * r, o.p.y * r, o.p.z * r, o.q, s, s, s);
      if (o.c) o.L.col(o.i, TMPC.copy(o.c).multiplyScalar(0.8 + A.high * 0.7 * (0.5 + 0.5 * Math.sin(o.i * 2.3 + t * 8))));
    }
  },
};

const glass: VolumeDef = {
  key: 'CUBIC_GLASS', name: 'Glass Lattice', bg: '#F1F2F4', fog: 0.012, fov: 36,
  build(v) {
    v.cam.position.set(0, 1.6, 12.2); v.cam.lookAt(0, -0.2, 0);
    const floor = v.flat(new THREE.PlaneGeometry(120, 120), '#F8F8F9', V3(0, -3.4, 0), v.scene); floor.rotation.x = -Math.PI / 2;
    v.decal(blobTex([[0, 'rgba(60,70,90,.28)'], [0.55, 'rgba(60,70,90,.08)'], [1, 'rgba(60,70,90,0)']]), 11, 6, V3(0, -3.38, 0.5));
    v.s.caustic = v.decal(blobTex([[0, 'rgba(255,190,120,.35)'], [0.3, 'rgba(160,210,255,.28)'], [0.6, 'rgba(210,160,255,.16)'], [1, 'rgba(255,255,255,0)']]), 9, 3.2, V3(0.8, -3.37, 3.2));
    const COLS = 9, ROWS = 5, DEP = 5; v.s.dims = [COLS, ROWS, DEP];
    const L = v.layer(COLS * ROWS * DEP, { mode: 'glass', font: F.ARCHIVO, layers: 5, depth: 0.5, hi: '#E0105C', hiAmt: 1, fogDensity: 0.01 });
    const rims = [C('#3A5572'), C('#56488A'), C('#2E6C73')];
    v.s.cells = []; const order: number[] = [];
    for (let z = DEP - 1; z >= 0; z--) for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const i = x + y * COLS + z * COLS * ROWS; v.s.cells.push({ x, y, z, i }); order.push(i); L.col(i, rims[(z + (x > 4 ? 1 : 0)) % 3]); }
    v.s.order = order; v.s.L = L;
  },
  text(v, st, inst) { v.s.L.fill(st.spaced, v.s.order, 0, inst ? null : 0.006); },
  update(v, t, dt, A) {
    const [COLS, ROWS] = v.s.dims, L = v.s.L;
    v.root.rotation.set(-0.05, Math.sin(t * 0.22) * 0.55, 0);
    const zsp = 0.85 * (1 + A.kick * 0.9 + A.bass * 0.2);
    v.s.caustic.material.opacity = 0.5 + A.high * 0.8;
    for (const c of v.s.cells) {
      const g = L.glow[c.i], band = A.bands[Math.min(15, c.y * 3 + 1)];
      const s = 0.95 * (0.72 + band * 0.55) * (1 + g * 0.12);
      L.put(c.i, (c.x - (COLS - 1) / 2) * 0.8, ((ROWS - 1) / 2 - c.y) * 1.04 + 0.2, (c.z - 2) * zsp, QI, s, s, s * 0.8);
    }
  },
};

const sunburst: VolumeDef = {
  key: 'SUNBURST', name: 'Constructivist Sun', bg: '#0A0D16', fog: 0, fov: 40,
  build(v) {
    // A touch below centre so rings pushing toward the camera read as depth.
    v.cam.position.set(0, -1.1, 12.6); v.cam.lookAt(0, 0, 0);
    const SP = 36, K = 9; v.s.SP = SP; v.s.K = K;
    const pal = [C('#E63A2E'), C('#F6C12A'), C('#2F5FD0')], inks = [C('#F6C12A'), C('#14161E'), C('#F6C12A')];
    const pos = new Float32Array(SP * 9), col = new Float32Array(SP * 9);
    v.s.sp = [];
    for (let k = 0; k < SP; k++) { const long = k % 2 === 0, p = long ? (k >> 1) % 3 : ((k >> 1) + 1) % 3; v.s.sp.push({ long, p }); for (let j = 0; j < 3; j++) { col[k * 9 + j * 3] = pal[p].r; col[k * 9 + j * 3 + 1] = pal[p].g; col[k * 9 + j * 3 + 2] = pal[p].b; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    v.s.spikes = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); v.s.spikes.frustumCulled = false; v.root.add(v.s.spikes);
    // Cast shadow of the spikes: the same geometry in black, offset down-right (light from top-left).
    v.s.spikeShadow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    v.s.spikeShadow.frustumCulled = false; v.s.spikeShadow.position.set(0.1, -0.1, -0.08); v.root.add(v.s.spikeShadow);
    v.s.rings = [{ r: 0.92, n: 12, band: '#2F5FD0', ink: '#F6C12A' }, { r: 1.42, n: 19, band: '#E63A2E', ink: '#14161E' }, { r: 1.92, n: 26, band: '#F6C12A', ink: '#C92D22' }];
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false });
    v.s.rings.forEach((r: any, ri: number) => {
      r.g = new THREE.Group(); v.root.add(r.g); r.z = 0;
      v.flat(new THREE.RingGeometry(r.r - 0.25, r.r + 0.25, 72), r.band, V3(0, 0, 0), r.g);
      v.flat(new THREE.RingGeometry(r.r + 0.24, r.r + 0.27, 72), '#05070C', V3(0, 0, 0.005), r.g);
      if (ri === 0) v.flat(new THREE.CircleGeometry(0.67, 48), '#05070C', V3(0, 0, 0.004), r.g);
      r.shadow = new THREE.Mesh(new THREE.RingGeometry(ri === 0 ? 0 : r.r - 0.25, r.r + 0.27, 72), shadowMat); v.root.add(r.shadow);
    });
    const nR = v.s.rings.reduce((a: number, r: any) => a + r.n, 0);
    const L = v.layer(SP * K + nR, { font: F.ARCHIVO, layers: 2, depth: 0.06, hi: '#FFFFFF', hiAmt: 1, fogDensity: 0 });
    for (let k = 0; k < SP; k++) for (let j = 0; j < K; j++) L.col(k * K + j, inks[v.s.sp[k].p]);
    let o = SP * K; v.s.rings.forEach((r: any) => { r.i0 = o; for (let j = 0; j < r.n; j++) L.col(o + j, C(r.ink)); o += r.n; });
    v.s.L = L; v.s.rot = 0;
  },
  text(v, st, inst) {
    const { L, SP, K } = v.s, W = st.words;
    for (let k = 0; k < SP; k++) { const wi = k % W.length, w = W[wi] + '·'; for (let j = 0; j < K; j++) { const i = k * K + j, ch = w[j % w.length]; L.char(i, ch, inst ? null : k * 0.012 + j * 0.03); L.word[i] = ch === '·' ? -1 : wi; } }
    let off = 0; v.s.rings.forEach((r: any) => { L.fill(st.dense, range(r.i0, r.n), off, inst ? null : 0.02); off += 7; });
  },
  update(v, t, dt, A) {
    const { L, SP, K } = v.s, pos = v.s.spikes.geometry.attributes.position.array, base = 2.2, st = TAU / SP;
    // Spikes travel around the rings right → left (counter-clockwise). Long and short spikes are
    // two linked sets that rock against each other on the beat (counter-levers), and every spike
    // tips on its own base pivot in a cascade around the circle.
    v.s.rot += dt * (0.22 + A.mid * 0.35 + A.kick * 0.25) * MOTION;
    const rock = (lever(A.beats * 0.5) - 0.5) * st * 1.2;
    for (let k = 0; k < SP; k++) {
      const s = v.s.sp[k], b = A.bands[k % 16];
      const th = k / SP * TAU + (s.long ? v.s.rot + rock : v.s.rot * 0.8 - rock);
      const tip = th + (lever(A.beats + k * 0.06) - 0.5) * 0.22 * (s.long ? 1 : -1);
      const len = s.long ? 1.6 + b * 4.6 + A.kick * 0.9 : 0.9 + b * 2.6 + A.bass * 0.4, w = s.long ? 0.52 : 0.36, z = s.long ? -0.2 : -0.16;
      const cx = Math.cos(th), sy = Math.sin(th), px = -sy, py = cx, o = k * 9;
      const bx = cx * base, by = sy * base, tx = Math.cos(tip), ty = Math.sin(tip);
      pos[o] = bx + px * w; pos[o + 1] = by + py * w; pos[o + 2] = z;
      pos[o + 3] = bx - px * w; pos[o + 4] = by - py * w; pos[o + 5] = z;
      pos[o + 6] = bx + tx * len; pos[o + 7] = by + ty * len; pos[o + 8] = z;
      for (let j = 0; j < K; j++) {
        const i = k * K + j, d = 0.3 + j * 0.4, f = d / len;
        if (f > 0.92) { L.hide(i); continue; }
        const sc = (s.long ? 0.44 : 0.32) * (1 - f * 0.62) * (1 + L.glow[i] * 0.2);
        L.putE(i, bx + tx * d, by + ty * d, 0.02, 0, 0, tip, sc, sc, sc);
      }
    }
    v.s.spikes.geometry.attributes.position.needsUpdate = true;
    // Rings telescope toward the camera on kick + bass, the inner ring furthest; shadows lengthen.
    v.s.rings.forEach((r: any, ri: number) => {
      const target = (A.kick * 1.7 + A.bass * 0.8) * (1 + (2 - ri) * 0.55);
      r.z += (target - r.z) * Math.min(1, dt * (target > r.z ? 16 : 5));
      const sc = 1 + r.z * 0.035, spin = (ri % 2 ? -1 : 1) * tick(A.beats * 0.5 + ri * 0.15) * (TAU / r.n) * 2;
      r.g.position.z = r.z; r.g.scale.setScalar(sc); r.g.rotation.z = spin;
      const off = 0.08 + r.z * 0.2; r.shadow.position.set(off, -off, -0.12); r.shadow.scale.setScalar(sc);
      for (let j = 0; j < r.n; j++) {
        const a = j / r.n * TAU + spin, i = r.i0 + j, s2 = 0.36 * (1 + L.glow[i] * 0.25) * sc;
        L.putE(i, Math.cos(a) * r.r * sc, Math.sin(a) * r.r * sc, r.z + 0.03, 0, 0, a - Math.PI / 2, s2, s2, s2);
      }
    });
    const so = 0.08 + A.kick * 0.1; v.s.spikeShadow.position.set(so, -so, -0.08);
    v.root.rotation.x = Math.sin(t * 0.2) * 0.08; v.root.rotation.y = Math.cos(t * 0.17) * 0.1;
  },
};

const helix: VolumeDef = {
  key: 'DNA_HELIX', name: 'Lyric Helix', bg: '#020304', fog: 0.05, fov: 40,
  build(v) {
    v.cam.position.set(0, 0, 12.5); v.cam.lookAt(0, 0, 0); v.root.rotation.z = 0.32;
    const P = 76, ROWS = 3; v.s.P = P; v.s.ROWS = ROWS;
    v.s.S = [0, 1].map(() => v.layer(P * ROWS, { mode: 'light', font: F.MONO, layers: 1, hi: '#FFFFFF', hiAmt: 0.7, fogDensity: 0.055 }));
    const ca = [C('#3CF2A4'), C('#2DD8D6')], cb = [C('#B86CFF'), C('#8C5CFF')];
    for (let r = 0; r < ROWS; r++) for (let i = 0; i < P; i++) { v.s.S[0].col(r * P + i, TMPC.copy(ca[0]).lerp(ca[1], r / 2)); v.s.S[1].col(r * P + i, TMPC.copy(cb[0]).lerp(cb[1], r / 2)); }
    v.s.RG = 9; v.s.RK = 6;
    v.s.R = v.layer(v.s.RG * v.s.RK, { mode: 'light', font: F.MONO, layers: 1, hi: '#FFFFFF', hiAmt: 1, fogDensity: 0.055 });
    for (let i = 0; i < v.s.RG * v.s.RK; i++) v.s.R.col(i, C('#9FB6D8'));
    const r = rng(7); v.s.dust = range(0, 80).map(() => ({ x: (r() - .5) * 12, y: (r() - .5) * 12, z: (r() - .5) * 8, sp: 0.2 + r() * 0.5 }));
    v.s.D = v.layer(80, { mode: 'light', font: F.MONO, layers: 1, fogDensity: 0.04 });
    for (let i = 0; i < 80; i++) { v.s.D.char(i, '·'); v.s.D.col(i, C('#5E7596')); }
    v.s.ph = 0; v.s.q = new THREE.Quaternion(); v.s.T = V3(0, 0, 0); v.s.N = V3(0, 0, 0);
  },
  text(v, st, inst) {
    const { P, ROWS, RG, RK } = v.s, stg = inst ? null : 0.01;
    v.s.S.forEach((L: GlyphLayer, k: number) => { for (let r = 0; r < ROWS; r++) L.fill(st.spaced, range(r * P, P), r * 9 + k * 17, stg); });
    const W = st.words;
    for (let g = 0; g < RG; g++) { const wi = g % W.length, w = W[wi].slice(0, RK), pad = Math.floor((RK - w.length) / 2), s = (' '.repeat(pad) + w).padEnd(RK); for (let k = 0; k < RK; k++) { v.s.R.char(g * RK + k, s[k], inst ? null : g * 0.03); v.s.R.word[g * RK + k] = s[k] === ' ' ? -1 : wi; } }
  },
  update(v, t, dt, A) {
    const s = v.s, H = 11.5, R = 1.7, turns = 2.3; s.ph += dt * (0.35 + A.mid * 1.8) * MOTION;
    const yp = -H / 2 + H * A.bar;
    const pt = (u: number, strand: number) => { const y = (u - 0.5) * H, a = u * turns * TAU + s.ph + strand * Math.PI, pulse = Math.exp(-((y - yp) ** 2) / 1.6) * (0.15 + A.kick * 1.2); return { y, a, pulse, rr: R * (1 + pulse * 0.45 + A.bass * 0.15) }; };
    for (let k = 0; k < 2; k++) {
      const L = s.S[k];
      for (let i = 0; i < s.P; i++) {
        const u = i / (s.P - 1), { y, a, pulse, rr } = pt(u, k);
        s.T.set(-Math.sin(a) * rr * turns * TAU, H, Math.cos(a) * rr * turns * TAU); s.N.set(Math.cos(a), 0, Math.sin(a));
        basisQ(s.T, s.N, s.q);
        const bx = BASIS_Y.x, by = BASIS_Y.y, bz = BASIS_Y.z;
        for (let r = 0; r < s.ROWS; r++) {
          const j = r * s.P + i, off = (r - 1) * 0.21, g = L.glow[j], sc = 0.2 * (1 + g * 0.5) * (1 + pulse * 0.3);
          L.put(j, Math.cos(a) * rr + bx * off, y + by * off, Math.sin(a) * rr + bz * off, s.q, sc, sc, sc);
        }
      }
    }
    for (let g = 0; g < s.RG; g++) {
      const u = (g * 8 + 4) / (s.P - 1), A0 = pt(u, 0), B0 = pt(u, 1);
      for (let k = 0; k < s.RK; k++) { const f = (k + 1) / (s.RK + 1), i = g * s.RK + k, sc = 0.22 * (1 + s.R.glow[i] * 0.5); s.R.put(i, Math.cos(A0.a) * A0.rr * (1 - f) + Math.cos(B0.a) * B0.rr * f, A0.y, Math.sin(A0.a) * A0.rr * (1 - f) + Math.sin(B0.a) * B0.rr * f, QI, sc, sc, sc); }
    }
    s.S.forEach((L: GlyphLayer) => { L.mat.uniforms.uGain.value = 0.8 + A.high * 0.6; });
    s.dust.forEach((d: any, i: number) => { d.y += dt * d.sp * (1 + A.bass * 2); if (d.y > 6) d.y -= 12; s.D.put(i, d.x, d.y, d.z, QI, 0.22, 0.22, 0.22); });
  },
};

const topo: VolumeDef = {
  key: 'TOPOGRAPHY', name: 'Contour Field', bg: '#10161B', fog: 0.035, fov: 42,
  build(v) {
    v.cam.position.set(-2.8, 6.4, 9.4); v.cam.lookAt(0.3, 0.2, 0);
    const W = 26, H = 17, sp = 0.5; Object.assign(v.s, { W, H, sp });
    v.s.L = v.layer(W * H, { font: F.ARCHIVO, layers: 18, depth: 1, hi: '#FFD84A', hiAmt: 1 });
    v.s.green = [C('#17702A'), C('#2FB24A'), C('#86DB5A')]; v.s.red = [C('#9E1A16'), C('#E0372B'), C('#FF7355')]; v.s.water = C('#2F6ED8');
  },
  text(v, st, inst) { v.s.L.fill(st.dense, null, 0, inst ? null : 0.003); },
  update(v, t, dt, A) {
    const { W, H, sp, L } = v.s;
    v.root.rotation.y = Math.sin(t * 0.08) * 0.25;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c, x = (c - (W - 1) / 2) * sp, z = (r - (H - 1) / 2) * sp;
      const xr = 1.6 * Math.sin(z * 0.5 + 0.6 + t * 0.05) - 0.4, river = Math.abs(x - xr) < 0.5;
      let h = 0.5 + 1.25 * smooth(-1.2, 2.2, x * 0.55 - z * 0.45 + Math.sin(z * 0.9) * 0.6) + 0.28 * Math.sin(x * 0.9 + t * 0.4) * Math.cos(z * 0.7 - t * 0.3) + A.bass * 0.6 * Math.sin(x * 0.5 - t * 1.3);
      h += A.bands[c % 16] * 0.35 * smooth(0.9, 1.6, h);
      const d = Math.hypot(x, z); h += A.kick * 1.1 * Math.sin(d * 2.2 - t * 7) * Math.exp(-d * 0.3);
      if (river) h = 0.16 + 0.04 * Math.sin(t * 3 + z * 2) + A.high * 0.08;
      h = Math.max(0.1, h);
      const g = L.glow[i];
      L.put(i, x, h + g * 0.3, z, QFLAT, 0.5, 0.5, h);
      L.col(i, river ? v.s.water : h < 1.0 ? grad(v.s.green, h / 1.0, TMPC) : grad(v.s.red, (h - 1.0) / 1.2, TMPC));
    }
  },
};

const gear: VolumeDef = {
  key: 'GEAR', name: 'Type Gear', bg: '#D6DBE0', fog: 0.01, fov: 40,
  build(v) {
    v.cam.position.set(0, 0.4, 14); v.cam.lookAt(0, 0, 0);
    const lines: number[] = [], box = (w: number, h: number) => { lines.push(-w, -h, 0, w, -h, 0, w, -h, 0, w, h, 0, w, h, 0, -w, h, 0, -w, h, 0, -w, -h, 0); };
    box(10.6, 6.3); box(10.2, 5.9);
    [[-10.2, 3, -9.2, 3], [9.2, -3, 10.2, -3], [-3, 5.9, -3, 5.1], [3, -5.9, 3, -5.1]].forEach(([a, b, c, d]) => lines.push(a, b, 0, c, d, 0));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const frame = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#98A3AE' })); frame.position.z = -5; v.scene.add(frame);
    v.scene.add(new THREE.HemisphereLight('#ffffff', '#5A6470', 2.2)); const dl = new THREE.DirectionalLight('#ffffff', 1.8); dl.position.set(3, 6, 8); v.scene.add(dl);
    v.root.rotation.x = -0.92;
    const G = new THREE.Group(); v.root.add(G); v.s.G = G;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.9, 40), new THREE.MeshStandardMaterial({ color: '#8C949D', metalness: 0.6, roughness: 0.35 })); hub.rotation.x = Math.PI / 2; G.add(hub);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.55, 6), new THREE.MeshStandardMaterial({ color: '#6B737C', metalness: 0.7, roughness: 0.3 })); nut.rotation.x = Math.PI / 2; nut.position.z = 0.65; G.add(nut);
    const slots: any[] = [], r = rng(11);
    const T = 28; for (let k = 0; k < T; k++) { const a = k / T * TAU; for (const rr of [4.28, 4.74]) for (const off of [-0.24, 0.24]) slots.push({ kind: 't', a: a + off / rr, r: rr, s: 0.46, band: k % 16 }); }
    for (const rr of [3.3, 3.78]) { const n = Math.round(TAU * rr / 0.5); for (let k = 0; k < n; k++) slots.push({ kind: 'r', a: k / n * TAU + (rr > 3.5 ? 0.03 : 0), r: rr, s: 0.46 }); }
    for (let sp = 0; sp < 4; sp++) { const a = Math.PI / 4 + sp * Math.PI / 2; for (let rr = 1.35; rr < 2.95; rr += 0.46) for (const off of [-0.24, 0.24]) { const x = Math.cos(a) * rr - Math.sin(a) * off, y = Math.sin(a) * rr + Math.cos(a) * off; slots.push({ kind: 's', a: Math.atan2(y, x), r: Math.hypot(x, y), s: 0.44, rot: a }); } }
    { const n = 13; for (let k = 0; k < n; k++) slots.push({ kind: 'h', a: k / n * TAU, r: 1.02, s: 0.36 }); }
    const tiles = ['#D8352A', '#F2B82E', '#2E5BC4', '#1A1C22'].map(C), inks = ['#F6EEDC', '#1A1C22', '#F2B82E', '#F2B82E'].map(C);
    const L = v.layer(slots.length, { font: F.ARCHIVO, layers: 12, depth: 0.95, hi: '#FFFFFF', hiAmt: 1, fogDensity: 0.01 });
    G.add(L.mesh);
    slots.forEach((_s, i) => { const p = Math.floor(r() * 4); L.tile(i, tiles[p], 1); L.col(i, inks[p]); });
    v.s.slots = slots; v.s.L = L; v.s.th = 0;
  },
  text(v, st, inst) { v.s.L.fill(st.dense, null, 0, inst ? null : 0.004); },
  update(v, t, dt, A) {
    const s = v.s; s.th += dt * (0.1 + A.bass * 1.1) * MOTION; s.G.rotation.z = s.th;
    v.root.rotation.y = Math.sin(t * 0.15) * 0.18;
    s.slots.forEach((sl: any, i: number) => {
      const g = s.L.glow[i], push = sl.kind === 't' ? A.kick * 0.45 + A.bands[sl.band] * 0.3 + g * 0.2 : g * 0.12, rr = sl.r + push;
      const rot = sl.rot != null ? sl.rot : sl.a;
      s.L.putE(i, Math.cos(sl.a) * rr, Math.sin(sl.a) * rr, sl.kind === 't' ? A.kick * 0.25 : 0, 0, 0, rot - Math.PI / 2, sl.s, sl.s, sl.s);
    });
  },
};

const vortex: VolumeDef = {
  key: 'VORTEX', name: 'Chaos Drain', bg: '#F2F0EA', fog: 0, fov: 42,
  build(v) {
    v.cam.position.set(0, 0, 12); v.cam.lookAt(0, 0, 0);
    const k = 0.11, r0 = 0.2, step = 0.265, slots: any[] = [];
    for (let arm = 0; arm < 2; arm++) { const arr: any[] = []; for (let th = 0; ; th += step) { const r = r0 * Math.exp(k * th); if (r > 12) break; arr.push({ th: th + arm * Math.PI, r, s: r * 0.34 }); } arr.reverse(); slots.push(...arr); }
    v.s.slots = slots;
    v.s.L = v.layer(slots.length, { font: F.ANTON, layers: 1, hiAmt: 0, fogDensity: 0 });
    for (let i = 0; i < slots.length; i++) v.s.L.col(i, C('#0D0D0D'));
    v.flat(new THREE.CircleGeometry(0.22, 32), '#0D0D0D', V3(0, 0, -0.01));
    v.s.lw = -9;
  },
  text() {},
  update(v, t, dt, A, ly) {
    const s = v.s, L = s.L;
    if (ly.word !== s.lw || s.line !== ly.idx) {
      const inst = s.lw === -9; s.lw = ly.word; s.line = ly.idx;
      const w = (ly.words[Math.max(0, ly.word)] || 'CHORA') + '·', half = s.slots.length / 2;
      s.slots.forEach((_sl: any, i: number) => { const j = i % half; L.char(i, w[j % w.length], inst ? null : (half - j) * 0.006); });
    }
    v.root.rotation.z += dt * (0.15 + A.mid * 1.1) * MOTION;
    v.root.scale.setScalar(1 + A.kick * 0.16);
    s.slots.forEach((sl: any, i: number) => L.putE(i, Math.cos(sl.th) * sl.r, Math.sin(sl.th) * sl.r, 0, 0, 0, sl.th - Math.PI / 2 - 0.11, sl.s, sl.s, sl.s));
  },
};

const skyline: VolumeDef = {
  key: 'SKYLINE', name: 'Letter Metropolis', bg: '#EDEDEB', fog: 0.03, fov: 64, ownCamera: true,
  build(v) {
    // The original Letter Skyline's look (white paper, black mono type, red accents, falling
    // letters) built out into a city of towers. The camera flies the avenues: it weaves, dips,
    // ducks under lyric skybridges and climbs above the rooftops on builds. Two city tiles repeat
    // behind each other as the world streams toward the camera; tower letters are a frozen layer
    // (set once), only their window lighting changes per frame.
    v.scene.fog = new THREE.Fog(v.def.bg, 8, 46);
    const r = rng(29), TL = 51.2, ROW = 3.2, NR = 16, FH = 0.34, COLS = [-10.4, -7, -3.4, 3.4, 7, 10.4];
    v.s.TL = TL;
    // Avenue towers are black type (the original main tower); outer towers are grey meters with a red cap.
    const ink = C('#121212'), red = C('#E0105C'), grey = C('#8E8E8E'), faint = C('#C9C9C6'), body = '#E4E4E1';
    v.s.tiles = [0, 1].map(ti => {
      const g = new THREE.Group(); v.root.add(g);
      const towers: any[] = [], slots: any[] = [];
      for (let ri = 0; ri < NR; ri++) for (const cx of COLS) {
        if (r() < 0.1) continue;
        const outer = Math.abs(cx) > 5, w = 1.3 + r() * 1.1, d = 1.3 + r() * 1.1;
        const floors = outer ? 12 + Math.floor(r() * 26) : 5 + Math.floor(r() * 14);
        const x = cx + (r() - 0.5) * 0.5, z = -(ri * ROW) - 2 - r() * 0.6;
        const tw = { x, z, w, d, floors, outer, band: Math.floor(r() * 16), i0: slots.length };
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, floors * FH, d), new THREE.MeshBasicMaterial({ color: body }));
        box.position.set(x, floors * FH / 2, z); g.add(box);
        const faces = [
          { n: V3(0, 0, 1), c: V3(x, 0, z + d / 2 + 0.01), along: V3(1, 0, 0), width: w },
          { n: V3(-Math.sign(x), 0, 0), c: V3(x - Math.sign(x) * (w / 2 + 0.01), 0, z), along: V3(0, 0, Math.sign(x)), width: d },
        ];
        faces.forEach(f => {
          const q = new THREE.Quaternion(); basisQ(f.along, f.n, q);
          const nf = Math.max(2, Math.round(f.width / 0.3));
          for (let fl = 0; fl < floors; fl++) for (let k = 0; k < nf; k++) {
            const o = (k - (nf - 1) / 2) * (f.width / nf);
            slots.push({ x: f.c.x + f.along.x * o, y: FH * (fl + 0.5), z: f.c.z + f.along.z * o, q, fl, tw });
          }
        });
        towers.push(tw);
      }
      const L = v.layer(slots.length, { font: F.MONO, layers: 1, hi: '#FF3D7F', hiAmt: 1, fogDensity: 0.045 });
      g.add(L.mesh);
      slots.forEach((sl, i) => { L.put(i, sl.x, sl.y, sl.z, sl.q, 0.26, 0.26, 0.26); L.col(i, sl.tw.outer ? grey : ink); });
      L.freeze();
      // Skybridges every few rows across the centre avenue, carrying the lyric.
      const bridges: any[] = [];
      for (let ri = 2; ri < NR; ri += 4) {
        const y = 4.6 + r() * 1.4, z = -(ri * ROW) - 3.4;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: '#121212' }));
        beam.position.set(0, y, z); g.add(beam);
        bridges.push({ y: y + 0.02, z: z + 0.27 });
      }
      const BK = 18, B = v.layer(bridges.length * BK, { font: F.ANTON, layers: 2, depth: 0.2, hi: '#FFFFFF', hiAmt: 1, fogDensity: 0.04 });
      g.add(B.mesh);
      bridges.forEach((br, bi) => { for (let k = 0; k < BK; k++) { const i = bi * BK + k; B.put(i, (k - (BK - 1) / 2) * 0.38, br.y, br.z, QI, 0.42, 0.42, 0.42); B.col(i, red); } });
      B.freeze();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, TL), new THREE.MeshBasicMaterial({ color: '#F2F2F0' }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -TL / 2 - 2); g.add(ground);
      const lines: number[] = []; for (let zz = 0; zz <= TL; zz += ROW) lines.push(-20, 0.01, -zz - 2, 20, 0.01, -zz - 2); lines.push(-1.4, 0.01, -2, -1.4, 0.01, -TL - 2, 1.4, 0.01, -2, 1.4, 0.01, -TL - 2);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#CFCFCB' })));
      return { g, L, B, slots, towers, bridges };
    });
    v.s.ink = ink; v.s.red = red; v.s.grey = grey; v.s.faint = faint;
    // Falling letters (the original's rain), around the camera in world space.
    v.s.rain = range(0, 160).map(() => ({ x: (r() - 0.5) * 16, y: r() * 14, z: -r() * 40, sp: 1 + r() * 2, s: 0.16 + r() * 0.2 }));
    v.s.R = v.layer(160, { font: F.ARCHIVO, layers: 1, fogDensity: 0.03 });
    v.s.rain.forEach((_d: any, i: number) => v.s.R.col(i, C('#6A6A6A')));
    v.s.rr = r;
    v.s.dist = 0; v.s.alt = 1.6; v.s.x = 0; v.s.vx = 0; v.s.vy = 0; v.s.eS = 0; v.s.eM = 0;
    v.cam.position.set(0, 1.6, 0); v.cam.lookAt(0, 1.4, -8);
  },
  text(v, st, inst) {
    v.s.tiles.forEach((tl: any, ti: number) => { tl.L.fill(st.dense, null, ti * 13, inst ? null : 0.0004); tl.B.fill(st.spaced, null, ti * 5, inst ? null : 0.01); });
    v.s.R.fill(st.dense, null, 3, inst ? null : 0.01);
  },
  update(v, t, dt, A) {
    const s = v.s, TL = s.TL;
    const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
    s.eM += (A.level - s.eM) * k1(2.5); s.eS += (A.level - s.eS) * k1(8);
    const build = clamp((s.eM - s.eS) * 5 - 0.1);
    const speed = (4 + A.bass * 6 + A.kick * 4 + build * 3) * MOTION;
    s.dist += speed * dt;
    // Tiles stream toward the camera and recycle behind each other.
    s.tiles.forEach((tl: any, ti: number) => { tl.g.position.z = wrap(s.dist + ti * TL, 2 * TL) - TL; });
    // Flight path: weave between the avenues, dip and rise, duck under the bridges; builds lift the
    // camera over the rooftops, the drop after a build dives back into the streets.
    const d = s.dist;
    const px = Math.sin(d * 0.07) * 1.8 + Math.sin(d * 0.023) * 0.7;
    const altStreet = 0.9 + 2.6 * (0.5 + 0.5 * Math.sin(d * 0.045));
    const altTarget = build > 0.45 ? 11 : altStreet;
    const nx = s.x + (px - s.x) * k1(0.35), na = s.alt + (altTarget - s.alt) * k1(build > 0.45 ? 1.2 : 0.5);
    s.vx += ((nx - s.x) / Math.max(dt, 1e-3) - s.vx) * k1(0.2); s.vy += ((na - s.alt) / Math.max(dt, 1e-3) - s.vy) * k1(0.2);
    s.x = nx; s.alt = na;
    const lx = Math.sin((d + 9) * 0.07) * 1.8 + Math.sin((d + 9) * 0.023) * 0.7;
    v.cam.position.set(s.x, s.alt + A.kick * 0.06, 0);
    v.cam.up.set(0, 1, 0);
    v.cam.lookAt(lx * 0.8, s.alt - 0.25 + s.vy * 0.15 - (s.alt > 6 ? 2.5 : 0), -9);
    v.cam.rotateZ(clamp(-s.vx * 0.22, -0.6, 0.6));
    v.s._fov = v.def.fov * (1 + A.kick * 0.06 + speed * 0.004);
    // Window lighting: each tower is a level meter on its own band; the top lit floor burns pink.
    const ink = s.ink, red = s.red, grey = s.grey, faint = s.faint;
    s.tiles.forEach((tl: any) => {
      for (let i = 0; i < tl.slots.length; i++) {
        const sl = tl.slots[i], tw = sl.tw, lv = Math.floor(A.bands[tw.band] * tw.floors * 1.15);
        tl.L.col(i, sl.fl === lv ? red : !tw.outer ? ink : sl.fl < lv ? grey : faint);
      }
    });
    // Rain streams with the flight and falls faster with the bass; a kick sends a fresh downpour.
    s.rain.forEach((dr: any, i: number) => {
      dr.y -= dt * dr.sp * (0.8 + A.bass * 2.4); dr.z += speed * dt;
      if (dr.y < 0 || dr.z > 2 || (A.onset && s.rr() < 0.2)) { dr.y = 6 + s.rr() * 9; dr.z = -4 - s.rr() * 36; dr.x = s.x + (s.rr() - 0.5) * 16; }
      const sc = dr.s * clamp(dr.y / 2.5 + 0.3);
      s.R.putE(i, dr.x, dr.y, dr.z, 0, 0, Math.sin(i + t) * 0.3, sc, sc, sc);
    });
  },
};

const butterfly: VolumeDef = {
  key: 'BUTTERFLY', name: 'Word Wings', bg: '#F1ECE3', fog: 0.012, fov: 50, ownCamera: true,
  build(v) {
    // Chase cam: the butterfly flies away from us through rings of lettering; the world streams past.
    v.scene.fog = new THREE.Fog(v.def.bg, 12, 46);
    v.cam.position.set(0, 2.6, 4.4); v.cam.lookAt(0, 0, -2.5);
    const fly = new THREE.Group(); fly.rotation.order = 'YXZ'; v.root.add(fly); v.s.fly = fly;
    const fay = (t: number) => { const e = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.pow(Math.sin(t / 12), 5); return [Math.sin(t) * e, Math.cos(t) * e]; };
    const M = 1600, pts: number[][] = []; let minY = 1e9, maxY = -1e9;
    for (let i = 0; i <= M; i++) { const p = fay(i / M * Math.PI); pts.push(p); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const k = 3.6 / (maxY - minY), cy = (maxY + minY) / 2;
    const rings = [1, 0.8, 0.62, 0.45], cells: any[] = [];
    rings.forEach((sc, ri) => { let acc = 0; for (let i = 1; i <= M; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; acc += Math.hypot(x1 - x0, y1 - y0) * k * sc; if (acc >= 0.2) { acc = 0; const x = x1 * k * sc, y = (y1 - cy) * k * sc + (1 - sc) * 0.12; if (x > 0.16) { cells.push({ x, y, ri }); cells.push({ x: -x, y, ri }); } } } });
    cells.sort((a, b) => b.y - a.y);
    const pal = ['#F26B1D', '#F5B82E', '#1E9E9A', '#2F5FD0', '#7B3FB8', '#D9362B'].map(C), dark = C('#1D1B22'), cream = C('#FBF6EC');
    v.s.pal = pal;
    const L = v.layer(cells.length, { font: F.ANTON, layers: 2, depth: 0.1, hi: '#FFFFFF', hiAmt: 1, fogDensity: 0.012 });
    fly.add(L.mesh);
    cells.forEach((c, i) => { const ang = Math.atan2(c.y, Math.abs(c.x)), sec = Math.min(5, Math.floor((ang + Math.PI / 2) / Math.PI * 6)); c.band = (sec * 2 + c.ri) % 16; if (c.ri === 0) { L.tile(i, dark); L.col(i, cream); } else { L.tile(i, pal[(sec + c.ri) % 6]); L.col(i, cream); } });
    v.s.cells = cells; v.s.L = L;
    const bodyMat = new THREE.MeshBasicMaterial({ color: '#23201F' });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.6, 6, 12), bodyMat); body.rotation.x = Math.PI / 2; body.position.z = 0.1; fly.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), bodyMat); head.position.z = -0.95; fly.add(head);
    const ant: number[] = []; for (const sg of [-1, 1]) for (let i = 0; i < 16; i++) { const f = (u: number) => [sg * (0.05 + u * 0.55 + u * u * 0.15), 0.05 + u * 0.35, -(1.0 + u * 0.8)]; ant.push(...f(i / 15), ...f((i + 1) / 15)); }
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(ant, 3)); fly.add(new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: '#23201F' })));
    v.s.B = v.layer(8, { font: F.ANTON, layers: 1, hiAmt: 0, fogDensity: 0.01 }); fly.add(v.s.B.mesh);
    for (let i = 0; i < 8; i++) { v.s.B.col(i, dark); v.s.B.tile(i, cream); }
    // Environment: gates (rings of lettering + a thin hoop) and drifting pollen letters.
    const r = rng(19); v.s.rr = r;
    v.s.GN = 6; v.s.GK = 26; v.s.gap = 9;
    v.s.gates = range(0, v.s.GN).map(i => ({ x: (r() - 0.5) * 5, y: (r() - 0.5) * 2.6, z: -8 - i * v.s.gap, spin: r() * TAU, hoop: null as any }));
    v.s.G = v.layer(v.s.GN * v.s.GK, { font: F.ANTON, layers: 3, depth: 0.35, hi: '#FF3D7F', hiAmt: 1, fogDensity: 0.03 });
    v.s.gates.forEach((g: any, gi: number) => {
      for (let j = 0; j < v.s.GK; j++) { v.s.G.col(gi * v.s.GK + j, cream); v.s.G.tile(gi * v.s.GK + j, pal[(gi + j) % 6]); }
      g.hoop = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.035, 6, 64), new THREE.MeshBasicMaterial({ color: '#1D1B22' })); v.root.add(g.hoop);
    });
    v.s.pollen = range(0, 110).map(() => ({ x: (r() - 0.5) * 16, y: (r() - 0.5) * 9, z: -r() * 50, s: 0.12 + r() * 0.2, c: Math.floor(r() * 6) }));
    v.s.P = v.layer(110, { font: F.ARCHIVO, layers: 1, fogDensity: 0.03 });
    v.s.pollen.forEach((p: any, i: number) => v.s.P.col(i, pal[p.c]));
    v.s.bx = 0; v.s.by = 0; v.s.vx = 0; v.s.vy = 0; v.s.lw = -9;
    v.s.qR = new THREE.Quaternion(); v.s.qL = new THREE.Quaternion(); v.s.Z = V3(0, 0, 1); v.s.camP = V3(0, 2.6, 4.4);
  },
  text(v, st, inst) {
    v.s.L.fill(st.dense, null, 0, inst ? null : 0.006);
    for (let g = 0; g < v.s.GN; g++) v.s.G.fill(st.spaced, range(g * v.s.GK, v.s.GK), g * 5, inst ? null : 0.01);
    v.s.P.fill(st.dense, null, 3, inst ? null : 0.004);
  },
  update(v, t, dt, A, ly) {
    const s = v.s, L = s.L;
    const speed = (3.2 + A.bass * 4 + A.kick * 3 + A.level * 2) * MOTION;
    // World streams toward the camera; gates recycle to the far end at a new position.
    let target: any = null;
    s.gates.forEach((g: any, gi: number) => {
      g.z += speed * dt; g.spin += dt * 0.25 * (gi % 2 ? -1 : 1);
      if (g.z > 3.2) { g.z -= s.GN * s.gap; g.x = (s.rr() - 0.5) * 5; g.y = (s.rr() - 0.5) * 2.6; }
      if (g.z < -1.5 && (!target || g.z > target.z)) target = g;
      g.hoop.position.set(g.x, g.y, g.z); g.hoop.rotation.z = g.spin;
      for (let j = 0; j < s.GK; j++) {
        const i = gi * s.GK + j, a = j / s.GK * TAU + g.spin, sc = 0.5 * (1 + s.G.glow[i] * 0.3 + A.kick * 0.15);
        s.G.putE(i, g.x + Math.cos(a) * 2.62, g.y + Math.sin(a) * 2.62, g.z, 0, 0, a - Math.PI / 2, sc, sc, sc);
      }
    });
    s.pollen.forEach((p: any, i: number) => { p.z += speed * dt * 1.15; if (p.z > 4) { p.z -= 50; p.x = (s.rr() - 0.5) * 16; p.y = (s.rr() - 0.5) * 9; } s.P.put(i, p.x, p.y, p.z, QI, p.s, p.s, p.s); });
    // Steer toward the next gate: velocity drives bank (roll), yaw and pitch.
    if (target) {
      const lead = clamp(1 - (-target.z - 1.5) / (s.gap * 1.5), 0.25, 1);
      const nx = s.bx + (target.x - s.bx) * Math.min(1, dt * 1.6 * lead), ny = s.by + (target.y - s.by) * Math.min(1, dt * 1.6 * lead);
      s.vx += ((nx - s.bx) / Math.max(dt, 1e-3) - s.vx) * Math.min(1, dt * 4); s.vy += ((ny - s.by) / Math.max(dt, 1e-3) - s.vy) * Math.min(1, dt * 4);
      s.bx = nx; s.by = ny;
    }
    s.fly.position.set(s.bx, s.by + Math.sin(A.half * TAU) * 0.08, 0);
    s.fly.rotation.set(clamp(s.vy * 0.22, -0.5, 0.5) - 0.12, clamp(-s.vx * 0.12, -0.4, 0.4), clamp(-s.vx * 0.38, -0.95, 0.95));
    s.camP.lerp(V3(s.bx * 0.6, s.by * 0.6 + 2.6, 4.4), Math.min(1, dt * 2.2));
    v.cam.position.copy(s.camP); v.cam.lookAt(s.bx * 0.9, s.by * 0.9, -2.5);
    // Flap: wings rotate on the body axis, one stroke per half bar, deeper with kick/bass.
    const f = 0.12 + 1.0 * Math.pow(0.5 - 0.5 * Math.cos(A.half * TAU), 1.4) * (0.45 + 0.55 * Math.min(1, A.kick + A.bass * 0.4));
    s.qR.setFromAxisAngle(s.Z, f).multiply(QFLAT); s.qL.setFromAxisAngle(s.Z, -f).multiply(QFLAT);
    const cf = Math.cos(f), sf = Math.sin(f);
    s.cells.forEach((c: any, i: number) => { const g = L.glow[i], sc = 0.19 * (1 + g * 0.3 + A.bands[c.band] * 0.2); L.put(i, c.x * cf, Math.abs(c.x) * sf, -c.y, c.x > 0 ? s.qR : s.qL, sc, sc, sc); });
    if (s.lw !== ly.word) { const inst = s.lw === -9; s.lw = ly.word; const w = (ly.words[Math.max(0, ly.word)] || '').slice(0, 8), pad = Math.floor((8 - w.length) / 2), str = (' '.repeat(pad) + w).padEnd(8); for (let i = 0; i < 8; i++) s.B.char(i, str[i], inst ? null : i * 0.04); }
    for (let i = 0; i < 8; i++) s.B.put(i, 0, 0.16, -0.75 + i * 0.2, QFLAT, 0.17, 0.17, 0.17);
  },
};

const ocean: VolumeDef = {
  key: 'OCEAN_WAVES', name: 'Tide Lines', bg: '#F4E6CF', fog: 0, fov: 40,
  build(v) {
    v.cam.position.set(0, 0, 12); v.cam.lookAt(0, 0, 0); v.root.rotation.z = -0.16;
    v.s.sun = v.flat(new THREE.CircleGeometry(1.7, 64), '#F4A62A', V3(4.2, 3.2, -3), v.scene);
    const B = 6, SEG = 120;
    const cols = ['#C94A2A', '#E8762C', '#F2B33D', '#E9D8B8', '#1F8A94', '#12506E'], inks = ['#FFF3E0', '#FFF3E0', '#5A2A12', '#12506E', '#FFF3E0', '#F2B33D'];
    v.s.bands = cols.map((c, r) => {
      const pos = new Float32Array((SEG + 1) * 2 * 3), idx: number[] = [];
      for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.frustumCulled = false; v.root.add(m);
      return { m, pos, base: 2.9 - r * 1.05, z: r * 0.08, ink: C(inks[r]) };
    });
    Object.assign(v.s, { B, SEG, X0: -13, X1: 13, PER: 66, SP: 0.4 });
    v.s.L = v.layer(B * v.s.PER, { font: F.ANTON, layers: 1, hi: '#FFFFFF', hiAmt: 0.9, fogDensity: 0 });
    v.s.bands.forEach((b: any, r: number) => { for (let k = 0; k < v.s.PER; k++) v.s.L.col(r * v.s.PER + k, b.ink); });
    v.s.off = new Float32Array(B);
  },
  text(v, st, inst) { for (let r = 0; r < v.s.B; r++) v.s.L.fill(st.spaced, range(r * v.s.PER, v.s.PER), r * 11, inst ? null : 0.012); },
  update(v, t, dt, A) {
    const s = v.s;
    const W = s.PER * s.SP;
    v.s.sun.scale.setScalar(1 + A.kick * 0.12);
    s.bands.forEach((b: any, r: number) => {
      const amp = 0.22 + A.kick * 0.6 + A.bands[(r * 3) % 16] * 0.45;
      const wave = (x: number) => Math.sin(x * 0.42 + t * 0.9 + r * 0.35) + 0.4 * Math.sin(x * 0.95 - t * 1.3 + r * 0.6);
      const dwave = (x: number) => 0.42 * Math.cos(x * 0.42 + t * 0.9 + r * 0.35) + 0.38 * Math.cos(x * 0.95 - t * 1.3 + r * 0.6);
      for (let i = 0; i <= s.SEG; i++) { const x = s.X0 + (s.X1 - s.X0) * i / s.SEG, y = b.base + amp * wave(x), o = i * 6; b.pos[o] = x; b.pos[o + 1] = y; b.pos[o + 2] = b.z; b.pos[o + 3] = x; b.pos[o + 4] = y - 3.2; b.pos[o + 5] = b.z; }
      b.m.geometry.attributes.position.needsUpdate = true;
      s.off[r] += dt * (0.35 + r * 0.06) * (1 + A.bass * 2.2) * MOTION;
      for (let k = 0; k < s.PER; k++) {
        const i = r * s.PER + k, x = wrap(k * s.SP - s.off[r], W) - W / 2, y = b.base + amp * wave(x) - 0.44, g = s.L.glow[i], sc = 0.46 * (1 + g * 0.2);
        s.L.putE(i, x, y + g * 0.18, b.z + 0.02, 0, 0, Math.atan(amp * dwave(x)), sc, sc, sc);
      }
    });
  },
};

const shatter: VolumeDef = {
  key: 'SHATTER', name: 'Bauhaus Shatter', bg: '#F3F0E8', fog: 0.01, fov: 40, ownCamera: true,
  build(v) {
    // A 3D constructivist poster: extruded shards float in depth while the camera orbits 360°.
    v.scene.fog = new THREE.Fog(v.def.bg, 14, 34);
    v.scene.add(new THREE.AmbientLight('#ffffff', 1.3));
    const dl = new THREE.DirectionalLight('#ffffff', 2.4); dl.position.set(4, 7, 6); v.scene.add(dl);
    const r = rng(23), cols = ['#E03A2E', '#1E4FD8', '#F5B51F', '#111111', '#111111', '#F3F0E8'];
    // Each shape type listens to a different part of the song.
    //  tri → voice (swells, spins)  trap → bass (pushes outward, per-shard strength)
    //  disc → highs (spins, pulses)  bar → kick (stretches)
    v.s.shards = range(0, 84).map(() => {
      const roll = r(), type = roll < 0.3 ? 'tri' : roll < 0.62 ? 'trap' : roll < 0.8 ? 'bar' : 'disc';
      const sz = 0.35 + r() * 1.5, sh = new THREE.Shape();
      if (type === 'tri') { for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + (r() - 0.5) * 0.8, rr = sz * (0.7 + r() * 0.4); if (k) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
      else if (type === 'trap') { const w1 = sz, w2 = sz * (0.3 + r() * 0.5), hh = sz * (0.5 + r() * 0.6); sh.moveTo(-w1, -hh); sh.lineTo(w1, -hh); sh.lineTo(w2, hh); sh.lineTo(-w2, hh); }
      else if (type === 'bar') { const lw = sz * 1.8, lh = 0.12 + r() * 0.18; sh.moveTo(-lw / 2, -lh / 2); sh.lineTo(lw / 2, -lh / 2); sh.lineTo(lw / 2, lh / 2); sh.lineTo(-lw / 2, lh / 2); }
      else sh.absarc(0, 0, sz * 0.6, 0, TAU, false);
      if (type === 'disc' && r() < 0.5) { const hole = new THREE.Path(); hole.absarc(0, 0, sz * 0.32, 0, TAU, true); sh.holes.push(hole); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false, curveSegments: 28 }); geo.center();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[Math.floor(r() * cols.length)], roughness: 0.6, metalness: 0.02, side: THREE.DoubleSide }));
      v.root.add(m);
      const home = V3((r() - 0.5) * 9, (r() - 0.5) * 6, (r() - 0.5) * 6);
      const dir = home.clone().add(V3((r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2)).normalize();
      return { m, type, home, dir, gain: 0.4 + r() * 1.8, rot: V3(r() * TAU, r() * TAU, r() * TAU), tumble: V3((r() - 0.5) * 1.2, (r() - 0.5) * 1.2, (r() - 0.5) * 1.2), ph: r() * TAU };
    });
    const N = 44; v.s.N = N;
    v.s.L = v.layer(N, { font: F.ARCHIVO, layers: 4, depth: 0.3, hi: '#FFFFFF', hiAmt: 0, fogDensity: 0.01 });
    v.s.lt = range(0, N).map(() => ({ home: [0, 0], out: [(r() - 0.5) * 9, (r() - 0.5) * 6, (r() - 0.5) * 6], sc: 0.7 + r() * 0.9, on: false, tile: r() < 0.3 }));
    v.s.K = C('#111111'); v.s.W = C('#F3F0E8'); v.s.Y = C('#F5B51F');
    v.s.e = 0; v.s.orbit = 0; v.s.q = new THREE.Quaternion();
  },
  text(v, st, inst) {
    const s = v.s, rows: string[] = [];
    let row = '';
    st.words.forEach(w => { if ((row + ' ' + w).trim().length > 9 && row) { rows.push(row); row = w; } else row = (row + ' ' + w).trim(); });
    if (row) rows.push(row);
    const lines = rows.slice(0, 4), lh = 1.35;
    let n = 0, wi = 0;
    lines.forEach((ln, li) => { const y = ((lines.length - 1) / 2 - li) * lh; [...ln].forEach((ch, ci) => { if (n >= s.N) return; if (ch === ' ') { wi++; return; } const lt = s.lt[n]; lt.home = [(ci - (ln.length - 1) / 2) * 0.96, y]; lt.on = true; s.L.char(n, ch, inst ? null : n * 0.02); s.L.word[n] = wi; n++; }); wi++; });
    for (let i = n; i < s.N; i++) { s.lt[i].on = false; s.L.char(i, ' ', null); s.L.word[i] = -1; }
  },
  update(v, t, dt, A) {
    const s = v.s, L = s.L;
    // Constant 360° orbit, a slow vertical bob, and a lean-in on kicks.
    s.orbit += dt * (0.2 + A.level * 0.15) * MOTION;
    const rad = 13 - A.kick * 1.2;
    v.cam.position.set(Math.sin(s.orbit) * rad, 1.6 * Math.sin(t * 0.17) + 0.6, Math.cos(s.orbit) * rad); v.cam.lookAt(0, 0, 0);
    // Chaos: a resting scatter that the loudness blows further apart.
    const target = clamp(0.22 + A.kick * 1.0 + A.bass * 0.45 - 0.1);
    s.e += (target - s.e) * Math.min(1, dt * (target > s.e ? 14 : 2.2));
    const e = s.e * s.e * (3 - 2 * s.e);
    s.shards.forEach((sh: any) => {
      sh.rot.addScaledVector(sh.tumble, dt * (0.35 + A.level * 1.2) * MOTION);
      let push = e * 2.2 * sh.gain, sc = 1, spin = 0, sx = 1;
      if (sh.type === 'trap') push += A.bass * 2.6 * sh.gain;
      else if (sh.type === 'tri') { sc = 1 + A.voice * 1.3; spin = A.voice * 2.5; }
      else if (sh.type === 'disc') { sc = 1 + A.high * 0.6; spin = A.high * 4; }
      else sx = 1 + A.kick * 1.8;
      sh.rot.z += dt * spin;
      sh.m.position.copy(sh.home).addScaledVector(sh.dir, push);
      sh.m.position.y += Math.sin(t * 0.6 + sh.ph) * 0.15;
      sh.m.rotation.set(sh.rot.x, sh.rot.y, sh.rot.z);
      sh.m.scale.set(sc * sx, sc, sc);
    });
    // Lyric letters face the camera so the line stays legible from every orbit angle.
    s.q.copy(v.cam.quaternion);
    const ex = V3(1, 0, 0).applyQuaternion(s.q), ey = V3(0, 1, 0).applyQuaternion(s.q);
    s.lt.forEach((lt: any, i: number) => {
      if (!lt.on) { L.hide(i); return; }
      const g = L.glow[i], sc = 1.05 * (1 + (lt.sc - 1) * e);
      const bx = ex.x * lt.home[0] + ey.x * lt.home[1], by = ex.y * lt.home[0] + ey.y * lt.home[1], bz = ex.z * lt.home[0] + ey.z * lt.home[1];
      L.put(i, bx + lt.out[0] * e, by + lt.out[1] * e, bz + lt.out[2] * e, s.q, sc, sc, sc);
      if (g > 0.5) { L.tile(i, s.K); L.col(i, s.Y); } else if (lt.tile) { L.tile(i, s.K); L.col(i, s.W); } else { L.tile(i, s.K, 0); L.col(i, s.K); }
    });
  },
};

const maze: VolumeDef = {
  key: 'MAZE', name: 'Letter Maze', bg: '#07080A', fog: 0.085, fov: 62, ownCamera: true,
  build(v) {
    const S = 12, walls = [[-1.4, 0, -1.4, -4], [-1.4, -6, -1.4, -12], [1.4, 0, 1.4, -8], [1.4, -10, 1.4, -12], [-1.4, -4, -4.2, -4], [-1.4, -6, -4.2, -6], [1.4, -8, 4.2, -8], [1.4, -10, 4.2, -10], [-4.2, 0, -4.2, -12], [4.2, 0, 4.2, -12]];
    const slots: any[] = [], r = rng(3), X = V3(0, 0, 0), Z = V3(0, 0, 0), q = new THREE.Quaternion();
    for (let copy = 0; copy < 3; copy++) walls.forEach(([x1, z1, x2, z2]) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.round(len * 3.1); X.set(x2 - x1, 0, z2 - z1); Z.set(-(z2 - z1), 0, x2 - x1); basisQ(X, Z, q);
      for (let row = 0; row < 7; row++) for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; slots.push({ x: x1 + (x2 - x1) * f, y: 0.25 + row * 0.33, z: z1 + (z2 - z1) * f - copy * S, q: q.clone(), b: 0.35 + r() * 0.45, row }); }
    });
    v.s.slots = slots; v.s.S = S;
    v.s.L = v.layer(slots.length, { mode: 'light', font: F.MONO, layers: 1, hi: '#FF3D7F', hiAmt: 1, fogDensity: 0.085 });
    const base = C('#D6D7DD'); slots.forEach((s, i) => { v.s.L.col(i, TMPC.copy(base).multiplyScalar(s.b)); v.s.L.put(i, s.x, s.y, s.z, s.q, 0.3, 0.3, 0.3); });
    const floor = v.flat(new THREE.PlaneGeometry(12, 60), '#0C0D10', V3(0, 0, -18), v.scene); floor.rotation.x = -Math.PI / 2;
    v.s.flow = 0;
  },
  text(v, st, inst) { v.s.L.fill(st.dense, null, 0, inst ? null : 0.0006); },
  update(v, t, dt, A) {
    const s = v.s, L = s.L; s.flow += dt * (0.45 + A.bass * 1.6) * MOTION;
    const z = 1.5 - wrap(s.flow, s.S), sway = Math.sin(t * 0.4) * 0.25;
    v.cam.position.set(sway, 1.15 + Math.sin(t * 1.6) * 0.03 + A.kick * 0.05, z); v.cam.lookAt(sway * 0.4, 1.05, z - 6);
    L.mat.uniforms.uGain.value = 0.6 + A.kick * 1.4 + A.high * 0.3;
    s.slots.forEach((sl: any, i: number) => { const g = L.glow[i]; if (g > 0.01 || L.flip[i] < 1) { const sc = 0.3 * (1 + g * 0.25); L.put(i, sl.x, sl.y, sl.z, sl.q, sc, sc, sc); } });
  },
};

export const TYPO_VOLUMES: VolumeDef[] = [sphere, glass, sunburst, helix, topo, gear, vortex, skyline, butterfly, ocean, shatter, maze];
export type TypoVolumePreset = 'SPHERE' | 'CUBIC_GLASS' | 'SUNBURST' | 'DNA_HELIX' | 'TOPOGRAPHY' | 'GEAR' | 'VORTEX' | 'SKYLINE' | 'BUTTERFLY' | 'OCEAN_WAVES' | 'SHATTER' | 'MAZE';

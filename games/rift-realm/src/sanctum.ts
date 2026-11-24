// The Void Sanctum Arena: the tournament's hub (art: void-sanctum-complete, VA-01..VA-12; docs/rift-realm-levels.md
// "All: the Void Sanctum hub and its three maps"). Fighters return here between matches.
// A floating octagonal obsidian platform in the cosmic Void rift: gold trim and carved rune inlay, a ring of eight
// monoliths with pulsing energy rings, the central rift gate on a stepped dais, the Banished Archangel's chains and
// fractured crystal wings hanging above, and three rune bridges out to portal platforms, one per map:
//   W  Elderwood Hollow   → ?level=elderwood
//   E  Emberfall Caldera  → ?level=volcanic  (the forge crater's stand-in until its own map is built)
//   N  Sunken Cathedral   → ?level=marsh     (the flooded ruin's stand-in until its own map is built)
// Three runes on the floor start a game mode here (modes/index.ts): Trials, Wave Survival, Boss Hunt. Two hovering rune
// platforms (VA-11) are reached by jump pads. The rim is open: the fall into the Void is the hazard (VA-06).
// Frame: +z = south (Team A spawn), y up, metres. Platform top y = 0.
import * as THREE from 'three/webgpu';
import { color, float, fract, length, luminance, mix, positionWorld, sin, smoothstep, atan, texture as tslTexture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { StaticKit, boulder, fbm3, octagon, polyPrism, rng } from './geom';
import { builders } from './structures';
import { pbr } from './textures';
import type { Level, LevelInfo, Tier } from './shrine';
import type { JumpPad } from './jumpPads';
import type { Portal } from './portals';
import { modeById, type ModeId, type ModePad } from './modes';

const APO = 22;                       // main octagon apothem (≈ 44 m across: the Skirmish footprint)
const R_OCT = APO / Math.cos(Math.PI / 8);
const BRIDGE = 18, PORTAL_APO = 5.5;  // bridge length, portal platform apothem
const MONO_R = 16.5;                  // monolith ring radius

export function buildSanctum(scene: THREE.Scene, tier: Tier = 'high'): Level {
  const lo = tier === 'low';
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const kit = new StaticKit();
  const B = builders(kit);
  const R = rng(4242);
  const gold = color(0xf2c35a), cyan = color(0x46e8ff), violet = color(0x9b5cff);

  // ── materials: obsidian, gold trim, void stone (VA-09) ─────────────────────────────────────────────
  const obsSrc = pbr('celestial-obsidian', { maps: ['normal', 'roughness'], tint: 0xffffff, normalScale: 1.2 });
  const obsidian = new THREE.MeshStandardNodeMaterial({ map: obsSrc.map, normalMap: obsSrc.normalMap, roughness: 0.32, metalness: 0.1 });
  obsidian.colorNode = vec3(luminance(tslTexture(obsSrc.map!, uv()).rgb).mul(0.9).add(0.035)).mul(color(0x9a90b0));
  const voidStone = new THREE.MeshStandardNodeMaterial({ map: obsSrc.map, normalMap: obsSrc.normalMap, roughness: 0.9, side: THREE.DoubleSide });
  voidStone.colorNode = vec3(luminance(tslTexture(obsSrc.map!, uv()).rgb).mul(1.5).add(0.08)).mul(color(0x6e6480));
  // the crag's seams glow faint violet from the rift light
  voidStone.emissiveNode = violet.mul(smoothstep(float(0.62), float(0.9), fbm3Node()).mul(0.25));
  const goldMat = new THREE.MeshStandardNodeMaterial({ color: 0xd9a84a, roughness: 0.3, metalness: 1 });
  goldMat.emissiveNode = gold.mul(float(0.04).add(uBeatPulse.mul(0.06)));
  const glowGold = new THREE.MeshBasicNodeMaterial(); glowGold.colorNode = gold.mul(float(1.6).add(uBeatPulse.mul(0.8)));
  const glowCyan = new THREE.MeshBasicNodeMaterial(); glowCyan.colorNode = cyan.mul(float(1.5).add(uBeatPulse.mul(0.9)));
  function fbm3Node() { return luminance(tslTexture(obsSrc.map!, positionWorld.xz.mul(0.05).add(positionWorld.y.mul(0.03))).rgb).mul(2.2); }

  // carved rune inlay (VA-02): concentric rune rings and spokes in gold, a faint cyan circuit only as an accent
  const runeTex = (() => {
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!;
    g.translate(N / 2, N / 2); g.lineCap = 'round';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    const ring = (r: number, w: number, a = 1) => { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    g.strokeStyle = '#ffd36a'; g.fillStyle = '#ffd36a';
    ring(500, 6); ring(470, 3); ring(330, 5); ring(300, 2); ring(150, 6); ring(120, 2);
    g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [r, n] of [[485, 64], [315, 44]] as const) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.save(); g.rotate(a); g.translate(0, -r); g.globalAlpha = 0.9; g.fillText(glyphs[i % glyphs.length], 0, 0); g.restore(); }
    g.globalAlpha = 1; g.lineWidth = 4;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.beginPath(); g.moveTo(Math.cos(a) * 150, Math.sin(a) * 150); g.lineTo(Math.cos(a) * 470, Math.sin(a) * 470); g.stroke(); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 400, Math.sin(a) * 400, 26, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = '#7ff0ff'; g.lineWidth = 2; g.globalAlpha = 0.55;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 335, Math.sin(a) * 335); g.lineTo(Math.cos(a) * 360, Math.sin(a) * 360); g.lineTo(Math.cos(a + 0.05) * 380, Math.sin(a + 0.05) * 380); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const inlay = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const tx = tslTexture(runeTex, uv());
    const sweep = smoothstep(float(0.92), float(1), fract(atan(uv().y.sub(0.5), uv().x.sub(0.5)).div(6.2832).add(time.mul(0.05)))); // a slow light round the rings
    inlay.colorNode = tx.rgb.mul(float(0.55).add(uBeatPulse.mul(0.5)).add(sweep.mul(1.2)));
  }

  // ── the main platform: obsidian octagon, gold rim, a tapering void-stone crag beneath ─────────────────
  const oct = octagon(R_OCT);
  {
    const { top, sides } = polyPrism(oct, [], -2.4, 0);
    kit.add(obsidian, top, { tpm: 0.18 });
    kit.add(obsidian, sides, { tpm: 0.3 });
    // gold trim on the rim (a 12 cm lip, not a wall: the edge drop is the hazard) and gold edge bands down the sides
    for (let k = 0; k < 8; k++) {
      const [ax, az] = oct[k], [bx, bz] = oct[(k + 1) % 8], len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      kit.box(goldMat, 0.45, 0.12, len + 0.3, (ax + bx) / 2, 0.06, (az + bz) / 2, yaw, { tpm: 1, shadow: false });
      kit.box(goldMat, 0.15, 0.25, len, (ax + bx) / 2 * 1.004, -0.6, (az + bz) / 2 * 1.004, yaw, { tpm: 1, shadow: false, solid: false });
      kit.box(goldMat, 0.15, 0.25, len, (ax + bx) / 2 * 1.004, -2.2, (az + bz) / 2 * 1.004, yaw, { tpm: 1, shadow: false, solid: false });
    }
    // the underside: an inverted octagonal frustum broken up with noise into a crag, like the celestial islands
    const crag = new THREE.CylinderGeometry(R_OCT * 0.98, 3, 46, 8, 10, true);
    crag.rotateY(Math.PI / 8); crag.translate(0, -2.4 - 23, 0);
    const p = crag.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), d = Math.min(1, -(y + 2.4) / 6);
      const n = fbm3(x * 0.1, y * 0.1, z * 0.1) - 0.5;
      p.setXYZ(k, x * (1 + n * 0.45 * d), y + n * 3 * d, z * (1 + n * 0.45 * d));
    }
    crag.computeVertexNormals();
    kit.add(voidStone, crag, { tpm: 0.1, shadow: false });
    // the inlay
    const m = new THREE.Mesh(new THREE.CircleGeometry(APO - 0.8, 96), inlay); m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.name = 'rune inlay decal'; group.add(m);
  }

  // ── the central dais and rift gate (VA-07) ─────────────────────────────────────────────────────────
  const uGate = uniform(0);
  {
    kit.prism(obsidian, 8, 7.6, 7.8, 0.4, 0, 0, 0, Math.PI / 8, { tpm: 0.3 });
    kit.prism(obsidian, 8, 5.8, 6.0, 0.8, 0, 0, 0, Math.PI / 8, { tpm: 0.3 });
    for (const [r, y] of [[7.7, 0.41], [5.9, 0.81]] as const) { const t = new THREE.TorusGeometry(r, 0.07, 4, 8); t.rotateX(Math.PI / 2); t.rotateY(Math.PI / 8); kit.place(t, 0, y, 0); kit.add(goldMat, t, { solid: false, shadow: false, tpm: 1 }); }
    // the gate: a gold-banded obsidian ring standing on the dais, with the rift swirling inside
    const ring = new THREE.TorusGeometry(4.6, 0.55, 10, 48); kit.place(ring, 0, 0.8 + 5.0, 0); kit.add(obsidian, ring, { tpm: 0.6 });
    for (const rr of [4.0, 5.2]) { const t = new THREE.TorusGeometry(rr, 0.08, 4, 64); kit.place(t, 0, 5.8, 0); kit.add(goldMat, t, { solid: false, shadow: false, tpm: 1 }); }
    for (const s of [-1, 1]) { kit.box(obsidian, 1.4, 1.6, 1.6, s * 4.2, 0.8 + 0.8, 0, 0, { tpm: 0.5 }); kit.box(goldMat, 1.5, 0.12, 1.7, s * 4.2, 2.45, 0, 0, { tpm: 1, solid: false }); } // the gate's feet
    const swirl = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    {
      const d = uv().sub(0.5), r = length(d).mul(2), a = atan(d.y, d.x);
      const arms = sin(a.mul(3).add(r.mul(9)).sub(time.mul(1.6))).mul(0.5).add(0.5);
      const core = smoothstep(float(0.5), float(0), r);
      swirl.colorNode = mix(violet, cyan, arms.mul(core)).mul(arms.mul(0.9).add(core.mul(2.2)).add(uBeatPulse.mul(0.4)).add(uGate.mul(1.5)));
      swirl.opacityNode = smoothstep(float(1), float(0.82), r).mul(0.85);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.1, 64), swirl); disc.position.set(0, 5.8, 0); disc.name = 'rift gate swirl'; group.add(disc);
  }

  // ── the monolith ring (VA-04): eight obsidian slabs with gold caps, rune veins and floating energy rings ──
  const energyRings: THREE.Mesh[] = [];
  const monoTops: THREE.Vector3[] = [];
  {
    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    ringMat.colorNode = mix(cyan, gold, sin(time.mul(0.8).add(positionWorld.x.mul(0.2))).mul(0.5).add(0.5)).mul(float(1.2).add(uBeatPulse.mul(1.4)));
    ringMat.opacityNode = float(0.7);
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4, x = Math.cos(a) * MONO_R, z = Math.sin(a) * MONO_R, yaw = Math.atan2(x, z);
      const h = 8.5 + (k % 2) * 2.5;
      const slab = new THREE.CylinderGeometry(1.0, 1.35, h, 4, 1); slab.rotateY(Math.PI / 4); slab.scale(1.5, 1, 0.7);
      kit.place(slab, x, h / 2, z, yaw); kit.add(obsidian, slab, { tpm: 0.4 });
      kit.box(goldMat, 2.1, 0.3, 1.1, x, h + 0.15, z, yaw, { tpm: 1 });
      const tip = new THREE.ConeGeometry(0.75, 1.4, 4); tip.rotateY(Math.PI / 4); kit.place(tip, x, h + 1.0, z, yaw); kit.add(goldMat, tip, { tpm: 1, solid: false });
      // rune vein down the inner face
      kit.box(glowGold, 0.12, h * 0.7, 0.05, x - Math.sin(yaw) * 1.0, h * 0.45, z - Math.cos(yaw) * 1.0, yaw, { solid: false, shadow: false, tpm: 1 });
      kit.box(glowCyan, 0.05, h * 0.5, 0.05, x - Math.sin(yaw) * 1.02 + Math.cos(yaw) * 0.35, h * 0.4, z - Math.cos(yaw) * 1.02 - Math.sin(yaw) * 0.35, yaw, { solid: false, shadow: false, tpm: 1 });
      const er = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.06, 6, 48), ringMat); er.position.set(x, h * 0.55, z); er.rotation.x = Math.PI / 2; er.name = 'monolith energy ring'; group.add(er); energyRings.push(er);
      monoTops.push(new THREE.Vector3(x, h + 1.6, z));
    }
  }

  // ── rune bridges to the three map portals (VA-03, VA-10) ──────────────────────────────────────────────
  const portals: Portal[] = [];
  const labels: THREE.Sprite[] = [];
  const label = (text: string, sub: string, hex: string, x: number, y: number, z: number, w = 7) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d')!;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = hex; g.shadowBlur = 24; g.fillStyle = '#fff7e6';
    g.font = '700 92px Georgia, serif'; g.fillText(text, 512, 104);
    g.shadowBlur = 10; g.fillStyle = hex; g.font = '600 46px Segoe UI, sans-serif'; g.fillText(sub, 512, 198);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteNodeMaterial({ map: t, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.set(w, w / 4, 1); s.position.set(x, y, z); s.name = 'sign label'; group.add(s); labels.push(s);
  };
  {
    const bridgeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const flow = fract(uv().y.mul(0.12).sub(time.mul(0.3)));
    const edge = smoothstep(float(0.36), float(0.5), uv().x.sub(0.5).abs());
    bridgeMat.colorNode = mix(cyan, gold, edge).mul(float(0.7).add(edge.mul(2.4)).add(smoothstep(float(0.88), float(1), flow).mul(1.6)));
    bridgeMat.opacityNode = float(0.16).add(edge.mul(0.55));
    const dests: { yaw: number; level: string; name: string; sub: string; hex: number; css: string }[] = [
      { yaw: -Math.PI / 2, level: 'elderwood', name: 'Elderwood Hollow', sub: 'the giant canopy', hex: 0x5cff9a, css: '#5cff9a' },
      { yaw: Math.PI / 2, level: 'volcanic', name: 'Emberfall Caldera', sub: 'the forge crater', hex: 0xff7a2a, css: '#ff9a4a' },
      { yaw: Math.PI, level: 'marsh', name: 'Sunken Cathedral', sub: 'the flooded ruin', hex: 0x48d8ff, css: '#7fe3ff' },
    ];
    for (const d of dests) {
      const dx = Math.sin(d.yaw), dz = Math.cos(d.yaw), side = new THREE.Vector3(dz, 0, -dx);
      const r0 = APO - 0.3, r1 = APO + BRIDGE + 0.3, mid = (r0 + r1) / 2;
      // the hard-light deck (a ribbon, walkable through an invisible slab) and its gold-lit rails
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(4, r1 - r0), bridgeMat); deck.rotation.set(-Math.PI / 2, 0, d.yaw); deck.position.set(dx * mid, 0.03, dz * mid);
      deck.name = 'rune bridge light'; group.add(deck);
      kit.box(B.invisible, 4, 0.3, r1 - r0, dx * mid, -0.15, dz * mid, d.yaw, { shadow: false });
      for (const s of [-1, 1]) {
        kit.box(B.invisible, 0.1, 1.3, r1 - r0, dx * mid + side.x * s * 2, 0.6, dz * mid + side.z * s * 2, d.yaw, { shadow: false });
        kit.box(glowGold, 0.06, 0.06, r1 - r0, dx * mid + side.x * s * 2, 1.0, dz * mid + side.z * s * 2, d.yaw, { solid: false, shadow: false, tpm: 1 });
        for (let t = r0 + 1; t < r1; t += 4) kit.box(goldMat, 0.12, 1.0, 0.12, dx * t + side.x * s * 2, 0.5, dz * t + side.z * s * 2, d.yaw, { solid: false, shadow: false, tpm: 1 });
      }
      // the portal platform: a small obsidian octagon with its own crag
      const pc = APO + BRIDGE + PORTAL_APO, px = dx * pc, pz = dz * pc;
      const po = octagon(PORTAL_APO / Math.cos(Math.PI / 8)).map(([x, z]) => [x + px, z + pz] as [number, number]);
      const pp = polyPrism(po, [], -1.6, 0); kit.add(obsidian, pp.top, { tpm: 0.2 }); kit.add(obsidian, pp.sides, { tpm: 0.3 });
      const pcrag = new THREE.ConeGeometry(PORTAL_APO * 1.05, 16, 8, 4, true); pcrag.rotateX(Math.PI); pcrag.rotateY(Math.PI / 8); pcrag.translate(px, -1.6 - 8, pz);
      kit.add(voidStone, pcrag, { tpm: 0.12, shadow: false });
      const pt = new THREE.TorusGeometry(PORTAL_APO / Math.cos(Math.PI / 8) - 0.2, 0.08, 4, 8); pt.rotateX(Math.PI / 2); pt.rotateY(Math.PI / 8); kit.place(pt, px, 0.05, pz); kit.add(goldMat, pt, { solid: false, shadow: false, tpm: 1 });
      // the portal arch: two obsidian piers and a pointed gold-banded arch, facing back along the bridge
      const ax = px + dx * 1.5, az = pz + dz * 1.5;
      for (const s of [-1, 1]) {
        kit.box(obsidian, 1.2, 7, 1.4, ax + side.x * s * 3.1, 3.5, az + side.z * s * 3.1, d.yaw, { tpm: 0.5 });
        kit.box(goldMat, 1.3, 0.2, 1.5, ax + side.x * s * 3.1, 7.05, az + side.z * s * 3.1, d.yaw, { tpm: 1, solid: false });
        const arm = new THREE.BoxGeometry(0.9, 3.6, 1.2); kit.place(arm, ax + side.x * s * 1.75, 8.4, az + side.z * s * 1.75, d.yaw, 0, s * 0.62); kit.add(obsidian, arm, { tpm: 0.5, solid: false });
      }
      const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const charge = uniform(0);
      {
        const d2 = uv().sub(vec2(0.5, 0.42)), rr = length(d2.mul(vec2(1, 0.75)));
        const waves = sin(rr.mul(26).sub(time.mul(3))).mul(0.5).add(0.5);
        pm.colorNode = color(d.hex).mul(float(0.6).add(waves.mul(0.8)).add(smoothstep(float(0.45), float(0), rr).mul(1.2)).add(charge.mul(2.5)));
        pm.opacityNode = smoothstep(float(0.6), float(0.45), rr).mul(0.8);
      }
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), pm); plane.position.set(ax, 4.5, az); plane.rotation.y = d.yaw; plane.name = 'portal light'; group.add(plane);
      const l = new THREE.PointLight(d.hex, lo ? 30 : 50, 18, 2); l.position.set(ax - dx * 2, 3.5, az - dz * 2); group.add(l);
      portals.push({ pos: new THREE.Vector3(ax, 0, az), radius: 2.4, level: d.level, name: d.name, charge });
      label(d.name.toUpperCase(), d.sub, d.css, ax - dx * 0.3, 11.2, az - dz * 0.3);
    }
  }

  // ── the Trial runes (VA-11): stand on one to start that trial ────────────────────────────────────────
  const trialPads: ModePad[] = [];
  {
    const modes: [ModeId, number, string][] = [['trials', -Math.PI / 2, 'Five rounds, against the clock'], ['survival', Math.PI / 6, 'Hold out three minutes'], ['boss', (5 * Math.PI) / 6, 'Hunt the champion']];
    for (const [mode, a, sub] of modes) {
      const x = Math.cos(a) * 10.5, z = Math.sin(a) * 10.5, hex = modeById(mode)!.hex, fill = uniform(0);
      kit.prism(obsidian, 16, 2.4, 2.5, 0.18, x, 0, z, 0, { tpm: 0.6 });
      const t = new THREE.TorusGeometry(2.45, 0.06, 4, 32); t.rotateX(Math.PI / 2); kit.place(t, x, 0.19, z); kit.add(goldMat, t, { solid: false, shadow: false, tpm: 1 });
      const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      {
        const tx = tslTexture(runeTex, uv());
        const d2 = uv().sub(0.5), ang = atan(d2.x.negate(), d2.y).div(6.2832).add(0.5), rr = length(d2).mul(2);
        const filled = smoothstep(fill.sub(0.002), fill, ang).oneMinus().mul(smoothstep(float(0.78), float(0.84), rr)).mul(smoothstep(float(1.0), float(0.94), rr));
        rm.colorNode = color(hex).mul(tx.a.mul(float(0.9).add(uBeatPulse.mul(0.6)).add(fill.mul(1.5)))).add(color(0xffffff).mul(filled.mul(1.6)));
      }
      const m = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), rm); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.2, z); m.name = 'trial rune decal'; group.add(m);
      trialPads.push({ pos: new THREE.Vector3(x, 0.18, z), radius: 2.0, mode, fill });
      label(modeById(mode)!.name.toUpperCase(), sub, hex, x, 3.4, z, 4.6);
    }
  }

  // ── hovering rune platforms over the ring, reached by jump pads (verticality) ─────────────────────────
  const jumpPads: JumpPad[] = [];
  const uPadFlash = uniform(0);
  const floaters: THREE.Vector3[] = [];
  {
    const padMat = new THREE.MeshBasicNodeMaterial(); padMat.colorNode = cyan.mul(float(1.3).add(uBeatPulse.mul(0.8)).add(uPadFlash.mul(3)));
    for (const s of [-1, 1]) {
      const fx = s * 13, fz = -13, fy = 6.2;
      const fo = octagon(3.4).map(([x, z]) => [x + fx, z + fz] as [number, number]);
      const fp = polyPrism(fo, [], fy - 0.8, fy); kit.add(obsidian, fp.top, { tpm: 0.2 }); kit.add(obsidian, fp.sides, { tpm: 0.3 });
      const under = new THREE.ConeGeometry(3.3, 4.5, 8, 2, true); under.rotateX(Math.PI); under.rotateY(Math.PI / 8); under.translate(fx, fy - 0.8 - 2.25, fz); kit.add(voidStone, under, { tpm: 0.2, shadow: false });
      const ft = new THREE.TorusGeometry(3.25, 0.06, 4, 8); ft.rotateX(Math.PI / 2); ft.rotateY(Math.PI / 8); kit.place(ft, fx, fy + 0.04, fz); kit.add(goldMat, ft, { solid: false, shadow: false, tpm: 1 });
      floaters.push(new THREE.Vector3(fx, fy, fz));
      // the pad on the floor below-inside, throwing you up onto it
      const px = s * 8.2, pz = -8.2;
      kit.prism(obsidian, 16, 1.3, 1.4, 0.2, px, 0, pz, 0, { tpm: 0.6 });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 28), padMat); disc.rotation.x = -Math.PI / 2; disc.position.set(px, 0.21, pz); group.add(disc);
      jumpPads.push({ name: 'rune lift', pos: new THREE.Vector3(px, 0.2, pz), radius: 1.1, to: new THREE.Vector3(fx - s * 0.8, fy + 0.1, fz + 0.8), apex: 2.2, flash: uPadFlash });
    }
  }

  // ── the Banished Archangel's perch (VA-05): chains from the monolith tops to a fractured crystal-winged core ──
  const coreAt = new THREE.Vector3(0, 34, -30);
  const wingMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1430, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 });
  wingMat.emissiveNode = mix(cyan, gold, sin(positionWorld.y.mul(0.4).add(time.mul(0.6))).mul(0.5).add(0.5)).mul(float(0.9).add(uBeatPulse.mul(0.7)));
  const perch = new THREE.Group(); perch.name = 'archangel perch'; group.add(perch);
  {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), glowGold); core.position.copy(coreAt); perch.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 6, 64), glowGold); halo.position.copy(coreAt).add(new THREE.Vector3(0, 3.2, 0)); halo.rotation.x = Math.PI / 2.3; perch.add(halo);
    const shard = new THREE.OctahedronGeometry(1, 0);
    const wing = new THREE.InstancedMesh(shard, wingMat, lo ? 28 : 56); wing.name = 'archangel crystal wing';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const per = wing.count / 2;
    for (let i = 0; i < wing.count; i++) {
      const s = i < per ? -1 : 1, k = (i % per) / per;                // fan from the core outward and up
      const fan = 0.15 + k * 1.25, len = 3 + (1 - Math.abs(k - 0.45)) * 7 + R() * 2;
      const dir = new THREE.Vector3(s * Math.cos(fan - 0.3), Math.sin(fan - 0.3) + 0.25, -0.15).normalize();
      const at = coreAt.clone().addScaledVector(dir, 3 + k * 9 + R() * 2);
      at.y += (R() - 0.5) * 1.5;                                      // fractured: shards drift out of line
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); e.setFromQuaternion(q); e.z += (R() - 0.5) * 0.3; q.setFromEuler(e);
      m4.compose(at, q, new THREE.Vector3(0.35 + R() * 0.3, len / 2, 0.12 + R() * 0.1));
      wing.setMatrixAt(i, m4);
    }
    perch.add(wing);
    // chains: links (alternating torus orientation) sagging from four monolith tops up to the core
    const link = new THREE.TorusGeometry(0.42, 0.11, 5, 10);
    const chainIdx = [0, 2, 5, 7], perLink = 0.75;
    let n = 0; const links: THREE.Matrix4[] = [];
    for (const ci of chainIdx) {
      const a = monoTops[ci], b = coreAt, mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -4, 0));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b), cnt = Math.floor(curve.getLength() / perLink);
      for (let i = 0; i < cnt; i++) {
        const p0 = curve.getPoint(i / cnt), p1 = curve.getPoint((i + 1) / cnt), dir = p1.clone().sub(p0).normalize();
        q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        if (i % 2) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        links.push(new THREE.Matrix4().compose(p0, q, new THREE.Vector3(1, 1, 1))); n++;
      }
    }
    const chains = new THREE.InstancedMesh(link, goldMat, n); chains.name = 'archangel chains vfx';
    links.forEach((m, i) => chains.setMatrixAt(i, m));
    perch.add(chains);
    perch.traverse((o) => { o.userData.noCollide = true; });
    const cl = new THREE.PointLight(0xffd27a, lo ? 60 : 120, 40, 2); cl.position.copy(coreAt).add(new THREE.Vector3(0, -3, 0)); group.add(cl);
  }

  // ── debris and floating void stones round the rim ──────────────────────────────────────────────────
  for (let i = 0; i < (lo ? 18 : 40); i++) {
    const a = R() * Math.PI * 2, rr = R_OCT + 6 + R() * 50, y = -18 + R() * 40;
    if (Math.abs(Math.sin(a)) < 0.25 || Math.abs(Math.cos(a)) < 0.25) continue; // keep the bridges' lines clear
    const b = boulder(0.6 + R() * R() * 3.5, 700 + i, 2);
    kit.place(b, Math.cos(a) * rr, y, Math.sin(a) * rr, R() * 6, R(), R());
    kit.add(voidStone, b, { solid: false, shadow: false, tpm: 0.3 });
  }

  kit.build(group);

  // ── the Void: rift sky, violet fog, god rays, floating embers (VA-08) ─────────────────────────────────
  {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#05030c'); grad.addColorStop(0.45, '#1a0d33'); grad.addColorStop(0.55, '#24123f'); grad.addColorStop(1, '#030208');
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * 2048, y = 180 + Math.random() * 640, r = 60 + Math.random() * 240, hue = [268, 285, 300, 200, 40][Math.floor(Math.random() * 5)];
      const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `hsla(${hue} 70% ${28 + Math.random() * 25}% / ${0.04 + Math.random() * 0.07})`); cg.addColorStop(1, 'hsla(270 60% 20% / 0)');
      g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the rift: a jagged bright tear behind the Archangel (north = the texture's middle)
    { const bx = 1024; g.save(); g.shadowColor = '#c9a6ff'; g.shadowBlur = 60; g.strokeStyle = 'rgba(240,228,255,0.95)'; g.lineWidth = 7; g.beginPath(); let y = 140; g.moveTo(bx, y);
      while (y < 760) { y += 30 + Math.random() * 40; g.lineTo(bx + (Math.random() - 0.5) * 70, y); } g.stroke(); g.lineWidth = 22; g.globalAlpha = 0.25; g.stroke(); g.restore();
      const hg = g.createLinearGradient(bx - 260, 0, bx + 260, 0); hg.addColorStop(0, 'rgba(150,100,255,0)'); hg.addColorStop(0.5, 'rgba(180,130,255,0.28)'); hg.addColorStop(1, 'rgba(150,100,255,0)'); g.fillStyle = hg; g.fillRect(bx - 260, 100, 520, 720); }
    for (let i = 0; i < 2800; i++) { g.fillStyle = `rgba(235,228,255,${0.2 + Math.random() * 0.8})`; const s = Math.random() * 1.8 + 0.3; g.fillRect(Math.random() * 2048, Math.random() * 1024, s, s); }
    const sky = new THREE.CanvasTexture(c); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.7;
  }
  scene.fog = new THREE.FogExp2(0x1c1036, 0.0065);
  const key = new THREE.DirectionalLight(0xe6dcff, 2.2);
  key.position.set(-30, 90, -50); key.castShadow = !lo; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 220 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.05;
  const rim = new THREE.DirectionalLight(0x9b5cff, 1.4); rim.position.set(60, 20, 80);
  const gateLight = new THREE.PointLight(0xa06bff, lo ? 60 : 110, 30, 2); gateLight.position.set(0, 5.8, 1.5);
  group.add(key, key.target, rim, gateLight, new THREE.HemisphereLight(0x8a78c8, 0x180c2c, 1.6));
  // god rays: soft additive shafts slanting down onto the platform
  const rayMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  rayMat.colorNode = color(0xc8b4ff); rayMat.opacityNode = uv().y.mul(0.05);
  for (const [x, z, r, t] of lo ? [[-6, -4, 6, 0.25]] : [[-6, -4, 6, 0.25], [9, 6, 4, -0.2], [-12, 10, 3.5, 0.15]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r, 60, 20, 1, true), rayMat); m.position.set(x, 30, z); m.rotation.set(t, 0, t * 0.6); m.name = 'god ray'; group.add(m);
  }
  const EN = lo ? 300 : 900, ep = new Float32Array(EN * 3);
  for (let i = 0; i < EN; i++) ep.set([(Math.random() - 0.5) * 120, -20 + Math.random() * 60, (Math.random() - 0.5) * 120], i * 3);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const em = new THREE.PointsNodeMaterial({ size: 0.1, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  em.colorNode = mix(gold, violet, sin(positionWorld.x.mul(0.7)).mul(0.5).add(0.5)).mul(2.2);
  const embers = new THREE.Points(eg, em); embers.frustumCulled = false; embers.name = 'void embers particle'; group.add(embers);

  scene.add(group);

  const enemySpots: THREE.Vector3[] = [];
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? 13 : 19.5; enemySpots.push(new THREE.Vector3(Math.cos(a) * rr, 0.2, Math.sin(a) * rr)); }
  enemySpots.push(...floaters.map((f) => f.clone().setY(f.y + 0.2)));
  const info: LevelInfo = { id: 'void-sanctum', name: 'Void Sanctum', track: 'main', accentHex: 0x9b5cff };
  let elapsed = 0;
  return {
    group, uBeatPulse, gates: [], traps: [], biomeIndex: 0, info,
    spawns: { a: { pos: new THREE.Vector3(0, 0.2, 18.5), yaw: 0 }, b: { pos: new THREE.Vector3(0, 0.2, -18.5), yaw: Math.PI } },
    enemySpots,
    hazardBelow: -6,
    jumpPads, portals, trialPads,
    hub: true,
    setBiome() { return { name: info.name, track: info.track }; },
    update(dt, pulse) {
      elapsed += dt; uBeatPulse.value = pulse;
      uGate.value = 0.5 + Math.sin(elapsed * 0.9) * 0.5;
      energyRings.forEach((r, i) => { r.position.y += Math.sin(elapsed * 1.3 + i) * dt * 0.6; r.rotation.z = elapsed * 0.4 * (i % 2 ? 1 : -1); r.scale.setScalar(1 + pulse * 0.08); });
      perch.position.y = Math.sin(elapsed * 0.35) * 0.8; perch.rotation.y = Math.sin(elapsed * 0.1) * 0.06;
      const p = eg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < EN; i++) { let y = p.getY(i) + dt * (0.5 + (i % 4) * 0.25); if (y > 40) y = -20; p.setY(i, y); }
      p.needsUpdate = true;
      for (const s of labels) s.material.opacity = 0.85 + Math.sin(elapsed * 2) * 0.1;
    },
    resolveDynamicGates() { /* none */ },
  };
}

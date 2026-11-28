// Milestone 3: High-energy playable 3D Set-Pieces!
// - Act 3B: Deep Archive Mine-Cart Escape (S23-S30, S50): Word/Math rail track switches,
//           molten lava chasm jumps, falling stalactite dodges -> cliffside waterfall plunge!
// - Act 4A: Forest Rapids Run (S01, S17, S31, S32, S54): Raven's Bend -> Whitewater Chute ->
//           Boulder Choke -> Deadman's Reef -> Cave Overlook -> Riverbank Wreck -> Wilds!
import * as THREE from 'three/webgpu';
import { mat, mesh, PAL, surface, textSprite } from './world';
import type { PadGlyphs } from './gamepad';

export interface SetPieceHUD {
  title: string;
  landmark: string;
  progress: number; // 0..1
  prompt?: { text: string; leftLabel: string; rightLabel: string; urgency: number } | null;
  hint: string;
}

export interface SetPieceCallbacks {
  onDamage: (n: number, reason: string) => void;
  onWordBonus: (word: string) => void;
  onComplete: (nextLevel: 'rapids' | 'wilds') => void;
  onSfx: (name: 'railSwitch' | 'splash' | 'hit' | 'rescue' | 'lasso' | 'wrong') => void;
  onHud: (hud: SetPieceHUD | null) => void;
}

export interface SetPieceInput {
  left: boolean;
  right: boolean;
  /** Continuous analog steering (-1..+1) from controller stick or keys. */
  steer?: number;
  jump: boolean;
  duck: boolean;
  strike: boolean;
  lasso: boolean;
  pad?: PadGlyphs | null;
}

export interface SetPieceRunner {
  readonly kind: 'minecart' | 'rapids';
  readonly group: THREE.Group;
  update(
    dt: number, t: number,
    input: SetPieceInput,
    camera: THREE.PerspectiveCamera,
  ): void;
  dispose(scene: THREE.Scene): void;
}

// ── ACT 3B: DEEP ARCHIVE MINE-CART ESCAPE (S23–S30, S50) ─────────────────────────────────────────
interface RailSwitch {
  z: number;
  prompt: string;
  leftLabel: string;
  rightLabel: string;
  correct: 'left' | 'right';
  rewardWord: string;
  resolved: boolean;
  chosen?: 'left' | 'right';
}

export function startMineCartRun(scene: THREE.Scene, cb: SetPieceCallbacks): SetPieceRunner {
  const group = new THREE.Group();
  group.name = 'lexicon.minecart';
  const rockMat = surface('medieval_blocks_02', [4, 2], 0x4f4b44);
  const timber = surface('dark_wooden_planks', [2, 2]);
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff5a18, emissive: 0xff3b00, emissiveIntensity: 2.3, roughness: 0.4 });

  const TRACK_LEN = 520;
  // Tunnel walls, arched wooden rafters, iron rails & glowing crystal/torch accents
  for (let z = 0; z > -TRACK_LEN; z -= 14) {
    const isLavaGap = (z < -170 && z > -210) || (z < -345 && z > -382);
    if (!isLavaGap) {
      group.add(mesh(new THREE.BoxGeometry(10, 1, 14.5), rockMat, 0, -0.5, z - 7, false));
    } else {
      // Glowing molten lava chasm below broken bridge rails (S28!)
      group.add(mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), lavaMat, 0, -5.5, z - 7, false));
    }
    for (const sx of [-1, 1]) {
      group.add(mesh(new THREE.BoxGeometry(2.2, 9.5, 14.5), rockMat, sx * 6.0, 4.2, z - 7, false));
      group.add(mesh(new THREE.BoxGeometry(0.42, 8.2, 0.42), timber, sx * 4.5, 4.0, z, false));
    }
    group.add(mesh(new THREE.BoxGeometry(10, 0.5, 0.5), timber, 0, 8.2, z, false));
    group.add(mesh(new THREE.BoxGeometry(14.4, 1.2, 14.5), rockMat, 0, 8.85, z - 7, false));
    // Hanging amber mine lantern every 28 m
    if (Math.abs(z) % 28 === 0) {
      group.add(mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), mat(0xffcf70, 0xffa838), 0, 7.6, z, false));
    }
  }
  // Iron rails (with visible gaps over the two lava jumps!)
  const lavaJumps = [{ z: -190, jumped: false }, { z: -364, jumped: false }];
  for (let z = 4; z > -TRACK_LEN; z -= 4) {
    const gap = lavaJumps.some((g) => Math.abs(z - g.z) < 7);
    if (gap) continue;
    for (const rx of [-0.75, 0.75]) {
      group.add(mesh(new THREE.BoxGeometry(0.1, 0.14, 4.1), mat(0x6e737d), rx, 0.08, z, false));
    }
    group.add(mesh(new THREE.BoxGeometry(2.1, 0.1, 0.28), timber, 0, 0.03, z, false));
  }
  // Bright sunlit cliff-exit waterfall mouth at the end of the line (S30!)
  group.add(mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshBasicMaterial({ color: 0xbde8f5 }), 0, 5, -TRACK_LEN - 2, false));

  // Four Word / Math Track Switch Junctions (S23!)
  const switches: RailSwitch[] = [
    { z: -95, prompt: 'TRACK SWITCH · 7 × 8 = ?', leftLabel: '56', rightLabel: '54', correct: 'left', rewardWord: 'BRIDGE', resolved: false },
    { z: -240, prompt: 'TRACK SWITCH · Spell correctly', leftLabel: 'CRISTAL', rightLabel: 'CRYSTAL', correct: 'right', rewardWord: 'CRYSTAL', resolved: false },
    { z: -315, prompt: 'TRACK SWITCH · 144 ÷ 12 = ?', leftLabel: '12', rightLabel: '14', correct: 'left', rewardWord: 'PRISM', resolved: false },
    { z: -445, prompt: 'TRACK SWITCH · Weight of CAT (3+1+20)', leftLabel: '22', rightLabel: '24', correct: 'right', rewardWord: 'THUNDER', resolved: false },
  ];
  for (const sw of switches) {
    // Glowing cyan/gold track-switch arch & sign
    group.add(mesh(new THREE.TorusGeometry(4.2, 0.18, 8, 20, Math.PI), mat(PAL.cyan, 0x3adce8), 0, 0.5, sw.z, false));
    const lbl = textSprite('⇄ SWITCH', { size: 48, scale: 0.9, color: '#b1f9f6', bg: 'rgba(12,24,36,.8)' });
    lbl.position.set(0, 5.2, sw.z); group.add(lbl);
  }
  for (const lj of lavaJumps) {
    const lbl = textSprite('▲ JUMP LAVA [Space] ▲', { size: 52, scale: 0.95, color: '#ffcf70', bg: 'rgba(40,12,6,.82)' });
    lbl.position.set(0, 4.2, lj.z + 10); group.add(lbl);
  }

  // Player's wooden Archive Mine-Cart + headlamp
  const cart = new THREE.Group();
  cart.add(mesh(new THREE.BoxGeometry(1.7, 1.0, 2.3), timber, 0, 0.75, 0));
  cart.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat(PAL.navy), 0, 1.45, 0.2)); // Scribe silhouette in cart
  cart.add(mesh(new THREE.BoxGeometry(0.32, 0.32, 0.28), mat(0xffe088, 0xffc040), 0, 1.35, -1.15, false));
  const headLight = new THREE.PointLight(0xffcf7a, 95, 42, 1.3);
  headLight.position.set(0, 2.0, -2.5);
  cart.add(headLight);
  group.add(cart);

  scene.add(group);
  scene.background = new THREE.Color(0x0c0a0d);
  scene.fog = new THREE.Fog(0x0d0b10, 14, 72);

  let zPos = 0;
  let speed = 15.5;
  let yVel = 0;
  let yPos = 0;
  let lean = 0;
  let laneX = 0;
  let finished = false;

  return {
    kind: 'minecart',
    group,
    update(dt, t, inp, camera) {
      if (finished) return;
      zPos -= speed * dt;
      speed = Math.min(20.5, speed + dt * 0.16);

      // Jump across molten lava chasms (S28)
      if (inp.jump && yPos <= 0.05) {
        yVel = 10.5;
        cb.onSfx('railSwitch');
      }
      yPos += yVel * dt;
      yVel -= 24 * dt;
      if (yPos < 0) { yPos = 0; yVel = 0; }

      // Lean & choose switches
      const wantLean = inp.steer !== undefined && Math.abs(inp.steer) > 0.1
        ? inp.steer
        : (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
      lean += (wantLean - lean) * Math.min(1, dt * 10);
      const pad = inp.pad;

      let activePrompt: SetPieceHUD['prompt'] = null;
      for (const sw of switches) {
        if (sw.resolved) continue;
        const dist = zPos - sw.z; // positive while approaching
        if (dist < 44 && dist > 0) {
          if (inp.left || (inp.steer ?? 0) < -0.45) {
            if (sw.chosen !== 'left') cb.onSfx('railSwitch');
            sw.chosen = 'left';
          } else if (inp.right || (inp.steer ?? 0) > 0.45) {
            if (sw.chosen !== 'right') cb.onSfx('railSwitch');
            sw.chosen = 'right';
          }
          const selL = sw.chosen === 'left' ? '▶ ' : '';
          const selR = sw.chosen === 'right' ? '▶ ' : '';
          const lKey = pad ? `${pad.lb} / ${pad.dpadLeft}` : 'A';
          const rKey = pad ? `${pad.rb} / ${pad.dpadRight}` : 'D';
          activePrompt = {
            text: sw.prompt,
            leftLabel: `${selL}[${lKey}] ${sw.leftLabel}`,
            rightLabel: `${selR}[${rKey}] ${sw.rightLabel}`,
            urgency: 1 - dist / 44,
          };
        } else if (dist <= 0) {
          sw.resolved = true;
          const pick = sw.chosen ?? (laneX < 0 ? 'left' : 'right');
          if (pick === sw.correct) {
            cb.onSfx('rescue');
            cb.onWordBonus(sw.rewardWord);
            speed = Math.min(22, speed + 1.4);
          } else {
            cb.onSfx('wrong');
            cb.onDamage(1, 'Wrong rail switch! The cart clips a rockfall barrier.');
          }
        }
      }

      // Check molten lava chasm jumps
      for (const lj of lavaJumps) {
        if (!lj.jumped && Math.abs(zPos - lj.z) < 4.5) {
          lj.jumped = true;
          if (yPos < 0.7) {
            cb.onSfx('hit');
            cb.onDamage(1, 'Scorched over the lava chasm! Press [Space] earlier to leap!');
            yVel = 7;
          } else {
            cb.onSfx('rescue');
          }
        }
      }

      laneX += (lean * 1.4 - laneX) * Math.min(1, dt * 6);
      cart.position.set(laneX * 0.45, yPos + Math.sin(t * 28) * 0.04, zPos);
      cart.rotation.z = -lean * 0.18;
      cart.rotation.x = yVel * 0.03;

      camera.position.set(cart.position.x * 0.7, cart.position.y + 3.4, zPos + 7.2);
      camera.lookAt(cart.position.x * 0.4, cart.position.y + 1.5, zPos - 18);

      const prog = Math.min(1, Math.abs(zPos) / TRACK_LEN);
      cb.onHud({
        title: 'DEEP ARCHIVE MINE-CART ESCAPE',
        landmark: prog < 0.35 ? 'Junction 01 · Crystal Tunnels' : prog < 0.7 ? 'Thermal Lava Chasm & Trestle Bridge' : 'Cliff Waterfall Exit!',
        progress: prog,
        prompt: activePrompt,
        hint: pad
          ? `[${pad.move} / ${pad.lb}·${pad.rb}] Throw Word/Math Rail Switch  ·  [${pad.confirm}] Jump Lava Chasms`
          : '[A]/[D] Throw Word/Math Rail Switch  ·  [Space] Jump Lava Chasms',
      });

      if (Math.abs(zPos) >= TRACK_LEN) {
        finished = true;
        cb.onSfx('splash');
        cb.onHud(null);
        cb.onComplete('rapids');
      }
    },
    dispose(sc) {
      sc.remove(group);
      cb.onHud(null);
    },
  };
}

// ── ACT 4A: FOREST RAPIDS RUN (S01, S17, S31, S32, S54) ──────────────────────────────────────────
interface RiverHazard {
  z: number;
  kind: 'boulder' | 'log_ramp' | 'low_trunk' | 'ambush';
  lane: number; // -1, 0, 1
  cleared: boolean;
  mesh: THREE.Object3D;
}

export function startRapidsRun(scene: THREE.Scene, cb: SetPieceCallbacks): SetPieceRunner {
  const group = new THREE.Group();
  group.name = 'lexicon.rapids';
  const RIVER_LEN = 540;
  const rockMat = surface('medieval_blocks_02', [3, 2], 0x6f6e66);
  const barkMat = surface('dark_wooden_planks', [2, 2], 0x5c4a34);
  const bankMat = surface('forest_ground_04', [5, 5], 0x4b5c34);

  // Rushing turquoise whitewater channel & towering canyon pine banks (S54 layout!)
  const waterTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2d768a'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 65; i++) {
      g.fillStyle = i % 3 === 0 ? 'rgba(235,250,255,0.55)' : 'rgba(120,210,225,0.35)';
      g.fillRect((i * 23) % 120, (i * 37) % 240, 4 + (i % 5), 24 + (i % 20));
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 40);
    return t;
  })();
  const river = mesh(new THREE.PlaneGeometry(18, RIVER_LEN + 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: waterTex }), 0, 0, -RIVER_LEN / 2, false);
  group.add(river);

  for (let z = 10; z > -RIVER_LEN - 20; z -= 18) {
    for (const sx of [-1, 1]) {
      const h = 7 + (Math.abs(z * 13) % 9);
      group.add(mesh(new THREE.BoxGeometry(12, h, 18.5), bankMat, sx * 14.5, h / 2 - 1, z, false));
      // Tall canyon pine silhouettes
      group.add(mesh(new THREE.ConeGeometry(2.6, 11, 7), mat(0x2d4226), sx * (12 + (Math.abs(z) % 4)), h + 3.8, z, false));
    }
  }

  // Build canyon river hazards & the 3 Shoreline Ambush Points from S54!
  const hazards: RiverHazard[] = [];
  const laneXOf = (lane: number) => lane * 4.4;
  const layout: { z: number; kind: RiverHazard['kind']; lane: number }[] = [
    { z: -65, kind: 'boulder', lane: 0 },
    { z: -110, kind: 'ambush', lane: -1 },       // Ambush Point 01: Raven's Bend High Ridge (S54)
    { z: -155, kind: 'log_ramp', lane: 0 },      // Fallen mossy log ramp — Jump! (S32)
    { z: -200, kind: 'boulder', lane: -1 },
    { z: -215, kind: 'boulder', lane: 1 },       // Boulder Choke (S54)
    { z: -265, kind: 'low_trunk', lane: 0 },     // Low fallen trunk — Duck! (S32)
    { z: -315, kind: 'ambush', lane: 1 },        // Ambush Point 02: Deadman's Reef Bluff (S54)
    { z: -370, kind: 'log_ramp', lane: 0 },
    { z: -425, kind: 'ambush', lane: 0 },        // Ambush Point 03: Cave Overlook Choke (S54)
    { z: -480, kind: 'low_trunk', lane: 0 },
  ];

  for (const h of layout) {
    let obj: THREE.Object3D;
    if (h.kind === 'boulder') {
      obj = mesh(new THREE.DodecahedronGeometry(2.1, 1), rockMat, laneXOf(h.lane), 1.0, h.z);
    } else if (h.kind === 'log_ramp') {
      const log = mesh(new THREE.CylinderGeometry(0.65, 0.75, 16, 10).rotateZ(Math.PI / 2), barkMat, 0, 0.55, h.z);
      const lbl = textSprite('▲ LOG RAMP [Space] ▲', { size: 46, scale: 0.85, color: '#b1f9f6', bg: 'rgba(16,32,26,.78)' });
      lbl.position.set(0, 2.8, h.z); group.add(lbl);
      obj = log;
    } else if (h.kind === 'low_trunk') {
      const log = mesh(new THREE.CylinderGeometry(0.6, 0.7, 17, 10).rotateZ(Math.PI / 2), barkMat, 0, 2.35, h.z);
      const lbl = textSprite('▼ LOW TRUNK — DUCK [S] ▼', { size: 46, scale: 0.85, color: '#ffe08a', bg: 'rgba(32,24,12,.78)' });
      lbl.position.set(0, 4.1, h.z); group.add(lbl);
      obj = log;
    } else {
      // Ink Hushling shoreline ambush leaps onto the rapids (S17 / S40)
      const g = new THREE.Group();
      g.add(mesh(new THREE.ConeGeometry(0.85, 2.2, 10), mat(PAL.ink), 0, 1.3, 0));
      g.add(mesh(new THREE.BoxGeometry(0.75, 0.14, 0.1), mat(0xf4f1ea), 0, 1.85, 0.55, false));
      const lbl = textSprite('⚔ HUSHLING AMBUSH — STRIKE [J] / LASSO [C]', { size: 44, scale: 0.85, color: '#ffd98a', bg: 'rgba(18,16,24,.82)' });
      lbl.position.set(0, 3.2, 0); g.add(lbl);
      g.position.set(laneXOf(h.lane), 0.2, h.z);
      obj = g;
    }
    group.add(obj);
    hazards.push({ ...h, cleared: false, mesh: obj });
  }

  // Lashed timber river raft (Lexicon adaptation of S17 / S31 / S32)
  const raft = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    raft.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.1, 8).rotateX(Math.PI / 2), barkMat, i * 0.44, 0.22, 0));
  }
  const scribeFig = mesh(new THREE.CapsuleGeometry(0.32, 0.85, 6, 10), mat(PAL.navy), 0, 1.05, 0.2);
  const staff = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8), mat(PAL.brass, 0x3a2800), 0.48, 1.15, -0.35);
  raft.add(scribeFig, staff);
  group.add(raft);

  scene.add(group);
  scene.background = new THREE.Color(0x9fc0ce);
  scene.fog = new THREE.Fog(0xbfd3d6, 22, 115);

  let zPos = 0;
  let xPos = 0;
  let yPos = 0;
  let yVel = 0;
  let duckT = 0;
  let finished = false;
  const speed = 15.5;

  return {
    kind: 'rapids',
    group,
    update(dt, t, inp, camera) {
      if (finished) return;
      zPos -= speed * dt;
      waterTex.offset.y = -(t * 2.4) % 1;

      const pad = inp.pad;
      const steer = inp.steer !== undefined && Math.abs(inp.steer) > 0.08
        ? inp.steer
        : (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      xPos = Math.max(-6.2, Math.min(6.2, xPos + steer * 11.5 * dt));

      if (inp.jump && yPos <= 0.05) { yVel = 10.0; cb.onSfx('splash'); }
      yPos += yVel * dt; yVel -= 25 * dt;
      if (yPos < 0) { yPos = 0; yVel = 0; }
      if (inp.duck) duckT = 0.45;
      duckT = Math.max(0, duckT - dt);

      scribeFig.scale.y = duckT > 0 ? 0.48 : 1.0;
      scribeFig.position.y = duckT > 0 ? 0.65 : 1.05;
      raft.position.set(xPos, yPos + Math.sin(t * 9) * 0.09, zPos);
      raft.rotation.z = -steer * 0.16;

      let activePrompt: SetPieceHUD['prompt'] = null;
      for (const h of hazards) {
        if (h.cleared) continue;
        const dist = zPos - h.z;
        if (h.kind === 'ambush' && dist < 24 && dist > -3) {
          activePrompt = {
            text: 'SHORELINE HUSHLING BOARDING!',
            leftLabel: pad ? `[${pad.strike}] Quill Sweep` : '[J] Quill Sweep',
            rightLabel: pad ? `[${pad.rb}/${pad.lyre}] Word Lasso` : '[C] Word Lasso',
            urgency: 1 - Math.max(0, dist) / 24,
          };
          if (inp.strike || inp.lasso) {
            h.cleared = true;
            h.mesh.visible = false;
            cb.onSfx(inp.lasso ? 'lasso' : 'hit');
            cb.onWordBonus('RAPIDS');
          }
        }
        if (dist <= 1.2) {
          h.cleared = true;
          if (h.kind === 'boulder' && Math.abs(xPos - laneXOf(h.lane)) < 2.6 && yPos < 1.2) {
            cb.onSfx('hit'); cb.onDamage(1, 'Scraped a canyon boulder!');
          } else if (h.kind === 'log_ramp' && yPos < 0.7) {
            cb.onSfx('hit'); cb.onDamage(1, 'Hit the fallen log! Press [Space] to ramp over it!');
          } else if (h.kind === 'low_trunk' && duckT <= 0) {
            cb.onSfx('hit'); cb.onDamage(1, 'Clipped the low trunk! Hold [S] to duck!');
          } else if (h.kind === 'ambush') {
            cb.onSfx('wrong'); cb.onDamage(1, 'A Hushling leapt onto the raft!');
          } else {
            cb.onSfx('splash');
          }
        }
      }

      camera.position.set(xPos * 0.65, yPos + 4.4, zPos + 9.2);
      camera.lookAt(xPos * 0.5, yPos + 1.2, zPos - 22);

      const prog = Math.min(1, Math.abs(zPos) / RIVER_LEN);
      const landmark =
        prog < 0.2 ? "Raven's Bend" :
        prog < 0.42 ? 'The Whitewater Chute & Boulder Choke' :
        prog < 0.65 ? "Deadman's Reef Ambush" :
        prog < 0.85 ? 'Cave Overlook Rapids' : 'Misty Waterfall Drop → Riverbank Landing!';

      cb.onHud({
        title: 'FOREST RAPIDS RUN',
        landmark,
        progress: prog,
        prompt: activePrompt,
        hint: pad
          ? `[${pad.move}] Steer  ·  [${pad.confirm}] Jump Log Ramps  ·  [${pad.cancel}/${pad.dpadDown}] Duck Trunks  ·  [${pad.strike}/${pad.rb}] Repel Hushlings`
          : '[A]/[D] Steer  ·  [Space] Jump Log Ramps  ·  [S] Duck Trunks  ·  [J]/[C] Repel Hushlings',
      });

      if (Math.abs(zPos) >= RIVER_LEN) {
        finished = true;
        cb.onSfx('splash');
        cb.onHud(null);
        cb.onComplete('wilds');
      }
    },
    dispose(sc) {
      sc.remove(group);
      cb.onHud(null);
    },
  };
}

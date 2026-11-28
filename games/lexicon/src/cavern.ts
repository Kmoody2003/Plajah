// Act 2 & 3: Behind-the-Veil Bioluminescent Crystal Grotto & Deep Archive Vaults (lexicon.cavern)
// Inspired by S00, S02, S06, S07, S10, S19, S20, S21, S34, S45, S46, S48, S50-S53:
// - Behind-the-waterfall entrance looking back out to sunlit Glossa Hollow (S02)
// - 5 Playable Word + Plajah Academia Math/Physics Chambers:
//   1. Sunken Rune-Tile Word/Sum Lock (S45, S52)
//   2. Great Waterwheel & Gear-Ratio Sluice Hall (S46, S48)
//   3. Hall of Reflections: live 3D rotating bronze mirrors & golden sunbeam (S21)
//   4. Hanging Word-Weight Counterweight Pulley Vault (S00)
//   5. Molten Lava Pendulum & Dart Bridge — slowed by singing TIME (S06, S34)
// - Staging Depot with Wooden Archive Mine-Cart launching Act 3B (S50)
import * as THREE from 'three/webgpu';
import {
  mat, mesh, motes, PAL, surface, textSprite,
  type Box, type BuiltLevel, type Circle, type Gate, type HazardZone, type LevelPortal, type WorldInteractable,
} from './world';
import type { GrappleAnchor } from './lasso';

export interface CavernCallbacks {
  hasPuzzle: (id: string) => boolean;
  completePuzzle: (id: string, rewardWord: string, storyLine: string) => void;
  openAcademiaQuiz: (opts: {
    id: string;
    kind: string;
    prompt: string;
    sub: string;
    choices: string[];
    answer: number;
    onPass: () => void;
  }) => void;
  toast: (title: string, sub?: string) => void;
  playSfx: (name: 'mirror' | 'gate' | 'rescue' | 'open') => void;
}

export function buildCavern(cb: CavernCallbacks): BuiltLevel {
  const group = new THREE.Group();
  group.name = 'lexicon.cavern';
  const circles: Circle[] = [];
  const boxes: Box[] = [];
  const gates = new Map<string, Gate>();
  const interactables: WorldInteractable[] = [];
  const grappleAnchors: GrappleAnchor[] = [];
  const hazards: HazardZone[] = [];
  const torches: THREE.PointLight[] = [];

  const rockMat = surface('medieval_blocks_02', [4, 3], 0x5c6066);
  const floorMat = surface('cobblestone_floor_04', [4, 4], 0x545960);
  const timber = surface('dark_wooden_planks', [2, 2]);
  const crystalMat = mat(PAL.cyan, 0x38d8e6);
  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0xff5a18, emissive: 0xff3b00, emissiveIntensity: 2.2, roughness: 0.4,
  });

  const addFloor = (x1: number, x2: number, z1: number, z2: number, y = 0) => {
    const w = x2 - x1, d = Math.abs(z2 - z1);
    group.add(mesh(new THREE.BoxGeometry(w, 1.2, d), floorMat, (x1 + x2) / 2, y - 0.6, (z1 + z2) / 2, false));
  };
  const addWall = (x1: number, z1: number, x2: number, z2: number, h = 11) => {
    const w = Math.max(1.2, Math.abs(x2 - x1)), d = Math.max(1.2, Math.abs(z2 - z1));
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    group.add(mesh(new THREE.BoxGeometry(w, h, d), rockMat, cx, h / 2 - 0.5, cz));
    boxes.push({ minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2 });
  };
  const addCrystals = (x: number, y: number, z: number, scale = 1) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const sp = mesh(new THREE.OctahedronGeometry(0.35 * scale), crystalMat, (i - 1.5) * 0.28 * scale, (0.6 + (i % 2) * 0.4) * scale, (i % 3 - 1) * 0.2 * scale, false);
      sp.scale.set(0.45, 2.2, 0.45);
      sp.rotation.z = (i - 1.5) * 0.24;
      g.add(sp);
    }
    g.position.set(x, y, z);
    group.add(g);
  };
  const addGate = (id: string, z: number, halfW = 3.2, color = 0x5c6f7e) => {
    const obj = new THREE.Group(); obj.userData.dynamic = true;
    for (let i = -2; i <= 2; i++) {
      obj.add(mesh(new THREE.BoxGeometry(0.28, 6.2, 0.28), mat(color, 0x162b38), i * (halfW * 0.42), 3.1, z));
    }
    obj.add(mesh(new THREE.BoxGeometry(halfW * 2 + 0.6, 0.5, 0.45), mat(PAL.brass, 0x443200), 0, 5.9, z));
    group.add(obj);
    const box: Box = { minx: -halfW, maxx: halfW, minz: z - 0.6, maxz: z + 0.6 };
    boxes.push(box);
    const g: Gate = { id, obj, box, open: false };
    gates.set(id, g);
    if (cb.hasPuzzle(id)) { g.open = true; g.box.off = true; g.obj.visible = false; }
    return g;
  };
  const unlockGate = (id: string) => {
    const g = gates.get(id);
    if (!g || g.open) return;
    g.open = true; g.box.off = true; g.obj.visible = false;
    cb.playSfx('gate');
  };

  // ── ZONE 0: Behind-the-Veil Entrance (z: +16 to -10, S02) ──
  addFloor(-11, 11, 16, -10);
  addWall(-11, 16, -11, -10);
  addWall(11, 16, 11, -10);
  // Translucent sunlit waterfall curtain behind the player looking back out to Glossa Hollow (S02!)
  const veilCurtain = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 12),
    new THREE.MeshBasicMaterial({ color: 0xdff7ff, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
  );
  veilCurtain.position.set(0, 5.5, 15.8); veilCurtain.userData.dynamic = true;
  group.add(veilCurtain);
  const sunlitVista = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 14),
    new THREE.MeshBasicMaterial({ color: 0xaed4df }),
  );
  sunlitVista.position.set(0, 6, 17.2);
  group.add(sunlitVista);
  const backSign = textSprite('← Return to Glossa Hollow', { size: 38, scale: 0.36, color: '#fff3c4', bg: 'rgba(18,28,42,.72)' });
  backSign.position.set(0, 4.4, 15.2); group.add(backSign);
  // Enclosed rock cavern ceiling across all vaults (leaves sunlit sky aperture open over the Hall of Reflections z:-84..-96!)
  group.add(mesh(new THREE.BoxGeometry(32, 1.4, 98), rockMat, 0, 10.6, -33, false));
  group.add(mesh(new THREE.BoxGeometry(32, 1.4, 90), rockMat, 0, 10.6, -141, false));
  addCrystals(-9.5, 0, 8, 1.5); addCrystals(9.5, 0, 6, 1.8); addCrystals(-8.5, 0, -4, 1.4); addCrystals(8.5, 0, -6, 1.6);

  // ── CHAMBER 1: Sunken Rune-Tile Vault (z: -10 to -38, S45 & S52) ──
  addFloor(-14, 14, -10, -38);
  addWall(-14, -10, -14, -38); addWall(14, -10, 14, -38);
  addWall(-14, -38, -3.5, -38); addWall(3.5, -38, 14, -38);
  // Sunken turquoise crystal water flanking the carved tile dais (S52)
  group.add(mesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b6a7a, transparent: true, opacity: 0.72 }), 0, -0.35, -24, false));
  // 3x3 Carved Rune Tile Grid (S45)
  const tileDais = new THREE.Group(); tileDais.userData.dynamic = true;
  const tileSymbols = ['L₁₂', 'I₉', 'G₇', 'H₈', 'T₂₀', 'Σ', 'R₁₈', 'A₁', 'N₁₄'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const tx = (c - 1) * 2.2, tz = -24 + (r - 1) * 2.2;
    const glowing = r === 1;
    tileDais.add(mesh(new THREE.BoxGeometry(1.9, 0.35, 1.9), mat(glowing ? PAL.brass : 0x7a7568, glowing ? 0x553d00 : 0), tx, 0.12, tz));
    const lbl = textSprite(tileSymbols[r * 3 + c], { size: 44, scale: 0.48, color: glowing ? '#fff5cc' : '#b1f9f6' });
    lbl.position.set(tx, 0.9, tz); tileDais.add(lbl);
  }
  group.add(tileDais);
  addGate('cavern-tiles', -38);
  interactables.push({
    id: 'cavern-tiles', x: 0, z: -24, r: 4.5,
    label: () => cb.hasPuzzle('cavern-tiles') ? 'Rune-Tile Seal Unlocked' : 'Inspect Sunken Rune-Tile Lock (Word + Sum)',
    act: () => {
      if (cb.hasPuzzle('cavern-tiles')) { cb.toast('Rune-Tile Vault Open', 'Continue north into the Great Waterwheel Hall.'); return; }
      cb.openAcademiaQuiz({
        id: 'cavern-tiles',
        kind: 'Sunken Rune-Tile Lock · Word Weight',
        prompt: 'L(12) + I(9) + G(7) + H(8) + T(20) = ?',
        sub: 'Sum the tile values of LIGHT (A=1…Z=26) to slide the vault seal open.',
        choices: ['48', '56', '62', '52'],
        answer: 1,
        onPass: () => {
          unlockGate('cavern-tiles');
          cb.completePuzzle('cavern-tiles', 'WATER', 'The carved stone tiles slide into place. The Waterwheel Hall opens ahead!');
        },
      });
    },
  });

  // ── CHAMBER 2: Great Waterwheel & Gear-Ratio Sluice Hall (z: -38 to -72, S46 & S48) ──
  addFloor(-16, 16, -38, -72);
  addWall(-16, -38, -16, -72); addWall(16, -38, 16, -72);
  addWall(-16, -72, -3.5, -72); addWall(3.5, -72, 16, -72);
  // Two towering subterranean waterwheels + aqueduct flume (S46) + engraved stone wheel door (S48)
  const bigWheel = new THREE.Group(); bigWheel.userData.dynamic = true;
  bigWheel.add(mesh(new THREE.TorusGeometry(4.4, 0.35, 8, 24), timber, 0, 0, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const sp = mesh(new THREE.BoxGeometry(0.24, 8.8, 0.24), timber, 0, 0, 0, false); sp.rotation.z = a; bigWheel.add(sp);
  }
  bigWheel.position.set(8.5, 4.8, -56); bigWheel.rotation.y = Math.PI / 2;
  group.add(bigWheel);

  const smallGear = new THREE.Group(); smallGear.userData.dynamic = true;
  smallGear.add(mesh(new THREE.TorusGeometry(1.9, 0.25, 8, 16), mat(PAL.brass, 0x3a2800), 0, 0, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = mesh(new THREE.BoxGeometry(0.18, 3.8, 0.18), mat(PAL.brass), 0, 0, 0, false); sp.rotation.z = a; smallGear.add(sp);
  }
  smallGear.position.set(8.5, 4.8, -50.2); smallGear.rotation.y = Math.PI / 2;
  group.add(smallGear);

  // Wooden sluice flume & lever
  group.add(mesh(new THREE.BoxGeometry(1.6, 0.8, 14), timber, 8.5, 8.8, -60));
  const sluiceLever = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), mat(PAL.brass, 0x443200), 4.2, 1.0, -56);
  sluiceLever.rotation.z = 0.4; sluiceLever.userData.dynamic = true;
  group.add(sluiceLever);
  addGate('cavern-wheel', -72);

  const triggerWheelQuiz = () => {
    if (cb.hasPuzzle('cavern-wheel')) { cb.toast('Waterwheels Turning', 'The drained passage north leads to the Hall of Reflections.'); return; }
    cb.openAcademiaQuiz({
      id: 'cavern-wheel',
      kind: 'Great Waterwheel · Academia Gear Ratios',
      prompt: 'Small Gear: 12 teeth  →  Great Wheel: 36 teeth',
      sub: 'How many full turns of the small gear spin the Great Stone Wheel once (36 ÷ 12)?',
      choices: ['2 turns', '3 turns', '4 turns', '6 turns'],
      answer: 1,
      onPass: () => {
        sluiceLever.rotation.z = -0.45;
        unlockGate('cavern-wheel');
        cb.completePuzzle('cavern-wheel', 'RATIO', 'Water surges down the aqueduct! The Great Waterwheel roars and unlocks the Hall of Reflections.');
      },
    });
  };
  interactables.push({
    id: 'cavern-wheel', x: 4.2, z: -56, r: 4.0,
    label: () => cb.hasPuzzle('cavern-wheel') ? 'Great Waterwheel Active' : 'Pull Sluice Lever / Sing RAIN (Gear Ratio)',
    act: triggerWheelQuiz,
  });
  grappleAnchors.push({
    id: 'grapple-sluice', label: 'Sluice Lever Ring', x: 4.2, y: 1.8, z: -56, mesh: sluiceLever, onPull: triggerWheelQuiz,
  });

  // ── CHAMBER 3: Hall of Reflections — Live 3D Light-Beam Mirror Puzzle (z: -72 to -108, S21) ──
  addFloor(-16, 16, -72, -108);
  addWall(-16, -72, -16, -108); addWall(16, -72, 16, -108);
  addWall(-16, -108, -3.5, -108); addWall(3.5, -108, 16, -108);
  addCrystals(-14, 0, -82, 1.5); addCrystals(14, 0, -96, 1.5);

  // Golden sunbeam shaft pouring down from cavern skylight onto Mirror 1 (-8, -82) (S21!)
  const sunShaft = mesh(
    new THREE.CylinderGeometry(0.9, 1.6, 14, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe699, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    -8, 7.5, -82, false,
  );
  group.add(sunShaft);

  // Three physical rotatable bronze mirrors: target states = [1, 2, 1] -> bounces M1 -> M2 -> M3 -> Door Seal (0, 3.2, -107.2)
  const mirrorPos: [number, number, number][] = [[-8, 1.8, -82], [8, 1.8, -88], [-6, 1.8, -98]];
  const mirrorTarget = [1, 2, 1];
  const mirrorState = cb.hasPuzzle('cavern-mirrors') ? [...mirrorTarget] : [0, 0, 0];
  const mirrorMeshes: THREE.Group[] = [];
  const mirrorLabels: THREE.Sprite[] = [];

  const doorSeal = mesh(new THREE.TorusGeometry(1.5, 0.2, 8, 24), mat(PAL.brass, cb.hasPuzzle('cavern-mirrors') ? 0xffd066 : 0x221800), 0, 3.4, -107.1, false);
  doorSeal.userData.dynamic = true;
  group.add(doorSeal);
  addGate('cavern-mirrors', -108);

  // Live 3D beam line updated every time a mirror turns
  const beamGeo = new THREE.BufferGeometry();
  const beamPts = new Float32Array(5 * 3);
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPts, 3));
  const beamLine = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffe88c, linewidth: 2 }));
  beamLine.userData.dynamic = true; beamLine.frustumCulled = false;
  group.add(beamLine);

  const updateMirrorBeams = () => {
    const p = beamGeo.attributes.position as THREE.BufferAttribute;
    // Start at skylight -> M1
    p.setXYZ(0, -8, 13, -82);
    p.setXYZ(1, mirrorPos[0][0], mirrorPos[0][1], mirrorPos[0][2]);
    const ok1 = mirrorState[0] === mirrorTarget[0];
    const ok2 = ok1 && mirrorState[1] === mirrorTarget[1];
    const ok3 = ok2 && mirrorState[2] === mirrorTarget[2];
    if (ok1) {
      p.setXYZ(2, mirrorPos[1][0], mirrorPos[1][1], mirrorPos[1][2]);
    } else {
      const a = mirrorState[0] * (Math.PI / 2) + 0.3;
      p.setXYZ(2, mirrorPos[0][0] + Math.sin(a) * 12, 1.8, mirrorPos[0][2] - Math.cos(a) * 12);
    }
    if (ok2) {
      p.setXYZ(3, mirrorPos[2][0], mirrorPos[2][1], mirrorPos[2][2]);
    } else {
      p.setXYZ(3, p.getX(2), p.getY(2), p.getZ(2));
    }
    if (ok3) {
      p.setXYZ(4, 0, 3.4, -107.1);
    } else if (ok2) {
      const a = mirrorState[2] * (Math.PI / 2) + 0.2;
      p.setXYZ(4, mirrorPos[2][0] + Math.cos(a) * 10, 1.8, mirrorPos[2][2] - Math.sin(a) * 10);
    } else {
      p.setXYZ(4, p.getX(3), p.getY(3), p.getZ(3));
    }
    p.needsUpdate = true;

    mirrorMeshes.forEach((mg, i) => {
      mg.rotation.y = mirrorState[i] * (Math.PI / 4) + 0.4;
      const locked = mirrorState[i] === mirrorTarget[i];
      (mg.userData.ring as THREE.Mesh).material = mat(PAL.brass, locked ? 0xffcf60 : 0x221800);
    });

    if (ok3 && !cb.hasPuzzle('cavern-mirrors')) {
      doorSeal.material = mat(PAL.brass, 0xffe484);
      unlockGate('cavern-mirrors');
      cb.completePuzzle('cavern-mirrors', 'MIRROR', 'Angle of incidence equals angle of reflection! The golden sunbeam unlocks the Vault of Reflections!');
    }
  };

  mirrorPos.forEach(([mx, my, mz], i) => {
    const mg = new THREE.Group(); mg.userData.dynamic = true;
    mg.add(mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.5, 10), rockMat, 0, 0.75, 0));
    const ring = mesh(new THREE.TorusGeometry(0.9, 0.12, 8, 20), mat(PAL.brass, 0x221800), 0, my, 0);
    const glass = mesh(new THREE.CircleGeometry(0.82, 18), new THREE.MeshStandardMaterial({ color: 0xffeeb0, metalness: 0.8, roughness: 0.15, side: THREE.DoubleSide }), 0, my, 0, false);
    mg.add(ring, glass);
    mg.userData.ring = ring;
    mg.position.set(mx, 0, mz);
    group.add(mg);
    mirrorMeshes.push(mg);
    circles.push({ x: mx, z: mz, r: 0.9 });

    const lbl = textSprite(`Mirror ${i + 1}`, { size: 42, scale: 0.46, color: '#ffe9a8', bg: 'rgba(20,26,46,.68)' });
    lbl.position.set(mx, 3.4, mz); group.add(lbl); mirrorLabels.push(lbl);

    const turnMirror = () => {
      if (cb.hasPuzzle('cavern-mirrors')) { cb.toast('Beam Locked', 'All three bronze mirrors are aligned!'); return; }
      mirrorState[i] = (mirrorState[i] + 1) % 4;
      cb.playSfx('mirror');
      updateMirrorBeams();
      const locked = mirrorState[i] === mirrorTarget[i];
      cb.toast(`Mirror ${i + 1} rotated (${mirrorState[i] * 45}°)`, locked ? '✦ Beam aligned with the next prism!' : 'Keep rotating until the golden beam connects.');
    };
    interactables.push({
      id: `mirror-${i}`, x: mx, z: mz, r: 3.4,
      label: () => `Rotate Bronze Mirror ${i + 1} (${mirrorState[i] * 45}° — E or Lasso C)`,
      act: turnMirror,
    });
    grappleAnchors.push({
      id: `grapple-mirror-${i}`, label: `Bronze Mirror ${i + 1}`, x: mx, y: my + 0.4, z: mz, mesh: ring, onPull: turnMirror,
    });
  });
  updateMirrorBeams();

  // ── CHAMBER 4: Hanging Counterweight & Crane Pulley Vault (z: -108 to -138, S00) ──
  addFloor(-14, 14, -108, -138);
  addWall(-14, -108, -14, -138); addWall(14, -108, 14, -138);
  addWall(-14, -138, -3.5, -138); addWall(3.5, -138, 14, -138);
  // Glowing cyan floor circuits + hanging carved stone counterweight chests (S00)
  const chestL = mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), surface('medieval_blocks_02', [2, 2], 0x8f8878), -5.5, cb.hasPuzzle('cavern-weights') ? 1.2 : 4.2, -124);
  const chestR = mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), surface('medieval_blocks_02', [2, 2], 0x8f8878), 5.5, cb.hasPuzzle('cavern-weights') ? 1.2 : 2.6, -124);
  chestL.userData.dynamic = true; chestR.userData.dynamic = true;
  group.add(chestL, chestR);
  group.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 11, 6), mat(0x3a3630), -5.5, 7, -124, false));
  group.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 11, 6), mat(0x3a3630), 5.5, 7, -124, false));
  group.add(mesh(new THREE.RingGeometry(4.5, 5.1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.cyan, side: THREE.DoubleSide }), 0, 0.06, -124, false));
  addGate('cavern-weights', -138);
  interactables.push({
    id: 'cavern-weights', x: 0, z: -124, r: 4.5,
    label: () => cb.hasPuzzle('cavern-weights') ? 'Counterweights Balanced' : 'Balance Hanging Counterweights (Physics: Torque)',
    act: () => {
      if (cb.hasPuzzle('cavern-weights')) { cb.toast('Pulley Vault Balanced', 'Cross the Lava Pendulum Bridge north to the Mine-Cart!'); return; }
      cb.openAcademiaQuiz({
        id: 'cavern-weights',
        kind: 'Counterweight Pulley · Academia Physics (Torque)',
        prompt: 'Left Arm: 60 kg × 2 m  =  Right Arm: ? kg × 3 m',
        sub: 'Balance torque (m₁ · d₁ = m₂ · d₂) to lower both stone counterweights evenly.',
        choices: ['30 kg', '40 kg', '45 kg', '90 kg'],
        answer: 1,
        onPass: () => {
          chestL.position.y = 1.2; chestR.position.y = 1.2;
          unlockGate('cavern-weights');
          cb.completePuzzle('cavern-weights', 'TORQUE', 'Both hanging stone chests settle onto the cyan glyphs! The Lava Pendulum Bridge opens!');
        },
      });
    },
  });

  // ── CHAMBER 5: Molten Lava Chasm + Swinging Bronze Pendulum Blades (z: -138 to -168, S34 & S06) ──
  addWall(-14, -138, -14, -182); addWall(14, -138, 14, -182); addWall(-14, -182, 14, -182);
  // Glowing molten lava lake far below the stone bridge (Kenne confirmed: keep the lava pits!)
  const lavaPool = mesh(new THREE.PlaneGeometry(26, 28).rotateX(-Math.PI / 2), lavaMat, 0, -4.8, -153, false);
  lavaPool.userData.dynamic = true;
  group.add(lavaPool);
  // Narrow weathered stone bridge spanning the molten lava pit
  addFloor(-2.4, 2.4, -138, -168, 0);
  // Flanking lava hazards off the stone bridge edges
  hazards.push({ id: 'lava-left', kind: 'lava', x: -8.5, z: -153, rx: 5.5, rz: 13.5 });
  hazards.push({ id: 'lava-right', kind: 'lava', x: 8.5, z: -153, rx: 5.5, rz: 13.5 });

  // Two colossal swinging bronze pendulum blades (S34!) — sing TIME to slow them!
  const pendulums: { pivot: THREE.Group; z: number; phase: number }[] = [];
  for (const [pz, phase] of [[-148, 0], [-159, Math.PI * 0.65]] as const) {
    const pivot = new THREE.Group();
    pivot.userData.dynamic = true;
    pivot.position.set(0, 9.5, pz);
    pivot.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 8.2, 8), mat(0x4a443b), 0, -4.1, 0));
    const blade = mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.18, 16, 1, false, 0, Math.PI), mat(PAL.brass, 0x552200), 0, -8.0, 0);
    blade.rotation.x = Math.PI / 2;
    pivot.add(blade);
    group.add(pivot);
    pendulums.push({ pivot, z: pz, phase });
    hazards.push({
      id: `pend-${pz}`, kind: 'pendulum', x: 0, z: pz, rx: 2.2, rz: 1.0,
      isLethal: (t, slow) => Math.abs(Math.sin(t * 2.1 * slow + phase)) < 0.22,
    });
  }
  const pendSign = textSprite('Sing TIME [Q] to slow the pendulums', { size: 40, scale: 0.52, color: '#ffe9a8', bg: 'rgba(30,16,10,.78)' });
  pendSign.position.set(0, 3.8, -141); group.add(pendSign);

  // ── STAGING DEPOT: Deep Archive Wooden Mine-Cart (z: -168 to -182, S50 / S27) ──
  addFloor(-12, 12, -168, -182);
  // Iron rail tracks heading north into the escape tunnel
  for (const rx of [-0.75, 0.75]) {
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 12), mat(0x555860), rx, 0.08, -175, false));
  }
  const cart = new THREE.Group();
  cart.add(mesh(new THREE.BoxGeometry(1.7, 1.05, 2.4), timber, 0, 0.85, 0));
  cart.add(mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat(0xffcf70, 0xffa838), 0, 1.45, -1.15, false));
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.8, 0.8]) {
    cart.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 12).rotateZ(Math.PI / 2), mat(0x3a3b40), sx, 0.32, sz, false));
  }
  cart.position.set(0, 0, -174);
  group.add(cart);
  const cartSign = textSprite('Board Archive Mine-Cart [E]', { size: 46, scale: 0.6, color: '#ffe9a8', bg: 'rgba(20,26,46,.8)' });
  cartSign.position.set(0, 3.2, -174); group.add(cartSign);

  // Atmospheric cyan & amber cave lighting
  for (const [lx, ly, lz, col, inten] of [
    [0, 6, 8, 0xb1f9f6, 55], [0, 6, -24, 0x7ce8f0, 65], [0, 7, -56, 0xffb866, 65],
    [0, 8, -90, 0xffe299, 75], [0, 6, -124, 0x7ce8f0, 65], [0, 4, -153, 0xff5a18, 95], [0, 5, -174, 0xffc070, 65],
  ] as const) {
    const l = new THREE.PointLight(col, inten, 38, 1.4);
    l.position.set(lx, ly, lz);
    group.add(l);
    torches.push(l);
  }

  const portals: LevelPortal[] = [
    { id: 'cavern-exit-glossa', label: 'Climb down behind waterfall → Glossa Hollow Valley', x: 0, z: 14.2, r: 3.6, target: 'glossa', spawn: [-48, 0, -21], yaw: Math.PI / 2 },
    { id: 'cavern-board-cart', label: 'Board the Archive Mine-Cart → Deep Cavern Escape!', x: 0, z: -174, r: 4.2, target: 'minecart' },
  ];

  const m = motes(180, 120, new THREE.Vector3(0, 2, -85), 0xb1f9f6, '✦');
  group.add(m);

  let pendAngleT = 0;

  return {
    id: 'cavern', name: 'Veil Crystal Grotto & Archive Vaults', outdoor: false, group,
    heightAt: () => 0, circles, boxes, gates, sigils: new Map(), villagers: new Map(),
    portals, interactables, grappleAnchors, hazards, torches, braziers: [], pillars: [],
    constrain(x, z) { return [Math.max(-15, Math.min(15, x)), Math.max(-180, Math.min(15.2, z))]; },
    sky: { day: 0x0b151e, night: 0x0b151e, fog: 0x0d1b26, fogNear: 14, fogFar: 68 },
    motes: m,
    update(dt, t, timeSlow = 1) {
      pendAngleT += dt * timeSlow;
      // Waterwheels spin briskly once the Gear Ratio puzzle is solved
      const wheelSpeed = cb.hasPuzzle('cavern-wheel') ? 1.3 : 0.15;
      bigWheel.rotation.z -= dt * wheelSpeed;
      smallGear.rotation.z += dt * wheelSpeed * 3.0; // exact 3:1 gear ratio!
      lavaMat.emissiveIntensity = 1.9 + Math.sin(t * 3.1) * 0.4;
      for (const p of pendulums) {
        p.pivot.rotation.z = Math.sin(pendAngleT * 2.1 + p.phase) * 0.95;
      }
    },
    onSong(power, _px, pz) {
      if (power === 'water' && Math.abs(pz + 56) < 16 && !cb.hasPuzzle('cavern-wheel')) {
        triggerWheelQuiz();
        return true;
      }
      if (power === 'light' && Math.abs(pz + 90) < 18 && !cb.hasPuzzle('cavern-mirrors')) {
        cb.toast('♪ LIGHT illuminates the Hall of Reflections!', 'Align Mirrors 1 → 2 → 3 (45° · 90° · 45°) to unlock the door!');
        return true;
      }
      return false;
    },
  };
}

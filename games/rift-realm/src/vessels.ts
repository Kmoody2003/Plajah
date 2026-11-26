// Playable non-human Soul Vessel classes (Tron-meets-Fable cyber-arcane frames).
import * as THREE from 'three/webgpu';

export type VesselId = 'aegis' | 'stalker' | 'seraph' | 'sylva' | 'pyre';

export interface GrappleSpec {
  /** Max tether reach in metres. */
  range: number;
  /** Retraction pull speed (m/s). */
  pullSpeed: number;
  /** Cooldown between grapple launches (s). */
  cooldown: number;
  /** Glow colour of the retracting cable. */
  color: number;
  /** HUD badge label. */
  label: string;
}

export interface VesselSpec {
  id: VesselId;
  key: '1' | '2' | '3' | '6' | '7';
  name: string;
  archetype: string;
  weaponName: string;
  maxHp: number;
  moveSpeed: number;
  dashSpeed: number;
  gravity: number;
  pellets: number;
  spreadRad: number;
  burstCount: number;
  burstDelayMs: number;
  dmgPerfect: number;
  dmgGood: number;
  dmgOff: number;
  primaryColor: number;
  accentColor: number;
  /** Present ONLY on grapple-capable vessels (Void Stalker & Sylva); absent on heavy/winged vessels. */
  grapple?: GrappleSpec;
}

export const VESSELS: Record<VesselId, VesselSpec> = {
  aegis: {
    id: 'aegis',
    key: '1',
    name: 'Aegis Automaton',
    archetype: 'Cyber-Paladin Construct',
    weaponName: 'Halo Lance',
    maxHp: 130,
    moveSpeed: 8.8,
    dashSpeed: 28,
    gravity: 27,
    pellets: 1,
    spreadRad: 0,
    burstCount: 1,
    burstDelayMs: 0,
    dmgPerfect: 46,
    dmgGood: 30,
    dmgOff: 14,
    primaryColor: 0x38bdf8,
    accentColor: 0xf59e0b,
  },
  stalker: {
    id: 'stalker',
    key: '2',
    name: 'Void Stalker',
    archetype: 'Shadow-Beast Frame',
    weaponName: 'Rift Scatter',
    maxHp: 85,
    moveSpeed: 11.2,
    dashSpeed: 34,
    gravity: 27,
    pellets: 5,
    spreadRad: 0.055,
    burstCount: 1,
    burstDelayMs: 0,
    dmgPerfect: 12,
    dmgGood: 8,
    dmgOff: 4,
    primaryColor: 0xd946ef,
    accentColor: 0x38bdf8,
    grapple: { range: 52, pullSpeed: 31, cooldown: 2.2, color: 0xd946ef, label: 'VOID TETHER' },
  },
  seraph: {
    id: 'seraph',
    key: '3',
    name: 'Seraph-9',
    archetype: 'Fallen-Tech Cherub',
    weaponName: 'Chord Repeater',
    maxHp: 100,
    moveSpeed: 10,
    dashSpeed: 30,
    gravity: 19, // floatier: the flyer
    pellets: 1,
    spreadRad: 0.012,
    burstCount: 3,
    burstDelayMs: 55,
    dmgPerfect: 17,
    dmgGood: 11,
    dmgOff: 5,
    primaryColor: 0xfbbf24,
    accentColor: 0xa855f7,
  },
  sylva: {
    id: 'sylva',
    key: '6',
    name: 'Sylva',
    archetype: 'Living Treant Grappler',
    weaponName: 'Briar Spore-Cannon',
    maxHp: 120,
    moveSpeed: 9.4,
    dashSpeed: 29,
    gravity: 26,
    pellets: 3,
    spreadRad: 0.032,
    burstCount: 1,
    burstDelayMs: 0,
    dmgPerfect: 20,
    dmgGood: 13,
    dmgOff: 6,
    primaryColor: 0xf59e0b,
    accentColor: 0x4ade80,
    grapple: { range: 56, pullSpeed: 29, cooldown: 1.8, color: 0x4ade80, label: 'BRIAR VINE HOOK' },
  },
  pyre: {
    id: 'pyre',
    key: '7',
    name: 'Pyre',
    archetype: 'Obsidian Forge Golem',
    weaponName: 'Ember Slag-Breaker',
    maxHp: 155,
    moveSpeed: 8.2,
    dashSpeed: 25,
    gravity: 29,
    pellets: 4,
    spreadRad: 0.042,
    burstCount: 1,
    burstDelayMs: 0,
    dmgPerfect: 18,
    dmgGood: 12,
    dmgOff: 6,
    primaryColor: 0xf97316,
    accentColor: 0x38bdf8,
  },
};

export const VESSEL_ORDER: VesselId[] = ['aegis', 'stalker', 'seraph', 'sylva', 'pyre'];

/** Build a distinct 3rd-person non-human silhouette for each Soul Vessel. */
export function buildVesselMesh(spec: VesselSpec): THREE.Group {
  const group = new THREE.Group();
  const armorMat = new THREE.MeshStandardNodeMaterial({
    color: 0x131b2e,
    roughness: 0.28,
    metalness: 0.88,
  });
  const coreMat = new THREE.MeshStandardNodeMaterial({
    color: spec.primaryColor,
    emissive: spec.primaryColor,
    emissiveIntensity: 1.7,
    roughness: 0.15,
  });
  const trimMat = new THREE.MeshStandardNodeMaterial({
    color: spec.accentColor,
    emissive: spec.accentColor,
    emissiveIntensity: 0.75,
    metalness: 0.9,
    roughness: 0.2,
  });

  if (spec.id === 'aegis') {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.9, 0.52), armorMat);
    torso.position.y = 1.15;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), coreMat);
    core.position.set(0, 1.2, 0.26);
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.44, 4), armorMat);
    helm.position.y = 1.78;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.2), coreMat);
    visor.position.set(0, 1.72, 0.14);

    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.58, 0.48), trimMat);
    pauldronL.position.set(-0.52, 1.32, 0);
    pauldronL.rotation.z = 0.18;
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.52;
    pauldronR.rotation.z = -0.18;

    group.add(torso, core, helm, visor, pauldronL, pauldronR);
  } else if (spec.id === 'stalker') {
    const torso = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.1, 6), armorMat);
    torso.position.y = 1.12;
    torso.rotation.x = Math.PI;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), coreMat);
    core.position.set(0, 1.18, 0.24);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.46), armorMat);
    head.position.set(0, 1.62, 0.1);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.18), coreMat);
    eye.position.set(0, 1.63, 0.26);

    const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.22), trimMat);
    bladeL.position.set(-0.38, 1.38, -0.22);
    bladeL.rotation.set(-0.45, 0, 0.35);
    const bladeR = bladeL.clone();
    bladeR.position.x = 0.38;
    bladeR.rotation.z = -0.35;

    group.add(torso, core, head, eye, bladeL, bladeR);
  } else {
    // Seraph-9: Floating prism core + geometric wing blades + halo ring
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), armorMat);
    body.position.y = 1.25;
    body.scale.set(0.85, 1.4, 0.85);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), coreMat);
    core.position.set(0, 1.25, 0.24);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 24), trimMat);
    halo.position.set(0, 1.82, -0.05);
    halo.rotation.x = Math.PI / 2 - 0.3;

    for (const side of [-1, 1]) {
      for (let w = 0; w < 2; w++) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.16), w === 0 ? trimMat : coreMat);
        wing.position.set(side * (0.55 + w * 0.18), 1.48 - w * 0.24, -0.24);
        wing.rotation.z = side * (0.35 - w * 0.25);
        wing.rotation.y = -side * 0.25;
        group.add(wing);
      }
    }
    group.add(body, core, halo);
  }

  return group;
}

// playkit/character/organicRig.ts
//
// Unified Organic Character & Creature Simulation Layer:
//   - Ties together Plajah's existing `dqSkinning.ts`, `morphDrivers.ts`, `springBones.ts`, `clothSim.ts`,
//     `services/soft/drape/gpu.ts` (WebGPU cloth), and `services/argilla/creature/anatomy.ts`.
//   - Adds:
//       1) Pose-Space Muscle Flex & Wrinkle-Normal Drivers (60 fps mobile-safe flesh simulation)
//       2) Soft-Tissue Jiggle Chains (cheeks, belly, wings, fins, straps)
//       3) Typed Socketable Prop Classes (weapons, shields, armor, tools, Firstlight gear, Kith props)
//          with runtime attach / detach / drop-to-physics handoff!

export type PropCategory = 'weapon' | 'shield' | 'armor' | 'tool' | 'sports-gear' | 'accessory' | 'consumable';

export type StandardSocketName =
  | 'handR'
  | 'handL'
  | 'back'
  | 'hipL'
  | 'hipR'
  | 'head'
  | 'chest'
  | 'pauldronL'
  | 'pauldronR'
  | 'wingMount'
  | (string & {});

export interface SocketTransform {
  offset: [number, number, number];
  rotationEuler: [number, number, number];
  scale: [number, number, number];
}

/** First-class Prop Class descriptor shared across Studio, Aria, and all games. */
export interface PropClassSpec {
  id: string;
  name: string;
  category: PropCategory;
  prefabId: string;
  preferredSocket: StandardSocketName;
  allowedSockets: StandardSocketName[];
  massKg: number;
  twoHanded?: boolean;
  mountTransform: SocketTransform;
  /** Optional gameplay / visual tags (e.g. 'rhythm-weapon', 'helmet', 'football', 'katana'). */
  tags: string[];
}

export interface MuscleFlexRule {
  id: string;
  joint: string;
  /** Angle in radians at rest vs peak flex. */
  restAngleRad: number;
  peakAngleRad: number;
  /** Target corrective blendshape on the skinned mesh. */
  morphName: string;
  /** Optional dynamic wrinkle-normal map channel blended at peak flex. */
  wrinkleChannel?: string;
}

export interface SoftTissueNode {
  id: string;
  parentBone: string;
  stiffness: number;
  damping: number;
  maxDisplacementM: number;
  displacement: [number, number, number];
  velocity: [number, number, number];
}

export interface OrganicSimProfile {
  archetype: 'humanoid' | 'quadruped' | 'winged' | 'construct-hybrid' | 'creature';
  skinning: 'dual-quaternion' | 'linear-blend';
  clothBackend: 'webgpu-xpbd' | 'cpu-verlet' | 'none';
  hairMode: 'strands-aniso' | 'cards-aniso' | 'sculpted-spring';
  subsurfaceScatter: { enabled: boolean; scatterRadiusMm: number; tintHex: number };
  muscleRules: MuscleFlexRule[];
  softTissueNodes: SoftTissueNode[];
}

export interface MountedPropInstance {
  instanceId: string;
  spec: PropClassSpec;
  socket: StandardSocketName;
  attached: boolean;
}

export class OrganicCharacterRigController {
  readonly profile: OrganicSimProfile;
  readonly morphWeights = new Map<string, number>();
  readonly wrinkleWeights = new Map<string, number>();
  private readonly mountedProps = new Map<StandardSocketName, MountedPropInstance>();

  constructor(profile: OrganicSimProfile) {
    this.profile = profile;
  }

  /** Evaluate pose-space muscle bulges and wrinkle-map blend weights from current joint angles. */
  evaluateMuscles(jointAnglesRad: Record<string, number>): void {
    for (const rule of this.profile.muscleRules) {
      const ang = jointAnglesRad[rule.joint] ?? rule.restAngleRad;
      const span = rule.peakAngleRad - rule.restAngleRad;
      const t = Math.abs(span) < 1e-5 ? 0 : (ang - rule.restAngleRad) / span;
      const w = Math.max(0, Math.min(1, t));
      this.morphWeights.set(rule.morphName, w);
      if (rule.wrinkleChannel) {
        this.wrinkleWeights.set(rule.wrinkleChannel, w);
      }
    }
  }

  /** Step lightweight spring-damper soft-tissue jiggle driven by body/bone acceleration. */
  stepSoftTissue(bodyAccel: [number, number, number], dt: number): void {
    for (const node of this.profile.softTissueNodes) {
      for (let i = 0; i < 3; i++) {
        const force = -bodyAccel[i] * 0.04 - node.displacement[i] * node.stiffness - node.velocity[i] * node.damping;
        node.velocity[i] += force * dt;
        node.displacement[i] += node.velocity[i] * dt;
      }
      const mag = Math.hypot(node.displacement[0], node.displacement[1], node.displacement[2]);
      if (mag > node.maxDisplacementM && mag > 1e-6) {
        const s = node.maxDisplacementM / mag;
        node.displacement[0] *= s;
        node.displacement[1] *= s;
        node.displacement[2] *= s;
      }
    }
  }

  /** Equip a typed Prop Class onto a character socket. */
  attachProp(instanceId: string, spec: PropClassSpec, socket: StandardSocketName = spec.preferredSocket): MountedPropInstance {
    if (!spec.allowedSockets.includes(socket)) {
      throw new Error(`Prop "${spec.id}" cannot mount on socket "${socket}". Allowed: ${spec.allowedSockets.join(', ')}`);
    }
    const inst: MountedPropInstance = { instanceId, spec, socket, attached: true };
    this.mountedProps.set(socket, inst);
    return inst;
  }

  /** Detach a prop (e.g. drop weapon or fumble football into the 3D PhysicsWorld). */
  detachProp(socket: StandardSocketName): MountedPropInstance | null {
    const inst = this.mountedProps.get(socket);
    if (!inst) return null;
    inst.attached = false;
    this.mountedProps.delete(socket);
    return inst;
  }

  getMountedProp(socket: StandardSocketName): MountedPropInstance | undefined {
    return this.mountedProps.get(socket);
  }

  listMountedProps(): MountedPropInstance[] {
    return [...this.mountedProps.values()];
  }
}

export function defaultHumanoidOrganicProfile(): OrganicSimProfile {
  return {
    archetype: 'humanoid',
    skinning: 'dual-quaternion',
    clothBackend: 'webgpu-xpbd',
    hairMode: 'cards-aniso',
    subsurfaceScatter: { enabled: true, scatterRadiusMm: 1.8, tintHex: 0xff6b52 },
    muscleRules: [
      { id: 'bicepL', joint: 'foreArmL', restAngleRad: 0, peakAngleRad: 2.1, morphName: 'flex_bicep_L', wrinkleChannel: 'elbow_crease_L' },
      { id: 'bicepR', joint: 'foreArmR', restAngleRad: 0, peakAngleRad: 2.1, morphName: 'flex_bicep_R', wrinkleChannel: 'elbow_crease_R' },
      { id: 'deltoidL', joint: 'upperArmL', restAngleRad: 0, peakAngleRad: 1.5, morphName: 'raise_deltoid_L', wrinkleChannel: 'shoulder_fold_L' },
      { id: 'deltoidR', joint: 'upperArmR', restAngleRad: 0, peakAngleRad: 1.5, morphName: 'raise_deltoid_R', wrinkleChannel: 'shoulder_fold_R' },
      { id: 'quadL', joint: 'shinL', restAngleRad: 0, peakAngleRad: 1.9, morphName: 'flex_quad_L' },
      { id: 'quadR', joint: 'shinR', restAngleRad: 0, peakAngleRad: 1.9, morphName: 'flex_quad_R' },
    ],
    softTissueNodes: [
      { id: 'chest_soft', parentBone: 'chest', stiffness: 120, damping: 14, maxDisplacementM: 0.035, displacement: [0, 0, 0], velocity: [0, 0, 0] },
      { id: 'jaw_cheek', parentBone: 'head', stiffness: 160, damping: 18, maxDisplacementM: 0.015, displacement: [0, 0, 0], velocity: [0, 0, 0] },
    ],
  };
}

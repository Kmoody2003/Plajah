/**
 * copsAndRobbers.ts — Asymmetric Open-World "Cops & Robbers" Pursuit Mode
 * with Opening Scenario Cutscenes:
 *
 * - ROBBER (2 randomized heist intros):
 *   1) "Heist Runner": Start on foot sprinting out of the bank toward your getaway car.
 *   2) "Getaway Driver": Wait at the curb outside the bank while your 3-person crew sprints
 *      out of the bank and piles into your getaway car, then peel out to the elusive hideout.
 * - COP:
 *   Start parked at a street-side Hot Dog Stand when Dispatch broadcasts an all-units APB
 *   identifying the suspect's exact car MAKE, MODEL, and COLOR. Launch with backup cruisers
 *   converging, hunt down & disable the getaway car, and chase on foot ([F]) if they bail!
 */

import * as THREE from 'three';
import { createCarState, stepCarPhysics, type CarInput, type CarState } from './physics';
import { CARS, type CarSpec } from './manufacturers';
import { hasScanCar, loadScanOpponentCar } from './scancar';
import type { SurfaceType } from './world';

export type PursuitRole = 'cop' | 'robber';
export type PursuitRoleChoice = PursuitRole | 'auto';
export type RobberIntroVariant = 'runner' | 'getaway_driver';
export type PursuitOutcome = 'active' | 'cop_win' | 'robber_escaped';

export interface HideoutSpot {
  name: string;
  pos: THREE.Vector3;
}

export interface SuspectVehicleProfile {
  carId: string;
  make: string;
  model: string;
  colorName: string;
  paintHex: number;
  glb: string;
  targetLen: number;
  spec: CarSpec;
}

const SUSPECT_VEHICLES: SuspectVehicleProfile[] = [
  { carId: 'kestrel', make: 'Kestrel', model: 'Sovereign GT-R', colorName: 'Burnt Orange', paintHex: 0xc24d12, glb: '/games/apex/car/sov_painted.glb', targetLen: 4.65, spec: CARS.kestrel },
  { carId: 'sidewinder', make: 'Kestrel', model: 'Sidewinder', colorName: 'Racing Yellow', paintHex: 0xd49b00, glb: '/games/apex/car/sidewinder_base.glb', targetLen: 4.60, spec: CARS.kestrel },
  { carId: 'kuronuma', make: 'Kuronuma', model: 'GT-6', colorName: 'Pearl White', paintHex: 0xeef2f6, glb: '/games/apex/car/kuronuma_base.glb', targetLen: 4.55, spec: CARS.aurelia },
  { carId: 'ironhide', make: 'Meridian', model: 'Ironhide 440', colorName: 'Midnight Blue', paintHex: 0x172c4e, glb: '/games/apex/car/ironhide_base.glb', targetLen: 4.82, spec: CARS.kestrel },
  { carId: 'veloce', make: 'Aurelia', model: 'Veloce Spyder', colorName: 'Racing Red', paintHex: 0xd11919, glb: '/games/apex/car/veloce_base.glb', targetLen: 4.62, spec: CARS.aurelia },
];

/** Real high-quality GT-R standard Scan Car Police Fleet: Interceptors, Tactical SUVs & Heavy Pursuit Trucks! */
const POLICE_FLEET_UNITS: { carId: string; label: string; paintHex: number; roofY: number; barZ: number }[] = [
  { carId: 'vernon_police', label: 'Vernon Police Interceptor', paintHex: 0x121824, roofY: 1.355, barZ: -0.34 },
  { carId: 'ironport_commander', label: 'Ironport Police Commander SUV', paintHex: 0x141b28, roofY: 1.66, barZ: -0.25 },
  { carId: 'titan_sentinel', label: 'Titan Sentinel Tactical SUV', paintHex: 0x151a22, roofY: 1.72, barZ: -0.20 },
  { carId: 'kestrel_defender', label: 'Kestrel Defender Armored SUV', paintHex: 0x101824, roofY: 1.68, barZ: -0.24 },
  { carId: 'kodiak_hd2500', label: 'Kodiak HD2500 Police Truck', paintHex: 0x161c26, roofY: 1.76, barZ: 0.18 },
];

const ELUSIVE_HIDEOUTS: { name: string; x: number; z: number }[] = [
  { name: 'Pinewood Logging Barn', x: -3450, z: 1180 },
  { name: 'Abandoned Foundry Dock', x: 6420, z: 890 },
  { name: 'Dune Sea Smuggler Cove', x: -5120, z: 420 },
  { name: 'North Woods Ranger Clearing', x: -2100, z: -1450 },
  { name: 'Harbor Grain Silos', x: 5850, z: -640 },
  { name: 'Lakeshore Bluff Boathouse', x: 2950, z: -1920 },
];

export interface OnFootAgent {
  active: boolean;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  stamina: number;
  mesh: THREE.Group;
}

export interface PursuitUnit {
  id: string;
  carState: CarState;
  spec: CarSpec;
  carHealth: number; // 0..100
  disabled: boolean;
  mesh: THREE.Group;
  sirenBar?: THREE.Mesh[];
}

let policeSpawnSeq = 0;

function makePursuitCarMesh(
  paintHex: number,
  isPolice: boolean,
  carIdOverride?: string,
): { group: THREE.Group; sirenBar: THREE.Mesh[] } {
  const g = new THREE.Group();
  const placeholder = new THREE.Group();
  // Minimal silhouette placeholder swapped immediately for full GT-R standard Scan Car (real spinning wheels, glass, recessed LED lamps!)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.90, 0.66, 4.55),
    new THREE.MeshStandardMaterial({ color: paintHex, metalness: 0.65, roughness: 0.24 }),
  );
  body.position.y = 0.62;
  placeholder.add(body);
  g.add(placeholder);

  const fleet = isPolice ? POLICE_FLEET_UNITS[policeSpawnSeq++ % POLICE_FLEET_UNITS.length] : null;
  const targetId = carIdOverride ?? fleet?.carId ?? 'kestrel';
  const finalPaint = isPolice ? (fleet?.paintHex ?? paintHex) : paintHex;

  const sirenBar: THREE.Mesh[] = [];
  const sirenHolder = new THREE.Group();
  if (isPolice) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x12151c, metalness: 0.78, roughness: 0.28 });
    for (const sx of [-0.42, 0.42]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.20), frameMat);
      foot.position.set(sx, -0.025, 0);
      sirenHolder.add(foot);
    }
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.036, 0.23), frameMat);
    barBase.position.set(0, 0.024, 0);
    const barCap = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.018, 0.20), frameMat);
    barCap.position.set(0, 0.094, 0);
    const centerDiv = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.064, 0.22), frameMat);
    centerDiv.position.set(0, 0.062, 0);
    const redL = new THREE.Mesh(
      new THREE.BoxGeometry(0.43, 0.062, 0.21),
      new THREE.MeshStandardMaterial({ color: 0xff1e2d, emissive: 0xff1e2d, emissiveIntensity: 2.6, roughness: 0.18 }),
    );
    redL.position.set(-0.275, 0.062, 0);
    const blueR = new THREE.Mesh(
      new THREE.BoxGeometry(0.43, 0.062, 0.21),
      new THREE.MeshStandardMaterial({ color: 0x1e88ff, emissive: 0x1e88ff, emissiveIntensity: 2.6, roughness: 0.18 }),
    );
    blueR.position.set(0.275, 0.062, 0);
    sirenHolder.add(barBase, barCap, centerDiv, redL, blueR);
    sirenHolder.position.set(0, fleet?.roofY ?? 1.355, fleet?.barZ ?? -0.34);
    g.add(sirenHolder);
    sirenBar.push(redL, blueR);
  }

  // Upgrade to FULL GT-R Standard Scan Car (60k-face mesh + real spinning wheels + brake calipers + glass + recessed LED lights!)
  const scanId = hasScanCar(targetId) ? targetId : 'kestrel';
  void loadScanOpponentCar(scanId, finalPaint, 'hero').then((heroMesh) => {
    if (!heroMesh) return;
    placeholder.visible = false;
    g.remove(placeholder);
    g.add(heroMesh);
    g.userData.update = heroMesh.userData.update;
  }).catch(() => { /* keep placeholder on rare offline error */ });

  return { group: g, sirenBar };
}

function makeRunnerMesh(colorHex: number, withDuffel = false): THREE.Group {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.20, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xe2b898, roughness: 0.6 })
  );
  head.position.y = 1.66;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.72, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1c222d, roughness: 0.85 })
  );
  legs.position.y = 0.36;
  g.add(torso, head, legs);

  if (withDuffel) {
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.28, 0.56),
      new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.85 })
    );
    bag.position.set(0.34, 0.92, 0.04);
    g.add(bag);
  }
  return g;
}

function makeScenarioProp(kind: 'bank' | 'hotdog'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'bank') {
    const facade = new THREE.Mesh(
      new THREE.BoxGeometry(22, 11, 14),
      new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.85 })
    );
    facade.position.y = 5.5;
    g.add(facade);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 4.0, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x1b2432, metalness: 0.6, roughness: 0.2 })
    );
    door.position.set(0, 2.0, 7.1);
    g.add(door);
  } else {
    const cart = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.3, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xd4a024, metalness: 0.5, roughness: 0.35 })
    );
    cart.position.y = 0.75;
    const umbrella = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.7 })
    );
    umbrella.position.y = 2.6;
    g.add(cart, umbrella);
  }
  return g;
}

export class CopsAndRobbersMode {
  readonly group = new THREE.Group();
  readonly role: PursuitRole;
  readonly robberIntro: RobberIntroVariant;
  readonly suspectVehicle: SuspectVehicleProfile;
  readonly hideout: HideoutSpot;
  outcome: PursuitOutcome = 'active';
  statusText = '';
  dispatchBanner = '';

  cutsceneTimer = 4.6;
  get isCutsceneActive(): boolean {
    return this.cutsceneTimer > 0;
  }

  playerCarHealth = 100;
  playerDisabled = false;
  playerOnFoot: OnFootAgent;

  robberUnit: PursuitUnit | null = null;
  robberOnFoot: OnFootAgent;
  copUnits: PursuitUnit[] = [];
  private crewRunners: { mesh: THREE.Group; pos: THREE.Vector3; boarded: boolean }[] = [];
  private hideoutBeacon: THREE.Mesh;
  private sirenClock = 0;

  constructor(
    choice: PursuitRoleChoice,
    playerStart: THREE.Vector3,
    playerYaw: number,
    ground: (x: number, z: number) => number
  ) {
    this.role = choice === 'auto' ? (Math.random() < 0.5 ? 'cop' : 'robber') : choice;
    this.robberIntro = Math.random() < 0.5 ? 'runner' : 'getaway_driver';
    this.suspectVehicle = SUSPECT_VEHICLES[Math.floor(Math.random() * SUSPECT_VEHICLES.length)];

    // Pick a randomized elusive hideout far from start
    const candidates = ELUSIVE_HIDEOUTS.filter(
      (h) => Math.hypot(h.x - playerStart.x, h.z - playerStart.z) > 1400
    );
    const pick = (candidates.length ? candidates : ELUSIVE_HIDEOUTS)[
      Math.floor(Math.random() * (candidates.length || ELUSIVE_HIDEOUTS.length))
    ];
    this.hideout = {
      name: pick.name,
      pos: new THREE.Vector3(pick.x, ground(pick.x, pick.z), pick.z),
    };

    this.hideoutBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 90, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: this.role === 'robber' ? 0x00f5d4 : 0xff4d4d,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      })
    );
    this.hideoutBeacon.position.set(this.hideout.pos.x, this.hideout.pos.y + 45, this.hideout.pos.z);
    this.group.add(this.hideoutBeacon);

    this.playerOnFoot = {
      active: false,
      pos: playerStart.clone(),
      yaw: playerYaw,
      speed: 0,
      stamina: 100,
      mesh: makeRunnerMesh(this.role === 'cop' ? 0x1b3b6f : 0xff6b2b, this.role === 'robber'),
    };
    this.playerOnFoot.mesh.visible = false;
    this.group.add(this.playerOnFoot.mesh);

    this.robberOnFoot = {
      active: false,
      pos: playerStart.clone(),
      yaw: playerYaw,
      speed: 0,
      stamina: 100,
      mesh: makeRunnerMesh(0xff6b2b, true),
    };
    this.robberOnFoot.mesh.visible = false;
    this.group.add(this.robberOnFoot.mesh);

    const fwdX = Math.sin(playerYaw);
    const fwdZ = Math.cos(playerYaw);
    const rightX = Math.cos(playerYaw);
    const rightZ = -Math.sin(playerYaw);

    if (this.role === 'robber') {
      // Place bank prop on the curb beside the getaway car
      const bank = makeScenarioProp('bank');
      const bx = playerStart.x - rightX * 16;
      const bz = playerStart.z - rightZ * 16;
      bank.position.set(bx, ground(bx, bz), bz);
      bank.rotation.y = playerYaw + Math.PI * 0.5;
      this.group.add(bank);

      if (this.robberIntro === 'runner') {
        // Player starts ON FOOT sprinting out of the bank toward the parked getaway car!
        this.playerOnFoot.active = true;
        this.playerOnFoot.pos.set(bx + rightX * 7, ground(bx + rightX * 7, bz + rightZ * 7), bz + rightZ * 7);
        this.playerOnFoot.yaw = Math.atan2(playerStart.x - this.playerOnFoot.pos.x, playerStart.z - this.playerOnFoot.pos.z);
        this.playerOnFoot.mesh.visible = true;
        this.playerOnFoot.mesh.position.copy(this.playerOnFoot.pos);
        this.cutsceneTimer = 3.4;
        this.dispatchBanner = 'HEIST IN PROGRESS — SPRINT TO YOUR GETAWAY CAR!';
      } else {
        // Getaway driver waiting at curb while 3 crewmates sprint out of the bank into the car!
        for (let c = 0; c < 3; c++) {
          const rx = bx + rightX * 6 + fwdX * (c - 1) * 2.1;
          const rz = bz + rightZ * 6 + fwdZ * (c - 1) * 2.1;
          const runner = makeRunnerMesh(0x2b303a, true);
          runner.position.set(rx, ground(rx, rz), rz);
          this.group.add(runner);
          this.crewRunners.push({ mesh: runner, pos: runner.position.clone(), boarded: false });
        }
        this.cutsceneTimer = 4.5;
        this.dispatchBanner = 'WAIT FOR YOUR CREW TO CLEAR THE BANK — THEN FLOOR IT!';
      }

      // 3 Police Interceptors converging from a few blocks back
      const offsets: [number, number][] = [[-70, -135], [85, -165], [20, -210]];
      offsets.forEach(([ox, oz], idx) => {
        const sx = playerStart.x + ox;
        const sz = playerStart.z + oz;
        const sy = ground(sx, sz);
        const { group, sirenBar } = makePursuitCarMesh(0x111827, true);
        group.position.set(sx, sy, sz);
        this.group.add(group);
        this.copUnits.push({
          id: `cop_${idx}`,
          carState: createCarState(sx, sy, sz, playerYaw),
          spec: CARS.aurelia,
          carHealth: 100,
          disabled: false,
          mesh: group,
          sirenBar,
        });
      });
      this.statusText = this.dispatchBanner;
    } else {
      // COP MODE: Start at street-side Hot Dog Stand; all available units called to suspect vehicle!
      const stand = makeScenarioProp('hotdog');
      const hx = playerStart.x + rightX * 5.2;
      const hz = playerStart.z + rightZ * 5.2;
      stand.position.set(hx, ground(hx, hz), hz);
      stand.rotation.y = playerYaw - Math.PI * 0.5;
      this.group.add(stand);

      this.cutsceneTimer = 4.6;
      const sv = this.suspectVehicle;
      this.dispatchBanner = `APB: BANK ROBBERY! SUSPECT IN ${sv.colorName.toUpperCase()} ${sv.make.toUpperCase()} ${sv.model.toUpperCase()} — ALL UNITS RESPOND!`;
      this.statusText = this.dispatchBanner;

      // Spawn AI Robber getaway car 340m ahead on the road so the Cop has to hunt & intercept them!
      const rx = playerStart.x + fwdX * 340 + rightX * 45;
      const rz = playerStart.z + fwdZ * 340 + rightZ * 45;
      const ry = ground(rx, rz);
      const { group } = makePursuitCarMesh(sv.paintHex, false, sv.carId);
      group.position.set(rx, ry, rz);
      this.group.add(group);
      this.robberUnit = {
        id: 'robber_ai',
        carState: createCarState(rx, ry, rz, playerYaw),
        spec: sv.spec,
        carHealth: 100,
        disabled: false,
        mesh: group,
      };

      // Spawn 2 AI Backup Police Cruisers also responding to the call
      const backupOffsets: [number, number][] = [[-22, -18], [26, -24]];
      backupOffsets.forEach(([ox, oz], idx) => {
        const sx = playerStart.x + ox;
        const sz = playerStart.z + oz;
        const sy = ground(sx, sz);
        const { group: cg, sirenBar } = makePursuitCarMesh(0x111827, true);
        cg.position.set(sx, sy, sz);
        this.group.add(cg);
        this.copUnits.push({
          id: `backup_cop_${idx}`,
          carState: createCarState(sx, sy, sz, playerYaw),
          spec: CARS.aurelia,
          carHealth: 100,
          disabled: false,
          mesh: cg,
          sirenBar,
        });
      });
    }
  }

  togglePlayerOnFoot(carState: CarState, ground: (x: number, z: number) => number): boolean {
    if (this.outcome !== 'active' || this.isCutsceneActive) return false;
    if (!this.playerOnFoot.active) {
      this.playerOnFoot.active = true;
      this.playerOnFoot.pos.set(
        carState.pos.x + Math.cos(carState.yaw) * 2.2,
        ground(carState.pos.x, carState.pos.z),
        carState.pos.z - Math.sin(carState.yaw) * 2.2
      );
      this.playerOnFoot.yaw = carState.yaw;
      this.playerOnFoot.mesh.visible = true;
      this.playerOnFoot.mesh.position.copy(this.playerOnFoot.pos);
      carState.vel.multiplyScalar(0.2);
      return true;
    }
    if (!this.playerDisabled && this.playerOnFoot.pos.distanceTo(carState.pos) < 5.5) {
      this.playerOnFoot.active = false;
      this.playerOnFoot.mesh.visible = false;
      return false;
    }
    return this.playerOnFoot.active;
  }

  step(
    dt: number,
    playerCarState: CarState,
    playerInput: CarInput,
    ground: (x: number, z: number) => number,
    surfaceAt: (x: number, z: number) => SurfaceType
  ): void {
    if (this.outcome !== 'active') return;
    this.sirenClock += dt;

    // ── Opening Scenario Cutscene ──
    if (this.cutsceneTimer > 0) {
      this.cutsceneTimer = Math.max(0, this.cutsceneTimer - dt);
      if (this.role === 'robber') {
        if (this.robberIntro === 'runner' && this.playerOnFoot.active) {
          // Auto-sprint out of the bank toward the parked getaway car
          const dx = playerCarState.pos.x - this.playerOnFoot.pos.x;
          const dz = playerCarState.pos.z - this.playerOnFoot.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 2.2) {
            const yaw = Math.atan2(dx, dz);
            this.playerOnFoot.yaw = yaw;
            this.playerOnFoot.pos.x += Math.sin(yaw) * 7.2 * dt;
            this.playerOnFoot.pos.z += Math.cos(yaw) * 7.2 * dt;
            this.playerOnFoot.pos.y = ground(this.playerOnFoot.pos.x, this.playerOnFoot.pos.z);
            this.playerOnFoot.mesh.position.copy(this.playerOnFoot.pos);
            this.playerOnFoot.mesh.rotation.y = yaw;
          } else {
            this.playerOnFoot.active = false;
            this.playerOnFoot.mesh.visible = false;
            this.cutsceneTimer = 0;
          }
        } else if (this.robberIntro === 'getaway_driver') {
          // Crew sprints out of the bank and dives into the idling getaway car
          let allBoarded = true;
          for (const cr of this.crewRunners) {
            if (cr.boarded) continue;
            const dx = playerCarState.pos.x - cr.pos.x;
            const dz = playerCarState.pos.z - cr.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 2.0) {
              allBoarded = false;
              const yaw = Math.atan2(dx, dz);
              cr.pos.x += Math.sin(yaw) * 6.8 * dt;
              cr.pos.z += Math.cos(yaw) * 6.8 * dt;
              cr.pos.y = ground(cr.pos.x, cr.pos.z);
              cr.mesh.position.copy(cr.pos);
              cr.mesh.rotation.y = yaw;
            } else {
              cr.boarded = true;
              cr.mesh.visible = false;
            }
          }
          if (allBoarded) this.cutsceneTimer = 0;
        }
      }
      this.statusText = this.cutsceneTimer > 0
        ? this.dispatchBanner
        : this.role === 'robber'
        ? `CREW IN! ESCAPE TO ${this.hideout.name.toUpperCase()}!`
        : this.dispatchBanner;
      if (this.cutsceneTimer > 0) return;
    }

    // 1. Player on-foot movement if bailed out
    if (this.playerOnFoot.active) {
      const turn = playerInput.steer * 2.8 * dt;
      this.playerOnFoot.yaw += turn;
      const move = (playerInput.throttle - playerInput.brake) * (playerInput.handbrake ? 11.2 : 8.2);
      this.playerOnFoot.speed = move;
      this.playerOnFoot.pos.x += Math.sin(this.playerOnFoot.yaw) * move * dt;
      this.playerOnFoot.pos.z += Math.cos(this.playerOnFoot.yaw) * move * dt;
      this.playerOnFoot.pos.y = ground(this.playerOnFoot.pos.x, this.playerOnFoot.pos.z);
      this.playerOnFoot.mesh.position.copy(this.playerOnFoot.pos);
      this.playerOnFoot.mesh.rotation.y = this.playerOnFoot.yaw;
    }

    const playerPos = this.playerOnFoot.active ? this.playerOnFoot.pos : playerCarState.pos;

    if (this.role === 'robber') {
      for (const cop of this.copUnits) {
        this.animateSiren(cop);
        if (cop.disabled) continue;

        const dx = playerPos.x - cop.carState.pos.x;
        const dz = playerPos.z - cop.carState.pos.z;
        const dist = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - cop.carState.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        const aiInput: CarInput = {
          throttle: dist > 6 ? 0.96 : 0.45,
          brake: Math.abs(diff) > 0.8 && cop.carState.speedMps > 20 ? 0.6 : 0,
          steer: THREE.MathUtils.clamp(diff * 1.8, -1, 1),
          handbrake: false,
        };
        stepCarPhysics(cop.carState, cop.spec, aiInput, dt, ground, surfaceAt, []);
        cop.mesh.position.copy(cop.carState.pos);
        cop.mesh.rotation.y = cop.carState.yaw;
        (cop.mesh.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number) => void) | undefined)?.(cop.carState.forwardSpeed, cop.carState.steerAngle, dt, true, aiInput.brake);

        if (!this.playerOnFoot.active && dist < 3.6) {
          const relSpeed = cop.carState.vel.distanceTo(playerCarState.vel);
          this.playerCarHealth = Math.max(0, this.playerCarHealth - (8 + relSpeed * 0.9) * dt * 3.5);
          if (this.playerCarHealth <= 0 && !this.playerDisabled) {
            this.playerDisabled = true;
            this.togglePlayerOnFoot(playerCarState, ground);
          }
        }
        if (this.playerOnFoot.active && dist < 2.6) {
          this.outcome = 'cop_win';
          this.statusText = 'BUSTED! POLICE CAUGHT YOU ON FOOT!';
          return;
        }
      }

      const distHideout = Math.hypot(playerPos.x - this.hideout.pos.x, playerPos.z - this.hideout.pos.z);
      if (distHideout < 22) {
        this.outcome = 'robber_escaped';
        this.statusText = `ESCAPED TO ${this.hideout.name.toUpperCase()}!`;
      } else {
        this.statusText = this.playerOnFoot.active
          ? `ON FOOT · ${Math.round(distHideout)}m TO ${this.hideout.name.toUpperCase()}`
          : `CAR ${Math.round(this.playerCarHealth)}% · ${Math.round(distHideout)}m TO ${this.hideout.name.toUpperCase()}`;
      }
    } else if (this.robberUnit) {
      const rob = this.robberUnit;
      const suspectTarget = rob.disabled && this.robberOnFoot.active ? this.robberOnFoot.pos : rob.carState.pos;

      // Backup AI police cruisers also pursue the suspect!
      for (const cop of this.copUnits) {
        this.animateSiren(cop);
        const dx = suspectTarget.x - cop.carState.pos.x;
        const dz = suspectTarget.z - cop.carState.pos.z;
        const dist = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - cop.carState.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        stepCarPhysics(
          cop.carState,
          cop.spec,
          {
            throttle: dist > 8 ? 0.90 : 0.35,
            brake: Math.abs(diff) > 0.8 && cop.carState.speedMps > 20 ? 0.55 : 0,
            steer: THREE.MathUtils.clamp(diff * 1.7, -1, 1),
            handbrake: false,
          },
          dt,
          ground,
          surfaceAt,
          []
        );
        cop.mesh.position.copy(cop.carState.pos);
        cop.mesh.rotation.y = cop.carState.yaw;
        (cop.mesh.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number) => void) | undefined)?.(cop.carState.forwardSpeed, cop.carState.steerAngle, dt, true, 0);
      }

      if (!rob.disabled) {
        const dx = this.hideout.pos.x - rob.carState.pos.x;
        const dz = this.hideout.pos.z - rob.carState.pos.z;
        const distH = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - rob.carState.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        stepCarPhysics(
          rob.carState,
          rob.spec,
          {
            throttle: 0.90,
            brake: Math.abs(diff) > 0.75 && rob.carState.speedMps > 22 ? 0.5 : 0,
            steer: THREE.MathUtils.clamp(diff * 1.6, -1, 1),
            handbrake: false,
          },
          dt,
          ground,
          surfaceAt,
          []
        );
        rob.mesh.position.copy(rob.carState.pos);
        rob.mesh.rotation.y = rob.carState.yaw;
        (rob.mesh.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number) => void) | undefined)?.(rob.carState.forwardSpeed, rob.carState.steerAngle, dt, true, 0);

        const hitDist = playerCarState.pos.distanceTo(rob.carState.pos);
        if (!this.playerOnFoot.active && hitDist < 3.8) {
          const impact = playerCarState.vel.distanceTo(rob.carState.vel);
          rob.carHealth = Math.max(0, rob.carHealth - (12 + impact * 1.6));
          if (rob.carHealth <= 0) {
            rob.disabled = true;
            this.robberOnFoot.active = true;
            this.robberOnFoot.pos.set(
              rob.carState.pos.x + 2.4,
              ground(rob.carState.pos.x + 2.4, rob.carState.pos.z),
              rob.carState.pos.z
            );
            this.robberOnFoot.mesh.visible = true;
          }
        }
        if (distH < 20) {
          this.outcome = 'robber_escaped';
          this.statusText = `SUSPECT ESCAPED TO ${this.hideout.name.toUpperCase()}!`;
          return;
        }
        const sv = this.suspectVehicle;
        this.statusText = `APB: ${sv.colorName.toUpperCase()} ${sv.make.toUpperCase()} ${sv.model.toUpperCase()} · ${Math.round(rob.carHealth)}% · ${Math.round(hitDist)}m`;
      } else if (this.robberOnFoot.active) {
        const dx = this.hideout.pos.x - this.robberOnFoot.pos.x;
        const dz = this.hideout.pos.z - this.robberOnFoot.pos.z;
        const distH = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        this.robberOnFoot.yaw = yaw;
        this.robberOnFoot.pos.x += Math.sin(yaw) * 7.8 * dt;
        this.robberOnFoot.pos.z += Math.cos(yaw) * 7.8 * dt;
        this.robberOnFoot.pos.y = ground(this.robberOnFoot.pos.x, this.robberOnFoot.pos.z);
        this.robberOnFoot.mesh.position.copy(this.robberOnFoot.pos);
        this.robberOnFoot.mesh.rotation.y = yaw;

        const catchDist = playerPos.distanceTo(this.robberOnFoot.pos);
        if (catchDist < 2.8) {
          this.outcome = 'cop_win';
          this.statusText = this.playerOnFoot.active
            ? 'ARRESTED ON FOOT! SUSPECT IN CUSTODY!'
            : 'SUSPECT INTERCEPTED!';
          return;
        }
        if (distH < 18) {
          this.outcome = 'robber_escaped';
          this.statusText = `SUSPECT SLIPPED AWAY ON FOOT TO ${this.hideout.name.toUpperCase()}!`;
          return;
        }
        this.statusText = `SUSPECT ON FOOT! [F] CHASE ON FOOT · ${Math.round(catchDist)}m AWAY`;
      }
    }
  }

  private animateSiren(unit: PursuitUnit): void {
    if (!unit.sirenBar || unit.sirenBar.length < 2) return;
    const flash = Math.floor(this.sirenClock * 8) % 2 === 0;
    const m0 = unit.sirenBar[0].material as THREE.MeshStandardMaterial;
    const m1 = unit.sirenBar[1].material as THREE.MeshStandardMaterial;
    m0.emissiveIntensity = flash ? 3.2 : 0.2;
    m1.emissiveIntensity = flash ? 0.2 : 3.2;
  }
}

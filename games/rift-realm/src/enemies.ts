// Enemy Soul Vessels (Cyber-Golems & Void-Stalkers) that fight in the tournament arena.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import { assets, CharacterRig } from './characters';

export interface Enemy {
  id: number;
  mesh: THREE.Group;
  hitTarget: THREE.Mesh;
  core: THREE.Mesh;
  coreMat: THREE.MeshStandardNodeMaterial;
  hp: number;
  maxHp: number;
  speed: number;
  strafeSign: number;
  attackCooldown: number;
  staggered: boolean;
  rig: CharacterRig | null;
  lastPos: THREE.Vector3;
}

export class EnemyManager {
  readonly group = new THREE.Group();
  enemies: Enemy[] = [];
  private nextId = 1;
  wave = 1;

  constructor(scene: THREE.Scene, private world: CollisionWorld, private spots: THREE.Vector3[]) {
    scene.add(this.group);
    this.spawnWave(3);
  }

  spawnWave(count: number) {
    const pool = [...this.spots].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const s = pool[i % pool.length];
      this.spawnOne(s.x, s.z, s.y);
    }
  }

  private spawnOne(x: number, z: number, y = 0) {
    const mesh = new THREE.Group();
    mesh.position.set(x, y, z);

    const chassisMat = new THREE.MeshStandardNodeMaterial({
      color: 0x1e1b2e, roughness: 0.35, metalness: 0.8,
    });
    const coreMat = new THREE.MeshStandardNodeMaterial({
      color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 1.8, roughness: 0.15,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.75), chassisMat);
    body.position.y = 1.05;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), coreMat);
    core.position.set(0, 1.15, 0.38);

    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), chassisMat);
    head.position.y = 1.95;

    // Invisible slightly generous hitbox for crisp shooter feel
    const hitTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 2.1, 8),
      new THREE.MeshBasicNodeMaterial({ visible: false }),
    );
    hitTarget.position.y = 1.05;
    hitTarget.userData.enemyId = this.nextId;

    let rig: CharacterRig | null = null;
    if (assets.paladin) {
      rig = new CharacterRig(assets.paladin, 2.0);
      mesh.add(rig.root, core, hitTarget);
      core.visible = false; // the Paladin has its own glowing trim
    } else {
      mesh.add(body, core, head, hitTarget);
    }
    this.group.add(mesh);

    const maxHp = 60 + (this.wave - 1) * 15;
    this.enemies.push({
      id: this.nextId++,
      mesh,
      hitTarget,
      core,
      coreMat,
      hp: maxHp,
      maxHp,
      speed: 2.6 + Math.random() * 1.4,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      attackCooldown: 1.5 + Math.random(),
      staggered: false,
      rig,
      lastPos: mesh.position.clone(),
    });
  }

  getHitMeshes(): THREE.Object3D[] {
    return this.enemies.map((e) => e.hitTarget);
  }

  damageEnemy(id: number, amount: number, knockbackDir?: THREE.Vector3, knockbackDist = 0): { killed: boolean; pos: THREE.Vector3 } | null {
    const idx = this.enemies.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const e = this.enemies[idx];
    e.hp -= amount;
    if (e.hp > 0) e.rig?.play('hit', 0.8);
    if (e.hp > 0 && e.hp <= e.maxHp * 0.35 && !e.staggered) {
      e.staggered = true;
      e.coreMat.color.setHex(0xfbbf24);
      e.coreMat.emissive.setHex(0xfef08a);
      e.coreMat.emissiveIntensity = 3.0;
    }
    if (knockbackDir && knockbackDist > 0) {
      e.mesh.position.addScaledVector(knockbackDir, knockbackDist);
    }
    const pos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0));

    if (e.hp <= 0) {
      this.group.remove(e.mesh);
      this.enemies.splice(idx, 1);
      if (this.enemies.length === 0) {
        this.wave++;
        this.spawnWave(Math.min(8, 2 + this.wave));
      }
      return { killed: true, pos };
    }
    return { killed: false, pos };
  }

  update(dt: number, pulse: number, playerPos: THREE.Vector3, world: CollisionWorld, onPlayerHit: (dmg: number) => void) {
    for (const e of this.enemies) {
      const toPlayer = new THREE.Vector3().subVectors(playerPos, e.mesh.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 0.01) toPlayer.divideScalar(dist);

      // Face player
      e.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

      // Pulse core on the beat
      e.core.scale.setScalar(1 + pulse * 0.35);

      // Advance if far, strafe if in mid-range
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(e.strafeSign);
      if (dist > 6.5) {
        e.mesh.position.addScaledVector(toPlayer, e.speed * dt);
      } else if (dist < 4.0) {
        e.mesh.position.addScaledVector(toPlayer, -e.speed * 0.6 * dt);
      }
      e.mesh.position.addScaledVector(strafe, e.speed * 0.45 * dt);
      // follow the terrain (stairs, ring, pit) and slide along walls
      const gy = world.groundAt(e.mesh.position.x, e.mesh.position.z, e.mesh.position.y + 1.2, 6);
      if (gy !== null) e.mesh.position.y += (gy - e.mesh.position.y) * Math.min(1, dt * 14);
      world.resolve(e.mesh.position, 0.5, 2.0);
      if (e.rig) {
        const mv = e.mesh.position.distanceTo(e.lastPos) / Math.max(dt, 1e-3);
        const dx = e.mesh.position.x - e.lastPos.x, dz = e.mesh.position.z - e.lastPos.z, ry = e.mesh.rotation.y;
        e.rig.update(dt, mv, dx * Math.cos(ry) - dz * Math.sin(ry), dx * Math.sin(ry) + dz * Math.cos(ry));
        e.lastPos.copy(e.mesh.position);
      }

      // Melee / Void-pulse attack when close
      e.attackCooldown -= dt;
      if (dist < 2.6 && e.attackCooldown <= 0) {
        e.attackCooldown = 1.4;
        e.rig?.play('attack_1');
        onPlayerHit(10);
      }
    }
  }
}

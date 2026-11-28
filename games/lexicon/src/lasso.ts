// The Word Lasso: luminous cyan lariat that catches wild fleeing words in the open world
// and pulls/grapples ancient brass puzzle rings, sluice levers, and ledges.
import * as THREE from 'three/webgpu';
import { mat, PAL, textSprite } from './world';
import type { WildWordDef } from './content';

export interface WildWordActor {
  def: WildWordDef;
  x: number;
  y: number;
  z: number;
  caught: boolean;
  reeling: boolean;
  reelT: number;
  phase: number;
  group: THREE.Group;
  ring: THREE.Mesh;
}

export interface GrappleAnchor {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Object3D;
  onPull: () => void;
}

export interface LassoSystem {
  readonly active: boolean;
  readonly wildWords: WildWordActor[];
  setLevel(
    scene: THREE.Scene,
    defs: WildWordDef[],
    alreadyHave: Set<string>,
    heightAt: (x: number, z: number) => number,
    anchors?: GrappleAnchor[],
  ): void;
  /** Fire the Word Lasso from the Scribe (or Elk-back) toward the best target within 16 m. */
  cast(
    px: number, py: number, pz: number, yaw: number,
    onCatchWord: (def: WildWordDef) => void,
    onPullAnchor?: (a: GrappleAnchor) => void,
    onStunEnemy?: (x: number, z: number) => boolean,
  ): { hit: boolean; kind?: 'word' | 'anchor' | 'enemy'; label?: string };
  update(dt: number, t: number, px: number, py: number, pz: number, heightAt: (x: number, z: number) => number): void;
  /** Nearest un-caught wild word for HUD / guide beacon targeting. */
  nearestUncaught(px: number, pz: number, tutorialOnly?: boolean): WildWordActor | null;
  dispose(scene: THREE.Scene): void;
}

export function createLassoSystem(): LassoSystem {
  let wildWords: WildWordActor[] = [];
  let anchors: GrappleAnchor[] = [];
  let hostScene: THREE.Scene | null = null;

  // Visual cyan lariat beam + capture halo
  const SEG = 18;
  const linePos = new Float32Array((SEG + 1) * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0.95 });
  const ropeLine = new THREE.Line(lineGeo, lineMat);
  ropeLine.visible = false;
  ropeLine.frustumCulled = false;

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.65, 0.045, 8, 24).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0.9 }),
  );
  halo.visible = false;

  let castTimer = 0;
  const targetPos = new THREE.Vector3();
  let reelingWord: WildWordActor | null = null;
  let pendingCatchCb: ((def: WildWordDef) => void) | null = null;

  function clearActors() {
    if (hostScene) {
      for (const w of wildWords) hostScene.remove(w.group);
      hostScene.remove(ropeLine, halo);
    }
    wildWords = [];
    anchors = [];
    reelingWord = null;
    pendingCatchCb = null;
    castTimer = 0;
    ropeLine.visible = false;
    halo.visible = false;
  }

  return {
    get active() { return castTimer > 0 || !!reelingWord; },
    get wildWords() { return wildWords; },

    setLevel(scene, defs, alreadyHave, heightAt, levelAnchors = []) {
      clearActors();
      hostScene = scene;
      anchors = levelAnchors;
      scene.add(ropeLine, halo);

      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        const caught = alreadyHave.has(def.word);
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat(PAL.brass, 0xffd066));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 24), mat(PAL.cyan, 0x5be8ee));
        const label = textSprite(def.word, {
          size: 54, scale: 0.58, color: '#fff4cc', bg: 'rgba(20,26,46,.72)',
        });
        label.position.y = 0.85;
        g.add(core, ring, label);
        const y0 = heightAt(def.pos[0], def.pos[1]) + 1.85;
        g.position.set(def.pos[0], y0, def.pos[1]);
        g.visible = !caught;
        scene.add(g);

        wildWords.push({
          def, x: def.pos[0], y: y0, z: def.pos[1],
          caught, reeling: false, reelT: 0, phase: i * 1.7,
          group: g, ring,
        });
      }
    },

    cast(px, py, pz, yaw, onCatchWord, onPullAnchor, onStunEnemy) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const RANGE = 16.5;

      // 1. Prioritize wild fleeing words within range & generous forward cone
      let bestWord: WildWordActor | null = null;
      let bestScore = Infinity;
      for (const w of wildWords) {
        if (w.caught || w.reeling) continue;
        const dx = w.x - px, dz = w.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > RANGE) continue;
        const dot = (dx * fx + dz * fz) / Math.max(d, 0.01);
        if (d > 4.5 && dot < 0.25) continue;
        const sc = d * (1.35 - 0.35 * Math.max(0, dot));
        if (sc < bestScore) { bestScore = sc; bestWord = w; }
      }
      if (bestWord) {
        bestWord.reeling = true;
        bestWord.reelT = 0;
        reelingWord = bestWord;
        pendingCatchCb = onCatchWord;
        castTimer = 0.55;
        targetPos.set(bestWord.x, bestWord.y, bestWord.z);
        return { hit: true, kind: 'word', label: bestWord.def.word };
      }

      // 2. Check Grapple / Pulley Anchors (mirrors, sluice levers, crane rings)
      let bestAnchor: GrappleAnchor | null = null;
      bestScore = Infinity;
      for (const a of anchors) {
        const dx = a.x - px, dz = a.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > RANGE) continue;
        const dot = (dx * fx + dz * fz) / Math.max(d, 0.01);
        if (d > 4.0 && dot < 0.3) continue;
        if (d < bestScore) { bestScore = d; bestAnchor = a; }
      }
      if (bestAnchor) {
        castTimer = 0.42;
        targetPos.set(bestAnchor.x, bestAnchor.y, bestAnchor.z);
        bestAnchor.onPull();
        onPullAnchor?.(bestAnchor);
        return { hit: true, kind: 'anchor', label: bestAnchor.label };
      }

      // 3. Otherwise cast forward to yank/stun an enemy or show a crisp miss-arc
      const tx = px + fx * 9.5, tz = pz + fz * 9.5;
      castTimer = 0.28;
      targetPos.set(tx, py + 1.4, tz);
      if (onStunEnemy && onStunEnemy(tx, tz)) {
        return { hit: true, kind: 'enemy' };
      }
      return { hit: false };
    },

    update(dt, t, px, py, pz, heightAt) {
      for (const w of wildWords) {
        if (w.caught) continue;
        w.ring.rotation.y = t * 2.4 + w.phase;
        w.ring.rotation.x = Math.sin(t * 1.7 + w.phase) * 0.5;

        if (w.reeling) {
          w.reelT += dt * 2.4;
          const k = Math.min(1, w.reelT);
          w.x += (px - w.x) * Math.min(1, dt * 9);
          w.z += (pz - w.z) * Math.min(1, dt * 9);
          w.y += (py + 1.4 - w.y) * Math.min(1, dt * 9);
          w.group.position.set(w.x, w.y, w.z);
          targetPos.set(w.x, w.y, w.z);
          if (k >= 1 || Math.hypot(w.x - px, w.z - pz) < 1.3) {
            w.caught = true;
            w.reeling = false;
            w.group.visible = false;
            const cb = pendingCatchCb;
            reelingWord = null;
            pendingCatchCb = null;
            cb?.(w.def);
          }
          continue;
        }

        // Playful hovering & fleeing when the Scribe approaches (stays near its home territory)
        const dx = w.x - px, dz = w.z - pz;
        const d = Math.hypot(dx, dz);
        if (w.def.fleeSpeed > 0 && d < 12 && d > 0.1) {
          // Orbit & dart away tangentially so chasing on foot or Elk-back feels thrilling!
          const awayX = dx / d, awayZ = dz / d;
          const tangX = -awayZ * (w.phase % 2 > 1 ? 1 : -1), tangZ = awayX * (w.phase % 2 > 1 ? 1 : -1);
          const hx = w.def.pos[0] - w.x, hz = w.def.pos[1] - w.z;
          const hd = Math.hypot(hx, hz);
          const pull = hd > 16 ? 0.85 : 0.12;
          const vx = awayX * 0.65 + tangX * 0.55 + (hd > 0.1 ? (hx / hd) * pull : 0);
          const vz = awayZ * 0.65 + tangZ * 0.55 + (hd > 0.1 ? (hz / hd) * pull : 0);
          const vl = Math.hypot(vx, vz) || 1;
          w.x += (vx / vl) * w.def.fleeSpeed * dt;
          w.z += (vz / vl) * w.def.fleeSpeed * dt;
        } else {
          // Gentle figure-8 drift around home
          const targetX = w.def.pos[0] + Math.sin(t * 0.9 + w.phase) * 1.8;
          const targetZ = w.def.pos[1] + Math.cos(t * 0.7 + w.phase) * 1.8;
          w.x += (targetX - w.x) * Math.min(1, dt * 1.5);
          w.z += (targetZ - w.z) * Math.min(1, dt * 1.5);
        }
        w.y = heightAt(w.x, w.z) + 1.85 + Math.sin(t * 3.0 + w.phase) * 0.35;
        w.group.position.set(w.x, w.y, w.z);
      }

      if (castTimer > 0 || reelingWord) {
        castTimer = Math.max(0, castTimer - dt);
        ropeLine.visible = true;
        halo.visible = true;
        const sx = px, sy = py + 1.25, sz = pz;
        const posAttr = lineGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i <= SEG; i++) {
          const u = i / SEG;
          const whip = Math.sin(u * Math.PI) * Math.sin(t * 28 + u * 8) * 0.25 * (1 - u * 0.5);
          const sag = Math.sin(u * Math.PI) * 0.45;
          posAttr.setXYZ(
            i,
            sx + (targetPos.x - sx) * u + whip,
            sy + (targetPos.y - sy) * u + sag,
            sz + (targetPos.z - sz) * u - whip * 0.6,
          );
        }
        posAttr.needsUpdate = true;
        halo.position.copy(targetPos);
        halo.rotation.z = t * 9;
        const s = 0.8 + Math.sin(t * 18) * 0.15;
        halo.scale.setScalar(s);
      } else {
        ropeLine.visible = false;
        halo.visible = false;
      }
    },

    nearestUncaught(px, pz, tutorialOnly = false) {
      let best: WildWordActor | null = null;
      let bd = Infinity;
      for (const w of wildWords) {
        if (w.caught) continue;
        if (tutorialOnly && !w.def.isFirstTutorial) continue;
        const d = Math.hypot(w.x - px, w.z - pz);
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    },

    dispose() {
      clearActors();
    },
  };
}

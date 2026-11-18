// Rift Realm's side of the rule player (docs/game-studio-unified-plan.md Phase 2). A level opened from the
// Game Studio carries rules; this file gives the shared RulePlayer a host in this game: story text and a
// timer on the HUD, tagged enemy waves and bosses, a boss bar, goal beacons over the goal areas, item
// pickups, and the end-of-level card. Every rule that fires goes back to the Studio's play log.
//
// main.ts creates it after the project level arrives, calls start() when the player first enters, update()
// each frame, and playerDowned() where the player's health runs out.

import * as THREE from 'three/webgpu';
import { RulePlayer, type RuleHost } from '../../../../services/gamestudio/rulePlayer';
import type { GameLevel, Vec3 } from '../../../../services/gamestudio/schema';
import { GAME_SOURCE } from '../../../../services/gamestudio/runtime';
import type { EnemyManager, Enemy } from '../enemies';
import type { PlayerController } from '../player';

export interface RulesDeps {
  scene: THREE.Scene;
  enemies: EnemyManager;
  player: PlayerController;
  respawn: () => void;
  groundAt: (x: number, z: number, y: number) => number | null;
  /** Where pickups can go when the level has no pickup markers. */
  fallbackSpots: THREE.Vector3[];
  level: GameLevel;
  names: Record<string, string>;
}

const CSS = `
.rr-story{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);max-width:min(640px,86vw);padding:12px 18px;border-radius:10px;background:#07090fd9;border:1px solid #fbbf2455;color:#f1e9d2;font:500 15px/1.45 Georgia,serif;text-align:center;z-index:14;pointer-events:none;transition:opacity .6s;opacity:0}
.rr-story.on{opacity:1}
.rr-timer{position:fixed;top:58px;left:50%;transform:translateX(-50%);font:700 22px/1 Segoe UI,sans-serif;letter-spacing:.08em;color:#fde68a;text-shadow:0 0 8px #000;z-index:13;pointer-events:none}
.rr-boss{position:fixed;top:92px;left:50%;transform:translateX(-50%);width:min(460px,70vw);z-index:13;pointer-events:none;font:700 12px Segoe UI,sans-serif;letter-spacing:.14em;color:#fecaca;text-align:center;text-shadow:0 0 6px #000}
.rr-boss i{display:block;margin-top:5px;height:8px;border-radius:4px;background:#3f0d12;overflow:hidden;border:1px solid #f43f5e88}
.rr-boss b{display:block;height:100%;background:linear-gradient(90deg,#f43f5e,#fb7185);transition:width .15s}
.rr-toast{position:fixed;right:18px;top:120px;padding:8px 12px;border-radius:8px;background:#0b1220e6;border:1px solid #4ade8066;color:#bbf7d0;font:600 12.5px Segoe UI,sans-serif;z-index:14;pointer-events:none;transition:opacity .4s;opacity:0}
.rr-toast.on{opacity:1}
.rr-end{position:fixed;inset:0;display:grid;place-items:center;background:#02040acc;z-index:30;font:600 15px Segoe UI,sans-serif;color:#e2e8f0}
.rr-end div{text-align:center}
.rr-end h2{margin:0 0 8px;font:800 40px/1 Segoe UI,sans-serif;letter-spacing:.12em}
`;

function el(cls: string, parent: HTMLElement = document.body) {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

const toStudio = (msg: object) => {
  if (window.parent !== window) window.parent.postMessage({ source: GAME_SOURCE, ...msg }, '*');
};

export function createRules(d: RulesDeps) {
  const name = (kind: string, id: string) => d.names[`${kind}:${id}`];
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const story = el('rr-story');
  const timer = el('rr-timer');
  const toast = el('rr-toast');
  const bossBox = el('rr-boss'); bossBox.style.display = 'none';
  let storyT: number | undefined, toastT: number | undefined;
  let boss: Enemy | null = null;
  let bossBar: HTMLElement | null = null;

  const showToast = (text: string) => {
    toast.textContent = text; toast.classList.add('on');
    window.clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('on'), 2600);
  };
  const endCard = (won: boolean, nextName?: string) => {
    const card = el('rr-end');
    card.innerHTML = `<div><h2 style="color:${won ? '#fde68a' : '#fca5a5'}">${won ? 'LEVEL COMPLETE' : 'LEVEL LOST'}</h2><p></p></div>`;
    card.querySelector('p')!.textContent = won ? (nextName ? `Next: ${nextName}` : 'The end of the story.') : 'Try again from the Studio.';
    if (document.pointerLockElement) document.exitPointerLock();
    d.player.enabled = false;
  };

  const host: RuleHost = {
    showText(text) {
      story.textContent = text; story.classList.add('on');
      window.clearTimeout(storyT);
      storyT = window.setTimeout(() => story.classList.remove('on'), Math.min(12000, 3500 + text.length * 45));
    },
    spawnWave(count, who, wave) { d.enemies.spawnTagged(count, who, wave); },
    spawnBoss(who, wave) {
      boss = d.enemies.spawnBoss(who, wave, d.player.object.position);
      bossBox.style.display = '';
      bossBox.innerHTML = '';
      bossBox.append(document.createTextNode((name('cast', who) ?? who ?? 'Boss').toUpperCase()));
      const track = document.createElement('i'); bossBar = document.createElement('b'); track.appendChild(bossBar); bossBox.appendChild(track);
    },
    giveItem(item) { showToast(`Got: ${name('item', item) ?? item}`); },
    setTimer(s) {
      timer.style.display = s === null ? 'none' : '';
      if (s !== null) { const t = Math.ceil(s); timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
    },
    win(next) {
      d.enemies.clear(); bossBox.style.display = 'none';
      endCard(true, next ? name('level', next) ?? next : undefined);
      toStudio({ type: 'levelEnd', result: 'won', ...(next ? { next } : {}) });
    },
    lose() {
      d.enemies.clear(); bossBox.style.display = 'none';
      endCard(false);
      toStudio({ type: 'levelEnd', result: 'lost' });
    },
    restartFromCheckpoint() { d.respawn(); showToast('Back to the checkpoint'); },
    fired(r, sentence) { toStudio({ type: 'rule', ruleId: r.id, sentence }); },
  };

  const player = new RulePlayer(d.level.rules, d.level.zones, host, name);
  d.enemies.onKilled = (e) => {
    if (e === boss) { boss = null; bossBox.style.display = 'none'; }
    player.enemyDown(e.who, e.ruleWave);
  };

  // goal beacons: show the goal before the path (canon "goal-in-sight")
  const beacons = new THREE.Group();
  d.scene.add(beacons);
  for (const z of player.goalZones()) {
    const [w, h, dd] = z.box!.size;
    const [cx, cy, cz] = z.box!.center;
    const floor = d.groundAt(cx, cz, cy + h) ?? cy - h / 2;
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0x4ade80, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, dd) / 2, Math.min(w, dd) / 2, 14, 32, 1, true), mat);
    col.position.set(cx, floor + 7, cz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.min(w, dd) / 2 - 0.2, Math.min(w, dd) / 2, 48), new THREE.MeshBasicNodeMaterial({ color: 0x86efac, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, floor + 0.05, cz);
    beacons.add(col, ring);
  }

  // pickups for "collect" goals: the level's pickup markers, else spots spread away from the start
  const pickups: { mesh: THREE.Mesh; item: string }[] = [];
  const markerSpots = d.level.markers.filter(m => m.kind === 'pickup').map(m => new THREE.Vector3(...m.pos));
  const start = d.player.object.position.clone();
  const spare = [...d.fallbackSpots].sort((a, b) => b.distanceToSquared(start) - a.distanceToSquared(start));
  for (const want of player.wantedItems()) {
    for (let i = 0; i < want.count; i++) {
      const at = markerSpots.shift() ?? spare.shift();
      if (!at) break;
      const y = d.groundAt(at.x, at.z, at.y + 2) ?? at.y;
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardNodeMaterial({ color: 0xfde68a, emissive: 0xfbbf24, emissiveIntensity: 2.2 }));
      mesh.position.set(at.x, y + 1.2, at.z);
      d.scene.add(mesh);
      pickups.push({ mesh, item: want.item });
    }
  }

  return {
    player,
    get active() { return player.active; },
    title: d.level.name,
    start() { if (player.active) player.start(); },
    playerDowned() { player.playerDowned(); },
    update(dt: number, pointHeldSeconds: number, score: number) {
      const p = d.player.object.position;
      const pos: Vec3 = [p.x, p.y, p.z];
      for (let i = pickups.length - 1; i >= 0; i--) {
        const k = pickups[i];
        k.mesh.rotation.y += dt * 2;
        if (k.mesh.position.distanceTo(p) < 1.8 || Math.hypot(k.mesh.position.x - p.x, k.mesh.position.z - p.z) < 1.2) {
          d.scene.remove(k.mesh); pickups.splice(i, 1);
          showToast(`Found: ${name('item', k.item) ?? k.item}`);
          player.collected(k.item);
        }
      }
      for (const b of beacons.children) if (b instanceof THREE.Mesh && b.geometry instanceof THREE.CylinderGeometry) b.rotation.y += dt * 0.4;
      if (boss && bossBar) bossBar.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
      player.tick(dt, { player: pos, pointHeldSeconds, hp: d.player.hp, score });
    },
  };
}

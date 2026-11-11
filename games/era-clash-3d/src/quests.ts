// Quests for Chapter I in the city of Otsu-no-ura (docs/era-clash-3d-city-plan.md): the main way to the castle and
// the deeds the city needs on the way. Each quest is a list of steps; a step is a place to reach, a band to beat,
// or something to do where you stand (G, the grab key). The tracked quest's step shows on the HUD, as a marker in
// the world with its distance, and as a pin on the compass; the pause menu carries the log.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './core/character';

export interface QuestCtx {
  hero(): THREE.Vector3;
  camera: THREE.Camera;
  scene: THREE.Scene;
  heightAt(x: number, z: number): number;
  /** Spawn a band of raiders around `at`; returns a function counting how many still stand. */
  band(at: THREE.Vector3, n: number, name: string, spread?: number): () => number;
  section(): number;
  waveClear(): boolean;
  captives(): { saved: number; total: number };
  card(title: string, sub: string): void;
  sfx(name: string): void;
  heal(frac: number): void;
  /** The castle's main gate swings open (the seal is shown). */
  openGate(): void;
  douse(i: number): void;
}

interface Step {
  text: (q: QuestState) => string;
  /** Where the marker points (null: nowhere). */
  at?: (q: QuestState) => THREE.Vector3 | null;
  /** Something to do here with G. */
  use?: { at: (q: QuestState) => THREE.Vector3 | null; r?: number; label: string; act: (q: QuestState) => void };
  enter?: (q: QuestState) => void;
  done: (q: QuestState) => boolean;
}
interface QuestDef { id: string; title: string; main?: boolean; /** becomes available */ opens?: (s: Quests) => boolean; steps: Step[]; reward?: (q: QuestState) => void }
export interface QuestState { def: QuestDef; i: number; state: 'hidden' | 'active' | 'done'; vars: Record<string, number>; count?: () => number }

const MAGISTRATE = 'Magistrate Kuroda', BROKER = 'Sōbei the broker';

export class Quests {
  readonly list: QuestState[] = [];
  tracked = 0;
  private markers = new THREE.Group();
  private ringMat = new THREE.MeshBasicNodeMaterial({ color: 0xf2c46a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  private beamMat = new THREE.MeshBasicNodeMaterial({ color: 0xffd890, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  private el: { obj: HTMLElement; way: HTMLElement; compass: HTMLElement; hint: HTMLElement; log: HTMLElement };
  private t = 0;
  /** Deeds for the city (the magistrate's price for the seal). */
  get deeds() { return ['captives', 'boats', 'strongbox'].filter((id) => this.get(id)?.state === 'done').length; }
  get(id: string) { return this.list.find((q) => q.def.id === id); }

  constructor(private c: QuestCtx, spots: {
    beach: THREE.Vector3; gate: THREE.Vector3; plaza: THREE.Vector3;
    boats: { boat: THREE.Vector3; pier: THREE.Vector3 }[];
    magistrate: { gate: THREE.Vector3; yard: THREE.Vector3; facing: number };
    broker: THREE.Vector3; strongbox: THREE.Vector3; otemon: THREE.Vector3; forecourt: THREE.Vector3;
  }) {
    c.scene.add(this.markers);
    const $ = (id: string) => document.getElementById(id)!;
    this.el = { obj: $('qObj'), way: $('qWay'), compass: $('qCompass'), hint: $('qHint'), log: $('qLog') };
    const S = spots;
    const near = (p: THREE.Vector3, r: number) => c.hero().distanceTo(p) < r;

    // ── The main road: from the beach to the castle ─────────────────────────────────────────────────
    this.add({ id: 'main', title: 'Smoke Over Otsu-no-ura', main: true, steps: [
      { text: () => 'Drive the raiders off the beach', at: () => S.beach,
        done: (q) => { if (!c.waveClear()) q.vars.seen = 1; return c.section() >= 1 || (q.vars.seen === 1 && c.waveClear()); } },
      { text: () => 'Break through the Outer Wall: take the gatehouse', at: () => S.gate, done: () => c.section() >= 1 },
      { text: () => 'Clear the Grand Marketplace', at: () => S.plaza, done: () => c.section() >= 1 && c.waveClear() },
      { text: () => `Find ${MAGISTRATE} in the Samurai District`, at: () => S.magistrate.gate, done: () => near(S.magistrate.gate, 7) },
      { text: (q) => `Break the siege on the magistrate's house (${4 - (q.count?.() ?? 4)}/4)`, at: () => S.magistrate.yard,
        enter: (q) => { q.count = c.band(S.magistrate.yard, 4, 'Wakō Besieger', 4); }, done: (q) => (q.count?.() ?? 1) === 0 },
      { text: () => this.deeds >= 2 ? `Speak with ${MAGISTRATE}` : `${MAGISTRATE} trusts deeds, not strangers: help the city (${this.deeds}/2 deeds)`,
        at: () => this.deeds >= 2 ? S.magistrate.yard : this.nextDeed(),
        use: { at: () => S.magistrate.yard, label: `Speak with ${MAGISTRATE}`, act: (q) => { if (this.deeds >= 2) q.vars.seal = 1; else c.card(MAGISTRATE, 'Free our people, save our boats, find what was stolen — then come back.'); } },
        done: (q) => q.vars.seal === 1 },
      { text: () => "Carry the magistrate's seal to the castle's main gate", at: () => S.otemon, done: () => near(S.otemon, 6),
        enter: () => c.card("The Magistrate's Seal", 'Show it at the castle gate.') },
      { text: () => 'Take the castle forecourt', at: () => S.forecourt, enter: () => c.openGate(), done: () => false },
    ] });

    // ── The deeds for the city ─────────────────────────────────────────────────────────────────────
    this.add({ id: 'captives', title: 'The Held', opens: () => c.section() >= 1, steps: [
      { text: () => { const k = c.captives(); return `Free the captives the raiders hold (${k.saved}/${k.total})`; }, done: () => { const k = c.captives(); return k.total > 0 && k.saved >= k.total; } },
    ], reward: () => { c.heal(0.25); c.card('The Held', 'Every captive is free.'); } });

    this.add({ id: 'boats', title: 'The Burning Boats', opens: () => true, steps: [
      { text: (q) => `Save the fishing fleet: douse the burning boats (${q.vars.doused ?? 0}/${S.boats.length})`,
        at: (q) => this.nearestOf(S.boats.filter((_, i) => !(q.vars['b' + i])).map((b) => b.pier)),
        enter: (q) => { if (!q.vars.band) { q.vars.band = 1; c.band(S.boats[1]?.pier.clone().add(new THREE.Vector3(0, 0, 10)) ?? S.beach, 2, 'Wakō Firebrand', 3); } },
        use: { at: (q) => { const h = c.hero(); let best: THREE.Vector3 | null = null; S.boats.forEach((b, i) => { if (!q.vars['b' + i] && (!best || b.pier.distanceTo(h) < best.distanceTo(h))) best = b.pier; }); return best; }, r: 2.6, label: 'Douse the fire',
          act: (q) => { const h = c.hero(); const i = S.boats.findIndex((b, k) => !q.vars['b' + k] && b.pier.distanceTo(h) < 2.6); if (i < 0) return; q.vars['b' + i] = 1; q.vars.doused = (q.vars.doused ?? 0) + 1; c.douse(i); c.sfx('splinter'); } },
        done: (q) => (q.vars.doused ?? 0) >= S.boats.length },
    ], reward: () => { c.heal(0.25); c.card('The Burning Boats', 'The fishing fleet is saved.'); } });

    this.add({ id: 'strongbox', title: "The Broker's Strongbox", opens: () => c.section() >= 1, steps: [
      { text: () => `Speak with ${BROKER} at the market`, at: () => S.broker,
        use: { at: () => S.broker, label: `Speak with ${BROKER}`, act: (q) => { q.vars.asked = 1; c.card(BROKER, 'They took my strongbox into the back alleys — the guild\'s whole year!'); } }, done: (q) => q.vars.asked === 1 },
      { text: () => 'Find the stolen strongbox in the back alleys', at: () => S.strongbox, done: () => near(S.strongbox, 12) },
      { text: (q) => `Defeat the thieves (${3 - (q.count?.() ?? 3)}/3)`, at: () => S.strongbox,
        enter: (q) => { q.count = c.band(S.strongbox, 3, 'Wakō Thief', 3); }, done: (q) => (q.count?.() ?? 1) === 0 },
      { text: () => 'Take the strongbox', at: () => S.strongbox,
        use: { at: () => S.strongbox, label: 'Take the strongbox', act: (q) => { q.vars.box = 1; c.sfx('thud'); } }, done: (q) => q.vars.box === 1 },
      { text: () => `Return the strongbox to ${BROKER}`, at: () => S.broker,
        use: { at: () => S.broker, label: 'Return the strongbox', act: (q) => { q.vars.back = 1; } }, done: (q) => q.vars.back === 1 },
    ], reward: () => { c.heal(0.2); c.card("The Broker's Strongbox", 'Sōbei will tell the magistrate what you did.'); } });

    // the people the quests talk to
    void this.npc('/games/era-clash/3d/assets/characters/carpenter.glb', S.magistrate.yard, S.magistrate.facing + Math.PI, 1.66);
    void this.npc('/games/era-clash/3d/assets/characters/fisherman.glb', S.broker, 0, 1.6);
    this.strongboxProp(S.strongbox);
    this.list[0].state = 'active';
    this.list[0].def.steps[0].enter?.(this.list[0]);
  }

  private add(def: QuestDef) { this.list.push({ def, i: 0, state: 'hidden', vars: {} }); }
  private nearestOf(ps: THREE.Vector3[]) { const h = this.c.hero(); let b: THREE.Vector3 | null = null; for (const p of ps) if (!b || p.distanceTo(h) < b.distanceTo(h)) b = p; return b; }
  private nextDeed() {
    for (const id of ['boats', 'strongbox', 'captives']) { const q = this.get(id); if (q && q.state === 'active') { const st = q.def.steps[q.i]; const p = st.at?.(q) ?? st.use?.at(q); if (p) return p; } }
    return null;
  }
  private async npc(url: string, at: THREE.Vector3, yaw: number, height: number) {
    try {
      const f = await loadGLB(url); const node = cloneSkinned(f.scene);
      const box = new THREE.Box3().setFromObject(f.scene); node.scale.setScalar(height / Math.max(0.3, box.max.y - box.min.y));
      node.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      node.position.copy(at); node.rotation.y = yaw; this.c.scene.add(node);
      const mixer = new THREE.AnimationMixer(node); const idle = f.animations.find((a) => a.name === 'idle'); if (idle) mixer.clipAction(idle).play();
      this.npcMixers.push(mixer);
    } catch (e) { console.warn('[eraclash3d] quest npc', e); }
  }
  private npcMixers: THREE.AnimationMixer[] = [];
  private box: THREE.Object3D | null = null;
  private strongboxProp(at: THREE.Vector3) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardNodeMaterial({ color: 0x3a2416, roughness: 0.6 }), iron = new THREE.MeshStandardNodeMaterial({ color: 0x2a2624, metalness: 0.7, roughness: 0.4 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.45), wood); b.position.y = 0.21; g.add(b);
    for (const x of [-0.25, 0.25]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.47), iron); band.position.set(x, 0.21, 0); g.add(band); }
    g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    g.position.copy(at); this.c.scene.add(g); this.box = g;
  }

  /** The tracked quest's current place and step (for the HUD and the marker). */
  private current() {
    const act = this.list.filter((q) => q.state === 'active');
    if (!act.length) return null;
    this.tracked = Math.min(this.tracked, act.length - 1);
    const q = act[this.tracked]; return { q, st: q.def.steps[q.i] };
  }
  cycle() { const n = this.list.filter((q) => q.state === 'active').length; if (n) this.tracked = (this.tracked + 1) % n; }

  /** G pressed: if a quest action is in reach, do it (and the grab doesn't happen). */
  interact(): boolean {
    const h = this.c.hero();
    for (const q of this.list) {
      if (q.state !== 'active') continue;
      const st = q.def.steps[q.i];
      const p = st.use?.at(q); if (!p) continue;
      if (h.distanceTo(p) < (st.use!.r ?? 2.4)) { st.use!.act(q); return true; }
    }
    return false;
  }

  update(dt: number) {
    this.t += dt;
    for (const m of this.npcMixers) m.update(dt);
    // open, advance and finish
    for (const q of this.list) {
      if (q.state === 'hidden' && q.def.opens?.(this)) { q.state = 'active'; q.def.steps[0].enter?.(q); this.c.card('New task', q.def.title); this.c.sfx('taikoWave'); }
      if (q.state !== 'active') continue;
      let guard = 0;
      while (q.state === 'active' && q.def.steps[q.i].done(q) && guard++ < 8) {
        q.i++; q.count = undefined;
        if (q.i >= q.def.steps.length) { q.state = 'done'; q.def.reward?.(q); this.c.sfx('taikoWin'); }
        else q.def.steps[q.i].enter?.(q);
      }
    }
    if (this.box && this.get('strongbox')?.vars.box === 1) { this.box.removeFromParent(); this.box = null; }
    this.draw();
  }

  // ── HUD: objective line, world marker, compass, interaction hint; markers at the places ──────────
  private _v = new THREE.Vector3();
  private pool: { ring: THREE.Mesh; beam: THREE.Mesh }[] = [];
  private ringGeo = new THREE.RingGeometry(0.75, 0.9, 32).rotateX(-Math.PI / 2);
  private beamGeo = new THREE.CylinderGeometry(0.06, 0.24, 6, 8, 1, true);
  private marker(i: number) {
    while (this.pool.length <= i) {
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat), beam = new THREE.Mesh(this.beamGeo, this.beamMat);
      this.markers.add(ring, beam); this.pool.push({ ring, beam });
    }
    return this.pool[i];
  }
  private draw() {
    const cur = this.current();
    const h = this.c.hero(), cam = this.c.camera;
    // markers: a soft beam and a ring at every live action point
    let hint = '', n = 0;
    for (const q of this.list) {
      if (q.state !== 'active') continue;
      const st = q.def.steps[q.i], p = st.use?.at(q); if (!p) continue;
      const mk = this.marker(n++);
      mk.ring.position.set(p.x, p.y + 0.06, p.z); mk.beam.position.set(p.x, p.y + 3, p.z);
      mk.ring.scale.setScalar(1 + 0.08 * Math.sin(this.t * 4));
      if (h.distanceTo(p) < (st.use!.r ?? 2.4)) hint = `[G] ${st.use!.label}`;
    }
    this.pool.forEach((m, i) => { m.ring.visible = m.beam.visible = i < n; });
    this.el.hint.textContent = hint; this.el.hint.style.opacity = hint ? '1' : '0';
    if (!cur) { this.el.obj.innerHTML = ''; this.el.way.style.opacity = '0'; return; }
    const { q, st } = cur;
    const others = this.list.filter((o) => o.state === 'active' && o !== q).length;
    this.el.obj.innerHTML = `<div class="qt">${q.def.main ? '◆' : '◇'} ${q.def.title}</div><div class="qs">${st.text(q)}</div>${others ? `<div class="qn">T · next task (${others} more)</div>` : ''}`;
    const p = st.at?.(q) ?? st.use?.at(q) ?? null;
    if (!p) { this.el.way.style.opacity = '0'; this.compass(null); return; }
    // world marker: projected, pinned to the screen edge when off-screen or behind
    const v = this._v.set(p.x, p.y + 2.2, p.z).project(cam);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const m = Math.max(Math.abs(x), Math.abs(y));
    if (behind || m > 0.92) { x = (x / m) * 0.92; y = (y / m) * 0.92; }
    const d = h.distanceTo(p);
    this.el.way.style.opacity = d < 3 ? '0.35' : '1';
    this.el.way.style.left = `${(x * 0.5 + 0.5) * 100}%`; this.el.way.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
    this.el.way.querySelector('span')!.textContent = `${Math.round(d)} m`;
    this.compass(p);
  }
  private compass(p: THREE.Vector3 | null) {
    const cam = this.c.camera, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const yaw = Math.atan2(fwd.x, fwd.z);   // 0 = facing +Z (north, up the valley)
    const W = 360, FOV = Math.PI * 0.9;
    const place = (ang: number) => { const d = Math.atan2(Math.sin(ang - yaw), Math.cos(ang - yaw)); return Math.abs(d) < FOV / 2 ? (d / FOV) * W + W / 2 : null; };
    const marks: string[] = [];
    for (const [a, l] of [[0, 'N'], [Math.PI / 2, 'E'], [Math.PI, 'S'], [-Math.PI / 2, 'W']] as const) { const x = place(a); if (x !== null) marks.push(`<b style="left:${W - x}px">${l}</b>`); }
    if (p) { const h = this.c.hero(); const x = place(Math.atan2(p.x - h.x, p.z - h.z)); if (x !== null) marks.push(`<i style="left:${W - x}px">◆</i>`); }
    this.el.compass.innerHTML = marks.join('');
  }
  /** The pause menu's quest log. */
  log() {
    this.el.log.innerHTML = this.list.filter((q) => q.state !== 'hidden').map((q) => {
      const steps = q.def.steps.slice(0, q.state === 'done' ? q.def.steps.length : q.i + 1).map((s, k) => `<li class="${k < q.i || q.state === 'done' ? 'dn' : ''}">${s.text(q)}</li>`).join('');
      return `<div class="ql ${q.state}"><div class="qlt">${q.def.main ? '◆' : '◇'} ${q.def.title}${q.state === 'done' ? ' — done' : ''}</div><ul>${steps}</ul></div>`;
    }).join('') + `<div class="qn">Deeds for the city: ${this.deeds}/3</div>`;
  }
}

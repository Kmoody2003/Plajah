// Rift Realm character select — the real in-engine vessel on a slowly turning rune pedestal, drawn by the game's own
// renderer into the game canvas (transparent, so the video reel plays behind it). The same character rigs, clips and
// guns the game uses (characters.ts CharacterRig, weapons.ts buildWeapon), so what you pick is what you play.
import * as THREE from 'three/webgpu';
import { assets, CharacterRig } from '../characters';
import { buildWeapon, WEAPONS } from '../weapons';
import { VESSELS, type VesselId } from '../vessels';

export class Pedestal {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private turn = new THREE.Group();
  private rigs = new Map<VesselId, { rig: CharacterRig; root: THREE.Group; hero: HeroPose }>();
  private ring: THREE.Mesh; private ringMat: THREE.MeshBasicNodeMaterial;
  private key: THREE.SpotLight; private rim: THREE.PointLight;
  private current: VesselId | null = null;
  private running = false; private last = 0; private spin = 0; private dragV = 0; private yawOff = 0; private clock = 0;
  private dragging = false; private lastX = 0;
  /** where on screen the pedestal stands (0…1 of the viewport width) */
  centerX = 0.5;

  constructor(private renderer: THREE.WebGPURenderer, private model: (id: VesselId) => 'stalker' | 'paladin') {
    (globalThis as { __pedestal?: unknown }).__pedestal = this; // console checks / tuning
    this.camera.position.set(0, 1.45, 7.6);
    this.camera.lookAt(0, 1.0, 0);
    this.scene.add(this.turn);
    // the plinth: dark stone drum, a glowing rune ring on top, a soft light pool
    const stone = new THREE.MeshStandardNodeMaterial({ color: 0x15161f, roughness: 0.55, metalness: 0.4 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.34, 48), stone);
    drum.position.y = -0.17;
    this.scene.add(drum);
    this.ringMat = new THREE.MeshBasicNodeMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.018, 8, 96), this.ringMat);
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.005;
    this.scene.add(this.ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.008, 6, 72), this.ringMat);
    inner.rotation.x = Math.PI / 2; inner.position.y = 0.006;
    this.scene.add(inner);
    this.scene.add(new THREE.HemisphereLight(0x9fb7ff, 0x120a1c, 0.9));
    this.key = new THREE.SpotLight(0xffffff, 60, 14, 0.5, 0.6, 1.5);
    this.key.position.set(2.2, 4.4, 3.4); this.key.target.position.set(0, 1, 0);
    this.scene.add(this.key, this.key.target);
    this.rim = new THREE.PointLight(0x38bdf8, 18, 8, 2);
    this.rim.position.set(-1.6, 2.2, -1.8);
    this.scene.add(this.rim);
    const fill = new THREE.DirectionalLight(0xffe2b8, 0.7); fill.position.set(-3, 2, 4);
    this.scene.add(fill);
  }

  private compiled = new Set<VesselId>();
  private compiling = new Map<VesselId, Promise<boolean>>();
  /** True when this vessel's rig is built and its shaders compiled (show() won't stall). */
  ready(id: VesselId) { return this.compiled.has(id); }

  /** Build the rig and compile its shaders asynchronously (a first sight would otherwise compile them mid-frame). */
  prepare(id: VesselId): Promise<boolean> {
    let p = this.compiling.get(id);
    if (!p) {
      p = (async () => {
        const e = this.build(id);
        if (!e) return false;
        // staged out of shot while it compiles (show() may claim it meanwhile: then it's already on the plinth)
        if (!e.root.parent) { this.scene.add(e.root); e.root.position.x = 60; }
        try { await this.renderer.compileAsync(e.root, this.camera, this.scene); } catch { /* compiles on first draw instead */ }
        if (e.root.parent === this.scene) { this.scene.remove(e.root); e.root.position.x = 0; }
        this.compiled.add(id);
        return true;
      })();
      this.compiling.set(id, p);
    }
    return p;
  }

  /** Characters must be loaded (prefetch.characters()) before a rig can stand here. */
  show(id: VesselId) {
    this.current = id;
    const spec = VESSELS[id];
    this.ringMat.color.setHex(spec.primaryColor);
    this.rim.color.setHex(spec.primaryColor);
    const entry = this.build(id);
    if (!entry) return false;
    for (const [k, e] of this.rigs) { if (k === id) { e.root.position.x = 0; this.turn.add(e.root); } else if (e.root.parent === this.turn) this.turn.remove(e.root); }
    // a little entrance: drop in and turn to face the camera
    entry.root.position.y = 0.35; entry.root.scale.setScalar(0.92);
    this.spin = -0.9;
    // arrival flourish: the Stalker frame's draw (weapon brought up and settled), then back to the hero idle. The
    // Paladin's retargeted draw ends in a lunge, so Aegis just drops in and settles.
    if (this.model(id) === 'stalker' && entry.rig.has('draw')) entry.rig.play('draw', 0.85, 1.25);
    return true;
  }

  private build(id: VesselId) {
    let entry = this.rigs.get(id);
    if (!entry) {
      const asset = this.model(id) === 'paladin' ? assets.paladin ?? assets.stalker : assets.stalker;
      if (!asset) return null;
      const rig = new CharacterRig(asset, this.model(id) === 'paladin' ? 2.05 : 1.9);
      const root = new THREE.Group();
      root.add(rig.root);
      // the vessel's gun in the right hand, as the game hangs it (player.showTpGun)
      const socket = rig.socket('hand_r_weapon');
      if (socket) {
        const m = buildWeapon(id), w = WEAPONS[id], holder = new THREE.Group();
        socket.updateWorldMatrix(true, false);
        holder.scale.setScalar(1 / Math.max(1e-4, socket.getWorldScale(new THREE.Vector3()).x));
        holder.rotation.set(...w.tpOffset.rot); holder.position.set(...w.tpOffset.pos);
        holder.add(m.root); socket.add(holder);
        rig.grip('Right', 'dagger');
      }
      entry = { rig, root, hero: new HeroPose(rig, this.model(id)) };
      this.rigs.set(id, entry);
    }
    return entry;
  }

  start(canvas: HTMLCanvasElement) {
    if (this.running) return;
    this.running = true;
    this.renderer.setClearColor(0x000000, 0);
    this.last = performance.now();
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    const loop = (t: number) => { if (!this.running) return; this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  stop(canvas: HTMLCanvasElement) {
    this.running = false;
    canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.renderer.setClearColor(0x000000, 1);
  }

  /** Drag to turn the vessel by hand; it eases back to its three-quarter hero angle when let go. */
  private onDown = (e: PointerEvent) => { this.dragging = true; this.lastX = e.clientX; };
  private onMove = (e: PointerEvent) => { if (!this.dragging) return; this.dragV = (e.clientX - this.lastX) * 0.012; this.yawOff += this.dragV; this.lastX = e.clientX; };
  private onUp = () => { this.dragging = false; };
  /** Controller right stick / keys turn it too. */
  nudge(v: number) { this.yawOff += v; }

  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const r = this.renderer, w = window.innerWidth, h = window.innerHeight;
    // a hero stands facing you: a three-quarter angle with a slow sway, not a turntable spin (a drag turns it and it
    // drifts back); the arrival swings in from a little further round
    this.clock += dt;
    if (!this.dragging) { this.dragV *= Math.exp(-dt * 3); this.yawOff += this.dragV; this.yawOff *= Math.exp(-dt * 0.6); this.spin *= Math.exp(-dt * 3); }
    this.turn.rotation.y = -0.38 + Math.sin(this.clock * 0.22) * 0.32 + this.yawOff + this.spin;
    const e = this.current ? this.rigs.get(this.current) : null;
    if (e) {
      e.root.position.y += (0 - e.root.position.y) * Math.min(1, dt * 6);
      const s = e.root.scale.x + (1 - e.root.scale.x) * Math.min(1, dt * 6); e.root.scale.setScalar(s);
      e.hero.before();
      e.rig.update(dt, 0);
      e.hero.after(this.clock, this.turn);
    }
    this.ringMat.opacity = 0.7 + Math.sin(t * 0.004) * 0.2;
    this.ring.rotation.z += dt * 0.4;
    // the stage sits where the layout leaves room for it: shift the view so the pedestal lands at centerX
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, (0.5 - this.centerX) * w, 0, w, h);
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
  }

  dispose() { this.rigs.clear(); this.turn.clear(); }
}

/**
 * The menu stance (Kenne: "stand and look confident"). The game's idle for these rigs is the rifle-aim crouch
 * (aim_idle); the pedestal stops it (bind pose: upright, weapon planted, no aim bend) and layers a procedural pose on
 * top in WORLD space (so it holds whatever axes the rig's bones use): chest up, shoulders back, arms settled, head
 * level and a touch past the camera, and a slow breath through the chest and shoulders. Stopgap until the characters
 * track bakes a real "hero idle" per body (set HeroPose.clip).
 */
class HeroPose {
  private bones: { b: THREE.Object3D; base: THREE.Quaternion | null; after: THREE.Quaternion | null }[] = [];
  private spine: THREE.Object3D[] = []; private neck: THREE.Object3D | null = null; private head: THREE.Object3D | null = null;
  private shL: THREE.Object3D | null = null; private shR: THREE.Object3D | null = null;
  private armL: THREE.Object3D | null = null; private armR: THREE.Object3D | null = null;
  private q = new THREE.Quaternion(); private pq = new THREE.Quaternion(); private ax = new THREE.Vector3();
  /** tunable from the console while looking at it: __heroPose.chest = 0.14 … */
  static k = { chest: 0.11, shoulders: 0.12, drop: 0.03, arms: 0.06, neck: 0.1, chin: 0.0, look: 0.14, breath: 1, on: 1 };
  private idleEntry: { name: string; act: THREE.AnimationAction } | undefined;
  private actions: Map<string, THREE.AnimationAction>;
  /** Swap the standing clip (checks / tuning: __pedestal.rigs.get('aegis').hero.useClip('block')). */
  useClip(name: string, rate = 0.55) {
    const want = this.actions.get(name), idle = this.idleEntry;
    if (!want || !idle) return false;
    if (idle.act !== want) { idle.act.stop(); want.reset().setLoop(THREE.LoopRepeat, Infinity).play(); idle.act = want; }
    want.timeScale = rate;
    return true;
  }

  constructor(rig: CharacterRig, private kind: 'stalker' | 'paladin') {
    const r = rig as unknown as { loco: { name: string; act: THREE.AnimationAction }[]; actions: Map<string, THREE.AnimationAction> };
    // no aim crouch: the rig's standing clip is stopped and the body rests in its bind pose (upright, weapon planted),
    // which the layer below turns into the hero stance; a named clip replaces it once a real hero idle exists
    this.idleEntry = r.loco.find((l) => l.name === 'idle');
    this.actions = r.actions;
    if (HeroPose.clip[kind]) this.useClip(HeroPose.clip[kind]);
    else this.idleEntry?.act.stop();
    rig.aimPitch = 0;
    rig.root.traverse((o) => {
      const n = o.name.replace(/^.*[:|]/, '');
      if (/^Spine[12]$/.test(n)) this.spine.push(o);
      else if (n === 'Neck') this.neck = o; else if (n === 'Head') this.head = o;
      else if (n === 'LeftShoulder') this.shL = o; else if (n === 'RightShoulder') this.shR = o;
      else if (n === 'LeftArm') this.armL = o; else if (n === 'RightArm') this.armR = o;
    });
    for (const b of [...this.spine, this.neck, this.head, this.shL, this.shR, this.armL, this.armR]) if (b) this.bones.push({ b, base: null, after: null });
    (globalThis as { __heroPose?: unknown }).__heroPose = HeroPose.k;
  }

  /** Take last frame's layer back off, but only from bones nobody rewrote since (the mixer re-keys most each frame;
   *  the forge rig's own lean uses the same rule, so restoring whole quaternions would make its lean pile up). */
  before() {
    for (const e of this.bones) {
      if (e.base && e.after && e.b.quaternion.equals(e.after)) e.b.quaternion.copy(e.base);
      e.base = null; e.after = null;
    }
  }

  /** Turn bone b by angle around a WORLD axis, keeping its parent. */
  private turnWorld(b: THREE.Object3D | null, axis: THREE.Vector3, angle: number) {
    if (!b || !b.parent || Math.abs(angle) < 1e-5) return;
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(this.pq).invert();
    this.q.setFromAxisAngle(this.ax.copy(axis).applyQuaternion(this.pq).normalize(), angle);
    b.quaternion.premultiply(this.q);
  }

  /** The standing clip per body ('' = bind pose). The rigs' clips named "idle" are not standing idles (the Paladin's
   *  is a lunge, the Stalker's holds the gun up), so both use the bind pose until a hero idle is baked. */
  static clip: Record<'stalker' | 'paladin', string> = { stalker: '', paladin: '' };
  /** per-body tweaks on top of k (the Stalker's bind pose holds its arms out: + brings them in to the sides) */
  static kindK: Record<'stalker' | 'paladin', Partial<typeof HeroPose.k>> = { stalker: { arms: 0.3 }, paladin: { arms: 0 } };

  after(t: number, turn: THREE.Object3D) {
    if (!HeroPose.k.on) return;
    for (const e of this.bones) e.base = e.b.quaternion.clone();
    const k = { ...HeroPose.k, ...HeroPose.kindK[this.kind] }, heavy = this.kind === 'paladin' ? 0.8 : 1;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(turn.quaternion);   // the character faces +Z
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(turn.quaternion), up = new THREE.Vector3(0, 1, 0);
    const breath = Math.sin(t * 1.6) * k.breath;                                  // a ~4 s breath
    // chest up and proud: lean the upper spine back (a positive turn about +right tips the top forward)
    for (const s of this.spine) this.turnWorld(s, right, -(k.chest + breath * 0.012) * heavy);
    // shoulders back and a little down: the clavicles swing toward the back and lift on the in-breath
    this.turnWorld(this.shL, up, k.shoulders * heavy); this.turnWorld(this.shR, up, -k.shoulders * heavy);
    this.turnWorld(this.shL, fwd, -k.drop - breath * 0.012); this.turnWorld(this.shR, fwd, k.drop + breath * 0.012);
    // arms settle at the sides (+ = in toward the body)
    this.turnWorld(this.armL, fwd, -k.arms); this.turnWorld(this.armR, fwd, k.arms);
    // head level (undo the chest lean), looking slightly past the camera
    this.turnWorld(this.neck, right, k.neck * heavy);
    this.turnWorld(this.head, right, k.chin);
    this.turnWorld(this.head, up, k.look + Math.sin(t * 0.31) * 0.04);
    for (const e of this.bones) e.after = e.b.quaternion.clone();
  }
}

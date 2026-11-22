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
  private rigs = new Map<VesselId, { rig: CharacterRig; root: THREE.Group }>();
  private ring: THREE.Mesh; private ringMat: THREE.MeshBasicNodeMaterial;
  private key: THREE.SpotLight; private rim: THREE.PointLight;
  private current: VesselId | null = null;
  private running = false; private last = 0; private spin = 0; private dragV = 0;
  private dragging = false; private lastX = 0;
  /** where on screen the pedestal stands (0…1 of the viewport width) */
  centerX = 0.5;

  constructor(private renderer: THREE.WebGPURenderer, private model: (id: VesselId) => 'stalker' | 'paladin') {
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
      entry = { rig, root };
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

  /** Drag to turn the vessel by hand; it settles back to a slow idle spin. */
  private onDown = (e: PointerEvent) => { this.dragging = true; this.lastX = e.clientX; };
  private onMove = (e: PointerEvent) => { if (!this.dragging) return; this.dragV = (e.clientX - this.lastX) * 0.012; this.turn.rotation.y += this.dragV; this.lastX = e.clientX; };
  private onUp = () => { this.dragging = false; };
  /** Controller right stick / keys turn it too. */
  nudge(v: number) { this.turn.rotation.y += v; }

  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const r = this.renderer, w = window.innerWidth, h = window.innerHeight;
    if (!this.dragging) { this.dragV *= Math.exp(-dt * 3); this.turn.rotation.y += this.dragV + dt * 0.35 + this.spin * dt * 2; this.spin *= Math.exp(-dt * 3); }
    const e = this.current ? this.rigs.get(this.current) : null;
    if (e) {
      e.root.position.y += (0 - e.root.position.y) * Math.min(1, dt * 6);
      const s = e.root.scale.x + (1 - e.root.scale.x) * Math.min(1, dt * 6); e.root.scale.setScalar(s);
      e.rig.update(dt, 0);
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

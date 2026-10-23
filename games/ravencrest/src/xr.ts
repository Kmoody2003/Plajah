// Ravencrest in a headset (Meta Quest, Android XR): still third person, but you stand *in* the
// world — a tall camera rig a few metres behind and above the hero, following smoothly (never
// yanking the view; turning is a comfortable 30° snap on the right stick).
//   Left stick   move (relative to where you look)        Right stick  snap turn
//   A            jump        B  roll        Triggers  attack      Left grip  use     Right grip  molotov
//   Swing your sword hand → a blade cut the way you swung; thrust a hand → a punch (left jab,
//   right hook). The on-screen HUD can't be seen in a headset, so health and the game's call-outs
//   sit on a small panel floating low in front of you.
// WebXR needs the renderer's WebGL backend (main.ts boots headsets with forceWebGL); post-processing
// and the LUT pass don't run in XR, so the scene renders directly.
import * as THREE from 'three/webgpu';
import type { PlayerController } from './player';
import type { Game } from './game';

export interface XRDeps {
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  player: PlayerController;
  game: Game;
  scene(): THREE.Scene;
  interact(): void;
  /** Leaving the title screen (if it's still up) when the headset session starts. */
  startFromMenu(): void;
}

const SNAP = Math.PI / 6;
const BACK = 3.4, UP = 1.15;

export class XRPlay {
  readonly rig = new THREE.Group();
  private yaw = 0;
  private snapArmed = true;
  private hands: { grip: THREE.Object3D; prev: THREE.Vector3; vel: THREE.Vector3; cd: number; hand: 'left' | 'right' }[] = [];
  private prevBtn: Record<string, boolean[]> = {};
  private panel: THREE.Mesh;
  private panelCtx: CanvasRenderingContext2D;
  private panelTex: THREE.CanvasTexture;
  private panelText = '';
  private panelHp = -1;
  private button: HTMLButtonElement | null = null;
  active = false;

  constructor(private d: XRDeps) {
    this.rig.name = 'xrRig';
    // HUD panel: low and ahead, tilted up toward the eyes.
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    this.panelCtx = c.getContext('2d')!;
    this.panelTex = new THREE.CanvasTexture(c);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicNodeMaterial({ map: this.panelTex, transparent: true, depthTest: false, fog: false }));
    this.panel.renderOrder = 999;
    this.panel.position.set(0, 0.95, -1.4);
    this.panel.rotation.x = -0.35;
    this.rig.add(this.panel);
    for (let i = 0; i < 2; i++) {
      const grip = d.renderer.xr.getControllerGrip(i);
      this.rig.add(grip);
      const h = { grip, prev: new THREE.Vector3(), vel: new THREE.Vector3(), cd: 0, hand: (i === 0 ? 'left' : 'right') as 'left' | 'right' };
      grip.addEventListener('connected', (e: { data?: XRInputSource }) => { if (e.data?.handedness === 'left' || e.data?.handedness === 'right') h.hand = e.data.handedness; });
      this.hands.push(h);
      // A small glowing gauntlet so you can see your hands in the world.
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(1.6) }));
      grip.add(glove);
    }
    d.renderer.xr.addEventListener('sessionstart', () => this.begin());
    d.renderer.xr.addEventListener('sessionend', () => this.end());
  }

  /** Offer "Enter VR" where the browser can do immersive VR. */
  async offerButton() {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr || !(await xr.isSessionSupported('immersive-vr').catch(() => false))) return;
    const b = document.createElement('button');
    b.id = 'enterVR';
    b.textContent = 'ENTER VR';
    b.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:40;font:600 14px Georgia,serif;letter-spacing:.3em;padding:12px 20px;color:#fff;background:#1b1430cc;border:1px solid #f97316;border-radius:6px;cursor:pointer';
    b.onclick = async () => {
      try {
        const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
        this.d.renderer.xr.setReferenceSpaceType('local-floor');
        await this.d.renderer.xr.setSession(session);
      } catch (e) { console.warn('[ravencrest] XR session failed', e); }
    };
    document.body.appendChild(b);
    this.button = b;
  }

  private begin() {
    this.active = true;
    this.d.startFromMenu();
    this.d.renderer.xr.setFoveation(1);
    const { player, camera } = this.d;
    player.xrMode = true;
    this.yaw = player.yaw;
    this.place(1);
    camera.position.set(0, 0, 0); camera.quaternion.identity();
    this.rig.add(camera);
    if (this.button) this.button.style.display = 'none';
  }

  private end() {
    this.active = false;
    const { player, camera } = this.d;
    player.xrMode = false;
    this.rig.remove(camera);
    this.rig.removeFromParent();
    if (this.button) this.button.style.display = '';
  }

  /** Rig behind and above the hero, eased (k = 1 snaps). */
  private place(k: number) {
    const p = this.d.player.object.position;
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-BACK);
    const want = p.clone().add(back).add(new THREE.Vector3(0, UP, 0));
    this.rig.position.lerp(want, k);
    this.rig.rotation.set(0, this.yaw + Math.PI, 0);
  }

  update(dt: number) {
    if (!this.active) return;
    const { renderer, player, game, camera } = this.d;
    const scene = this.d.scene();
    if (this.rig.parent !== scene) scene.add(this.rig);
    this.place(1 - Math.exp(-dt * 5));
    // Where the head looks, in the world: movement and attacks are relative to it.
    const headFwd = new THREE.Vector3();
    renderer.xr.getCamera().getWorldDirection(headFwd);
    headFwd.setY(0).normalize();
    // Inputs (xr-standard gamepads on the session's input sources).
    const session = renderer.xr.getSession();
    let moveX = 0, moveY = 0;
    for (const src of session?.inputSources ?? []) {
      const gp = src.gamepad;
      if (!gp) continue;
      const hand = src.handedness;
      const btn = (i: number) => !!gp.buttons[i]?.pressed;
      const prev = this.prevBtn[hand] ?? [];
      const pressed = (i: number) => btn(i) && !prev[i];
      const ax = gp.axes[2] ?? 0, ay = gp.axes[3] ?? 0;
      if (hand === 'left') { moveX = ax; moveY = ay; }
      if (hand === 'right') {
        if (Math.abs(ax) > 0.7 && this.snapArmed) { this.yaw -= Math.sign(ax) * SNAP; this.snapArmed = false; this.place(1); }
        if (Math.abs(ax) < 0.3) this.snapArmed = true;
        if (pressed(4)) player.jump();
        if (pressed(5)) game.roll();
        if (pressed(1)) game.throwMolotov();
      } else {
        if (pressed(1)) this.d.interact();
        if (pressed(4)) player.jump();
        if (pressed(5)) game.roll();
      }
      if (pressed(0)) game.attack();
      this.prevBtn[hand] = gp.buttons.map((b) => b.pressed);
    }
    // Move relative to the head: the player's camera-relative input uses camYaw.
    player.camYaw = Math.atan2(-headFwd.x, -headFwd.z);
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    player.stick.set(dz(moveX), -dz(moveY));
    player.stickRun = Math.hypot(moveX, moveY) > 0.92;
    // Motion attacks from the controllers' movement.
    for (const h of this.hands) {
      h.cd -= dt;
      const pos = h.grip.getWorldPosition(new THREE.Vector3());
      if (h.prev.lengthSq() > 0) h.vel.lerp(pos.clone().sub(h.prev).divideScalar(Math.max(dt, 1e-3)), 0.5);
      h.prev.copy(pos);
      if (h.cd > 0) continue;
      const speed = h.vel.length(), thrust = h.vel.dot(headFwd);
      if (thrust > 2.6 && thrust > speed * 0.75) {
        game.playMove(h.hand === 'left' ? 'jab' : 'hook');
        h.cd = 0.35;
      } else if (h.hand === 'right' && speed > 3.4) {
        // A sweep: cut the way the hand travelled (high/low decides the cleave or the sweep).
        game.playMove(h.vel.y < -2 ? 'cleave' : h.vel.y > 2 ? 'backhand' : 'combo');
        h.cd = 0.4;
      }
    }
    this.drawPanel();
    void camera;
  }

  private drawPanel() {
    const { game } = this.d;
    const text = game.callText;
    const hp = Math.round(game.hp);
    if (text === this.panelText && hp === this.panelHp) return;
    this.panelText = text; this.panelHp = hp;
    const g = this.panelCtx, W = 1024, H = 256;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,8,14,0.55)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a0d0a'; g.fillRect(40, 30, W - 80, 26);
    g.fillStyle = '#e0452a'; g.fillRect(40, 30, (W - 80) * Math.max(0, hp) / game.maxHp, 26);
    g.font = '42px Georgia'; g.fillStyle = '#f4ead8'; g.textAlign = 'center';
    g.fillText(text.slice(0, 60), W / 2, 150);
    this.panelTex.needsUpdate = true;
  }
}

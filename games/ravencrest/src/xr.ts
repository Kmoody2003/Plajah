// Ravencrest in a headset (Meta Quest, WebXR / WebVR): still third person, but you stand *in* the
// world — a tall camera rig a few metres behind and above the hero, following smoothly.
//   Left thumbstick     move character (relative to camera/view)
//   Right thumbstick    smooth camera orbit (yaw & pitch)
//   Trigger (index)     slash / attack
//   Right side trigger  roll (dodge)
//   Left side trigger   block (hold guard)
//   A / X               jump / interact        B / Y  interact / molotov
//   Swing your sword hand → a blade cut the way you swung; thrust a hand → a punch (left jab,
//   right hook). The on-screen HUD can't be seen in a headset, so health and the game's call-outs
//   sit on a small panel floating low in front of you.
// WebXR needs the renderer's WebGL backend (main.ts boots headsets with forceWebGL); post-processing
// and the LUT pass don't run in XR, so the scene renders directly.
import * as THREE from 'three/webgpu';
import type { PlayerController } from './player';
import type { Game } from './game';
import { setXRReflectDisable } from './materials';

export interface XRDeps {
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  player: PlayerController;
  game: Game;
  scene(): THREE.Scene;
  interact(): void;
  /** Leaving the title screen (if it's still up) when the headset session starts. */
  startFromMenu(): void;
  /** Notify main loop when XR starts/ends (e.g. unpack forest instances). */
  onXRChange?(active: boolean): void;
}

const BACK = 3.4, UP = 1.15;
const DEAD = 0.16;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

function stickAxes(gp: Gamepad): [number, number] {
  const x2 = gp.axes[2] ?? 0, y2 = gp.axes[3] ?? 0;
  const x0 = gp.axes[0] ?? 0, y0 = gp.axes[1] ?? 0;
  return Math.hypot(x2, y2) >= Math.hypot(x0, y0) ? [x2, y2] : [x0, y0];
}

function btnDown(gp: Gamepad, i: number): boolean {
  const b = gp.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}

interface VRDisplayLegacy {
  isPresenting?: boolean;
  requestPresent(layers: { source: HTMLCanvasElement }[]): Promise<void>;
  exitPresent(): Promise<void>;
}

export class XRPlay {
  readonly rig = new THREE.Group();
  private yaw = 0;
  private pitch = 0;
  private hands: { grip: THREE.Object3D; prev: THREE.Vector3; vel: THREE.Vector3; cd: number; hand: 'left' | 'right' }[] = [];
  private prevBtn: Record<string, boolean[]> = {};
  private squeezeLeft = false;
  private blocking = false;
  private panel: THREE.Mesh;
  private panelCtx: CanvasRenderingContext2D;
  private panelTex: THREE.CanvasTexture;
  private panelText = '';
  private panelHp = -1;
  private button: HTMLButtonElement | null = null;
  private vrDisplay: VRDisplayLegacy | null = null;
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

  /** Offer "Enter VR" where the browser supports WebXR or WebVR. */
  async offerButton() {
    const nav = navigator as Navigator & { xr?: XRSystem; getVRDisplays?: () => Promise<VRDisplayLegacy[]> };
    const xr = nav.xr;
    const hasWebXR = !!(await xr?.isSessionSupported?.('immersive-vr').catch(() => false));
    if (!hasWebXR && typeof nav.getVRDisplays === 'function') {
      const displays = await nav.getVRDisplays().catch(() => []);
      this.vrDisplay = displays[0] ?? null;
    }
    const forceOffer = new URLSearchParams(location.search).has('xr') || /OculusBrowser|Quest|Pico|Wolvic|Android XR|XR Browser/i.test(navigator.userAgent);
    if (!hasWebXR && !this.vrDisplay && !forceOffer) return;

    const b = document.createElement('button');
    b.id = 'enterVR';
    b.textContent = 'ENTER VR';
    b.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:40;font:600 14px Georgia,serif;letter-spacing:.3em;padding:12px 20px;color:#fff;background:#1b1430cc;border:1px solid #f97316;border-radius:6px;cursor:pointer';
    b.onclick = async () => {
      if (this.active) {
        await this.d.renderer.xr.getSession()?.end().catch(() => {});
        if (this.vrDisplay?.isPresenting) await this.vrDisplay.exitPresent().catch(() => {});
        this.end();
        return;
      }
      try {
        if (xr) {
          let session: XRSession;
          try {
            session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
            this.d.renderer.xr.setReferenceSpaceType('local-floor');
          } catch {
            session = await xr.requestSession('immersive-vr');
            this.d.renderer.xr.setReferenceSpaceType('local');
          }
          this.bindSessionEvents(session);
          await this.d.renderer.xr.setSession(session);
          return;
        }
        if (this.vrDisplay) {
          await this.vrDisplay.requestPresent([{ source: this.d.renderer.domElement }]);
          this.begin();
        }
      } catch (e) { console.warn('[ravencrest] XR session failed', e); }
    };
    document.body.appendChild(b);
    this.button = b;
    // On the title screen it's an explicit choice: play flat, or step inside.
    const start = document.getElementById('menuStart');
    if (start?.parentElement) {
      const vr = document.createElement('button');
      vr.id = 'menuStartVR';
      vr.textContent = 'ENTER IN VR';
      vr.style.marginLeft = '14px';
      vr.onclick = () => b.click();
      start.parentElement.insertBefore(vr, start.nextSibling);
      b.style.display = 'none';            // the menu carries the choice; the corner button returns in play
      start.addEventListener('click', () => { b.style.display = ''; });
    }
  }

  private bindSessionEvents(session: XRSession) {
    session.addEventListener('selectstart', (e: XRInputSourceEvent) => {
      const gp = e.inputSource?.gamepad;
      // Only fire from session event if gamepad polling didn't already catch button 0.
      if (!gp || !gp.buttons[0]) this.d.game.attack();
    });
    session.addEventListener('squeezestart', (e: XRInputSourceEvent) => {
      const hand = e.inputSource?.handedness;
      const gp = e.inputSource?.gamepad;
      if (hand === 'right' && (!gp || !gp.buttons[1])) this.d.game.roll();
      else if (hand === 'left') { this.squeezeLeft = true; this.d.game.setBlock(true); this.blocking = true; }
    });
    session.addEventListener('squeezeend', (e: XRInputSourceEvent) => {
      if (e.inputSource?.handedness === 'left') { this.squeezeLeft = false; this.d.game.setBlock(false); this.blocking = false; }
    });
  }

  private begin() {
    this.active = true;
    setXRReflectDisable(true);
    this.d.onXRChange?.(true);
    this.d.startFromMenu();
    try { this.d.renderer.xr.setFoveation(1); } catch { /* */ }
    const { player, camera } = this.d;
    player.xrMode = true;
    this.yaw = player.yaw;
    this.pitch = 0;
    this.place(1);
    camera.near = 0.15;
    camera.far = 4000;
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateProjectionMatrix();
    this.rig.add(camera);
    if (this.button) this.button.style.display = 'none';
  }

  private end() {
    this.active = false;
    setXRReflectDisable(false);
    this.d.onXRChange?.(false);
    const { player, camera, game } = this.d;
    if (this.blocking) { game.setBlock(false); this.blocking = false; }
    this.squeezeLeft = false;
    player.xrMode = false;
    this.rig.remove(camera);
    this.rig.removeFromParent();
    if (this.button) this.button.style.display = '';
  }

  /** Rig behind and above the hero, eased (k = 1 snaps). */
  private place(k: number) {
    const p = this.d.player.object.position;
    const dist = BACK * Math.cos(this.pitch * 0.5);
    const up = UP + Math.sin(this.pitch) * 1.4;
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-dist);
    const want = p.clone().add(back).add(new THREE.Vector3(0, up, 0));
    this.rig.position.lerp(want, k);
    this.rig.rotation.order = 'YXZ';
    this.rig.rotation.set(0, this.yaw + Math.PI, 0);
  }

  update(dt: number) {
    if (!this.active) return;
    const { renderer, player, game, camera } = this.d;
    const scene = this.d.scene();
    if (this.rig.parent !== scene) scene.add(this.rig);

    // Inputs (xr-standard gamepads on the session's input sources, with navigator.getGamepads fallback).
    const session = renderer.xr.getSession();
    let moveX = 0, moveY = 0, lookX = 0, lookY = 0;
    let leftGripDown = this.squeezeLeft;
    let sawSource = false;

    for (const src of session?.inputSources ?? []) {
      const gp = src.gamepad;
      if (!gp) continue;
      sawSource = true;
      const hand = src.handedness || 'right';
      const prev = this.prevBtn[hand] ?? [];
      const btn = (i: number) => btnDown(gp, i);
      const pressed = (i: number) => btn(i) && !prev[i];
      const [ax, ay] = stickAxes(gp);

      if (hand === 'left') {
        moveX = ax;
        moveY = ay;
        // Left side trigger (grip / squeeze, button 1) → hold block
        if (btn(1)) leftGripDown = true;
        // Trigger (button 0) → slash / attack
        if (pressed(0)) game.attack();
        // X (button 4) → interact; Y (button 5) → molotov
        if (pressed(4)) this.d.interact();
        if (pressed(5)) game.throwMolotov();
      } else {
        lookX = ax;
        lookY = ay;
        // Trigger (button 0) → slash / attack
        if (pressed(0)) game.attack();
        // Right side trigger (grip / squeeze, button 1) → roll
        if (pressed(1)) game.roll();
        // A (button 4) → jump; B (button 5) → interact; R3 (button 3) → recenter camera
        if (pressed(4)) player.jump();
        if (pressed(5)) this.d.interact();
        if (pressed(3)) { this.yaw = player.yaw; this.pitch = 0; this.place(1); }
      }
      this.prevBtn[hand] = gp.buttons.map((_, i) => btn(i));
    }

    // Fallback to navigator.getGamepads() if session.inputSources has no gamepad objects (e.g. WebVR).
    if (!sawSource) {
      const pads = Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
      for (const gp of pads) {
        const id = gp.id.toLowerCase();
        const hand = (gp as Gamepad & { hand?: string }).hand || (id.includes('left') ? 'left' : id.includes('right') ? 'right' : '');
        const key = hand || `pad_${gp.index}`;
        const prev = this.prevBtn[key] ?? [];
        const btn = (i: number) => btnDown(gp, i);
        const pressed = (i: number) => btn(i) && !prev[i];
        if (hand === 'left') {
          [moveX, moveY] = stickAxes(gp);
          if (btn(1)) leftGripDown = true;
          if (pressed(0)) game.attack();
          if (pressed(4)) this.d.interact();
          if (pressed(5)) game.throwMolotov();
        } else if (hand === 'right') {
          [lookX, lookY] = stickAxes(gp);
          if (pressed(0)) game.attack();
          if (pressed(1)) game.roll();
          if (pressed(4)) player.jump();
          if (pressed(5)) this.d.interact();
        } else {
          // Single combined gamepad
          moveX = gp.axes[0] ?? 0; moveY = gp.axes[1] ?? 0;
          lookX = gp.axes[2] ?? 0; lookY = gp.axes[3] ?? 0;
          if (pressed(0)) player.jump();
          if (pressed(1) || pressed(5)) game.roll();
          if (pressed(2) || pressed(7)) game.attack();
          if (btn(4) || btn(6)) leftGripDown = true;
        }
        this.prevBtn[key] = gp.buttons.map((_, i) => btn(i));
      }
    }

    // Apply left side trigger blocking state.
    if (leftGripDown !== this.blocking) {
      this.blocking = leftGripDown;
      game.setBlock(leftGripDown);
    }

    // Right thumbstick: smooth camera rotation around the character.
    const rx = dz(lookX), ry = dz(lookY);
    if (rx || ry) {
      this.yaw -= rx * 2.4 * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch - ry * 1.4 * dt, -0.45, 0.55);
    }
    this.place(rx || ry ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 6));

    // Where the head looks, in the world: movement and attacks are relative to it.
    const headFwd = new THREE.Vector3();
    renderer.xr.getCamera().getWorldDirection(headFwd);
    headFwd.setY(0);
    if (headFwd.lengthSq() > 1e-4) {
      headFwd.normalize();
      player.camYaw = Math.atan2(-headFwd.x, -headFwd.z);
    } else {
      player.camYaw = this.yaw + Math.PI;
    }

    // Left thumbstick: move the character.
    const lx = dz(moveX), ly = dz(moveY);
    player.stick.set(lx, -ly);
    player.stickRun = Math.hypot(moveX, moveY) > 0.88;

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

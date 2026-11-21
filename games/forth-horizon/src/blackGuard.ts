// Black 3D view guard: on Kenne's Intel Arc (shared system memory) the 3D view has gone black mid-race while the HUD and menus kept drawing.
// Every 60 frames this reads five pixels of the finished frame; a pure black frame where the sky should be lit is a fault, not a dark scene.
// It escalates: 1) clear the post chain's history (motion blur, speed blur, shafts) and the camera if it went non-finite, 2) turn the post
// chain off and draw the scene directly, 3) report. Each step and what it found is shown in a small note and kept in localStorage
// ('apex.blackLog', also window.apexBlackLog) so the cause can be read back from the player's own browser.
import * as THREE from 'three';

export interface BlackGuardHooks {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** true when the scene ought to be lit (not map mode, not night) */
  shouldBeLit: () => boolean;
  fxOn: () => boolean;
  setFx: (on: boolean) => void;
  /** clear post-chain history (motion blur matrices, speed blur, shafts) */
  resetPost: () => void;
  /** put the camera back somewhere sane (behind the car) */
  resetCamera: () => void;
  context: () => Record<string, unknown>;
}

type Entry = Record<string, unknown> & { t: string; step: string };

export class BlackGuard {
  private strikes = 0;
  private frame = 0;
  private note: HTMLDivElement;
  private noteTimer = 0;
  readonly log: Entry[] = [];

  constructor(private h: BlackGuardHooks) {
    this.note = document.createElement('div');
    this.note.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9998;display:none;max-width:420px;padding:8px 12px;border-radius:10px;background:rgba(12,6,20,.86);color:#ffd9a8;font:600 12px/1.4 Inter,system-ui,sans-serif;pointer-events:none';
    document.body.appendChild(this.note);
    try { const old = JSON.parse(localStorage.getItem('apex.blackLog') ?? '[]'); if (Array.isArray(old)) this.log.push(...old.slice(-20)); } catch { /* storage blocked */ }
    (window as unknown as { apexBlackLog: Entry[] }).apexBlackLog = this.log;
    h.renderer.domElement.addEventListener('webglcontextlost', () => this.record('context-lost', 'The graphics card dropped the 3D view (out of GPU memory). Free disk space on C and close other GPU apps; it reloads the 3D when the card returns.'));
    h.renderer.domElement.addEventListener('webglcontextrestored', () => { this.strikes = 0; this.record('context-restored', '3D view is back.'); });
  }

  private record(step: string, say: string, extra: Record<string, unknown> = {}, show = true): void {
    const e: Entry = { t: new Date().toISOString(), step, ...this.h.context(), ...extra };
    this.log.push(e);
    if (this.log.length > 20) this.log.shift();
    try { localStorage.setItem('apex.blackLog', JSON.stringify(this.log)); } catch { /* storage blocked */ }
    console.warn('[apex-blackguard]', step, e);
    if (!show) return;
    this.note.textContent = say;
    this.note.style.display = 'block';
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => { this.note.style.display = 'none'; }, 9000);
  }

  private cameraFinite(): boolean {
    const c = this.h.camera;
    return c.matrixWorld.elements.every(Number.isFinite) && c.projectionMatrix.elements.every(Number.isFinite) && Number.isFinite(c.fov) && c.near > 0 && c.far > c.near;
  }

  /** call right after the frame is drawn to the screen */
  check(): void {
    if ((++this.frame % 60) !== 30) return;
    const r = this.h.renderer, gl = r.getContext();
    if (!gl || gl.isContextLost() || !this.h.shouldBeLit()) return;
    const w = r.domElement.width, hgt = r.domElement.height, px = new Uint8Array(4);
    // four of five points near black (fog and film grain leave a faulted frame a few levels above 0; a stray lit cloud can survive the fault)
    const at: [number, number][] = [[0.5, 0.5], [0.5, 0.8], [0.25, 0.6], [0.75, 0.6], [0.5, 0.25]];
    let lit = 0, peak = 0;
    for (const [fx, fy] of at) {
      gl.readPixels(Math.floor(w * fx), Math.floor(hgt * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const m = Math.max(px[0], px[1], px[2]);
      peak = Math.max(peak, m);
      if (m > 12) lit++;
    }
    if (lit >= 2) { if (this.strikes) this.record('recovered', '3D view recovered.', { after: this.strikes }, this.strikes >= 4); this.strikes = 0; return; }
    this.strikes++;
    const camOk = this.cameraFinite();
    const fbo = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    const diag = { strike: this.strikes, peak, camOk, fxOn: this.h.fxOn(), glErr: gl.getError(), fbo: fbo === gl.FRAMEBUFFER_COMPLETE ? 'complete' : fbo };
    if (!camOk) this.h.resetCamera();
    // about a second per check: a short tunnel or underpass passes before the effects are touched beyond a history reset
    if (this.strikes === 1) { this.h.resetPost(); this.record('black-1', 'The 3D view went dark. Resetting the effects.', diag, false); }
    else if (this.strikes === 4 && this.h.fxOn()) { this.h.setFx(false); this.record('black-4', 'The 3D view stayed black. Effects are off so you can keep driving.', diag); }
    else if (this.strikes === 7 || this.strikes === 12) this.record('black-' + this.strikes, 'The 3D view is still black. Details are saved; tell Claude "check the black log".', diag);
  }
}

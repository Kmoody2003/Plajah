// "Looks": Plajah's LUTs and Lenses as overlays on the experience.
//  • LUTs (services/color/cinematicLutLibrary) are baked into a 33³ 3D texture and graded in the
//    game's own post chain (post.ts → lut3D after tone mapping): full resolution, ~free.
//  • Lenses (services/lenses/lensEngine) run on a reduced-resolution copy of each frame drawn
//    over the game. Only the film/tape/sensor looks are offered in-game: the face, matte and
//    depth lenses load ML models that would sink the Intel 60 fps baseline.
// Keys: V cycles lenses, B cycles LUTs; the LOOK chip (top right) opens both lists.
import * as THREE from 'three/webgpu';
import { CINEMATIC_LUTS, type CinematicLut } from '../../../services/color/cinematicLutLibrary';
import { setLut } from './post';

export const GAME_LENSES: { id: string; label: string }[] = [
  { id: 'none', label: 'No lens' },
  { id: 'silent', label: 'Silent film' },
  { id: 'grindhouse', label: 'Grindhouse' },
  { id: 'vhs', label: 'VHS camcorder' },
  { id: 'foundfootage', label: 'Found footage' },
  { id: 'night', label: 'Night vision' },
  { id: 'heat', label: 'Heat map' },
];
const LUT_SIZE = 33;
const KEY = 'ravencrest.looks';

function bakeLut(lut: CinematicLut): THREE.Data3DTexture {
  const n = LUT_SIZE, data = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const [R, G, B] = lut.rgbTransfer(r / (n - 1), g / (n - 1), b / (n - 1));
    const i = ((b * n + g) * n + r) * 4;
    data[i] = Math.round(THREE.MathUtils.clamp(R, 0, 1) * 255);
    data[i + 1] = Math.round(THREE.MathUtils.clamp(G, 0, 1) * 255);
    data[i + 2] = Math.round(THREE.MathUtils.clamp(B, 0, 1) * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

type Engine = { setLens(id: string): void; apply(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, src: HTMLVideoElement, now: number): void; dispose(): void };

export class Looks {
  lens = 'none';
  lut: CinematicLut | null = null;
  lutAmount = 1;
  private baked = new Map<string, THREE.Data3DTexture>();
  private overlay = document.createElement('canvas');
  private ctx = this.overlay.getContext('2d')!;
  private engine: Engine | null = null;
  private loading: Promise<Engine> | null = null;
  private chip = document.createElement('div');
  private panel = document.createElement('div');

  constructor(private source: HTMLCanvasElement) {
    this.overlay.id = 'lensOverlay';
    document.body.appendChild(this.overlay);
    this.buildUi();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}') as { lens?: string; lut?: string; amt?: number };
      if (saved.lut) this.setLut(saved.lut, saved.amt ?? 1);
      if (saved.lens) this.setLens(saved.lens);
    } catch { /* storage unavailable */ }
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyV') this.cycleLens();
      if (e.code === 'KeyN') this.cycleLut();
    });
  }

  private save() { try { localStorage.setItem(KEY, JSON.stringify({ lens: this.lens, lut: this.lut?.id ?? null, amt: this.lutAmount })); } catch { /* */ } }

  setLut(id: string | null, amount = this.lutAmount) {
    this.lut = id ? CINEMATIC_LUTS.find((l) => l.id === id) ?? null : null;
    this.lutAmount = amount;
    if (this.lut && !this.baked.has(this.lut.id)) this.baked.set(this.lut.id, bakeLut(this.lut));
    setLut(this.lut ? this.baked.get(this.lut.id)! : null, this.lut ? amount : 0);
    this.save(); this.refresh();
  }
  cycleLut() {
    const i = this.lut ? CINEMATIC_LUTS.indexOf(this.lut) : -1;
    const next = i + 1 >= CINEMATIC_LUTS.length ? null : CINEMATIC_LUTS[i + 1];
    this.setLut(next?.id ?? null);
    this.flash(next ? `LUT · ${next.name}` : 'LUT off');
  }

  async setLens(id: string) {
    this.lens = GAME_LENSES.some((l) => l.id === id) ? id : 'none';
    this.save(); this.refresh();
    if (this.lens === 'none') { this.overlay.classList.remove('on'); return; }
    this.loading ??= import('../../../services/lenses/lensEngine').then((m) => (this.engine = new m.LensEngine() as unknown as Engine));
    const e = await this.loading;
    e.setLens(this.lens);
    this.overlay.classList.add('on');
  }
  cycleLens() {
    const i = GAME_LENSES.findIndex((l) => l.id === this.lens);
    const next = GAME_LENSES[(i + 1) % GAME_LENSES.length];
    this.setLens(next.id);
    this.flash(next.id === 'none' ? 'Lens off' : `Lens · ${next.label}`);
  }

  /** After the game frame is rendered (same task): copy it down-res and run the lens over it. */
  render() {
    if (this.lens === 'none' || !this.engine) return;
    const sw = this.source.width, sh = this.source.height;
    if (!sw || !sh) return;
    const w = Math.min(960, sw), h = Math.round(w * sh / sw);
    if (this.overlay.width !== w || this.overlay.height !== h) { this.overlay.width = w; this.overlay.height = h; }
    this.ctx.drawImage(this.source, 0, 0, w, h);
    this.engine.apply(this.ctx, this.overlay, this.overlay as unknown as HTMLVideoElement, performance.now());
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  private toastT = 0;
  private flash(text: string) {
    this.chip.dataset.toast = text;
    this.chip.classList.add('toast');
    const id = ++this.toastT;
    setTimeout(() => { if (id === this.toastT) this.chip.classList.remove('toast'); }, 1400);
  }
  private refresh() {
    const lens = GAME_LENSES.find((l) => l.id === this.lens)!;
    this.chip.querySelector('b')!.textContent = `${lens.id === 'none' ? '—' : lens.label} · ${this.lut ? this.lut.name : 'No LUT'}`;
    (this.panel.querySelector('.lk-lens') as HTMLSelectElement).value = this.lens;
    (this.panel.querySelector('.lk-lut') as HTMLSelectElement).value = this.lut?.id ?? '';
    (this.panel.querySelector('.lk-amt') as HTMLInputElement).value = String(this.lutAmount);
  }
  private buildUi() {
    this.chip.id = 'looks';
    this.chip.innerHTML = '<span>LOOK</span> <b></b>';
    this.panel.id = 'looksPanel';
    this.panel.innerHTML = `
      <label>Lens <select class="lk-lens">${GAME_LENSES.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
      <label>LUT <select class="lk-lut"><option value="">No LUT</option>${CINEMATIC_LUTS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></label>
      <label>Strength <input class="lk-amt" type="range" min="0" max="1" step="0.05" value="1" /></label>
      <small>V cycles lenses · B cycles LUTs</small>`;
    document.body.append(this.chip, this.panel);
    this.chip.addEventListener('click', () => { this.panel.classList.toggle('on'); if (document.pointerLockElement) document.exitPointerLock(); });
    (this.panel.querySelector('.lk-lens') as HTMLSelectElement).addEventListener('change', (e) => this.setLens((e.target as HTMLSelectElement).value));
    (this.panel.querySelector('.lk-lut') as HTMLSelectElement).addEventListener('change', (e) => this.setLut((e.target as HTMLSelectElement).value || null));
    (this.panel.querySelector('.lk-amt') as HTMLInputElement).addEventListener('input', (e) => this.setLut(this.lut?.id ?? null, Number((e.target as HTMLInputElement).value)));
    this.refresh();
  }
}

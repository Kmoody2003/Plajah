// Photo mode, shared by the game and the garage: a free camera with a lens panel, a high-resolution still capture (supersampled through the same render chain the player sees),
// aspect crops, a rule-of-thirds grid, an optional watermark, and a gallery of the player's photos kept on the device (IndexedDB) that can be saved or shared.
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { CarRig } from './car';
import { GAME_LENSES, GAME_LUTS, type GameLens, type GradePass } from './grade';
import { esc } from './garage/outcomeHtml';

// ---------- capture ----------
export interface CaptureOpts { aspect: number | null; maxPixels: number; watermark: string | null; format: 'jpeg' | 'png' }
export interface CaptureRig { renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; composer: EffectComposer | null; render: () => void }

/** the supersample factor that gives the sharpest still the GPU and memory can take: up to 3x the screen, never past maxPixels or the texture limit */
export function stillScale(w: number, h: number, maxPixels: number, maxTex: number): number {
  const byPixels = Math.sqrt(maxPixels / (w * h)), byTex = maxTex / Math.max(w, h);
  return Math.max(1, Math.min(3, byPixels, byTex));
}

/** the largest rectangle of the given aspect that fits in w x h, centred */
export function cropRect(w: number, h: number, aspect: number | null): { x: number; y: number; w: number; h: number } {
  if (!aspect) return { x: 0, y: 0, w, h };
  const cw = Math.min(w, Math.round(h * aspect)), ch = Math.min(h, Math.round(w / aspect));
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch };
}

export async function capture(rig: CaptureRig, o: CaptureOpts): Promise<{ blob: Blob; width: number; height: number }> {
  const { renderer, composer, camera } = rig;
  const w = innerWidth, h = innerHeight, oldPr = renderer.getPixelRatio();
  const gl = renderer.getContext(), maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const scale = stillScale(w, h, o.maxPixels, Math.min(maxTex, 8192));
  const aspectNow = camera.aspect;
  renderer.setPixelRatio(scale);
  if (composer) { composer.setPixelRatio(scale); composer.setSize(w, h); } else renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  rig.render();
  const src = renderer.domElement;
  const W = src.width, H = src.height, r = cropRect(W, H, o.aspect);
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const g = c.getContext('2d')!;
  g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);      // read straight after the render, while the drawing buffer still holds it
  // back to the screen's own resolution
  renderer.setPixelRatio(oldPr);
  if (composer) { composer.setPixelRatio(oldPr); composer.setSize(w, h); } else renderer.setSize(w, h, false);
  camera.aspect = aspectNow; camera.updateProjectionMatrix();
  if (o.watermark) {
    const s = Math.max(14, Math.round(r.h / 42)), pad = Math.round(s * 1.1);
    g.font = `700 ${s}px Outfit, Inter, sans-serif`; g.textBaseline = 'bottom';
    const t = o.watermark.toUpperCase();
    g.fillStyle = 'rgba(0,0,0,.35)'; const tw = g.measureText(t).width; g.fillRect(pad - s * 0.5, r.h - pad - s * 1.25, tw + s, s * 1.7);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(t, pad, r.h - pad);
  }
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), o.format === 'png' ? 'image/png' : 'image/jpeg', 0.93));
  return { blob, width: r.w, height: r.h };
}

// ---------- gallery (IndexedDB) ----------
export interface PhotoMeta { id: number; name: string; at: number; width: number; height: number; blob: Blob }
const DB = 'apex-photos', STORE = 'photos', KEEP = 36;
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
const tx = <T>(db: IDBDatabase, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => new Promise((res, rej) => { const r = f(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const gallery = {
  async list(): Promise<PhotoMeta[]> { try { const db = await open(); const all = await tx<PhotoMeta[]>(db, 'readonly', (s) => s.getAll()); return all.sort((a, b) => b.at - a.at); } catch { return []; } },
  async add(name: string, blob: Blob, width: number, height: number): Promise<void> {
    try {
      const db = await open();
      await tx(db, 'readwrite', (s) => s.add({ name, at: Date.now(), width, height, blob }));
      const all = await this.list();
      for (const old of all.slice(KEEP)) await tx(db, 'readwrite', (s) => s.delete(old.id));      // the oldest go first
    } catch { /* storage unavailable: the photo is still downloaded or shared by the caller */ }
  },
  async remove(id: number): Promise<void> { try { const db = await open(); await tx(db, 'readwrite', (s) => s.delete(id)); } catch { /* ignore */ } },
};

export function fileName(title: string, at = Date.now()): string {
  return `apex-elohim-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date(at).toISOString().replace(/[-:T]/g, '').slice(0, 14)}.jpg`;
}
export function download(blob: Blob, name: string): void {
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
/** the system share sheet with the picture attached where the browser allows it, otherwise a download */
export async function share(blob: Blob, name: string, text: string): Promise<'shared' | 'downloaded'> {
  try {
    const file = new File([blob], name, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: 'Apex Elohim', text }); return 'shared'; }
  } catch (e) { if ((e as DOMException).name === 'AbortError') return 'shared'; }
  download(blob, name);
  return 'downloaded';
}

// ---------- the photo mode panel ----------
export interface Row { label: string; options: [string, string][]; get: () => string; set: (v: string) => void }
export interface PhotoHooks {
  rig: CaptureRig; scene: THREE.Scene; controls: OrbitControls;
  subject: () => THREE.Object3D | null;
  panels: () => CarRig['panels'] | undefined;
  grade: () => GradePass | null;
  title: () => string;
  rows?: () => Row[];                                                  // game-only: time of day, weather
  dof?: { set(on: boolean, aperture: number, focus: number): void };
  onEnter?: () => void; onExit?: () => void;
}
const ASPECTS: [string, string, number | null][] = [['free', 'Screen', null], ['16:9', '16:9', 16 / 9], ['3:2', '3:2', 3 / 2], ['1:1', 'Square', 1], ['4:5', '4:5 portrait', 4 / 5], ['9:16', '9:16 story', 9 / 16]];
const CSS = `
body.pm > *:not(#view):not(.pm-keep):not(canvas){display:none!important}
.pm-panel{position:fixed;right:14px;top:14px;bottom:14px;width:300px;z-index:90;display:flex;flex-direction:column;gap:6px;padding:16px;border-radius:24px;background:rgba(22,6,34,.86);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 60px rgba(0,0,0,.5);color:#eef0f8;font:500 12px Inter,sans-serif;overflow:auto;overflow-x:hidden;box-sizing:border-box}
.pm-panel h4{margin:10px 0 2px;font:700 10px Outfit,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:#D0BCFF}
.pm-panel .t{font:800 16px Outfit,sans-serif;letter-spacing:.06em;color:#FF8C00}
.pm-panel label{display:grid;grid-template-columns:96px minmax(0,1fr) 38px;gap:8px;align-items:center}.pm-panel label.s{grid-template-columns:96px minmax(0,1fr)}.pm-panel select{min-width:0;width:100%}
.pm-panel input[type=range]{width:100%;accent-color:#D40055}.pm-panel select{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 8px;font:600 11px Outfit,sans-serif}
.pm-panel .v{font:600 10px 'JetBrains Mono',monospace;color:#ffd166;text-align:right}
.pm-btns{display:flex;flex-wrap:wrap;gap:6px}.pm-btn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:7px 14px;font:700 11px Outfit,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.pm-btn:hover{border-color:#FF8C00}.pm-btn.go{background:linear-gradient(135deg,#D40055,#FF8C00);border:0;box-shadow:0 0 24px rgba(212,0,85,.4)}.pm-btn.on{background:#D40055;border-color:transparent}
.pm-grid{position:fixed;inset:0;z-index:80;pointer-events:none;display:none;background:linear-gradient(90deg,transparent calc(33.33% - .5px),rgba(255,255,255,.35) calc(33.33% - .5px) calc(33.33% + .5px),transparent calc(33.33% + .5px) calc(66.66% - .5px),rgba(255,255,255,.35) calc(66.66% - .5px) calc(66.66% + .5px),transparent calc(66.66% + .5px)),linear-gradient(180deg,transparent calc(33.33% - .5px),rgba(255,255,255,.35) calc(33.33% - .5px) calc(33.33% + .5px),transparent calc(33.33% + .5px) calc(66.66% - .5px),rgba(255,255,255,.35) calc(66.66% - .5px) calc(66.66% + .5px),transparent calc(66.66% + .5px))}
.pm-mask{position:fixed;inset:0;z-index:79;pointer-events:none;display:none}
.pm-flash{position:fixed;inset:0;z-index:95;background:#fff;opacity:0;pointer-events:none;transition:opacity .35s}
.pm-gal{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.pm-th{position:relative;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:#000;cursor:pointer;border:1px solid rgba(255,255,255,.12)}.pm-th img{width:100%;height:100%;object-fit:cover;display:block}
.pm-note{font:500 11px Inter,sans-serif;color:rgba(255,255,255,.6);line-height:1.4}.pm-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:96;padding:9px 20px;border-radius:999px;background:#1c0a2a;border:1px solid #00f5d4;font:600 13px Inter,sans-serif;color:#fff}`;

export class PhotoMode {
  active = false;
  private el = document.createElement('div');
  private grid = document.createElement('div');
  private mask = document.createElement('div');
  private flash = document.createElement('div');
  private aspect: number | null = null;
  private fov = 0; private fovWas = 0;
  private opts = { grid: false, watermark: true, format: 'jpeg' as 'jpeg' | 'png', dof: false, aperture: 0.5, focus: 6 };
  private busy = false;
  private keyFn = (e: KeyboardEvent): void => this.key(e);
  private resizeFn = (): void => this.layoutMask();

  constructor(private h: PhotoHooks) {
    if (!document.getElementById('pm-css')) { const s = document.createElement('style'); s.id = 'pm-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.el.className = 'pm-panel pm-keep'; this.grid.className = 'pm-grid pm-keep'; this.mask.className = 'pm-mask pm-keep'; this.flash.className = 'pm-flash pm-keep';
    this.el.style.display = 'none';
    document.body.append(this.el, this.grid, this.mask, this.flash);
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  toggle(): void { this.active ? this.exit() : this.enter(); }

  enter(): void {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('pm');
    this.fovWas = this.h.rig.camera.fov; this.fov = this.fovWas;
    this.h.onEnter?.();
    this.h.controls.enabled = true; this.h.controls.enableDamping = true; this.h.controls.enablePan = true; this.h.controls.minDistance = 1.2;
    const s = this.h.subject();
    if (s) { const b = new THREE.Box3().setFromObject(s), c = b.getCenter(new THREE.Vector3()); this.h.controls.target.copy(c); }
    this.panelCount = this.h.panels()?.names.length ?? 0;
    this.el.style.display = 'flex'; this.build();
    window.addEventListener('keydown', this.keyFn, true); window.addEventListener('resize', this.resizeFn);
    this.layoutMask(); void this.refreshGallery();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('pm');
    this.h.rig.camera.fov = this.fovWas; this.h.rig.camera.updateProjectionMatrix();
    this.h.dof?.set(false, 0, 0);
    this.el.style.display = 'none'; this.grid.style.display = 'none'; this.mask.style.display = 'none';
    window.removeEventListener('keydown', this.keyFn, true); window.removeEventListener('resize', this.resizeFn);
    this.h.onExit?.();
  }

  private key(e: KeyboardEvent): void {
    if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
    if (e.code === 'Escape' || e.code === 'KeyK') { e.preventDefault(); e.stopImmediatePropagation(); this.exit(); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); void this.shoot(); }
    else if (e.code === 'KeyG') { this.opts.grid = !this.opts.grid; this.grid.style.display = this.opts.grid ? 'block' : 'none'; }
    else e.stopImmediatePropagation();                                       // nothing reaches the game while the camera is in the player's hands
  }

  /** call every frame while active */
  update(): void {
    if (!this.active) return;
    // the scanned car finishes loading a moment after the stand-in is drawn: when its panels appear, show their buttons
    const np = this.h.panels()?.names.length ?? 0;
    if (np !== this.panelCount) { this.panelCount = np; this.build(); void this.refreshGallery(); }
    this.h.controls.update();
    if (this.opts.dof && this.h.dof) {
      const s = this.h.subject(); const d = s ? this.h.rig.camera.position.distanceTo(new THREE.Box3().setFromObject(s).getCenter(new THREE.Vector3())) : this.opts.focus;
      this.h.dof.set(true, this.opts.aperture, d);
    }
  }

  private layoutMask(): void {
    if (!this.active) return;
    const w = innerWidth, h = innerHeight, r = cropRect(w, h, this.aspect);
    if (!this.aspect || (r.w === w && r.h === h)) { this.mask.style.display = 'none'; return; }
    this.mask.style.display = 'block';
    this.mask.style.background = `linear-gradient(#000a,#000a) 0 0/100% ${r.y}px no-repeat, linear-gradient(#000a,#000a) 0 100%/100% ${r.y}px no-repeat, linear-gradient(#000a,#000a) 0 0/${r.x}px 100% no-repeat, linear-gradient(#000a,#000a) 100% 0/${r.x}px 100% no-repeat`;
  }

  private toast(t: string): void { const d = document.createElement('div'); d.className = 'pm-toast pm-keep'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

  async shoot(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const ui = [this.el, this.grid, this.mask];
    ui.forEach((e) => { e.style.visibility = 'hidden'; });
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const r = await capture(this.h.rig, { aspect: this.aspect, maxPixels: 16e6, watermark: this.opts.watermark ? `Apex Elohim · ${this.h.title()}` : null, format: this.opts.format });
      this.flash.style.opacity = '.85'; setTimeout(() => { this.flash.style.opacity = '0'; }, 90);
      const name = fileName(this.h.title());
      await gallery.add(name, r.blob, r.width, r.height);
      this.toast(`Photo saved · ${r.width}×${r.height}`);
    } catch (e) { this.toast('Could not take the photo: ' + String(e)); }
    finally { ui.forEach((e) => { e.style.visibility = ''; }); this.busy = false; void this.refreshGallery(); }
  }

  private async refreshGallery(): Promise<void> {
    const box = this.el.querySelector('.pm-gal') as HTMLElement | null; if (!box) return;
    const list = await gallery.list();
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="pm-note" style="grid-column:1/4">Your photos appear here.</div>'; return; }
    for (const p of list.slice(0, 12)) {
      const d = document.createElement('div'); d.className = 'pm-th'; const u = URL.createObjectURL(p.blob);
      d.innerHTML = `<img src="${u}" alt="${esc(p.name)}">`; d.onclick = () => this.viewPhoto(p, u); box.appendChild(d);
    }
  }

  private viewPhoto(p: PhotoMeta, url: string): void {
    const o = document.createElement('div'); o.className = 'pm-keep'; o.style.cssText = 'position:fixed;inset:0;z-index:97;background:rgba(8,2,14,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px';
    o.innerHTML = `<img src="${url}" style="max-width:92vw;max-height:76vh;border-radius:14px;box-shadow:0 20px 70px #000"><div class="pm-btns"><button class="pm-btn go" data-a="share">Share</button><button class="pm-btn" data-a="save">Save to device</button><button class="pm-btn" data-a="del">Delete</button><button class="pm-btn" data-a="x">Close</button></div>`;
    o.addEventListener('click', async (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'x' || e.target === o) o.remove();
      if (a === 'save') download(p.blob, p.name);
      if (a === 'share') { const r = await share(p.blob, p.name, `${this.h.title()} in Apex Elohim`); this.toast(r === 'shared' ? 'Shared' : 'Saved to your device'); }
      if (a === 'del') { await gallery.remove(p.id); o.remove(); void this.refreshGallery(); }
    });
    document.body.appendChild(o);
  }

  private build(): void {
    const cam = this.h.rig.camera, pan = this.h.panels();
    const rows = this.h.rows?.() ?? [];
    const sl = (id: string, label: string, min: number, max: number, step: number, val: number, unit = ''): string => `<label>${label}<input type="range" data-s="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="v" data-v="${id}">${val}${unit}</span></label>`;
    const g = this.h.grade();
    this.el.innerHTML = `<div class="t">PHOTO MODE</div><div class="pm-note">Drag to orbit · right-drag to pan · wheel to zoom · Enter takes the shot · G grid · Esc exits</div>
      <div class="pm-btns"><button class="pm-btn go" data-a="shoot">Take photo</button><button class="pm-btn" data-a="exit">Exit</button></div>
      ${pan ? `<h4>Doors and panels</h4><div class="pm-btns">${pan.names.map((n) => `<button class="pm-btn" data-p="${n}">${({ doorL: 'Left door', doorR: 'Right door', hood: 'Hood', trunk: 'Trunk' } as Record<string, string>)[n] ?? n}</button>`).join('')}<button class="pm-btn" data-p="*">All</button></div>` : ''}
      <h4>Camera</h4>${sl('fov', 'Lens (FOV)', 14, 90, 1, Math.round(cam.fov), '°')}
      <label class="s">Frame<select data-sel="aspect">${ASPECTS.map(([id, l]) => `<option value="${id}">${l}</option>`).join('')}</select></label>
      ${this.h.dof ? `<label class="s">Depth of field<select data-sel="dof"><option value="off">Off</option><option value="on">On</option></select></label>${sl('aperture', 'Blur amount', 0.1, 3, 0.1, this.opts.aperture)}` : ''}
      <h4>Look</h4>
      <label class="s">Colour grade<select data-sel="lut"><option value="none">None</option>${GAME_LUTS.map((l) => `<option value="${l.id}">${esc(l.label)}</option>`).join('')}</select></label>
      <label class="s">Lens effect<select data-sel="lens">${GAME_LENSES.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
      ${rows.map((r, i) => `<label class="s">${r.label}<select data-row="${i}">${r.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>`).join('')}
      <h4>Output</h4>
      <label class="s">Format<select data-sel="fmt"><option value="jpeg">JPEG (small)</option><option value="png">PNG (lossless)</option></select></label>
      <div class="pm-btns"><button class="pm-btn ${this.opts.watermark ? 'on' : ''}" data-a="wm">Watermark</button><button class="pm-btn ${this.opts.grid ? 'on' : ''}" data-a="grid">Grid</button></div>
      <div class="pm-note">Stills are rendered up to 3× the screen resolution (up to 16 megapixels) through the same render chain you see.</div>
      <h4>Photos</h4><div class="pm-gal"></div>`;
    const q = <T extends HTMLElement>(s: string): T | null => this.el.querySelector(s);
    this.el.oninput = (e) => {
      const t = e.target as HTMLInputElement; const id = t.dataset.s; if (!id) return;
      const v = parseFloat(t.value); const out = q(`[data-v="${id}"]`);
      if (id === 'fov') { cam.fov = v; cam.updateProjectionMatrix(); if (out) out.textContent = v + '°'; }
      if (id === 'aperture') { this.opts.aperture = v; if (out) out.textContent = String(v); }
    };
    this.el.onchange = (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.sel === 'aspect') { this.aspect = ASPECTS.find((a) => a[0] === t.value)![2]; this.layoutMask(); }
      if (t.dataset.sel === 'dof') { this.opts.dof = t.value === 'on'; if (!this.opts.dof) this.h.dof?.set(false, 0, 0); }
      if (t.dataset.sel === 'lut') { const gp = this.h.grade(); if (gp) { gp.lut = t.value; if (t.value !== 'none') gp.lutAmount = 1; } }
      if (t.dataset.sel === 'lens') { const gp = this.h.grade(); if (gp) gp.lens = t.value as GameLens; }
      if (t.dataset.sel === 'fmt') this.opts.format = t.value as 'jpeg' | 'png';
      if (t.dataset.row !== undefined) rows[Number(t.dataset.row)].set(t.value);
    };
    this.el.onclick = (e) => {
      const t = (e.target as HTMLElement).closest('button') as HTMLElement | null; if (!t) return;
      if (t.dataset.a === 'shoot') void this.shoot();
      if (t.dataset.a === 'exit') this.exit();
      if (t.dataset.a === 'wm') { this.opts.watermark = !this.opts.watermark; t.classList.toggle('on', this.opts.watermark); }
      if (t.dataset.a === 'grid') { this.opts.grid = !this.opts.grid; t.classList.toggle('on', this.opts.grid); this.grid.style.display = this.opts.grid ? 'block' : 'none'; }
      if (t.dataset.p && pan) { if (t.dataset.p === '*') { this.allOpen = !this.allOpen; pan.names.forEach((n) => pan.set(n, this.allOpen ? 1 : 0)); } else pan.toggle(t.dataset.p); }
    };
    // reflect the current grade and effect in the selects
    const gp = g; if (gp) { (q('[data-sel="lut"]') as HTMLSelectElement).value = gp.lut; (q('[data-sel="lens"]') as HTMLSelectElement).value = gp.lens; }
    rows.forEach((r, i) => { (q(`[data-row="${i}"]`) as HTMLSelectElement).value = r.get(); });
    (q('[data-sel="aspect"]') as HTMLSelectElement).value = ASPECTS.find((a) => a[2] === this.aspect)![0];
  }
  private allOpen = false;
  private panelCount = 0;
}

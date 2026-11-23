// Rift Realm — the loading screen: real stages with names, a bar that moves, the chosen vessel's turntable and the
// map's fly-through playing, rotating tips. Built so it keeps animating while the main thread is busy (the world build
// and shader compile block it for seconds at a time): every animation is a CSS transform/opacity animation or a
// <video>, which the browser's compositor runs on its own; JS only sets the stage text and the bar's targets.
//
// The bar: each stage owns a slice of the bar. Starting a stage starts a long CSS transition toward the end of its
// slice, timed from how long that stage took last time (localStorage), so the bar keeps crawling through a blocked
// stage; real sub-progress (shaders built / compiled) snaps it forward. Stage times land in window.__rrLoad.marks
// and the console ([load] lines), which scripts/riftrealm/load_timing.mjs reads.
import { TIPS } from './content';

export type StageId = 'assets' | 'world' | 'prepare' | 'collision' | 'characters' | 'spawn' | 'warm';
const STAGES: { id: StageId; label: string; w: number; guess: number }[] = [
  { id: 'assets', label: 'Streaming textures and models', w: 12, guess: 1500 },
  { id: 'world', label: 'Raising the world', w: 20, guess: 4000 },
  { id: 'prepare', label: 'Forging shaders', w: 46, guess: 15000 },
  { id: 'collision', label: 'Grounding the colliders', w: 6, guess: 800 },
  { id: 'characters', label: 'Binding the vessel', w: 6, guess: 600 },
  { id: 'spawn', label: 'Opening the rift', w: 8, guess: 1200 },
];
const TOTAL = STAGES.reduce((s, x) => s + x.w, 0);
const KEY = 'rift-realm-load-times';

export interface LoadMark { id: string; ms: number; at: number }
declare global { interface Window { __rrLoad?: { t0: number; marks: LoadMark[]; total?: number } } }

const nextPaint = () => new Promise<void>((r) => {
  let done = false; const fin = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => requestAnimationFrame(fin)); setTimeout(fin, 50); // hidden tabs: rAF never comes
});

export class LoadScreen {
  readonly el: HTMLDivElement;
  private bar: HTMLElement; private label: HTMLElement; private pct: HTMLElement; private detail: HTMLElement; private list: HTMLElement;
  private cur: (typeof STAGES)[number] | null = null;
  private curT = 0; private done = 0; private shown = 0;
  private times: Record<string, number> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
  private resolveReady: (() => void) | null = null;

  constructor(opts: { mapName: string; mapVideo: string; mapPoster: string; charName: string; charVideo: string; charPoster: string; accent: string }) {
    window.__rrLoad = { t0: performance.now(), marks: [] };
    const el = this.el = document.createElement('div');
    el.className = 'rr-load';
    el.style.setProperty('--accent', opts.accent);
    const tips = TIPS.map((t, i) => `<p style="animation-delay:${i * 5}s">${t}</p>`).join('');
    el.innerHTML = `
      <video class="rr-load-bg" muted loop playsinline autoplay preload="auto" poster="${opts.mapPoster}" src="${opts.mapVideo}"></video>
      <div class="rr-load-shade"></div>
      <div class="rr-load-vignette">
        <div class="rr-sigil"><i></i><i></i><i></i></div>
        <video muted loop playsinline autoplay preload="auto" poster="${opts.charPoster}" src="${opts.charVideo}"></video>
      </div>
      <div class="rr-load-brand">Vesselbound</div>
      <div class="rr-load-head"><div class="rr-kicker">Entering</div><h2>${opts.mapName}</h2><div class="rr-load-as">as <b>${opts.charName}</b></div></div>
      <ol class="rr-load-stages">${STAGES.map((s) => `<li data-s="${s.id}"><span></span>${s.label}</li>`).join('')}</ol>
      <div class="rr-load-foot">
        <div class="rr-load-row"><span class="rr-load-label">Preparing</span><span class="rr-load-detail"></span><span class="rr-load-pct">0%</span></div>
        <div class="rr-load-track"><i class="rr-load-bar"></i><b class="rr-load-sheen"></b></div>
        <div class="rr-load-tips" style="--n:${TIPS.length}">${tips}</div>
        <div class="rr-load-ready">Press <kbd>Enter</kbd> · click · <kbd>A</kbd> to enter the rift</div>
      </div>`;
    this.bar = el.querySelector('.rr-load-bar')!;
    this.label = el.querySelector('.rr-load-label')!;
    this.pct = el.querySelector('.rr-load-pct')!;
    this.detail = el.querySelector('.rr-load-detail')!;
    this.list = el.querySelector('.rr-load-stages')!;
    document.body.appendChild(el);
  }

  private setBar(frac: number, ms: number) {
    this.bar.style.transition = `transform ${Math.max(0, ms)}ms ${ms > 400 ? 'cubic-bezier(.2,.6,.4,1)' : 'ease-out'}`;
    this.bar.style.transform = `scaleX(${Math.min(1, frac).toFixed(4)})`;
    this.shown = frac;
    this.pct.textContent = `${Math.round(frac * 100)}%`;
  }

  /** Start a stage; resolves after the browser painted it, so a blocking stage shows its name and moving bar. */
  async stage(id: StageId, detail = '') {
    this.end();
    const s = STAGES.find((x) => x.id === id);
    if (!s) return;
    this.cur = s; this.curT = performance.now();
    this.label.textContent = s.label;
    this.detail.textContent = detail;
    this.list.querySelector(`[data-s="${id}"]`)?.classList.add('on');
    // crawl toward 92 % of this stage's slice over the time it took last load
    const expect = this.times[id] ?? s.guess;
    this.setBar(this.shown, 120);
    await nextPaint();
    this.setBar((this.done + s.w * 0.92) / TOTAL, expect * 1.1);
    await nextPaint();
  }

  /** Real progress inside the current stage (0…1); never moves the bar backwards. */
  progress(f: number, detail?: string) {
    if (!this.cur) return;
    if (detail !== undefined) this.detail.textContent = detail;
    // counts can race ahead (a stage runs several compile passes, each starting from zero): never ahead of the clock
    // by much, judged by how long this stage took last time
    const expect = this.times[this.cur.id] ?? this.cur.guess;
    f = Math.min(f, ((performance.now() - this.curT) / expect) * 1.15);
    const frac = (this.done + this.cur.w * Math.max(0, Math.min(1, f))) / TOTAL;
    if (frac > this.shown + 0.002) {
      // keep the crawl going past the real value
      const left = Math.max(300, (this.times[this.cur.id] ?? this.cur.guess) * (1 - f));
      this.setBar(frac, 160);
      requestAnimationFrame(() => this.setBar(Math.max(frac, (this.done + this.cur!.w * 0.97) / TOTAL), left));
    }
  }

  private end() {
    if (!this.cur) return;
    const ms = performance.now() - this.curT;
    this.times[this.cur.id] = Math.round(ms);
    window.__rrLoad!.marks.push({ id: this.cur.id, ms, at: performance.now() - window.__rrLoad!.t0 });
    console.info(`[load] ${this.cur.id} ${Math.round(ms)} ms`);
    this.list.querySelector(`[data-s="${this.cur.id}"]`)?.classList.replace('on', 'ok');
    this.done += this.cur.w;
    this.cur = null;
  }

  /** All stages done: full bar, the "press to enter" prompt; resolves on Enter / click / a pad button. */
  ready(): Promise<void> {
    this.end();
    const total = performance.now() - window.__rrLoad!.t0;
    window.__rrLoad!.total = total;
    console.info(`[load] total ${Math.round(total)} ms`);
    try { localStorage.setItem(KEY, JSON.stringify(this.times)); } catch { /* private mode */ }
    this.setBar(1, 200);
    this.label.textContent = 'The rift is open';
    this.detail.textContent = `${(total / 1000).toFixed(1)} s`;
    this.el.classList.add('is-ready');
    return new Promise<void>((res) => {
      this.resolveReady = res;
      const go = () => { off(); res(); };
      const key = (e: KeyboardEvent) => { if (['Enter', 'Space', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); go(); } };
      // a fresh press of A / Start (one still held from the character screen must be let go first)
      let armed = false;
      const pad = window.setInterval(() => {
        const down = (navigator.getGamepads?.() ?? []).some((g) => g?.buttons.some((b, i) => b.pressed && (i === 0 || i === 9)));
        if (!down) armed = true; else if (armed) go();
      }, 50);
      const off = () => { window.removeEventListener('keydown', key); this.el.removeEventListener('click', go); window.clearInterval(pad); };
      window.addEventListener('keydown', key);
      this.el.addEventListener('click', go);
    });
  }

  /** Skip the prompt (debug entry). */
  release() { this.resolveReady?.(); }

  hide() {
    this.el.classList.add('is-gone');
    this.el.querySelectorAll('video').forEach((v) => v.pause());
    window.setTimeout(() => this.el.remove(), 600);
  }
}

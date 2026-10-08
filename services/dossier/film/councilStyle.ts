/**
 * The council painter: draws any frame of a compiled CouncilTimeline as a pure function of time.
 *
 * Editor's cut (synthesis.json): flat exhibit grounds; NO grain, halation, vignette, depth-parallax, blurred backdrop,
 * glitch or lens effects. Archive plates are only ever positioned, scaled and masked: one drawImage into an integer
 * rectangle, nothing over it, never a filter, never an alpha < 1. Type is the exhibit's real display face plus
 * Source Serif 4 (captions) and Inter Tight (provenance); all of it is browser-rendered text.
 */
import type { Box, CouncilTheme, CouncilTimeline, GraphicSpec, LaidPlate, PlateMark, ScriptString, TShot } from './councilTypes';
import { DH, DW, GEO } from './councilTypes';
import { balanceLines } from './captions';
import { GATE, drawTransition } from './transitions';
import { shotAt } from './councilCompile';
import { slateLines } from './provenance';
import { clamp, ease, lerp, span } from './motion';
import { isolateLine } from './isolate';
import { mixHex } from '../dossierTheme';
import { PAINTING_MARGIN_W, PAINTING_MARGIN_X, PaintingFx, paintingCamAt, paintingMotion, type AnimatedPaintingSpec } from './animatedPainting';

const F = 1 / 30;
/** Partition: x of the madder rule once it becomes the margin hairline (between the plate field and the margin column). */
export const MARGIN_LINE_X = 1280;

export interface PaintOpts { captions: boolean; reduced: boolean }

export class CouncilPainter {
  private ctx!: CanvasRenderingContext2D;
  private reduced = false;
  private cache = new Map<string, HTMLCanvasElement>();
  private W = DW; private H = DH;
  /** One GPU compositor per animated painting (animatedPainting.ts), built on first use at the canvas's pixel scale. */
  private fxs = new Map<string, PaintingFx | null>();
  /** Names every font stack the film needs (with the sample text that selects the right unicode-range subset), so the loader can wait for them. */
  readonly fontLoads: Array<[string, string?]>;
  private isolated = new Map<string, HTMLCanvasElement>();

  constructor(readonly tl: CouncilTimeline, private image: (id: string) => HTMLImageElement | undefined) {
    const th = tl.film.theme;
    this.fontLoads = [[`400 64px ${th.display}`], [`italic 500 64px ${th.display}`], [`600 44px ${th.serif}`], [`400 44px ${th.serif}`], [`500 26px ${th.sans}`], [`600 26px ${th.sans}`], [`600 30px ${th.sans}`]];
    if (th.faces?.slab) this.fontLoads.push([`400 64px ${th.faces.slab}`]);
    for (const a of tl.film.allowedScripts ?? []) { const f = th.faces?.[a.lang]; if (f) this.fontLoads.push([`400 64px ${f}`, a.text], [`600 64px ${f}`, a.text]); }
  }

  /** The face stack for a real script string. */
  private scriptFace(lang: ScriptString['lang']) { return this.th.faces?.[lang] ?? this.th.serif; }

  private get th(): CouncilTheme { return this.tl.film.theme; }
  private mute(a: number) { return mixHex(this.th.bg, this.th.ink, a); }
  private font(weight: number | string, px: number, face: 'display' | 'serif' | 'sans') { return `${weight} ${px}px ${this.th[face]}`; }
  private text(s: string) { return this.th.upper ? s.toUpperCase() : s; }

  /** Animation progress: eased in normal mode; a step in the authored reduced-motion cut list. */
  private an(t: number, a: number, b: number, e: Parameters<typeof ease>[0] = 'out') {
    return this.reduced ? (t >= a ? 1 : 0) : ease(e, span(t, a, b));
  }

  // ── Frame ─────────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, o: PaintOpts): void {
    this.ctx = ctx; this.reduced = o.reduced; this.W = W; this.H = H;
    const tl = this.tl;
    t = clamp(t, 0, tl.duration - 1e-3);
    ctx.save();
    ctx.setTransform(W / DW, 0, 0, H / DH, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    this.ground();
    const s = shotAt(tl, t), local = t - s.start;
    const prev = s.index > 0 ? tl.shots[s.index - 1] : undefined;
    if (prev && s.trDur > 0 && local < s.trDur) {
      drawTransition(s.transition, {
        ctx, theme: this.th, reduced: o.reduced, local, rect: s.plates[0], label: s.spec.stamp, seed: s.index,
        lineX: tl.film.marginLine ? MARGIN_LINE_X : undefined, ghost: this.ghost(),
        drawOut: () => this.shot(prev, prev.end - prev.start - 1e-3, prev.end - 1e-3),
        drawIn: () => this.shot(s, local, t),
      });
    } else this.shot(s, local, t);
    this.ui(t, s, o.captions);
    ctx.restore();
  }

  private ground(color?: string) { this.ctx.fillStyle = color ?? this.th.bg; this.ctx.fillRect(0, 0, DW, DH); }

  private shot(s: TShot, local: number, t: number) {
    this.ground(s.spec.ground);
    switch (s.kind) {
      case 'title': return this.title(s, local);
      case 'card': return this.card(s);
      case 'end': return this.endCard(s, local);
      case 'plates': return this.plates(s, local, t);
      case 'animated': return this.animated(s, local);
      case 'graphic': return this.graphicShot(s, local, t);
    }
  }

  // ── Plates ────────────────────────────────────────────────────────────────────
  private plates(s: TShot, local: number, t: number) {
    const full = s.plates.some(p => p.spec.fullBleed);
    const gate = s.transition === 'reconGate';
    const dur = s.end - s.start;
    for (const p of s.plates) {
      const alpha = gate && p.spec.kind === 'reconstruction'
        ? (this.reduced ? span(local, GATE.fadeFrom, GATE.fadeFrom + 0.15) : span(local, GATE.fadeFrom, GATE.fadeTo)) : 1;
      if (p.spec.treatment) { this.isolatedPlate(s, p, t); continue; }
      this.plate(p, alpha, p.spec.kind === 'reconstruction' ? 1 + 0.02 * (this.reduced ? 0 : span(local, 0, dur)) : 1, !full, s.plates[0] === p ? this.detailOf(s, t) : undefined);
    }
    this.marks(s, t);
    // Provenance Slate: present under the plate for the whole hold, from its first frame (the gate sets it first).
    const showSlate = !gate || local >= GATE.stampAt;
    if (showSlate && s.slateBox) {
      if (s.spec.groupSlate) this.slate(s.slateBox, { stamp: false, ...slateOf(s.spec.groupSlate) }, false);
      else s.plates.forEach((p, i) => this.slate(i === 0 ? s.slateBox! : { ...s.slateBox!, x: p.x }, slateLines(p.spec), !!p.spec.fullBleed));
    }
    if (full) return;
    if (gate && local < GATE.fadeFrom) return;   // bare ground and the stamp come first; the margin follows the picture
    // Margin column: year and place, then the room's one graphic, then the lower third on first entrance only.
    const m = s.spec.margin;
    const ctx = this.ctx;
    if (m?.year) { ctx.fillStyle = this.th.accent; ctx.font = this.font(400, 64, 'display'); ctx.fillText(this.text(m.year), GEO.margin.x, GEO.margin.y + 64); }
    if (m?.place) { ctx.fillStyle = this.mute(0.85); ctx.font = this.font(500, 28, 'sans'); this.fit(m.place, GEO.margin.x, GEO.margin.y + 108, GEO.margin.w, 28, 500, 'sans'); }
    if (m?.script) this.marginScript(m.script.text, m.script.reading, GEO.margin.x, GEO.margin.y + 190, 64);
    this.graphic(s, t);
    this.lowerThird(s, t);
  }

  /**
   * The plate scaled ONCE into its own canvas at its laid size (Chromium's best resampler, no filter, no tint). Every frame
   * then blits it 1:1, so nothing resamples per frame and the pixels in the film are exactly these pixels.
   */
  private scaled(p: LaidPlate, img: HTMLImageElement): HTMLCanvasElement {
    const key = `${p.spec.asset}|${p.w}x${p.h}|${p.crop ? `${p.crop.x},${p.crop.y},${p.crop.w},${p.crop.h}` : ''}`;
    let c = this.cache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (p.crop) g.drawImage(img, p.crop.x, p.crop.y, p.crop.w, p.crop.h, 0, 0, p.w, p.h); else g.drawImage(img, 0, 0, p.w, p.h);
      this.cache.set(key, c);
    }
    return c;
  }

  private plate(p: LaidPlate, alpha: number, push: number, frame: boolean, detail?: { rect: { x: number; y: number; w: number; h: number } }) {
    const ctx = this.ctx, img = this.image(p.spec.asset);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!img) { ctx.fillStyle = this.mute(0.12); ctx.fillRect(p.x, p.y, p.w, p.h); }
    else if (detail) {   // a flat crop-in on unchanged pixels: a window of the source scaled into the plate's own rectangle
      const r = detail.rect;
      ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
      ctx.drawImage(img, r.x * img.naturalWidth, r.y * img.naturalHeight, r.w * img.naturalWidth, r.h * img.naturalHeight, p.x, p.y, p.w, p.h);
    }
    else if (push === 1) ctx.drawImage(this.scaled(p, img), p.x, p.y);   // 1:1 blit: position and mask only
    else {   // a reconstruction's 2% push, masked to its frame
      ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.scale(push, push); ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
      ctx.drawImage(this.scaled(p, img), p.x, p.y);
    }
    ctx.restore();
    if (frame) {   // a 1 px hairline on the ground, outside the plate's own pixels
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = this.mute(0.32); ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 0.5, p.y - 0.5, p.w + 1, p.h + 1); ctx.restore();
    }
  }

  private slate(box: Box, l: { stamp: boolean; line1: string; line2: string; lead?: string }, oneRow: boolean) {
    const ctx = this.ctx;
    if (l.stamp) {
      const stampW = this.drawStamp(box.x, box.y + 2);
      ctx.font = this.font(500, 28, 'sans'); ctx.fillStyle = this.mute(0.92);
      if (oneRow) this.fit(l.line2, box.x + stampW + 28, box.y + 34, box.w - stampW - 28, 28, 500, 'sans');
      else this.wrap(l.line2, box.x, box.y + 82, box.w, 34, 28);
      return;
    }
    ctx.font = this.font(500, 26, 'sans'); ctx.fillStyle = this.th.ink;
    this.fit(l.line1, box.x, box.y + 26, box.w, 26, 500, 'sans');
    // Line 2: ARCHIVE in plain ink, the rest a step down.
    const lead = l.lead ?? 'ARCHIVE';
    ctx.font = this.font(600, 26, 'sans'); ctx.fillStyle = this.th.ink; ctx.fillText(lead, box.x, box.y + 62);
    const lw = ctx.measureText(lead + ' ').width;
    ctx.font = this.font(500, 26, 'sans'); ctx.fillStyle = this.mute(0.78);
    this.fit(l.line2.replace(/^[A-Z]+\s*·?\s*/, ''), box.x + lw, box.y + 62, box.w - lw, 26, 500, 'sans');
  }

  /** The RECONSTRUCTION stamp: Inter Tight caps +140 tracking, 30 px, a hollow 3 px box. Returns its width. */
  private drawStamp(x: number, y: number, text = 'RECONSTRUCTION', color = this.th.stamp): number {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this.font(600, 30, 'sans');
    (ctx as any).letterSpacing = '4.2px';
    const w = ctx.measureText(text).width + 28;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 44 - 3);
    ctx.fillStyle = color; ctx.fillText(text, x + 14, y + 32);
    (ctx as any).letterSpacing = '0px';
    ctx.restore();
    return w;
  }

  /** Draw a single line shrunk to fit `maxW`. */
  private fit(s: string, x: number, y: number, maxW: number, px: number, weight: number, face: 'display' | 'serif' | 'sans') {
    const ctx = this.ctx;
    ctx.font = this.font(weight, px, face);
    let size = px; const w = ctx.measureText(s).width;
    if (w > maxW) { size = Math.max(Math.min(px, 24), Math.floor(px * maxW / w)); ctx.font = this.font(weight, size, face); }
    ctx.fillText(s, x, y);
  }

  private wrap(s: string, x: number, y: number, maxW: number, lh: number, px: number) {
    const ctx = this.ctx; ctx.font = this.font(500, px, 'sans');
    const words = s.split(/\s+/); let line = '', yy = y;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) { ctx.fillText(line, x, yy); yy += lh; line = w; } else line = next;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // ── Marks on a document plate: one underline, one flat crop-in ───────────────
  private markOf<K extends PlateMark['kind']>(s: TShot, kind: K) { return s.marks.find(m => m.mark.kind === kind) as { mark: Extract<PlateMark, { kind: K }>; at: number } | undefined; }

  /** The crop window at time t (interpolated from the whole plate to the rect), or undefined before the move starts. */
  private detailOf(s: TShot, t: number): { rect: { x: number; y: number; w: number; h: number } } | undefined {
    const d = this.markOf(s, 'detail'); if (!d || t < d.at) return undefined;
    const k = this.reduced ? 1 : ease('inOut', span(t, d.at, d.at + (d.mark.dur ?? 1.4)));
    const r = d.mark.rect;
    return { rect: { x: lerp(0, r.x, k), y: lerp(0, r.y, k), w: lerp(1, r.w, k), h: lerp(1, r.h, k) } };
  }

  /** Where the first plate's normalised point lands on screen at time t (follows the crop-in). */
  private onPlate(s: TShot, t: number, x: number, y: number): { x: number; y: number; k: number } {
    const p = s.plates[0], d = this.detailOf(s, t);
    const r = d?.rect ?? { x: 0, y: 0, w: 1, h: 1 };
    return { x: p.x + (x - r.x) / r.w * p.w, y: p.y + (y - r.y) / r.h * p.h, k: 1 / r.w };
  }

  private marks(s: TShot, t: number) {
    const u = this.markOf(s, 'underline'); if (!u || t < u.at) return;
    // A 2 px gold rule under the real words, drawn left to right in 14 frames; never retyped, never a wash.
    const ctx = this.ctx, a = u.mark.at;
    const p0 = this.onPlate(s, t, a.x, a.y), p1 = this.onPlate(s, t, a.x + a.w, a.y);
    const k = this.an(t, u.at, u.at + 14 * F, 'out');
    // The exhibit's gold, taken one step toward iron-gall so it holds on cream paper (plain #d9b36a disappears on the page).
    ctx.save(); ctx.fillStyle = mixHex(this.th.accent, '#4a2f00', 0.5); ctx.fillRect(p0.x, p0.y - 1, (p1.x - p0.x) * k, 3); ctx.restore();
  }

  /** A real script string at a legible size beside the English, with its reading under it. */
  private marginScript(text: string, reading: string, x: number, y: number, px: number) {
    const ctx = this.ctx, lang = this.langOf(text);
    ctx.save();
    ctx.fillStyle = this.th.ink; ctx.font = `400 ${px}px ${this.scriptFace(lang)}`;
    if (lang === 'syriac' || lang === 'urdu') ctx.direction = 'rtl';
    ctx.fillText(text, x, y + px * (lang === 'urdu' ? 0.9 : 0.8));
    ctx.restore();
    ctx.fillStyle = this.mute(0.78); ctx.font = this.font(500, 26, 'sans'); this.fit(reading, x, y + px * 1.5 + (lang === 'urdu' ? 20 : 0), GEO.margin.w, 26, 500, 'sans');
  }

  private langOf(text: string): ScriptString['lang'] {
    const hit = (this.tl.film.allowedScripts ?? []).find(a => a.text.includes(text) || text.includes(a.text));
    if (hit) return hit.lang;
    if (/[܀-ݏ]/.test(text)) return 'syriac';
    if (/[一-鿿]/.test(text)) return 'han';
    if (/[؀-ۿ]/.test(text)) return 'urdu';
    if (/[ऀ-ॿ]/.test(text)) return 'devanagari';
    return 'gurmukhi';
  }

  /** The ghost script (Persia: the stele's characters; 8 to 12 percent, only in the empty third) for the Road Line. */
  private ghost(): { text: string; font: string; size: number } | undefined {
    const f = this.tl.film;
    if (f.theme.titleGesture !== 'road') return undefined;
    const han = (f.allowedScripts ?? []).find(a => a.lang === 'han');
    return han ? { text: han.text, font: this.scriptFace('han'), size: 420 } : undefined;
  }

  // ── Partition: the Foreign Office map's own printed line, isolated by colour ──
  private isolatedPlate(s: TShot, p: LaidPlate, t: number) {
    const img = this.image(p.spec.asset), ctx = this.ctx, g = s.spec.graphic;
    if (!img) return;
    const view = g?.kind === 'isoLine' ? g.view : undefined;
    const key = `iso|${p.spec.asset}|${p.w}x${p.h}|${view ? `${view.x},${view.y},${view.w},${view.h}` : ''}`;
    let c = this.isolated.get(key);
    if (!c) { const hex = this.th.accent.replace('#', ''); c = isolateLine(img, p.w, p.h, [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)], view); this.isolated.set(key, c); }
    const a = g?.kind === 'isoLine' ? s.anchors[g.anchor] ?? s.voiceAt : s.voiceAt;
    const k = this.reduced ? (t >= a ? 1 : 0) : ease('inOut', span(t, a, a + 6));
    // A hairline frame on the flat ground; the line wipes in top to bottom, as on the exhibit's map page.
    ctx.save(); ctx.strokeStyle = this.mute(0.18); ctx.lineWidth = 1; ctx.strokeRect(p.x - 0.5, p.y - 0.5, p.w + 1, p.h + 1);
    ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h * k); ctx.clip();
    ctx.drawImage(c, p.x, p.y);
    ctx.restore();
    if (g?.kind === 'isoLine' && k > 0.02) {
      // Towns as hand-placed dots (approximate, positions read off the map as on the exhibit page), named in English only.
      const v = g.view ?? { x: 0, y: 0, w: 1, h: 1 };
      ctx.save(); ctx.font = this.font(500, 26, 'sans');
      for (const tw of g.towns) {
        const x = p.x + ((tw.x / 1280 - v.x) / v.w) * p.w, y = p.y + ((tw.y / 949 - v.y) / v.h) * p.h;
        if (x < p.x + 10 || x > p.x + p.w - 10 || y < p.y + 10 || y > p.y + p.h - 10 || y - p.y > p.h * k) continue;
        ctx.fillStyle = this.th.ink; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.mute(0.85);
        if (tw.side === 'P') { ctx.textAlign = 'right'; ctx.fillText(tw.n, x - 12, y + 8); } else { ctx.textAlign = 'left'; ctx.fillText(tw.n, x + 12, y + 8); }
      }
      ctx.restore();
    }
  }

  // ── Animated painting (animatedPainting.ts) ──────────────────────────────────
  private fxFor(spec: AnimatedPaintingSpec, win: Box): PaintingFx | null {
    const key = `${spec.asset}|${this.W}x${this.H}`;
    if (this.fxs.has(key)) return this.fxs.get(key)!;
    const imgs = { img: this.image(spec.asset), depth: this.image(spec.depth), masks: this.image(spec.masks), fx: this.image(spec.fx) };
    let fx: PaintingFx | null = null;
    if (imgs.img && imgs.depth && imgs.masks && imgs.fx) {
      const f = new PaintingFx(Math.round(win.w * this.W / DW), Math.round(win.h * this.H / DH), spec);
      if (f.load({ img: imgs.img, depth: imgs.depth, masks: imgs.masks, fx: imgs.fx })) fx = f;
    }
    this.fxs.set(key, fx);
    return fx;
  }

  private animated(s: TShot, local: number) {
    const a = s.anim!, spec = s.spec.painting!, ctx = this.ctx, win = a.win, th = this.th;
    const dur = s.end - s.start;
    // Reduced motion is an authored still: the whole painting at its real edges, nothing moving.
    const cam = this.reduced ? { x: .5, y: .5, zoom: 1 } : paintingCamAt(a.cam, local);
    const motion = this.reduced ? 0 : paintingMotion(local, dur, a.rampIn, a.rampOut);
    const fx = this.fxFor(spec, win);
    const frame = fx?.render({ t: local, motion, cam });
    if (frame) ctx.drawImage(frame, win.x, win.y, win.w, win.h);
    else {   // no WebGL2: the camera still moves over the unaltered painting
      const img = this.image(spec.asset);
      if (img) { const v = PaintingFx.view(cam); ctx.drawImage(img, v.x0 * img.naturalWidth, v.y0 * img.naturalHeight, v.vw * img.naturalWidth, v.vw * img.naturalHeight, win.x, win.y, win.w, win.h); }
      else { ctx.fillStyle = this.mute(0.12); ctx.fillRect(win.x, win.y, win.w, win.h); }
    }
    ctx.save(); ctx.strokeStyle = this.mute(0.32); ctx.lineWidth = 1; ctx.strokeRect(win.x - 0.5, win.y - 0.5, win.w + 1, win.h + 1); ctx.restore();
    // Provenance slate: painter, date, credit, licence.
    const sl = spec.slate;
    this.slate(a.slateBox, { stamp: false, line1: sl.title ?? '', line2: ['ARCHIVE', sl.source, sl.year, sl.licence].filter(Boolean).join(' · ') }, false);
    // The label and the one-line note, present from the first frame to the last.
    const x = PAINTING_MARGIN_X;
    this.drawStamp(x, win.y, spec.label, th.accent);
    let y = win.y + 44 + 30;
    if (spec.margin?.year) { ctx.fillStyle = th.accent; ctx.font = this.font(400, 64, 'display'); ctx.fillText(this.text(spec.margin.year), x, y + 64); y += 84; }
    if (spec.margin?.place) { ctx.fillStyle = this.mute(0.85); ctx.font = this.font(500, 28, 'sans'); this.fit(spec.margin.place, x, y + 14, PAINTING_MARGIN_W, 28, 500, 'sans'); y += 56; }
    ctx.fillStyle = this.mute(0.92);
    this.wrap(spec.note, x, y + 22, PAINTING_MARGIN_W, 38, 28);
  }

  /**
   * Gates for animated paintings, on real pixels (the renderer's build gates call this):
   *  - lock: with only parallax and flags on, every figure pixel (nearer than the sky, outside the flag regions) is identical to
   *    the unmoved painting, and the far plane did move (so the test is not vacuous);
   *  - still: the opening frame (effects at zero, camera on the whole painting) against the painting scaled by the canvas's own
   *    resampler (dB; the compositor samples with mipmaps, so this is held to 28 dB, not the 40 dB of an unprocessed plate);
   *  - bookends: the last frame of the shot is pixel-identical to the first.
   */
  paintingGates(): Array<{ id: string; ok: boolean; lock?: { maxDiff: number; compared: number; farMoved: number }; stillDb?: number; bookendDiff?: number; note?: string }> {
    const out: ReturnType<CouncilPainter['paintingGates']> = [];
    for (const s of this.tl.shots) {
      if (s.kind !== 'animated' || !s.anim) continue;
      const spec = s.spec.painting!, a = s.anim, fx = this.fxFor(spec, a.win);
      if (!fx?.ok) { out.push({ id: s.spec.id, ok: false, note: 'WebGL2 unavailable: the painting would show only its camera move' }); continue; }
      const scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const dur = s.end - s.start;
      // A camera that is off-centre and looks at sky and figures together, so parallax is non-zero and there is a far plane to move.
      const lock = fx.lockCheck({ x: .7, y: .32, zoom: 1.9 }, dur * .5, scratch);
      const grab = (f: Parameters<PaintingFx['render']>[0]) => { const c = fx.render(f)!; scratch.canvas.width = c.width; scratch.canvas.height = c.height; scratch.drawImage(c, 0, 0); return scratch.getImageData(0, 0, c.width, c.height).data; };
      const first = grab({ t: 0, motion: paintingMotion(0, dur, a.rampIn, a.rampOut), cam: paintingCamAt(a.cam, 0) });
      const last = grab({ t: dur - 1e-3, motion: paintingMotion(dur - 1e-3, dur, a.rampIn, a.rampOut), cam: paintingCamAt(a.cam, dur - 1e-3) });
      let bookend = 0; for (let i = 0; i < first.length; i++) bookend = Math.max(bookend, Math.abs(first[i] - last[i]));
      const img = this.image(spec.asset)!;
      const ref = document.createElement('canvas'); ref.width = fx.w; ref.height = fx.h;
      const rc = ref.getContext('2d', { willReadFrequently: true })!; rc.imageSmoothingEnabled = true; rc.imageSmoothingQuality = 'high'; rc.drawImage(img, 0, 0, fx.w, fx.h);
      const rd = rc.getImageData(0, 0, fx.w, fx.h).data; let se = 0, n = 0;
      for (let i = 0; i < rd.length; i += 4) for (let c = 0; c < 3; c++) { const d = rd[i + c] - first[i + c]; se += d * d; n++; }
      const mse = se / n, db = mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
      out.push({ id: s.spec.id, ok: lock.maxDiff <= 2 && lock.farMoved > 0 && db >= 28 && bookend === 0, lock, stillDb: db, bookendDiff: bookend });
    }
    return out;
  }

  // ── Lower third ───────────────────────────────────────────────────────────────
  private lowerThird(s: TShot, t: number) {
    const lt = s.lowerThird, spec = s.spec.lowerThird;
    if (!lt || !spec || t < lt.a || t > lt.b + 6 * F) return;
    const ctx = this.ctx, b = lt.box, local = t - lt.a;
    const out = t > lt.b ? 1 - (t - lt.b) / (6 * F) : 1;
    const rule = this.an(local, 0, 10 * F, 'out');
    ctx.save();
    ctx.globalAlpha = this.reduced ? (t > lt.b ? 0 : 1) : clamp(out);
    ctx.fillStyle = this.th.accent; ctx.fillRect(b.x, b.y, 48 * rule, 2);
    ctx.fillStyle = this.th.ink;
    this.fit(this.text(spec.name), b.x, b.y + 62, b.w, 56, 400, 'display');
    ctx.fillStyle = this.mute(0.85);
    this.fit(spec.role, b.x, b.y + 104, b.w, 28, 500, 'sans');
    ctx.restore();
  }

  // ── Graphics (margin column; real vector, numbers move only after the narration says them) ──
  private graphic(s: TShot, t: number) {
    const g = s.spec.graphic; if (!g) return;
    const ctx = this.ctx, th = this.th, x0 = GEO.margin.x, W = GEO.margin.w;
    const grey = this.mute(0.5);
    const label = (txt: string, y: number, px = 26) => { ctx.font = this.font(500, px, 'sans'); ctx.fillStyle = this.mute(0.82); ctx.fillText(txt, x0, y); };
    const bar = (y: number, w: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x0, y, Math.max(0, w), 56); };
    const numeral = (txt: string, y: number, color: string) => { ctx.font = this.font(400, 64, 'display'); ctx.fillStyle = color; ctx.fillText(this.text(txt), x0, y); };

    if (g.kind === 'clock') {
      const a = s.anchors[g.anchor];
      const p1 = this.an(t, a - 2.6, a - 2.6 + 40 * F, 'inOut');
      if (p1 <= 0) return;
      label('Assembling one Model T chassis', 308);
      bar(324, W * p1, grey);                                   // roughly 12.5 hours = 750 minutes = the full bar
      if (p1 >= 1) { numeral('12.5 h', 450, grey); label('roughly, before the moving line', 482, 24); }
      const p2 = this.reduced ? (t >= a ? 1 : 0) : span(t, a - 8 * F, a);
      if (p2 > 0) {
        bar(516, W * (93 / 750) * p2, th.accent);               // 93 / 750 = 12.4%: true scale
        const count = this.reduced ? 93 : Math.round(93 * span(t, a - 15 * F, a));
        numeral(`${count} min`, 642, th.accent);
        label('about, by early 1914', 674, 24);
      }
      ctx.font = this.font(500, 24, 'sans'); ctx.fillStyle = this.mute(0.62);
      this.wrap('Source: The Henry Ford; Ford, My Life and Work', x0, 740, W, 30, 24);
    } else if (g.kind === 'wage') {
      const a5 = s.anchors[g.anchor], a2 = s.anchors[g.anchor2];
      const p5 = this.an(t, a5, a5 + 12 * F, 'out'), p2 = this.an(t, a2, a2 + 12 * F, 'out');
      if (p5 <= 0 && p2 <= 0) return;
      label('Reported daily pay, Highland Park, 1914', 308);
      if (p5 > 0) { bar(324, W * p5, th.accent); if (p5 >= 1) { numeral('$5.00', 450, th.accent); label('eight-hour day, a profit-sharing plan', 482, 24); } }
      if (p2 > 0) { bar(516, W * (2.34 / 5) * p2, grey); if (p2 >= 1) { numeral('$2.34', 642, grey); label('about; before, a nine-hour day', 674, 24); } }
      ctx.font = this.font(500, 24, 'sans'); ctx.fillStyle = this.mute(0.62);
      this.wrap('Source: The Henry Ford, Five-Dollar Day; Ford, My Life and Work', x0, 740, W, 30, 24);
    } else if (g.kind === 'counter') {
      const a = s.anchors[g.anchor];
      const p = this.an(t, a, a + 1.4, 'inOut');
      if (t < a - 0.3) return;
      label('Each square about 100,000 Model Ts', 308, 24);
      const n = Math.floor(150 * p);
      for (let i = 0; i < 150; i++) {
        const cx = x0 + (i % 15) * 32, cy = 330 + Math.floor(i / 15) * 32;
        ctx.fillStyle = i < n ? th.accent : this.mute(0.12);
        ctx.fillRect(cx, cy, 28, 28);
      }
      if (p >= 1) { ctx.font = this.font(400, 56, 'display'); ctx.fillStyle = th.accent; ctx.fillText(this.text('About 15 million'), x0, 730); }
      ctx.font = this.font(500, 24, 'sans'); ctx.fillStyle = this.mute(0.62);
      ctx.fillText('Source: The Henry Ford; Wikipedia, Ford Model T', x0, 770);
    } else if (g.kind === 'dateStack') {
      g.items.forEach((it, i) => {
        if (t < s.anchors[it.anchor]) return;
        const y = 300 + i * 120;
        ctx.font = this.font(400, 64, 'display'); ctx.fillStyle = th.accent; ctx.fillText(this.text(it.year), x0, y + 64);
        ctx.font = this.font(500, 26, 'sans'); ctx.fillStyle = this.mute(0.85); ctx.fillText(it.label, x0, y + 96);
      });
      if (th.titleGesture === 'line') {   // the madder underline moves from date to date, one at a time
        const live = g.items.map((it, i) => ({ i, a: s.anchors[it.anchor] })).filter(o => t >= o.a);
        const cur = live[live.length - 1];
        if (cur) {
          const prev = live.length > 1 ? live[live.length - 2] : cur;
          const k = this.reduced ? 1 : ease('inOut', span(t, cur.a, cur.a + 10 * F));
          const yl = 300 + (prev.i + (cur.i - prev.i) * k) * 120 + 70;
          ctx.save(); ctx.font = this.font(400, 64, 'display');
          const wcur = ctx.measureText(this.text(g.items[cur.i].year)).width, wprev = ctx.measureText(this.text(g.items[prev.i].year)).width; ctx.restore();
          ctx.fillStyle = th.accent; ctx.fillRect(x0, yl, lerp(wprev, wcur, k), 3);
        }
      }
    } else if (g.kind === 'handbill') this.handbill(s, g, t);
    else if (g.kind === 'pullQuote') this.pullQuote(s, g, t);
    else if (g.kind === 'route') this.route(s, g, t);
    else if (g.kind === 'rangeBar') this.rangeBar(s, g, t);
    else if (g.kind === 'steleScript') this.steleScript(s, g, t);
  }

  /** Type set one sort at a time: sort i lands `step` seconds after the previous; each drops 8 px in 3 frames. Returns the number landed. */
  private sorts(text: string, x: number, y: number, at: number, t: number, step: number, face: string, px: number, color: string, align: 'left' | 'center' = 'left') {
    const ctx = this.ctx; ctx.save(); ctx.font = `400 ${px}px ${face}`; ctx.fillStyle = color; ctx.textAlign = 'left';
    const chars = Array.from(text), w = ctx.measureText(text).width;
    let cx = align === 'center' ? x - w / 2 : x;
    let n = 0;
    chars.forEach((ch, i) => {
      const cw = ctx.measureText(ch).width, a = at + i * step;
      const k = this.reduced ? (t >= at ? 1 : 0) : (t >= a ? 1 : 0);
      if (k > 0) {
        n++;
        const drop = this.reduced ? 0 : 8 * (1 - ease('out', span(t, a, a + 3 * F)));
        ctx.fillText(ch, cx, y - drop);
      }
      cx += cw;   // sorts keep their advance so the line is set at its final measure from the first sort
    });
    ctx.restore();
    return n;
  }

  private handbill(s: TShot, g: Extract<GraphicSpec, { kind: 'handbill' }>, t: number) {
    const ctx = this.ctx, th = this.th, x0 = GEO.margin.x, W = GEO.margin.w, slab = th.faces?.slab ?? th.display;
    const sizes = [104, 88, 80], offs = [0, 56, 18];
    let y = 300;
    g.items.forEach((it, i) => {
      const a = s.anchors[it.anchor], px = sizes[Math.min(i, 2)], cx = x0 + W / 2 - 24 + offs[Math.min(i, 2)];
      const rowH = (it.about ? 52 : 0) + px + 44;
      if (t >= a) {
        let by = y;
        if (it.about) { this.sorts('ABOUT', cx, by + 40, a, t, 2 * F, slab, 40, th.ink, 'center'); by += 52; }
        const shown = it.blank ? it.big.slice(0, -1) : it.big;
        const step = 2 * F, at = a + (it.about ? 10 * F : 0);
        ctx.save(); ctx.font = `400 ${px}px ${th.display}`;
        const full = ctx.measureText(it.big).width, left = cx - full / 2;
        ctx.restore();
        this.sorts(shown, left, by + px * 0.86, at, t, step, th.display, px, th.accent);
        if (it.blank) {   // the last digit is an empty quad: nobody wrote it down
          ctx.save(); ctx.font = `400 ${px}px ${th.display}`;
          const qx = left + ctx.measureText(shown).width, qw = ctx.measureText('8').width;
          ctx.restore();
          if (t >= at + shown.length * step) { ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.strokeRect(qx + 4, by + px * 0.18, qw - 8, px * 0.68); ctx.restore(); }
        }
        if (it.small) { ctx.fillStyle = this.mute(0.85); ctx.font = this.font(500, 26, 'sans'); ctx.textAlign = 'center'; ctx.fillText(it.small, cx, by + px + 30); ctx.textAlign = 'left'; }
      }
      y += rowH + 8;
    });
  }

  private pullQuote(s: TShot, g: Extract<GraphicSpec, { kind: 'pullQuote' }>, t: number) {
    const ctx = this.ctx, th = this.th, x0 = GEO.margin.x, W = GEO.margin.w, px = 50, a = s.anchors[g.anchor];
    if (t < a) return;
    ctx.save(); ctx.font = `400 ${px}px ${th.display}`;
    const lines: string[] = []; let line = '';
    for (const w of g.text.split(' ')) { const n = line ? `${line} ${w}` : w; if (ctx.measureText(n).width > W && line) { lines.push(line); line = w; } else line = n; }
    if (line) lines.push(line);
    ctx.restore();
    const total = Array.from(g.text).length, step = Math.min(2 * F, 1.3 / total);
    let done = 0, y = 306;
    for (const ln of lines) {
      done += this.sorts(ln, x0, y + px * 0.8, a + done * step, t, step, th.display, px, th.ink);
      y += px * 1.12;
    }
    if (t >= a + total * step + 0.2) { ctx.fillStyle = this.mute(0.82); ctx.font = this.font(500, 26, 'sans'); this.fit(g.cite, x0, y + 40, W, 26, 500, 'sans'); }
  }

  private route(s: TShot, g: Extract<GraphicSpec, { kind: 'route' }>, t: number) {
    const ctx = this.ctx, th = this.th, x0 = GEO.margin.x, W = GEO.margin.w, y0 = 300, H = 320;
    const pts = g.stops.map(p => ({ x: x0 + 14 + p.x * (W - 28), y: y0 + p.y * H, label: p.label }));
    const ts = g.anchors.map(a => s.anchors[a]);
    if (t < ts[0] - 0.3) return;
    ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const k = this.reduced ? (t >= ts[i] ? 1 : 0) : span(t, ts[i - 1] + 0.1, ts[i]);
      if (k <= 0) continue;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(lerp(pts[i - 1].x, pts[i].x, k), lerp(pts[i - 1].y, pts[i].y, k)); ctx.stroke();
    }
    ctx.font = this.font(500, 26, 'sans');
    pts.forEach((p, i) => {
      if (t < ts[i]) return;
      ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.mute(0.92); ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(p.label, p.x + (i === 0 ? 14 : -14), p.y + (i === 0 ? 34 : -12));
    });
    ctx.restore();
    ctx.fillStyle = this.mute(0.62); ctx.font = this.font(500, 24, 'sans'); this.wrap(g.note, x0, y0 + H + 56, W, 30, 24);
  }

  /** Soft-ended bar: a solid core with its two ends stepped down in six slices (no gradient), so a range reads as a range. */
  private softBar(x: number, y: number, w: number, h: number, color: string) {
    const ctx = this.ctx; ctx.save();
    const steps = 6, e = 10;
    ctx.fillStyle = color;
    ctx.fillRect(x + steps * e, y, Math.max(0, w - 2 * steps * e), h);
    for (let i = 0; i < steps; i++) {
      ctx.globalAlpha = 1 - (i + 1) / (steps + 1);
      ctx.fillRect(x + (steps - 1 - i) * e, y, e, h);
      ctx.fillRect(x + w - (steps - i) * e, y, e, h);
    }
    ctx.restore();
  }

  private rangeBar(s: TShot, g: Extract<GraphicSpec, { kind: 'rangeBar' }>, t: number) {
    const ctx = this.ctx, th = this.th, x0 = GEO.margin.x, W = GEO.margin.w, a = s.anchors[g.anchor];
    if (t < a) return;
    const k = this.an(t, a, a + 14 * F, 'out');   // one draw, then still
    g.rows.forEach((r, i) => {
      const y = 300 + i * 232;
      ctx.fillStyle = this.mute(0.85); ctx.font = this.font(500, 26, 'sans'); this.fit(r.label, x0, y, W, 26, 500, 'sans');
      ctx.fillStyle = this.mute(0.14); ctx.fillRect(x0, y + 22, W, 2);
      const lo = x0 + W * (r.lo / r.max), hi = x0 + W * (r.hi / r.max);
      this.softBar(lo, y + 12, Math.max(80, (hi - lo) * k), 22, th.accent);
      ctx.fillStyle = this.mute(0.92); ctx.font = this.font(500, 26, 'sans');
      ctx.textAlign = 'left'; ctx.fillText(r.loText, lo, y + 66); ctx.textAlign = 'right'; ctx.fillText(r.hiText, hi, y + 98); ctx.textAlign = 'left';
      ctx.fillStyle = th.accent; ctx.fillText('estimates differ', x0, y + 140);
      ctx.fillStyle = this.mute(0.62); ctx.font = this.font(500, 24, 'sans'); this.fit(r.source, x0, y + 172, W, 24, 500, 'sans');
    });
  }

  private steleScript(s: TShot, g: Extract<GraphicSpec, { kind: 'steleScript' }>, t: number) {
    const ctx = this.ctx, th = this.th, x0 = GEO.margin.x, a = s.anchors[g.anchor];
    if (t < a) return;
    const k = this.an(t, a, a + 12 * F, 'out');
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = th.ink; ctx.font = `400 150px ${this.scriptFace('han')}`; ctx.fillText(g.script, x0, 440);
    ctx.fillStyle = this.mute(0.85); ctx.font = this.font(500, 28, 'sans'); this.fit(g.reading, x0, 490, GEO.margin.w, 28, 500, 'sans');
    ctx.fillStyle = th.accent; ctx.font = this.font(400, 96, 'display'); ctx.fillText(g.year, x0, 620);
    ctx.restore();
  }

  // ── A shot that is a graphic across the whole evidence field (no plate): the road map ──
  private graphicShot(s: TShot, local: number, t: number) {
    const g = s.spec.graphic;
    if (g?.kind === 'roadMap') this.roadMap(s, g, t);
    if (s.slateBox && s.spec.groupSlate) this.slate(s.slateBox, { stamp: false, ...slateOf(s.spec.groupSlate, s.spec.slateLead), lead: s.spec.slateLead }, false);
    void local;
  }

  private roadMap(s: TShot, g: Extract<GraphicSpec, { kind: 'roadMap' }>, t: number) {
    const ctx = this.ctx, th = this.th, film = this.tl.film, bm = film.basemaps?.[g.basemap], F0 = GEO.field;
    if (!bm) return;
    const [lo0, la0, lo1, la1] = bm.bbox, kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
    const bw = 1120, bh = 650, sc = Math.min(bw / ((lo1 - lo0) * kx), bh / (la1 - la0));
    const ox = F0.x + (bw - (lo1 - lo0) * kx * sc) / 2, oy = F0.y + (bh - (la1 - la0) * sc) / 2;
    const P = (lon: number, lat: number): [number, number] => [ox + (lon - lo0) * kx * sc, oy + (la1 - lat) * sc];
    const mw = (lo1 - lo0) * kx * sc, mh = (la1 - la0) * sc;   // the projected box: the map is clipped to its own bounds, not to the field
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, mw, mh); ctx.clip();
    ctx.fillStyle = this.mute(0.09);
    for (const ring of bm.layers.land ?? []) { ctx.beginPath(); ring.forEach(([lo, la], i) => { const [x, y] = P(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = this.mute(0.34); ctx.lineWidth = 1.2;
    for (const line of bm.layers.coast ?? []) { ctx.beginPath(); line.forEach(([lo, la], i) => { const [x, y] = P(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
    // Route: every point of the path (stops and the unnamed bends between them), drawn at constant speed between spoken stops.
    const path: Array<{ x: number; y: number; stop: number }> = [];
    g.stops.forEach((st, i) => { for (const [la, lo] of (st as { via?: Array<[number, number]> }).via ?? []) { const [x, y] = P(lo, la); path.push({ x, y, stop: -1 }); } const [x, y] = P(st.lon, st.lat); path.push({ x, y, stop: i }); });
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    const stopD = g.stops.map((_, i) => cum[path.findIndex(p => p.stop === i)]);
    const stopT = g.stops.map(st => s.anchors[st.anchor]);
    let head = 0;
    if (t >= stopT[0]) {
      head = stopD[stopD.length - 1];
      for (let i = 1; i < stopT.length; i++) if (t < stopT[i]) { head = lerp(stopD[i - 1], stopD[i], this.reduced ? 0 : span(t, stopT[i - 1] + 0.4, stopT[i])); break; }
    }
    ctx.strokeStyle = th.accent; ctx.lineWidth = 3; ctx.setLineDash([14, 11]); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      if (cum[i] <= head) ctx.lineTo(path[i].x, path[i].y);
      else { const k = (head - cum[i - 1]) / (cum[i] - cum[i - 1]); if (k > 0) ctx.lineTo(lerp(path[i - 1].x, path[i].x, k), lerp(path[i - 1].y, path[i].y, k)); break; }
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    g.stops.forEach((st, i) => {
      if (t < stopT[i]) return;
      const [x, y] = P(st.lon, st.lat), up = i % 2 === 0;
      const k = this.an(t, stopT[i], stopT[i] + 8 * F, 'out');
      ctx.save(); ctx.globalAlpha = k;
      ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = th.ink; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = this.font(600, 30, 'sans'); ctx.fillStyle = th.ink; ctx.textAlign = 'center';
      const ly = up ? y - 74 : y + 62;
      ctx.fillText(st.label, x, ly);
      ctx.font = this.font(400, 38, 'display'); ctx.fillStyle = th.accent; ctx.fillText(st.year, x, ly + (up ? 38 : 40));
      if (st.script) { const lang = this.langOf(st.script); ctx.font = `400 56px ${this.scriptFace(lang)}`; ctx.fillStyle = th.ink; if (lang === 'syriac') ctx.direction = 'rtl'; ctx.fillText(st.script, x, up ? ly - 42 : ly + 104); }
      ctx.restore();
    });
    ctx.save(); ctx.strokeStyle = this.mute(0.32); ctx.lineWidth = 1; ctx.strokeRect(ox - 0.5, oy - 0.5, mw + 1, mh + 1); ctx.restore();
    // The legend and the honesty note sit in the margin column, not on the map.
    ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(GEO.margin.x + 9, 318, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.mute(0.85); ctx.font = this.font(500, 26, 'sans'); ctx.fillText('A stop with dated evidence', GEO.margin.x + 32, 327);
    ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 3; ctx.setLineDash([14, 11]); ctx.beginPath(); ctx.moveTo(GEO.margin.x, 372); ctx.lineTo(GEO.margin.x + 52, 372); ctx.stroke(); ctx.restore();
    ctx.fillStyle = this.mute(0.85); ctx.fillText('A schematic leg', GEO.margin.x + 70, 381);
    ctx.fillStyle = this.mute(0.7); this.wrap(g.note, GEO.margin.x, 440, GEO.margin.w, 34, 26);
  }

  // ── Title sequence: the exhibit's own gesture ────────────────────────────────
  private titleBox(p: LaidPlate): { x: number; w: number } {
    const th = this.th, right = th.titleGesture === 'line' ? MARGIN_LINE_X - 56 : th.titleGesture === 'road' ? 1340 : GEO.margin.x + GEO.margin.w;
    const x = p.x + p.w + 72;
    return { x, w: right - x };
  }

  private title(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film, p = s.plates[0];
    if (local >= 0.4) {   // 0.4: one real, ungraded archive plate at full size on its real edges, with its credit
      this.plate(p, 1, 1, true);
      this.slate(s.slateBox!, slateLines(p.spec), false);
    }
    switch (th.titleGesture) {
      case 'composing': this.titleComposing(s, local); break;
      case 'road': this.titleRoad(s, local); break;
      case 'line': this.titleLine(s, local); break;
      default: this.titleStamp(s, local);
    }
    if (local >= 4.6) {
      const mins = Math.floor(this.tl.duration / 60), secs = Math.round(this.tl.duration % 60);
      ctx.font = this.font(500, 28, 'sans'); ctx.fillStyle = this.mute(0.82);
      ctx.fillText(`A Plajah Dossier film · ${mins} min ${secs} s · captions on`, 96, 970);
      if (local >= 4.9 && local < 6.4) {   // the honesty line, 1.5 s
        ctx.font = this.font(600, 44, 'serif'); ctx.fillStyle = this.th.ink;
        ctx.fillText(f.honesty, 96, 912);
      }
      if (f.contentNote && local >= 4.9) {   // a plain content-note chip where the film needs one
        ctx.save(); ctx.font = this.font(600, 26, 'sans');
        const w = Math.min(GEO.margin.w + 200, ctx.measureText(f.contentNote).width + 32);
        ctx.strokeStyle = th.stamp; ctx.lineWidth = 2; ctx.strokeRect(GEO.margin.x + GEO.margin.w - w + 1, 898, w - 2, 46);
        ctx.fillStyle = th.stamp; ctx.textAlign = 'right'; ctx.fillText(f.contentNote, GEO.margin.x + GEO.margin.w - 16, 929);
        ctx.restore();
      }
    }
  }

  /** Ford: HENRY FORD and the line stamped in two thuds eight frames apart. */
  private titleStamp(s: TShot, local: number) {
    void s;
    const ctx = this.ctx, th = this.th, f = this.tl.film;
    const stampIn = (at: number) => local >= at;
    const thud = (at: number) => 1 + (this.reduced ? 0 : 0.05 * (1 - ease('out', span(local, at, at + 2 * F))));
    const x = GEO.margin.x;
    if (stampIn(2.2)) {
      const k = thud(2.2);
      ctx.save(); ctx.translate(x, 56); ctx.scale(k, k);
      ctx.fillStyle = th.ink; ctx.font = this.font(400, 168, 'display');
      const words = f.title.split(' ');
      words.forEach((w, i) => ctx.fillText(this.text(w), 0, 155 * (i + 1)));
      ctx.restore();
    }
    const at2 = 2.2 + 8 * F;
    if (stampIn(at2)) {
      const k = thud(at2), y = 56 + 155 * f.title.split(' ').length + 90;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      ctx.fillStyle = th.accent; ctx.font = this.font(400, 64, 'display'); ctx.fillText(this.text(f.dates), 0, 0);
      ctx.restore();
      ctx.fillStyle = this.mute(0.9);
      this.wrapSerif(f.tagline, x, y + 56, GEO.margin.w, 40, 30);
    }
  }

  /** Largest display size (up to `max`) at which every line fits `w`. */
  private fitSize(lines: string[], w: number, max: number, min: number, weight: number | string, face: string, style = '') {
    const ctx = this.ctx; ctx.save(); ctx.font = `${style} ${weight} 100px ${face}`.trim();
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width)); ctx.restore();
    return Math.max(min, Math.min(max, Math.floor(100 * w / widest)));
  }

  /** Douglass: FREDERICK DOUGLASS set sort by sort into a composing stick (18 frames), then the dates in wood-type slab. */
  private titleComposing(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film, box = this.titleBox(s.plates[0]);
    const lines = f.title.split(' '), px = this.fitSize(lines, box.w, 168, 96, 400, th.display), lh = px * 0.96;
    const n = lines.reduce((a, l) => a + l.length, 0), step = 18 / 30 / n, t0 = 2.2;
    const y1 = 56 + px * 0.82;
    let k = 0;
    lines.forEach((ln, li) => {
      const y = y1 + li * lh;
      if (local >= t0 && local < t0 + 18 / 30 + 0.35 && !this.reduced) {   // the stick: a gold rule with its knee, closing on the set measure
        const a = t0 + k * step;
        ctx.save(); ctx.font = `400 ${px}px ${th.display}`;
        const w = ctx.measureText(ln).width, set = clamp((local - a) / (ln.length * step)), right = box.x + w * Math.max(set, 0.04);
        ctx.restore();
        if (local >= a - 2 * F) { ctx.fillStyle = th.accent; ctx.fillRect(box.x - 10, y + 16, right - box.x + 14, 2); ctx.fillRect(box.x - 10, y - px * 0.72, 2, px * 0.72 + 18); ctx.fillRect(right + 2, y - px * 0.72, 2, px * 0.72 + 18); }
      }
      this.sorts(ln, box.x, y, t0 + k * step, local, step, th.display, px, th.ink);
      k += ln.length;
    });
    const yD = y1 + lh * (lines.length - 1) + 104;
    if (local >= t0 + 18 / 30 + 0.2) {
      ctx.fillStyle = th.accent; ctx.font = `400 56px ${th.faces?.slab ?? th.display}`; ctx.fillText(f.dates, box.x, yD);
      ctx.fillStyle = this.mute(0.9); this.wrapSerif(f.tagline, box.x, yD + 62, Math.min(box.w, 760), 42, 32);
    }
  }

  /** Persia: the lapis line is drawn, then the title is set whole in Cormorant with real Syriac, the stele's characters faded in the empty third. */
  private titleRoad(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film, box = this.titleBox(s.plates[0]);
    const two = f.title.includes(' in ') ? [f.title.split(' in ')[0], `in ${f.title.split(' in ')[1]}`] : f.title.split(' ');
    const px = this.fitSize(two, box.w, 138, 90, 500, th.display, 'italic'), lh = px * 0.98, y1 = 270;
    const draw = this.an(local, 2.2, 2.2 + 24 * F, 'inOut');
    if (draw > 0) { ctx.fillStyle = th.accent; ctx.fillRect(box.x, y1 - px * 0.95, box.w * draw, 2); }
    const ghostIn = this.an(local, 2.6, 3.8, 'out');
    const gh = this.ghost();
    if (gh && ghostIn > 0) {   // the stele's own characters, top to bottom, 10 percent, in the empty third and never behind the title
      ctx.save(); ctx.globalAlpha = 0.10 * ghostIn; ctx.fillStyle = th.ink; ctx.font = `400 340px ${gh.font}`;
      const chars = Array.from(gh.text);
      chars.forEach((c, i) => ctx.fillText(c, 1420, 380 + i * 330));
      ctx.restore();
    }
    if (local >= 3.0) {
      ctx.fillStyle = th.ink; ctx.font = `italic 500 ${px}px ${th.display}`;
      two.forEach((ln, i) => ctx.fillText(ln, box.x, y1 + i * lh));
      const y2 = y1 + (two.length - 1) * lh;
      const sy = f.titleScripts?.[0];
      let y = y2 + 56;
      if (sy) {
        ctx.save(); ctx.fillStyle = th.ink; ctx.font = `400 72px ${this.scriptFace(sy.lang)}`; ctx.direction = 'rtl'; ctx.textAlign = 'left';
        ctx.fillText(sy.text, box.x, y + 66); ctx.restore();
        ctx.fillStyle = this.mute(0.82); ctx.font = this.font(500, 28, 'sans'); ctx.fillText(sy.reading, box.x + 220, y + 58);
        y += 110;
      }
      ctx.fillStyle = th.accent; ctx.font = `italic 500 52px ${th.display}`; ctx.fillText(f.dates, box.x, y + 54);
      ctx.fillStyle = this.mute(0.9); this.wrapSerif(f.tagline, box.x, y + 112, Math.min(box.w, 760), 42, 32);
    }
  }

  /** Partition: a madder line is drawn, hesitates, divides the frame, and stays; then the title in Urdu and English at equal weight. */
  private titleLine(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film, box = this.titleBox(s.plates[0]);
    const t0 = 2.2, y1 = 56, y2 = 1040;
    // 0..0.45 s: down to 55 percent; 0.45..0.8 s: it hesitates; 0.8..1.25 s: on to the bottom.
    const d = local < t0 ? 0 : local < t0 + 0.45 ? 0.55 * ease('inOut', (local - t0) / 0.45) : local < t0 + 0.8 ? 0.55 : 0.55 + 0.45 * ease('inOut', (local - t0 - 0.8) / 0.45);
    const dd = this.reduced ? (local >= t0 ? 1 : 0) : d;
    if (dd > 0) { ctx.fillStyle = th.accent; ctx.beginPath(); ctx.rect(MARGIN_LINE_X - 2, y1, 4, (y2 - y1) * dd); ctx.fill(); }
    if (local >= t0 + 1.3) {
      const urdu = (f.titleScripts ?? []).find(a => a.lang === 'urdu'), en = f.title;
      const px = this.fitSize([en], box.w, 124, 90, 600, th.display);
      let y = 150;
      if (urdu) {   // Urdu and English at equal weight: the Nastaliq is sized so its optical height matches the Latin's
        ctx.save(); ctx.fillStyle = th.ink; ctx.direction = 'rtl'; ctx.textAlign = 'left';
        ctx.font = `400 ${Math.round(px * 0.8)}px ${this.scriptFace('urdu')}`;
        ctx.fillText(urdu.text, box.x, y + px * 0.85); ctx.restore();
        y += px * 0.85 + 92;   // the Nastaliq tail drops well below its baseline: keep the reading line clear of it
        ctx.fillStyle = this.mute(0.72); ctx.font = this.font(500, 26, 'sans'); ctx.fillText(urdu.reading, box.x, y);
        ctx.fillText('pending native-reader proofing', box.x, y + 32);
        y += 60;
      }
      ctx.fillStyle = th.ink; ctx.font = `600 ${px}px ${th.display}`; ctx.fillText(en, box.x, y + px * 0.85);
      y += px * 0.85 + 74;
      ctx.fillStyle = th.accent; ctx.font = `600 54px ${th.display}`; ctx.fillText(f.dates, box.x, y);
      ctx.fillStyle = this.mute(0.9); this.wrapSerif(f.tagline, box.x, y + 62, Math.min(box.w, 640), 42, 32);
    }
    if (local >= t0 + 1.3) { ctx.fillStyle = th.accent; ctx.fillRect(MARGIN_LINE_X - 2, y1, 4, y2 - y1); }
  }

  private wrapSerif(s: string, x: number, y: number, maxW: number, lh: number, px: number) {
    const ctx = this.ctx; ctx.font = this.font(600, px, 'serif');
    let line = '', yy = y;
    for (const w of s.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) { ctx.fillText(line, x, yy); yy += lh; line = w; } else line = next;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // ── Content-note card (Silence Hold) ─────────────────────────────────────────
  private card(s: TShot) {
    const ctx = this.ctx, lines = s.spec.card?.lines ?? [];
    ctx.fillStyle = this.th.ink; ctx.font = this.font(600, 56, 'serif');
    this.wrapSerif(lines[0] ?? '', 96, 420, 1728, 72, 56);
    if (lines[1]) { ctx.fillStyle = this.mute(0.78); ctx.font = this.font(500, 28, 'sans'); ctx.fillText(lines[1], 96, 560); }
  }

  /** Where each end-card block sits: two balanced columns starting at y 230; `maxY` is the lowest baseline used. */
  private endLayout(): { blocks: Array<{ block: { head: string; lines: string[] }; col: number; y: number }>; maxY: number } {
    const f = this.tl.film;
    const heights = f.endCard.map(b => 46 + b.lines.length * 40 + 24);
    const half = heights.reduce((n, h) => n + h, 0) / 2;
    let col = 0, y = 230, acc = 0, maxY = 0;
    const blocks = f.endCard.map((block, i) => {
      if (col === 0 && acc + heights[i] / 2 > half) { col = 1; y = 230; }
      acc += heights[i];
      const at = { block, col, y };
      y += 44 + block.lines.length * 40 + 24;
      maxY = Math.max(maxY, y - 24 - 40);
      return at;
    });
    return { blocks, maxY };
  }

  // ── End card: the provenance ledger ──────────────────────────────────────────
  private endCard(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film;
    const rise = this.an(local, 0.4, 1.1, 'out');
    ctx.save(); ctx.globalAlpha = rise; ctx.translate(0, (1 - rise) * 24);
    ctx.fillStyle = th.ink; ctx.font = this.font(400, 72, 'display'); ctx.fillText(this.text(f.title), 96, 120);
    ctx.fillStyle = this.mute(0.8); ctx.font = this.font(500, 26, 'sans'); ctx.fillText('A Plajah Dossier film · provenance ledger', 96, 160);
    // Two balanced columns: split the blocks where the running height passes half.
    const colX = [96, 1008], colW = 816;
    this.endLayout().blocks.forEach(({ block: b, col, y: y0 }) => {
      let y = y0;
      ctx.fillStyle = th.accent; ctx.font = this.font(600, 30, 'sans'); ctx.fillText(b.head, colX[col], y); y += 44;
      ctx.fillStyle = this.mute(0.92); ctx.font = this.font(400, 28, 'sans');
      for (const l of b.lines) { this.fit(l, colX[col], y, colW, 28, 400, 'sans'); y += 40; }
    });
    ctx.restore();
    void s;
  }

  // ── Persistent UI: Room Hairline, room label, captions ───────────────────────
  private ui(t: number, s: TShot, captions: boolean) {
    const ctx = this.ctx, th = this.th, tl = this.tl, f = tl.film;
    const inRooms = s.room >= 0;
    if (s.kind === 'title' && t >= 4.6 || inRooms) {
      const draw = s.kind === 'title' ? this.an(t, 4.6, 5.8, 'inOut') : 1;
      const N = f.exhibitRoomCount, x0 = 96, total = DW - 192, gap = 8, seg = (total - gap * (N - 1)) / N;
      const room = inRooms ? tl.rooms[s.room] : undefined;
      let pos = -1;
      if (room) {
        const k = clamp((t - room.start) / Math.max(1e-6, room.end - room.start));
        pos = room.exhibitRooms[0] - 1 + k * (room.exhibitRooms[1] - room.exhibitRooms[0] + 1);
      }
      for (let i = 0; i < N; i++) {
        const x = x0 + i * (seg + gap);
        if ((x - x0) / total > draw) break;
        const w = Math.min(seg, draw * total - (x - x0));
        ctx.fillStyle = this.mute(0.26); ctx.fillRect(x, GEO.hairlineY, w, 2);
        const fill = clamp(pos - i);
        if (fill > 0) { ctx.fillStyle = fill >= 1 ? mixHex(th.bg, th.accent, 0.55) : th.accent; ctx.fillRect(x, GEO.hairlineY, w * fill, 2); }
      }
      if (room && s.kind !== 'end') {
        ctx.textAlign = 'right';
        ctx.font = this.font(500, 26, 'sans');
        ctx.fillStyle = this.mute(0.62); const tw = ctx.measureText(room.title).width;
        ctx.fillText(room.title, DW - 96, 1040);
        ctx.fillStyle = th.ink; ctx.fillText(`${room.label}  ·`, DW - 96 - tw - 12, 1040);
        ctx.textAlign = 'left';
      }
    }
    // Partition: the madder rule stays as a margin hairline and thickens each room (never over a card, a bleed or the end card).
    if (f.marginLine && inRooms && s.kind !== 'card' && !s.plates.some(p => p.spec.fullBleed)) {
      const w = 3 + 0.5 * s.room;
      ctx.fillStyle = th.accent; ctx.fillRect(MARGIN_LINE_X - w / 2, 0, w, GEO.caption.y - 14);
    }
    if (!captions) return;
    const cue = tl.cues.find(c => t >= c.a && t < c.b);
    if (cue) this.caption(cue, t);
  }

  private caption(cue: CouncilTimeline['cues'][number], t: number) {
    const ctx = this.ctx, th = this.th;
    ctx.font = this.font(600, GEO.captionSize, 'serif');
    const lines = balanceLines(cue.words.map(w => w.text), s => ctx.measureText(s).width, GEO.caption.w) ?? greedy(cue.words.map(w => w.text), s => ctx.measureText(s).width, GEO.caption.w);
    // The spoken word is full luminance, the rest 70%. Accent colour on names, dates and numbers, same size and weight.
    let cur = -1;
    cue.words.forEach((w, i) => { if (t >= w.a) cur = i; });
    let wi = 0;
    lines.forEach((line, li) => {
      let x = GEO.caption.x;
      for (const word of line.split(' ')) {
        const w = cue.words[wi], bright = wi === cur;
        ctx.fillStyle = w?.accent ? (bright ? th.accent : mixHex(th.bg, th.accent, 0.7)) : (bright ? th.ink : this.mute(0.7));
        ctx.fillText(word, x, GEO.captionBaselines[Math.min(li, 1)]);
        x += ctx.measureText(`${word} `).width; wi++;
      }
    });
  }

  // ── Gates that need real pixels and real fonts ───────────────────────────────

  /**
   * 'No plate pixels altered', two checks per archive plate on a 1920x1080 canvas after draw(t):
   *  - `psnr`: the frame's plate rectangle against the plate's own scaled pixels (dB; 99 = identical). Anything layered on
   *    top (type, a wash, grain, a filter, alpha) lowers it. The gate threshold is 40 dB.
   *  - `vsSource`: those pixels against an independent scaling of the source file, to catch a wrong crop, offset or scale
   *    (two resamplers differ on fine print, so this one is only held to 25 dB).
   */
  plateFidelity(ctx: CanvasRenderingContext2D, t: number): Array<{ asset: string; psnr: number; vsSource: number }> {
    const s = shotAt(this.tl, t);
    const out: Array<{ asset: string; psnr: number; vsSource: number }> = [];
    const psnr = (a: Uint8ClampedArray, b: Uint8ClampedArray, n: number) => {
      let se = 0;
      for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d; }
      const mse = se / (n * 3);
      return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
    };
    const det = this.markOf(s, 'detail'), und = this.markOf(s, 'underline');
    for (const p of s.plates) {
      if (p.spec.kind !== 'archive' || p.spec.treatment) continue;
      if (det && t >= det.at && s.plates[0] === p) continue;   // the flat crop-in is checked before it starts
      const img = this.image(p.spec.asset); if (!img) continue;
      const mine = this.scaled(p, img).getContext('2d')!.getImageData(0, 0, p.w, p.h).data;
      const frame = ctx.getImageData(p.x, p.y, p.w, p.h).data;
      if (und && t >= und.at && s.plates[0] === p) {   // the one allowed mark: the 2 px underline's own rows are left out of the comparison
        const a = und.mark.at, y0 = Math.floor(a.y * p.h) - 3, y1 = Math.ceil(a.y * p.h) + 5;
        for (let y = Math.max(0, y0); y < Math.min(p.h, y1); y++) for (let x = 0; x < p.w; x++) { const i = (y * p.w + x) * 4; for (let c = 0; c < 3; c++) frame[i + c] = mine[i + c]; }
      }
      const ref = document.createElement('canvas'); ref.width = p.w; ref.height = p.h;
      const rc = ref.getContext('2d')!; rc.imageSmoothingEnabled = true; rc.imageSmoothingQuality = 'high';
      rc.drawImage(img, 0, 0, p.w, p.h);
      out.push({ asset: p.spec.asset, psnr: psnr(frame, mine, p.w * p.h), vsSource: psnr(mine, rc.getImageData(0, 0, p.w, p.h).data, p.w * p.h) });
    }
    return out;
  }

  /** Every caption chunk must fit in two lines at the real font and the caption width. */
  captionFit(ctx: CanvasRenderingContext2D): Array<{ text: string; lines: number; width: number }> {
    ctx.save(); ctx.font = this.font(600, GEO.captionSize, 'serif');
    const bad: Array<{ text: string; lines: number; width: number }> = [];
    for (const c of this.tl.cues) {
      const m = (s: string) => ctx.measureText(s).width;
      const l = balanceLines(c.words.map(w => w.text), m, GEO.caption.w);
      if (!l) bad.push({ text: c.text, lines: 3, width: m(c.text) });
    }
    ctx.restore();
    return bad;
  }

  /** Slate and end-card text must fit its box at the real font (no clipped type). */
  textFit(ctx: CanvasRenderingContext2D): string[] {
    const bad: string[] = [];
    ctx.save();
    for (const s of this.tl.shots) {
      if (s.kind === 'animated' && s.slateBox) {
        const sl = s.spec.painting!.slate; ctx.font = this.font(500, 26, 'sans');
        if (ctx.measureText(sl.title ?? '').width > s.slateBox.w) bad.push(`${s.spec.id}: slate title clipped`);
        if (ctx.measureText(['ARCHIVE', sl.source, sl.year, sl.licence].filter(Boolean).join(' · ')).width > s.slateBox.w) bad.push(`${s.spec.id}: slate source line clipped`);
        continue;
      }
      if (s.kind === 'graphic' && s.slateBox && s.spec.groupSlate) {
        const l = slateOf(s.spec.groupSlate); ctx.font = this.font(500, 26, 'sans');
        if (ctx.measureText(l.line1).width > s.slateBox.w) bad.push(`${s.spec.id}: slate title clipped`);
        if (ctx.measureText(l.line2).width > s.slateBox.w) bad.push(`${s.spec.id}: slate source line clipped`);
        continue;
      }
      if (!s.slateBox) continue;
      for (const p of s.plates) {
        const l = slateLines(p.spec);
        if (l.stamp) { ctx.font = this.font(500, 28, 'sans'); if (p.spec.fullBleed && ctx.measureText(l.line2).width > s.slateBox.w - 400) bad.push(`${s.spec.id}: evidence line too long for the bleed slate`); continue; }
        ctx.font = this.font(500, 26, 'sans');
        if (ctx.measureText(l.line1).width > s.slateBox.w) bad.push(`${s.spec.id}: slate title clipped`);
        if (ctx.measureText(l.line2).width > s.slateBox.w) bad.push(`${s.spec.id}: slate source line clipped`);
      }
    }
    // End card: every line must fit its column at the smallest size the painter will shrink to (24 px).
    ctx.font = this.font(400, 24, 'sans');
    for (const b of this.tl.film.endCard) for (const l of b.lines) if (ctx.measureText(l).width > 816) bad.push(`end card: line too long for its column: ${l}`);
    const lay = this.endLayout(); if (lay.maxY > 1040) bad.push(`end card: runs off the frame (last line at y ${lay.maxY})`);
    ctx.restore();
    return bad;
  }
}

function greedy(words: string[], width: (s: string) => number, maxW: number): string[] {
  const lines: string[] = []; let line = '';
  for (const w of words) { const n = line ? `${line} ${w}` : w; if (width(n) > maxW && line) { lines.push(line); line = w; } else line = n; }
  if (line) lines.push(line);
  return lines;
}

const slateOf = (s: { title?: string; source?: string; year?: string; licence?: string }, lead = 'ARCHIVE') => ({
  line1: s.title ?? '', line2: [lead, s.source, s.year, s.licence].filter(Boolean).join(' · '),
});


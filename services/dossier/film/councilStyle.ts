/**
 * The council painter: draws any frame of a compiled CouncilTimeline as a pure function of time.
 *
 * Editor's cut (synthesis.json): flat exhibit grounds; NO grain, halation, vignette, depth-parallax, blurred backdrop,
 * glitch or lens effects. Archive plates are only ever positioned, scaled and masked: one drawImage into an integer
 * rectangle, nothing over it, never a filter, never an alpha < 1. Type is the exhibit's real display face plus
 * Source Serif 4 (captions) and Inter Tight (provenance); all of it is browser-rendered text.
 */
import type { Box, CouncilTheme, CouncilTimeline, LaidPlate, TShot } from './councilTypes';
import { DH, DW, GEO } from './councilTypes';
import { balanceLines } from './captions';
import { GATE, drawTransition } from './transitions';
import { shotAt } from './councilCompile';
import { slateLines } from './provenance';
import { clamp, ease, span } from './motion';
import { mixHex } from '../dossierTheme';

const F = 1 / 30;

export interface PaintOpts { captions: boolean; reduced: boolean }

export class CouncilPainter {
  private ctx!: CanvasRenderingContext2D;
  private reduced = false;
  private cache = new Map<string, HTMLCanvasElement>();
  /** Names every font stack the film needs, so the loader can wait for them. */
  readonly fontLoads: string[];

  constructor(readonly tl: CouncilTimeline, private image: (id: string) => HTMLImageElement | undefined) {
    const th = tl.film.theme;
    this.fontLoads = [`400 64px ${th.display}`, `600 44px ${th.serif}`, `400 44px ${th.serif}`, `500 26px ${th.sans}`, `600 26px ${th.sans}`, `600 30px ${th.sans}`];
  }

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
    this.ctx = ctx; this.reduced = o.reduced;
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
        drawOut: () => this.shot(prev, prev.end - prev.start - 1e-3, prev.end - 1e-3),
        drawIn: () => this.shot(s, local, t),
      });
    } else this.shot(s, local, t);
    this.ui(t, s, o.captions);
    ctx.restore();
  }

  private ground() { this.ctx.fillStyle = this.th.bg; this.ctx.fillRect(0, 0, DW, DH); }

  private shot(s: TShot, local: number, t: number) {
    this.ground();
    switch (s.kind) {
      case 'title': return this.title(s, local);
      case 'card': return this.card(s);
      case 'end': return this.endCard(s, local);
      case 'plates': return this.plates(s, local, t);
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
      this.plate(p, alpha, p.spec.kind === 'reconstruction' ? 1 + 0.02 * (this.reduced ? 0 : span(local, 0, dur)) : 1, !full);
    }
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

  private plate(p: LaidPlate, alpha: number, push: number, frame: boolean) {
    const ctx = this.ctx, img = this.image(p.spec.asset);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!img) { ctx.fillStyle = this.mute(0.12); ctx.fillRect(p.x, p.y, p.w, p.h); }
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

  private slate(box: Box, l: { stamp: boolean; line1: string; line2: string }, oneRow: boolean) {
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
    const lead = 'ARCHIVE';
    ctx.font = this.font(600, 26, 'sans'); ctx.fillStyle = this.th.ink; ctx.fillText(lead, box.x, box.y + 62);
    const lw = ctx.measureText(lead + ' ').width;
    ctx.font = this.font(500, 26, 'sans'); ctx.fillStyle = this.mute(0.78);
    this.fit(l.line2.replace(/^ARCHIVE\s*·?\s*/, ''), box.x + lw, box.y + 62, box.w - lw, 26, 500, 'sans');
  }

  /** The RECONSTRUCTION stamp: Inter Tight caps +140 tracking, 30 px, a hollow 3 px box. Returns its width. */
  private drawStamp(x: number, y: number): number {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this.font(600, 30, 'sans');
    (ctx as any).letterSpacing = '4.2px';
    const w = ctx.measureText('RECONSTRUCTION').width + 28;
    ctx.strokeStyle = this.th.stamp; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 44 - 3);
    ctx.fillStyle = this.th.stamp; ctx.fillText('RECONSTRUCTION', x + 14, y + 32);
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
    }
  }

  // ── Title sequence (Ford: the stamp) ─────────────────────────────────────────
  private title(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film;
    const p = s.plates[0];
    if (local >= 0.4) {   // 0.4: one real, ungraded archive plate at full size on its real edges, with its credit
      this.plate(p, 1, 1, true);
      this.slate(s.slateBox!, slateLines(p.spec), false);
    }
    const stampIn = (at: number) => this.reduced ? (local >= at ? 1 : 0) : (local >= at ? 1 : 0);
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
    if (local >= 4.6) {
      const mins = Math.floor(this.tl.duration / 60), secs = Math.round(this.tl.duration % 60);
      ctx.font = this.font(500, 28, 'sans'); ctx.fillStyle = this.mute(0.82);
      ctx.fillText(`A Plajah Dossier film · ${mins} min ${secs} s · captions on`, 96, 970);
      if (local >= 4.9 && local < 6.4) {   // the honesty line, 1.5 s
        ctx.font = this.font(600, 44, 'serif'); ctx.fillStyle = this.th.ink;
        ctx.fillText(f.honesty, 96, 912);
      }
    }
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

  // ── End card: the provenance ledger ──────────────────────────────────────────
  private endCard(s: TShot, local: number) {
    const ctx = this.ctx, th = this.th, f = this.tl.film;
    const rise = this.an(local, 0.4, 1.1, 'out');
    ctx.save(); ctx.globalAlpha = rise; ctx.translate(0, (1 - rise) * 24);
    ctx.fillStyle = th.ink; ctx.font = this.font(400, 72, 'display'); ctx.fillText(this.text(f.title), 96, 120);
    ctx.fillStyle = this.mute(0.8); ctx.font = this.font(500, 26, 'sans'); ctx.fillText('A Plajah Dossier film · provenance ledger', 96, 160);
    // Two balanced columns: split the blocks where the running height passes half.
    const heights = f.endCard.map(b => 46 + b.lines.length * 40 + 24);
    const half = heights.reduce((n, h) => n + h, 0) / 2;
    let col = 0, y = 230, acc = 0;
    const colX = [96, 1008], colW = 816;
    f.endCard.forEach((b, i) => {
      if (col === 0 && acc + heights[i] / 2 > half) { col = 1; y = 230; }
      acc += heights[i];
      ctx.fillStyle = th.accent; ctx.font = this.font(600, 30, 'sans'); ctx.fillText(b.head, colX[col], y); y += 44;
      ctx.fillStyle = this.mute(0.92); ctx.font = this.font(400, 28, 'sans');
      for (const l of b.lines) { this.fit(l, colX[col], y, colW, 28, 400, 'sans'); y += 40; }
      y += 24;
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
    for (const p of s.plates) {
      if (p.spec.kind !== 'archive') continue;
      const img = this.image(p.spec.asset); if (!img) continue;
      const mine = this.scaled(p, img).getContext('2d')!.getImageData(0, 0, p.w, p.h).data;
      const frame = ctx.getImageData(p.x, p.y, p.w, p.h).data;
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
      if (!s.slateBox) continue;
      for (const p of s.plates) {
        const l = slateLines(p.spec);
        if (l.stamp) { ctx.font = this.font(500, 28, 'sans'); if (p.spec.fullBleed && ctx.measureText(l.line2).width > s.slateBox.w - 400) bad.push(`${s.spec.id}: evidence line too long for the bleed slate`); continue; }
        ctx.font = this.font(500, 26, 'sans');
        if (ctx.measureText(l.line1).width > s.slateBox.w) bad.push(`${s.spec.id}: slate title clipped`);
        if (ctx.measureText(l.line2).width > s.slateBox.w) bad.push(`${s.spec.id}: slate source line clipped`);
      }
    }
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

const slateOf = (s: { title?: string; source?: string; year?: string; licence?: string }) => ({
  line1: s.title ?? '', line2: ['ARCHIVE', s.source, s.year, s.licence].filter(Boolean).join(' · '),
});


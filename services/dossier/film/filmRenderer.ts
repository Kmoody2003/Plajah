// The Dossier film renderer: paints any frame of a FilmSpec onto a canvas as a pure function of
// time. Used live by components/dossier/DossierFilmPlayer.tsx and frame-by-frame by
// scripts/dossier/renderFilm.ts, so the in-app film and the MP4 are pixel-identical.
import {
  layout, XFADE, type ArchivalScene, type ChapterScene, type ChartScene, type ColdOpenScene, type CreditsScene,
  type FilmScene, type FilmSpec, type MapScene, type MastheadScene, type PaintingScene, type Placed, type QuoteScene,
  type TimelineScene, type TitleScene,
} from './filmTypes';
import { camAt, captionChunks, clamp, coverRect, ease, envelope, hash, lerp, noise1, span, wrap } from './motion';
import { DepthParallax } from './depthParallax';
import { compileCouncil } from './councilCompile';
import { CouncilPainter } from './councilStyle';
import type { CouncilTimeline } from './councilTypes';

// ── Art direction ─────────────────────────────────────────────────────────────
// 19th-century print culture: lamp-black, bone paper, brass, oxblood. Type is a period face
// (IM Fell, cut in the 1680s and used by printers for two centuries) for voice, a Didone
// (Playfair) for display, Inter for captions.
export const PALETTE = {
  ink: '#0b0907', night: '#07060a', paper: '#e8dcc2', paperDark: '#cdbb98', bone: '#f3ead8',
  brass: '#d4a24c', brassDim: 'rgba(212,162,76,.55)', oxblood: '#7d2320', sepiaInk: '#3b2a1a', mute: 'rgba(243,234,216,.62)',
};
export const FONTS = {
  voice: "'IM Fell English', 'IM Fell DW Pica', Georgia, serif",
  display: "'Playfair Display', 'Didot', Georgia, serif",
  ui: "'Inter', system-ui, sans-serif",
};
/** Self-hosted stylesheet for the faces above (scripts/dossier/fetchFilmFonts.ts; SIL OFL). */
export const FONT_CSS = '/dossier/fonts/fonts.css';

/** Insert the font stylesheet once and resolve when it has parsed (fonts.load is a no-op before). */
function fontSheet(): Promise<void> {
  const existing = document.querySelector<HTMLLinkElement>(`link[href="${FONT_CSS}"]`);
  if (existing?.sheet) return Promise.resolve();
  return new Promise(res => {
    const l = existing ?? Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONT_CSS });
    l.addEventListener('load', () => res(), { once: true });
    l.addEventListener('error', () => res(), { once: true });
    if (!existing) document.head.appendChild(l);
    setTimeout(res, 8000);
  });
}

const WPS = 2.55; // words per second used to estimate unvoiced narration

export interface Chapter { label: string; start: number }

export class FilmRenderer {
  readonly spec: FilmSpec;
  readonly placed: Placed[];
  readonly duration: number;
  private ctx: CanvasRenderingContext2D;
  private W: number; private H: number;
  private images = new Map<string, HTMLImageElement>();
  private depths = new Map<string, HTMLImageElement>();
  private parallax: DepthParallax | null = null;
  private grain: HTMLCanvasElement[] = [];
  private paperTex: HTMLCanvasElement | null = null;
  private blurCache = new Map<string, HTMLCanvasElement>();
  /** Show narration captions (accessibility; on by default). */
  captions = true;
  /** Council style: the authored reduced-motion cut list (holds and 150 ms fades) instead of animated transitions. */
  reducedMotion = false;
  /** Council style only: the compiled timeline and its painter. */
  readonly council?: { tl: CouncilTimeline; painter: CouncilPainter };

  constructor(readonly canvas: HTMLCanvasElement, spec: FilmSpec) {
    // Unvoiced lines get an estimated duration so the cut is right even before narration exists.
    this.spec = { ...spec, scenes: spec.scenes.map(s => s.narration && !s.narration.duration
      ? { ...s, narration: { ...s.narration, duration: s.narration.text.split(/\s+/).length / WPS } } : s) };
    const l = layout(this.spec);
    this.placed = l.placed; this.duration = l.duration;
    if (spec.style === 'council' && spec.council) {
      const tl = compileCouncil(spec.council);
      this.council = { tl, painter: new CouncilPainter(tl, id => this.images.get(id)) };
      this.duration = tl.duration;
    }
    canvas.width = spec.width; canvas.height = spec.height;
    this.W = spec.width; this.H = spec.height;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  get chapters(): Chapter[] {
    if (this.council) return this.council.tl.rooms.map(r => ({ label: `${r.label.replace(' of ' + this.council!.tl.film.exhibitRoomCount, '')} · ${r.title}`, start: r.start }));
    return this.placed.filter(p => p.scene.chapter).map(p => ({ label: p.scene.chapter!, start: p.start }));
  }

  /** Voiced lines with their start times on the film clock (for the audio mixer). */
  get voiceCues(): Array<{ src: string; at: number; duration: number }> {
    if (this.council) return this.council.tl.shots.flatMap(s => s.beats.filter(b => b.audio).map(b => ({ src: b.audio!, at: b.a, duration: b.b - b.a })));
    return this.placed.filter(p => p.scene.narration?.audio).map(p => ({ src: p.scene.narration!.audio!, at: p.voiceAt, duration: p.scene.narration!.duration! }));
  }

  /** Council style: windows where any key skips ahead (title sequence, content-note section). */
  get skips(): Array<{ from: number; to: number; label: string }> { return this.council?.tl.skips ?? []; }
  /** Council style: windows where the score is out (Silence Hold). */
  get silences(): Array<{ from: number; to: number }> { return this.council?.tl.silences ?? []; }

  /** Load fonts, images and depth maps. Resolves even if some assets fail (they draw as gaps). */
  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    const jobs: Array<Promise<void>> = [];
    const total = this.spec.assets.length + this.spec.assets.filter(a => a.depth).length + 1;
    let done = 0;
    const tick = () => onProgress?.(++done, total);
    const img = (src: string) => new Promise<HTMLImageElement | null>(res => {
      const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async';
      i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
    });
    jobs.push((async () => {
      try {
        await fontSheet();
        if (this.council) await Promise.all(this.council.painter.fontLoads.map(f => document.fonts.load(f)));
        else await Promise.all([
          document.fonts.load(`italic 40px 'IM Fell English'`), document.fonts.load(`40px 'IM Fell English'`),
          document.fonts.load(`900 40px 'Playfair Display'`), document.fonts.load(`italic 400 40px 'Playfair Display'`),
          document.fonts.load(`700 40px 'Playfair Display'`), document.fonts.load(`600 20px 'Inter'`),
        ]);
      } catch { /* fallbacks are fine */ }
      tick();
    })());
    for (const a of this.spec.assets) {
      jobs.push(img(a.src).then(i => { if (i) this.images.set(a.id, i); tick(); }));
      if (a.depth) jobs.push(img(a.depth).then(i => { if (i) this.depths.set(a.id, i); tick(); }));
    }
    await Promise.all(jobs);
    if (this.council) return;   // the council style paints flat grounds: no depth parallax, grain or paper
    this.parallax = new DepthParallax(this.W, this.H);
    for (const [id, d] of this.depths) { const i = this.images.get(id); if (i) this.parallax.add(id, i, d); }
    this.grain = Array.from({ length: 8 }, (_, k) => this.makeGrain(256, k));
    this.paperTex = this.makePaper(512);
  }

  // ── Frame ──────────────────────────────────────────────────────────────────
  draw(t: number): void {
    const { ctx, W, H } = this;
    t = clamp(t, 0, this.duration - 1e-3);
    if (this.council) { this.council.painter.draw(ctx, W, H, t, { captions: this.captions, reduced: this.reducedMotion }); return; }
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = PALETTE.night; ctx.fillRect(0, 0, W, H);

    // Gate weave: the whole picture drifts a fraction of a pixel like film in a projector gate.
    const wx = (noise1(t * 3.1, 1) - .5) * 1.4, wy = (noise1(t * 2.7, 2) - .5) * 1.4;
    ctx.translate(wx, wy);

    const active = this.placed.filter(p => t >= p.start && t < p.end);
    active.forEach((p, i) => {
      const local = t - p.start, dur = p.end - p.start;
      const incoming = i > 0 || (active.length === 1 && local < XFADE && p.start > 0);
      const tr = p.scene.transition ?? 'cut';
      let alpha = 1;
      if (incoming && tr !== 'cut' && active.length > 1) alpha = ease('inOut', span(local, 0, XFADE));
      ctx.save();
      if (tr === 'inkWipe' && i > 0) { this.inkMask(span(local, 0, XFADE * 1.15), p.scene.id); alpha = 1; }
      ctx.globalAlpha = tr === 'dip' && i > 0 ? Math.max(0, span(local, XFADE * .5, XFADE)) : alpha;
      if (tr === 'dip' && i === 0 && active.length > 1) {
        const next = active[1];
        ctx.globalAlpha = 1 - span(t - next.start, 0, XFADE * .5);
      }
      this.drawScene(p.scene, local, dur, p);
      ctx.restore();
      if (tr === 'filmBurn' && i > 0) this.filmBurn(span(local, 0, XFADE * 1.3));
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.finish(t);
    const voiced = active[active.length - 1];
    if (voiced && this.captions && voiced.scene.kind !== 'quote') this.caption(voiced, t);
    ctx.restore();
  }

  private drawScene(s: FilmScene, t: number, d: number, p: Placed) {
    switch (s.kind) {
      case 'coldOpen': return this.coldOpen(s, t, d);
      case 'title': return this.title(s, t, d);
      case 'chapter': return this.chapter(s, t, d);
      case 'painting': return this.painting(s, t, d);
      case 'archival': return this.archival(s, t, d);
      case 'map': return this.map(s, t, d);
      case 'quote': return this.quote(s, t, d, p);
      case 'chart': return this.chart(s, t, d);
      case 'masthead': return this.masthead(s, t, d);
      case 'timeline': return this.timeline(s, t, d);
      case 'credits': return this.credits(s, t, d);
    }
  }

  // ── Scenes ─────────────────────────────────────────────────────────────────

  private coldOpen(s: ColdOpenScene, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.fillStyle = PALETTE.night; ctx.fillRect(0, 0, W, H);
    this.lamp(W * .5, H * .46, H * .9, .16 + .05 * noise1(t * 4, 9), t);
    this.motes(t, 70, 'rgba(243,226,190,', .5);
    const per = (d - 1.4) / s.lines.length;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    s.lines.forEach((line, i) => {
      const a = span(t, .5 + i * per, .5 + i * per + 1.1) * (1 - span(t, d - 1, d - .2));
      if (a <= 0) return;
      const size = i === s.lines.length - 1 ? H * .062 : H * .05;
      ctx.font = `italic ${size}px ${FONTS.voice}`;
      ctx.fillStyle = i === s.lines.length - 1 ? PALETTE.brass : PALETTE.bone;
      ctx.globalAlpha = a;
      ctx.filter = `blur(${(1 - a) * 6}px)`;
      const y = H * .5 + (i - (s.lines.length - 1) / 2) * size * 1.65 + (1 - ease('out', a)) * 10;
      ctx.fillText(line, W / 2, y);
      ctx.filter = 'none';
    });
    if (s.cite) {
      ctx.globalAlpha = span(t, d - 3, d - 2) * (1 - span(t, d - 1, d - .2));
      ctx.font = `${H * .022}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.mute;
      ctx.letterSpacing = '3px';
      ctx.fillText(s.cite.toUpperCase(), W / 2, H * .82);
      ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 1;
  }

  private title(s: TitleScene, t: number, d: number) {
    const { ctx, W, H } = this;
    if (s.bgAsset) this.kenBurns(s.bgAsset, t / d, { x: .5, y: .3, zoom: 1.04 }, { x: .5, y: .28, zoom: 1.16 }, 'sepia(.6) brightness(.32) contrast(1.15) blur(1px)');
    this.vignette(.85);
    const cx = W / 2, cy = H * .48;
    // Brass rules drawing out from the centre.
    const r = ease('inOutQuint', span(t, .4, 2.2));
    ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = 1.5;
    for (const y of [cy - H * .145, cy + H * .1]) {
      ctx.beginPath(); ctx.moveTo(cx - W * .3 * r, y); ctx.lineTo(cx + W * .3 * r, y); ctx.stroke();
      this.diamond(cx - W * .3 * r, y, 4 * r); this.diamond(cx + W * .3 * r, y, 4 * r);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // Kicker: tracking in.
    const k = span(t, .8, 2.4);
    ctx.globalAlpha = k * envelope(t, d, .1, .8);
    ctx.font = `600 ${H * .022}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass;
    ctx.letterSpacing = `${lerp(18, 7, ease('out', k))}px`;
    ctx.fillText(s.kicker.toUpperCase(), cx, cy - H * .18);
    ctx.letterSpacing = '0px';
    // Title: each letter rises out of a mask.
    const letters = [...s.title.toUpperCase()];
    ctx.letterSpacing = '0px';
    // Fit to 86% of the frame width so long names never clip.
    let size = H * .13;
    const track = () => size * .05;
    const widthAt = () => {
      ctx.font = `900 ${size}px ${FONTS.display}`;
      return letters.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + track() * (letters.length - 1);
    };
    let total = widthAt();
    if (total > W * .86) { size *= (W * .86) / total; total = widthAt(); }
    let x = cx - total / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, cy - H * .14, W, H * .17); ctx.clip();
    ctx.textAlign = 'left';
    letters.forEach((ch, i) => {
      const w = ctx.measureText(ch).width + track();
      const a = ease('outExpo', span(t, 1.1 + i * .045, 2.1 + i * .045));
      ctx.globalAlpha = envelope(t, d, .01, .8);
      ctx.fillStyle = PALETTE.bone;
      ctx.fillText(ch, x, cy + (1 - a) * H * .16);
      x += w;
    });
    ctx.restore();
    ctx.letterSpacing = '0px'; ctx.textAlign = 'center';
    // Subtitle and dates.
    ctx.globalAlpha = span(t, 2.4, 3.4) * envelope(t, d, .1, .8);
    ctx.font = `italic ${H * .042}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.bone;
    ctx.fillText(s.subtitle, cx, cy + H * .065);
    ctx.globalAlpha = span(t, 3, 4) * envelope(t, d, .1, .8);
    ctx.font = `600 ${H * .024}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass; ctx.letterSpacing = '6px';
    ctx.fillText(s.dates, cx, cy + H * .17);
    ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
  }

  private chapter(s: ChapterScene, t: number, d: number) {
    const { ctx, W, H } = this;
    if (s.bgAsset) this.kenBurns(s.bgAsset, t / d, { x: .5, y: .5, zoom: 1.12 }, { x: .52, y: .48, zoom: 1.2 }, 'brightness(.26) saturate(.5) blur(6px)');
    else { ctx.fillStyle = PALETTE.ink; ctx.fillRect(0, 0, W, H); }
    const e = envelope(t, d, .7, .7);
    // Giant outlined numeral breathing behind the title.
    ctx.save();
    ctx.globalAlpha = .22 * e;
    ctx.font = `900 ${H * .62}px ${FONTS.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = 2;
    const sc = lerp(1.06, 1, ease('out', span(t, 0, d)));
    ctx.translate(W * .5, H * .5); ctx.scale(sc, sc);
    ctx.strokeText(s.numeral, 0, 0);
    ctx.restore();
    // Vertical brass line drawing down, then title.
    const ln = ease('inOutQuint', span(t, .3, 1.3));
    ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = 1.5; ctx.globalAlpha = e;
    ctx.beginPath(); ctx.moveTo(W / 2, H * .28); ctx.lineTo(W / 2, H * .28 + H * .1 * ln); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${H * .022}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass; ctx.letterSpacing = '8px';
    ctx.globalAlpha = span(t, .6, 1.4) * e;
    ctx.fillText(`CHAPTER ${s.numeral}`, W / 2, H * .45);
    ctx.letterSpacing = '0px';
    ctx.font = `700 ${H * .085}px ${FONTS.display}`; ctx.fillStyle = PALETTE.bone;
    const a = ease('out', span(t, .9, 2));
    ctx.globalAlpha = a * e;
    ctx.fillText(s.title, W / 2, H * .57 + (1 - a) * 18);
    ctx.font = `italic ${H * .036}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.mute;
    ctx.globalAlpha = span(t, 1.5, 2.4) * e;
    ctx.fillText(s.years, W / 2, H * .655);
    ctx.globalAlpha = 1;
  }

  private painting(s: PaintingScene, t: number, d: number) {
    const { ctx, W, H } = this;
    const k = t / d;
    const cam = camAt(s.cam, k);
    const drift = s.depth ?? 0;
    const pc = drift && this.parallax?.has(s.asset)
      ? this.parallax.render(s.asset, { x: cam.x, y: cam.y, zoom: cam.zoom,
          shiftX: drift * lerp(-1, 1, ease('inOut', k)), shiftY: drift * .35 * Math.sin(k * Math.PI) })
      : null;
    ctx.filter = this.gradeFilter(s.grade);
    if (pc) ctx.drawImage(pc, 0, 0, W, H);
    else this.kenBurns(s.asset, k, s.cam[0] ?? { x: .5, y: .5, zoom: 1 }, s.cam[s.cam.length - 1] ?? { x: .5, y: .5, zoom: 1.1 }, undefined, s.cam);
    ctx.filter = 'none';
    this.gradeWash(s.grade);
    if (s.atmosphere === 'dust') this.motes(t, 55, 'rgba(255,236,200,', .45);
    if (s.atmosphere === 'lamplight') this.lamp(W * .62, H * .38, H * .9, .14 + .06 * noise1(t * 5, 3), t);
    if (s.atmosphere === 'steam') this.steam(t);
    this.vignette(.7);
    // Bottom scrim for the caption.
    const g = ctx.createLinearGradient(0, H * .62, 0, H);
    g.addColorStop(0, 'rgba(7,6,10,0)'); g.addColorStop(1, 'rgba(7,6,10,.82)');
    ctx.fillStyle = g; ctx.fillRect(0, H * .62, W, H * .38);
    if (s.title) this.lowerTitle(s.title, t, d);
    if (s.reconstruction) this.tag('RECONSTRUCTION', t, d);
    this.credit(s.caption, t, d);
  }

  private archival(s: ArchivalScene, t: number, d: number) {
    const { ctx, W, H } = this;
    // Dark velvet table with a pool of light.
    ctx.fillStyle = '#0e0b09'; ctx.fillRect(0, 0, W, H);
    const lx = s.layout === 'left' ? W * .34 : s.layout === 'right' ? W * .66 : W * .5;
    const pool = ctx.createRadialGradient(lx, H * .45, 10, lx, H * .5, H * .85);
    pool.addColorStop(0, 'rgba(90,70,48,.55)'); pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H);
    this.texture(.06);
    const img = this.images.get(s.asset);
    if (img) {
      const maxH = H * .66, maxW = W * .42;
      const r = img.naturalWidth / img.naturalHeight;
      let ph = maxH, pw = ph * r;
      if (pw > maxW) { pw = maxW; ph = pw / r; }
      const k = ease('out', span(t, 0, 1.4));
      const z = lerp(1, 1.06, t / d);
      const mat = H * .028;
      const x = lx - pw / 2, y = H * .42 - ph / 2 + (1 - k) * 30;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(lx, H * .47); ctx.rotate((s.layout === 'right' ? 1 : -1) * .012 * (1 - k * .4)); ctx.translate(-lx, -H * .47);
      ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(x - mat, y - mat, pw + mat * 2, ph + mat * 2.6);
      ctx.shadowColor = 'transparent';
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, pw, ph); ctx.clip();
      const fx = s.focus?.x ?? .5, fy = s.focus?.y ?? .3;
      const dw = pw * z, dh = ph * z;
      ctx.filter = s.tone === 'mono' ? 'grayscale(1) contrast(1.08)' : s.tone === 'natural' ? 'none' : 'sepia(.32) contrast(1.06) brightness(1.02)';
      ctx.drawImage(img, x - (dw - pw) * fx, y - (dh - ph) * fy, dw, dh);
      ctx.filter = 'none';
      ctx.restore();
      ctx.font = `italic ${H * .019}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.sepiaInk; ctx.textAlign = 'center';
      ctx.fillText(s.caption.length > 70 ? `${s.caption.slice(0, 68)}…` : s.caption, lx, y + ph + mat * 1.75);
      ctx.restore();
      // Callouts: a hairline draws from the detail to its label.
      for (const c of s.callouts ?? []) {
        const a = span(t, c.at, c.at + .9);
        if (a <= 0) continue;
        const px = x + pw * c.x, py = y + ph * c.y;
        const ex = c.side === 'left' ? x - W * .09 : x + pw + W * .09;
        ctx.globalAlpha = envelope(t, d, .01, .7);
        ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lerp(px, ex, ease('out', a)), py); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = PALETTE.brass; ctx.fill();
        if (a > .6) {
          ctx.font = `600 ${H * .021}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.bone;
          ctx.textAlign = c.side === 'left' ? 'right' : 'left'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = span(a, .6, 1) * envelope(t, d, .01, .7);
          ctx.fillText(c.text, ex + (c.side === 'left' ? -10 : 10), py);
        }
      }
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    }
    // Big marker (year / age) on the open side.
    if (s.marker) {
      const mx = s.layout === 'left' ? W * .76 : s.layout === 'right' ? W * .24 : W * .86;
      const a = ease('out', span(t, .6, 1.8)) * envelope(t, d, .01, .7);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = `600 ${H * .022}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass; ctx.letterSpacing = '6px';
      ctx.fillText(s.marker.label.toUpperCase(), mx, H * .38);
      ctx.letterSpacing = '0px';
      ctx.font = `900 ${H * .17}px ${FONTS.display}`; ctx.fillStyle = PALETTE.bone;
      ctx.fillText(this.rollNumber(s.marker.value, span(t, .6, 2.2)), mx, H * .55);
      ctx.globalAlpha = 1;
    }
  }

  private map(s: MapScene, t: number, d: number) {
    const { ctx, W, H } = this;
    const k = t / d;
    // Parchment.
    ctx.fillStyle = PALETTE.paper; ctx.fillRect(0, 0, W, H);
    if (this.paperTex) { ctx.globalAlpha = .55; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(this.paperTex, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    // Camera bbox.
    let bb = s.view[0].bbox;
    for (let i = 1; i < s.view.length; i++) {
      const a = s.view[i - 1], b = s.view[i];
      if (k >= a.t) { const e = ease(b.ease ?? 'inOut', span(k, a.t, b.t)); bb = a.bbox.map((v, j) => lerp(v, b.bbox[j], e)) as typeof bb; }
    }
    const [x0, y0, x1, y1] = bb;
    const midLat = (y0 + y1) / 2, kx = Math.cos(midLat * Math.PI / 180);
    const sx = W / ((x1 - x0) * kx), sy = H / (y1 - y0), sc = Math.min(sx, sy);
    const cxL = (x0 + x1) / 2, cyL = (y0 + y1) / 2;
    const P = (lon: number, lat: number): [number, number] => [W / 2 + (lon - cxL) * kx * sc, H / 2 - (lat - cyL) * sc];
    // Graticule.
    ctx.strokeStyle = 'rgba(80,55,30,.13)'; ctx.lineWidth = 1;
    for (let lon = Math.ceil(x0 - 5); lon <= x1 + 5; lon++) { const [a] = P(lon, 0); ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, H); ctx.stroke(); }
    for (let lat = Math.ceil(y0 - 5); lat <= y1 + 5; lat++) { const [, b] = P(0, lat); ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(W, b); ctx.stroke(); }
    // Basemap, 19th-century engraved style.
    const base = this.spec.basemaps?.[s.basemap];
    if (base) {
      const toPath = (polys: number[][][] | undefined, close = false) => {
        // Midpoint quadratic smoothing: each vertex becomes a control point, so simplified
        // geometry reads as an engraver's curve rather than a jagged GIS polyline.
        const path = new Path2D();
        for (const line of polys ?? []) {
          if (line.length < 2) continue;
          const pts = line.map(([lon, lat]) => P(lon, lat));
          path.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length - 1; i++) {
            path.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
          }
          path.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
          if (close) path.closePath();
        }
        return path;
      };
      const reveal = ease('out', span(t, 0, 1.6));
      const L = base.layers;
      const land = toPath(L.land, true), coast = toPath(L.coast), lakes = toPath(L.lakes, true);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // Water: a faint blue-grey wash on the whole sheet.
      ctx.fillStyle = 'rgba(96,122,132,.10)'; ctx.fillRect(0, 0, W, H);
      // Waterlining: stepped bands echoing the coast out to sea (the engraver's signature). Fat
      // strokes of the coastline are stacked; land is filled on top so only the sea keeps them.
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      for (let i = 6; i >= 1; i--) {
        ctx.lineWidth = i * H * .011;
        ctx.strokeStyle = `rgba(80,110,122,${.04 * reveal})`; ctx.stroke(coast);
      }
      ctx.restore();
      if (L.land) {
        ctx.fillStyle = 'rgba(236,222,190,.95)'; ctx.fill(land, 'evenodd');
        // Land tone: warm ochre at the shoreline fading inland (stroked fat, clipped to land).
        ctx.save(); ctx.clip(land, 'evenodd');
        for (const [w, a] of [[H * .05, .05], [H * .025, .07], [H * .01, .09]] as const) { ctx.strokeStyle = `rgba(170,120,60,${a})`; ctx.lineWidth = w; ctx.stroke(coast); }
        ctx.restore();
      }
      if (L.lakes) { ctx.fillStyle = 'rgba(150,170,172,.45)'; ctx.fill(lakes, 'evenodd'); }
      // Borders: dashed, drawn in after the coast.
      const bA = span(t, .6, 2);
      if (bA > 0) {
        ctx.save(); ctx.globalAlpha = bA;
        ctx.setLineDash([6, 4, 1.5, 4]); ctx.strokeStyle = 'rgba(110,70,40,.55)'; ctx.lineWidth = 1.1; ctx.stroke(toPath(L.states));
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(110,70,40,.6)'; ctx.lineWidth = 1.6; ctx.stroke(toPath(L.countries));
        ctx.restore();
      }
      // Coast: crisp ink line.
      ctx.strokeStyle = `rgba(52,36,20,${.85 * reveal})`; ctx.lineWidth = 1.5; ctx.stroke(coast);
      if (L.lakes) { ctx.lineWidth = 1; ctx.stroke(lakes); }
      // State names, letterspaced small caps, only those on screen and not under a stop label.
      const sA = span(t, 1, 2.4);
      if (sA > 0 && base.stateLabels) {
        ctx.save(); ctx.globalAlpha = sA * .55;
        ctx.font = `600 ${H * .016}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.sepiaInk; ctx.textAlign = 'center';
        ctx.letterSpacing = `${H * .006}px`;
        for (const l of base.stateLabels) {
          const [lx, ly] = P(l.lon, l.lat);
          if (lx < W * .05 || lx > W * .95 || ly < H * .08 || ly > H * .9) continue;
          ctx.fillText(l.name.toUpperCase(), lx, ly);
        }
        ctx.restore();
      }
    }
    // Places.
    for (const p of s.places ?? []) {
      const a = ease('outBack', span(k, p.at, p.at + .06));
      if (a <= 0) continue;
      const [px, py] = P(p.lon, p.lat);
      ctx.globalAlpha = clamp(a);
      ctx.fillStyle = PALETTE.oxblood; ctx.beginPath(); ctx.arc(px, py, 6 * a, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PALETTE.paper; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `italic ${H * .026}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.sepiaInk; ctx.textAlign = 'left';
      ctx.fillText(p.label, px + 12, py - 6);
      if (p.years) { ctx.font = `600 ${H * .016}px ${FONTS.ui}`; ctx.fillStyle = 'rgba(59,42,26,.7)'; ctx.fillText(p.years, px + 12, py + 14); }
      ctx.globalAlpha = 1;
    }
    // Route.
    if (s.route?.length) {
      const pts = s.route.map(r => P(r.lon, r.lat));
      const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
      const len = segs.reduce((a, b) => a + b, 0);
      const [ra, rb] = s.routeSpan ?? [.15, .85];
      const prog = ease('inOut', span(k, ra, rb)) * len;
      ctx.lineWidth = 3.2; ctx.strokeStyle = PALETTE.oxblood; ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      let acc = 0, head = pts[0];
      for (let i = 0; i < segs.length; i++) {
        if (acc + segs[i] <= prog) { ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); acc += segs[i]; head = pts[i + 1]; continue; }
        const f = (prog - acc) / segs[i];
        head = [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
        ctx.lineTo(head[0], head[1]);
        break;
      }
      ctx.stroke(); ctx.setLineDash([]);
      // Stops reached so far.
      acc = 0;
      let lift = 0;
      s.route.forEach((r, i) => {
        if (i > 0) acc += segs[i - 1];
        if (acc > prog + .5) return;
        const [px, py] = pts[i];
        // Stops closer than ~3 label-heights to the previous one get stacked upward.
        lift = i > 0 && Math.hypot(px - pts[i - 1][0], py - pts[i - 1][1]) < H * .08 ? lift + H * .055 : 0;
        ctx.fillStyle = PALETTE.paper; ctx.strokeStyle = PALETTE.oxblood; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(px, py, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.textAlign = i % 2 ? 'right' : 'left';
        const off = i % 2 ? -14 : 14;
        const ly = py + 5 - lift;
        if (lift) { ctx.strokeStyle = 'rgba(59,42,26,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py - 7); ctx.lineTo(px + off * .6, ly - H * .008); ctx.stroke(); }
        ctx.font = `700 ${H * .024}px ${FONTS.display}`; ctx.fillStyle = PALETTE.sepiaInk;
        ctx.fillText(r.label, px + off, ly);
        if (r.mode && r.mode !== 'start') { ctx.font = `italic ${H * .018}px ${FONTS.voice}`; ctx.fillStyle = 'rgba(125,35,32,.9)'; ctx.fillText(`by ${r.mode}`, px + off, ly + H * .026); }
      });
      // Travelling head with a glow.
      const glow = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 26);
      glow.addColorStop(0, 'rgba(125,35,32,.55)'); glow.addColorStop(1, 'rgba(125,35,32,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(head[0], head[1], 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.oxblood; ctx.beginPath(); ctx.arc(head[0], head[1], 5, 0, Math.PI * 2); ctx.fill();
    }
    this.vignette(.55, 'rgba(60,40,20,');
    // Cartouche.
    const e = envelope(t, d, .8, .6);
    ctx.globalAlpha = e;
    ctx.fillStyle = 'rgba(232,220,194,.92)'; ctx.strokeStyle = PALETTE.sepiaInk; ctx.lineWidth = 1.2;
    const cw = W * .3, ch = H * .15, cx0 = W * .045, cy0 = H * .07;
    ctx.fillRect(cx0, cy0, cw, ch); ctx.strokeRect(cx0, cy0, cw, ch); ctx.strokeRect(cx0 + 5, cy0 + 5, cw - 10, ch - 10);
    ctx.textAlign = 'left'; ctx.fillStyle = PALETTE.sepiaInk;
    ctx.font = `700 ${H * .038}px ${FONTS.display}`; ctx.fillText(s.title, cx0 + 22, cy0 + ch * .48);
    if (s.dateline) { ctx.font = `italic ${H * .025}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.oxblood; ctx.fillText(s.dateline, cx0 + 22, cy0 + ch * .8); }
    ctx.font = `${H * .014}px ${FONTS.ui}`; ctx.fillStyle = 'rgba(59,42,26,.65)'; ctx.textAlign = 'right';
    ctx.fillText(s.attribution, W - 24, H - 18);
    ctx.globalAlpha = 1;
    this.compass(W * .92, H * .2, H * .06, t);
  }

  private quote(s: QuoteScene, t: number, d: number, p: Placed) {
    const { ctx, W, H } = this;
    const broadside = s.style === 'broadside';
    if (broadside) {
      ctx.fillStyle = PALETTE.paper; ctx.fillRect(0, 0, W, H);
      if (this.paperTex) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .7; ctx.drawImage(this.paperTex, 0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    } else if (s.bgAsset) {
      this.kenBurns(s.bgAsset, t / d, { x: .5, y: .45, zoom: 1.1 }, { x: .5, y: .4, zoom: 1.22 }, 'brightness(.22) saturate(.4) blur(5px)');
    } else { ctx.fillStyle = PALETTE.ink; ctx.fillRect(0, 0, W, H); }
    this.vignette(broadside ? .45 : .8, broadside ? 'rgba(70,45,20,' : undefined);
    const ink = broadside ? PALETTE.sepiaInk : PALETTE.bone;
    const gold = broadside ? PALETTE.oxblood : PALETTE.brass;
    // Giant quotation mark.
    ctx.globalAlpha = .18 * envelope(t, d, 1, .6);
    ctx.font = `900 ${H * .5}px ${FONTS.display}`; ctx.fillStyle = gold; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('\u201C', W * .06, H * .52);
    ctx.globalAlpha = 1;
    // Words reveal in time with the voice.
    const size = H * (s.text.length > 180 ? .046 : s.text.length > 110 ? .056 : .068);
    ctx.font = `${broadside ? '700 ' : 'italic '}${size}px ${broadside ? FONTS.display : FONTS.voice}`;
    const lines = wrap(ctx, s.text, W * .72);
    const words = lines.flatMap((l, li) => l.split(' ').map(w => ({ w, li })));
    const voiceStart = p.voiceAt - p.start, voiceDur = p.scene.narration?.duration ?? d * .7;
    const lh = size * 1.42, top = H * .5 - (lines.length - 1) * lh / 2;
    const emph = new Set((s.emphasis ?? []).map(e => e.toLowerCase()));
    let wi = 0;
    lines.forEach((line, li) => {
      const lw = ctx.measureText(line).width;
      let x = W / 2 - lw / 2;
      for (const word of line.split(' ')) {
        const at = voiceStart + (wi / words.length) * voiceDur * .92;
        const a = ease('out', span(t, at - .15, at + .35)) * (1 - span(t, d - .7, d - .1));
        const key = word.toLowerCase().replace(/[^a-z0-9'’-]/g, '');
        ctx.fillStyle = emph.has(key) ? gold : ink;
        ctx.globalAlpha = .12 + .88 * a;
        ctx.textAlign = 'left';
        ctx.fillText(word, x, top + li * lh + (1 - a) * 6);
        x += ctx.measureText(`${word} `).width;
        wi++;
      }
    });
    ctx.globalAlpha = span(t, voiceStart + voiceDur * .8, voiceStart + voiceDur) * (1 - span(t, d - .7, d - .1));
    ctx.textAlign = 'center';
    ctx.font = `600 ${H * .02}px ${FONTS.ui}`; ctx.fillStyle = broadside ? 'rgba(59,42,26,.8)' : PALETTE.brass; ctx.letterSpacing = '4px';
    ctx.fillText(`\u2014 ${s.cite.toUpperCase()}`, W / 2, top + lines.length * lh + H * .03);
    ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
  }

  private chart(s: ChartScene, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#0f0c0a'; ctx.fillRect(0, 0, W, H);
    this.texture(.05);
    const e = envelope(t, d, .6, .7);
    ctx.globalAlpha = e; ctx.textAlign = 'left';
    ctx.font = `600 ${H * .02}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass; ctx.letterSpacing = '5px';
    ctx.fillText('BY THE NUMBERS', W * .08, H * .13); ctx.letterSpacing = '0px';
    ctx.font = `700 ${H * .055}px ${FONTS.display}`; ctx.fillStyle = PALETTE.bone;
    ctx.fillText(s.title, W * .08, H * .21);
    const max = Math.max(...s.series.map(v => v.value));
    const n = s.series.length, x0 = W * .1, x1 = W * .9, base = H * .8, top = H * .3;
    const bw = (x1 - x0) / n * .62;
    ctx.strokeStyle = 'rgba(243,234,216,.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 - 20, base); ctx.lineTo(x1 + 10, base); ctx.stroke();
    s.series.forEach((v, i) => {
      const a = ease('outExpo', span(t, .8 + i * .28, 2.2 + i * .28));
      const x = x0 + (x1 - x0) * (i + .5) / n - bw / 2;
      const h = (base - top) * (v.value / max) * a;
      const hi = i === s.highlight;
      const g = ctx.createLinearGradient(0, base - h, 0, base);
      g.addColorStop(0, hi ? PALETTE.brass : 'rgba(243,234,216,.85)'); g.addColorStop(1, hi ? 'rgba(212,162,76,.35)' : 'rgba(243,234,216,.2)');
      ctx.fillStyle = g; ctx.fillRect(x, base - h, bw, h);
      ctx.textAlign = 'center';
      ctx.font = `600 ${H * .021}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.mute;
      ctx.fillText(v.label, x + bw / 2, base + H * .04);
      if (a > .05) {
        ctx.font = `700 ${H * (hi ? .03 : .022)}px ${FONTS.ui}`; ctx.fillStyle = hi ? PALETTE.brass : PALETTE.bone;
        ctx.fillText(Math.round(v.value * a).toLocaleString('en-US'), x + bw / 2, base - h - H * .018);
      }
    });
    ctx.textAlign = 'left';
    if (s.note) { ctx.globalAlpha = span(t, d * .55, d * .55 + 1) * e; ctx.font = `italic ${H * .028}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.bone; ctx.fillText(s.note, W * .08, H * .27); }
    ctx.globalAlpha = e * .8; ctx.font = `${H * .016}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.mute;
    ctx.fillText(`Source: ${s.source}`, W * .08, H * .93);
    ctx.globalAlpha = 1;
  }

  private masthead(s: MastheadScene, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#16120e'; ctx.fillRect(0, 0, W, H);
    // The sheet, slowly pushing in.
    const z = lerp(1.0, 1.1, ease('inOut', t / d));
    ctx.save();
    ctx.translate(W / 2, H * .52); ctx.scale(z, z); ctx.rotate(-.01); ctx.translate(-W / 2, -H * .52);
    const px = W * .14, py = H * .06, pw = W * .72, ph = H * 1.1;
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#e9e0c9'; ctx.fillRect(px, py, pw, ph);
    ctx.shadowColor = 'transparent';
    if (this.paperTex) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .6; ctx.drawImage(this.paperTex, px, py, pw, ph); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // Ink appears behind the press roller.
    const roll = ease('inOut', span(t, .3, 2.6));
    const inkY = py + ph * roll;
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, inkY - py); ctx.clip();
    const ink = '#1a140f';
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.textAlign = 'center';
    const cx = px + pw / 2;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px + 30, py + 40); ctx.lineTo(px + pw - 30, py + 40); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 30, py + 46); ctx.lineTo(px + pw - 30, py + 46); ctx.stroke();
    ctx.font = `900 ${H * .125}px ${FONTS.display}`;
    ctx.letterSpacing = '4px'; ctx.fillText(s.name.toUpperCase(), cx, py + H * .2); ctx.letterSpacing = '0px';
    ctx.font = `italic ${H * .026}px ${FONTS.voice}`;
    ctx.fillText(s.motto, cx, py + H * .262);
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 30, py + H * .29); ctx.lineTo(px + pw - 30, py + H * .29); ctx.stroke();
    ctx.font = `600 ${H * .018}px ${FONTS.display}`; ctx.letterSpacing = '2px';
    ctx.textAlign = 'left'; ctx.fillText(s.editors.toUpperCase(), px + 34, py + H * .315);
    ctx.textAlign = 'right'; ctx.fillText(`${s.place.toUpperCase()}  ·  ${s.dateline.toUpperCase()}`, px + pw - 34, py + H * .315);
    ctx.letterSpacing = '0px';
    ctx.beginPath(); ctx.moveTo(px + 30, py + H * .33); ctx.lineTo(px + pw - 30, py + H * .33); ctx.stroke();
    // Columns: greyed type, not invented text.
    const cols = 5, gut = 14, cw = (pw - 60 - gut * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      const x = px + 30 + c * (cw + gut);
      if (c) { ctx.beginPath(); ctx.moveTo(x - gut / 2, py + H * .35); ctx.lineTo(x - gut / 2, py + ph - 30); ctx.stroke(); }
      for (let r = 0; r < 60; r++) {
        const y = py + H * .36 + r * 11;
        if (y > py + ph - 30) break;
        const para = hash(c * 977 + r * 31) < .08;
        const w = para ? cw * (.3 + hash(c + r) * .4) : cw * (.86 + hash(c * 13 + r) * .14);
        ctx.fillStyle = `rgba(26,20,15,${para ? .25 : .32})`;
        ctx.fillRect(x + (r && hash(c * 7 + r * 3) < .06 ? 10 : 0), y, w, 4);
      }
    }
    ctx.restore();
    // Roller.
    if (roll < 1) {
      const g = ctx.createLinearGradient(0, inkY - 26, 0, inkY + 26);
      g.addColorStop(0, 'rgba(10,8,6,0)'); g.addColorStop(.45, 'rgba(10,8,6,.9)'); g.addColorStop(.55, 'rgba(60,50,40,.95)'); g.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = g; ctx.fillRect(px - 20, inkY - 26, pw + 40, 52);
    }
    ctx.restore();
    this.vignette(.75);
  }

  private timeline(s: TimelineScene, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#0e0b0a'; ctx.fillRect(0, 0, W, H);
    this.texture(.05);
    const [a0, a1] = s.span;
    const k = ease('inOut', span(t / d, s.sweep[0], s.sweep[1]));
    const window = 22; // years visible
    const centre = lerp(a0 + window / 2, a1 - window / 2, k);
    const X = (y: number) => W / 2 + (y - centre) * (W / window);
    const axis = H * .56;
    const e = envelope(t, d, .6, .7);
    ctx.globalAlpha = e;
    ctx.strokeStyle = PALETTE.brassDim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, axis); ctx.lineTo(W, axis); ctx.stroke();
    for (let y = Math.floor(centre - window); y <= centre + window; y++) {
      const x = X(y), dec = y % 10 === 0;
      ctx.strokeStyle = dec ? PALETTE.brass : 'rgba(212,162,76,.35)'; ctx.lineWidth = dec ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, axis - (dec ? 14 : 6)); ctx.lineTo(x, axis + (dec ? 14 : 6)); ctx.stroke();
      if (dec || y % 5 === 0) { ctx.font = `${dec ? 700 : 400} ${H * (dec ? .026 : .018)}px ${FONTS.ui}`; ctx.fillStyle = dec ? PALETTE.bone : PALETTE.mute; ctx.textAlign = 'center'; ctx.fillText(String(y), x, axis + H * .055); }
    }
    s.events.forEach((ev, i) => {
      const x = X(ev.year);
      if (x < -200 || x > W + 200) return;
      const near = 1 - clamp(Math.abs(x - W / 2) / (W * .55));
      const up = i % 2 === 0;
      const len = H * (.12 + (i % 3) * .05);
      const y2 = axis + (up ? -len : len);
      ctx.globalAlpha = e * (.35 + .65 * near);
      ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, axis); ctx.lineTo(x, y2); ctx.stroke();
      ctx.fillStyle = PALETTE.brass; ctx.beginPath(); ctx.arc(x, axis, 5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = `700 ${H * .022}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass;
      ctx.fillText(String(ev.year), x + 8, y2 + (up ? 4 : 16));
      ctx.font = `italic ${H * .026}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.bone;
      const lines = wrap(ctx, ev.label, W * .17);
      lines.slice(0, 3).forEach((l, li) => ctx.fillText(l, x + 8, y2 + (up ? 4 : 16) + (li + 1) * H * .032));
    });
    ctx.globalAlpha = e;
    ctx.textAlign = 'left'; ctx.font = `600 ${H * .02}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass; ctx.letterSpacing = '5px';
    ctx.fillText(s.title.toUpperCase(), W * .06, H * .12); ctx.letterSpacing = '0px';
    ctx.textAlign = 'right'; ctx.font = `900 ${H * .11}px ${FONTS.display}`; ctx.fillStyle = 'rgba(243,234,216,.9)';
    ctx.fillText(String(Math.round(centre)), W * .94, H * .19);
    ctx.globalAlpha = 1;
    // Edge fades.
    for (const [x, dir] of [[0, 1], [W, -1]] as const) {
      const g = ctx.createLinearGradient(x, 0, x + dir * W * .12, 0);
      g.addColorStop(0, '#0e0b0a'); g.addColorStop(1, 'rgba(14,11,10,0)');
      ctx.fillStyle = g; ctx.fillRect(dir > 0 ? 0 : W - W * .12, 0, W * .12, H);
    }
  }

  private credits(s: CreditsScene, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.fillStyle = PALETTE.night; ctx.fillRect(0, 0, W, H);
    const lh = H * .036;
    const height = s.blocks.reduce((n, b) => n + lh * 1.6 + b.lines.length * lh + lh, 0);
    let y = lerp(H * .9, H * .5 - height, ease('linear', span(t, .5, d - .5)));
    ctx.textAlign = 'center';
    for (const b of s.blocks) {
      ctx.font = `600 ${H * .02}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.brass; ctx.letterSpacing = '5px';
      ctx.fillText(b.head.toUpperCase(), W / 2, y); ctx.letterSpacing = '0px';
      y += lh * 1.6;
      ctx.font = `${H * .026}px ${FONTS.voice}`; ctx.fillStyle = PALETTE.bone;
      for (const l of b.lines) { ctx.fillText(l, W / 2, y); y += lh; }
      y += lh;
    }
    ctx.globalAlpha = 1;
  }

  // ── Finishing ──────────────────────────────────────────────────────────────

  private finish(t: number) {
    const { ctx, W, H } = this;
    // Grain (cycled at 12 fps like real stock).
    const g = this.grain[Math.floor(t * 12) % (this.grain.length || 1)];
    if (g) {
      ctx.globalAlpha = .085; ctx.globalCompositeOperation = 'overlay';
      const pat = ctx.createPattern(g, 'repeat');
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    // Exposure flicker.
    const f = (noise1(t * 9, 5) - .5) * .035;
    if (f > 0) { ctx.fillStyle = `rgba(255,240,215,${f})`; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = `rgba(0,0,0,${-f})`; ctx.fillRect(0, 0, W, H); }
    this.vignette(.35);
  }

  private caption(p: Placed, t: number) {
    const n = p.scene.narration;
    if (!n?.duration) return;
    const local = t - p.voiceAt;
    if (local < 0 || local > n.duration + .3) return;
    const chunk = captionChunks(n.text, n.duration).find(c => local >= c.a && local < c.b + .25);
    if (!chunk) return;
    const { ctx, W, H } = this;
    ctx.font = `600 ${H * .03}px ${FONTS.ui}`;
    const tw = ctx.measureText(chunk.text).width;
    const y = H * .9;
    ctx.fillStyle = 'rgba(7,6,10,.62)';
    const pad = H * .018;
    this.roundRect(W / 2 - tw / 2 - pad * 1.4, y - H * .03 - pad * .5, tw + pad * 2.8, H * .03 + pad * 1.6, pad);
    ctx.fill();
    ctx.fillStyle = '#fbf6ea'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(chunk.text, W / 2, y);
  }

  // ── Pieces ─────────────────────────────────────────────────────────────────

  private kenBurns(id: string, k: number, a: { x: number; y: number; zoom: number }, b: { x: number; y: number; zoom: number }, filter?: string, keys?: PaintingScene['cam']) {
    const img = this.images.get(id);
    const { ctx, W, H } = this;
    if (!img) { ctx.fillStyle = PALETTE.ink; ctx.fillRect(0, 0, W, H); return; }
    const c = keys?.length ? camAt(keys, k) : { x: lerp(a.x, b.x, ease('inOut', k)), y: lerp(a.y, b.y, ease('inOut', k)), zoom: lerp(a.zoom, b.zoom, ease('inOut', k)) };
    const r = coverRect(img.naturalWidth, img.naturalHeight, W, H, c.x, c.y, c.zoom);
    const prev = ctx.filter;
    if (filter) ctx.filter = filter;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.filter = prev;
  }

  private gradeFilter(g?: PaintingScene['grade']) {
    switch (g) {
      case 'warm': return 'saturate(.9) contrast(1.06) brightness(.95)';
      case 'cool': return 'saturate(.75) contrast(1.08) brightness(.9) hue-rotate(-6deg)';
      case 'dusk': return 'saturate(.85) contrast(1.1) brightness(.82)';
      case 'night': return 'saturate(.6) contrast(1.12) brightness(.66)';
      default: return 'contrast(1.04)';
    }
  }

  private gradeWash(g?: PaintingScene['grade']) {
    const { ctx, W, H } = this;
    const col = g === 'warm' ? 'rgba(255,170,90,.10)' : g === 'cool' ? 'rgba(80,120,170,.10)' : g === 'dusk' ? 'rgba(200,90,60,.12)' : g === 'night' ? 'rgba(40,60,110,.16)' : '';
    if (!col) return;
    ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  private lowerTitle(text: string, t: number, d: number) {
    const { ctx, W, H } = this;
    const a = ease('out', span(t, .4, 1.4)) * envelope(t, d, .01, .7);
    ctx.globalAlpha = a; ctx.textAlign = 'left';
    ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W * .06, H * .735); ctx.lineTo(W * .06 + W * .06 * a, H * .735); ctx.stroke();
    ctx.font = `700 ${H * .06}px ${FONTS.display}`; ctx.fillStyle = PALETTE.bone;
    ctx.fillText(text, W * .06, H * .81 + (1 - a) * 14);
    ctx.globalAlpha = 1;
  }

  private tag(text: string, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.globalAlpha = envelope(t, d, .6, .6);
    ctx.font = `700 ${H * .015}px ${FONTS.ui}`; ctx.letterSpacing = '3px';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(7,6,10,.66)'; this.roundRect(W * .04, H * .06, w + 28, H * .04, H * .02); ctx.fill();
    ctx.strokeStyle = 'rgba(212,162,76,.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = PALETTE.brass; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W * .04 + 14, H * .08 + 1);
    ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  }

  private credit(text: string, t: number, d: number) {
    const { ctx, W, H } = this;
    ctx.globalAlpha = .82 * envelope(t, d, 1, .6);
    ctx.font = `${H * .016}px ${FONTS.ui}`; ctx.fillStyle = PALETTE.bone; ctx.textAlign = 'right';
    ctx.fillText(text, W - W * .03, H * .055);
    ctx.globalAlpha = 1;
  }

  private vignette(strength: number, rgb = 'rgba(0,0,0,') {
    const { ctx, W, H } = this;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .72);
    g.addColorStop(0, `${rgb}0)`); g.addColorStop(1, `${rgb}${strength})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  private lamp(x: number, y: number, r: number, a: number, _t: number) {
    const { ctx, W, H } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,190,110,${a})`); g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  private motes(t: number, n: number, rgb: string, alpha: number) {
    const { ctx, W, H } = this;
    for (let i = 0; i < n; i++) {
      const sp = .008 + hash(i * 3) * .02;
      const x = ((hash(i) + t * sp * (hash(i * 5) - .3)) % 1 + 1) % 1 * W;
      const y = ((hash(i * 7) - t * sp * .6) % 1 + 1) % 1 * H;
      const tw = .4 + .6 * noise1(t * (.5 + hash(i * 11)), i);
      const r = .6 + hash(i * 13) * 2.2;
      ctx.fillStyle = `${rgb}${alpha * tw})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  private steam(t: number) {
    const { ctx, W, H } = this;
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 9; i++) {
      const x = W * (.1 + hash(i * 17) * .8) + Math.sin(t * .3 + i) * 40;
      const y = H * (.15 + hash(i * 23) * .5) - (t * 12 * (1 + hash(i))) % (H * .3);
      const r = H * (.18 + hash(i * 29) * .2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(230,230,235,.10)'); g.addColorStop(1, 'rgba(230,230,235,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private compass(x: number, y: number, r: number, t: number) {
    const { ctx } = this;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .4) * .03);
    ctx.strokeStyle = PALETTE.sepiaInk; ctx.fillStyle = PALETTE.sepiaInk; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .8, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.05); ctx.lineTo(r * .14, 0); ctx.lineTo(-r * .14, 0); ctx.closePath();
      ctx.globalAlpha = i === 3 ? 1 : .55; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.font = `700 ${r * .42}px ${FONTS.display}`; ctx.textAlign = 'center'; ctx.fillText('N', 0, -r * 1.12);
    ctx.restore();
  }

  private diamond(x: number, y: number, r: number) {
    const { ctx } = this;
    if (r <= .2) return;
    ctx.fillStyle = PALETTE.brass;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
  }

  private texture(a: number) {
    if (!this.paperTex) return;
    const { ctx, W, H } = this;
    ctx.globalAlpha = a; ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.paperTex, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  private inkMask(p: number, seed: string) {
    // Organic ink-bleed wipe: overlapping blots grow from the centre.
    const { ctx, W, H } = this;
    let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) | 0;
    ctx.beginPath();
    const R = Math.hypot(W, H) * .62 * ease('inOut', p);
    for (let i = 0; i < 14; i++) {
      const a = hash(s + i) * Math.PI * 2, dist = hash(s + i * 7) * R * .55;
      const r = R * (.45 + hash(s + i * 13) * .5);
      ctx.moveTo(W / 2 + Math.cos(a) * dist + r, H / 2 + Math.sin(a) * dist);
      ctx.arc(W / 2 + Math.cos(a) * dist, H / 2 + Math.sin(a) * dist, Math.max(0, r), 0, Math.PI * 2);
    }
    ctx.clip();
  }

  private filmBurn(p: number) {
    if (p <= 0 || p >= 1) return;
    const { ctx, W, H } = this;
    const a = Math.sin(p * Math.PI);
    const g = ctx.createRadialGradient(W * .8, H * .3, 0, W * .8, H * .3, W * .9);
    g.addColorStop(0, `rgba(255,214,150,${.75 * a})`); g.addColorStop(.4, `rgba(232,110,40,${.4 * a})`); g.addColorStop(1, 'rgba(120,20,10,0)');
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  private rollNumber(value: string, p: number): string {
    const m = value.match(/^(\D*)(\d+)(.*)$/);
    if (!m) return value;
    const target = Number(m[2]);
    const from = target > 1000 ? target - 30 : 0;
    return `${m[1]}${Math.round(lerp(from, target, ease('outExpo', p)))}${m[3]}`;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  private makeGrain(size: number, seed: number): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = Math.floor(hash(i * 2654435761 + seed * 97) * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  private makePaper(size: number): HTMLCanvasElement {
    // Fibrous paper: layered low-frequency blotches + fine fibre noise.
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 140; i++) {
      const x = hash(i * 3) * size, y = hash(i * 5) * size, r = 20 + hash(i * 7) * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const a = .04 + hash(i * 11) * .07;
      gr.addColorStop(0, `rgba(150,110,60,${a})`); gr.addColorStop(1, 'rgba(150,110,60,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(120,90,50,.06)';
    for (let i = 0; i < 900; i++) {
      const x = hash(i * 13) * size, y = hash(i * 17) * size, a = hash(i * 19) * Math.PI, l = 3 + hash(i * 23) * 14;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  }
}

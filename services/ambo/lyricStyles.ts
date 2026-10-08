// lyricStyles — the typography for Chora lyric sync on Ambo's outputs.
//
// Ten hand-authored looks, each credited to the council director whose lens it
// follows (the Motion Council for type in motion, the Art Council for the
// editorial ones). Like the broadcast identities, every look is a DESIGNER —
// its own layout, timing and treatment — not a theme over one template.
//
// Chora's lyrics are timed per LINE ({time, text}). Words are timed here by
// spreading the line's span across its words by length, with a short attack,
// so word-level looks (sweep, stack) follow the singer closely enough for a
// congregation to sing along. A look draws onto a transparent canvas; it
// composites over whatever is behind it on the output.

export interface LyricLine { time: number; text: string }

export interface LyricWord { text: string; start: number; end: number; /** 0..1 sung */ p: number }

export interface LyricFrame {
  w: number;
  h: number;
  /** Song position, seconds. */
  pos: number;
  lines: LyricLine[];
  /** Current line index, -1 before the first. */
  idx: number;
  /** Seconds since the current line began. */
  tIn: number;
  /** Seconds the current line lasts. */
  dur: number;
  /** 0..1 through the current line. */
  prog: number;
  words: LyricWord[];
  /** Show the title card instead of lyrics (intro / long instrumental gap). */
  titleCard: boolean;
  /** 0..1 fade for the title card. */
  titleAlpha: number;
  title?: string;
  artist?: string;
  /** Beat phase 0..1 when the tempo is known, for pulses. */
  beat?: number;
}

export interface LyricStyle {
  id: string;
  name: string;
  /** Council director credited with the look. */
  director: string;
  council: 'Motion Council' | 'Art Council';
  blurb: string;
  /** Best placement hint for operators. */
  use: string;
  draw: (ctx: CanvasRenderingContext2D, f: LyricFrame) => void;
}

// ── timing ───────────────────────────────────────────────────────────────────

const MAX_LINE = 7;

export function lineSpan(lines: LyricLine[], i: number): number {
  const next = lines[i + 1]?.time;
  const words = (lines[i]?.text || '').split(/\s+/).filter(Boolean).length;
  const est = Math.min(MAX_LINE, 1.2 + words * 0.42);
  return next != null ? Math.max(0.4, Math.min(next - lines[i].time, Math.max(est, 1.5) + 2)) : est;
}

export function timeWords(line: LyricLine, span: number, tIn: number): LyricWord[] {
  const parts = line.text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  // Sing across ~85% of the span; the tail is the held last word / breath.
  const singing = Math.max(0.3, span * 0.85);
  const weight = parts.map(p => 0.6 + p.length);
  const total = weight.reduce((a, b) => a + b, 0);
  let t = 0;
  return parts.map((text, i) => {
    const d = (weight[i] / total) * singing;
    const start = t, end = t + d;
    t = end;
    const attack = Math.min(0.18, d * 0.6);
    const p = tIn <= start ? 0 : tIn >= start + attack ? 1 : (tIn - start) / attack;
    return { text, start, end, p };
  });
}

export function buildFrame(
  lines: LyricLine[], pos: number, w: number, h: number,
  meta: { title?: string; artist?: string; bpm?: number; firstBeat?: number } = {},
): LyricFrame {
  let idx = -1;
  // lines are sorted; binary search for the last line at or before pos
  let lo = 0, hi = lines.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].time <= pos) { idx = m; lo = m + 1; } else hi = m - 1; }
  const span = idx >= 0 ? lineSpan(lines, idx) : 0;
  const tIn = idx >= 0 ? pos - lines[idx].time : 0;
  const ended = idx >= 0 && tIn > span + 0.6;
  const nextT = lines[idx + 1]?.time;
  // Title card: before the first line (with 0.4 s to clear), or in a long gap.
  const introGap = idx < 0 && (lines[0]?.time ?? 0) - pos > 0.4;
  const longGap = ended && nextT != null && nextT - pos > 3;
  const titleCard = introGap || longGap || (ended && nextT == null);
  let titleAlpha = 0;
  if (titleCard) {
    const until = (nextT ?? lines[0]?.time ?? pos + 10) - pos;
    const since = idx < 0 ? pos : tIn - span;
    titleAlpha = Math.max(0, Math.min(1, since / 0.8, (until - 0.4) / 0.6));
  }
  const beat = meta.bpm ? (((pos - (meta.firstBeat || 0)) * meta.bpm) / 60) % 1 : undefined;
  return {
    w, h, pos, lines, idx: titleCard && idx >= 0 && ended ? idx : idx,
    tIn, dur: span, prog: span ? Math.min(1, tIn / span) : 0,
    words: idx >= 0 && !ended ? timeWords(lines[idx], span, tIn) : [],
    titleCard, titleAlpha, title: meta.title, artist: meta.artist,
    beat: beat != null && beat < 0 ? beat + 1 : beat,
  };
}

// ── drawing helpers ──────────────────────────────────────────────────────────

const SANS = '"Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif';
const SERIF = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const COND = '"Bahnschrift Condensed", "Bahnschrift", "Arial Narrow", "Roboto Condensed", Impact, sans-serif';
const MONO = '"Cascadia Mono", "Consolas", ui-monospace, monospace';
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeBack = (t: number) => { const c = 1.6; const x = Math.min(1, Math.max(0, t)) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxW && line) { out.push(line); line = w; } else line = probe;
  }
  if (line) out.push(line);
  return out;
}

/** Largest font size (≤ max) at which text wraps into ≤ maxLines within maxW. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, font: (s: number) => string, max: number, min: number, maxW: number, maxLines: number): number {
  for (let s = max; s > min; s -= Math.max(2, Math.round(s * 0.06))) {
    ctx.font = font(s);
    if (wrap(ctx, text, maxW).length <= maxLines) return s;
  }
  return min;
}

function shadow(ctx: CanvasRenderingContext2D, blur: number, y = 0, color = 'rgba(0,0,0,0.7)') {
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = y;
}
function noShadow(ctx: CanvasRenderingContext2D) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

const line = (f: LyricFrame, d: number) => f.lines[f.idx + d]?.text ?? '';
const lineIn = (f: LyricFrame, t = 0.45) => ease(f.tIn / t);

/** Word-by-word layout of the current line, wrapped, with per-word positions. */
function layoutWords(ctx: CanvasRenderingContext2D, f: LyricFrame, maxW: number, lineH: number) {
  const space = ctx.measureText(' ').width;
  const rows: Array<{ words: Array<LyricWord & { x: number; w: number }>; width: number }> = [{ words: [], width: 0 }];
  for (const wd of f.words) {
    const ww = ctx.measureText(wd.text).width;
    let row = rows[rows.length - 1];
    if (row.words.length && row.width + space + ww > maxW) { row = { words: [], width: 0 }; rows.push(row); }
    const x = row.words.length ? row.width + space : 0;
    row.words.push({ ...wd, x, w: ww });
    row.width = x + ww;
  }
  return { rows, height: rows.length * lineH };
}

function titleCardDefault(ctx: CanvasRenderingContext2D, f: LyricFrame, opts: { font: string; sub: string; color?: string; y?: number }) {
  if (!f.titleCard || f.titleAlpha <= 0 || !f.title) return;
  const { w, h } = f;
  ctx.globalAlpha = f.titleAlpha;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shadow(ctx, h * 0.02, h * 0.004);
  ctx.fillStyle = opts.color ?? '#fff';
  ctx.font = opts.font;
  ctx.fillText(f.title, w / 2, h * (opts.y ?? 0.46));
  if (f.artist) { ctx.globalAlpha = f.titleAlpha * 0.7; ctx.font = opts.sub; ctx.fillText(f.artist, w / 2, h * ((opts.y ?? 0.46) + 0.08)); }
  noShadow(ctx); ctx.globalAlpha = 1;
}

// ── the looks ────────────────────────────────────────────────────────────────

export const LYRIC_STYLES: LyricStyle[] = [
  {
    id: 'sanctuary', name: 'Sanctuary Lower Third', director: 'the Classical Mind', council: 'Art Council',
    blurb: 'Set like a hymnal: a serif line on a thin rule, the next line waiting in small caps beneath.',
    use: 'Over camera or a quiet background',
    draw(ctx, f) {
      const { w, h } = f;
      titleCardDefault(ctx, f, { font: `italic ${h * 0.07}px ${SERIF}`, sub: `${h * 0.032}px ${SERIF}` });
      if (f.idx < 0 || f.titleCard) return;
      const a = lineIn(f, 0.5);
      // scrim
      const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = g; ctx.fillRect(0, h * 0.6, w, h * 0.4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const size = fitSize(ctx, line(f, 0), s => `${s}px ${SERIF}`, h * 0.075, h * 0.04, w * 0.84, 2);
      ctx.font = `${size}px ${SERIF}`;
      const rows = wrap(ctx, line(f, 0), w * 0.84);
      const base = h * 0.84 - (rows.length - 1) * size * 1.18;
      ctx.globalAlpha = a; shadow(ctx, size * 0.18, size * 0.04);
      ctx.fillStyle = '#FBF7EE';
      rows.forEach((r, i) => ctx.fillText(r, w / 2, base + i * size * 1.18 + (1 - a) * 12));
      noShadow(ctx);
      ctx.fillStyle = 'rgba(212,175,55,0.85)';
      const rw = w * 0.18 * a;
      ctx.fillRect(w / 2 - rw / 2, base + (rows.length - 1) * size * 1.18 + size * 0.42, rw, Math.max(1, h * 0.002));
      const nx = line(f, 1);
      if (nx) {
        ctx.globalAlpha = 0.55 * a;
        ctx.font = `${Math.round(h * 0.03)}px ${SERIF}`;
        ctx.fillStyle = '#E9E2D0';
        ctx.fillText(nx.toUpperCase(), w / 2, h * 0.935);
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'karaoke', name: 'Karaoke Sweep', director: 'the Kinetic Typographer', council: 'Motion Council',
    blurb: 'Each word fills with colour as it is sung; the line you just sang lifts away above.',
    use: 'Sing-along on main screens',
    draw(ctx, f) {
      const { w, h } = f;
      titleCardDefault(ctx, f, { font: `800 ${h * 0.075}px ${SANS}`, sub: `600 ${h * 0.032}px ${SANS}` });
      if (f.idx < 0 || f.titleCard) return;
      const size = fitSize(ctx, line(f, 0), s => `800 ${s}px ${SANS}`, h * 0.088, h * 0.045, w * 0.86, 2);
      ctx.font = `800 ${size}px ${SANS}`;
      const lh = size * 1.2;
      const { rows, height } = layoutWords(ctx, f, w * 0.86, lh);
      const top = h * 0.5 - height / 2;
      const a = lineIn(f, 0.35);
      // previous line, lifting away
      const prev = line(f, -1);
      if (prev) {
        ctx.save(); ctx.globalAlpha = Math.max(0, 0.45 - f.tIn * 0.5); ctx.font = `700 ${size * 0.62}px ${SANS}`;
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
        ctx.fillText(prev, w / 2, top - lh * 0.8 - f.tIn * 30); ctx.restore();
      }
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      rows.forEach((row, ri) => {
        const x0 = w / 2 - row.width / 2, y = top + ri * lh + (1 - a) * 18;
        for (const wd of row.words) {
          ctx.globalAlpha = a;
          shadow(ctx, size * 0.2, size * 0.05);
          ctx.fillStyle = 'rgba(255,255,255,0.38)';
          ctx.fillText(wd.text, x0 + wd.x, y);
          noShadow(ctx);
          if (wd.p > 0) {
            // fill sweep across the word
            ctx.save();
            ctx.beginPath(); ctx.rect(x0 + wd.x, y - size * 0.2, wd.w * wd.p, size * 1.5); ctx.clip();
            const g = ctx.createLinearGradient(x0 + wd.x, 0, x0 + wd.x + wd.w, 0);
            g.addColorStop(0, '#FFB86B'); g.addColorStop(0.5, '#FF6FD8'); g.addColorStop(1, '#8F7CFF');
            ctx.fillStyle = g; ctx.fillText(wd.text, x0 + wd.x, y);
            ctx.restore();
          }
        }
      });
      const nx = line(f, 1);
      if (nx) { ctx.globalAlpha = 0.5 * a; ctx.font = `600 ${size * 0.5}px ${SANS}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(nx, w / 2, top + height + lh * 0.35); }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'stack', name: 'Word Stack', director: 'the Kinetic Typographer', council: 'Motion Council',
    blurb: 'Condensed capitals drop in one word at a time and stack left-aligned, then the line clears sideways.',
    use: 'Youth / high-energy worship',
    draw(ctx, f) {
      const { w, h } = f;
      titleCardDefault(ctx, f, { font: `700 ${h * 0.1}px ${COND}`, sub: `600 ${h * 0.035}px ${COND}` });
      if (f.idx < 0 || f.titleCard) return;
      const words = f.words;
      if (!words.length) return;
      const n = words.length;
      const perRow = n <= 4 ? 1 : n <= 8 ? 2 : 3;
      const rowsN = Math.ceil(n / perRow);
      const size = Math.min(h * 0.17, (h * 0.78) / rowsN / 0.92);
      ctx.font = `700 ${size}px ${COND}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const x0 = w * 0.08;
      const exit = Math.max(0, f.tIn - f.dur + 0.35) / 0.35; // slide out at the end
      const pulse = f.beat != null ? 1 + 0.025 * Math.exp(-f.beat * 6) : 1;
      for (let r = 0; r < rowsN; r++) {
        let x = x0;
        for (let c = 0; c < perRow; c++) {
          const i = r * perRow + c;
          if (i >= n) break;
          const wd = words[i];
          const t = wd.p > 0 ? easeBack((f.tIn - wd.start) / 0.28) : 0;
          const text = wd.text.toUpperCase();
          const ww = ctx.measureText(text).width;
          if (t > 0) {
            ctx.save();
            const y = h * 0.11 + r * size * 0.92;
            ctx.translate(x - exit * w * 0.6 * (1 + r * 0.15), y + (1 - t) * -size * 0.6);
            ctx.scale(pulse, pulse);
            ctx.globalAlpha = Math.min(1, t) * (1 - exit);
            const hot = i === words.findIndex(q => q.p < 1) - 1 || (wd.p >= 1 && i === n - 1 && f.prog < 0.95);
            shadow(ctx, size * 0.12, size * 0.04);
            ctx.fillStyle = hot ? '#FFE14D' : '#FFFFFF';
            ctx.fillText(text, 0, 0);
            ctx.restore();
          }
          x += ww + size * 0.22;
        }
      }
      noShadow(ctx); ctx.globalAlpha = 1;
    },
  },
  {
    id: 'widescreen', name: 'Wide Screen', director: 'the 3D Dramatist', council: 'Motion Council',
    blurb: 'Letterboxed and widely tracked: each line rises slowly out of darkness like a film title.',
    use: 'Ballads, communion, video-backed songs',
    draw(ctx, f) {
      const { w, h } = f;
      const bar = h * 0.11;
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
      if (f.titleCard && f.title) {
        ctx.globalAlpha = f.titleAlpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#EDE6D6';
        (ctx as any).letterSpacing = `${Math.round(h * 0.02)}px`;
        ctx.font = `300 ${h * 0.06}px ${SERIF}`; ctx.fillText(f.title.toUpperCase(), w / 2, h * 0.47);
        (ctx as any).letterSpacing = `${Math.round(h * 0.008)}px`;
        if (f.artist) { ctx.globalAlpha = f.titleAlpha * 0.6; ctx.font = `${h * 0.024}px ${SERIF}`; ctx.fillText(f.artist.toUpperCase(), w / 2, h * 0.55); }
        (ctx as any).letterSpacing = '0px'; ctx.globalAlpha = 1;
        return;
      }
      if (f.idx < 0) return;
      const a = ease(f.tIn / 1.1);
      const out = Math.max(0, f.tIn - f.dur + 0.5) / 0.5;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      (ctx as any).letterSpacing = `${Math.round(h * 0.006)}px`;
      const size = fitSize(ctx, line(f, 0), s => `300 ${s}px ${SERIF}`, h * 0.062, h * 0.034, w * 0.78, 2);
      ctx.font = `300 ${size}px ${SERIF}`;
      const rows = wrap(ctx, line(f, 0), w * 0.78);
      ctx.globalAlpha = a * (1 - out);
      shadow(ctx, size * 0.5, 0, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = '#F4EEDF';
      rows.forEach((r, i) => ctx.fillText(r, w / 2, h * 0.5 + (i - (rows.length - 1) / 2) * size * 1.35 + (1 - a) * h * 0.025));
      noShadow(ctx); (ctx as any).letterSpacing = '0px'; ctx.globalAlpha = 1;
    },
  },
  {
    id: 'neon', name: 'Neon Signal', director: 'the Signal Bender', council: 'Motion Council',
    blurb: 'Neon-tube type that flickers on with an RGB split, over faint scanlines.',
    use: 'Night services, youth, DJ sets',
    draw(ctx, f) {
      const { w, h } = f;
      if (f.titleCard && f.title) {
        ctx.globalAlpha = f.titleAlpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${h * 0.08}px ${SANS}`;
        shadow(ctx, h * 0.03, 0, '#FF2BD6'); ctx.fillStyle = '#FFD6F7'; ctx.fillText(f.title, w / 2, h * 0.46);
        if (f.artist) { shadow(ctx, h * 0.02, 0, '#2BF0FF'); ctx.font = `600 ${h * 0.03}px ${MONO}`; ctx.fillStyle = '#D6FBFF'; ctx.fillText(f.artist.toUpperCase(), w / 2, h * 0.56); }
        noShadow(ctx); ctx.globalAlpha = 1; return;
      }
      if (f.idx < 0) return;
      // flicker on entry
      const fl = f.tIn < 0.35 ? (Math.sin(f.tIn * 90) > 0 ? 1 : 0.25) : 1;
      const jitter = f.tIn < 0.25 ? (1 - f.tIn / 0.25) * h * 0.008 : 0;
      const size = fitSize(ctx, line(f, 0), s => `700 ${s}px ${SANS}`, h * 0.085, h * 0.045, w * 0.82, 2);
      ctx.font = `700 ${size}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const rows = wrap(ctx, line(f, 0), w * 0.82);
      const y0 = h * 0.5 - ((rows.length - 1) * size * 1.2) / 2;
      ctx.globalCompositeOperation = 'lighter';
      rows.forEach((r, i) => {
        const y = y0 + i * size * 1.2;
        ctx.globalAlpha = 0.5 * fl; ctx.fillStyle = '#FF2BD6'; ctx.fillText(r, w / 2 - jitter, y);
        ctx.fillStyle = '#2BF0FF'; ctx.fillText(r, w / 2 + jitter, y);
        ctx.globalAlpha = fl; shadow(ctx, size * 0.35, 0, '#FF2BD6'); ctx.fillStyle = '#FFE8FB'; ctx.fillText(r, w / 2, y); noShadow(ctx);
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'sheet', name: 'Lyric Sheet', director: 'the Radical Minimalist', council: 'Art Council',
    blurb: 'The whole song as a column that scrolls with the singer; only the sung line is fully lit.',
    use: 'Main screens when people know the song',
    draw(ctx, f) {
      const { w, h } = f;
      const size = h * 0.062, lh = size * 1.45;
      ctx.font = `700 ${size}px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const x = w * 0.1;
      const cur = Math.max(0, f.idx);
      // smooth scroll between lines
      const s = f.idx < 0 ? -1 + ease((f.pos - (f.lines[0]?.time ?? 0) + 0.6) / 0.6) : cur + (ease(f.tIn / 0.5) - 1);
      const centreY = h * 0.42;
      for (let i = Math.max(0, cur - 4); i < Math.min(f.lines.length, cur + 7); i++) {
        const y = centreY + (i - s) * lh;
        if (y < -lh || y > h + lh) continue;
        const d = Math.abs(i - s);
        ctx.globalAlpha = i === f.idx ? 1 : Math.max(0.1, 0.42 - d * 0.07);
        ctx.fillStyle = '#fff';
        if (i === f.idx) shadow(ctx, size * 0.25, 0, 'rgba(0,0,0,0.5)');
        const text = f.lines[i].text;
        // shrink long lines to one row
        let sz = size; ctx.font = `700 ${sz}px ${SANS}`;
        while (ctx.measureText(text).width > w * 0.8 && sz > size * 0.6) { sz -= 2; ctx.font = `700 ${sz}px ${SANS}`; }
        ctx.fillText(text, x, y);
        noShadow(ctx);
      }
      if (f.titleCard && f.title && f.idx < 0) {
        ctx.globalAlpha = f.titleAlpha; ctx.font = `800 ${h * 0.05}px ${SANS}`; ctx.fillText(f.title, x, h * 0.2);
        if (f.artist) { ctx.globalAlpha = f.titleAlpha * 0.6; ctx.font = `500 ${h * 0.028}px ${SANS}`; ctx.fillText(f.artist, x, h * 0.26); }
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'gilded', name: 'Gilded', director: 'the Baroque Dramatist', council: 'Art Council',
    blurb: 'Gold italic serif between hand-drawn flourishes, with a slow drift of light.',
    use: 'Christmas, Easter, high celebrations',
    draw(ctx, f) {
      const { w, h } = f;
      const gold = (y0: number, y1: number) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#FFF1B8'); g.addColorStop(0.5, '#E8B84A'); g.addColorStop(1, '#9C6B1E'); return g; };
      const flourish = (cx: number, cy: number, span: number, a: number) => {
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#E8B84A'; ctx.lineWidth = Math.max(1, h * 0.0022);
        for (const dir of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(cx + dir * span * 0.08, cy);
          ctx.bezierCurveTo(cx + dir * span * 0.3, cy - h * 0.02, cx + dir * span * 0.38, cy + h * 0.02, cx + dir * span * 0.5, cy);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(cx + dir * span * 0.5, cy, h * 0.004, 0, Math.PI * 2); ctx.fillStyle = '#E8B84A'; ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.008); ctx.lineTo(cx + h * 0.008, cy); ctx.lineTo(cx, cy + h * 0.008); ctx.lineTo(cx - h * 0.008, cy); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      // drifting motes
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const px = ((i * 0.618 + f.pos * 0.012 * (1 + (i % 3))) % 1) * w;
        const py = ((i * 0.377 - f.pos * 0.02) % 1 + 1) % 1 * h;
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(f.pos * 1.3 + i);
        ctx.fillStyle = '#FFD98A'; ctx.beginPath(); ctx.arc(px, py, h * 0.003, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (f.titleCard && f.title) {
        ctx.globalAlpha = f.titleAlpha; ctx.font = `italic ${h * 0.085}px ${SERIF}`; ctx.fillStyle = gold(h * 0.4, h * 0.5);
        shadow(ctx, h * 0.02, h * 0.004); ctx.fillText(f.title, w / 2, h * 0.45); noShadow(ctx);
        flourish(w / 2, h * 0.54, w * 0.5, f.titleAlpha); ctx.globalAlpha = 1; return;
      }
      if (f.idx < 0) return;
      const a = lineIn(f, 0.7);
      const size = fitSize(ctx, line(f, 0), s => `italic ${s}px ${SERIF}`, h * 0.08, h * 0.042, w * 0.8, 2);
      ctx.font = `italic ${size}px ${SERIF}`;
      const rows = wrap(ctx, line(f, 0), w * 0.8);
      const y0 = h * 0.5 - ((rows.length - 1) * size * 1.25) / 2;
      flourish(w / 2, y0 - size * 1.0, w * 0.42, a * 0.9);
      ctx.globalAlpha = a; shadow(ctx, size * 0.2, size * 0.05, 'rgba(40,20,0,0.75)');
      rows.forEach((r, i) => { const y = y0 + i * size * 1.25; ctx.fillStyle = gold(y - size / 2, y + size / 2); ctx.fillText(r, w / 2, y); });
      noShadow(ctx);
      flourish(w / 2, y0 + (rows.length - 1) * size * 1.25 + size * 0.95, w * 0.42, a * 0.9);
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'riot', name: 'Riot Poster', director: 'the Rebellious Hand', council: 'Art Council',
    blurb: 'Words slapped on as torn paper strips, each at its own angle — the zine on the church noticeboard.',
    use: 'Youth nights, rallies, testimony songs',
    draw(ctx, f) {
      const { w, h } = f;
      if (f.titleCard && f.title) {
        ctx.globalAlpha = f.titleAlpha; ctx.save(); ctx.translate(w / 2, h * 0.47); ctx.rotate(-0.04);
        ctx.font = `900 ${h * 0.09}px Impact, ${COND}`; const tw = ctx.measureText(f.title.toUpperCase()).width;
        ctx.fillStyle = '#F2EDE4'; ctx.fillRect(-tw / 2 - h * 0.03, -h * 0.07, tw + h * 0.06, h * 0.13);
        ctx.fillStyle = '#E3261F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.title.toUpperCase(), 0, 0);
        ctx.restore(); ctx.globalAlpha = 1; return;
      }
      if (f.idx < 0 || !f.words.length) return;
      const size = Math.min(h * 0.11, (w * 0.86) / Math.max(4, line(f, 0).length * 0.42));
      ctx.font = `900 ${size}px Impact, ${COND}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const maxW = w * 0.84;
      const lay: Array<{ wd: LyricWord; x: number; y: number; ww: number; i: number }> = [];
      let x = 0, y = 0;
      f.words.forEach((wd, i) => {
        const ww = ctx.measureText(wd.text.toUpperCase()).width + size * 0.4;
        if (x + ww > maxW && x > 0) { x = 0; y += size * 1.35; }
        lay.push({ wd, x, y, ww, i }); x += ww + size * 0.12;
      });
      const totalH = y + size;
      const rowsW = new Map<number, number>();
      lay.forEach(l => rowsW.set(l.y, Math.max(rowsW.get(l.y) || 0, l.x + l.ww)));
      for (const l of lay) {
        if (l.wd.p <= 0) continue;
        const t = easeBack((f.tIn - l.wd.start) / 0.2);
        const rot = (((l.i * 7919) % 13) - 6) * 0.012;
        const cx = w / 2 - (rowsW.get(l.y) || 0) / 2 + l.x + l.ww / 2;
        const cy = h / 2 - totalH / 2 + l.y + size / 2;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(t, t);
        const paper = l.i % 3 === 1 ? '#E3261F' : '#F2EDE4';
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-l.ww / 2 + 6, -size * 0.6 + 8, l.ww, size * 1.2);
        ctx.fillStyle = paper; ctx.fillRect(-l.ww / 2, -size * 0.6, l.ww, size * 1.2);
        ctx.fillStyle = paper === '#E3261F' ? '#F2EDE4' : '#111';
        ctx.fillText(l.wd.text.toUpperCase(), 0, size * 0.04);
        ctx.restore();
      }
    },
  },
  {
    id: 'horizon', name: 'Horizon', director: 'the Futurist', council: 'Art Council',
    blurb: 'Light geometric type glides in along a horizon line that fills as the line is sung.',
    use: 'Modern worship, conferences, keynotes',
    draw(ctx, f) {
      const { w, h } = f;
      const yLine = h * 0.66;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(w * 0.08, yLine, w * 0.84, Math.max(1, h * 0.002));
      if (f.titleCard && f.title) {
        ctx.globalAlpha = f.titleAlpha; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = `300 ${h * 0.07}px ${SANS}`; ctx.fillStyle = '#fff'; ctx.fillText(f.title, w * 0.08, yLine - h * 0.03);
        if (f.artist) { ctx.font = `500 ${h * 0.022}px ${MONO}`; ctx.fillStyle = '#5CE1E6'; ctx.fillText(f.artist.toUpperCase(), w * 0.08, yLine + h * 0.045); }
        ctx.globalAlpha = 1; return;
      }
      if (f.idx < 0) return;
      const a = ease(f.tIn / 0.6);
      ctx.fillStyle = '#5CE1E6'; ctx.fillRect(w * 0.08, yLine - h * 0.0015, w * 0.84 * f.prog, Math.max(2, h * 0.004));
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const size = fitSize(ctx, line(f, 0), s => `300 ${s}px ${SANS}`, h * 0.075, h * 0.04, w * 0.84, 2);
      ctx.font = `300 ${size}px ${SANS}`;
      const rows = wrap(ctx, line(f, 0), w * 0.84);
      ctx.globalAlpha = a; ctx.fillStyle = '#FFFFFF'; shadow(ctx, size * 0.15, 0, 'rgba(0,0,0,0.6)');
      rows.forEach((r, i) => ctx.fillText(r, w * 0.08 + (1 - a) * w * 0.06, yLine - h * 0.03 - (rows.length - 1 - i) * size * 1.15));
      noShadow(ctx);
      const nx = line(f, 1);
      if (nx) { ctx.globalAlpha = 0.45 * a; ctx.font = `400 ${h * 0.03}px ${SANS}`; ctx.fillText(nx, w * 0.08, yLine + h * 0.06); }
      ctx.font = `500 ${h * 0.018}px ${MONO}`; ctx.fillStyle = '#5CE1E6'; ctx.globalAlpha = 0.8 * a; ctx.textAlign = 'right';
      ctx.fillText(`${String(f.idx + 1).padStart(2, '0')} / ${String(f.lines.length).padStart(2, '0')}`, w * 0.92, yLine + h * 0.045);
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'confidence', name: 'Confidence Monitor', director: 'the Compositor', council: 'Motion Council',
    blurb: 'For the stage display: huge current line, the next line in yellow, a bar showing time left.',
    use: 'Stage display / band monitor',
    draw(ctx, f) {
      const { w, h } = f;
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (f.idx < 0 || f.titleCard) {
        ctx.fillStyle = '#9AA0AE'; ctx.font = `700 ${h * 0.05}px ${SANS}`;
        const nextLine = f.lines[f.idx + 1] ?? f.lines[0];
        ctx.fillText(f.title ? `${f.title}` : 'Instrumental', w / 2, h * 0.35);
        if (nextLine) { ctx.fillStyle = '#F5C542'; ctx.font = `700 ${h * 0.07}px ${SANS}`; ctx.fillText(`NEXT: ${nextLine.text}`, w / 2, h * 0.6); }
        return;
      }
      const size = fitSize(ctx, line(f, 0), s => `800 ${s}px ${SANS}`, h * 0.13, h * 0.06, w * 0.92, 2);
      ctx.font = `800 ${size}px ${SANS}`; ctx.fillStyle = '#FFFFFF';
      const rows = wrap(ctx, line(f, 0), w * 0.92);
      rows.forEach((r, i) => ctx.fillText(r, w / 2, h * 0.38 + (i - (rows.length - 1) / 2) * size * 1.12));
      const nx = line(f, 1);
      if (nx) {
        const s2 = fitSize(ctx, nx, s => `700 ${s}px ${SANS}`, h * 0.075, h * 0.04, w * 0.92, 1);
        ctx.font = `700 ${s2}px ${SANS}`; ctx.fillStyle = '#F5C542'; ctx.fillText(nx, w / 2, h * 0.78);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(w * 0.04, h * 0.93, w * 0.92, h * 0.012);
      ctx.fillStyle = f.prog > 0.85 ? '#FF5A5F' : '#2BE0A8'; ctx.fillRect(w * 0.04, h * 0.93, w * 0.92 * f.prog, h * 0.012);
    },
  },
];

export const DEFAULT_LYRIC_STYLE = 'karaoke';

export function lyricStyleById(id?: string): LyricStyle {
  return LYRIC_STYLES.find(s => s.id === id) ?? LYRIC_STYLES.find(s => s.id === DEFAULT_LYRIC_STYLE)!;
}

/** Sample used for style thumbnails and the operator preview. */
export const SAMPLE_LYRICS: LyricLine[] = [
  { time: 0.0, text: 'Great is Thy faithfulness' },
  { time: 3.2, text: 'O God my Father' },
  { time: 6.0, text: 'There is no shadow of turning with Thee' },
];

/** Render one look at a given state onto any canvas (thumbnails, previews, the layer source). */
export function renderLyricFrame(
  ctx: CanvasRenderingContext2D, style: LyricStyle, lines: LyricLine[], pos: number, w: number, h: number,
  meta?: { title?: string; artist?: string; bpm?: number; firstBeat?: number },
) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  try { style.draw(ctx, buildFrame(lines, pos, w, h, meta)); } catch { /* a look must never kill the output */ }
  ctx.restore();
}

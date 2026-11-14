// document/theme — the page theme a Writer document carries, and its flourishes as SVG.
//
// A theme is two things: the stylesheet (fonts, sizes, colours — lives in `styles` like any
// other) and the FLOURISHES described here: flat vector art behind and around the text. Page
// flourishes (paper tint, frames, bands, margin rules, marks) depend only on the page; style
// flourishes (a rule under every heading, a bar beside every quote, a mark above a section) are
// drawn from the laid-out lines, so they follow the words wherever they land.
//
// Plain JSON, self-contained: a themed document renders the same in the editor, an embed, a
// shared copy and a saved template without looking anything up. Pure functions, no DOM.

import type { StoryLayout, LaidLine } from '../layout/flow';
import type { TextStory } from '../model';

/** A colour: a palette slot or a literal css colour. */
export type ThemeColor = 'paper' | 'ink' | 'muted' | 'accent' | 'accent2' | (string & {});
export interface ThemePalette { paper: string; ink: string; muted: string; accent: string; accent2: string }

export type RuleKind = 'hair' | 'solid' | 'thick-thin' | 'thin-thick' | 'double' | 'dashed' | 'dotted';
export type MarkKind = 'fleuron' | 'diamond' | 'circle' | 'ring' | 'cross' | 'star' | 'asterism' | 'square' | 'bar' | 'slash' | 'sun' | 'wave';

/** A rule drawn against a paragraph (above its first line or below its last). */
export interface ParagraphRule {
  kind: RuleKind;
  /** pt. */
  weight: number;
  color: ThemeColor;
  /** 'measure' = full column width, 'text' = as wide as the line, or a width in inches. */
  width: 'measure' | 'text' | number;
  align?: 'left' | 'center';
  /** Distance from the text, pt. */
  gap?: number;
}

/** Flourishes tied to where a paragraph of a given style lands on the page. */
export interface StyleFlourish {
  above?: ParagraphRule;
  below?: ParagraphRule;
  /** A bar down the side of the paragraph (quotes, callouts). Weight and gap in pt. */
  bar?: { side: 'left' | 'both'; weight: number; color: ThemeColor; gap?: number };
  /** A mark centred above the paragraph (section openers). Size and gap in pt. */
  markAbove?: { kind: MarkKind; size: number; color: ThemeColor; gap?: number };
  /** A small tab hung in the margin beside the paragraph's first line. pt. */
  tab?: { width: number; height: number; color: ThemeColor };
}

/** Flat vector art behind and around the text. Lengths in inches, weights in pt. */
export interface PageFlourish {
  frame?: { kind: 'single' | 'double' | 'thick-thin' | 'inset' | 'brackets'; inset: number; weight: number; color: ThemeColor; radius?: number };
  corners?: { kind: MarkKind | 'quarter' | 'notch'; size: number; color: ThemeColor; inset: number };
  headBand?: { height: number; color: ThemeColor; rule?: { weight: number; color: ThemeColor } };
  footBand?: { height: number; color: ThemeColor };
  sideBand?: { side: 'left' | 'right'; width: number; color: ThemeColor; inset?: number; rule?: { weight: number; color: ThemeColor } };
  /** Rules across the measure in the head / foot margin. `at` = inches from the page edge. */
  headRule?: { kind: RuleKind; weight: number; color: ThemeColor; at: number };
  footRule?: { kind: RuleKind; weight: number; color: ThemeColor; at: number };
  /** A single mark in a margin. Size in pt, `offset` = inches from the page edge. */
  mark?: { kind: MarkKind; size: number; color: ThemeColor; at: 'head' | 'foot' | 'head-left' | 'head-right' | 'foot-left' | 'foot-right'; offset: number };
  /** Ruled lines or a dot grid across the text area, very light (notebook, ledger). `step` in pt. */
  ground?: { kind: 'lines' | 'dots' | 'grid'; step: number; color: ThemeColor; opacity: number };
  /** The text stays clear of the flourishes: margins never go below these (inches). */
  minMargins?: { top?: number; right?: number; bottom?: number; left?: number };
}

/** What a themed Writer document carries. `styles` is keyed by paragraph style id. */
export interface WriterTheme {
  id: string;
  name: string;
  palette: ThemePalette;
  page: PageFlourish;
  styles: Record<string, StyleFlourish>;
}

const IN = 96;
const PT = 96 / 72;
const f2 = (v: number) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
const esc = (s: string) => s.replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
const SLOTS = new Set(['paper', 'ink', 'muted', 'accent', 'accent2']);
/** Only palette slots and plain colour literals reach the markup (themes travel in shared documents). */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;

export function themeColor(p: ThemePalette, c: ThemeColor | undefined, fallback = '#000000'): string {
  if (!c) return fallback;
  const v = SLOTS.has(c) ? p[c as keyof ThemePalette] : c;
  return typeof v === 'string' && SAFE_COLOR.test(v.trim()) ? v.trim() : fallback;
}

export interface PageBox { width: number; height: number; /** The text area. */ content: { x: number; y: number; width: number; height: number } }

function line(x1: number, y1: number, x2: number, y2: number, w: number, color: string, dash?: string): string {
  return `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${esc(color)}" stroke-width="${f2(w)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

/** A horizontal rule whose TOP edge sits at `y`. Returns the markup and the height it occupies. */
export function ruleSvg(kind: RuleKind, x1: number, x2: number, y: number, weightPt: number, color: string): { svg: string; height: number } {
  const w = Math.max(0.35, weightPt * PT);
  const thin = Math.max(0.5, w / 3.2);
  switch (kind) {
    case 'thick-thin': return { svg: line(x1, y + w / 2, x2, y + w / 2, w, color) + line(x1, y + w + thin * 2.2, x2, y + w + thin * 2.2, thin, color), height: w + thin * 2.7 };
    case 'thin-thick': return { svg: line(x1, y + thin / 2, x2, y + thin / 2, thin, color) + line(x1, y + thin * 2.7 + w / 2, x2, y + thin * 2.7 + w / 2, w, color), height: w + thin * 2.7 };
    case 'double': return { svg: line(x1, y + w / 2, x2, y + w / 2, w, color) + line(x1, y + w * 2.9, x2, y + w * 2.9, w, color), height: w * 3.4 };
    case 'dashed': return { svg: line(x1, y + w / 2, x2, y + w / 2, w, color, `${f2(w * 5)} ${f2(w * 3)}`), height: w };
    case 'dotted': return { svg: `<line x1="${f2(x1)}" y1="${f2(y + w / 2)}" x2="${f2(x2)}" y2="${f2(y + w / 2)}" stroke="${esc(color)}" stroke-width="${f2(w)}" stroke-linecap="round" stroke-dasharray="0 ${f2(w * 3)}"/>`, height: w };
    case 'hair': return { svg: line(x1, y + 0.3, x2, y + 0.3, Math.min(w, 0.6), color), height: 0.6 };
    default: return { svg: line(x1, y + w / 2, x2, y + w / 2, w, color), height: w };
  }
}

/** A mark centred on (cx, cy), `s` px across. */
export function markSvg(kind: MarkKind, cx: number, cy: number, s: number, color: string): string {
  const c = esc(color), h = s / 2;
  const P = (d: string, extra = '') => `<path d="${d}" fill="${c}"${extra}/>`;
  switch (kind) {
    case 'diamond': return P(`M${f2(cx)} ${f2(cy - h)}L${f2(cx + h)} ${f2(cy)}L${f2(cx)} ${f2(cy + h)}L${f2(cx - h)} ${f2(cy)}Z`);
    case 'square': return `<rect x="${f2(cx - h)}" y="${f2(cy - h)}" width="${f2(s)}" height="${f2(s)}" fill="${c}"/>`;
    case 'circle': return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(h)}" fill="${c}"/>`;
    case 'ring': return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(h * 0.86)}" fill="none" stroke="${c}" stroke-width="${f2(Math.max(0.6, s * 0.12))}"/>`;
    case 'bar': return `<rect x="${f2(cx - s)}" y="${f2(cy - s * 0.11)}" width="${f2(s * 2)}" height="${f2(s * 0.22)}" fill="${c}"/>`;
    case 'slash': return `<line x1="${f2(cx - h * 0.6)}" y1="${f2(cy + h)}" x2="${f2(cx + h * 0.6)}" y2="${f2(cy - h)}" stroke="${c}" stroke-width="${f2(Math.max(0.8, s * 0.14))}"/>`;
    case 'cross': {
      const t = s * 0.16;
      return `<rect x="${f2(cx - t / 2)}" y="${f2(cy - h)}" width="${f2(t)}" height="${f2(s)}" fill="${c}"/><rect x="${f2(cx - s * 0.3)}" y="${f2(cy - h * 0.42)}" width="${f2(s * 0.6)}" height="${f2(t)}" fill="${c}"/>`;
    }
    case 'star': {
      let d = '';
      for (let i = 0; i < 10; i++) { const r = i % 2 ? h * 0.42 : h, a = -Math.PI / 2 + i * Math.PI / 5; d += `${i ? 'L' : 'M'}${f2(cx + r * Math.cos(a))} ${f2(cy + r * Math.sin(a))}`; }
      return P(d + 'Z');
    }
    case 'asterism': {
      const r = s * 0.13, k = s * 0.3;
      return `<circle cx="${f2(cx)}" cy="${f2(cy - k)}" r="${f2(r)}" fill="${c}"/><circle cx="${f2(cx - k * 1.1)}" cy="${f2(cy + k * 0.7)}" r="${f2(r)}" fill="${c}"/><circle cx="${f2(cx + k * 1.1)}" cy="${f2(cy + k * 0.7)}" r="${f2(r)}" fill="${c}"/>`;
    }
    case 'sun': {
      let d = '';
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; d += `M${f2(cx + h * 0.56 * Math.cos(a))} ${f2(cy + h * 0.56 * Math.sin(a))}L${f2(cx + h * Math.cos(a))} ${f2(cy + h * Math.sin(a))}`; }
      return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(h * 0.34)}" fill="${c}"/><path d="${d}" stroke="${c}" stroke-width="${f2(Math.max(0.6, s * 0.07))}" fill="none"/>`;
    }
    case 'wave': {
      const q = s / 2;
      return `<path d="M${f2(cx - s)} ${f2(cy)}q${f2(q / 2)} ${f2(-h * 0.7)} ${f2(q)} 0t${f2(q)} 0t${f2(q)} 0t${f2(q)} 0" fill="none" stroke="${c}" stroke-width="${f2(Math.max(0.7, s * 0.1))}" stroke-linecap="round"/>`;
    }
    default: {
      // Fleuron: two leaves either side of a bud.
      const leaf = (dir: number) => `M${f2(cx + dir * s * 0.12)} ${f2(cy)}C${f2(cx + dir * s * 0.4)} ${f2(cy - h * 0.95)} ${f2(cx + dir * s * 0.9)} ${f2(cy - h * 0.5)} ${f2(cx + dir * s * 1.05)} ${f2(cy)}C${f2(cx + dir * s * 0.9)} ${f2(cy + h * 0.5)} ${f2(cx + dir * s * 0.4)} ${f2(cy + h * 0.95)} ${f2(cx + dir * s * 0.12)} ${f2(cy)}Z`;
      return P(leaf(1) + leaf(-1)) + `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(s * 0.09)}" fill="${c}"/>`;
    }
  }
}

/** Margins after the theme's minimums (px). */
export function themedMargins(theme: WriterTheme | undefined, m: { top: number; right: number; bottom: number; left: number }): { top: number; right: number; bottom: number; left: number } {
  const min = theme?.page.minMargins;
  if (!min) return m;
  return { top: Math.max(m.top, (min.top ?? 0) * IN), right: Math.max(m.right, (min.right ?? 0) * IN), bottom: Math.max(m.bottom, (min.bottom ?? 0) * IN), left: Math.max(m.left, (min.left ?? 0) * IN) };
}

/** Everything drawn on the page regardless of the words: paper, ground, bands, frame, corners, margin rules, mark. */
export function pageFlourishSvg(theme: WriterTheme, box: PageBox): string {
  const { width: W, height: H, content: C } = box;
  const p = theme.palette, pg = theme.page;
  const col = (c: ThemeColor | undefined) => themeColor(p, c, p.ink);
  const out: string[] = [`<rect x="0" y="0" width="${f2(W)}" height="${f2(H)}" fill="${esc(themeColor(p, 'paper', '#ffffff'))}"/>`];

  if (pg.ground) {
    const g = pg.ground, step = Math.max(6, g.step * PT), c = col(g.color);
    let d = '';
    if (g.kind === 'dots') {
      let dots = '';
      for (let y = C.y + step; y <= C.y + C.height; y += step) for (let x = C.x; x <= C.x + C.width; x += step) dots += `<circle cx="${f2(x)}" cy="${f2(y)}" r="0.7"/>`;
      out.push(`<g fill="${esc(c)}" opacity="${f2(g.opacity)}">${dots}</g>`);
    } else {
      for (let y = C.y + step; y <= C.y + C.height; y += step) d += `M${f2(C.x)} ${f2(y)}H${f2(C.x + C.width)}`;
      if (g.kind === 'grid') for (let x = C.x; x <= C.x + C.width + 0.5; x += step) d += `M${f2(x)} ${f2(C.y)}V${f2(C.y + C.height)}`;
      out.push(`<path d="${d}" fill="none" stroke="${esc(c)}" stroke-width="0.5" opacity="${f2(g.opacity)}"/>`);
    }
  }
  if (pg.headBand) {
    const h = pg.headBand.height * IN;
    out.push(`<rect x="0" y="0" width="${f2(W)}" height="${f2(h)}" fill="${esc(col(pg.headBand.color))}"/>`);
    if (pg.headBand.rule) out.push(ruleSvg('solid', 0, W, h + 3, pg.headBand.rule.weight, col(pg.headBand.rule.color)).svg);
  }
  if (pg.footBand) { const h = pg.footBand.height * IN; out.push(`<rect x="0" y="${f2(H - h)}" width="${f2(W)}" height="${f2(h)}" fill="${esc(col(pg.footBand.color))}"/>`); }
  if (pg.sideBand) {
    const s = pg.sideBand, w = s.width * IN, ins = (s.inset ?? 0) * IN;
    const x = s.side === 'left' ? ins : W - ins - w;
    out.push(`<rect x="${f2(x)}" y="0" width="${f2(w)}" height="${f2(H)}" fill="${esc(col(s.color))}"/>`);
    if (s.rule) { const rx = s.side === 'left' ? x + w + 4 : x - 4; out.push(line(rx, 0, rx, H, Math.max(0.4, s.rule.weight * PT), col(s.rule.color))); }
  }
  if (pg.frame) {
    const fr = pg.frame, i = fr.inset * IN, w = Math.max(0.4, fr.weight * PT), c = col(fr.color), r = (fr.radius ?? 0) * IN;
    const rect = (ins: number, sw: number) => `<rect x="${f2(ins)}" y="${f2(ins)}" width="${f2(W - ins * 2)}" height="${f2(H - ins * 2)}"${r ? ` rx="${f2(Math.max(0, r - (ins - i)))}"` : ''} fill="none" stroke="${esc(c)}" stroke-width="${f2(sw)}"/>`;
    if (fr.kind === 'brackets') {
      const L = 0.55 * IN;
      const corner = (x: number, y: number, dx: number, dy: number) => `M${f2(x + dx * L)} ${f2(y)}H${f2(x)}V${f2(y + dy * L)}`;
      out.push(`<path d="${corner(i, i, 1, 1)}${corner(W - i, i, -1, 1)}${corner(i, H - i, 1, -1)}${corner(W - i, H - i, -1, -1)}" fill="none" stroke="${esc(c)}" stroke-width="${f2(w)}"/>`);
    } else {
      out.push(rect(i, w));
      if (fr.kind === 'double') out.push(rect(i + w * 3, w));
      if (fr.kind === 'thick-thin') out.push(rect(i + w * 1.9, Math.max(0.5, w / 3.2)));
      if (fr.kind === 'inset') out.push(rect(i + 0.07 * IN, Math.max(0.4, w / 2.5)));
    }
  }
  if (pg.corners) {
    const k = pg.corners, i = k.inset * IN, s = k.size * PT, c = col(k.color);
    const pts: [number, number, number, number][] = [[i, i, 1, 1], [W - i, i, -1, 1], [i, H - i, 1, -1], [W - i, H - i, -1, -1]];
    for (const [x, y, dx, dy] of pts) {
      if (k.kind === 'quarter') out.push(`<path d="M${f2(x + dx * s)} ${f2(y)}A${f2(s)} ${f2(s)} 0 0 ${dx * dy > 0 ? 0 : 1} ${f2(x)} ${f2(y + dy * s)}" fill="none" stroke="${esc(c)}" stroke-width="${f2(Math.max(0.6, s * 0.06))}"/>`);
      else if (k.kind === 'notch') out.push(`<path d="M${f2(x + dx * s)} ${f2(y)}H${f2(x)}V${f2(y + dy * s)}" fill="none" stroke="${esc(c)}" stroke-width="${f2(Math.max(0.8, s * 0.09))}"/>`);
      else out.push(markSvg(k.kind, x, y, s, c));
    }
  }
  if (pg.headRule) out.push(ruleSvg(pg.headRule.kind, C.x, C.x + C.width, pg.headRule.at * IN, pg.headRule.weight, col(pg.headRule.color)).svg);
  if (pg.footRule) out.push(ruleSvg(pg.footRule.kind, C.x, C.x + C.width, H - pg.footRule.at * IN, pg.footRule.weight, col(pg.footRule.color)).svg);
  if (pg.mark) {
    const m = pg.mark, s = m.size * PT;
    const cy = m.at.startsWith('head') ? m.offset * IN : H - m.offset * IN;
    const cx = m.at.endsWith('left') ? C.x + s : m.at.endsWith('right') ? C.x + C.width - s : W / 2;
    out.push(markSvg(m.kind, cx, cy, s, col(m.color)));
  }
  return out.join('');
}

/** Flourishes that follow the words: drawn from the laid-out lines of each styled paragraph. */
export function styleFlourishSvg(theme: WriterTheme, layout: StoryLayout, story: TextStory, defaultStyle = 'body'): string {
  const keys = Object.keys(theme.styles);
  if (!keys.length) return '';
  const p = theme.palette;
  const col = (c: ThemeColor | undefined) => themeColor(p, c, p.ink);
  const styleOf = new Map(story.paragraphs.map(q => [q.id, q.styleId ?? defaultStyle]));
  const out: string[] = [];
  const span = (r: ParagraphRule, l: LaidLine): [number, number] => {
    if (r.width === 'measure') return [l.x, l.x + l.width];
    if (r.width === 'text') return [l.inkX, l.inkX + Math.max(l.inkWidth, 12)];
    const w = Math.min(l.width, r.width * IN);
    const x = r.align === 'center' ? l.x + (l.width - w) / 2 : l.x;
    return [x, x + w];
  };
  for (const para of layout.paragraphs) {
    const fl = theme.styles[styleOf.get(para.id) ?? defaultStyle];
    if (!fl || !para.lineCount) continue;
    const lines = layout.lines.slice(para.firstLine, para.firstLine + para.lineCount);
    const first = lines[0], last = lines[lines.length - 1];
    // Display faces carry tall ascenders and deep descenders in their metrics; rules sit by the letters.
    const up = (l: LaidLine) => Math.min(l.ascent, (l.runs[0]?.size ?? l.ascent) * 0.8);
    const down = (l: LaidLine) => Math.min(l.descent, (l.runs[0]?.size ?? l.descent * 4) * 0.22);
    if (fl.above) {
      const [x1, x2] = span(fl.above, first);
      const gap = (fl.above.gap ?? 4) * PT;
      const probe = ruleSvg(fl.above.kind, x1, x2, 0, fl.above.weight, '#000');
      out.push(ruleSvg(fl.above.kind, x1, x2, first.baseline - up(first) - gap - probe.height, fl.above.weight, col(fl.above.color)).svg);
    }
    if (fl.below) {
      const [x1, x2] = span(fl.below, last);
      out.push(ruleSvg(fl.below.kind, x1, x2, last.baseline + down(last) + (fl.below.gap ?? 4) * PT, fl.below.weight, col(fl.below.color)).svg);
    }
    if (fl.markAbove) {
      const s = fl.markAbove.size * PT;
      out.push(markSvg(fl.markAbove.kind, first.x + first.width / 2, first.baseline - up(first) - (fl.markAbove.gap ?? 8) * PT - s / 2, s, col(fl.markAbove.color)));
    }
    if (fl.tab) {
      const w = fl.tab.width * PT, h = fl.tab.height * PT;
      out.push(`<rect x="${f2(first.x - w - 7 * PT)}" y="${f2(first.baseline - h)}" width="${f2(w)}" height="${f2(h)}" fill="${esc(col(fl.tab.color))}"/>`);
    }
    if (fl.bar) {
      const w = Math.max(0.5, fl.bar.weight * PT), gap = (fl.bar.gap ?? 9) * PT, c = col(fl.bar.color);
      // One bar per run of lines in the same column.
      let a = 0;
      for (let i = 1; i <= lines.length; i++) {
        if (i < lines.length && lines[i].frameIndex === lines[a].frameIndex && lines[i].column === lines[a].column) continue;
        const top = lines[a].baseline - up(lines[a]), bottom = lines[i - 1].baseline + down(lines[i - 1]);
        const xs = lines.slice(a, i);
        const left = Math.min(...xs.map(l => l.x)) - gap - w / 2;
        out.push(line(left, top, left, bottom, w, c));
        if (fl.bar.side === 'both') { const right = Math.max(...xs.map(l => l.x + l.width)) + gap + w / 2; out.push(line(right, top, right, bottom, w, c)); }
        a = i;
      }
    }
  }
  return out.join('');
}

/** A theme read from stored JSON: unknown shapes are dropped rather than trusted. */
export function readTheme(v: unknown): WriterTheme | undefined {
  const t = v as WriterTheme | undefined;
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.palette || typeof t.palette !== 'object' || !t.page || typeof t.page !== 'object') return undefined;
  return { ...t, styles: t.styles && typeof t.styles === 'object' ? t.styles : {} };
}

// emoteRig — the light plot every vector emote is drawn under.
//
// The lighting designer's rule for the library: one rig, every emote. That is what makes 130 emotes
// from six different art directions read as one family on a busy stream.
//
//   KEY     warm white from the top-left (≈ 10 o'clock, 45° up). Paints the gradient and the
//           specular hot-spot. Never pure white: #FFF4E0.
//   RIM     a coloured edge light from the lower-right — the emote's own rim gel (magenta by
//           default, cyan on warm subjects). It separates the emote from any video behind it.
//   BOUNCE  a soft lift of the gel colour under the chin, as if the floor is lit by the emote.
//   SHADOW  a soft contact shadow, low and wide. Emotes sit ON the stream, they don't float in a void.
//   GLOW    an optional halo in the gel for things that emit light (fire, neon, stars).
//
// Every emote lives in a 0..128 square with ≈ 8 px of safe margin. All helpers return SVG markup
// strings; `Svg` collects defs + body and serialises a standalone document (rendered as a data URL,
// so ids only need to be unique inside one emote).

export const VB = 128;
export const KEY_LIGHT = '#FFF4E0';
export const RIM_MAGENTA = '#FF3D8B';
export const RIM_CYAN = '#3FE6FF';
export const INK = '#2A1430';

// ── colour ───────────────────────────────────────────────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l * 100];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** Lighten (+) or darken (−) by lightness points, with a small hue shift toward warm when lightening
 *  and cool when darkening — how real light behaves, and why the rig never looks flat. */
export function shade(hex: string, amt: number): string {
  const [h, s, l] = hexToHsl(hex);
  const warm = 45;
  const dh = amt > 0 ? shortHue(h, warm) * Math.min(1, amt / 60) * 0.25 : shortHue(h, 255) * Math.min(1, -amt / 60) * 0.18;
  return hslToHex((h + dh + 360) % 360, Math.min(100, s + (amt < 0 ? 6 : -4)), Math.max(0, Math.min(100, l + amt)));
}
function shortHue(from: number, to: number) { return ((to - from + 540) % 360) - 180; }
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── document builder ─────────────────────────────────────────────────────────────────────────────
export class Svg {
  private defs: string[] = [];
  private body: string[] = [];
  private n = 0;
  uid(p = 'g') { return `${p}${(this.n++).toString(36)}`; }
  def(markup: string) { this.defs.push(markup); return this; }
  add(markup: string) { this.body.push(markup); return this; }
  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}">`
      + (this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '')
      + this.body.join('') + '</svg>';
  }

  // ── filters ──
  /** Soft halo in a colour. Returns `filter="url(#…)"`. */
  glowFilter(color: string, std = 4, strength = 1): string {
    const id = this.uid('gl');
    this.def(`<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">`
      + `<feGaussianBlur in="SourceAlpha" stdDeviation="${std}" result="b"/>`
      + `<feFlood flood-color="${color}" flood-opacity="${Math.min(1, 0.9 * strength)}"/><feComposite in2="b" operator="in" result="g"/>`
      + `<feMerge><feMergeNode in="g"/>${strength > 1 ? '<feMergeNode in="g"/>' : ''}<feMergeNode in="SourceGraphic"/></feMerge></filter>`);
    return `filter="url(#${id})"`;
  }
  /** Drop shadow cast by the key light (down-right, soft). */
  shadowFilter(dy = 3, std = 2.4, opacity = 0.35): string {
    const id = this.uid('sh');
    this.def(`<filter id="${id}" x="-30%" y="-30%" width="160%" height="170%">`
      + `<feDropShadow dx="${dy * 0.35}" dy="${dy}" stdDeviation="${std}" flood-color="#14061e" flood-opacity="${opacity}"/></filter>`);
    return `filter="url(#${id})"`;
  }
  blurFilter(std: number): string {
    const id = this.uid('bl');
    this.def(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${std}"/></filter>`);
    return `filter="url(#${id})"`;
  }

  // ── gradients ──
  /** Key-lit fill: highlight at the top-left, base in the middle, core shadow at the lower-right. */
  keyGradient(base: string, o: { hi?: number; lo?: number; angle?: 'diag' | 'vert' } = {}): string {
    const id = this.uid('kg');
    const [x1, y1, x2, y2] = o.angle === 'vert' ? [0, 0, 0, 1] : [0.15, 0.05, 0.85, 0.95];
    this.def(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`
      + `<stop offset="0" stop-color="${shade(base, o.hi ?? 16)}"/><stop offset="0.48" stop-color="${base}"/>`
      + `<stop offset="1" stop-color="${shade(base, -(o.lo ?? 18))}"/></linearGradient>`);
    return `url(#${id})`;
  }
  /** Spherical key light: radial with the hot side offset to the top-left. */
  sphereGradient(base: string, o: { hi?: number; lo?: number } = {}): string {
    const id = this.uid('sg');
    this.def(`<radialGradient id="${id}" cx="0.38" cy="0.32" r="0.78" fx="0.32" fy="0.24">`
      + `<stop offset="0" stop-color="${shade(base, o.hi ?? 18)}"/><stop offset="0.55" stop-color="${base}"/>`
      + `<stop offset="1" stop-color="${shade(base, -(o.lo ?? 20))}"/></radialGradient>`);
    return `url(#${id})`;
  }
  /** Rim light: a gradient stroke that only shows on the lower-right edge. */
  rimGradient(rim: string, strength = 0.95): string {
    const id = this.uid('rg');
    this.def(`<linearGradient id="${id}" x1="0.1" y1="0.1" x2="0.9" y2="0.95">`
      + `<stop offset="0.45" stop-color="${rim}" stop-opacity="0"/><stop offset="0.78" stop-color="${rim}" stop-opacity="${strength * 0.55}"/>`
      + `<stop offset="1" stop-color="${rim}" stop-opacity="${strength}"/></linearGradient>`);
    return `url(#${id})`;
  }
  linear(stops: [number, string, number?][], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
    const id = this.uid('lg');
    this.def(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`
      + stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>');
    return `url(#${id})`;
  }
  radial(stops: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5): string {
    const id = this.uid('rd');
    this.def(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">`
      + stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>');
    return `url(#${id})`;
  }
  clip(markup: string): string {
    const id = this.uid('cp');
    this.def(`<clipPath id="${id}">${markup}</clipPath>`);
    return `clip-path="url(#${id})"`;
  }

  // ── lit primitives ──
  /** Contact shadow on the floor under a subject centred at cx, resting at y. */
  contactShadow(cx = 64, y = 118, w = 40, opacity = 0.28) {
    const f = this.blurFilter(2.6);
    return this.add(`<ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${w * 0.16}" fill="#14061e" opacity="${opacity}" ${f}/>`);
  }

  /** A sphere under the full rig: key gradient, bounce, rim, specular. The face emotes' base. */
  litSphere(cx: number, cy: number, r: number, base: string, rim = RIM_MAGENTA, o: { bounce?: string; spec?: number } = {}) {
    this.contactShadow(cx, cy + r + 6, r * 0.78);
    const fill = this.sphereGradient(base);
    this.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`);
    // bounce light from below (gel-coloured floor)
    const bounce = this.radial([[0, o.bounce ?? shade(base, 10), 0.55], [1, base, 0]], 0.5, 1.05, 0.55);
    this.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bounce}"/>`);
    // rim light
    this.add(`<circle cx="${cx}" cy="${cy}" r="${r - 1.4}" fill="none" stroke="${this.rimGradient(rim)}" stroke-width="3.2"/>`);
    // specular hot-spot from the key
    const sp = this.radial([[0, KEY_LIGHT, o.spec ?? 0.95], [0.6, KEY_LIGHT, 0.25], [1, KEY_LIGHT, 0]]);
    this.add(`<ellipse cx="${cx - r * 0.38}" cy="${cy - r * 0.46}" rx="${r * 0.34}" ry="${r * 0.22}" fill="${sp}" transform="rotate(-32 ${cx - r * 0.38} ${cy - r * 0.46})"/>`);
    return this;
  }

  /**
   * Any closed path under the rig: drop shadow, key gradient, inner top-left highlight, rim stroke,
   * and an optional glow (for things that emit light).
   */
  litPath(d: string, base: string, o: { rim?: string; glow?: string; glowStd?: number; stroke?: string; strokeW?: number; hi?: number; lo?: number; highlight?: number; transform?: string; noShadow?: boolean } = {}) {
    const tf = o.transform ? ` transform="${o.transform}"` : '';
    const fill = this.keyGradient(base, { hi: o.hi, lo: o.lo });
    const shadow = o.noShadow ? '' : this.shadowFilter();
    const glow = o.glow ? this.glowFilter(o.glow, o.glowStd ?? 4) : '';
    this.add(`<g${tf} ${glow}><path d="${d}" fill="${fill}" ${shadow}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.strokeW ?? 2}" stroke-linejoin="round"` : ''}/>`);
    // inner highlight: the same shape, clipped, offset toward the key and blurred
    const clip = this.clip(`<path d="${d}"/>`);
    const hb = this.blurFilter(2.2);
    this.add(`<g ${clip}><path d="${d}" fill="none" stroke="${KEY_LIGHT}" stroke-opacity="${o.highlight ?? 0.55}" stroke-width="5" transform="translate(2.2 2.6)" ${hb}/></g>`);
    this.add(`<path d="${d}" fill="none" stroke="${this.rimGradient(o.rim ?? RIM_MAGENTA)}" stroke-width="2.4" stroke-linejoin="round"/></g>`);
    return this;
  }

  /** A small four-point star glint (catch-light) — the LD's sparkle. */
  glint(x: number, y: number, s = 6, color = KEY_LIGHT, op = 1) {
    return this.add(`<path d="M ${x} ${y - s} Q ${x + s * 0.16} ${y - s * 0.16} ${x + s} ${y} Q ${x + s * 0.16} ${y + s * 0.16} ${x} ${y + s} Q ${x - s * 0.16} ${y + s * 0.16} ${x - s} ${y} Q ${x - s * 0.16} ${y - s * 0.16} ${x} ${y - s} Z" fill="${color}" opacity="${op}"/>`);
  }

  /** Bold display type under the rig (stroke outline + key gradient + rim). System fonts only —
   *  SVG rendered as an image can't load web fonts. */
  litText(text: string, o: { x?: number; y?: number; size?: number; base: string; rim?: string; outline?: string; italic?: boolean; family?: string; weight?: number; spacing?: number; glow?: string; rotate?: number; outlineW?: number }) {
    const x = o.x ?? 64, y = o.y ?? 78, size = o.size ?? 52;
    const fam = o.family ?? "'Arial Black','Segoe UI Black','Helvetica Neue',Impact,sans-serif";
    const style = `font-family:${fam};font-weight:${o.weight ?? 900};font-size:${size}px;${o.italic ? 'font-style:italic;' : ''}letter-spacing:${o.spacing ?? -1}px`;
    const tf = o.rotate ? ` transform="rotate(${o.rotate} ${x} ${y})"` : '';
    const fill = this.keyGradient(o.base, { angle: 'vert', hi: 20, lo: 16 });
    const shadow = this.shadowFilter(3, 1.8, 0.45);
    const glow = o.glow ? this.glowFilter(o.glow, 5) : '';
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.add(`<g${tf} ${glow}>`
      + `<text x="${x}" y="${y}" text-anchor="middle" style="${style}" fill="none" stroke="${o.outline ?? INK}" stroke-width="${o.outlineW ?? 9}" stroke-linejoin="round" ${shadow}>${esc}</text>`
      + `<text x="${x}" y="${y}" text-anchor="middle" style="${style}" fill="${fill}">${esc}</text>`
      + `<text x="${x}" y="${y}" text-anchor="middle" style="${style}" fill="none" stroke="${this.rimGradient(o.rim ?? RIM_MAGENTA, 0.8)}" stroke-width="1.6">${esc}</text>`
      + `</g>`);
    return this;
  }
}

/** Convenience: build an emote document in one expression. */
export function svgEmote(draw: (s: Svg) => void): () => string {
  let cached: string | null = null;
  return () => {
    if (cached) return cached;
    const s = new Svg();
    draw(s);
    return (cached = s.toString());
  };
}

// ── shared shapes (paths in emote space) ─────────────────────────────────────────────────────────
export function heartPath(cx: number, cy: number, w: number): string {
  const s = w / 100;
  const P = (x: number, y: number) => `${(cx + x * s).toFixed(1)} ${(cy + y * s).toFixed(1)}`;
  return `M ${P(0, 38)} C ${P(-12, 28)} ${P(-50, 4)} ${P(-50, -18)} C ${P(-50, -38)} ${P(-34, -48)} ${P(-21, -48)} `
    + `C ${P(-10, -48)} ${P(-3, -42)} ${P(0, -33)} C ${P(3, -42)} ${P(10, -48)} ${P(21, -48)} `
    + `C ${P(34, -48)} ${P(50, -38)} ${P(50, -18)} C ${P(50, 4)} ${P(12, 28)} ${P(0, 38)} Z`;
}
export function starPath(cx: number, cy: number, R: number, r = R * 0.45, points = 5, rot = -90): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot + (i * 180) / points) * Math.PI) / 180, rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'} ${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return d + 'Z';
}
/** Rounded star (softer, friendlier — used for sparkle eyes). */
export function softStarPath(cx: number, cy: number, R: number, r = R * 0.5): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180, rr = i % 2 ? r : R;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)} ` : `L ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d + 'Z';
}
export function polyPath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
}

// Print-on-demand cut-and-sew hand-off: the user's own pattern + the user's own artwork become one
// print-ready panel per cut piece, the way all-over-print (AOP) factories take them: a PNG per panel
// at the provider's print resolution in sRGB, transparent outside the print area, the print running
// past the cutting line by the bleed, the panel turned so the grain runs up the file. Guides (bleed,
// cutting line, seam line, safe zone, grain, notches, labels) go in a separate proof file, never in
// the print file. A manifest lists every panel for the provider's intake.
//
// No credentials and no money pass through Plajah: the user uploads the files in the provider's own
// dashboard (or connects the provider through its own sign-in) and pays the provider directly.
// Pure functions (SVG + JSON strings); the room rasterises the SVGs to PNG in the browser.

import { type Pt, offset, bbox, area, ccw } from './geometry';
import { type Pattern, type Piece, unfold, cutLine } from './patterns';

export type PodProviderId = 'printful' | 'printify' | 'gooten';
export interface PodProfile {
  id: PodProviderId; name: string;
  /** Print resolution for the panel files. */
  dpi: number;
  /** How far the print runs past the cutting line (mm). */
  bleedMm: number;
  /** Keep text, faces and logos this far inside the seam line (mm). */
  safeMm: number;
  /** Longest side a single file may have (px). */
  maxPx: number;
  url: string; notes: string[];
}

/**
 * Our starting settings per provider. Providers change their AOP templates and limits; the room shows
 * these as editable defaults and tells the user to check the provider's current product template.
 */
export const POD_PROFILES: Record<PodProviderId, PodProfile> = {
  printful: { id: 'printful', name: 'Printful', dpi: 150, bleedMm: 10, safeMm: 15, maxPx: 12000, url: 'https://www.printful.com/custom/all-over-print', notes: ['All-over-print cut-and-sew: one PNG per panel, sRGB, transparent outside the print.', 'Match each panel to the product template\'s panel of the same name; custom shapes go through Printful\'s custom/warehousing programme.'] },
  printify: { id: 'printify', name: 'Printify', dpi: 150, bleedMm: 10, safeMm: 15, maxPx: 12000, url: 'https://printify.com/', notes: ['AOP products take one file per print area; the print partner you pick sets the exact canvas size.', 'Upload the panel PNGs in the product creator, one per print area.'] },
  gooten: { id: 'gooten', name: 'Gooten', dpi: 150, bleedMm: 10, safeMm: 15, maxPx: 12000, url: 'https://www.gooten.com/', notes: ['Panel files per print area, PNG, sRGB.', 'Use the product\'s template for exact pixel sizes; our panels carry their size in millimetres so they can be scaled to it.'] },
};

/** Artwork the user owns: an image (data URL or same-origin URL) with its pixel size. */
export interface PodImage { href: string; px: [number, number] }
export type PodArt =
  /** One picture tiled across every panel at `tileMm` wide (prints line up across seams on the flat). */
  | { mode: 'tile'; image: PodImage; tileMm: number }
  /** One picture per piece (by piece id), scaled to cover the panel; pieces without one stay blank. */
  | { mode: 'per-piece'; images: Record<string, PodImage> }
  /** A flat colour. */
  | { mode: 'colour'; colour: string };

export interface PodPanel {
  file: string; pieceId: string; name: string; copy: number; mirrored: boolean; size?: string;
  widthMm: number; heightMm: number; widthPx: number; heightPx: number;
  /** Rotation applied so the grain runs up the file (degrees). */
  rotateDeg: number;
  /** Outlines in the file's frame (mm, y down, origin top-left). */
  bleed: Pt[]; cut: Pt[]; seam: Pt[]; safe: Pt[]; grain: [Pt, Pt]; notches: Array<[Pt, Pt]>;
  printSvg: string; guideSvg: string;
  /** Effective resolution of the artwork on this panel (px per inch); null for a flat colour. */
  artDpi: number | null;
  warnings: string[];
}
export interface PodHandoff { provider: PodProfile; style: string; panels: PodPanel[]; manifest: string; warnings: string[] }

const mmPx = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const d = (r: Pt[]) => `M${r.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Rotate about the origin by a (radians). */
const rot = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

/** Notch ticks: from the seam line straight out across the allowance to the cutting line (and a little past it). */
function notchTicks(piece: Piece): Array<[Pt, Pt]> {
  const r = piece.seam, n = r.length; const al = (i: number) => (typeof piece.allowance === 'number' ? piece.allowance : piece.allowance[(i + n) % n] ?? 0);
  return (piece.notches ?? []).map(q => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; const vx = b[0] - a[0], vy = b[1] - a[1]; const L2 = vx * vx + vy * vy || 1e-9; const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L2)); const dd = Math.hypot(a[0] + vx * t - q[0], a[1] + vy * t - q[1]); if (dd < bd) { bd = dd; bi = i; } }
    const a = r[bi], b = r[(bi + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L; const len = Math.max(3, al(bi)) + 3;
    return [q, [q[0] + nx * len, q[1] + ny * len]] as [Pt, Pt];
  });
}

/**
 * Build every panel. Fold pieces are unfolded and pairs mirrored (each copy is its own panel, since
 * the factory prints and cuts single layers). Artwork is never mirrored, so text reads correctly on
 * both pieces of a pair.
 */
export function podPanels(pattern: Pattern, art: PodArt, provider: PodProfile, o: { style?: string } = {}): PodHandoff {
  const style = o.style ?? pattern.name; const panels: PodPanel[] = []; const warnings: string[] = []; const { dpi, bleedMm, safeMm } = provider;
  for (const p0 of pattern.pieces) {
    const p = unfold(p0); const cut0 = cutLine(p); const ticks0 = notchTicks(p);
    const ga = Math.atan2(p.grain[1][1] - p.grain[0][1], p.grain[1][0] - p.grain[0][0]); const turn = Math.PI / 2 - ga;
    for (let c = 0; c < p.cut; c++) {
      const mir = !!p.pair && c % 2 === 1; const mx = (q: Pt): Pt => (mir ? [-q[0], q[1]] : q);
      // Flat frame: mirror (for the second of a pair), turn grain to +y, then flip y so the file runs top-down.
      const tf = (q: Pt): Pt => rot(mx(q), mir ? -turn : turn);
      const seamR = ccw(p.seam.map(tf)), cutR = ccw(cut0.map(tf)); const bleedR = offset(cutR, bleedMm); const safeR = offset(seamR, -safeMm);
      const b = bbox(bleedR); const W = b.w, H = b.h; const toFile = (q: Pt): Pt => [q[0] - b.x0, b.y1 - q[1]];
      const F = (r: Pt[]) => r.map(toFile);
      const panel = { bleed: F(bleedR), cut: F(cutR), seam: F(seamR), safe: area(safeR) > 0 ? F(safeR) : [], grain: [toFile(tf(p.grain[0])), toFile(tf(p.grain[1]))] as [Pt, Pt], notches: ticks0.map(([u, v]) => [toFile(tf(u)), toFile(tf(v))] as [Pt, Pt]) };
      const wPx = mmPx(W, dpi), hPx = mmPx(H, dpi); const pw: string[] = [];
      if (Math.max(wPx, hPx) > provider.maxPx) pw.push(`${p.name}: ${wPx}×${hPx} px is over ${provider.name}'s ${provider.maxPx} px limit; split the piece or lower the resolution.`);
      // Artwork in the file frame (mm). Tiles start at the grain line's foot so a pair matches.
      let artEl = '', artDpi: number | null = null;
      if (art.mode === 'colour') artEl = `<rect x="0" y="0" width="${W.toFixed(2)}" height="${H.toFixed(2)}" fill="${esc(art.colour)}"/>`;
      else if (art.mode === 'tile') {
        const tw = art.tileMm, th = tw * art.image.px[1] / art.image.px[0]; artDpi = art.image.px[0] / (tw / 25.4);
        artEl = `<defs><pattern id="tile" patternUnits="userSpaceOnUse" x="0" y="0" width="${tw.toFixed(3)}" height="${th.toFixed(3)}"><image href="${esc(art.image.href)}" width="${tw.toFixed(3)}" height="${th.toFixed(3)}" preserveAspectRatio="none"/></pattern></defs><rect x="0" y="0" width="${W.toFixed(2)}" height="${H.toFixed(2)}" fill="url(#tile)"/>`;
      } else {
        const im = art.images[p0.id];
        if (im) { const k = Math.max(W / im.px[0], H / im.px[1]); const iw = im.px[0] * k, ih = im.px[1] * k; artDpi = im.px[0] / (iw / 25.4);
          artEl = `<image href="${esc(im.href)}" x="${((W - iw) / 2).toFixed(2)}" y="${((H - ih) / 2).toFixed(2)}" width="${iw.toFixed(2)}" height="${ih.toFixed(2)}" preserveAspectRatio="none"/>`; }
        else pw.push(`${p.name}: no artwork chosen; it prints blank.`);
      }
      if (artDpi != null && artDpi < dpi * 0.98) pw.push(`${p.name}: the artwork is ${Math.round(artDpi)} ppi at this size, below ${provider.name}'s ${dpi} dpi; it may print soft.`);
      const file = `${slug(style)}_${slug(p0.id)}${p.cut > 1 ? `_${c + 1}` : ''}${pattern.size ? `_${slug(pattern.size)}` : ''}.png`;
      const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">`;
      const printSvg = `${head}<clipPath id="bleed"><path d="${d(panel.bleed)}"/></clipPath><g clip-path="url(#bleed)">${artEl}</g></svg>`;
      const g = panel.grain; const sw = Math.max(0.4, W / 600);
      const guideSvg = `${head}<g fill="none" stroke-width="${sw.toFixed(2)}">`
        + `<path d="${d(panel.bleed)}" stroke="#0ea5e9" stroke-dasharray="${(sw * 6).toFixed(2)} ${(sw * 4).toFixed(2)}"/>`
        + `<path d="${d(panel.cut)}" stroke="#111827" stroke-width="${(sw * 1.6).toFixed(2)}"/>`
        + `<path d="${d(panel.seam)}" stroke="#6b7280" stroke-dasharray="${(sw * 2).toFixed(2)} ${(sw * 2).toFixed(2)}"/>`
        + (panel.safe.length ? `<path d="${d(panel.safe)}" stroke="#16a34a" stroke-dasharray="${(sw * 1).toFixed(2)} ${(sw * 3).toFixed(2)}"/>` : '')
        + `<path d="M${g[0][0].toFixed(2)},${g[0][1].toFixed(2)}L${g[1][0].toFixed(2)},${g[1][1].toFixed(2)}" stroke="#dc2626"/>`
        + panel.notches.map(([u, v]) => `<path d="M${u[0].toFixed(2)},${u[1].toFixed(2)}L${v[0].toFixed(2)},${v[1].toFixed(2)}" stroke="#111827" stroke-width="${(sw * 1.6).toFixed(2)}"/>`).join('')
        + `</g><text x="${(W / 2).toFixed(1)}" y="${(H / 2).toFixed(1)}" font-family="sans-serif" font-size="${Math.max(4, Math.min(W, H) / 18).toFixed(1)}" text-anchor="middle" fill="#111827">${esc(`${p.name}${p.cut > 1 ? ` ${c + 1}/${p.cut}` : ''}${mir ? ' (mirrored)' : ''}${pattern.size ? ` · ${pattern.size}` : ''}`)}</text></svg>`;
      panels.push({ file, pieceId: p0.id, name: p.name, copy: c + 1, mirrored: mir, size: pattern.size, widthMm: W, heightMm: H, widthPx: wPx, heightPx: hPx, rotateDeg: Math.round((mir ? -turn : turn) * 180 / Math.PI * 10) / 10, ...panel, printSvg, guideSvg, artDpi, warnings: pw });
      warnings.push(...pw);
    }
  }
  const manifest = JSON.stringify({
    format: 'plajah-pod-panels/1', provider: provider.id, style, size: pattern.size ?? null, dpi, colour: 'sRGB', fileType: 'image/png', background: 'transparent outside the print area', bleedMm, safeMm,
    payment: `You order and pay ${provider.name} directly. Plajah holds no money and stores no ${provider.name} credentials.`,
    panels: panels.map(q => ({ file: q.file, guide: q.file.replace(/\.png$/, '_guides.svg'), piece: q.pieceId, name: q.name, copy: q.copy, mirrored: q.mirrored, widthMm: +q.widthMm.toFixed(1), heightMm: +q.heightMm.toFixed(1), widthPx: q.widthPx, heightPx: q.heightPx, grainRotationDeg: q.rotateDeg, cutLineMm: q.cut.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]) })),
    notes: provider.notes,
  }, null, 2);
  return { provider, style, panels, manifest, warnings };
}

/** One panel's print SVG as a PNG, in the browser (canvas). The SVG must reference data-URL images so the canvas is not tainted. */
export async function rasterizePanel(panel: PodPanel): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([panel.printSvg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = panel.widthPx; c.height = panel.heightPx; const ctx = c.getContext('2d', { colorSpace: 'srgb' } as CanvasRenderingContext2DSettings)!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

/** Every file for the hand-off, ready to zip: PNGs (rendered by the caller), guide SVGs, the manifest and a read-me. */
export function podFiles(h: PodHandoff, pngs: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const enc = new TextEncoder(); const out: Record<string, Uint8Array> = {};
  for (const q of h.panels) { if (pngs[q.file]) out[q.file] = pngs[q.file]; out[q.file.replace(/\.png$/, '_guides.svg')] = enc.encode(q.guideSvg); }
  out['manifest.json'] = enc.encode(h.manifest);
  out['README.txt'] = enc.encode([`${h.style}: print-ready panels for ${h.provider.name}`, '', `${h.panels.length} panels, PNG, sRGB, ${h.provider.dpi} dpi, ${h.provider.bleedMm} mm bleed past the cutting line, transparent outside.`, 'Each *_guides.svg shows the bleed (blue dashes), cutting line (black), seam line (grey), safe zone (green), grain (red, runs up the file) and notches.', 'Mirrored panels are the second piece of a pair: the shape is mirrored, the artwork is not.', '', ...h.provider.notes, '', `Ordering: upload these files in your own ${h.provider.name} account (${h.provider.url}) and pay ${h.provider.name} directly. Plajah never holds your money or your ${h.provider.name} login.`, ...(h.warnings.length ? ['', 'Check before ordering:', ...h.warnings.map(w => `- ${w}`)] : [])].join('\n'));
  return out;
}

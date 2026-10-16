// fillBenchZoom — zoomed crops around each benchmark hole: original | fill, 3× magnified, from the contact sheets
// fillBench.ts wrote. Run: npx tsx scripts/tela/fillBenchZoom.ts [--label baseline] [--out <dir>] [--zoom 3]
import sharp from 'sharp';
import path from 'node:path';
import { existsSync } from 'node:fs';

const CASES: Record<string, { x: number; y: number; w: number; h: number }> = {
  'forest-foliage': { x: 0.40, y: 0.42, w: 0.18, h: 0.16 },
  'forest-trunks': { x: 0.30, y: 0.25, w: 0.14, h: 0.30 },
  'dawn-sky-gradient': { x: 0.42, y: 0.08, w: 0.22, h: 0.22 },
  'dawn-horizon': { x: 0.55, y: 0.50, w: 0.16, h: 0.14 },
  'ginseng-still-life': { x: 0.52, y: 0.56, w: 0.16, h: 0.16 },
};
const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const LABEL = opt('label', 'baseline'), OUT = opt('out', path.join(process.env.TEMP || '.', 'fill-bench')), ZOOM = Number(opt('zoom', '3'));

async function main() {
  for (const [name, h] of Object.entries(CASES)) {
    const sheetFile = path.join(OUT, `${name}.${LABEL}.png`);
    if (!existsSync(sheetFile)) continue;
    const meta = await sharp(sheetFile).metadata();
    const W = Math.round((meta.width! - 24) / 4), H = meta.height!;
    const margin = 0.6;
    const cx = (h.x + h.w / 2) * W, cy = (h.y + h.h / 2) * H;
    const cw = Math.min(W, Math.round(h.w * W * (1 + margin * 2))), ch = Math.min(H, Math.round(h.h * H * (1 + margin * 2)));
    const left = Math.max(0, Math.min(W - cw, Math.round(cx - cw / 2))), top = Math.max(0, Math.min(H - ch, Math.round(cy - ch / 2)));
    const panel = (i: number) => sharp(sheetFile).extract({ left: i * (W + 8) + left, top, width: cw, height: ch }).resize({ width: cw * ZOOM, kernel: 'nearest' }).png().toBuffer();
    const [orig, fill] = await Promise.all([panel(0), panel(2)]);
    const out = path.join(OUT, `${name}.${LABEL}.zoom.png`);
    await sharp({ create: { width: cw * ZOOM * 2 + 12, height: ch * ZOOM, channels: 4, background: { r: 16, g: 11, b: 23, alpha: 1 } } })
      .composite([{ input: orig, left: 0, top: 0 }, { input: fill, left: cw * ZOOM + 12, top: 0 }]).png().toFile(out);
    console.log(out);
  }
}
main().catch(e => { console.error(e); process.exit(1); });

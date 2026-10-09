// Usage (sharp is not a repo dependency; install it next to a scratch copy, or: npm i --no-save sharp@0.33.5):
//   npx tsx scripts/evite/dumpEraSvgs.ts <svgDir>   then
//   node scripts/evite/ogImages.mjs services/evite/plateCatalog.json <platesDir> <svgDir> <outDir> [only,ids]
// Upload <outDir> to gs://<bucket>/evites/v1/og/ (see plateOgUrl in services/evite/plateCatalog.ts).
// Link-preview images (1200×630) for evite plates: the plate as a blurred field + the card itself, centred,
// so a 1.91:1 crop (iMessage, X, Slack, Facebook) and a square crop (WhatsApp) both show the whole card.
import sharp from 'sharp';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const [,, catalogPath, platesDir, eraSvgDir, outDir, only] = process.argv;
const W = 1200, H = 630, CH = 560, CW = Math.round(CH * 816 / 1224), R = 22;
const cx = Math.round((W - CW) / 2), cy = Math.round((H - CH) / 2) - 4;
const vignette = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="v" cx="50%" cy="48%" r="75%"><stop offset="45%" stop-color="#0b0713" stop-opacity="0"/><stop offset="100%" stop-color="#0b0713" stop-opacity=".72"/></radialGradient></defs><rect width="${W}" height="${H}" fill="#0b0713" fill-opacity=".28"/><rect width="${W}" height="${H}" fill="url(#v)"/>
<text x="${W - 34}" y="${H - 26}" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="4" fill="#fff" fill-opacity=".72">PLAJAH EVENTS</text></svg>`);
const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs><rect x="${cx}" y="${cy + 16}" width="${CW}" height="${CH}" rx="${R}" fill="#000" fill-opacity=".6" filter="url(#b)"/></svg>`);
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}"><rect width="${CW}" height="${CH}" rx="${R}" fill="#fff"/></svg>`);
const edge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}"><rect x=".75" y=".75" width="${CW - 1.5}" height="${CH - 1.5}" rx="${R}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.5"/></svg>`);

async function og(src, out) {
  const plate = await sharp(src).resize(816, 1224, { fit: 'cover' }).toBuffer();
  const bg = await sharp(plate).resize(W, H, { fit: 'cover', position: 'centre' }).blur(26).modulate({ brightness: .62, saturation: 1.25 }).toBuffer();
  const card = await sharp(plate).resize(CW, CH).composite([{ input: mask, blend: 'dest-in' }, { input: edge }]).png().toBuffer();
  mkdirSync(path.dirname(out), { recursive: true });
  await sharp(bg).composite([{ input: shadow }, { input: vignette }, { input: card, left: cx, top: cy }]).jpeg({ quality: 84, mozjpeg: true }).toFile(out);
}
const cat = JSON.parse(readFileSync(catalogPath, 'utf8'));
const jobs = [];
for (const c of cat.collections) for (const s of c.plates) jobs.push([path.join(platesDir, c.id, s + '.jpg'), path.join(outDir, c.id, s + '.jpg'), `${c.id}/${s}`]);
if (eraSvgDir && existsSync(eraSvgDir)) for (const f of readdirSync(eraSvgDir).filter(f => f.endsWith('.svg'))) jobs.push([path.join(eraSvgDir, f), path.join(outDir, 'era', f.replace(/\.svg$/, '.jpg')), `era/${f.replace(/\.svg$/, '')}`]);
const pick = only ? jobs.filter(j => only.split(',').includes(j[2])) : jobs;
let ok = 0, miss = [];
for (const [src, out, id] of pick) { if (!existsSync(src)) { miss.push(id); continue; } await og(src, out); ok++; }
console.log(`og: ${ok} written, ${miss.length} missing`, miss.slice(0, 10));

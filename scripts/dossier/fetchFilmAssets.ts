/**
 * Prepares local assets for the Dossier film so it renders offline and the canvas is never
 * tainted by cross-origin images:
 *   1. archival photos/documents from Wikimedia Commons → public/dossier/douglass/archival/<id>.jpg
 *   2. depth maps for every reconstruction painting   → public/dossier/douglass/depth/<id>.png
 *      (Depth Anything V2 small via transformers.js; near = white)
 *
 *   npx tsx scripts/dossier/fetchFilmAssets.ts [--skip-depth] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const PUB = path.join(ROOT, 'public', 'dossier', 'douglass');
const UA = 'PlajahDossier/0.2 (research; contact kmoody2003@gmail.com)';
const force = process.argv.includes('--force');

function commonsThumb(url: string, width = 1600): string {
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/);
  return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${width}px-${m[3]}` : url;
}

async function download(url: string, dest: string) {
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 5000) return 'cached';
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) { fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer())); await new Promise(r => setTimeout(r, 1200)); return 'ok'; }
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
    // Requested thumb wider than the original: fall back to the original file.
    if (res.status === 400 || res.status === 404) { url = url.replace(/\/thumb(\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/\d+px-[^/]+$/, '$1'); continue; }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`gave up on ${url}`);
}

async function archival() {
  const dir = path.join(PUB, 'archival');
  fs.mkdirSync(dir, { recursive: true });
  const assets: Array<{ id: string; url: string }> = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dossier/douglassAssets.json'), 'utf8'));
  for (const a of assets) {
    if (!a.url?.startsWith('http')) continue;
    try { console.log(`archival ${a.id}: ${await download(commonsThumb(a.url), path.join(dir, `${a.id}.jpg`))}`); }
    catch (e) { console.warn(`archival ${a.id}: FAILED ${(e as Error).message}`); }
  }
}

async function depth() {
  const reconDir = path.join(PUB, 'recon'), rawDir = path.join(PUB, 'depth', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const files = fs.readdirSync(reconDir).filter(f => f.endsWith('.png'));
  const todo = files.filter(f => force || !fs.existsSync(path.join(rawDir, f)));
  if (!todo.length) { console.log('depth: all cached'); return; }
  const { pipeline, RawImage } = await import('@huggingface/transformers');
  const estimator: any = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'fp32' } as any);
  for (const f of todo) {
    const img = await RawImage.read(path.join(reconDir, f));
    const out: any = await estimator(img);
    const d = Array.isArray(out) ? out[0].depth : out.depth;
    // Resize to the painting so the shader samples aligned texels.
    const resized = await d.resize(img.width, img.height);
    await resized.save(path.join(rawDir, f));
    console.log(`depth ${f}: ${img.width}x${img.height}`);
  }
}

/**
 * Soften depth for parallax: grow the foreground a few pixels (so a figure carries its own edge
 * and the background stretches behind it rather than tearing) and blur, so displacement is a
 * smooth gradient. Raw maps stay in depth/raw/ for re-tuning.
 */
function softenDepth() {
  const rawDir = path.join(PUB, 'depth', 'raw'), outDir = path.join(PUB, 'depth');
  if (!fs.existsSync(rawDir)) return;
  const FFMPEG = process.env.FFMPEG ?? 'C:/Users/Kenne/tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe';
  for (const f of fs.readdirSync(rawDir).filter(n => n.endsWith('.png'))) {
    const out = path.join(outDir, f);
    if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(path.join(rawDir, f)).mtimeMs) continue;
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', path.join(rawDir, f), '-vf', 'format=gray,dilation,dilation,dilation,dilation,gblur=sigma=7', out]);
    console.log(`depth soft ${f}`);
  }
}

// One-time migration: maps written before raw/ existed become the raw set.
{
  const dir = path.join(PUB, 'depth'), raw = path.join(dir, 'raw');
  if (fs.existsSync(dir) && !fs.existsSync(raw)) {
    fs.mkdirSync(raw);
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.png'))) fs.copyFileSync(path.join(dir, f), path.join(raw, f));
  }
}

await archival();
if (!process.argv.includes('--skip-depth')) await depth();
softenDepth();
console.log('done');

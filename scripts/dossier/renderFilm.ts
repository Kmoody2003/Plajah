/**
 * Exports the Dossier film to MP4 by driving the exact renderer the app uses.
 *
 *   npx tsx scripts/dossier/renderFilm.ts [--out=path.mp4] [--from=0] [--to=end] [--fps=30] [--w=1920 --h=1080]
 *   npx tsx scripts/dossier/renderFilm.ts --stills=5,30,62      # review stills → .film-work/stills/*.jpg
 *
 * Pipeline: Vite dev server → dossier-film.html?render=1 in headless Chromium → window.__film.frame(t)
 * per frame → ffmpeg (H.264) → narration lines placed at their cue times + score ducked under the
 * voice (sidechain) → MP4 + SRT captions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';
import { layout } from '../../services/dossier/film/filmTypes';
import { captionChunks } from '../../services/dossier/film/motion';
import { buildDouglassFilm } from '../../data/dossier/douglassFilm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const FFDIR = process.env.FFMPEG_DIR || 'C:\\Users\\Kenne\\tools\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin';
const FFMPEG = path.join(FFDIR, 'ffmpeg.exe');
const arg = (k: string, d?: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const W = Number(arg('w', '1920')), H = Number(arg('h', '1080'));
const WORK = path.join(ROOT, '.film-work');
fs.mkdirSync(WORK, { recursive: true });

async function devServer(): Promise<{ url: string; proc?: ChildProcess }> {
  for (const port of [3000, 3017]) {
    try { const r = await fetch(`http://localhost:${port}/dossier-film.html`); if (r.ok) return { url: `http://localhost:${port}` }; } catch { /* not running */ }
  }
  const proc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', '3017', '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore', env: { ...process.env, PORT: '3017' } });
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { const r = await fetch('http://localhost:3017/dossier-film.html'); if (r.ok) return { url: 'http://localhost:3017', proc }; } catch { /* starting */ }
  }
  throw new Error('Vite dev server did not start on :3017');
}

async function main() {
  const { url, proc } = await devServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { if (m.type() === 'error') console.warn('[page]', m.text()); });
  await page.goto(`${url}/dossier-film.html?render=1&w=${W}&h=${H}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 180_000 });
  const film = await page.evaluate(() => ({ duration: window.__film!.duration, fps: window.__film!.fps, voiceCues: window.__film!.voiceCues, score: window.__film!.score }));
  const fps = Number(arg('fps', String(film.fps)));

  const stills = arg('stills');
  if (stills) {
    const dir = path.join(WORK, 'stills'); fs.mkdirSync(dir, { recursive: true });
    for (const s of stills.split(',').map(Number)) {
      const data = await page.evaluate(t => window.__film!.frame(t, .92), s);
      const f = path.join(dir, `still_${String(s).padStart(6, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
      console.log(f);
    }
    await browser.close(); proc?.kill(); return;
  }

  const from = Number(arg('from', '0')), to = Math.min(film.duration, Number(arg('to', String(film.duration))));
  const frames = Math.ceil((to - from) * fps);
  const silent = path.join(WORK, 'video.mp4');
  const ff = spawn(FFMPEG, ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const data = await page.evaluate(t => window.__film!.frame(t, .94), from + i / fps);
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (!ff.stdin!.write(buf)) await new Promise(r => ff.stdin!.once('drain', r));
    if (i % (fps * 5) === 0) {
      const el = (Date.now() - started) / 1000, eta = el / Math.max(1, i) * (frames - i);
      process.stdout.write(`\rframe ${i}/${frames}  ${(i / fps).toFixed(0)}s  eta ${Math.round(eta)}s   `);
    }
  }
  ff.stdin!.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  proc?.kill();
  console.log('\nvideo done');

  // ── Audio: narration at cue times; score looped and ducked under the voice ──
  const pub = (u: string) => path.join(ROOT, 'public', u.replace(/^\//, ''));
  const cues = film.voiceCues.filter(c => c.at + c.duration > from && c.at < to && fs.existsSync(pub(c.src)));
  const inputs: string[] = ['-i', silent];
  const parts: string[] = [];
  cues.forEach((c, i) => { inputs.push('-i', pub(c.src)); parts.push(`[${i + 1}:a]adelay=${Math.max(0, Math.round((c.at - from) * 1000))}|${Math.max(0, Math.round((c.at - from) * 1000))},aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`); });
  const len = (to - from).toFixed(2);
  let graph = parts.join(';');
  const voices = cues.length ? `${cues.map((_, i) => `[v${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad,atrim=0:${len}[vo]` : `anullsrc=r=48000:cl=stereo,atrim=0:${len}[vo]`;
  graph += (graph ? ';' : '') + voices;
  const scoreFile = film.score && fs.existsSync(pub(film.score.src)) ? pub(film.score.src) : '';
  let map = '[vo]';
  if (scoreFile) {
    inputs.push('-stream_loop', '-1', '-i', scoreFile);
    const si = cues.length + 1;
    graph += `;[vo]asplit=2[vo1][vk];[${si}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${len},volume=${film.score!.volume},afade=t=in:d=2,afade=t=out:st=${Math.max(0, Number(len) - 5)}:d=5[sc]`;
    graph += `;[sc][vk]sidechaincompress=threshold=0.02:ratio=8:attack=60:release=700:makeup=1[duck];[vo1][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[mix]`;
    map = '[mix]';
  }
  const out = arg('out', path.join(ROOT, 'docs', 'dossier', 'douglass-film.mp4'))!;
  execFileSync(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '0:v', '-map', map, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], { stdio: 'inherit' });

  // ── Captions (SRT), same chunking as the on-screen captions ──
  const narr = fs.existsSync(path.join(ROOT, 'public/dossier/douglass/film/narration.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dossier/douglass/film/narration.json'), 'utf8')) : undefined;
  const spec = buildDouglassFilm({ narration: narr });
  const { placed } = layout({ ...spec, scenes: spec.scenes.map(s => s.narration && !s.narration.duration ? { ...s, narration: { ...s.narration, duration: s.narration.text.split(/\s+/).length / 2.55 } } : s) });
  const ts = (x: number) => { x = Math.max(0, x); const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = x % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')},${String(Math.round((s % 1) * 1000)).padStart(3, '0')}`; };
  let n = 0; const srt: string[] = [];
  for (const p of placed) {
    const nar = p.scene.narration; if (!nar?.duration) continue;
    for (const c of captionChunks(nar.text, nar.duration)) {
      const a = p.voiceAt + c.a - from, b = p.voiceAt + c.b - from;
      if (b < 0 || a > to - from) continue;
      srt.push(`${++n}\n${ts(a)} --> ${ts(b)}\n${c.text}\n`);
    }
  }
  fs.writeFileSync(out.replace(/\.mp4$/, '.srt'), srt.join('\n'));
  const mb = fs.statSync(out).size / 1e6;
  console.log(`OK ${out}  ${len}s  ${mb.toFixed(1)} MB  (${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch(e => { console.error(e); process.exit(1); });

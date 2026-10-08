/**
 * Exports a Dossier film to MP4 by driving the exact renderer the app uses.
 *
 *   npx tsx scripts/dossier/renderFilm.ts [--film=douglass|ford|persia|partition|founding-battle|douglass-legacy] [--out=path.mp4] [--from=0] [--to=end] [--fps=30] [--w=1920 --h=1080]
 *   npx tsx scripts/dossier/renderFilm.ts --film=ford --stills=5,30,62      # review stills → .film-work/stills/*.jpg
 *   npx tsx scripts/dossier/renderFilm.ts --film=ford --verify               # build gates only (PSNR, caption fit), no render
 *   npx tsx scripts/dossier/renderFilm.ts --film=founding-battle             # the animated-painting demo -> docs/dossier/founding-battle-demo.mp4
 *
 * Pipeline: Vite dev server → dossier-film.html?render=1 in headless Chromium → window.__film.frame(t) per frame →
 * ffmpeg (H.264) → narration lines placed at their cue times + score ducked under the voice (sidechain) → MP4 + SRT.
 *
 * `--film=ford` is the council style (services/dossier/film/council*.ts): lossless PNG frames, bt709 x264 CRF 16, score out
 * through every Silence Hold, synthesised foley on impact frames, room tone instead of digital silence, SRT + WebVTT from the
 * same caption chunks the picture uses, and the build gates (PSNR >= 40 dB on archive plates, caption fit) run first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';
import { layout } from '../../services/dossier/film/filmTypes';
import { captionChunks } from '../../services/dossier/film/motion';
import { toSRT, toVTT } from '../../services/dossier/film/captions';
import { buildDouglassFilm } from '../../data/dossier/douglassFilm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const FFDIR = process.env.FFMPEG_DIR || 'C:\\Users\\Kenne\\tools\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin';
const FFMPEG = path.join(FFDIR, 'ffmpeg.exe');
const arg = (k: string, d?: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const flag = (k: string) => process.argv.includes(`--${k}`);
const W = Number(arg('w', '1920')), H = Number(arg('h', '1080'));
const FILM = arg('film', 'douglass')!;
/** The original (pre-council) Douglass film is --film=douglass-legacy; every other film is in the council style. */
const COUNCIL = FILM !== 'douglass-legacy';
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

const ffmpeg = (args: string[]) => execFileSync(FFMPEG, ['-y', '-v', 'error', ...args], { stdio: 'inherit' });

/** Synthesised foley (credited as generated on the end card): one dry steel tap, one thunk (the same every time), one ratchet tick. */
function foleySamples(): Record<string, string> {
  const dir = path.join(WORK, 'foley'); fs.mkdirSync(dir, { recursive: true });
  const defs: Record<string, { expr: string; d: number; af?: string }> = {
    tap: { expr: '0.8*sin(2*PI*2300*t)*exp(-85*t)+0.5*sin(2*PI*610*t)*exp(-40*t)+0.25*(random(0)*2-1)*exp(-140*t)', d: 0.3 },
    thunk: { expr: '0.9*sin(2*PI*82*t)*exp(-13*t)+0.3*sin(2*PI*205*t)*exp(-30*t)+0.12*(random(0)*2-1)*exp(-60*t)', d: 0.7 },
    tick: { expr: '0.7*sin(2*PI*3300*t)*exp(-260*t)', d: 0.1 },
    // A distant musket report: a low thump and a puff of noise, low-passed and given a faint echo off the hill.
    // Type landing in a composing stick: a small dry metal click.
    click: { expr: '0.6*sin(2*PI*1900*t)*exp(-220*t)+0.3*(random(0)*2-1)*exp(-420*t)', d: 0.08 },
    // One plucked string: a decaying tone with a soft attack, a little below middle register.
    pluck: { expr: '0.7*sin(2*PI*196*t)*exp(-3.2*t)+0.35*sin(2*PI*392*t)*exp(-5*t)+0.15*sin(2*PI*588*t)*exp(-8*t)', d: 1.6 },
    // Pencil on paper: band-limited noise with a slow swell.
    scratch: { expr: '0.9*(random(0)*2-1)*sin(PI*t/0.6)', d: 0.6, af: 'highpass=f=1800,lowpass=f=7000' },
    musket: { expr: '0.9*sin(2*PI*66*t)*exp(-20*t)+0.5*(random(0)*2-1)*exp(-34*t)', d: 0.9, af: 'lowpass=f=520,aecho=0.5:0.4:120|260:0.35|0.2' },
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(defs)) {
    out[k] = path.join(dir, `${k}.wav`);
    ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${v.expr}':s=48000:d=${v.d}`, '-ac', '1', ...(v.af ? ['-af', v.af] : []), out[k]]);
  }
  return out;
}

async function main() {
  const { url, proc } = await devServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { if (m.type() === 'error') console.warn('[page]', m.text()); });
  await page.goto(`${url}/dossier-film.html?render=1&film=${FILM}&w=${W}&h=${H}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 180_000 });
  const film = await page.evaluate(() => ({
    duration: window.__film!.duration, fps: window.__film!.fps, voiceCues: window.__film!.voiceCues, score: window.__film!.score,
    council: window.__film!.council && { timing: window.__film!.council.timing, cues: window.__film!.council.cues, silences: window.__film!.council.silences, foley: window.__film!.council.foley, ambience: window.__film!.council.ambience, warnings: window.__film!.council.warnings },
  }));
  const fps = Number(arg('fps', String(film.fps)));

  // ── Build gates (council style) ──
  if (COUNCIL && (flag('verify') || !flag('skip-gates'))) {
    const failures: string[] = [];
    const times: Array<{ id: string; t: number }> = await page.evaluate(() => window.__film!.council!.stableTimes);
    let worst = 99, worstSrc = 99;
    for (const s of times) {
      const r = await page.evaluate(t => window.__film!.council!.verify(t), s.t);
      for (const f of r.fidelity) {
        worst = Math.min(worst, f.psnr); worstSrc = Math.min(worstSrc, f.vsSource);
        if (f.psnr < 40) failures.push(`plate pixels altered: ${s.id}/${f.asset} PSNR ${f.psnr.toFixed(1)} dB < 40`);
        if (f.vsSource < 25) failures.push(`plate geometry/scale off: ${s.id}/${f.asset} ${f.vsSource.toFixed(1)} dB against the source < 25`);
      }
    }
    const pg = await page.evaluate(() => window.__film!.council!.paintingGates());
    for (const r of pg) {
      console.log(`animated painting ${r.id}: ${r.ok ? 'ok' : 'FAILED'}${r.lock ? `; figure lock: ${r.lock.compared} figure px compared, max diff ${r.lock.maxDiff}, far plane moved at ${r.lock.farMoved} sampled px` : ''}${r.stillDb !== undefined ? `; opening still vs painting ${r.stillDb.toFixed(1)} dB` : ''}${r.bookendDiff !== undefined ? `; last frame vs first max diff ${r.bookendDiff}` : ''}${r.note ? `; ${r.note}` : ''}`);
      if (!r.ok) failures.push(`animated painting gate failed: ${r.id} ${JSON.stringify(r)}`);
    }
    const g = await page.evaluate(() => window.__film!.council!.textGates());
    g.captionFit.forEach(c => failures.push(`caption does not fit two lines (${Math.round(c.width)}px): ${c.text}`));
    g.textFit.forEach(m => failures.push(m));
    film.council!.warnings.forEach(w => console.warn('[warn]', w));
    console.log(`gates: ${times.length} plate shots checked, worst plate PSNR ${worst >= 99 ? 'identical (99 dB)' : worst.toFixed(1) + ' dB'}, worst vs-source ${worstSrc.toFixed(1)} dB; caption fit ${g.captionFit.length ? 'FAIL' : 'ok'}; text fit ${g.textFit.length ? 'FAIL' : 'ok'}; timing: ${film.council!.timing}`);
    if (failures.length) { failures.forEach(f => console.error('GATE FAILED:', f)); await browser.close(); proc?.kill(); process.exit(2); }
    if (flag('verify')) { await browser.close(); proc?.kill(); return; }
  }

  const stills = arg('stills');
  if (stills) {
    const dir = path.join(WORK, 'stills'); fs.mkdirSync(dir, { recursive: true });
    for (const s of stills.split(',').map(Number)) {
      const data = await page.evaluate(t => window.__film!.frame(t, .92), s);
      const f = path.join(dir, `still_${FILM}_${String(Math.round(s * 100)).padStart(6, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
      console.log(f);
    }
    await browser.close(); proc?.kill(); return;
  }

  const from = Number(arg('from', '0')), to = Math.min(film.duration, Number(arg('to', String(film.duration))));
  const frames = Math.ceil((to - from) * fps);
  const silent = path.join(WORK, `video-${FILM}.mp4`);
  const venc = COUNCIL
    ? ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', silent]
    : ['-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent];
  const started = Date.now();
  const reuse = flag('reuse-video') && fs.existsSync(silent);   // re-run only the audio mix and sidecars on an existing picture
  if (reuse) { await browser.close(); proc?.kill(); console.log('reusing', silent); } else {
  const ff = spawn(FFMPEG, ['-y', '-v', 'error', ...venc], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < frames; i++) {
      const t = from + i / fps;
      const data = await page.evaluate(([tt, png]) => window.__film!.frame(tt as number, png ? 1 : .94, png ? 'png' : 'jpeg'), [t, COUNCIL] as const);
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
  }

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
  let next = cues.length + 1;
  if (scoreFile) {
    inputs.push('-stream_loop', '-1', '-i', scoreFile);
    const si = next++;
    // Council: the score is out through every Silence Hold (1 s ramps), never abruptly.
    const outs = (film.council?.silences ?? []).map(s => `(1-clip(min(t-${(s.from - 1 - from).toFixed(2)},${(s.to + 1 - from).toFixed(2)}-t),0,1))`);
    const gate = outs.length ? `,volume=eval=frame:volume='${outs.join('*')}'` : '';
    graph += `${cues.length ? ';[vo]asplit=2[vo1][vk]' : ';[vo]anull[vo1]'};[${si}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${len},volume=${film.score!.volume}${gate},afade=t=in:d=2,afade=t=out:st=${Math.max(0, Number(len) - 5)}:d=5[sc]`;
    graph += cues.length
      ? `;[sc][vk]sidechaincompress=threshold=0.02:ratio=8:attack=${COUNCIL ? 400 : 60}:release=700:makeup=1[duck];[vo1][duck]amix=inputs=2:normalize=0[mix0]`
      : `;[vo1][sc]amix=inputs=2:normalize=0[mix0]`;
    map = '[mix0]';
  }
  if (COUNCIL) {
    // Foley on impact frames (about 20 dB under the voice) and room tone through the Silence Holds and the first 0.4 s.
    const samples = foleySamples();
    const events = (film.council?.foley ?? []).filter(e => e.at >= from && e.at < to);
    const fo: string[] = [];
    events.forEach(e => {
      inputs.push('-i', samples[e.kind]);
      const ms = Math.round((e.at - from) * 1000);
      fo.push(`[${next}:a]adelay=${ms}|${ms},volume=${e.kind === 'tick' ? 0.05 : e.kind === 'musket' ? 0.55 * ((e as { gain?: number }).gain ?? 1) : e.kind === 'click' ? 0.05 : e.kind === 'pluck' ? 0.09 : e.kind === 'scratch' ? 0.06 : 0.13},aformat=sample_rates=48000:channel_layouts=stereo[f${next}]`);
      next++;
    });
    if (fo.length) graph += `;${fo.join(';')};${fo.map((_, k) => `[f${next - fo.length + k}]`).join('')}amix=inputs=${fo.length}:normalize=0:dropout_transition=0,apad,atrim=0:${len}[foley]`;
    const wn: string[] = [];   // continuous synthesised beds (wind under a painted battle): brown noise, band-limited, with slow gusts
    for (const b of (film.council?.ambience ?? []).filter(b => b.to > from && b.from < to)) {
      const a0 = Math.max(0, b.from - from), d = Math.min(b.to, to) - Math.max(b.from, from), ms = Math.round(a0 * 1000);
      inputs.push('-f', 'lavfi', '-i', `anoisesrc=color=brown:amplitude=0.9:sample_rate=48000:duration=${d.toFixed(2)}`);
      wn.push(`[${next}:a]lowpass=f=900,highpass=f=70,tremolo=f=0.17:d=0.5,volume=0.30,afade=t=in:d=2,afade=t=out:st=${Math.max(0, d - 2).toFixed(2)}:d=2,adelay=${ms}|${ms},aformat=sample_rates=48000:channel_layouts=stereo[w${next}]`);
      next++;
    }
    if (wn.length) graph += `;${wn.join(';')}`;
    const windows = [{ from: 0, to: 0.4 }, ...(film.council?.silences ?? [])].map(s => `between(t,${(s.from - from).toFixed(2)},${(s.to - from).toFixed(2)})`);
    graph += `;anoisesrc=color=pink:amplitude=0.012:sample_rate=48000:duration=${len},aformat=channel_layouts=stereo,volume='${windows.join('+')}':eval=frame[tone]`;
    const mixIn = [map, ...(fo.length ? ['[foley]'] : []), ...wn.map((_, k) => `[w${next - wn.length + k}]`), '[tone]'];
    graph += `;${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:dropout_transition=0,${cues.length ? 'loudnorm=I=-16:TP=-1:LRA=11,' : ''}alimiter=limit=0.95[final]`;
    map = '[final]';
  } else if (scoreFile) {
    graph = graph.replace('[mix0]', '[mix1]').replace(/$/, ';[mix1]alimiter=limit=0.95[mix]');
    map = '[mix]';
  }
  const out = arg('out', path.join(ROOT, 'docs', 'dossier', FILM === 'founding-battle' ? 'founding-battle-demo.mp4' : COUNCIL ? `${FILM}-explainer-council.mp4` : 'douglass-film.mp4'))!;
  ffmpeg([...inputs, '-filter_complex', graph, '-map', '0:v', '-map', map, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);

  // ── Captions: the same chunking as the on-screen captions ──
  if (COUNCIL) {
    const cc = film.council!.cues.filter(c => c.b > from && c.a < to).map(c => ({ a: c.a - from, b: c.b - from, text: c.text }));
    fs.writeFileSync(out.replace(/\.mp4$/, '.srt'), toSRT(cc));
    fs.writeFileSync(out.replace(/\.mp4$/, '.vtt'), toVTT(cc));
    fs.writeFileSync(out.replace(/\.mp4$/, '.timing.json'), JSON.stringify({ film: FILM, timing: film.council!.timing, note: film.council!.timing === 'estimated' ? 'timing: estimated, silent' : 'line durations measured from voiced audio; word onsets within a line are estimated', duration: film.duration, silences: film.council!.silences }, null, 2));
  } else {
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
  }
  const mb = fs.statSync(out).size / 1e6;
  console.log(`OK ${out}  ${len}s  ${mb.toFixed(1)} MB  (${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch(e => { console.error(e); process.exit(1); });

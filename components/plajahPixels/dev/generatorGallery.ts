// Generator lab — every GEN_GLSL mode on one page, with the same audio texture
// and uniforms Ambo's GeneratorSource feeds it. Serve with scripts/serveGeneratorLab.mjs.
import { createGL, createProgram, createFullscreenQuad } from '../engine/core/glUtil';
import { GeneratorRenderer, generatorModes, hexToRgb } from '../engine/core/generators';
import { genPalette } from '../engine/core/generatorPalettes';
import { STAGE_RIGS, STAGE_PARAM_LABELS } from '../engine/core/stageRigs';
import { AudioTexture } from '../engine/core/audioTexture';
import { createFluxTestWav } from '../../../services/fabula/fluxTestGroove';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('screen');
const maybeGl = createGL(canvas);
if (!maybeGl) throw new Error('WebGL2 unavailable');
const gl = maybeGl;
const renderer = new GeneratorRenderer(gl);
const audioTex = new AudioTexture(gl);
const present = createProgram(gl, `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`, `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes; out vec4 o;
void main(){ o = texture(uTex, gl_FragCoord.xy/uRes); }`);
const uTex = gl.getUniformLocation(present, 'uTex'), uRes = gl.getUniformLocation(present, 'uRes');
const vao = createFullscreenQuad(gl);

const query = new URLSearchParams(location.search);
// ?set=stage — the Concert Stage library: only the RIG_* rigs, grouped by tier, with their names.
const stageSet = query.get('set') === 'stage';
const modes = stageSet ? STAGE_RIGS.flatMap(r => [r.mode, r.mode + '_DIRECTOR', r.mode + '_EMPTY', r.mode + '_EMPTY_DIRECTOR']) : generatorModes();
const rigOf = (m: string) => STAGE_RIGS.find(r => r.mode === m.replace(/_(EMPTY_DIRECTOR|DIRECTOR|EMPTY)$/, ''));
const VERSION: Record<string, string> = { _DIRECTOR: 'Director', _EMPTY: 'Empty stage', _EMPTY_DIRECTOR: 'Empty stage · Director' };
const versionOf = (m: string) => VERSION[/_(EMPTY_DIRECTOR|DIRECTOR|EMPTY)$/.exec(m)?.[0] ?? ''] ?? '';
const rigName = (m: string) => { const r = rigOf(m); return r ? [r.name, versionOf(m)].filter(Boolean).join(' · ') : undefined; };
const wanted = query.get('mode');
let mode = wanted && modes.includes(wanted) ? wanted : modes[0];
let paused = false, t = 0, last = performance.now(), failure = '';
const p = [0.5, 0.5, 0.5, 0.5];
const DEFAULT_COLORS = ['#8C5CF2', '#D40054', '#FF8C00'];
const colors = [...DEFAULT_COLORS];

const nav = document.querySelector('nav')!;
const TIER_TITLES: Record<string, string> = { laser: 'Laser shows', high: 'High energy', mid: 'Mid tempo', mellow: 'Mellow' };
let lastTier = '';
for (const m of modes) {
  const rig = rigOf(m);
  if (stageSet && rig && rig.tier !== lastTier) {
    lastTier = rig.tier;
    const hd = document.createElement('div'); hd.textContent = TIER_TITLES[rig.tier];
    hd.style.cssText = 'grid-column:1/-1;margin:14px 0 2px;font-size:11px;letter-spacing:3px;color:#c7a879;text-transform:uppercase';
    nav.append(hd);
  }
  const b = document.createElement('button'); b.className = 'tile'; b.dataset.mode = m;
  const ver = versionOf(m);
  b.textContent = stageSet && rig ? (ver ? `   ↳ ${ver}` : `${rig.name} · ${rig.venue}`) : m;
  if (stageSet && ver) b.style.cssText = 'opacity:.8;font-size:11px';
  b.onclick = () => select(m); nav.append(b);
}
if (stageSet) {
  document.querySelector('.brand')!.textContent = 'CONCERT STAGE LIBRARY';
  document.title = 'Concert Stage Library';
  const sub = document.querySelector('header > div:last-child'); if (sub) sub.textContent = '40 RIGS × SHOW · DIRECTOR · EMPTY STAGE · EMPTY + DIRECTOR · UPLOAD A SONG';
  STAGE_PARAM_LABELS.forEach((label, i) => { const inp = document.getElementById(`p${i}`); if (inp?.parentElement?.firstChild) inp.parentElement.firstChild.textContent = label; });
}
function select(m: string) {
  mode = m; t = 0; failure = '';
  $('title').textContent = (stageSet && rigName(m)) || m;
  nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  history.replaceState(null, '', stageSet ? `?set=stage&mode=${m}` : `?mode=${m}`);
  const pal = genPalette(m);
  for (let i = 0; i < 3; i++) {
    colors[i] = pal ? pal[i] : DEFAULT_COLORS[i];
    const el = document.getElementById(`c${i}`) as HTMLInputElement | null;
    if (el) el.value = colors[i];
  }
}
for (let i = 0; i < 4; i++) {
  const el = $<HTMLInputElement>(`p${i}`); el.oninput = () => { p[i] = Number(el.value); };
}
for (let i = 0; i < 3; i++) {
  const el = $<HTMLInputElement>(`c${i}`); el.value = colors[i]; el.oninput = () => { colors[i] = el.value; };
}
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };

// Audio: synthetic idle motion until a file / the test groove plays through an analyser.
const synthFreq = new Uint8Array(256), synthWave = new Uint8Array(256);
function synth(tt: number, kit = mode.startsWith('RIG_')) {
  // Stage rigs light to drum hits, so their idle preview gets a silent 120 BPM kit: kick on the beat,
  // snare on 2 and 4, hats on the eighths (no sound, just spectrum).
  const beat = tt * 2, kick = kit ? Math.exp(-(beat % 1) * 9) : 0;
  const snare = kit ? Math.exp(-((beat + 1) % 2) * 12) : 0, hat = kit ? Math.exp(-((beat * 2) % 1) * 18) : 0;
  for (let i = 0; i < 256; i++) {
    const drum = i < 4 ? 150 * kick : (i > 20 && i < 55 ? 90 * snare : (i > 75 && i < 150 ? 70 * hat : 0));
    synthFreq[i] = Math.max(0, Math.min(255, 120 * Math.exp(-i / 42) * (0.6 + 0.4 * Math.sin(tt * 2.2 - i * 0.05)) + 20 + drum));
    synthWave[i] = Math.max(0, Math.min(255, 128 + 48 * Math.sin(tt * 6 + i * 0.19) * (0.6 + 0.4 * Math.sin(tt * 0.7))));
  }
}
let audio: HTMLAudioElement | undefined, audioCtx: AudioContext | undefined, analyser: AnalyserNode | undefined;
let freq: Uint8Array<ArrayBuffer> | undefined, wave: Uint8Array<ArrayBuffer> | undefined, url: string | undefined, sourceName = '';
let wantPlaying = false;           // the operator's intent: a track was playing and should keep playing
let needsGesture = false;          // autoplay was refused; the next click/key resumes

// ── Track memory: the loaded file survives reloads (IndexedDB) and resumes where it was. ──
const DB = 'genlab', STORE = 'track', POS_KEY = 'genlab.trackPos';
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function saveTrack(blob: Blob, name: string) {
  try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).put({ blob, name }, 'last'); } catch { /* private mode: no memory */ }
}
async function loadTrack(): Promise<{ blob: Blob; name: string } | null> {
  try {
    const db = await idb();
    return await new Promise(res => {
      const r = db.transaction(STORE).objectStore(STORE).get('last');
      r.onsuccess = () => res(r.result ?? null); r.onerror = () => res(null);
    });
  } catch { return null; }
}
function savePos() { try { if (audio && !audio.paused) sessionStorage.setItem(POS_KEY, String(audio.currentTime)); } catch { /* */ } }
setInterval(savePos, 1000);
addEventListener('pagehide', savePos);

async function playFile(blob: Blob, name: string, opts: { remember?: boolean; startAt?: number } = {}) {
  try {
    audio?.pause(); await audioCtx?.close(); if (url) URL.revokeObjectURL(url);
    audioCtx = new AudioContext();
    audio = new Audio(); url = URL.createObjectURL(blob); audio.src = url; audio.loop = true;
    const src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.45;
    src.connect(analyser); analyser.connect(audioCtx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount); wave = new Uint8Array(analyser.fftSize);
    sourceName = name; wantPlaying = true;
    if (opts.remember) { void saveTrack(blob, name); try { sessionStorage.setItem(POS_KEY, '0'); } catch { /* */ } }
    if (opts.startAt) audio.currentTime = opts.startAt;
    await resumePlayback();
  } catch (e) { failure = e instanceof Error ? e.message : String(e); }
}
/** Bring the track back after a reload, a hidden pane or a suspended context. */
async function resumePlayback() {
  if (!audio || !audioCtx || !wantPlaying) return;
  try {
    if (audioCtx.state !== 'running') await audioCtx.resume();
    if (audio.paused) await audio.play();
    needsGesture = audioCtx.state !== 'running';
  } catch { needsGesture = true; }
}
const onGesture = () => { if (needsGesture) void resumePlayback(); };
addEventListener('pointerdown', onGesture, true);
addEventListener('keydown', onGesture, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void resumePlayback(); });
setInterval(() => { if (wantPlaying && !document.hidden && (audio?.paused || audioCtx?.state === 'suspended')) void resumePlayback(); }, 1500);

$('demo').onclick = () => void playFile(new Blob([createFluxTestWav()], { type: 'audio/wav' }), 'Test groove · 120 BPM');
$<HTMLInputElement>('audio').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void playFile(f, f.name, { remember: true }); };
void loadTrack().then(t => {
  if (!t || audio) return;
  let at = 0; try { at = Number(sessionStorage.getItem(POS_KEY) || 0); } catch { /* */ }
  void playFile(t.blob, t.name, { startAt: at });
});

function size() {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 1.5);
  const w = Math.max(2, Math.min(1600, Math.round(box.width * dpr))), h = Math.max(2, Math.round(w * 9 / 16));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
select(mode);
let frames = 0, fpsAt = performance.now(), fps = 0;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; if (!paused) t += dt;
  if (!document.hidden && !failure) {
    size();
    if (analyser && freq && wave && audio && (!audio.paused || needsGesture)) {
      analyser.getByteFrequencyData(freq); analyser.getByteTimeDomainData(wave);
      audioTex.updateFromArrays(freq, wave, analyser.context.sampleRate);
    } else { synth(t); audioTex.updateFromArrays(synthFreq, synthWave, 48000); }
    try {
      const tex = renderer.render('lab', mode, canvas.width, canvas.height, {
        time: t, audio: audioTex, colors: colors.map(hexToRgb), params: p,
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(present); gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uTex, 0); gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    } catch (e) { failure = e instanceof Error ? e.message : String(e); console.error(e); }
    frames++; if (now - fpsAt > 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    for (const k of ['bass', 'mid', 'treble'] as const) $(`meter-${k}`).style.transform = `scaleX(${audioTex[k]})`;
    const src = needsGesture ? `CLICK ANYWHERE TO RESUME ${sourceName}` : (sourceName || 'SYNTHETIC IDLE AUDIO');
    $('status').textContent = failure ? 'RENDER ERROR' : `${src} · ${fps} FPS · ${canvas.width}×${canvas.height}`;
    $('error').textContent = failure;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
/** GPU cost of a mode: ms per frame at w×h. A 1-px readback forces the GPU to drain (gl.finish alone
 *  returns early in a background tab), so a hidden pane can still answer. */
const probe = new Uint8Array(4);
function drain() { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe); }
function bench(m = mode, w = 1920, h = 1080, n = 30) {
  const ctx = { time: 0, audio: audioTex, colors: colors.map(hexToRgb), params: p };
  renderer.prepare(m);                                            // build the shader first (stage rigs build in the background)
  renderer.render('bench', m, w, h, ctx); drain();                // warm (FBO); FBO stays bound
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { ctx.time = i / 60; renderer.render('bench', m, w, h, ctx); }
  drain();
  return { mode: m, w, h, msPerFrame: +((performance.now() - t0) / n).toFixed(2) };
}
/** A deterministic still: a fresh renderer runs `seconds` of the silent drum kit at 30 fps (small
 *  frames, media clock), then renders one w×h frame and shows it as a static image over the page —
 *  the in-app pane doesn't pump WebGL while hidden, but it does draw images. */
function stillCanvas(m: string, seconds: number, w: number, h: number): HTMLCanvasElement {
  const r = new GeneratorRenderer(gl);
  r.prepare(m);                                       // stills need frame one: wait for the shader
  const ctx = { time: 0, audio: audioTex, colors: (genPalette(m) ?? DEFAULT_COLORS).map(hexToRgb), params: p, clock: 0 };
  const n = Math.round(seconds * 30);
  for (let i = 0; i <= n; i++) {
    ctx.time = ctx.clock = i / 30;
    synth(ctx.time, m.startsWith('RIG_')); audioTex.updateFromArrays(synthFreq, synthWave, 48000);
    r.render('still', m, i === n ? w : 96, i === n ? h : 54, ctx);
  }
  const [, , vw, vh] = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const px = new Uint8Array(vw * vh * 4);
  gl.readPixels(0, 0, vw, vh, gl.RGBA, gl.UNSIGNED_BYTE, px);
  r.dispose();
  const c2 = document.createElement('canvas'); c2.width = vw; c2.height = vh;
  const g2 = c2.getContext('2d')!, img = g2.createImageData(vw, vh);
  for (let y = 0; y < vh; y++) img.data.set(px.subarray((vh - 1 - y) * vw * 4, (vh - y) * vw * 4), y * vw * 4);
  g2.putImageData(img, 0, 0);
  return c2;
}
function showStill(c: HTMLCanvasElement) {
  let el = document.getElementById('still') as HTMLImageElement | null;
  if (!el) {
    el = document.createElement('img'); el.id = 'still';
    el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:99;cursor:pointer';
    el.onclick = () => el!.remove(); document.body.append(el);
  }
  el.src = c.toDataURL('image/png');
}
/** A deterministic still: a fresh renderer runs `seconds` of the silent drum kit at 30 fps (small
 *  frames, media clock), then renders one w×h frame and shows it as a static image over the page —
 *  the in-app pane doesn't pump WebGL while hidden, but it does draw images. */
function still(m = mode, seconds = 6, w = 1280, h = 720) {
  const c = stillCanvas(m, seconds, w, h); showStill(c);
  return { mode: m, seconds, w: c.width, h: c.height };
}
/** 2×2 contact sheet of four modes (labelled), each a still at `seconds` (or its own "MODE@seconds").
 *  `save` names a PNG the lab server writes to disk. */
function sheet(ms: string[], seconds = 6, w = 960, h = 540, save?: string) {
  const out = document.createElement('canvas'); out.width = w * 2; out.height = h * 2;
  const g = out.getContext('2d')!;
  ms.slice(0, 4).forEach((entry, i) => {
    const [m, at] = entry.split('@');                 // "MODE@6.25" renders that mode at 6.25 s
    const c = stillCanvas(m, at ? Number(at) : seconds, w, h);
    const x = (i % 2) * w, y = Math.floor(i / 2) * h;
    g.drawImage(c, x, y, w, h);
    g.fillStyle = '#000a'; g.fillRect(x, y, 330, 34); g.fillStyle = '#fff'; g.font = '20px monospace'; g.fillText(entry, x + 8, y + 24);
  });
  showStill(out);
  // With a name, the sheet is also written to disk by the lab server (os tmp / plajah-gen-stills) for review.
  if (save) out.toBlob(b => { if (b) void fetch(`/__still?name=${encodeURIComponent(save)}`, { method: 'POST', body: b }).then(r => r.json()).then(j => { (window as any).__lastStill = j.file; }); }, 'image/png');
  return ms;
}
(window as any).genLab = {
  select, modes, bench, still, sheet, getMode: () => mode,
  /** Start building every listed shader in the background; returns ready / building / error per mode. */
  readiness: (ms: string[] = modes) => ms.map(m => { try { return renderer.isReady(m) ? 'ready' : 'building'; } catch (e) { return 'error: ' + String((e as Error).message).slice(0, 600); } }),
  /** Dev hook: play any blob through the lab analyser (not remembered across reloads). */
  playBlob: (b: Blob, name = 'Blob') => playFile(b, name), getFps: () => fps, getFailure: () => failure,
  getAudio: () => ({ bass: audioTex.bass, mid: audioTex.mid, treble: audioTex.treble, level: audioTex.level, vocal: [...audioTex.vocal], sourceName, playing: !!audio && !audio.paused, needsGesture }),
};

// Flux Canvas lab — the Flux Canvas images as Flux scenes: Show (directed between plate and world),
// A · Living Plate, B · Image World, or A | B side by side. Driven by real audio (test groove, a song or
// the microphone), split the way the platform's visualizers hear it, with Music Intelligence's song map
// when a file is loaded. Approvals are kept in this browser so the picks can go into the gallery.
import { renderFluxLatest } from '../engine/core/flux';
import { IMAGE_WORLDS, imagePlateId, imageWorldId, imageShowId, imageWorldReadout, imageWorldDirection, fluxCanvasBase } from '../engine/core/fluxImageWorlds';
import { SILENT_AUDIO, type FluxAudio } from '../../../services/fabula/fluxNode';
import { createFluxTestWav } from '../../../services/fabula/fluxTestGroove';
import { FluxMusicSampler } from '../../../services/fabula/fluxMusic';
import type { SongMap } from '../../../services/fabula/songMap';

const BASE = fluxCanvasBase();   // the production assets (public/visualizers/canvas); scenes are in the real catalog

type Mode = 'show' | 'plate' | 'world' | 'compare';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('screen'), ctx = canvas.getContext('2d')!;
let selected = IMAGE_WORLDS[0].id, mode: Mode = 'show', director = true, morph = true, sensitivity = 1.4;
let t = 0, last = performance.now(), paused = false;
let yaw = 0, pitch = 0, distance = 1;
let audioCtx: AudioContext | undefined, analyser: AnalyserNode | undefined, bins: Uint8Array<ArrayBuffer> | undefined;
let audioEl: HTMLAudioElement | undefined, micStream: MediaStream | undefined, url: string | undefined, sourceName = '', failure = '';
let songMap: SongMap | null = null, songState = '';
let measured: FluxAudio = { ...SILENT_AUDIO };
let holdLive = false;   // the offline harness owns the scenes while it runs
const music = new FluxMusicSampler();

// ── approvals ──
const KEY = 'plajah.fluxCanvas.approved';
const approved: Record<string, boolean> = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
const saveApproved = () => { try { localStorage.setItem(KEY, JSON.stringify(approved)); } catch { /* private mode */ } renderApprovals(); };
const WAYS = [['plate', 'A · Plate'], ['world', 'B · World'], ['show', 'Show']] as const;

// ── tiles ──
const nav = document.querySelector('nav')!;
for (const w of IMAGE_WORLDS) {
  const b = document.createElement('button'); b.className = 'tile'; b.dataset.id = w.id;
  b.innerHTML = `<img src="${BASE}plates/${w.id}.jpg" alt=""><span class="nm">${w.name}</span><span class="md">${w.mood}</span><span class="ok" data-ok></span>`;
  b.onclick = () => select(w.id); nav.append(b);
}
function select(id: string) {
  selected = id; const w = IMAGE_WORLDS.find(x => x.id === id)!, d = imageWorldDirection(id);
  $('title').textContent = w.name; $('mood').textContent = w.mood;
  $('lineA').textContent = w.plate; $('lineB').textContent = w.world;
  $('council').textContent = d.summary ? `Council: ${d.summary}` : '';
  $('council-detail').textContent = d.summary ? `Drop: ${d.looks.drop} · world ${d.shots.world.drop.join(' / ')} · ${d.gestures.drop.join(', ')}. Build: ${d.looks.build} · ${d.gestures.build.join(', ')}. Breakdown: ${d.looks.breakdown} · ${d.gestures.breakdown.join(', ')}. Show: ${Object.entries(d.show).map(([k, v]) => `${k} ${v === 'plate' ? 'A' : 'B'}`).join(', ')}.` : '';
  nav.querySelectorAll<HTMLElement>('.tile').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id)));
  renderApprovals();
}
function setMode(m: Mode) { mode = m; document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); }
document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode as Mode));
function renderApprovals() {
  for (const [way, label] of WAYS) {
    const k = `${selected}:${way}`, btn = $(`approve-${way}`);
    btn.textContent = approved[k] ? `✓ ${label} approved` : `Approve ${label}`;
    btn.setAttribute('aria-pressed', String(!!approved[k]));
  }
  nav.querySelectorAll<HTMLElement>('.tile').forEach(b => {
    const id = b.dataset.id!, marks = WAYS.filter(([w]) => approved[`${id}:${w}`]).map(([w]) => w === 'plate' ? 'A' : w === 'world' ? 'B' : 'Show').join(' ');
    b.querySelector<HTMLElement>('[data-ok]')!.textContent = marks ? '✓ ' + marks : '';
  });
  const list = Object.keys(approved).filter(k => approved[k]);
  $('approved').textContent = list.length ? `Approved (${list.length}): ` + list.map(k => { const [id, way] = k.split(':'); return `${IMAGE_WORLDS.find(w => w.id === id)?.name} ${WAYS.find(x => x[0] === way)?.[1] ?? way}`; }).join(' · ') : 'Nothing approved yet.';
}
for (const [way] of WAYS) $(`approve-${way}`).onclick = () => { const k = `${selected}:${way}`; approved[k] = !approved[k]; saveApproved(); };

// ── camera: director + free look ──
$('director').onclick = () => { director = !director; $('director').setAttribute('aria-pressed', String(director)); $('director').textContent = director ? 'Director: on' : 'Director: off'; };
$('reset').onclick = () => { yaw = 0; pitch = 0; distance = 1; };
$('morph').onclick = () => { morph = !morph; $('morph').setAttribute('aria-pressed', String(morph)); $('morph').textContent = morph ? 'Morph: on' : 'Morph: off'; };
let drag: { x: number; y: number } | null = null;
canvas.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
canvas.onpointermove = e => { if (!drag) return; yaw -= (e.clientX - drag.x) * 0.35; pitch = Math.max(-70, Math.min(70, pitch + (e.clientY - drag.y) * 0.25)); drag = { x: e.clientX, y: e.clientY }; };
canvas.onpointerup = () => { drag = null; };
canvas.onwheel = e => { e.preventDefault(); distance = Math.max(0.4, Math.min(3, distance * Math.exp(e.deltaY * 0.001))); };

// ── device tier ──
const tierSel = $<HTMLSelectElement>('tier');
try { tierSel.value = localStorage.getItem('plajah.flux.tier') || ''; } catch { /* */ }
tierSel.onchange = () => { try { if (tierSel.value) localStorage.setItem('plajah.flux.tier', tierSel.value); else localStorage.removeItem('plajah.flux.tier'); } catch { /* */ } location.reload(); };

// ── audio ──
function showError(e: unknown) { failure = e instanceof Error ? e.message : String(e); }
async function stopAudio() {
  audioEl?.pause(); micStream?.getTracks().forEach(tr => tr.stop()); micStream = undefined;
  await audioCtx?.close().catch(() => {}); audioCtx = undefined; analyser = undefined; if (url) { URL.revokeObjectURL(url); url = undefined; }
}
function makeAnalyser(c: AudioContext) { const a = c.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0.45; bins = new Uint8Array(a.frequencyBinCount); return a; }

/** Music Intelligence on the loaded file: tempo + first beat, then measured sections → a song map. */
async function analyse(blob: Blob) {
  songMap = null; songState = 'Analysing the song…';
  try {
    const decoded = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(await blob.arrayBuffer());
    const sr = 22050, frames = Math.ceil(decoded.duration * sr);
    const off = new OfflineAudioContext(1, frames, sr); const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const tempo = await new Promise<{ bpm: number; confidence: number; firstBeatSec: number } | undefined>(resolve => {
      const w = new Worker(new URL('../../../services/fabula/fluxTempo.worker.ts', import.meta.url), { type: 'module' });
      const n = Math.min(pcm.length, 90 * sr), s12 = new Float32Array(Math.floor(n * 12000 / sr));
      for (let i = 0; i < s12.length; i++) s12[i] = pcm[Math.floor(i * sr / 12000)];
      const done = (v: any) => { clearTimeout(timer); w.terminate(); resolve(v); }; const timer = setTimeout(() => done(undefined), 15000);
      w.onmessage = e => done(e.data); w.onerror = () => done(undefined); w.postMessage({ samples: s12, sampleRate: 12000 }, [s12.buffer]);
    });
    const res = await new Promise<any>(resolve => {
      const w = new Worker(new URL('../../../services/fabula/songMap.worker.ts', import.meta.url), { type: 'module' });
      const copy = pcm.slice();
      w.onmessage = e => { w.terminate(); resolve(e.data); }; w.onerror = e => { w.terminate(); resolve({ error: e.message }); };
      w.postMessage({ pcm: copy, sampleRate: sr, bpm: tempo && tempo.confidence > 0.2 ? tempo.bpm : undefined, firstBeat: tempo?.firstBeatSec }, [copy.buffer]);
    });
    if (res.error) throw new Error(res.error);
    songMap = res.map;
    const kinds = songMap!.sections.map(s => s.kind[0].toUpperCase()).join('');
    songState = `Song map: ${Math.round(songMap!.bpm)} BPM · ${res.measured.key.key} ${res.measured.key.mode} · ${songMap!.sections.length} sections (${kinds}) · ${songMap!.drops.length} drop${songMap!.drops.length === 1 ? '' : 's'}`;
  } catch (e) { songState = `Song analysis failed (${(e as Error).message}); reacting live.`; }
}
async function playFile(blob: Blob, name: string) {
  failure = ''; await stopAudio();
  try {
    audioCtx = new AudioContext(); await audioCtx.resume();
    audioEl = new Audio(); url = URL.createObjectURL(blob); audioEl.src = url; audioEl.loop = true;
    const src = audioCtx.createMediaElementSource(audioEl); analyser = makeAnalyser(audioCtx);
    src.connect(analyser); analyser.connect(audioCtx.destination);
    music.reset(); sourceName = name; await audioEl.play();
    void analyse(blob);
  } catch (e) { showError(e); }
}
async function useMic() {
  failure = ''; await stopAudio(); songMap = null; songState = 'Microphone: reacting live (no song map).';
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    audioCtx = new AudioContext(); await audioCtx.resume(); analyser = makeAnalyser(audioCtx);
    audioCtx.createMediaStreamSource(micStream).connect(analyser); music.reset(); sourceName = 'Microphone';
  } catch (e) { showError(e); }
}
$('demo').onclick = () => void playFile(new Blob([createFluxTestWav()], { type: 'audio/wav' }), 'Test groove · 120 BPM');

/** A synthesized test SONG with real structure (128 BPM): intro, verse, build (snare roll + riser),
 *  drop (kick + eighth-note wobble bass), breakdown, build, drop, outro — to exercise drops and wobble. */
async function makeTestSong(): Promise<Blob> {
  const bpm = 128, b = 60 / bpm, bar = 4 * b, sr = 44100;
  const plan: [string, number][] = [['intro', 8], ['verse', 8], ['build', 4], ['drop', 8], ['breakdown', 8], ['build', 4], ['drop', 8], ['outro', 4]];
  const dur = plan.reduce((a, p) => a + p[1], 0) * bar + 1.5;
  const ac = new OfflineAudioContext(2, Math.ceil(dur * sr), sr), out = ac.createGain(); out.gain.value = 0.7; out.connect(ac.destination);
  const noise = ac.createBuffer(1, sr, sr); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const env = (g: GainNode, t: number, peak: number, dec: number) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); };
  const kick = (t: number) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 1, 0.38); o.connect(g).connect(out); o.start(t); o.stop(t + 0.4); };
  const hit = (t: number, type: BiquadFilterType, f: number, peak: number, dec: number) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = f; env(g, t, peak, dec); s.connect(fl).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.02); };
  const snare = (t: number, v = 0.55) => hit(t, 'bandpass', 1900, v, 0.17), hat = (t: number) => hit(t, 'highpass', 7500, 0.18, 0.04);
  const pad = (t: number, len: number, notes: number[], v = 0.05) => { const g = ac.createGain(), fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.6); g.gain.setValueAtTime(v, t + len - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + len); g.connect(fl).connect(out);
    for (const n of notes) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12); o.detune.value = (Math.random() - 0.5) * 14; o.connect(g); o.start(t); o.stop(t + len); } };
  const wobble = (t: number, len: number, note: number) => { const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (note - 69) / 12); fl.type = 'lowpass'; fl.Q.value = 9; fl.frequency.value = 500; lfo.type = 'sine'; lfo.frequency.value = bpm / 60 * 2; lg.gain.value = 420;
    lfo.connect(lg).connect(fl.frequency); g.gain.value = 0.55; o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + len); lfo.start(t); lfo.stop(t + len); };
  const riser = (t: number, len: number) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; s.loop = true; fl.type = 'bandpass'; fl.Q.value = 2;
    fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(9000, t + len); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + len); s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + len); };
  const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
  let t0 = 0.5;
  for (const [kind, bars] of plan) {
    for (let i = 0; i < bars; i++) {
      const tb = t0 + i * bar, ch = chords[i % 4];
      if (kind !== 'drop') pad(tb, bar, ch, kind === 'breakdown' || kind === 'intro' || kind === 'outro' ? 0.06 : 0.04);
      for (let q = 0; q < 4; q++) {
        const tq = tb + q * b;
        if (kind === 'verse' || kind === 'drop') kick(tq);
        if (kind === 'intro' && i >= 4) hat(tq + b / 2);
        if (kind === 'verse' || kind === 'drop') { hat(tq + b / 2); if (q % 2 === 1) snare(tq); }
        if (kind === 'build') { const div = i < 2 ? 1 : i < 3 ? 2 : 4; for (let k = 0; k < div; k++) snare(tq + k * b / div, 0.25 + 0.35 * (i * 4 + q) / 16); }
      }
      if (kind === 'drop') wobble(tb, bar, i % 4 === 3 ? 31 : 33);
    }
    if (kind === 'build') riser(t0, bars * bar);
    t0 += bars * bar;
  }
  const buf = await ac.startRendering(), n = buf.length, data = new DataView(new ArrayBuffer(44 + n * 4));
  const W = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  W(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); W(8, 'WAVEfmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); W(36, 'data'); data.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
$('song').onclick = async () => playFile(await makeTestSong(), 'Test song · 128 BPM · intro/build/drop/breakdown');
$('mic').onclick = () => void useMic();
$<HTMLInputElement>('audio').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void playFile(f, f.name); };
$<HTMLInputElement>('response').oninput = e => { sensitivity = Number((e.target as HTMLInputElement).value); $('response-value').textContent = sensitivity.toFixed(1) + '×'; };
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; if (audioEl) paused ? audioEl.pause() : void audioEl.play(); };
$('fullscreen').onclick = () => void document.querySelector('.stage')!.requestFullscreen().catch(showError);
function bands(): FluxAudio {
  if (!analyser || !bins || !audioCtx) return { ...SILENT_AUDIO };
  if (audioEl && audioEl.paused) return { ...SILENT_AUDIO };
  analyser.getByteFrequencyData(bins);
  const a: any = music.sample(bins, audioEl ? audioEl.currentTime : audioCtx.currentTime, audioCtx.sampleRate);
  const k = sensitivity / 1.4; for (const key of ['bass', 'mid', 'treble', 'level'] as const) a[key] = Math.min(1.4, a[key] * k);
  if (a.spectrum) a.spectrum = a.spectrum.map((v: number) => Math.min(1.4, v * k));
  if (songMap && audioEl) a.song = { map: songMap, t: audioEl.currentTime };
  return a;
}

// ── song map strip ──
const strip = $<HTMLCanvasElement>('strip'), sctx = strip.getContext('2d')!;
const KIND_COL: Record<string, string> = { intro: '#3b4a6b', verse: '#4f6b5a', build: '#c98a2b', drop: '#e8486a', breakdown: '#6b4f9e', outro: '#3b4a6b' };
function drawStrip() {
  const w = strip.width = strip.clientWidth * Math.min(2, devicePixelRatio), h = strip.height = 28 * Math.min(2, devicePixelRatio);
  sctx.clearRect(0, 0, w, h);
  if (!songMap) { sctx.fillStyle = '#1b1e26'; sctx.fillRect(0, 0, w, h); return; }
  const X = (s: number) => s / songMap!.duration * w;
  for (const s of songMap.sections) { sctx.fillStyle = KIND_COL[s.kind] || '#444'; sctx.fillRect(X(s.start), h * 0.35, Math.max(1, X(s.end) - X(s.start) - 1), h * 0.65); }
  sctx.strokeStyle = 'rgba(255,255,255,.75)'; sctx.lineWidth = 1; sctx.beginPath();
  songMap.energy.forEach((e, i) => { const x = X(i * songMap!.energyStep), y = h * 0.35 * (1 - e); i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }); sctx.stroke();
  sctx.fillStyle = '#fff'; for (const d of songMap.drops) sctx.fillRect(X(d) - 1, 0, 2, h);
  if (audioEl) { sctx.fillStyle = '#e8b86a'; sctx.fillRect(X(audioEl.currentTime) - 1.5, 0, 3, h); }
}
strip.onclick = e => { if (!songMap || !audioEl) return; const r = strip.getBoundingClientRect(); audioEl.currentTime = (e.clientX - r.left) / r.width * songMap.duration; };

// ── render ──
function size() {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 1.25);
  const w = Math.max(2, Math.min(1920, Math.round(box.width * dpr))), h = Math.max(2, Math.round(w * box.height / Math.max(1, box.width)));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function spec(scene: string) { return { scene: scene as any, sensitivity: 1, yaw, pitch, distance, director, morph } as any; }
function draw(time: number, audio: FluxAudio) {
  const W = canvas.width, H = canvas.height;
  if (mode === 'compare') {
    const hw = Math.floor(W / 2);
    const a = renderFluxLatest(spec(imagePlateId(selected)), hw, H, time, audio); if (a) ctx.drawImage(a, 0, 0, hw, H);
    const b = renderFluxLatest(spec(imageWorldId(selected)), W - hw, H, time, audio); if (b) ctx.drawImage(b, hw, 0, W - hw, H);
    ctx.fillStyle = '#000'; ctx.fillRect(hw - 1, 0, 2, H);
    ctx.font = `${Math.round(H * 0.022)}px system-ui`; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText('A · LIVING PLATE', 16, H - 18); ctx.fillText('B · IMAGE WORLD', hw + 16, H - 18);
    return;
  }
  const id = mode === 'plate' ? imagePlateId(selected) : mode === 'world' ? imageWorldId(selected) : imageShowId(selected);
  const r = renderFluxLatest(spec(id), W, H, time, audio); if (r) ctx.drawImage(r, 0, 0, W, H);
}
let frames = 0, fpsAt = performance.now(), fps = 0;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; if (!paused) t += dt;
  if (!document.hidden) {
    size(); measured = bands();
    try { if (!holdLive) draw(t, measured); } catch (e) { showError(e); }
    frames++; if (now - fpsAt > 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    for (const k of ['bass', 'mid', 'treble'] as const) $(`meter-${k}`).style.transform = `scaleX(${Math.min(1, measured[k])})`;
    const r = imageWorldReadout();
    if (r) {
      const c = r.cues, dot = (v: number) => v > 0.5 ? '●' : v > 0.15 ? '•' : '·';
      $('readout').textContent = `${c.section.toUpperCase()}${c.songKnown ? ` ${Math.round(c.sectionProgress * 100)}%` : ' (live)'} · ${r.way === 'plate' ? 'A plate' : 'B world'} · shot ${r.shot} #${r.cut} · beat ${Math.floor(c.beat)} (${(60 / c.beatLen).toFixed(0)} BPM) · kick ${dot(c.kick)} snare ${dot(c.snare)} hat ${dot(c.hat)} · wobble ${(c.wobDepth * 100).toFixed(0)}% · energy ${(c.curve * 100).toFixed(0)}% · build ${(c.build * 100).toFixed(0)}% · drop ${c.drop > 0.05 ? '▲' + (c.drop * 100).toFixed(0) + '%' : '–'}${Number.isFinite(c.toDrop) ? ` (next in ${c.toDrop.toFixed(1)} s)` : ''} · ${fps} fps · tier ${r.tier} · load ${Math.round(r.load * 100)}%`;
    }
    $('audio-state').textContent = failure || (sourceName ? `${sourceName}${measured.level > 0.025 ? ' · signal' : ' · quiet'}${songState ? ' · ' + songState : ''}` : 'No audio yet — play the test groove, load a song, or use the mic.');
    drawStrip();
  }
  requestAnimationFrame(tick);
}
select(selected); setMode(mode); renderApprovals();
requestAnimationFrame(tick);

// Hooks for automated checks: render a still of any scene at a chosen time and audio, and read the director.
(window as any).imgLab = {
  ids: IMAGE_WORLDS.map(w => w.id), select, setMode, readout: imageWorldReadout,
  still(scene: string, w: number, h: number, time: number, audio?: Partial<FluxAudio> & { song?: any }) {
    const a = { ...SILENT_AUDIO, ...(audio || {}) } as FluxAudio;
    let r: HTMLCanvasElement | null = null; for (let i = 0; i < 4; i++) r = renderFluxLatest(spec(scene), w, h, time - (3 - i) / 30, a);
    return r ? r.toDataURL('image/jpeg', 0.82) : null;
  },
  render(scene: string, w: number, h: number, time: number, audio: any) { return renderFluxLatest(spec(scene), w, h, time, audio); },
  getAudio: () => ({ ...measured, sourceName }), getSongMap: () => songMap,
};
window.addEventListener('pagehide', () => void stopAudio());

// ── offline harness: step a scene through a song frame by frame (deterministic, no rAF) ──
// The analyser is emulated (Blackman-windowed 2048 FFT → dB → bytes, smoothing 0.45) so the scene hears
// exactly what it would live, and the song map comes from the same worker the lab uses.
const offline: { map: SongMap | null; frames: FluxAudio[]; fps: number; duration: number } = { map: null, frames: [], fps: 30, duration: 0 };
async function prepareSong(blob?: Blob) {
  holdLive = true;
  const src = blob ?? await makeTestSong();
  const sr = 44100, dec = await new OfflineAudioContext(1, 1, sr).decodeAudioData(await src.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.ceil(dec.duration * sr), sr); const bs = off.createBufferSource(); bs.buffer = dec; bs.connect(off.destination); bs.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const { fft } = await import('../../../services/musicIntel/dsp');
  const N = 2048, win = Float64Array.from({ length: N }, (_, i) => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N));
  const smooth = new Float64Array(N / 2), sampler = new FluxMusicSampler(), frames: FluxAudio[] = [];
  for (let f = 0; f * sr / 30 < pcm.length; f++) {
    const end = Math.floor(f * sr / 30), re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) { const j = end - N + i; re[i] = (j >= 0 ? pcm[j] : 0) * win[i]; }
    fft(re, im);
    const bytes = new Uint8Array(N / 2);
    for (let k = 0; k < N / 2; k++) { const mag = Math.hypot(re[k], im[k]) / N; smooth[k] = 0.45 * smooth[k] + 0.55 * mag; const db = 20 * Math.log10(smooth[k] + 1e-12); bytes[k] = Math.max(0, Math.min(255, Math.round((db + 100) / 70 * 255))); }
    frames.push(sampler.sample(bytes, f / 30, sr));
  }
  // song map through the real worker path
  const d22 = new OfflineAudioContext(1, Math.ceil(dec.duration * 22050), 22050); const b2 = d22.createBufferSource(); b2.buffer = dec; b2.connect(d22.destination); b2.start();
  const p22 = (await d22.startRendering()).getChannelData(0).slice();
  const tempo = await new Promise<any>(resolve => {
    const w = new Worker(new URL('../../../services/fabula/fluxTempo.worker.ts', import.meta.url), { type: 'module' });
    const n = Math.min(p22.length, 90 * 22050), s12 = new Float32Array(Math.floor(n * 12000 / 22050)); for (let i = 0; i < s12.length; i++) s12[i] = p22[Math.floor(i * 22050 / 12000)];
    w.onmessage = e => { w.terminate(); resolve(e.data); }; w.onerror = () => { w.terminate(); resolve(undefined); }; w.postMessage({ samples: s12, sampleRate: 12000 }, [s12.buffer]);
  });
  const res = await new Promise<any>(resolve => {
    const w = new Worker(new URL('../../../services/fabula/songMap.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = e => { w.terminate(); resolve(e.data); }; w.postMessage({ pcm: p22, sampleRate: 22050, bpm: tempo?.confidence > 0.2 ? tempo.bpm : undefined, firstBeat: tempo?.firstBeatSec }, [p22.buffer]);
  });
  Object.assign(offline, { map: res.map, frames, duration: dec.duration });
  return { duration: dec.duration, frames: frames.length, tempo, sections: res.map?.sections.map((s: any) => `${s.kind} ${s.start.toFixed(1)}–${s.end.toFixed(1)}`), drops: res.map?.drops };
}
/** Step `scene` from t0 to t1 (song seconds); log every cut / section change / drop; return the log. */
function runSong(scene: string, t0: number, t1: number, w = 96, h = 54, useMap = true) {
  const log: string[] = []; let lastCut = -1, lastSec = '', lastWay = '';
  for (let f = Math.floor(t0 * 30); f <= Math.min(offline.frames.length - 1, Math.floor(t1 * 30)); f++) {
    const t = f / 30, a: any = { ...offline.frames[f] }; if (useMap && offline.map) a.song = { map: offline.map, t };
    renderFluxLatest(spec(scene), w, h, t, a);
    const r = imageWorldReadout(); if (!r) continue; const c = r.cues;
    if (c.dropHit) log.push(`${t.toFixed(2)} DROP`);
    if (c.section !== lastSec) { log.push(`${t.toFixed(2)} section ${c.section}`); lastSec = c.section; }
    if (r.way !== lastWay) { log.push(`${t.toFixed(2)} way ${r.way}`); lastWay = r.way; }
    if (r.cut !== lastCut) { log.push(`${t.toFixed(2)} cut#${r.cut} ${r.shot} (beat ${c.beat.toFixed(2)}, bar ${(c.beat / 4).toFixed(2)})`); lastCut = r.cut; }
  }
  return log;
}
Object.assign((window as any).imgLab, {
  prepareSong, runSong, offline, release: () => { holdLive = false; },
  stillAt(scene: string, t: number, w = 640, h = 360) {   // after runSong has stepped up to t
    const f = Math.floor(t * 30), a: any = { ...offline.frames[f] }; if (offline.map) a.song = { map: offline.map, t: f / 30 };
    const r = renderFluxLatest(spec(scene), w, h, f / 30, a); return r ? r.toDataURL('image/jpeg', 0.82) : null;
  },
});

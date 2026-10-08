import * as THREE from 'three';
import { loadAtlas, makeVol, disposeVol, lineStreams, clamp, TypoDirector, type Vol, type LyricState } from '../../chora/typo/typoEngine';
import { TYPO_VOLUMES, type TypoVolumeDef } from '../../chora/typo/typoVolumes';
import { TypoAudioAnalyzer } from '../../chora/typo/typoAudio';
import { createFluxTestWav } from '../../../services/fabula/fluxTestGroove';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('screen');
const nav = document.querySelector('nav')!;
const customTextInput = $<HTMLInputElement>('custom-text');

let renderer: THREE.WebGLRenderer | null = null;
let atlas: THREE.CanvasTexture | null = null;
let activeVol: Vol | null = null;
let activeDef: TypoVolumeDef = TYPO_VOLUMES[0];
const audioAnalyzer = new TypoAudioAnalyzer();
const director = new TypoDirector();

let paused = false;
let T = 0;
let lastT = performance.now();
let sensitivity = 1.5;

let audioEl: HTMLAudioElement | undefined;
let audioCtx: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
let url: string | undefined;
let sourceName = '';
let currentPhrase = customTextInput?.value || 'PLAJAH CHORA SACRED GEOMETRY';

const ly: LyricState = { idx: 0, word: -1, words: [] };

// Populate the gallery collection tiles
TYPO_VOLUMES.forEach((v, i) => {
  const b = document.createElement('button');
  b.className = 'tile';
  b.role = 'tab';
  b.dataset.key = v.key;
  b.innerHTML = `
    <span class="n">${String(i + 1).padStart(2, '0')} / VOLUME</span>
    <strong>${v.name}</strong>
    <span>${v.desc || 'Kinetic typographic sacred geometry volume'}</span>
  `;
  b.onclick = () => selectVolume(v.key);
  nav.append(b);
});

function selectVolume(key: string) {
  const def = TYPO_VOLUMES.find(d => d.key === key) || TYPO_VOLUMES[0];
  activeDef = def;
  $('title').textContent = def.name;
  $('description').textContent = def.desc || 'Kinetic typographic sacred geometry volume';
  nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.key === key)));

  if (activeVol && atlas) {
    disposeVol(activeVol, atlas);
    activeVol = null;
  }
  if (atlas) {
    activeVol = makeVol(def, atlas);
    const st = lineStreams(currentPhrase);
    ly.words = st.words;
    activeVol.def.text(activeVol, st, true);
  }
}

if (customTextInput) {
  customTextInput.addEventListener('input', () => {
    currentPhrase = customTextInput.value.trim() || 'PLAJAH CHORA';
    if (activeVol) {
      const st = lineStreams(currentPhrase);
      ly.words = st.words;
      activeVol.def.text(activeVol, st, false);
    }
  });
}

function updatePause() {
  $('pause').textContent = paused ? 'Play' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
}

$('pause').onclick = async () => {
  paused = !paused;
  updatePause();
  if (audioEl) {
    if (paused) audioEl.pause();
    else try { await audioCtx?.resume(); await audioEl.play(); } catch (e) { showError(e); }
  }
};

$('fullscreen').onclick = () => void document.querySelector('.stage')!.requestFullscreen().catch(showError);

function showError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  $('status').textContent = 'ERROR';
  $('audio-state').textContent = msg;
}

async function playFile(blob: Blob, name: string) {
  try {
    audioEl?.pause();
    await audioCtx?.close();
    if (url) URL.revokeObjectURL(url);

    audioCtx = new AudioContext();
    await audioCtx.resume();
    audioEl = new Audio();
    url = URL.createObjectURL(blob);
    audioEl.src = url;
    audioEl.loop = true;

    const source = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;

    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    sourceName = name;
    await audioEl.play();
    paused = false;
    updatePause();
  } catch (e) {
    showError(e);
  }
}

$('demo').onclick = () => void playFile(new Blob([createFluxTestWav()], { type: 'audio/wav' }), 'Test Groove · 120 BPM');

$<HTMLInputElement>('audio').onchange = e => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void playFile(file, file.name);
};

$<HTMLInputElement>('response').oninput = e => {
  sensitivity = Number((e.target as HTMLInputElement).value);
  $('response-value').textContent = sensitivity.toFixed(1) + '×';
};

function resize() {
  if (!renderer) return;
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(2, Math.round(box.width * dpr));
  const h = Math.max(2, Math.round(box.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
  }
}

function frame(now: number) {
  requestAnimationFrame(frame);
  if (!renderer || !atlas || !activeVol) return;

  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!paused) T += dt;

  resize();

  // Progress word highlight slowly across words
  const n = Math.max(1, ly.words.length);
  ly.word = Math.floor(T / 0.85) % n;

  const A = audioAnalyzer.sample(analyser, !paused && Boolean(audioEl && !audioEl.paused), T, dt);

  // Meter bars
  $('meter-bass').style.transform = `scaleX(${clamp(A.kick * sensitivity * 1.2, 0, 1)})`;
  $('meter-mid').style.transform = `scaleX(${clamp(A.voice * sensitivity * 1.2, 0, 1)})`;
  $('meter-treble').style.transform = `scaleX(${clamp(A.treble * sensitivity * 1.2, 0, 1)})`;

  $('status').textContent = sourceName ? (paused ? 'PAUSED' : 'AUDIO ACTIVE') : 'NO AUDIO';
  $('audio-state').textContent = sourceName ? `${sourceName} · reacting live` : 'Play test groove or upload an MP3';
  $('music-state').textContent = `Volume: ${activeDef.name} · ${activeDef.key} · Layer Count: ${activeVol.layers.length}`;

  activeVol.layers.forEach(L => L.tick(dt, ly.word));
  activeVol.def.update(activeVol, T, dt, A, ly);
  director.apply(activeVol, A, dt, T);
  activeVol.layers.forEach(L => L.commit());

  const w = canvas.width || 1, h = canvas.height || 1, aspect = w / h;
  activeVol.cam.aspect = aspect;
  activeVol.cam.fov = director.fov * Math.pow(clamp(1.33 / aspect, 1, 1.8), 0.75);
  activeVol.cam.updateProjectionMatrix();

  renderer.setClearColor(activeVol.bg, 1);
  renderer.render(activeVol.scene, activeVol.cam);
}

// Bootstrap
(async () => {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    resize();
    atlas = await loadAtlas();
    selectVolume(TYPO_VOLUMES[0].key);
    requestAnimationFrame(frame);
  } catch (err) {
    showError(err);
  }
})();

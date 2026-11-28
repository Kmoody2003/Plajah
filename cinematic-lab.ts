// cinematic-lab — steps a Stage project through the real LayerRenderer, slide by slide,
// exactly as an output window composites it (slots persist until a slide replaces or clears them).
import { LayerRenderer } from './services/ambo/layerRenderer';
import { applySlide, type LiveStack, type Slide } from './services/ambo/showModel';
import { deserializeAmboProject, type AmboProject } from './services/ambo/amboProjectModel';

const q = new URLSearchParams(location.search);
const W = Math.max(64, +(q.get('w') || 3712)), H = Math.max(64, +(q.get('h') || 1080));
const canvas = document.getElementById('out') as HTMLCanvasElement;
const label = document.getElementById('label')!;
const renderer = new LayerRenderer(canvas, { w: W, h: H });
renderer.start();

let slides: Slide[] = [];
let index = -1;
let stack: LiveStack = {};

function go(i: number) {
  if (!slides.length) return;
  index = Math.max(0, Math.min(slides.length - 1, i));
  // Rebuild from the first slide so persistent slots behave as they do in a real service.
  stack = {};
  for (let j = 0; j <= index; j++) stack = applySlide(stack, slides[j], performance.now());
  renderer.setStack(stack);
  label.textContent = `${index + 1} / ${slides.length} · ${slides[index].label || slides[index].id} · ${W}×${H}`;
}

function load(p: AmboProject) {
  slides = p.shows.flatMap(s => s.slides);
  document.getElementById('drop')!.style.display = 'none';
  go(+(q.get('s') || 1) - 1);
}

document.getElementById('prev')!.onclick = () => go(index - 1);
document.getElementById('next')!.onclick = () => go(index + 1);
addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(index + 1); if (e.key === 'ArrowLeft') go(index - 1); });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', async e => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) load(deserializeAmboProject(await f.text()));
});

const src = q.get('src');
if (src) fetch(src).then(r => r.text()).then(t => load(deserializeAmboProject(t))).catch(err => { label.textContent = `Could not load ${src}: ${err}`; });
else label.textContent = 'No project loaded';

// For automation: window.__lab.go(n) (0-based), window.__lab.count().
(window as any).__lab = { go, count: () => slides.length, index: () => index };

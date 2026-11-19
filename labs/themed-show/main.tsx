// Themed Shows lab — the Photos slideshow studio with no app around it.
//   npx vite --config themed-show-lab.vite.config.mjs  ->  http://127.0.0.1:3301/
// Ships with painted sample "photos" (mixed shapes, people, some sideways) and a soft
// synthesized pad so live mode, render and Fabula hand-off can be tried with no uploads.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PhotoCatalogWorkspace from '../../components/photo/PhotoCatalogWorkspace';
import ShowStudioHost from '../../components/photo/show/ShowStudioHost';
import '../../index.css';
import ThemedShowStudio, { type ShowSourcePhoto } from '../../components/photo/ThemedShowStudio';
import * as planner from '../../services/slideshow/planner';
import * as prep from '../../services/slideshow/photoPrep';
import { renderShowVideo } from '../../services/slideshow/renderVideo';
import { buildShowProduction } from '../../services/slideshow/fabulaShow';
import { ShowRuntime } from '../../services/slideshow/showRuntime';
import type { ShowSpec } from '../../services/slideshow/types';

/** Debug: render exact frames of a spec into an <img> strip pinned over the page. */
async function stills(spec: ShowSpec, times: number[], w = 960, h = 540) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const rt = new ShowRuntime(c, spec, { width: w, height: h, pixelRatio: 1, preserve: true });
  await rt.load();
  const urls: string[] = [];
  for (const t of times) { await rt.frame(t); urls.push(c.toDataURL('image/jpeg', 0.85)); }
  rt.dispose();
  let box = document.getElementById('stills');
  if (!box) { box = document.createElement('div'); box.id = 'stills'; box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:grid;grid-template-columns:1fr 1fr;gap:4px;overflow:auto'; document.body.appendChild(box); }
  box.innerHTML = urls.map((u, i) => `<div style="position:relative"><img src="${u}" style="width:100%;display:block"/><span style="position:absolute;left:6px;top:4px;color:#ff0;font:12px monospace">t=${times[i]}</span></div>`).join('');
  return { duration: rt.plan.duration, segments: rt.plan.segments.map((s) => [s.id, +s.start.toFixed(2), +s.duration.toFixed(2)]) };
}

const SHAPES: [number, number][] = [[1600, 1200], [1200, 1600], [1400, 1400], [1920, 1080], [1080, 1350], [2000, 900], [1600, 1200], [1200, 1600]];
const SKIES = [['#f6c89f', '#7aa3d1'], ['#ffd6a5', '#c9a0dc'], ['#9fd3f6', '#4f7fb8'], ['#fbe3c3', '#e39a7b'], ['#c4e1d4', '#6d9b8a'], ['#f2e1c1', '#9a8c70']];
const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a1e'];

function paintSample(i: number): Promise<Blob> {
  const [w, h] = SHAPES[i % SHAPES.length];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const [a, b] = SKIES[i % SKIES.length];
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, b); sky.addColorStop(0.6, a); sky.addColorStop(1, '#5b6b45');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4f6b3a'; g.fillRect(0, h * 0.68, w, h * 0.32);
  // a house / tree for detail
  g.fillStyle = '#2f3b2a';
  g.beginPath(); g.arc(w * 0.15, h * 0.5, h * 0.18, 0, Math.PI * 2); g.fill();
  g.fillRect(w * 0.14, h * 0.5, w * 0.02, h * 0.2);
  // people: 1–4 figures, off-centre so the crop has to think
  const people = 1 + (i % 4);
  const cx = w * (0.35 + 0.3 * ((i * 37) % 10) / 10);
  for (let k = 0; k < people; k++) {
    const x = cx + (k - (people - 1) / 2) * w * 0.12, base = h * 0.92, hh = h * (0.42 + 0.05 * (k % 2));
    g.fillStyle = ['#3b5b8c', '#8c3b4f', '#3b8c6a', '#8c7a3b'][(i + k) % 4];
    g.beginPath(); g.roundRect(x - w * 0.045, base - hh, w * 0.09, hh, w * 0.03); g.fill();
    g.fillStyle = SKIN[(i + k) % SKIN.length];
    g.beginPath(); g.ellipse(x, base - hh - h * 0.05, h * 0.045, h * 0.058, 0, 0, Math.PI * 2); g.fill();
  }
  // a faded old-print look on some
  if (i % 3 === 0) { g.fillStyle = 'rgba(240,220,180,0.28)'; g.fillRect(0, 0, w, h); }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `${Math.round(h * 0.035)}px Georgia`;
  g.fillText(`Sample ${i + 1}`, w * 0.03, h * 0.06);
  return new Promise((res) => c.toBlob((bl) => res(bl!), 'image/jpeg', 0.9));
}

/** An obituary / celebration-of-life programme cover: flat colour, serif text, an inset portrait. */
function paintObituary(): Promise<Blob> {
  const w = 1275, h = 1650; // 8.5 x 11 at 150 dpi
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8a6d3b'; g.lineWidth = 6; g.strokeRect(60, 60, w - 120, h - 120);
  g.fillStyle = '#2b2b2b'; g.textAlign = 'center';
  g.font = 'italic 64px Georgia'; g.fillText('Celebrating the Life of', w / 2, 230);
  g.font = 'bold 110px Georgia'; g.fillText('Grace Ellen Moore', w / 2, 380);
  // inset portrait (a soft gradient + face shape, like a photo pasted on the cover)
  const gr = g.createLinearGradient(0, 450, 0, 1150); gr.addColorStop(0, '#9fb4c8'); gr.addColorStop(1, '#5f6f5a');
  g.fillStyle = gr; g.fillRect(337, 460, 600, 700);
  g.fillStyle = '#e0ac69'; g.beginPath(); g.ellipse(637, 720, 120, 150, 0, 0, 7); g.fill();
  g.fillStyle = '#3b4b6c'; g.fillRect(487, 870, 300, 290);
  g.fillStyle = '#2b2b2b';
  g.font = '60px Georgia'; g.fillText('April 3, 1941 – October 21, 2026', w / 2, 1270);
  g.font = '44px Georgia';
  ['Sunrise Baptist Church', "Saturday, November 1 · 11 o'clock", 'Detroit, Michigan'].forEach((t, k) => g.fillText(t, w / 2, 1380 + k * 62));
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.92));
}

/** A slow, soft major-seventh pad (~40s) as a WAV — stands in for a real song. */
function synthPad(seconds = 40, sr = 44100): Blob {
  const n = seconds * sr;
  const data = new Float32Array(n * 2);
  const chords = [[261.6, 329.6, 392.0, 493.9], [220.0, 277.2, 329.6, 415.3], [174.6, 220.0, 261.6, 329.6], [196.0, 246.9, 293.7, 370.0]];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ci = Math.floor(t / 5) % chords.length, local = (t % 5) / 5;
    const env = Math.min(1, local * 4) * Math.min(1, (1 - local) * 4) * 0.6 + 0.4;
    let v = 0;
    for (const f of chords[ci]) v += Math.sin(2 * Math.PI * f * t) * 0.05 + Math.sin(2 * Math.PI * f * 2.001 * t) * 0.012;
    v *= env * Math.min(1, t / 2) * Math.min(1, (seconds - t) / 2);
    data[i * 2] = v * (1 + 0.1 * Math.sin(t * 0.7));
    data[i * 2 + 1] = v * (1 - 0.1 * Math.sin(t * 0.7));
  }
  const buf = new ArrayBuffer(44 + n * 4);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => { for (let k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n * 2; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

function Lab() {
  const [library, setLibrary] = useState<ShowSourcePhoto[] | null>(null);
  useEffect(() => {
    (async () => {
      const out: ShowSourcePhoto[] = [];
      // real photographs (the pack's photographic stills) + one obituary-style cover graphic
      const real = ['open-crane', 'open-drone', 'open-high', 'soft-a', 'soft-b', 'soft-c', 'soft-d', 'soft-e', 'soft-f', 'close-sky-a', 'close-sky-b'];
      real.forEach((id, i) => out.push({ id: `real_${id}`, url: `/slideshow/backyard/${id}.jpg`, title: ['IMG_4021', 'PXL_20230704_183512345', 'grandma_at_the_lake_1987', 'DSC01234', 'christmas-morning-1985', 'WhatsApp Image 2023-05-01 at 10.12.33', 'Uncle Ray fishing', 'IMG_4188', 'family reunion', 'a8f3kz91', 'Screenshot 2024-02-11 at 9.41.02 PM'][i], takenAt: Date.UTC(1980 + Math.floor(i / 3) * 9, 6, 4, 14, i * 7), timeSource: 'user' }));
      out.push({ id: 'obituary_cover', url: URL.createObjectURL(await paintObituary()), title: 'Celebration of Life program', takenAt: Date.UTC(2026, 9, 30), timeSource: 'user' });
      (window as any).showLab.realCount = out.length;
      for (let i = 0; i < 14; i++) {
        const blob = await paintSample(i);
        // samples come in little events: 2-4 shots from the same afternoon, years apart
        const ev = [0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 5, 5][i] ?? i;
        out.push({ id: `sample_${i}`, url: URL.createObjectURL(blob), takenAt: Date.UTC(1972 + ev * 7, (ev * 5) % 12, 12, 15, i * 9), timeSource: 'user' });
      }
      setLibrary(out);
      (window as any).showLab.padUrl = URL.createObjectURL(synthPad());
    })();
  }, []);
  if (!library) return <div style={{ color: '#fff' }}>Painting sample photos…</div>;
  const preset = new URLSearchParams(location.search).get('preset');
  const real = (window as any).showLab.realCount || 0;
  // ?preset=N → first N painted samples; ?real → the real photos + the obituary cover
  const initial = new URLSearchParams(location.search).has('real') ? library.slice(0, real) : preset ? library.slice(real, real + (Number(preset) || 8)) : undefined;
  if (new URLSearchParams(location.search).has('explorer')) {
    // the Photos file explorer as Photos mounts it (mirrored folder + subfolders) + the studio host
    const photos = library.map((p, i) => ({ id: p.id, url: p.url, title: `${p.title || p.id}.jpg`, description: `D:/Pictures/${i < real ? 'Family' : 'Samples'}/${p.title || p.id}.jpg`, ownerId: 'local', timestamp: p.takenAt || Date.now(), mediaType: 'IMAGE', tags: [] } as any));
    const inSub = (sub: string | null) => (sub ? photos.filter((p) => p.description.includes(`/${sub}/`)) : photos);
    return <ExplorerLab photos={photos} inSub={inSub} />;
  }
  return <ThemedShowStudio library={library} initial={initial} />;
}

function ExplorerLab({ photos, inSub }: { photos: any[]; inSub: (s: string | null) => any[] }) {
  const [sub, setSub] = useState<string | null>(null);
  return <div style={{ padding: 12 }}>
    <PhotoCatalogWorkspace photos={inSub(sub)} folderPhotos={inSub} onEdit={() => {}} folderPath="D:/Pictures" folderName="Pictures" subfolders={['Family', 'Samples']} activeSubfolder={sub} onSelectSubfolder={setSub} initialView="catalog" />
    <ShowStudioHost />
  </div>;
}

(window as any).showLab = { planner, prep, renderShowVideo, buildShowProduction, synthPad, ShowRuntime, stills, closeStills: () => document.getElementById('stills')?.remove() };
createRoot(document.getElementById('root')!).render(<Lab />);

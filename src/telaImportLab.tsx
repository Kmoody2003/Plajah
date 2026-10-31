// src/telaImportLab.tsx: the full Tela editor plus a fidelity bench for design-file import.
// window.importLab.importUrl('/@fs/D:/x.psd') imports through the real worker path;
// window.importLab.fidelity(url) renders the imported page and scores it against Photoshop's composite.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import TelaView from '../components/tela/TelaView';
import { importPsdDocument } from '../services/tela/import/psdImport';
import { deviceToSvg } from '../services/tela/geometry/serialize';
import { resolveFontsInPage } from '../services/tela/import/fontResolve';
import type { RgbaImage } from '../services/tela/import/types';

async function toUrl(im: RgbaImage): Promise<string> {
  const c = document.createElement('canvas'); c.width = Math.max(1, im.width); c.height = Math.max(1, im.height);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0);
  return c.toDataURL('image/png');
}
async function fetchFile(url: string, name?: string) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); const blob = await r.blob(); return new File([blob], name || decodeURIComponent(url.split('/').pop() || 'file').split(/[\/]/).pop()!); }

(window as any).importLab = {
  async fetchFile(url: string) { return fetchFile(url); },
  /** Local-only: pixels stay as data URLs. Returns the score and sets up images on the page. */
  async fidelity(url: string, opts: { show?: boolean } = {}) {
    const file = await fetchFile(url); const t0 = performance.now();
    const r = await importPsdDocument(new Uint8Array(await file.arrayBuffer()), { fileName: file.name, wantComposite: true, env: { putImage: async im => ({ src: await toUrl(im) }), resolveFonts: async n => resolveFontsInPage(n) } });
    const page = r.pages[0]; const svg = deviceToSvg(page as never, { background: '#ffffff' });
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg render failed')); img.src = blobUrl; });
    const W = page.width, H = page.height, maxSide = 1200, k = Math.min(1, maxSide / Math.max(W, H)), cw = Math.round(W * k), ch = Math.round(H * k);
    const draw = (src: CanvasImageSource) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', { willReadFrequently: true })!; g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch); return c; };
    const ours = draw(img);
    let psnr: number | null = null, refCanvas: HTMLCanvasElement | null = null;
    if (r.composite) {
      const c0 = document.createElement('canvas'); c0.width = r.composite.width; c0.height = r.composite.height;
      c0.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.composite.data), c0.width, c0.height), 0, 0);
      refCanvas = draw(c0);
      const a = ours.getContext('2d')!.getImageData(0, 0, cw, ch).data, b = refCanvas.getContext('2d')!.getImageData(0, 0, cw, ch).data; let se = 0;
      for (let i = 0; i < a.length; i += 4) { const d0 = a[i] - b[i], d1 = a[i + 1] - b[i + 1], d2 = a[i + 2] - b[i + 2]; se += d0 * d0 + d1 * d1 + d2 * d2; }
      const mse = se / (cw * ch * 3); psnr = mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
    }
    if (opts.show) {
      let host = document.getElementById('fid') as HTMLDivElement | null;
      if (!host) { host = document.createElement('div'); host.id = 'fid'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#222;display:flex;gap:8px;padding:8px;overflow:auto;align-items:flex-start'; document.body.appendChild(host); }
      host.innerHTML = ''; [ours, refCanvas].forEach(c => { if (c) { c.style.cssText = 'max-width:calc(50vw - 16px);height:auto;border:1px solid #555'; host!.appendChild(c); } });
    }
    return { name: file.name, ms: Math.round(performance.now() - t0), psnr: psnr && +psnr.toFixed(2), objects: page.objects.length, features: r.report.features.map(f => `${f.status}:${f.feature}`), fonts: r.report.fonts.map(f => `${f.requested}->${f.status}`) };
  },
  /** Drop a design file through the real TelaView input. */
  async inject(url: string) {
    const file = await fetchFile(url); const input = document.querySelector('input[type=file][accept*=".psd"]') as HTMLInputElement | null;
    if (!input) throw new Error('design input not mounted'); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return file.name;
  },
};
createRoot(document.getElementById('root')!).render(<TelaView onBack={() => {}} />);

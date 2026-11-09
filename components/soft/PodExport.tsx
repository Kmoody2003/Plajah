// Print-on-demand hand-off: your pattern + your artwork → one print-ready PNG per panel (bleed past
// the cutting line, grain up the file), proof SVGs with the guides, and a manifest, zipped for
// Printful / Printify / Gooten all-over-print intake. Runs on this device: the artwork is read here,
// nothing is uploaded, no provider login is asked for, and you pay the provider directly.

import React, { useState } from 'react';
import { Shirt, Upload, Download, ExternalLink } from 'lucide-react';
import { zipSync } from 'fflate';
import type { Pattern } from '../../services/soft/patterns';
import { POD_PROFILES, podPanels, rasterizePanel, podFiles, type PodProviderId, type PodArt, type PodImage } from '../../services/soft/pod';

export default function PodExport({ pattern, name, guard }: { pattern: Pattern; name: string; guard: (f: () => void) => void }) {
  const [prov, setProv] = useState<PodProviderId>('printful'); const [dpi, setDpi] = useState(POD_PROFILES.printful.dpi); const [bleed, setBleed] = useState(POD_PROFILES.printful.bleedMm);
  const [img, setImg] = useState<PodImage | null>(null); const [tile, setTile] = useState(200); const [colour, setColour] = useState('#f472b6');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = (f: File) => { const r = new FileReader(); r.onload = () => { const href = String(r.result); const im = new Image(); im.onload = () => setImg({ href, px: [im.naturalWidth, im.naturalHeight] }); im.onerror = () => setMsg('That file could not be read as an image.'); im.src = href; }; r.readAsDataURL(f); };
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const provider = { ...POD_PROFILES[prov], dpi, bleedMm: bleed }; const art: PodArt = img ? { mode: 'tile', image: img, tileMm: tile } : { mode: 'colour', colour };
      const h = podPanels(pattern, art, provider, { style: name }); const pngs: Record<string, Uint8Array> = {};
      for (const p of h.panels) pngs[p.file] = new Uint8Array(await (await rasterizePanel(p)).arrayBuffer());
      const zip = zipSync(podFiles(h, pngs), { level: 0 }); const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a'); a.href = url; a.download = `${name} ${provider.name} panels.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg(`${h.panels.length} panels at ${dpi} dpi.${h.warnings.length ? ` Check: ${h.warnings.slice(0, 3).join(' ')}` : ''}`);
    } catch (e) { setMsg(`Could not build the panels: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const P = POD_PROFILES[prov];
  return <div data-testid="sew-pod"><div className="sew-h"><Shirt size={12}/>Print-on-demand (cut &amp; sew)</div>
    <select className="sew-in" value={prov} onChange={e => { const id = e.target.value as PodProviderId; setProv(id); setDpi(POD_PROFILES[id].dpi); setBleed(POD_PROFILES[id].bleedMm); }} data-testid="sew-pod-provider">{Object.values(POD_PROFILES).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <div className="grid grid-cols-2 gap-1.5 mt-1">
      <label className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>DPI<input className="sew-in" type="number" min={72} max={600} value={dpi} onChange={e => setDpi(Math.max(72, Math.min(600, +e.target.value || 150)))}/></label>
      <label className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>Bleed (mm)<input className="sew-in" type="number" min={0} max={30} value={bleed} onChange={e => setBleed(Math.max(0, Math.min(30, +e.target.value || 0)))}/></label>
    </div>
    <label className="sew-btn w-full justify-center cursor-pointer mt-1.5"><Upload size={12}/>{img ? `Artwork ${img.px[0]}×${img.px[1]} px: change` : 'Your artwork (tiled all over)'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); }} data-testid="sew-pod-art"/></label>
    {img ? <label className="block text-[10.5px] mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>Tile width {tile / 10} cm ({Math.round(img.px[0] / (tile / 25.4))} ppi)<input type="range" min={30} max={1500} step={10} value={tile} onChange={e => setTile(+e.target.value)} className="w-full"/></label>
      : <label className="flex items-center gap-2 text-[10.5px] mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>Or a flat colour<input type="color" value={colour} onChange={e => setColour(e.target.value)}/></label>}
    <button className="sew-btn sew-primary w-full justify-center mt-1.5" onClick={() => guard(() => { void run(); })} disabled={busy} data-testid="sew-pod-export"><Download size={12}/>{busy ? 'Rendering panels…' : 'Download print-ready panels (.zip)'}</button>
    <div className="text-[10.5px] mt-1" style={{ color: 'rgba(255,255,255,.5)' }}>One PNG per panel (sRGB, transparent outside, grain up the file) plus guide SVGs and a manifest. Upload them in your own {P.name} account and pay {P.name} directly: Plajah holds no money and never asks for your {P.name} login. Check the product template for its exact panel sizes. <a href={P.url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">{P.name}<ExternalLink size={9}/></a></div>
    {msg && <div className="text-[11px] mt-1" style={{ color: '#fbcfe8' }} data-testid="sew-pod-msg">{msg}</div>}
  </div>;
}

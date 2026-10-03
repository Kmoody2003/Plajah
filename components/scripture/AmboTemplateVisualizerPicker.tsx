// AmboTemplateVisualizerPicker — the 'visualizer' field editor for slide
// templates. Lists every platform visualizer Ambo's Visualizers tab offers
// (Pixels scene catalogue, the GLSL shader library, Ambo's generators and the
// Butterchurn/Milkdrop presets) with the SAME thumbnails (AmboVisualizerThumb).
//
// Stored value (a plain string, like every template field):
//   ''                       none
//   '<GENERATOR MODE>'       e.g. 'STUDIO_AURORA', a Flux/Studio scene mode
//   'MILKDROP:<preset name>' a Butterchurn preset (layerSources' MILKDROP_PREFIX)
//   'SHADER:<library name>'  a SHADER_LIBRARY entry — resolve with resolveVisualizerValue()
// Loaded lazily by AmboTemplateFieldEditors so the gallery stays light.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Search, X, Ban } from 'lucide-react';
import type { AmboMediaSourceItem } from './AmboMediaBin';
import { AmboVisualizerThumb } from './AmboVisualizerThumb';
import { SCENE_CATALOG } from '../plajahPixels/engine/sceneCatalog';
import { SHADER_LIBRARY } from '../plajahPixels/components/ShaderPanel';
import { GENERATOR_ITEMS } from '../../services/ambo/mediaLibrary';
import { MILKDROP_PREFIX } from '../../services/ambo/layerSources';

const LILAC = '#D0BCFF', CYAN = '#00DAF3';
export const SHADER_VALUE_PREFIX = 'SHADER:';

export interface VisualizerEntry extends AmboMediaSourceItem { value: string; group: string }

let milkdropNames: string[] | null = null;
let milkdropLoad: Promise<string[]> | null = null;
function loadMilkdropNames(): Promise<string[]> {
  if (milkdropNames) return Promise.resolve(milkdropNames);
  milkdropLoad ??= import('butterchurn-presets').then(mod => {
    const api: any = (mod as any).default || mod;
    const presets = api.getPresets ? api.getPresets() : api;
    milkdropNames = Object.keys(presets || {}).sort();
    return milkdropNames;
  }).catch(() => (milkdropNames = []));
  return milkdropLoad;
}

/** Every platform visualizer, deduped by stored value. */
export function buildVisualizerCatalog(milk: string[]): VisualizerEntry[] {
  const out: VisualizerEntry[] = [];
  const seen = new Set<string>();
  const add = (e: VisualizerEntry) => { if (!e.value || seen.has(e.value)) return; seen.add(e.value); out.push(e); };
  for (const s of SCENE_CATALOG) add({
    id: `scn_${s.mode}`, name: s.name, kind: 'GENERATOR', mode: s.mode, value: String(s.mode), sub: s.cat,
    group: s.kind === 'three' ? 'Flux & 3D' : s.kind === 'classic' ? 'Classic' : 'Studio',
    gradient: s.kind === 'three' ? 'linear-gradient(135deg, #00DAF3, #6B0099)' : 'linear-gradient(135deg, #1e1b4b, #4338ca)',
  });
  for (const g of GENERATOR_ITEMS) {
    const mode = g.content.kind === 'GENERATOR' ? g.content.mode : '';
    add({ id: g.id, name: g.name, kind: 'GENERATOR', mode, value: mode, sub: g.category, group: 'Ambo', gradient: 'linear-gradient(135deg, #042f2e, #0d9488)' });
  }
  SHADER_LIBRARY.forEach((s, i) => add({
    id: `sh_${i}_${s.name.replace(/\s+/g, '_')}`, name: s.name, kind: 'SHADER', src: s.src, mode: s.src,
    value: SHADER_VALUE_PREFIX + s.name, sub: `${s.setTitle || s.category || 'Shader'}${s.series ? ` · Series ${s.series}` : ''}`,
    group: s.series ? `Series ${s.series}` : 'Shaders',
    gradient: s.series === 'VI' ? 'linear-gradient(135deg, #FF8C00, #D40055)' : s.series === 'VII' ? 'linear-gradient(135deg, #D0BCFF, #6B0099)' : 'linear-gradient(135deg, #0d9488, #111827)',
  }));
  for (const [i, n] of milk.entries()) add({
    id: `milk_${i}`, name: n.length > 36 ? n.slice(0, 34) + '…' : n, kind: 'GENERATOR', mode: MILKDROP_PREFIX + n,
    value: MILKDROP_PREFIX + n, sub: 'Milkdrop preset', group: 'Milkdrop', gradient: 'linear-gradient(135deg, #120a1f, #2e1065)',
  });
  return out;
}

/** Stored value → the layer content a template/live drawer should run. */
export function resolveVisualizerValue(v: string): { kind: 'GENERATOR'; mode: string } | { kind: 'SHADER'; src: string; name: string } | null {
  if (!v) return null;
  if (v.startsWith(SHADER_VALUE_PREFIX)) {
    const name = v.slice(SHADER_VALUE_PREFIX.length);
    const hit = SHADER_LIBRARY.find(s => s.name === name);
    return hit ? { kind: 'SHADER', src: hit.src, name } : null;
  }
  return { kind: 'GENERATOR', mode: v };
}

const PAGE = 48;

const AmboTemplateVisualizerPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [milk, setMilk] = useState<string[]>(milkdropNames || []);
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { if (open && !milkdropNames) loadMilkdropNames().then(setMilk); }, [open]);
  useEffect(() => setLimit(PAGE), [group, q]);
  const all = useMemo(() => buildVisualizerCatalog(milk), [milk]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(all.map(e => e.group)))], [all]);
  const current = all.find(e => e.value === value);
  const needle = q.trim().toLowerCase();
  const matches = all.filter(e => (group === 'All' || e.group === group) && (!needle || `${e.name} ${e.sub || ''}`.toLowerCase().includes(needle)));

  const currentLabel = !value ? 'None' : current ? current.name : value.startsWith(MILKDROP_PREFIX) ? value.slice(MILKDROP_PREFIX.length) : value.replace(SHADER_VALUE_PREFIX, '');
  return (
    <div data-testid="visualizer-editor">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(o => !o)} className="w-[104px] h-[58px] flex-none rounded-md overflow-hidden relative" title="Choose a visualizer"
          style={{ border: `1px solid ${open ? CYAN : 'rgba(255,255,255,.14)'}`, background: '#120a1f' }}>
          {current ? <AmboVisualizerThumb item={current} hovered /> : <span className="absolute inset-0 grid place-items-center text-white/30">{value ? <Sparkles size={16} /> : <Ban size={16} />}</span>}
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div data-testid="visualizer-current" className="text-[11px] font-bold truncate" style={{ color: value ? LILAC : 'rgba(255,255,255,.5)' }}>{currentLabel}</div>
          <div className="text-[9.5px] text-white/40 truncate">{current ? `${current.group} · ${current.sub || ''}` : value ? 'Platform visualizer' : 'No visualizer'}</div>
          <div className="flex gap-1 mt-1">
            <button onClick={() => setOpen(o => !o)} className="h-6 px-2 rounded-md text-[10px] font-bold inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/75"><Sparkles size={11} />{open ? 'Close' : 'Choose'}</button>
            {value && <button onClick={() => onChange('')} className="h-6 px-2 rounded-md text-[10px] font-bold inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/75"><X size={11} />None</button>}
          </div>
        </div>
      </div>
      {open && (
        <div className="mt-1.5 rounded-lg p-2" style={{ background: 'rgba(8,6,16,.85)', border: '1px solid rgba(208,188,255,.22)' }}>
          <div className="flex items-center gap-1 rounded-md px-1.5 h-6 mb-1.5" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}>
            <Search size={11} className="text-white/40" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${all.length} visualizers`} className="flex-1 bg-transparent outline-none text-[10.5px] min-w-0 text-white" />
          </div>
          <div className="flex gap-1 flex-wrap mb-1.5">
            {groups.map(g => (
              <button key={g} onClick={() => setGroup(g)} className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold"
                style={{ color: group === g ? '#0b0a12' : 'rgba(255,255,255,.55)', background: group === g ? LILAC : 'rgba(255,255,255,.05)' }}>{g}</button>
            ))}
          </div>
          <div className="max-h-[260px] overflow-y-auto grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
            <button onClick={() => { onChange(''); setOpen(false); }} data-value="" className="rounded-md overflow-hidden text-left"
              style={{ outline: !value ? `2px solid ${CYAN}` : '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)' }}>
              <div className="relative grid place-items-center text-white/30" style={{ aspectRatio: '16 / 9' }}><Ban size={16} /></div>
              <div className="px-1 py-0.5 text-[9px] font-semibold">None</div>
            </button>
            {matches.slice(0, limit).map(e => (
              <button key={e.value} data-value={e.value} onClick={() => { onChange(e.value); setOpen(false); }} onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(h => (h === e.id ? null : h))}
                title={`${e.name}\n${e.sub || ''}`} className="rounded-md overflow-hidden text-left"
                style={{ outline: value === e.value ? `2px solid ${CYAN}` : '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)' }}>
                <div className="relative" style={{ aspectRatio: '16 / 9' }}><AmboVisualizerThumb item={e} hovered={hover === e.id} /></div>
                <div className="px-1 py-0.5 leading-tight">
                  <div className="text-[9px] font-semibold truncate">{e.name}</div>
                  <div className="text-[8px] text-white/35 truncate">{e.group}</div>
                </div>
              </button>
            ))}
          </div>
          {matches.length > limit && <button onClick={() => setLimit(l => l + PAGE)} className="mt-1.5 w-full h-6 rounded-md text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/70">Show more ({matches.length - limit} left)</button>}
        </div>
      )}
    </div>
  );
};

export default AmboTemplateVisualizerPicker;

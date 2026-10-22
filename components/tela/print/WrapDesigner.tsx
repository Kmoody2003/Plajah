// Wrap designer — vehicle wraps (parametric templates + measured size) and object dielines (labels, cup
// sleeves, tuck boxes, stickers). Shows the guide, the panel/media plan and preflight live; "Create design
// board" hands Tela an artboard whose guide layer is the template. Sizes are guides — the shop measures.

import React, { useMemo, useState } from 'react';
import type { SpotColor } from '../../../services/print/types';
import {
  VEHICLE_TEMPLATES, buildVehicleWrap, tileJob, wrapPreflight, wrapTemplateLayout, objectWrapJob,
  cylinderWrap, coneSleeve, tuckEndBox, stickerCut, printableWidthIn,
  type VehicleTemplateId, type WrapJob, type Dieline,
} from '../../../services/print/wrap';

export interface WrapArtboard {
  label: string;
  /** Full-size (real-world) inches of the guide layout. The board is drawn at widthIn × scale. */
  widthIn: number;
  heightIn: number;
  /** Artboard ÷ real size (0.1 = 1:10). */
  scale: number;
  guideSvg: string;
  job: WrapJob | null;
  dielineSpot?: SpotColor[];
}

interface Props {
  onCreateArtboard?: (artboard: WrapArtboard) => void;
  onClose?: () => void;
}

type ObjectKind = 'cylinder' | 'cone' | 'tuck' | 'sticker';

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1">{children}</div>
);

const Num: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }> = ({ label, value, onChange, step = 1, min = 0, suffix = 'in' }) => (
  <label className="block">
    <Label>{label}</Label>
    <div className="flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-2 py-1">
      <input type="number" className="w-full bg-transparent text-sm text-white outline-none" value={value} step={step} min={min}
        onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= min) onChange(v); }} />
      <span className="text-[11px] text-white/40">{suffix}</span>
    </div>
  </label>
);

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) => (
  <div className="flex rounded-md bg-white/5 border border-white/10 p-0.5">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onChange(v)}
        className={`flex-1 rounded px-2 py-1 text-xs transition ${value === v ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'}`}>{l}</button>
    ))}
  </div>
);

const mid = (r: [number, number]) => Math.round((r[0] + r[1]) / 2);
const LEVEL = { error: 'text-red-300 border-red-400/30 bg-red-500/10', warn: 'text-amber-200 border-amber-400/30 bg-amber-500/10', info: 'text-sky-200 border-sky-400/20 bg-sky-500/10' } as const;

const WrapDesigner: React.FC<Props> = ({ onCreateArtboard, onClose }) => {
  const [mode, setMode] = useState<'vehicle' | 'object'>('vehicle');
  const [tpl, setTpl] = useState<VehicleTemplateId>('cargo-van');
  const t0 = VEHICLE_TEMPLATES[tpl].typical;
  const [dims, setDims] = useState({ lengthIn: mid(t0.lengthIn), heightIn: mid(t0.heightIn), widthIn: mid(t0.widthIn) });
  const [film, setFilm] = useState<'none' | 'perforated'>('none');
  const [roll, setRoll] = useState(60);
  const [overlap, setOverlap] = useState(1);
  const [bleed, setBleed] = useState(3);

  const [obj, setObj] = useState<ObjectKind>('cylinder');
  const [cyl, setCyl] = useState({ d: 2.6, h: 4, ov: 0.25 });
  const [cone, setCone] = useState({ top: 3.5, bottom: 2.5, h: 2.5, ov: 0.375 });
  const [box, setBox] = useState({ l: 4, w: 2, d: 6, cal: 0.018 });
  const [stk, setStk] = useState<{ shape: 'circle' | 'rounded-rect' | 'rect'; w: number; h: number; r: number }>({ shape: 'circle', w: 3, h: 3, r: 0.25 });

  const pickTemplate = (id: VehicleTemplateId) => {
    setTpl(id);
    const t = VEHICLE_TEMPLATES[id].typical;
    setDims({ lengthIn: mid(t.lengthIn), heightIn: mid(t.heightIn), widthIn: mid(t.widthIn) });
  };

  const dieline: Dieline | null = useMemo(() => {
    if (mode !== 'object') return null;
    try {
      if (obj === 'cylinder') return cylinderWrap(cyl.d, cyl.h, cyl.ov);
      if (obj === 'cone') return coneSleeve(cone.top, cone.bottom, cone.h, cone.ov);
      if (obj === 'tuck') return tuckEndBox(box.l, box.w, box.d, box.cal);
      return stickerCut(stk.shape, stk.w, stk.h, stk.r);
    } catch { return null; }
  }, [mode, obj, cyl, cone, box, stk]);

  const job: WrapJob | null = useMemo(() => {
    if (mode === 'object') return dieline ? objectWrapJob(dieline) : null;
    if (!(dims.lengthIn > 0 && dims.heightIn > 0 && dims.widthIn > 0)) return null;
    return buildVehicleWrap(tpl, { ...dims, windowFilm: film }, { bleedIn: bleed, material: { rollWidthIn: roll, overlapIn: overlap } });
  }, [mode, dieline, tpl, dims, film, bleed, roll, overlap]);

  const layout = useMemo(() => job ? wrapTemplateLayout(mode === 'object' && dieline ? dieline : job) : null, [job, dieline, mode]);
  const tiles = useMemo(() => job && mode === 'vehicle' ? tileJob(job) : [], [job, mode]);
  const findings = useMemo(() => job ? wrapPreflight(job) : [], [job]);
  const totals = tiles.reduce((a, t) => ({ panels: a.panels + t.panels.length, linear: a.linear + t.linearIn, media: a.media + t.mediaSqFt, area: a.area + t.surfaceSqFt }), { panels: 0, linear: 0, media: 0, area: 0 });

  const label = job?.label || 'Wrap';
  const create = () => {
    if (!job || !layout) return;
    onCreateArtboard?.({
      label: mode === 'vehicle' ? `${label} wrap` : label, widthIn: layout.widthIn, heightIn: layout.heightIn,
      scale: job.designScale, guideSvg: layout.svg, job, dielineSpot: dieline?.spots,
    });
  };
  const download = () => {
    if (!layout) return;
    const url = URL.createObjectURL(new Blob([layout.svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${label.replace(/[^\w]+/g, '-').toLowerCase()}-panel-guide.svg`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex h-full max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#11131a] text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Wrap designer</div>
          <div className="text-[11px] text-white/45">Vehicle panels and object dielines for wide-format and label shops</div>
        </div>
        {onClose && <button type="button" onClick={onClose} className="rounded px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">✕</button>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr]">
        <div className="space-y-4 overflow-y-auto border-b border-white/10 p-4 md:border-b-0 md:border-r">
          <Seg<'vehicle' | 'object'> value={mode} onChange={setMode} options={[['vehicle', 'Vehicle'], ['object', 'Object']]} />

          {mode === 'vehicle' ? (
            <>
              <div>
                <Label>Template</Label>
                <select value={tpl} onChange={e => pickTemplate(e.target.value as VehicleTemplateId)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none">
                  {Object.values(VEHICLE_TEMPLATES).map(t => <option key={t.id} value={t.id} className="bg-[#11131a]">{t.label}</option>)}
                </select>
              </div>
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-100">
                Measure your vehicle. Typical {VEHICLE_TEMPLATES[tpl].label.toLowerCase()}: {t0.lengthIn.join('–')} in long, {t0.heightIn.join('–')} in high, {t0.widthIn.join('–')} in wide. Panel sizes below are approximate guides from these numbers — the shop measures every panel before print.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Num label="Length" value={dims.lengthIn} onChange={v => setDims(d => ({ ...d, lengthIn: v }))} />
                <Num label="Height" value={dims.heightIn} onChange={v => setDims(d => ({ ...d, heightIn: v }))} />
                <Num label="Width" value={dims.widthIn} onChange={v => setDims(d => ({ ...d, widthIn: v }))} />
              </div>
              <div>
                <Label>Window film</Label>
                <Seg<'none' | 'perforated'> value={film} onChange={setFilm} options={[['none', 'Clear'], ['perforated', 'Perforated 50/50']]} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Num label="Roll" value={roll} onChange={setRoll} step={1} min={12} />
                <Num label="Overlap" value={overlap} onChange={setOverlap} step={0.25} />
                <Num label="Bleed" value={bleed} onChange={setBleed} step={0.5} />
              </div>
              <div className="text-[11px] text-white/45">Printable {printableWidthIn({ name: '', rollWidthIn: roll, overlapIn: overlap, laminate: true })} in of a {roll} in roll. Designed at 1:10.</div>
            </>
          ) : (
            <>
              <div>
                <Label>Object</Label>
                <div className="grid grid-cols-2 gap-1">
                  {([['cylinder', 'Can / bottle'], ['cone', 'Cup sleeve'], ['tuck', 'Tuck box'], ['sticker', 'Sticker']] as Array<[ObjectKind, string]>).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setObj(k)}
                      className={`rounded-md border px-2 py-1.5 text-xs ${obj === k ? 'border-white/30 bg-white/15' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}>{l}</button>
                  ))}
                </div>
              </div>
              {obj === 'cylinder' && <div className="grid grid-cols-3 gap-2">
                <Num label="Diameter" value={cyl.d} step={0.05} onChange={d => setCyl(c => ({ ...c, d }))} />
                <Num label="Height" value={cyl.h} step={0.05} onChange={h => setCyl(c => ({ ...c, h }))} />
                <Num label="Overlap" value={cyl.ov} step={0.0625} onChange={ov => setCyl(c => ({ ...c, ov }))} />
              </div>}
              {obj === 'cone' && <div className="grid grid-cols-2 gap-2">
                <Num label="Top ⌀" value={cone.top} step={0.05} onChange={top => setCone(c => ({ ...c, top }))} />
                <Num label="Bottom ⌀" value={cone.bottom} step={0.05} onChange={bottom => setCone(c => ({ ...c, bottom }))} />
                <Num label="Height" value={cone.h} step={0.05} onChange={h => setCone(c => ({ ...c, h }))} />
                <Num label="Glue tab" value={cone.ov} step={0.0625} onChange={ov => setCone(c => ({ ...c, ov }))} />
              </div>}
              {obj === 'tuck' && <div className="grid grid-cols-2 gap-2">
                <Num label="Length" value={box.l} step={0.125} onChange={l => setBox(b => ({ ...b, l }))} />
                <Num label="Width" value={box.w} step={0.125} onChange={w => setBox(b => ({ ...b, w }))} />
                <Num label="Depth" value={box.d} step={0.125} onChange={d => setBox(b => ({ ...b, d }))} />
                <Num label="Board caliper" value={box.cal} step={0.001} onChange={cal => setBox(b => ({ ...b, cal }))} />
              </div>}
              {obj === 'sticker' && <>
                <Seg value={stk.shape} onChange={shape => setStk(s => ({ ...s, shape }))} options={[['circle', 'Circle'], ['rounded-rect', 'Rounded'], ['rect', 'Square']]} />
                <div className="grid grid-cols-3 gap-2">
                  <Num label="Width" value={stk.w} step={0.125} onChange={w => setStk(s => ({ ...s, w }))} />
                  <Num label="Height" value={stk.h} step={0.125} onChange={h => setStk(s => ({ ...s, h }))} />
                  {stk.shape === 'rounded-rect' && <Num label="Corner" value={stk.r} step={0.0625} onChange={r => setStk(s => ({ ...s, r }))} />}
                </div>
              </>}
              {dieline && <div className="text-[11px] text-white/55">Flat {dieline.flatIn[0]} × {dieline.flatIn[1]} in · CutContour{dieline.crease.length ? ' + Crease' : ''} spots</div>}
            </>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button type="button" disabled={!job} onClick={create}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#11131a] hover:bg-white/90 disabled:opacity-40">Create design board</button>
            <button type="button" disabled={!layout} onClick={download}
              className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40">Download panel guide (SVG)</button>
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            {layout
              ? <div className="max-h-[48vh] overflow-auto [&>svg]:h-auto [&>svg]:max-h-[46vh] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: layout.svg }} />
              : <div className="py-10 text-center text-sm text-white/40">Enter sizes to see the template.</div>}
          </div>

          {mode === 'vehicle' && tiles.length > 0 && (
            <div>
              <Label>Panels · {totals.panels} panels · {(totals.linear / 12).toFixed(1)} ft of roll · {totals.media.toFixed(0)} sq ft media for {totals.area.toFixed(0)} sq ft of vehicle</Label>
              <div className="overflow-hidden rounded-md border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-white/45"><tr><th className="px-2 py-1 font-normal">Surface</th><th className="px-2 py-1 font-normal">Panels</th><th className="px-2 py-1 font-normal">Print sizes (in)</th><th className="px-2 py-1 font-normal text-right">Roll</th></tr></thead>
                  <tbody>
                    {tiles.map(t => {
                      const s = job!.surfaces.find(x => x.id === t.surfaceId)!;
                      return (
                        <tr key={t.surfaceId} className="border-t border-white/5 text-white/75">
                          <td className="px-2 py-1">{s.label}<div className="text-[10px] text-white/35">{s.w.toFixed(0)} × {s.h.toFixed(0)} in{t.orientation === 'sideways' ? ' · printed sideways' : ''}{t.snapped.length ? ` · ${t.snapped.length} seam${t.snapped.length > 1 ? 's' : ''} on door gaps` : ''}</div></td>
                          <td className="px-2 py-1">{t.panels.length}</td>
                          <td className="px-2 py-1 text-white/55">{t.panels.map(p => `${p.printW.toFixed(1)}×${p.printH.toFixed(1)}`).join(', ')}</td>
                          <td className="px-2 py-1 text-right">{(t.linearIn / 12).toFixed(1)} ft</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {findings.length > 0 && (
            <div>
              <Label>Preflight</Label>
              <div className="space-y-1.5">
                {findings.map((f, i) => (
                  <div key={i} className={`rounded-md border px-2 py-1.5 text-xs ${LEVEL[f.level]}`}>
                    <div>{f.message}</div>
                    <div className="mt-0.5 text-[11px] opacity-70">{f.fix}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {job && job.notes.length > 0 && (
            <div>
              <Label>Notes</Label>
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-white/55">{job.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WrapDesigner;

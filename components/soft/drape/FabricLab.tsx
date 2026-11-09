// Measure your own fabric: three home tests (weigh a square, hang a strip, slide a strip over a
// table edge) become the custom fabric the fit room drapes, with a 3D cantilever check that the
// solver reproduces what you measured.

import React, { useMemo, useState } from 'react';
import { Download, Upload, FlaskConical } from 'lucide-react';
import { calibrate, simulateCantilever, CANTILEVER_DEG, type HomeTests } from '../../../services/soft/drape/calibrate';
import type { Fabric } from '../../../services/soft/drape/fabrics';

const KEY = 'plajah.drape.myFabric';
const num = (v: string) => { const x = parseFloat(v); return Number.isFinite(x) ? x : undefined; };

export default function FabricLab({ onFabric }: { onFabric: (f: Fabric) => void }) {
  const [t, setT] = useState<HomeTests>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '') as HomeTests; } catch { return { name: 'My fabric', knit: true }; } });
  const [check, setCheck] = useState<string>('');
  const cal = useMemo(() => calibrate(t), [t]);
  const save = (n: HomeTests) => { setT(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private window */ } };
  const field = (label: string, get: () => number | undefined, set: (x: number | undefined) => void, unit: string) =>
    <label className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>{label}<input className="w-full h-7 rounded bg-white/5 border border-white/10 px-1 text-white" type="number" step="any" value={get() ?? ''} onChange={e => set(num(e.target.value))} placeholder={unit}/></label>;
  const strip = (dir: 'warp' | 'weft') => { const s = t[dir] ?? { widthMm: 50, gaugeMm: 100, stretchedMm: NaN, massG: 200 }; const up = (k: keyof typeof s) => (x: number | undefined) => save({ ...t, [dir]: { ...s, [k]: x ?? NaN } });
    return <div className="grid grid-cols-4 gap-1">{field('width', () => s.widthMm, up('widthMm'), 'mm')}{field('marks', () => s.gaugeMm, up('gaugeMm'), 'mm')}{field('stretched', () => (Number.isFinite(s.stretchedMm) ? s.stretchedMm : undefined), up('stretchedMm'), 'mm')}{field('weight', () => s.massG, up('massG'), 'g')}</div>; };
  const valid = (x?: { stretchedMm: number }) => !!x && Number.isFinite(x.stretchedMm) && x.stretchedMm > 0;
  const use = () => { const clean: HomeTests = { ...t, warp: valid(t.warp) ? t.warp : undefined, weft: valid(t.weft) ? t.weft : undefined }; onFabric(calibrate(clean).fabric); };
  const run3d = () => { if (!t.cantilever?.overhangMm) return; setCheck('Checking…'); setTimeout(() => { const a = simulateCantilever(cal.fabric, t.cantilever!.overhangMm, 2); setCheck(`In our solver your strip droops to ${a.toFixed(1)}° (the test line is ${CANTILEVER_DEG}°): ${Math.abs(a - CANTILEVER_DEG) < 6 ? 'a match.' : 'off; re-measure the overhang.'}`); }, 20); };
  return <div className="p-2 text-[11.5px] space-y-2" data-testid="drape-fabric-lab">
    <div className="flex items-center gap-1.5 font-bold"><FlaskConical size={13}/>Measure your fabric</div>
    <input className="w-full h-7 rounded bg-white/5 border border-white/10 px-2 text-white" value={t.name ?? ''} onChange={e => save({ ...t, name: e.target.value })} placeholder="Name"/>
    <label className="flex items-center gap-2"><input type="checkbox" checked={t.knit ?? true} onChange={e => save({ ...t, knit: e.target.checked })}/>Knit (stretches more across the grain)</label>
    <div><b>1. Weigh a square.</b> Cut 10 × 10 cm, weigh it on a kitchen scale.
      <div className="grid grid-cols-3 gap-1 mt-1">{field('grams', () => t.square?.grams, x => save({ ...t, square: { widthCm: 10, heightCm: 10, ...t.square, grams: x ?? 0 } }), 'g')}{field('width', () => t.square?.widthCm ?? 10, x => save({ ...t, square: { grams: 0, heightCm: 10, ...t.square, widthCm: x ?? 10 } }), 'cm')}{field('height', () => t.square?.heightCm ?? 10, x => save({ ...t, square: { grams: 0, widthCm: 10, ...t.square, heightCm: x ?? 10 } }), 'cm')}</div></div>
    <div><b>2. Hang a strip.</b> 5 cm wide, two marks 10 cm apart; clip it up, hang a weight (a 200 g bag of coins), measure the marks again. Once along the grain:
      {strip('warp')}<div className="mt-1">…and once across it:</div>{strip('weft')}</div>
    <div><b>3. Cantilever.</b> A 2.5 cm strip, slid slowly over a table edge until its tip touches a line 41.5° below the edge (fold a card corner to that angle). Measure how far it sticks out.
      <div className="grid grid-cols-2 gap-1 mt-1">{field('overhang', () => t.cantilever?.overhangMm, x => save({ ...t, cantilever: x ? { overhangMm: x } : undefined }), 'mm')}{field('thickness', () => t.thicknessMm, x => save({ ...t, thicknessMm: x }), 'mm')}</div></div>
    <div className="p-2 rounded bg-white/5 text-[11px]">{cal.notes.length ? cal.notes.map((n, i) => <div key={i}>• {n}</div>) : <span style={{ color: 'rgba(255,255,255,.5)' }}>Fill in any of the tests; the rest stays at the base preset.</span>}</div>
    <div className="grid grid-cols-2 gap-1.5">
      <button className="sew-btn sew-primary justify-center" onClick={use} data-testid="drape-fabric-use">Drape with it</button>
      <button className="sew-btn justify-center" disabled={!t.cantilever?.overhangMm} onClick={run3d} data-testid="drape-fabric-check">Check in 3D</button>
      <button className="sew-btn justify-center" onClick={() => { const u = URL.createObjectURL(new Blob([JSON.stringify({ tests: t, fabric: cal.fabric }, null, 1)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = `${t.name || 'fabric'}.fabric.json`; a.click(); }}><Download size={12}/>Save</button>
      <label className="sew-btn justify-center cursor-pointer"><Upload size={12}/>Open<input type="file" accept=".json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (j.tests) save(j.tests); } catch { setCheck('Not a fabric file.'); } }}/></label>
    </div>
    {check && <div className="text-[11px]" style={{ color: '#a7f3d0' }} data-testid="drape-fabric-check-result">{check}</div>}
  </div>;
}

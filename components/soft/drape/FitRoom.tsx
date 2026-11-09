// 3D fit room: drape the drafted pattern on a parametric avatar, read the fit maps and points of
// measure, compare every size on the same body, and carry the result on into grading, print
// placement, new pattern pieces from lines drawn on the body, turntables and cost per size.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Shirt, Ruler, Layers, Camera, Video, ShieldAlert } from 'lucide-react';
import type { Audience, ParamValue, Pattern, SoftTemplate } from '../../../services/soft/patterns';
import { CHILD_SIZES, SIZE_CHART, SOFT_TEMPLATES, softDefaults } from '../../../services/soft/patterns';
import { type BodyMeasures, type BodyShape, type Pose, type PoseName, measuresForSize, measuresForAge, parseMeasurements, poseFor, limitPose, JOINT_LIMITS, buildBody, bakeSdf, surfaceNets, smoothMesh, WALK_FRAMES } from '../../../services/soft/drape/avatar';
import { setupOutfit, simFor, startSitTest, refineDrape, type DrapeSetup } from '../../../services/soft/drape/drape';
import type { ClothSim } from '../../../services/soft/drape/cloth';
import { fitMaps, fitReport, tryEverySize, type FitMaps, type FitReport, type SizeRow } from '../../../services/soft/drape/fit';
import { clothColors, MAP_SCALE, rampCss, type MapMode } from '../../../services/soft/drape/colors';
import { FABRICS, fabricById, customFabric, defaultFabric, type Fabric } from '../../../services/soft/drape/fabrics';
import { fitHazards } from '../../../services/soft/drape/safety';
import { softHazards } from '../../../services/safety/softHazards';
import { sortHazards } from '../../../services/safety/hazards';
import { createGpuCloth, type GpuCloth } from '../../../services/soft/drape/gpu';
import Viewport, { type ViewportHandle, type PickHit } from './Viewport';
import FabricLab from './FabricLab';
import GradingPanel from './GradingPanel';
import PrintPanel from './PrintPanel';
import FlattenPanel from './FlattenPanel';
import CostPanel from './CostPanel';

export interface FitRoomProps { pattern: Pattern; template: SoftTemplate; params: Record<string, ParamValue>; audience: Audience; unit: 'cm' | 'in' }

const C = { line: 'rgba(255,255,255,.08)', dim: 'rgba(255,255,255,.5)', panel: '#14121a' };
const POSES: Array<[PoseName, string]> = [['a-pose', 'A-pose'], ['t-pose', 'T-pose'], ['sitting', 'Sitting'], ['walk', 'Walking'], ['custom', 'Custom pose']];
type Tab = 'fit' | 'sizes' | 'grading' | 'print' | 'flatten' | 'cost' | 'safety';
const fmt = (mm: number, unit: 'cm' | 'in') => (unit === 'in' ? `${(mm / 25.4).toFixed(1)}″` : `${(mm / 10).toFixed(1)} cm`);
const download = (name: string, data: Blob | string, type = 'application/octet-stream') => { const b = typeof data === 'string' ? new Blob([data], { type }) : data; const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); };

export default function FitRoom({ pattern, template, params, audience, unit }: FitRoomProps) {
  const vp = useRef<ViewportHandle>(null);
  const isPlush = pattern.kind === 'plush';
  const defaultSize = pattern.size && SIZE_CHART[pattern.size] ? pattern.size : 'M';
  const [bodySize, setBodySize] = useState(defaultSize); const [custom, setCustom] = useState<Partial<BodyMeasures>>({});
  const [pose, setPose] = useState<PoseName>('a-pose'); const [walkFrame, setWalkFrame] = useState(0);
  const [shape, setShape] = useState<BodyShape>({}); const [age, setAge] = useState<number | null>(null); const [customPose, setCustomPose] = useState<Pose>(() => ({ ...poseFor('a-pose'), name: 'custom' }));
  const [importText, setImportText] = useState('');
  // Other garments worn with this one (an outfit), innermost first round the pattern being drafted.
  const [layers, setLayers] = useState<Array<{ id: string; pos: 'under' | 'over' }>>([]);
  const garments = useMemo<Pattern[]>(() => {
    const mk = (id: string) => { const t = SOFT_TEMPLATES.find(x => x.id === id)!; const v = softDefaults(t); const sp = t.params.find(q => q.key === 'size');
      if (sp && pattern.size && sp.options?.some(o => o.value === pattern.size)) v.size = pattern.size; return t.build(v); };
    return [...layers.filter(l => l.pos === 'under').map(l => mk(l.id)), pattern, ...layers.filter(l => l.pos === 'over').map(l => mk(l.id))];
  }, [pattern, JSON.stringify(layers)]); // eslint-disable-line react-hooks/exhaustive-deps
  const mainIdx = garments.indexOf(pattern);
  const [layerReports, setLayerReports] = useState<Array<{ name: string; score: number; verdict: string }>>([]);
  const [fabricId, setFabricId] = useState<string>(''); const [measured, setMeasured] = useState<Fabric | null>(null); const [customFab, setCustomFab] = useState<Partial<Fabric>>({});
  const [mode, setMode] = useState<MapMode>('fabric'); const [tab, setTab] = useState<Tab>('fit');
  const [running, setRunning] = useState(true); const [progress, setProgress] = useState(0); const [engine, setEngine] = useState<'cpu' | 'gpu'>('cpu');
  const [report, setReport] = useState<FitReport | null>(null); const [maps, setMaps] = useState<FitMaps | null>(null);
  const [rows, setRows] = useState<SizeRow[] | null>(null); const [rowsBusy, setRowsBusy] = useState(0);
  const [pick, setPick] = useState<((h: PickHit) => void) | null>(null); const [msg, setMsg] = useState('');
  const [rev, setRev] = useState(0); const [seed, setSeed] = useState(0);

  const measures = useMemo<BodyMeasures>(() => ({ ...(age ? measuresForAge(age) : measuresForSize(bodySize)), ...custom, shape }), [bodySize, age, JSON.stringify(custom), JSON.stringify(shape)]);
  const poseNow = () => (pose === 'custom' ? limitPose(customPose) : poseFor(pose, walkFrame)); // eslint-disable-line react-hooks/exhaustive-deps
  const fab = (role: string): Fabric => (fabricId === 'measured' && measured ? (role === 'rib' && !isPlush ? fabricById('rib')! : measured) : fabricId === 'custom' ? customFabric(customFab) : fabricId ? (role === 'rib' && !isPlush ? fabricById('rib')! : fabricById(fabricId)!) : defaultFabric(role, pattern.kind));
  const setupRef = useRef<DrapeSetup | null>(null); const simRef = useRef<ClothSim | null>(null); const gpuRef = useRef<GpuCloth | null>(null);
  const [frames, setFrames] = useState(isPlush ? 200 : 170); const [refined, setRefined] = useState(false);

  // Build avatar + cloth whenever the inputs change.
  useEffect(() => {
    let dead = false; setReport(null); setMaps(null); setProgress(0); setMsg('');
    const body = buildBody(measures, poseNow());
    let s: DrapeSetup; try { s = setupOutfit(garments, { body, fabricFor: k => (k === mainIdx ? (r: string) => fab(r) : undefined) }); } catch (e) { setMsg(`Could not arrange this pattern in 3D: ${String((e as Error).message ?? e)}`); return; }
    setupRef.current = s; simRef.current = simFor(s); setRefined(false); setFrames(isPlush ? 200 : 170); gpuRef.current?.destroy(); gpuRef.current = null;
    vp.current?.setAvatar(s.body && s.sdf ? smoothMesh(surfaceNets(s.sdf), s.sdf, 3) : null); vp.current?.setCloth(s.model); vp.current?.updateCloth(clothColors(s.model, 'fabric')); vp.current?.frame(s.body ? 'body' : 'plush');
    (window as unknown as Record<string, unknown>).drapeState = { setup: s, sim: simRef.current, vp: vp.current };
    // Desktop GPU first: the WebGPU solver for garments (plush stuffing stays on the CPU solver).
    if (!isPlush && typeof navigator !== 'undefined' && 'gpu' in navigator) createGpuCloth(s.model, s.sdf, simRef.current.o).then(g => { if (dead) { g?.destroy(); return; } if (g) { gpuRef.current = g; setEngine('gpu'); } else setEngine('cpu'); }).catch(() => setEngine('cpu'));
    else setEngine('cpu');
    setRunning(true); setRev(r => r + 1);
    return () => { dead = true; };
  }, [garments, measures, pose, walkFrame, JSON.stringify(customPose), fabricId, JSON.stringify(customFab), JSON.stringify(measured), seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run loop: one display frame per animation frame until settled, then analyse.
  useEffect(() => {
    if (!running) return; let raf = 0; let f = 0; let busy = false; const s = setupRef.current, sim = simRef.current; if (!s || !sim) return;
    const finish = () => { sim.recordContact = false; const mp = fitMaps(s.model, sim, s.sdf); setMaps(mp); setReport(fitReport(s, sim, mp, String(params.fit ?? 'regular'), garments.length > 1 ? mainIdx : undefined)); setLayerReports(garments.length > 1 ? garments.map((g, k) => ({ g, k })).filter(x => x.k !== mainIdx).map(({ g, k }) => { const r = fitReport(s, sim, mp, 'regular', k); return { name: `${k < mainIdx ? 'Under' : 'Over'}: ${g.name}`, score: r.score, verdict: r.verdict[0] ?? '' }; }) : []); setRunning(false); };
    const tick = async () => {
      if (dead) return; if (busy) { next(); return; } busy = true;
      if (f === frames - 18) sim.startRecording();
      const g = gpuRef.current;
      if (g) { await g.frame(1 / 60, sim.recordContact); g.syncTo(sim); } else sim.frame(1 / 60);
      vp.current?.updateCloth(); f++; setProgress(f / frames); busy = false;
      if (f >= frames) { if (g) await g.readContact(sim); finish(); return; }
      next();
    };
    // Keep stepping when animation frames stop (hidden tab, occluded window): a timer backs up rAF.
    const next = () => { let done = false; const go = () => { if (done) return; done = true; void tick(); }; raf = requestAnimationFrame(go); setTimeout(go, 60); };
    let dead = false; next(); return () => { dead = true; cancelAnimationFrame(raf); };
  }, [running, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const s = setupRef.current; if (s) vp.current?.updateCloth(clothColors(s.model, mode, maps)); }, [mode, maps]);

  const redo = () => setSeed(x => x + 1);
  const sizes = pattern.grading?.sizes ?? [];
  const runSizes = async () => {
    const s = setupRef.current; if (!s?.body || !s.sdf) return; setRows([]); setRowsBusy(1); setTab('sizes');
    const out = await tryEverySize(template, params, s.body, s.sdf, sizes, (done, row) => { setRowsBusy(done + 1); if (row) setRows(r => [...(r ?? []), row]); }, { fabric: r => fab(r) });
    setRows(out); setRowsBusy(0);
  };
  const hazards = useMemo(() => sortHazards([...softHazards(pattern, audience), ...(report ? fitHazards(pattern, audience, report, setupRef.current) : [])]), [pattern, audience, report]);
  const fitHz = hazards.filter(h => h.id.startsWith('fit-'));
  const snap = () => { const url = vp.current?.snapshot(1600, 2000); if (url) { const a = document.createElement('a'); a.href = url; a.download = `${pattern.name} 3D.png`; a.click(); } };
  const turn = () => { setMsg('Recording a 6 s turntable…'); vp.current?.turntable(6, b => { if (b) { download(`${pattern.name} turntable.webm`, b); setMsg('Turntable saved.'); } else setMsg('This browser cannot record the canvas; use the PNG instead.'); }); };
  const onPick = (h: PickHit) => pick?.(h);

  const sel = 'h-8 rounded-lg px-2 text-[12px] bg-white/5 border border-white/10 text-white';
  return <div className="h-full min-h-[520px] flex flex-col lg:flex-row gap-2" data-testid="drape-room">
    <div className="flex-1 min-w-0 min-h-[360px] flex flex-col rounded-xl overflow-hidden border" style={{ borderColor: C.line }}>
      <div className="flex flex-wrap items-center gap-1.5 p-2 border-b" style={{ borderColor: C.line, background: C.panel }}>
        {!isPlush && <select className={sel} value={bodySize} onChange={e => { setBodySize(e.target.value); setCustom({}); }} data-testid="drape-body" title="Avatar size (our size chart)">{Object.keys(SIZE_CHART).map(s => <option key={s} value={s}>Body {CHILD_SIZES.includes(s) ? `kids ${s}` : s}</option>)}</select>}
        {!isPlush && <select className={sel} value={pose} onChange={e => setPose(e.target.value as PoseName)} data-testid="drape-pose">{POSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
        {pose === 'walk' && <input type="range" min={0} max={WALK_FRAMES - 1} value={walkFrame} onChange={e => setWalkFrame(Number(e.target.value))} title="Walk frame" data-testid="drape-walk"/>}
        {!isPlush && <select className={sel} value="" onChange={e => { const [pos, id] = e.target.value.split(':'); if (id) setLayers(l => [...l, { id, pos: pos as 'under' | 'over' }]); }} data-testid="drape-add-layer" title="Wear it with another garment">
          <option value="">Layers…</option>{(['under', 'over'] as const).map(pos => <optgroup key={pos} label={pos === 'under' ? 'Wear underneath' : 'Wear over it'}>{SOFT_TEMPLATES.filter(t => t.kind === 'apparel' && t.id !== template.id).map(t => <option key={t.id} value={`${pos}:${t.id}`}>{t.name}</option>)}</optgroup>)}</select>}
        {layers.map((l, k) => <button key={k} className="h-7 px-2 rounded-full text-[11px] bg-white/10" onClick={() => setLayers(x => x.filter((_, j) => j !== k))} title="Remove this layer" data-testid={`drape-layer-${k}`}>{l.pos === 'under' ? '↓' : '↑'} {SOFT_TEMPLATES.find(t => t.id === l.id)?.name} ×</button>)}
        <select className={sel} value={fabricId} onChange={e => setFabricId(e.target.value)} data-testid="drape-fabric"><option value="">Fabric: pattern default</option>{FABRICS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}<option value="custom">Custom…</option><option value="measured">Measure my fabric…</option></select>
        <select className={sel} value={mode} onChange={e => setMode(e.target.value as MapMode)} data-testid="drape-map"><option value="fabric">Show fabric</option><option value="strain">Strain map</option><option value="pressure">Pressure map</option><option value="gap">Ease / gap map</option></select>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10" title="Cloth solver" data-testid="drape-engine">{engine === 'gpu' ? 'GPU' : 'CPU'}</span>
          <button className="sew-btn" onClick={() => setRunning(r => !r)} title={running ? 'Pause' : 'Resume'} data-testid="drape-play">{running ? <Pause size={13}/> : <Play size={13}/>}</button>
          <button className="sew-btn" onClick={redo} title="Drape again" data-testid="drape-redo"><RotateCcw size={13}/></button>
          <button className="sew-btn" onClick={snap} title="PNG" data-testid="drape-png"><Camera size={13}/></button>
          <button className="sew-btn" onClick={turn} title="Turntable video" data-testid="drape-turntable"><Video size={13}/></button>
          <button className="sew-btn" onClick={() => { const url = vp.current?.turntableSheet(8, 520); if (url) { const a = document.createElement('a'); a.href = url; a.download = `${pattern.name} 8 views.png`; a.click(); setMsg('Saved eight product views.'); } }} title="Eight-view product sheet (PNG)" data-testid="drape-sheet"><Layers size={13}/></button>
        </span>
      </div>
      {fabricId === 'measured' && <div className="border-b max-h-[45vh] overflow-y-auto" style={{ borderColor: C.line }}><FabricLab onFabric={setMeasured}/></div>}
      {fabricId && fabricById(fabricId)?.source && <div className="px-2 py-1 text-[10.5px] border-b" style={{ borderColor: C.line, color: C.dim }} data-testid="drape-fabric-source">{fabricById(fabricId)!.source}</div>}
      {fabricId === 'custom' && <div className="flex flex-wrap gap-2 p-2 text-[11px] border-b" style={{ borderColor: C.line, color: C.dim }}>
        {([['gsm', 'g/m²'], ['stretchWarp', 'warp %'], ['stretchWeft', 'weft %'], ['bend', 'bend'], ['thickness', 'mm thick']] as const).map(([k, l]) => <label key={k}>{l} <input className="w-16 h-7 rounded bg-white/5 border border-white/10 px-1 text-white" type="number" step="any" value={(customFab[k] ?? customFabric({})[k]) as number} onChange={e => setCustomFab(c => ({ ...c, [k]: Number(e.target.value) }))}/></label>)}
      </div>}
      <div className="relative flex-1 min-h-0">
        <Viewport ref={vp} onPick={onPick}/>
        {running && <div className="absolute left-2 bottom-2 right-2 h-1 rounded bg-white/10"><div className="h-1 rounded bg-pink-400" style={{ width: `${progress * 100}%` }}/></div>}
        {mode !== 'fabric' && <div className="absolute left-2 top-2 p-2 rounded-lg text-[10px]" style={{ background: 'rgba(0,0,0,.55)' }} data-testid="drape-legend"><div className="font-bold mb-1">{MAP_SCALE[mode].label}</div>
          <div className="flex h-2 w-44 rounded overflow-hidden">{Array.from({ length: 22 }, (_, i) => <div key={i} className="flex-1" style={{ background: rampCss(mode === 'gap' ? 1 - i / 21 : i / 21) }}/>)}</div>
          <div className="flex justify-between w-44 mt-0.5" style={{ color: C.dim }}>{MAP_SCALE[mode].ticks.map(t => <span key={t}>{t}</span>)}</div></div>}
        {pick && <div className="absolute right-2 top-2 text-[11px] px-2 py-1 rounded bg-pink-500/80">Click on the {tab === 'print' ? 'garment' : 'body'}</div>}
      </div>
      {msg && <div className="px-2 py-1 text-[11px] border-t" style={{ borderColor: C.line, color: '#fcd34d' }} data-testid="drape-msg">{msg}</div>}
    </div>
    <div className="lg:w-[330px] shrink-0 flex flex-col min-h-0 rounded-xl border" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex flex-wrap gap-1 p-1.5 border-b" style={{ borderColor: C.line }}>
        {([['fit', 'Fit'], ...(isPlush ? [] : [['sizes', 'Every size'], ['grading', 'Grading']]), ['print', 'Print'], ...(isPlush ? [] : [['flatten', '3D→2D']]), ['cost', 'Cost'], ['safety', fitHz.length ? `Safety (${fitHz.length})` : 'Safety']] as Array<[Tab, string]>).map(([id, l]) =>
          <button key={id} className={`sew-tab${tab === id ? ' sew-tab-on' : ''}`} onClick={() => { setTab(id); setPick(null); }} data-testid={`drape-tab-${id}`}>{l}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 text-[12px]">
        {tab === 'fit' && <div data-testid="drape-fit">
          {!report && <div style={{ color: C.dim }}>{running ? `Draping… ${Math.round(progress * 100)}%` : 'Paused.'}</div>}
          {report && <>
            <div className="flex items-baseline gap-2 mb-2"><span className="text-[28px] font-extrabold tabular-nums" data-testid="drape-score">{report.score}</span><span style={{ color: C.dim }}>fit score {isPlush ? '(stuffing)' : `on body ${bodySize}`}</span></div>
            {report.verdict.map((v, i) => <div key={i} className="mb-1">• {v}</div>)}
            {report.plush?.sitTested && report.plush.advice && <div className="mt-1 p-2 rounded-lg bg-white/5 text-[11px]" data-testid="drape-sit-advice">{report.plush.advice.map((t, i) => <div key={i}>→ {t}</div>)}{report.plush.dropUpright === false && report.plush.sitsUp && <div className="mt-1" style={{ color: C.dim }}>The drop animation rocks over: our stuffing model keeps the base domed, where real fibre fill flattens under the toy's weight. The balance check above is the answer.</div>}</div>}
            {layerReports.length > 0 && <div className="mt-2 p-2 rounded-lg bg-white/5" data-testid="drape-layer-reports"><div className="sew-h">Worn with</div>{layerReports.map(l => <div key={l.name} className="text-[11px] mb-1"><b>{l.score}</b> {l.name}<div style={{ color: C.dim }}>{l.verdict}</div></div>)}
              <div className="text-[10.5px]" style={{ color: C.dim }}>Ease maps for outer layers measure to the garment underneath; pressure on the body includes what the outer layers add.</div></div>}
            {report.poms.length > 0 && <table className="w-full mt-2 text-[11px]" data-testid="drape-poms"><thead><tr style={{ color: C.dim }}><td>Point</td><td>Body</td><td>Garment</td><td>Ease</td><td>Spec</td></tr></thead>
              <tbody>{report.poms.map(p => <tr key={p.name} className="border-t" style={{ borderColor: C.line }}><td className="py-1">{p.name}</td><td>{fmt(p.body, unit)}</td><td>{fmt(p.garment, unit)}</td><td style={{ color: p.ease < 30 ? '#fda4af' : undefined }}>{fmt(p.ease, unit)}</td><td style={{ color: C.dim }}>{p.spec ? fmt(p.spec, unit) : '–'}</td></tr>)}</tbody></table>}
            <div className="grid grid-cols-2 gap-1 mt-2 text-[11px]">
              <div>Stretch peak <b>{Math.round(report.maxStrain * 100)}%</b></div>{!report.plush && <div>Pressure peak <b>{report.maxPressure.toFixed(1)} kPa</b></div>}
              {!report.plush && <><div>Tight area <b>{Math.round(report.tightPct)}%</b></div><div>Loose area <b>{Math.round(report.loosePct)}%</b></div></>}
              {report.sleeveEnd != null && <div>Sleeve vs wrist <b>{fmt(report.sleeveEnd, unit)}</b></div>}<div>Widest seam gap <b>{Math.round(report.seamGap)} mm</b></div>
              {report.plush && <><div>Volume <b>{(report.plush.volume / 1e6).toFixed(2)} L</b> of {(report.plush.target / 1e6).toFixed(2)}</div><div>Stuffing <b>{(report.plush.pressurePa / 1000).toFixed(1)} kPa</b></div><div>Sits up <b>{report.plush.sitTested ? (report.plush.sitsUp ? 'yes' : 'no, tips over') : 'not tested'}</b></div></>}
            </div>
            {!report.plush && !refined && <button className="sew-btn w-full justify-center mt-2" onClick={() => { const cur = setupRef.current; if (!cur) return; const n = refineDrape(cur, { hMin: 5 }); setupRef.current = n; const sm = simFor(n); sm.t = 2; simRef.current = sm; gpuRef.current?.destroy(); gpuRef.current = null;
              vp.current?.setCloth(n.model); vp.current?.updateCloth(clothColors(n.model, 'fabric')); setRefined(true); setFrames(70); setReport(null); setMaps(null);
              const go = () => { setRunning(true); setRev(r => r + 1); }; if ('gpu' in navigator) createGpuCloth(n.model, n.sdf, sm.o).then(g => { if (g) { gpuRef.current = g; setEngine('gpu'); } go(); }).catch(go); else go(); }} data-testid="drape-refine">Refine folds (5 mm mesh at wrinkles)</button>}
            {report.plush && !report.plush.sitTested && <button className="sew-btn w-full justify-center mt-2" onClick={() => { const sm = simRef.current; if (!sm) return; startSitTest(sm); setReport(null); setRunning(true); setRev(r => r + 1); }} data-testid="drape-sit">Sit it down (stability test)</button>}
            <div className="mt-2 text-[10.5px]" style={{ color: C.dim }}>Draped with our own position-based cloth solver; fabric numbers are typical ranges, not a lab-measured bolt.</div>
            {setupRef.current?.rig.notes.map((n, i) => <div key={i} className="mt-1 text-[10.5px]" style={{ color: '#fcd34d' }}>{n}</div>)}
          </>}
          {!isPlush && <div className="mt-3"><div className="sew-h"><Ruler size={12}/>Avatar measurements ({unit})</div>
            <div className="grid grid-cols-2 gap-1">{(['height', 'chest', 'waist', 'hip', 'shoulder', 'arm', 'inseam', 'neck', 'head'] as const).map(k => <label key={k} className="text-[10.5px]" style={{ color: C.dim }}>{k}
              <input className="w-full h-7 rounded bg-white/5 border border-white/10 px-1 text-white" type="number" value={Math.round(measures[k] / (unit === 'in' ? 25.4 : 10) * 10) / 10} onChange={e => { const x = parseFloat(e.target.value); if (x > 0) setCustom(c => ({ ...c, [k]: x * (unit === 'in' ? 25.4 : 10) })); }} data-testid={`drape-m-${k}`}/></label>)}</div>
            <div className="text-[10px] mt-1" style={{ color: C.dim }}>{measures.band === 'child' ? 'Child proportions' : 'Adult proportions'}; change any number to fit your own body.</div>
            <label className="block text-[10.5px] mt-2" style={{ color: C.dim }}>Child by age <select className="ml-1 h-7 rounded bg-white/5 border border-white/10 text-white text-[11px]" value={age ?? ''} onChange={e => { setAge(e.target.value ? Number(e.target.value) : null); setCustom({}); }} data-testid="drape-age"><option value="">use size</option>{Array.from({ length: 13 }, (_, i) => i + 2).map(a => <option key={a} value={a}>{a} years</option>)}</select></label>
            <div className="sew-h mt-3">Body shape</div>
            {([['torso', 'Torso length', -80, 80, 'mm'], ['bust', 'Bust', 0, 120, 'mm'], ['belly', 'Belly', 0, 160, 'mm'], ['seat', 'Seat', 0, 120, 'mm'], ['shoulderSlope', 'Shoulder slope', 8, 32, '°']] as const).map(([k, l, lo, hi, u]) =>
              <label key={k} className="block text-[10.5px]" style={{ color: C.dim }}>{l} {shape[k] ?? (k === 'shoulderSlope' ? 20 : 0)}{u}<input type="range" className="w-full" min={lo} max={hi} value={shape[k] ?? (k === 'shoulderSlope' ? 20 : 0)} onChange={e => setShape(sh => ({ ...sh, [k]: Number(e.target.value) }))} data-testid={`drape-shape-${k}`}/></label>)}
            <div className="sew-h mt-3">Your measurements</div>
            <textarea className="w-full h-16 rounded bg-white/5 border border-white/10 p-1 text-[11px] text-white" placeholder={'chest: 96 cm\nwaist: 80 cm\nhip: 102 cm\nheight: 168 cm'} value={importText} onChange={e => setImportText(e.target.value)} data-testid="drape-import-measures"/>
            <div className="flex gap-1.5 mt-1"><button className="sew-btn" onClick={() => { const r = parseMeasurements(importText); const { shape: sp, ...rest } = r; setAge(null); setCustom(c => ({ ...c, ...rest })); if (sp) setShape(x => ({ ...x, ...sp })); setMsg(`Applied ${Object.keys(rest).length} measurements${sp ? ' and body shape' : ''}.`); }} data-testid="drape-apply-measures">Apply</button>
              <label className="sew-btn cursor-pointer">Open file<input type="file" accept=".txt,.csv,.json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setImportText(await f.text()); }}/></label></div>
            {pose === 'custom' && <><div className="sew-h mt-3">Pose (within joint limits)</div>
              {(Object.keys(JOINT_LIMITS) as Array<keyof typeof JOINT_LIMITS>).map(k => <label key={k} className="block text-[10.5px]" style={{ color: C.dim }}>{k} {Math.round(customPose[k][0])}°<input type="range" className="w-full" min={JOINT_LIMITS[k][0]} max={JOINT_LIMITS[k][1]} value={customPose[k][0]} onChange={e => { const x = Number(e.target.value); setCustomPose(p => ({ ...p, [k]: [x, x] })); }} data-testid={`drape-joint-${k}`}/></label>)}</>}
          </div>}
        </div>}
        {tab === 'sizes' && <div data-testid="drape-sizes">
          <button className="sew-btn sew-primary w-full justify-center mb-2" disabled={rowsBusy > 0} onClick={runSizes} data-testid="drape-try-sizes"><Shirt size={13}/>{rowsBusy ? `Draping size ${Math.min(rowsBusy, sizes.length)} of ${sizes.length}…` : `Try all ${sizes.length} sizes on body ${bodySize}`}</button>
          {rows && rows.length > 0 && (() => { const best = rows.reduce((a, r) => (r.report.score > a.report.score ? r : a)); return <table className="w-full text-[11px]"><thead><tr style={{ color: C.dim }}><td>Size</td><td>Score</td><td>Chest ease</td><td>Peak</td><td>Note</td></tr></thead>
            <tbody>{rows.map(r => { const ch = r.report.poms.find(p => p.name === 'Chest'); return <tr key={r.size} className="border-t" style={{ borderColor: C.line, background: r === best ? 'rgba(74,222,128,.08)' : undefined }} data-testid={`drape-size-${r.size}`}><td className="py-1 font-bold">{r.size}{r === best ? ' ★' : ''}</td><td>{r.report.score}</td><td>{ch ? fmt(ch.ease, unit) : '–'}</td><td>{r.report.maxPressure.toFixed(1)} kPa</td><td className="text-[10px]" style={{ color: C.dim }}>{r.report.verdict[0]}</td></tr>; })}</tbody></table>; })()}
          <div className="text-[10.5px] mt-2" style={{ color: C.dim }}>Every size is drafted from the chart and draped on the same avatar with a coarser mesh, so the comparison is like for like.</div>
        </div>}
        {tab === 'grading' && <GradingPanel pattern={pattern} template={template} params={params} unit={unit}/>}
        {tab === 'print' && <PrintPanel setup={setupRef.current} vp={vp} setPick={setPick} pattern={pattern}/>}
        {tab === 'flatten' && <FlattenPanel setup={setupRef.current} vp={vp} setPick={setPick} unit={unit}/>}
        {tab === 'cost' && <CostPanel pattern={pattern} template={template} params={params} unit={unit}/>}
        {tab === 'safety' && <div data-testid="drape-safety"><div className="sew-h"><ShieldAlert size={12}/>From the fit</div>
          {fitHz.length === 0 && <div style={{ color: C.dim }}>{report ? 'No fit-related hazards on this body.' : 'Waiting for the drape to settle.'}</div>}
          {fitHz.map(h => <div key={h.id} className="mb-2 p-2 rounded-lg" style={{ background: h.severity === 'critical' ? 'rgba(244,63,94,.12)' : 'rgba(251,191,36,.08)' }} data-testid={`drape-hz-${h.id}`}><div className="font-bold">{h.title}</div><div className="text-[11px] mt-0.5" style={{ color: C.dim }}>{h.why}</div>{h.mitigate.map((m, i) => <div key={i} className="text-[11px] mt-0.5">→ {m}</div>)}{h.cite && <div className="text-[10px] mt-0.5" style={{ color: C.dim }}>{h.cite}</div>}</div>)}
          <div className="sew-h mt-3"><Layers size={12}/>Product hazards (also in Safety)</div>
          {hazards.filter(h => !h.id.startsWith('fit-')).map(h => <div key={h.id} className="text-[11px] mb-1">• {h.title}</div>)}
        </div>}
      </div>
    </div>
  </div>;
}

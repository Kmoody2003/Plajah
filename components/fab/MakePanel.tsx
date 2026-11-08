// Make: take the model or drawing open in the CAD room to a real machine. Pick a process and a
// machine, check manufacturability, prepare the toolpath with our own CAM, preview it, then download
// the file or send it straight to the machine.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Factory, Play, Download, Send, Square } from 'lucide-react';
import type { CadModel } from '../../services/cad/model';
import { MM_PER_UNIT } from '../../services/cad/model';
import { PROCESSES, machinesFor, type Process, type Machine, type Family } from '../../services/fab/machines';
import { type Job, cutJob, fdmJob, latheJob, turnedProfile, writeCli, FDM_DEFAULTS } from '../../services/fab/cam';
import { entitiesToPaths, type Loop, type P2 } from '../../services/fab/geom2d';
import { sliceMesh, type Layer, type MeshIn } from '../../services/fab/slice';
import { post, fileExtension } from '../../services/fab/gcode';
import { dfm2d, dfm3d, type DfmFinding } from '../../services/fab/dfm';
import { write3mf } from '../../services/fab/threeMf';
import { sendToMachine, streamGcode, openWebSerial } from '../../services/fab/connect';
import { writeStl } from '../../services/mech/geometry';

const DIM = 'rgba(255,255,255,.5)';
const LV: Record<string, string> = { error: '#f87171', warn: '#fbbf24', info: '#93c5fd', pass: '#4ade80' };
const FAMILIES: Family[] = ['Plastic printing', 'Metal printing', 'Machining', 'Cutting', 'Forming'];
const dl = (name: string, data: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const store = { get: (k: string) => { try { return JSON.parse(localStorage.getItem(`plajah.fab.${k}`) ?? 'null'); } catch { return null; } }, set: (k: string, v: unknown) => { try { localStorage.setItem(`plajah.fab.${k}`, JSON.stringify(v)); } catch { /* private mode */ } } };

interface Output { name: string; data: BlobPart; type: string; gcode?: string }

export default function MakePanel({ model }: { model: CadModel }) {
  const is2D = model.is2D || !model.meshes.length; const k = MM_PER_UNIT[model.units] || 1;
  const meshes = useMemo<MeshIn[]>(() => model.meshes.map(m => ({ positions: k === 1 ? m.positions : Float32Array.from(m.positions, v => v * k), indices: m.indices })), [model, k]);
  const paths = useMemo(() => { const p = entitiesToPaths(model.entities.filter(e => e.layer !== 'Defpoints')); const s = (pt: P2): P2 => [pt[0] * k, pt[1] * k]; return { loops: p.loops.map(l => l.map(s)), open: p.open.map(l => l.map(s)) }; }, [model, k]);
  const procs = PROCESSES.filter(p => (is2D ? p.input === '2d' : p.input !== '2d'));
  const [procId, setProcId] = useState<string>(() => (is2D ? 'laser-co2' : 'fdm'));
  const proc = (procs.find(p => p.id === procId) ?? procs[0]) as Process;
  const machines = machinesFor(proc.id); const [machineId, setMachineId] = useState(machines[0]?.id ?? '');
  const machine = (machines.find(m => m.id === machineId) ?? machines[0]) as Machine | undefined;
  useEffect(() => { setMachineId(machinesFor(proc.id)[0]?.id ?? ''); setJob(null); setOut(null); }, [proc.id]);
  // Settings.
  const [s, setS] = useState({ layer: 0.2, infill: 20, walls: 2, nozzleTemp: 210, bedTemp: 60, kerf: proc.rules.kerf ?? 0.15, feed: 1200, power: 80, thickness: 3, material: '', tool: 6.35, stepDown: 3, stock: 25, doc: 1, metalLayer: 0.04 });
  useEffect(() => { setS(x => ({ ...x, kerf: proc.id === 'router' ? x.tool : proc.rules.kerf ?? 0, feed: proc.id === 'plasma' ? 2500 : proc.id === 'router' ? 1500 : proc.id.startsWith('laser') ? 1200 : 800 })); }, [proc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [job, setJob] = useState<(Job & { layers?: Layer[] }) | null>(null); const [cliLayers, setCliLayers] = useState<Layer[] | null>(null);
  const [out, setOut] = useState<Output | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [layer, setLayer] = useState(0); const [progress, setProgress] = useState<[number, number] | null>(null); const stopRef = useRef({ stop: false });
  const [target, setTarget] = useState<{ host: string; apiKey: string }>(() => store.get(`target.${machineId}`) ?? { host: '', apiKey: '' });
  useEffect(() => { setTarget(store.get(`target.${machineId}`) ?? { host: '', apiKey: '' }); }, [machineId]);

  const findings = useMemo<DfmFinding[]>(() => is2D ? dfm2d(paths.loops, proc, { thickness: s.thickness, material: s.material, tool: proc.id === 'router' || proc.id === 'mill3' ? s.tool : undefined }) : dfm3d(meshes, proc, machine), [is2D, paths, meshes, proc, machine, s.thickness, s.material, s.tool]);
  const blocked = findings.some(f => f.level === 'error');
  const base = model.name.replace(/\.[^.]+$/, '') || 'part';

  const prepare = () => {
    setBusy(true); setMsg(''); setOut(null); setJob(null); setCliLayers(null);
    setTimeout(() => {
      try {
        const scale = proc.rules.shrink ? 1 / (1 - proc.rules.shrink) : 1;
        if (proc.id === 'fdm' || proc.id === 'bound-metal') {
          const scaled = scale === 1 ? meshes : meshes.map(m => ({ positions: Float32Array.from(m.positions, v => v * scale), indices: m.indices }));
          const j = fdmJob(scaled, { ...FDM_DEFAULTS, layer: s.layer, infill: s.infill / 100, walls: s.walls, nozzleTemp: s.nozzleTemp, bedTemp: s.bedTemp, nozzle: machine?.nozzle ?? 0.4, process: proc.id });
          const g = post(j, { dialect: machine?.dialect ?? 'marlin', name: base, nozzleTemp: s.nozzleTemp, bedTemp: s.bedTemp }); setJob(j); setLayer(0);
          setOut({ name: `${base}.gcode`, data: g, type: 'text/plain', gcode: g });
        } else if (proc.id === 'lpbf' || proc.id === 'ebm') {
          const layers = sliceMesh(meshes, s.metalLayer, 20000); setCliLayers(layers); setLayer(0);
          setOut({ name: `${base}.cli`, data: writeCli(layers, base), type: 'text/plain' });
        } else if (proc.input === '3d' && !['mill3', 'mill5', 'ded'].includes(proc.id)) {
          const data = write3mf(meshes.map(m => ({ ...m, name: base })), { title: base, scale });
          setOut({ name: `${base}.3mf`, data: data as BlobPart, type: 'model/3mf' });
        } else if (proc.id === 'lathe') {
          const j = latheJob(turnedProfile(meshes), { stock: s.stock, doc: s.doc, finish: 0.2, feed: s.feed / 8, finishFeed: s.feed / 15, rpm: 1200 });
          const g = post(j, { dialect: machine?.dialect ?? 'lathe-iso', name: base, coolant: true }); setJob(j); setOut({ name: `${base}.${fileExtension(machine?.dialect ?? 'lathe-iso')}`, data: g, type: 'text/plain', gcode: g });
        } else if (proc.input === '3d') {
          // 3D milling / DED: we export the model for full 3D CAM, plus a profile job from its footprint.
          const data = write3mf(meshes.map(m => ({ ...m, name: base })), { title: base });
          setOut({ name: `${base}.3mf`, data: data as BlobPart, type: 'model/3mf' }); setMsg('Full 3D surfacing toolpaths are coming next; this exports the checked model for your CAM. Drawings can be profiled and pocketed now.');
        } else if (proc.outputs.includes('gcode') && machine?.dialect) {
          const j = cutJob(paths.loops, paths.open, { process: proc.id, kerf: s.kerf, feed: s.feed, power: proc.id === 'router' ? 18000 : s.power, thickness: proc.id === 'router' ? s.thickness : undefined, stepDown: s.stepDown, pierceDelay: proc.id === 'plasma' ? 0.5 : undefined });
          const g = post(j, { dialect: machine.dialect, name: base }); setJob(j); setOut({ name: `${base}.${fileExtension(machine.dialect)}`, data: g, type: 'text/plain', gcode: g });
        } else {
          setMsg('This machine reads DXF or SVG from its own software: use DXF export in the CAD room header.');
        }
      } catch (e: any) { setMsg(String(e?.message ?? e)); } finally { setBusy(false); }
    }, 20);
  };

  const send = async () => {
    if (!out || !machine) return; setMsg(''); store.set(`target.${machine.id}`, target);
    if (machine.link.kind === 'serial') {
      if (!out.gcode) return; stopRef.current = { stop: false };
      try { const port = await openWebSerial(machine.link.baud); setProgress([0, 1]); const r = await streamGcode(port, out.gcode, (d, t) => setProgress([d, t]), stopRef.current); await port.close(); setMsg(r.message); }
      catch (e: any) { setMsg(String(e?.message ?? e)); } finally { setProgress(null); }
      return;
    }
    setBusy(true); const r = await sendToMachine(machine.link, target, out.name, new Blob([out.data], { type: out.type }), true); setMsg(r.message); setBusy(false);
  };

  const num = (key: keyof typeof s, label: string, unit = '', step = 1) => <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>{label}{unit ? ` (${unit})` : ''}</span><input type="number" step={step} value={s[key] as number} onChange={e => setS(x => ({ ...x, [key]: +e.target.value }))} className="w-20 h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white text-right" aria-label={label}/></label>;
  const kind = proc.id === 'fdm' || proc.id === 'bound-metal' ? 'fdm' : proc.id === 'lpbf' || proc.id === 'ebm' ? 'metal' : proc.id === 'lathe' ? 'lathe' : proc.input === '2d' ? 'cut' : 'export';

  return <div className="text-[12px]" data-testid="fab-make">
    <div className="flex items-center gap-1.5 font-bold mb-2"><Factory size={14} color="#fbbf24"/>Make it</div>
    <select value={proc.id} onChange={e => setProcId(e.target.value)} className="w-full h-7 rounded bg-white/5 border border-white/10 text-[11.5px] text-white mb-1.5" aria-label="Process" data-testid="fab-process">
      {FAMILIES.map(f => { const list = procs.filter(p => p.family === f); return list.length ? <optgroup key={f} label={f} style={{ background: '#15131d' }}>{list.map(p => <option key={p.id} value={p.id} style={{ background: '#15131d' }}>{p.name}</option>)}</optgroup> : null; })}
    </select>
    <div className="text-[10.5px] mb-2" style={{ color: DIM }}>{proc.about} <span className="opacity-80">Materials: {proc.materials.join(', ')}.</span></div>
    {machines.length > 0 && <select value={machine?.id} onChange={e => setMachineId(e.target.value)} className="w-full h-7 rounded bg-white/5 border border-white/10 text-[11.5px] text-white mb-2" aria-label="Machine" data-testid="fab-machine">{machines.map(m => <option key={m.id} value={m.id} style={{ background: '#15131d' }}>{m.name}</option>)}</select>}

    <div className="p-2 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
      {kind === 'fdm' && <>{num('layer', 'Layer height', 'mm', 0.05)}{num('infill', 'Infill', '%', 5)}{num('walls', 'Walls')}{num('nozzleTemp', 'Nozzle', '°C', 5)}{num('bedTemp', 'Bed', '°C', 5)}</>}
      {kind === 'metal' && <>{num('metalLayer', 'Layer thickness', 'mm', 0.01)}<div className="text-[10px] mt-1" style={{ color: DIM }}>Slices to CLI contours; your build processor adds hatching and supports for its laser parameters.</div></>}
      {kind === 'lathe' && <>{num('stock', 'Bar stock Ø', 'mm', 1)}{num('doc', 'Depth of cut', 'mm', 0.1)}{num('feed', 'Feed base', 'mm/min', 50)}</>}
      {kind === 'cut' && <>
        {proc.id === 'router' ? <>{num('tool', 'Tool Ø', 'mm', 0.1)}{num('thickness', 'Sheet thickness', 'mm', 0.5)}{num('stepDown', 'Depth per pass', 'mm', 0.5)}</> : <>{num('kerf', 'Kerf', 'mm', 0.05)}{num('thickness', 'Material thickness', 'mm', 0.5)}{proc.id !== 'waterjet' && proc.id !== 'drag-knife' && num('power', 'Power', '%', 5)}</>}
        {num('feed', 'Feed', 'mm/min', 50)}
        <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Material</span><input value={s.material} onChange={e => setS(x => ({ ...x, material: e.target.value }))} placeholder={proc.materials[0]} className="w-28 h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white" aria-label="Material"/></label>
      </>}
      {kind === 'export' && <div className="text-[10.5px]" style={{ color: DIM }}>{proc.rules.shrink ? `Exports 3MF enlarged ${((1 / (1 - proc.rules.shrink) - 1) * 100).toFixed(1)}% for sintering shrinkage.` : 'Exports a checked, bed-placed 3MF for the machine\'s build software.'}</div>}
    </div>

    <div className="mb-2" data-testid="fab-dfm">{findings.map((f, i) => <div key={i} className="flex gap-1.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: LV[f.level] }}/><div><div className={f.detail ? 'font-semibold' : ''} style={{ color: f.detail ? undefined : 'rgba(255,255,255,.65)' }}>{f.title}</div>{f.detail && <div className="text-[10.5px]" style={{ color: DIM }}>{f.detail}</div>}</div></div>)}</div>

    <button className="cad-btn cad-primary w-full justify-center" onClick={prepare} disabled={busy || blocked || (is2D ? !paths.loops.length && !paths.open.length : !meshes.length)} data-testid="fab-prepare"><Play size={13}/>{busy ? 'Preparing…' : blocked ? 'Fix the problems above' : 'Prepare'}</button>

    {(job || cliLayers) && <Preview job={job} layers={cliLayers ?? job?.layers ?? null} layer={layer} setLayer={setLayer}/>}
    {job && <div className="text-[11px] mt-1.5" data-testid="fab-stats">About {job.stats.seconds >= 3600 ? `${(job.stats.seconds / 3600).toFixed(1)} h` : `${Math.max(1, Math.round(job.stats.seconds / 60))} min`}{job.stats.layers ? ` · ${job.stats.layers} layers` : ''}{job.stats.filamentG ? ` · ${job.stats.filamentG.toFixed(1)} g filament` : ''}{job.stats.pierces ? ` · ${job.stats.pierces} pierces` : ''} · {(job.stats.cutLength / 1000).toFixed(2)} m of path</div>}
    {cliLayers && <div className="text-[11px] mt-1.5">{cliLayers.length} layers at {s.metalLayer} mm</div>}
    {job?.warnings.map((w, i) => <div key={i} className="text-[10.5px] mt-1" style={{ color: LV.warn }}>{w}</div>)}

    {out && <div className="flex gap-1.5 mt-2 flex-wrap">
      <button className="cad-btn" onClick={() => dl(out.name, out.data, out.type)} data-testid="fab-download"><Download size={13}/>{out.name.split('.').pop()!.toUpperCase()}</button>
      {kind !== 'cut' && !is2D && <button className="cad-btn" onClick={() => dl(`${base}.stl`, writeStl(meshes, base) as BlobPart, 'model/stl')}><Download size={13}/>STL</button>}
    </div>}
    {out && machine && machine.link.kind !== 'file' && <div className="mt-2 p-2 rounded-lg" style={{ background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.2)' }}>
      {machine.link.kind !== 'serial' && <>
        <input value={target.host} onChange={e => setTarget(t => ({ ...t, host: e.target.value }))} placeholder="Machine address, e.g. 192.168.1.40" className="w-full h-7 rounded bg-white/5 border border-white/10 px-2 text-[11px] text-white mb-1" aria-label="Machine address" data-testid="fab-host"/>
        {machine.link.kind !== 'moonraker' && machine.link.kind !== 'duet' && <input value={target.apiKey} onChange={e => setTarget(t => ({ ...t, apiKey: e.target.value }))} placeholder="API key (from the machine's settings)" type="password" className="w-full h-7 rounded bg-white/5 border border-white/10 px-2 text-[11px] text-white mb-1" aria-label="API key"/>}
      </>}
      <div className="flex gap-1.5">
        <button className="cad-btn cad-primary flex-1 justify-center" onClick={() => void send()} disabled={busy || !!progress || (machine.link.kind !== 'serial' && !target.host)} data-testid="fab-send"><Send size={13}/>{machine.link.kind === 'serial' ? 'Connect over USB and run' : 'Send and start'}</button>
        {progress && <button className="cad-btn" onClick={() => { stopRef.current.stop = true; }} aria-label="Stop"><Square size={13}/></button>}
      </div>
      {progress && <div className="mt-1.5 h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full" style={{ width: `${progress[0] / progress[1] * 100}%`, background: '#fbbf24' }}/></div>}
      <div className="text-[10px] mt-1" style={{ color: DIM }}>Stay with the machine while it runs; the stop button halts sending, not motion already queued. Use the machine's own emergency stop.</div>
    </div>}
    {out && machine?.link.kind === 'file' && <div className="text-[10.5px] mt-2" style={{ color: DIM }}>{machine.link.note}</div>}
    {msg && <div className="text-[11px] mt-2" style={{ color: /could not|refused|said|error|stopped/i.test(msg) ? LV.error : LV.pass }} data-testid="fab-msg">{msg}</div>}
  </div>;
}

function Preview({ job, layers, layer, setLayer }: { job: Job | null; layers: Layer[] | null; layer: number; setLayer: (n: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const g = cv.getContext('2d')!; const W = cv.width, H = cv.height; g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
    // Collect what to draw: one layer for layered jobs, everything otherwise.
    const segs: Array<{ a: P2; b: P2; rapid: boolean }> = []; const loops: Loop[] = [];
    if (job && job.kind !== 'lathe') {
      let x = 0, y = 0, cur = -1;
      for (const m of job.moves) { if (m.t === 'layer') cur = m.n; if (m.t !== 'rapid' && m.t !== 'feed') continue; const nx = m.x ?? x, ny = m.y ?? y; if (!layers || cur === layer) if (nx !== x || ny !== y) segs.push({ a: [x, y], b: [nx, ny], rapid: m.t === 'rapid' }); x = nx; y = ny; }
    } else if (job?.kind === 'lathe') {
      let x = 0, z = 0; for (const m of job.moves) { if (m.t !== 'rapid' && m.t !== 'feed') continue; const nx = m.x ?? x, nz = m.z ?? z; segs.push({ a: [z, x / 2], b: [nz, nx / 2], rapid: m.t === 'rapid' }); x = nx; z = nz; }
    } else if (layers) loops.push(...(layers[layer]?.loops ?? []));
    const pts = [...segs.flatMap(s => [s.a, s.b]), ...loops.flat()]; if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = Math.min((W - 16) / (x1 - x0 || 1), (H - 16) / (y1 - y0 || 1)); const T = (p: P2) => [8 + (p[0] - x0) * sc, H - 8 - (p[1] - y0) * sc];
    for (const s of segs) { g.strokeStyle = s.rapid ? 'rgba(255,255,255,.18)' : '#fbbf24'; g.setLineDash(s.rapid ? [3, 3] : []); g.lineWidth = s.rapid ? 0.6 : 1; g.beginPath(); const a = T(s.a), b = T(s.b); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = '#7dd3fc'; for (const l of loops) { g.beginPath(); l.forEach((p, i) => { const q = T(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.stroke(); }
  }, [job, layers, layer]);
  return <div className="mt-2">
    <canvas ref={ref} width={290} height={200} className="rounded-lg w-full" style={{ border: '1px solid rgba(255,255,255,.08)' }} data-testid="fab-preview"/>
    {layers && layers.length > 1 && <label className="flex items-center gap-2 text-[11px]" style={{ color: DIM }}>Layer<input type="range" min={0} max={layers.length - 1} value={layer} onChange={e => setLayer(+e.target.value)} className="flex-1" aria-label="Layer"/><span className="tabular-nums w-14 text-right">{layer + 1}/{layers.length}</span></label>}
  </div>;
}

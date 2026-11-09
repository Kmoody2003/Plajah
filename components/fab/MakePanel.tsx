// Make: take the model or drawing open in the CAD room to a real machine. Pick a process and a
// machine, check manufacturability, prepare the toolpath with our own CAM, preview it, then download
// the file or send it straight to the machine.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Factory, Play, Download, Send, Square, Store, Upload, Trash2 } from 'lucide-react';
import { processHazards, profileHazards, openHazards, sortHazards } from '../../services/safety/hazards';
import { rasterJob, waterlineJob, type CutterShape } from '../../services/fab/surface';
import { machiningHazards } from '../../services/fab/camSafety';
import { adaptiveJob } from '../../services/fab/adaptive';
import SheetMetalPanel from './SheetMetalPanel';
import { meshBounds } from '../../services/fab/slice';
import { importProfiles, applyProfiles, loadProfiles, saveProfiles, mergeProfiles, renderGcode, settingsVars, jobVars, type SavedProfile, type ProfileKind, type Flat } from '../../services/fab/profiles';
import { INFILL_PATTERNS, type InfillPattern } from '../../services/fab/infill';
import type { SeamMode, FdmOptions } from '../../services/fab/cam';
import SafetyPanel, { BuildTermsGate, termsAccepted } from '../safety/SafetyPanel';
import ExchangeRoom from '../supply/ExchangeRoom';
import { PROCESS_CATEGORY } from '../../services/supply/directory';
import type { CadModel } from '../../services/cad/model';
import { MM_PER_UNIT } from '../../services/cad/model';
import { PROCESSES, machinesFor, type Process, type Machine, type Family } from '../../services/fab/machines';
import { type Job, cutJob, fdmJob, latheJob, turnedProfile, writeCli, FDM_DEFAULTS } from '../../services/fab/cam';
import { entitiesToPaths, regions, area, type Loop, type P2 } from '../../services/fab/geom2d';
import { sliceMesh, type Layer, type MeshIn } from '../../services/fab/slice';
import { post, fileExtension } from '../../services/fab/gcode';
import { dfm2d, dfm3d, type DfmFinding } from '../../services/fab/dfm';
import { write3mf } from '../../services/fab/threeMf';
import { sendToMachine, streamGcode, openWebSerial } from '../../services/fab/connect';
import { writeStl } from '../../services/mech/geometry';
import { FILAMENTS, filamentById, RESINS } from '../../services/fab/materials';
import { RESIN_PRINTERS, resinJob, writeSl1, type ResinJob } from '../../services/fab/resin';

const DIM = 'rgba(255,255,255,.5)';
const LV: Record<string, string> = { error: '#f87171', warn: '#fbbf24', info: '#93c5fd', pass: '#4ade80' };
const FAMILIES: Family[] = ['Plastic printing', 'Metal printing', 'Machining', 'Cutting', 'Forming'];
const dl = (name: string, data: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const store = { get: (k: string) => { try { return JSON.parse(localStorage.getItem(`plajah.fab.${k}`) ?? 'null'); } catch { return null; } }, set: (k: string, v: unknown) => { try { localStorage.setItem(`plajah.fab.${k}`, JSON.stringify(v)); } catch { /* private mode */ } } };

interface Output { name: string; data: BlobPart; type: string; gcode?: string }
const lsStore = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { localStorage.setItem(k, v); } };
/** The signed-in user's id from their ID token (its `sub` claim), so saved profiles stay per user. */
const userFromToken = (t: string | null) => { try { const p = JSON.parse(atob((t ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return String(p.user_id ?? p.sub ?? ''); } catch { return ''; } };
const KIND_LABEL: Record<ProfileKind, string> = { printer: 'Printer profile', filament: 'Filament profile', process: 'Process profile' };

export default function MakePanel({ model, getToken }: { model: CadModel; getToken?: () => Promise<string | null> }) {
  const is2D = model.is2D || !model.meshes.length; const k = MM_PER_UNIT[model.units] || 1;
  const meshes = useMemo<MeshIn[]>(() => model.meshes.map(m => ({ positions: k === 1 ? m.positions : Float32Array.from(m.positions, v => v * k), indices: m.indices })), [model, k]);
  const paths = useMemo(() => { const p = entitiesToPaths(model.entities.filter(e => e.layer !== 'Defpoints')); const s = (pt: P2): P2 => [pt[0] * k, pt[1] * k]; return { loops: p.loops.map(l => l.map(s)), open: p.open.map(l => l.map(s)) }; }, [model, k]);
  const procs = PROCESSES.filter(p => (is2D ? p.input === '2d' : p.input !== '2d'));
  const [procId, setProcId] = useState<string>(() => (is2D ? 'laser-co2' : 'fdm'));
  const proc = (procs.find(p => p.id === procId) ?? procs[0]) as Process;
  const machines = machinesFor(proc.id); const [machineId, setMachineId] = useState(machines[0]?.id ?? '');
  const baseMachine = (machines.find(m => m.id === machineId) ?? machines[0]) as Machine | undefined;
  useEffect(() => { setMachineId(machinesFor(proc.id)[0]?.id ?? ''); setJob(null); setOut(null); }, [proc.id]);
  // Settings.
  const [s, setS] = useState({ layer: 0.2, infill: 20, walls: 2, nozzleTemp: 210, bedTemp: 60, kerf: proc.rules.kerf ?? 0.15, feed: 1200, power: 80, thickness: 3, material: '', tool: 6.35, stepDown: 3, stock: 25, doc: 1, metalLayer: 0.04,
    filament: 'pla', supports: 'none' as 'none' | 'buildplate' | 'everywhere', adhesion: 'skirt' as 'none' | 'skirt' | 'brim',
    resinPrinter: 'sl1s', resin: 'standard', resinLayer: 0.05, resinSupports: true,
    infillPattern: 'lines' as InfillPattern, seam: 'aligned' as SeamMode, supportStyle: 'grid' as 'grid' | 'tree', ironing: false, adaptive: false, maxVolumetric: 0,
    strategy: 'waterline' as 'waterline' | 'raster', cutter: 'ball' as CutterShape, scallop: 0.02, stockToLeave: 0, reach: 40, rpm: 12000,
    routerOp: 'profile' as 'profile' | 'adaptive', pocketDepth: 6, load: 15, tabCount: 4, tabWidth: 8, tabHeight: 2, onionSkin: 0 });
  // Imported slicer profiles (OrcaSlicer, Bambu Studio, PrusaSlicer, SuperSlicer, 3MF projects), saved per user on this device.
  const [user, setUser] = useState('');
  useEffect(() => { let on = true; getToken?.().then(t => { if (on) setUser(userFromToken(t)); }).catch(() => {}); return () => { on = false; }; }, [getToken]);
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  useEffect(() => { setProfiles(loadProfiles(lsStore, user)); }, [user]);
  const [sel, setSel] = useState<Record<ProfileKind, string>>({ printer: '', filament: '', process: '' });
  const [importNote, setImportNote] = useState<string[]>([]);
  const picked = useMemo(() => ({ printer: profiles.find(p => p.id === sel.printer) ?? null, filament: profiles.find(p => p.id === sel.filament) ?? null, process: profiles.find(p => p.id === sel.process) ?? null }), [profiles, sel]);
  const applied = useMemo(() => applyProfiles(picked), [picked]);
  const [rendered, setRendered] = useState<{ start?: string; end?: string; skipped: string[] } | null>(null);
  useEffect(() => { setRendered(null); }, [sel.printer, sel.filament]);
  const fdmLike = proc.id === 'fdm';
  // A printer profile reshapes the chosen machine (bed, nozzle, G-code flavour); the connection stays the machine's.
  const machine: Machine | undefined = baseMachine && fdmLike && picked.printer ? { ...baseMachine, bed: applied.bed ?? baseMachine.bed, nozzle: applied.nozzle ?? baseMachine.nozzle, dialect: applied.dialect ?? baseMachine.dialect } : baseMachine;
  const persist = (list: SavedProfile[]) => { setProfiles(list); if (!saveProfiles(lsStore, list, user)) setImportNote(n => [...n, 'Could not save profiles on this device (storage full or private mode); they last until you close the page.']); };
  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = await Promise.all([...files].map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
    const r = importProfiles(list, profiles);
    const next = mergeProfiles(profiles, r.profiles); persist(next);
    const latest = (k: ProfileKind) => r.profiles.filter(p => p.kind === k).pop();
    const nextSel = { ...sel }; (['printer', 'filament', 'process'] as ProfileKind[]).forEach(k => { const p = latest(k); if (p) nextSel[k] = p.id; });
    setSel(nextSel); const f = latest('filament'); const ps = latest('process'); if (f) applyFilamentProfile(f); if (ps) applyProcessProfile(ps);
    setImportNote([r.profiles.length ? `Imported ${r.profiles.map(p => `${p.name} (${p.kind})`).join(', ')}.` : 'No profiles found in those files.', ...r.warnings, ...r.profiles.flatMap(p => p.warnings)]);
  };
  // Choosing a filament or process profile fills the visible settings, so what slices is what you see and can edit.
  const applyFilamentProfile = (p: SavedProfile | null) => { const f = p?.filament; if (!f) return; setS(x => ({ ...x, nozzleTemp: f.nozzleTemp ?? x.nozzleTemp, bedTemp: f.bedTemp ?? x.bedTemp, maxVolumetric: f.maxVolumetric ?? x.maxVolumetric })); };
  const applyProcessProfile = (p: SavedProfile | null) => {
    const q = p?.process; if (!q) return;
    setS(x => ({ ...x, layer: q.layer ?? x.layer, infill: q.infill !== undefined ? Math.round(q.infill * 100) : x.infill, walls: q.walls ?? x.walls, infillPattern: q.infillPattern ?? x.infillPattern, seam: q.seam ?? x.seam,
      ironing: q.ironing ?? x.ironing, supports: q.supports ?? x.supports, supportStyle: q.supportStyle ?? x.supportStyle, adhesion: q.adhesion ?? x.adhesion }));
  };
  const choose = (k: ProfileKind, id: string) => { setSel(x => ({ ...x, [k]: id })); const p = profiles.find(q => q.id === id) ?? null; if (k === 'filament') applyFilamentProfile(p); if (k === 'process') applyProcessProfile(p); };
  const removeProfile = (k: ProfileKind) => { const id = sel[k]; if (!id) return; persist(profiles.filter(p => p.id !== id)); setSel(x => ({ ...x, [k]: '' })); };
  /** Everything the FDM slicer gets: built-in filament, then profiles, then the visible settings. */
  const fdmOptions = (): FdmOptions => {
    const fil = filamentById(proc.id === 'bound-metal' ? 'bound-316l' : s.filament) ?? FILAMENTS[0];
    const bed = machine?.bed ?? [220, 220, 250];
    return { ...FDM_DEFAULTS, fan: fil.fan, retract: fil.retract, retractSpeed: fil.retractSpeed, density: fil.density, speed: fil.speed, ...(fdmLike ? applied.fdm : {}),
      layer: s.layer, infill: s.infill / 100, walls: s.walls, nozzleTemp: s.nozzleTemp, bedTemp: s.bedTemp, nozzle: machine?.nozzle ?? 0.4, process: proc.id,
      supports: s.supports, supportStyle: s.supportStyle, adhesion: s.adhesion, infillPattern: s.infillPattern, seam: s.seam, ironing: s.ironing,
      adaptive: s.adaptive ? (typeof applied.fdm.adaptive === 'object' ? applied.fdm.adaptive : true) : false, maxVolumetric: s.maxVolumetric > 0 ? s.maxVolumetric : undefined,
      center: applied.bedCenter ?? [bed[0] / 2, bed[1] / 2], bed: { w: bed[0], d: bed[1], shape: applied.bedShape } };
  };
  const profileGcode = useMemo(() => {
    const g: Array<{ label: string; text: string }> = []; const pr = picked.printer?.printer, fi = picked.filament?.filament;
    const st = [rendered?.start ?? [pr?.startGcode, fi?.startGcode].filter(Boolean).join('\n')].filter(Boolean)[0]; const en = [rendered?.end ?? [fi?.endGcode, pr?.endGcode].filter(Boolean).join('\n')].filter(Boolean)[0];
    if (st) g.push({ label: 'Start', text: st }); if (en) g.push({ label: 'End', text: en }); return g;
  }, [picked, rendered]);
  const [rjob, setRjob] = useState<ResinJob | null>(null);
  useEffect(() => { setS(x => ({ ...x, kerf: proc.id === 'router' ? x.tool : proc.rules.kerf ?? 0, feed: proc.id === 'plasma' ? 2500 : proc.id === 'router' ? 1500 : proc.id.startsWith('laser') ? 1200 : 800 })); }, [proc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [job, setJob] = useState<(Job & { layers?: Layer[] }) | null>(null); const [cliLayers, setCliLayers] = useState<Layer[] | null>(null);
  const [out, setOut] = useState<Output | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [layer, setLayer] = useState(0); const [progress, setProgress] = useState<[number, number] | null>(null); const stopRef = useRef({ stop: false });
  const [target, setTarget] = useState<{ host: string; apiKey: string }>(() => store.get(`target.${machineId}`) ?? { host: '', apiKey: '' });
  useEffect(() => { setTarget(store.get(`target.${machineId}`) ?? { host: '', apiKey: '' }); }, [machineId]);

  const findings = useMemo<DfmFinding[]>(() => is2D ? dfm2d(paths.loops, proc, { thickness: s.thickness, material: s.material, tool: proc.id === 'router' || proc.id === 'mill3' ? s.tool : undefined }) : dfm3d(meshes, proc, machine), [is2D, paths, meshes, proc, machine, s.thickness, s.material, s.tool]);
  const blocked = findings.some(f => f.level === 'error');
  // Machine safety: critical hazards must be acknowledged before preparing, downloading or sending.
  const hazards = useMemo(() => {
    const base0 = processHazards(proc.id, s.material || applied.filamentType || s.filament);
    const surfacing = (proc.id === 'mill3' || proc.id === 'mill5') && !is2D && meshes.length > 0;
    const routerExtra = proc.id === 'router' && is2D ? machiningHazards(s.routerOp === 'adaptive' ? { op: 'adaptive', engagement: s.load / 100, depth: s.pocketDepth, reach: s.reach, toolDia: s.tool } : { op: 'profile', throughCut: true, tabs: s.tabCount > 0 ? { count: s.tabCount, width: s.tabWidth, height: s.tabHeight } : null, onionSkin: s.onionSkin, smallestPart: Math.min(...regions(paths.loops).map(r => Math.abs(area(r.outer)))) }) : [];
    const base = routerExtra.length ? sortHazards([...base0, ...routerExtra]) : surfacing ? (() => { const b = meshBounds(meshes); return sortHazards([...base0, ...machiningHazards({ op: 'surface', depth: b.max[2] - b.min[2], reach: s.reach, toolDia: s.tool, finishFromStock: true })]); })() : base0;
    if (!fdmLike || (!picked.printer && !picked.filament && !picked.process)) return base;
    const f = applied.fdm; const speeds = [f.speed, f.outerWallSpeed, f.innerWallSpeed, f.infillSpeed, f.solidSpeed].filter((v): v is number => typeof v === 'number');
    return sortHazards([...base, ...profileHazards({ material: applied.filamentType || filamentById(s.filament)?.name, nozzleTemp: s.nozzleTemp, bedTemp: s.bedTemp, firstLayerNozzleTemp: f.firstLayerNozzleTemp, firstLayerBedTemp: f.firstLayerBedTemp,
      speed: Math.max(0, ...speeds), travel: f.travel ?? 0, maxX: applied.limits?.maxX, maxY: applied.limits?.maxY, gcode: profileGcode, source: [picked.printer, picked.filament, picked.process].filter(Boolean).map(p => p!.name).join(', ') })]);
  }, [proc.id, s.material, s.filament, s.nozzleTemp, s.bedTemp, applied, picked, fdmLike, profileGcode, is2D, meshes, s.reach, s.tool, s.routerOp, s.load, s.pocketDepth, s.tabCount, s.tabWidth, s.tabHeight, s.onionSkin, paths]);
  const [sheet, setSheet] = useState(false); const [acks, setAcks] = useState<string[]>([]); const [terms, setTerms] = useState(termsAccepted); const [exchange, setExchange] = useState(false);
  const openCritical = openHazards(hazards, acks);
  const base = model.name.replace(/\.[^.]+$/, '') || 'part';

  const prepare = () => {
    setBusy(true); setMsg(''); setOut(null); setJob(null); setCliLayers(null); setRjob(null);
    setTimeout(() => {
      try {
        const scale = proc.rules.shrink ? 1 / (1 - proc.rules.shrink) : 1;
        if (proc.id === 'fdm' || proc.id === 'bound-metal') {
          const scaled = scale === 1 ? meshes : meshes.map(m => ({ positions: Float32Array.from(m.positions, v => v * scale), indices: m.indices }));
          const fo = fdmOptions(); const j = fdmJob(scaled, fo);
          // Profile start/end G-code: filled from our values, never run here; unresolved lines are commented out for review.
          let startGcode: string | undefined, endGcode: string | undefined; let skipped: string[] = [];
          const pr = fdmLike ? picked.printer?.printer : undefined, fi = fdmLike ? picked.filament?.filament : undefined;
          if (pr?.startGcode || pr?.endGcode) {
            const raw: Flat = { ...(picked.printer?.settings ?? {}), ...(picked.filament?.settings ?? {}), ...(picked.process?.settings ?? {}) };
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const l of j.layers[0]?.loops ?? []) for (const p of l) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
            const bedMin = pr.bedMin, bedMax: P2 = [pr.bedMin[0] + pr.bed[0], pr.bedMin[1] + pr.bed[1]];
            const vars = { ...settingsVars(raw), ...jobVars(fo, { bedMin, bedMax, firstLayerMin: Number.isFinite(x0) ? [x0, y0] : bedMin, firstLayerMax: Number.isFinite(x1) ? [x1, y1] : bedMax, layers: j.layers.length, maxZ: j.layers[j.layers.length - 1]?.z, filamentType: applied.filamentType }) };
            const st = renderGcode([pr.startGcode, fi?.startGcode].filter(Boolean).join('\n'), vars), en = renderGcode([fi?.endGcode, pr.endGcode].filter(Boolean).join('\n'), vars);
            startGcode = pr.startGcode ? st.text : undefined; endGcode = pr.endGcode ? en.text : undefined; skipped = [...st.skipped, ...en.skipped];
            setRendered({ start: startGcode, end: endGcode, skipped });
          }
          const g = post(j, { dialect: machine?.dialect ?? 'marlin', name: base, nozzleTemp: fo.firstLayerNozzleTemp ?? s.nozzleTemp, bedTemp: fo.firstLayerBedTemp ?? s.bedTemp, startGcode, endGcode }); setJob(j); setLayer(0);
          if (skipped.length) setMsg(`${skipped.length} line${skipped.length > 1 ? 's' : ''} of profile G-code used placeholders we could not fill; they are commented out. Review them under Custom G-code.`);
          setOut({ name: `${base}.gcode`, data: g, type: 'text/plain', gcode: g });
        } else if (proc.id === 'resin') {
          const ro = { printer: s.resinPrinter, resin: s.resin, layer: s.resinLayer, supports: s.resinSupports };
          const rj = resinJob(meshes, ro); setRjob(rj); setLayer(0);
          setOut({ name: `${base}.sl1`, data: writeSl1(rj, base, ro) as BlobPart, type: 'application/zip' });
          if (rj.printer.id !== 'sl1s') setMsg(`Open ${base}.sl1 in UVtools (free) and convert it to your printer's format.`);
        } else if (proc.id === 'lpbf' || proc.id === 'ebm') {
          const layers = sliceMesh(meshes, s.metalLayer, 20000); setCliLayers(layers); setLayer(0);
          setOut({ name: `${base}.cli`, data: writeCli(layers, base), type: 'text/plain' });
        } else if (proc.input === '3d' && !['mill3', 'mill5', 'ded'].includes(proc.id)) {
          const data = write3mf(meshes.map(m => ({ ...m, name: base })), { title: base, scale });
          setOut({ name: `${base}.3mf`, data: data as BlobPart, type: 'model/3mf' });
        } else if (proc.id === 'lathe') {
          const j = latheJob(turnedProfile(meshes), { stock: s.stock, doc: s.doc, finish: 0.2, feed: s.feed / 8, finishFeed: s.feed / 15, rpm: 1200 });
          const g = post(j, { dialect: machine?.dialect ?? 'lathe-iso', name: base, coolant: true }); setJob(j); setOut({ name: `${base}.${fileExtension(machine?.dialect ?? 'lathe-iso')}`, data: g, type: 'text/plain', gcode: g });
        } else if ((proc.id === 'mill3' || proc.id === 'mill5') && machine?.dialect) {
          // Our own 3D surfacing: waterline for steep walls, parallel rows for gentle surfaces.
          const so = { process: proc.id, cutter: { shape: s.cutter, dia: s.tool }, scallop: s.scallop, stockToLeave: s.stockToLeave, feed: s.feed, rpm: s.rpm, reach: s.reach };
          const j = s.strategy === 'raster' ? rasterJob(meshes, so) : waterlineJob(meshes, so);
          const g = post(j, { dialect: machine.dialect, name: base, coolant: machine.dialect === 'iso' }); setJob(j); setOut({ name: `${base}.${fileExtension(machine.dialect)}`, data: g, type: 'text/plain', gcode: g });
          if (proc.id === 'mill5') setMsg('These are 3-axis toolpaths with the head vertical; tilt-axis surfacing is not done yet.');
        } else if (proc.input === '3d') {
          // 3D milling / DED: we export the model for full 3D CAM, plus a profile job from its footprint.
          const data = write3mf(meshes.map(m => ({ ...m, name: base })), { title: base });
          setOut({ name: `${base}.3mf`, data: data as BlobPart, type: 'model/3mf' }); setMsg('Exports the checked model for the deposition machine’s own path planner.');
        } else if (proc.id === 'router' && s.routerOp === 'adaptive' && machine?.dialect) {
          const j = adaptiveJob(paths.loops, { process: 'router', tool: s.tool, load: s.tool * s.load / 100, depth: s.pocketDepth, stepDown: Math.min(s.pocketDepth, s.reach), feed: s.feed, rpm: 18000, stockToLeave: s.stockToLeave });
          const g = post(j, { dialect: machine.dialect, name: base }); setJob(j); setOut({ name: `${base}.${fileExtension(machine.dialect)}`, data: g, type: 'text/plain', gcode: g });
        } else if (proc.outputs.includes('gcode') && machine?.dialect) {
          const j = cutJob(paths.loops, paths.open, { process: proc.id, kerf: s.kerf, feed: s.feed, power: proc.id === 'router' ? 18000 : s.power, thickness: proc.id === 'router' ? s.thickness : undefined, stepDown: s.stepDown, pierceDelay: proc.id === 'plasma' ? 0.5 : undefined,
            tabs: proc.id === 'router' && s.tabCount > 0 ? { count: s.tabCount, width: s.tabWidth, height: s.tabHeight } : null, onionSkin: proc.id === 'router' ? s.onionSkin : 0 });
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
  const pick = (key: keyof typeof s, label: string, opts: string[][], on?: (v: string) => void) => <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>{label}</span><select value={String(s[key])} onChange={e => on ? on(e.target.value) : setS(x => ({ ...x, [key]: e.target.value }))} className="w-32 h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label={label} data-testid={`fab-${String(key)}`}>{opts.map(([v, t]) => <option key={v} value={v} style={{ background: '#15131d' }}>{t}</option>)}</select></label>;
  const kind = (proc.id === 'mill3' || proc.id === 'mill5') && !is2D ? 'surface' : proc.id === 'resin' ? 'resin' : proc.id === 'fdm' || proc.id === 'bound-metal' ? 'fdm' : proc.id === 'lpbf' || proc.id === 'ebm' ? 'metal' : proc.id === 'lathe' ? 'lathe' : proc.input === '2d' ? 'cut' : 'export';

  return <div className="text-[12px]" data-testid="fab-make">
    <div className="flex items-center gap-1.5 font-bold mb-2"><Factory size={14} color="#fbbf24"/>Make it</div>
    <select value={proc.id} onChange={e => setProcId(e.target.value)} className="w-full h-7 rounded bg-white/5 border border-white/10 text-[11.5px] text-white mb-1.5" aria-label="Process" data-testid="fab-process">
      {FAMILIES.map(f => { const list = procs.filter(p => p.family === f); return list.length ? <optgroup key={f} label={f} style={{ background: '#15131d' }}>{list.map(p => <option key={p.id} value={p.id} style={{ background: '#15131d' }}>{p.name}</option>)}</optgroup> : null; })}
    </select>
    <div className="text-[10.5px] mb-2" style={{ color: DIM }}>{proc.about} <span className="opacity-80">Materials: {proc.materials.join(', ')}.</span></div>
    {machines.length > 0 && <select value={machine?.id} onChange={e => setMachineId(e.target.value)} className="w-full h-7 rounded bg-white/5 border border-white/10 text-[11.5px] text-white mb-2" aria-label="Machine" data-testid="fab-machine">{machines.map(m => <option key={m.id} value={m.id} style={{ background: '#15131d' }}>{m.name}</option>)}</select>}

    <div className="p-2 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
      {kind === 'fdm' && proc.id === 'fdm' && <div className="mb-2 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }} data-testid="fab-profiles">
        <div className="flex items-center justify-between mb-1"><span className="font-semibold">Slicer profiles</span>
          <label className="cad-btn cursor-pointer" title="OrcaSlicer / Bambu Studio JSON or preset bundle, PrusaSlicer / SuperSlicer .ini or config bundle, or a .3mf project"><Upload size={12}/>Import
            <input type="file" multiple accept=".json,.ini,.3mf,.zip,.orca_printer,.orca_filament,.bbscfg,.bbsflmt" className="hidden" onChange={e => { void onImport(e.target.files); e.target.value = ''; }} data-testid="fab-profile-import"/></label></div>
        <div className="text-[10px] mb-1" style={{ color: DIM }}>Use the presets you already have from OrcaSlicer, Bambu Studio, PrusaSlicer or SuperSlicer. Select a printer preset together with the presets it inherits from. Saved on this device for your account.</div>
        {(['printer', 'filament', 'process'] as ProfileKind[]).map(k => { const list = profiles.filter(p => p.kind === k); return <label key={k} className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>{KIND_LABEL[k]}</span><span className="flex items-center gap-1">
          <select value={sel[k]} onChange={e => choose(k, e.target.value)} className="w-32 h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label={KIND_LABEL[k]} data-testid={`fab-profile-${k}`}><option value="" style={{ background: '#15131d' }}>Built-in</option>{list.map(p => <option key={p.id} value={p.id} style={{ background: '#15131d' }}>{p.name}</option>)}</select>
          {sel[k] && <button className="opacity-60 hover:opacity-100" onClick={() => removeProfile(k)} aria-label={`Delete ${KIND_LABEL[k]}`}><Trash2 size={12}/></button>}</span></label>; })}
        {picked.printer?.printer && <div className="text-[10px] mt-0.5" style={{ color: DIM }} data-testid="fab-profile-summary">Bed {picked.printer.printer.bedShape === 'circle' ? `Ø${picked.printer.printer.bed[0]}` : `${picked.printer.printer.bed[0]} × ${picked.printer.printer.bed[1]}`} × {picked.printer.printer.bed[2]} mm · nozzle {picked.printer.printer.nozzle ?? '?'} mm · {picked.printer.printer.dialect ?? `${baseMachine?.dialect ?? 'marlin'} (flavour not recognised)`}{applied.limits?.maxX ? ` · max ${applied.limits.maxX} mm/s` : ''}{applied.limits?.accel ? ` · ${applied.limits.accel} mm/s²` : ''}</div>}
        {importNote.map((n, i) => <div key={i} className="text-[10px] mt-0.5" style={{ color: i ? LV.warn : LV.pass }}>{n}</div>)}
        {profileGcode.length > 0 && <details className="mt-1" data-testid="fab-profile-gcode"><summary className="cursor-pointer text-[10.5px]">Custom G-code from the profile (review before printing{rendered?.skipped.length ? `, ${rendered.skipped.length} skipped` : ''})</summary>
          {profileGcode.map(g => <div key={g.label}><div className="text-[10px] mt-1" style={{ color: DIM }}>{g.label}{rendered ? ' (as it goes in the file)' : ' (template; filled in when you prepare)'}</div><pre className="text-[9.5px] leading-tight whitespace-pre-wrap max-h-40 overflow-auto p-1.5 rounded bg-black/40 border border-white/10">{g.text}</pre></div>)}
          <div className="text-[10px] mt-1" style={{ color: DIM }}>We never run this ourselves; it is copied into the G-code file as text. Lines we could not fill are commented out.</div></details>}
      </div>}
      {kind === 'fdm' && proc.id === 'fdm' && <>
        {pick('filament', 'Filament', FILAMENTS.map(f => [f.id, f.name]), v => { const f = filamentById(v); if (f) setS(x => ({ ...x, filament: v, nozzleTemp: f.nozzle, bedTemp: f.bed })); })}
        <div className="text-[10px] mb-1" style={{ color: DIM }}>{filamentById(s.filament)?.notes}</div>
        {pick('supports', 'Supports', [['none', 'None'], ['buildplate', 'From the bed'], ['everywhere', 'Everywhere']])}
        {s.supports !== 'none' && pick('supportStyle', 'Support style', [['grid', 'Grid columns'], ['tree', 'Tree (branches)']])}
        {pick('adhesion', 'Bed adhesion', [['none', 'None'], ['skirt', 'Skirt'], ['brim', 'Brim']])}
        {pick('infillPattern', 'Infill pattern', INFILL_PATTERNS)}
        {pick('seam', 'Seam', [['aligned', 'Aligned'], ['rear', 'Rear'], ['nearest', 'Nearest'], ['random', 'Scattered']])}
        <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Adaptive layer height</span><input type="checkbox" checked={s.adaptive} onChange={e => setS(x => ({ ...x, adaptive: e.target.checked }))} aria-label="Adaptive layer height" data-testid="fab-adaptive"/></label>
        <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Iron top surfaces</span><input type="checkbox" checked={s.ironing} onChange={e => setS(x => ({ ...x, ironing: e.target.checked }))} aria-label="Ironing" data-testid="fab-ironing"/></label>
        {num('maxVolumetric', 'Max flow (0 = off)', 'mm³/s', 1)}
      </>}
      {kind === 'resin' && <>
        {pick('resinPrinter', 'Printer', RESIN_PRINTERS.map(p => [p.id, p.name]))}
        {pick('resin', 'Resin', RESINS.map(r => [r.id, r.name]))}
        {num('resinLayer', 'Layer height', 'mm', 0.01)}
        <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Raft and pillar supports</span><input type="checkbox" checked={s.resinSupports} onChange={e => setS(x => ({ ...x, resinSupports: e.target.checked }))} aria-label="Resin supports"/></label>
        <div className="text-[10px] mt-1" style={{ color: DIM }}>{RESINS.find(r => r.id === s.resin)?.notes} Wear nitrile gloves; uncured resin is a skin sensitiser.</div>
      </>}
      {kind === 'fdm' && <>{num('layer', 'Layer height', 'mm', 0.05)}{num('infill', 'Infill', '%', 5)}{num('walls', 'Walls')}{num('nozzleTemp', 'Nozzle', '°C', 5)}{num('bedTemp', 'Bed', '°C', 5)}</>}
      {kind === 'metal' && <>{num('metalLayer', 'Layer thickness', 'mm', 0.01)}<div className="text-[10px] mt-1" style={{ color: DIM }}>Slices to CLI contours; your build processor adds hatching and supports for its laser parameters.</div></>}
      {kind === 'lathe' && <>{num('stock', 'Bar stock Ø', 'mm', 1)}{num('doc', 'Depth of cut', 'mm', 0.1)}{num('feed', 'Feed base', 'mm/min', 50)}</>}
      {kind === 'cut' && <>
        {proc.id === 'router' ? <>{pick('routerOp', 'Operation', [['profile', 'Cut out (profile)'], ['adaptive', 'Adaptive pocket']])}{num('tool', 'Tool Ø', 'mm', 0.1)}
          {s.routerOp === 'adaptive' ? <div data-testid="fab-adaptive-pocket">{num('pocketDepth', 'Pocket depth', 'mm', 0.5)}{num('load', 'Radial load', '% of Ø', 1)}{num('stockToLeave', 'Wall stock to leave', 'mm', 0.1)}{num('reach', 'Flute length', 'mm', 1)}
            <div className="text-[10px] mt-0.5" style={{ color: DIM }}>Clears closed shapes from the middle out with a light, steady cut at full flute depth; islands inside a shape are left standing. The feed eases off where the cut gets heavier.</div></div>
          : <div data-testid="fab-holding">{num('thickness', 'Sheet thickness', 'mm', 0.5)}{num('stepDown', 'Depth per pass', 'mm', 0.5)}
            {num('tabCount', 'Tabs per part (0 = none)', '', 1)}{s.tabCount > 0 && <>{num('tabWidth', 'Tab width', 'mm', 0.5)}{num('tabHeight', 'Tab height', 'mm', 0.5)}</>}{num('onionSkin', 'Onion skin (0 = off)', 'mm', 0.1)}
            <div className="text-[10px] mt-0.5" style={{ color: DIM }}>Tabs keep cut-out parts attached to the sheet so they cannot be thrown; snap them free and sand flush afterwards. An onion skin leaves a thin floor on every pass and cuts it in one last light pass.</div></div>}</> : <>{num('kerf', 'Kerf', 'mm', 0.05)}{num('thickness', 'Material thickness', 'mm', 0.5)}{proc.id !== 'waterjet' && proc.id !== 'drag-knife' && num('power', 'Power', '%', 5)}</>}
        {num('feed', 'Feed', 'mm/min', 50)}
        <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Material</span><input value={s.material} onChange={e => setS(x => ({ ...x, material: e.target.value }))} placeholder={proc.materials[0]} className="w-28 h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white" aria-label="Material"/></label>
      </>}
      {kind === 'surface' && <div data-testid="fab-surface">
        {pick('strategy', 'Finishing', [['waterline', 'Waterline (Z levels)'], ['raster', 'Parallel rows']])}
        {pick('cutter', 'Cutter', [['ball', 'Ball end mill'], ['flat', 'Flat end mill']])}
        {num('tool', 'Tool Ø', 'mm', 0.5)}{num('reach', 'Reach below holder', 'mm', 1)}
        {num('scallop', 'Scallop height', 'mm', 0.005)}{num('stockToLeave', 'Stock to leave', 'mm', 0.1)}
        {num('feed', 'Feed', 'mm/min', 50)}{num('rpm', 'Spindle', 'rpm', 500)}
        <div className="text-[10px] mt-1" style={{ color: DIM }}>The step-over comes from the scallop height; the part's top is the top of stock. Rough the bulk out first, leaving a little stock, then finish.</div>
      </div>}
      {kind === 'export' && <div className="text-[10.5px]" style={{ color: DIM }}>{proc.rules.shrink ? `Exports 3MF enlarged ${((1 / (1 - proc.rules.shrink) - 1) * 100).toFixed(1)}% for sintering shrinkage.` : 'Exports a checked, bed-placed 3MF for the machine\'s build software.'}</div>}
    </div>

    <div className="mb-2" data-testid="fab-dfm">{findings.map((f, i) => <div key={i} className="flex gap-1.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: LV[f.level] }}/><div><div className={f.detail ? 'font-semibold' : ''} style={{ color: f.detail ? undefined : 'rgba(255,255,255,.65)' }}>{f.title}</div>{f.detail && <div className="text-[10.5px]" style={{ color: DIM }}>{f.detail}</div>}</div></div>)}</div>

    {hazards.length > 0 && <div className="mb-2 p-2 rounded-lg" style={{ background: 'rgba(244,63,94,.04)', border: `1px solid ${openCritical.length ? 'rgba(244,63,94,.45)' : 'rgba(255,255,255,.07)'}` }} data-testid="fab-safety">
      <SafetyPanel hazards={hazards} acked={acks} onAck={(id, v) => setAcks(a => v ? [...new Set([...a, id])] : a.filter(x => x !== id))} title="Machine safety"/>
    </div>}
    <button className="cad-btn cad-primary w-full justify-center" onClick={prepare} disabled={busy || blocked || openCritical.length > 0 || (is2D ? !paths.loops.length && !paths.open.length : !meshes.length)} data-testid="fab-prepare"><Play size={13}/>{busy ? 'Preparing…' : blocked ? 'Fix the problems above' : openCritical.length ? 'Acknowledge the safety items above' : 'Prepare'}</button>
    <button className="cad-btn w-full justify-center mt-1.5" onClick={() => setExchange(true)} data-testid="fab-exchange"><Store size={13}/>Get it made by a shop or service</button>
    {exchange && <ExchangeRoom onClose={() => setExchange(false)} getToken={getToken} initialCategory={(PROCESS_CATEGORY[proc.id] ?? ['3d-print'])[0]} prefill={{ title: `Make: ${base}`, processes: [proc.id].filter(id => ['fdm', 'resin', 'sls', 'lpbf', 'mill3', 'router', 'lathe', 'laser-co2', 'laser-fiber', 'plasma', 'waterjet', 'press-brake'].includes(id)), details: `${proc.name}. ${is2D ? 'Drawing' : 'Model'}: ${model.name}.`, hazards: hazards.filter(h => h.severity === 'critical').map(h => h.title) }}/>}
    {!terms && <BuildTermsGate onAccepted={() => setTerms(true)} getToken={getToken}/>}

    {proc.id !== 'press-brake' && <button className="cad-btn w-full justify-center mt-2" onClick={() => setSheet(v => !v)} data-testid="fab-sheet-toggle">{sheet ? 'Hide sheet-metal part' : 'Sheet-metal part: flat pattern and bends'}</button>}
    {(sheet || proc.id === 'press-brake') && <SheetMetalPanel name={base} brakeLength={proc.id === 'press-brake' ? machine?.bed[0] : undefined}/>}
    {(job || cliLayers) && <Preview job={job} layers={cliLayers ?? job?.layers ?? null} layer={layer} setLayer={setLayer}/>}
    {rjob && <ResinPreview job={rjob} layer={layer} setLayer={setLayer}/>}
    {rjob && <div className="text-[11px] mt-1.5" data-testid="fab-stats">About {(rjob.seconds / 3600).toFixed(1)} h · {rjob.layers.length} layers ({rjob.supportLayers} raft/lift) · {rjob.ml.toFixed(1)} ml resin</div>}
    {rjob?.warnings.map((w, i) => <div key={i} className="text-[10.5px] mt-1" style={{ color: LV.warn }}>{w}</div>)}
    {job?.meta.supportFilamentMm ? <div className="text-[10.5px] mt-1" style={{ color: DIM }}>Supports use {(Number(job.meta.supportFilamentMm) / 1000).toFixed(2)} m of filament.</div> : null}
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

function ResinPreview({ job, layer, setLayer }: { job: ResinJob; layer: number; setLayer: (n: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Crop to the area anything is ever exposed in.
  const box = useMemo(() => { let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1; const step = Math.max(1, Math.floor(job.layers.length / 40)); for (let i = 0; i < job.layers.length; i += step) { const m = job.layers[i].mask; for (let y = 0; y < m.h; y += 2) for (let x = 0; x < m.w; x += 2) if (m.bits[y * m.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return x1 < 0 ? null : { x0: Math.max(0, x0 - 20), y0: Math.max(0, y0 - 20), x1: x1 + 20, y1: y1 + 20 }; }, [job]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const g = cv.getContext('2d')!; const W = cv.width, H = cv.height; g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
    const L = job.layers[layer]; if (!L || !box) return; const m = L.mask; const bw = box.x1 - box.x0, bh = box.y1 - box.y0; const sc = Math.min(W / bw, H / bh);
    const img = g.createImageData(W, H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const x = Math.floor(box.x0 + px / sc), y = Math.floor(box.y1 - py / sc); if (x < 0 || y < 0 || x >= m.w || y >= m.h || !m.bits[y * m.w + x]) continue; const o = (py * W + px) * 4; img.data[o] = layer < job.supportLayers ? 125 : 251; img.data[o + 1] = layer < job.supportLayers ? 211 : 191; img.data[o + 2] = layer < job.supportLayers ? 252 : 36; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, [job, layer, box]);
  return <div className="mt-2">
    <canvas ref={ref} width={290} height={200} className="rounded-lg w-full" style={{ border: '1px solid rgba(255,255,255,.08)' }} data-testid="fab-resin-preview"/>
    <label className="flex items-center gap-2 text-[11px]" style={{ color: DIM }}>Layer<input type="range" min={0} max={job.layers.length - 1} value={layer} onChange={e => setLayer(+e.target.value)} className="flex-1" aria-label="Layer"/><span className="tabular-nums w-16 text-right">{layer + 1}/{job.layers.length}</span></label>
  </div>;
}

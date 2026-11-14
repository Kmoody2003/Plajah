// liveDataAdapters — the Plajah-native feeds behind the live data hub.
//
//   tela-sheet   a Tela GRID (sheet) or BASE device. Row 1 is the header. Updates on
//                every Tela save in this window (tela:doc-changed) and re-reads every
//                few seconds so edits saved in another window/device land too — add a
//                name to the sheet and the rundown grows.
//   math         the Tela Sheet formula engine (the platform's MATLAB-style engine:
//                SEQUENCE, MMULT, MINVERSE, LINEST, LAMBDA, RANDARRAY…). A formula that
//                returns a matrix becomes a table; `t` (seconds since start) and `n`
//                (tick count) are available as names, so expressions can animate.
//   simulator    any registered simulator producing sampled channels (the machine-atlas
//                brake simulator ships built in). 'live' mode emits the current sample
//                as one row in real time (looping); 'series' emits the whole run.
//   weather      Open-Meteo current conditions + 7-day forecast, one row per day.
// Imported for its side effects (registerLiveAdapter) by the Sources room.
import { registerLiveAdapter, type LiveSource } from './liveDataHub';
import { tableFromMatrix, type LiveTable } from './csv';
import { fetchWeather } from './weather';

// ── Tela sheet / base ───────────────────────────────────────────────────────
function scalarText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && v && 'code' in (v as any)) return String((v as any).code); // CellError
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

export async function telaDeviceTable(docId: string, deviceId?: string, sheetName?: string): Promise<LiveTable> {
  const { loadTelaDocFreshest } = await import('../telaStore');
  const doc: any = await loadTelaDocFreshest(docId);
  if (!doc) throw new Error('Tela document not found');
  const devices: any[] = Object.values(doc.devices || {});
  const dev = (deviceId && doc.devices?.[deviceId]) || devices.find(d => d.type === 'GRID') || devices.find(d => d.type === 'BASE');
  if (!dev) throw new Error('This document has no sheet or base');
  if (dev.type === 'BASE') {
    const fields: { id: string; name: string }[] = dev.fields || [];
    return { columns: fields.map(f => f.name), rows: (dev.rows || []).map((r: any) => Object.fromEntries(fields.map(f => [f.name, String(r.values?.[f.id] ?? '')]))), updatedAt: Date.now() };
  }
  if (dev.type !== 'GRID') throw new Error('Pick a sheet (Grid) or Base device');
  const [{ engineForGrid, workbookFromGrid }, { usedRange, getSheet }] = await Promise.all([import('../tela/sheet/tela'), import('../tela/sheet/model')]);
  const engine: any = engineForGrid(dev);
  const wb: any = workbookFromGrid(dev);
  const sheet: any = (wb && sheetName ? getSheet(wb, sheetName) : null) || wb?.sheets?.[0];
  const sid = sheet?.id ?? 0;
  const { r2, c2 } = sheet ? usedRange(sheet) : { r2: (dev.rows || 1) - 1, c2: (dev.cols || 1) - 1 };
  if (r2 < 0 || c2 < 0) return { columns: [], rows: [], updatedAt: Date.now() };
  const matrix: string[][] = [];
  for (let r = 0; r <= r2; r++) {
    const row: string[] = [];
    for (let c = 0; c <= c2; c++) row.push(scalarText(engine.getValue(sid, r, c)));
    matrix.push(row);
  }
  // Drop fully empty trailing rows (a sheet with a header and a growing list).
  while (matrix.length > 1 && matrix[matrix.length - 1].every(x => x === '')) matrix.pop();
  const t = tableFromMatrix(matrix, true);
  t.rows = t.rows.filter(r => Object.values(r).some(v => v !== ''));
  return t;
}

registerLiveAdapter({
  kind: 'tela-sheet', label: 'Tela Sheet or Base (updates as rows are added)',
  watch(ctx) {
    const { docId, deviceId, sheet } = ctx.source.config;
    let alive = true, busy = false;
    const read = async () => {
      if (!alive || busy) return; busy = true;
      try { ctx.emit(await telaDeviceTable(String(docId), deviceId, sheet)); } catch (e: any) { ctx.fail(String(e?.message || e)); }
      busy = false;
    };
    const onSave = (e: Event) => { if ((e as CustomEvent).detail?.docId === docId) void read(); };
    if (typeof window !== 'undefined') window.addEventListener('tela:doc-changed', onSave);
    const timer = setInterval(read, Math.max(1000, ctx.source.intervalMs ?? 3000));
    void read();
    return () => { alive = false; clearInterval(timer); if (typeof window !== 'undefined') window.removeEventListener('tela:doc-changed', onSave); };
  },
});

// ── formula engine ("MATLAB-style") ─────────────────────────────────────────
export async function evaluateMathTable(expression: string, columns: string[] = [], vars: Record<string, number> = {}): Promise<LiveTable> {
  const [{ SheetEngine }, { createWorkbook }, values] = await Promise.all([import('../tela/sheet/engine'), import('../tela/sheet/model'), import('../tela/sheet/values')]);
  const engine: any = new SheetEngine(createWorkbook(), { resolver: { name: (n: string) => (n.toLowerCase() in vars ? vars[n.toLowerCase()] : null) } } as any);
  const out: any = engine.evaluate(expression.replace(/^=/, ''), 0);
  const Matrix: any = (values as any).Matrix;
  const data: unknown[][] = out instanceof Matrix ? out.data : [[out]];
  const width = Math.max(1, ...data.map(r => r.length));
  const header = Array.from({ length: width }, (_, i) => columns[i] || (width === 1 ? 'value' : `c${i + 1}`));
  return tableFromMatrix([header, ...data.map(r => r.map(scalarText))], true);
}

registerLiveAdapter({
  kind: 'math', label: 'Formula engine (MATLAB-style arrays, re-evaluated live)',
  watch(ctx) {
    const t0 = Date.now(); let n = 0, alive = true;
    const run = async () => {
      if (!alive) return;
      try { ctx.emit(await evaluateMathTable(String(ctx.source.config.expression || '0'), ctx.source.config.columns || [], { t: (Date.now() - t0) / 1000, n: n++ })); }
      catch (e: any) { ctx.fail(String(e?.message || e)); }
    };
    void run();
    const timer = setInterval(run, Math.max(250, ctx.source.intervalMs ?? 1000));
    return () => { alive = false; clearInterval(timer); };
  },
});

// ── simulators ──────────────────────────────────────────────────────────────
export interface SimRun { dt: number; n: number; channels: Record<string, ArrayLike<number>>; units?: Record<string, string>; labels?: Record<string, string> }
export interface SimulatorDef { id: string; name: string; group: string; run(config: Record<string, any>): Promise<SimRun> }
const simulators = new Map<string, SimulatorDef>();
export function registerSimulator(s: SimulatorDef) { simulators.set(s.id, s); }
export function listSimulators(): SimulatorDef[] { return [...simulators.values()]; }

/** Built-in: the machine-atlas brake simulator, one entry per scenario. */
const BRAKE_SCENARIOS: [string, string][] = [['apply', 'Brake apply (pedal → caliper)'], ['heat', 'Repeated stops — rotor heat'], ['abs', 'ABS stop on snow']];
for (const [id, name] of BRAKE_SCENARIOS) registerSimulator({
  id: `brakes.${id}`, name, group: 'Machine Atlas · Brakes',
  async run(cfg) {
    const sim = await import('../machineAtlas/sim/brakeSim');
    const faults: string[] = cfg.faults || [];
    const tr: any = id === 'apply' ? sim.runApply(faults, { pedalN: Number(cfg.pedalN) || 180 } as any)
      : id === 'heat' ? sim.runHeat(faults, { stops: Number(cfg.stops) || 10 } as any)
      : sim.runAbs(faults, { abs: cfg.abs !== false, surface: String(cfg.surface || 'snow') } as any);
    return { dt: tr.dt, n: tr.n, channels: tr.channels, units: tr.units, labels: tr.labels };
  },
});
/** A generic signal generator so graphics can be rehearsed without hardware. */
registerSimulator({
  id: 'signal.wave', name: 'Signal generator (sine / ramp / noise)', group: 'Generators',
  async run(cfg) {
    const n = 600, dt = Number(cfg.dt) || 0.05, f = Number(cfg.freq) || 0.25, amp = Number(cfg.amp) || 100;
    const sine = new Float32Array(n), ramp = new Float32Array(n), noise = new Float32Array(n);
    let x = 0;
    for (let i = 0; i < n; i++) { const t = i * dt; sine[i] = amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * f * t)); ramp[i] = (amp * i) / (n - 1); x += (Math.sin(i * 12.9898) * 43758.5453 % 1) * 4 - 2; noise[i] = amp / 2 + x; }
    return { dt, n, channels: { sine, ramp, noise }, units: { sine: '', ramp: '', noise: '' } };
  },
});

export function sampleRun(run: SimRun, ch: string, t: number): number {
  const a = run.channels[ch]; if (!a) return 0;
  const f = Math.min(Math.max(t / run.dt, 0), run.n - 1), i = Math.floor(f), j = Math.min(i + 1, run.n - 1);
  return a[i] + (a[j] - a[i]) * (f - i);
}

registerLiveAdapter({
  kind: 'simulator', label: 'Simulator (live playback or full series)',
  watch(ctx) {
    const def = simulators.get(String(ctx.source.config.simId));
    if (!def) { ctx.fail('Unknown simulator'); return () => undefined; }
    let alive = true, timer: ReturnType<typeof setInterval> | null = null;
    const chans = (run: SimRun) => Object.keys(run.channels);
    const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
    def.run(ctx.source.config).then(run => {
      if (!alive) return;
      const dur = (run.n - 1) * run.dt;
      if (ctx.source.config.mode === 'series') {
        const step = Math.max(1, Math.floor(run.n / Math.max(2, Number(ctx.source.config.points) || 40)));
        const rows: Record<string, string>[] = [];
        for (let i = 0; i < run.n; i += step) { const r: Record<string, string> = { t: (i * run.dt).toFixed(2) }; for (const c of chans(run)) r[c] = fmt(run.channels[c][i]); rows.push(r); }
        ctx.emit({ columns: ['t', ...chans(run)], rows, updatedAt: Date.now() });
        return;
      }
      const t0 = performance.now(), speed = Number(ctx.source.config.speed) || 1;
      const tick = () => {
        const t = (((performance.now() - t0) / 1000) * speed) % Math.max(dur, 0.001);
        const r: Record<string, string> = { t: t.toFixed(2) };
        for (const c of chans(run)) r[c] = fmt(sampleRun(run, c, t));
        ctx.emit({ columns: ['t', ...chans(run)], rows: [r], updatedAt: Date.now() });
      };
      tick();
      timer = setInterval(tick, Math.max(50, ctx.source.intervalMs ?? 100));
    }).catch((e: any) => ctx.fail(String(e?.message || e)));
    return () => { alive = false; if (timer) clearInterval(timer); };
  },
});

// ── weather ─────────────────────────────────────────────────────────────────
registerLiveAdapter({
  kind: 'weather', label: 'Weather (current + 7-day, Open-Meteo)',
  async fetch(s: LiveSource, signal: AbortSignal) { return fetchWeather(s.config, signal); },
});

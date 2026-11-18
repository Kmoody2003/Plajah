// Game Studio room (docs/game-studio-unified-plan.md Phase 0): the World room over a Game Project.
// Left: the level outline (every marker, whether the project or the level module owns it). Centre: the
// game's own World view in an iframe (Edit) or the game itself (Play). Right: inspector, look, and the
// history as sentences. Every change goes through services/gamestudio/ops (undo/redo, Aria-ready).
//
// Phase 0 saves on this device (localStorage); cloud autosave + versions come with Phase 1.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Gamepad2, Pencil, Play, Redo2, Trash2, Undo2, Upload, X, Crosshair } from 'lucide-react';
import { applyOp, describeOp, History, markerLabel, OpError, type Op } from '../../services/gamestudio/ops';
import { effectiveLook, effectiveMarkers, effectiveZones, ownsKind, type GameLevel, type GameProject, type LevelDefaults, type Marker, type MarkerKind } from '../../services/gamestudio/schema';
import { validateProject } from '../../services/gamestudio/validate';
import { isGameMessage, newProjectFor, RUNTIMES, runtimeLevel, runtimeUrl, STUDIO_SOURCE, takeOverOp, type StudioToGame } from '../../services/gamestudio/runtime';

type Level = 'simple' | 'pro';
export interface GameStudioRoomProps {
  level?: Level;
  onLevel?: (l: Level) => void;
  onClose?: () => void;
  /** Open this project instead of the last one on this device. */
  initialProject?: GameProject;
  /** Where the game pages are served (a dev server or lab). Default: the shipped build, or the game's dev server in dev. */
  runtimeOrigin?: string;
}

const C = { bg: '#0d0c12', bar: '#0a0910', panel: '#15131d', line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.88)', dim: 'rgba(255,255,255,.52)', accent: '#38bdf8', warn: '#fbbf24' };
const KIND_TITLE: Record<MarkerKind, string> = { spawn: 'Spawns', enemySpot: 'Enemy spots', controlPoint: 'Control points', pickup: 'Pickups', camera: 'Cameras' };
const KIND_DOT: Record<MarkerKind, string> = { spawn: '#38bdf8', enemySpot: '#ef4444', controlPoint: '#fbbf24', pickup: '#4ade80', camera: '#c084fc' };
const LAST_KEY = 'plajah.gamestudio.last';
const projKey = (id: string) => `plajah.gamestudio.project:${id}`;

function loadLast(): GameProject | null {
  try {
    const id = localStorage.getItem(LAST_KEY);
    const raw = id && localStorage.getItem(projKey(id));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return validateProject(p).ok ? p : null;
  } catch { return null; }
}

function useHistory(h: History) {
  return useSyncExternalStore(useCallback(fn => h.subscribe(fn), [h]), () => h.project);
}

export default function GameStudioRoom({ level = 'simple', onLevel, onClose, initialProject, runtimeOrigin }: GameStudioRoomProps) {
  const history = useMemo(() => new History(initialProject ?? loadLast() ?? newProjectFor('rift-realm')), [initialProject]);
  const project = useHistory(history);
  const [levelId, setLevelId] = useState(project.startLevel);
  const [mode, setMode] = useState<'edit' | 'play'>('edit');
  const [selected, setSelected] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<Record<string, LevelDefaults>>({});
  const [stats, setStats] = useState<{ frameMs: number; draws: number; triangles: number } | null>(null);
  const [playHooked, setPlayHooked] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  const lvl: GameLevel = project.levels.find(l => l.id === levelId) ?? project.levels[0];
  const def = defaults[lvl.id] ?? null;
  const rt = RUNTIMES[project.runtime.game];
  const rl = rt && runtimeLevel(rt, lvl.module.id);
  const dev = !!(import.meta as any).env?.DEV;
  const src = rt && rl ? runtimeUrl(rt, mode === 'edit' ? 'studio' : 'play', rl, { dev, origin: runtimeOrigin }) : '';
  const markers = effectiveMarkers(lvl, def);
  const sel = markers.find(m => m.id === selected) ?? null;

  // autosave on this device
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(projKey(project.id), JSON.stringify(project)); localStorage.setItem(LAST_KEY, project.id); } catch { /* full or blocked */ } }, 400);
    return () => clearTimeout(t);
  }, [project]);

  const send = useCallback((msg: Omit<StudioToGame, 'source'> & { type: StudioToGame['type'] }) => {
    frame.current?.contentWindow?.postMessage({ source: STUDIO_SOURCE, ...msg }, '*');
  }, []);
  // the running page always draws the project's copy of this level
  useEffect(() => { send({ type: 'level', level: lvl } as any); }, [lvl, send]);
  useEffect(() => { setSelected(null); setStats(null); setPlayHooked(null); }, [levelId, mode]);

  const apply = useCallback((op: Op) => {
    try { history.apply(op); setNotice(null); }
    catch (e) { setNotice(e instanceof OpError ? e.message : String(e)); }
  }, [history]);

  /** Edit a marker; the first edit to a marker the level placed takes its whole kind over (one undo step). */
  const editMarker = useCallback((m: Marker, patch: Partial<Marker>, label?: string) => {
    const take = takeOverOp(lvl, def, m.kind);
    const upd: Op = { op: 'updateMarker', levelId: lvl.id, markerId: m.id, patch };
    if (!take) { apply(upd); return; }
    // the step reads like the edit itself ("Team A spawn in …: moved to …"), not like the take-over
    let text = label ?? `Edited ${markerLabel(m)} in ${lvl.name}`;
    try { text = describeOp(applyOp(history.project, take).project, upd); } catch { /* keep the fallback */ }
    apply({ op: 'batch', label: text, ops: [take, upd] });
  }, [apply, def, history, lvl]);

  // messages from the game page
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isGameMessage(e.data)) return;
      const msg = e.data;
      if (msg.type === 'ready') {
        setDefaults(d => ({ ...d, [lvl.id]: msg.defaults }));
        if (mode === 'play') setPlayHooked(true);
        send({ type: 'level', level: lvl } as any);
      } else if (msg.type === 'select') setSelected(msg.markerId);
      else if (msg.type === 'move') {
        const m = effectiveMarkers(lvl, def).find(x => x.id === msg.markerId);
        if (m) editMarker(m, { pos: msg.pos }, `Moved ${markerLabel(m)} in ${lvl.name}`);
      } else if (msg.type === 'stats') setStats({ frameMs: msg.frameMs, draws: msg.draws, triangles: msg.triangles });
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [def, editMarker, lvl, mode, send]);

  // Play: a game build without the project hook never says ready; say so instead of pretending.
  useEffect(() => {
    if (mode !== 'play') return;
    const t = setTimeout(() => setPlayHooked(h => h ?? false), 8000);
    return () => clearTimeout(t);
  }, [mode, levelId]);

  // keys: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, P = play/edit
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
      else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) setMode(m => m === 'edit' ? 'play' : 'edit');
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [history]);

  const pick = (id: string | null) => { setSelected(id); if (id) send({ type: 'frame', markerId: id } as any); else send({ type: 'select', markerId: null } as any); };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'game'}.plajah-game.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    try {
      const p = JSON.parse(await f.text());
      const v = validateProject(p);
      if (!v.ok) { setNotice(`Can't open ${f.name}: ${v.errors[0].path} ${v.errors[0].message}`); return; }
      history.reset(p); setLevelId(p.startLevel); setNotice(v.warnings.length ? `Opened with ${v.warnings.length} warning(s): ${v.warnings[0].message}` : null);
    } catch (e) { setNotice(`Can't read ${f.name}: ${(e as Error).message}`); }
  };

  const pro = level === 'pro';
  const look = effectiveLook(lvl, def);
  const hazard = effectiveZones(lvl, def).find(z => z.kind === 'hazardBelow');

  return <div className="fixed inset-0 flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="game-studio">
    {/* top bar */}
    <div className="flex items-center gap-2 px-3 h-12 shrink-0" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
      <Gamepad2 size={18} style={{ color: C.accent }}/>
      <input aria-label="Project name" value={project.name} onChange={e => { if (e.target.value.trim()) apply({ op: 'setProjectName', name: e.target.value }); }} className="bg-transparent text-[14px] font-bold outline-none w-[180px] px-1 rounded" style={{ border: `1px solid transparent` }} data-testid="gs-name"/>
      <div className="flex gap-1 ml-2" role="tablist" aria-label="Levels">
        {project.levels.map(l => <button key={l.id} role="tab" aria-selected={l.id === lvl.id} onClick={() => setLevelId(l.id)} className="h-8 px-3 rounded-lg text-[12.5px] font-semibold" style={{ background: l.id === lvl.id ? 'rgba(56,189,248,.16)' : 'transparent', border: `1px solid ${l.id === lvl.id ? C.accent : C.line}` }} data-testid={`gs-level-${l.id}`}>{l.name}</button>)}
      </div>
      <div className="flex-1"/>
      <IconBtn label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={() => history.undo()} testid="gs-undo"><Undo2 size={15}/></IconBtn>
      <IconBtn label="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={() => history.redo()} testid="gs-redo"><Redo2 size={15}/></IconBtn>
      <div className="flex rounded-lg overflow-hidden ml-1" style={{ border: `1px solid ${C.line}` }}>
        <button onClick={() => setMode('edit')} className="h-8 px-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ background: mode === 'edit' ? 'rgba(255,255,255,.1)' : 'transparent' }} data-testid="gs-mode-edit"><Pencil size={13}/>Edit</button>
        <button onClick={() => setMode('play')} className="h-8 px-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ background: mode === 'play' ? 'rgba(74,222,128,.18)' : 'transparent' }} title="Play (P)" data-testid="gs-mode-play"><Play size={13}/>Play</button>
      </div>
      {pro && <>
        <IconBtn label="Export project file" onClick={exportJson} testid="gs-export"><Download size={15}/></IconBtn>
        <IconBtn label="Open project file" onClick={() => fileIn.current?.click()} testid="gs-import"><Upload size={15}/></IconBtn>
        <input ref={fileIn} type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }}/>
      </>}
      {onLevel && <button onClick={() => onLevel(pro ? 'simple' : 'pro')} className="h-8 px-3 rounded-lg text-[12px] font-semibold ml-1" style={{ border: `1px solid ${C.line}` }} data-testid="gs-level-toggle">{pro ? 'Pro' : 'Simple'}</button>}
      {onClose && <IconBtn label="Close" onClick={onClose}><X size={15}/></IconBtn>}
    </div>

    <div className="flex-1 flex min-h-0">
      {/* outline */}
      {mode === 'edit' && <aside className="w-[230px] shrink-0 overflow-auto p-2" style={{ background: C.panel, borderRight: `1px solid ${C.line}` }} data-testid="gs-outline">
        <div className="text-[11px] font-bold tracking-[.16em] uppercase px-1 pt-1 pb-2" style={{ color: C.dim }}>{lvl.name}</div>
        {(['spawn', 'controlPoint', 'enemySpot', 'pickup'] as MarkerKind[]).map(kind => {
          const list = markers.filter(m => m.kind === kind);
          if (!list.length) return null;
          const owned = ownsKind(lvl, kind);
          return <section key={kind} className="mb-3">
            <div className="flex items-center gap-2 px-1 text-[12px] font-bold">
              <span className="w-2 h-2 rounded-full" style={{ background: KIND_DOT[kind] }}/>{KIND_TITLE[kind]}<span style={{ color: C.dim }}>{list.length}</span>
              <span className="ml-auto text-[10.5px] font-semibold" style={{ color: owned ? C.accent : C.dim }} title={owned ? 'Edited in this project' : 'Placed by the level; edit one to take them over'}>{owned ? 'edited' : 'level'}</span>
            </div>
            {owned && pro && <button className="ml-1 mt-0.5 text-[10.5px] underline" style={{ color: C.dim }} onClick={() => apply({ op: 'setMarkersOfKind', levelId: lvl.id, kind, markers: [] })} data-testid={`gs-reset-${kind}`}>Use the level's own again</button>}
            <ul className="mt-1">{list.map(m => <li key={m.id}>
              <button onClick={() => pick(m.id)} className="w-full text-left px-2 h-7 rounded-md text-[12.5px] truncate" style={{ background: m.id === selected ? 'rgba(251,191,36,.16)' : 'transparent', color: m.id === selected ? '#fff' : C.text }} data-testid={`gs-marker-${m.id}`}>{markerLabel(m)}</button>
            </li>)}</ul>
          </section>;
        })}
        {!def && <p className="px-1 text-[12px]" style={{ color: C.dim }}>Loading the level…</p>}
        {hazard && <div className="px-1 text-[12px]" style={{ color: C.dim }}>Hazard floor at {hazard.y} m</div>}
      </aside>}

      {/* viewport */}
      <main className="flex-1 relative min-w-0">
        {src ? <iframe key={src} ref={frame} src={src} title={mode === 'edit' ? 'World view' : 'Play'} className="absolute inset-0 w-full h-full" style={{ border: 0, background: '#04050a' }} allow="autoplay; fullscreen; gamepad" data-testid="gs-frame"/>
          : <div className="absolute inset-0 grid place-items-center" style={{ color: C.dim }}>No runtime for “{project.runtime.game}”.</div>}
        {mode === 'play' && playHooked === false && <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12.5px] max-w-[560px] text-center" style={{ background: 'rgba(20,16,8,.92)', border: `1px solid ${C.warn}`, color: '#fde68a' }} data-testid="gs-play-unhooked">
          This build of {rt?.name} doesn't read project edits yet, so Play shows the level's own layout. Your edits are saved and will apply once the game is hooked to the Studio.
        </div>}
        {stats && mode === 'edit' && pro && <div className="absolute right-2 top-2 px-2 py-1 rounded-md text-[11px] tabular-nums" style={{ background: 'rgba(10,9,16,.8)', border: `1px solid ${C.line}`, color: C.dim }} data-testid="gs-stats">{stats.frameMs.toFixed(1)} ms · {stats.draws} draws · {(stats.triangles / 1000).toFixed(0)}k tris</div>}
        {notice && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12.5px]" style={{ background: 'rgba(40,10,10,.92)', border: '1px solid #ef4444' }} role="alert">{notice}</div>}
      </main>

      {/* inspector + look + history */}
      {mode === 'edit' && <aside className="w-[270px] shrink-0 overflow-auto p-3 space-y-4" style={{ background: C.panel, borderLeft: `1px solid ${C.line}` }} data-testid="gs-inspector">
        {sel ? <MarkerPanel m={sel} pro={pro} owned={ownsKind(lvl, sel.kind)} onChange={(patch) => editMarker(sel, patch)} onFrame={() => send({ type: 'frame', markerId: sel.id } as any)}
          onDelete={() => { const take = takeOverOp(lvl, def, sel.kind); const del: Op = { op: 'removeMarker', levelId: lvl.id, markerId: sel.id }; apply(take ? { op: 'batch', label: `Removed ${markerLabel(sel)} in ${lvl.name}`, ops: [take, del] } : del); setSelected(null); }}/>
          : <p className="text-[12.5px]" style={{ color: C.dim }}>{pro ? 'Select a marker in the outline or the view.' : 'Click a marker in the view, then drag it to move it. Everything you change can be undone.'}</p>}

        <section>
          <h3 className="text-[11px] font-bold tracking-[.16em] uppercase mb-2" style={{ color: C.dim }}>Look</h3>
          <Slider label="Brightness" min={0.3} max={2} step={0.01} value={look.exposure ?? 1} onChange={v => apply({ op: 'setLook', levelId: lvl.id, look: { exposure: v } })} testid="gs-exposure"/>
          {pro && <Slider label="View distance" unit=" m" min={60} max={1500} step={10} value={look.far ?? 300} onChange={v => apply({ op: 'setLook', levelId: lvl.id, look: { far: v } })} testid="gs-far"/>}
          {(lvl.look.exposure !== undefined || lvl.look.far !== undefined) && <button className="text-[11px] underline" style={{ color: C.dim }} onClick={() => apply({ op: 'setLook', levelId: lvl.id, look: { exposure: undefined, far: undefined } })}>Use the level's own look</button>}
        </section>

        <section>
          <h3 className="text-[11px] font-bold tracking-[.16em] uppercase mb-2" style={{ color: C.dim }}>History</h3>
          {history.entries.length === 0 ? <p className="text-[12px]" style={{ color: C.dim }}>No changes yet.</p>
            : <ol className="space-y-1 text-[12px]" data-testid="gs-history">{history.entries.slice(pro ? -40 : -6).reverse().map((e, i) => <li key={history.entries.length - i} className="leading-snug" style={{ color: i === 0 ? C.text : C.dim }}>{e.label}</li>)}</ol>}
        </section>
      </aside>}
    </div>
  </div>;
}

function IconBtn({ label, onClick, disabled, children, testid }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testid?: string }) {
  return <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="h-8 w-8 grid place-items-center rounded-lg disabled:opacity-30" style={{ border: `1px solid ${C.line}` }} data-testid={testid}>{children}</button>;
}

function MarkerPanel({ m, pro, owned, onChange, onDelete, onFrame }: { m: Marker; pro: boolean; owned: boolean; onChange: (p: Partial<Marker>) => void; onDelete: () => void; onFrame: () => void }) {
  const setAxis = (i: number, v: number) => { const pos = [...m.pos] as Marker['pos']; pos[i] = v; onChange({ pos }); };
  return <section data-testid="gs-marker-panel">
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_DOT[m.kind] }}/>
      <h3 className="text-[14px] font-bold flex-1 truncate">{markerLabel(m)}</h3>
      <IconBtn label="Show in view" onClick={onFrame}><Crosshair size={14}/></IconBtn>
      {m.kind !== 'spawn' && <IconBtn label="Delete" onClick={onDelete} testid="gs-delete"><Trash2 size={14}/></IconBtn>}
    </div>
    {!owned && <p className="mt-1 text-[11.5px]" style={{ color: C.dim }}>Placed by the level. Your first change copies all {KIND_TITLE[m.kind].toLowerCase()} into this project.</p>}
    {(m.kind === 'controlPoint' || pro) && <label className="block mt-3 text-[11.5px]" style={{ color: C.dim }}>Name
      <input value={m.name ?? ''} placeholder={markerLabel(m)} onChange={e => onChange({ name: e.target.value || undefined })} className="mt-1 w-full h-8 px-2 rounded-md text-[13px] outline-none" style={{ background: '#0d0c12', border: `1px solid ${C.line}`, color: C.text }} data-testid="gs-marker-name"/>
    </label>}
    {pro && <div className="mt-3 grid grid-cols-3 gap-1.5">{(['X', 'Y', 'Z'] as const).map((a, i) => <Num key={a} label={a} value={m.pos[i]} step={0.1} onChange={v => setAxis(i, v)} testid={`gs-pos-${a.toLowerCase()}`}/>)}</div>}
    {m.kind === 'spawn' && <Slider label="Facing" unit="°" min={-180} max={180} step={1} value={Math.round(((m.yaw ?? 0) * 180) / Math.PI)} onChange={v => onChange({ yaw: (v * Math.PI) / 180 })} testid="gs-yaw"/>}
    {m.kind === 'controlPoint' && <Slider label="Capture radius" unit=" m" min={1} max={20} step={0.5} value={m.radius ?? 4} onChange={v => onChange({ radius: v })} testid="gs-radius"/>}
  </section>;
}

function Num({ label, value, step, onChange, testid }: { label: string; value: number; step: number; onChange: (v: number) => void; testid?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <label className="text-[10.5px] font-bold" style={{ color: C.dim }}>{label}
    <input type="number" step={step} value={text} onChange={e => { setText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} className="mt-0.5 w-full h-8 px-1.5 rounded-md text-[12.5px] tabular-nums outline-none" style={{ background: '#0d0c12', border: `1px solid ${C.line}`, color: C.text }} data-testid={testid}/>
  </label>;
}

function Slider({ label, unit = '', min, max, step, value, onChange, testid }: { label: string; unit?: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; testid?: string }) {
  return <label className="block mt-3 text-[11.5px]" style={{ color: C.dim }}>
    <span className="flex"><span className="flex-1">{label}</span><span className="tabular-nums" style={{ color: C.text }}>{Number.isInteger(step) ? value : value.toFixed(2)}{unit}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full mt-1" data-testid={testid}/>
  </label>;
}

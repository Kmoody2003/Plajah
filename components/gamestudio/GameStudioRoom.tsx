// Game Studio room (docs/game-studio-unified-plan.md Phases 0–1): the World room over a Game Project.
// Left: the level outline (markers and placed props), the Props palette, or the Story (Story Intelligence). Centre: the game's own World
// view in an iframe (Edit) or the game itself (Play). Right: inspector, look, history and versions.
// Every change goes through services/gamestudio/ops (undo/redo, Aria-ready).
//
// Saves on this device at once and to the creative cloud (kind "game", with version history) when signed in.

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, Crosshair, Download, Gamepad2, History as HistoryIcon, Move, Pencil, Play, Redo2, RotateCw, Trash2, Undo2, Upload, X } from 'lucide-react';
import { applyOp, describeOp, History, markerLabel, OpError, type Op } from '../../services/gamestudio/ops';
import { effectiveLook, effectiveMarkers, effectiveZones, ownsKind, type GameLevel, type GameProject, type Instance, type LevelDefaults, type Marker, type MarkerKind, type ParamValue, type Vec3, type Zone } from '../../services/gamestudio/schema';
import { validateProject } from '../../services/gamestudio/validate';
import { isGameMessage, newProjectFor, RUNTIMES, withRuntimeLevels, runtimeLevel, runtimeUrl, STUDIO_SOURCE, takeOverOp, type StudioToGame } from '../../services/gamestudio/runtime';
import { coerceParam, KITS, newInstance, prefabById, resolvedParams, type ParamSpec, type PrefabDef } from '../../services/gamestudio/prefabs';
import { allLevels, goalSentence } from '../../services/gamestudio/story/schema';
import { placeModules } from '../../services/gamestudio/story/build';
import { BEAT_COLOR, RulesPanel, StoryPanel } from './StoryPanel';

const CreativeSyncPill = React.lazy(() => import('../creative/CreativeCloudPanels').then(m => ({ default: m.CreativeSyncPill })));
const CreativeVersionHistory = React.lazy(() => import('../creative/CreativeCloudPanels').then(m => ({ default: m.CreativeVersionHistory })));

type Level = 'simple' | 'pro';
export interface GameStudioRoomProps {
  level?: Level;
  onLevel?: (l: Level) => void;
  onClose?: () => void;
  /** Open this project instead of the last one on this device. */
  initialProject?: GameProject;
  /** Where the game pages are served (a dev server or lab). Default: the shipped build, or the game's dev server in dev. */
  runtimeOrigin?: string;
  /** Cloud autosave (default on; labs without sign-in can turn it off). */
  cloud?: boolean;
}

export const GAME_CLOUD_KIND = 'game';
const C = { bg: '#0d0c12', bar: '#0a0910', panel: '#15131d', line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.88)', dim: 'rgba(255,255,255,.52)', accent: '#38bdf8', warn: '#fbbf24' };
const KIND_TITLE: Record<MarkerKind, string> = { spawn: 'Spawns', enemySpot: 'Enemy spots', controlPoint: 'Control points', pickup: 'Pickups', camera: 'Cameras' };
const KIND_DOT: Record<MarkerKind, string> = { spawn: '#38bdf8', enemySpot: '#ef4444', controlPoint: '#fbbf24', pickup: '#4ade80', camera: '#c084fc' };
const PROP_DOT = '#a78bfa';
const ZONE_DOT = '#4ade80';
const LAST_KEY = 'plajah.gamestudio.last';
const projKey = (id: string) => `plajah.gamestudio.project:${id}`;
type Send = (msg: StudioToGame extends infer M ? (M extends StudioToGame ? Omit<M, 'source'> : never) : never) => void;

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

export default function GameStudioRoom({ level = 'simple', onLevel, onClose, initialProject, runtimeOrigin, cloud = true }: GameStudioRoomProps) {
  const history = useMemo(() => new History(withRuntimeLevels(initialProject ?? loadLast() ?? newProjectFor('rift-realm'))), [initialProject]);
  const project = useHistory(history);
  const [levelId, setLevelId] = useState(project.startLevel);
  const [mode, setMode] = useState<'edit' | 'play'>('edit');
  const [left, setLeft] = useState<'outline' | 'props' | 'story'>('outline');
  const [frameReady, setFrameReady] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [tool, setTool] = useState<'move' | 'turn'>('move');
  const [defaults, setDefaults] = useState<Record<string, LevelDefaults>>({});
  const [stats, setStats] = useState<{ frameMs: number; draws: number; triangles: number } | null>(null);
  const [playHooked, setPlayHooked] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  const lvl: GameLevel = project.levels.find(l => l.id === levelId) ?? project.levels[0];
  const def = defaults[lvl.id] ?? null;
  const rt = RUNTIMES[project.runtime.game];
  const kit: PrefabDef[] = KITS[project.runtime.game] ?? [];
  const rl = rt && runtimeLevel(rt, lvl.module.id);
  const dev = !!(import.meta as any).env?.DEV;
  const src = rt && rl ? runtimeUrl(rt, mode === 'edit' ? 'studio' : 'play', rl, { dev, origin: runtimeOrigin }) : '';
  const markers = effectiveMarkers(lvl, def);
  const selMarker = markers.find(m => m.id === selected) ?? null;
  const selInst = lvl.instances.find(i => i.id === selected) ?? null;
  const goalZones = lvl.zones.filter(z => z.kind === 'trigger' && z.box);
  const selZone = goalZones.find(z => z.id === selected) ?? null;

  // save: this device at once, the cloud (with versions) when signed in
  useEffect(() => {
    const t = setTimeout(() => {
      const json = JSON.stringify(project);
      try { localStorage.setItem(projKey(project.id), json); localStorage.setItem(LAST_KEY, project.id); } catch { /* full or blocked */ }
      if (cloud) import('../../services/creativeCloud/cloudStore').then(m => m.scheduleCreativeSync({ kind: GAME_CLOUD_KIND, localId: project.id, title: project.name, json })).catch(() => { /* no cloud here: the device copy stands */ });
    }, 400);
    return () => clearTimeout(t);
  }, [project, cloud]);

  const send: Send = useCallback((msg) => {
    frame.current?.contentWindow?.postMessage({ source: STUDIO_SOURCE, ...msg }, '*');
  }, []);
  // the running page always draws the project's copy of this level
  useEffect(() => { send({ type: 'level', level: lvl }); }, [lvl, send]);
  useEffect(() => { setSelected(null); setArmed(null); setStats(null); setPlayHooked(null); setFrameReady(false); }, [levelId, mode]);
  useEffect(() => { send({ type: 'arm', prefab: armed }); }, [armed, send]);
  useEffect(() => { send({ type: 'tool', tool }); }, [tool, send]);

  const apply = useCallback((op: Op) => {
    try { history.apply(op); setNotice(null); return true; }
    catch (e) { setNotice(e instanceof OpError ? e.message : String(e)); return false; }
  }, [history]);

  /** Edit a marker; the first edit to a marker the level placed takes its whole kind over (one undo step). */
  const editMarker = useCallback((m: Marker, patch: Partial<Marker>) => {
    const cur = history.project.levels.find(l => l.id === lvl.id)!;
    const take = takeOverOp(cur, def, m.kind);
    const upd: Op = { op: 'updateMarker', levelId: lvl.id, markerId: m.id, patch };
    if (!take) { apply(upd); return; }
    // the step reads like the edit itself ("Team A spawn in …: moved to …"), not like the take-over
    let text = `Edited ${markerLabel(m)} in ${lvl.name}`;
    try { text = describeOp(applyOp(history.project, take).project, upd); } catch { /* keep the fallback */ }
    apply({ op: 'batch', label: text, ops: [take, upd] });
  }, [apply, def, history, lvl.id, lvl.name]);

  const editInstance = useCallback((inst: Instance, patch: Partial<Pick<Instance, 'pos' | 'rot' | 'params'>>) => {
    apply({ op: 'putInstance', levelId: lvl.id, instance: { ...inst, ...patch } });
  }, [apply, lvl.id]);

  const takenIds = useCallback(() => {
    const l = history.project.levels.find(x => x.id === lvl.id)!;
    return [...l.markers.map(m => m.id), ...l.instances.map(i => i.id), ...(def?.markers ?? []).map(m => m.id)];
  }, [def, history, lvl.id]);

  const duplicate = useCallback((inst: Instance) => {
    const d = prefabById(inst.prefab);
    if (!d) return;
    const copy: Instance = { ...newInstance(d, [inst.pos[0] + 2, inst.pos[1], inst.pos[2] + 2], inst.rot[1], takenIds()), params: { ...inst.params } };
    if (apply({ op: 'putInstance', levelId: lvl.id, instance: copy })) setSelected(copy.id);
  }, [apply, lvl.id, takenIds]);

  const remove = useCallback((id: string) => {
    const cur = history.project.levels.find(l => l.id === lvl.id)!;
    if (cur.instances.some(i => i.id === id)) { apply({ op: 'removeInstance', levelId: lvl.id, instanceId: id }); setSelected(null); return; }
    if (cur.zones.some(z => z.id === id)) { apply({ op: 'removeZone', levelId: lvl.id, zoneId: id }); setSelected(null); return; }
    const m = effectiveMarkers(cur, def).find(x => x.id === id);
    if (!m || m.kind === 'spawn') return; // a game always needs its spawns
    const take = takeOverOp(cur, def, m.kind);
    const del: Op = { op: 'removeMarker', levelId: lvl.id, markerId: id };
    apply(take ? { op: 'batch', label: `Removed ${markerLabel(m)} in ${lvl.name}`, ops: [take, del] } : del);
    setSelected(null);
  }, [apply, def, history, lvl.id, lvl.name]);

  // messages from the game page
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isGameMessage(e.data)) return;
      const msg = e.data;
      if (msg.type === 'ready') {
        setFrameReady(true);
        setDefaults(d => ({ ...d, [lvl.id]: msg.defaults }));
        if (mode === 'play') setPlayHooked(true);
        send({ type: 'level', level: lvl });
        send({ type: 'arm', prefab: armed });
        send({ type: 'tool', tool });
      } else if (msg.type === 'select') setSelected(msg.id);
      else if (msg.type === 'move') {
        const m = effectiveMarkers(lvl, def).find(x => x.id === msg.markerId);
        if (m) editMarker(m, { pos: msg.pos });
      } else if (msg.type === 'moveZone') {
        const z = lvl.zones.find(x => x.id === msg.zoneId);
        if (z?.box) apply({ op: 'putZone', levelId: lvl.id, zone: { ...z, box: { ...z.box, center: [msg.pos[0], msg.pos[1] + z.box.size[1] / 2, msg.pos[2]] } } });
      } else if (msg.type === 'placed') {
        const d = prefabById(msg.prefab);
        if (!d) return;
        const inst = newInstance(d, msg.pos, 0, takenIds());
        if (apply({ op: 'putInstance', levelId: lvl.id, instance: inst })) { setSelected(inst.id); setArmed(null); setLeft('outline'); }
      } else if (msg.type === 'transform') {
        const inst = lvl.instances.find(i => i.id === msg.instanceId);
        if (inst) editInstance(inst, { pos: msg.pos, rot: [inst.rot[0], msg.yaw, inst.rot[2]] });
      } else if (msg.type === 'stats') setStats({ frameMs: msg.frameMs, draws: msg.draws, triangles: msg.triangles });
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [apply, armed, def, editInstance, editMarker, lvl, mode, send, takenIds, tool]);

  // Play: a game build without the project hook never says ready; say so instead of pretending.
  useEffect(() => {
    if (mode !== 'play') return;
    const t = setTimeout(() => setPlayHooked(h => h ?? false), 8000);
    return () => clearTimeout(t);
  }, [mode, levelId]);

  // keys: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo, P play/edit, W/E move/turn, Ctrl+D duplicate, Del delete, Esc cancel
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
      else if (ctrl && key === 'y') { e.preventDefault(); history.redo(); }
      else if (ctrl && key === 'd' && selInst) { e.preventDefault(); duplicate(selInst); }
      else if ((key === 'delete' || key === 'backspace') && selected) { e.preventDefault(); remove(selected); }
      else if (key === 'escape') { if (armed) setArmed(null); else setSelected(null); }
      else if (!ctrl && key === 'p') setMode(m => m === 'edit' ? 'play' : 'edit');
      else if (!ctrl && key === 'w') setTool('move');
      else if (!ctrl && key === 'e') setTool('turn');
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [armed, duplicate, history, remove, selInst, selected]);

  const pick = (id: string | null) => { setSelected(id); if (id) send({ type: 'frame', id }); else send({ type: 'select', id: null }); };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'game'}.plajah-game.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const openProjectJson = (json: string, from: string) => {
    try {
      const p = JSON.parse(json);
      const v = validateProject(p);
      if (!v.ok) { setNotice(`Can't open ${from}: ${v.errors[0].path} ${v.errors[0].message}`); return; }
      history.reset(p); setLevelId(p.startLevel); setSelected(null);
      setNotice(v.warnings.length ? `Opened with ${v.warnings.length} warning(s): ${v.warnings[0].message}` : null);
    } catch (e) { setNotice(`Can't read ${from}: ${(e as Error).message}`); }
  };

  const pro = level === 'pro';
  const look = effectiveLook(lvl, def);
  const hazard = effectiveZones(lvl, def).find(z => z.kind === 'hazardBelow');
  const categories = useMemo(() => [...new Set(kit.map(p => p.category))], [kit]);
  // a level built from the story: which story level it plays, and whether its arena is a stand-in
  const storyLevel = project.story && lvl.id.startsWith('st-') ? allLevels(project.story).find(l => `st-${l.id}` === lvl.id) ?? null : null;
  const standIn = storyLevel && project.story ? placeModules(project.story, project.runtime.game).get(storyLevel.place)?.standIn : false;
  const openLevel = useCallback((id: string) => { if (history.project.levels.some(l => l.id === id)) setLevelId(id); }, [history]);
  const fresh = history.entries.length === 0 && !selected && !armed;
  const gameLevels = project.levels.filter(l => !l.id.startsWith('st-'));
  const storyLevels = project.levels.filter(l => l.id.startsWith('st-'));

  return <div className="fixed inset-0 flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="game-studio">
    {/* top bar */}
    <div className="flex items-center gap-2 px-3 h-12 shrink-0" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
      <Gamepad2 size={18} style={{ color: C.accent }}/>
      <input aria-label="Project name" value={project.name} onChange={e => { if (e.target.value.trim()) apply({ op: 'setProjectName', name: e.target.value }); }} className="bg-transparent text-[14px] font-bold outline-none w-[170px] px-1 rounded" data-testid="gs-name"/>
      {cloud && <div className="shrink-0 whitespace-nowrap"><Suspense fallback={null}><CreativeSyncPill kind={GAME_CLOUD_KIND} localId={project.id}/></Suspense></div>}
      {project.levels.length <= 5 ? <div className="flex gap-1 ml-2 min-w-0 overflow-x-auto" role="tablist" aria-label="Levels">
        {project.levels.map(l => <button key={l.id} role="tab" aria-selected={l.id === lvl.id} onClick={() => setLevelId(l.id)} className="h-8 px-3 rounded-lg text-[12.5px] font-semibold whitespace-nowrap" style={{ background: l.id === lvl.id ? 'rgba(56,189,248,.16)' : 'transparent', border: `1px solid ${l.id === lvl.id ? C.accent : C.line}` }} data-testid={`gs-level-${l.id}`}>{l.name}</button>)}
      </div> : <label className="ml-2 flex items-center gap-2 text-[11.5px] min-w-0" style={{ color: C.dim }}>Level
        <select value={lvl.id} onChange={e => setLevelId(e.target.value)} className="h-8 px-2 rounded-lg text-[12.5px] font-semibold outline-none max-w-[320px]" style={{ background: 'rgba(56,189,248,.12)', border: `1px solid ${C.accent}`, color: C.text }} data-testid="gs-level-picker">
          <optgroup label="Game levels">{gameLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
          {storyLevels.length > 0 && <optgroup label="From the story">{storyLevels.map((l, i) => <option key={l.id} value={l.id}>{i + 1}. {l.name}</option>)}</optgroup>}
        </select>
        <span className="whitespace-nowrap">{project.levels.length} levels</span>
      </label>}
      <div className="flex-1"/>
      <IconBtn label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={() => history.undo()} testid="gs-undo"><Undo2 size={15}/></IconBtn>
      <IconBtn label="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={() => history.redo()} testid="gs-redo"><Redo2 size={15}/></IconBtn>
      <div className="flex rounded-lg overflow-hidden ml-1" style={{ border: `1px solid ${C.line}` }}>
        <button onClick={() => setMode('edit')} className="h-8 px-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ background: mode === 'edit' ? 'rgba(255,255,255,.1)' : 'transparent' }} data-testid="gs-mode-edit"><Pencil size={13}/>Edit</button>
        <button onClick={() => setMode('play')} className="h-8 px-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ background: mode === 'play' ? 'rgba(74,222,128,.18)' : 'transparent' }} title="Play (P)" data-testid="gs-mode-play"><Play size={13}/>Play</button>
      </div>
      {cloud && <IconBtn label="Versions" onClick={() => setShowVersions(v => !v)} testid="gs-versions"><HistoryIcon size={15}/></IconBtn>}
      {pro && <>
        <IconBtn label="Export project file" onClick={exportJson} testid="gs-export"><Download size={15}/></IconBtn>
        <IconBtn label="Open project file" onClick={() => fileIn.current?.click()} testid="gs-import"><Upload size={15}/></IconBtn>
        <input ref={fileIn} type="file" accept=".json,application/json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) openProjectJson(await f.text(), f.name); e.target.value = ''; }}/>
      </>}
      {onLevel && <button onClick={() => onLevel(pro ? 'simple' : 'pro')} className="h-8 px-3 rounded-lg text-[12px] font-semibold ml-1" style={{ border: `1px solid ${C.line}` }} data-testid="gs-level-toggle">{pro ? 'Pro' : 'Simple'}</button>}
      {onClose && <IconBtn label="Close" onClick={onClose}><X size={15}/></IconBtn>}
    </div>

    <div className="flex-1 flex min-h-0">
      {/* outline / props palette */}
      {mode === 'edit' && <aside className="shrink-0 flex flex-col min-h-0" style={{ width: left === 'story' ? 312 : 236, background: C.panel, borderRight: `1px solid ${C.line}` }}>
        <div className="flex p-2 gap-1" role="tablist">
          {(['outline', 'props', 'story'] as const).map(t => <button key={t} role="tab" aria-selected={left === t} onClick={() => setLeft(t)} className="flex-1 h-7 rounded-md text-[12px] font-bold" style={{ background: left === t ? 'rgba(255,255,255,.1)' : 'transparent' }} data-testid={`gs-tab-${t}`}>{t === 'outline' ? 'Level' : t === 'props' ? 'Props' : 'Story'}</button>)}
        </div>
        {left === 'story' ? <div className="flex-1 overflow-auto"><StoryPanel project={project} apply={apply} onOpenLevel={openLevel}/></div>
        : left === 'outline' ? <div className="flex-1 overflow-auto px-2 pb-2" data-testid="gs-outline">
          <div className="text-[11px] font-bold tracking-[.16em] uppercase px-1 pb-2" style={{ color: C.dim }}>{lvl.name}</div>
          {storyLevel && project.story && <div className="mx-1 mb-3 p-2 rounded-lg text-[11.5px] leading-snug" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }} data-testid="gs-story-context">
            <span className="text-[10px] font-bold uppercase px-1.5 py-[1px] rounded mr-1" style={{ background: `${BEAT_COLOR[storyLevel.beat]}26`, color: BEAT_COLOR[storyLevel.beat] }}>{storyLevel.beat}</span>
            <span style={{ color: C.text }}>{goalSentence(storyLevel, project.story)}</span>
            {standIn && <div className="mt-1" style={{ color: C.warn }}>Stand-in arena: {project.story.places.find(p => p.id === storyLevel.place)?.name} is not built yet.</div>}
          </div>}
          {lvl.instances.length > 0 && <section className="mb-3">
            <div className="flex items-center gap-2 px-1 text-[12px] font-bold"><span className="w-2 h-2 rounded-full" style={{ background: PROP_DOT }}/>Props<span style={{ color: C.dim }}>{lvl.instances.length}</span></div>
            <ul className="mt-1">{lvl.instances.map(i => <li key={i.id}><RowBtn on={i.id === selected} onClick={() => pick(i.id)} testid={`gs-item-${i.id}`}>{prefabById(i.prefab)?.name ?? i.prefab}</RowBtn></li>)}</ul>
          </section>}
          {goalZones.length > 0 && <section className="mb-3">
            <div className="flex items-center gap-2 px-1 text-[12px] font-bold"><span className="w-2 h-2 rounded-sm" style={{ background: ZONE_DOT }}/>Goal areas<span style={{ color: C.dim }}>{goalZones.length}</span></div>
            <ul className="mt-1">{goalZones.map(z => <li key={z.id}><RowBtn on={z.id === selected} onClick={() => pick(z.id)} testid={`gs-zone-${z.id}`}>{z.name ?? z.id}</RowBtn></li>)}</ul>
          </section>}
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
              <ul className="mt-1">{(list.length > 6 && !expanded[kind] && !list.slice(4).some(m => m.id === selected) ? list.slice(0, 4) : list).map(m => <li key={m.id}><RowBtn on={m.id === selected} onClick={() => pick(m.id)} testid={`gs-marker-${m.id}`}>{markerLabel(m)}</RowBtn></li>)}</ul>
              {list.length > 6 && <button className="ml-2 mt-0.5 text-[11px] underline" style={{ color: C.dim }} onClick={() => setExpanded(x => ({ ...x, [kind]: !x[kind] }))} data-testid={`gs-more-${kind}`}>{expanded[kind] ? 'Show fewer' : `Show all ${list.length}`}</button>}
            </section>;
          })}
          {hazard && <div className="px-1 text-[12px]" style={{ color: C.dim }}>Hazard floor at {hazard.y} m</div>}
        </div> : <div className="flex-1 overflow-auto px-2 pb-2" data-testid="gs-palette">
          <p className="px-1 pb-2 text-[12px] leading-snug" style={{ color: C.dim }}>{armed ? 'Click in the view where it goes. Esc cancels.' : 'Pick a piece, then click in the view to place it.'}</p>
          {categories.map(cat => <section key={cat} className="mb-3">
            <div className="text-[11px] font-bold tracking-[.14em] uppercase px-1 pb-1" style={{ color: C.dim }}>{cat}</div>
            {kit.filter(p => p.category === cat).map(p => <button key={p.id} onClick={() => setArmed(a => a === p.id ? null : p.id)} className="w-full text-left p-2 mb-1 rounded-lg" style={{ background: armed === p.id ? 'rgba(167,139,250,.18)' : 'rgba(255,255,255,.03)', border: `1px solid ${armed === p.id ? PROP_DOT : C.line}` }} data-testid={`gs-prefab-${p.id}`}>
              <div className="text-[13px] font-semibold">{p.name}</div>
              <div className="text-[11.5px] leading-snug" style={{ color: C.dim }}>{p.blurb}</div>
            </button>)}
          </section>)}
        </div>}
      </aside>}

      {/* viewport */}
      <main className="flex-1 relative min-w-0">
        {src ? <iframe key={src} ref={frame} src={src} title={mode === 'edit' ? 'World view' : 'Play'} className="absolute inset-0 w-full h-full" style={{ border: 0, background: '#04050a' }} allow="autoplay; fullscreen; gamepad" data-testid="gs-frame"/>
          : <div className="absolute inset-0 grid place-items-center" style={{ color: C.dim }}>No runtime for “{project.runtime.game}”.</div>}
        {mode === 'edit' && src && !frameReady && <div className="absolute inset-0 grid place-items-center pointer-events-none" style={{ background: 'rgba(4,5,10,.72)' }} data-testid="gs-loading">
          <div className="text-center px-6">
            <div className="mx-auto w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: `${C.accent} transparent ${C.accent} ${C.accent}` }}/>
            <div className="mt-3 text-[13px] font-semibold">Building {rl?.name ?? lvl.name}…</div>
            <div className="mt-1 text-[12px]" style={{ color: C.dim }}>The first open takes a little while; after that it is quick.</div>
          </div>
        </div>}
        {mode === 'play' && playHooked === false && <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12.5px] max-w-[560px] text-center" style={{ background: 'rgba(20,16,8,.92)', border: `1px solid ${C.warn}`, color: '#fde68a' }} data-testid="gs-play-unhooked">
          This build of {rt?.name} doesn't read project edits yet, so Play shows the level's own layout. Your edits are saved and will apply once the game is hooked to the Studio.
        </div>}
        {stats && mode === 'edit' && pro && <div className="absolute right-2 top-2 px-2 py-1 rounded-md text-[11px] tabular-nums" style={{ background: 'rgba(10,9,16,.8)', border: `1px solid ${C.line}`, color: C.dim }} data-testid="gs-stats">{stats.frameMs.toFixed(1)} ms · {stats.draws} draws · {(stats.triangles / 1000).toFixed(0)}k tris</div>}
        {notice && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-[12.5px]" style={{ background: 'rgba(40,10,10,.92)', border: '1px solid #ef4444' }} role="alert">{notice}</div>}
      </main>

      {/* inspector + look + history + versions */}
      {mode === 'edit' && <aside className="w-[280px] shrink-0 overflow-auto p-3 space-y-4" style={{ background: C.panel, borderLeft: `1px solid ${C.line}` }} data-testid="gs-inspector">
        {showVersions && cloud && <section className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}` }} data-testid="gs-versions-panel">
          <Suspense fallback={<p className="text-[12px]" style={{ color: C.dim }}>Loading versions…</p>}>
            <CreativeVersionHistory kind={GAME_CLOUD_KIND} localId={project.id} title={project.name} getCurrentJson={() => JSON.stringify(history.project)} onRestore={json => openProjectJson(json, 'that version')}/>
          </Suspense>
        </section>}

        {selInst ? <PropPanel inst={selInst} pro={pro} tool={tool} onTool={setTool} onChange={patch => editInstance(selInst, patch)} onDuplicate={() => duplicate(selInst)} onDelete={() => remove(selInst.id)} onFrame={() => send({ type: 'frame', id: selInst.id })}/>
          : selZone ? <ZonePanel z={selZone} pro={pro} onChange={zone => apply({ op: 'putZone', levelId: lvl.id, zone })} onDelete={() => remove(selZone.id)} onFrame={() => send({ type: 'frame', id: selZone.id })}/>
          : selMarker ? <MarkerPanel m={selMarker} pro={pro} owned={ownsKind(lvl, selMarker.kind)} onChange={patch => editMarker(selMarker, patch)} onFrame={() => send({ type: 'frame', id: selMarker.id })} onDelete={() => remove(selMarker.id)}/>
          : fresh && !pro ? <section data-testid="gs-start">
            <h3 className="text-[14px] font-bold">Start here</h3>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: C.dim }}>This is {lvl.name}, a level you can change. Try one:</p>
            {[
              { t: 'Add a wall or tower', d: 'Pick a piece, then click where it goes.', go: () => setLeft('props'), id: 'props' },
              { t: 'Move where a team starts', d: 'Select a spawn and drag it in the view.', go: () => { setLeft('outline'); const sp = markers.find(m => m.kind === 'spawn'); if (sp) pick(sp.id); }, id: 'spawn' },
              { t: 'Make a game from a story', d: 'Describe an idea; Story Intelligence lays out the levels.', go: () => setLeft('story'), id: 'story' },
            ].map(x => <button key={x.id} onClick={x.go} className="mt-2 w-full text-left p-2 rounded-lg" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }} data-testid={`gs-start-${x.id}`}>
              <div className="text-[13px] font-semibold">{x.t}</div>
              <div className="text-[11.5px] leading-snug" style={{ color: C.dim }}>{x.d}</div>
            </button>)}
            <p className="mt-2 text-[11px]" style={{ color: C.dim }}>Everything can be undone (Ctrl+Z).</p>
          </section>
          : <p className="text-[12.5px]" style={{ color: C.dim }}>{pro ? 'Select a marker or prop in the outline or the view. W move, E turn, Ctrl+D duplicate, Del delete.' : 'Click something in the view to change it, or open Props to add walls, towers, stairs and cover. Everything you change can be undone.'}</p>}

        <section>
          <h3 className="text-[11px] font-bold tracking-[.16em] uppercase mb-2" style={{ color: C.dim }}>Look</h3>
          <Slider label="Brightness" min={0.3} max={2} step={0.01} value={look.exposure ?? 1} onChange={v => apply({ op: 'setLook', levelId: lvl.id, look: { exposure: v } })} testid="gs-exposure"/>
          {pro && <Slider label="View distance" unit=" m" min={60} max={1500} step={10} value={look.far ?? 300} onChange={v => apply({ op: 'setLook', levelId: lvl.id, look: { far: v } })} testid="gs-far"/>}
          {(lvl.look.exposure !== undefined || lvl.look.far !== undefined) && <button className="text-[11px] underline" style={{ color: C.dim }} onClick={() => apply({ op: 'setLook', levelId: lvl.id, look: { exposure: undefined, far: undefined } })}>Use the level's own look</button>}
        </section>

        <RulesPanel level={lvl} project={project} apply={apply} pro={pro}/>

        <section>
          <h3 className="text-[11px] font-bold tracking-[.16em] uppercase mb-2" style={{ color: C.dim }}>History</h3>
          {history.entries.length === 0 ? <p className="text-[12px]" style={{ color: C.dim }}>No changes yet.</p>
            : <ol className="space-y-1 text-[12px]" data-testid="gs-history">{history.entries.slice(pro ? -40 : -6).reverse().map((e, i) => <li key={history.entries.length - i} className="leading-snug" style={{ color: i === 0 ? C.text : C.dim }}>{e.label}</li>)}</ol>}
        </section>
      </aside>}
    </div>
  </div>;
}

function IconBtn({ label, onClick, disabled, children, testid, on }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testid?: string; on?: boolean }) {
  return <button aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={on} className="h-8 w-8 grid place-items-center rounded-lg disabled:opacity-30" style={{ border: `1px solid ${on ? C.accent : C.line}`, background: on ? 'rgba(56,189,248,.14)' : 'transparent' }} data-testid={testid}>{children}</button>;
}

function RowBtn({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) {
  return <button onClick={onClick} className="w-full text-left px-2 h-7 rounded-md text-[12.5px] truncate" style={{ background: on ? 'rgba(251,191,36,.16)' : 'transparent', color: on ? '#fff' : C.text }} data-testid={testid}>{children}</button>;
}

function PropPanel({ inst, pro, tool, onTool, onChange, onDuplicate, onDelete, onFrame }: { inst: Instance; pro: boolean; tool: 'move' | 'turn'; onTool: (t: 'move' | 'turn') => void; onChange: (p: Partial<Pick<Instance, 'pos' | 'rot' | 'params'>>) => void; onDuplicate: () => void; onDelete: () => void; onFrame: () => void }) {
  const d = prefabById(inst.prefab);
  if (!d) return <p className="text-[12.5px]" style={{ color: C.warn }}>This piece ({inst.prefab}) isn't in this Studio's kit.</p>;
  const params = resolvedParams(d, inst);
  const setParam = (spec: ParamSpec, v: unknown) => onChange({ params: { ...params, [spec.key]: coerceParam(spec, v) } });
  const setAxis = (i: number, v: number) => { const pos = [...inst.pos] as Instance['pos']; pos[i] = v; onChange({ pos }); };
  return <section data-testid="gs-prop-panel">
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROP_DOT }}/>
      <h3 className="text-[14px] font-bold flex-1 truncate">{d.name}</h3>
      <IconBtn label="Show in view" onClick={onFrame}><Crosshair size={14}/></IconBtn>
      <IconBtn label="Duplicate (Ctrl+D)" onClick={onDuplicate} testid="gs-duplicate"><Copy size={14}/></IconBtn>
      <IconBtn label="Delete (Del)" onClick={onDelete} testid="gs-delete"><Trash2 size={14}/></IconBtn>
    </div>
    <div className="mt-3 flex gap-1.5">
      <IconBtn label="Move (W)" on={tool === 'move'} onClick={() => onTool('move')} testid="gs-tool-move"><Move size={14}/></IconBtn>
      <IconBtn label="Turn (E)" on={tool === 'turn'} onClick={() => onTool('turn')} testid="gs-tool-turn"><RotateCw size={14}/></IconBtn>
      <span className="self-center text-[11.5px] ml-1" style={{ color: C.dim }}>Drag the handle in the view</span>
    </div>
    {pro && <div className="mt-3 grid grid-cols-3 gap-1.5">{(['X', 'Y', 'Z'] as const).map((a, i) => <Num key={a} label={a} value={inst.pos[i]} step={0.25} onChange={v => setAxis(i, v)} testid={`gs-pos-${a.toLowerCase()}`}/>)}</div>}
    <Slider label="Facing" unit="°" min={-180} max={180} step={1} value={Math.round(inst.rot[1])} onChange={v => onChange({ rot: [inst.rot[0], v, inst.rot[2]] })} testid="gs-facing"/>
    {d.params.filter(s => pro || !s.pro).map(s => <ParamControl key={s.key} spec={s} value={params[s.key]} onChange={v => setParam(s, v)}/>)}
  </section>;
}

function ParamControl({ spec, value, onChange }: { spec: ParamSpec; value: ParamValue; onChange: (v: unknown) => void }) {
  const tid = `gs-param-${spec.key}`;
  switch (spec.kind) {
    case 'number': return <Slider label={spec.label} unit={spec.unit} min={spec.min} max={spec.max} step={spec.step} value={value as number} onChange={onChange} testid={tid}/>;
    case 'int': return <Slider label={spec.label} min={spec.min} max={spec.max} step={1} value={value as number} onChange={onChange} testid={tid}/>;
    case 'bool': return <label className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: C.text }}><input type="checkbox" checked={value as boolean} onChange={e => onChange(e.target.checked)} data-testid={tid}/>{spec.label}</label>;
    case 'choice': return <label className="block mt-3 text-[11.5px]" style={{ color: C.dim }}>{spec.label}
      <select value={value as string} onChange={e => onChange(e.target.value)} className="mt-1 w-full h-8 px-2 rounded-md text-[13px] outline-none" style={{ background: '#0d0c12', border: `1px solid ${C.line}`, color: C.text }} data-testid={tid}>
        {spec.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>;
  }
}

function ZonePanel({ z, pro, onChange, onDelete, onFrame }: { z: Zone; pro: boolean; onChange: (z: Zone) => void; onDelete: () => void; onFrame: () => void }) {
  const box = z.box!;
  const setSize = (i: number, v: number) => { const size = [...box.size] as Vec3; size[i] = v; const center = [...box.center] as Vec3; if (i === 1) center[1] = box.center[1] - box.size[1] / 2 + v / 2; onChange({ ...z, box: { center, size } }); };
  return <section data-testid="gs-zone-panel">
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ZONE_DOT }}/>
      <h3 className="text-[14px] font-bold flex-1 truncate">{z.name ?? 'Area'}</h3>
      <IconBtn label="Show in view" onClick={onFrame}><Crosshair size={14}/></IconBtn>
      <IconBtn label="Delete" onClick={onDelete} testid="gs-delete"><Trash2 size={14}/></IconBtn>
    </div>
    <p className="mt-1 text-[11.5px] leading-snug" style={{ color: C.dim }}>Drag the green box in the view to where the player is heading. Reaching it does what the level's rules say.</p>
    <label className="block mt-3 text-[11.5px]" style={{ color: C.dim }}>Name
      <input value={z.name ?? ''} onChange={e => onChange({ ...z, name: e.target.value || undefined })} className="mt-1 w-full h-8 px-2 rounded-md text-[13px] outline-none" style={{ background: '#0d0c12', border: `1px solid ${C.line}`, color: C.text }} data-testid="gs-zone-name"/>
    </label>
    <Slider label="Width" unit=" m" min={1} max={40} step={0.5} value={box.size[0]} onChange={v => setSize(0, v)} testid="gs-zone-w"/>
    <Slider label="Depth" unit=" m" min={1} max={40} step={0.5} value={box.size[2]} onChange={v => setSize(2, v)} testid="gs-zone-d"/>
    {pro && <Slider label="Height" unit=" m" min={1} max={20} step={0.5} value={box.size[1]} onChange={v => setSize(1, v)} testid="gs-zone-h"/>}
  </section>;
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

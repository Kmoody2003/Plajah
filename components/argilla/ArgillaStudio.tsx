/**
 * ArgillaStudio.tsx — the sculpting room. Say what you want, or pick a form, then push clay.
 * Left drag on the clay sculpts, drag off it (or right drag) orbits, wheel zooms.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Box, FlipHorizontal2, PawPrint, Redo2, Save, Send, Sparkles, Undo2, Upload } from 'lucide-react';
import { ArgillaEngine, PickResult, Vec3, ClayFieldSnapshot, CLAY_TIERS } from '../../services/argilla/engine';
import { ARGILLA_BRUSHES, ArgillaBrush, BrushSettings, stampFor, strokePoints } from '../../services/argilla/brushes';
import { CLAY_STARTERS, ClayRecipe, recipeFromPrompt } from '../../services/argilla/recipe';
import { decodeField, encodeField, glbToTriangles, meshToGlb } from '../../services/argilla/document';
import { voxelizeMesh } from '../../services/argilla/voxelize';
import { bakePicture, NeedsSetup, PictureReading, readPicture, readSheet, setUpLane, sheetBoxes } from '../../services/argilla/npuLane';
import { ArgillaProject, getArgillaProject, loadArgillaFile, newArgillaId, saveArgillaProject } from '../../services/argilla/store';
import { isWindowsApp } from '../../services/windowsBridgeService';
import VisionModelOffer from './VisionModelOffer';
import { imageToModel } from '../../services/tela/tela3dService';
import { executeCreativeStudioTask } from '../../services/localAi/creativeStudioBridge';
import { applyLineage, BodyTune, CODEX, CODEX_BY_ID, CodexEntry, recognizeFromScores, recognizeFromWords } from '../../services/argilla/creature/codex';
import { Anatomy, buildAnatomy } from '../../services/argilla/creature/anatomy';
import { finishInWorker, picturePaint, sheetInWorker, sheetPaint } from '../../services/argilla/creature/pipeline';
import type { SheetBox, SheetView } from '../../services/argilla/creature/sheetClay';
import type { CreatureModel } from '../../services/argilla/creature/finish';
import type { CreatureStage } from '../../services/argilla/creature/stage';
import CreatureRoom from './CreatureRoom';
import ModelingRoom from './ModelingRoom';
import SceneRoom from './SceneRoom';
import { newShot, type Shot } from '../../services/argilla/shot/shot';
import { deleteShot, listShots, loadShot, saveShot, type ShotSummary } from '../../services/argilla/shot/shotStore';
import { sendShotToFabula } from '../../services/argilla/shot/shotToFabula';
import type { Scene, SceneObject } from '../../services/argilla/scene/sceneModel';
import type { FinishedObject } from '../../services/argilla/scene/finishObject';
import type { BuildResult, Check } from '../../services/argilla/understand/reconstruct';
import { buildInWorker, finishToScene, generateShape, readBuildSheet, sceneFromPicture, sceneFromWords, understand as understandPicture, Understanding } from '../../services/argilla/understand/studioFlow';
import type { BuildSheet } from '../../services/argilla/understand/parts';
import { MATERIAL_BY_ID, MATERIALS } from '../../services/argilla/understand/materials';
import { priorFromWords, Structure } from '../../services/argilla/understand/vocabulary';

const LOOKS = ['Studio clay', 'Red wax', 'Terracotta', 'Porcelain', 'Bronze'];
const AUTOSAVE_MS = 60_000;

export interface ArgillaStudioProps {
  onClose?: () => void;
  initialProjectId?: string;
  /** Present when a Tela document is open: places the sculpt on a new board in it. */
  onSendToTela?: (glb: Blob, name: string, projectId: string) => Promise<void> | void;
  /** Exposes the engine to a lab harness. */
  onEngine?: (engine: ArgillaEngine) => void;
  /** Exposes the living model to a lab harness. */
  onStage?: (stage: CreatureStage) => void;
  onModeling?: (api: unknown) => void;
  onScene?: (api: unknown) => void;
}

const rail = 'flex flex-col items-center justify-center gap-0.5 w-[62px] h-[52px] rounded-lg text-[10.5px] font-semibold transition-colors';

export default function ArgillaStudio({ onClose, initialProjectId, onSendToTela, onEngine, onStage, onModeling, onScene }: ArgillaStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArgillaEngine | null>(null);
  const [fatal, setFatal] = useState('');
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [brush, setBrush] = useState<ArgillaBrush>('clay');
  const [radius, setRadius] = useState(0.1);
  const [strength, setStrength] = useState(0.5);
  const [mirror, setMirror] = useState(true);
  const [look, setLook] = useState(0);
  const [title, setTitle] = useState('Untitled sculpt');
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [usage, setUsage] = useState(0);
  const projectRef = useRef<ArgillaProject>({ id: initialProjectId ?? newArgillaId(), title: 'Untitled sculpt', updatedAt: 0, grid: 0 });
  const changedRef = useRef(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  const reading = useRef<PictureReading | null>(null);
  const [picture, setPicture] = useState<{ url: string; shaping: boolean } | null>(null);
  const [relief, setRelief] = useState(0.5);
  const [fullness, setFullness] = useState(0.8);
  const pictureFile = useRef<File | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const sheetViews = useRef<SheetView[] | null>(null);
  const [sheetDraft, setSheetDraft] = useState<{ file: File; url: string; boxes: SheetBox[]; aspect: number } | null>(null);
  const boxDrag = useRef<{ index: number; mode: 'move' | 'size'; x: number; y: number; start: SheetBox } | null>(null);
  // What this sculpt is understood to be, which decides how it's built, rigged and how it moves.
  const [being, setBeing] = useState<{ entry: CodexEntry; lineage: string | null; source: string } | null>(null);
  const [tuneEdits, setTuneEdits] = useState<Partial<BodyTune>>({});
  const anatomyRef = useRef<Anatomy | null>(null);
  const [living, setLiving] = useState<{ model: CreatureModel; entry: CodexEntry } | null>(null);
  const [whatIs, setWhatIs] = useState('');
  const [modeling, setModeling] = useState(false);
  const [sceneView, setSceneViewState] = useState<{ scene: Scene; finished: Record<string, FinishedObject> } | null>(null);
  // Every scene is a shot: a stage, a camera path and a length, saved on this device as it changes.
  const [shot, setShot] = useState<Shot | null>(null);
  const [shots, setShots] = useState<ShotSummary[]>(() => listShots());
  const setSceneView = (view: { scene: Scene; finished: Record<string, FinishedObject> } | null, keep?: Shot) => {
    setSceneViewState(view);
    setShot(view ? keep ?? newShot(view.scene.title) : null);
  };
  const shotSave = useRef(0);
  const saveShotSoon = (next: Shot | null, view = sceneView) => {
    if (!next || !view) return;
    window.clearTimeout(shotSave.current);
    shotSave.current = window.setTimeout(() => {
      void saveShot(next, view.scene, view.finished).then(() => setShots(listShots())).catch(() => setNote('This shot could not be saved on this device.'));
    }, 800);
  };
  useEffect(() => { saveShotSoon(shot); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shot, sceneView]);
  const openShot = async (id: string) => {
    const saved = await loadShot(id);
    if (!saved) { setNote('That shot is no longer on this device.'); setShots(listShots()); return; }
    setSceneView({ scene: saved.scene, finished: saved.finished }, saved.shot);
  };
  const [scenePrompt, setScenePrompt] = useState('');
  const sceneInput = useRef<HTMLInputElement>(null);
  // What it made of the picture: the name, how it built it, and what it checked.
  const [understood, setUnderstood] = useState<{ understanding: Understanding; result: BuildResult | null; checks: Check[]; corrections: string[]; generated: boolean; lined: boolean } | null>(null);
  const [setup, setSetup] = useState<{ megabytes: number; file: File } | null>(null);
  const [sheet, setSheet] = useState<BuildSheet | null>(null);
  const [sheetNote, setSheetNote] = useState('');
  const sheetRun = useRef<Promise<void> | null>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const sculptedSinceBody = useRef(false);
  const rebakeQueued = useRef<null | (() => void)>(null);
  const rebaking = useRef(false);

  const settings = useRef<BrushSettings>({ brush, radius, strength, invert: false, mirrorX: mirror, voxel: 0 });
  settings.current = { ...settings.current, brush, radius, strength, mirrorX: mirror };

  const refresh = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setHistory({ undo: e.canUndo, redo: e.canRedo });
    setUsage(e.stats.usedBricks / e.stats.capacity);
  }, []);

  const applyRecipe = useCallback((recipe: ClayRecipe) => {
    const e = engineRef.current;
    if (!e) return;
    if (!e.bakeRecipe(recipe.parts)) {
      setNote('This form has more surface than this device can hold as clay.');
      return;
    }
    refresh();
    changedRef.current = true;
    setTitle((t) => (t === 'Untitled sculpt' ? recipe.name : t));
    setStarted(true);
  }, [refresh]);

  const loadSnapshot = useCallback((field: ClayFieldSnapshot) => {
    const e = engineRef.current;
    if (!e) return;
    e.loadField(field);
    refresh();
    setStarted(true);
  }, [refresh]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let live = true;
    let observer: ResizeObserver | null = null;
    (async () => {
      try {
        const saved = initialProjectId ? getArgillaProject(initialProjectId) : null;
        const file = saved ? await loadArgillaFile(saved) : null;
        const field = file ? await decodeField(file) : null;
        const tier = field ? (Object.keys(CLAY_TIERS) as (keyof typeof CLAY_TIERS)[]).find((k) => CLAY_TIERS[k].grid === field.grid) : undefined;
        const engine = await ArgillaEngine.create(canvas, tier);
        if (!live) { engine.dispose(); return; }
        engineRef.current = engine;
        projectRef.current.grid = engine.pool.grid;
        settings.current.voxel = engine.voxel;
        engine.onStatus = setNote;
        const size = () => {
          // Internal resolution is capped so the march cost stays bounded on any display.
          const r = canvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          const cap = Math.min(1, 1080 / Math.max(1, r.height * dpr));
          canvas.width = Math.max(1, Math.round(r.width * dpr * cap));
          canvas.height = Math.max(1, Math.round(r.height * dpr * cap));
          engine.invalidate();
        };
        size();
        observer = new ResizeObserver(size);
        observer.observe(canvas);
        if (saved && field) {
          projectRef.current = saved;
          setTitle(saved.title);
          loadSnapshot(field);
        }
        onEngine?.(engine);
        setReady(true);
      } catch (error) {
        setFatal(error instanceof Error ? error.message : 'Plajah 3D could not start on this device.');
      }
    })();
    return () => {
      live = false;
      observer?.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (engineRef.current) { engineRef.current.look = look; engineRef.current.invalidate(); } }, [look]);

  const save = useCallback(async (toCloud: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    changedRef.current = false;
    const file = await encodeField(await e.readField());
    projectRef.current = await saveArgillaProject({ ...projectRef.current, title, grid: e.pool.grid }, file, toCloud);
    return projectRef.current;
  }, [title]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (changedRef.current && !pointer.current.down) void save(false).catch(() => { changedRef.current = true; });
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [save]);

  // ---- Pointer -------------------------------------------------------------------------------
  const pointer = useRef({
    down: false, orbit: false, x: 0, y: 0, px: 0, py: 0, pressure: 1, invert: false, shift: false,
    last: null as PickResult | null, grab: null as Vec3 | null, pending: false,
    starting: null as Promise<PickResult | null> | null,
  });

  const strokeTick = useCallback(async () => {
    const p = pointer.current;
    const e = engineRef.current;
    if (!e || !p.down || p.orbit || p.pending) return;
    p.pending = true;
    try {
      const s = settings.current;
      const active: BrushSettings = { ...s, brush: p.shift ? 'smooth' : s.brush, invert: p.invert };
      if (active.brush === 'move') {
        const axes = e.screenAxes();
        const dx = (p.x - p.px) * axes.pixelsToWorld, dy = -(p.y - p.py) * axes.pixelsToWorld;
        p.px = p.x; p.py = p.y;
        if (p.grab && (dx || dy)) {
          // Each stamp stays under a cell, so the bricks can follow the clay as it moves.
          const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (e.cell * 0.8)));
          for (let i = 0; i < steps; i++) {
            const dir: Vec3 = [
              (axes.right[0] * dx + axes.up[0] * dy) / steps,
              (axes.right[1] * dx + axes.up[1] * dy) / steps,
              (axes.right[2] * dx + axes.up[2] * dy) / steps,
            ];
            e.stamp({ op: 'grab', a: p.grab, ra: active.radius, dir, mirrorX: active.mirrorX });
            p.grab = [p.grab[0] + dir[0], p.grab[1] + dir[1], p.grab[2] + dir[2]];
          }
          e.brushRing = { point: p.grab, radius: active.radius };
        }
        return;
      }
      const hit = await e.pick(p.x, p.y);
      if (!hit || !pointer.current.down) return;
      const spacing = active.brush === 'crease' || active.brush === 'pinch' ? 0.1 : 0.28;
      for (const point of strokePoints(p.last, hit, active.radius, spacing)) {
        e.stamp(stampFor(point, active, p.pressure));
        p.last = point;
      }
      e.brushRing = { point: hit.point, radius: active.radius };
      e.invalidate();
    } finally {
      p.pending = false;
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); void strokeTick(); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [strokeTick]);

  const onPointerDown = async (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const e = engineRef.current;
    if (!e) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = pointer.current;
    Object.assign(p, {
      down: true, x: ev.clientX, y: ev.clientY, px: ev.clientX, py: ev.clientY,
      pressure: ev.pointerType === 'pen' ? Math.max(0.1, ev.pressure) : 1,
      invert: ev.altKey, shift: ev.shiftKey, last: null, grab: null,
      orbit: ev.button !== 0,
    });
    if (p.orbit) return;
    p.pending = true;
    // A quick tap can lift before this answers, so the release waits on it instead of racing it.
    p.starting = e.pick(ev.clientX, ev.clientY);
    const hit = await p.starting;
    p.pending = false;
    if (!hit) { p.orbit = true; return; }
    e.beginStroke();
    changedRef.current = true;
    sculptedSinceBody.current = true;
    // The first stroke commits the picture's shape; re-baking after it would erase the sculpting.
    setPicture((pic) => (pic?.shaping ? { ...pic, shaping: false } : pic));
    p.grab = hit.point;
    if (settings.current.brush !== 'move' || p.shift) {
      const s = settings.current;
      e.stamp(stampFor(hit, { ...s, brush: p.shift ? 'smooth' : s.brush, invert: p.invert }, p.pressure));
      p.last = hit;
    }
  };

  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const e = engineRef.current;
    if (!e) return;
    const p = pointer.current;
    if (p.down && p.orbit) {
      e.yaw -= (ev.clientX - p.x) * 0.006;
      e.pitch = Math.max(-1.45, Math.min(1.45, e.pitch + (ev.clientY - p.y) * 0.006));
      e.invalidate();
    }
    if (ev.pointerType === 'pen') p.pressure = Math.max(0.1, ev.pressure);
    p.x = ev.clientX; p.y = ev.clientY;
    if (!p.down && !p.pending) {
      p.pending = true;
      void e.pick(ev.clientX, ev.clientY).then((hit) => {
        e.brushRing = hit ? { point: hit.point, radius: settings.current.radius } : null;
        e.invalidate();
      }).finally(() => { p.pending = false; });
    }
  };

  const onPointerUp = async () => {
    const e = engineRef.current;
    const p = pointer.current;
    if (p.starting) {
      await p.starting;
      // Lets onPointerDown's continuation, queued first, open the stroke.
      await Promise.resolve();
      p.starting = null;
    }
    const wasStroke = p.down && !p.orbit;
    // A quick flick can end before the next frame, so its last point is stamped here.
    if (wasStroke) await strokeTick();
    p.down = false; p.orbit = false;
    if (e && wasStroke) {
      await e.endStroke();
      refresh();
    }
  };

  const onWheel = (ev: React.WheelEvent) => {
    const e = engineRef.current;
    if (!e) return;
    e.distance = Math.max(0.6, Math.min(8, e.distance * Math.exp(ev.deltaY * 0.001)));
    e.invalidate();
  };

  const undo = useCallback(() => { engineRef.current?.undo(); refresh(); changedRef.current = true; }, [refresh]);
  const redo = useCallback(() => { engineRef.current?.redo(); refresh(); changedRef.current = true; }, [refresh]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      // The modeling room has its own keys.
      if (document.querySelector('[data-testid="modeling-room"]')) return;
      const mod = ev.ctrlKey || ev.metaKey;
      const key = ev.key.toLowerCase();
      if (mod && key === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
      if (mod && key === 'y') { ev.preventDefault(); redo(); return; }
      if (mod) return;
      if (key === '[') setRadius((r) => Math.max(0.015, r / 1.15));
      if (key === ']') setRadius((r) => Math.min(0.5, r * 1.15));
      const hit = ARGILLA_BRUSHES.find((b) => b.key.toLowerCase() === key);
      if (hit) setBrush(hit.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---- Starting points -----------------------------------------------------------------------
  const startFromPrompt = async () => {
    const text = prompt.trim();
    if (!text) return;
    setBusy('Blocking out your form…');
    try {
      const { recipe, source } = await recipeFromPrompt(text);
      setTitle(text.slice(0, 60));
      applyRecipe(recipe);
      setNote(source);
    } finally { setBusy(''); }
  };

  const sculptTriangles = async (positions: Float32Array, indices: Uint32Array) => {
    const e = engineRef.current;
    if (!e) return;
    setBusy('Turning the model into clay…');
    try {
      const field = await voxelizeMesh(positions, indices, {
        grid: e.pool.grid,
        onProgress: async (f) => { setBusy(`Turning the model into clay… ${Math.round(f * 100)}%`); await new Promise((r) => setTimeout(r)); },
      });
      if (field.cells.length > e.pool.capacity) throw new Error('This model has more surface than this device can hold as clay.');
      loadSnapshot(field);
      changedRef.current = true;
      anatomyRef.current = null;
      setNote('Now clay. Colour and textures are not carried over yet.');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'That model could not be imported.');
    } finally { setBusy(''); }
  };

  const importGlb = async (blob: Blob) => {
    const { positions, indices } = await glbToTriangles(blob);
    await sculptTriangles(positions, indices);
  };

  const shapeFromPicture = async (nextRelief: number, nextFullness: number) => {
    const e = engineRef.current;
    if (!e || !reading.current) return false;
    const field = await bakePicture(reading.current, { grid: e.pool.grid, band: e.band, relief: nextRelief, thickness: nextFullness });
    if (field.cells.length > e.pool.capacity) throw new Error('This picture has more surface than this device can hold as clay.');
    loadSnapshot(field);
    changedRef.current = true;
    return true;
  };

  const startFromPicture = async (file: File) => {
    const e = engineRef.current;
    if (!e) return;
    setBusy('Reading your picture… the first time on this PC can take a few minutes');
    try {
      const fromWords = recognizeFromWords(whatIs || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      // A creature it already knows doesn't need the engine: the picture then only colours its coat.
      reading.current = await readPicture(file).catch((error) => {
        if (fromWords && !(error instanceof NeedsSetup)) return null;
        throw error;
      });
      pictureFile.current = file;
      // Words win. Otherwise it goes by what it sees, when it's sure enough to build a whole body on that.
      const seen = !fromWords && reading.current?.scores ? recognizeFromScores(reading.current.scores) : null;
      const named = fromWords ?? (seen && seen.confidence >= 0.5 ? seen : null);
      setPicture((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { url: URL.createObjectURL(file), shaping: true };
      });
      // A picture is built from the picture. What it understands decides how the unseen part is made, and the clay is
      // then checked against the picture. With no reading at all, it falls back to its plan for a named creature.
      if (reading.current) {
        const under = understandPicture(reading.current, whatIs || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
        await buildUnderstood(under);
        readSheetInBackground(file, reading.current, under, whatIs);
        setPicture((old) => (old ? { ...old, shaping: false } : old));
        setTitle((t) => (t === 'Untitled sculpt' ? file.name.replace(/\.[^.]+$/, '').slice(0, 60) : t));
        return;
      }
      if (named) {
        setBusy(`Building a whole ${named.entry.name.toLowerCase()}…`);
        const lineage = named.entry.lineages?.[0]?.id ?? null;
        setBeing({ entry: named.entry, lineage, source: whatIs || file.name });
        setTuneEdits({});
        if (!bakeBody(named.entry, lineage, {})) return;
        setPicture((old) => (old ? { ...old, shaping: false } : old));
        setMirror(true);
        e.yaw = 0.45; e.pitch = 0.05; e.distance = 3.6; e.invalidate();
        setStarted(true);
        setTitle((t) => (t === 'Untitled sculpt' ? named.entry.name : t));
        setNote(`${named.source === 'vision' ? `Looks like a ${named.entry.name.toLowerCase()} (${Math.round(named.confidence * 100)}% sure). Change it at left if not.` : `Understood as ${named.entry.name.toLowerCase()} from your words.`} Bring it to life to paint your picture on.`);
        return;
      }
      setBusy('Shaping the clay…');
      await shapeFromPicture(relief, fullness);
      // Pictures are rarely symmetrical, and the sculpt should face you the way the picture does.
      setMirror(false);
      e.yaw = 0.35;
      e.pitch = 0.05;
      e.distance = 3.5;
      e.invalidate();
      setTitle((t) => (t === 'Untitled sculpt' ? file.name.replace(/\.[^.]+$/, '').slice(0, 60) : t));
      const { device, ms } = reading.current;
      setNote(device === 'none'
        ? 'Shaped from the outline only. Depth needs the desktop app.'
        : `Read on the ${device === 'NPU' ? 'NPU' : device === 'CPU' ? 'CPU (no NPU found)' : device}${ms.depth ? ` in ${Math.round(ms.depth + (ms.cutout ?? 0))} ms` : ''}. Choose what this is to build the whole body.`);
    } catch (error) {
      if (error instanceof NeedsSetup) { setSetup({ megabytes: error.megabytes, file }); return; }
      setNote(error instanceof Error ? error.message : 'That picture could not be read.');
    } finally { setBusy(''); }
  };

  const runSetup = async () => {
    if (!setup) return;
    const { file } = setup;
    setSetup(null);
    try {
      await setUpLane((label, fraction) => setBusy(`${label}… ${Math.round(fraction * 100)}%`));
      setBusy('');
      await startFromPicture(file);
    } catch (error) {
      setBusy('');
      setNote(error instanceof Error ? error.message : 'Setup did not finish.');
    }
  };

  /** A sheet shows every side, so its body is carved from the views and nothing has to be guessed. */
  const openSheet = async (file: File) => {
    const boxes = await sheetBoxes(file);
    const image = await createImageBitmap(file);
    const aspect = image.width / image.height;
    image.close();
    setSheetDraft({ file, url: URL.createObjectURL(file), boxes, aspect });
  };

  const startFromSheet = async (file: File, boxes: SheetBox[], detailed = false) => {
    const e = engineRef.current;
    if (!e) return;
    setBusy('Reading each view…');
    try {
      const read = await readSheet(file, boxes);
      const views = read.views;
      reading.current = read;
      pictureFile.current = file;
      sheetViews.current = views;
      if (detailed) {
        // The most detailed shape comes from the local 3D model. The front panel is what it sees; every view still paints.
        const front = boxes.find((b) => b.role === 'front') ?? boxes[0];
        const image = await createImageBitmap(file);
        const crop = new OffscreenCanvas(Math.round((front.u1 - front.u0) * image.width), Math.round((front.v1 - front.v0) * image.height));
        crop.getContext('2d')!.drawImage(image, -front.u0 * image.width, -front.v0 * image.height);
        image.close();
        setBusy('Building the shape on your GPU, about 2 minutes…');
        const made = await imageToModel(await crop.convertToBlob({ type: 'image/png' }), 'hunyuan_mini', { quality: 'detail' });
        const { positions, indices } = await glbToTriangles(made.glb);
        await sculptTriangles(positions, indices);
        setBusy('Reading each view…');
      } else {
        setBusy(`Carving the body from ${views.length} views…`);
        const field = await sheetInWorker(read.mask, read.maskSize, read.aspect, views, e.pool.grid, e.band);
        if (field.cells.length > e.pool.capacity) throw new Error('This body has more surface than this device can hold as clay.');
        anatomyRef.current = null;
        loadSnapshot(field);
      }
      changedRef.current = true;
      setPicture((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(file), shaping: false }; });
      setMirror(false);
      e.yaw = 0.45; e.pitch = 0.05; e.distance = 3.6; e.invalidate();
      const named = recognizeFromWords(whatIs || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')) ?? (read.scores ? recognizeFromScores(read.scores) : null);
      if (named) { setBeing({ entry: named.entry, lineage: named.entry.lineages?.[0]?.id ?? null, source: file.name }); setTuneEdits({}); }
      setTitle((t) => (t === 'Untitled sculpt' ? file.name.replace(/\.[^.]+$/, '').slice(0, 60) : t));
      setNote(named ? `Built from ${views.length} views, understood as ${named.entry.name.toLowerCase()}. Sculpt it, then bring it to life.` : `Built from ${views.length} views. Choose what this is to rig it.`);
    } catch (error) {
      if (error instanceof NeedsSetup) { setNote(error.message); return; }
      const message = error instanceof Error ? error.message : 'That sheet could not be read.';
      setNote(/not enough memory|out of memory/i.test(message) ? 'This PC ran out of memory for the detailed shape. Close some apps and try again, or use Carve the body, which needs far less.' : message);
    } finally { setBusy(''); }
  };

  /** Builds from the picture by what it's understood to be, then shows what it checked. */
  const buildUnderstood = async (under: Understanding, structure?: Structure) => {
    const e = engineRef.current;
    if (!e || !reading.current) return;
    const result = await buildInWorker(reading.current, { grid: e.pool.grid, band: e.band, prior: under.prior, structure }, (fraction, label) => setBusy(`${label}… ${Math.round(fraction * 100)}%`));
    if (result.field.cells.length > e.pool.capacity) throw new Error('This has more surface than this device can hold as clay.');
    loadSnapshot(result.field);
    anatomyRef.current = null;
    changedRef.current = true;
    setUnderstood({ understanding: under, result, checks: result.checks, corrections: result.corrections, generated: false, lined: true });
    const plan = under.prior?.plan ? CODEX_BY_ID[under.prior.plan] : null;
    if (plan) setBeing({ entry: plan, lineage: plan.lineages?.[0]?.id ?? null, source: under.prior!.label });
    e.yaw = 0.45; e.pitch = 0.08; e.distance = 3.4; e.invalidate();
    setMirror(false);
    setStarted(true);
  };

  /** Parts and materials read in the background once a picture is built. They need the same GPU as generating. */
  const readSheetInBackground = (file: File, read: PictureReading, under: Understanding, words: string) => {
    setSheet(null);
    setSheetNote('Finding its parts and materials…');
    const run = readBuildSheet(file, read, under, words, setSheetNote)
      .then((made) => { if (pictureFile.current === file) { setSheet(made); setSheetNote(''); } })
      .catch((error) => { if (pictureFile.current === file) setSheetNote(error instanceof Error ? `Couldn't read its parts: ${error.message}` : 'Couldn\'t read its parts.'); });
    sheetRun.current = run;
  };

  const generateReal = async () => {
    const e = engineRef.current;
    if (!e || !reading.current || !pictureFile.current || !understood) return;
    try {
      setBusy('Getting your picture ready');
      await sheetRun.current;
      const made = await generateShape(pictureFile.current, reading.current, understood.understanding, e.pool.grid, setBusy);
      if (made.field.cells.length > e.pool.capacity) throw new Error('This has more surface than this device can hold as clay.');
      loadSnapshot(made.field);
      changedRef.current = true;
      setUnderstood({ ...understood, result: null, checks: made.checks, corrections: [`Generated in ${made.seconds} s${made.attempts > 1 ? `, best of ${made.attempts} tries` : ''}, turned ${Math.abs(made.yaw)}° to your picture's angle, then checked against it.`], generated: true, lined: made.matches });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate this shape.';
      setNote(/not enough memory|out of memory/i.test(message) ? 'This PC ran out of memory for that. Close some apps and try again.' : message);
    } finally { setBusy(''); }
  };

  const finishModel = async () => {
    const e = engineRef.current;
    if (!e || !understood) return;
    setBusy('Painting and baking the model…');
    try {
      await sheetRun.current;
      const field = await e.readField();
      setSceneView(await finishToScene(field, pictureFile.current, reading.current, understood.understanding, understood.checks, understood.corrections, title, understood.lined, understood.generated, sheetRef.current));
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not finish this model.');
    } finally { setBusy(''); }
  };

  const startScene = async (file?: File) => {
    const e = engineRef.current;
    if (!e) return;
    setBusy(file ? 'Reading the whole picture…' : 'Laying out your scene…');
    try {
      if (file) {
        setSceneView(await sceneFromPicture(file, e.pool.grid, e.band, setBusy));
      } else {
        const scene = await sceneFromWords(scenePrompt);
        if (!scene) { setNote('I could not find things I know in those words. Try naming objects, like a table, two chairs and a lamp.'); return; }
        setSceneView({ scene, finished: {} });
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not build that scene.');
    } finally { setBusy(''); }
  };

  /** Swaps a scene's block-out for one built from a picture, at the same real size and place. */
  const replaceInScene = async (object: SceneObject, picture: File) => {
    const e = engineRef.current;
    if (!e || !sceneView) return;
    setBusy('Reading your picture…');
    try {
      const read = await readPicture(picture);
      const built = await buildInWorker(read, { grid: Math.max(48, e.pool.grid >> 1), band: e.band * 2, prior: object.prior });
      const one = await finishToScene(built.field, picture, read, { prior: object.prior, readings: [], source: 'words', confidence: 1 }, [], [], object.label);
      setSceneView({ scene: { ...sceneView.scene, objects: sceneView.scene.objects.map((o) => (o.id === object.id ? { ...o, size: one.scene.objects[0].size } : o)) }, finished: { ...sceneView.finished, [object.id]: one.finished.object } }, shot ?? undefined);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not build from that picture.');
    } finally { setBusy(''); }
  };

  const sculptFromScene = (object: SceneObject) => {
    const source = sceneView?.finished[object.id]?.mesh ?? object.mesh;
    if (!source) return;
    setSceneView(null);
    void sculptTriangles(source.positions, source.indices);
  };

  const reshape = async (nextRelief: number, nextFullness: number) => {
    setBusy('Reshaping the clay…');
    try {
      await shapeFromPicture(nextRelief, nextFullness);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not reshape the clay.');
    } finally { setBusy(''); }
  };

  /** Puts the body a plan describes into the clay. Fast enough to run while a slider moves. */
  const bakeBody = useCallback((entry: CodexEntry, lineage: string | null, edits: Partial<BodyTune>) => {
    const e = engineRef.current;
    if (!e) return false;
    const directed = applyLineage(entry, lineage);
    const anatomy = buildAnatomy({ ...directed.tune, ...edits });
    if (!e.bakeRecipe(anatomy.parts)) {
      setNote('This body has more surface than this device can hold as clay.');
      return false;
    }
    anatomyRef.current = anatomy;
    sculptedSinceBody.current = false;
    refresh();
    changedRef.current = true;
    return true;
  }, [refresh]);

  /** Bakes at most one body per frame, always the newest, so sliders never queue up behind the work. */
  const queueBody = useCallback((entry: CodexEntry, lineage: string | null, edits: Partial<BodyTune>) => {
    rebakeQueued.current = () => bakeBody(entry, lineage, edits);
    if (rebaking.current) return;
    rebaking.current = true;
    const run = () => {
      const job = rebakeQueued.current;
      rebakeQueued.current = null;
      if (!job) { rebaking.current = false; return; }
      job();
      requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }, [bakeBody]);

  const understand = useCallback((text: string, fromPicture = false) => {
    const recognized = recognizeFromWords(text);
    if (!recognized) {
      setNote(fromPicture ? 'Tell it what this is, and it will build the rest of the body.' : 'No body plan matches those words yet. Choose the closest one below.');
      return null;
    }
    const lineage = recognized.entry.lineages?.[0]?.id ?? null;
    setBeing({ entry: recognized.entry, lineage, source: text });
    setTuneEdits({});
    return { entry: recognized.entry, lineage };
  }, []);

  const buildFromWords = (text: string) => {
    const hit = understand(text);
    if (!hit) return false;
    if (!bakeBody(hit.entry, hit.lineage, {})) return false;
    const e = engineRef.current!;
    setStarted(true);
    setMirror(true);
    e.yaw = 0.45; e.pitch = 0.05; e.distance = 3.6; e.invalidate();
    setTitle((t) => (t === 'Untitled sculpt' ? hit.entry.name : t));
    return true;
  };

  const chooseBeing = (entry: CodexEntry) => {
    const lineage = entry.lineages?.[0]?.id ?? null;
    setBeing({ entry, lineage, source: entry.name });
    setTuneEdits({});
    bakeBody(entry, lineage, {});
    const e = engineRef.current;
    if (e) { e.distance = 3.6; e.invalidate(); }
    setStarted(true);
    setMirror(true);
  };

  /** From clay to a living model: skin, bones, muscle, texture, fur. */
  const bringToLife = async () => {
    const e = engineRef.current;
    if (!e || !being) return;
    setBusy('Reading the clay…');
    try {
      const directed = applyLineage(being.entry, being.lineage);
      const tune = { ...directed.tune, ...tuneEdits };
      const fitToClay = !anatomyRef.current || sculptedSinceBody.current;
      const anatomy = anatomyRef.current ?? buildAnatomy(tune);
      const field = await e.readField();
      const paint = !pictureFile.current ? null
        : sheetViews.current && reading.current ? await sheetPaint(pictureFile.current, sheetViews.current, reading.current)
        : await picturePaint(pictureFile.current, reading.current, anatomy);
      const model = await finishInWorker(field, anatomy, directed.surface, { stride: field.cells.length > 25_000 ? 5 : 4, textureSize: 2048, picture: paint, fitToClay }, (fraction, label) => setBusy(`${label}… ${Math.round(fraction * 100)}%`));
      setLiving({ model, entry: directed });
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not finish this model.');
    } finally { setBusy(''); }
  };

  const generateDetailed = async () => {
    const text = prompt.trim();
    if (!text) return;
    setBusy('Painting a reference on your GPU…');
    try {
      const made = await executeCreativeStudioTask({
        op: 'cinema_generate',
        prompt: `${text}, single subject, full view, plain grey background, soft even light, clay sculpture`,
      });
      const url = made.outputUrls[0];
      if (!url) throw new Error(made.error || 'The local image engine did not return a picture.');
      setBusy('Building 3D from the reference…');
      const reference = await (await fetch(url)).blob();
      const model = await imageToModel(reference, 'hunyuan_mini');
      setTitle(text.slice(0, 60));
      await importGlb(model.glb);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Detailed start failed.');
    } finally { setBusy(''); }
  };

  const exportGlb = async () => {
    const e = engineRef.current;
    if (!e) return null;
    const mesh = await e.toMesh(2);
    return meshToGlb(mesh, title);
  };

  const download = async () => {
    setBusy('Building the mesh…');
    try {
      const glb = await exportGlb();
      if (!glb) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(glb);
      link.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'sculpt'}.glb`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
    } finally { setBusy(''); }
  };

  const sendToTela = async () => {
    if (!onSendToTela) return;
    setBusy('Placing it in your document…');
    try {
      const saved = await save(true);
      const glb = await exportGlb();
      if (glb && saved) {
        await onSendToTela(glb, `${title.replace(/[^\w\- ]+/g, '').trim() || 'sculpt'}.glb`, saved.id);
        onClose?.();
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not add the sculpt to the document.');
    } finally { setBusy(''); }
  };

  const saveNow = async () => {
    setBusy('Saving…');
    try {
      await save(true);
      setNote('Saved.');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not save.');
    } finally { setBusy(''); }
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const hint = ARGILLA_BRUSHES.find((b) => b.id === brush)?.hint;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0a0f] text-white select-none" data-testid="argilla-studio">
      <header className="flex items-center gap-2 h-12 px-3 border-b border-white/[.07] shrink-0">
        {onClose && <button onClick={onClose} aria-label="Close Plajah 3D" className="p-2 rounded-lg hover:bg-white/10"><ArrowLeft size={16}/></button>}
        <Box size={16} color="#ff5a8a"/>
        <input aria-label="Sculpt name" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-transparent text-sm font-semibold outline-none min-w-0 w-56 focus:bg-white/5 rounded px-1.5 py-1"/>
        <button onClick={() => setModeling(true)} className="ml-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20">Model</button>
        <div className="flex-1"/>
        <button onClick={undo} disabled={!history.undo} aria-label="Undo" title="Undo (Ctrl+Z)" className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><Undo2 size={16}/></button>
        <button onClick={redo} disabled={!history.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><Redo2 size={16}/></button>
        <button onClick={saveNow} disabled={!started} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 disabled:opacity-30"><Save size={14}/>Save</button>
        <button onClick={download} disabled={!started} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 disabled:opacity-30"><Upload size={14}/>Export GLB</button>
        {onSendToTela && <button onClick={sendToTela} disabled={!started} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055] disabled:opacity-30"><Send size={14}/>Add to document</button>}
      </header>

      <div className="flex flex-1 min-h-0">
        <nav aria-label="Brushes" hidden={modeling} className="flex flex-col gap-1 p-1.5 border-r border-white/[.07] shrink-0 overflow-y-auto">
          {ARGILLA_BRUSHES.map((b) => (
            <button key={b.id} onClick={() => setBrush(b.id)} title={`${b.hint} (${b.key})`} aria-pressed={brush === b.id}
              className={`${rail} ${brush === b.id ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10'}`}>
              {b.label}
              <span className={`text-[9px] font-normal ${brush === b.id ? 'text-black/50' : 'text-white/35'}`}>{b.key}</span>
            </button>
          ))}
        </nav>

        <main className="relative flex-1 min-w-0">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" style={{ cursor: 'crosshair' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}/>

          {fatal && <div role="alert" className="absolute inset-0 grid place-items-center p-8 bg-[#0b0a0f] text-center text-sm text-white/80">{fatal}</div>}

          {!started && ready && !fatal && (
            <div className="absolute inset-0 grid place-items-center p-6 bg-[#0b0a0f]/80">
              <div className="w-full max-w-xl">
                <h1 className="text-2xl font-bold mb-1">What are you sculpting?</h1>
                <p className="text-sm text-white/55 mb-4">Describe it and get a form to push around. Everything after that is your hands on the clay.</p>
                <form onSubmit={(e) => { e.preventDefault(); void startFromPrompt(); }} className="flex gap-2">
                  <input autoFocus aria-label="Describe your sculpt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="An old wizard's head" className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-white/[.07] text-sm outline-none focus:bg-white/10 select-text"/>
                  <button type="submit" disabled={!prompt.trim() || !!busy} className="flex items-center gap-1.5 px-4 rounded-lg text-sm font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055] disabled:opacity-40"><Sparkles size={15}/>Start</button>
                </form>
                {isWindowsApp() && <button onClick={generateDetailed} disabled={!prompt.trim() || !!busy} className="mt-2 text-xs text-white/60 hover:text-white disabled:opacity-40">Or build a detailed model from this on your GPU, about 2 minutes</button>}
                <div className="mt-5 p-3 rounded-xl bg-white/[.05]">
                  <label className="text-xs font-semibold text-white/75">Build a whole body from what it is
                    <input aria-label="What is it" value={whatIs} onChange={(e) => setWhatIs(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buildFromWords(whatIs); } }} placeholder="A werewolf, a vampire, a bear man…" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-white/[.07] text-sm font-normal text-white outline-none focus:bg-white/10 select-text"/>
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {CODEX.map((entry) => <button key={entry.id} onClick={() => chooseBeing(entry)} className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/[.07] hover:bg-white/15">{entry.name}</button>)}
                  </div>
                </div>
                <div className="mt-3 p-3 rounded-xl bg-white/[.05]">
                  <label className="text-xs font-semibold text-white/75">Build a whole scene
                    <input aria-label="Describe a scene" value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void startScene(); } }} placeholder="A wooden table with a lamp on it, two chairs and a tree" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-white/[.07] text-sm font-normal text-white outline-none focus:bg-white/10 select-text"/>
                  </label>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => void startScene()} disabled={!scenePrompt.trim() || !!busy} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/[.07] hover:bg-white/15 disabled:opacity-40">From these words</button>
                    <button onClick={() => sceneInput.current?.click()} disabled={!!busy} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/[.07] hover:bg-white/15 disabled:opacity-40">From a picture</button>
                  </div>
                </div>
                {!!shots.length && (
                  <div className="mt-3 p-3 rounded-xl bg-white/[.05]" data-testid="saved-shots">
                    <p className="text-xs font-semibold text-white/75">Your shots</p>
                    <div className="flex flex-col gap-1 mt-2 max-h-36 overflow-y-auto">
                      {shots.slice(0, 12).map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5">
                          <button onClick={() => void openShot(s.id)} disabled={!!busy} className="flex-1 flex justify-between px-2.5 py-1.5 rounded-lg text-xs text-left bg-white/[.07] hover:bg-white/15 disabled:opacity-40">
                            <span className="truncate capitalize">{s.title}</span><span className="shrink-0 text-white/40">{s.seconds} s</span>
                          </button>
                          <button onClick={() => { if (window.confirm(`Delete "${s.title}" from this device? This can't be undone.`)) void deleteShot(s.id).then(() => setShots(listShots())); }} aria-label={`Delete ${s.title}`} className="px-1.5 text-white/35 hover:text-white">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-4">
                  <button onClick={() => pictureInput.current?.click()} disabled={!!busy} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/85 disabled:opacity-40">Start from a picture</button>
                  <button onClick={() => sheetInput.current?.click()} disabled={!!busy} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/85 disabled:opacity-40">Start from a character sheet</button>
                  {CLAY_STARTERS.map((s) => (
                    <button key={s.id} onClick={() => applyRecipe(s.recipe)} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/[.07] hover:bg-white/15">{s.label}</button>
                  ))}
                  <button onClick={() => fileInput.current?.click()} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/[.07] hover:bg-white/15">Import a GLB</button>
                </div>
                {!!note && !busy && <p role="status" className="mt-3 text-xs text-white/70">{note}</p>}
              </div>
            </div>
          )}

          {sheetDraft && (
            <div role="dialog" aria-label="Mark the views" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-4 bg-[#0b0a0f]">
              <p className="text-sm font-semibold">Check the boxes: each should hold one whole figure. Drag to move, drag the corner to resize.</p>
              <div className="relative max-w-full" style={{ aspectRatio: String(sheetDraft.aspect), height: 'min(70vh, calc((100vw - 200px) / ' + sheetDraft.aspect + '))' }}
                onPointerMove={(ev) => {
                  const d = boxDrag.current;
                  if (!d) return;
                  const r = ev.currentTarget.getBoundingClientRect();
                  const dx = (ev.clientX - d.x) / r.width, dy = (ev.clientY - d.y) / r.height;
                  setSheetDraft((old) => old && ({ ...old, boxes: old.boxes.map((b, i) => (i !== d.index ? b : d.mode === 'move' ? { ...b, u0: d.start.u0 + dx, u1: d.start.u1 + dx, v0: d.start.v0 + dy, v1: d.start.v1 + dy } : { ...b, u1: Math.max(b.u0 + 0.03, d.start.u1 + dx), v1: Math.max(b.v0 + 0.03, d.start.v1 + dy) })) }));
                }}
                onPointerUp={() => { boxDrag.current = null; }}>
                <img src={sheetDraft.url} alt="Your character sheet" draggable={false} className="w-full h-full"/>
                {sheetDraft.boxes.map((b, i) => (
                  <div key={b.role} data-testid={`sheet-box-${b.role}`} className="absolute border-2 border-[#ff5a8a] bg-[#ff5a8a]/10 cursor-move touch-none" style={{ left: `${b.u0 * 100}%`, top: `${b.v0 * 100}%`, width: `${(b.u1 - b.u0) * 100}%`, height: `${(b.v1 - b.v0) * 100}%` }}
                    onPointerDown={(ev) => { ev.currentTarget.parentElement?.setPointerCapture(ev.pointerId); boxDrag.current = { index: i, mode: 'move', x: ev.clientX, y: ev.clientY, start: b }; }}>
                    <span className="absolute top-0 left-0 px-1.5 py-0.5 text-[11px] font-bold capitalize bg-[#ff5a8a] text-black">{b.role}</span>
                    <span aria-label="Resize" className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-[#ff5a8a] cursor-nwse-resize" onPointerDown={(ev) => { ev.stopPropagation(); ev.currentTarget.closest('.relative')?.setPointerCapture(ev.pointerId); boxDrag.current = { index: i, mode: 'size', x: ev.clientX, y: ev.clientY, start: b }; }}/>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { URL.revokeObjectURL(sheetDraft.url); setSheetDraft(null); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10">Cancel</button>
                <button onClick={() => { const { file, boxes, url } = sheetDraft; URL.revokeObjectURL(url); setSheetDraft(null); void startFromSheet(file, boxes); }} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055]">Carve the body</button>
                <button onClick={() => { const { file, boxes, url } = sheetDraft; URL.revokeObjectURL(url); setSheetDraft(null); void startFromSheet(file, boxes, true); }} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-black">More detailed, on your GPU (about 2 min)</button>
              </div>
            </div>
          )}

          {setup && (
            <div role="dialog" aria-label="Set up picture reading" className="absolute inset-0 z-20 grid place-items-center p-6 bg-black/60">
              <div className="w-full max-w-sm p-4 rounded-xl bg-[#17151b] text-sm">
                <h2 className="font-bold mb-1">Set up picture reading on this PC?</h2>
                <p className="text-white/65 text-xs leading-snug mb-3">It downloads about {setup.megabytes} MB once, a small Python runtime and two open models. Pictures are read on this PC and never uploaded.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setSetup(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10">Not now</button>
                  <button onClick={runSetup} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055]">Set up</button>
                </div>
              </div>
            </div>
          )}

          {!!busy && <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/70 text-xs">{busy}</div>}
          {!!note && !busy && started && <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[80%] px-3 py-1.5 rounded-full bg-black/70 text-xs text-white/80">{note}</div>}

          {started && !(understood && !being) && (
            <div className="absolute top-3 left-3 w-60 p-2.5 rounded-xl bg-black/65 backdrop-blur text-xs flex flex-col gap-2 max-h-[calc(100%-90px)] overflow-y-auto" data-testid="being-panel">
              <label className="flex flex-col gap-1 font-semibold">What is this?
                <select aria-label="What this is" value={being?.entry.id && CODEX_BY_ID[being.entry.id] ? being.entry.id : ''} onChange={(e) => { const entry = CODEX_BY_ID[e.target.value]; if (entry) chooseBeing(entry); }} className="bg-white/10 rounded px-1.5 py-1 font-normal outline-none">
                  <option value="" className="text-black">{being ? being.entry.name : 'Choose…'}</option>
                  {CODEX.map((entry) => <option key={entry.id} value={entry.id} className="text-black">{entry.name}</option>)}
                </select>
              </label>
              {being && (
                <>
                  <p className="text-white/60 leading-snug">{being.entry.understood}</p>
                  {!!being.entry.lineages?.length && (
                    <label className="flex flex-col gap-1 font-semibold">Played like
                      <select aria-label="Played like" value={being.lineage ?? ''} onChange={(e) => { const lineage = e.target.value || null; setBeing({ ...being, lineage }); setTuneEdits({}); bakeBody(being.entry, lineage, {}); }} className="bg-white/10 rounded px-1.5 py-1 font-normal outline-none">
                        {being.entry.lineages.map((l) => <option key={l.id} value={l.id} className="text-black">{l.label} ({l.source})</option>)}
                      </select>
                    </label>
                  )}
                  {([['hunch', 'Hunch', 0, 1], ['mass', 'Mass', 0, 1], ['definition', 'Muscle', 0, 1], ['digitigrade', 'Raised heel', 0, 1], ['muzzle', 'Snout', 0, 1], ['legLength', 'Legs', 0.6, 1.4], ['armLength', 'Arms', 0.7, 1.5]] as [keyof BodyTune, string, number, number][]).map(([key, label, lo, hi]) => {
                    const current = tuneEdits[key] ?? applyLineage(being.entry, being.lineage).tune[key];
                    return (
                      <label key={key} className="flex flex-col gap-0.5">{label}
                        <input aria-label={label} type="range" min={lo} max={hi} step={0.01} value={current} onChange={(e) => { const next = { ...tuneEdits, [key]: +e.target.value }; setTuneEdits(next); queueBody(being.entry, being.lineage, next); }}/>
                      </label>
                    );
                  })}
                  <p className="text-white/40 text-[10.5px] leading-snug">These rebuild the body{sculptedSinceBody.current ? ', and would replace your sculpting' : ''}. Sculpt freely once it's close.</p>
                  <button onClick={bringToLife} disabled={!!busy} className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055] disabled:opacity-40"><PawPrint size={14}/>Bring to life</button>
                </>
              )}
              {!being && <p className="text-white/50 leading-snug">Choose what this is, and it will rig, muscle, paint and animate it to match.</p>}
            </div>
          )}

          {sceneView && <SceneRoom scene={sceneView.scene} finished={sceneView.finished} onBack={() => setSceneView(null)} onSculpt={sculptFromScene} onReplace={replaceInScene} onApi={onScene}
            shot={shot ?? undefined} onShotChange={setShot} onSceneChange={() => saveShotSoon(shot)}
            onSendToFabula={async (rendered) => { if (shot) await sendShotToFabula(shot, rendered); }}/>}

          {started && understood && (
            <div className="absolute bottom-16 right-3 w-64 max-h-[60%] overflow-y-auto p-2.5 rounded-xl bg-black/70 backdrop-blur text-xs flex flex-col gap-2" data-testid="understanding">
              <label className="flex flex-col gap-1 font-semibold">This is
                <input aria-label="Name what this is" defaultValue={understood.understanding.prior?.label ?? ''} key={understood.understanding.prior?.label ?? 'none'} placeholder="Say what it is"
                  onKeyDown={(ev) => { if (ev.key !== 'Enter') return; if (pictureFile.current && reading.current) readSheetInBackground(pictureFile.current, reading.current, understood.understanding, ev.currentTarget.value); const prior = priorFromWords(ev.currentTarget.value); if (!prior) { setNote('I do not know that one yet. Choose how it is built instead.'); return; } setBusy('Rebuilding…'); void buildUnderstood({ prior, readings: understood.understanding.readings, source: 'words', confidence: 1 }).finally(() => setBusy('')); }}
                  className="bg-white/10 rounded px-1.5 py-1 font-normal outline-none select-text"/>
              </label>
              <p className="text-white/50 leading-snug">
                {understood.understanding.source === 'vision' ? `${Math.round(understood.understanding.confidence * 100)}% sure from the picture` : understood.understanding.source === 'words' ? 'From your words' : 'Not sure what this is'}
                {understood.understanding.readings.length > 1 && understood.understanding.source !== 'words' ? `, or ${understood.understanding.readings.slice(1, 3).map((r) => r.label).join(', ')}` : ''}
                {understood.result?.size ? `. About ${understood.result.size.map((s) => (s >= 1 ? `${s.toFixed(1)} m` : `${Math.round(s * 100)} cm`)).join(' x ')}` : ''}
              </p>
              {understood.result && (
                <label className="flex items-center justify-between gap-2">Built as
                  <select aria-label="How it is built" value={understood.result.plan.structure} onChange={(ev) => { setBusy('Rebuilding…'); void buildUnderstood(understood.understanding, ev.target.value as Structure).finally(() => setBusy('')); }} className="bg-white/10 rounded px-1 py-0.5 outline-none">
                    {(['round', 'slab', 'sheet', 'mirrored', 'organic', 'figure', 'branching'] as Structure[]).map((s) => <option key={s} value={s} className="text-black">{s}</option>)}
                  </select>
                </label>
              )}
              <div className="flex flex-col gap-1" role="list" aria-label="What it checked">
                {understood.checks.map((c) => (
                  <div key={c.id} role="listitem" className="flex gap-1.5 leading-snug">
                    <span aria-hidden className={c.pass ? 'text-emerald-400' : 'text-amber-400'}>{c.pass ? '✓' : '!'}</span>
                    <span>{c.label}<span className="block text-white/45">{c.detail}</span></span>
                  </div>
                ))}
              </div>
              {!!understood.corrections.length && <ul className="text-white/55 leading-snug list-disc pl-3.5">{[...new Set(understood.corrections)].slice(0, 3).map((c) => <li key={c}>{c}</li>)}</ul>}
              {sheetNote && <p className="text-white/55 leading-snug" role="status">{sheetNote}</p>}
              {sheet && (
                <div className="flex flex-col gap-1" data-testid="build-sheet">
                  <p className="font-semibold">Made of{sheet.kind ? <span className="block font-normal text-white/50">Read as {sheet.kind}, from {sheet.from === 'words' ? 'your words' : sheet.from === 'vision' ? 'the picture' : 'the on-device model'}</span> : <span className="block font-normal text-white/50">Going by what the picture shows</span>}</p>
                  {sheet.parts.slice().sort((a, b) => b.share - a.share).map((part) => (
                    <label key={part.id} className="flex items-center justify-between gap-1.5">
                      <span className="min-w-0 truncate" title={part.name}>{part.name}<span className="block text-[10.5px] text-white/45">{part.evidence === 'seen' ? 'Seen in the picture' : part.evidence === 'expected' ? 'Expected for this' : 'Your choice'}</span></span>
                      <select aria-label={`Material of ${part.name}`} value={part.material} onChange={(ev) => { const material = ev.target.value; setSheet((old) => old && { ...old, parts: old.parts.map((p) => (p.id === part.id ? { ...p, material, behaviour: MATERIAL_BY_ID.get(material)?.behaviour ?? p.behaviour, evidence: 'yours' as const } : p)) }); }} className="w-24 shrink-0 bg-white/10 rounded px-1 py-0.5 outline-none">
                        {MATERIALS.map((m) => <option key={m.id} value={m.id} className="text-black">{m.label}</option>)}
                      </select>
                    </label>
                  ))}
                  {!!sheet.notSeen.length && <p className="text-white/50 leading-snug">Usually has, not seen here: {sheet.notSeen.map((l) => l.name).join(', ')}</p>}
                  {!sheet.look && <VisionModelOffer/>}
                </div>
              )}
              {!understood.generated && (
                <button onClick={generateReal} disabled={!!busy} className={`py-1.5 rounded-lg font-bold disabled:opacity-40 ${understood.result?.needsGenerated ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>Build real geometry on your GPU (about a minute)</button>
              )}
              <button onClick={finishModel} disabled={!!busy} className="py-1.5 rounded-lg font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055] disabled:opacity-40">Finish the model</button>
            </div>
          )}

          {modeling && <ModelingRoom onBack={() => setModeling(false)} onApi={onModeling} onSculpt={(positions, indices) => { setModeling(false); void sculptTriangles(positions, indices); }}/>}

          {living && being && <CreatureRoom model={living.model} entry={living.entry} lineageId={being.lineage} title={title} onBack={() => setLiving(null)} onStage={onStage}/>}

          {started && picture && (
            <div className="absolute top-3 right-3 w-40 p-2 rounded-xl bg-black/65 backdrop-blur text-xs">
              <img src={picture.url} alt="Your reference picture" draggable={false} className="w-full max-h-40 object-contain rounded-md"/>
              {picture.shaping && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="flex flex-col gap-0.5">Depth<input type="range" min={0} max={1} step={0.05} value={relief} onChange={(e) => setRelief(+e.target.value)} onPointerUp={(e) => void reshape(+e.currentTarget.value, fullness)} onKeyUp={(e) => void reshape(+e.currentTarget.value, fullness)}/></label>
                  <label className="flex flex-col gap-0.5">Fullness<input type="range" min={0.3} max={1.3} step={0.05} value={fullness} onChange={(e) => setFullness(+e.target.value)} onPointerUp={(e) => void reshape(relief, +e.currentTarget.value)} onKeyUp={(e) => void reshape(relief, +e.currentTarget.value)}/></label>
                  <span className="text-white/45 text-[10.5px]">Your first stroke locks these in.</span>
                </div>
              )}
            </div>
          )}

          {started && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 max-w-[calc(100%-24px)] px-4 py-2 rounded-xl bg-black/65 backdrop-blur text-xs">
              <label className="flex items-center gap-2">Size<input type="range" min={0.015} max={0.5} step={0.005} value={radius} onChange={(e) => setRadius(+e.target.value)} className="w-28"/></label>
              <label className="flex items-center gap-2">Strength<input type="range" min={0.05} max={1} step={0.05} value={strength} onChange={(e) => setStrength(+e.target.value)} className="w-24"/></label>
              <button onClick={() => setMirror((m) => !m)} aria-pressed={mirror} className={`flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold ${mirror ? 'bg-white text-black' : 'bg-white/10'}`}><FlipHorizontal2 size={13}/>Mirror</button>
              <label className="flex items-center gap-2">Look
                <select value={look} onChange={(e) => setLook(+e.target.value)} className="bg-white/10 rounded px-1 py-0.5 outline-none">
                  {LOOKS.map((l, i) => <option key={l} value={i} className="text-black">{l}</option>)}
                </select>
              </label>
              <span className="text-white/45 hidden md:inline">{hint} · Alt reverses · Shift smooths</span>
              <span className="text-white/45" title="How much of this device's clay detail is in use">Detail {Math.round(usage * 100)}%</span>
            </div>
          )}
        </main>
      </div>

      <input ref={pictureInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void startFromPicture(f); e.target.value = ''; }}/>
      <input ref={sceneInput} type="file" data-testid="scene-input" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void startScene(f); e.target.value = ''; }}/>
      <input ref={sheetInput} type="file" data-testid="sheet-input" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void openSheet(f); e.target.value = ''; }}/>
      <input ref={fileInput} type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importGlb(f); e.target.value = ''; }}/>
    </div>
  );
}

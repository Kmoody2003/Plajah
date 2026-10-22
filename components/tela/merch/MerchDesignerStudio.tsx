// components/tela/merch/MerchDesignerStudio.tsx — Tela's Merch Designer.
//
// Design the artwork for a product, put it on a 3D model (a built-in template, an imported GLB/OBJ/
// STL/FBX, or a sculpt from Tela's clay sculptor), stage it on a lit photo set, and shoot it: a pure
// 3D render, or a generated photo that uses that render as its reference. Shots list straight into
// the shop as a storeProducts listing.
//
// The project autosaves (IndexedDB + creative cloud, services/merchStudio/store.ts); the 3D stage is
// services/merchStudio/stage.ts.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Box, Camera, Check, ChevronDown, Download, Image as ImageIcon, Layers, Loader2, Move3d,
  Palette, Plus, RefreshCw, Shirt, ShoppingBag, Sparkles, Star, Sun, Trash2, Type, Upload, Wand2, X,
} from 'lucide-react';
import { MERCH_PRODUCT_TEMPLATES, getProductTemplate, type MerchPrintArea } from '../../../services/merchStudio/products';
import { MERCH_SCENES, getMerchScene, merchShotPrompt } from '../../../services/merchStudio/scenes';
import { MERCH_FONTS, exportPrintFile, renderPrintArea } from '../../../services/merchStudio/artwork';
import {
  assetRef, createMerchProject, getLastMerchProjectId, getMerchAssetBlob, listMerchProjects, loadMerchProject,
  productLabel, putMerchAsset, resolveMerchSrc, saveMerchProject,
} from '../../../services/merchStudio/store';
import { MerchStage } from '../../../services/merchStudio/stage';
import { checkShotEngine, dataUrlToBlob, generateShot, type EngineStatus } from '../../../services/merchStudio/shotGenerator';
import {
  MERCH_ASPECTS, newMerchId, type MerchArtLayer, type MerchAspect, type MerchCameraSetup, type MerchProject,
  type MerchProjectSummary, type MerchShot, type MerchShotSetup,
} from '../../../services/merchStudio/types';
import type { SculptBrushType, MatCapPreset } from '../../../services/tela/tela3dSculptEngine';

const Tela3DCanvas = React.lazy(() => import('../Tela3DCanvas'));

type Tab = 'product' | 'design' | 'scene' | 'shoot';

/** The decal "print area" used for imported and sculpted models. */
const DECAL_AREA: MerchPrintArea = { id: 'decal', label: 'Print', aspect: 1, printInches: [10, 10] };

const CAMERA_PRESETS: Array<{ id: string; label: string; cam: Omit<MerchCameraSetup, 'fov'> }> = [
  { id: 'hero', label: 'Hero ¾', cam: { yaw: 24, pitch: 10, distance: 1.1 } },
  { id: 'front', label: 'Front', cam: { yaw: 0, pitch: 4, distance: 1.05 } },
  { id: 'low', label: 'Low hero', cam: { yaw: 16, pitch: 2.5, distance: 1.0 } },
  { id: 'profile', label: 'Profile', cam: { yaw: 70, pitch: 6, distance: 1.1 } },
  { id: 'top', label: 'Flat lay', cam: { yaw: 0, pitch: 80, distance: 1.2 } },
  { id: 'close', label: 'Close-up', cam: { yaw: 14, pitch: 8, distance: 0.72 } },
];

const BRUSHES: Array<{ id: SculptBrushType; label: string }> = [
  { id: 'CLAY', label: 'Clay' }, { id: 'STANDARD', label: 'Draw' }, { id: 'GRAB', label: 'Grab' },
  { id: 'SMOOTH', label: 'Smooth' }, { id: 'INFLATE', label: 'Inflate' }, { id: 'PINCH', label: 'Pinch' },
  { id: 'FLATTEN', label: 'Flatten' }, { id: 'PAINT_3D', label: 'Paint' },
];

const SHOT_LONG_SIDE = { render: 1600, generate: 1024 };

function shotSize(aspect: MerchAspect, longSide: number) {
  const a = MERCH_ASPECTS[aspect];
  const w = a >= 1 ? longSide : Math.round(longSide * a);
  const h = a >= 1 ? Math.round(longSide / a) : longSide;
  // Diffusion models want multiples of 64.
  return { width: Math.round(w / 64) * 64, height: Math.round(h / 64) * 64 };
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'merch';

function useAssetUrl(src: string | undefined, project: MerchProject | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!project) { setUrl(null); return; }
    void resolveMerchSrc(src, project.assets).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [src, project]);
  return url;
}

// ── Small UI atoms ────────────────────────────────────────────────────────────

const panelTitle = 'text-[10px] font-mono font-bold tracking-[0.18em] text-white/45 uppercase mb-2';
const chip = (on: boolean) =>
  `px-2.5 py-1 rounded-[8px] text-[11px] font-semibold border transition-colors ${on ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/[0.09] hover:text-white'}`;
const btn = 'flex items-center justify-center gap-1.5 h-8 px-3 rounded-[9px] text-[12px] font-semibold border border-white/10 bg-white/[0.05] text-white/85 hover:bg-white/[0.1] hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none';
const btnPrimary = 'flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] text-[12.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none';

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block mb-2.5">
      <div className="flex justify-between text-[11px] text-white/60 mb-1">
        <span>{label}</span>
        <span className="font-mono text-white/80">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#ff5a8a]" />
    </label>
  );
}

function ShotThumb({ shot, project, active, onClick }: { shot: MerchShot; project: MerchProject; active: boolean; onClick: () => void }) {
  const url = useAssetUrl(assetRef(shot.assetId), project);
  return (
    <button onClick={onClick} className={`relative shrink-0 h-[84px] rounded-[10px] overflow-hidden border-2 transition-colors ${active ? 'border-[#ff5a8a]' : 'border-transparent hover:border-white/30'}`} style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
      <span className={`absolute left-1 bottom-1 px-1.5 py-[1px] rounded-[5px] text-[9px] font-bold ${shot.kind === 'generated' ? 'bg-[#ff5a8a] text-white' : 'bg-black/70 text-white/85'}`}>{shot.kind === 'generated' ? 'AI' : '3D'}</span>
      {project.coverShotId === shot.id && <Star size={12} className="absolute right-1 top-1 text-amber-300 fill-amber-300" />}
    </button>
  );
}

// ── Studio ───────────────────────────────────────────────────────────────────

export interface MerchDesignerStudioProps {
  onClose: () => void;
  initialProjectId?: string;
}

export default function MerchDesignerStudio({ onClose, initialProjectId }: MerchDesignerStudioProps) {
  const [project, setProject] = useState<MerchProject | null>(null);
  const [tab, setTab] = useState<Tab>('product');
  const [activeArea, setActiveArea] = useState('front');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [viewShot, setViewShot] = useState<string | null>(null);
  const [sculptOpen, setSculptOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<MerchProjectSummary[]>([]);
  const [placingDecal, setPlacingDecal] = useState(false);
  const [promptExtra, setPromptExtra] = useState('');
  const [strength, setStrength] = useState<number | null>(null);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [stageReady, setStageReady] = useState(0);
  const [viewportBox, setViewportBox] = useState({ w: 800, h: 600 });

  const viewportHost = useRef<HTMLDivElement>(null);
  const viewportEl = useRef<HTMLDivElement>(null);
  const stageRef = useRef<MerchStage | null>(null);
  const areaCanvases = useRef(new Map<string, HTMLCanvasElement>());
  /** The decal placement the stage currently shows (so artwork edits only refresh the texture). */
  const stageDecalKey = useRef('');
  const [designsTick, setDesignsTick] = useState(0);
  const loadedOnce = useRef(false);
  const projectRef = useRef<MerchProject | null>(null);
  projectRef.current = project;

  const template = project?.product.kind === 'template' ? getProductTemplate(project.product.templateId) : null;
  const printAreas: MerchPrintArea[] = template ? template.printAreas : [DECAL_AREA];
  const area = printAreas.find((a) => a.id === activeArea) ?? printAreas[0];
  const scene = getMerchScene(project?.setup.sceneId);
  const layers = project?.designs[area.id] ?? [];
  const layer = layers.find((l) => l.id === selectedLayer) ?? null;

  const flash = useCallback((tone: 'ok' | 'warn' | 'err', text: string) => {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), tone === 'err' ? 9000 : 4500);
  }, []);

  // ── Load / autosave ────────────────────────────────────────────────────────

  useEffect(() => {
    let live = true;
    (async () => {
      const id = initialProjectId ?? getLastMerchProjectId();
      const p = (id && (await loadMerchProject(id).catch(() => null))) || createMerchProject();
      if (live) setProject(p);
    })();
    return () => { live = false; };
  }, [initialProjectId]);

  useEffect(() => {
    if (!project) return;
    if (!loadedOnce.current) { loadedOnce.current = true; return; }
    setSaveState('dirty');
    const t = window.setTimeout(async () => {
      setSaveState('saving');
      await saveMerchProject(project).catch(() => {});
      setSaveState('saved');
    }, 900);
    return () => window.clearTimeout(t);
  }, [project]);

  // Flush on close/page hide so the last edit isn't lost.
  useEffect(() => {
    const flush = () => { const p = projectRef.current; if (p) void saveMerchProject(p); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  const update = useCallback((fn: (p: MerchProject) => MerchProject) => setProject((p) => (p ? fn(p) : p)), []);
  const updateSetup = useCallback((patch: Partial<MerchShotSetup>) => update((p) => ({ ...p, setup: { ...p.setup, ...patch } })), [update]);

  // ── Engine status ──────────────────────────────────────────────────────────

  const refreshEngine = useCallback(() => { void checkShotEngine().then(setEngine); }, []);
  useEffect(refreshEngine, [refreshEngine]);

  // ── Viewport sizing: the viewport has the shot's aspect, fit inside the centre pane ─────────

  useEffect(() => {
    const host = viewportHost.current;
    if (!host) return;
    const ro = new ResizeObserver(() => setViewportBox({ w: host.clientWidth, h: host.clientHeight }));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  const aspect = MERCH_ASPECTS[project?.setup.aspect ?? '4:5'];
  const vw = Math.max(200, Math.min(viewportBox.w - 32, (viewportBox.h - 32) * aspect));
  const vh = vw / aspect;

  // ── Stage lifecycle ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!viewportEl.current || !project || stageRef.current) return;
    const stage = new MerchStage(viewportEl.current);
    stage.onCameraChange = (cam) => update((p) => ({ ...p, setup: { ...p.setup, camera: cam } }));
    stageRef.current = stage;
    // Dev handle for driving the stage from the console / lab.
    if (import.meta.env.DEV) (window as unknown as { __merchStage?: MerchStage }).__merchStage = stage;
    setStageReady((n) => n + 1);
    return undefined;
  }, [project, update]);
  useEffect(() => () => { stageRef.current?.dispose(); stageRef.current = null; }, []);

  const productKey = project ? JSON.stringify(project.product.kind === 'template' ? project.product : { a: project.product.assetId }) : '';

  // Product (and the set, since a hung product hides the pedestal).
  useEffect(() => {
    const stage = stageRef.current, p = projectRef.current;
    if (!stage || !p) return;
    let live = true;
    (async () => {
      setBusy('Loading product…');
      try {
        if (p.product.kind === 'template') {
          await stage.setProduct({ kind: 'template', templateId: p.product.templateId, color: p.productColor });
        } else {
          const url = await resolveMerchSrc(assetRef(p.product.assetId), p.assets);
          if (!url) throw new Error('The model file is not on this device yet');
          await stage.setProduct({ kind: 'model', modelUrl: url, modelName: p.product.name, color: p.productColor });
        }
        if (!live) return;
        stage.applyScene(getMerchScene(p.setup.sceneId), p.setup);
        areaCanvases.current.clear();
        setDesignsTick((n) => n + 1);
      } catch (e) {
        flash('err', `Couldn't load the product: ${(e as Error).message}`);
      } finally {
        if (live) setBusy(null);
      }
    })();
    return () => { live = false; };
  }, [stageReady, productKey, flash]);

  // Set.
  useEffect(() => {
    const stage = stageRef.current, p = projectRef.current;
    if (!stage || !p) return;
    stage.applyScene(getMerchScene(p.setup.sceneId), p.setup);
  }, [stageReady, project?.setup.sceneId, project?.setup.props]);

  // Lights.
  useEffect(() => {
    const stage = stageRef.current, p = projectRef.current;
    if (stage && p) stage.updateLighting(p.setup);
  }, [project?.setup.lightScale, project?.setup.keyYaw, project?.setup.exposure]);

  // Camera presets / fov (orbiting writes the camera back without re-applying it).
  useEffect(() => {
    const stage = stageRef.current, p = projectRef.current;
    if (stage && p) stage.applyCamera(p.setup.camera);
  }, [cameraNonce, stageReady]);

  useEffect(() => { stageRef.current?.setProductColor(project?.productColor ?? '#ffffff'); }, [project?.productColor]);

  // Artwork → textures.
  const designsKey = project ? JSON.stringify([project.designs, project.product.kind === 'model' ? project.product.decal : null]) : '';
  useEffect(() => {
    const stage = stageRef.current, p = projectRef.current;
    if (!stage || !p) return;
    let live = true;
    (async () => {
      const areas = p.product.kind === 'template' ? getProductTemplate(p.product.templateId).printAreas : [DECAL_AREA];
      for (const a of areas) {
        const existing = areaCanvases.current.get(a.id);
        const canvas = await renderPrintArea(a, p.designs[a.id], p.assets, 1024, existing);
        if (!live) return;
        if (p.product.kind === 'template') {
          stage.setPrintCanvas(a.id, canvas);
        } else if (existing && stageDecalKey.current === JSON.stringify(p.product.decal)) {
          stage.refreshDecal();
        } else {
          stage.setDecal(p.product.decal, canvas);
          stageDecalKey.current = JSON.stringify(p.product.decal);
        }
        areaCanvases.current.set(a.id, canvas);
      }
    })();
    return () => { live = false; };
  }, [designsKey, designsTick]);

  // ── Product actions ────────────────────────────────────────────────────────

  const chooseTemplate = (id: string) => {
    const t = getProductTemplate(id);
    update((p) => ({ ...p, product: { kind: 'template', templateId: t.id }, productColor: t.defaultColor, title: p.title.startsWith('Untitled') ? `Untitled ${t.name}` : p.title }));
    setActiveArea(t.printAreas[0].id);
    setSelectedLayer(null);
  };

  const adoptModelBlob = async (blob: Blob, name: string, source: 'import' | 'sculpt') => {
    const asset = await putMerchAsset(blob, name);
    stageDecalKey.current = '';
    update((p) => ({
      ...p,
      assets: { ...p.assets, [asset.id]: asset },
      product: { kind: 'model', assetId: asset.id, name, source },
      productColor: source === 'sculpt' ? '#d9d4cc' : p.productColor,
      title: p.title.startsWith('Untitled') ? `Untitled ${name.replace(/\.\w+$/, '')}` : p.title,
    }));
    setActiveArea('decal');
    flash('ok', source === 'sculpt' ? 'Sculpt is now the product — place your print on it in Design.' : `Imported ${name}. Place your print on it in Design.`);
  };

  const importModel = async (file: File) => {
    if (/\.gltf$/i.test(file.name)) flash('warn', 'A .gltf with separate .bin/texture files can\'t load from one file — export as .glb if it fails.');
    await adoptModelBlob(file, file.name, 'import');
  };

  // ── Design actions ─────────────────────────────────────────────────────────

  const setLayers = (fn: (ls: MerchArtLayer[]) => MerchArtLayer[]) =>
    update((p) => ({ ...p, designs: { ...p.designs, [area.id]: fn(p.designs[area.id] ?? []) } }));
  const patchLayer = (id: string, patch: Partial<MerchArtLayer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addImage = async (file: File) => {
    const asset = await putMerchAsset(file, file.name);
    const l: MerchArtLayer = { id: newMerchId('ml'), kind: 'image', src: assetRef(asset.id), x: 0.5, y: 0.45, scale: 0.72, rotation: 0, opacity: 1 };
    update((p) => ({ ...p, assets: { ...p.assets, [asset.id]: asset }, designs: { ...p.designs, [area.id]: [...(p.designs[area.id] ?? []), l] } }));
    setSelectedLayer(l.id);
  };

  const addText = () => {
    const dark = project ? luminance(project.productColor) < 0.45 : false;
    const l: MerchArtLayer = { id: newMerchId('ml'), kind: 'text', text: 'YOUR BRAND', font: MERCH_FONTS[1].id, weight: 800, color: dark ? '#ffffff' : '#111111', x: 0.5, y: 0.3, scale: 0.8, rotation: 0, opacity: 1 };
    setLayers((ls) => [...ls, l]);
    setSelectedLayer(l.id);
  };

  const moveLayer = (id: string, dir: -1 | 1) => setLayers((ls) => {
    const i = ls.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ls.length) return ls;
    const next = [...ls];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const downloadPrintFile = async () => {
    if (!project) return;
    setBusy('Exporting print file…');
    try {
      const blob = await exportPrintFile(area, project.designs[area.id], project.assets);
      downloadBlob(blob, `${safeName(project.title)}-${area.id}-print.png`);
    } finally {
      setBusy(null);
    }
  };

  // Click-to-place the print on a model product.
  const onViewportClick = (e: React.MouseEvent) => {
    if (!placingDecal || !stageRef.current || project?.product.kind !== 'model') return;
    const hit = stageRef.current.pick(e.clientX, e.clientY);
    if (!hit) { flash('warn', 'Click on the model itself.'); return; }
    const prev = project.product.decal;
    update((p) => (p.product.kind === 'model' ? { ...p, product: { ...p.product, decal: { ...hit, size: prev?.size ?? 0.45, rotation: prev?.rotation ?? 0 } } } : p));
    setPlacingDecal(false);
  };

  // ── Shooting ───────────────────────────────────────────────────────────────

  const addShot = async (dataUrl: string, meta: Omit<MerchShot, 'id' | 'assetId' | 'createdAt'>) => {
    const blob = await dataUrlToBlob(dataUrl);
    const asset = await putMerchAsset(blob, `shot-${Date.now()}.png`);
    const shot: MerchShot = { ...meta, id: newMerchId('shot'), assetId: asset.id, createdAt: Date.now() };
    update((p) => ({ ...p, assets: { ...p.assets, [asset.id]: asset }, shots: [shot, ...p.shots], coverShotId: p.coverShotId ?? shot.id }));
    setViewShot(shot.id);
  };

  const renderShot = async () => {
    const stage = stageRef.current;
    if (!stage || !project) return;
    setBusy('Rendering…');
    try {
      const size = shotSize(project.setup.aspect, SHOT_LONG_SIDE.render);
      const cap = stage.capture(size.width, size.height);
      await addShot(cap.beauty, { kind: 'render', sceneId: scene.id, aspect: project.setup.aspect, width: cap.width, height: cap.height });
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    const stage = stageRef.current;
    if (!stage || !project) return;
    setBusy('Generating on local GPU…');
    try {
      const size = shotSize(project.setup.aspect, SHOT_LONG_SIDE.generate);
      const cap = stage.capture(size.width, size.height);
      const noun = template?.noun ?? `a ${project.product.kind === 'model' ? project.product.name.replace(/\.\w+$/, '') : 'product'}`;
      const prompt = merchShotPrompt(scene, noun, promptExtra);
      const res = await generateShot({ capture: cap, prompt, negativePrompt: scene.prompt.negative, strength: strength ?? scene.genStrength });
      await addShot(res.dataUrl, { kind: 'generated', sceneId: scene.id, aspect: project.setup.aspect, width: cap.width, height: cap.height, prompt, engine: res.engine, seed: res.seed });
      flash('ok', `Generated with ${res.engine} in ${(res.ms / 1000).toFixed(1)}s.`);
    } catch (e) {
      refreshEngine();
      flash('err', `Generation failed: ${(e as Error).message}. Your 3D render still works — use Render shot.`);
    } finally {
      setBusy(null);
    }
  };

  const deleteShot = (id: string) => {
    update((p) => ({ ...p, shots: p.shots.filter((s) => s.id !== id), coverShotId: p.coverShotId === id ? p.shots.find((s) => s.id !== id)?.id : p.coverShotId }));
    setViewShot(null);
  };

  const downloadShot = async (shot: MerchShot) => {
    const blob = await getMerchAssetBlob(shot.assetId);
    if (blob && project) downloadBlob(blob, `${safeName(project.title)}-${shot.kind}-${shot.id.slice(-5)}.png`);
  };

  const openProjects = async () => {
    setProjectsOpen((o) => !o);
    setProjects(await listMerchProjects().catch(() => []));
  };

  const switchProject = async (id: string | null) => {
    setProjectsOpen(false);
    if (project) await saveMerchProject(project).catch(() => {});
    const next = id ? await loadMerchProject(id) : createMerchProject();
    if (!next) { flash('err', 'That project could not be opened.'); return; }
    loadedOnce.current = false;
    areaCanvases.current.clear();
    stageDecalKey.current = '';
    setSelectedLayer(null);
    setViewShot(null);
    setActiveArea(next.product.kind === 'template' ? getProductTemplate(next.product.templateId).printAreas[0].id : 'decal');
    setProject(next);
    setCameraNonce((n) => n + 1);
  };

  if (!project) {
    return <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#0b0a0f] text-white/60"><Loader2 className="animate-spin" /></div>;
  }

  const shownShot = project.shots.find((s) => s.id === viewShot) ?? null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b0a0f] text-white font-sans" data-testid="merch-designer">
      {/* ── Top bar ── */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-3 border-b border-white/[0.07] bg-[#0e0d13]">
        <button onClick={onClose} className="grid place-items-center w-9 h-9 rounded-[10px] text-white/70 hover:text-white hover:bg-white/[0.07]" title="Back to Tela"><ArrowLeft size={17} /></button>
        <div className="flex items-center gap-2">
          <div className="grid place-items-center w-8 h-8 rounded-[9px]" style={{ background: 'linear-gradient(135deg,#ff5a8a,#ff9a3c)' }}><Shirt size={16} /></div>
          <div className="leading-tight">
            <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/45">TELA · MERCH DESIGNER</div>
            <input value={project.title} onChange={(e) => update((p) => ({ ...p, title: e.target.value }))} className="bg-transparent text-[14px] font-bold outline-none w-[260px] focus:bg-white/[0.05] rounded px-1 -ml-1" />
          </div>
        </div>
        <div className="relative">
          <button onClick={() => void openProjects()} className={btn}>Projects <ChevronDown size={13} /></button>
          {projectsOpen && (
            <div className="absolute left-0 top-10 z-20 w-[300px] max-h-[360px] overflow-auto rounded-[12px] border border-white/10 bg-[#15131b] shadow-2xl p-1.5">
              <button onClick={() => void switchProject(null)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-[12.5px] font-semibold hover:bg-white/[0.07]"><Plus size={14} /> New merch project</button>
              {projects.map((s) => (
                <button key={s.id} onClick={() => void switchProject(s.id)} className={`w-full text-left px-2.5 py-2 rounded-[8px] hover:bg-white/[0.07] ${s.id === project.id ? 'bg-white/[0.06]' : ''}`}>
                  <div className="text-[12.5px] font-semibold truncate">{s.title}</div>
                  <div className="text-[10.5px] text-white/45">{s.productLabel || 'Cloud copy'} · {s.shotCount} shots · {new Date(s.updatedAt).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[11px] text-white/40 font-mono">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Editing…'}</span>
        <div className="ml-auto flex items-center gap-2">
          {engine && (
            <button onClick={refreshEngine} title={engine.detail} className={`hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[11px] font-semibold border ${engine.online ? 'border-emerald-400/30 text-emerald-300 bg-emerald-400/[0.07]' : 'border-white/10 text-white/45 bg-white/[0.03]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${engine.online ? 'bg-emerald-400' : 'bg-white/30'}`} />{engine.online ? 'GPU ready' : 'GPU offline'}
            </button>
          )}
          <button onClick={() => setPublishOpen(true)} disabled={!project.shots.length} className={btnPrimary} style={{ background: 'linear-gradient(135deg,#ff5a8a,#ff9a3c)' }}>
            <ShoppingBag size={15} /> List in shop
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* ── Tabs rail ── */}
        <nav className="w-[64px] shrink-0 flex flex-col items-center gap-1 py-3 border-r border-white/[0.07] bg-[#0e0d13]">
          {([['product', Box, 'Product'], ['design', Palette, 'Design'], ['scene', Sun, 'Scene'], ['shoot', Camera, 'Shoot']] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`w-[52px] py-2 rounded-[10px] flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${tab === id ? 'bg-white/[0.1] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.05]'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>

        {/* ── Inspector ── */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-white/[0.07] bg-[#100f15] p-4 custom-scrollbar">
          {tab === 'product' && (
            <>
              <div className={panelTitle}>Templates</div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {MERCH_PRODUCT_TEMPLATES.map((t) => {
                  const on = project.product.kind === 'template' && project.product.templateId === t.id;
                  return (
                    <button key={t.id} onClick={() => chooseTemplate(t.id)} className={`text-left p-2.5 rounded-[11px] border transition-colors ${on ? 'border-[#ff5a8a] bg-[#ff5a8a]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
                      <div className="text-[12.5px] font-bold">{t.name}</div>
                      <div className="text-[10.5px] text-white/45 leading-snug mt-0.5">{t.blurb}</div>
                    </button>
                  );
                })}
              </div>
              <div className={panelTitle}>Your own 3D</div>
              <label className={`${btn} w-full mb-2 cursor-pointer`}>
                <Upload size={14} /> Import model (GLB, OBJ, STL, FBX)
                <input type="file" accept=".glb,.gltf,.obj,.stl,.fbx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importModel(f); e.target.value = ''; }} />
              </label>
              <button onClick={() => setSculptOpen(true)} className={`${btn} w-full mb-2`}><Move3d size={14} /> Sculpt a product</button>
              {project.product.kind === 'model' && (
                <div className="text-[11px] text-white/55 mb-4 px-1">Current: <b className="text-white/85">{project.product.name}</b> ({project.product.source === 'sculpt' ? 'sculpted' : 'imported'})</div>
              )}
              <div className={`${panelTitle} mt-4`}>Colour</div>
              <div className="flex flex-wrap gap-2 items-center">
                {(template?.colors ?? ['#d9d4cc', '#f5f5f5', '#1a1a1c', '#c94f3d', '#2c3e57', '#d8b46a']).map((c) => (
                  <button key={c} onClick={() => update((p) => ({ ...p, productColor: c }))} className={`w-8 h-8 rounded-full border-2 ${project.productColor === c ? 'border-[#ff5a8a] scale-110' : 'border-white/15'} transition-transform`} style={{ background: c }} title={c} />
                ))}
                <input type="color" value={project.productColor} onChange={(e) => update((p) => ({ ...p, productColor: e.target.value }))} className="w-8 h-8 rounded-full bg-transparent cursor-pointer" title="Custom colour" />
              </div>
            </>
          )}

          {tab === 'design' && (
            <>
              <div className={panelTitle}>Print area</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {printAreas.map((a) => <button key={a.id} onClick={() => { setActiveArea(a.id); setSelectedLayer(null); }} className={chip(a.id === area.id)}>{a.label}</button>)}
              </div>
              <DesignPreview area={area} canvasKey={designsKey} canvases={areaCanvases.current} layer={layer} onMove={(x, y) => layer && patchLayer(layer.id, { x, y })} productColor={project.productColor} />
              {project.product.kind === 'model' && (
                <div className="mt-3 p-2.5 rounded-[10px] border border-white/10 bg-white/[0.03]">
                  <button onClick={() => setPlacingDecal((v) => !v)} className={`${btn} w-full ${placingDecal ? '!bg-[#ff5a8a] !text-white' : ''}`}><Move3d size={14} />{placingDecal ? 'Click the model to place…' : project.product.decal ? 'Move print on model' : 'Place print on model'}</button>
                  {project.product.decal && (
                    <div className="mt-2.5">
                      <Slider label="Print size" value={project.product.decal.size} min={0.08} max={1.2} step={0.01} onChange={(v) => update((p) => (p.product.kind === 'model' && p.product.decal ? { ...p, product: { ...p.product, decal: { ...p.product.decal, size: v } } } : p))} />
                      <Slider label="Print rotation" value={project.product.decal.rotation} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(v) => update((p) => (p.product.kind === 'model' && p.product.decal ? { ...p, product: { ...p.product, decal: { ...p.product.decal, rotation: v } } } : p))} />
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <label className={`${btn} flex-1 cursor-pointer`}>
                  <ImageIcon size={14} /> Artwork
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
                </label>
                <button onClick={addText} className={`${btn} flex-1`}><Type size={14} /> Text</button>
              </div>
              <div className={`${panelTitle} mt-4 flex items-center gap-1.5`}><Layers size={11} /> Layers</div>
              {!layers.length && <div className="text-[11.5px] text-white/40 mb-2">Add artwork or text to this print area.</div>}
              <div className="flex flex-col gap-1 mb-3">
                {[...layers].reverse().map((l) => (
                  <button key={l.id} onClick={() => setSelectedLayer(l.id)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12px] text-left ${l.id === selectedLayer ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'}`}>
                    {l.kind === 'image' ? <ImageIcon size={13} className="text-white/50" /> : <Type size={13} className="text-white/50" />}
                    <span className="truncate flex-1">{l.kind === 'text' ? l.text : 'Artwork'}</span>
                  </button>
                ))}
              </div>
              {layer && (
                <div className="p-2.5 rounded-[10px] border border-white/10 bg-white/[0.03]">
                  {layer.kind === 'text' && (
                    <>
                      <textarea value={layer.text} onChange={(e) => patchLayer(layer.id, { text: e.target.value })} rows={2} className="w-full mb-2 px-2 py-1.5 rounded-[8px] bg-black/30 border border-white/10 text-[13px] outline-none" />
                      <div className="flex gap-2 mb-2">
                        <select value={layer.font} onChange={(e) => patchLayer(layer.id, { font: e.target.value })} className="flex-1 h-8 px-2 rounded-[8px] bg-black/30 border border-white/10 text-[12px]">
                          {MERCH_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                        <select value={layer.weight} onChange={(e) => patchLayer(layer.id, { weight: Number(e.target.value) })} className="w-20 h-8 px-2 rounded-[8px] bg-black/30 border border-white/10 text-[12px]">
                          {[400, 600, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <input type="color" value={layer.color} onChange={(e) => patchLayer(layer.id, { color: e.target.value })} className="w-8 h-8 bg-transparent" />
                      </div>
                    </>
                  )}
                  <Slider label="Size" value={layer.scale} min={0.05} max={1.4} step={0.01} onChange={(v) => patchLayer(layer.id, { scale: v })} />
                  <Slider label="Horizontal" value={layer.x} min={0} max={1} step={0.005} onChange={(v) => patchLayer(layer.id, { x: v })} />
                  <Slider label="Vertical" value={layer.y} min={0} max={1} step={0.005} onChange={(v) => patchLayer(layer.id, { y: v })} />
                  <Slider label="Rotation" value={layer.rotation} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(v) => patchLayer(layer.id, { rotation: v })} />
                  <Slider label="Opacity" value={layer.opacity} min={0.05} max={1} step={0.01} onChange={(v) => patchLayer(layer.id, { opacity: v })} />
                  <div className="flex gap-1.5">
                    <button onClick={() => moveLayer(layer.id, 1)} className={`${btn} flex-1`}>Forward</button>
                    <button onClick={() => moveLayer(layer.id, -1)} className={`${btn} flex-1`}>Back</button>
                    <button onClick={() => { setLayers((ls) => ls.filter((l) => l.id !== layer.id)); setSelectedLayer(null); }} className={btn} title="Delete layer"><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
              <button onClick={() => void downloadPrintFile()} disabled={!layers.length} className={`${btn} w-full mt-4`}><Download size={14} /> Print file ({area.printInches[0]}×{area.printInches[1]} in, 300 dpi)</button>
            </>
          )}

          {tab === 'scene' && (
            <>
              <div className={panelTitle}>Photo sets</div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {MERCH_SCENES.map((s) => (
                  <button key={s.id} onClick={() => { updateSetup({ sceneId: s.id, camera: { ...s.camera }, exposure: s.exposure, lightScale: 1, keyYaw: 0 }); setStrength(null); setCameraNonce((n) => n + 1); }} className={`text-left rounded-[11px] overflow-hidden border transition-colors ${project.setup.sceneId === s.id ? 'border-[#ff5a8a]' : 'border-white/10 hover:border-white/30'}`} data-scene={s.id}>
                    <div className="h-12" style={{ background: `linear-gradient(135deg, ${s.swatch[0]}, ${s.swatch[1]})` }} />
                    <div className="p-2">
                      <div className="text-[12px] font-bold">{s.name}</div>
                      <div className="text-[10px] text-white/45 leading-snug">{s.mood}</div>
                    </div>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12px] text-white/75 mb-3 cursor-pointer">
                <input type="checkbox" checked={project.setup.props} onChange={(e) => updateSetup({ props: e.target.checked })} className="accent-[#ff5a8a]" /> Set props
              </label>
              <div className={panelTitle}>Light</div>
              <Slider label="Intensity" value={project.setup.lightScale} min={0.3} max={2} step={0.01} onChange={(v) => updateSetup({ lightScale: v })} />
              <Slider label="Key light angle" value={project.setup.keyYaw} min={-120} max={120} step={1} format={(v) => `${v}°`} onChange={(v) => updateSetup({ keyYaw: v })} />
              <Slider label="Exposure" value={project.setup.exposure} min={0.5} max={1.8} step={0.01} onChange={(v) => updateSetup({ exposure: v })} />
              <div className={`${panelTitle} mt-3`}>Camera</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CAMERA_PRESETS.map((c) => <button key={c.id} onClick={() => { updateSetup({ camera: { ...c.cam, fov: project.setup.camera.fov } }); setCameraNonce((n) => n + 1); }} className={chip(false)}>{c.label}</button>)}
              </div>
              <Slider label="Lens (field of view)" value={project.setup.camera.fov} min={18} max={60} step={1} format={(v) => `${v}°`} onChange={(v) => { updateSetup({ camera: { ...project.setup.camera, fov: v } }); setCameraNonce((n) => n + 1); }} />
              <div className={`${panelTitle} mt-3`}>Frame</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(MERCH_ASPECTS) as MerchAspect[]).map((a) => <button key={a} onClick={() => updateSetup({ aspect: a })} className={chip(project.setup.aspect === a)}>{a}</button>)}
              </div>
              <div className="text-[10.5px] text-white/35 mt-3">Drag the viewport to orbit, scroll to zoom.</div>
            </>
          )}

          {tab === 'shoot' && (
            <>
              <div className={panelTitle}>3D render</div>
              <p className="text-[11.5px] text-white/50 mb-2">The stage exactly as you see it, at {shotSize(project.setup.aspect, SHOT_LONG_SIDE.render).width}×{shotSize(project.setup.aspect, SHOT_LONG_SIDE.render).height}.</p>
              <button onClick={() => void renderShot()} disabled={!!busy} className={`${btnPrimary} w-full mb-5 bg-white/[0.12] border border-white/15`}><Camera size={15} /> Render shot</button>

              <div className={panelTitle}>Generated photo</div>
              <p className="text-[11.5px] text-white/50 mb-2">The 3D render is the reference: set, light and camera carry over, the set is re-imagined as a real photo, and your product's pixels are kept exactly.</p>
              <div className={`flex items-center gap-2 text-[11px] mb-2 ${engine?.online ? 'text-emerald-300' : 'text-amber-300/80'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${engine?.online ? 'bg-emerald-400' : 'bg-amber-400'}`} />{engine?.detail ?? 'Checking local GPU…'}
                <button onClick={refreshEngine} className="ml-auto text-white/50 hover:text-white" title="Check again"><RefreshCw size={12} /></button>
              </div>
              <div className="text-[11px] text-white/45 mb-1">Set direction ({scene.name})</div>
              <div className="text-[10.5px] text-white/35 mb-2 leading-snug">{scene.prompt.style}</div>
              <textarea value={promptExtra} onChange={(e) => setPromptExtra(e.target.value)} rows={2} placeholder="Add details (e.g. 'eucalyptus sprigs, morning mist')" className="w-full mb-2 px-2 py-1.5 rounded-[8px] bg-black/30 border border-white/10 text-[12px] outline-none" />
              <Slider label="Freedom from the 3D render" value={strength ?? scene.genStrength} min={0.5} max={1} step={0.01} onChange={setStrength} />
              <button onClick={() => void generate()} disabled={!!busy || !engine?.online} className={`${btnPrimary} w-full`} style={{ background: 'linear-gradient(135deg,#ff5a8a,#a855f7)' }}><Sparkles size={15} /> Generate photo</button>
              {!engine?.online && <div className="text-[10.5px] text-white/40 mt-2">Start the Tela runtime (engines/tela-diffusion) or open Plajah's desktop app to generate. Rendered shots work without it.</div>}
            </>
          )}
        </aside>

        {/* ── Viewport + shots ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div ref={viewportHost} className="relative flex-1 min-h-0 grid place-items-center" style={{ background: 'radial-gradient(ellipse at center, #17151d 0%, #0b0a0f 70%)' }}>
            <div className="relative rounded-[6px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]" style={{ width: vw, height: vh, cursor: placingDecal ? 'crosshair' : 'grab' }} onClick={onViewportClick}>
              <div ref={viewportEl} className="absolute inset-0" />
              <div className="absolute left-2 top-2 px-2 py-0.5 rounded-[6px] bg-black/50 text-[10px] font-mono text-white/70 pointer-events-none">{scene.name} · {productLabel(project)} · {project.setup.aspect}</div>
            </div>
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-black/40 pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#16141c] border border-white/10 text-[13px]"><Loader2 size={15} className="animate-spin" />{busy}</div>
              </div>
            )}
            {notice && (
              <div className={`absolute top-3 left-1/2 -translate-x-1/2 max-w-[560px] px-4 py-2 rounded-[10px] text-[12.5px] border shadow-xl ${notice.tone === 'ok' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100' : notice.tone === 'warn' ? 'bg-amber-950/90 border-amber-500/30 text-amber-100' : 'bg-red-950/90 border-red-500/30 text-red-100'}`}>{notice.text}</div>
            )}
          </div>
          <div className="h-[112px] shrink-0 border-t border-white/[0.07] bg-[#0e0d13] flex items-center gap-2 px-3 overflow-x-auto custom-scrollbar">
            {!project.shots.length && <div className="text-[12px] text-white/35 px-2">Shots you render or generate land here.</div>}
            {project.shots.map((s) => <ShotThumb key={s.id} shot={s} project={project} active={s.id === viewShot} onClick={() => setViewShot(s.id)} />)}
          </div>
        </main>
      </div>

      {shownShot && (
        <ShotViewer
          shot={shownShot}
          project={project}
          onClose={() => setViewShot(null)}
          onDelete={() => deleteShot(shownShot.id)}
          onDownload={() => void downloadShot(shownShot)}
          onCover={() => update((p) => ({ ...p, coverShotId: shownShot.id }))}
        />
      )}

      {sculptOpen && <SculptModal onClose={() => setSculptOpen(false)} onUse={(blob) => { setSculptOpen(false); void adoptModelBlob(blob, 'sculpt.glb', 'sculpt'); }} />}

      {publishOpen && (
        <PublishModal
          project={project}
          suggestedPrice={template?.suggestedPrice ?? 25}
          category={template?.category ?? 'COLLECTIBLES'}
          onClose={() => setPublishOpen(false)}
          onPublished={(listing, uploaded) => {
            update((p) => ({ ...p, listing, shots: p.shots.map((s) => (uploaded[s.id] ? { ...s, remoteUrl: uploaded[s.id] } : s)) }));
            setPublishOpen(false);
            flash('ok', 'Listed in your shop.');
          }}
        />
      )}
    </div>
  );
}

function luminance(hex: string) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

// ── Flat design preview (drag the selected layer) ─────────────────────────────

function DesignPreview({ area, canvasKey, canvases, layer, onMove, productColor }: { area: MerchPrintArea; canvasKey: string; canvases: Map<string, HTMLCanvasElement>; layer: MerchArtLayer | null; onMove: (x: number, y: number) => void; productColor: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  useEffect(() => {
    // The stage's area canvas is redrawn asynchronously; copy it a beat later too.
    const draw = () => {
      const src = canvases.get(area.id);
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      c.width = 260;
      c.height = Math.round(260 / area.aspect);
      ctx.fillStyle = productColor;
      ctx.fillRect(0, 0, c.width, c.height);
      if (src) ctx.drawImage(src, 0, 0, c.width, c.height);
    };
    draw();
    const t = window.setTimeout(draw, 120);
    return () => window.clearTimeout(t);
  }, [area, canvasKey, canvases, productColor]);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !layer) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onMove(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  return (
    <div className="relative">
      <canvas
        ref={ref}
        className={`w-full rounded-[10px] border border-white/10 ${layer ? 'cursor-move' : ''}`}
        onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={move}
        onPointerUp={() => { drag.current = false; }}
      />
      <div className="absolute right-2 bottom-2 text-[9.5px] font-mono text-black/50 mix-blend-difference pointer-events-none">{area.printInches[0]}×{area.printInches[1]} in</div>
    </div>
  );
}

// ── Shot viewer ─────────────────────────────────────────────────────────────

function ShotViewer({ shot, project, onClose, onDelete, onDownload, onCover }: { shot: MerchShot; project: MerchProject; onClose: () => void; onDelete: () => void; onDownload: () => void; onCover: () => void }) {
  const url = useAssetUrl(assetRef(shot.assetId), project);
  return (
    <div className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div className="h-14 flex items-center gap-2 px-4" onClick={(e) => e.stopPropagation()}>
        <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-bold ${shot.kind === 'generated' ? 'bg-[#ff5a8a]' : 'bg-white/15'}`}>{shot.kind === 'generated' ? 'Generated' : '3D render'}</span>
        <span className="text-[12px] text-white/55">{getMerchScene(shot.sceneId).name} · {shot.width}×{shot.height}{shot.engine ? ` · ${shot.engine}` : ''}{shot.seed ? ` · seed ${shot.seed}` : ''}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={onCover} className={btn}><Star size={13} className={project.coverShotId === shot.id ? 'fill-amber-300 text-amber-300' : ''} /> Cover</button>
          <button onClick={onDownload} className={btn}><Download size={13} /> Download</button>
          <button onClick={onDelete} className={btn}><Trash2 size={13} /> Delete</button>
          <button onClick={onClose} className={btn}><X size={14} /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 grid place-items-center p-6">
        {url && <img src={url} alt="" className="object-contain rounded-[6px] shadow-2xl" style={{ maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 120px)' }} onClick={(e) => e.stopPropagation()} />}
      </div>
      {shot.prompt && <div className="px-6 pb-4 text-[11px] text-white/40 text-center" onClick={(e) => e.stopPropagation()}>{shot.prompt}</div>}
    </div>
  );
}

// ── Sculpt modal (Tela's clay sculptor, first used here) ─────────────────────

function SculptModal({ onClose, onUse }: { onClose: () => void; onUse: (glb: Blob) => void }) {
  const [brush, setBrush] = useState<SculptBrushType>('CLAY');
  const [radius, setRadius] = useState(0.25);
  const [intensity, setIntensity] = useState(0.5);
  const [symmetry, setSymmetry] = useState(true);
  const [matcap, setMatcap] = useState<MatCapPreset>('GREY_CLAY');
  const [paint, setPaint] = useState('#ff5a8a');
  const box = useMemo(() => ({ w: Math.min(860, window.innerWidth - 360), h: Math.min(620, window.innerHeight - 160) }), []);
  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm grid place-items-center">
      <div className="flex rounded-[14px] overflow-hidden border border-white/10 bg-[#121017] shadow-2xl">
        <div className="w-[240px] p-4 border-r border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold flex items-center gap-1.5"><Wand2 size={14} className="text-orange-400" /> Clay sculptor</div>
            <button onClick={onClose} className="text-white/50 hover:text-white"><X size={16} /></button>
          </div>
          <div className={panelTitle}>Brush</div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {BRUSHES.map((b) => <button key={b.id} onClick={() => setBrush(b.id)} className={chip(brush === b.id)}>{b.label}</button>)}
          </div>
          <Slider label="Radius" value={radius} min={0.05} max={0.8} step={0.01} onChange={setRadius} />
          <Slider label="Strength" value={intensity} min={0.05} max={1} step={0.01} onChange={setIntensity} />
          <label className="flex items-center gap-2 text-[12px] text-white/75 mb-3"><input type="checkbox" checked={symmetry} onChange={(e) => setSymmetry(e.target.checked)} className="accent-[#ff5a8a]" /> X symmetry</label>
          <div className={panelTitle}>Material</div>
          <select value={matcap} onChange={(e) => setMatcap(e.target.value as MatCapPreset)} className="w-full h-8 px-2 mb-3 rounded-[8px] bg-black/30 border border-white/10 text-[12px]">
            <option value="GREY_CLAY">Grey clay (shows paint)</option>
            <option value="RED_WAX">Red wax</option>
            <option value="PEARL">Pearl</option>
            <option value="CHROME">Chrome</option>
          </select>
          {brush === 'PAINT_3D' && (
            <label className="flex items-center gap-2 text-[12px] text-white/75 mb-3">Paint <input type="color" value={paint} onChange={(e) => setPaint(e.target.value)} className="w-8 h-7 bg-transparent" /></label>
          )}
          <p className="text-[10.5px] text-white/40 leading-snug">Shift = smooth · Alt = carve · drag off the clay to orbit · scroll to zoom. Save turns the sculpt into this project's product.</p>
        </div>
        <React.Suspense fallback={<div className="grid place-items-center" style={{ width: box.w, height: box.h }}><Loader2 className="animate-spin" /></div>}>
          <Tela3DCanvas width={box.w} height={box.h} brushType={brush} brushRadius={radius} brushIntensity={intensity} matcap={matcap} symmetryX={symmetry} paintColor={paint} onSaveMesh={onUse} saveLabel="Use as product" />
        </React.Suspense>
      </div>
    </div>
  );
}

// ── Publish to shop ──────────────────────────────────────────────────────────

function PublishModal({ project, suggestedPrice, category, onClose, onPublished }: {
  project: MerchProject;
  suggestedPrice: number;
  category: NonNullable<import('../../../types').StoreProduct['category']>;
  onClose: () => void;
  onPublished: (listing: NonNullable<MerchProject['listing']>, uploaded: Record<string, string>) => void;
}) {
  const [title, setTitle] = useState(project.listing?.title ?? project.title.replace(/^Untitled /, ''));
  const [price, setPrice] = useState(project.listing?.price ?? suggestedPrice);
  const [description, setDescription] = useState(project.listing?.description ?? '');
  const [stock, setStock] = useState(0);
  const [picked, setPicked] = useState<string[]>(() => {
    const cover = project.coverShotId ?? project.shots[0]?.id;
    return [cover, ...project.shots.map((s) => s.id).filter((id) => id !== cover)].filter(Boolean).slice(0, 4) as string[];
  });
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [error, setError] = useState('');

  const publish = async () => {
    setState('working');
    setError('');
    try {
      const { auth } = await import('../../../services/firebase');
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in to list products in your shop.');
      const { uploadTelaImage } = await import('../../../services/telaAssets');
      const { publishMerchProduct } = await import('../../../services/commerceBus');
      const uploaded: Record<string, string> = {};
      for (const id of picked) {
        const shot = project.shots.find((s) => s.id === id);
        if (!shot) continue;
        if (shot.remoteUrl) { uploaded[id] = shot.remoteUrl; continue; }
        const blob = await getMerchAssetBlob(shot.assetId);
        if (!blob) continue;
        const res = await uploadTelaImage(new File([blob], `merch-${shot.id}.png`, { type: 'image/png' }));
        if (res.sessionOnly) throw new Error('Upload needs a signed-in account.');
        uploaded[id] = res.src;
      }
      const images = picked.map((id) => uploaded[id]).filter(Boolean);
      const product = await publishMerchProduct(
        { title, description, price, images, category, stock, fulfillmentSource: 'manual' },
        { sellerId: user.uid, sellerName: user.displayName || '', sellerType: 'USER' },
      );
      onPublished({ title, description, price, productId: product.id, publishedAt: Date.now() }, uploaded);
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-[560px] max-w-full max-h-[92vh] overflow-auto rounded-[14px] border border-white/10 bg-[#141219] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-bold flex items-center gap-2"><ShoppingBag size={16} /> List in your shop</div>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X size={16} /></button>
        </div>
        <div className={panelTitle}>Photos ({picked.length})</div>
        <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
          {project.shots.map((s) => (
            <div key={s.id} className="relative shrink-0">
              <ShotThumb shot={s} project={project} active={picked.includes(s.id)} onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))} />
              {picked.includes(s.id) && <span className="absolute right-1 bottom-1 grid place-items-center w-5 h-5 rounded-full bg-[#ff5a8a] pointer-events-none"><Check size={12} /></span>}
            </div>
          ))}
        </div>
        <label className="block mb-3"><span className="text-[11.5px] text-white/55">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-[9px] bg-black/30 border border-white/10 text-[13px] outline-none" />
        </label>
        <div className="flex gap-3 mb-3">
          <label className="flex-1"><span className="text-[11.5px] text-white/55">Price (USD)</span>
            <input type="number" min={0} step={0.5} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-1 w-full h-9 px-3 rounded-[9px] bg-black/30 border border-white/10 text-[13px] outline-none" />
          </label>
          <label className="flex-1"><span className="text-[11.5px] text-white/55">Stock on hand</span>
            <input type="number" min={0} step={1} value={stock} onChange={(e) => setStock(Number(e.target.value))} className="mt-1 w-full h-9 px-3 rounded-[9px] bg-black/30 border border-white/10 text-[13px] outline-none" />
          </label>
        </div>
        <label className="block mb-3"><span className="text-[11.5px] text-white/55">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 rounded-[9px] bg-black/30 border border-white/10 text-[13px] outline-none" />
        </label>
        <p className="text-[11px] text-white/40 mb-4">Listed as a product you fulfil yourself. For print-on-demand (Printful/Gelato), download the print file from Design and use it in Merch Builder.</p>
        {project.listing?.productId && <p className="text-[11px] text-emerald-300/80 mb-3">Already listed once — publishing again creates a new listing.</p>}
        {state === 'error' && <p className="text-[12px] text-red-300 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btn}>Cancel</button>
          <button onClick={() => void publish()} disabled={state === 'working' || !picked.length || !title.trim()} className={btnPrimary} style={{ background: 'linear-gradient(135deg,#ff5a8a,#ff9a3c)' }}>
            {state === 'working' ? <><Loader2 size={14} className="animate-spin" /> Publishing…</> : <><ShoppingBag size={14} /> Publish listing</>}
          </button>
        </div>
      </div>
    </div>
  );
}

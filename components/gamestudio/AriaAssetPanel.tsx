// components/gamestudio/AriaAssetPanel.tsx
//
// Live Aria Asset Factory & Interactive 3D WebGPU/TSL Preview Panel inside GameStudioRoom.
// Connects ALL Phase 1–4 pipelines (Organics + Prop Classes, Real Plajah Vegetation,
// CAD/BIM Architecture-With-Interiors, NURBS Hard-Surface, Parlor 3D Stages, 2D Sprites)
// straight into undoable GameProject ops.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, PlusCircle, Box, Eye, Scissors, ImagePlus } from 'lucide-react';
import { AriaStudioAgent, type AriaProductionResult } from '../../services/gamestudio/ariaAgent';
import { produceFromReferenceImage } from '../../services/gamestudio/imageToAsset';
import type { Op } from '../../services/gamestudio/ops';
import type { QualityTier } from '../../playkit/core/engine';
import { STAGE_VISUAL_PRESETS } from '../../playkit/render/pipeline';
import { PlaykitLiveStage } from '../../playkit/render/threeBridge';

interface AriaAssetPanelProps {
  levelId: string;
  apply: (op: Op) => boolean;
}

const STARTER_PROMPTS = [
  { label: 'Fable Tavern (w/ Interior)', prompt: 'Fable dark-fantasy timber tavern with walkable interior hearth' },
  { label: 'Cyber Willow Tree', prompt: 'Bioluminescent willow tree in a cyber forest' },
  { label: 'Winged Archangel', prompt: 'Winged archangel guardian in rune armor with cloak' },
  { label: 'Kith Turbo Kart', prompt: 'Kith turbo racing kart vehicle with gold trim' },
  { label: 'Parlor 3D Stage', prompt: 'Parlor live broadcast stage for Brain Rush trivia' },
  { label: 'Firstlight QB', prompt: 'Firstlight athletic quarterback with helmet and football' },
];

export function AriaAssetPanel({ levelId, apply }: AriaAssetPanelProps) {
  const agent = useMemo(() => new AriaStudioAgent(), []);
  const [prompt, setPrompt] = useState(STARTER_PROMPTS[0].prompt);
  const [tier, setTier] = useState<QualityTier>('medium');
  const [stagePreset, setStagePreset] = useState<keyof typeof STAGE_VISUAL_PRESETS>('fable-void-sanctum');
  const [result, setResult] = useState<AriaProductionResult | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [showProbes, setShowProbes] = useState(true);
  const [cutaway, setCutaway] = useState(false);
  const [backend, setBackend] = useState<'webgpu' | 'webgl' | null>(null);
  const [placedCount, setPlacedCount] = useState(0);
  const [refImgName, setRefImgName] = useState<string | null>(null);

  const canvasHost = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<PlaykitLiveStage | null>(null);

  useEffect(() => {
    const el = canvasHost.current;
    if (!el) return;
    const stage = new PlaykitLiveStage(el);
    stageRef.current = stage;
    let alive = true;
    void stage.init(stagePreset).then((b) => {
      if (alive) setBackend(b);
    });
    return () => {
      alive = false;
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.applyStagePreset(stagePreset);
  }, [stagePreset]);

  useEffect(() => {
    if (result && stageRef.current) {
      stageRef.current.showAriaResult(result, { wireframe, showProbes, cutawayInterior: cutaway });
    }
  }, [result, wireframe, showProbes, cutaway]);

  const runBuild = (text = prompt) => {
    if (!text.trim()) return;
    setRefImgName(null);
    const res = agent.produce({
      prompt: text.trim(),
      targetTier: tier,
      targetLevelId: levelId,
      placeAt: [placedCount * 4, 0, -placedCount * 3],
    });
    setResult(res);
  };

  const handleImageFile = async (file: File) => {
    const bmp = await createImageBitmap(file);
    const w = Math.min(128, Math.max(16, bmp.width));
    const h = Math.min(128, Math.max(16, Math.round((bmp.height / Math.max(1, bmp.width)) * w)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bmp, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    bmp.close();

    setRefImgName(file.name);
    const out = produceFromReferenceImage(
      {
        filename: file.name,
        width: w,
        height: h,
        rgba: new Uint8Array(imgData.data.buffer),
        userPrompt: prompt.trim() || undefined,
        targetTier: tier,
        targetLevelId: levelId,
        placeAt: [placedCount * 4, 0, -placedCount * 3],
      },
      agent,
    );
    setResult(out.production);
  };

  const placeInLevel = () => {
    if (!result?.projectOp) return;
    if (apply(result.projectOp)) {
      setPlacedCount((c) => c + 1);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 p-2.5 text-[12px]" data-testid="gs-aria-panel">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-sky-400">
        <Sparkles size={13} /> Aria Asset Factory
        {backend && <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[9.5px] uppercase text-white/70">{backend}</span>}
      </div>

      <textarea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a building (with interior), tree, hero, vehicle, or parlor stage..."
        className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2 text-[12px] text-white outline-none focus:border-sky-400"
        data-testid="gs-aria-prompt"
      />

      <div className="flex flex-wrap gap-1">
        {STARTER_PROMPTS.map((s) => (
          <button
            key={s.label}
            onClick={() => { setPrompt(s.prompt); runBuild(s.prompt); }}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] text-white/80 hover:border-sky-400/60 hover:bg-sky-400/10"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-white/50">
          Target Tier
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as QualityTier)}
            className="h-7 rounded border border-white/10 bg-black/50 px-1.5 text-[11.5px] text-white outline-none"
          >
            <option value="low">Low (Mobile)</option>
            <option value="medium">Medium (iGPU)</option>
            <option value="high">High (Desktop)</option>
            <option value="ultra">Ultra (4K)</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-white/50">
          Stage Look
          <select
            value={stagePreset}
            onChange={(e) => setStagePreset(e.target.value as keyof typeof STAGE_VISUAL_PRESETS)}
            className="h-7 rounded border border-white/10 bg-black/50 px-1.5 text-[11.5px] text-white outline-none"
          >
            {Object.values(STAGE_VISUAL_PRESETS).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => runBuild()}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-amber-500 text-[12px] font-bold text-slate-950 hover:brightness-110"
          data-testid="gs-aria-build"
        >
          <Sparkles size={13} /> Build Prefab
        </button>
        <button
          onClick={() => imgInputRef.current?.click()}
          title="Drop or pick reference concept art (builds implied 3D geometry, never flat projection)"
          className="flex h-8 items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/25"
          data-testid="gs-aria-image-btn"
        >
          <ImagePlus size={13} /> From Art
        </button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImageFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {refImgName && (
        <div className="truncate text-[10.5px] text-amber-300">
          Reference art parsed &amp; delighted: <b>{refImgName}</b>
        </div>
      )}

      {/* Live 3D WebGPU / TSL Preview Stage */}
      <div className="relative h-44 w-full overflow-hidden rounded-lg border border-white/10 bg-[#05070e]">
        <div ref={canvasHost} className="h-full w-full" />
        {!result && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-white/40">
            Pick a starter or click Build to preview in 3D
          </div>
        )}
        {result && (
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button onClick={() => setWireframe((v) => !v)} title="Wireframe" className={`rounded p-1 ${wireframe ? 'bg-sky-500 text-black' : 'bg-black/60 text-white/70'}`}><Box size={12} /></button>
            <button onClick={() => setShowProbes((v) => !v)} title="GI Probes & Reflection Boxes" className={`rounded p-1 ${showProbes ? 'bg-amber-500 text-black' : 'bg-black/60 text-white/70'}`}><Eye size={12} /></button>
            {result.bim3d && (
              <button onClick={() => setCutaway((v) => !v)} title="Interior Cutaway" className={`rounded p-1 ${cutaway ? 'bg-emerald-500 text-black' : 'bg-black/60 text-white/70'}`}><Scissors size={12} /></button>
            )}
          </div>
        )}
      </div>

      {/* QA Gate & Prefab Summary */}
      {result && (
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <div className="flex items-center gap-1.5 font-bold">
            {result.qa.pass ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-amber-400" />}
            <span className="truncate">{result.manifest.name}</span>
            <span className="ml-auto rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] uppercase text-sky-300">{result.pipeline}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-[10.5px] text-white/70">
            <div>LOD0: <b className="text-white">{result.manifest.lods[0]?.triangleCount ?? 0}</b> tris</div>
            <div>LODs: <b className="text-white">{result.manifest.lods.length}</b></div>
            <div>Probes: <b className="text-white">{result.probes.length}</b></div>
          </div>
          {result.qa.notes.map((n, i) => (
            <div key={i} className="text-[11px] leading-snug text-white/60">{n}</div>
          ))}
          {result.projectOp && (
            <button
              onClick={placeInLevel}
              className="mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-500/20 text-[11.5px] font-bold text-emerald-200 hover:bg-emerald-500/30"
              data-testid="gs-aria-place"
            >
              <PlusCircle size={13} /> Place in Level (Undoable Op)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

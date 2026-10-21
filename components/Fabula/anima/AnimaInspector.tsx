// components/Fabula/anima/AnimaInspector.tsx — the right panel: Properties (every animatable
// value with its key toggle), Motion (presets, puppet, FX brush), Effects, and Aria.

import React, { useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Footprints, Hand, Loader2, Sparkles, Upload, Wand2, X } from 'lucide-react';
import type { AnimaChannel, AnimaLayer, AnimaProject, InterpolationEase } from '../../../services/anima/types';
import { ANIMA_PROPERTIES, isAnimated, keyAtFrame, valueAt, type AnimaAction } from '../../../services/anima/document';
import { frameToTime, timeToFrame } from '../../../services/anima/evaluator';
import { SmartMotionPresets, type MagicPresetKind, type MotionBrushKind } from '../../../services/anima/worldClassEngine';
import { AriaMotionAgent, type AriaMotionProposal, type CreativeMedium } from '../../../services/anima/ariaMotionAgent';
import { EFFECT_CHOICES, RIG_CHOICES, makeEffectLayer } from '../../../services/anima/templates';
import { storeAnimaMedia } from '../../../services/anima/projectStore';
import type { AnimaEffectKind } from '../../../services/anima/types';
import { useFrame, type FrameStore } from './frameStore';
import { KeyDiamond, ScrubNumber, btn, field, lbl } from './ui';
import type { AnimaTool } from './AnimaStage';

type Tab = 'properties' | 'motion' | 'effects' | 'aria';

export interface AnimaInspectorProps {
  project: AnimaProject;
  layer: AnimaLayer | null;
  frames: FrameStore;
  autoKey: boolean;
  dispatch: (a: AnimaAction, coalesceKey?: string) => void;
  onSelectLayer: (id: string) => void;
  tool: AnimaTool;
  setTool: (t: AnimaTool) => void;
  brushKind: MotionBrushKind;
  setBrushKind: (k: MotionBrushKind) => void;
  ink: { color: string; width: number };
  setInk: (ink: { color: string; width: number }) => void;
  cameraOn: boolean;
  onToggleCamera: () => void;
  onCapture: () => void;
  onNotice: (msg: string) => void;
}

const EASES: { id: InterpolationEase; name: string }[] = [
  { id: 'smooth', name: 'Smooth' },
  { id: 'linear', name: 'Linear' },
  { id: 'in', name: 'Ease in' },
  { id: 'out', name: 'Ease out' },
  { id: 'bezier', name: 'Curve (graph)' },
  { id: 'elastic', name: 'Elastic' },
  { id: 'bounce', name: 'Bounce' },
  { id: 'hold', name: 'Hold' },
];

const PRESETS: { id: MagicPresetKind; name: string; blurb: string }[] = [
  { id: 'auto_walk', name: 'Walk', blurb: 'Stride with hip bob and sway' },
  { id: 'idle_breathing', name: 'Idle breathe', blurb: 'Gentle chest rise and micro-wiggle' },
  { id: 'jelly_physics', name: 'Jelly wobble', blurb: 'Squash and stretch with inertia' },
  { id: 'ghibli_float', name: 'Float', blurb: 'Weightless drift and tilt' },
  { id: 'comic_impact_burst', name: 'Impact', blurb: 'Anticipation squat, then pop' },
];

const BRUSHES: { id: MotionBrushKind; name: string }[] = [
  { id: 'sparkle_stardust', name: 'Stardust' },
  { id: 'ghibli_leaves', name: 'Leaves' },
  { id: 'action_fire', name: 'Fire' },
  { id: 'manga_ink', name: 'Ink' },
];

function presetChannels(id: MagicPresetKind, seconds: number): Record<string, AnimaChannel<number>> {
  switch (id) {
    case 'auto_walk':
      return SmartMotionPresets.generateAutoWalk({ durationSeconds: seconds, intensity: 1 });
    case 'idle_breathing':
      return SmartMotionPresets.generateIdleBreathing({ durationSeconds: seconds, intensity: 1 });
    case 'jelly_physics':
      return SmartMotionPresets.generateJellyPhysics({ durationSeconds: Math.min(seconds, 2), intensity: 1 });
    case 'ghibli_float':
      return SmartMotionPresets.generateGhibliFloat({ durationSeconds: seconds, intensity: 1 });
    default:
      return SmartMotionPresets.generateComicImpactBurst();
  }
}

const TabButton: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    className={`h-8 rounded-[8px] text-[12px] font-semibold transition-colors ${on ? 'bg-white/10 text-white border border-white/15' : 'text-white/50 hover:text-white/85'}`}
  >
    {children}
  </button>
);

export const AnimaInspector: React.FC<AnimaInspectorProps> = (props) => {
  const [tab, setTab] = useState<Tab>('properties');
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="grid grid-cols-4 gap-1 p-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <TabButton on={tab === 'properties'} onClick={() => setTab('properties')}>Properties</TabButton>
        <TabButton on={tab === 'motion'} onClick={() => setTab('motion')}>Motion</TabButton>
        <TabButton on={tab === 'effects'} onClick={() => setTab('effects')}>Effects</TabButton>
        <TabButton on={tab === 'aria'} onClick={() => setTab('aria')}>Aria</TabButton>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-4">
        {tab === 'properties' && <PropertiesTab {...props} />}
        {tab === 'motion' && <MotionTab {...props} />}
        {tab === 'effects' && <EffectsTab {...props} />}
        {tab === 'aria' && <AriaTab {...props} />}
      </div>
    </div>
  );
};

const NeedsLayer: React.FC<{ what: string }> = ({ what }) => <div className="text-[12px] text-white/45">Select a layer to {what}.</div>;

// ── Properties ──────────────────────────────────────────────────────────────

const PropertiesTab: React.FC<AnimaInspectorProps> = ({ project, layer, frames, autoKey, dispatch, ink, setInk, cameraOn, onToggleCamera, onCapture, onNotice }) => {
  const frame = useFrame(frames);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  if (!layer) return <NeedsLayer what="see its properties" />;

  const keyTimes = (path: string) => (layer.channels[path]?.keyframes ?? []).map((k) => timeToFrame(k.t, project.fps));
  const jump = (path: string, dir: -1 | 1) => {
    const fs = keyTimes(path);
    const target = dir < 0 ? [...fs].reverse().find((f) => f < frame) : fs.find((f) => f > frame);
    if (target) frames.set(target);
  };

  const importPlate = async (file: File) => {
    setUploading(true);
    try {
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      const stored = await storeAnimaMedia(project.id, file, file.name);
      dispatch({ type: 'updateLayer', id: layer.id, patch: { plate: { kind, name: file.name, url: stored.url, ...(stored.storagePath ? { storagePath: stored.storagePath } : {}), ...(stored.sessionOnly ? { sessionOnly: true } : {}) }, name: layer.name === 'Plate' ? file.name.replace(/\.[^.]+$/, '') : layer.name } });
      if (stored.sessionOnly) onNotice('Signed out: this plate only lasts until you reload. Sign in to keep it.');
    } catch (err) {
      onNotice(err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={lbl}>{layer.type === 'cel' ? 'Drawing layer' : layer.type === 'character' ? 'Character' : layer.type === 'plate' ? 'Plate' : layer.type === 'effect' ? 'Effect' : 'Layer'}</span>
        <input
          key={layer.id}
          defaultValue={layer.name}
          className={`${field} font-semibold`}
          aria-label="Layer name"
          onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== layer.name && dispatch({ type: 'updateLayer', id: layer.id, patch: { name: e.currentTarget.value.trim() } })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>

      {layer.type === 'plate' && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-white/60 truncate">{layer.plate ? `${layer.plate.kind === 'video' ? 'Video' : 'Image'} · ${layer.plate.name}` : 'No media yet.'}</div>
          {layer.plate?.sessionOnly && <div className="text-[11px] text-amber-300/90">Only on this page until reload. Sign in to keep it.</div>}
          <button className={btn} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {layer.plate ? 'Replace media' : 'Import still or video'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importPlate(f);
            e.target.value = '';
          }} />
        </div>
      )}

      {layer.type === 'character' && (
        <label className="flex flex-col gap-1.5">
          <span className={lbl}>Rig</span>
          <select className={field} value={layer.rigId} onChange={(e) => dispatch({ type: 'updateLayer', id: layer.id, patch: { rigId: e.target.value as any } })}>
            {RIG_CHOICES.map((r) => <option key={r.id} value={r.id} style={{ background: '#17131d' }}>{r.name}</option>)}
          </select>
        </label>
      )}

      {layer.type === 'effect' && layer.effect && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <span className="text-[12px] text-white/70">Color</span>
            <input type="color" value={layer.effect.color || '#ffffff'} className="w-10 h-8 rounded bg-transparent" onChange={(e) => dispatch({ type: 'updateLayer', id: layer.id, patch: { effect: { ...layer.effect!, color: e.target.value } } }, `fx-color-${layer.id}`)} />
          </div>
          {layer.effect.kind !== 'balloon' && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-white/70">Intensity {(layer.effect.intensity ?? 1).toFixed(2)}×</span>
              <input type="range" min={0.25} max={3} step={0.05} value={layer.effect.intensity ?? 1} onChange={(e) => dispatch({ type: 'updateLayer', id: layer.id, patch: { effect: { ...layer.effect!, intensity: Number(e.target.value) } } }, `fx-int-${layer.id}`)} />
            </label>
          )}
          {layer.effect.kind === 'balloon' && (
            <input key={`${layer.id}-text`} defaultValue={layer.effect.text} className={field} aria-label="Balloon text" onBlur={(e) => dispatch({ type: 'updateLayer', id: layer.id, patch: { effect: { ...layer.effect!, text: e.currentTarget.value } } })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          )}
          <div className="text-[11px] text-white/35">Atmosphere runs live while playing.</div>
        </div>
      )}

      {(layer.type === 'cel' || layer.type === 'stop_motion') && (
        <div className="flex flex-col gap-2">
          <span className={lbl}>Drawing</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-white/70 mr-auto">Hold each drawing</span>
            {([1, 2, 3, 4] as const).map((r) => (
              <button key={r} onClick={() => dispatch({ type: 'setHold', layerId: layer.id, stepRate: r })} className={`h-7 w-9 rounded-md text-[11px] font-bold ${(layer.celTrack?.stepRate ?? 2) === r ? 'bg-[#6B0099] text-white' : 'bg-white/[0.05] text-white/60 hover:text-white'}`} title={`On ${r}s`}>
                {r}s
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-white/70 mr-auto">Ink</span>
            <input type="color" value={ink.color} onChange={(e) => setInk({ ...ink, color: e.target.value })} className="w-10 h-8 rounded bg-transparent" aria-label="Ink color" />
            <ScrubNumber className="w-20" value={ink.width} step={0.5} min={0.5} max={60} unit="px" ariaLabel="Ink width" onChange={(v) => setInk({ ...ink, width: v })} />
          </div>
          <div className="flex gap-1.5">
            <button className={`${btn} flex-1`} onClick={onToggleCamera}>
              <Camera size={13} /> {cameraOn ? 'Stop camera' : 'Stop-motion camera'}
            </button>
            {cameraOn && (
              <button className={btn} style={{ background: 'rgba(212,0,85,0.25)', borderColor: 'rgba(212,0,85,0.5)' }} onClick={onCapture}>
                Capture
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className={lbl}>Transform · frame {frame}</span>
          {autoKey && <span className="text-[10px] font-bold text-[#ff7fb0]">AUTO-KEY</span>}
        </div>
        {ANIMA_PROPERTIES.map((def) => {
          const value = valueAt(project, layer, def.path, frame);
          const animated = isAnimated(layer, def.path);
          const key = keyAtFrame(project, layer, def.path, frame);
          const fs = keyTimes(def.path);
          return (
            <div key={def.path} className="flex flex-col gap-1">
              <div className="grid grid-cols-[86px_1fr_auto_auto_auto] items-center gap-1">
                <span className={`text-[12px] truncate ${animated ? 'text-[#8ff5ff]' : 'text-white/70'}`}>{def.label}</span>
                <ScrubNumber
                  value={value}
                  step={def.step}
                  min={def.min}
                  max={def.max}
                  unit={def.unit}
                  ariaLabel={def.label}
                  onChange={(v, phase) =>
                    dispatch({ type: 'setValue', layerId: layer.id, path: def.path, frame, value: v, autoKey }, phase === 'drag' ? `scrub-${layer.id}-${def.path}` : undefined)
                  }
                />
                <button className="grid place-items-center w-6 h-6 rounded text-white/45 hover:text-white disabled:opacity-20" disabled={!fs.some((f) => f < frame)} onClick={() => jump(def.path, -1)} aria-label={`Previous ${def.label} key`} title="Previous key">
                  <ChevronLeft size={13} />
                </button>
                <KeyDiamond
                  state={key ? 'on' : animated ? 'animated' : 'none'}
                  title={key ? 'Remove key' : 'Add key at this frame'}
                  onClick={() => dispatch({ type: 'toggleKey', layerId: layer.id, path: def.path, frame })}
                />
                <button className="grid place-items-center w-6 h-6 rounded text-white/45 hover:text-white disabled:opacity-20" disabled={!fs.some((f) => f > frame)} onClick={() => jump(def.path, 1)} aria-label={`Next ${def.label} key`} title="Next key">
                  <ChevronRight size={13} />
                </button>
              </div>
              {key && (
                <div className="flex items-center gap-1.5 pl-[90px]">
                  <span className="text-[10px] text-white/40">Into next key</span>
                  <select className={`${field} h-7 flex-1 text-[11px]`} value={key.ease ?? 'linear'} onChange={(e) => dispatch({ type: 'setKeyEase', layerId: layer.id, path: def.path, keyId: key.id, ease: e.target.value as InterpolationEase })}>
                    {EASES.map((ea) => <option key={ea.id} value={ea.id} style={{ background: '#17131d' }}>{ea.name}</option>)}
                  </select>
                  <button className="grid place-items-center w-6 h-6 rounded text-white/40 hover:text-red-300" title="Remove all keys on this property" aria-label="Clear animation" onClick={() => dispatch({ type: 'clearChannel', layerId: layer.id, path: def.path })}>
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Pivot</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(['x', 'y'] as const).map((axis) => (
            <ScrubNumber
              key={axis}
              value={(layer.origin ?? { x: 0, y: 0 })[axis]}
              step={1}
              unit={axis}
              ariaLabel={`Pivot ${axis}`}
              onChange={(v, phase) => dispatch({ type: 'updateLayer', id: layer.id, patch: { origin: { ...(layer.origin ?? { x: 0, y: 0 }), [axis]: v } } }, phase === 'drag' ? `pivot-${layer.id}` : undefined)}
            />
          ))}
        </div>
        <div className="text-[11px] text-white/35">Rotation and scale turn around the pivot. Position is an offset from it.</div>
      </div>
    </>
  );
};

// ── Motion ──────────────────────────────────────────────────────────────────

const MotionTab: React.FC<AnimaInspectorProps> = ({ project, layer, frames, dispatch, tool, setTool, brushKind, setBrushKind, onNotice }) => {
  // Last frame's time, so preset motion ends on the final frame.
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={lbl}>Presets</span>
        {!layer && <NeedsLayer what="apply a preset" />}
        {layer &&
          PRESETS.map((p) => (
            <button
              key={p.id}
              className="text-left px-3 py-2 rounded-[10px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08]"
              onClick={() => {
                const start = frameToTime(frames.get(), project.fps);
                const remaining = Math.max(1 / project.fps, frameToTime(project.durationFrames, project.fps) - start);
                const channels = presetChannels(p.id, remaining);
                // Presets start at the playhead.
                for (const ch of Object.values(channels)) ch.keyframes = ch.keyframes.map((k) => ({ ...k, t: k.t + start }));
                dispatch({ type: 'mergeChannels', layerId: layer.id, channels });
                onNotice(`${p.name} applied to ${layer.name} from frame ${frames.get()}.`);
              }}
            >
              <div className="text-[12px] font-semibold text-white flex items-center gap-1.5"><Footprints size={12} className="text-[#00DAF3]" /> {p.name}</div>
              <div className="text-[11px] text-white/45">{p.blurb}</div>
            </button>
          ))}
        <div className="text-[11px] text-white/35">Presets replace the motion they touch on the selected layer. Undo with Ctrl+Z.</div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={lbl}>Puppet</span>
        <button
          className={btn}
          style={tool === 'puppet' ? { background: 'rgba(212,0,85,0.25)', borderColor: 'rgba(212,0,85,0.6)', color: '#fff' } : undefined}
          disabled={!layer}
          onClick={() => setTool(tool === 'puppet' ? 'select' : 'puppet')}
        >
          <Hand size={13} /> {tool === 'puppet' ? 'Puppet on: drag on the stage' : 'Record a puppet take'}
        </button>
        <div className="text-[11px] text-white/35">Drag on the stage to perform the selected layer's path. Playback runs while you drag; keys land from the playhead.</div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={lbl}>FX brush</span>
        <div className="grid grid-cols-2 gap-1.5">
          {BRUSHES.map((b) => (
            <button
              key={b.id}
              className={btn}
              style={tool === 'brush' && brushKind === b.id ? { background: 'rgba(0,218,243,0.18)', borderColor: 'rgba(0,218,243,0.5)', color: '#fff' } : undefined}
              onClick={() => {
                setBrushKind(b.id);
                setTool(tool === 'brush' && brushKind === b.id ? 'select' : 'brush');
              }}
            >
              <Sparkles size={12} /> {b.name}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-white/35">Paint particles live on the stage. Brush strokes aren't saved in the project yet.</div>
      </div>
    </>
  );
};

// ── Effects ─────────────────────────────────────────────────────────────────

const EffectsTab: React.FC<AnimaInspectorProps> = ({ dispatch, onSelectLayer, project, layer }) => (
  <div className="flex flex-col gap-2">
    <span className={lbl}>Add an effect layer</span>
    <div className="grid grid-cols-2 gap-1.5">
      {EFFECT_CHOICES.map((e) => (
        <button
          key={e.kind}
          className={`${btn} justify-start`}
          onClick={() => {
            const l = makeEffectLayer(e.kind);
            const index = layer ? Math.max(0, project.layers.findIndex((x) => x.id === layer.id)) : 0;
            dispatch({ type: 'addLayer', layer: l, index });
            onSelectLayer(l.id);
          }}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} /> {e.name}
        </button>
      ))}
    </div>
    <div className="text-[11px] text-white/35">Effects are layers: reorder them in Layers, and animate their position, scale and opacity like anything else.</div>
  </div>
);

// ── Aria ────────────────────────────────────────────────────────────────────

const IDEAS = ['Gentle breathing idle', 'Cinematic rain with a slow push-in', 'Fireflies drifting at night', 'Bouncy speech balloon: "Wait for me!"', 'Manga action speed lines'];

function effectFromProposal(p: AriaMotionProposal, prompt: string): AnimaEffectKind | null {
  const c = p.compositingLayer;
  if (!c) return null;
  if (c.kind === 'fluid') return 'smoke';
  if (c.kind === 'speed_lines') return 'speed_lines';
  if (c.kind === 'speech_balloon') return 'balloon';
  if (c.kind === 'hair') return 'hair';
  if (c.kind === 'particles') {
    const s = prompt.toLowerCase();
    return s.includes('rain') ? 'rain' : s.includes('snow') ? 'snow' : s.includes('firefl') ? 'fireflies' : 'sparkles';
  }
  return null;
}

const AriaTab: React.FC<AnimaInspectorProps> = ({ project, layer, dispatch, frames, onNotice }) => {
  const [prompt, setPrompt] = useState('');
  const [medium, setMedium] = useState<CreativeMedium>('living_canvas');
  const [proposal, setProposal] = useState<{ p: AriaMotionProposal; prompt: string } | null>(null);
  const seconds = frameToTime(project.durationFrames, project.fps);

  const propose = (text: string) => {
    if (!text.trim()) return;
    setProposal({ p: AriaMotionAgent.interpret(text, medium, seconds), prompt: text });
  };

  const apply = () => {
    if (!proposal) return;
    const { p } = proposal;
    const channels = Object.keys(p.channels ?? {}).length ? (p.channels as Record<string, AnimaChannel<number>>) : null;
    if (channels && layer) dispatch({ type: 'mergeChannels', layerId: layer.id, channels });
    const fxKind = effectFromProposal(p, proposal.prompt);
    if (fxKind) {
      const fx = makeEffectLayer(fxKind);
      if (fxKind === 'balloon' && p.compositingLayer?.config?.text) fx.effect = { ...fx.effect!, text: String(p.compositingLayer.config.text) };
      dispatch({ type: 'addLayer', layer: fx, index: 0 });
    }
    onNotice(`Applied: ${p.headline}`);
    setProposal(null);
    frames.set(frames.get());
  };

  const channelCount = proposal ? Object.keys(proposal.p.channels ?? {}).length : 0;
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={lbl}>Describe the motion</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. slow breathing idle with a gentle sway"
          className={`${field} h-auto py-2 resize-y`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) propose(prompt);
          }}
        />
        <div className="flex gap-1.5">
          <select className={`${field} flex-1`} value={medium} onChange={(e) => setMedium(e.target.value as CreativeMedium)} aria-label="Medium">
            <option value="living_canvas" style={{ background: '#17131d' }}>Living canvas</option>
            <option value="storybook" style={{ background: '#17131d' }}>Storybook</option>
            <option value="comic" style={{ background: '#17131d' }}>Comic</option>
            <option value="film_vfx" style={{ background: '#17131d' }}>Film</option>
          </select>
          <button className={btn} style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 'none' }} onClick={() => propose(prompt)}>
            <Wand2 size={13} /> Propose
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {IDEAS.map((i) => (
            <button key={i} className="px-2 py-1 rounded-full text-[11px] text-white/65 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08]" onClick={() => { setPrompt(i); propose(i); }}>
              {i}
            </button>
          ))}
        </div>
      </div>
      {proposal && (
        <div className="flex flex-col gap-2 p-3 rounded-[12px]" style={{ background: 'rgba(107,0,153,0.14)', border: '1px solid rgba(208,188,255,0.25)' }}>
          <div className="text-[13px] font-bold text-white">{proposal.p.headline}</div>
          {proposal.p.actionSummary && <div className="text-[12px] text-white/65">{proposal.p.actionSummary}</div>}
          <div className="text-[11px] text-white/50">
            {channelCount ? `${channelCount} motion channel${channelCount > 1 ? 's' : ''} for ${layer ? layer.name : 'the selected layer'}` : 'No layer motion'}
            {effectFromProposal(proposal.p, proposal.prompt) ? ` · adds a ${effectFromProposal(proposal.p, proposal.prompt)?.replace('_', ' ')} layer` : ''}
          </div>
          {channelCount > 0 && !layer && <div className="text-[11px] text-amber-300">Select a layer to receive the motion.</div>}
          <div className="flex gap-1.5">
            <button className={`${btn} flex-1`} style={{ background: 'rgba(0,218,243,0.18)', borderColor: 'rgba(0,218,243,0.5)', color: '#fff' }} onClick={apply} disabled={channelCount > 0 && !layer && !effectFromProposal(proposal.p, proposal.prompt)}>
              Apply
            </button>
            <button className={btn} onClick={() => setProposal(null)}>Dismiss</button>
          </div>
        </div>
      )}
    </>
  );
};

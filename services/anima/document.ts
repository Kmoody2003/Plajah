/**
 * services/anima/document.ts — the Anima project as an editable document.
 *
 * Every edit is an action through `applyAnimaAction`, which never mutates its input. The
 * history wrapper keeps undo/redo and merges rapid edits that share a coalesce key (dragging a
 * value, scrubbing a slider) into one undo step. Playhead and selection are UI state, not part
 * of the document, so moving the playhead never dirties or re-saves the project.
 */

import type { AnimaChannel, AnimaLayer, AnimaProject, BezierHandle, DrawingCel, DrawingStroke, InterpolationEase, Keyframe, OnionSkinConfig } from './types';
import { evaluateChannel, frameToTime } from './evaluator';

// ── Animatable properties shown in the inspector ────────────────────────────

export interface AnimaPropertyDef {
  path: string;
  label: string;
  unit?: string;
  step: number;
  min?: number;
  max?: number;
}

export const ANIMA_PROPERTIES: AnimaPropertyDef[] = [
  { path: 'transform.x', label: 'Position X', unit: 'px', step: 1 },
  { path: 'transform.y', label: 'Position Y', unit: 'px', step: 1 },
  { path: 'transform.rotationZ', label: 'Rotation', unit: '°', step: 0.5 },
  { path: 'transform.scaleX', label: 'Scale X', unit: '×', step: 0.01, min: -10, max: 10 },
  { path: 'transform.scaleY', label: 'Scale Y', unit: '×', step: 0.01, min: -10, max: 10 },
  { path: 'opacity', label: 'Opacity', step: 0.01, min: 0, max: 1 },
];

export function propertyDef(path: string): AnimaPropertyDef {
  return ANIMA_PROPERTIES.find((p) => p.path === path) ?? { path, label: path, step: 0.01 };
}

/** The layer's static value for a property (what a channel starts from). */
export function baseValue(layer: AnimaLayer, path: string): number {
  if (path === 'opacity') return layer.opacity;
  if (path.startsWith('transform.')) {
    const key = path.slice('transform.'.length) as keyof AnimaLayer['transform'];
    if (key in layer.transform) return layer.transform[key];
  }
  return layer.channels[path]?.defaultValue ?? 0;
}

/** The property's value at a frame (keys, expression and behavior applied). */
export function valueAt(project: AnimaProject, layer: AnimaLayer, path: string, frame: number): number {
  const ch = layer.channels[path];
  return ch ? evaluateChannel(ch, frameToTime(frame, project.fps), project.fps) : baseValue(layer, path);
}

/** The key on a channel at exactly this frame, if any. */
export function keyAtFrame(project: AnimaProject, layer: AnimaLayer, path: string, frame: number): Keyframe<number> | null {
  const t = frameToTime(frame, project.fps);
  return layer.channels[path]?.keyframes.find((k) => Math.abs(k.t - t) < 0.5 / project.fps) ?? null;
}

export function isAnimated(layer: AnimaLayer, path: string): boolean {
  return (layer.channels[path]?.keyframes.length ?? 0) > 0;
}

// ── Key references (timeline / graph selection, clipboard) ──────────────────

export interface KeyRef {
  layerId: string;
  path: string;
  keyId: string;
}

export const keyRefId = (r: KeyRef) => `${r.layerId}|${r.path}|${r.keyId}`;

/** A copied key, positioned relative to the earliest copied key. */
export interface ClipboardKey {
  layerId: string;
  path: string;
  offsetFrames: number;
  v: number;
  ease?: InterpolationEase;
  inHandle?: BezierHandle;
  outHandle?: BezierHandle;
}

export function copyKeys(p: AnimaProject, refs: KeyRef[]): ClipboardKey[] {
  const found: (ClipboardKey & { frame: number })[] = [];
  for (const r of refs) {
    const k = p.layers.find((l) => l.id === r.layerId)?.channels[r.path]?.keyframes.find((x) => x.id === r.keyId);
    if (!k) continue;
    const frame = Math.round(k.t * p.fps) + 1;
    found.push({ layerId: r.layerId, path: r.path, offsetFrames: 0, frame, v: k.v, ease: k.ease, inHandle: k.inHandle, outHandle: k.outHandle });
  }
  const first = Math.min(...found.map((f) => f.frame));
  return found.map(({ frame, ...k }) => ({ ...k, offsetFrames: frame - first }));
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type AnimaAction =
  | { type: 'replace'; project: AnimaProject }
  | { type: 'rename'; name: string }
  | { type: 'setTiming'; fps?: number; durationFrames?: number }
  | { type: 'addLayer'; layer: AnimaLayer; index?: number; drawings?: Record<string, DrawingCel> }
  | { type: 'updateLayer'; id: string; patch: Partial<Omit<AnimaLayer, 'id'>> }
  | { type: 'removeLayer'; id: string }
  | { type: 'moveLayer'; id: string; toIndex: number }
  | { type: 'duplicateLayer'; id: string; newId: string }
  /** Edit a property at a frame: keys it when the property is animated or autoKey is on, else sets the base value. */
  | { type: 'setValue'; layerId: string; path: string; frame: number; value: number; autoKey: boolean }
  | { type: 'toggleKey'; layerId: string; path: string; frame: number }
  | { type: 'setKeyEase'; layerId: string; path: string; keyId: string; ease: InterpolationEase }
  | { type: 'clearChannel'; layerId: string; path: string }
  /** Merge generated channels (presets, puppet takes, Aria) into a layer. */
  | { type: 'mergeChannels'; layerId: string; channels: Record<string, AnimaChannel<number>> }
  /** Add a stroke to the drawing shown at this frame, starting a new drawing there if there isn't one. */
  | { type: 'addStroke'; layerId: string; frame: number; stroke: DrawingStroke; newDrawingId: string }
  /** Expose a drawing (e.g. a stop-motion capture) on a cel layer from `frame` for `hold` frames. */
  | { type: 'exposeDrawing'; layerId: string; frame: number; hold: number; drawing: DrawingCel }
  | { type: 'setHold'; layerId: string; stepRate: 1 | 2 | 3 | 4 }
  /** Slide keys along the timeline by whole frames. A moved key replaces any unselected key it lands on. */
  | { type: 'moveKeys'; refs: KeyRef[]; deltaFrames: number }
  | { type: 'deleteKeys'; refs: KeyRef[] }
  /** Paste copied keys from `atFrame`. With `targetLayerId`, keys copied from one layer land on that layer. */
  | { type: 'pasteKeys'; keys: ClipboardKey[]; atFrame: number; targetLayerId?: string }
  /** Graph editor: change a key's time (seconds), value, handles or ease. */
  | { type: 'updateKey'; ref: KeyRef; patch: { t?: number; v?: number; inHandle?: BezierHandle; outHandle?: BezierHandle; ease?: InterpolationEase } }
  | { type: 'setOnionSkin'; patch: Partial<OnionSkinConfig> };

const newKeyId = () => `kf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function mapLayer(p: AnimaProject, id: string, fn: (l: AnimaLayer) => AnimaLayer): AnimaProject {
  return { ...p, layers: p.layers.map((l) => (l.id === id ? fn(l) : l)) };
}

function setBase(layer: AnimaLayer, path: string, value: number): AnimaLayer {
  if (path === 'opacity') return { ...layer, opacity: value };
  if (path.startsWith('transform.')) {
    const key = path.slice('transform.'.length);
    if (key in layer.transform) return { ...layer, transform: { ...layer.transform, [key]: value } };
  }
  const ch = layer.channels[path];
  return ch ? { ...layer, channels: { ...layer.channels, [path]: { ...ch, defaultValue: value } } } : layer;
}

function channelFor(layer: AnimaLayer, path: string): AnimaChannel<number> {
  return (
    layer.channels[path] ?? {
      id: `ch_${path.replace(/\W/g, '_')}`,
      name: propertyDef(path).label,
      path,
      targetProperty: path,
      defaultValue: baseValue(layer, path),
      keyframes: [],
    }
  );
}

function upsertKey(ch: AnimaChannel<number>, t: number, v: number, fps: number): AnimaChannel<number> {
  const tol = 0.5 / fps;
  const existing = ch.keyframes.find((k) => Math.abs(k.t - t) < tol);
  const keyframes = existing
    ? ch.keyframes.map((k) => (k === existing ? { ...k, v } : k))
    : [...ch.keyframes, { id: newKeyId(), t, v, ease: 'smooth' as InterpolationEase }].sort((a, b) => a.t - b.t);
  return { ...ch, keyframes };
}

function exposedDrawingId(layer: AnimaLayer, frame: number): string | null {
  for (const e of layer.celTrack?.exposures ?? []) {
    if (frame >= e.startFrame && frame < e.startFrame + e.durationFrames) return e.drawingId === '__EMPTY__' ? null : e.drawingId;
  }
  return null;
}

/** Puts a drawing on [frame, frame + hold), trimming whatever exposures it overlaps. */
function exposeAt(layer: AnimaLayer, frame: number, hold: number, drawingId: string): AnimaLayer {
  const end = frame + hold;
  const exposures = [];
  for (const e of layer.celTrack?.exposures ?? []) {
    const eEnd = e.startFrame + e.durationFrames;
    if (eEnd <= frame || e.startFrame >= end) {
      exposures.push(e);
      continue;
    }
    if (e.startFrame < frame) exposures.push({ ...e, durationFrames: frame - e.startFrame });
    if (eEnd > end) exposures.push({ ...e, startFrame: end, durationFrames: eEnd - end });
  }
  exposures.push({ startFrame: frame, durationFrames: hold, drawingId });
  exposures.sort((a, b) => a.startFrame - b.startFrame);
  const celTrack = layer.celTrack ?? { id: `cel_${layer.id}`, name: 'Exposures', layerId: layer.id, stepRate: 2 as const, exposures: [] };
  return { ...layer, celTrack: { ...celTrack, exposures } };
}

export function applyAnimaAction(p: AnimaProject, a: AnimaAction): AnimaProject {
  switch (a.type) {
    case 'replace':
      return a.project;
    case 'rename':
      return { ...p, name: a.name };
    case 'setTiming': {
      const fps = Math.max(1, Math.min(120, Math.round(a.fps ?? p.fps)));
      const durationFrames = Math.max(1, Math.min(fps * 600, Math.round(a.durationFrames ?? p.durationFrames)));
      return { ...p, fps, durationFrames };
    }
    case 'addLayer': {
      const layers = [...p.layers];
      layers.splice(a.index ?? 0, 0, a.layer);
      return { ...p, layers, drawingBank: a.drawings ? { ...p.drawingBank, ...a.drawings } : p.drawingBank };
    }
    case 'updateLayer':
      return mapLayer(p, a.id, (l) => ({ ...l, ...a.patch }));
    case 'removeLayer':
      return { ...p, layers: p.layers.filter((l) => l.id !== a.id) };
    case 'moveLayer': {
      const from = p.layers.findIndex((l) => l.id === a.id);
      if (from < 0) return p;
      const layers = [...p.layers];
      const [l] = layers.splice(from, 1);
      layers.splice(Math.max(0, Math.min(layers.length, a.toIndex)), 0, l);
      return { ...p, layers };
    }
    case 'duplicateLayer': {
      const i = p.layers.findIndex((l) => l.id === a.id);
      if (i < 0) return p;
      const copy: AnimaLayer = JSON.parse(JSON.stringify(p.layers[i]));
      copy.id = a.newId;
      copy.name = `${copy.name} copy`;
      if (copy.celTrack) copy.celTrack = { ...copy.celTrack, id: `cel_${a.newId}`, layerId: a.newId };
      const layers = [...p.layers];
      layers.splice(i, 0, copy);
      return { ...p, layers };
    }
    case 'setValue':
      return mapLayer(p, a.layerId, (l) => {
        if (!isAnimated(l, a.path) && !a.autoKey) return setBase(l, a.path, a.value);
        const ch = upsertKey(channelFor(l, a.path), frameToTime(a.frame, p.fps), a.value, p.fps);
        return { ...l, channels: { ...l.channels, [a.path]: ch } };
      });
    case 'toggleKey':
      return mapLayer(p, a.layerId, (l) => {
        const t = frameToTime(a.frame, p.fps);
        const ch = channelFor(l, a.path);
        const hit = ch.keyframes.find((k) => Math.abs(k.t - t) < 0.5 / p.fps);
        if (hit) {
          const keyframes = ch.keyframes.filter((k) => k !== hit);
          // Removing the last key leaves the property static at the value it had there.
          if (!keyframes.length) {
            const { [a.path]: _, ...rest } = l.channels;
            return setBase({ ...l, channels: rest }, a.path, hit.v);
          }
          return { ...l, channels: { ...l.channels, [a.path]: { ...ch, keyframes } } };
        }
        // New key records the value currently shown, not the base value.
        const v = valueAt(p, l, a.path, a.frame);
        return { ...l, channels: { ...l.channels, [a.path]: upsertKey(ch, t, v, p.fps) } };
      });
    case 'setKeyEase':
      return mapLayer(p, a.layerId, (l) => {
        const ch = l.channels[a.path];
        if (!ch) return l;
        return { ...l, channels: { ...l.channels, [a.path]: { ...ch, keyframes: ch.keyframes.map((k) => (k.id === a.keyId ? { ...k, ease: a.ease } : k)) } } };
      });
    case 'clearChannel':
      return mapLayer(p, a.layerId, (l) => {
        if (!l.channels[a.path]) return l;
        const v = valueAt(p, l, a.path, 1);
        const { [a.path]: _, ...rest } = l.channels;
        return setBase({ ...l, channels: rest }, a.path, v);
      });
    case 'mergeChannels':
      return mapLayer(p, a.layerId, (l) => ({ ...l, channels: { ...l.channels, ...a.channels } }));
    case 'addStroke': {
      const layer = p.layers.find((l) => l.id === a.layerId);
      if (!layer) return p;
      const shownId = exposedDrawingId(layer, a.frame);
      const shown = shownId ? p.drawingBank[shownId] : null;
      if (shown) {
        return { ...p, drawingBank: { ...p.drawingBank, [shown.id]: { ...shown, strokes: [...shown.strokes, a.stroke] } } };
      }
      const hold = layer.celTrack?.stepRate ?? 2;
      const drawing: DrawingCel = {
        id: a.newDrawingId,
        name: `Drawing ${Object.keys(p.drawingBank).length + 1}`,
        strokes: [a.stroke],
        width: p.width,
        height: p.height,
        createdAt: Date.now(),
      };
      return {
        ...mapLayer(p, a.layerId, (l) => exposeAt(l, a.frame, hold, drawing.id)),
        drawingBank: { ...p.drawingBank, [drawing.id]: drawing },
      };
    }
    case 'exposeDrawing':
      return {
        ...mapLayer(p, a.layerId, (l) => exposeAt(l, a.frame, Math.max(1, a.hold), a.drawing.id)),
        drawingBank: { ...p.drawingBank, [a.drawing.id]: a.drawing },
      };
    case 'moveKeys': {
      if (!a.deltaFrames || !a.refs.length) return p;
      const maxT = frameToTime(p.durationFrames, p.fps);
      const byChannel = new Map<string, Set<string>>();
      for (const r of a.refs) {
        const k = `${r.layerId}|${r.path}`;
        if (!byChannel.has(k)) byChannel.set(k, new Set());
        byChannel.get(k)!.add(r.keyId);
      }
      // Keep the selection's shape: clamp the shift so no selected key leaves the clip.
      let delta = a.deltaFrames;
      for (const [k, ids] of byChannel) {
        const [layerId, path] = k.split('|');
        for (const kf of p.layers.find((l) => l.id === layerId)?.channels[path]?.keyframes ?? []) {
          if (!ids.has(kf.id)) continue;
          const f = Math.round(kf.t * p.fps);
          delta = Math.max(delta, -f);
          delta = Math.min(delta, Math.round(maxT * p.fps) - f);
        }
      }
      if (!delta) return p;
      return {
        ...p,
        layers: p.layers.map((l) => {
          let channels = l.channels;
          for (const [path, ch] of Object.entries(l.channels)) {
            const ids = byChannel.get(`${l.id}|${path}`);
            if (!ids) continue;
            const moved = ch.keyframes.filter((k) => ids.has(k.id)).map((k) => ({ ...k, t: (Math.round(k.t * p.fps) + delta) / p.fps }));
            const landing = new Set(moved.map((k) => Math.round(k.t * p.fps)));
            const kept = ch.keyframes.filter((k) => !ids.has(k.id) && !landing.has(Math.round(k.t * p.fps)));
            channels = { ...channels, [path]: { ...ch, keyframes: [...kept, ...moved].sort((x, y) => x.t - y.t) } };
          }
          return channels === l.channels ? l : { ...l, channels };
        }),
      };
    }
    case 'deleteKeys': {
      const ids = new Set(a.refs.map(keyRefId));
      return {
        ...p,
        layers: p.layers.map((l) => {
          let next = l;
          for (const [path, ch] of Object.entries(l.channels)) {
            const removed = ch.keyframes.filter((k) => ids.has(keyRefId({ layerId: l.id, path, keyId: k.id })));
            if (!removed.length) continue;
            const keyframes = ch.keyframes.filter((k) => !removed.includes(k));
            if (keyframes.length) next = { ...next, channels: { ...next.channels, [path]: { ...ch, keyframes } } };
            else {
              // The property stays where the last remaining key had it.
              const { [path]: _, ...rest } = next.channels;
              next = setBase({ ...next, channels: rest }, path, removed[removed.length - 1].v);
            }
          }
          return next;
        }),
      };
    }
    case 'pasteKeys': {
      const singleSource = new Set(a.keys.map((k) => k.layerId)).size === 1;
      let next = p;
      for (const k of a.keys) {
        const layerId = singleSource && a.targetLayerId ? a.targetLayerId : k.layerId;
        const frame = a.atFrame + k.offsetFrames;
        if (frame > p.durationFrames) continue;
        next = mapLayer(next, layerId, (l) => {
          const ch = upsertKey(channelFor(l, k.path), frameToTime(frame, p.fps), k.v, p.fps);
          const t = frameToTime(frame, p.fps);
          const keyframes = ch.keyframes.map((x) => (Math.abs(x.t - t) < 0.5 / p.fps ? { ...x, ease: k.ease, inHandle: k.inHandle, outHandle: k.outHandle } : x));
          return { ...l, channels: { ...l.channels, [k.path]: { ...ch, keyframes } } };
        });
      }
      return next;
    }
    case 'updateKey':
      return mapLayer(p, a.ref.layerId, (l) => {
        const ch = l.channels[a.ref.path];
        if (!ch) return l;
        const maxT = frameToTime(p.durationFrames, p.fps);
        const keyframes = ch.keyframes
          .map((k) => {
            if (k.id !== a.ref.keyId) return k;
            const next = { ...k, ...a.patch };
            if (a.patch.t != null) next.t = Math.max(0, Math.min(maxT, Math.round(a.patch.t * p.fps) / p.fps));
            return next;
          })
          .sort((x, y) => x.t - y.t);
        if (a.patch.t != null) {
          // Dragged onto another key's frame: it replaces that key.
          const moved = keyframes.find((k) => k.id === a.ref.keyId);
          const f = moved ? Math.round(moved.t * p.fps) : -1;
          const deduped = keyframes.filter((k) => k.id === a.ref.keyId || Math.round(k.t * p.fps) !== f);
          return { ...l, channels: { ...l.channels, [a.ref.path]: { ...ch, keyframes: deduped } } };
        }
        return { ...l, channels: { ...l.channels, [a.ref.path]: { ...ch, keyframes } } };
      });
    case 'setOnionSkin':
      return { ...p, onionSkin: { ...p.onionSkin, ...a.patch } };
    case 'setHold':
      return mapLayer(p, a.layerId, (l) =>
        l.celTrack ? { ...l, celTrack: { ...l.celTrack, stepRate: a.stepRate } } : { ...l, celTrack: { id: `cel_${l.id}`, name: 'Exposures', layerId: l.id, stepRate: a.stepRate, exposures: [] } }
      );
  }
}

// ── Undo / redo ─────────────────────────────────────────────────────────────

export interface AnimaHistory {
  past: AnimaProject[];
  present: AnimaProject;
  future: AnimaProject[];
  /** Coalescing: edits with the same key within COALESCE_MS replace the last step. */
  lastKey?: string;
  lastAt?: number;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 700;

export type AnimaHistoryAction =
  | { type: 'do'; action: AnimaAction; coalesceKey?: string; at?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Open a project: replaces the document and clears history. */
  | { type: 'reset'; project: AnimaProject };

export function initHistory(project: AnimaProject): AnimaHistory {
  return { past: [], present: project, future: [] };
}

export function animaHistoryReducer(h: AnimaHistory, a: AnimaHistoryAction): AnimaHistory {
  switch (a.type) {
    case 'reset':
      return initHistory(a.project);
    case 'undo':
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case 'redo':
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    case 'do': {
      const next = applyAnimaAction(h.present, a.action);
      if (next === h.present) return h;
      const at = a.at ?? Date.now();
      const merge = !!a.coalesceKey && a.coalesceKey === h.lastKey && h.lastAt != null && at - h.lastAt < COALESCE_MS;
      const past = merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
      return { past, present: next, future: [], lastKey: a.coalesceKey, lastAt: at };
    }
  }
}

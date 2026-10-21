// components/Fabula/anima/AnimaGraphEditor.tsx — value curves for the selected layer.
//
// Curves are sampled from the same evaluator playback uses, so what you see is what plays.
// Drag a key to change its time (snapped to frames) and value; Shift locks time. Selected keys on
// a "Curve" segment show Bézier handles; dragging one mirrors the opposite handle (Alt breaks it).
// The value range fits the visible curves and holds still while you drag.

import React, { useMemo, useRef, useState } from 'react';
import type { AnimaLayer, AnimaProject, BezierHandle, Keyframe } from '../../../services/anima/types';
import { evaluateChannel } from '../../../services/anima/evaluator';
import { keyRefId, propertyDef, type AnimaAction } from '../../../services/anima/document';
import type { FrameStore } from './frameStore';

const NAME_W = 220;
const H = 210;
const PAD = 16;
const COLORS = ['#00DAF3', '#ffd166', '#ff6fa8', '#8bf5a4', '#c3a6ff', '#ff9f5a', '#7cc7ff', '#f4f4f4'];

export interface AnimaGraphEditorProps {
  project: AnimaProject;
  layer: AnimaLayer | null;
  frames: FrameStore;
  pxPerFrame: number;
  dispatch: (a: AnimaAction, coalesceKey?: string) => void;
  keySel: string[];
  setKeySel: (ids: string[]) => void;
}

const defaultOut = (a: Keyframe<number>, b: Keyframe<number>): BezierHandle => a.outHandle ?? { dx: (b.t - a.t) / 3, dy: 0 };
const defaultIn = (a: Keyframe<number>, b: Keyframe<number>): BezierHandle => b.inHandle ?? { dx: -(b.t - a.t) / 3, dy: 0 };

export const AnimaGraphEditor: React.FC<AnimaGraphEditorProps> = ({ project, layer, pxPerFrame, dispatch, keySel, setKeySel }) => {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const frozenRange = useRef<{ min: number; max: number } | null>(null);
  const width = project.durationFrames * pxPerFrame;
  const fps = project.fps;
  const selSet = useMemo(() => new Set(keySel), [keySel]);

  const channels = useMemo(() => (layer ? Object.entries(layer.channels).filter(([, ch]) => ch.keyframes.length > 0) : []), [layer]);
  const visible = channels.filter(([path]) => !hidden[path]);

  const fitted = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const [, ch] of visible) {
      for (let f = 1; f <= project.durationFrames; f++) {
        const v = evaluateChannel(ch, (f - 1) / fps, fps);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      for (const k of ch.keyframes) {
        min = Math.min(min, k.v + Math.min(0, k.inHandle?.dy ?? 0, k.outHandle?.dy ?? 0));
        max = Math.max(max, k.v + Math.max(0, k.inHandle?.dy ?? 0, k.outHandle?.dy ?? 0));
      }
    }
    if (!Number.isFinite(min)) return { min: -1, max: 1 };
    if (max - min < 1e-3) return { min: min - 1, max: max + 1 };
    const pad = (max - min) * 0.1;
    return { min: min - pad, max: max + pad };
  }, [visible, project.durationFrames, fps]);
  const range = frozenRange.current ?? fitted;

  const xOf = (t: number) => t * fps * pxPerFrame + pxPerFrame / 2;
  const yOf = (v: number) => PAD + (1 - (v - range.min) / (range.max - range.min)) * (H - 2 * PAD);
  const vPerPx = (range.max - range.min) / (H - 2 * PAD);
  const tPerPx = 1 / (fps * pxPerFrame);

  const ticks = useMemo(() => {
    const span = range.max - range.min;
    const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
    const nice = [1, 2, 5, 10].map((m) => m * step).find((s) => span / s <= 5) ?? step * 10;
    const out: number[] = [];
    for (let v = Math.ceil(range.min / nice) * nice; v <= range.max; v += nice) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }, [range.min, range.max]);

  if (!layer) return <div className="px-4 py-6 text-[12px] text-white/45">Select a layer to see its curves.</div>;
  if (!channels.length) return <div className="px-4 py-6 text-[12px] text-white/45">{layer.name} has no animation yet. Add keys in Properties, or apply a preset.</div>;

  /** Generic drag helper: calls onMove with pixel deltas, coalesced into one undo step. */
  const drag = (e: React.PointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent, key: string) => void) => {
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    frozenRange.current = range;
    const sx = e.clientX;
    const sy = e.clientY;
    const key = `graph-${Date.now()}`;
    const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy, ev, key);
    const up = () => {
      el.removeEventListener('pointermove', move as EventListener);
      el.removeEventListener('pointerup', up);
      frozenRange.current = null;
      setHidden((h) => ({ ...h })); // refit
    };
    el.addEventListener('pointermove', move as EventListener);
    el.addEventListener('pointerup', up);
  };

  return (
    <div className="flex" style={{ height: H }}>
      <div className="sticky left-0 z-10 shrink-0 flex flex-col gap-0.5 p-2 overflow-y-auto custom-scrollbar" style={{ width: NAME_W, background: '#0e0d14', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
        {channels.map(([path, ch], i) => (
          <label key={path} className="flex items-center gap-2 px-1 h-6 rounded hover:bg-white/[0.04] cursor-pointer">
            <input type="checkbox" checked={!hidden[path]} onChange={() => setHidden((h) => ({ ...h, [path]: !h[path] }))} />
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate text-[11px] text-white/75">{propertyDef(path).label === path ? ch.name || path : propertyDef(path).label}</span>
          </label>
        ))}
      </div>
      <svg width={width} height={H} className="shrink-0 block" style={{ background: '#0b0a10' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={0} x2={width} y1={yOf(v)} y2={yOf(v)} stroke={v === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'} />
            <text x={4} y={yOf(v) - 3} fill="rgba(255,255,255,0.35)" fontSize={9}>{v}</text>
          </g>
        ))}
        {visible.map(([path, ch]) => {
          const i = channels.findIndex(([p]) => p === path);
          const color = COLORS[i % COLORS.length];
          const pts: string[] = [];
          const steps = project.durationFrames * 2;
          for (let s = 0; s <= steps; s++) {
            const t = (s / 2) / fps;
            if (t > (project.durationFrames - 1) / fps + 1e-9) break;
            pts.push(`${xOf(t).toFixed(1)},${yOf(evaluateChannel(ch, t, fps)).toFixed(1)}`);
          }
          const kfs = ch.keyframes;
          return (
            <g key={path}>
              <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} />
              {kfs.map((k, ki) => {
                const id = keyRefId({ layerId: layer.id, path, keyId: k.id });
                const sel = selSet.has(id);
                const next = kfs[ki + 1];
                const prev = kfs[ki - 1];
                const ref = { layerId: layer.id, path, keyId: k.id };
                const showOut = sel && next && k.ease === 'bezier';
                const showIn = sel && prev && prev.ease === 'bezier';
                const out = next ? defaultOut(k, next) : null;
                const inn = prev ? defaultIn(prev, k) : null;
                return (
                  <g key={k.id}>
                    {showOut && out && (
                      <>
                        <line x1={xOf(k.t)} y1={yOf(k.v)} x2={xOf(k.t + out.dx)} y2={yOf(k.v + out.dy)} stroke="rgba(212,0,85,0.8)" />
                        <circle
                          cx={xOf(k.t + out.dx)}
                          cy={yOf(k.v + out.dy)}
                          r={4}
                          fill="#D40055"
                          className="cursor-move"
                          onPointerDown={(e) =>
                            drag(e, (dx, dy, ev, key) => {
                              const span = next!.t - k.t;
                              const nd = Math.max(span * 0.02, Math.min(span, out.dx + dx * tPerPx));
                              const ndy = out.dy - dy * vPerPx;
                              const patch: { outHandle: BezierHandle; inHandle?: BezierHandle } = { outHandle: { dx: nd, dy: ndy } };
                              if (!ev.altKey && prev && inn) {
                                const len = Math.abs(inn.dx) || span / 3;
                                patch.inHandle = { dx: -len, dy: -ndy * (len / nd) };
                              }
                              dispatch({ type: 'updateKey', ref, patch }, key);
                            })
                          }
                        />
                      </>
                    )}
                    {showIn && inn && (
                      <>
                        <line x1={xOf(k.t)} y1={yOf(k.v)} x2={xOf(k.t + inn.dx)} y2={yOf(k.v + inn.dy)} stroke="rgba(212,0,85,0.8)" />
                        <circle
                          cx={xOf(k.t + inn.dx)}
                          cy={yOf(k.v + inn.dy)}
                          r={4}
                          fill="#D40055"
                          className="cursor-move"
                          onPointerDown={(e) =>
                            drag(e, (dx, dy, ev, key) => {
                              const span = k.t - prev!.t;
                              const nd = Math.min(-span * 0.02, Math.max(-span, inn.dx + dx * tPerPx));
                              const ndy = inn.dy - dy * vPerPx;
                              const patch: { inHandle: BezierHandle; outHandle?: BezierHandle } = { inHandle: { dx: nd, dy: ndy } };
                              if (!ev.altKey && next && out) {
                                const len = Math.abs(out.dx) || (next.t - k.t) / 3;
                                patch.outHandle = { dx: len, dy: -ndy * (len / -nd) };
                              }
                              dispatch({ type: 'updateKey', ref, patch }, key);
                            })
                          }
                        />
                      </>
                    )}
                    <circle
                      cx={xOf(k.t)}
                      cy={yOf(k.v)}
                      r={sel ? 5.5 : 4.5}
                      fill={sel ? '#ffffff' : color}
                      stroke={sel ? '#D40055' : '#0b0a10'}
                      strokeWidth={2}
                      className="cursor-move"
                      data-keyrefs={id}
                      onPointerDown={(e) => {
                        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                        if (!sel) setKeySel(additive ? [...keySel, id] : [id]);
                        const t0 = k.t;
                        const v0 = k.v;
                        drag(e, (dx, dy, ev, key) => {
                          const lockTime = ev.shiftKey;
                          dispatch({ type: 'updateKey', ref, patch: { ...(lockTime ? {} : { t: t0 + dx * tPerPx }), v: Math.round((v0 - dy * vPerPx) * 1000) / 1000 } }, key);
                        });
                      }}
                    >
                      <title>{`${ch.name || path}: ${k.v.toFixed(2)} at frame ${Math.round(k.t * fps) + 1}`}</title>
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

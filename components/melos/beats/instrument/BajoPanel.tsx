// BAJO — the Play surface.
//
// The hero control is the wobble rate lane, for the same reason VELA's is the partial display:
// it is the thing the instrument is FOR. A bass synth whose Play panel leads with a filter knob
// is a synth that happens to be playing low notes.
//
// Four macros under it — Weight, Grit, Wobble, Space — and a preset name. Everything else is one
// click away in the editor, same as ONDA and VELA.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeBajoPatch, applyBajoPreset, bajoEngineParams, applyBajoPatch, crossformPatch, flattenGrid,
  type PadTarget,
  BAJO_MACRO_HINTS, BAJO_MACRO_LABELS, BAJO_MACRO_ORDER, type BajoPatch,
} from '../../../../services/melos/instruments/bajo/patch';
import { BAJO_PRESETS, type BajoMacro } from '../../../../services/melos/instruments/bajo/presets';
import { newBajoPatch } from '../../../../services/melos/instruments/bajo/patch';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { W, G, bajoParamLabel } from '../../../../services/melos/instruments/bajo/params';
import { MorphPad, padValue } from './MorphPad';
import { useBajoTransport } from './useBajoTransport';
import { Knob } from '../shared/Knob';
import { WobbleLane, LANE_PRESETS } from './WobbleLane';
import { BajoEditor } from './BajoEditor';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  /** Hosted inside the shared InstrumentWindow — chrome (close/arm/presets) comes from the window. */
  embedded?: boolean;
}

export const BAJO_ACCENT = '#FF4B1C';

/** Magma for the destructive half, resin for the acoustic half — the same duality the
 *  instrument's two ends are built around. */
const MACRO_COLORS: Record<BajoMacro, string> = {
  weight: '#E0A85C',
  grit: BAJO_ACCENT,
  wobble: BAJO_ACCENT,
  space: '#63C9DE',
};

export const BajoPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [xfOpen, setXfOpen] = useState(false);
  const [xfA, setXfA] = useState(BAJO_PRESETS[0].id);
  const [xfB, setXfB] = useState(BAJO_PRESETS[BAJO_PRESETS.length - 1].id);
  const [xfAmt, setXfAmt] = useState(0);
  const [padRec, setPadRec] = useState(false);
  const recBuf = useRef<number[]>([]);

  // Deliberately not memoised, for the same reason as ONDA's and VELA's panels: the doc mutates
  // in place, so a memo keyed on the patch object would never invalidate and every control
  // would freeze.
  const patch: BajoPatch | null = deserializeBajoPatch(track.instrument?.patch);
  // Hooks cannot sit behind the null check below, so the rate is read defensively here.
  const tr = useBajoTransport(patch?.params?.[G.RATE] ?? 1, !!patch?.padLoop);

  /** The fast path: parameters only. Turning a macro must never rebuild a wavetable.
   *  If the engine instrument doesn't exist yet (it's created lazily), create it and THEN apply —
   *  silently dropping the edit is why presets "didn't change" on a fresh track. */
  const pushParams = useCallback((p: BajoPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) { inst.setParams(bajoEngineParams(p)); return; }
    const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
    if (t) void engine.ensureInstrument(t).then((i) => i?.setParams(bajoEngineParams(p)));
  }, [track.id]);

  /** The slow path: tables THEN parameters. Only when the patch's tables can have changed. */
  const pushAll = useCallback((p: BajoPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) { applyBajoPatch(inst, p); return; }
    const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
    if (t) void engine.ensureInstrument(t).then((i) => { if (i) applyBajoPatch(i, p); });
  }, [track.id]);

  /** Edit the patch in place and push the result. One path for every control on the panel. */
  const edit = useCallback((fn: (p: BajoPatch) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeBajoPatch(raw);
      if (!next) return;
      fn(next);
      raw.macros = { ...next.macros };
      raw.lane = [...next.lane];
      raw.grid = flattenGrid(next.grid); // flat: Firestore rejects an array of arrays
      raw.params = Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v]));
      pushParams(next);
    });
  }, [onMutate, pushParams, track.id]);

  const choosePreset = useCallback((presetId: string) => {
    const preset = BAJO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const current = deserializeBajoPatch(t.instrument.patch);
      if (!current) return;
      const next = applyBajoPreset(current, preset);
      t.instrument.patch = {
        ...next,
        params: Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v])),
        lane: [...next.lane],
        grid: flattenGrid(next.grid),
      } as unknown as Record<string, unknown>;
      t.instrument.presetName = preset.name;
      t.name = preset.name;
      syncPadWithTrack(d, track.id);
      pushAll(next);
    });
    setGalleryOpen(false);
  }, [onMutate, pushAll, track.id]);

  /** Blend two presets into this track. Tables can change, so this takes the slow path. */
  const crossform = useCallback((aId: string, bId: string, amount: number) => {
    const pa = BAJO_PRESETS.find((x) => x.id === aId);
    const pb = BAJO_PRESETS.find((x) => x.id === bId);
    if (!pa || !pb) return;
    const blended = crossformPatch(newBajoPatch(pa), newBajoPatch(pb), amount);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      t.instrument.patch = {
        ...blended,
        params: Object.fromEntries(Object.entries(blended.params).map(([k, v]) => [String(k), v])),
        tables: [...blended.tables],
        lane: [...blended.lane],
        grid: flattenGrid(blended.grid),
      } as unknown as Record<string, unknown>;
      t.instrument.presetName = blended.name;
      t.name = blended.name;
      pushAll(blended);
    });
  }, [onMutate, pushAll, track.id]);

  /**
   * Move the pad. This drives the ENGINE only — writing the document on every pointermove would
   * put a Firestore write behind every pixel of a gesture.
   */
  const padMove = useCallback((px: number, py: number, targets: { x: PadTarget[]; y: PadTarget[] }) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    if (!inst) return;
    for (const t of targets.x) inst.setParam(t.id, padValue(t, px));
    for (const t of targets.y) inst.setParam(t.id, padValue(t, py));
  }, [track.id]);

  /** Drag finished, or a recording stopped: now it is worth storing. */
  const padCommit = useCallback((px: number, py: number, recorded?: number[]) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      raw.padPos = [px, py];
      if (recorded) raw.padPath = [...recorded];
    });
  }, [onMutate, track.id]);

  // Replay a recorded gesture against the transport. Engine-only, like the drag itself.
  const padX = patch?.padX ?? [];
  const padY = patch?.padY ?? [];
  const padPath = patch?.padPath ?? [];
  const padBars = patch?.padBars ?? 2;
  const looping = !!patch?.padLoop && padPath.length >= 3;
  const loopPhase = looping && tr.running ? ((tr.beats / (4 * padBars)) % 1 + 1) % 1 : 0;
  const lastLoop = useRef(-1);
  useEffect(() => {
    if (!looping || !tr.running) return;
    let best = 0;
    for (let i = 0; i + 2 < padPath.length; i += 3) if (padPath[i] <= loopPhase) best = i;
    if (best === lastLoop.current) return;
    lastLoop.current = best;
    padMove(padPath[best + 1], padPath[best + 2], { x: padX, y: padY });
  }, [looping, loopPhase, padMove, padPath, padX, padY, tr.running]);

  if (!patch) {
    return (
      <div className="p-4 flex items-center gap-3">
        <span className="text-[12px] text-white/50">This track has no BAJO patch.</span>
        <button onClick={onClose} className="h-7 px-3 rounded-lg border border-white/15 text-[11px] text-white/60 hover:text-white">Close</button>
      </div>
    );
  }

  const wobbleOn = (patch.params[W.ENABLE] ?? 0) > 0.5;
  const gateOn = (patch.params[G.ENABLE] ?? 0) > 0.5;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: SURFACE }}>
      <div className="flex items-center gap-3 px-4 h-12 flex-none border-b border-white/10" style={{ background: SURFACE_RAISED }}>
        <span className="font-black text-[11px] tracking-[0.16em]" style={{ color: BAJO_ACCENT }}>BAJO</span>
        <span className="text-white/25">·</span>
        <button
          onClick={() => setGalleryOpen((v) => !v)}
          className="text-[12px] font-semibold text-white hover:text-white/80 truncate max-w-[46%] text-left"
          title="Change preset"
        >
          {patch.name}
        </button>
        <span className="flex-1" />
        {gateOn && (
          <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border" style={{ color: BAJO_ACCENT, borderColor: 'rgba(255,75,28,0.4)' }}>
            Gate
          </span>
        )}
        <button
          onClick={() => setEditorOpen(true)}
          className="h-7 px-2.5 rounded-lg border border-white/12 text-[10.5px] uppercase tracking-[0.12em] text-white/60 hover:text-white hover:border-white/25"
        >
          Open
        </button>
        {!embedded && (
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {/* The hero control: the actual rate lane, editable in place. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">Wobble lane</span>
            <button
              onClick={() => edit((p) => { p.params[W.ENABLE] = wobbleOn ? 0 : 1; })}
              className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border"
              style={{
                color: wobbleOn ? BAJO_ACCENT : 'rgba(255,255,255,0.4)',
                borderColor: wobbleOn ? 'rgba(255,75,28,0.45)' : 'rgba(255,255,255,0.12)',
              }}
            >
              {wobbleOn ? 'On' : 'Off'}
            </button>
            <span className="flex-1" />
            {LANE_PRESETS.map((lp) => (
              <button
                key={lp.name}
                onClick={() => edit((p) => { p.lane = [...lp.lane]; })}
                className="text-[9px] uppercase tracking-[0.1em] text-white/45 hover:text-white px-1"
              >
                {lp.name}
              </button>
            ))}
          </div>
          <WobbleLane
            lane={patch.lane}
            onChange={(lane) => edit((p) => { p.lane = lane; })}
            shape={patch.params[W.SHAPE] ?? 0}
            skew={patch.params[W.SKEW] ?? 0.5}
            smooth={patch.params[W.SMOOTH] ?? 0.1}
            accent={wobbleOn ? BAJO_ACCENT : '#4B4658'}
            playStep={wobbleOn ? tr.laneStep : -1}
          />
        </div>

        {/* The Morph Pad. Above the macros because it is the thing you actually perform with. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">Morph pad</span>
            <span className="flex-1" />
            <button
              onClick={() => {
                if (padRec) {
                  // Stop: keep what was drawn, and start looping it — recording a move and then
                  // having to find a second button to hear it is a bad trade.
                  const rec = recBuf.current.slice();
                  setPadRec(false);
                  onMutate((d) => {
                    const t = d.arrangement.find((x) => x.id === track.id);
                    const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
                    if (!raw) return;
                    raw.padPath = rec;
                    raw.padLoop = rec.length >= 3;
                  });
                } else {
                  recBuf.current = [];
                  setPadRec(true);
                }
              }}
              className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border"
              style={{
                color: padRec ? '#fff' : 'rgba(255,255,255,0.45)',
                background: padRec ? BAJO_ACCENT : 'transparent',
                borderColor: padRec ? BAJO_ACCENT : 'rgba(255,255,255,0.12)',
              }}
            >
              {padRec ? 'Stop' : 'Rec'}
            </button>
            <button
              onClick={() => edit((p) => { p.padLoop = !p.padLoop; })}
              disabled={padPath.length < 3}
              className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border disabled:opacity-30"
              style={{
                color: looping ? BAJO_ACCENT : 'rgba(255,255,255,0.45)',
                borderColor: looping ? 'rgba(255,75,28,0.45)' : 'rgba(255,255,255,0.12)',
              }}
            >
              Loop
            </button>
            <select
              value={padBars}
              onChange={(e) => edit((p) => { p.padBars = +e.target.value; })}
              className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white/60"
            >
              {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n} bar</option>)}
            </select>
            <button
              onClick={() => edit((p) => { p.padPath = []; p.padLoop = false; })}
              disabled={padPath.length < 3}
              className="text-[9px] uppercase tracking-[0.12em] text-white/35 hover:text-white disabled:opacity-30"
            >
              Clear
            </button>
          </div>
          <MorphPad
            x={patch.padPos[0]}
            y={patch.padPos[1]}
            targetsX={padX}
            targetsY={padY}
            labelX={padX.map((t) => bajoParamLabel(t.id)).join(' + ') || 'unassigned'}
            labelY={padY.map((t) => bajoParamLabel(t.id)).join(' + ') || 'unassigned'}
            path={padPath}
            recording={padRec}
            looping={looping}
            loopPhase={loopPhase}
            accent={BAJO_ACCENT}
            onMove={(px, py) => {
              padMove(px, py, { x: padX, y: padY });
              if (padRec) {
                const ph = tr.running ? ((tr.beats / (4 * padBars)) % 1 + 1) % 1 : 0;
                recBuf.current.push(ph, px, py);
              }
            }}
            onCommit={(px, py) => padCommit(px, py)}
          />
        </div>

        {/* The four macros. */}
        <div className="grid grid-cols-4 gap-3">
          {BAJO_MACRO_ORDER.map((macro) => (
            <div key={macro} className="flex flex-col items-center gap-1.5" title={BAJO_MACRO_HINTS[macro]}>
              <Knob
                label={BAJO_MACRO_LABELS[macro]}
                value={patch.macros[macro]}
                min={0}
                max={1}
                defaultValue={0.5}
                color={MACRO_COLORS[macro]}
                size={54}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => edit((p) => { p.macros[macro] = v; })}
              />
            </div>
          ))}
        </div>

        {patch.description && (
          <p className="text-[11px] leading-relaxed text-white/40">{patch.description}</p>
        )}

        {/* Crossform. Folded away by default — it rewrites the patch, which is not something to
            leave one stray drag away from the macros. */}
        <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.07]">
          <button
            onClick={() => setXfOpen((v) => !v)}
            className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40 hover:text-white/70"
          >
            <span style={{ color: xfOpen ? BAJO_ACCENT : undefined }}>Crossform</span>
            <span className="text-white/25">{xfOpen ? '−' : '+'}</span>
            <span className="flex-1 text-left normal-case tracking-normal text-[10px] text-white/25">
              blend any two patches
            </span>
          </button>

          {xfOpen && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-4 text-[9px] uppercase text-white/35">A</span>
                <select
                  value={xfA}
                  onChange={(e) => { setXfA(e.target.value); crossform(e.target.value, xfB, xfAmt); }}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white"
                >
                  {BAJO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 text-[9px] uppercase text-white/35">B</span>
                <select
                  value={xfB}
                  onChange={(e) => { setXfB(e.target.value); crossform(xfA, e.target.value, xfAmt); }}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white"
                >
                  {BAJO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={1} step={0.001} value={xfAmt}
                  aria-label="Crossform amount"
                  onChange={(e) => { const v = +e.target.value; setXfAmt(v); crossform(xfA, xfB, v); }}
                  className="flex-1 min-w-0 accent-[#FF4B1C]"
                />
                <span className="w-9 text-right text-[10px] font-mono tabular-nums" style={{ color: BAJO_ACCENT }}>
                  {Math.round(xfAmt * 100)}%
                </span>
              </div>
              <p className="text-[10px] leading-snug text-white/25">
                Continuous controls blend; tables, the lane, the gate grid and anything stepped
                snap at the midpoint. The interesting patch is rarely at either end.
              </p>
            </div>
          )}
        </div>

        {galleryOpen && (
          <div className="flex flex-col gap-1.5">
            {BAJO_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => choosePreset(p.id)}
                className="text-left rounded-lg border px-3 py-2 hover:border-white/25"
                style={{
                  borderColor: p.id === patch.presetId ? 'rgba(255,75,28,0.5)' : 'rgba(255,255,255,0.09)',
                  background: p.id === patch.presetId ? 'rgba(255,75,28,0.07)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: p.family === 'phys' ? '#E0A85C' : '#fff' }}
                  >
                    {p.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">{p.genre}</span>
                </div>
                <p className="text-[11px] text-white/40 leading-snug">{p.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <BajoEditor track={track} onMutate={onMutate} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
};

// The FL-style channel rack — every pad as a row, all patterns' steps visible at once. The
// Glass view's document-editing heart: mute dot, name (click selects the pad everywhere,
// double-click renames), velocity-tinted step cells, cyan playhead column. Patterns longer
// than 16 steps page with the bar chips on the header row. Instrument tracks that are NOT
// pad-backed (imported .dawproject synth tracks) list below the rack so nothing you add is
// ever invisible here.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { padGroup } from '../../../../services/melos/beats/songSections';
import {
  cloneChannel, deleteChannel, fillEvery, invertRow, moveChannel, randomizeRow, rotateRow, sendRowToPitchRoll,
} from '../../../../services/melos/beats/channelOps';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';

/** QWERTY → semitones (z = C … m = B, q row an octave up) for step recording, like FL's typing keyboard. */
const STEP_KEYS: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24,
};

/** A rack-sized knob: drag up/down (Shift = fine), wheel, double-click resets. */
const RackKnob: React.FC<{ value: number; min: number; max: number; def: number; color: string; label: string; format: (v: number) => string; onChange: (v: number) => void }> =
  ({ value, min, max, def, color, label, format, onChange }) => {
    const drag = useRef<{ y: number; v: number } | null>(null);
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return (
      <div
        role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
        title={`${label}: ${format(value)} — drag (Shift = fine) · double-click resets`}
        className="w-[18px] h-[18px] rounded-full cursor-ns-resize touch-none"
        style={{
          background: `conic-gradient(${color} ${Math.round(frac * 100)}%, rgba(255,255,255,0.12) 0)`,
          WebkitMask: 'radial-gradient(circle, transparent 0 4px, #000 4.5px)',
          mask: 'radial-gradient(circle, transparent 0 4px, #000 4.5px)',
        }}
        onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: value }; }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const span = (max - min) * ((d.y - e.clientY) / (e.shiftKey ? 600 : 120));
          onChange(Math.max(min, Math.min(max, d.v + span)));
        }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={() => onChange(def)}
        onWheel={(e) => { e.preventDefault(); onChange(Math.max(min, Math.min(max, value + ((max - min) / 40) * (e.deltaY < 0 ? 1 : -1)))); }}
      />
    );
  };
import { PLAYHEAD, SELECT } from '../theme';
import { useContextMenu, type MenuNode } from '../../../ui/ContextMenu';

interface ChannelRackProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** Open an instrument's window (pad instruments and track instruments alike). */
  onOpenInstrument?: (trackId: string) => void;
  /** FL "Send to piano roll": the row became pitch-roll notes — show them in MEKA's pitch roll. */
  onOpenPianoRoll?: (padIdx: number) => void;
}

export const ChannelRack: React.FC<ChannelRackProps> = ({ doc, pattern, selectedPad, beats, running, playMode, onSelectPad, onMutate, onOpenInstrument, onOpenPianoRoll }) => {
  const pages = Math.max(1, Math.ceil(pattern.length / 16));
  const [page, setPage] = useState(0);
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const cols = Math.min(pattern.length, 16);
  const colBase = Math.min(page, pages - 1) * 16;
  const globalPlayStep = running && playMode === 'pattern'
    ? ((Math.floor(beats / 0.25) % pattern.length) + pattern.length) % pattern.length
    : -1;
  // Follow the playhead across pages while running.
  useEffect(() => {
    if (globalPlayStep < 0 || pages <= 1) return;
    const wantPage = Math.floor(globalPlayStep / 16);
    if (wantPage !== page) setPage(wantPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalPlayStep >= 0 ? Math.floor(globalPlayStep / 16) : -1]);
  const playStep = globalPlayStep >= colBase && globalPlayStep < colBase + cols ? globalPlayStep - colBase : -1;

  // FL step recording: a cursor walks the selected channel's row; hitting a pad (or typing a note
  // on the QWERTY keyboard for the selected channel) writes a step at the cursor and advances.
  // ← → move, Backspace clears and steps back. Works while the transport is stopped (playing with
  // record armed is live recording, handled by the room).
  const [stepRec, setStepRec] = useState(false);
  const [cursor, setCursor] = useState(0);
  const stepState = useRef({ cursor: 0, selectedPad, pattern, onMutate });
  stepState.current = { cursor, selectedPad, pattern, onMutate };
  useEffect(() => { if (cursor >= pattern.length) setCursor(0); }, [pattern.length, cursor]);
  const writeAtCursor = useCallback((padIdx: number, vel: number, pitch?: number) => {
    const st = stepState.current;
    const at = st.cursor;
    st.onMutate((d) => {
      const pat = d.patterns.find((x) => x.id === st.pattern.id);
      if (!pat) return;
      const row = (pat.steps[padIdx] ??= {});
      row[at] = { ...(row[at] ?? {}), v: Math.max(1, Math.min(127, Math.round(vel))) };
      if (pitch !== undefined && pitch !== 0) row[at].pitch = Math.max(-24, Math.min(24, pitch)); else if (pitch === 0) delete row[at].pitch;
    });
    setCursor((at + 1) % st.pattern.length);
    setPage(Math.floor(((at + 1) % st.pattern.length) / 16));
  }, []);
  useEffect(() => {
    if (!stepRec) return;
    const engine = BeatsEngine.get();
    const offHit = engine.onPadHit((hit) => { if (!engine.isRunning() && !hit.repeat) writeAtCursor(hit.padIdx, hit.vel); });
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && typeof el.matches === 'function' && el.matches('input, textarea, select, [contenteditable="true"]'))) return;
      const st = stepState.current;
      const len = st.pattern.length;
      const done = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = (st.cursor + (e.key === 'ArrowRight' ? 1 : -1) + len) % len;
        setCursor(next); setPage(Math.floor(next / 16)); done(); return;
      }
      if (e.key === 'Backspace') {
        const prev = (st.cursor - 1 + len) % len;
        st.onMutate((d) => { const pat = d.patterns.find((x) => x.id === st.pattern.id); if (pat?.steps[st.selectedPad]) delete pat.steps[st.selectedPad][prev]; });
        setCursor(prev); setPage(Math.floor(prev / 16)); done(); return;
      }
      if (e.repeat) return;
      const semi = STEP_KEYS[e.key.toLowerCase()];
      if (semi === undefined) return;
      done();
      // Audition at an explicit time: an untimed trigger is a "live hit", which would also arrive
      // through onPadHit above and write the step twice.
      void engine.init().then(() => engine.trigger(st.selectedPad, 100, engine.getContext()?.currentTime ?? 0, 0.2, semi));
      writeAtCursor(st.selectedPad, e.shiftKey ? 127 : 100, semi);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { offHit(); window.removeEventListener('keydown', onKey, true); };
  }, [stepRec, writeAtCursor]);

  const [renamingPad, setRenamingPad] = useState<number | null>(null);
  const [renamingTrack, setRenamingTrack] = useState<string | null>(null);
  const [nameText, setNameText] = useState('');

  const toggle = useCallback((padIdx: number, stepIdx: number) => {
    onMutate((d) => {
      const pat = d.patterns.find((p) => p.id === pattern.id);
      if (!pat) return;
      const row = pat.steps[padIdx] || (pat.steps[padIdx] = {});
      if (row[stepIdx]) delete row[stepIdx];
      else row[stepIdx] = { v: 100 };
    });
  }, [onMutate, pattern.id]);

  // Right-click / long-press a pad row — the shared design-system menu.
  const rowMenu = useContextMenu<number>((padIdx) => {
    const pad = doc.kit[padIdx];
    if (!pad) return [];
    const items: MenuNode<number>[] = [
      { kind: 'header', label: pad.name },
    ];
    if (pad.instrumentTrackId && onOpenInstrument) {
      items.push({ id: 'open', label: 'Open instrument', onSelect: () => onOpenInstrument(pad.instrumentTrackId!) });
    }
    items.push(
      { id: 'select', label: 'Select pad', onSelect: () => onSelectPad(padIdx) },
      { id: 'rename', label: 'Rename…', onSelect: () => { setNameText(pad.name); setRenamingPad(padIdx); } },
      { id: 'mute', label: 'Mute', checked: !!pad.mute, keepOpen: true, onSelect: () => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.mute = !p.mute; }) },
      { id: 'solo', label: 'Solo', checked: !!pad.solo, keepOpen: true, onSelect: () => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.solo = !p.solo; }) },
      { id: 'swing', label: `Swing · ${pad.swing === undefined ? 'song' : `${Math.round(pad.swing * 100)}%`}`, submenu: [
        { id: 'sw-song', label: 'Follow the song', checked: pad.swing === undefined, onSelect: () => onMutate((d) => { const p = d.kit[padIdx]; if (p) delete p.swing; }) },
        ...[0, 0.25, 0.5, 0.66, 0.75].map((v) => ({
          id: `sw${v}`, label: `${Math.round(v * 100)}%`, checked: pad.swing === v, onSelect: () => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.swing = v; }),
        })),
      ] },
      { kind: 'separator' },
      { id: 'tools', label: 'Steps', submenu: [
        ...[2, 4, 8].map((n) => ({ id: `fill${n}`, label: `Fill each ${n} steps`, onSelect: () => editRow((pat) => fillEvery(pat, padIdx, n)) })),
        { id: 'rotl', label: 'Rotate left', onSelect: () => editRow((pat) => rotateRow(pat, padIdx, -1)) },
        { id: 'rotr', label: 'Rotate right', onSelect: () => editRow((pat) => rotateRow(pat, padIdx, 1)) },
        { id: 'inv', label: 'Invert', onSelect: () => editRow((pat) => invertRow(pat, padIdx)) },
        { id: 'rand', label: 'Randomize', onSelect: () => editRow((pat) => randomizeRow(pat, padIdx)) },
      ] },
      { id: 'roll', label: 'Send to piano roll', onSelect: () => { onMutate((d) => { const pat = d.patterns.find((x) => x.id === pattern.id); if (pat) sendRowToPitchRoll(pat, padIdx); }); onSelectPad(padIdx); onOpenPianoRoll?.(padIdx); } },
      { kind: 'separator' },
      { id: 'up', label: 'Move up', onSelect: () => { let to = padIdx; onMutate((d) => { to = moveChannel(d, padIdx, -1); }); onSelectPad(to); } },
      { id: 'down', label: 'Move down', onSelect: () => { let to = padIdx; onMutate((d) => { to = moveChannel(d, padIdx, 1); }); onSelectPad(to); } },
      { id: 'clone', label: 'Clone', onSelect: () => { let to = -1; onMutate((d) => { to = cloneChannel(d, padIdx, false); }); if (to >= 0) { onSelectPad(to); BeatsEngine.get().syncInstruments(); } } },
      { id: 'clone-steps', label: 'Clone with steps', onSelect: () => { let to = -1; onMutate((d) => { to = cloneChannel(d, padIdx, true); }); if (to >= 0) { onSelectPad(to); BeatsEngine.get().syncInstruments(); } } },
      { kind: 'separator' },
      { id: 'clear', label: 'Clear steps', danger: true, onSelect: () => onMutate((d) => { const pat = d.patterns.find((p) => p.id === pattern.id); if (pat) pat.steps[padIdx] = {}; }) },
      { id: 'delete', label: 'Delete channel', danger: true, onSelect: () => { onMutate((d) => deleteChannel(d, padIdx)); BeatsEngine.get().syncInstruments(); } },
    );
    return items;
  });

  const editRow = (fn: (pat: Pattern) => void) => onMutate((d) => { const pat = d.patterns.find((x) => x.id === pattern.id); if (pat) fn(pat); });

  const commitPadRename = (padIdx: number) => {
    setRenamingPad(null);
    const name = nameText.trim().slice(0, 18);
    if (!name) return;
    onMutate((d) => {
      const p = d.kit[padIdx];
      if (!p) return;
      p.name = name;
      // Keep the paired instrument track in step, so every view agrees on the name.
      if (p.instrumentTrackId) {
        const t = d.arrangement.find((x) => x.id === p.instrumentTrackId);
        if (t) t.name = name;
      }
    });
  };

  // Instrument tracks with no pad (foreign imports) — driven by Timeline clips, not steps.
  const trackRows = doc.arrangement.filter((t) => t.kind === 'instrument' && !t.padOwned);

  return (
    <div className="bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl p-4">
      {rowMenu.node}
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Channel rack · {pattern.name}</p>
        <button
          onClick={() => setStepRec((v) => !v)}
          aria-pressed={stepRec}
          title={stepRec ? 'Step record ON — hit a pad (or type z…m for the selected channel) to write at the cursor · ← → move · Backspace clears' : 'Step record — write steps one at a time from pads or the keyboard'}
          className="h-[18px] px-1.5 rounded text-[9px] font-semibold uppercase tracking-wide border transition-colors"
          style={stepRec ? { color: '#FF4D8C', borderColor: 'rgba(255,77,140,0.55)', background: 'rgba(255,77,140,0.12)' } : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.1)' }}
        >Step rec{stepRec ? ` · ${cursor + 1}` : ''}</button>
        {pages > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="h-[18px] px-1.5 rounded text-[9px] font-mono border transition-colors"
                style={i === Math.min(page, pages - 1)
                  ? { borderColor: `${PLAYHEAD}66`, color: PLAYHEAD, background: 'rgba(0,218,243,0.08)' }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}
                title={`Steps ${i * 16 + 1}–${Math.min((i + 1) * 16, pattern.length)}`}
              >{i * 16 + 1}–{Math.min((i + 1) * 16, pattern.length)}</button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-[3px] max-h-[46vh] overflow-y-auto pr-1">
        {doc.kit.map((pad, padIdx) => {
          if (pad.empty) return null; // greyed placeholder — nothing to sequence
          // A Group's pattern sequences that Group's pads (MEKA Groups); legacy patterns show all.
          if (pattern.groupIdx !== undefined && padGroup(padIdx) !== pattern.groupIdx) return null;
          const row = pattern.steps[padIdx] || {};
          const selected = padIdx === selectedPad;
          return (
            <div key={pad.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '18px 108px 18px 18px 18px 1fr' }} {...rowMenu.bind(padIdx)}>
              <button
                onClick={() => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.mute = !p.mute; })}
                aria-label={`${pad.mute ? 'Unmute' : 'Mute'} ${pad.name}`}
                title={pad.mute ? 'Unmute' : 'Mute'}
                className="w-[18px] h-[18px] rounded-full border transition-colors"
                style={pad.mute
                  ? { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }
                  : { borderColor: '#06D6A0', background: 'rgba(6,214,160,0.2)' }}
              />
              {renamingPad === padIdx ? (
                <input
                  autoFocus
                  value={nameText}
                  onChange={(e) => setNameText(e.target.value)}
                  onBlur={() => commitPadRename(padIdx)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitPadRename(padIdx); if (e.key === 'Escape') setRenamingPad(null); }}
                  className="h-6 px-1.5 rounded-md bg-black/40 border border-white/25 text-[11px] text-white outline-none"
                  aria-label={`Rename ${pad.name}`}
                />
              ) : (
                <button
                  onClick={() => onSelectPad(padIdx)}
                  onDoubleClick={() => { setNameText(pad.name); setRenamingPad(padIdx); }}
                  title="Click to select · double-click to rename · right-click for menu"
                  className="text-left text-[11px] truncate h-6 px-1.5 rounded-md transition-colors"
                  style={selected ? { color: '#fff', background: `${SELECT}26`, fontWeight: 600 } : { color: pad.mute ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)' }}
                >{pad.name}</button>
              )}
              {/* In-rack volume + pan (the same channel the mixer drives) and solo. */}
              <RackKnob label={`${pad.name} volume`} value={pad.gainDb} min={-40} max={6} def={0} color="#06D6A0"
                format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
                onChange={(v) => onMutate((d) => { const x = d.kit[padIdx]; if (x) x.gainDb = Math.round(v * 10) / 10; })} />
              <RackKnob label={`${pad.name} pan`} value={pad.pan} min={-1} max={1} def={0} color="#D0BCFF"
                format={(v) => (Math.abs(v) < 0.01 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
                onChange={(v) => onMutate((d) => { const x = d.kit[padIdx]; if (x) x.pan = Math.round(v * 100) / 100; })} />
              <button
                onClick={() => onMutate((d) => { const x = d.kit[padIdx]; if (x) x.solo = !x.solo; })}
                aria-label={`Solo ${pad.name}`}
                title={pad.solo ? 'Soloed — only soloed channels play' : 'Solo'}
                className="w-[18px] h-[18px] rounded-[5px] border text-[8px] grid place-items-center"
                style={pad.solo ? { background: 'rgba(0,218,243,0.2)', borderColor: PLAYHEAD, color: PLAYHEAD } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
              >S</button>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }, (_, c) => {
                  const stepIdx = colBase + c;
                  if (stepIdx >= pattern.length) return <span key={c} />;
                  const step = row[stepIdx];
                  const velFrac = step ? step.v / 127 : 0;
                  return (
                    <button
                      key={c}
                      onClick={() => { toggle(padIdx, stepIdx); if (stepRec && selected) setCursor((stepIdx + 1) % pattern.length); }}
                      aria-label={`${pad.name} step ${stepIdx + 1}${step ? ' on' : ''}`}
                      className="h-[22px] rounded-[7px] border-0 transition-colors"
                      style={{
                        background: step
                          ? `rgba(212,0,85,${0.35 + velFrac * 0.6})`
                          : c % 8 < 4 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.045)',
                        outline: playStep === c ? `1.5px solid ${PLAYHEAD}` : stepRec && selected && stepIdx === cursor ? '1.5px solid #FF4D8C' : 'none',
                        outlineOffset: 1,
                        opacity: pad.mute ? 0.35 : 1,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Instrument tracks that aren't pad channels — visible here so nothing ever "disappears"
          from Glass; their notes live in Timeline clips, so the step area points there. */}
      {trackRows.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.07] flex flex-col gap-[3px]">
          <p className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold mb-1">Instrument tracks</p>
          {trackRows.map((t) => (
            <div key={t.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '18px 108px 1fr' }}>
              <button
                onClick={() => onMutate((d) => { const x = d.arrangement.find((y) => y.id === t.id); if (x) x.mute = !x.mute; })}
                aria-label={`${t.mute ? 'Unmute' : 'Mute'} ${t.name}`}
                className="w-[18px] h-[18px] rounded-full border transition-colors"
                style={t.mute
                  ? { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }
                  : { borderColor: '#06D6A0', background: 'rgba(6,214,160,0.2)' }}
              />
              {renamingTrack === t.id ? (
                <input
                  autoFocus
                  value={nameText}
                  onChange={(e) => setNameText(e.target.value)}
                  onBlur={() => { setRenamingTrack(null); const n = nameText.trim(); if (n) onMutate((d) => { const x = d.arrangement.find((y) => y.id === t.id); if (x) x.name = n; }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingTrack(null); }}
                  className="h-6 px-1.5 rounded-md bg-black/40 border border-white/25 text-[11px] text-white outline-none"
                  aria-label={`Rename ${t.name}`}
                />
              ) : (
                <button
                  onClick={() => !t.foreign && onOpenInstrument?.(t.id)}
                  onDoubleClick={() => { if (!t.foreign) { setNameText(t.name); setRenamingTrack(t.id); } }}
                  className="text-left text-[11px] truncate h-6 px-1.5 rounded-md flex items-center gap-1.5"
                  style={{ color: t.mute ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)' }}
                  title={t.foreign ? 'Preserved for re-export' : 'Click to open the instrument · double-click to rename'}
                >
                  <span className="w-[3px] h-3.5 rounded-[2px] flex-none" style={{ background: t.color }} />
                  {t.name}
                </button>
              )}
              <span className="text-[9.5px] text-white/25 truncate">
                {t.foreign ? 'preserved foreign track' : `${t.clips.reduce((n, c) => n + (c.notes?.length || 0), 0)} notes · sequenced in the Timeline arranger`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

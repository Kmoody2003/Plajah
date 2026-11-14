// CgLivePanel — the live CG operator surface: rundown → PREVIEW → TAKE → PROGRAM.
// Used inside Fabula's Graphics workspace, the TV Studio switcher's Graphics tab
// and Stage. Every instance talks to the same origin-wide playout (cgPlayout
// sharedPlayout), so a graphic taken here shows on every output at once.
//
// Keys (when focus is not in a text field): Enter / F9 = TAKE, Esc = OUT ALL,
// ↑ / ↓ = cue previous / next, 1–6 = OUT slot, Shift+Backspace = CLEAR (no animation).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sharedPlayout, CG_SLOTS, defaultSlotFor, type CgPlayoutState, type CgSlotId, type CgPlayout } from '../../../services/fabula/cg/cgPlayout';
import { createCgOverlayCanvas } from '../../../services/fabula/cg/cgOutput';
import { findCgGraphic, isCgDrag, readCgDragData, setCgDragData } from '../../../services/fabula/cg/cgLibrary';
import { ensureCgFonts } from '../../../services/fabula/cg/cgRender';
import { CG_DRAG_MIME, type CgGraphicRef } from '../../../services/fabula/cg/cgTypes';
import { CgThumb } from './CgThumb';
import { openCgOutputWindow } from './cgOutputWindow';

function usePlayout(p: CgPlayout): CgPlayoutState {
  const [s, setS] = useState(p.state);
  useEffect(() => p.subscribe(setS), [p]);
  return s;
}

const SLOT_KEYS: CgSlotId[] = ['L1', 'L2', 'TICKER', 'BUG', 'FULL', 'STINGER'];

export const CgLivePanel: React.FC<{ ping?: (m: string) => void; compact?: boolean; onCut?: () => void; title?: string }> = ({ ping, compact, onCut, title }) => {
  const playout = useMemo(() => sharedPlayout({ master: true }), []);
  const state = usePlayout(playout);
  const pgmRef = useRef<HTMLCanvasElement>(null);
  const [dropOver, setDropOver] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const preview = state.rundown[state.cursor];
  const previewG = preview ? findCgGraphic(preview.ref) : undefined;

  // Program monitor: the same self-idling overlay canvas every output uses.
  useEffect(() => {
    const c = pgmRef.current; if (!c) return;
    const h = createCgOverlayCanvas(playout, { canvas: c, width: 960, height: 540 });
    return () => h.stop();
  }, [playout]);
  // Switchers subscribe to the stinger cut point.
  useEffect(() => (onCut ? playout.onCut(() => onCut()) : undefined), [playout, onCut]);
  useEffect(() => { for (const r of state.rundown) { const g = findCgGraphic(r.ref); if (g) void ensureCgFonts(g); } }, [state.rundown]);

  const take = () => { const r = playout.takePreview(); if (!r) ping?.('Rundown is empty — drag a graphic in or add one from the library.'); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Only while this panel is actually on screen (hosts keep it mounted behind hidden tabs).
      if (!rootRef.current || rootRef.current.offsetParent === null) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      let handled = true;
      if (e.key === 'Enter' || e.key === 'F9') take();
      else if (e.key === 'Escape') playout.outAll();
      else if (e.key === 'ArrowDown') playout.cue(state.cursor + 1);
      else if (e.key === 'ArrowUp') playout.cue(state.cursor - 1);
      else if (e.key === 'Backspace' && e.shiftKey) playout.clear();
      else if (/^[1-6]$/.test(e.key) && !e.metaKey && !e.ctrlKey) playout.out(SLOT_KEYS[Number(e.key) - 1]);
      else handled = false;
      // Capture phase + stop: while the live panel is up, its keys beat the editor's shortcuts.
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const onDrop = (e: React.DragEvent, at?: number) => {
    setDropOver(false);
    const p = readCgDragData(e.dataTransfer); if (!p) return;
    e.preventDefault(); e.stopPropagation();
    const g = findCgGraphic(p.ref);
    playout.addToRundown(p.ref, p.name, g ? defaultSlotFor(g) : undefined, at);
    ping?.(`${p.name} added to the rundown`);
  };
  const setPreviewField = (k: string, v: string) => { if (preview) playout.updateRundownItem(preview.uid, { ref: { ...preview.ref, fields: { ...(preview.ref.fields || {}), [k]: v } } as CgGraphicRef }); };
  const onAirBySlot = (slot: CgSlotId) => state.onAir.find(a => a.slot === slot && a.outAt == null);

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', gap: 10, width: '100%', height: '100%', minHeight: 0, color: '#e8e8ee', fontSize: 12 }}>
      {/* monitors + controls */}
      <div style={{ flex: compact ? '0 0 auto' : '1 1 60%', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {title && <div className="lbl">{title}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div className="lbl" style={{ color: '#5fd38d' }}>PREVIEW {preview ? `· ${preview.label}` : ''}</div>
            <div style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', outline: '2px solid #2f8a55' }}>
              {previewG ? <CgThumb graphic={previewG} refOverride={preview!.ref} autoplay={false} /> : <div style={{ aspectRatio: '16/9', background: '#14161c', display: 'grid', placeItems: 'center' }} className="dim small">Nothing cued</div>}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ color: '#ff5a5a' }}>PROGRAM · CG</div>
            <div style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', outline: '2px solid #a82a2a', background: 'linear-gradient(135deg,#1b2433,#14161c)' }}>
              <canvas ref={pgmRef} style={{ width: '100%', aspectRatio: '16/9', display: 'block' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="cta" style={{ background: '#c62828', color: '#fff', fontWeight: 800, padding: '8px 22px', borderRadius: 6, border: 0 }} onClick={take} title="Take the previewed graphic to air (Enter / F9)">TAKE</button>
          <button className="minibtn" onClick={() => playout.cue(state.cursor + 1)} title="Cue next (↓)">NEXT ▸</button>
          <button className="minibtn" onClick={() => playout.cue(state.cursor - 1)} title="Cue previous (↑)">◂ PREV</button>
          <button className="minibtn" onClick={() => playout.outAll()} title="Animate everything off (Esc)">OUT ALL</button>
          <button className="minibtn danger" onClick={() => playout.clear()} title="Panic clear — no animation (Shift+Backspace)">CLEAR</button>
          <span style={{ flex: 1 }} />
          <span draggable className="minibtn" style={{ cursor: 'grab' }} title="Drag onto a Stage slide (or the Stage deck) to carry this live CG program on every Stage output"
            onDragStart={(e) => { e.dataTransfer.setData(CG_DRAG_MIME, JSON.stringify({ kind: 'cg-graphic', ref: { graphicId: 'cg:live' }, name: 'Fabula CG · Live program', category: 'frame', live: 'hold', durationHint: 0 })); e.dataTransfer.effectAllowed = 'copy'; }}>⠿ LIVE CG → STAGE</span>
          <button className="minibtn" onClick={() => { if (!openCgOutputWindow(playout, 'fill')) ping?.('Pop-up blocked — allow pop-ups for output windows.'); }} title="Clean fill output for a capture card, OBS or a second display">FILL OUT ⧉</button>
          <button className="minibtn" onClick={() => { if (!openCgOutputWindow(playout, 'key')) ping?.('Pop-up blocked — allow pop-ups for output windows.'); }} title="Key (alpha) output for an external keyer">KEY OUT ⧉</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {CG_SLOTS.map((s, i) => {
            const a = onAirBySlot(s.id);
            return (
              <div key={s.id} style={{ border: `1px solid ${a ? '#c62828' : '#2a2d36'}`, background: a ? 'rgba(198,40,40,.14)' : 'rgba(255,255,255,.02)', borderRadius: 6, padding: '5px 7px', display: 'flex', alignItems: 'center', gap: 6 }} title={s.hint}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: a ? '#ff3b30' : '#444' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dim small" style={{ fontSize: 9 }}>{i + 1} · {s.label.toUpperCase()}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{a ? a.label : '—'}</div>
                </div>
                <button className="minibtn" disabled={!a} onClick={() => playout.out(s.id)}>OUT</button>
              </div>
            );
          })}
        </div>
        {/* live field editor for the cued item */}
        {preview && previewG && previewG.fields.length > 0 && (
          <div style={{ border: '1px solid #2a2d36', borderRadius: 6, padding: 8 }}>
            <div className="lbl">CUED FIELDS · {previewG.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 6, marginTop: 4 }}>
              {previewG.fields.map(f => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="dim small">{f.label}</span>
                  <input className="in" value={preview.ref.fields?.[f.key] ?? f.default} onChange={(e) => setPreviewField(f.key, e.target.value)} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="minibtn blue" disabled={!state.onAir.some(a => a.ref.graphicId === preview.ref.graphicId && a.outAt == null)}
                onClick={() => playout.updateFields(preview.ref.graphicId, preview.ref.fields || {})} title="Push these values to the copy already on air (score, ticker, name fixes) without re-taking">UPDATE ON AIR</button>
              <select className="sel xs" value={preview.slot || defaultSlotFor(previewG)} onChange={(e) => playout.updateRundownItem(preview.uid, { slot: e.target.value as CgSlotId })}>
                {CG_SLOTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* rundown */}
      <div onDragOver={(e) => { if (isCgDrag(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropOver(true); } }} onDragLeave={() => setDropOver(false)} onDrop={(e) => onDrop(e)}
        style={{ flex: compact ? '1 1 auto' : '0 0 34%', minWidth: 220, display: 'flex', flexDirection: 'column', border: `1px dashed ${dropOver ? '#7aa7ff' : '#2a2d36'}`, borderRadius: 8, padding: 8, minHeight: 160, overflow: 'hidden' }}>
        <div className="lbl">RUNDOWN · {state.rundown.length}</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {!state.rundown.length && <div className="dim small" style={{ padding: 16, textAlign: 'center' }}>Drag graphics here from the library, the Fabula timeline or the Graphics designer.</div>}
          {state.rundown.map((r, i) => {
            const g = findCgGraphic(r.ref);
            const live = state.onAir.some(a => a.ref.graphicId === r.ref.graphicId && a.outAt == null);
            return (
              <div key={r.uid} draggable onDragStart={(e) => { if (g) setCgDragData(e.dataTransfer, g, r.ref); e.dataTransfer.setData('application/x-fabula-cg-rundown', r.uid); }}
                onDrop={(e) => { const moved = e.dataTransfer.getData('application/x-fabula-cg-rundown'); if (moved) { e.preventDefault(); e.stopPropagation(); playout.moveRundownItem(moved, i); } else onDrop(e, i); }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => playout.cue(i)} onDoubleClick={() => { playout.cue(i); setTimeout(take, 0); }}
                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 5, borderRadius: 6, cursor: 'pointer', background: i === state.cursor ? 'rgba(47,138,85,.22)' : 'rgba(255,255,255,.03)', border: `1px solid ${live ? '#c62828' : i === state.cursor ? '#2f8a55' : 'transparent'}` }}>
                <span className="mono dim" style={{ width: 18, textAlign: 'right' }}>{i + 1}</span>
                <div style={{ width: 72, flex: '0 0 72px' }}>{g ? <CgThumb graphic={g} refOverride={r.ref} width={144} height={81} /> : null}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                  <div className="dim small">{(r.slot || (g ? defaultSlotFor(g) : 'L1'))}{live ? ' · ON AIR' : ''}</div>
                </div>
                <button className="minibtn" title="Take now" onClick={(e) => { e.stopPropagation(); playout.take(r.ref, { slot: r.slot, label: r.label }); }}>▶</button>
                <button className="minibtn danger" title="Remove" onClick={(e) => { e.stopPropagation(); playout.removeFromRundown(r.uid); }}>✕</button>
              </div>
            );
          })}
        </div>
        <div className="dim small" style={{ marginTop: 6, fontSize: 9 }}>Enter/F9 take · Esc out all · ↑↓ cue · 1–6 out slot · Shift+⌫ clear</div>
      </div>
    </div>
  );
};

export default CgLivePanel;

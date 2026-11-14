// CgDesigner — the authoring surface of Fabula CG. Start from any library
// element (or blank), then edit layers, text, colour, Tela type, motion (IN /
// OUT / LOOP) and data fields against a live, scrubbable preview that uses the
// exact renderer the timeline, switcher and Stage use. Save to My Graphics and
// the result is immediately available everywhere (same-origin storage + drag).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FONTS, TYPE_PAIRINGS } from '../../../services/tela/telaFonts';
import { TITLE_ANIMS } from '../../../services/fabula/titleAnimators';
import { drawCgGraphic, ensureCgFonts, setCgImageReadyListener } from '../../../services/fabula/cg/cgRender';
import { measureTiming, cgDefaultDuration, cgSafeAreaViolations, evaluateCg } from '../../../services/fabula/cg/cgEvaluate';
import { saveUserGraphic, setCgDragData } from '../../../services/fabula/cg/cgLibrary';
import { cgCreditLine } from '../../../services/fabula/cg/cgCouncil';
import { CG_CATEGORIES, CG_W, CG_H, type CgGraphic, type CgLayer, type CgLayerKind, type CgMove, type CgMoveType, type CgEase, type CgLoopType, type CgColor, type CgPalette } from '../../../services/fabula/cg/cgTypes';

const MOVES: CgMoveType[] = ['none', 'fade', 'slideL', 'slideR', 'slideU', 'slideD', 'wipeL', 'wipeR', 'wipeU', 'wipeD', 'wipeCenterX', 'wipeCenterY', 'iris', 'growX', 'growY', 'pop', 'zoom', 'spin', 'drop', 'blur', 'flipX', 'flipY', 'skew'];
const EASES: CgEase[] = ['out', 'in', 'inOut', 'linear', 'back', 'expo', 'quart', 'circ', 'elastic', 'bounce'];
const LOOPS: CgLoopType[] = ['none', 'pulse', 'breathe', 'shimmer', 'sweep', 'float', 'drift', 'rotate', 'blink', 'flip'];
const TOKENS: CgColor[] = ['accent', 'ink', 'paper', 'secondary', 'highlight', 'shade'];
const FONT_KEYS = Object.keys(FONTS);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
let nid = 0;
const newId = (k: string) => `${k}-${Date.now().toString(36)}${(nid++).toString(36)}`;

function blankLayer(kind: CgLayerKind, g: CgGraphic): CgLayer {
  const base = { id: newId(kind), name: kind[0].toUpperCase() + kind.slice(1), kind, x: 760, y: 440, w: 400, h: 200, in: { type: 'fade', dur: .5, ease: 'out' } as CgMove, out: { type: 'fade', dur: .35, ease: 'inOut' } as CgMove };
  switch (kind) {
    case 'text': return { ...base, h: 90, text: 'New text', style: { font: g.fonts.display, weight: 700, size: 64, color: 'ink', align: 'left', maxLines: 2 } };
    case 'ellipse': return { ...base, w: 200, h: 200, fill: 'accent' };
    case 'line': return { ...base, h: 0, stroke: 'accent', strokeWidth: 4 };
    case 'image': return { ...base, src: '', fit: 'cover', radius: 0 };
    case 'ticker': return { ...base, x: 0, y: 990, w: 1920, h: 60, ticker: { field: 'items', speed: 120, gap: 32 }, style: { font: g.fonts.text, weight: 500, size: 30, color: 'ink', align: 'left' } };
    case 'clock': return { ...base, w: 240, h: 70, clock: { mode: 'time' }, style: { font: g.fonts.utility || g.fonts.text, weight: 600, size: 36, color: 'ink', align: 'center' } };
    case 'particles': return { ...base, x: 0, y: 0, w: 1920, h: 1080, fill: 'highlight', deco: { count: 50, size: 3, seed: 3 }, loop: { type: 'drift', period: 10, amount: 0 } };
    case 'glow': return { ...base, fill: 'highlight', opacity: .5, blend: 'screen' };
    default: return { ...base, fill: 'paper' };
  }
}

export function blankGraphic(): CgGraphic {
  return {
    id: 'draft', name: 'Untitled graphic', category: 'lower-third', packageId: 'custom', tags: ['custom'],
    palette: { accent: '#ff3b5c', ink: '#ffffff', paper: '#141824', secondary: '#9aa4b8', highlight: '#ffd166', shade: '#06080e' },
    fonts: { display: 'inter', text: 'inter', utility: 'jetbrains' },
    fields: [{ key: 'name', label: 'Name', type: 'text', default: 'Your Name' }, { key: 'title', label: 'Title', type: 'text', default: 'Your Title' }],
    layers: [
      { id: 'plate', name: 'Plate', kind: 'rect', x: 150, y: 820, w: 760, h: 130, fill: 'paper', in: { type: 'wipeR', dur: .6, ease: 'expo' }, out: { type: 'wipeL', dur: .4, ease: 'inOut' } },
      { id: 'bar', name: 'Accent bar', kind: 'rect', x: 136, y: 820, w: 10, h: 130, fill: 'accent', in: { type: 'growY', dur: .4, ease: 'out', delay: .1 }, out: { type: 'fade', dur: .3 } },
      { id: 'name', name: 'Name', kind: 'text', x: 180, y: 828, w: 700, h: 70, text: '{name}', style: { font: 'inter', weight: 800, size: 56, color: 'ink', align: 'left', maxLines: 1, anim: { type: 'fadeUp', duration: .6, delay: .3, out: .3, stagger: .5 } }, out: { type: 'fade', dur: .3 } },
      { id: 'title', name: 'Title', kind: 'text', x: 180, y: 896, w: 700, h: 44, text: '{title}', style: { font: 'inter', weight: 500, size: 28, color: 'secondary', align: 'left', maxLines: 1, anim: { type: 'fadeUp', duration: .6, delay: .45, out: .3, stagger: .5 } }, out: { type: 'fade', dur: .3 } },
    ],
    timing: { in: 1, out: .4, hold: 5 }, live: 'hold', coverage: 'region', custom: true,
  };
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center', gap: 6, marginTop: 4 }}><span className="dim small">{label}</span><span style={{ display: 'flex', gap: 4, minWidth: 0 }}>{children}</span></label>
);
const Num: React.FC<{ v: number | undefined; on: (n: number) => void; step?: number }> = ({ v, on, step = 1 }) => (
  <input className="in" type="number" step={step} value={Number.isFinite(v as number) ? Math.round((v as number) * 1000) / 1000 : ''} onChange={(e) => on(Number(e.target.value))} style={{ width: '100%', minWidth: 0 }} />
);
const ColorPick: React.FC<{ v: CgColor | undefined; on: (c: CgColor | undefined) => void; palette: CgPalette; allowNone?: boolean }> = ({ v, on, palette, allowNone }) => {
  const isTok = !!v && (TOKENS as string[]).includes(v);
  const hex = isTok ? (palette as any)[v!] : v;
  return (
    <>
      <select className="sel xs" value={!v ? 'none' : isTok ? v : 'custom'} onChange={(e) => on(e.target.value === 'none' ? undefined : e.target.value === 'custom' ? (/^#/.test(hex || '') ? hex : '#ffffff') : e.target.value)} style={{ flex: 1 }}>
        {(allowNone || !v) && <option value="none">none</option>}
        {TOKENS.map(t => <option key={t} value={t}>{t}</option>)}<option value="custom">custom…</option>
      </select>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#ffffff'} onChange={(e) => on(e.target.value)} style={{ width: 30 }} />
    </>
  );
};

const MoveEditor: React.FC<{ label: string; m: CgMove | undefined; on: (m: CgMove | undefined) => void }> = ({ label, m, on }) => (
  <div style={{ marginTop: 6 }}>
    <div className="dim small">{label}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr .8fr .8fr', gap: 4 }}>
      <select className="sel xs" value={m?.type || 'none'} onChange={(e) => on(e.target.value === 'none' ? { type: 'none', dur: 0 } : { dur: .5, ease: 'out', ...(m || {}), type: e.target.value as CgMoveType })}>{MOVES.map(x => <option key={x}>{x}</option>)}</select>
      <select className="sel xs" value={m?.ease || 'out'} onChange={(e) => m && on({ ...m, ease: e.target.value as CgEase })}>{EASES.map(x => <option key={x}>{x}</option>)}</select>
      <input className="in" type="number" step={.05} title="Duration (s)" value={m?.dur ?? 0} onChange={(e) => m && on({ ...m, dur: Math.max(0, Number(e.target.value)) })} />
      <input className="in" type="number" step={.05} title="Delay (s)" value={m?.delay ?? 0} onChange={(e) => m && on({ ...m, delay: Math.max(0, Number(e.target.value)) })} />
    </div>
  </div>
);

export const CgDesigner: React.FC<{
  graphic: CgGraphic;
  onChange?: (g: CgGraphic) => void;
  onSendToTimeline?: (g: CgGraphic) => void;
  onAddToRundown?: (g: CgGraphic) => void;
  onTakeLive?: (g: CgGraphic) => void;
  onOpenInTela?: (g: CgGraphic) => void;
  ping?: (m: string) => void;
}> = ({ graphic, onChange, onSendToTimeline, onAddToRundown, onTakeLive, onOpenInTela, ping }) => {
  const [g, setG] = useState<CgGraphic>(() => clone(graphic));
  const [sel, setSel] = useState<string | null>(g.layers[0]?.id || null);
  const [t, setT] = useState(() => g.timing.in + .5);
  const [playing, setPlaying] = useState(false);
  const [guides, setGuides] = useState(true);
  const [ground, setGround] = useState<'dark' | 'checker' | 'light'>('dark');
  const [fontsTick, setFontsTick] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; scale: number } | null>(null);

  useEffect(() => { setG(clone(graphic)); setSel(graphic.layers[0]?.id || null); setT(graphic.timing.in + .5); }, [graphic]);
  useEffect(() => { onChange?.(g); }, [g]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let alive = true; ensureCgFonts(g).then(() => alive && setFontsTick(n => n + 1)); setCgImageReadyListener(() => setFontsTick(n => n + 1)); return () => { alive = false; }; }, [g.fonts.display, g.fonts.text, g.fonts.utility, g.layers.map(l => l.style?.font).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const D = g.live === 'transition' ? g.timing.in + g.timing.out : g.timing.in + g.timing.hold + g.timing.out;
  const layer = g.layers.find(l => l.id === sel) || null;
  const update = (fn: (draft: CgGraphic) => void) => setG(prev => { const n = clone(prev); fn(n); return n; });
  const patchLayer = (patch: Partial<CgLayer>) => update(n => { const i = n.layers.findIndex(l => l.id === sel); if (i >= 0) n.layers[i] = { ...n.layers[i], ...patch }; });
  const retime = () => update(n => { const m = measureTiming(n); n.timing.in = m.in; n.timing.out = Math.max(.2, m.out); });

  // playback
  useEffect(() => {
    if (!playing) return;
    let raf = 0; const t0 = performance.now() - t * 1000;
    const tick = () => { const nt = (performance.now() - t0) / 1000; if (nt >= D) { setT(0); setPlaying(false); return; } setT(nt); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // draw
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const host = c.parentElement!; const w = host.clientWidth; const h = Math.round(w * 9 / 16);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d')!; const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    drawCgGraphic(ctx, g, t, D, W, H, null, { now: Date.now() });
    const k = W / CG_W;
    if (guides) {
      ctx.save(); ctx.strokeStyle = 'rgba(120,200,255,.35)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
      ctx.strokeRect(W * .05, H * .05, W * .9, H * .9); ctx.strokeStyle = 'rgba(255,200,120,.3)'; ctx.strokeRect(W * .1, H * .1, W * .8, H * .8);
      ctx.restore();
    }
    if (layer) {
      ctx.save(); ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([]);
      ctx.strokeRect(layer.x * k, layer.y * k, Math.max(2, layer.w * k), Math.max(2, layer.h * k));
      ctx.restore();
    }
  });
  void fontsTick;

  const toDesign = (e: React.MouseEvent) => { const r = cv.current!.getBoundingClientRect(); const s = CG_W / r.width; return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s, s }; };
  const onDown = (e: React.MouseEvent) => {
    const p = toDesign(e);
    const hit = [...g.layers].reverse().find(l => !l.hidden && !l.locked && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y - 4 && p.y <= l.y + Math.max(8, l.h));
    if (!hit) { setSel(null); return; }
    setSel(hit.id);
    drag.current = { id: hit.id, sx: p.x, sy: p.y, ox: hit.x, oy: hit.y, scale: p.s };
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current; if (!d) return;
    const p = toDesign(e);
    let x = Math.round(d.ox + p.x - d.sx), y = Math.round(d.oy + p.y - d.sy);
    if (!e.altKey) { x = Math.round(x / 2) * 2; y = Math.round(y / 2) * 2; }
    update(n => { const l = n.layers.find(q => q.id === d.id); if (l) { l.x = x; l.y = y; } });
  };
  const onUp = () => { drag.current = null; };

  const violations = useMemo(() => cgSafeAreaViolations(g), [g]);
  const phase = evaluateCg(g, t, D).phase;
  const credit = cgCreditLine(g.credit);

  const save = () => { const saved = saveUserGraphic({ ...g, timing: { ...g.timing }, custom: true }); setG(saved); ping?.(`Saved "${saved.name}" to My Graphics — available in Fabula, the switcher and Stage.`); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr) 280px', gap: 10, height: '100%', minHeight: 0, color: '#e8e8ee', fontSize: 12, boxSizing: 'border-box' }}>
      {/* layers */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid #2a2d36', borderRadius: 8, padding: 8 }}>
        <div className="lbl">LAYERS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '4px 0 6px' }}>
          {(['rect', 'ellipse', 'text', 'image', 'line', 'ticker', 'clock', 'glow', 'particles'] as CgLayerKind[]).map(k => (
            <button key={k} className="minibtn" style={{ fontSize: 9 }} onClick={() => { const l = blankLayer(k, g); update(n => { n.layers.push(l); if (k === 'ticker' && !n.fields.some(f => f.key === 'items')) n.fields.push({ key: 'items', label: 'Ticker items', type: 'list', default: 'First item | Second item | Third item' }); }); setSel(l.id); }}>+{k}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {[...g.layers].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
            <div key={l.id} onClick={() => setSel(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 5px', borderRadius: 5, cursor: 'pointer', background: sel === l.id ? 'rgba(255,140,0,.16)' : 'transparent', opacity: l.hidden ? .45 : 1 }}>
              <span className="mono dim" style={{ fontSize: 9, width: 44 }}>{l.kind}</span>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
              <button className="minibtn" style={{ fontSize: 8, padding: '0 4px' }} title="Show/hide" onClick={(e) => { e.stopPropagation(); update(n => { n.layers[i].hidden = !n.layers[i].hidden; }); }}>{l.hidden ? '◌' : '●'}</button>
              <button className="minibtn" style={{ fontSize: 8, padding: '0 4px' }} title="Lock" onClick={(e) => { e.stopPropagation(); update(n => { n.layers[i].locked = !n.layers[i].locked; }); }}>{l.locked ? '🔒' : '·'}</button>
            </div>
          ))}
        </div>
        {layer && (
          <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
            <button className="minibtn" title="Bring forward" onClick={() => update(n => { const i = n.layers.findIndex(l => l.id === sel); if (i < n.layers.length - 1) [n.layers[i], n.layers[i + 1]] = [n.layers[i + 1], n.layers[i]]; })}>▲</button>
            <button className="minibtn" title="Send backward" onClick={() => update(n => { const i = n.layers.findIndex(l => l.id === sel); if (i > 0) [n.layers[i], n.layers[i - 1]] = [n.layers[i - 1], n.layers[i]]; })}>▼</button>
            <button className="minibtn" title="Duplicate" onClick={() => { const c = { ...clone(layer), id: newId(layer.kind), name: layer.name + ' copy', x: layer.x + 20, y: layer.y + 20 }; update(n => { n.layers.push(c); }); setSel(c.id); }}>⧉</button>
            <button className="minibtn danger" title="Delete" onClick={() => { update(n => { n.layers = n.layers.filter(l => l.id !== sel); }); setSel(null); }}>✕</button>
          </div>
        )}
      </div>

      {/* stage */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="in" value={g.name} onChange={(e) => update(n => { n.name = e.target.value; })} style={{ flex: '1 1 200px', fontWeight: 700 }} />
          <button className="minibtn blue" onClick={save}>SAVE TO MY GRAPHICS</button>
          {onSendToTimeline && <button className="minibtn" onClick={() => onSendToTimeline(g)}>→ TIMELINE</button>}
          {onAddToRundown && <button className="minibtn" onClick={() => onAddToRundown(g)}>+ RUNDOWN</button>}
          {onTakeLive && <button className="minibtn" style={{ color: '#ff6b6b' }} onClick={() => onTakeLive(g)}>TAKE LIVE</button>}
          {onOpenInTela && <button className="minibtn" onClick={() => onOpenInTela(g)} title="Open the resting frame in Tela as editable vectors">OPEN IN TELA</button>}
          <span draggable onDragStart={(e) => setCgDragData(e.dataTransfer, { ...g, custom: true, id: g.id === 'draft' ? `user.draft${Date.now().toString(36)}` : g.id })} className="minibtn" style={{ cursor: 'grab' }} title="Drag into the timeline, the switcher rundown or Stage">⠿ DRAG</span>
        </div>
        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: ground === 'dark' ? 'linear-gradient(135deg,#1b2433,#2b2f3a 55%,#14161c)' : ground === 'light' ? '#d9dce3' : 'repeating-conic-gradient(#2a2a2a 0% 25%, #1c1c1c 0% 50%) 50% / 24px 24px' }}>
          <canvas ref={cv} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ width: '100%', aspectRatio: '16/9', display: 'block', cursor: drag.current ? 'grabbing' : 'crosshair' }} />
          <div className="mono" style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, background: 'rgba(0,0,0,.55)', padding: '2px 6px', borderRadius: 4 }}>{phase.toUpperCase()} · {t.toFixed(2)}s / {D.toFixed(2)}s</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="minibtn" onClick={() => { if (t >= D - .01) setT(0); setPlaying(p => !p); }}>{playing ? '❚❚' : '▶'}</button>
          <button className="minibtn" onClick={() => { setPlaying(false); setT(0); }} title="Start of IN">⏮</button>
          <button className="minibtn" onClick={() => { setPlaying(false); setT(g.timing.in + .2); }}>HOLD</button>
          <button className="minibtn" onClick={() => { setPlaying(false); setT(D - g.timing.out); setPlaying(true); }}>PLAY OUT</button>
          <input type="range" min={0} max={D} step={1 / 60} value={Math.min(t, D)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} style={{ flex: 1 }} />
          <label className="dim small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> safe</label>
          <select className="sel xs" value={ground} onChange={(e) => setGround(e.target.value as typeof ground)}><option value="dark">dark</option><option value="checker">alpha</option><option value="light">light</option></select>
        </div>
        {/* motion timeline: one bar per layer showing IN / OUT windows */}
        <div style={{ border: '1px solid #2a2d36', borderRadius: 8, padding: 6, overflowY: 'auto', maxHeight: 170 }}>
          {[...g.layers].reverse().map(l => {
            const pct = (s: number) => `${Math.max(0, Math.min(100, (s / D) * 100))}%`;
            const inS = l.in && l.in.type !== 'none' ? (l.in.delay || 0) : 0, inE = l.in && l.in.type !== 'none' ? inS + l.in.dur : 0;
            const oM = l.out && l.out.type !== 'none' ? l.out : null;
            const oS = oM ? D - (oM.delay || 0) - oM.dur : D, oE = oM ? D - (oM.delay || 0) : D;
            return (
              <div key={l.id} onClick={() => setSel(l.id)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, alignItems: 'center', height: 16, cursor: 'pointer' }}>
                <span className="dim" style={{ fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: sel === l.id ? '#ffb74d' : undefined }}>{l.name}</span>
                <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,.05)', borderRadius: 4 }}>
                  <div style={{ position: 'absolute', left: pct(inE), width: `calc(${pct(oS)} - ${pct(inE)})`, top: 0, bottom: 0, background: 'rgba(120,160,255,.25)' }} />
                  {inE > inS && <div style={{ position: 'absolute', left: pct(inS), width: `calc(${pct(inE)} - ${pct(inS)})`, top: 0, bottom: 0, background: '#4caf50', borderRadius: 3 }} />}
                  {oM && <div style={{ position: 'absolute', left: pct(oS), width: `calc(${pct(oE)} - ${pct(oS)})`, top: 0, bottom: 0, background: '#e53935', borderRadius: 3 }} />}
                  <div style={{ position: 'absolute', left: pct(t), top: -3, bottom: -3, width: 1, background: '#fff' }} />
                </div>
              </div>
            );
          })}
        </div>
        {violations.length > 0 && <div className="small" style={{ color: '#ffb74d' }}>⚠ Outside title-safe: {violations.map(id => g.layers.find(l => l.id === id)?.name || id).join(', ')}</div>}
        {credit && <div className="dim small">Authored by {credit}</div>}
      </div>

      {/* inspector */}
      <div style={{ overflowY: 'auto', border: '1px solid #2a2d36', borderRadius: 8, padding: 8, minHeight: 0 }}>
        <div className="lbl">GRAPHIC</div>
        <Row label="Category"><select className="sel xs" value={g.category} onChange={(e) => update(n => { n.category = e.target.value as CgGraphic['category']; })} style={{ flex: 1 }}>{CG_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Row>
        <Row label="Live mode"><select className="sel xs" value={g.live} onChange={(e) => update(n => { n.live = e.target.value as CgGraphic['live']; if (n.live === 'transition') n.timing.cutPoint = n.timing.in; })} style={{ flex: 1 }}><option value="hold">Hold until OUT</option><option value="auto">Auto out after hold</option><option value="transition">Transition (stinger)</option></select></Row>
        <Row label="Coverage"><select className="sel xs" value={g.coverage} onChange={(e) => update(n => { n.coverage = e.target.value as CgGraphic['coverage']; })} style={{ flex: 1 }}><option value="region">Keyed region</option><option value="full">Full frame</option></select></Row>
        <Row label="IN / OUT"><Num v={g.timing.in} step={.05} on={(v) => update(n => { n.timing.in = Math.max(0, v); })} /><Num v={g.timing.out} step={.05} on={(v) => update(n => { n.timing.out = Math.max(0, v); })} /></Row>
        <Row label="Hold (s)"><Num v={g.timing.hold} step={.5} on={(v) => update(n => { n.timing.hold = Math.max(0, v); })} /><button className="minibtn" onClick={retime} title="Measure IN/OUT from the layer motion">MEASURE</button></Row>
        {g.live === 'transition' && <Row label="Cut at (s)"><Num v={g.timing.cutPoint} step={.02} on={(v) => update(n => { n.timing.cutPoint = Math.max(0, v); })} /></Row>}
        <div className="lbl" style={{ marginTop: 8 }}>PALETTE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
          {(Object.keys(g.palette) as (keyof CgPalette)[]).map(k => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', fontSize: 9 }} className="dim">{k}
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(g.palette[k]) ? g.palette[k] : '#000000'} onChange={(e) => update(n => { n.palette[k] = e.target.value; })} />
            </label>
          ))}
        </div>
        <div className="lbl" style={{ marginTop: 8 }}>TELA TYPE</div>
        <Row label="Pairing"><select className="sel xs" value="" onChange={(e) => { const p = TYPE_PAIRINGS.find(x => x.id === e.target.value); if (!p) return; update(n => { const map: Record<string, string> = { [n.fonts.display]: p.display, [n.fonts.text]: p.text, ...(n.fonts.utility ? { [n.fonts.utility]: p.utility } : {}) }; n.layers.forEach(l => { if (l.style && map[l.style.font]) l.style.font = map[l.style.font]; }); n.fonts = { display: p.display, text: p.text, utility: p.utility }; }); }} style={{ flex: 1 }}>
          <option value="">Apply a pairing…</option>{TYPE_PAIRINGS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.mood}</option>)}
        </select></Row>
        <div className="lbl" style={{ marginTop: 8 }}>FIELDS</div>
        {g.fields.map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 22px', gap: 4, marginTop: 3 }}>
            <input className="in" value={f.key} title="Field key — use {key} in text layers" onChange={(e) => update(n => { n.fields[i].key = e.target.value.replace(/\W/g, ''); })} />
            <input className="in" value={f.default} onChange={(e) => update(n => { n.fields[i].default = e.target.value; n.fields[i].label = n.fields[i].label || n.fields[i].key; })} />
            <button className="minibtn danger" onClick={() => update(n => { n.fields.splice(i, 1); })}>✕</button>
          </div>
        ))}
        <button className="minibtn" style={{ marginTop: 4 }} onClick={() => update(n => { const k = `field${n.fields.length + 1}`; n.fields.push({ key: k, label: k, type: 'text', default: '' }); })}>+ FIELD</button>

        {layer && (
          <>
            <div className="lbl" style={{ marginTop: 10 }}>LAYER · {layer.kind.toUpperCase()}</div>
            <Row label="Name"><input className="in" value={layer.name} onChange={(e) => patchLayer({ name: e.target.value })} style={{ flex: 1 }} /></Row>
            <Row label="X / Y"><Num v={layer.x} on={(v) => patchLayer({ x: v })} /><Num v={layer.y} on={(v) => patchLayer({ y: v })} /></Row>
            <Row label="W / H"><Num v={layer.w} on={(v) => patchLayer({ w: v })} /><Num v={layer.h} on={(v) => patchLayer({ h: v })} /></Row>
            <Row label="Opacity"><input type="range" min={0} max={1} step={.01} value={layer.opacity ?? 1} onChange={(e) => patchLayer({ opacity: Number(e.target.value) })} style={{ flex: 1 }} /></Row>
            {['rect', 'ellipse', 'path', 'particles', 'glow', 'bars', 'grid'].includes(layer.kind) && <Row label="Fill"><ColorPick v={layer.fill} palette={g.palette} allowNone on={(c) => patchLayer({ fill: c, gradient: undefined })} /></Row>}
            {layer.kind === 'rect' && <Row label="Radius/Skew"><Num v={layer.radius || 0} on={(v) => patchLayer({ radius: v })} /><Num v={layer.skew || 0} on={(v) => patchLayer({ skew: v })} /></Row>}
            {['rect', 'ellipse', 'line'].includes(layer.kind) && <Row label="Stroke"><ColorPick v={layer.stroke} palette={g.palette} allowNone on={(c) => patchLayer({ stroke: c })} /><Num v={layer.strokeWidth || 0} on={(v) => patchLayer({ strokeWidth: v })} /></Row>}
            <Row label="Blend"><select className="sel xs" value={layer.blend || 'normal'} onChange={(e) => patchLayer({ blend: e.target.value as CgLayer['blend'] })} style={{ flex: 1 }}>{['normal', 'screen', 'multiply', 'overlay', 'lighter', 'difference', 'soft-light', 'color-dodge'].map(b => <option key={b}>{b}</option>)}</select></Row>
            {layer.kind === 'image' && <Row label="Source"><input className="in" value={layer.src || ''} placeholder="field key or https://…" onChange={(e) => patchLayer({ src: e.target.value })} style={{ flex: 1 }} /></Row>}
            {layer.kind === 'clock' && layer.clock && <Row label="Clock"><select className="sel xs" value={layer.clock.mode} onChange={(e) => patchLayer({ clock: { ...layer.clock!, mode: e.target.value as any } })} style={{ flex: 1 }}>{['time', 'time24', 'date', 'countdown', 'countup'].map(m => <option key={m}>{m}</option>)}</select><input className="in" placeholder="field" value={layer.clock.field || ''} onChange={(e) => patchLayer({ clock: { ...layer.clock!, field: e.target.value || undefined } })} style={{ width: 70 }} /></Row>}
            {layer.kind === 'ticker' && layer.ticker && <Row label="Field/speed"><input className="in" value={layer.ticker.field} onChange={(e) => patchLayer({ ticker: { ...layer.ticker!, field: e.target.value } })} /><Num v={layer.ticker.speed} on={(v) => patchLayer({ ticker: { ...layer.ticker!, speed: v } })} /></Row>}
            {layer.style && (
              <>
                {layer.kind === 'text' && <Row label="Text"><textarea className="in" rows={2} value={layer.text || ''} onChange={(e) => patchLayer({ text: e.target.value })} style={{ flex: 1 }} /></Row>}
                <Row label="Font"><select className="sel xs" value={layer.style.font} onChange={(e) => patchLayer({ style: { ...layer.style!, font: e.target.value } })} style={{ flex: 1 }}>{FONT_KEYS.map(k => <option key={k} value={k}>{(FONTS as any)[k].family}</option>)}</select></Row>
                <Row label="Size/Wt"><Num v={layer.style.size} on={(v) => patchLayer({ style: { ...layer.style!, size: v } })} /><Num v={layer.style.weight} step={100} on={(v) => patchLayer({ style: { ...layer.style!, weight: v } })} /></Row>
                <Row label="Colour"><ColorPick v={layer.style.color} palette={g.palette} on={(c) => patchLayer({ style: { ...layer.style!, color: c || 'ink' } })} /></Row>
                <Row label="Align"><select className="sel xs" value={layer.style.align} onChange={(e) => patchLayer({ style: { ...layer.style!, align: e.target.value as any } })}>{['left', 'center', 'right'].map(a => <option key={a}>{a}</option>)}</select><select className="sel xs" value={layer.style.valign || 'middle'} onChange={(e) => patchLayer({ style: { ...layer.style!, valign: e.target.value as any } })}>{['top', 'middle', 'bottom'].map(a => <option key={a}>{a}</option>)}</select></Row>
                <Row label="Track/Lines"><Num v={layer.style.tracking || 0} step={.01} on={(v) => patchLayer({ style: { ...layer.style!, tracking: v } })} /><Num v={layer.style.maxLines || 2} on={(v) => patchLayer({ style: { ...layer.style!, maxLines: Math.max(1, v) } })} /></Row>
                <Row label="Case"><label className="dim small"><input type="checkbox" checked={!!layer.style.upper} onChange={(e) => patchLayer({ style: { ...layer.style!, upper: e.target.checked } })} /> UPPER</label><label className="dim small"><input type="checkbox" checked={!!layer.style.italic} onChange={(e) => patchLayer({ style: { ...layer.style!, italic: e.target.checked } })} /> italic</label><label className="dim small"><input type="checkbox" checked={!!layer.style.shadow} onChange={(e) => patchLayer({ style: { ...layer.style!, shadow: e.target.checked ? { color: 'rgba(0,0,0,.6)', blur: 12, y: 2 } : undefined } })} /> shadow</label></Row>
                {layer.kind === 'text' && <Row label="Type anim"><select className="sel xs" value={layer.style.anim?.type || 'none'} onChange={(e) => patchLayer({ style: { ...layer.style!, anim: { duration: .7, delay: (layer.in?.delay || 0) + .2, out: .3, stagger: .5, ...(layer.style!.anim || {}), type: e.target.value as any } } })} style={{ flex: 1 }}>{TITLE_ANIMS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Row>}
              </>
            )}
            <MoveEditor label="IN  (move · ease · dur · delay)" m={layer.in} on={(m) => patchLayer({ in: m })} />
            <MoveEditor label="OUT (move · ease · dur · lead)" m={layer.out} on={(m) => patchLayer({ out: m })} />
            <div style={{ marginTop: 6 }}>
              <div className="dim small">LOOP while on air</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 4 }}>
                <select className="sel xs" value={layer.loop?.type || 'none'} onChange={(e) => patchLayer({ loop: e.target.value === 'none' ? undefined : { period: 3, ...(layer.loop || {}), type: e.target.value as CgLoopType } })}>{LOOPS.map(x => <option key={x}>{x}</option>)}</select>
                <input className="in" type="number" step={.1} title="Period (s)" value={layer.loop?.period ?? 3} onChange={(e) => layer.loop && patchLayer({ loop: { ...layer.loop, period: Math.max(.1, Number(e.target.value)) } })} />
                <input className="in" type="number" step={.01} title="Amount" value={layer.loop?.amount ?? ''} onChange={(e) => layer.loop && patchLayer({ loop: { ...layer.loop, amount: e.target.value === '' ? undefined : Number(e.target.value) } })} />
              </div>
            </div>
          </>
        )}
        <div className="dim small" style={{ marginTop: 10 }}>Timeline length: {cgDefaultDuration(g).toFixed(1)}s · {g.layers.length} layers</div>
      </div>
    </div>
  );
};

export default CgDesigner;

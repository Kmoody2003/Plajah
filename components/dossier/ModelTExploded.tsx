/**
 * Interactive exploded Model T with an optional old-film look. Lazy-loaded by DossierHall so three.js
 * stays out of the main bundle. The film look is a CSS grade on the canvas plus a 2D overlay (grain,
 * scratches, dust) redrawn at about 16 fps; it is robust (no custom shaders) and can be switched off.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { MODEL_T_DISCLAIMER, MODEL_T_GROUP_LABELS, MODEL_T_PARTS, type ModelTGroup, type ModelTPartId } from '../../data/dossier/modelTParts';
import { MODEL_T_VIEWS, ModelTScene, Ticker, type SceneCtx, type ViewName } from './ModelTScene';

const FPS = 16;
const GRADE = 'grayscale(1) sepia(.5) contrast(1.18) brightness(.86)';

const CSS = `
.mt{container-type:inline-size;margin:18px 0 22px;color:var(--dh-ink,#f2ecf6)}
.mt-grid{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:14px}
@container (max-width:680px){.mt-grid{grid-template-columns:1fr}}
.mt-stage{position:relative;overflow:hidden;border-radius:8px;border:1px solid var(--dh-line,rgba(255,255,255,.1));background:#b2ada1;aspect-ratio:16/10;min-height:300px;outline:none}
@container (max-width:680px){.mt-stage{aspect-ratio:4/3;min-height:260px}.mt-tag{font-size:10px;padding:3px 8px}}
.mt-stage:focus-visible{box-shadow:0 0 0 2px #FF8C00}
.mt-weave{position:absolute;inset:-6px;will-change:transform,filter}
.mt-film .mt-weave{filter:${GRADE}}
.mt-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:normal;image-rendering:auto}
.mt-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 48%,transparent 42%,rgba(8,5,2,.55) 100%)}
.mt-soft{position:absolute;inset:0;pointer-events:none;backdrop-filter:blur(2.5px);-webkit-backdrop-filter:blur(2.5px);-webkit-mask-image:radial-gradient(ellipse at 50% 50%,transparent 62%,#000 100%);mask-image:radial-gradient(ellipse at 50% 50%,transparent 62%,#000 100%)}
.mt-tag{position:absolute;left:8px;bottom:8px;max-width:calc(100% - 16px);font-size:11px;line-height:1.35;padding:4px 9px;border-radius:999px;background:rgba(13,11,16,.72);color:#f2ecf6;pointer-events:none}
.mt-fallback{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:#2a2620;font-size:14px}
.mt-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-top:10px;font-size:13px}
.mt-controls label{display:flex;align-items:center;gap:8px;flex:1 1 220px;min-width:0}
.mt-controls input[type=range]{flex:1;min-width:80px;accent-color:var(--pj-orange,#FF8C00)}
.mt-btn{border:1px solid var(--dh-line,rgba(255,255,255,.2));background:rgba(255,255,255,.05);color:inherit;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer}
.mt-btn:hover,.mt-btn:focus-visible{border-color:rgba(240,201,135,.7);outline:none}
.mt-btn[aria-pressed=true]{background:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055));border-color:transparent;color:#fff}
.mt-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.mt-panel{border:1px solid var(--dh-line,rgba(255,255,255,.1));border-radius:8px;padding:12px 14px;background:rgba(255,255,255,.03);min-height:150px}
.mt-panel h4{margin:0 0 6px;font-size:16px;font-family:'Fraunces',Georgia,serif;font-weight:600}
.mt-panel p{margin:0 0 8px;font-size:14px;line-height:1.5}
.mt-claim{border-left:3px solid var(--pj-success,#06D6A0);padding-left:10px;font-size:13px;line-height:1.5}
.mt-claim.none{border-left-color:var(--pj-warning,#F59E0B);color:var(--dh-mute,rgba(242,236,246,.7))}
.mt-claim b{display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin-bottom:2px}
.mt-list{display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto;padding:2px}
@container (max-width:680px){.mt-list{max-height:none}}
.mt-list .mt-btn{padding:5px 10px}
.mt-grp{display:flex;flex-wrap:wrap;gap:6px}
.mt-grp h5{flex:0 0 100%;margin:2px 0 0;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.65;font-weight:600}
.mt-views{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.mt-views>span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.65;margin-right:2px}
.mt-note{font-size:12px;line-height:1.5;color:var(--dh-mute,rgba(242,236,246,.65));margin:8px 0 0}
@media(prefers-reduced-motion:reduce){.mt-weave{will-change:auto}}
`;

function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const f = () => setR(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return r;
}

/** Film grain / scratches / dust drawn on a small 2D canvas, about 16 times a second. */
function useFilmOverlay(canvasRef: React.RefObject<HTMLCanvasElement | null>, weaveRef: React.RefObject<HTMLDivElement | null>, on: boolean, animate: boolean, running: boolean) {
  useEffect(() => {
    const cv = canvasRef.current;
    if (!on || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = Math.max(2, Math.round(w / 2)); cv.height = Math.max(2, Math.round(h / 2));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    // grain tiles
    const tiles: HTMLCanvasElement[] = [];
    for (let k = 0; k < 5; k++) {
      const t = document.createElement('canvas'); t.width = t.height = 128;
      const tc = t.getContext('2d')!; const img = tc.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 0 : 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 70;
      }
      tc.putImageData(img, 0, 0); tiles.push(t);
    }
    const patterns = tiles.map(t => ctx.createPattern(t, 'repeat')!);
    let scratches: Array<{ x: number; y0: number; y1: number; life: number; dark: boolean }> = [];
    let wx = 0, wy = 0, wr = 0;
    let flick = 1;

    const draw = () => {
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.translate(-Math.random() * 128, -Math.random() * 128);
      ctx.fillStyle = patterns[Math.floor(Math.random() * patterns.length)];
      ctx.fillRect(0, 0, w + 128, h + 128);
      ctx.restore();
      if (!animate) return;
      // scratches persist a couple of frames
      if (Math.random() < 0.18) scratches.push({ x: Math.random() * w, y0: Math.random() * h * 0.5, y1: h * (0.5 + Math.random() * 0.5), life: 2 + Math.floor(Math.random() * 3), dark: Math.random() < 0.3 });
      scratches = scratches.filter(s => s.life-- > 0);
      for (const s of scratches) {
        ctx.strokeStyle = s.dark ? 'rgba(20,12,4,.35)' : 'rgba(255,248,230,.32)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y0); ctx.lineTo(s.x + (Math.random() - 0.5) * 1.2, s.y1); ctx.stroke();
      }
      // dust specks
      const n = 2 + Math.floor(Math.random() * 7);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = Math.random() < 0.6 ? 'rgba(15,10,5,.55)' : 'rgba(255,250,235,.55)';
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 0.5 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      // gate weave and flicker on the graded canvas
      const wv = weaveRef.current;
      if (wv) {
        wx = wx * 0.6 + (Math.random() - 0.5) * 3.2; wy = wy * 0.6 + (Math.random() - 0.5) * 3.2; wr = wr * 0.6 + (Math.random() - 0.5) * 0.25;
        flick = 0.94 + Math.random() * 0.12;
        wv.style.transform = `translate(${wx.toFixed(2)}px,${wy.toFixed(2)}px) rotate(${wr.toFixed(3)}deg)`;
        wv.style.filter = `grayscale(1) sepia(.55) contrast(1.18) brightness(${(0.86 * flick).toFixed(3)})`;
      }
    };
    draw();
    let id = 0;
    if (animate && running) id = window.setInterval(draw, 1000 / FPS);
    return () => {
      window.clearInterval(id); ro.disconnect();
      const wv = weaveRef.current;
      if (wv) { wv.style.transform = ''; wv.style.filter = ''; }
    };
  }, [on, animate, running, canvasRef, weaveRef]);
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="mt-fallback">The 3D view is not available on this device. The part list still describes every part.</div>
      : this.props.children;
  }
}

export default function ModelTExploded() {
  const reduced = useReducedMotion();
  const [film, setFilm] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [explode, setExplode] = useState(0);
  const [selected, setSelected] = useState<ModelTPartId | null>(null);
  const [hovered, setHovered] = useState<ModelTPartId | null>(null);
  const [idle, setIdle] = useState(true);
  const [visible, setVisible] = useState(true);
  const [showTop, setShowTop] = useState(false);
  const target = useRef(0);
  const smooth = useRef(0);
  const bounds = useRef(new THREE.Box3());
  const viewReq = useRef<{ id: ViewName; n: number }>({ id: '3q', n: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const weave = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const idleTimer = useRef(0);
  const small = typeof window !== 'undefined' && window.innerWidth < 700;

  // The explosion target lives in a ref so dragging the slider never re-renders the 3D scene.
  const setLevel = useCallback((v: number) => {
    const c = Math.min(1, Math.max(0, v));
    target.current = c; setExplode(c);
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const onInteract = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 4000);
  }, []);

  const ctx = useMemo<SceneCtx>(() => ({ target, smooth, bounds, view: viewReq, showTop, selected, hovered, onSelect: setSelected, onHover: setHovered }), [selected, hovered, showTop]);

  const goView = useCallback((id: ViewName) => {
    viewReq.current = { id, n: viewReq.current.n + 1 };
    setIdle(false); // a chosen view stays put until the viewer drags and lets go
    window.clearTimeout(idleTimer.current);
  }, []);
  const toggleTop = () => setShowTop(v => {
    if (v) setSelected(sel => (sel === 'top-bows' || sel === 'top-cover' ? null : sel));
    return !v;
  });
  const shownParts = useMemo(() => MODEL_T_PARTS.filter(p => !p.optional || showTop), [showTop]);
  const groups = useMemo(() => {
    const out: Array<{ id: ModelTGroup; parts: typeof MODEL_T_PARTS }> = [];
    for (const p of shownParts) {
      let g = out.find(x => x.id === p.group);
      if (!g) { g = { id: p.group, parts: [] }; out.push(g); }
      g.parts.push(p);
    }
    return out;
  }, [shownParts]);

  useFilmOverlay(overlay, weave, film, film && !reduced, visible);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    let v: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v = target.current + step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v = target.current - step;
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 1;
    if (v == null) return;
    e.preventDefault(); e.stopPropagation(); // do not let the hall treat arrows as room changes
    setLevel(v);
  };

  const part = selected ? MODEL_T_PARTS.find(p => p.id === selected)! : null;
  const frameloop = !visible ? 'never' : film ? 'demand' : 'always';
  const pct = Math.round(explode * 100);

  return (
    <section className={`mt${film ? ' mt-film' : ''}`} aria-label="Exploded Model T">
      <style>{CSS}</style>
      <div className="mt-grid">
        <div>
          <div
            className="mt-stage" ref={stage} tabIndex={0} onKeyDown={onKey}
            role="group" aria-label="3D Model T. Drag to turn, pinch or scroll to zoom. Arrow keys assemble and explode it."
          >
            <div className="mt-weave" ref={weave}>
              <Boundary>
                <Canvas
                  shadows frameloop={frameloop} dpr={[1, small ? 1.5 : 2]}
                  camera={{ position: [300, 170, 330], fov: 34, near: 5, far: 6000 }}
                  gl={{ antialias: true, powerPreference: 'high-performance' }}
                  onCreated={({ gl }) => { gl.shadowMap.type = THREE.BasicShadowMap; }}
                  onPointerMissed={() => setSelected(null)}
                >
                  <Ticker fps={FPS} on={film && visible} />
                  <ModelTScene ctx={ctx} autoRotate={!reduced && idle && !selected} shadowSize={small ? 1024 : 2048} onInteract={onInteract} />
                </Canvas>
              </Boundary>
            </div>
            {film && <canvas ref={overlay} className="mt-overlay" aria-hidden />}
            {film && <div className="mt-vig" aria-hidden />}
            {film && <div className="mt-soft" aria-hidden />}
            <div className="mt-tag">{MODEL_T_DISCLAIMER}</div>
          </div>

          <div className="mt-controls">
            <label>
              <span>Assembled</span>
              <input
                type="range" min={0} max={100} step={1} value={pct}
                onChange={e => setLevel(Number(e.target.value) / 100)}
                aria-label="Assembled to exploded" aria-valuetext={`${pct} percent exploded`}
              />
              <span>Exploded</span>
            </label>
            <button className="mt-btn" onClick={() => setLevel(explode > 0.5 ? 0 : 1)}>{explode > 0.5 ? 'Assemble' : 'Explode'}</button>
            <button className="mt-btn" aria-pressed={film} onClick={() => setFilm(f => !f)} title="Old-footage look on or off">Film look</button>
            <button className="mt-btn" aria-pressed={showTop} onClick={toggleTop} title="Show the folding top and its bows">Folding top</button>
          </div>
          <div className="mt-controls mt-views" role="group" aria-label="Camera views">
            <span>View</span>
            {MODEL_T_VIEWS.map(v => (
              <button key={v.id} className="mt-btn" onClick={() => goView(v.id)}>{v.label}</button>
            ))}
          </div>
        </div>

        <div className="mt-side">
          <div className="mt-panel" aria-live="polite">
            {part ? (
              <>
                <h4>{part.label}</h4>
                <p>{part.sentence}</p>
                {part.claim
                  ? <div className="mt-claim"><b>Sourced</b>{part.claim}</div>
                  : <div className="mt-claim none"><b>Modelling choice</b>This detail is drawn to make the teaching model readable. It is not a historical claim.</div>}
              </>
            ) : (
              <>
                <h4>Take it apart</h4>
                <p>Drag the slider, then tap a part on the car or in the list to see what it does. Use the view buttons to look from the side, front, top or three-quarters. Wheelbase 100 in; introduced 1 October 1908; a 177-cubic-inch four-cylinder engine of about 20 horsepower.</p>
              </>
            )}
          </div>
          <div className="mt-list" role="group" aria-label="Parts">
            {groups.map(g => (
              <div key={g.id} className="mt-grp">
                <h5>{MODEL_T_GROUP_LABELS[g.id]}</h5>
                {g.parts.map(p => (
                  <button
                    key={p.id} className="mt-btn" aria-pressed={selected === p.id}
                    onClick={() => setSelected(sel => (sel === p.id ? null : p.id))}
                    onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(p.id)} onBlur={() => setHovered(null)}
                  >{p.label}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-note">
        {MODEL_T_DISCLAIMER}. Built from simple shapes to the 100-inch wheelbase; part shapes, sizes, colours and the 1909-1926 touring layout are approximate (the real car was black).
        Statements marked "Sourced" come from the evidence list below.{film ? ' Turn "Film look" off to inspect the parts clearly.' : ''}
      </p>
    </section>
  );
}

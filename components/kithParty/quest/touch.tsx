/**
 * Kith Quest — phone controls laid over the canvas.
 * Left half: a floating thumbstick (appears where the thumb lands; analog x/y, ↓ = roll, ↑ = aim up).
 * Right side: Jump (big), Lash, Dash/Bash, Sub-weapon. Fully multi-touch via Pointer Events + capture,
 * so holding the stick while tapping buttons (and sliding between them) works.
 */
import React, {useRef, useState} from 'react';

export interface TouchInput { x: number; y: number; jump: boolean; attack: boolean; dash: boolean; special: boolean; }
export const emptyTouch = (): TouchInput => ({x: 0, y: 0, jump: false, attack: false, dash: false, special: false});

type Btn = 'jump' | 'attack' | 'dash' | 'special';
const R = 46; // stick radius (css px)

export function TouchControls({input, sparks, subLabel}: {input: React.MutableRefObject<TouchInput>; sparks: number; subLabel: string}) {
 const [stick, setStick] = useState<{ox: number; oy: number; kx: number; ky: number} | null>(null);
 const stickId = useRef<number | null>(null);
 const [down, setDown] = useState<Record<Btn, boolean>>({jump: false, attack: false, dash: false, special: false});
 const owner = useRef(new Map<number, Btn>());

 const stickStart = (e: React.PointerEvent) => {
  if (stickId.current !== null) return;
  e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
  stickId.current = e.pointerId;
  const r = (e.currentTarget as Element).getBoundingClientRect();
  setStick({ox: e.clientX - r.left, oy: e.clientY - r.top, kx: 0, ky: 0});
 };
 const stickMove = (e: React.PointerEvent) => {
  if (e.pointerId !== stickId.current) return;
  e.preventDefault();
  // read the event now — React clears currentTarget before a functional state update runs
  const r = (e.currentTarget as Element).getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  setStick(s => {
   if (!s) return s;
   let dx = px - s.ox, dy = py - s.oy;
   const d = Math.hypot(dx, dy);
   // the base follows a thumb that drifts far past the rim, so the stick never "runs out"
   let {ox, oy} = s;
   if (d > R * 1.6) { const k = (d - R * 1.6) / d; ox += dx * k; oy += dy * k; dx -= dx * k; dy -= dy * k; }
   const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
   const ax = Math.cos(a) * m, ay = Math.sin(a) * m;
   input.current.x = Math.abs(ax) < .28 ? 0 : Math.max(-1, Math.min(1, ax * 1.35));
   input.current.y = Math.abs(ay) < .45 ? 0 : Math.sign(ay);
   return {ox, oy, kx: ax * R, ky: ay * R};
  });
 };
 const stickEnd = (e: React.PointerEvent) => {
  if (e.pointerId !== stickId.current) return;
  stickId.current = null; input.current.x = 0; input.current.y = 0; setStick(null);
 };

 const press = (b: Btn, v: boolean) => { input.current[b] = v; setDown(d => d[b] === v ? d : {...d, [b]: v}); if (v) navigator.vibrate?.(8); };
 // buttons share one surface so a thumb can slide from Jump onto Lash, etc.
 const hit = (x: number, y: number): Btn | null => {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const b = el?.closest('[data-btn]')?.getAttribute('data-btn');
  return (b as Btn) || null;
 };
 const btnDown = (e: React.PointerEvent) => {
  e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
  const b = hit(e.clientX, e.clientY); if (!b) return;
  owner.current.set(e.pointerId, b); press(b, true);
 };
 const btnMove = (e: React.PointerEvent) => {
  const cur = owner.current.get(e.pointerId); if (cur === undefined) return;
  const b = hit(e.clientX, e.clientY);
  if (b && b !== cur) { owner.current.set(e.pointerId, b); if (![...owner.current.values()].includes(cur)) press(cur, false); press(b, true); }
 };
 const btnUp = (e: React.PointerEvent) => {
  const cur = owner.current.get(e.pointerId); if (cur === undefined) return;
  owner.current.delete(e.pointerId);
  if (![...owner.current.values()].includes(cur)) press(cur, false);
 };

 return <div className="kq-pad" onContextMenu={e => e.preventDefault()}>
  <div className="kq-stickzone" onPointerDown={stickStart} onPointerMove={stickMove} onPointerUp={stickEnd} onPointerCancel={stickEnd}>
   {stick ? <div className="kq-stick" style={{left: stick.ox, top: stick.oy}}><i style={{transform: `translate(${stick.kx}px, ${stick.ky}px)`}}/></div>
    : <div className="kq-stick-hint"><span>◀ ▶</span><small>drag to move</small></div>}
  </div>
  <div className="kq-btnzone" onPointerDown={btnDown} onPointerMove={btnMove} onPointerUp={btnUp} onPointerCancel={btnUp}>
   <div data-btn="special" className={`kq-tb kq-tb-special ${down.special ? 'on' : ''} ${sparks <= 0 ? 'empty' : ''}`}><b>✸</b><small>{subLabel} {sparks}</small></div>
   <div data-btn="dash" className={`kq-tb kq-tb-dash ${down.dash ? 'on' : ''}`}><b>➤</b><small>DASH</small></div>
   <div data-btn="attack" className={`kq-tb kq-tb-attack ${down.attack ? 'on' : ''}`}><b>⟋</b><small>LASH</small></div>
   <div data-btn="jump" className={`kq-tb kq-tb-jump ${down.jump ? 'on' : ''}`}><b>⤒</b><small>JUMP</small></div>
  </div>
 </div>;
}

/** Coarse-pointer devices (phones, tablets) get the overlay + full-screen layout. Re-evaluated on first touch. */
export function useTouchDevice() {
 const [touch, setTouch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
 React.useEffect(() => {
  if (touch) return;
  const on = (e: PointerEvent) => { if (e.pointerType === 'touch') setTouch(true); };
  window.addEventListener('pointerdown', on);
  return () => window.removeEventListener('pointerdown', on);
 }, [touch]);
 return touch;
}

// PageTurn: wraps the live page and animates it to the next/previous one.
//
//  * Timed turns (tap zones, arrow keys, narration auto-turn, follower mirroring): the parent just changes the page
//    (`pageKey` / `order`). PageTurn keeps the last committed node of the previous page and plays the transition.
//    Nothing is re-broadcast and no parent logic changes: the animation is purely presentational.
//  * Drag turns (finger / mouse): the page follows the pointer, release decides commit or cancel from velocity and
//    progress (services/lorea/pageTransitions.ts), a spring settles it, and only then does `onTurn(dir)` ask the parent
//    to change the page. The following key change is recognised and NOT animated a second time.
//
// Performance: while a turn plays only transform / opacity / clip-path / mask and gradient overlays change, written
// straight to the DOM from one requestAnimationFrame loop (no React state per frame, no layout reads: size is cached
// by a ResizeObserver). will-change is set when a turn starts and removed when it ends. All listeners and the rAF
// are torn down on unmount. At rest the DOM is: one wrapper > one layer > your page.

import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import {
  DRAG, decideDrag, dragDirection, dragProgress, effectiveTurn, getSpec, releaseVelocity, shouldStartDrag, springSettled, springStep,
  timedProgress, travelToward, type PageTurnDir, type PageTurnId, type ResolvedPageTurn,
} from '../../services/lorea/pageTransitions';
import { frameFor, type LayerCss, type ShadeCss } from '../../services/lorea/pageTurnFrames';
import { playPageSound } from '../../services/lorea/pageRustle';

export interface PageTurnHandle {
  /** Freeze the transition at progress p (0..1) toward `dir`, for the lab and visual tests. */
  scrub(dir: PageTurnDir, p: number, originY?: number): void;
  endScrub(): void;
}

export interface PageTurnProps {
  /** Identity of the current page. A change of key (with a known `order`) is a page turn. */
  pageKey: string;
  /** Monotonic position of the page in the book; decides forward/back and flags long jumps. */
  order: number;
  children: React.ReactNode;
  turn: ResolvedPageTurn;
  rtl?: boolean;
  /** `children` is a two-page spread. Flip is spread-aware; other styles move the spread as one surface. */
  spread?: boolean;
  /** Content of the page/spread in direction `dir` (enables drag). Return null at the ends of the book. */
  renderNeighbor?: (dir: PageTurnDir) => React.ReactNode | null;
  canTurn?: (dir: PageTurnDir) => boolean;
  /** A drag committed. The parent must now change the page (same code as the tap zone). */
  onTurn?: (dir: PageTurnDir) => void;
  /** Element that receives the pointer gestures (defaults to the wrapper); lets tap zones sit on top and still drag. */
  gestureRef?: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
  /** Back of the curling page. */
  paper?: string;
  /** Page is expensive to duplicate (iframe / canvas): the curl's back is plain paper, no see-through ghost. */
  heavy?: boolean;
  radius?: string;
  sound?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Where a tap-triggered turn started, 0..1 of the height (iris / curl tilt). */
  originY?: number;
  onBusyChange?: (busy: boolean) => void;
}

interface Stage {
  id: PageTurnId; dir: PageTurnDir; mode: 'timed' | 'drag' | 'scrub';
  liveIs: 'a' | 'b'; nodeA: React.ReactNode; nodeB: React.ReactNode;
  fromNode: React.ReactNode; toNode: React.ReactNode;
  durationMs: number; spread: boolean; originY: number; sig: number;
}

// ── DOM writers ──────────────────────────────────────────────────────────────

const sigCache = new WeakMap<Element, string>();
const setIf = (el: Element, sig: string, fn: () => void) => { if (sigCache.get(el) !== sig) { sigCache.set(el, sig); fn(); } };

function setLayer(el: HTMLElement | null | undefined, c: LayerCss) {
  if (!el) return;
  const sig = `${c.transform}|${c.opacity}|${c.clipPath}|${c.mask}|${c.z}|${c.hidden}|${c.origin}|${c.backfaceHidden}`;
  setIf(el, sig, () => {
    const s = el.style as CSSStyleDeclaration & Record<string, string>;
    s.transform = c.transform === 'none' ? '' : c.transform;
    s.opacity = c.opacity >= 1 ? '' : String(Math.round(c.opacity * 1000) / 1000);
    s.clipPath = c.clipPath === 'none' ? '' : c.clipPath;
    const m = c.mask === 'none' ? '' : c.mask;
    s.maskImage = m; s.webkitMaskImage = m;
    s.zIndex = String(c.z);
    s.visibility = c.hidden ? 'hidden' : '';
    s.transformOrigin = c.origin;
    const bf = c.backfaceHidden ? 'hidden' : '';
    s.backfaceVisibility = bf; s.webkitBackfaceVisibility = bf;
  });
}
function setShade(layerEl: HTMLElement | null | undefined, sh: ShadeCss | null) {
  if (!layerEl) return;
  const el = layerEl.querySelector(':scope > [data-pt-shade]') as HTMLElement | null;
  if (!el) return;
  const s = sh ?? { background: 'none', opacity: 0, boxShadow: 'none' };
  setIf(el, `${s.background}|${s.opacity}|${s.boxShadow}`, () => {
    el.style.background = s.background === 'none' ? '' : s.background;
    el.style.opacity = String(Math.round(s.opacity * 1000) / 1000);
    el.style.boxShadow = s.boxShadow === 'none' ? '' : s.boxShadow;
  });
}
function clearLayer(el: HTMLElement | null | undefined) {
  if (!el) return;
  sigCache.delete(el);
  const s = el.style as CSSStyleDeclaration & Record<string, string>;
  s.transform = ''; s.opacity = ''; s.clipPath = ''; s.maskImage = ''; s.webkitMaskImage = ''; s.zIndex = ''; s.visibility = '';
  s.transformOrigin = ''; s.backfaceVisibility = ''; s.webkitBackfaceVisibility = ''; s.willChange = '';
}

const layerBase: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
const shadeStyle = (radius?: string): React.CSSProperties => ({ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0, borderRadius: radius });

const Layer = forwardRef<HTMLDivElement, { live?: boolean; radius?: string; children: React.ReactNode; extraStyle?: React.CSSProperties; inert?: boolean }>(
  function Layer({ live, radius, children, extraStyle, inert }, ref) {
    // React 18 treats inert="" as false, so the attribute is set by hand.
    const setRef = (el: HTMLDivElement | null) => {
      if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (el && inert) el.setAttribute('inert', '');
    };
    return (
      <div ref={setRef} data-pt-layer={live ? 'live' : 'other'} aria-hidden={inert ? true : undefined}
        style={live ? { position: 'relative', width: '100%', height: '100%', ...extraStyle } : { ...layerBase, pointerEvents: 'none', ...extraStyle }}>
        <div style={{ width: '100%', height: '100%' }}>{children}</div>
        <div data-pt-shade="" style={shadeStyle(radius)} />
      </div>
    );
  });

const PageTurn = forwardRef<PageTurnHandle, PageTurnProps>(function PageTurn(props, handleRef) {
  const { pageKey, order, children, rtl = false, spread = false, paper = '#f4efe4', heavy = false, radius, className, style } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const leafFRef = useRef<HTMLDivElement>(null);
  const leafBRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const propsRef = useRef(props); propsRef.current = props;

  const [stage, setStage] = useState<Stage | null>(null);
  const stageRef = useRef<Stage | null>(null); stageRef.current = stage;
  const lastRef = useRef<{ key: string; node: React.ReactNode; order: number } | null>(null);
  const rafRef = useRef(0);
  const pRef = useRef(0);
  const suppressUntil = useRef(0);
  const sigRef = useRef(0);
  const busyRef = useRef(false);

  const setBusy = useCallback((b: boolean) => {
    if (busyRef.current === b) return; busyRef.current = b;
    rootRef.current?.setAttribute('data-pt-state', b ? (stageRef.current?.mode ?? 'timed') : 'idle');
    propsRef.current.onBusyChange?.(b);
  }, []);

  // cached size (no layout reads during a turn)
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const read = () => { sizeRef.current = { w: el.offsetWidth, h: el.offsetHeight }; };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── apply one frame ────────────────────────────────────────────────────────
  const apply = useCallback((st: Stage, p: number) => {
    const root = rootRef.current; if (!root) return;
    let { w, h } = sizeRef.current;
    if (!w || !h) { w = root.offsetWidth; h = root.offsetHeight; sizeRef.current = { w, h }; }
    const { frame, swap } = frameFor({ id: st.id, p, dir: st.dir, rtl: propsRef.current.rtl ?? false, w, h, spread: st.spread, originY: st.originY });
    const liveEl = liveRef.current, otherEl = otherRef.current;
    const elA = st.liveIs === 'a' ? liveEl : otherEl;
    const elB = st.liveIs === 'a' ? otherEl : liveEl;
    const fromEl = swap ? elB : elA;
    const toEl = swap ? elA : elB;
    setLayer(fromEl, frame.from); setLayer(toEl, frame.to);
    setShade(fromEl, frame.fromShade); setShade(toEl, frame.toShade);
    if (frame.flap && flapRef.current) {
      const fl = flapRef.current; setLayer(fl, frame.flap); setShade(fl, frame.flap.shade);
      const ghost = fl.querySelector(':scope > [data-pt-ghost]') as HTMLElement | null; if (ghost) ghost.style.opacity = String(frame.flap.ghost);
    }
    if (frame.leafFront && leafFRef.current) { setLayer(leafFRef.current, frame.leafFront); setShade(leafFRef.current, frame.leafFront.shade); }
    if (frame.leafBack && leafBRef.current) { setLayer(leafBRef.current, frame.leafBack); setShade(leafBRef.current, frame.leafBack.shade); }
    const rs = root.style;
    const persp = frame.perspectivePx ? `${frame.perspectivePx}px` : '';
    if (rs.perspective !== persp) rs.perspective = persp;
    const clip = frame.clipStage ? 'inset(-48px 0px -48px 0px)' : '';
    if (rs.clipPath !== clip) rs.clipPath = clip;
  }, []);

  const clearAll = useCallback(() => {
    clearLayer(liveRef.current);
    const root = rootRef.current; if (root) { root.style.perspective = ''; root.style.clipPath = ''; root.style.willChange = ''; }
  }, []);

  const cancelRaf = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; } };

  const finish = useCallback(() => { cancelRaf(); setStage(null); }, []);

  // when the extra layers are gone, the live layer must be pristine
  useLayoutEffect(() => { if (!stage) { clearAll(); setBusy(false); } }, [stage, clearAll, setBusy]);

  // ── timed turns: start whenever a timed/scrub stage mounts ─────────────────
  useLayoutEffect(() => {
    if (!stage) return;
    setBusy(true);
    for (const el of [liveRef.current, otherRef.current, flapRef.current, leafFRef.current, leafBRef.current]) if (el) el.style.willChange = 'transform, opacity';
    if (stage.mode === 'timed') {
      const spec = getSpec(stage.id);
      apply(stage, 0);
      if (typeof document !== 'undefined' && document.hidden) { apply(stage, 1); finish(); return; }
      const t0 = performance.now();
      const tick = (now: number) => {
        const el = now - t0;
        const p = timedProgress(spec, el, stage.durationMs);
        apply(stage, p);
        if (el >= stage.durationMs) finish(); else rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      apply(stage, pRef.current);
    }
    return () => { /* the loop is cancelled by the next stage / unmount */ };
  }, [stage, apply, finish, setBusy]);

  useEffect(() => () => { cancelRaf(); }, []);

  // ── page changed by the parent → timed turn ───────────────────────────────
  useLayoutEffect(() => {
    const last = lastRef.current;
    lastRef.current = { key: pageKey, node: children, order };
    if (!last || last.key === pageKey) return;
    const p = propsRef.current;
    if (performance.now() < suppressUntil.current) { suppressUntil.current = 0; return; }      // the drag already played it
    cancelRaf();
    if (p.turn.id === 'none' || p.turn.durationMs <= 0) { if (stageRef.current) setStage(null); return; }
    const chained = !!stageRef.current;                     // a second turn arrived mid-turn: speed up
    const eff = effectiveTurn(p.turn, last.order, order, chained);
    const { dir, durationMs: dur } = eff;
    const id = eff.id;
    const spec = getSpec(id);
    const prevNode = last.node;
    const swap = spec.reversible && dir === -1;
    const st: Stage = {
      id: p.spread && id === 'curl' ? 'flip' : id, dir, mode: 'timed', liveIs: 'b', nodeA: prevNode, nodeB: children,
      fromNode: swap ? children : prevNode, toNode: swap ? prevNode : children,
      durationMs: dur, spread: !!p.spread, originY: p.originY ?? 0.5, sig: ++sigRef.current,
    };
    if (p.sound && spec.sound !== 'none') playPageSound(spec.sound, dur);
    setStage(st);
  });

  // ── drag ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const host = (props.gestureRef?.current ?? rootRef.current) as HTMLElement | null;
    if (!host) return;
    const prevTouch = host.style.touchAction;
    host.style.touchAction = 'pan-y';

    type Track = { id: number; x0: number; y0: number; rect: DOMRect; started: 'no' | 'drag' | 'swipe'; ignore: boolean; dir: PageTurnDir; samples: { t: number; x: number }[]; towardSign: number; lastDx: number };
    let tr: Track | null = null;
    let frame = 0;
    let swallowClick = false;
    const swallow = (e: Event) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } };
    window.addEventListener('click', swallow, true);

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; const st = stageRef.current; if (st && st.mode === 'drag') apply(st, Math.min(1, Math.max(0, pRef.current))); });
    };

    const settle = (from: number, v0: number, target: 0 | 1, st: Stage) => {
      cancelRaf();
      let s = { x: from, v: v0 };
      let last = performance.now(); const t0 = last;
      const tick = (now: number) => {
        const dt = Math.min(0.034, (now - last) / 1000); last = now;
        s = springStep(s, target, dt);
        pRef.current = s.x;
        apply(st, Math.min(1, Math.max(0, s.x)));
        if (springSettled(s, target) || now - t0 > 1100) {
          apply(st, target);
          if (target === 1) {
            suppressUntil.current = performance.now() + 400;
            propsRef.current.onTurn?.(st.dir);
          }
          setStage(null);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const onDown = (e: PointerEvent) => {
      const p = propsRef.current;
      if (p.disabled || stageRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"],[data-no-pageturn]')) return;
      swallowClick = false;
      const rect = host.getBoundingClientRect();
      tr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, rect, started: 'no', ignore: false, dir: 1, samples: [{ t: e.timeStamp, x: e.clientX }], towardSign: 1, lastDx: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!tr || e.pointerId !== tr.id) return;
      const p = propsRef.current;
      const dx = e.clientX - tr.x0, dy = e.clientY - tr.y0;
      tr.lastDx = dx;
      tr.samples.push({ t: e.timeStamp, x: e.clientX }); if (tr.samples.length > 12) tr.samples.shift();
      if (tr.started === 'no') {
        if (tr.ignore) return;
        if (!shouldStartDrag({ dx, dy, pointerType: e.pointerType, startXFrac: (tr.x0 - tr.rect.left) / Math.max(1, tr.rect.width) })) {
          if (Math.abs(dy) > DRAG.slopPx * 2 && Math.abs(dy) > Math.abs(dx)) tr.ignore = true;
          return;
        }
        const dir = dragDirection(dx, p.rtl ?? false);
        if (!dir) return;
        if (p.canTurn && !p.canTurn(dir)) { tr.ignore = true; return; }
        tr.dir = dir; tr.towardSign = (dir === 1) !== (p.rtl ?? false) ? -1 : 1;
        const neighbor = p.turn.interactive && p.renderNeighbor ? p.renderNeighbor(dir) : null;
        if (!neighbor) {
          tr.started = 'swipe';                              // no following (reduced motion / none / end of book): decide on release
        } else {
          cancelRaf();
          tr.started = 'drag';
          try { host.setPointerCapture(e.pointerId); } catch { /* element detached */ }
          document.body.style.userSelect = 'none';
          const id: PageTurnId = p.spread && p.turn.id === 'curl' ? 'flip' : p.turn.id;
          const spec = getSpec(id);
          const swap = spec.reversible && dir === -1;
          const cur = lastRef.current?.node ?? p.children;
          const st: Stage = {
            id, dir, mode: 'drag', liveIs: 'a', nodeA: cur, nodeB: neighbor,
            fromNode: swap ? neighbor : cur, toNode: swap ? cur : neighbor,
            durationMs: 0, spread: !!p.spread, originY: Math.min(1, Math.max(0, (tr.y0 - tr.rect.top) / Math.max(1, tr.rect.height))), sig: ++sigRef.current,
          };
          pRef.current = 0;
          if (p.sound && spec.sound !== 'none') playPageSound(spec.sound, spec.durationMs, 0.6);
          setStage(st);
        }
        swallowClick = true;
      }
      if (tr.started === 'drag') {
        const travel = travelToward(dx, tr.dir, p.rtl ?? false);
        pRef.current = dragProgress(travel, tr.rect.width);
        schedule();
        e.preventDefault?.();
      }
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!tr || e.pointerId !== tr.id) return;
      const t = tr; tr = null;
      document.body.style.userSelect = '';
      try { host.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (t.started === 'swipe') {
        if (!cancelled && Math.abs(t.lastDx) >= 48) propsRef.current.onTurn?.(t.dir);
        return;
      }
      if (t.started !== 'drag') return;
      const st = stageRef.current; if (!st || st.mode !== 'drag') return;
      const vx = releaseVelocity(t.samples);                                       // finger velocity, px/s (+ = rightwards)
      const v = vx * t.towardSign;                                                 // + = moving toward completing the turn
      const progress = Math.min(1, Math.max(0, pRef.current));
      const outcome = cancelled ? 'cancel' : decideDrag({ progress, velocityPxPerS: v });
      setTimeout(() => { swallowClick = false; }, 350);
      settle(progress, v / Math.max(1, t.rect.width * DRAG.travelFrac), outcome === 'commit' ? 1 : 0, st);
    };
    const onUp = (e: PointerEvent) => end(e, false);
    const onCancel = (e: PointerEvent) => end(e, true);

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onCancel);
    return () => {
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('click', swallow, true);
      host.style.touchAction = prevTouch;
      document.body.style.userSelect = '';
      if (frame) cancelAnimationFrame(frame);
    };
    // gestureRef.current is read once per mount on purpose; props flow through propsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, props.gestureRef]);

  // ── lab / test handle ──────────────────────────────────────────────────────
  useImperativeHandle(handleRef, () => ({
    scrub(dir, p, originY = 0.5) {
      const pr = propsRef.current;
      const neighbor = pr.renderNeighbor ? pr.renderNeighbor(dir) : null;
      if (!neighbor) return;
      cancelRaf();
      const id: PageTurnId = pr.spread && pr.turn.id === 'curl' ? 'flip' : pr.turn.id;
      const spec = getSpec(id); const swap = spec.reversible && dir === -1;
      const cur = lastRef.current?.node ?? pr.children;
      pRef.current = p;
      const cs = stageRef.current;
      if (cs && cs.mode === 'scrub' && cs.dir === dir && cs.id === id) { cs.originY = originY; apply(cs, p); return; }
      setStage({ id, dir, mode: 'scrub', liveIs: 'a', nodeA: cur, nodeB: neighbor, fromNode: swap ? neighbor : cur, toNode: swap ? cur : neighbor, durationMs: 0, spread: !!pr.spread, originY, sig: ++sigRef.current });
    },
    endScrub() { cancelRaf(); setStage(null); },
  }), [apply]);

  const st = stage;
  const needFlap = !!st && !st.spread && (st.id === 'curl' || st.id === 'flip');
  const needLeaves = !!st && st.spread && st.id === 'flip';
  const liveNode = children;
  const otherNode = st ? (st.liveIs === 'b' ? st.nodeA : st.nodeB) : null;

  return (
    <div ref={rootRef} data-pt-state="idle" data-pt-root="" className={className} style={{ position: 'relative', ...style }}>
      <Layer ref={liveRef} live radius={radius}>{liveNode}</Layer>
      {st && <Layer ref={otherRef} radius={radius} inert>{otherNode}</Layer>}
      {st && needFlap && (
        // The wrapper clips the turned-over back to the page rectangle (a reflected corner would otherwise poke out).
        <div aria-hidden data-pt-flapwrap="" style={{ ...layerBase, pointerEvents: 'none', overflow: st.id === 'curl' ? 'hidden' : 'visible', borderRadius: radius, zIndex: 3 }}>
          <div ref={flapRef} data-pt-flap="" style={{ ...layerBase, pointerEvents: 'none', background: paper, borderRadius: radius, overflow: 'hidden', visibility: 'hidden' }}>
            {!heavy && <div data-pt-ghost="" style={{ ...layerBase, opacity: 0.14, filter: 'grayscale(0.4)' }}>{st.fromNode}</div>}
            <div data-pt-shade="" style={shadeStyle(radius)} />
          </div>
        </div>
      )}
      {st && needLeaves && (<>
        <div ref={leafFRef} aria-hidden style={{ ...layerBase, pointerEvents: 'none', visibility: 'hidden' }}>
          <div style={{ width: '100%', height: '100%' }}>{st.fromNode}</div><div data-pt-shade="" style={shadeStyle(radius)} />
        </div>
        <div ref={leafBRef} aria-hidden style={{ ...layerBase, pointerEvents: 'none', visibility: 'hidden' }}>
          <div style={{ width: '100%', height: '100%' }}>{st.toNode}</div><div data-pt-shade="" style={shadeStyle(radius)} />
        </div>
      </>)}
    </div>
  );
});

export default PageTurn;

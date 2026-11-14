// The Tela document on a live stream's stage: drawn on each viewer's own device by the same renderers as the
// canvas, so its videos, simulations, 3D models, charts and forms work for them directly.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CornerDownLeft, Hand, Loader2 } from 'lucide-react';
import type { TelaDevice } from '../../types';
import { buildRenderMaps, renderDevice, type RenderDeviceCtx } from '../tela/renderDevice';
import { flyingStripInline } from '../tela/TelaFlyingMenu';
import { deviceTakesInput, watcherMayTouch, type LiveDocMode } from '../../services/liveDocPrepare';
import { auth } from '../../services/backendService';
import type { LiveDocSource } from '../../hooks/useLiveDocSource';
import type { LiveDocFigureState } from '../../services/liveDocSource';

const CSS = `
.lds{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:#17121f;color:#f4f1f7;font-family:Inter,system-ui,sans-serif}
.lds button{font:inherit;cursor:pointer}
.lds-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:#1b1029;border-bottom:1px solid rgba(255,255,255,.12);font-size:.8rem}
.lds-bar .t{font:600 .88rem/1.2 Outfit,sans-serif;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 120px}
.lds-seg{display:inline-flex;padding:2px;border-radius:99px;background:rgba(255,255,255,.08)}
.lds-seg button{height:32px;padding:0 11px;border:0;border-radius:99px;background:transparent;color:rgba(244,241,247,.76);font-size:.76rem;font-weight:500}
.lds-seg button[aria-pressed="true"]{background:#f4f1f7;color:#160a24;font-weight:600}
.lds-b{display:inline-flex;align-items:center;gap:5px;height:32px;min-width:32px;justify-content:center;padding:0 10px;border:1px solid rgba(255,255,255,.2);border-radius:99px;background:transparent;color:#f4f1f7;font-size:.76rem}
.lds-b:disabled{opacity:.4;cursor:default}
.lds-note{margin:0;padding:6px 12px;background:#22162e;color:#f7f2ea;font-size:.76rem}
.lds-err{margin:0;padding:6px 12px;background:#5c1030;color:#fff;font-size:.78rem}
.lds-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px;outline:none}
.lds-page{position:relative;margin:0 auto;background:#fff;color:#22162e;border-radius:8px;overflow:hidden}
.lds-frame{position:relative;transform-origin:0 0}
.lds-wait{display:grid;place-items:center;gap:8px;height:100%;font-size:.86rem;color:rgba(244,241,247,.72);text-align:center;padding:24px}
.lds-back{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border:0;border-radius:99px;background:#f4f1f7;color:#160a24;font-size:.8rem;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,.4)}
.lds-sub{flex:none;max-height:48%;overflow-y:auto;padding:10px 12px;background:#1b1029;border-bottom:1px solid rgba(255,255,255,.12);display:grid;gap:8px;font-size:.8rem}
.lds-card{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.07);display:grid;gap:6px}
.lds-card .h{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lds-card .h b{font-weight:600;flex:1 1 100px}
.lds-f{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1)}
.lds-f>div{flex:1 1 150px;min-width:0}
.lds-f small{display:block;color:rgba(244,241,247,.72);font-size:.72rem}
.lds-b[aria-pressed="true"]{background:#f4f1f7;color:#160a24}
.lds [data-lds-kind="FORM"]{pointer-events:none!important}
.lds [data-lds-kind="FORM"] button{display:none}
.lds-pips{position:absolute;top:58px;right:22px;display:grid;gap:10px;width:200px;pointer-events:none}
.lds-pips>*{pointer-events:auto}
@media (max-width:640px){.lds-pips{width:112px;right:12px}}
`;

const blockPlainText = (b: { text: string }) => flyingStripInline(b.text).replace(/\n/g, ' ').trim();
const newId = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const MODES: Array<[LiveDocMode, string]> = [['FOLLOW', 'Follow me'], ['OWN_COPY', 'Own copy'], ['TOGETHER', 'Together']];

export default function LiveDocStage({ src, children, onClose, ownHandQueue }: {
  src: LiveDocSource;
  /** The surface has its own raise-hand queue (a class), which decides who's on. */
  ownHandQueue?: boolean;
  /** The host's camera or anyone called on, floated over the page. */
  children?: React.ReactNode;
  onClose?: () => void;
}) {
  const { doc, state, isHost, canInteract } = src;
  const me = auth.currentUser;
  const signedIn = !!me && !me.isAnonymous;
  const [showHands, setShowHands] = useState(false);
  const lastInputAt = useRef(0);
  const mode: LiveDocMode = state?.mode || 'FOLLOW';
  const following = mode === 'FOLLOW' && !isHost;
  const [ownFrameId, setOwnFrameId] = useState('');
  const [wandered, setWandered] = useState(false);
  const [kept, setKept] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  const figureRef = useRef<LiveDocFigureState>({ values: {}, clicks: [], orbits: {} });
  const stateRef = useRef(state); stateRef.current = state;
  const drives = mode === 'FOLLOW' && canInteract;
  const seqRef = useRef(0);
  const appliedSeq = useRef(0);

  const frames = doc?.frames || [];
  const frameId = !wandered && (following || isHost) && state?.frameId && !ownFrameId ? state.frameId : ownFrameId || state?.frameId || frames[0]?.id;
  const frame = frames.find(f => f.id === frameId) || frames[0];
  const index = frame ? frames.indexOf(frame) : 0;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 28));
    ro.observe(el);
    setWidth(el.clientWidth - 28);
    return () => ro.disconnect();
  }, [!!doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNaturalH(el.offsetHeight));
    ro.observe(el);
    setNaturalH(el.offsetHeight);
    return () => ro.disconnect();
  }, [frame?.id]);

  const scale = frame && width > 0 ? Math.min(width / frame.w, 2) : 1;

  const maps = useMemo(() => buildRenderMaps(doc?.devices || {}, doc?.frames || [], blockPlainText), [doc?.devices, doc?.frames]);
  const ctx = useMemo<RenderDeviceCtx>(() => ({
    devices: doc?.devices || {}, dispatchOp: src.dispatch, writerTexts: maps.writerTexts, writers: maps.writers,
    bases: maps.bases, formulaContext: maps.formulaContext, uid: newId, chrome: false,
  }), [doc?.devices, src.dispatch, maps]);

  // The host's place, followed unless this viewer has gone elsewhere.
  useEffect(() => {
    if (!following || wandered) return;
    if (ownFrameId) setOwnFrameId('');
    const el = scroller.current;
    if (el && state?.y != null) el.scrollTop = state.y * Math.max(0, el.scrollHeight - el.clientHeight);
  }, [following, wandered, state?.y, state?.frameId, naturalH]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode !== 'FOLLOW') setWandered(false); }, [mode]);

  // Host: their video or audio steps the audience's. Viewer: stays in step (their own sims and models stay theirs).
  useEffect(() => {
    const el = scroller.current;
    if (!el || !isHost) return;
    const on = (e: Event) => {
      const m = e.target as HTMLMediaElement;
      const dev = m.closest?.('[data-lds-dev]')?.getAttribute('data-lds-dev');
      if (dev) src.setPlace({ media: { deviceId: dev, playing: !m.paused, t: m.currentTime, at: Date.now() } });
    };
    ['play', 'pause', 'seeked'].forEach(t => el.addEventListener(t, on, true));
    return () => ['play', 'pause', 'seeked'].forEach(t => el.removeEventListener(t, on, true));
  }, [isHost, src.setPlace]); // eslint-disable-line react-hooks/exhaustive-deps
  // Host: their hands on a simulation or 3D model, mirrored to anyone following. Works from the page's own
  // controls, so a new simulation needs nothing extra.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !drives) return;
    const controlOf = (t: EventTarget | null) => {
      const c = (t as HTMLElement)?.closest?.('input,select,button') as HTMLElement | null;
      const box = c?.closest?.('[data-lds-kind="FIGURE"]') as HTMLElement | null;
      if (!c || !box) return null;
      return { c, deviceId: box.getAttribute('data-lds-dev')!, index: Array.from(box.querySelectorAll('input,select,button')).indexOf(c) };
    };
    const publish = () => {
      // Merged with what's on, because the presenter and whoever they brought on can both be driving.
      const on = stateRef.current?.figure;
      lastInputAt.current = Date.now();
      figureRef.current = {
        values: { ...(on?.values || {}), ...figureRef.current.values },
        orbits: { ...(on?.orbits || {}), ...figureRef.current.orbits },
        clicks: [...(on?.clicks || []).filter(k => !figureRef.current.clicks.some(m => m.seq === k.seq)), ...figureRef.current.clicks].sort((a, b) => a.seq - b.seq).slice(-40),
      };
      src.setPlace({ figure: figureRef.current });
    };
    const onInput = (e: Event) => {
      const hit = controlOf(e.target);
      if (!hit || hit.c.tagName === 'BUTTON') return;
      figureRef.current.values[`${hit.deviceId}:${hit.index}`] = (hit.c as HTMLInputElement).value;
      publish();
    };
    const onClick = (e: Event) => {
      const hit = controlOf(e.target);
      if (!hit || hit.c.tagName !== 'BUTTON') return;
      figureRef.current.clicks.push({ deviceId: hit.deviceId, index: hit.index, seq: Date.now() + (seqRef.current++ % 1000) / 1000, by: me?.uid });
      publish();
    };
    const onCamera = (e: Event) => {
      const mv = e.target as any;
      const dev = mv?.closest?.('[data-lds-dev]')?.getAttribute('data-lds-dev');
      if (!dev || (e as CustomEvent).detail?.source !== 'user-interaction' || !mv.getCameraOrbit) return;
      figureRef.current.orbits[dev] = mv.getCameraOrbit().toString();
      publish();
    };
    el.addEventListener('input', onInput, true);
    el.addEventListener('click', onClick, true);
    el.addEventListener('camera-change', onCamera, true);
    return () => { el.removeEventListener('input', onInput, true); el.removeEventListener('click', onClick, true); el.removeEventListener('camera-change', onCamera, true); };
  }, [drives, src.setPlace]); // eslint-disable-line react-hooks/exhaustive-deps
  const figure = state?.figure;
  useEffect(() => {
    const el = scroller.current;
    if (mode !== 'FOLLOW' || wandered || !figure || !el) return;
    // Hands on it right now: your own moves win over an echo of them.
    if (Date.now() - lastInputAt.current < 1500) return;
    const controlsOf = (dev: string) => Array.from(el.querySelectorAll<HTMLElement>(`[data-lds-dev="${CSS_ESCAPE(dev)}"] input, [data-lds-dev="${CSS_ESCAPE(dev)}"] select, [data-lds-dev="${CSS_ESCAPE(dev)}"] button`));
    Object.entries(figure.values || {}).forEach(([key, value]) => {
      const cut = key.lastIndexOf(':');
      const c = controlsOf(key.slice(0, cut))[Number(key.slice(cut + 1))] as HTMLInputElement | undefined;
      if (!c || c.value === value) return;
      const proto = c.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(c, value);
      c.dispatchEvent(new Event(c.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
    (figure.clicks || []).filter(k => k.seq > appliedSeq.current).forEach(k => {
      if (k.by !== me?.uid) (controlsOf(k.deviceId)[k.index] as HTMLButtonElement | undefined)?.click();
      appliedSeq.current = k.seq;
    });
    Object.entries(figure.orbits || {}).forEach(([dev, orbit]) => {
      const mv = el.querySelector<any>(`[data-lds-dev="${CSS_ESCAPE(dev)}"] model-viewer`);
      if (mv) mv.cameraOrbit = orbit;
    });
  }, [mode, wandered, figure, frame?.id, naturalH]); // eslint-disable-line react-hooks/exhaustive-deps

  const media = state?.media;
  useEffect(() => {
    if (!following || wandered || !media) return;
    const m = scroller.current?.querySelector<HTMLMediaElement>(`[data-lds-dev="${CSS_ESCAPE(media.deviceId)}"] video, [data-lds-dev="${CSS_ESCAPE(media.deviceId)}"] audio`);
    if (!m) return;
    const target = media.t + (media.playing ? (Date.now() - media.at) / 1000 : 0);
    if (Math.abs(m.currentTime - target) > 1.5) m.currentTime = target;
    if (media.playing) m.play().catch(() => { m.muted = true; m.play().catch(() => {}); });
    else m.pause();
  }, [following, wandered, media?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (i: number) => {
    const f = frames[i];
    if (!f) return;
    if (following) setWandered(true);
    setOwnFrameId(f.id);
    if (isHost) src.setPlace({ frameId: f.id, y: 0 });
    if (scroller.current) scroller.current.scrollTop = 0;
  };
  const backToHost = () => { setWandered(false); setOwnFrameId(''); };
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !isHost) return;
    const room = el.scrollHeight - el.clientHeight;
    src.setPlace({ y: room > 0 ? el.scrollTop / room : 0 });
  };
  const wander = () => { if (following) setWandered(true); };

  // Names stay with the presenter: the source itself only carries ids.
  const namesRef = useRef<Record<string, string>>({});
  src.hands.forEach(h => { namesRef.current[h.uid] = h.name; });
  const onStageNames = namesRef.current;
  const note = !frame ? '' : !canInteract ? 'You’re watching. Raise your hand and the presenter can bring you on to interact.'
    : mode === 'TOGETHER' ? 'One shared copy for the people on. Everyone watching sees it change.'
    : mode === 'OWN_COPY' ? (isHost ? 'Each person you bring on works on their own private copy.' : 'Your own copy. Only you see it. Assignments are still turned in from your class.')
    : !isHost ? 'You’re on. What you do with a simulation or model, everyone following sees.' : '';

  return (
    <div className="lds">
      <style>{CSS}</style>
      <div className="lds-bar">
        <span className="t">{state?.title || 'Tela document'}</span>
        {frames.length > 1 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="lds-b" aria-label="Previous page" disabled={index <= 0} onClick={() => goTo(index - 1)}><ChevronLeft size={14} /></button>
            <span>{index + 1} / {frames.length}</span>
            <button type="button" className="lds-b" aria-label="Next page" disabled={index >= frames.length - 1} onClick={() => goTo(index + 1)}><ChevronRight size={14} /></button>
          </span>
        )}
        {isHost && (
          <div className="lds-seg" role="group" aria-label="How everyone uses this document">
            {MODES.map(([k, label]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => src.setMode(k)}>{label}</button>)}
          </div>
        )}
        {isHost && !ownHandQueue && <button type="button" className="lds-b" aria-pressed={showHands} onClick={() => setShowHands(v => !v)}><Hand size={13} /> Hands · {src.hands.length}{state?.invitedUids?.length ? ` · ${state.invitedUids.length} on` : ''}</button>}
        {!isHost && !ownHandQueue && !canInteract && (signedIn
          ? <button type="button" className="lds-b" aria-pressed={src.myHand} onClick={() => (src.myHand ? src.lowerHand() : src.raiseHand())}><Hand size={13} /> {src.myHand ? 'Lower hand' : 'Raise hand'}</button>
          : <span>Sign in to raise your hand</span>)}
        {!isHost && canInteract && <span>You’re on</span>}
        {!isHost && canInteract && mode === 'OWN_COPY' && (
          <button type="button" className="lds-b" onClick={async () => { if (await src.keepMyCopy()) setKept(true); }}>{kept ? 'Saved to your Tela' : 'Keep my copy'}</button>
        )}
        {isHost && <button type="button" className="lds-b" onClick={() => void src.stop()}>Stop presenting</button>}
        {onClose && <button type="button" className="lds-b" onClick={onClose}>Hide</button>}
      </div>
      {note && <p className="lds-note">{note}</p>}
      {src.error && <p className="lds-err" role="alert">{src.error}</p>}
      {showHands && isHost && !ownHandQueue && (
        <div className="lds-sub" aria-label="Raised hands">
          {src.hands.length === 0 && !state?.invitedUids?.length && <span>When someone signed in raises a hand, you can bring them on here. Only people you bring on can interact.</span>}
          {src.hands.map(h => (
            <div key={h.uid} className="lds-card"><div className="h"><b>{h.name}</b><button type="button" className="lds-b" onClick={() => src.bringOn(h.uid)}>Bring on</button></div></div>
          ))}
          {(state?.invitedUids || []).map(u => (
            <div key={u} className="lds-card"><div className="h"><b>{onStageNames[u] || 'On now'}</b><span>Can interact</span><button type="button" className="lds-b" onClick={() => src.sendBack(u)}>Send back</button></div></div>
          ))}
        </div>
      )}
      <div
        ref={scroller}
        className="lds-scroll"
        tabIndex={0}
        aria-label={state?.title ? `Document: ${state.title}` : 'Document'}
        onScroll={onScroll}
        onWheel={wander}
        onTouchMove={wander}
      >
        {!doc || !frame ? (
          <div className="lds-wait">{src.error ? null : <><Loader2 size={18} className="animate-spin" /> Getting the document…</>}</div>
        ) : (
          <div className="lds-page" style={{ width: frame.w * scale, height: Math.max(naturalH, 40) * scale }}>
            <div ref={inner} className="lds-frame" style={{ width: frame.w, minHeight: frame.h, transform: `scale(${scale})` }}>
              {frame.deviceIds.map((devId, i) => {
                const dev: TelaDevice | undefined = doc.devices[devId];
                if (!dev) return null;
                const overlay = i > 0 && dev.type === 'VECTOR';
                const positioned = dev.type === 'FORM' && (dev as any).presentation === 'POSITIONED';
                return (
                  <div
                    key={devId}
                    data-lds-dev={devId}
                    data-lds-kind={dev.type}
                    onPointerDownCapture={() => { if (watcherMayTouch(dev as any)) wander(); }}
                    style={overlay ? { position: 'absolute', inset: 0, zIndex: 10 + i, pointerEvents: 'none' }
                      : positioned ? { position: 'absolute', inset: 0, zIndex: 20 + i, pointerEvents: 'none' }
                      : { width: frame.w, position: 'relative', zIndex: 1, pointerEvents: canInteract || watcherMayTouch(dev as any) ? undefined : 'none' }}
                  >
                    {renderDevice(dev, ctx, !(canInteract && deviceTakesInput(dev.type, mode)), overlay)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {children && <div className="lds-pips">{children}</div>}
      {wandered && following && (
        <button type="button" className="lds-back" onClick={backToHost}><CornerDownLeft size={14} /> Back to the presenter’s place</button>
      )}
    </div>
  );
}

const CSS_ESCAPE = (s: string) => (typeof CSS_GLOBAL !== 'undefined' ? CSS_GLOBAL.escape(s) : s.replace(/"/g, '\\"'));
const CSS_GLOBAL = (globalThis as any).CSS as { escape: (s: string) => string } | undefined;

// DjOutputWindow — the DJ Console's pop-out window, in two modes.
//
//   ?djOut=1        → Program Out mirror. Reads the studio's composited
//                     MediaStream off `window.opener` (same-origin) and plays it
//                     in a <video>, so a projector / second screen shows exactly
//                     what streams. If no opener stream is available (window
//                     reopened, opener gone) it falls back to compositing the
//                     reactive backdrop itself from the BroadcastChannel state.
//   ?djOut=controls → Pixels controls. Drives the scene from its own window;
//                     changes go back to the studio over the same channel.
//
// Short-circuited above all app chrome in App.tsx (like AmboOutputWindow) so a
// projector can never show the app by mistake.

import React, { useEffect, useRef, useState } from 'react';
import {
  createDjBus, readProgramStreamFromOpener, renderPixelsBackdrop,
  djOutParam, type DjBusMessage, type DjProgramState,
} from '../../services/djStreamBus';

const prettyVisual = (id: string) =>
  id === 'orbs' ? 'Aurora Orbs' : id.replace(/^gen:/, '').replace(/^shader:/, '').replace(/_/g, ' ');

const DjOutputWindow: React.FC = () => {
  const mode = djOutParam() === 'controls' ? 'controls' : 'program';
  return mode === 'controls' ? <ControlsWindow /> : <ProgramWindow />;
};

// ── Program mirror ──────────────────────────────────────────────────────────────
const ProgramWindow: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasStream, setHasStream] = useState(false);
  const stateRef = useRef<DjProgramState | null>(null);
  const rafRef = useRef(0);

  // try to attach the opener's live program stream
  useEffect(() => {
    let tries = 0;
    const attach = () => {
      const stream = readProgramStreamFromOpener();
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setHasStream(true);
        return;
      }
      if (tries++ < 40) setTimeout(attach, 250); // opener may still be building it
    };
    attach();
  }, []);

  // subscribe to program state (drives the fallback compositor + title)
  useEffect(() => {
    const bus = createDjBus();
    const off = bus.subscribe((m: DjBusMessage) => { if (m.kind === 'state') stateRef.current = m.state; });
    return () => { off(); bus.close(); };
  }, []);

  // fallback compositor when there's no direct stream
  useEffect(() => {
    if (hasStream) return;
    const start = performance.now();
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const c = canvasRef.current; if (!c) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      const st = stateRef.current;
      const t = (performance.now() - start) / 1000;
      renderPixelsBackdrop(ctx, c.width, c.height, st?.scene ?? 'warm', st?.level ?? 0.2, t);
      if (st?.nowPlaying) {
        const w = c.width, h = c.height;
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(w * 0.03, h - h * 0.16, w * 0.5, h * 0.11);
        ctx.fillStyle = '#00DAF3';
        ctx.font = `700 ${Math.round(h * 0.022)}px Outfit, system-ui, sans-serif`;
        ctx.fillText('NOW PLAYING', w * 0.055, h - h * 0.115);
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(h * 0.038)}px Outfit, system-ui, sans-serif`;
        ctx.fillText(`${st.nowPlaying.title} — ${st.nowPlaying.artist}`, w * 0.055, h - h * 0.06);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [hasStream]);

  return (
    <div style={shell}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: hasStream ? 'block' : 'none', background: '#000' }} />
      {!hasStream && <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
    </div>
  );
};

// ── Pixels controls ──────────────────────────────────────────────────────────────
const ControlsWindow: React.FC = () => {
  const [current, setCurrent] = useState('orbs');
  const busRef = useRef<ReturnType<typeof createDjBus> | null>(null);
  useEffect(() => {
    const bus = createDjBus();
    busRef.current = bus;
    const off = bus.subscribe((m: DjBusMessage) => { if (m.kind === 'state') setCurrent(m.state.scene); });
    return () => { off(); bus.close(); };
  }, []);
  const send = (scene: string) => busRef.current?.post({ kind: 'scene', scene });
  const btn = (label: string, onClick: () => void, primary = false): React.CSSProperties => ({
    padding: '20px 12px', borderRadius: 14, cursor: 'pointer',
    font: '800 15px Outfit, system-ui, sans-serif',
    border: `1px solid ${primary ? 'rgba(0,218,243,0.5)' : 'rgba(255,255,255,0.12)'}`,
    background: primary ? 'rgba(0,218,243,0.12)' : 'rgba(255,255,255,0.04)',
    color: primary ? '#00DAF3' : 'rgba(244,245,250,0.85)',
  } as React.CSSProperties);
  return (
    <div style={{ ...shell, flexDirection: 'column', gap: 18, padding: 20, alignItems: 'stretch', justifyContent: 'flex-start', background: '#07080c' }}>
      <p style={{ color: '#D0BCFF', font: '700 11px/1.6 Outfit, system-ui, sans-serif', letterSpacing: '.2em', textTransform: 'uppercase', margin: 0 }}>Plajah Pixels · Controls</p>
      <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(0,218,243,0.08)', border: '1px solid rgba(0,218,243,0.25)' }}>
        <div style={{ color: 'rgba(244,245,250,0.5)', font: '700 10px/1 Outfit, system-ui, sans-serif', letterSpacing: '.14em', textTransform: 'uppercase' }}>Now showing</div>
        <div style={{ color: '#fff', font: '800 22px/1.2 Outfit, system-ui, sans-serif', marginTop: 6, textTransform: 'capitalize' }}>{prettyVisual(current)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button onClick={() => send('__prev__')} style={btn('Prev', () => {})}>‹ Prev</button>
        <button onClick={() => send('__next__')} style={btn('Next', () => {})}>Next ›</button>
      </div>
      <button onClick={() => send('orbs')} style={btn('Orbs', () => {}, current === 'orbs')}>Aurora Orbs</button>
      <p style={{ color: 'rgba(244,245,250,0.4)', font: '600 12px/1.6 system-ui, sans-serif', margin: 0 }}>
        Cycle the Pixels generators &amp; shaders — every change drives the Program Out and each open Output window in real time.
      </p>
    </div>
  );
};

const shell: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default DjOutputWindow;

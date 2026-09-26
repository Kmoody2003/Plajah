// AmboOutputWindow — one physical output.
//
// Opened by the router as a separate browser window (`?amboOut=<id>`), it
// subscribes to the studio's BroadcastChannel and composites the live stack
// ITSELF. Nothing is copied window-to-window, so a fifth projector costs a
// window and a GPU surface — not a frame-blit off the studio's canvas. That is
// the whole reason the output count is bounded by hardware rather than by us.
//
// It renders only the layers its own output config allows, which is why a
// switcher key here carries no background and a stage display carries no props.

import React, { useEffect, useRef, useState } from 'react';
import {
  outputIdFromUrl, stackForOutput, subscribeToStudio,
  type AmboOutput, type OutputMessage,
} from '../../services/ambo/outputRouter';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import type { LiveStack } from '../../services/ambo/showModel';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const AmboOutputWindow: React.FC<{ outputId?: string | null }> = ({ outputId }) => {
  const id = outputId ?? outputIdFromUrl();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);

  const [output, setOutput] = useState<AmboOutput | null>(null);
  const [stack, setStack] = useState<LiveStack>({});
  const [timers, setTimers] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Subscribe to the studio.
  useEffect(() => {
    if (!id) return;
    const off = subscribeToStudio((m: OutputMessage) => {
      if (m.type === 'CLOSE') {
        rendererRef.current?.dispose();
        rendererRef.current = null;
        try {
          const vids = Array.from(document.querySelectorAll('video, audio'));
          vids.forEach((el: any) => { el.pause?.(); el.src = ''; el.load?.(); });
        } catch {}
        try { window.close(); } catch {}
        return;
      }
      setConnected(true);
      const mine = m.outputs?.find(o => o.id === id) ?? null;
      if (mine) setOutput(mine);
      if (m.stack) setStack(m.stack);
      if (m.timers) setTimers(m.timers);
    });
    return off;
  }, [id]);

  const [detectedResolution, setDetectedResolution] = useState<{ w: number; h: number } | null>(null);
  const [showHud, setShowHud] = useState(true);

  // Auto-detect the physical size and resolution of the output display this window is placed on
  useEffect(() => {
    const updateSize = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const w = Math.round((window.screen?.width || window.innerWidth || 1920) * dpr);
      const h = Math.round((window.screen?.height || window.innerHeight || 1080) * dpr);
      setDetectedResolution({ w, h });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const timer = setTimeout(() => setShowHud(false), 3500);
    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  // Prioritize detected physical resolution when auto-detect is active
  const renderWidth = (output?.autoDetectDisplay !== false && detectedResolution?.w)
    ? detectedResolution.w
    : (output?.width || detectedResolution?.w || 1920);
  const renderHeight = (output?.autoDetectDisplay !== false && detectedResolution?.h)
    ? detectedResolution.h
    : (output?.height || detectedResolution?.h || 1080);

  // Stage displays show a wall clock; it must tick even when nothing is cued.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  // One renderer for the life of the window, rendering at physical detected resolution.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !output) return;
    const r = new LayerRenderer(c, { w: renderWidth, h: renderHeight });
    r.setOptions({ alpha: output.alpha, outputMask: output.mask, outputTransform: output.transform, timers });
    r.start();
    rendererRef.current = r;
    return () => { r.dispose(); rendererRef.current = null; };
  }, [output?.id, renderWidth, renderHeight, output?.alpha]);

  // Push each new stack through the reconciler — this is where a background
  // survives a slide change.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !output) return;
    r.setOptions({ timers });
    r.setStack(stackForOutput(stack, output));
  }, [stack, output, timers]);

  if (!id) {
    return (
      <div style={shell}>
        <p style={hint}>This window was opened without an output id.</p>
      </div>
    );
  }

  const isStage = output?.kind === 'STAGE';

  return (
    <div
      style={{ ...shell, background: output?.alpha ? 'transparent' : '#000' }}
      onDoubleClick={toggleFullscreen}
      title="Double-click or press 'F' to toggle borderless fullscreen"
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />

      {/* Auto-detected display HUD badge */}
      {showHud && (
        <div style={hudStyle}>
          <span style={dotStyle} />
          <span>{output?.name || 'AMBO OUTPUT'} · {renderWidth}×{renderHeight} {output?.autoDetectDisplay !== false ? '(AUTO-DETECTED)' : ''}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(0, 218, 243, 0.2)',
              border: '1px solid rgba(0, 218, 243, 0.5)',
              color: '#00daf3',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            {isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          </button>
        </div>
      )}

      {/* Stage display furniture — never composited into program, drawn over
          the canvas so it can never leak onto the congregation's screens. */}
      {isStage && (
        <div style={stageBar}>
          {output?.showClock && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock}</span>}
          {Object.entries(timers).map(([k, v]) => (
            <span key={k} style={{ color: v <= 0 ? '#FF5A5F' : '#2BE0A8', fontVariantNumeric: 'tabular-nums' }}>
              {k} {fmt(v)}
            </span>
          ))}
        </div>
      )}

      {!connected && (
        <div style={overlayCentre}>
          <p style={hint}>Waiting for the studio…</p>
          <p style={{ ...hint, opacity: 0.5, marginTop: 6 }}>Output {id}</p>
        </div>
      )}
    </div>
  );
};

const hudStyle: React.CSSProperties = {
  position: 'absolute', top: 16, left: 16,
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 14px', borderRadius: 8,
  background: 'rgba(10, 7, 17, 0.82)',
  border: '1px solid rgba(0, 218, 243, 0.35)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)',
  color: '#00daf3', font: '700 11px/1 ui-monospace, monospace',
  letterSpacing: '0.12em', pointerEvents: 'none',
  transition: 'opacity 0.6s ease',
};

const dotStyle: React.CSSProperties = {
  width: 7, height: 7, borderRadius: '50%',
  background: '#00e676', boxShadow: '0 0 8px #00e676',
};

const shell: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const overlayCentre: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
};
const hint: React.CSSProperties = {
  color: 'rgba(255,255,255,0.5)', font: '600 11px/1.6 system-ui, sans-serif',
  letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0,
};
const stageBar: React.CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0,
  display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'center',
  padding: '10px 16px', background: 'rgba(0,0,0,0.6)',
  color: '#fff', font: '700 22px/1 ui-monospace, monospace',
};

export default AmboOutputWindow;

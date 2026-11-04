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
  makeOutput, outputIdFromUrl, stackForOutput, subscribeToStudio,
  type AmboOutput, type OutputMessage,
} from '../../services/ambo/outputRouter';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { installRemoteAmboAnalyser } from '../../services/ambo/amboAudioEngine';
import { setVideoSyncRole } from '../../services/ambo/videoSync';
import {
  blitProgramSurface, connectProgramBusRtcClient,
  readOpenerProgramCanvas, reportOutputWindowMetrics,
} from '../../services/ambo/programBus';
import { aspectLabel, busSize, DISPLAY_SCALE_CSS, mirrorsProgram, sameAspect } from '../../services/ambo/busFormat';
import type { LiveStack } from '../../services/ambo/showModel';
import type { ProgramTake } from '../../services/ambo/outputRouter';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const AmboOutputWindow: React.FC<{ outputId?: string | null }> = ({ outputId }) => {
  // Video in this window is a FOLLOWER of the studio's Program clip (one clock,
  // always muted). Must be set before the first renderer builds a VideoSource.
  setVideoSyncRole('follower');
  const id = outputId ?? outputIdFromUrl();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);
  const rtcVideoRef = useRef<HTMLVideoElement | null>(null);

  const [output, setOutput] = useState<AmboOutput | null>(null);
  /** The bus the studio's master canvas is rendering, to tell whether it is this window's picture. */
  const [programOut, setProgramOut] = useState<AmboOutput | null>(null);
  const [stack, setStack] = useState<LiveStack>({});
  const [timers, setTimers] = useState<Record<string, number>>({});
  const [take, setTake] = useState<ProgramTake | undefined>(undefined);
  /** The take this window has already transitioned for — the first state it hears is shown as-is. */
  const shownTakeRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Visualizers here react to the studio's mix: its spectrum arrives over a
  // BroadcastChannel (this window has no access to the studio's AudioContext).
  useEffect(() => installRemoteAmboAnalyser(), []);

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
      // An id the studio doesn't list (renamed output, stale window) still gets
      // program rather than a black screen that looks connected.
      const mine = m.outputs?.find(o => o.id === id)
        ?? m.outputs?.find(o => o.kind === 'PROGRAM')
        ?? makeOutput('PROGRAM', 'Program', { id });
      setOutput(prev => (prev && JSON.stringify(prev) === JSON.stringify(mine) ? prev : mine));
      const pgm = m.outputs?.find(o => o.kind === 'PROGRAM') ?? m.outputs?.[0] ?? null;
      setProgramOut(prev => (JSON.stringify(prev) === JSON.stringify(pgm) ? prev : pgm));
      if (m.stack) setStack(m.stack);
      if (m.timers) setTimers(m.timers);
      if (m.take) setTake(prev => (prev?.seq === m.take!.seq ? prev : m.take));
    });
    return off;
  }, [id]);

  const [detectedResolution, setDetectedResolution] = useState<{ w: number; h: number } | null>(null);
  const [showHud, setShowHud] = useState(true);

  // Auto-detect the live physical viewport size and resolution of the output window
  useEffect(() => {
    const updateSize = () => {
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const vw = window.innerWidth || document.documentElement?.clientWidth || window.screen?.width || 1920;
      const vh = window.innerHeight || document.documentElement?.clientHeight || window.screen?.height || 1080;
      const w = Math.max(2, Math.round(vw * dpr));
      const h = Math.max(2, Math.round(vh * dpr));
      setDetectedResolution(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      reportOutputWindowMetrics(id, w, h, aspectLabel(w, h));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const timer = setTimeout(() => setShowHud(false), 3500);
    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timer);
    };
  }, [id]);

  // The studio can lose the size this window reported (a device rescan, a saved show loading).
  // Say it again, or the master bus goes back to the stale shape until the next window resize.
  useEffect(() => {
    if (!id || !output || output.autoDetectDisplay === false || !detectedResolution) return;
    if (output.width === detectedResolution.w && output.height === detectedResolution.h) return;
    reportOutputWindowMetrics(id, detectedResolution.w, detectedResolution.h, aspectLabel(detectedResolution.w, detectedResolution.h));
  }, [id, output, detectedResolution]);

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

  // Prioritize detected physical viewport resolution when auto-detect is active
  const { w: renderWidth, h: renderHeight } = busSize(output, detectedResolution);
  const fixedFormat = output?.autoDetectDisplay === false;

  // Stage displays show a wall clock; it must tick even when nothing is cued.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  // True when this output window should display the exact Program Bus feed from the Studio.
  // Otherwise it composites for itself: a stripped stack (Stage Display, Switcher Key, or any bus
  // whose layers differ from Program's, like a lobby loop), or a bus whose shape or fit differs
  // from Program, which re-flows to its own frame instead of showing Program's with bars around it.
  const isProgramMirror = mirrorsProgram(output, programOut, detectedResolution);

  // Connect local loopback WebRTC client when window.opener is unavailable (e.g. Native WinUI 3 output window).
  useEffect(() => {
    if (!id || !isProgramMirror) return;
    if (readOpenerProgramCanvas()) return;
    if (typeof document === 'undefined' || typeof RTCPeerConnection === 'undefined') return;
    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.autoplay = true;
    rtcVideoRef.current = vid;
    const disconnect = connectProgramBusRtcClient(id, (stream) => {
      if (!stream) {
        vid.srcObject = null;
        return;
      }
      vid.srcObject = stream;
      vid.play().catch(() => {});
    });
    return () => {
      disconnect();
      vid.pause();
      vid.srcObject = null;
      rtcVideoRef.current = null;
    };
  }, [id, isProgramMirror]);

  // One renderer for the life of the window — resized in-place when viewport dimensions change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !output) return;
    const r = new LayerRenderer(c, { w: renderWidth, h: renderHeight });
    r.setOptions({ alpha: output.alpha, outputMask: output.mask, outputTransform: output.transform, fit: output.fit, timers });
    if (!isProgramMirror || !readOpenerProgramCanvas()) {
      r.start();
    }
    rendererRef.current = r;
    return () => { r.dispose(); rendererRef.current = null; };
  }, [output?.id, output?.alpha]);

  // Resize renderer and active procedural sources in-place without restarting generators.
  useEffect(() => {
    rendererRef.current?.resize(renderWidth, renderHeight);
    const c = canvasRef.current;
    if (c && (c.width !== renderWidth || c.height !== renderHeight)) {
      c.width = renderWidth;
      c.height = renderHeight;
    }
  }, [renderWidth, renderHeight]);

  // Mirror the Studio Master Program Bus directly onto our full-window canvas when available,
  // pausing the local fallback LayerRenderer so no duplicate generator instance runs.
  useEffect(() => {
    if (!isProgramMirror) {
      rendererRef.current?.start();
      return;
    }
    let raf = 0;
    let active = true;
    const tick = () => {
      if (!active) return;
      const c = canvasRef.current;
      const openerCanvas = readOpenerProgramCanvas();
      const rtcVid = rtcVideoRef.current;
      // The master can still be another shape for a moment (it resizes after this window reports).
      // Render locally until it matches: a frame of ours beats a frame of bars.
      const fits = (sw: number, sh: number) => sameAspect({ w: sw, h: sh }, { w: renderWidth, h: renderHeight });
      if (c && openerCanvas && openerCanvas.width > 0 && openerCanvas.height > 0 && fits(openerCanvas.width, openerCanvas.height)) {
        rendererRef.current?.stop();
        if (c.width !== renderWidth || c.height !== renderHeight) {
          c.width = renderWidth;
          c.height = renderHeight;
        }
        blitProgramSurface(openerCanvas, c);
        setConnected(true);
      } else if (c && rtcVid && rtcVid.readyState >= 2 && rtcVid.videoWidth > 0 && rtcVid.videoHeight > 0 && fits(rtcVid.videoWidth, rtcVid.videoHeight)) {
        rendererRef.current?.stop();
        if (c.width !== renderWidth || c.height !== renderHeight) {
          c.width = renderWidth;
          c.height = renderHeight;
        }
        blitProgramSurface(rtcVid, c);
        setConnected(true);
      } else {
        rendererRef.current?.start();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isProgramMirror, renderWidth, renderHeight]);

  // Push each new stack through the reconciler — this is where a background
  // survives a slide change (used for Stage / Key outputs or fallback mode).
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !output) return;
    r.setOptions({ timers, outputMask: output.mask, outputTransform: output.transform, fit: output.fit });
    if (take && shownTakeRef.current !== take.seq) {
      // Stage displays cut — confidence monitors should never lag the speaker.
      if (shownTakeRef.current !== null && output.kind !== 'STAGE') r.beginTransition(take);
      shownTakeRef.current = take.seq;
    }
    r.setStack(stackForOutput(stack, output));
  }, [stack, output, timers, take]);

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
        data-bus-source={isProgramMirror ? 'master' : 'own'}
        // Matching its display the canvas IS the screen's shape. Only a fixed format can differ,
        // and then its own scaling setting decides.
        style={{ width: '100vw', height: '100dvh', objectFit: fixedFormat ? DISPLAY_SCALE_CSS[output?.displayScale ?? 'fit'] : 'fill', display: 'block' }}
      />

      {/* Auto-detected display HUD badge */}
      {showHud && (
        <div style={hudStyle}>
          <span style={dotStyle} />
          <span>{output?.name || 'AMBO OUTPUT'} · {renderWidth}×{renderHeight} · {aspectLabel(renderWidth, renderHeight)} {fixedFormat ? '' : '(AUTO-DETECTED)'}</span>
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

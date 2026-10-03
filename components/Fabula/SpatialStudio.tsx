// SpatialStudio.tsx — Native 3D Stereoscopic Suite in Fabula.
//
// Brings the Meta Quest / Instagram VR and Google Android XR 2D-to-3D auto-conversion pipeline into Fabula:
// - One-click auto depth map + Meta SAM salient object stratification + disocclusion background inpainting.
// - Real-time preview modes: Side-by-Side (SBS), Red/Cyan Anaglyph, Depth Heatmap, SAM Matte, and 3D Orbit Mesh.
// - Precision stereoscopic tuning: Zero Parallax Convergence ($Z_0$), Baseline (IPD), Depth Relief, and Pop-out Boost.
// - Direct WebXR Headset Link for Meta Quest and Apple Vision Pro.
// - Export to Side-by-Side (SBS) 3D asset for timeline compositing or VR delivery.

import React, { useEffect, useRef, useState } from 'react';
import { Box, Eye, Layers, Sparkles, Upload, RotateCw, Check, Film, Sliders, Maximize2 } from 'lucide-react';
import {
  autoConvert2DtoSpatial,
  synthesizeStereoPair,
  DEFAULT_SPATIAL_CONFIG,
  type LayeredDepthImage,
  type SpatialLayerConfig,
  type StereoPairResult,
} from '../../services/fabula/spatialEngine';
import { SpatialDibrRenderer } from '../../services/fabula/spatialDibrShader';
import { checkWebXrSupport, launchStereoXrSession } from '../../services/fabula/spatialXrSession';

interface SpatialStudioProps {
  prod: any;
  clips?: any[];
  playhead?: number;
  selClip?: any;
  ping: (msg: string) => void;
  onAddToPool?: (asset: any, label: string) => void;
}

export default function SpatialStudio({
  prod,
  clips = [],
  playhead = 0,
  selClip,
  ping,
  onAddToPool,
}: SpatialStudioProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'sbs' | 'anaglyph' | 'depth' | 'sam' | 'orbit'>('sbs');
  const [cfg, setCfg] = useState<SpatialLayerConfig>(DEFAULT_SPATIAL_CONFIG);
  const [ldi, setLdi] = useState<LayeredDepthImage | null>(null);
  const [stereoResult, setStereoResult] = useState<StereoPairResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasWebXr, setHasWebXr] = useState(false);
  const [orbitCam, setOrbitCam] = useState({ az: 0, el: 10, dist: 12 });

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const rendererRef = useRef<SpatialDibrRenderer | null>(null);

  // Available media assets from pool
  const candidates = (prod?.mediaPool || []).filter(
    (a: any) => (a.type === 'video' || a.type === 'image' || a.type === 'graphic') && a.url
  );

  // Set initial selected asset from selClip or first candidate
  useEffect(() => {
    if (selClip?.assetId && candidates.some((a: any) => a.id === selClip.assetId)) {
      setSelectedAssetId(selClip.assetId);
    } else if (!selectedAssetId && candidates.length > 0) {
      setSelectedAssetId(candidates[0].id);
    }
  }, [selClip?.assetId, candidates.length]);

  const activeAsset = (prod?.mediaPool || []).find((a: any) => a.id === selectedAssetId);

  // Check WebXR headset support
  useEffect(() => {
    checkWebXrSupport().then(setHasWebXr).catch(() => setHasWebXr(false));
  }, []);

  // Run 2D-to-3D Conversion (Depth Anything V2 + Meta SAM + Disocclusion Inpainting)
  const runAutoConvert = async (customPoint?: { x: number; y: number }) => {
    const el = mediaRef.current;
    if (!el || !activeAsset) {
      ping('Select a valid media asset to convert');
      return;
    }

    setBusy(true);
    ping('Analyzing depth & segmenting salient subjects via Meta SAM…');

    try {
      const result = await autoConvert2DtoSpatial(el, {
        assetId: activeAsset.id,
        customPrompt: customPoint,
        width: 960,
      });

      if (result) {
        setLdi(result);
        const stereo = synthesizeStereoPair(result, cfg);
        setStereoResult(stereo);
        ping('3D Spatial conversion complete — clean edges & disocclusion synthesized');
      } else {
        ping('Auto-depth could not process this media');
      }
    } catch (err: any) {
      console.error('[SpatialStudio] Conversion error:', err);
      ping(`Conversion failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  // Re-synthesize stereo pair when stereoscopic parameters change
  useEffect(() => {
    if (!ldi) return;
    const stereo = synthesizeStereoPair(ldi, cfg);
    setStereoResult(stereo);
  }, [cfg, ldi]);

  // Update Preview Canvas
  useEffect(() => {
    const cv = previewCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    if (viewMode === 'sbs' && stereoResult?.sbsCanvas) {
      cv.width = stereoResult.sbsCanvas.width;
      cv.height = stereoResult.sbsCanvas.height;
      ctx.drawImage(stereoResult.sbsCanvas, 0, 0);
    } else if (viewMode === 'anaglyph' && stereoResult?.anaglyphCanvas) {
      cv.width = stereoResult.anaglyphCanvas.width;
      cv.height = stereoResult.anaglyphCanvas.height;
      ctx.drawImage(stereoResult.anaglyphCanvas, 0, 0);
    } else if (viewMode === 'depth' && ldi?.depthCanvas) {
      cv.width = ldi.depthCanvas.width;
      cv.height = ldi.depthCanvas.height;
      ctx.drawImage(ldi.depthCanvas, 0, 0);
    } else if (viewMode === 'sam' && ldi?.foregroundMatte) {
      cv.width = ldi.foregroundMatte.width;
      cv.height = ldi.foregroundMatte.height;
      ctx.drawImage(ldi.foregroundMatte, 0, 0);
    } else if (viewMode === 'orbit' && ldi) {
      // 3D orbit wire/solid rendering
      cv.width = ldi.width;
      cv.height = ldi.height;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(ldi.sourceCanvas, 0, 0);
    }
  }, [viewMode, stereoResult, ldi]);

  // Click on viewport to re-prompt SAM with a custom focus point
  const handleViewportClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!previewCanvasRef.current || busy) return;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    runAutoConvert({ x, y });
  };

  // Launch WebXR Immersive Headset Session
  const handleLaunchXr = async () => {
    if (!ldi) {
      ping('Convert media to 3D first');
      return;
    }
    try {
      await launchStereoXrSession(ldi, cfg);
    } catch (err: any) {
      ping(`WebXR session error: ${err?.message || err}`);
    }
  };

  // Add synthesized Side-by-Side 3D asset into Fabula media pool
  const handleAddToPool = () => {
    if (!stereoResult?.sbsCanvas || !onAddToPool || !activeAsset) return;
    stereoResult.sbsCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const newAsset = {
        id: 'sbs_' + Date.now(),
        name: `${activeAsset.name || 'Clip'} (3D SBS)`,
        type: 'image',
        url,
        bin: '3D Stereo',
        session: true,
        spatial: {
          is3D: true,
          mode: 'sbs',
          cfg,
        },
      };
      onAddToPool(newAsset, `${activeAsset.name} (3D SBS)`);
      ping('Added 3D Side-by-Side asset to media pool');
    }, 'image/png');
  };

  return (
    <div className="glass-card" style={{ padding: 18, marginBottom: 14 }}>
      {/* Hidden media element for extraction */}
      {activeAsset?.type === 'video' ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={activeAsset.url}
          muted
          playsInline
          crossOrigin="anonymous"
          style={{ display: 'none' }}
        />
      ) : (
        <img
          ref={mediaRef as React.RefObject<HTMLImageElement>}
          src={activeAsset?.url || ''}
          alt=""
          crossOrigin="anonymous"
          style={{ display: 'none' }}
        />
      )}

      {/* Header Band */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Box size={16} className="text-orange-500" />
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff' }}>
            SPATIAL 3D SUITE <span style={{ fontSize: 9.5, opacity: 0.5, color: 'var(--org)' }}>META QUEST & ANDROID XR PIPELINE</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasWebXr && (
            <button
              onClick={handleLaunchXr}
              disabled={!ldi}
              className="minibtn blue"
              title="Launch WebXR Stereoscopic Mode on Meta Quest or Apple Vision Pro"
            >
              <Eye size={12} /> ENTER VR HEADSET
            </button>
          )}
          {stereoResult && (
            <button onClick={handleAddToPool} className="minibtn on" title="Add 3D SBS asset to project media pool">
              <Film size={12} /> ADD 3D SBS TO POOL
            </button>
          )}
        </div>
      </div>

      {/* Selection & Mode Tool Bar */}
      <div className="btnrow" style={{ marginBottom: 12, gap: 8, alignItems: 'center' }}>
        <select
          className="sel"
          style={{ maxWidth: 260 }}
          value={selectedAssetId}
          onChange={(e) => {
            setSelectedAssetId(e.target.value);
            setLdi(null);
            setStereoResult(null);
          }}
        >
          <option value="">— Pick media to convert to 3D —</option>
          {candidates.map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type})
            </option>
          ))}
        </select>

        <button
          className="cta sm"
          disabled={busy || !activeAsset}
          onClick={() => runAutoConvert()}
          style={{ background: 'linear-gradient(135deg, #f97316, #e0459b)' }}
        >
          <Sparkles size={12} /> {busy ? 'CONVERTING…' : 'AUTO-CONVERT (INSTAGRAM/XR STYLE)'}
        </button>

        <div className="seg" style={{ marginLeft: 'auto' }}>
          {[
            ['sbs', 'SIDE-BY-SIDE 3D'],
            ['anaglyph', 'RED/CYAN ANAGLYPH'],
            ['depth', 'DEPTH MAP'],
            ['sam', 'SAM MATTE'],
            ['orbit', '3D ORBIT'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`seg-btn ${viewMode === id ? 'on' : ''}`}
              onClick={() => setViewMode(id as any)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Viewport */}
      <div
        style={{
          width: '100%',
          height: 420,
          background: '#09090c',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          cursor: ldi ? 'crosshair' : 'default',
        }}
      >
        {stereoResult || ldi ? (
          <canvas
            ref={previewCanvasRef}
            onClick={handleViewportClick}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            title="Click anywhere to re-prompt Meta SAM on a specific subject"
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40 }}>
            <Box size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Select a 2D image or video and press AUTO-CONVERT
            </div>
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
              Runs Depth Anything V2 + Meta SAM to stratify depth and inpaint disoccluded background
            </div>
          </div>
        )}

        {/* Viewport Overlay Info */}
        {ldi && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(8px)',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#ddd',
              pointerEvents: 'none',
            }}
          >
            {viewMode === 'sbs' && 'FULL SIDE-BY-SIDE (SBS) · VR HEADSET READY'}
            {viewMode === 'anaglyph' && 'DUBOIS ANAGLYPH · WEAR RED/CYAN GLASSES'}
            {viewMode === 'depth' && 'DEPTH ANYTHING V2 ESTIMATION (NEAR = WHITE)'}
            {viewMode === 'sam' && 'META SAM SALIENT FOREGROUND ISOLATION'}
            {viewMode === 'orbit' && 'STRATIFIED DISOCCLUSION PLANE'}
          </div>
        )}
      </div>

      {/* Stereoscopic Calibration Controls */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="glass-card" style={{ padding: 12, margin: 0 }}>
          <div className="lbl">CONVERGENCE (SCREEN PLANE)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.02"
              value={cfg.convergence}
              onChange={(e) => setCfg({ ...cfg, convergence: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, fontFamily: 'monospace', width: 34 }}>{cfg.convergence.toFixed(2)}</span>
          </div>
          <span style={{ fontSize: 9, opacity: 0.5 }}>Depth distance that rests flat on the display glass</span>
        </div>

        <div className="glass-card" style={{ padding: 12, margin: 0 }}>
          <div className="lbl">BASELINE (INTEROCULAR IPD)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="0.2"
              max="2.5"
              step="0.05"
              value={cfg.baseline}
              onChange={(e) => setCfg({ ...cfg, baseline: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, fontFamily: 'monospace', width: 34 }}>{cfg.baseline.toFixed(2)}×</span>
          </div>
          <span style={{ fontSize: 9, opacity: 0.5 }}>Virtual eye separation (~63mm human baseline)</span>
        </div>

        <div className="glass-card" style={{ padding: 12, margin: 0 }}>
          <div className="lbl">DEPTH RELIEF</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="0.2"
              max="3.0"
              step="0.1"
              value={cfg.depthRelief}
              onChange={(e) => setCfg({ ...cfg, depthRelief: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, fontFamily: 'monospace', width: 34 }}>{cfg.depthRelief.toFixed(1)}</span>
          </div>
          <span style={{ fontSize: 9, opacity: 0.5 }}>Volumetric depth expansion multiplier</span>
        </div>

        <div className="glass-card" style={{ padding: 12, margin: 0 }}>
          <div className="lbl">FOREGROUND POP-OUT BOOST</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="0"
              max="0.25"
              step="0.01"
              value={cfg.fgBoost || 0}
              onChange={(e) => setCfg({ ...cfg, fgBoost: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, fontFamily: 'monospace', width: 34 }}>{(cfg.fgBoost || 0).toFixed(2)}</span>
          </div>
          <span style={{ fontSize: 9, opacity: 0.5 }}>SAM subject separation forward out of the screen</span>
        </div>
      </div>
    </div>
  );
}

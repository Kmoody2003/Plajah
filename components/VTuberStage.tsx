// VTuberStage — a self-contained VTuber preview: your webcam drives a VRM avatar in real time,
// camera-only (no tracker equipment). Start the camera → the engine tracks your face and renders
// the avatar; switch modes (Avatar Only / Picture-in-Picture). The output is a live MediaStream,
// the same one the TV Studio switcher and live feeds consume.

import React, { useEffect, useRef, useState } from 'react';
import { Video, Square, Sparkles, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { createVTuberStream, type VTuberHandle, type VTuberMode } from '../services/vtuber/vtuberEngine';

const T = {
  bg: '#0a0a0f', card: '#12121a', border: '#20202c', ink: '#fff', muted: '#9a9aa6',
  orange: '#FF8C00', violet: '#8166e6', red: '#e23b3b', green: '#5fd17f', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const VTuberStage: React.FC<{ avatarUrl?: string; onBack?: () => void }> = ({ avatarUrl, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<VTuberHandle | null>(null);
  const camRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<VTuberMode>('AVATAR_ONLY');
  const [error, setError] = useState('');

  const stop = () => {
    handleRef.current?.dispose(); handleRef.current = null;
    camRef.current?.getTracks().forEach(t => t.stop()); camRef.current = null;
    setRunning(false); setStatus('');
  };

  const start = async () => {
    if (!avatarUrl) { setError('Add a VRM avatar in Avatar Studio first, then come back.'); return; }
    setBusy(true); setError('');
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      camRef.current = cam;
      const handle = await createVTuberStream(cam, { avatarUrl, mode, width: 1280, height: 720, onStatus: setStatus });
      handleRef.current = handle;
      if (videoRef.current) { videoRef.current.srcObject = handle.stream; await videoRef.current.play().catch(() => {}); }
      setRunning(true);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera permission denied.' : (e?.message || 'Could not start the camera.'));
    } finally { setBusy(false); }
  };

  useEffect(() => () => stop(), []);
  useEffect(() => { handleRef.current?.setMode(mode); }, [mode]);

  const chip = (on: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, border: `1px solid ${on ? T.orange : T.border}`, background: on ? 'rgba(255,140,0,0.14)' : 'transparent', color: on ? T.orange : T.ink });

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '20px 16px 40px', fontFamily: T.font }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={20} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>VTuber Mode</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12.5 }}>Camera-only — your webcam drives a 3D avatar in real time. No tracker equipment.</p>
          </div>
          {running && status && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.green, fontWeight: 700 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: T.green }} /> {status}</span>}
        </div>

        {/* Preview */}
        <div style={{ marginTop: 16, borderRadius: 16, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#000', aspectRatio: '16 / 9', position: 'relative', display: 'grid', placeItems: 'center' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: running ? 'block' : 'none' }} />
          {!running && (
            <div style={{ textAlign: 'center', color: T.muted, padding: 24 }}>
              <Video size={40} style={{ opacity: 0.3 }} />
              <div style={{ marginTop: 10, fontSize: 14 }}>{avatarUrl ? 'Start your camera to bring your avatar to life.' : 'Pick a VRM avatar in Avatar Studio to begin.'}</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {!running ? (
            <button onClick={start} disabled={busy} style={{ cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />} Start camera
            </button>
          ) : (
            <button onClick={stop} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, border: `1px solid ${T.red}`, background: 'transparent', color: T.red, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Square size={15} /> Stop
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('AVATAR_ONLY')} style={chip(mode === 'AVATAR_ONLY')}>Avatar Only</button>
            <button onClick={() => setMode('PIP')} style={chip(mode === 'PIP')}>Picture-in-Picture</button>
          </div>
        </div>

        {error && <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: T.red, fontSize: 12.5, fontWeight: 600 }}><AlertCircle size={14} /> {error}</div>}

        <div style={{ marginTop: 16, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
          Markerless RGB tracking (MediaPipe) drives a VRM avatar entirely on your device. The live output is a standard video stream — drop it into the TV Studio switcher or any live feed. Face + body overlay and segmentation are coming next.
        </div>
      </div>
    </div>
  );
};

export default VTuberStage;

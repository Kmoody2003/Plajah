// LiveTranslation — Phase 1 panel for the on-device live dubbing engine. Pick a target language,
// start your mic, and see live captions while a synthetic target-language voice speaks the
// translation. Fully local (WebGPU); the first start downloads the models once. This proves the
// loop; wiring it as a selectable "language channel" on live talk / the podcast studio is next.

import React, { useEffect, useRef, useState } from 'react';
import { Languages, Mic, Square, Volume2, VolumeX, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { createLiveTranslator, type LiveTranslatorHandle } from '../services/translation/liveTranslator';
import { LANGS } from '../services/translation/translationEngine';

const T = { bg: '#0a0a0f', panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', violet: '#8166e6', red: '#e23b3b', green: '#5fd17f', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

const LiveTranslation: React.FC<{ sourceLang?: string; onBack?: () => void }> = ({ sourceLang = 'en', onBack }) => {
  const handleRef = useRef<LiveTranslatorHandle | null>(null);
  const camRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState('es');
  const [speak, setSpeak] = useState(true);
  const [captions, setCaptions] = useState<Array<{ src: string; t: string }>>([]);

  const stop = () => {
    handleRef.current?.stop(); handleRef.current = null;
    camRef.current?.getTracks().forEach(t => t.stop()); camRef.current = null;
    setRunning(false); setStatus('');
  };

  const start = async () => {
    setBusy(true); setError(''); setCaptions([]);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      camRef.current = mic;
      const handle = await createLiveTranslator(mic, {
        targetLang: target, sourceLang, speak,
        onStatus: setStatus,
        onCaption: (src, t) => setCaptions(prev => [...prev.slice(-40), { src, t }]),
      });
      handleRef.current = handle;
      setRunning(true);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Mic permission denied.' : (e?.message || 'Could not start — needs WebGPU + model download.'));
    } finally { setBusy(false); }
  };

  useEffect(() => () => stop(), []);
  useEffect(() => { handleRef.current?.setTargetLang(target); }, [target]);
  useEffect(() => { handleRef.current?.setSpeak(speak); }, [speak]);

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '18px 16px 40px', fontFamily: T.font }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Back</button>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 16px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'grid', placeItems: 'center' }}><Languages size={20} /></div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Live Translation</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12 }}>On-device dubbing — your speech, spoken live in another language. Nothing leaves your device.</p>
          </div>
          {running && status && <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>● {status}</span>}
        </div>

        {/* controls */}
        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>Translate to</span>
          <select value={target} onChange={e => setTarget(e.target.value)} style={{ background: '#0c0c12', color: T.ink, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
            {LANGS.filter(l => l.code !== sourceLang).map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button onClick={() => setSpeak(s => !s)} title="Speak the synthetic dub" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: `1px solid ${speak ? T.green : T.border}`, background: 'transparent', color: speak ? T.green : T.muted, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
            {speak ? <Volume2 size={15} /> : <VolumeX size={15} />} {speak ? 'Voice on' : 'Captions only'}
          </button>
          <div style={{ flex: 1 }} />
          {!running ? (
            <button onClick={start} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />} {busy ? (status || 'Loading…') : 'Start'}
            </button>
          ) : (
            <button onClick={stop} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: `1px solid ${T.red}`, background: 'transparent', color: T.red, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer' }}>
              <Square size={14} /> Stop
            </button>
          )}
        </div>

        {error && <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: T.red, fontSize: 12.5, fontWeight: 600 }}><AlertCircle size={14} /> {error}</div>}

        {/* captions */}
        <div style={{ marginTop: 14, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, minHeight: 200 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800, marginBottom: 10 }}>LIVE CAPTIONS</div>
          {captions.length === 0 && <p style={{ color: T.muted, fontSize: 12.5, fontStyle: 'italic' }}>{running ? 'Listening… speak now.' : 'Start to see live translation.'}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {captions.slice().reverse().map((c, i) => (
              <div key={captions.length - i} style={{ borderLeft: `2px solid ${T.violet}`, paddingLeft: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.t}</div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{c.src}</div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ marginTop: 14, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
          Whisper (speech) → NLLB (translate) → Kokoro (voice), all local on WebGPU. First start downloads the models once. Matching the speaker's own voice + expressive low-latency streaming come next (heavier models run in the native app).
        </p>
      </div>
    </div>
  );
};

export default LiveTranslation;

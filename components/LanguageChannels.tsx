// LanguageChannels — a reusable bar that turns any live audio into selectable language channels.
// A listener picks "Original" or a language; on a language, the incoming stream is translated +
// dubbed locally (on-device) and the surface mutes the original via onActiveChange. Drop it onto any
// live surface (live talk, streams, the studio) — translation runs per-listener, nothing leaves the device.

import React, { useEffect, useRef, useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { createLiveTranslator, type LiveTranslatorHandle } from '../services/translation/liveTranslator';
import { LANGS } from '../services/translation/translationEngine';

function combineStreams(streams: MediaStream[]): { stream: MediaStream; close: () => void } | null {
  const live = (streams || []).filter(s => s && s.getAudioTracks().length);
  if (!live.length) return null;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();
  for (const s of live) { try { ctx.createMediaStreamSource(s).connect(dest); } catch { /* */ } }
  return { stream: dest.stream, close: () => { try { ctx.close(); } catch { /* */ } } };
}

const chip = (on: boolean): React.CSSProperties => ({ padding: '4px 11px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? '#FF8C00' : 'rgba(255,255,255,0.14)'}`, background: on ? 'rgba(255,140,0,0.18)' : 'transparent', color: on ? '#FF8C00' : '#fff' });

const LanguageChannels: React.FC<{ getStreams: () => MediaStream[]; sourceLang?: string; onActiveChange?: (active: boolean) => void }> = ({ getStreams, sourceLang = 'en', onActiveChange }) => {
  const [active, setActive] = useState('original');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [caption, setCaption] = useState('');
  const handleRef = useRef<LiveTranslatorHandle | null>(null);
  const combRef = useRef<{ stream: MediaStream; close: () => void } | null>(null);

  const stop = () => {
    handleRef.current?.stop(); handleRef.current = null;
    combRef.current?.close(); combRef.current = null;
    setCaption(''); setStatus(''); onActiveChange?.(false);
  };

  const select = async (code: string) => {
    if (code === active || busy) return;
    if (code === 'original') { stop(); setActive('original'); return; }
    setBusy(true); stop();
    const comb = combineStreams(getStreams());
    if (!comb) { setBusy(false); setStatus('No live audio yet'); return; }
    combRef.current = comb;
    try {
      handleRef.current = await createLiveTranslator(comb.stream, {
        targetLang: code, sourceLang, speak: true,
        onStatus: setStatus, onCaption: (_s, t) => setCaption(t),
      });
      setActive(code); onActiveChange?.(true);
    } catch { comb.close(); combRef.current = null; setStatus('Needs WebGPU + model download'); }
    finally { setBusy(false); }
  };

  useEffect(() => () => stop(), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Languages size={14} style={{ color: '#FF8C00' }} />
        <button onClick={() => select('original')} style={chip(active === 'original')}>Original</button>
        {LANGS.filter(l => l.code !== sourceLang).slice(0, 6).map(l => (
          <button key={l.code} onClick={() => select(l.code)} style={chip(active === l.code)}>{l.label}</button>
        ))}
        {busy && <Loader2 size={13} className="animate-spin" style={{ color: '#9a9aa6' }} />}
        {status && <span style={{ fontSize: 10, color: '#9a9aa6' }}>{status}</span>}
      </div>
      {active !== 'original' && caption && <div style={{ fontSize: 12, color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '4px 8px', borderRadius: 6, maxWidth: 480 }}>{caption}</div>}
    </div>
  );
};

export default LanguageChannels;

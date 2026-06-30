// PodcastStudio — the live-radio production console. Host mic + channel meters/faders, a soundboard,
// record→produce an episode, and panels for ad-roll + callers (Comrex-style). Built on the MixEngine
// (one mixed master → recorder + live publish) and the Soundboard. Opened from content-upload
// "Produce", or to review a recording saved from a live session.
//
// Functional now: mic, meters, mute/fader, record→Blob (onFinish), soundboard. Ad-roll pulls a pool
// (brand deals / radio station) and rolls audio/copy; callers + go-live are the next phases.

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Circle, Square, Radio, Megaphone, PhoneCall, X, Loader2, Sliders } from 'lucide-react';
import { MixEngine } from '../services/podcastStudio/mixEngine';
import { Soundboard, DEFAULT_PADS, type SoundPad } from '../services/podcastStudio/soundboard';

const T = { bg: '#0b0b10', panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', violet: '#8166e6', red: '#e23b3b', green: '#5fd17f', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

const Meter: React.FC<{ level: number }> = ({ level }) => (
  <div style={{ height: 6, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.round(level * 100)}%`, background: level > 0.85 ? T.red : level > 0.6 ? T.orange : T.green, transition: 'width 60ms linear' }} />
  </div>
);

const PodcastStudio: React.FC<{ selfUid?: string; albumId?: string; onFinish?: (blob: Blob, durationMs: number) => void; onClose?: () => void }> = ({ onFinish, onClose }) => {
  const mixRef = useRef<MixEngine | null>(null);
  const boardRef = useRef<Soundboard | null>(null);
  const startRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meters, setMeters] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [hostMuted, setHostMuted] = useState(false);
  const [hostGain, setHostGain] = useState(1);
  const [adRolling, setAdRolling] = useState(false);

  // init engine
  useEffect(() => {
    const mix = new MixEngine();
    mixRef.current = mix;
    boardRef.current = new Soundboard(mix);
    mix.addChannel('ads', 'Ads', { duckable: false });
    setReady(true);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m: Record<string, number> = {};
      for (const ch of mix.listChannels()) m[ch.id] = mix.meter(ch.id);
      setMeters(m);
      if (mix.isRecording) setElapsed(Date.now() - startRef.current);
    };
    tick();
    return () => { cancelAnimationFrame(raf); mix.dispose(); };
  }, []);

  const enableMic = async () => {
    const mix = mixRef.current; if (!mix) return;
    setStatus('Opening mic…');
    try { await mix.resume(); await mix.addMic(); setMicOn(true); setStatus(''); }
    catch { setStatus('Mic blocked'); }
  };

  const toggleRec = async () => {
    const mix = mixRef.current; if (!mix) return;
    if (!recording) {
      if (!micOn) await enableMic();
      startRef.current = Date.now();
      mix.startRecording(); setRecording(true); setStatus('● Recording');
    } else {
      setStatus('Finalizing…');
      const blob = await mix.stopRecording();
      const dur = Date.now() - startRef.current;
      setRecording(false); setStatus(blob.size ? 'Episode ready' : '');
      if (blob.size) onFinish?.(blob, dur);
    }
  };

  const firePad = (pad: SoundPad) => boardRef.current?.fire(pad);

  // Ad-roll placeholder: ducks + plays a cue into the ads bus. Phase 2 pulls real creatives from
  // the user's brand deals / radio station (audio + read copy on a teleprompter).
  const rollAd = async () => {
    const mix = mixRef.current; if (!mix || adRolling) return;
    setAdRolling(true); mix.duck(true);
    await boardRef.current?.fire({ id: 'ad_sting', label: 'Ad', builtin: 'riser' });
    setTimeout(() => { mix.duck(false); setAdRolling(false); }, 1400);
  };

  const setGain = (v: number) => { setHostGain(v); mixRef.current?.setGain('host', v); };
  const toggleHostMute = () => { const m = !hostMuted; setHostMuted(m); mixRef.current?.setMute('host', m); };
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '18px 16px 40px', fontFamily: T.font }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'grid', placeItems: 'center' }}><Radio size={20} /></div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Podcast Studio</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12 }}>Record, produce, and broadcast — a live radio station in your browser.</p>
          </div>
          {recording && <span style={{ color: T.red, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>● {fmt(elapsed)}</span>}
          {status && !recording && <span style={{ color: T.muted, fontSize: 12 }}>{status}</span>}
          {onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}><X size={20} /></button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16 }}>
          {/* LEFT: mixer + transport + soundboard */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* channels */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800 }}><Sliders size={13} /> MIXER</div>
              {/* host */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <button onClick={micOn ? toggleHostMute : enableMic} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${micOn && !hostMuted ? T.green : T.border}`, background: 'transparent', color: micOn && !hostMuted ? T.green : T.muted, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  {micOn && !hostMuted ? <Mic size={17} /> : <MicOff size={17} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Host Mic {!micOn && <span style={{ color: T.muted, fontWeight: 400 }}>· tap to enable</span>}</div>
                  <Meter level={meters.host || 0} />
                </div>
                <input type="range" min={0} max={1.5} step={0.01} value={hostGain} onChange={e => setGain(parseFloat(e.target.value))} style={{ width: 90 }} />
              </div>
              {/* soundboard + ads buses (read-only meters) */}
              {['soundboard', 'ads'].map(id => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', opacity: 0.85 }}>
                  <div style={{ width: 38, textAlign: 'center', color: T.muted }}>{id === 'ads' ? <Megaphone size={15} /> : <Circle size={13} />}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 5, textTransform: 'capitalize', color: T.muted }}>{id}</div>
                    <Meter level={meters[id] || 0} />
                  </div>
                  <div style={{ width: 90 }} />
                </div>
              ))}
            </div>

            {/* transport */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={toggleRec} disabled={!ready} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', background: recording ? T.red : T.orange, color: recording ? '#fff' : '#1a1a1a' }}>
                {recording ? <><Square size={15} /> Stop &amp; Save</> : <><Circle size={15} fill="currentColor" /> Record</>}
              </button>
              <button onClick={rollAd} disabled={adRolling} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 10, border: `1px solid ${T.violet}`, background: 'transparent', color: T.violet, cursor: 'pointer', fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}>
                {adRolling ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />} Roll Ad
              </button>
            </div>

            {/* soundboard */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800, marginBottom: 12 }}>SOUNDBOARD</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 10 }}>
                {DEFAULT_PADS.map(pad => (
                  <button key={pad.id} onClick={() => firePad(pad)} style={{ aspectRatio: '1', borderRadius: 12, border: `1px solid ${pad.color || T.border}`, background: `${pad.color || T.violet}1a`, color: pad.color || T.ink, cursor: 'pointer', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{pad.label}</button>
                ))}
                <div style={{ aspectRatio: '1', borderRadius: 12, border: `1px dashed ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 10, textAlign: 'center', padding: 6 }}>+ Upload cue</div>
              </div>
            </div>
          </div>

          {/* RIGHT: ad-roll pool + callers (next phases) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800, marginBottom: 10 }}><Megaphone size={13} /> AD-ROLL</div>
              <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, margin: 0 }}>Roll spots from your <b style={{ color: T.ink }}>radio station</b> rotation and <b style={{ color: T.ink }}>brand deals</b> — audio creatives duck the show, live-reads show the copy on a teleprompter, and each play logs an ad marker on the episode.</p>
            </div>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800, marginBottom: 10 }}><PhoneCall size={13} /> CALLERS</div>
              <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, margin: 0 }}>Comrex-style call-in: share a link, screen callers in cue, put them on air, and drop. Signed-in users or <b style={{ color: T.ink }}>guests</b> (name + a temporary expiring session) can call in.</p>
              <button disabled style={{ marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: 11, fontWeight: 700, cursor: 'not-allowed' }}>Call-in link — coming next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastStudio;

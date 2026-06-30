// WalkieTalkie — the Nextel-style two-way handset. Hold the PTT bar to talk; release sends a
// transmission (chirp on press + release). Incoming from a "hot" contact auto-plays through the
// AM/ham radio chain; everything else lands in the rolling 5-slot reel. Pin / block / hot controls
// per peer. Intentionally analogue-skeuomorphic: brushed chassis, LCD readout, status LEDs.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, X, Pin, Ban, Zap, Play } from 'lucide-react';
import {
  pairId, subscribeChannel, sendTransmission, loadPrefs, setHot, setPinned, setBlocked,
  classify, MAX_HOT, type WalkieTransmission, type WalkiePrefs,
} from '../services/walkieTalkie/walkieService';
import { playChirp, playRadioTransmission, getAudioContext } from '../services/walkieTalkie/radioFX';
import { WalkieLive } from '../services/walkieTalkie/walkieLive';

const C = {
  chassis: 'linear-gradient(160deg,#2a2723,#16140f)', metal: '#3a352c', edge: '#0c0b08',
  lcd: '#0d1f12', lcdInk: '#7dffa0', amber: '#FF8C00', red: '#e23b3b', ink: '#e9e4d8', dim: '#8a8472',
  font: "'Courier New',ui-monospace,monospace",
};
const fmtAgo = (ms: number) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };

const WalkieTalkie: React.FC<{ selfUid: string; peerUid: string; peerName?: string; onClose?: () => void }> = ({ selfUid, peerUid, peerName, onClose }) => {
  const pid = useMemo(() => pairId(selfUid, peerUid), [selfUid, peerUid]);
  const [prefs, setPrefs] = useState<WalkiePrefs | null>(null);
  const [txs, setTxs] = useState<WalkieTransmission[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const liveRef = useRef<WalkieLive | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTsRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  const isHot = !!prefs?.hotUids.includes(peerUid);
  const isPinned = !!prefs?.pinnedFromUids.includes(peerUid);
  const isBlocked = !!prefs?.blockedFromUids.includes(peerUid);
  const hotFull = !!prefs && prefs.hotUids.length >= MAX_HOT && !isHot;

  useEffect(() => { loadPrefs(selfUid).then(setPrefs); }, [selfUid]);

  // realtime channel + auto-play hot incoming
  useEffect(() => {
    const unsub = subscribeChannel(pid, list => {
      setTxs(list);
      const incoming = list.filter(t => t.fromUid === peerUid);
      const newest = incoming[incoming.length - 1];
      const fresh = newest && !seenRef.current.has(newest.id);
      incoming.forEach(t => seenRef.current.add(t.id));
      if (initRef.current && fresh && newest) {
        const rel = prefs ? classify(prefs, peerUid) : 'normal';
        if (rel === 'hot') {
          playChirp(getAudioContext(), 'incoming');
          setReceiving(true);
          playRadioTransmission(newest.audioUrl, { onEnded: () => setReceiving(false) }).catch(() => setReceiving(false));
        }
      }
      initRef.current = true;
    });
    return unsub;
  }, [pid, peerUid, prefs]);

  // Hot contacts open a true live channel over WebRTC (Phase 4). Both sides must have the handset
  // open to connect (mesh of 2); otherwise PTT falls back to the record-and-send rolling-5 path.
  useEffect(() => {
    if (!isHot) { liveRef.current?.dispose(); liveRef.current = null; setLiveConnected(false); return; }
    const live = new WalkieLive(pid, selfUid, peerName || 'Plajah', {
      onPeerPresent: (p) => setLiveConnected(p),
      onPeerTransmitting: (on) => setReceiving(on),
      onError: () => {},
    });
    liveRef.current = live;
    live.connect().catch(() => {});
    return () => { live.dispose(); liveRef.current = null; setLiveConnected(false); };
  }, [isHot, pid, selfUid, peerName]);

  const startPTT = async () => {
    if (recording) return;
    // LIVE channel (hot + peer present): stream the mic instead of recording/uploading.
    if (isHot && liveConnected && liveRef.current) {
      setRecording(true);
      playChirp(getAudioContext(), 'start');
      liveRef.current.setTransmitting(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        streamRef.current?.getTracks().forEach(t => t.stop());
        const dur = Date.now() - startTsRef.current;
        if (dur < 300 || !blob.size) { setStatus(''); return; }
        setStatus('Sending…');
        try { await sendTransmission(selfUid, peerUid, blob, dur); setStatus('Sent'); setTimeout(() => setStatus(''), 1200); }
        catch { setStatus('Send failed'); }
      };
      recRef.current = rec; startTsRef.current = Date.now();
      rec.start(); setRecording(true);
      playChirp(getAudioContext(), 'start');
    } catch { setStatus('Mic blocked'); }
  };
  const stopPTT = () => {
    if (!recording) return;
    if (isHot && liveConnected && liveRef.current) {
      setRecording(false);
      liveRef.current.setTransmitting(false);
      playChirp(getAudioContext(), 'end');
      return;
    }
    setRecording(false);
    playChirp(getAudioContext(), 'end');
    try { recRef.current?.stop(); } catch { /* */ }
  };

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* */ } streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const reel = txs.filter(t => t.fromUid === peerUid).slice(-5).reverse();
  const led = (on: boolean, color: string) => ({ width: 9, height: 9, borderRadius: 99, background: on ? color : '#222', boxShadow: on ? `0 0 8px ${color}` : 'none' });
  const togHot = async () => { if (hotFull) { setStatus('Hot slots full (3)'); setTimeout(() => setStatus(''), 1500); return; } setPrefs(await setHot(selfUid, peerUid, !isHot)); };
  const togPin = async () => setPrefs(await setPinned(selfUid, peerUid, !isPinned));
  const togBlock = async () => setPrefs(await setBlocked(selfUid, peerUid, !isBlocked));

  return (
    <div style={{ width: 340, maxWidth: '92vw', borderRadius: 22, padding: 3, background: C.edge, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', fontFamily: C.font }}>
      <div style={{ borderRadius: 20, background: C.chassis, border: `1px solid ${C.metal}`, padding: 16 }}>
        {/* top: grille + LCD */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: C.metal, display: 'grid', placeItems: 'center', color: C.amber }}><Radio size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: '#a89a7e' }}>DIRECT CONNECT</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, textTransform: 'uppercase' }}>{peerName || 'Contact'}</div>
          </div>
          {onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8472', cursor: 'pointer' }}><X size={18} /></button>}
        </div>

        {/* LCD readout */}
        <div style={{ marginTop: 12, borderRadius: 10, background: C.lcd, border: '2px solid #05140a', padding: '10px 12px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: C.lcdInk, fontSize: 11 }}>
            <span>CH {pid.slice(-4).toUpperCase()}</span>
            <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              {liveConnected && <span style={{ color: C.lcdInk }}>● LIVE</span>}
              {isHot && <span>HOT</span>}{isPinned && <span>PIN</span>}{isBlocked && <span style={{ color: C.red }}>BLK</span>}
            </span>
          </div>
          <div style={{ marginTop: 6, color: receiving ? C.lcdInk : '#3f7a52', fontSize: 13, fontWeight: 700, minHeight: 18 }}>
            {recording ? (liveConnected ? '◉ ON AIR' : '◉ TRANSMITTING') : receiving ? '◀ RECEIVING' : status || (isBlocked ? 'MUTED' : liveConnected ? 'LIVE CHANNEL' : 'STANDBY')}
          </div>
        </div>

        {/* status LEDs */}
        <div style={{ display: 'flex', gap: 16, padding: '10px 4px 4px', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#a89a7e' }}><i style={led(true, '#5fd17f')} /> ONLINE</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#a89a7e' }}><i style={led(receiving, C.amber)} /> RX</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#a89a7e' }}><i style={led(recording, C.red)} /> TX</span>
        </div>

        {/* PTT bar */}
        <button
          onPointerDown={startPTT} onPointerUp={stopPTT} onPointerLeave={stopPTT}
          disabled={isBlocked}
          style={{
            width: '100%', marginTop: 6, padding: '20px 0', borderRadius: 14, userSelect: 'none', touchAction: 'none',
            border: `2px solid ${recording ? C.amber : '#4a4337'}`, cursor: isBlocked ? 'not-allowed' : 'pointer',
            background: recording ? 'radial-gradient(circle,#5a3500,#2a1c00)' : 'linear-gradient(180deg,#403a30,#211d16)',
            color: recording ? C.amber : C.ink, fontWeight: 800, letterSpacing: 3, fontSize: 13,
            boxShadow: recording ? `0 0 22px ${C.amber}55, inset 0 0 18px ${C.amber}33` : 'inset 0 -3px 8px rgba(0,0,0,0.5)',
          }}
        >
          {recording ? 'RELEASE TO SEND' : 'HOLD TO TALK'}
        </button>

        {/* relationship controls */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={togHot} title={`Hot contact (live, max ${MAX_HOT})`} style={ctrl(isHot, C.amber)}><Zap size={13} /> Hot</button>
          <button onClick={togPin} title="Always receive from" style={ctrl(isPinned, '#5fd17f')}><Pin size={13} /> Pin</button>
          <button onClick={togBlock} title="Don't receive from" style={ctrl(isBlocked, C.red)}><Ban size={13} /> Block</button>
        </div>

        {/* the rolling 5-slot reel */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: '#a89a7e', marginBottom: 6 }}>LAST {reel.length}/5 FROM {(peerName || 'CONTACT').toUpperCase()}</div>
          {reel.length === 0 && <div style={{ fontSize: 11, color: '#6b6452', fontStyle: 'italic' }}>No transmissions yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reel.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1c1812', border: '1px solid #332d22', borderRadius: 9, padding: '8px 10px' }}>
                <button onClick={() => { setReceiving(true); playRadioTransmission(t.audioUrl, { onEnded: () => setReceiving(false) }).catch(() => setReceiving(false)); }}
                  style={{ width: 30, height: 30, borderRadius: 99, border: 'none', background: C.amber, color: '#1a1a1a', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <Play size={14} fill="currentColor" />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 4, background: '#332d22', borderRadius: 9, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (t.durationMs / 30000) * 100)}%`, background: C.lcdInk, opacity: 0.5 }} />
                  </div>
                </div>
                <span style={{ fontSize: 10, color: '#8a8472', flexShrink: 0 }}>{(t.durationMs / 1000).toFixed(1)}s · {fmtAgo(t.createdAt)}</span>
                {reel.length - 1 - i === 0 && <span style={{ fontSize: 7, color: '#6b6452' }}>NEXT TO EXPIRE</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ctrl = (on: boolean, color: string): React.CSSProperties => ({
  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '8px 0', borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${on ? color : '#4a4337'}`, background: on ? `${color}22` : 'transparent', color: on ? color : '#a89a7e',
});

export default WalkieTalkie;

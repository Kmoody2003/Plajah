// PodcastListen — the listener page for a live show (?listen=<showId>). Subscribes to the host's
// broadcast of the mixed master and plays it. Signed-in users or guests (temporary anonymous
// session) can tune in.

import React, { useEffect, useRef, useState } from 'react';
import { Radio, Loader2, X, AlertCircle } from 'lucide-react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../services/backendService';
import { joinBroadcast } from '../services/podcastStudio/broadcast';

const T = { bg: '#0a0a0f', panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', green: '#5fd17f', red: '#e23b3b', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

const PodcastListen: React.FC<{ showId: string; onClose?: () => void }> = ({ showId, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handleRef = useRef<{ leave: () => void } | null>(null);
  const [state, setState] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let uid = auth.currentUser?.uid;
        if (!uid) { const c = await signInAnonymously(auth); uid = c.user.uid; }
        const h = await joinBroadcast(showId, uid!, (stream) => {
          if (audioRef.current) { audioRef.current.srcObject = stream; audioRef.current.play().catch(() => {}); }
          if (alive) setState('live');
        }, (e) => { if (alive) setError(e.message); });
        handleRef.current = h;
      } catch (e: any) {
        if (alive) { setError(e?.code === 'auth/operation-not-allowed' ? 'Guest listening needs anonymous sign-in enabled.' : (e?.message || 'Could not connect.')); setState('error'); }
      }
    })();
    return () => { alive = false; handleRef.current?.leave(); };
  }, [showId]);

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, display: 'grid', placeItems: 'center', padding: 20, fontFamily: T.font }}>
      <audio ref={audioRef} autoPlay />
      <div style={{ width: 360, maxWidth: '92vw', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 18, padding: 26, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px', background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'grid', placeItems: 'center' }}><Radio size={26} /></div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>Live Podcast</h1>
        {state === 'live' ? (
          <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, color: T.green, fontWeight: 800, fontSize: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: T.green, boxShadow: `0 0 8px ${T.green}` }} /> ON AIR — listening
          </div>
        ) : state === 'error' ? (
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, color: T.red, fontSize: 12.5, fontWeight: 600 }}><AlertCircle size={14} /> {error}</div>
        ) : (
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, color: T.muted, fontSize: 13 }}><Loader2 size={15} className="animate-spin" /> Tuning in…</div>
        )}
        <p style={{ marginTop: 16, fontSize: 11, color: T.muted }}>{auth.currentUser?.isAnonymous !== false ? 'Listening as a guest.' : ''}</p>
        {onClose && <button onClick={() => { handleRef.current?.leave(); onClose(); }} style={{ marginTop: 16, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><X size={15} /> Leave</button>}
      </div>
    </div>
  );
};

export default PodcastListen;

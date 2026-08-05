// PodcastCallIn — the call-in join page reached via a shared link (?callin=<showId>). Signed-in
// users or guests can call in; a guest just gives a name and joins through a temporary anonymous
// session (no account). Once connected they're in the host's screening cue until put on air.

import React, { useEffect, useRef, useState } from 'react';
import { PhoneCall, PhoneOff, Loader2, AlertCircle, Radio } from 'lucide-react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../services/backendService';
import { joinAsCaller } from '../services/podcastStudio/callLine';

const T = { bg: '#0a0a0f', panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', green: '#5fd17f', red: '#e23b3b', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

const PodcastCallIn: React.FC<{ showId: string; onClose?: () => void }> = ({ showId, onClose }) => {
  const [name, setName] = useState(auth.currentUser?.displayName || '');
  const [state, setState] = useState<'name' | 'connecting' | 'live'>('name');
  const [error, setError] = useState('');
  const handleRef = useRef<{ leave: () => void } | null>(null);

  const join = async () => {
    if (!name.trim()) { setError('Please enter a name.'); return; }
    setState('connecting'); setError('');
    try {
      let uid = auth.currentUser?.uid;
      if (!uid) { const cred = await signInAnonymously(auth); uid = cred.user.uid; } // temporary guest session
      handleRef.current = await joinAsCaller(showId, uid!, name.trim(), e => setError(e.message));
      setState('live');
    } catch (e: any) {
      setError(e?.code === 'auth/operation-not-allowed'
        ? 'Guest call-in needs anonymous sign-in enabled for this app.'
        : (e?.name === 'NotAllowedError' ? 'Microphone permission denied.' : (e?.message || 'Could not connect.')));
      setState('name');
    }
  };
  const leave = () => { handleRef.current?.leave(); handleRef.current = null; onClose?.(); };
  useEffect(() => () => { handleRef.current?.leave(); }, []);

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, display: 'grid', placeItems: 'center', padding: 20, fontFamily: T.font }}>
      <div style={{ width: 360, maxWidth: '92vw', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'grid', placeItems: 'center' }}><Radio size={24} /></div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>Call in to the show</h1>
        <p style={{ margin: '4px 0 18px', color: T.muted, fontSize: 12.5 }}>Join the broadcast live. Your host will screen you, then put you on air.</p>

        {state === 'live' ? (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: T.green, fontWeight: 800, fontSize: 14, marginBottom: 16 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: T.green, boxShadow: `0 0 8px ${T.green}` }} /> On the line — {name}
            </div>
            <p style={{ color: T.muted, fontSize: 11.5, marginBottom: 18 }}>Waiting for the host to bring you on air. Keep this tab open.</p>
            <button onClick={leave} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.red}`, background: 'transparent', color: T.red, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' }}>
              <PhoneOff size={15} /> Hang up
            </button>
          </>
        ) : (
          <>
            <input
              value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={40}
              onKeyDown={e => { if (e.key === 'Enter') join(); }}
              style={{ width: '100%', boxSizing: 'border-box', background: '#0c0c12', color: T.ink, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, marginBottom: 12 }}
            />
            <button onClick={join} disabled={state === 'connecting'} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 10, border: 'none', background: T.orange, color: '#1a1a1a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: state === 'connecting' ? 'default' : 'pointer' }}>
              {state === 'connecting' ? <><Loader2 size={15} className="animate-spin" /> Connecting…</> : <><PhoneCall size={15} /> Call in</>}
            </button>
            {!auth.currentUser && <p style={{ marginTop: 10, fontSize: 10.5, color: T.muted }}>Calling in as a guest — a temporary session, no account needed.</p>}
          </>
        )}
        {error && <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: T.red, fontSize: 12, fontWeight: 600 }}><AlertCircle size={14} /> {error}</div>}
      </div>
    </div>
  );
};

export default PodcastCallIn;

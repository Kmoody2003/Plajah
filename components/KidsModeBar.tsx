// KidsModeBar — the persistent top strip shown while a parent is viewing AS a child
// (in-session Kids Mode). Exiting back to the parent requires the guardian passcode if one
// was set (so a kid can't just tap out); otherwise it exits directly.

import React, { useState } from 'react';
import { Baby, LogOut, X } from 'lucide-react';
import type { UserProfile } from '../types';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const KidsModeBar: React.FC<{ child: UserProfile; onExit: () => void }> = ({ child, onExit }) => {
  const [prompting, setPrompting] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const hash = child.parentalControls?.guardianPasscodeHash;

  const tryExit = () => { if (hash) setPrompting(true); else onExit(); };
  const submit = async () => { if (hash && (await sha256(pin)) === hash) onExit(); else setErr(true); };

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '6px 12px', background: 'linear-gradient(90deg,#FF8C00,#36c5f0)', color: '#0d0d14', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fontWeight: 800, fontSize: 12.5 }}>
        <Baby size={15} /> Kids Mode · {child.displayName}
        <button onClick={tryExit} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 8, padding: '3px 10px', borderRadius: 14, border: 'none', background: 'rgba(0,0,0,0.25)', color: '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}><LogOut size={12} /> Exit</button>
      </div>

      {prompting && (
        <div onClick={() => setPrompting(false)} style={{ position: 'fixed', inset: 0, zIndex: 2147483001, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 320, background: '#14141c', border: '1px solid #2a2a38', borderRadius: 16, padding: 20, color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 800 }}>Parent passcode</span>
              <button onClick={() => setPrompting(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setErr(false); }} type="password" inputMode="numeric" placeholder="••••" autoFocus
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${err ? '#ff7070' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 18, letterSpacing: 4, textAlign: 'center', boxSizing: 'border-box' }} />
            {err && <div style={{ color: '#ff9090', fontSize: 12, marginTop: 8 }}>Incorrect passcode.</div>}
            <button onClick={submit} style={{ width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#FF8C00,#ffa733)', color: '#1a1a1a', fontWeight: 800, cursor: 'pointer' }}>Exit Kids Mode</button>
          </div>
        </div>
      )}
    </>
  );
};

export default KidsModeBar;

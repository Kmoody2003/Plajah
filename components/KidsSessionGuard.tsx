// KidsSessionGuard — enforces a guardian's screen-time limits on a CHILD account. Drop
// once near the app root: <KidsSessionGuard profile={userProfile} />. It self-manages —
// renders nothing for adults, a small time pill for kids, and a full-screen lock overlay
// when the daily limit is hit or the session is outside allowed hours. Unlock requires
// the guardian passcode (grants a short grace extension). Tracking is local + per-day.

import React, { useEffect, useState, useCallback } from 'react';
import { Lock, Clock } from 'lucide-react';
import type { UserProfile } from '../types';
import { resolveControls, isChildAccount } from '../services/contentSafety';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const today = () => new Date().toISOString().slice(0, 10);
const usedKey = (uid: string) => `kids_time_${uid}_${today()}`;
const graceKey = (uid: string) => `kids_grace_${uid}_${today()}`;

const KidsSessionGuard: React.FC<{ profile?: UserProfile | null }> = ({ profile }) => {
  const controls = resolveControls(profile);
  const isChild = isChildAccount(profile);
  const uid = profile?.uid || '';
  const limit = controls.dailyTimeLimitMins || 0;
  const hours = controls.allowedHours;

  const [usedMins, setUsedMins] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<'time' | 'hours'>('time');
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);

  const graceMins = useCallback(() => Number(localStorage.getItem(graceKey(uid)) || 0), [uid]);

  // Tick used-minutes every 30s while the tab is visible.
  useEffect(() => {
    if (!isChild || !uid) return;
    setUsedMins(Number(localStorage.getItem(usedKey(uid)) || 0));
    const id = setInterval(() => {
      if (document.hidden) return;
      const next = Number(localStorage.getItem(usedKey(uid)) || 0) + 0.5;
      localStorage.setItem(usedKey(uid), String(next));
      setUsedMins(next);
    }, 30_000);
    return () => clearInterval(id);
  }, [isChild, uid]);

  // Evaluate lock conditions whenever time changes.
  useEffect(() => {
    if (!isChild) { setLocked(false); return; }
    // Outside allowed hours?
    if (hours) {
      const h = new Date().getHours();
      const inWindow = hours.start <= hours.end ? (h >= hours.start && h < hours.end) : (h >= hours.start || h < hours.end);
      if (!inWindow) { setLockReason('hours'); setLocked(true); return; }
    }
    // Over the daily cap (minus any guardian-granted grace)?
    if (limit > 0 && usedMins >= limit + graceMins()) { setLockReason('time'); setLocked(true); return; }
    setLocked(false);
  }, [isChild, usedMins, limit, hours, graceMins]);

  const tryUnlock = async () => {
    const hash = controls.guardianPasscodeHash;
    if (!hash) { setPinErr(true); return; }
    if (await sha256(pin) === hash) {
      // grant +20 minutes of grace for today and clear the lock
      localStorage.setItem(graceKey(uid), String(graceMins() + 20));
      setPin(''); setPinErr(false); setLocked(false);
    } else { setPinErr(true); }
  };

  if (!isChild) return null;

  return (
    <>
      {/* time pill */}
      {limit > 0 && !locked && (
        <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 9000, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,20,48,0.85)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 11px', color: '#cfe', fontSize: 11, fontWeight: 700 }}>
          <Clock size={12} /> {Math.max(0, Math.round(limit + graceMins() - usedMins))} min left
        </div>
      )}

      {locked && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'linear-gradient(160deg,#0e1430,#16204a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
          <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
            <div style={{ width: 72, height: 72, borderRadius: 24, background: 'rgba(255,140,0,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}><Lock size={34} color="#FF8C00" /></div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{lockReason === 'time' ? "Time's up for today!" : 'Not screen-time right now'}</h2>
            <p style={{ color: '#aeb6d8', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
              {lockReason === 'time'
                ? 'You hit your daily limit. Ask a parent if you need more time.'
                : "It's outside your allowed hours. Come back later, or ask a parent."}
            </p>
            <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#8a93b8', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Parent passcode</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinErr(false); }}
                  type="password" inputMode="numeric" placeholder="••••" autoFocus
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${pinErr ? '#ff7070' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 18, letterSpacing: 4, textAlign: 'center' }} />
                <button onClick={tryUnlock} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#FF8C00,#ffa733)', color: '#1a1a1a', fontWeight: 800, cursor: 'pointer' }}>Unlock</button>
              </div>
              {pinErr && <div style={{ color: '#ff9090', fontSize: 12, marginTop: 8 }}>{controls.guardianPasscodeHash ? 'Incorrect passcode.' : 'No parent passcode set — a parent can set one in Parental Controls.'}</div>}
              <div style={{ color: '#6b73a0', fontSize: 11, marginTop: 8 }}>Unlocking grants 20 more minutes today.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KidsSessionGuard;

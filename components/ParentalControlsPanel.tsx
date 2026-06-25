// ParentalControlsPanel — where a guardian configures a CHILD account: the adult-content
// filter (forced on, shown locked), maturity ceiling, hide-adult-posts, Kids Mode skin,
// daily screen-time limit, allowed hours, and the parent passcode that unlocks a locked
// session. Saves to the child's profile.parentalControls.

import React, { useState } from 'react';
import { ShieldCheck, Lock, Clock, Baby, Save, Eye } from 'lucide-react';
import type { UserProfile, ParentalControls, MaturityRating } from '../types';
import { CHILD_DEFAULTS, resolveControls } from '../services/contentSafety';
import { updateUserProfile } from '../services/backendService';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const MATURITY: { v: MaturityRating; label: string }[] = [
  { v: 'G', label: 'G · Everyone' },
  { v: 'PG', label: 'PG · Younger kids' },
  { v: 'PG13', label: 'PG-13 · Older kids' },
  { v: 'TEEN', label: 'Teen' },
];

const ParentalControlsPanel: React.FC<{ child: UserProfile; guardianUid?: string; onSaved?: () => void; onClose?: () => void }> = ({ child, guardianUid, onSaved, onClose }) => {
  const init = resolveControls(child);
  const [c, setC] = useState<ParentalControls>({ ...CHILD_DEFAULTS, ...init });
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const set = (patch: Partial<ParentalControls>) => setC(prev => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const next: ParentalControls = { ...c, adultFilter: true, updatedAt: Date.now(), updatedBy: guardianUid };
      if (pin.trim()) next.guardianPasscodeHash = await sha256(pin.trim());
      await updateUserProfile(child.uid, { parentalControls: next, isChild: true, ...(guardianUid ? { guardianUid } : {}) });
      setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500);
      onSaved?.();
    } catch (e) { console.warn('[ParentalControls] save failed', e); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 520, color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,140,0,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ShieldCheck size={20} color="#FF8C00" /></div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Parental controls</h2>
          <div style={{ fontSize: 12, color: '#9aa0c0' }}>for {child.displayName}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {/* adult filter (forced) */}
        <Row icon={<ShieldCheck size={16} />} title="Adult-content filter" sub="Always on for children — hides explicit/age-restricted content everywhere.">
          <span style={{ fontSize: 11, color: '#84e08a', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700 }}><Lock size={12} /> On</span>
        </Row>

        {/* maturity ceiling */}
        <Row icon={<Eye size={16} />} title="Maximum maturity" sub="Highest rating they can see in Movies, Music, and the Feed.">
          <select value={c.maxMaturity} onChange={e => set({ maxMaturity: e.target.value as MaturityRating })} style={selStyle}>
            {MATURITY.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
        </Row>

        <Toggle title="Hide adult-themed posts" sub="Filter the social feed." on={c.hideAdultPosts} onToggle={() => set({ hideAdultPosts: !c.hideAdultPosts })} />
        <Toggle title="Kids Mode" sub="Friendly skin + only kid-safe sections (Lorea, Classroom, Games, Labs)." on={c.kidsMode} onToggle={() => set({ kidsMode: !c.kidsMode })} icon={<Baby size={16} />} />

        {/* screen time */}
        <Row icon={<Clock size={16} />} title="Daily time limit" sub="Locks the session when reached (0 = unlimited).">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={0} max={600} value={c.dailyTimeLimitMins ?? 0} onChange={e => set({ dailyTimeLimitMins: Math.max(0, parseInt(e.target.value || '0', 10)) })} style={{ ...selStyle, width: 76, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: '#9aa0c0' }}>min</span>
          </div>
        </Row>

        {/* allowed hours */}
        <Row icon={<Clock size={16} />} title="Allowed hours" sub="Outside this window the session is locked.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <input type="number" min={0} max={23} value={c.allowedHours?.start ?? 7} onChange={e => set({ allowedHours: { start: clampH(e.target.value), end: c.allowedHours?.end ?? 20 } })} style={{ ...selStyle, width: 52, textAlign: 'center' }} />
            <span style={{ color: '#9aa0c0' }}>to</span>
            <input type="number" min={0} max={23} value={c.allowedHours?.end ?? 20} onChange={e => set({ allowedHours: { start: c.allowedHours?.start ?? 7, end: clampH(e.target.value) } })} style={{ ...selStyle, width: 52, textAlign: 'center' }} />
          </div>
        </Row>

        {/* passcode */}
        <Row icon={<Lock size={16} />} title="Parent passcode" sub={c.guardianPasscodeHash ? 'Set — enter a new value to change it.' : 'Set a PIN to unlock a locked session.'}>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} type="password" inputMode="numeric" placeholder={c.guardianPasscodeHash ? '••••' : 'Set PIN'} style={{ ...selStyle, width: 96, textAlign: 'center', letterSpacing: 3 }} />
        </Row>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#FF8C00,#ffa733)', color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}><Save size={15} /> {saving ? 'Saving…' : 'Save controls'}</button>
        {onClose && <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#bbb', cursor: 'pointer', fontSize: 13 }}>Close</button>}
        {savedMsg && <span style={{ color: '#84e08a', fontSize: 12.5, fontWeight: 700 }}>✓ Saved</span>}
      </div>
    </div>
  );
};

const clampH = (s: string) => Math.max(0, Math.min(23, parseInt(s || '0', 10)));
const selStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13 };

const Row: React.FC<{ icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }> = ({ icon, title, sub, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '11px 13px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
      <span style={{ color: '#FF8C00', marginTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9aa0c0', marginTop: 1 }}>{sub}</div>
      </div>
    </div>
    <div style={{ flex: '0 0 auto' }}>{children}</div>
  </div>
);

const Toggle: React.FC<{ title: string; sub: string; on: boolean; onToggle: () => void; icon?: React.ReactNode }> = ({ title, sub, on, onToggle, icon }) => (
  <Row icon={icon || <Eye size={16} />} title={title} sub={sub}>
    <button onClick={onToggle} style={{ width: 46, height: 26, borderRadius: 14, border: 'none', cursor: 'pointer', background: on ? '#FF8C00' : 'rgba(255,255,255,0.18)', position: 'relative', transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  </Row>
);

export default ParentalControlsPanel;

// FamilyAccountManager — the parent's Family section: create + manage CHILD accounts
// (Firestore-only managed profiles, safe-by-default), set each child's parental controls,
// and switch into a child's Kids Mode. Surfaced as a dashboard tab for PARENT accounts.

import React, { useEffect, useState } from 'react';
import { Baby, Plus, ShieldCheck, LogIn, Trash2, X, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import type { UserProfile } from '../types';
import { listChildProfiles, deleteChildProfile } from '../services/backendService';
import { provisionChild, claimChild } from '../services/learnerAuthService';
import ParentalControlsPanel from './ParentalControlsPanel';

const AVATAR_COLORS = ['#FF8C00', '#36c5f0', '#2bd67a', '#e23b6d', '#7a2bd6', '#f5c542'];
const colorFor = (id: string) => AVATAR_COLORS[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length];

const FamilyAccountManager: React.FC<{ guardianUid: string }> = ({ guardianUid }) => {
  const [children, setChildren] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [controlsFor, setControlsFor] = useState<UserProfile | null>(null);
  // Claim a teacher-provisioned child with an offline code.
  const [claiming, setClaiming] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimMsg, setClaimMsg] = useState('');

  const load = async () => { setLoading(true); setChildren(await listChildProfiles(guardianUid)); setLoading(false); };
  useEffect(() => { if (guardianUid) load(); /* eslint-disable-next-line */ }, [guardianUid]);

  const addChild = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      await provisionChild({
        role: 'parent',
        displayName: name.trim(),
        username: username.trim(),
        password,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
      });
      setName(''); setUsername(''); setPassword(''); setBirthYear(''); setAdding(false);
      load();
    } catch (e: any) {
      setError(e.message || 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  const doClaim = async () => {
    if (!claimCode.trim()) return;
    setBusy(true); setClaimMsg('');
    try {
      await claimChild(claimCode.trim());
      setClaimCode(''); setClaiming(false); setClaimMsg('');
      load();
    } catch (e: any) {
      setClaimMsg(e.message || 'Could not claim this account.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string) => {
    if (!confirm('Remove this child account? This deletes their profile.')) return;
    await deleteChildProfile(guardianUid, uid); load();
  };

  const enterKids = (child: UserProfile) => window.dispatchEvent(new CustomEvent('plajah:enter-kids', { detail: { child } }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-small-orange/15 flex items-center justify-center"><Baby size={20} className="text-small-orange" /></div>
          <div>
            <h2 className="text-lg font-black">Family</h2>
            <p className="text-[11px] text-white/40">Create kid accounts — safe by default, with your controls + screen-time.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setClaiming(c => !c); setAdding(false); setClaimMsg(''); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
            <KeyRound size={14} /> Claim with code
          </button>
          <button onClick={() => { setAdding(a => !a); setClaiming(false); setError(''); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-small-orange text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all">
            <Plus size={14} /> Add child
          </button>
        </div>
      </div>

      {claiming && (
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2.5">
          <p className="text-[11px] text-white/50 font-bold leading-relaxed">Got a claim code from your child's teacher? Enter it to link their school account to your family.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Claim code</label>
              <input value={claimCode} onChange={e => setClaimCode(e.target.value.toUpperCase())} placeholder="QK7-M4PD-RJ9" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold tracking-widest outline-none placeholder:text-white/20" />
            </div>
            <button onClick={doClaim} disabled={busy || !claimCode.trim()} className="px-5 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Claim'}
            </button>
          </div>
          {claimMsg && <div className="flex items-center gap-2 text-[10px] text-red-400"><AlertCircle size={12} /> {claimMsg}</div>}
        </div>
      )}

      {adding && (
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Child's name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maya" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
            </div>
            <div className="w-28 space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Birth year</label>
              <input value={birthYear} onChange={e => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2016" inputMode="numeric" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Username (how they sign in)</label>
              <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" placeholder="maya.r" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
            </div>
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Password you set for them</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="text" placeholder="at least 6 characters" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
            </div>
            <button onClick={addChild} disabled={busy || !name.trim() || !username.trim() || !password} className="px-5 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </button>
          </div>
          <p className="text-[10px] text-white/30 leading-relaxed">No email needed — your child signs in on the <b className="text-white/50">Student</b> tab with this username and password. You can change it anytime.</p>
          {error && <div className="flex items-center gap-2 text-[10px] text-red-400"><AlertCircle size={12} /> {error}</div>}
        </div>
      )}

      {loading ? (
        <div className="text-center text-white/30 py-10 text-sm">Loading…</div>
      ) : children.length === 0 ? (
        <div className="text-center text-white/30 py-10 text-sm">No child accounts yet. Add one to give them a safe, kid-sized Plajah.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {children.map(c => (
            <div key={c.uid} className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0" style={{ background: colorFor(c.uid) }}>{c.displayName.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="font-black truncate">{c.displayName}{c.username ? <span className="text-white/30 font-bold"> · @{c.username}</span> : ''}</div>
                <div className="text-[10px] text-white/40 flex items-center gap-1.5"><ShieldCheck size={11} className="text-green-400" /> Safe mode · {c.parentalControls?.maxMaturity || 'PG'}{c.parentalControls?.dailyTimeLimitMins ? ` · ${c.parentalControls.dailyTimeLimitMins}m/day` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => enterKids(c)} title="Enter Kids Mode" className="p-2 rounded-lg bg-small-orange/15 text-small-orange hover:bg-small-orange/25 transition-all"><LogIn size={15} /></button>
                <button onClick={() => setControlsFor(c)} title="Parental controls" className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-all"><ShieldCheck size={15} /></button>
                <button onClick={() => remove(c.uid)} title="Remove" className="p-2 rounded-lg bg-white/5 text-white/40 hover:text-red-400 transition-all"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Parental controls modal */}
      {controlsFor && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={() => setControlsFor(null)}>
          <div className="bg-[#14141c] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-2 -mr-2"><button onClick={() => setControlsFor(null)} className="text-white/40 hover:text-white p-1"><X size={18} /></button></div>
            <ParentalControlsPanel child={controlsFor} guardianUid={guardianUid} onSaved={load} onClose={() => setControlsFor(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyAccountManager;

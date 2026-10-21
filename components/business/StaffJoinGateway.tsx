// Staff join — a team member opens the owner's invite link (?bizJoin=CODE) or types the code, signs in with
// their own Plajah account, sees exactly what the seat allows, and accepts. The server checks the code and
// writes the seat; afterwards the business shows under "Work" in the account and posting menus.

import React, { useEffect, useState } from 'react';
import { Briefcase, Check, Loader2, X } from 'lucide-react';
import { auth } from '../../services/firebase';
import { lookupStaffInvite, redeemStaffInvite, openBusinessWorkspace } from '../../services/businessStaffService';
import { BIZ_PERM_LABEL, type StaffInviteSummary } from '../../services/businessStaffCore';
import { BO, BoScope, BoLabel } from './opsKit';

const PARAM = 'bizJoin';

function readCode(): string | null {
  try { return new URLSearchParams(window.location.search).get(PARAM); } catch { return null; }
}
function clearCode() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, '', u.toString());
  } catch { /* */ }
}

/** Open the join sheet from anywhere (e.g. a "Have a staff code?" button). */
export const openStaffJoin = (code = '') => window.dispatchEvent(new CustomEvent('plajah:staffJoin', { detail: { code } }));

export default function StaffJoinGateway({ onJoined }: { onJoined?: () => void }) {
  const [code, setCode] = useState<string | null>(() => readCode());
  const [draft, setDraft] = useState('');
  const [invite, setInvite] = useState<StaffInviteSummary | null>(null);
  const [state, setState] = useState<'idle' | 'looking' | 'ready' | 'joining' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [signedIn, setSignedIn] = useState(!!auth.currentUser);

  useEffect(() => auth.onAuthStateChanged(u => setSignedIn(!!u)), []);
  useEffect(() => {
    const on = (e: Event) => { const c = (e as CustomEvent).detail?.code || ''; setDraft(c); setCode(c || ''); setInvite(null); setState('idle'); setErr(''); };
    window.addEventListener('plajah:staffJoin', on);
    return () => window.removeEventListener('plajah:staffJoin', on);
  }, []);

  // Look the code up once we have one and the person is signed in.
  useEffect(() => {
    if (!code || !signedIn || state !== 'idle') return;
    setState('looking');
    lookupStaffInvite(code)
      .then(inv => { setInvite(inv); setState('ready'); })
      .catch(e => { setErr(e?.message || 'That code did not work.'); setState('error'); });
  }, [code, signedIn, state]);

  if (code === null) return null;
  const close = () => { clearCode(); setCode(null); setInvite(null); setState('idle'); setErr(''); };

  const join = async () => {
    if (!code) return;
    setState('joining'); setErr('');
    try {
      const { pageId } = await redeemStaffInvite(code);
      setState('done');
      onJoined?.();
      clearCode();
      setTimeout(() => { setCode(null); openBusinessWorkspace(pageId); }, 900);
    } catch (e: any) {
      setErr(e?.message || 'Could not join.'); setState('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4" style={{ background: 'rgba(5,4,8,0.72)', backdropFilter: 'blur(10px)' }} role="dialog" aria-modal="true" aria-label="Join a business team">
      <BoScope className="w-full max-w-md rounded-[28px] overflow-hidden" style={{ background: BO.panel, border: `1px solid ${BO.line}` }}>
        <div className="h-1.5 bo-mark" />
        <div className="p-7 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <span className="w-11 h-11 rounded-2xl grid place-items-center bo-mark text-white"><Briefcase size={20} /></span>
            <button onClick={close} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-xl text-[#A39BAE] hover:text-white hover:bg-white/5"><X size={18} /></button>
          </div>

          {!signedIn && (
            <>
              <h2 className="m-0 bo-display text-white text-[30px]">Join your team on Plajah</h2>
              <p className="m-0 text-[15px] text-[#D9D3E0]">Sign in or create your own free Plajah account first. Your personal account stays yours; work shows up as a separate “Work” space you can switch to.</p>
              <button className="bo-btn bo-btn-primary" onClick={() => import('../../services/backendService').then(m => m.loginWithGoogle()).catch(() => {})}>Sign in to continue</button>
              <p className="m-0 text-[13px] text-[#A39BAE]">Prefer email? Close this, sign in from the home page, then open the link again.</p>
            </>
          )}

          {signedIn && !code && (
            <>
              <h2 className="m-0 bo-display text-white text-[30px]">Enter your staff code</h2>
              <p className="m-0 text-[15px] text-[#D9D3E0]">Your manager can give you a 10-character code like <span className="bo-num text-white">K7Q2M-X9PRT</span>.</p>
              <input className="bo-input bo-num text-center" style={{ fontSize: 22, letterSpacing: '0.12em' }} value={draft} onChange={e => setDraft(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoFocus aria-label="Staff code" />
              <button className="bo-btn bo-btn-primary" disabled={draft.replace(/[^A-Z0-9]/gi, '').length < 10} onClick={() => { setCode(draft); setState('idle'); }}>Continue</button>
            </>
          )}

          {signedIn && code && (state === 'looking' || state === 'idle') && (
            <div className="flex items-center gap-3 py-6 text-[#A39BAE]"><Loader2 size={18} className="animate-spin" /> Checking your code…</div>
          )}

          {signedIn && invite && (state === 'ready' || state === 'joining' || state === 'done') && (
            <>
              <div>
                <BoLabel className="mb-2">You’re invited to work at</BoLabel>
                <h2 className="m-0 bo-display text-white text-[34px]">{invite.businessName}</h2>
                <p className="m-0 mt-2 text-[15px] text-[#D9D3E0]">as <b className="text-white">{invite.roleLabel || (invite.role === 'MANAGER' ? 'Manager' : 'Team member')}</b>, signed in as yourself.</p>
              </div>
              <div>
                <BoLabel className="mb-2">You’ll be able to</BoLabel>
                <ul className="m-0 p-0 list-none bo-rule">
                  {invite.perms.map(p => (
                    <li key={p} className="flex items-start gap-3 py-2.5">
                      <Check size={16} className="mt-0.5 shrink-0" style={{ color: BO.success }} />
                      <span><span className="block text-[14px] font-medium text-white">{BIZ_PERM_LABEL[p].label}</span><span className="block text-[13px] text-[#A39BAE]">{BIZ_PERM_LABEL[p].desc}</span></span>
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-3 text-[13px] text-[#A39BAE]">The owner can change or remove this access at any time, and you can leave whenever you like. Your personal profile, posts and messages are never shared with the business.</p>
              </div>
              <button className="bo-btn bo-btn-primary" onClick={join} disabled={state !== 'ready'}>
                {state === 'joining' ? <Loader2 size={16} className="animate-spin" /> : state === 'done' ? <Check size={16} /> : <Briefcase size={16} />}
                {state === 'done' ? 'You’re on the team' : `Join ${invite.businessName}`}
              </button>
            </>
          )}

          {state === 'error' && (
            <>
              <h2 className="m-0 bo-display text-white text-[28px]">That code didn’t work</h2>
              <p className="m-0 text-[15px]" style={{ color: BO.warn }}>{err}</p>
              <p className="m-0 text-[14px] text-[#A39BAE]">Codes last 7 days and work once. Ask your manager for a new one.</p>
              <button className="bo-btn bo-btn-ghost" onClick={() => { setCode(''); setDraft(''); setState('idle'); setErr(''); }}>Try another code</button>
            </>
          )}
        </div>
      </BoScope>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Tv, Check, AlertCircle } from 'lucide-react';
import { auth } from '../services/backendService';

/**
 * The phone half of TV sign-in: /link?c=CODE.
 *
 * This is the step that actually authorises, so it is deliberately explicit. The viewer sees
 * the code they are approving and which account it will sign in, and has to press a button —
 * no auto-approve on page load. A QR scanned from across a room could just as easily be a
 * photograph of someone else's screen, and a one-tap confirmation is the difference between
 * "I chose this" and "a link did something to my account".
 */
const TvLinkApproval: React.FC<{ code?: string; onDone?: () => void }> = ({ code: codeProp, onDone }) => {
  const [code, setCode] = useState((codeProp || '').toUpperCase());
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (codeProp) { setCode(codeProp.toUpperCase()); return; }
    try {
      const c = new URLSearchParams(window.location.search).get('c');
      if (c) setCode(c.toUpperCase());
    } catch { /* no query */ }
  }, [codeProp]);

  const approve = async () => {
    setState('sending'); setError('');
    try {
      const user = auth.currentUser;
      if (!user) { setState('error'); setError('Sign in on this device first, then reopen the link.'); return; }
      const token = await user.getIdToken();
      const res = await fetch('/api/tv/pair/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setState('error'); setError(j?.message || 'That code could not be approved.'); return; }
      setState('done');
      onDone?.();
    } catch (e) {
      setState('error');
      setError((e as Error)?.message || 'Something went wrong.');
    }
  };

  const signedInAs = auth.currentUser?.displayName || auth.currentUser?.email || null;

  return (
    <div className="min-h-screen bg-[#050507] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-7 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.06] border border-white/10 grid place-items-center">
          <Tv size={28} className="text-white/50" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-white">Sign in on your TV</h1>
          <p className="text-white/45 text-sm leading-relaxed">
            {signedInAs
              ? <>This will sign your TV in as <span className="text-white/80 font-bold">{signedInAs}</span>.</>
              : 'Sign in here first, then approve your TV.'}
          </p>
        </div>

        <div>
          <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Code shown on TV</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="ABCD2345"
            inputMode="text"
            autoCapitalize="characters"
            className="w-full px-5 py-4 rounded-2xl bg-white/[0.05] border border-white/12 text-white text-center font-mono text-2xl tracking-[0.3em] outline-none focus:border-white/40"
          />
        </div>

        {state === 'done' ? (
          <div className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-bold">
            <Check size={18} /> Your TV is signed in
          </div>
        ) : (
          <button
            onClick={approve}
            disabled={code.length < 6 || state === 'sending'}
            className="w-full py-4 rounded-full bg-white text-black font-black uppercase tracking-widest text-xs disabled:opacity-40 transition-opacity"
          >
            {state === 'sending' ? 'Approving…' : 'Approve TV'}
          </button>
        )}

        {error && (
          <p className="flex items-start gap-2 text-left text-red-300/80 text-xs leading-relaxed">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}

        <p className="text-white/25 text-[11px] leading-relaxed">
          Only approve a code you can see on your own TV right now. It expires in five minutes and
          works once.
        </p>
      </div>
    </div>
  );
};

export default TvLinkApproval;

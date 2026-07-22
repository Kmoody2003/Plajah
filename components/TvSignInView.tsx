import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, Smartphone, Check, AlertCircle } from 'lucide-react';
import { auth, loginWithGoogle, loginWithMicrosoft, loginWithTwitter } from '../services/backendService';

/**
 * Signing in to a television.
 *
 * Nobody should type a password with a D-pad — it is the worst input method for the one task
 * that punishes typos hardest. So this is the flow every TV app converged on: show a code and a
 * QR, let a phone that is already signed in approve it, and exchange the code for a session.
 *
 * The QR is rendered ON DEVICE (the `qrcode` package) rather than by an image service, because
 * the payload is credential-grade — it should never touch a third party.
 *
 * Returning viewers see their saved profiles first, HBO/Prime style, so the common case is one
 * press rather than a phone round trip.
 */

const POLL_MS = 2000;

interface SavedProfile { uid: string; displayName?: string; photoURL?: string; }

const TvSignInView: React.FC<{
  savedProfiles?: SavedProfile[];
  onPickProfile?: (uid: string) => void;
  onSignedIn?: () => void;
}> = ({ savedProfiles = [], onPickProfile, onSignedIn }) => {
  const [code, setCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'waiting' | 'approved' | 'expired' | 'error'>('loading');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [directBusy, setDirectBusy] = useState<string | null>(null);
  const [directError, setDirectError] = useState('');

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startPairing = useCallback(async () => {
    stopPolling();
    setStatus('loading'); setCode(null); setQrDataUrl('');
    try {
      const res = await fetch('/api/tv/pair/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await res.json();
      if (!j?.code) { setStatus('error'); return; }
      setCode(j.code);

      const linkUrl = `${window.location.origin}/link?c=${encodeURIComponent(j.code)}`;
      // High error correction: a TV is photographed at an angle, from a distance, often with
      // glare — the extra redundancy is what makes it scan first time.
      const dataUrl = await QRCode.toDataURL(linkUrl, {
        errorCorrectionLevel: 'H', margin: 2, width: 420,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
      setStatus('waiting');

      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`/api/tv/pair/poll?code=${encodeURIComponent(j.code)}`);
          const pj = await pr.json();
          if (pj?.status === 'approved' && pj.customToken) {
            stopPolling();
            setStatus('approved');
            const { signInWithCustomToken } = await import('firebase/auth');
            await signInWithCustomToken(auth, pj.customToken);
            onSignedIn?.();
          } else if (pj?.status === 'expired') {
            stopPolling();
            setStatus('expired');
          }
        } catch { /* transient — keep polling until the code expires */ }
      }, POLL_MS);
    } catch {
      setStatus('error');
    }
  }, [onSignedIn]);

  useEffect(() => { startPairing(); return stopPolling; }, [startPairing]);

  return (
    <div className="min-h-screen bg-[#050507] flex flex-col items-center justify-center px-10 py-12">
      {/* Logo is the whole brand moment on a TV — big, centred, breathing. */}
      <div className="mb-10 text-center">
        <h1 className="text-6xl font-black italic tracking-tighter text-white select-none">PLAJAH</h1>
        <p className="mt-2 text-white/35 text-sm font-bold uppercase tracking-[0.4em]">Sign in</p>
      </div>

      {savedProfiles.length > 0 && (
        <section className="mb-12 w-full max-w-4xl">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-4 text-center">Who's watching?</h2>
          <div className="flex items-start justify-center gap-6 flex-wrap">
            {savedProfiles.slice(0, 4).map(p => (
              <button
                key={p.uid}
                data-tv-focusable
                onClick={() => onPickProfile?.(p.uid)}
                className="group flex flex-col items-center gap-3 p-3 rounded-2xl transition-transform"
              >
                <span className="w-28 h-28 rounded-2xl overflow-hidden bg-white/8 border-2 border-transparent group-focus:border-white grid place-items-center">
                  {p.photoURL
                    ? <img src={p.photoURL} alt="" className="w-full h-full object-cover" />
                    : <span className="text-3xl font-black text-white/60">{(p.displayName || '?').charAt(0).toUpperCase()}</span>}
                </span>
                <span className="text-sm font-bold text-white/70 group-focus:text-white max-w-[8rem] truncate">
                  {p.displayName || 'Profile'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col md:flex-row items-center gap-10 max-w-4xl">
        <div className="w-[260px] h-[260px] rounded-3xl bg-white grid place-items-center overflow-hidden shrink-0">
          {qrDataUrl
            ? <img src={qrDataUrl} alt="Sign-in QR code" className="w-full h-full" />
            : <RefreshCw size={36} className="text-black/25 animate-spin" />}
        </div>

        <div className="space-y-5 text-center md:text-left">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Smartphone size={20} className="text-white/40" />
            <p className="text-white text-lg font-bold">Scan with your phone</p>
          </div>
          <p className="text-white/45 text-sm leading-relaxed max-w-sm">
            Point your camera at the code, or go to <span className="text-white/80 font-bold">plajah.com/link</span> and
            enter this code. You'll need to be signed in on your phone.
          </p>

          <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/[0.06] border border-white/12">
            <span className="font-mono text-3xl font-black tracking-[0.35em] text-white tabular-nums">
              {code || '••••••••'}
            </span>
          </div>

          <div className="min-h-[24px]">
            {status === 'waiting' && <p className="text-white/35 text-xs font-bold uppercase tracking-widest">Waiting for approval…</p>}
            {status === 'approved' && (
              <p className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-widest">
                <Check size={14} /> Signed in
              </p>
            )}
            {(status === 'expired' || status === 'error') && (
              <button
                data-tv-focusable
                onClick={startPairing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest"
              >
                <RefreshCw size={13} /> {status === 'expired' ? 'Get a new code' : 'Try again'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Sign in on the television itself.
          The phone hand-off is still the best path — nobody wants to drive an account picker
          with a remote — but it is a two-device flow, and when it fails (no phone to hand, a
          code that will not take) it fails into a dead end. These are the way out.
          On the native TV build Google/Microsoft/X go through the Capacitor plugin rather than
          a web popup, which a WebView blocks outright. */}
      <section className="w-full max-w-4xl space-y-4">
        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Or sign in here</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {([
            { id: 'google',    label: 'Google',    fn: () => loginWithGoogle(),    cls: 'bg-white text-black' },
            { id: 'microsoft', label: 'Microsoft', fn: () => loginWithMicrosoft(), cls: 'bg-[#0078D4] text-white' },
            { id: 'twitter',   label: 'X',         fn: () => loginWithTwitter(),   cls: 'bg-black text-white border border-white/25' },
          ] as const).map(p => (
            <button
              key={p.id}
              data-tv-focusable
              disabled={!!directBusy}
              onClick={async () => {
                setDirectBusy(p.id); setDirectError('');
                try {
                  await p.fn();
                  // Ask auth, not the return value: these helpers disagree about what they
                  // resolve to (loginWithTwitter returns an X handle, and null on a perfectly
                  // successful sign-in that simply had no handle to report). The session is the
                  // only honest signal. A cancelled picker leaves currentUser null — say nothing.
                  if (auth.currentUser) { stopPolling(); setStatus('approved'); onSignedIn?.(); }
                } catch (e) {
                  setDirectError((e as Error)?.message || `${p.label} sign-in did not complete.`);
                } finally {
                  setDirectBusy(null);
                }
              }}
              className={`px-7 py-3 rounded-full text-sm font-black transition-transform focus:scale-105 focus:outline-none focus:ring-4 focus:ring-white/30 disabled:opacity-50 ${p.cls}`}
            >
              {directBusy === p.id ? 'Signing in…' : `Continue with ${p.label}`}
            </button>
          ))}
        </div>

        {directError && (
          <p className="flex items-center justify-center gap-2 text-amber-400/90 text-xs font-bold">
            <AlertCircle size={13} /> {directError}
          </p>
        )}
      </section>
    </div>
  );
};

export default TvSignInView;

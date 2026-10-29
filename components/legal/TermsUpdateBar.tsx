// Asks a signed-in user to agree to the current Terms once per version, and records the answer on
// the server (routes/legalAcceptance.ts). Non-blocking: the app stays usable underneath.

import React, { useEffect, useState } from 'react';
import { auth } from '../../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LEGAL_LAUNCHED, TERMS_URL, TERMS_VERSION } from '../../services/legal/terms';

const SEEN_KEY = 'plajah.termsAccepted';

async function authed(method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;
  const res = await fetch('/api/legal/terms', {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? res.json() : null;
}

export const TermsUpdateBar: React.FC = () => {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!LEGAL_LAUNCHED) return;
    if (!u) { setShow(false); return; }
    try { if (localStorage.getItem(SEEN_KEY) === `${u.uid}:${TERMS_VERSION}`) return; } catch { /* storage off */ }
    const r = await authed('GET').catch(() => null);
    if (!r) return; // server unreachable: never nag on our own outage
    if (r.accepted === TERMS_VERSION) { try { localStorage.setItem(SEEN_KEY, `${u.uid}:${TERMS_VERSION}`); } catch { /* */ } return; }
    setShow(true);
  }), []);

  if (!show) return null;
  const agree = async () => {
    setBusy(true);
    const r = await authed('POST', { version: TERMS_VERSION }).catch(() => null);
    setBusy(false);
    if (!r) return;
    try { localStorage.setItem(SEEN_KEY, `${auth.currentUser?.uid}:${TERMS_VERSION}`); } catch { /* */ }
    setShow(false);
  };

  return (
    <div role="dialog" aria-label="Updated Terms of Service"
      className="fixed inset-x-3 bottom-3 z-[9000] mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#0d0d12]/95 p-4 text-white shadow-2xl backdrop-blur flex flex-col sm:flex-row sm:items-center gap-3">
      <p className="text-xs text-white/70 flex-1">
        We’ve updated our <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline text-white">Terms of Service</a>.
        They explain what you keep, what Plajah does, and how copyright, payments and disputes work.
      </p>
      <button onClick={() => void agree()} disabled={busy}
        className="shrink-0 rounded-full bg-small-orange px-4 py-2 text-[11px] font-black uppercase tracking-widest text-black disabled:opacity-50">
        {busy ? 'Saving…' : 'I agree'}
      </button>
    </div>
  );
};

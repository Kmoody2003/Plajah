import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { auth, fetchUserProfile, updateUserProfile } from '../../services/backendService';

/**
 * The Welcome Package, kept in the Postman. People who come in through an organization door
 * skip the first-run Plajah intro; this envelope is where they find the tour whenever they want
 * it. It stays for everyone afterwards too, marked "New" until it has been opened.
 */
const WelcomePackageEnvelope: React.FC = () => {
  const [state, setState] = useState<'loading' | 'new' | 'opened' | 'none'>('loading');

  useEffect(() => {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) { setState('none'); return; }
    let live = true;
    fetchUserProfile(u.uid)
      .then(p => { if (live) setState((p as any)?.hasSeenWelcomePackage ? 'opened' : 'new'); })
      .catch(() => { if (live) setState('opened'); });
    return () => { live = false; };
  }, []);

  if (state === 'loading' || state === 'none') return null;

  const open = () => {
    const u = auth.currentUser;
    if (u && state === 'new') updateUserProfile(u.uid, { hasSeenWelcomePackage: true } as any).catch(() => {});
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'WELCOME_PACKAGE' } }));
  };

  return (
    <button
      onClick={open}
      className="w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:brightness-110"
      style={{ borderColor: 'var(--outline-variant, rgba(255,255,255,0.12))', background: 'var(--glass-2, rgba(255,255,255,0.04))' }}
    >
      <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white"><Mail size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-black">Your Welcome Package</span>
          {state === 'new' && <span className="px-1.5 py-0.5 rounded-full bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest">New</span>}
        </span>
        <span className="block text-[12px] opacity-70 leading-snug">From Plajah: a letter and the tour of everything you can do here. Open it whenever you like.</span>
      </span>
    </button>
  );
};

export default WelcomePackageEnvelope;

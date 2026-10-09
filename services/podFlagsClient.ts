// Browser hook for the print-on-demand launch switches (Firestore `config/podFlags`, readable by everyone, writable by admins).
// Unreadable doc => everything stays OFF (safe default). The SERVER enforces the same flags; this only decides what to show.
import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onSnapshot } from './safeSnapshot';
import { ALL_POD_FLAGS_OFF, effectivePodFlags, type PodFlagKey } from './pod/podFlags';

export function usePodFlags() {
  const [state, setState] = useState({ flags: ALL_POD_FLAGS_OFF, loaded: false, isAdmin: false });
  useEffect(() => {
    auth.currentUser?.getIdTokenResult().then(r => setState(s => ({ ...s, isAdmin: r.claims?.admin === true }))).catch(() => {});
    const unsub = onSnapshot(doc(db, 'config', 'podFlags'),
      snap => setState(s => ({ ...s, flags: effectivePodFlags(snap.data() as any), loaded: true })),
      () => setState(s => ({ ...s, loaded: true })));
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, []);
  return {
    ...state,
    enabled: (k: PodFlagKey) => !!state.flags[k],
    /** OFF for readers but visible to admins, who get a preview badge. */
    preview: (k: PodFlagKey) => !state.flags[k] && state.isAdmin,
    visible: (k: PodFlagKey) => !!state.flags[k] || (!state.flags[k] && state.isAdmin),
  };
}

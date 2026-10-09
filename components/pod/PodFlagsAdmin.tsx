// PodFlagsAdmin — admin control panel for print-on-demand launch switches (Firestore config/podFlags) plus the live
// go-live checklist from GET /api/pod/readiness. Same pattern as components/billing/BillingFlagsAdmin.tsx.
// Flip a switch -> the feature goes live for everyone (no redeploy). The server enforces the same flags.
import React, { useCallback, useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { POD_FLAGS, type PodFlagKey } from '../../services/pod/podFlags';
import { usePodFlags } from '../../services/podFlagsClient';
import { podFetch } from './podApi';

interface Check { id: string; label: string; ok: boolean; note?: string }

export const PodFlagsAdmin: React.FC = () => {
  const f = usePodFlags();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [ready, setReady] = useState<{ checks: Check[]; readyForOrdering: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try { setReady(await podFetch('/readiness')); setMsg(''); }
    catch (e: any) { setMsg(e?.message || 'Could not run the readiness check (admin only).'); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { void recheck(); }, [recheck]);

  const set = async (key: PodFlagKey, on: boolean) => {
    if (on && key !== 'PRINT_EXPORT_PACKS' && ready && !ready.readyForOrdering
        && !window.confirm('The go-live checklist still has failing items. Orders and payments will not work until they pass. Turn it on anyway?')) return;
    setBusy(key);
    try { await setDoc(doc(db, 'config', 'podFlags'), { [key]: on }, { merge: true }); setMsg(`${key} is now ${on ? 'ON for everyone' : 'OFF (Coming soon)'}`); }
    catch (e: any) { setMsg(e?.message || 'Could not update the flag (admin only).'); }
    finally { setBusy(null); }
  };

  const card = 'rounded-2xl border border-white/10 bg-white/5';
  return (
    <div className="max-w-3xl space-y-4 text-white">
      <div>
        <h2 className="text-lg font-black">Print-on-demand launch</h2>
        <p className="text-xs text-white/50 mt-1">Everything is built and dark. Switch each stage on when its checklist is green. Turning a switch off stops NEW orders only; orders already paid still finish. Admins always see the real screens as a preview.</p>
        <p className="text-[10px] text-white/30 mt-1">Runbook: docs/POD_LAUNCH_CHECKLIST.md</p>
      </div>
      {msg && <p className="text-xs text-amber-300" role="status">{msg}</p>}
      {!f.loaded && <p className="text-xs text-white/40">Loading…</p>}

      <ul className="space-y-2">
        {POD_FLAGS.map(m => { const on = f.enabled(m.key); return (
          <li key={m.key} className={`${card} p-4 flex items-start gap-3`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black">{m.label}</p><code className="text-[9px] text-white/30">{m.key}</code>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${on ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-white/5 text-white/50 border-white/15'}`}>{on ? 'Live' : 'Off'}</span>
              </div>
              <p className="text-[11px] text-white/50 mt-1">{m.blurb}</p>
              <ul className="mt-1.5 list-disc ml-4 text-[10px] text-amber-200/80 space-y-0.5">{m.needs.map(n => <li key={n}>{n}</li>)}</ul>
            </div>
            <button role="switch" aria-checked={on} aria-label={`${m.label} ${on ? 'on' : 'off'}`} disabled={busy === m.key || !f.loaded} onClick={() => set(m.key, !on)}
              className={`shrink-0 w-12 h-7 rounded-full border transition-all relative disabled:opacity-40 ${on ? 'bg-green-500/80 border-green-400' : 'bg-white/10 border-white/20'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-0.5'}`} />
            </button>
          </li>); })}
      </ul>

      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black">Go-live checklist (server-side)</h3>
          <button onClick={recheck} disabled={checking} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-bold disabled:opacity-40">{checking ? 'Checking…' : 'Re-check'}</button>
        </div>
        {ready ? (
          <>
            <p className={`text-xs mt-2 font-bold ${ready.readyForOrdering ? 'text-green-400' : 'text-amber-300'}`}>{ready.readyForOrdering ? 'Ready for direct ordering.' : 'Not ready for direct ordering yet.'}</p>
            <ul className="mt-2 space-y-1.5">{ready.checks.map(c => (
              <li key={c.id} className="text-xs flex gap-2"><span aria-hidden>{c.ok ? '✅' : '⬜'}</span>
                <span><span className={c.ok ? 'text-white/80' : 'text-white'}>{c.label}</span>{c.note && <span className="block text-[10px] text-white/40">{c.note}</span>}</span></li>))}</ul>
          </>
        ) : <p className="text-xs text-white/40 mt-2">{checking ? 'Running checks…' : 'No result yet.'}</p>}
        <p className="text-[10px] text-white/30 mt-3">Secrets are only reported as set / not set; values never leave the server.</p>
      </div>
    </div>
  );
};
export default PodFlagsAdmin;

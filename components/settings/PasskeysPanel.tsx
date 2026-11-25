/**
 * Account settings → Passkeys. Add Windows Hello, a fingerprint or face unlock to your Plajah account,
 * see your passkeys, and remove them. Used to seal Tela Sign signatures (and later, passwordless sign-in).
 * Server: routes/passkeys.ts. The biometric never leaves the device; Plajah stores only a public key.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Trash2, Plus, ShieldCheck, Loader2 } from 'lucide-react';
import { auth } from '../../services/firebase';
import { addPasskey, passkeysAvailable } from '../../services/auth/passkeyClient';

interface Row { credentialId: string; label: string; createdAt: number; lastUsedAt: number | null; backedUp: boolean }

async function api(path: string, init: RequestInit = {}) {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error('Sign in first.');
  const r = await fetch(path, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${t}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export default function PasskeysPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [can, setCan] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { setRows((await api('/api/passkeys')).passkeys); } catch (e: any) { setRows([]); setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { load(); passkeysAvailable().then(setCan); }, [load]);

  const add = async () => {
    setBusy(true); setMsg(null);
    try {
      const p = await addPasskey(api);
      setMsg({ ok: true, text: `Added “${p.label}”.` });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.name === 'NotAllowedError' ? 'The check was cancelled. Nothing was added.' : e?.name === 'InvalidStateError' ? 'This device already has a passkey on your account.' : (e?.message || 'Couldn’t add the passkey.') });
    } finally { setBusy(false); }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Remove “${r.label}”? You can add it again later.`)) return;
    try { await api(`/api/passkeys/${encodeURIComponent(r.credentialId)}`, { method: 'DELETE' }); await load(); setMsg({ ok: true, text: `Removed “${r.label}”.` }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-400/10 text-cyan-300 shrink-0"><Fingerprint size={20} /></span>
          <div className="min-w-0">
            <p className="text-sm font-black">Use your fingerprint, face or Windows Hello</p>
            <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
              A passkey lets you confirm it’s you with the same unlock you use for your device. Tela Sign uses it to seal your
              signature to exactly what you signed. Your fingerprint or face never leaves your device: Plajah only keeps a public key.
            </p>
          </div>
        </div>
        <button onClick={add} disabled={busy || can === false}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-black text-black disabled:opacity-40" style={{ background: '#4FC3D6' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add a passkey on this device
        </button>
        {can === false && <p className="mt-2 text-[12px] text-white/45">This browser or device can’t make passkeys. Try a current browser on a phone or a computer with Windows Hello, Touch ID or a fingerprint reader.</p>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-[12px] ${msg.ok ? 'text-emerald-300' : 'text-rose-200'}`}>{msg.text}</p>}
      </div>

      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Your passkeys</h3>
        {rows === null ? <p className="text-[12px] text-white/40">Loading…</p> : rows.length === 0 ? (
          <p className="text-[12px] text-white/40">None yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
            {rows.map((r) => (
              <li key={r.credentialId} className="px-4 py-3 flex items-center gap-3">
                <ShieldCheck size={16} className="text-emerald-300 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold truncate">{r.label}</span>
                  <span className="block text-[11px] text-white/45">
                    Added {new Date(r.createdAt).toLocaleDateString()}{r.lastUsedAt ? ` · last used ${new Date(r.lastUsedAt).toLocaleDateString()}` : ''}{r.backedUp ? ' · synced to your other devices' : ''}
                  </span>
                </span>
                <button onClick={() => remove(r)} className="p-2 rounded-lg text-white/50 hover:text-rose-200 hover:bg-white/5" aria-label={`Remove ${r.label}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

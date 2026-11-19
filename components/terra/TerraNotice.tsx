/**
 * Terra data notice: the first-use gate before survey tools and downloads, and
 * the always-available Sources & terms dialog that credits every publisher.
 * Text + versions: services/terra/dataNotice.ts. Server record: routes/terraNotice.ts.
 */

import React, { useEffect, useState } from 'react';
import { ShieldAlert, X, ExternalLink } from 'lucide-react';
import {
  TERRA_NOTICE, TERRA_NOTICE_VERSION, TERRA_SOURCES,
  localNoticeAcceptance, saveLocalNoticeAcceptance,
} from '../../services/terra/dataNotice';
import { auth } from '../../services/backendService';

async function idToken(): Promise<string | null> {
  try { return (await auth?.currentUser?.getIdToken()) ?? null; } catch { return null; }
}

/** Accepted on this device, or on the signed-in account (synced back to this device). */
export function useTerraNoticeAccepted(): [boolean, () => void] {
  const [ok, setOk] = useState(() => !!localNoticeAcceptance());
  useEffect(() => {
    if (ok) return;
    let cancelled = false;
    (async () => {
      const token = await idToken();
      if (!token) return;
      const r = await fetch('/api/terra/notice', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      const body = r?.ok ? await r.json().catch(() => null) : null;
      if (!cancelled && body?.accepted?.version === TERRA_NOTICE_VERSION) { saveLocalNoticeAcceptance(); setOk(true); }
    })();
    return () => { cancelled = true; };
  }, [ok]);
  return [ok, () => setOk(true)];
}

export const TerraNoticeGate: React.FC<{ onAccepted: () => void; onClose: () => void }> = ({ onAccepted, onClose }) => {
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const accept = async () => {
    setBusy(true); setErr('');
    try {
      const token = await idToken();
      if (token) {
        const r = await fetch('/api/terra/notice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ version: TERRA_NOTICE_VERSION }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      }
      saveLocalNoticeAcceptance();
      onAccepted();
    } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center p-4 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Terra data notice" data-testid="terra-notice">
      <div className="w-full max-w-xl max-h-[86vh] flex flex-col rounded-2xl bg-[#0f1116] border border-white/10 text-white shadow-2xl">
        <div className="flex items-start gap-3 p-5 border-b border-white/[0.06]">
          <ShieldAlert size={18} className="text-[#E8B33D] mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black">Before you use Terra's survey tools</p>
            <p className="text-[11px] text-white/50 mt-0.5">Please read and accept the data notice (version {TERRA_NOTICE_VERSION}).</p>
          </div>
          <button onClick={onClose} className="p-1 text-white/40 hover:text-white" aria-label="Close"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
          {TERRA_NOTICE.map(s => (
            <div key={s.heading}>
              <p className="text-[12px] font-bold text-white/90">{s.heading}</p>
              <p className="text-[12px] text-white/60 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="p-5 border-t border-white/[0.06] space-y-3">
          <label className="flex items-start gap-2 text-[12px] text-white/70 cursor-pointer">
            <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} className="mt-0.5" />
            I understand Terra is not a survey and not for locating utilities, and I accept this notice.
          </label>
          {err && <p className="text-[11px] text-[#FF5470]">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-[11px] font-bold text-white/60 hover:text-white">Not now</button>
            <button onClick={accept} disabled={!read || busy}
              className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest text-black disabled:opacity-40"
              style={{ background: '#FF8C00' }}>
              {busy ? 'Saving…' : 'Accept'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TerraSourcesDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[2000] grid place-items-center p-4 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Terra sources and terms" onClick={onClose}>
    <div className="w-full max-w-3xl max-h-[86vh] flex flex-col rounded-2xl bg-[#0f1116] border border-white/10 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
        <p className="text-sm font-black flex-1">Terra · Sources & terms</p>
        <span className="text-[10px] text-white/35 font-mono">notice {TERRA_NOTICE_VERSION}</span>
        <button onClick={onClose} className="p-1 text-white/40 hover:text-white" aria-label="Close"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">Where the data comes from</p>
          <div className="space-y-2">
            {TERRA_SOURCES.map(s => (
              <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white/90">{s.name}</p>
                    <p className="text-[11px] text-white/60">{s.publisher}</p>
                  </div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-[#4FC3D6] flex items-center gap-1 shrink-0">
                    Source <ExternalLink size={10} />
                  </a>
                </div>
                <p className="text-[11px] text-white/50 mt-1"><span className="text-white/35">Licence: </span>{s.licence}</p>
                <p className="text-[11px] text-white/50"><span className="text-white/35">Accuracy: </span>{s.accuracy}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">Data notice</p>
          <div className="space-y-3">
            {TERRA_NOTICE.map(s => (
              <div key={s.heading}>
                <p className="text-[12px] font-bold text-white/90">{s.heading}</p>
                <p className="text-[12px] text-white/60 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  </div>
);

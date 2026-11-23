// PlajahIdCard — shows a person's or org's Plajah ID, with a copy button and its verified history.
import React, { useState } from 'react';
import { Fingerprint, Copy, Check, ShieldCheck, ShieldAlert, History, Loader2 } from 'lucide-react';
import { EVENT_LABEL, useMyPlajahId, fetchMyIdentityHistory, type IdentityHistory } from '../services/plajahIdClient';

export const PlajahIdCard: React.FC<{
  id: string | null;
  kind: 'person' | 'org';
  loadHistory?: () => Promise<IdentityHistory>;
  compact?: boolean;
}> = ({ id, kind, loadHistory, compact }) => {
  const [copied, setCopied] = useState(false);
  const [hist, setHist] = useState<IdentityHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const copy = async () => {
    if (!id) return;
    try { await navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };
  const showHistory = async () => {
    if (!loadHistory) return;
    if (hist) { setHist(null); return; }
    setLoading(true); setErr('');
    try { setHist(await loadHistory()); } catch (e: any) { setErr(e?.message || 'Couldn’t load history.'); } finally { setLoading(false); }
  };

  if (compact) {
    if (!id) return null;
    return (
      <button type="button" onClick={copy} title="Copy Plajah ID" data-testid="plajah-id-chip"
        className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-white/15 bg-black/30 text-[11px] font-semibold text-white/80 hover:text-white tabular-nums">
        <Fingerprint size={12} /> {id} {copied ? <Check size={11} /> : null}
      </button>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 p-5 space-y-4" style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.14), rgba(0,0,0,0.2))' }} data-testid="plajah-id-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}>
          <Fingerprint size={22} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">{kind === 'org' ? 'Organization Plajah ID' : 'Your Plajah ID'}</p>
          {id ? (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xl font-black text-white tracking-wide tabular-nums select-all">{id}</span>
              <button onClick={copy} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10" aria-label="Copy Plajah ID">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/60 mt-1">{kind === 'org' ? 'This organization’s Plajah ID will appear here once it’s set up.' : 'Your Plajah ID will appear here in a moment.'}</p>
          )}
          <p className="text-[12px] text-white/50 mt-2 leading-relaxed">
            {kind === 'org'
              ? 'The organization’s own permanent identity. It stays the same as staff change, and every change to it is recorded in a history that can’t be quietly edited.'
              : 'Your permanent identity on Plajah, separate from any email. It was created randomly, can’t be chosen or guessed, and every change to it is recorded in a history that can’t be quietly edited.'}
          </p>
        </div>
      </div>

      {id && loadHistory && (
        <div>
          <button onClick={showHistory} className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#D0BCFF] hover:text-white">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />} {hist ? 'Hide history' : 'View history'}
          </button>
          {err && <p className="text-[12px] text-red-300 mt-2">{err}</p>}
          {hist && (
            <div className="mt-3 space-y-2">
              <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${hist.verified ? 'text-emerald-300' : 'text-amber-300'}`}>
                {hist.verified ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                {hist.verified ? `History verified — ${hist.events.length} event${hist.events.length === 1 ? '' : 's'}, every link intact.` : `History check failed at event ${hist.brokenAt}: ${hist.reason}.`}
              </p>
              <ol className="space-y-1.5">
                {hist.events.map(e => (
                  <li key={e.seq} className="flex items-start gap-3 rounded-xl px-3 py-2 bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[11px] font-bold tabular-nums text-white/40 mt-0.5">#{e.seq}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-white">{EVENT_LABEL[e.type] || e.type}</p>
                      <p className="text-[11px] text-white/45">{new Date(e.at).toLocaleString()} · hash {e.hash.slice(0, 12)}…</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

/** The signed-in person's card (Settings › Account). */
export const MyPlajahIdCard: React.FC<{ uid: string | undefined }> = ({ uid }) => {
  const id = useMyPlajahId(uid);
  return uid ? <PlajahIdCard id={id} kind="person" loadHistory={fetchMyIdentityHistory} /> : null;
};

export default PlajahIdCard;

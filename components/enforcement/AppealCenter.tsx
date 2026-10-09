import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Scale, Wrench, Send, Clock, CheckCircle2, CircleDot, FileText, Loader2 } from 'lucide-react';
import {
  getMyStanding, fileAppeal, reportCorrection, type EnforcementActionRecord, type AppealRecord,
} from '../../services/enforcement/enforcementApi';
import { durationLabel, LEVEL_TITLE, restrictionsFor, isInForce, STATEMENT_MAX, type Capabilities } from '../../services/enforcement/standingCore';
import { refreshStanding } from '../../services/enforcement/standingStore';

/**
 * Fair Process — Appeal Center. Lists every action on the account with WHAT content, WHICH rule,
 * WHAT is limited and FOR HOW LONG; lets the user fix the content (fast-track) or appeal with their
 * own statement + evidence links, and shows each appeal's status timeline and SLA target.
 */
interface Props { onClose: () => void; focusActionId?: string | null; initialMode?: 'fix' | 'appeal' | null }

const fmt = (t: number | null | undefined) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

const STATUS_COPY: Record<string, string> = {
  ACTIVE: 'In effect', APPEALED: 'In effect · appeal under review', CORRECTION_PENDING: 'In effect · your fix is being checked',
  RESTORED: 'Lifted', OVERTURNED: 'Reversed', EXPIRED: 'Ended',
};
const APPEAL_COPY: Record<string, string> = { PENDING: 'Under review', UPHELD: 'Decision kept', MODIFIED: 'Decision changed', OVERTURNED: 'Reversed in your favour' };

const card: React.CSSProperties = { background: 'var(--pj-glass-2, rgba(255,255,255,0.04))', border: '1px solid var(--pj-border, rgba(255,255,255,0.1))', borderRadius: 'var(--pj-radius-lg, 24px)' };

const AppealCenter: React.FC<Props> = ({ onClose, focusActionId, initialMode }) => {
  const [data, setData] = useState<{ standing: Capabilities; actions: EnforcementActionRecord[]; appeals: AppealRecord[]; now: number } | null>(null);
  const [err, setErr] = useState('');
  const [openForm, setOpenForm] = useState<{ id: string; mode: 'fix' | 'appeal' } | null>(focusActionId && initialMode ? { id: focusActionId, mode: initialMode } : null);
  const [statement, setStatement] = useState('');
  const [evidence, setEvidence] = useState('');
  const [fixNote, setFixNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try { setData(await getMyStanding()); setErr(''); } catch (e: any) { setErr(e?.message || 'Could not load your account standing.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const submit = async () => {
    if (!openForm) return;
    setBusy(true); setErr('');
    try {
      if (openForm.mode === 'appeal') {
        const ev = evidence.split(/\s+/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));
        await fileAppeal({ actionId: openForm.id, statement, evidence: ev, ...(fixNote.trim() ? { correctionTaken: fixNote.trim() } : {}) });
        setFlash('Appeal sent. A person will review it, and you\'ll get a notification with the decision.');
      } else {
        await reportCorrection(openForm.id, fixNote);
        setFlash('Thanks. We\'ll check your fix on the fast track and lift the limit if it resolves the issue.');
      }
      setOpenForm(null); setStatement(''); setEvidence(''); setFixNote('');
      refreshStanding();
      await load();
    } catch (e: any) { setErr(e?.message || 'Something went wrong. Please try again.'); } finally { setBusy(false); }
  };

  const renderForm = () => (
                <div className="space-y-2 pt-1">
                  {openForm!.mode === 'fix' ? (
                    <>
                      <p className="text-xs text-white/60">Edit, remove or relabel the content first, then tell us what you changed. Fixes are checked on a fast track (target: within a day).</p>
                      <textarea value={fixNote} onChange={e => setFixNote(e.target.value)} maxLength={1000} rows={3} placeholder="What did you change? (optional)" className="w-full text-xs rounded-xl bg-black/40 border border-white/10 p-3 outline-none focus:border-white/30" />
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white/60">Tell us your side in your own words. Add links to anything that helps (screenshots, context, sources).</p>
                      <textarea value={statement} onChange={e => setStatement(e.target.value)} maxLength={STATEMENT_MAX} rows={5} placeholder="Why do you think this decision is wrong?" className="w-full text-xs rounded-xl bg-black/40 border border-white/10 p-3 outline-none focus:border-white/30" />
                      <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={2} placeholder="Evidence links, one per line (optional)" className="w-full text-xs rounded-xl bg-black/40 border border-white/10 p-3 outline-none focus:border-white/30" />
                      <input value={fixNote} onChange={e => setFixNote(e.target.value)} maxLength={1000} placeholder="Did you already change the content? Say what (optional)" className="w-full text-xs rounded-xl bg-black/40 border border-white/10 p-3 outline-none focus:border-white/30" />
                      <p className="text-[10px] text-white/40 text-right">{statement.length}/{STATEMENT_MAX}</p>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button disabled={busy || (openForm!.mode === 'appeal' && !statement.trim())} onClick={submit} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white text-black disabled:opacity-40">
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {openForm!.mode === 'fix' ? 'Send for review' : 'Send appeal'}
                    </button>
                    <button onClick={() => setOpenForm(null)} className="px-4 py-1.5 rounded-full text-xs text-white/60 hover:text-white">Cancel</button>
                  </div>
                </div>
  );

  const now = data?.now ?? Date.now();
  const appealsFor = (id: string) => (data?.appeals || []).filter(a => a.actionId === id);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Account standing and appeals">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-[#100c16] text-white p-5 sm:p-6 space-y-4" style={{ borderRadius: 'var(--pj-radius-xl, 28px)', border: '1px solid var(--pj-border, rgba(255,255,255,0.12))' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Scale size={18} style={{ color: 'var(--pj-lilac, #D0BCFF)' }} />
          <h2 className="text-base font-bold flex-1">Your account standing</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Close"><X size={16} /></button>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">
          You can always sign in, read and message people. If something on your account was limited, you can see exactly why below,
          fix the content, or tell us your side. A person reviews every appeal, and stricter limits are reviewed by someone other than whoever applied them.
        </p>

        {flash && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--pj-success-soft, rgba(16,185,129,0.12))', color: 'var(--pj-success, #10B981)' }}>{flash}</p>}
        {err && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--pj-danger-soft, rgba(239,68,68,0.12))', color: '#fca5a5' }}>{err}</p>}
        {!data && !err && <p className="text-xs text-white/40 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading…</p>}

        {data && (
          <div className="p-4 space-y-1" style={card}>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Right now</p>
            <p className="text-sm font-semibold">{LEVEL_TITLE[data.standing.level]}</p>
            {data.standing.level !== 'GOOD' && <p className="text-xs text-white/60">{durationLabel(data.standing.expiresAt, now)}</p>}
            {data.standing.restrictions.length > 0 && (
              <ul className="text-xs text-white/70 list-disc pl-4 pt-1 space-y-0.5">{data.standing.restrictions.map(r => <li key={r}>{r}</li>)}</ul>
            )}
          </div>
        )}

        {data && data.actions.length === 0 && data.standing.reasons.length === 0 && <p className="text-xs text-white/40">Nothing on your account. You're in good standing.</p>}

        {data?.standing.reasons.filter(r => r.status === 'UNDER_REVIEW' || r.actionId === 'legacy-suspension').map(r => (
          <div key={r.actionId} className="p-4 space-y-1" style={card}>
            <p className="text-sm font-semibold">{LEVEL_TITLE[r.level]}</p>
            <p className="text-xs text-white/70">{r.ruleText}</p>
            <p className="text-xs text-white/50">{durationLabel(r.expiresAt, now)}</p>
            {appealsFor(r.actionId).filter(ap => ap.status === 'PENDING').map(ap => (
              <p key={ap.id} className="text-[11px] text-white/50 flex items-center gap-1.5"><Clock size={10} /> Appeal under review · target {fmt(ap.slaDueAt)}</p>
            ))}
            {openForm?.id === r.actionId ? renderForm() : !appealsFor(r.actionId).some(ap => ap.status === 'PENDING') && (
              <button onClick={() => { setOpenForm({ id: r.actionId, mode: 'appeal' }); setFlash(''); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/20 hover:bg-white/5"><Scale size={12} /> Appeal</button>
            )}
          </div>
        ))}

        {data?.actions.map(a => {
          const live = isInForce({ status: a.status as any, expiresAt: a.expiresAt }, now);
          const aps = appealsFor(a.id);
          const pending = aps.some(x => x.status === 'PENDING');
          const formOpen = openForm?.id === a.id;
          return (
            <div key={a.id} className="p-4 space-y-2" style={{ ...card, outline: focusActionId === a.id ? '1px solid var(--pj-lilac, #D0BCFF)' : undefined }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{LEVEL_TITLE[a.level]}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/60">{STATUS_COPY[a.status] || a.status}</span>
                <span className="text-[10px] text-white/40 ml-auto">{fmt(a.createdAt)}</span>
              </div>
              <dl className="text-xs grid grid-cols-[88px_1fr] gap-x-3 gap-y-1">
                <dt className="text-white/40">What</dt>
                <dd className="text-white/80 break-words">
                  {a.withheld ? 'Details withheld for legal reasons.' : a.contentRef
                    ? <><span className="text-white/50">{a.contentRef.kind}</span>{a.contentRef.snapshot ? <> · "{a.contentRef.snapshot}"</> : <> · <span className="text-white/40">{a.contentRef.id}</span></>}</>
                    : 'Account activity'}
                </dd>
                <dt className="text-white/40">Rule</dt><dd className="text-white/80">{a.ruleText}</dd>
                <dt className="text-white/40">Limited</dt>
                <dd className="text-white/80">{(a.restrictions?.length ? a.restrictions : restrictionsFor(a.level)).join(' ')}</dd>
                <dt className="text-white/40">How long</dt><dd className="text-white/80">{live ? durationLabel(a.expiresAt, now) : (STATUS_COPY[a.status] || 'Ended')}</dd>
              </dl>
              {a.correction && (
                <p className="text-[11px] text-white/50 flex items-center gap-1.5"><Wrench size={11} /> You reported a fix {fmt(a.correction.at)}
                  {a.correction.accepted === true ? ' · accepted' : a.correction.accepted === false ? ' · not accepted yet' : ` · check by ${fmt(a.correction.slaDueAt)}`}</p>
              )}

              {aps.map(ap => (
                <div key={ap.id} className="rounded-xl p-3 space-y-1.5 bg-white/[0.03]">
                  <p className="text-[11px] font-semibold flex items-center gap-1.5"><FileText size={11} /> Appeal · {APPEAL_COPY[ap.status] || ap.status}
                    {ap.status === 'PENDING' && <span className="text-white/40 font-normal flex items-center gap-1"><Clock size={10} /> target {fmt(ap.slaDueAt)}</span>}</p>
                  <ol className="space-y-1">
                    {(ap.timeline || []).map((t, i) => (
                      <li key={i} className="text-[11px] text-white/60 flex gap-2">
                        {t.kind === 'SUBMITTED' ? <CircleDot size={11} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={11} className="mt-0.5 shrink-0" />}
                        <span><span className="text-white/40">{fmt(t.at)}</span> · {APPEAL_COPY[t.kind] || (t.kind === 'SUBMITTED' ? 'Received' : t.kind)}{t.note ? ` — ${t.note}` : ''}</span>
                      </li>
                    ))}
                    {ap.status === 'PENDING' && <li className="text-[11px] text-white/40 pl-5">{ap.requiresSecondReviewer ? 'A different reviewer from the one who applied this limit will decide.' : 'A reviewer will decide.'}</li>}
                  </ol>
                </div>
              ))}

              {live && !formOpen && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {!a.csam && a.status !== 'CORRECTION_PENDING' && (
                    <button onClick={() => { setOpenForm({ id: a.id, mode: 'fix' }); setFlash(''); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/90"><Wrench size={12} /> I fixed it</button>
                  )}
                  {!pending && (
                    <button onClick={() => { setOpenForm({ id: a.id, mode: 'appeal' }); setFlash(''); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/20 hover:bg-white/5"><Scale size={12} /> Appeal</button>
                  )}
                </div>
              )}
              {!live && !pending && a.status !== 'OVERTURNED' && (
                <button onClick={() => { setOpenForm({ id: a.id, mode: 'appeal' }); setFlash(''); }} className="text-[11px] underline text-white/50 hover:text-white/80">Contest this record</button>
              )}

              {formOpen && renderForm()}
            </div>
          );
        })}

        <p className="text-[10px] text-white/30 leading-relaxed">
          Review targets: fixes within 24 hours; appeals within 48 hours for posting limits, 72 hours for reach limits, 7 days for legal reviews.
          Where the law requires us to report content (such as child sexual abuse material), that content is never restored and some details may be withheld — but you can still appeal the account decision.
        </p>
      </div>
    </div>,
    document.body,
  );
};

export default AppealCenter;

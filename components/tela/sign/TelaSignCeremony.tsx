/**
 * Tela Sign — the signing ceremony and certificate (UI over services/tela/sign/signCore).
 *
 * Reusable anywhere a Tela document needs signatures: a permit decision in Civic Desk, a vendor
 * agreement in Plajah Business, a volunteer waiver in Elevate. The page shows the document with the
 * signer's fields placed on it; a consumer accepts the electronic-records disclosure first; signatures
 * are drawn (captured as an SVG path) or typed; Finish records the signature in the audit trail.
 * The certificate lists every event with its hash and re-verifies the chain on screen.
 */

import React, { useMemo, useRef, useState } from 'react';
import { PenLine, Type, Check, X, ShieldCheck, FileSignature, Undo2, AlertTriangle } from 'lucide-react';
import {
  type Envelope, type Field, type SignatureMark, ESIGN_DISCLOSURE, view, consent, fillField, finish, decline, certificate, verifyAudit,
} from '../../../services/tela/sign/signCore';

const VIOLET = '#A78BFA';
const CYAN = '#4FC3D6';
const GREEN = '#3DD68C';

// ── Signature pad ────────────────────────────────────────────────────────────
export function SignaturePad({ name, onDone, onCancel }: { name: string; onDone: (m: SignatureMark) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState(name);
  const [paths, setPaths] = useState<string[]>([]);
  const cur = useRef<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);
  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return `${(((e.clientX - r.left) / r.width) * 400).toFixed(1)} ${(((e.clientY - r.top) / r.height) * 120).toFixed(1)}`;
  };
  const down = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); cur.current = `M${pt(e)}`; force((x) => x + 1); };
  const move = (e: React.PointerEvent) => { if (cur.current) { cur.current += ` L${pt(e)}`; force((x) => x + 1); } };
  const up = () => {
    const stroke = cur.current; // capture now: the state updater runs after cur is cleared
    cur.current = null;
    if (stroke && stroke.includes('L')) setPaths((p) => [...p, stroke]);
    force((x) => x + 1);
  };
  const all = [...paths, ...(cur.current ? [cur.current] : [])];
  const ok = mode === 'draw' ? paths.length > 0 : typed.trim().length > 1;
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add your signature">
      <div className="w-full max-w-lg rounded-3xl bg-[#14121c] border border-white/10 p-5 text-white">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-base font-black">Add your signature</p>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-white/50 hover:text-white" aria-label="Cancel"><X size={16} /></button>
        </div>
        <div className="mt-3 inline-flex gap-1 p-1 rounded-full bg-white/[0.05]">
          <button onClick={() => setMode('draw')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold ${mode === 'draw' ? 'bg-white text-black' : 'text-white/60'}`}><PenLine size={13} /> Draw</button>
          <button onClick={() => setMode('type')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold ${mode === 'type' ? 'bg-white text-black' : 'text-white/60'}`}><Type size={13} /> Type</button>
        </div>
        {mode === 'draw' ? (
          <div className="mt-3">
            <svg ref={svg} viewBox="0 0 400 120" className="w-full h-36 rounded-2xl bg-white touch-none cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Signature drawing area">
              <line x1="20" y1="96" x2="380" y2="96" stroke="#c9c6d6" strokeDasharray="4 4" />
              {all.map((d, i) => <path key={i} d={d} fill="none" stroke="#1b1638" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />)}
            </svg>
            <div className="mt-2 flex justify-between text-[11px] text-white/45">
              <span>Sign with your finger, stylus or mouse.</span>
              <button onClick={() => setPaths((p) => p.slice(0, -1))} disabled={!paths.length} className="inline-flex items-center gap-1 hover:text-white disabled:opacity-40"><Undo2 size={12} /> Undo</button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type your full name" className="w-full rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5 text-sm" />
            <div className="mt-2 h-28 rounded-2xl bg-white flex items-center justify-center text-[#1b1638] text-4xl" style={{ fontFamily: '"Gochi Hand", cursive' }}>{typed || ' '}</div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-white/45">By selecting Adopt and sign, you agree this mark is your electronic signature, with the same effect as signing by hand.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-white/[0.07] text-[12px] font-bold">Cancel</button>
          <button disabled={!ok} onClick={() => onDone({ method: mode === 'draw' ? 'drawn' : 'typed', data: mode === 'draw' ? paths.join(' ') : typed.trim(), at: Date.now() })}
            className="px-4 py-2 rounded-xl text-[12px] font-black text-black disabled:opacity-40" style={{ background: CYAN }}>Adopt and sign</button>
        </div>
      </div>
    </div>
  );
}

function MarkView({ m }: { m: SignatureMark }) {
  return m.method === 'drawn'
    ? <svg viewBox="0 0 400 120" className="w-full h-full"><path d={m.data} fill="none" stroke="#1b1638" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>
    : <span className="text-[#1b1638] leading-none" style={{ fontFamily: '"Gochi Hand", cursive', fontSize: 'clamp(14px, 2.4vw, 26px)' }}>{m.data}</span>;
}

// ── Ceremony ─────────────────────────────────────────────────────────────────
export interface TelaSignCeremonyProps {
  envelope: Envelope;
  signerId: string;
  /** Page content, one node per page (the Tela document rendered read-only). */
  pages: React.ReactNode[];
  onChange: (env: Envelope) => void;
  onClose: () => void;
  /** Show the certificate instead of the signing view. */
  certificateOnly?: boolean;
}

export function TelaSignCeremony({ envelope, signerId, pages, onChange, onClose, certificateOnly }: TelaSignCeremonyProps) {
  const signer = envelope.signers.find((s) => s.id === signerId)!;
  const [env, setEnv] = useState<Envelope>(() => {
    try { return !certificateOnly && envelope.status === 'sent' && (signer.status === 'ready') ? view(envelope, signerId, Date.now(), { userAgent: navigator.userAgent }) : envelope; } catch { return envelope; }
  });
  const [padFor, setPadFor] = useState<Field | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const me = env.signers.find((s) => s.id === signerId)!;
  const mine = env.fields.filter((f) => f.signerId === signerId);
  const needsConsent = !!me.consumer && !me.consentedAt;
  const canAct = env.status === 'sent' && (me.status === 'ready' || me.status === 'viewed');
  const done = mine.filter((f) => f.type === 'date_signed' || (f.value !== undefined && f.value !== '' && f.value !== false)).length;

  const apply = (fn: (e: Envelope) => Envelope) => {
    try { const next = fn(env); setEnv(next); onChange(next); setErr(null); } catch (e: any) { setErr(e?.message || String(e)); }
  };

  if (certificateOnly || env.status !== 'sent' || !canAct) {
    return <Shell onClose={onClose} title={env.title}><Certificate env={env} /></Shell>;
  }

  return (
    <Shell onClose={onClose} title={env.title}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/60">
        <FileSignature size={14} style={{ color: VIOLET }} />
        <span><b className="text-white">{env.sender.name}</b>{env.sender.org ? ` · ${env.sender.org}` : ''} asked <b className="text-white">{me.name}</b> to {me.role === 'approver' ? 'approve' : 'sign'}.</span>
        <span className="ml-auto">{done}/{mine.length} fields</span>
      </div>
      {env.message && <p className="mt-2 text-[13px] text-white/70">{env.message}</p>}

      {needsConsent ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-black">Before you sign: agree to do this electronically</p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-white/70 list-disc pl-5">{ESIGN_DISCLOSURE.map((d) => <li key={d}>{d}</li>)}</ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => apply((e) => consent(e, signerId, Date.now(), { userAgent: navigator.userAgent }))} className="px-4 py-2.5 rounded-xl text-[12px] font-black text-black" style={{ background: CYAN }}>I agree, continue</button>
            <button onClick={() => setDeclining(true)} className="px-4 py-2.5 rounded-xl bg-white/[0.07] text-[12px] font-bold">I want paper instead</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {pages.map((content, i) => {
            const pageNo = i + 1;
            return (
              <div key={pageNo} className="relative mx-auto w-full max-w-[680px] aspect-[8.5/11] rounded-lg bg-white text-[#1d1b26] shadow-2xl overflow-hidden">
                <div className="absolute inset-0 p-[7%] text-[clamp(9px,1.7vw,14px)] leading-relaxed">{content}</div>
                {env.fields.filter((f) => f.page === pageNo).map((f) => {
                  const ownField = f.signerId === signerId;
                  const owner = env.signers.find((s) => s.id === f.signerId)!;
                  const filled = f.value !== undefined && f.value !== '' && f.value !== false;
                  const style: React.CSSProperties = { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` };
                  const tone = ownField ? (filled ? GREEN : CYAN) : '#b8b4c8';
                  return (
                    <button key={f.id} style={{ ...style, borderColor: tone, background: filled ? 'transparent' : `${tone}22` }} disabled={!ownField || f.type === 'date_signed'}
                      onClick={() => {
                        if (f.type === 'signature' || f.type === 'initials') setPadFor(f);
                        else if (f.type === 'checkbox') apply((e) => fillField(e, signerId, f.id, !(f.value as boolean), Date.now()));
                      }}
                      className="absolute rounded-md border-2 border-dashed flex items-center justify-center text-[10px] font-bold overflow-hidden"
                      aria-label={`${f.label ?? f.type.replace('_', ' ')} for ${owner.name}`}>
                      {f.type === 'checkbox' ? (f.value ? <Check size={14} /> : '') :
                        f.type === 'date_signed' ? <span className="text-[#5a566b]">{(f.value as string) || 'Date'}</span> :
                        filled && typeof f.value === 'object' ? <MarkView m={f.value as SignatureMark} /> :
                        <span style={{ color: ownField ? '#0e6e7c' : '#8d89a0' }}>{ownField ? (f.type === 'initials' ? 'Initial' : 'Sign here') : owner.name}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {mine.filter((f) => f.type === 'checkbox').map((f) => (
            <p key={f.id} className="text-[12px] text-white/55">☐ on page {f.page}: {f.label}</p>
          ))}
        </div>
      )}

      {err && <p role="alert" className="mt-4 text-[12.5px] text-rose-200 flex items-center gap-1.5"><AlertTriangle size={13} /> {err}</p>}

      {declining ? (
        <div className="mt-5 rounded-2xl border border-white/10 p-4">
          <label htmlFor="decline-reason" className="text-[12px] font-bold">Tell the sender why</label>
          <textarea id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-2 w-full rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2 text-sm" />
          <div className="mt-2 flex gap-2 justify-end">
            <button onClick={() => setDeclining(false)} className="px-3 py-2 rounded-xl bg-white/[0.07] text-[12px] font-bold">Back</button>
            <button onClick={() => apply((e) => decline(e, signerId, reason, Date.now()))} className="px-3 py-2 rounded-xl bg-rose-400 text-black text-[12px] font-black">Decline</button>
          </div>
        </div>
      ) : !needsConsent && (
        <div className="mt-6 flex flex-wrap gap-2 justify-end sticky bottom-0 py-3 bg-[#0d0c13]/95">
          <button onClick={() => setDeclining(true)} className="px-4 py-2.5 rounded-xl bg-white/[0.07] text-[12px] font-bold">Decline</button>
          <button onClick={() => apply((e) => finish(e, signerId, Date.now(), { userAgent: navigator.userAgent }))} className="px-5 py-2.5 rounded-xl text-[12px] font-black text-black" style={{ background: CYAN }}>Finish {me.role === 'approver' ? 'approval' : 'signing'}</button>
        </div>
      )}

      {padFor && <SignaturePad name={me.name} onCancel={() => setPadFor(null)} onDone={(m) => { apply((e) => fillField(e, signerId, padFor.id, m, Date.now())); setPadFor(null); }} />}
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-[#0d0c13] text-white overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sticky top-0 z-10 bg-[#0d0c13]/95 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})` }}><FileSignature size={15} /></span>
          <span className="flex-1 min-w-0"><span className="block text-[13px] font-black truncate">{title}</span><span className="block text-[10px] text-white/40">Tela Sign</span></span>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white" aria-label="Close"><X size={15} /></button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

export function Certificate({ env }: { env: Envelope }) {
  const cert = useMemo(() => certificate(env), [env]);
  const v = useMemo(() => verifyAudit(env), [env]);
  const label: Record<string, string> = { completed: 'Completed', sent: 'Waiting on others', declined: 'Declined', voided: 'Voided', expired: 'Expired', draft: 'Draft' };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck size={20} style={{ color: v.ok ? GREEN : '#FF5C6C' }} />
        <p className="text-lg font-black">Certificate of completion</p>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider" style={{ color: env.status === 'completed' ? GREEN : '#F5B544', background: '#ffffff10' }}>{label[env.status]}</span>
        <span className="text-[12px]" style={{ color: v.ok ? GREEN : '#FF5C6C' }}>{v.ok ? 'Audit trail intact' : `Audit trail broken at event ${v.brokenAt}`}</span>
      </div>
      <dl className="mt-4 grid sm:grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-xl bg-white/[0.04] p-3 min-w-0"><dt className="text-white/40">Document fingerprint (SHA-256)</dt><dd className="font-mono break-all">{cert.documentFingerprint}</dd></div>
        <div className="rounded-xl bg-white/[0.04] p-3 min-w-0"><dt className="text-white/40">Final fingerprint, document + all values</dt><dd className="font-mono break-all">{cert.finalFingerprint ?? 'Set when everyone has signed'}</dd></div>
      </dl>
      <h3 className="mt-5 text-[11px] font-black uppercase tracking-widest text-white/40">Signers</h3>
      <div className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {cert.signers.map((s) => (
          <div key={s.email} className="px-4 py-3 grid sm:grid-cols-[1fr_auto] gap-1 text-[12.5px]">
            <span><b>{s.name}</b> <span className="text-white/45">· {s.role} · {s.email} · verified by {s.auth.replace('_', ' ')}</span></span>
            <span className="text-white/60">{s.signedAt ? `${s.method === 'drawn' ? 'Drew' : 'Typed'} signature ${new Date(s.signedAt).toLocaleString()}` : s.status}{s.consentedAt ? ' · consented' : ''}</span>
          </div>
        ))}
      </div>
      <h3 className="mt-5 text-[11px] font-black uppercase tracking-widest text-white/40">Audit trail</h3>
      <ol className="mt-2 space-y-1.5">
        {cert.events.map((e) => (
          <li key={e.seq} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2 text-[12px] rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="font-mono text-white/35">{e.seq}</span>
            <span className="min-w-0"><b className="capitalize">{e.event}</b> <span className="text-white/45">· {env.signers.find((s) => s.id === e.actor)?.name ?? (e.actor === 'system' ? 'Tela Sign' : env.sender.name)} · {new Date(e.at).toLocaleString()}</span>{e.detail ? <span className="block text-white/55 truncate">{e.detail}</span> : null}</span>
            <span className="font-mono text-[10.5px] text-white/35" title={e.hash}>{e.hash.slice(0, 10)}…</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] text-white/40">Each event's hash covers the one before it, so changing any past event breaks every hash after it. The final fingerprint can be anchored on the Civic Record so anyone can check it later.</p>
    </div>
  );
}

export default TelaSignCeremony;

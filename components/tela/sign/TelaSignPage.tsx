/**
 * The page a signer opens from their link: /?view=sign&env=…&s=…&t=…
 *
 * Standalone (no app shell), like the telehealth join page. Everything goes through the Tela Sign server
 * (routes/telaSign.ts): it checks the link, asks for an access code or a Plajah sign-in when the sender
 * required one, records each step, and offers to seal the signature with a passkey.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { FileSignature, KeyRound, LogIn, ShieldCheck, AlertTriangle, Loader2, Fingerprint } from 'lucide-react';
import { auth } from '../../../services/firebase';
import { TelaSignCeremony, type SignActions } from './TelaSignCeremony';
import { readSignerLink, signerApi, viewAsEnvelope, SignApiError, type SignerView } from '../../../services/tela/sign/signClient';
import { addPasskey, passkeysAvailable } from '../../../services/auth/passkeyClient';
import type { Envelope } from '../../../services/tela/sign/signCore';

const CYAN = '#4FC3D6';
const GREEN = '#3DD68C';

type Phase =
  | { k: 'loading' }
  | { k: 'bad'; msg: string }
  | { k: 'code'; err?: string }
  | { k: 'signin'; err?: string }
  | { k: 'ready'; view: SignerView };

export default function TelaSignPage() {
  const link = useMemo(() => readSignerLink(window.location.search), []);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [pkAvailable, setPkAvailable] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); }), []);
  useEffect(() => { passkeysAvailable().then(setPkAvailable); }, []);

  const token = useCallback(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null), []);
  const api = useMemo(() => (link ? signerApi(link, token, () => code) : null), [link, token, code]);

  const load = useCallback(async () => {
    if (!api) return;
    setPhase({ k: 'loading' });
    try {
      setPhase({ k: 'ready', view: await api.view() });
    } catch (e: any) {
      if (e instanceof SignApiError && e.needs === 'access_code') setPhase({ k: 'code', err: code ? 'That code didn’t match. Check with the sender.' : undefined });
      else if (e instanceof SignApiError && e.needs === 'plajah_account') setPhase({ k: 'signin', err: auth.currentUser ? 'You’re signed in as someone else. Sign in as the person this was sent to.' : undefined });
      else setPhase({ k: 'bad', msg: e?.message || 'This signing link didn’t work.' });
    }
  }, [api, code]);

  useEffect(() => { if (authReady) load(); }, [authReady, load, user?.uid]);

  if (!link) return <Frame><Problem msg="This signing link is incomplete. Open it again from the email or message you received." /></Frame>;
  if (phase.k === 'loading') return <Frame><p className="flex items-center gap-2 text-white/60 text-sm"><Loader2 size={16} className="animate-spin" /> Opening the document…</p></Frame>;
  if (phase.k === 'bad') return <Frame><Problem msg={phase.msg} /></Frame>;

  if (phase.k === 'code') {
    return (
      <Frame>
        <form onSubmit={(e) => { e.preventDefault(); setCode(codeInput.trim()); }} className="max-w-sm">
          <KeyRound size={22} style={{ color: CYAN }} />
          <h1 className="mt-3 text-xl font-black">Enter your access code</h1>
          <p className="mt-1 text-sm text-white/60">The sender gave you a code separately, by phone, text or in person. Plajah never sends it in the same email as the link.</p>
          <label htmlFor="code" className="sr-only">Access code</label>
          <input id="code" autoFocus autoComplete="one-time-code" value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
            className="mt-4 w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-3 text-lg tracking-widest font-mono" />
          {phase.err && <p role="alert" className="mt-2 text-[13px] text-rose-200">{phase.err}</p>}
          <button type="submit" disabled={!codeInput.trim()} className="mt-4 w-full py-3 rounded-xl font-black text-black disabled:opacity-40" style={{ background: CYAN }}>Continue</button>
        </form>
      </Frame>
    );
  }

  if (phase.k === 'signin') {
    return (
      <Frame>
        <div className="max-w-sm">
          <LogIn size={22} style={{ color: CYAN }} />
          <h1 className="mt-3 text-xl font-black">Sign in to Plajah to continue</h1>
          <p className="mt-1 text-sm text-white/60">The sender asked for this to be signed from your Plajah account. Sign in to Plajah in this browser, then come back to this link.</p>
          {phase.err && <p role="alert" className="mt-3 text-[13px] text-rose-200">{phase.err}</p>}
          <div className="mt-4 flex gap-2">
            <a href="/" target="_blank" rel="noopener" className="flex-1 text-center py-3 rounded-xl font-black text-black" style={{ background: CYAN }}>Open Plajah</a>
            <button onClick={load} className="flex-1 py-3 rounded-xl bg-white/[0.07] font-bold">I’ve signed in</button>
          </div>
        </div>
      </Frame>
    );
  }

  const v = phase.view;
  const env = viewAsEnvelope(v);
  const wrap = (p: Promise<SignerView>) => p.then((next) => { setPhase({ k: 'ready', view: next }); return viewAsEnvelope(next); });
  const actions: SignActions = {
    consent: () => wrap(api!.consent()),
    fill: (id, value) => wrap(api!.fill(id, value)),
    finish: () => wrap(api!.finish()),
    decline: (reason) => wrap(api!.decline(reason)),
    passkey: v.you.canUsePasskey ? {
      required: v.you.requirePasskey,
      available: pkAvailable,
      finish: async () => {
        try {
          return await wrap(api!.finishWithPasskey());
        } catch (e) {
          if (!(e instanceof SignApiError) || e.needs !== 'passkey_enrolment') throw e;
          // First time: the device adds a passkey to the account, then signs with it.
          await addPasskey(async (path, init) => {
            const t = await token();
            const r = await fetch(path, { ...init, headers: { ...(init?.headers || {}), ...(t ? { authorization: `Bearer ${t}` } : {}) } });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || 'Couldn’t add the passkey.');
            return j;
          });
          return wrap(api!.finishWithPasskey());
        }
      },
    } : undefined,
  };

  return (
    <TelaSignCeremony
      envelope={env} signerId={v.you.id} pages={documentPages(v)} actions={actions}
      onChange={() => {}} onClose={() => { window.location.href = '/'; }}
      renderDone={() => <Done v={v} />}
    />
  );
}

/** The document as pages. Text documents are laid out from their paragraphs; files arrive with step 2. */
function documentPages(v: SignerView): React.ReactNode[] {
  const paras = (v.body?.text ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pages: React.ReactNode[] = [];
  for (let i = 0; i < Math.max(1, v.pages); i++) {
    pages.push(
      <div key={i} className="h-full flex flex-col">
        <div className="flex items-center justify-between border-b border-black/10 pb-[3%]"><b style={{ fontSize: '1.2em' }}>{v.sender.org || v.sender.name}</b><span className="text-black/50">{v.title}</span></div>
        {i === 0 && (paras.length
          ? paras.map((p, j) => <p key={j} className={j === 0 ? 'mt-[5%] font-bold' : 'mt-[2.5%]'} style={j === 0 ? { fontSize: '1.2em' } : undefined}>{p}</p>)
          : <p className="mt-[5%] text-black/60">This document was sent as a file. Its fingerprint is shown below; ask the sender for a copy if it doesn’t appear here.</p>)}
        <p className="mt-auto text-black/35" style={{ fontSize: '0.7em' }}>Document {v.docHash.slice(0, 16)}… · Tela Sign</p>
      </div>,
    );
  }
  return pages;
}

function Done({ v }: { v: SignerView }) {
  const declined = v.status === 'declined' || v.you.status === 'declined';
  const waiting = v.recipients.filter((r) => r.role !== 'cc' && r.status !== 'signed');
  return (
    <div className="max-w-xl">
      <ShieldCheck size={26} style={{ color: declined ? '#F5B544' : GREEN }} />
      <h1 className="mt-3 text-2xl font-black">
        {declined ? 'You declined this document' : v.status === 'completed' ? 'Everyone has signed' : v.status === 'sent' ? 'You’re done' : `This envelope was ${v.status}`}
      </h1>
      <p className="mt-2 text-sm text-white/65">
        {declined ? `${v.sender.name} has been told, with your reason.` :
          v.status === 'completed' ? 'You’ll get a copy of the signed document and its certificate.' :
          v.status === 'sent' ? `Waiting on ${waiting.map((r) => r.name).join(', ') || 'the others'}. You’ll get a copy when everyone has signed.` : ''}
      </p>
      <ul className="mt-5 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] text-[13px]">
        {v.recipients.filter((r) => r.role !== 'cc').map((r) => (
          <li key={r.id} className="px-4 py-2.5 flex justify-between gap-3"><span>{r.name}{r.id === v.you.id ? ' (you)' : ''}</span><span className="text-white/55">{r.status === 'signed' ? '✓ Signed' : r.status === 'declined' ? 'Declined' : 'Waiting'}</span></li>
        ))}
      </ul>
      {v.finalHash && (
        <div className="mt-5 rounded-xl bg-white/[0.04] p-4">
          <p className="text-[11px] text-white/45">Final fingerprint: anyone can check this document against it</p>
          <p className="mt-1 font-mono text-[12px] break-all">{v.finalHash}</p>
          <a href={`/api/tela/sign/verify/${v.finalHash}`} target="_blank" rel="noopener" className="mt-2 inline-block text-[12px] font-bold" style={{ color: CYAN }}>Check it now</a>
        </div>
      )}
      {v.you.signedAt && <p className="mt-4 text-[12px] text-white/45 flex items-center gap-1.5"><Fingerprint size={13} /> Signed {new Date(v.you.signedAt).toLocaleString()}</p>}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0d0c13] text-white">
      <div className="border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, #A78BFA, ${CYAN})` }}><FileSignature size={15} /></span>
          <span className="text-[13px] font-black">Tela Sign</span>
        </div>
      </div>
      <main className="max-w-4xl mx-auto px-4 py-10">{children}</main>
    </div>
  );
}

function Problem({ msg }: { msg: string }) {
  return (
    <div className="max-w-md">
      <AlertTriangle size={22} className="text-amber-300" />
      <h1 className="mt-3 text-xl font-black">We couldn’t open this document</h1>
      <p role="alert" className="mt-1 text-sm text-white/65">{msg}</p>
      <p className="mt-4 text-[12px] text-white/45">Tela Sign never asks for your password by email. If something about this request looks wrong, don’t sign it: contact the sender another way.</p>
    </div>
  );
}

export type { Envelope };

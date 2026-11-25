// Browser client for the Tela Sign server (routes/telaSign.ts).
// Senders use their Plajah sign-in; signers use the link token (plus an access code or sign-in when asked).

import type { Envelope, Field, Signer } from './signCore';
import { sealWithPasskey } from '../../auth/passkeyClient';

export class SignApiError extends Error {
  constructor(message: string, public status: number, public needs?: 'access_code' | 'plajah_account' | 'passkey_enrolment') { super(message); }
}

/** Returns the signed-in user's ID token, or null. Injected so this file has no Firebase import. */
export type TokenSource = () => Promise<string | null>;

async function req<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(rest.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(rest.headers || {}) },
    });
  } catch {
    throw new SignApiError('Can’t reach Tela Sign. Check your connection.', 0);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new SignApiError(j.error || `Tela Sign answered ${res.status}.`, res.status, j.needs);
  return j as T;
}

// ── Sender ───────────────────────────────────────────────────────────────────
export interface SignerLink { signerId: string; name: string; email: string; url: string }
export interface DraftRequest {
  title: string; docType: string; docText?: string; docHash?: string; pages?: number; message?: string; ref?: string;
  senderName?: string; senderOrg?: string; expiresInDays?: number;
  signers: (Pick<Signer, 'id' | 'name' | 'email' | 'role' | 'order'> & { auth?: Signer['auth']; uid?: string; consumer?: boolean; accessCode?: string; requirePasskey?: boolean })[];
  fields: Omit<Field, 'value'>[];
}

export function senderApi(token: TokenSource) {
  const t = async () => { const x = await token(); if (!x) throw new SignApiError('Sign in to Plajah first.', 401); return x; };
  return {
    create: async (d: DraftRequest) => (await req<{ envelope: Envelope; problems: string[] }>('/api/tela/sign/envelopes', { method: 'POST', token: await t(), body: JSON.stringify(d) })).envelope,
    send: async (id: string) => req<{ envelope: Envelope; links: SignerLink[] }>(`/api/tela/sign/envelopes/${encodeURIComponent(id)}/send`, { method: 'POST', token: await t(), body: '{}' }),
    get: async (id: string) => (await req<{ envelope: Envelope }>(`/api/tela/sign/envelopes/${encodeURIComponent(id)}`, { token: await t() })).envelope,
    void: async (id: string, reason: string) => (await req<{ envelope: Envelope }>(`/api/tela/sign/envelopes/${encodeURIComponent(id)}/void`, { method: 'POST', token: await t(), body: JSON.stringify({ reason }) })).envelope,
  };
}

// ── Signer ───────────────────────────────────────────────────────────────────
export interface SignerView {
  id: string; title: string; docType: string; docHash: string; pages: number; message?: string;
  sender: { name: string; org?: string }; status: Envelope['status']; expiresAt: number;
  you: { id: string; name: string; role: Signer['role']; status: Signer['status']; consumer?: boolean; consentedAt?: number; signedAt?: number; requirePasskey: boolean; canUsePasskey: boolean };
  recipients: { id: string; name: string; role: Signer['role']; order: number; status: Signer['status'] }[];
  fields: Field[]; body?: { text: string }; disclosure: string[]; finalHash?: string;
}

export interface SignerLinkParams { env: string; s: string; t: string }
export function readSignerLink(search: string): SignerLinkParams | null {
  const q = new URLSearchParams(search);
  const env = q.get('env'), s = q.get('s'), t = q.get('t');
  return q.get('view') === 'sign' && env && s && t ? { env, s, t } : null;
}

/** Turn the signer's view into the Envelope shape the signing screen renders. */
export function viewAsEnvelope(v: SignerView): Envelope {
  return {
    id: v.id, title: v.title, docType: v.docType, docHash: v.docHash, pages: v.pages, message: v.message,
    sender: { id: 'sender', name: v.sender.name, org: v.sender.org }, status: v.status, createdAt: 0, expiresAt: v.expiresAt,
    finalHash: v.finalHash, body: v.body, fields: v.fields, audit: [],
    signers: v.recipients.map((r) => ({ ...r, email: '', auth: 'email_link' as const, ...(r.id === v.you.id ? { consumer: v.you.consumer, consentedAt: v.you.consentedAt, signedAt: v.you.signedAt, requirePasskey: v.you.requirePasskey } : {}) })),
  };
}

export function signerApi(link: SignerLinkParams, token: TokenSource, accessCode: () => string) {
  const base = `/api/tela/sign/envelopes/${encodeURIComponent(link.env)}`;
  const creds = () => ({ s: link.s, t: link.t, ...(accessCode() ? { code: accessCode() } : {}) });
  const post = async (path: string, extra: Record<string, unknown> = {}) =>
    req<SignerView>(`${base}/${path}`, { method: 'POST', token: await token(), body: JSON.stringify({ ...creds(), ...extra }) });
  return {
    view: async () => req<SignerView>(`${base}/signer?${new URLSearchParams(creds() as Record<string, string>)}`, { token: await token() }),
    consent: () => post('consent'),
    fill: (fieldId: string, value: Field['value']) => post('field', { fieldId, value }),
    decline: (reason: string) => post('decline', { reason }),
    finish: () => post('finish'),
    /** Ask the device (fingerprint, face, Windows Hello) to seal the signature, then finish. */
    finishWithPasskey: async () => {
      const ch = await req<{ challenge: string; rpId: string; allowCredentials: { id: string }[] }>(`${base}/seal-challenge?${new URLSearchParams(creds() as Record<string, string>)}`, { token: await token() });
      const passkey = await sealWithPasskey(ch).catch((e: any) => {
        throw new SignApiError(e?.name === 'NotAllowedError' ? 'The fingerprint, face or Windows Hello check was cancelled.' : (e?.message || 'The passkey check didn’t work.'), 400);
      });
      return post('finish', { passkey });
    },
  };
}

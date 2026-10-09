// signupGuard — pure checks run before an email/password account is created.
// Shared by: routes/antiAbuse.ts (POST /api/auth/signup-check) and the Identity Platform
// beforeCreate blocking function documented in docs/ANTI_BOT_PLAYBOOK.md.
// No I/O, no Node-only APIs — safe to import anywhere (and unit-tested).

import { DISPOSABLE_EMAIL_DOMAINS } from '../data/disposableEmailDomains';

let domainSet: Set<string> | null = null;
function domains(): Set<string> {
  if (domainSet) return domainSet;
  domainSet = new Set(DISPOSABLE_EMAIL_DOMAINS);
  const extra = (typeof process !== 'undefined' && process.env?.DISPOSABLE_EMAIL_EXTRA) || '';
  for (const d of extra.split(',')) { const t = d.trim().toLowerCase(); if (t) domainSet.add(t); }
  return domainSet;
}

export const looksLikeEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
}

/** True when the domain (or any parent domain) is on the disposable list. */
export function isDisposableDomain(domain: string): boolean {
  const set = domains();
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  for (let i = 0; i + 1 < parts.length; i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

export type SignupVerdict =
  | { ok: true }
  | { ok: false; code: 'INVALID_EMAIL' | 'EMAIL_NOT_ACCEPTED'; message: string };

/** The verdict returned to the client. Never reveals whether an account already exists. */
export function checkSignupEmail(rawEmail: unknown): SignupVerdict {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!looksLikeEmail(email)) return { ok: false, code: 'INVALID_EMAIL', message: 'That doesn’t look like a valid email address.' };
  if (isDisposableDomain(emailDomain(email))) {
    return { ok: false, code: 'EMAIL_NOT_ACCEPTED', message: 'Please use a permanent email address — temporary inboxes can’t receive account and security emails.' };
  }
  return { ok: true };
}

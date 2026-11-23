// signupClient — client side of the email-signup anti-bot layer.
//
//   preSignupCheck(email)  → POST /api/auth/signup-check before createUserWithEmailAndPassword.
//                            Throws a friendly Error ONLY for a definite "no" (disposable /
//                            malformed address). Network errors, 429s and 5xx never block a
//                            real person — the server-side beforeCreate blocking function is the
//                            real gate (docs/ANTI_BOT_PLAYBOOK.md).
//   afterEmailSignup(user) → sends the verification email (fire-and-forget) and shows the
//                            gentle verify-your-email nudge. Never blocks the new account.

import type { User } from 'firebase/auth';

export async function preSignupCheck(email: string): Promise<void> {
  const addr = (email || '').trim();
  if (!addr) return;
  let verdict: any = null;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    const res = await fetch('/api/auth/signup-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addr }),
      signal: ctrl?.signal,
    });
    if (t) clearTimeout(t);
    if (res.ok) verdict = await res.json().catch(() => null);
  } catch { /* offline / timeout → don't block */ }
  if (verdict && verdict.ok === false && typeof verdict.message === 'string') {
    throw new Error(verdict.message);
  }
}

/**
 * Send the verification email. Primary path: our server mints the link and delivers it through
 * Resend from the verified notify.plajah.com domain (inboxes at iCloud/Yahoo/Outlook often junk
 * Firebase's default noreply sender). If the server can't send, fall back to Firebase's own mail
 * so a person is never left without one. Resolves true when some path sent it; throws if both fail.
 */
export async function sendVerificationEmail(user: User): Promise<boolean> {
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/auth/send-verification', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      const j: any = await res.json().catch(() => null);
      throw new Error(j?.error || 'Please wait a moment before asking for another email.');
    }
    const j: any = res.ok ? await res.json().catch(() => null) : null;
    if (j?.sent) return true;
    if (j?.reason === 'already_verified') return true;
  } catch (e) {
    if (/wait|Too many/i.test((e as Error)?.message || '')) throw e;
    console.warn('[signup] server verification mail failed, using Firebase:', (e as Error)?.message);
  }
  const { sendEmailVerification } = await import('firebase/auth');
  await sendEmailVerification(user, { url: `${window.location.origin}/?verified=1` }).catch(async () => {
    // An unauthorized continue URL must not cost the person their verification mail.
    await sendEmailVerification(user);
  });
  return true;
}

export function afterEmailSignup(user: User): void {
  if (!user || user.emailVerified) return;
  void (async () => {
    try {
      await sendVerificationEmail(user);
      try { localStorage.setItem('plajah.verifyNudge.sentAt', String(Date.now())); } catch { /* */ }
    } catch (e) {
      console.warn('[signup] verification email not sent:', (e as Error)?.message);
    }
    try {
      const { showEmailVerifyNudge } = await import('./emailVerifyNudge');
      showEmailVerifyNudge(user, { justSignedUp: true });
    } catch { /* nudge is optional */ }
  })();
}

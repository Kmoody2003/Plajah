// emailVerifyNudge — a small, dismissible "please confirm your email" card.
//
// UX principle (docs/ANTI_BOT_PLAYBOOK.md): invisible to humans, walls for bots. Nothing is
// gated on verification; verifying simply lifts the person into a higher trust tier
// (services/trust/trustCore.ts) sooner. The card:
//   • only appears for email/password accounts that are not verified yet,
//   • shows right after signup, then at most once every 3 days after "Not now",
//   • offers "Resend" (60 s cooldown) and disappears by itself once the email is verified.
// Plain DOM (like the update toast in index.tsx) so it works regardless of React state.

import type { Auth, User } from 'firebase/auth';

const DISMISS_KEY = 'plajah.verifyNudge.dismissedAt';
const SENT_KEY = 'plajah.verifyNudge.sentAt';
const SNOOZE_MS = 3 * 24 * 3_600_000;
const RESEND_COOLDOWN_MS = 60_000;
const CARD_ID = 'plajah-verify-nudge';

const lsGet = (k: string) => { try { return Number(localStorage.getItem(k) || 0); } catch { return 0; } };
const lsSet = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* */ } };

function needsNudge(user: User | null): user is User {
  if (!user || user.isAnonymous || user.emailVerified || !user.email) return false;
  return user.providerData.some(p => p?.providerId === 'password') &&
    !user.providerData.some(p => p && p.providerId !== 'password'); // social providers verify for us
}

function removeCard() { document.getElementById(CARD_ID)?.remove(); }

export function showEmailVerifyNudge(user: User, opts: { justSignedUp?: boolean } = {}): void {
  if (typeof document === 'undefined' || !needsNudge(user)) return;
  if (!opts.justSignedUp && Date.now() - lsGet(DISMISS_KEY) < SNOOZE_MS) return;
  if (document.getElementById(CARD_ID)) return;

  const card = document.createElement('div');
  card.id = CARD_ID;
  card.setAttribute('role', 'status');
  card.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483600;display:flex;align-items:center;gap:10px;max-width:min(92vw,460px);padding:10px 12px 10px 14px;border-radius:12px;background:#1b1b24;color:#fff;border:1px solid rgba(255,140,0,0.35);box-shadow:0 8px 28px rgba(0,0,0,.45);font:500 13px system-ui,sans-serif;line-height:1.35';

  const msg = document.createElement('span');
  msg.style.cssText = 'flex:1;min-width:0';
  msg.textContent = opts.justSignedUp
    ? `Welcome! We sent a confirmation link to ${user.email}.`
    : `Confirm your email (${user.email}) to keep your account secure.`;

  const btn = (label: string, primary = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = primary
      ? 'padding:6px 12px;border-radius:7px;border:none;background:linear-gradient(90deg,#FF8C00,#ffa733);color:#1a1a1a;font-weight:700;cursor:pointer;white-space:nowrap'
      : 'padding:6px 10px;border-radius:7px;border:1px solid rgba(255,255,255,0.16);background:transparent;color:#c9c9d4;font-weight:600;cursor:pointer;white-space:nowrap';
    return b;
  };
  const resend = btn('Resend', true);
  const later = btn('Not now');

  resend.onclick = async () => {
    if (Date.now() - lsGet(SENT_KEY) < RESEND_COOLDOWN_MS) { msg.textContent = 'Sent — check your inbox (and spam folder).'; return; }
    resend.disabled = true;
    try {
      const { sendEmailVerification } = await import('firebase/auth');
      await sendEmailVerification(user);
      lsSet(SENT_KEY, Date.now());
      msg.textContent = 'Sent — check your inbox (and spam folder).';
    } catch {
      msg.textContent = 'Couldn’t send right now. Please try again in a minute.';
    } finally {
      setTimeout(() => { resend.disabled = false; }, RESEND_COOLDOWN_MS);
    }
  };
  later.onclick = () => { lsSet(DISMISS_KEY, Date.now()); removeCard(); };

  card.append(msg, resend, later);
  document.body.appendChild(card);
}

let started = false;
/**
 * Install once (services/firebase.ts). Shows the nudge on sign-in when due, and re-checks the
 * verified flag when the tab regains focus (the person usually verifies in another tab).
 */
export function startEmailVerifyNudge(auth: Auth): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void import('firebase/auth').then(({ onAuthStateChanged }) => {
    onAuthStateChanged(auth, user => {
      if (!user) { removeCard(); return; }
      // Give the shell a moment to paint before showing anything.
      setTimeout(() => { if (auth.currentUser?.uid === user.uid) showEmailVerifyNudge(user); }, 8000);
    });
  });
  document.addEventListener('visibilitychange', () => {
    const u = auth.currentUser;
    if (document.visibilityState !== 'visible' || !u || u.emailVerified || !document.getElementById(CARD_ID)) return;
    void u.reload().then(async () => {
      if (auth.currentUser?.emailVerified) {
        removeCard();
        // Refresh the ID token so server-side checks (and trust tier) see email_verified=true.
        await auth.currentUser.getIdToken(true).catch(() => {});
      }
    }).catch(() => {});
  });
}

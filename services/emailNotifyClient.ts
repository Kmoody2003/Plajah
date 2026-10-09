// Client half of email notifications — the only call the browser makes directly is the self-test.
// Prefs live in users/{uid}.notificationPrefs next to the push keys (see services/notify/emailNotifyCore.ts).
import { auth } from './firebase';

export type TestEmailResult =
  | { sent: true; to: string }
  | { sent: false; reason: 'not_configured' | 'no_email' | 'email_unverified' | 'rate_limited' | 'error' };

export async function sendTestEmail(): Promise<TestEmailResult> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { sent: false, reason: 'error' };
    const r = await fetch('/api/notify/email/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) return { sent: false, reason: 'rate_limited' };
    const j = await r.json().catch(() => null) as any;
    if (j?.sent) return { sent: true, to: String(j.to || '') };
    return { sent: false, reason: j?.reason || 'error' };
  } catch { return { sent: false, reason: 'error' }; }
}

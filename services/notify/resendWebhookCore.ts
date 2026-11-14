// resendWebhookCore — pure pieces of the Resend webhook (routes/campaigns.ts): Svix signature check + event meaning.
//
// Resend signs with Svix: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${raw body}`, keyed by the base64 part of the
// `whsec_…` signing secret. The svix-signature header lists one or more `v1,<base64>` values (several during rotation).

import nodeCrypto from 'node:crypto';

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(
  rawBody: Buffer, headers: { id?: string; timestamp?: string; signature?: string }, secret: string, nowMs: number,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (!key.length) return false;
  const expected = nodeCrypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`).update(rawBody).digest();
  return signature.split(' ').some(part => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && nodeCrypto.timingSafeEqual(got, expected);
  });
}

/** Why this event means "stop mailing the address", or '' when it doesn't. A transient bounce (full mailbox) doesn't. */
export function resendStopReason(event: { type?: unknown; data?: any }): string {
  const type = String(event?.type || '');
  if (type === 'email.complained') return 'Marked as spam';
  if (type === 'email.suppressed') return 'On the provider suppression list';
  if (type === 'email.bounced') {
    const kind = String(event?.data?.bounce?.type || '').toLowerCase();
    return kind === 'transient' || kind === 'undetermined' ? '' : 'Hard bounce';
  }
  return '';
}

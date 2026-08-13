/**
 * Campaigns — client service for The Post Man's business side.
 *
 * Thin on purpose. Every rule that matters (postal address required, recipients
 * drawn from the sender's own list, suppression enforced, one-click unsubscribe
 * headers attached) lives in routes/campaigns.ts, because a client can be
 * modified and a server cannot. This file asks; the server decides.
 */

import { auth } from './firebase';
import type {
  Campaign,
  CampaignAudience,
  CampaignSender,
  CampaignSenderReadiness,
  CampaignSuppression,
} from '../types';

const BASE = '/api/campaigns';

/** Carries the server's structured refusal so the UI can list what is missing. */
export class CampaignError extends Error {
  constructor(
    message: string,
    readonly code?: 'SENDER_INCOMPLETE' | 'UNCONFIGURED' | 'SIGNED_OUT',
    readonly missing?: string[],
  ) {
    super(message);
    this.name = 'CampaignError';
  }
}

async function callApi<T>(path: string, init: RequestInit = {}, forceRefresh = false): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new CampaignError('Sign in first.', 'SIGNED_OUT');

  const token = await user.getIdToken(forceRefresh);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  // Plajah supports hot account switching, so one retry on a refreshed token.
  if (res.status === 401 && !forceRefresh) return callApi<T>(path, init, true);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; code?: string; missing?: string[]; configured?: boolean }
      | null;
    const message = body?.error || `Request failed (${res.status})`;
    if (body?.code === 'SENDER_INCOMPLETE') {
      throw new CampaignError(message, 'SENDER_INCOMPLETE', body.missing);
    }
    if (res.status === 503 || body?.configured === false) {
      throw new CampaignError(message, 'UNCONFIGURED');
    }
    throw new CampaignError(message);
  }

  return res.json() as Promise<T>;
}

/* ── Configuration ────────────────────────────────────────────────────────── */

export async function getCampaignStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(`${BASE}/status`);
    if (!res.ok) return { configured: false };
    return await res.json();
  } catch {
    return { configured: false };
  }
}

/* ── Sender profile ───────────────────────────────────────────────────────── */

export async function getSender(): Promise<{ sender: CampaignSender | null } & CampaignSenderReadiness> {
  return callApi('/sender');
}

export async function saveSender(
  patch: Pick<CampaignSender, 'fromName' | 'replyTo' | 'postalAddress' | 'listDescription'>,
): Promise<{ sender: CampaignSender } & CampaignSenderReadiness> {
  return callApi('/sender', { method: 'PUT', body: JSON.stringify(patch) });
}

/* ── Audience ─────────────────────────────────────────────────────────────── */

export async function getAudience(): Promise<CampaignAudience> {
  return callApi('/audience');
}

/* ── Sending ──────────────────────────────────────────────────────────────── */

export interface SendResult { sent: number; failed: number; test: boolean }

/** Sends to the whole deliverable audience. Recipients are chosen by the server. */
export async function sendCampaign(subject: string, html: string): Promise<SendResult> {
  return callApi('/send', { method: 'POST', body: JSON.stringify({ subject, html }) });
}

/** Sends one copy to a single address, skipping the audience entirely. */
export async function sendTest(subject: string, html: string, testTo: string): Promise<SendResult> {
  return callApi('/send', { method: 'POST', body: JSON.stringify({ subject, html, testTo }) });
}

/* ── History and suppression ──────────────────────────────────────────────── */

export async function listCampaigns(): Promise<Campaign[]> {
  const { campaigns } = await callApi<{ campaigns: Campaign[] }>('/');
  return campaigns ?? [];
}

export async function listSuppression(): Promise<CampaignSuppression[]> {
  const { entries } = await callApi<{ entries: CampaignSuppression[] }>('/suppression');
  return entries ?? [];
}

export async function suppressAddress(email: string): Promise<void> {
  await callApi('/suppression', { method: 'POST', body: JSON.stringify({ email }) });
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Plain text to simple HTML. Paragraphs from blank lines, everything escaped. */
export function draftToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text
    .split(/\n{2,}/)
    .filter(block => block.trim())
    .map(block => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Subject-line checks that correlate with landing in spam. Advisory only — the
 * send is never blocked on these, because a false positive on someone's genuine
 * subject line is worse than a slightly worse open rate.
 */
export function subjectWarnings(subject: string): string[] {
  const out: string[] = [];
  const s = subject.trim();
  if (!s) return out;
  if (s.length > 90) out.push('Long subject lines get truncated on phones — aim for under 60 characters.');
  if (/[A-Z]{6,}/.test(s)) out.push('Shouting in capitals is one of the strongest spam signals there is.');
  if ((s.match(/!/g) || []).length > 1) out.push('More than one exclamation mark reads as spam to filters.');
  if (/\b(free|winner|guaranteed|act now|urgent|risk[- ]free)\b/i.test(s)) {
    out.push('Words like "free", "guaranteed" and "act now" are heavily weighted by spam filters.');
  }
  return out;
}

export function formatSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

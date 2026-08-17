/**
 * Praxis proactive watchers — the engine behind Aria's "Protect" instinct.
 *
 * Each watcher reads the venture's real state and, when something needs the
 * founder's attention, returns a Nudge tagged to one of the Three P's
 * (Provide · Protect · Prosper). This is what makes Aria proactive rather than
 * a Q&A box: she watches the business and speaks up — with a one-tap handoff
 * to coach the founder through the fix.
 *
 * Pure + synchronous — no I/O. Call runWatchers(venture) wherever you want to
 * surface nudges (the Praxis journey today; push notifications later).
 */
import type { Venture } from './praxisService';
import { getEntity, STAGES, type PKey } from '../data/praxisJourney';

export type Severity = 'info' | 'warn' | 'urgent';

export interface Nudge {
  id: string;
  p: PKey;
  severity: Severity;
  title: string;
  body: string;
  /** label for the one-tap coach button */
  actionLabel: string;
  /** the prompt handed to Aria (via OPEN_ARIA) when the founder acts on it */
  actionPrompt: string;
}

const num = (s?: string): number | null => {
  const n = parseFloat((s || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
};
const has = (v: Venture, stage: string) => v.completedStages.includes(stage);
const past = (v: Venture, stage: string) => {
  const target = STAGES.find(s => s.key === stage)?.order ?? 99;
  const cur = STAGES.find(s => s.key === v.currentStage)?.order ?? 0;
  return has(v, stage) || cur > target;
};

type Watcher = (v: Venture) => Nudge | null;

const WATCHERS: Watcher[] = [
  // ── Protect ────────────────────────────────────────────────────────────────
  v => (v.orgId || has(v, 'operate') || has(v, 'books')) && v.plan.form_ck_bank !== '1'
    ? { id: 'bank', p: 'protect', severity: 'warn', title: 'Keep business & personal money apart',
        body: "You haven't opened a business bank account yet. Mixing funds weakens your liability shield and makes tax time painful.",
        actionLabel: 'Help me set this up', actionPrompt: 'Walk me through opening a business bank account and keeping my business and personal money separate — and why it matters for my liability protection.' }
    : null,
  v => (v.orgId || past(v, 'operate')) && v.plan.form_ck_ein !== '1'
    ? { id: 'ein', p: 'protect', severity: 'warn', title: "You're operating without an EIN",
        body: 'Your federal tax ID is free from the IRS and needed to hire, open a bank account, and file taxes cleanly.',
        actionLabel: 'Get my EIN', actionPrompt: 'Help me get my EIN from the IRS — what I need and the exact steps. Take me to the official page.' }
    : null,
  v => past(v, 'form') && ['llc', 's_corp', 'c_corp'].includes(v.plan.form_entity || '')
    ? { id: 'boi', p: 'protect', severity: 'info', title: 'File your BOI report',
        body: `Most ${getEntity(v.plan.form_entity)?.label || 'LLCs & corporations'} must file a Beneficial Ownership report with FinCEN soon after forming — a missed one carries steep penalties.`,
        actionLabel: 'Explain BOI', actionPrompt: 'Explain the FinCEN Beneficial Ownership (BOI) report — do I need to file it, by when, and where? Keep it plain.' }
    : null,
  v => past(v, 'form') && !v.plan.comply_items
    ? { id: 'comply', p: 'protect', severity: 'warn', title: 'No compliance calendar yet',
        body: 'Set up your filings and renewals so a tax or license deadline never sneaks up on you.',
        actionLabel: 'Build my calendar', actionPrompt: 'Build my compliance calendar — which filings and renewals I owe, when they are due, and the official links.' }
    : null,

  // ── Prosper ────────────────────────────────────────────────────────────────
  v => {
    const net = num(v.plan.books_net);
    return net !== null && net < 0
      ? { id: 'loss', p: 'prosper', severity: 'urgent', title: "You're running at a loss",
          body: "Your net is negative. Let's check your runway and the fastest path to break-even before it bites.",
          actionLabel: 'Check my runway', actionPrompt: 'My business is running at a loss. Help me find the fastest path to break-even and figure out how many months of runway I have.' }
      : null;
  },
  v => {
    const m = num(v.plan.books_margin);
    return m !== null && m >= 0 && m < 15
      ? { id: 'margin', p: 'prosper', severity: 'warn', title: 'Your margin is thin',
          body: `Net margin is ${m}% — under about 15% leaves little room for a bad month. Small pricing or cost fixes compound fast.`,
          actionLabel: "Where's it leaking?", actionPrompt: `My net margin is ${m}%. Where is it likely leaking for my kind of business, and what are the two highest-impact fixes?` }
      : null;
  },
  v => {
    const c = num(v.plan.grow_cac), l = num(v.plan.grow_ltv);
    return c && l && c > 0 && l / c < 3
      ? { id: 'ltvcac', p: 'prosper', severity: 'warn', title: 'Customers cost too much',
          body: `Your LTV:CAC is ${(l / c).toFixed(1)}:1 — under 3:1, spending more on growth loses money. Fix acquisition or lift lifetime value first.`,
          actionLabel: 'Fix my unit economics', actionPrompt: `My LTV:CAC is ${(l / c).toFixed(1)}:1. Help me either lower what it costs to get a customer or raise what a customer is worth.` }
      : null;
  },
  v => past(v, 'fund') && v.plan.grow_moves !== undefined && !(v.plan.grow_moves || '').split(',').includes('bizcredit')
    ? { id: 'bizcredit', p: 'prosper', severity: 'info', title: 'Start building business credit',
        body: 'Business credit on your EIN (Net-30 vendors, a business card) unlocks bigger, cheaper financing without risking your personal score.',
        actionLabel: 'How do I start?', actionPrompt: 'How do I start building business credit on my EIN — the first practical steps and the kinds of vendors that report it?' }
    : null,

  // ── Provide ────────────────────────────────────────────────────────────────
  v => {
    const days = (Date.now() - (v.updatedAt || 0)) / 86400000;
    return days >= 5 && v.completedStages.length < STAGES.length
      ? { id: 'stuck', p: 'provide', severity: 'info', title: 'Pick up where you left off',
          body: `It's been a few days. Your next step is ${STAGES.find(s => s.key === v.currentStage)?.title || 'the next stage'}.`,
          actionLabel: "What's my next step?", actionPrompt: 'Look at my venture and tell me the single most important next step, then help me take it right now.' }
      : null;
  },
];

const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, warn: 1, info: 2 };

/** Run every watcher over the venture and return active nudges, most-urgent first. */
export function runWatchers(v: Venture | null | undefined): Nudge[] {
  if (!v) return [];
  return WATCHERS
    .map(w => { try { return w(v); } catch { return null; } })
    .filter((n): n is Nudge => !!n)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// Public correction log for published articles. Pure functions, unit-tested.
//
// Policy encoded here (and enforced again in firestore.rules for the append-only part):
//   1. A published article is never silently edited. Any change to the published text
//      requires a public notice (CORRECTION / UPDATE / EDITORS_NOTE / CLARIFICATION / RETRACTION).
//   2. The log is APPEND-ONLY. Notices can be added, never edited or removed.
//   3. Each notice that changes the body points at the Tela version it created and the
//      version before it, so a reader can open the earlier text.
//
// Honest limit: the log lives on the article document. An admin with database access can
// still rewrite it; this is a product policy plus rules, not a tamper-proof ledger.

import type { ArticleNotice, NoticeLabel } from './types';

export interface NoticeLabelInfo {
  label: NoticeLabel;
  /** Reader-facing heading, e.g. "Correction". */
  heading: string;
  /** Standard lead-in for the editor to complete. */
  prefix: string;
  /** Whether this notice normally accompanies a body change (and so a new version). */
  changesBody: boolean;
  tone: 'danger' | 'info' | 'warn';
}

export const NOTICE_LABELS: Record<NoticeLabel, NoticeLabelInfo> = {
  CORRECTION: { label: 'CORRECTION', heading: 'Correction', prefix: 'An earlier version of this article incorrectly stated', changesBody: true, tone: 'danger' },
  CLARIFICATION: { label: 'CLARIFICATION', heading: 'Clarification', prefix: 'This article has been clarified to say', changesBody: true, tone: 'warn' },
  UPDATE: { label: 'UPDATE', heading: 'Update', prefix: 'This article has been updated to include', changesBody: true, tone: 'info' },
  EDITORS_NOTE: { label: 'EDITORS_NOTE', heading: "Editor’s note", prefix: 'Editor’s note:', changesBody: false, tone: 'info' },
  RETRACTION: { label: 'RETRACTION', heading: 'Retraction', prefix: 'This article has been retracted because', changesBody: true, tone: 'danger' },
};

export const NOTICE_ORDER: NoticeLabel[] = ['CORRECTION', 'CLARIFICATION', 'UPDATE', 'EDITORS_NOTE', 'RETRACTION'];

/** Cheap stable fingerprint (FNV-1a 32) of normalized text. Not cryptographic. */
export function fingerprint(text: string): string {
  const t = normalizeForCompare(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface EditClassification {
  changed: boolean;
  /** Fraction of words that differ (0..1), by simple multiset comparison. */
  changeRatio: number;
  /** 'none' needs no notice; anything else does. */
  level: 'none' | 'minor' | 'substantive';
  addedWords: number;
  removedWords: number;
}

export function classifyEdit(before: string, after: string): EditClassification {
  const a = normalizeForCompare(before); const b = normalizeForCompare(after);
  if (a === b) return { changed: false, changeRatio: 0, level: 'none', addedWords: 0, removedWords: 0 };
  const bag = (s: string) => { const m = new Map<string, number>(); for (const w of s.split(/\s+/).filter(Boolean)) m.set(w, (m.get(w) || 0) + 1); return m; };
  const A = bag(a); const B = bag(b);
  let removed = 0; let added = 0;
  for (const [w, n] of A) removed += Math.max(0, n - (B.get(w) || 0));
  for (const [w, n] of B) added += Math.max(0, n - (A.get(w) || 0));
  const total = Math.max(1, a.split(/\s+/).filter(Boolean).length);
  const ratio = Math.min(1, (added + removed) / (2 * total));
  // Word order or punctuation-only changes still count as a change (minor).
  const level = added + removed <= 4 && ratio < 0.1 ? 'minor' : 'substantive';
  return { changed: true, changeRatio: ratio, level, addedWords: added, removedWords: removed };
}

export interface NoticeInput {
  label: NoticeLabel;
  text: string;
  byUid: string;
  byName: string;
  at?: number;
  id?: string;
  versionId?: string;
  previousVersionId?: string;
}

export class NoticeError extends Error {}

/** Returns a NEW log with the notice appended. Never mutates, never reorders. */
export function appendNotice(log: ReadonlyArray<ArticleNotice> | undefined, input: NoticeInput): ArticleNotice[] {
  const text = (input.text || '').trim();
  if (!NOTICE_LABELS[input.label]) throw new NoticeError(`Unknown notice label: ${input.label}`);
  if (text.length < 8) throw new NoticeError('A notice must say what changed (at least a short sentence).');
  if (text.length > 2000) throw new NoticeError('Keep the notice under 2,000 characters.');
  if (!input.byUid) throw new NoticeError('A notice must record who issued it.');
  const notice: ArticleNotice = {
    id: input.id || `ntc_${(input.at ?? Date.now()).toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: input.label,
    text,
    at: input.at ?? Date.now(),
    byUid: input.byUid,
    byName: input.byName || 'Editor',
    ...(input.versionId ? { versionId: input.versionId } : {}),
    ...(input.previousVersionId ? { previousVersionId: input.previousVersionId } : {}),
  };
  return [...(log || []), notice];
}

/** True when `next` is `prev` plus zero or more appended entries, with prior entries untouched. */
export function isAppendOnly(prev: ReadonlyArray<ArticleNotice> | undefined, next: ReadonlyArray<ArticleNotice> | undefined): boolean {
  const p = prev || []; const n = next || [];
  if (n.length < p.length) return false;
  return p.every((entry, i) => JSON.stringify(entry) === JSON.stringify(n[i]));
}

/**
 * Gate for saving an edit to an already-published article. Returns the reason the edit
 * cannot go out silently, or null when it may.
 */
export function silentEditProblem(
  publishedText: string, nextText: string, prev: ReadonlyArray<ArticleNotice> | undefined, next: ReadonlyArray<ArticleNotice> | undefined,
): string | null {
  const c = classifyEdit(publishedText, nextText);
  if (!c.changed) return null;
  if (!isAppendOnly(prev, next)) return 'The correction log is append-only; existing notices cannot be changed or removed.';
  const added = (next || []).length - (prev || []).length;
  if (added < 1) {
    return c.level === 'minor'
      ? 'This changes the published text. Add a short public notice (for example "UPDATE: fixed a typo") so the edit is not silent.'
      : 'This changes the published text. Add a public CORRECTION, CLARIFICATION or UPDATE notice before it can go live.';
  }
  return null;
}

/** Latest-first view used on the article page. RETRACTION sorts to the top regardless of date. */
export function sortForDisplay(log: ReadonlyArray<ArticleNotice> | undefined): ArticleNotice[] {
  return [...(log || [])].sort((a, b) => (a.label === 'RETRACTION' ? -1 : 0) - (b.label === 'RETRACTION' ? -1 : 0) || b.at - a.at);
}

export function isRetracted(log: ReadonlyArray<ArticleNotice> | undefined): boolean {
  return (log || []).some(n => n.label === 'RETRACTION');
}

export function noticeToPlainText(n: ArticleNotice): string {
  const d = new Date(n.at);
  const date = isNaN(d.getTime()) ? '' : ` (${d.toISOString().slice(0, 10)})`;
  return `${NOTICE_LABELS[n.label].heading.toUpperCase()}${date}: ${n.text}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function noticesToHtml(log: ReadonlyArray<ArticleNotice> | undefined): string {
  const items = sortForDisplay(log);
  if (!items.length) return '';
  return `<aside class="corrections"><h2>Corrections and updates</h2><ul>${items.map(n =>
    `<li data-label="${n.label}"><strong>${esc(NOTICE_LABELS[n.label].heading)}</strong> <time datetime="${new Date(n.at).toISOString()}">${esc(new Date(n.at).toISOString().slice(0, 10))}</time>: ${esc(n.text)}</li>`).join('')}</ul></aside>`;
}

// ariaMeetingCore — Aria in a Tela meeting (phase 1: live notes). Pure, no Firebase, no React.
//
// Everyone's own device captions their own mic (useMeetingCaptions); finished lines reach the
// host over the call's data channel. The host's device runs Aria: every so often (or right away
// when someone says "Aria, …") the new lines plus Aria's current notes go to a model, which returns
// the updated notes. The notes render to an Aria-owned Writer page in the Tela doc. Aria never
// overwrites what a person typed: once the page was edited by hand, new items are only appended.

import type { TelaBlock } from '../../types';
import { rulesRecap, type CaptionLine } from './meetingRecordingCore';

export type AriaLane = 'local' | 'cloud' | 'rules';

export interface AriaLine { uid: string; name: string; text: string; at: number }

export interface AriaAction { text: string; owner?: string }
export interface AriaRequest { request: string; by: string; response: string }

export interface AriaNotes {
  summary: string;
  decisions: string[];
  actions: AriaAction[];
  questions: string[];
  /** Things people asked Aria for out loud ("Aria, draft an agenda"), with Aria's answer. */
  requests: AriaRequest[];
}

export const EMPTY_NOTES: AriaNotes = { summary: '', decisions: [], actions: [], questions: [], requests: [] };

export const LIMITS = { summary: 1200, item: 300, decisions: 15, actions: 25, questions: 12, requests: 8, response: 1500 } as const;

// ── Wake phrase ──────────────────────────────────────────────────────────────

const WAKE_RE = /(?:^|[.!?]\s+|\b(?:hey|okay|ok|so)\s+)aria[,:!]?\s+(.{3,})$/i;

/** "Aria, put that in the notes" → "put that in the notes". Null when Aria isn't addressed. */
export function wakeRequest(text: string): string | null {
  const t = (text || '').trim();
  const m = t.match(WAKE_RE);
  if (!m) return null;
  const req = m[1].trim().replace(/[.!?]+$/, '');
  return req.length >= 3 ? req.slice(0, LIMITS.item) : null;
}

// ── When to run a step ───────────────────────────────────────────────────────

export interface StepClock {
  lastStepAt: number;
  /** Index into the transcript of the first line the model hasn't seen yet. */
  cursor: number;
  inFlight: boolean;
}

export const STEP = { minGapMs: 20_000, minNewLines: 3, wakeGapMs: 2_500, idleFlushMs: 60_000 } as const;

/** Run a step when enough new talk piled up, someone asked Aria something, or talk paused with lines unseen. */
export function shouldStep(clock: StepClock, transcriptLen: number, pendingRequests: number, now: number): boolean {
  if (clock.inFlight) return false;
  const fresh = transcriptLen - clock.cursor;
  const since = now - clock.lastStepAt;
  if (pendingRequests > 0 && since >= STEP.wakeGapMs) return true;
  if (fresh >= STEP.minNewLines && since >= STEP.minGapMs) return true;
  return fresh > 0 && since >= STEP.idleFlushMs;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export const ARIA_SYSTEM = [
  'You are Aria, the note-taker inside a live team meeting on Plajah (small teams, churches, nonprofits).',
  'You receive your current notes and the newest part of the transcript. Return the full updated notes.',
  'Use only what people said. Never invent names, dates, numbers or commitments.',
  'Keep earlier items unless the transcript clearly changes or cancels them. Merge duplicates. Plain, short sentences.',
  'Action items are things someone will do; owner is the responsible person if clear, else null.',
  'Questions are things raised and not yet answered. Drop a question once it is answered.',
  'If someone addressed you ("Aria, ..."), answer in "requests" using what was said in the meeting; if it needs facts nobody said, say so briefly.',
  'Reply with JSON only: {"summary": string (2-5 sentences), "decisions": [string], "actions": [{"text": string, "owner": string|null}], "questions": [string], "requests": [{"request": string, "by": string, "response": string}]}.',
].join(' ');

const lineText = (l: AriaLine, startedAt: number) => `[${clockOf(l.at - startedAt)}] ${l.name}: ${l.text}`;

export function clockOf(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The user turn for one step. Context = a few lines before the new ones, so the model keeps the thread. */
export function stepPrompt(opts: {
  title: string; notes: AriaNotes; transcript: AriaLine[]; cursor: number; startedAt: number;
  pending: { request: string; by: string }[]; final?: boolean; maxChars?: number;
}): string {
  const { title, notes, transcript, cursor, startedAt, pending } = opts;
  const max = opts.maxChars ?? 24_000;
  const context = transcript.slice(Math.max(0, cursor - 6), cursor).map(l => lineText(l, startedAt)).join('\n');
  let fresh = transcript.slice(cursor).map(l => lineText(l, startedAt)).join('\n');
  if (fresh.length > max) fresh = `[… earlier lines trimmed …]\n${fresh.slice(-max)}`;
  const parts = [
    `Meeting: ${title}`,
    `Current notes (JSON):\n${JSON.stringify(notes)}`,
    context ? `Just before (already in the notes):\n${context}` : '',
    `New transcript:\n${fresh || '(no new lines)'}`,
    pending.length ? `Asked of you just now:\n${pending.map(p => `- ${p.by}: ${p.request}`).join('\n')}` : '',
    opts.final ? 'The meeting just ended: tighten the summary into a closing recap.' : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

// ── Parse + sanitise ─────────────────────────────────────────────────────────

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter(x => { const k = norm(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
};
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

export function sanitizeNotes(j: any): AriaNotes {
  const strList = (v: unknown, cap: number) => uniq((Array.isArray(v) ? v : []).map(x => clip(x, LIMITS.item)).filter(Boolean)).slice(0, cap);
  const actionsRaw = (Array.isArray(j?.actions) ? j.actions : []).map((a: any): AriaAction => {
    if (typeof a === 'string') return { text: clip(a, LIMITS.item) };
    const owner = a?.owner ? clip(a.owner, 80) : '';
    return owner && owner.toLowerCase() !== 'null' ? { text: clip(a?.text, LIMITS.item), owner } : { text: clip(a?.text, LIMITS.item) };
  }).filter((a: AriaAction) => a.text);
  const seen = new Set<string>();
  const actions = actionsRaw.filter((a: AriaAction) => { const k = norm(a.text); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, LIMITS.actions);
  const requests = (Array.isArray(j?.requests) ? j.requests : []).map((r: any): AriaRequest => ({
    request: clip(r?.request, LIMITS.item), by: clip(r?.by, 80), response: clip(r?.response, LIMITS.response),
  })).filter((r: AriaRequest) => r.request && r.response).slice(-LIMITS.requests);
  return {
    summary: clip(j?.summary, LIMITS.summary),
    decisions: strList(j?.decisions, LIMITS.decisions),
    actions,
    questions: strList(j?.questions, LIMITS.questions),
    requests,
  };
}

/** Parse a model reply. Null when unusable (the caller keeps the previous notes). */
export function parseNotes(reply: string): AriaNotes | null {
  const m = (reply || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const n = sanitizeNotes(JSON.parse(m[0]));
    return n.summary || n.decisions.length || n.actions.length || n.questions.length || n.requests.length ? n : null;
  } catch { return null; }
}

/**
 * A model must not quietly erase the record: requests already answered stay, and if a reply dropped
 * most of the earlier decisions/actions at once (a sign of a truncated answer) the old ones are kept.
 */
export function guardNotes(prev: AriaNotes, next: AriaNotes): AriaNotes {
  const keepIfCollapsed = <T>(a: T[], b: T[], key: (x: T) => string, cap: number) => {
    if (a.length >= 3 && b.length < a.length / 2) {
      const have = new Set(b.map(key));
      return [...b, ...a.filter(x => !have.has(key(x)))].slice(0, cap);
    }
    return b;
  };
  const reqKeys = new Set(next.requests.map(r => norm(r.request)));
  return {
    summary: next.summary || prev.summary,
    decisions: keepIfCollapsed(prev.decisions, next.decisions, norm, LIMITS.decisions),
    actions: keepIfCollapsed(prev.actions, next.actions, a => norm(a.text), LIMITS.actions),
    questions: next.questions,
    requests: [...prev.requests.filter(r => !reqKeys.has(norm(r.request))), ...next.requests].slice(-LIMITS.requests),
  };
}

// ── No-AI lane ───────────────────────────────────────────────────────────────

/** Notes without any model: action/decision sentences from the new lines, questions people asked. */
export function rulesStep(prev: AriaNotes, transcript: AriaLine[], cursor: number, pending: { request: string; by: string }[]): AriaNotes {
  // Lines addressed to Aria are requests, not meeting content ("Aria, what have we decided?").
  const fresh = transcript.slice(cursor).filter(l => !wakeRequest(l.text));
  const lines: CaptionLine[] = fresh.map(l => ({ uid: l.uid, name: l.name, text: l.text, at: l.at }));
  const r = rulesRecap(lines);
  // A request ("can you…?") is already an action item, not an open question.
  const taken = new Set([...r.actionItems.map(a => norm(a.text)), ...r.decisions.map(norm)]);
  const questions = fresh.flatMap(l => l.text.split(/(?<=[.!?])\s+/)).map(s => s.trim())
    .filter(s => s.endsWith('?') && s.length > 12 && !wakeRequest(s) && !taken.has(norm(s)));
  const speakers = [...new Set(transcript.map(l => l.name))];
  const words = transcript.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  return sanitizeNotes({
    summary: transcript.length ? `${speakers.length} ${speakers.length === 1 ? 'person has' : 'people have'} spoken so far (${speakers.join(', ')}), about ${words} words. Notes without AI: decisions and action items are the sentences that sound like them.` : '',
    decisions: [...prev.decisions, ...r.decisions],
    actions: [...prev.actions, ...r.actionItems],
    questions: [...prev.questions, ...questions].slice(-LIMITS.questions),
    requests: [...prev.requests, ...pending.map(p => ({ ...p, response: 'Noted. (Aria is in notes-only mode, so this request was written down, not answered.)' }))],
  });
}

// ── Notes → Writer page ──────────────────────────────────────────────────────

/** Stable short hash so a block keeps its id while its text stays the same (smaller co-edit diffs). */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const block = (kind: TelaBlock['kind'], text: string, salt: string): TelaBlock => ({ id: `aria_${salt}_${hash(kind + text)}`, kind, text });

export interface PageMeta { title: string; startedAt: number; speakers: string[]; lane: AriaLane; live: boolean; now?: number }

const LANE_LABEL: Record<AriaLane, string> = { local: 'on this PC', cloud: 'in the cloud', rules: 'without AI' };

export function notesToBlocks(n: AriaNotes, meta: PageMeta): TelaBlock[] {
  const date = new Date(meta.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const out: TelaBlock[] = [
    block('h1', `Meeting notes: ${meta.title}`, 'title'),
    block('p', `${date} · ${meta.speakers.length ? meta.speakers.join(', ') : 'No one has spoken yet'} · Notes by Aria (${LANE_LABEL[meta.lane]})${meta.live ? ' · live' : ''}`, 'meta'),
    block('h2', 'Summary', 'h'),
    block('p', n.summary || 'Aria is listening. Notes appear here as the meeting goes.', 'sum'),
  ];
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    out.push(block('h2', title, 'h'));
    items.forEach(t => out.push(block('li', t, 'li')));
  };
  section('Decisions', n.decisions);
  section('Action items', n.actions.map(a => (a.owner ? `${a.owner}: ${a.text}` : a.text)));
  section('Open questions', n.questions);
  if (n.requests.length) {
    out.push(block('h2', 'Asked of Aria', 'h'));
    for (const r of n.requests) {
      out.push(block('li', `${r.by ? `${r.by}: ` : ''}${r.request}`, 'rq'));
      out.push(block('p', r.response, 'rs'));
    }
  }
  return dedupeIds(out);
}

/** Same kind+text twice in one page (e.g. two identical list items) would collide; suffix repeats. */
function dedupeIds(blocks: TelaBlock[]): TelaBlock[] {
  const seen = new Map<string, number>();
  return blocks.map(b => {
    const n = seen.get(b.id) ?? 0;
    seen.set(b.id, n + 1);
    return n ? { ...b, id: `${b.id}_${n}` } : b;
  });
}

const sig = (bs: TelaBlock[]) => bs.map(b => `${b.kind}|${b.text.trim()}`).join('\n');

export const NEW_FROM_ARIA = 'New from Aria';

/**
 * What to write to the Aria page. If nobody touched it since Aria's last write, Aria replaces it.
 * If a person edited it, their page stays exactly as they left it and Aria appends only items it
 * hasn't written before, under "New from Aria".
 */
export function mergeIntoPage(current: TelaBlock[], lastWritten: TelaBlock[] | null, next: TelaBlock[]): { blocks: TelaBlock[]; humanEdited: boolean; changed: boolean } {
  if (!lastWritten || sig(current) === sig(lastWritten)) {
    return { blocks: next, humanEdited: false, changed: sig(current) !== sig(next) };
  }
  // The header line and the summary are Aria's: while they still read exactly as she last wrote
  // them, she keeps them current. Anything a person changed stays theirs.
  let page = current;
  for (const salt of ['aria_meta_', 'aria_sum_']) {
    const was = lastWritten.find(b => b.id.startsWith(salt));
    const now = next.find(b => b.id.startsWith(salt));
    if (!was || !now || was.text === now.text) continue;
    const at = page.findIndex(b => b.kind === was.kind && b.text === was.text);
    if (at >= 0) page = [...page.slice(0, at), { ...page[at], text: now.text }, ...page.slice(at + 1)];
  }
  const known = new Set([...current, ...lastWritten].map(b => norm(b.text)));
  const additions = next.filter(b => (b.kind === 'li' || (b.kind === 'p' && !b.id.startsWith('aria_meta') && !b.id.startsWith('aria_sum'))) && b.text.trim() && !known.has(norm(b.text)));
  if (!additions.length) return { blocks: page, humanEdited: true, changed: page !== current };
  const hasHeader = page.some(b => b.kind === 'h2' && b.text.trim() === NEW_FROM_ARIA);
  return {
    blocks: [...page, ...(hasHeader ? [] : [block('h2', NEW_FROM_ARIA, 'new')]), ...additions],
    humanEdited: true,
    changed: true,
  };
}

/** Plain-text recap for the team chat when Aria leaves. */
export function recapMessage(n: AriaNotes, title: string, durationMs: number): string {
  const mins = Math.max(1, Math.round(durationMs / 60_000));
  const lines = [`Aria's meeting notes: ${title} (${mins} min)`, n.summary || 'No summary yet.'];
  if (n.decisions.length) lines.push('', 'Decisions:', ...n.decisions.slice(0, 6).map(d => `• ${d}`));
  if (n.actions.length) lines.push('', 'Action items:', ...n.actions.slice(0, 8).map(a => `• ${a.owner ? `${a.owner}: ` : ''}${a.text}`));
  lines.push('', 'Full notes are on the "Meeting notes · Aria" page in the Tela doc.');
  return lines.join('\n').slice(0, 3800);
}

// ── Cost line (the cloud button shows it; the click is the consent) ──────────

/**
 * Rough cloud cost per meeting hour: ~13k words of talk an hour spread over ~120 steps, each sending
 * the notes (~1.5k tokens) + new lines + system prompt, and getting the notes back (~700 tokens).
 */
export function cloudHourTokens(): { input: number; output: number } {
  const steps = 120;
  const perStepIn = 1500 + 450 + Math.ceil(ARIA_SYSTEM.length / 4);
  return { input: steps * perStepIn, output: steps * 700 };
}

// ── Data channel messages ────────────────────────────────────────────────────

export interface AriaPresence { on: boolean; hostUid: string; hostName: string; lane: AriaLane; startedAt: number }

export function parsePresence(p: any): AriaPresence | null {
  if (!p || typeof p.on !== 'boolean' || typeof p.hostUid !== 'string') return null;
  const lane: AriaLane = p.lane === 'local' || p.lane === 'cloud' ? p.lane : 'rules';
  return { on: p.on, hostUid: p.hostUid.slice(0, 128), hostName: clip(p.hostName, 80) || 'The host', lane, startedAt: Number(p.startedAt) || Date.now() };
}

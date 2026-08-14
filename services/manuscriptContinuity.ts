// manuscriptContinuity — read a WHOLE book at once and find what breaks across it.
//
// This is the first consumer of the Pokee lane (/api/ai/pokee → Pokee-Isaac 28B).
// It exists because the useful errors in a manuscript are the ones that only appear
// when you hold the entire thing in mind at the same time: a character's eyes change
// colour between chapter 3 and chapter 19, a wound heals two chapters too early, a
// season runs backwards, a name is spelled two ways 200 pages apart. Chunk-and-
// retrieve is structurally bad at these — there is no keyword to retrieve on, the
// contradiction only exists in the RELATIONSHIP between two distant passages. A 10M
// context window makes it a single prompt instead of an unsolved problem.
//
// A typical novel (~100k words) is ~130k tokens ≈ two cents a pass. Cost of every
// run is measured and returned, not estimated, so it stays honest.

import type { StudioBook } from '../types';

export type ContinuityKind = 'CHARACTER' | 'TIMELINE' | 'PLOT' | 'SETTING' | 'NAMING' | 'STYLE';
export type ContinuitySeverity = 'high' | 'medium' | 'low';

export interface ContinuityFinding {
  kind: ContinuityKind;
  severity: ContinuitySeverity;
  /** One-line statement of the contradiction. */
  title: string;
  /** What conflicts with what, and why it's a problem. */
  detail: string;
  /** Titles of the chapters involved — the point is that these are far apart. */
  chapters: string[];
  /** Short verbatim snippets from the manuscript, so the author can verify it's real. */
  quotes?: string[];
  suggestion?: string;
}

export interface ContinuityReport {
  findings: ContinuityFinding[];
  /** The model's overall read on the manuscript's consistency. */
  summary: string;
  chaptersAnalyzed: number;
  wordCount: number;
  inputTokens: number;
  outputTokens: number;
  /** Actual USD for this run, from the billed token counts. */
  costUsd: number;
  elapsedMs: number;
}

/** Published rates for pokee-isaac, $/token. */
const PRICE_IN = 0.15 / 1e6;
const PRICE_OUT = 1.0 / 1e6;

export interface BuiltManuscript {
  text: string;
  chapterCount: number;
  wordCount: number;
  /** Rough pre-flight estimate (~4 chars/token) — the server caps on the same maths. */
  approxTokens: number;
}

const stripHtml = (html: string): string => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};

/**
 * Flatten a StudioBook's TEXT pages into one continuous manuscript, chapter-labelled
 * so the model can cite where a contradiction lives. Non-prose pages (comic panels,
 * media, covers) carry no analysable text and are skipped.
 */
export function buildManuscript(book: StudioBook): BuiltManuscript {
  const chapters = [...book.pages]
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({
      title: p.chapterTitle || `Chapter ${i + 1}`,
      content: p.richText ? stripHtml(p.richText) : '',
    }))
    .filter(c => c.content.length > 0);

  const text = chapters
    .map(c => `\n\n=== ${c.title} ===\n\n${c.content}`)
    .join('');

  return {
    text,
    chapterCount: chapters.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    approxTokens: Math.ceil(text.length / 4),
  };
}

const SYSTEM = `You are a continuity editor reading a complete manuscript in one pass.

You can see the ENTIRE book at once. That is the point: report the problems that are
only visible when distant passages are compared. Prioritise contradictions between
chapters that are far apart — those are what a human editor and a chunked tool both miss.

Report:
- CHARACTER — appearance, age, background, relationships, or established ability changing without cause
- TIMELINE — impossible or contradictory ordering, durations, seasons, ages, travel times
- PLOT — an object/injury/knowledge/death that contradicts a later or earlier state
- SETTING — geography, layout, weather, or physical detail that changes silently
- NAMING — a person, place, or thing spelled or referred to inconsistently
- STYLE — tense or narrative-person breaks (report only if genuinely inconsistent, not stylistic choice)

Hard rules:
- Report ONLY contradictions you can support with actual text from the manuscript. Never speculate.
- Quote both sides verbatim and briefly. If you cannot quote it, do not report it.
- A deliberate mystery, an unreliable narrator, or a character lying is NOT a continuity error.
- Prefer a short list of certain findings over a long list of maybes.
- If the manuscript is genuinely consistent, return an empty findings array and say so.

Return ONLY valid JSON, no prose around it:
{"summary": string, "findings": [{"kind": "CHARACTER"|"TIMELINE"|"PLOT"|"SETTING"|"NAMING"|"STYLE",
"severity": "high"|"medium"|"low", "title": string, "detail": string,
"chapters": [string], "quotes": [string], "suggestion": string}]}`;

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('./firebase');
    const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Run a full-manuscript continuity pass. Throws with a readable message on failure —
 * the caller surfaces it, since a silent no-op here would look like "the book is fine".
 */
export async function runContinuityPass(book: StudioBook): Promise<ContinuityReport> {
  const built = buildManuscript(book);
  if (built.chapterCount === 0) {
    throw new Error('There is no written prose in this book yet.');
  }
  if (built.wordCount < 500) {
    throw new Error('The manuscript is too short for a continuity pass to say anything useful.');
  }

  const started = Date.now();
  const res = await fetch('/api/ai/pokee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      model: 'pokee-isaac',
      max_tokens: 8192,
      temperature: 0.2, // near-deterministic: this is analysis, not writing
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content:
            `Title: ${book.title || 'Untitled'}\n` +
            `Author: ${book.author || 'Unknown'}\n` +
            `Genre: ${book.genre || 'Unspecified'}\n` +
            (book.synopsis ? `Synopsis: ${book.synopsis}\n` : '') +
            `\nHere is the complete manuscript (${built.chapterCount} chapters, ` +
            `${built.wordCount.toLocaleString()} words):\n${built.text}`,
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({} as any));

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        `This manuscript is ~${(data.approxInputTokens || built.approxTokens).toLocaleString()} tokens, ` +
        `over the ${(data.maxInputTokens || 0).toLocaleString()} limit. Raise POKEE_MAX_INPUT_TOKENS to analyse it whole.`,
      );
    }
    if (res.status === 503) throw new Error('The continuity model is not configured on this server.');
    throw new Error(data?.error?.message || data?.error || `Continuity pass failed (${res.status}).`);
  }

  const raw = data?.choices?.[0]?.message?.content || '';
  let parsed: any;
  try {
    // Models occasionally wrap JSON in a fence despite response_format; tolerate it.
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  } catch {
    throw new Error('The model returned a response that could not be read as a report.');
  }

  const usage = data?.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;

  const findings: ContinuityFinding[] = Array.isArray(parsed?.findings)
    ? parsed.findings
        .filter((f: any) => f && typeof f.title === 'string')
        .map((f: any) => ({
          kind: (['CHARACTER', 'TIMELINE', 'PLOT', 'SETTING', 'NAMING', 'STYLE'].includes(f.kind)
            ? f.kind : 'PLOT') as ContinuityKind,
          severity: (['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium') as ContinuitySeverity,
          title: String(f.title),
          detail: String(f.detail || ''),
          chapters: Array.isArray(f.chapters) ? f.chapters.map(String) : [],
          quotes: Array.isArray(f.quotes) ? f.quotes.map(String) : [],
          suggestion: f.suggestion ? String(f.suggestion) : undefined,
        }))
        // Most severe first — the author's attention is the scarce resource.
        .sort((a: ContinuityFinding, b: ContinuityFinding) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return rank[a.severity] - rank[b.severity];
        })
    : [];

  return {
    findings,
    summary: String(parsed?.summary || ''),
    chaptersAnalyzed: built.chapterCount,
    wordCount: built.wordCount,
    inputTokens,
    outputTokens,
    costUsd: inputTokens * PRICE_IN + outputTokens * PRICE_OUT,
    elapsedMs: Date.now() - started,
  };
}

// ministryRepurpose — the ARIA editorial core of the Ministry Content Synergy Engine.
// Given a transcript of a captured service/stream, ARIA produces publishable drafts
// (Phase 1: an ARTICLE) with inline supplemental material — Bible passages, facts,
// citations, definitions — and timecoded pull-quotes an editor then approves.
//
// Spec: docs/MINISTRY_CONTENT_SYNERGY_BLUEPRINT.md · GTM §26.
import { callGemini } from './geminiService';
import type { ContentRepurposeJob, RepurposeOutput } from '../types';

export interface RepurposeInput {
  /** The organization name (for voice + attribution). */
  orgName: string;
  /** Timecoded or plain transcript of the service/stream. */
  transcript: string;
  /** Title of the source stream/upload, if known. */
  sourceTitle?: string;
  /** Church/ministry context → ARIA flags scripture references as supplements. */
  faithContext?: boolean;
}

const buildPrompt = (i: RepurposeInput): string => `You are ARIA, Plajah's editorial AI. Prepare a publishable ARTICLE draft from the transcript of ${i.faithContext ? 'a church service / sermon' : 'a talk'} by "${i.orgName}"${i.sourceTitle ? ` titled "${i.sourceTitle}"` : ''}.

Respond with JSON ONLY, exactly this shape:
{
  "title": string,
  "dek": string,
  "sections": [{ "heading": string, "body": string }],
  "pullQuotes": [{ "quote": string }],
  "supplements": [{ "type": "SCRIPTURE"|"FACT"|"CITATION"|"DEFINITION", "label": string, "detail": string, "reference": string, "source": string }]
}

Rules:
- Ground everything strictly in the transcript. Do NOT invent events, quotes, or claims.
- Write 3–6 full-prose sections that read as a finished article, faithful to the speaker's voice and message.
- pullQuotes: 2–4 memorable lines quoted verbatim from the transcript.
${i.faithContext ? '- SCRIPTURE supplements: whenever a Bible passage is referenced or quoted, add one with reference (e.g. "John 3:16") and detail = the verse text plus 1–2 relevant cross-references.\n' : ''}- FACT / CITATION / DEFINITION supplements: whenever a checkable fact, statistic, name, date, place, or claim is stated, add a supplement with a short explanatory detail and a source when known. Omit "reference"/"source" if not applicable.
- This is a DRAFT a human editor will review and approve.

TRANSCRIPT:
${(i.transcript || '').slice(0, 24000)}`;

/** Strip ```json fences some models wrap JSON in. */
const stripFence = (s: string): string =>
  s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();

/**
 * Run ARIA over a transcript and return an ARTICLE draft (with supplements +
 * pull-quotes). Returns null if the AI service is unavailable or returns
 * unparseable output — callers degrade gracefully.
 */
export async function generateArticleDraft(input: RepurposeInput): Promise<RepurposeOutput | null> {
  if (!input.transcript || input.transcript.trim().length < 40) return null;
  const raw = await callGemini(buildPrompt(input), { responseMimeType: 'application/json' }, 'gemini-flash-latest');
  if (!raw) return null;

  let parsed: any;
  try { parsed = JSON.parse(stripFence(raw)); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;

  const sections = Array.isArray(parsed.sections)
    ? parsed.sections.filter((s: any) => s && (s.heading || s.body)).map((s: any) => ({ heading: String(s.heading || ''), body: String(s.body || '') }))
    : [];
  const pullQuotes = Array.isArray(parsed.pullQuotes)
    ? parsed.pullQuotes.filter((q: any) => q && q.quote).map((q: any) => ({ quote: String(q.quote), timecode: typeof q.timecode === 'number' ? q.timecode : undefined }))
    : [];
  const supplements = Array.isArray(parsed.supplements)
    ? parsed.supplements.filter((s: any) => s && s.type && (s.detail || s.reference)).map((s: any) => ({
        type: ['SCRIPTURE', 'FACT', 'CITATION', 'DEFINITION', 'MEDIA'].includes(s.type) ? s.type : 'FACT',
        label: String(s.label || s.reference || 'Note'),
        detail: String(s.detail || ''),
        reference: s.reference ? String(s.reference) : undefined,
        source: s.source ? String(s.source) : undefined,
      }))
    : [];

  return {
    id: `repout_${Date.now()}`,
    kind: 'ARTICLE',
    status: 'DRAFT',
    title: String(parsed.title || input.sourceTitle || 'Untitled Draft'),
    dek: parsed.dek ? String(parsed.dek) : undefined,
    sections,
    pullQuotes,
    supplements,
    stills: [],
  };
}

/**
 * Assemble a ContentRepurposeJob from a source + a generated article draft.
 * (Phase 1: returns the object; Firestore persistence + the review UI land in Phase 2.)
 */
export function buildRepurposeJob(params: {
  orgId: string;
  createdBy: string;
  sourceType: ContentRepurposeJob['sourceType'];
  sourceId: string;
  sourceTitle?: string;
  faithContext?: boolean;
  outputs: RepurposeOutput[];
}): ContentRepurposeJob {
  const now = Date.now();
  return {
    id: `reptask_${now}`,
    orgId: params.orgId,
    createdBy: params.createdBy,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceTitle: params.sourceTitle,
    faithContext: params.faithContext,
    status: params.outputs.length ? 'READY' : 'DRAFTING',
    outputs: params.outputs,
    createdAt: now,
    updatedAt: now,
  };
}

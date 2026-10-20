// elevateLiveBriefing — Plajah Elevate, supercharged.
//
// What this adds on top of the existing Ministry Content Synergy Engine
// (services/ministryRepurpose.ts, Phase 1: transcript -> ONE article draft):
//
//   1. SCHEDULED / AUTO runs — an org turns the feature ON per source (a live
//      stream OR one of its Live Hub FAST TV channels, incl. a scheduled-live
//      slot). When the window ends, the run fires by itself: resolve the
//      stream archive, transcribe, generate. No one has to press "repurpose".
//   2. STORY INTELLIGENCE pass — highlights, scripture index, biblical-figure
//      callouts, announcements/save-the-dates, all anchored to timecodes.
//      NOTE: there is no `services/story/*` "Story Intelligence" module and no
//      art-council service in this repo (verified 2026-10-20 on master) — this
//      module IS that layer, built on the repo's real editorial core (ARIA /
//      callGemini) + photoCritique-style structured review axes for stills.
//   3. SERVICE BRIEFING — a study-tool document, not just a summary: key
//      points with timestamped verbatim quotes, every scripture referenced
//      (listed + highlighted), what was said about each biblical figure and
//      how it tied to the teaching, and an Announcements & Reminders section
//      parsed out of the service.
//   4. GORGEOUS ARTICLE — Article blocks for the real magazine renderer
//      (components/ArticleView.tsx): Mux frame stills at quote timecodes,
//      speaker CUTOUT stills (MediaPipe selfie matte, the LiveComposer
//      segmenter) with ArticleBlock layout LEFT/RIGHT so text wraps the
//      cutout, and VIDEO callout blocks for the highlight clips.
//      ("Tela document engine": no engine by that name exists in the repo —
//      Article + ArticleView IS the document engine; blocks use its real
//      TEXT/IMAGE/VIDEO/QUOTE/HEADING types and float-wrap layouts.)
//   5. AUTO CLIPS -> REELO — top highlights become clips via the real
//      services/liveClipService.ts (createClip + publishClipAsShort).
//   6. COST LEDGER on every run + a LOCAL-MODEL comparison harness, so after
//      a test run we can say what the cloud run cost and whether local
//      models (faster-whisper + a local LLM) match it. Default execution is
//      CLOUD / SERVER-SIDE: transcription already goes through the server
//      route /api/ai/captions; the scheduler pattern is the repo's cron
//      endpoint / in-process worker (see elevateLiveWorker.ts). Local is an
//      evaluation path only, never the default.
//
// Spec: docs/MINISTRY_CONTENT_SYNERGY_BLUEPRINT.md (this closes Phases 2+4
// for the LIVE/TV case and adds scheduling, briefing, clips and costing).

import { callGemini } from './geminiService';
import {
  transcribeAudioUrl,
  generateArticleDraft,
  buildRepurposeJob,
  type StreamTranscript,
  type TranscriptSegment,
} from './ministryRepurpose';
import { createClip, publishClipAsShort, normalizeRange, formatClock } from './liveClipService';
import type { Organization, StreamArchive } from '../types';

// ─── Config & scheduling types ────────────────────────────────────────────────

export type ElevateLiveSourceKind = 'LIVE_STREAM' | 'FAST_CHANNEL';
export type ElevateRunStatus =
  | 'SCHEDULED'      // window in the future
  | 'MONITORING'     // window open; stream expected/live
  | 'PROCESSING'     // window ended; pipeline running
  | 'READY'          // briefing + article + clips generated as drafts
  | 'ERROR';

/** Per-org feature toggle. One doc per org: elevateLiveConfigs/{orgId}. */
/** Shown on every auto-published briefing, in the feed post and the document. */
export const AI_DRAFT_NOTICE = 'AI-generated draft — created automatically from the live service. The author may revise this briefing later.';

export interface ElevateLiveConfig {
  orgId: string;
  orgName: string;
  enabled: boolean;
  /** Briefings auto-publish to the Elevate members feed + the public Plajah
   *  social feed as a document post (with the AI-draft caveat) as soon as a
   *  run finishes. Default ON — revision happens after, by role-holders. */
  autoPublishBriefing?: boolean;
  /** Which sources auto-run. FAST_CHANNEL = the org's Live Hub TV channel. */
  sources: Array<{
    kind: ElevateLiveSourceKind;
    /** For FAST_CHANNEL: which channel — FastChannel.id === ownerId, and the
     *  channel's scheduled-live slot is resolved from its schedule. Ordinal is
     *  the human label ("2nd channel") used until the owner id is bound. */
    channelOwnerId?: string;
    channelOrdinal?: number;
    /** Only auto-run slots/streams whose title matches (optional). */
    titleIncludes?: string;
  }>;
  outputs: { article: boolean; briefing: boolean; clips: boolean; bookChapter: boolean };
  faithContext: boolean;
  updatedAt: number;
}

/** One scheduled occurrence. Collection: elevateLiveRuns/{id}. */
export interface ElevateLiveRun {
  id: string;
  orgId: string;            // '' until resolved by orgName (see requiresOrgResolution)
  orgName: string;
  requiresOrgResolution?: boolean;
  sourceKind: ElevateLiveSourceKind;
  channelOrdinal?: number;
  channelOwnerId?: string;
  windowStart: number;       // epoch ms — stream/slot start
  windowEnd: number;         // epoch ms — pipeline fires at/after this (+archive buffer)
  timezone: string;          // e.g. 'America/New_York'
  status: ElevateRunStatus;
  archiveId?: string;        // stream_archives/{id} once resolved
  createdAt: number;
  processedAt?: number;
  briefingId?: string;
  jobId?: string;
  error?: string;
}

// ─── Story-intelligence output types ──────────────────────────────────────────

export interface HighlightMoment {
  title: string;
  /** Verbatim quote from the transcript — the poignant point. */
  quote: string;
  /** Seconds from stream start. */
  timecode: number;
  /** Suggested clip window (clamped to liveClipService limits downstream). */
  clipStartSec: number;
  clipEndSec: number;
  whyItMatters: string;
}

export interface ScriptureEntry {
  reference: string;         // e.g. "Psalm 16:1"
  verseText?: string;
  /** What the speaker taught from it, in one line. */
  teachingPoint: string;
  timecode: number;
  quote: string;             // verbatim line where it was referenced
}

export interface BiblicalFigureCallout {
  name: string;              // e.g. "David", "Esther", "Paul"
  /** What was said about them in THIS service. */
  whatWasSaid: string;
  /** How the speaker related them to the teaching's main thread. */
  relationToTeaching: string;
  timecode: number;
  quote: string;
}

export interface AnnouncementItem {
  title: string;
  /** Parsed date/time text as spoken ("Saturday, November 2 at 10am"). */
  whenText?: string;
  details: string;
  isSaveTheDate: boolean;
  timecode: number;
}

export interface CutoutStillSpec {
  timecode: number;
  /** Mux frame still the cutout is taken from. */
  frameUrl: string;
  /** 'CUTOUT' = speaker segmented from the frame (MediaPipe selfie matte via
   *  liveComposer's ImageSegmenter) so article text wraps the person;
   *  'FRAME' = plain screenshot. Cutout PNGs are produced in the review UI /
   *  server matte step; the spec travels with the draft so layout is decided
   *  at generation time. */
  kind: 'CUTOUT' | 'FRAME';
  /** ArticleBlock float layout — alternates so text wraps left/right. */
  layout: 'LEFT' | 'RIGHT';
  caption: string;
  quote: string;
}

export interface ServiceBriefing {
  id: string;
  runId: string;
  orgId: string;
  orgName: string;
  title: string;
  serviceDate: number;
  sourceTitle?: string;
  /** The generated Article draft (also lands in Sermon Studio's library). */
  articleId?: string;
  /** The feed post the briefing auto-published as (posts + feed dual write). */
  postId?: string;
  /** Briefings auto-publish as AI drafts — always true for generated ones. */
  aiDraft?: boolean;
  summary: string;
  keyPoints: Array<{ point: string; quote: string; timecode: number }>;
  highlights: HighlightMoment[];
  scriptureIndex: ScriptureEntry[];
  biblicalFigures: BiblicalFigureCallout[];
  announcements: AnnouncementItem[];
  stills: CutoutStillSpec[];
  clipIds: string[];
  clipVideoIds: string[];
  transcript: StreamTranscript;
  cost: RunCostLedger;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
  createdAt: number;
}

// ─── Cost ledger ──────────────────────────────────────────────────────────────
// ESTIMATES — list prices as of Oct 2026, kept as constants so finance can
// correct them in one place. They are NOT read from the providers at runtime.

export const ELEVATE_PRICING = {
  asOf: '2026-10',
  geminiFlashInputPerMTokUsd: 0.30,
  geminiFlashAudioInputPerMTokUsd: 1.00,
  geminiFlashOutputPerMTokUsd: 2.50,
  /** Gemini bills audio at ~32 tokens per second of audio. */
  geminiAudioTokensPerSec: 32,
  /** Mux: the archive/stream itself is a pre-existing platform cost of going
   *  live; virtual clips add no encode. Kept as an explicit $0 line so the
   *  ledger is complete rather than silently omitting media. */
  muxMarginalPerRunUsd: 0,
  firestorePerRunUsd: 0.001,
};

export interface CostLineItem {
  stage: string;
  detail: string;
  inputTokens?: number;
  outputTokens?: number;
  usd: number;
}
export interface RunCostLedger {
  currency: 'USD';
  estimated: true;
  lineItems: CostLineItem[];
  totalUsd: number;
  audioSeconds: number;
  transcriptChars: number;
  modelCalls: number;
}

export const estimateTokens = (text: string): number => Math.max(1, Math.ceil((text || '').length / 4));

function llmCost(stage: string, detail: string, inputText: string, outputText: string): CostLineItem {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  return {
    stage, detail, inputTokens, outputTokens,
    usd: (inputTokens * ELEVATE_PRICING.geminiFlashInputPerMTokUsd
        + outputTokens * ELEVATE_PRICING.geminiFlashOutputPerMTokUsd) / 1_000_000,
  };
}

// ─── Story-intelligence extraction (map) + synthesis (reduce) ─────────────────

const stripFence = (s: string): string => s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
const parseJson = (raw: string | null): any | null => {
  if (!raw) return null;
  try { const j = JSON.parse(stripFence(String(raw))); return j && typeof j === 'object' ? j : null; } catch { return null; }
};

const fmtSegs = (segs: TranscriptSegment[]): string =>
  segs.map(s => `[${formatClock(s.time)}] ${s.text}`).join('\n');

/** Split segments into ~15-minute chunks so a 65-minute service never hits a
 *  single-prompt ceiling (the Phase-1 article prompt caps at 24k chars). */
export function chunkSegments(segments: TranscriptSegment[], chunkSec = 900): TranscriptSegment[][] {
  if (!segments.length) return [];
  const chunks: TranscriptSegment[][] = [];
  let cur: TranscriptSegment[] = [];
  let start = segments[0].time;
  for (const s of segments) {
    if (s.time - start >= chunkSec && cur.length) { chunks.push(cur); cur = []; start = s.time; }
    cur.push(s);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

interface ChunkIntel {
  highlights: HighlightMoment[];
  scripture: ScriptureEntry[];
  figures: BiblicalFigureCallout[];
  announcements: AnnouncementItem[];
  keyPoints: ServiceBriefing['keyPoints'];
}

const EXTRACTION_SHAPE = `{
  "highlights": [{ "title": string, "quote": string, "timecode": number, "whyItMatters": string }],
  "scripture": [{ "reference": string, "verseText": string, "teachingPoint": string, "timecode": number, "quote": string }],
  "figures": [{ "name": string, "whatWasSaid": string, "relationToTeaching": string, "timecode": number, "quote": string }],
  "announcements": [{ "title": string, "whenText": string, "details": string, "isSaveTheDate": boolean, "timecode": number }],
  "keyPoints": [{ "point": string, "quote": string, "timecode": number }]
}`;

async function extractChunkIntel(segs: TranscriptSegment[], orgName: string, cost: CostLineItem[]): Promise<ChunkIntel> {
  const empty: ChunkIntel = { highlights: [], scripture: [], figures: [], announcements: [], keyPoints: [] };
  const body = fmtSegs(segs);
  const prompt =
    `You are Plajah's Story Intelligence for ${orgName}. Analyse this timecoded slice of a church service transcript.\n` +
    `Respond with JSON ONLY, exactly this shape:\n${EXTRACTION_SHAPE}\n\nRules:\n` +
    `- Ground EVERYTHING in the transcript. Quotes must be VERBATIM from it; timecode = the [m:ss] of that quote, in seconds.\n` +
    `- highlights: the 2-3 most poignant, shareable moments in this slice. Quote length 1-3 sentences.\n` +
    `- scripture: EVERY Bible reference mentioned or quoted, with the teaching point the speaker drew from it.\n` +
    `- figures: EVERY biblical character/person mentioned. Say what was said about them HERE and how the speaker tied them to the teaching. Do not import outside knowledge about the figure beyond what was said.\n` +
    `- announcements: any event, save-the-date, reminder, registration, or "join us" item, with its date/time exactly as spoken.\n` +
    `- keyPoints: the main teaching points in this slice.\n\nTRANSCRIPT SLICE:\n${body.slice(0, 20000)}`;
  const raw = await callGemini(prompt, { responseMimeType: 'application/json' }, 'gemini-flash-latest');
  cost.push(llmCost('story-intel', `extraction ${formatClock(segs[0]?.time || 0)}`, prompt, String(raw || '')));
  const j = parseJson(raw as string);
  if (!j) return empty;
  const num = (v: any, fb = 0) => (typeof v === 'number' && isFinite(v) ? v : fb);
  return {
    highlights: (j.highlights || []).map((h: any) => ({
      title: String(h.title || 'Highlight'), quote: String(h.quote || ''),
      timecode: num(h.timecode), whyItMatters: String(h.whyItMatters || ''),
      clipStartSec: Math.max(0, num(h.timecode) - 8), clipEndSec: num(h.timecode) + 37,
    })),
    scripture: (j.scripture || []).map((s: any) => ({
      reference: String(s.reference || ''), verseText: s.verseText ? String(s.verseText) : undefined,
      teachingPoint: String(s.teachingPoint || ''), timecode: num(s.timecode), quote: String(s.quote || ''),
    })).filter((s: ScriptureEntry) => s.reference),
    figures: (j.figures || []).map((f: any) => ({
      name: String(f.name || ''), whatWasSaid: String(f.whatWasSaid || ''),
      relationToTeaching: String(f.relationToTeaching || ''), timecode: num(f.timecode), quote: String(f.quote || ''),
    })).filter((f: BiblicalFigureCallout) => f.name),
    announcements: (j.announcements || []).map((a: any) => ({
      title: String(a.title || 'Announcement'), whenText: a.whenText ? String(a.whenText) : undefined,
      details: String(a.details || ''), isSaveTheDate: !!a.isSaveTheDate, timecode: num(a.timecode),
    })),
    keyPoints: (j.keyPoints || []).map((k: any) => ({
      point: String(k.point || ''), quote: String(k.quote || ''), timecode: num(k.timecode),
    })).filter((k: any) => k.point),
  };
}

/** Merge chunk intel; dedupe scripture by reference and figures by name. */
function mergeIntel(chunks: ChunkIntel[]): ChunkIntel {
  const all = (k: keyof ChunkIntel) => chunks.flatMap(c => (c[k] as any[]));
  const scripture = new Map<string, ScriptureEntry>();
  for (const s of all('scripture') as ScriptureEntry[]) if (!scripture.has(s.reference.toLowerCase())) scripture.set(s.reference.toLowerCase(), s);
  const figures = new Map<string, BiblicalFigureCallout>();
  for (const f of all('figures') as BiblicalFigureCallout[]) if (!figures.has(f.name.toLowerCase())) figures.set(f.name.toLowerCase(), f);
  return {
    highlights: (all('highlights') as HighlightMoment[]).sort((a, b) => a.timecode - b.timecode),
    scripture: [...scripture.values()].sort((a, b) => a.timecode - b.timecode),
    figures: [...figures.values()],
    announcements: (all('announcements') as AnnouncementItem[]).sort((a, b) => a.timecode - b.timecode),
    keyPoints: all('keyPoints') as ServiceBriefing['keyPoints'],
  };
}

// ─── Mux stills + cutout specs ────────────────────────────────────────────────

export const muxFrameUrl = (playbackId: string, sec: number, w = 1280): string =>
  `https://image.mux.com/${playbackId}/thumbnail.png?width=${w}&time=${Math.max(0, Math.floor(sec))}`;

/** Pick stills: one per highlight + one per key scripture moment, alternating
 *  CUTOUT/FRAME and LEFT/RIGHT so the article wraps text around the speaker. */
export function buildStills(intel: ChunkIntel, playbackId?: string): CutoutStillSpec[] {
  if (!playbackId) return [];
  const moments = [
    ...intel.highlights.map(h => ({ timecode: h.timecode, quote: h.quote, caption: h.title })),
    ...intel.scripture.slice(0, 3).map(s => ({ timecode: s.timecode, quote: s.quote, caption: s.reference })),
  ].sort((a, b) => a.timecode - b.timecode).slice(0, 8);
  return moments.map((m, i) => ({
    timecode: m.timecode,
    frameUrl: muxFrameUrl(playbackId, m.timecode),
    kind: i % 2 === 0 ? 'CUTOUT' : 'FRAME',
    layout: i % 2 === 0 ? 'LEFT' : 'RIGHT',
    caption: m.caption,
    quote: m.quote,
  }));
}

// ─── Article blocks (the repo's real document engine: Article/ArticleView) ────

export interface ElevateArticleBlock {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'QUOTE' | 'HEADING';
  content: string;
  layout?: 'FULL' | 'LEFT' | 'RIGHT' | 'CENTER';
  caption?: string;
}

/** Compose the gorgeous article: editorial sections interleaved with the
 *  cutout stills (float LEFT/RIGHT = text wrap), timestamped quote callouts,
 *  clip callouts, a highlighted scripture index, figure callouts, and the
 *  announcements section — the study-tool layer inside the article itself. */
export function buildArticleBlocks(params: {
  orgName: string;
  articleTitle: string;
  dek?: string;
  sections: Array<{ heading: string; body: string }>;
  intel: ChunkIntel;
  stills: CutoutStillSpec[];
  clips: Array<{ highlight: HighlightMoment; videoId?: string; playbackId?: string }>;
}): ElevateArticleBlock[] {
  const blocks: ElevateArticleBlock[] = [];
  let n = 0; const id = () => `b${++n}`;
  if (params.dek) blocks.push({ id: id(), type: 'HEADING', content: params.dek });
  let stillIdx = 0;
  params.sections.forEach((sec, i) => {
    if (sec.heading) blocks.push({ id: id(), type: 'HEADING', content: sec.heading });
    const still = params.stills[stillIdx];
    if (still && i % 2 === 0) {
      blocks.push({ id: id(), type: 'IMAGE', content: still.frameUrl, layout: still.layout, caption: `${still.caption} · ${formatClock(still.timecode)}${still.kind === 'CUTOUT' ? ' · speaker cutout' : ''}` });
      stillIdx++;
    }
    blocks.push({ id: id(), type: 'TEXT', content: sec.body });
    const clip = params.clips[i];
    if (clip?.playbackId) {
      blocks.push({ id: id(), type: 'VIDEO', content: `https://stream.mux.com/${clip.playbackId}.m3u8`, layout: 'FULL', caption: `▶ ${clip.highlight.title} — ${formatClock(clip.highlight.timecode)} · “${clip.highlight.quote}”` });
    } else if (params.intel.highlights[i]) {
      const h = params.intel.highlights[i];
      blocks.push({ id: id(), type: 'QUOTE', content: h.quote, caption: `${formatClock(h.timecode)} — ${h.title}` });
    }
  });
  if (params.intel.scripture.length) {
    blocks.push({ id: id(), type: 'HEADING', content: 'Scripture in this service' });
    for (const s of params.intel.scripture) {
      blocks.push({ id: id(), type: 'QUOTE', content: s.verseText || s.quote, caption: `✦ ${s.reference} · ${formatClock(s.timecode)} — ${s.teachingPoint}` });
    }
  }
  if (params.intel.figures.length) {
    blocks.push({ id: id(), type: 'HEADING', content: 'People of the Bible in this teaching' });
    for (const f of params.intel.figures) {
      blocks.push({ id: id(), type: 'TEXT', content: `**${f.name}** — ${f.whatWasSaid} ${f.relationToTeaching}`, caption: formatClock(f.timecode) });
    }
  }
  if (params.intel.announcements.length) {
    blocks.push({ id: id(), type: 'HEADING', content: 'Announcements & reminders' });
    for (const a of params.intel.announcements) {
      blocks.push({ id: id(), type: 'TEXT', content: `${a.isSaveTheDate ? '📅 Save the date: ' : ''}**${a.title}**${a.whenText ? ` — ${a.whenText}` : ''}. ${a.details}` });
    }
  }
  return blocks;
}

/** The briefing as a study document (markdown body for the briefing doc +
 *  any plain-text repurposing the org chooses later). */
export function briefingToMarkdown(b: ServiceBriefing): string {
  const lines: string[] = [
    `# ${b.title}`, ``, `> ${AI_DRAFT_NOTICE}`, ``, `**${b.orgName}** · ${new Date(b.serviceDate).toLocaleString()}`, ``, b.summary, ``,
    `## Key points`,
    ...b.keyPoints.map(k => `- ${k.point} — “${k.quote}” (${formatClock(k.timecode)})`),
    ``, `## Scripture index`,
    ...b.scriptureIndex.map(s => `- **${s.reference}** (${formatClock(s.timecode)}): ${s.teachingPoint}`),
    ``, `## Biblical figures`,
    ...b.biblicalFigures.map(f => `- **${f.name}** (${formatClock(f.timecode)}): ${f.whatWasSaid} → ${f.relationToTeaching}`),
    ``, `## Announcements & reminders`,
    ...b.announcements.map(a => `- ${a.isSaveTheDate ? '📅 ' : ''}**${a.title}**${a.whenText ? ` — ${a.whenText}` : ''}: ${a.details}`),
    ``, `## Highlight clips`,
    ...b.highlights.map(h => `- **${h.title}** (${formatClock(h.timecode)}): “${h.quote}”`),
    ``, `_Estimated generation cost: $${b.cost.totalUsd.toFixed(3)} (see cost ledger)._`,
  ];
  return lines.join('\n');
}

// ─── The pipeline ─────────────────────────────────────────────────────────────

export interface RunPipelineInput {
  run: ElevateLiveRun;
  org: Organization;
  /** From ElevateLiveConfig.autoPublishBriefing; undefined = auto-publish. */
  autoPublishBriefing?: boolean;
  /** Resolved after the stream ends: backendService.saveStreamArchive()'s doc. */
  archive: StreamArchive;
  /** Stream audio/video URL the captions route can fetch (Mux playback). */
  mediaUrl: string;
  outputs: ElevateLiveConfig['outputs'];
}

export interface RunPipelineResult {
  briefing: ServiceBriefing;
  articleId: string | null;
  jobId: string;
}

/**
 * End-to-end, server-side by default (invoked by the cron endpoint / worker
 * in elevateLiveWorker.ts; the same function is callable from the Elevate
 * Content Studio for a manual "run now"). All drafts land as DRAFT — the org
 * reviews, then chooses how to repurpose (publish article, book chapter via
 * sermonService.compileSermonsIntoBook, podcast, social) from the drafts.
 */
export async function runElevateLivePipeline(
  input: RunPipelineInput,
  save: {
    saveBriefing: (b: ServiceBriefing) => Promise<void>;
    saveArticle: (org: Organization, title: string, blocks: ElevateArticleBlock[], tags: string[]) => Promise<string | null>;
    saveJob: (job: ReturnType<typeof buildRepurposeJob>) => Promise<void>;
    /** Auto-publish the briefing as a feed document post. Returns post id. */
    publishBriefing?: (org: Organization, b: ServiceBriefing, blocks: ElevateArticleBlock[]) => Promise<string | null>;
  },
): Promise<RunPipelineResult> {
  const costItems: CostLineItem[] = [];
  const playbackId = (input.archive as any).muxPlaybackId as string | undefined;

  // 1. Transcribe (server route /api/ai/captions under the hood).
  const transcript = await transcribeAudioUrl(input.mediaUrl, input.archive.title || '', input.org.name);
  const audioSeconds = (input.archive as any).durationMs ? (input.archive as any).durationMs / 1000 : transcript.segments.at(-1)?.time || 0;
  costItems.push({
    stage: 'transcription', detail: '/api/ai/captions (Gemini audio)',
    inputTokens: Math.round(audioSeconds * ELEVATE_PRICING.geminiAudioTokensPerSec),
    usd: (audioSeconds * ELEVATE_PRICING.geminiAudioTokensPerSec * ELEVATE_PRICING.geminiFlashAudioInputPerMTokUsd) / 1_000_000,
  });
  if (!transcript.text || transcript.text.length < 40) throw new Error('transcription-empty');

  // 2. Story-intelligence pass (chunked map -> merge).
  const chunks = chunkSegments(transcript.segments.length ? transcript.segments : [{ time: 0, text: transcript.text }]);
  const perChunk: ChunkIntel[] = [];
  for (const c of chunks) perChunk.push(await extractChunkIntel(c, input.org.name, costItems));
  const intel = mergeIntel(perChunk);

  // 3. Article draft (existing ARIA core) + briefing synthesis.
  const articleDraft = input.outputs.article
    ? await generateArticleDraft({ orgName: input.org.name, transcript: transcript.text, sourceTitle: input.archive.title, faithContext: true })
    : null;
  if (articleDraft) costItems.push(llmCost('article', 'ministryRepurpose.generateArticleDraft', transcript.text.slice(0, 24000), JSON.stringify(articleDraft).slice(0, 8000)));

  const synthPrompt =
    `You are Plajah's Story Intelligence. From these extracted facts about a service by ${input.org.name}, ` +
    `write JSON ONLY: { "title": string, "summary": string } — a briefing title and a 3-4 sentence summary ` +
    `of the teaching for a study briefing. Ground it only in the facts.\nFACTS:\n` +
    JSON.stringify({ keyPoints: intel.keyPoints.slice(0, 10), scripture: intel.scripture.map(s => s.reference), figures: intel.figures.map(f => f.name) }).slice(0, 12000);
  const synthRaw = await callGemini(synthPrompt, { responseMimeType: 'application/json' }, 'gemini-flash-latest');
  costItems.push(llmCost('briefing', 'synthesis', synthPrompt, String(synthRaw || '')));
  const synth = parseJson(synthRaw as string) || {};

  // 4. Highlights -> Reelo clips (virtual clips; honest encodeStatus upstream).
  const clipIds: string[] = []; const clipVideoIds: string[] = [];
  const clipBlocks: Array<{ highlight: HighlightMoment; videoId?: string; playbackId?: string }> = [];
  if (input.outputs.clips) {
    for (const h of intel.highlights.slice(0, 5)) {
      const range = normalizeRange(h.clipStartSec, h.clipEndSec, audioSeconds || undefined);
      const clip = await createClip({ archive: input.archive, startSec: range.startSec, endSec: range.endSec, title: h.title });
      if (clip) {
        clipIds.push(clip.id);
        const videoId = await publishClipAsShort(clip);
        if (videoId) clipVideoIds.push(videoId);
        clipBlocks.push({ highlight: h, videoId: videoId || undefined, playbackId });
      }
    }
  }

  // 5. Stills / cutouts + article blocks + briefing doc.
  const stills = buildStills(intel, playbackId);
  const title = String(synth.title || articleDraft?.title || input.archive.title || 'Service briefing');
  const briefing: ServiceBriefing = {
    id: `briefing_${Date.now()}`,
    runId: input.run.id,
    orgId: input.org.id,
    orgName: input.org.name,
    title,
    serviceDate: input.run.windowStart,
    sourceTitle: input.archive.title,
    summary: String(synth.summary || articleDraft?.dek || ''),
    keyPoints: intel.keyPoints,
    highlights: intel.highlights,
    scriptureIndex: intel.scripture,
    biblicalFigures: intel.figures,
    announcements: intel.announcements,
    stills,
    clipIds, clipVideoIds,
    transcript,
    cost: {
      currency: 'USD', estimated: true, lineItems: [...costItems, { stage: 'media+firestore', detail: 'Mux marginal $0 (virtual clips) + Firestore writes', usd: ELEVATE_PRICING.muxMarginalPerRunUsd + ELEVATE_PRICING.firestorePerRunUsd }],
      totalUsd: 0, audioSeconds, transcriptChars: transcript.text.length, modelCalls: costItems.length,
    },
    status: 'DRAFT',
    createdAt: Date.now(),
  };
  briefing.cost.totalUsd = briefing.cost.lineItems.reduce((a, c) => a + c.usd, 0);

  const blocks = buildArticleBlocks({
    orgName: input.org.name,
    articleTitle: title,
    dek: articleDraft?.dek,
    sections: (articleDraft as any)?.sections || [{ heading: 'The message', body: briefing.summary }],
    intel, stills, clips: clipBlocks,
  });
  const articleId = input.outputs.article
    ? await save.saveArticle(input.org, title, blocks, ['sermon', 'elevate-live', `church:${input.org.id}`])
    : null;
  briefing.articleId = articleId || undefined;
  briefing.aiDraft = true;

  // 6. Record the repurpose job so the org can repurpose further from drafts.
  const job = buildRepurposeJob({
    orgId: input.org.id, createdBy: 'elevate-live', sourceType: 'LIVE',
    sourceId: input.archive.id || input.run.id, sourceTitle: input.archive.title, faithContext: true,
    outputs: articleDraft ? [articleDraft] : [],
  });
  await save.saveJob(job);

  // 7. AUTO-PUBLISH the briefing (unless the org turned auto-publish off):
  // a feed post that carries the whole document inline — members feed (org
  // identity) + public social feed, one createPost dual write. It goes out
  // as an AI DRAFT with the caveat attached; org role-holders can revise the
  // document afterwards, the public experience is read-only.
  if (input.outputs.briefing && save.publishBriefing && input.autoPublishBriefing !== false) {
    try {
      const postId = await save.publishBriefing(input.org, briefing, blocks);
      if (postId) {
        briefing.postId = postId;
        briefing.status = 'PUBLISHED';
      }
    } catch { /* briefing still saves as a draft below */ }
  }
  if (input.outputs.briefing) await save.saveBriefing(briefing);

  return { briefing, articleId, jobId: job.id };
}

// ─── Local-model comparison (evaluation only — cloud stays the default) ─────

export const LOCAL_STACK = {
  asr: 'faster-whisper large-v3 (self-hosted GPU)',
  llm: 'Qwen 2.5 32B Instruct via Ollama/vLLM (self-hosted GPU)',
  matte: 'MediaPipe selfie segmenter (already in services/liveComposer.ts)',
} as const;

/** Rough local running cost: GPU wall-clock energy only. Hardware
 *  amortisation + ops time are real but excluded — stated, not hidden. */
export function estimateLocalCostUsd(audioSeconds: number, gpuWatts = 350, kwhUsd = 0.16): { kwh: number; usd: number; gpuMinutes: number } {
  const asrMin = (audioSeconds / 60) * 0.15;        // large-v3 ≈ 6-7x realtime
  const llmMin = 12;                                 // chunked extraction + synthesis, mid-size local model
  const gpuMinutes = asrMin + llmMin;
  const kwh = (gpuMinutes / 60) * (gpuWatts / 1000);
  return { kwh, usd: kwh * kwhUsd, gpuMinutes };
}

export interface LocalEvalScores {
  quoteFidelity: number;      // % of local highlights whose quote is verbatim in the transcript
  scriptureRecall: number;    // vs the cloud run's scripture index (0..1)
  figureRecall: number;
  announcementRecall: number;
  highlightOverlap: number;   // highlights landing within 15s of a cloud highlight (0..1)
  verdict: 'MATCHES_CLOUD' | 'CLOSE' | 'BEHIND';
}

/** Score a local run's intel against the cloud run's, on the same transcript. */
export function scoreLocalVsCloud(local: ChunkIntel, cloud: ChunkIntel, transcriptText: string): LocalEvalScores {
  const t = transcriptText.toLowerCase();
  const verbatim = local.highlights.filter(h => h.quote && t.includes(h.quote.slice(0, 40).toLowerCase())).length;
  const recall = (mine: string[], theirs: string[]) => {
    if (!theirs.length) return 1;
    const m = new Set(mine.map(s => s.toLowerCase()));
    return theirs.filter(x => m.has(x.toLowerCase())).length / theirs.length;
  };
  const overlap = local.highlights.length && cloud.highlights.length
    ? local.highlights.filter(h => cloud.highlights.some(c => Math.abs(c.timecode - h.timecode) <= 15)).length / Math.max(local.highlights.length, 1)
    : 0;
  const scores: LocalEvalScores = {
    quoteFidelity: local.highlights.length ? verbatim / local.highlights.length : 0,
    scriptureRecall: recall(local.scripture.map(s => s.reference), cloud.scripture.map(s => s.reference)),
    figureRecall: recall(local.figures.map(f => f.name), cloud.figures.map(f => f.name)),
    announcementRecall: recall(local.announcements.map(a => a.title), cloud.announcements.map(a => a.title)),
    highlightOverlap: overlap,
    verdict: 'BEHIND',
  };
  const avg = (scores.quoteFidelity + scores.scriptureRecall + scores.figureRecall + scores.announcementRecall + scores.highlightOverlap) / 5;
  scores.verdict = avg >= 0.85 ? 'MATCHES_CLOUD' : avg >= 0.6 ? 'CLOSE' : 'BEHIND';
  return scores;
}

/**
 * Run the SAME extraction prompt against a local LLM (Ollama-compatible) for
 * one chunk — the eval harness used after a cloud test run. Returns null when
 * no local endpoint is configured; never used by the default pipeline.
 */
export async function extractChunkIntelLocal(segs: TranscriptSegment[], orgName: string, ollamaUrl = 'http://127.0.0.1:11434', model = 'qwen2.5:32b'): Promise<ChunkIntel | null> {
  try {
    const prompt = `You are Plajah's Story Intelligence for ${orgName}. Analyse this timecoded transcript slice. Respond with JSON ONLY in this shape:\n${EXTRACTION_SHAPE}\nQuotes VERBATIM; timecode in seconds.\n\n${fmtSegs(segs).slice(0, 20000)}`;
    const res = await fetch(`${ollamaUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, format: 'json', stream: false }) });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const j = parseJson(data?.response || null);
    if (!j) return null;
    // Reuse the cloud parser shape by normalising through the same mapping.
    const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0);
    return {
      highlights: (j.highlights || []).map((h: any) => ({ title: String(h.title || ''), quote: String(h.quote || ''), timecode: num(h.timecode), whyItMatters: String(h.whyItMatters || ''), clipStartSec: Math.max(0, num(h.timecode) - 8), clipEndSec: num(h.timecode) + 37 })),
      scripture: (j.scripture || []).map((s: any) => ({ reference: String(s.reference || ''), verseText: s.verseText ? String(s.verseText) : undefined, teachingPoint: String(s.teachingPoint || ''), timecode: num(s.timecode), quote: String(s.quote || '') })).filter((s: ScriptureEntry) => s.reference),
      figures: (j.figures || []).map((f: any) => ({ name: String(f.name || ''), whatWasSaid: String(f.whatWasSaid || ''), relationToTeaching: String(f.relationToTeaching || ''), timecode: num(f.timecode), quote: String(f.quote || '') })).filter((f: BiblicalFigureCallout) => f.name),
      announcements: (j.announcements || []).map((a: any) => ({ title: String(a.title || ''), whenText: a.whenText ? String(a.whenText) : undefined, details: String(a.details || ''), isSaveTheDate: !!a.isSaveTheDate, timecode: num(a.timecode) })),
      keyPoints: (j.keyPoints || []).map((k: any) => ({ point: String(k.point || ''), quote: String(k.quote || ''), timecode: num(k.timecode) })).filter((k: any) => k.point),
    };
  } catch { return null; }
}

export { formatClock };

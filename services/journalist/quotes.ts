// Interview transcript -> quote extraction. Pure functions.
// Every quote carries startSec/endSec back into the recording and a source link, so an editor can
// click a quote in the story and hear the original. Off-the-record material is extracted as BLOCKED
// and cannot be exported to the story.

import type { ExtractedQuote, InterviewTranscriptSegment, SourceAttribution } from './types';

export const formatTimestamp = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

const CUES = /\b(?:I think|I believe|we(?:'re| are| will| have| had)|I(?:'m| am| was| will| have| had)|never|always|because|the (?:problem|truth|reality|fact)|honestly|frankly|nobody|everyone|should|must|won'?t|can'?t)\b/i;
const FILLER = /^(?:um+|uh+|yeah|okay|ok|right|so|well|mm+|hmm+)[,. ]*$/i;

export interface ExtractOptions {
  minChars?: number; maxChars?: number; max?: number;
  sourceId?: string; interviewId?: string; defaultAttribution?: SourceAttribution;
  /** Map speaker label -> attribution (a speaker marked off-record yields blocked quotes). */
  speakerAttribution?: Record<string, SourceAttribution>;
}

/** Pick quotable passages: complete, opinionated, not filler. Suggestions; the reporter chooses. */
export function extractQuotes(segments: ReadonlyArray<InterviewTranscriptSegment>, opts: ExtractOptions = {}): ExtractedQuote[] {
  const minC = opts.minChars ?? 40; const maxC = opts.maxChars ?? 320; const max = opts.max ?? 12;
  const scored: Array<{ q: ExtractedQuote; score: number }> = [];
  segments.forEach((seg, i) => {
    const text = seg.text.replace(/\s+/g, ' ').trim();
    if (text.length < minC || FILLER.test(text)) return;
    let score = 0;
    if (CUES.test(text)) score += 3;
    if (/[.!?]["']?$/.test(text)) score += 1;
    if (text.length >= 80 && text.length <= 220) score += 2;
    if (/\d/.test(text)) score += 1;
    if (/\?$/.test(text)) score -= 3;                      // questions are the reporter's, not a quote
    if (text.length > maxC) score -= 1;
    if (score < 2) return;
    const attribution = (seg.speaker && opts.speakerAttribution?.[seg.speaker]) || opts.defaultAttribution || 'ON_RECORD';
    scored.push({
      score,
      q: { id: `q_${i}_${Math.floor(seg.start * 1000)}`, text: text.length > maxC ? `${text.slice(0, maxC).replace(/\s+\S*$/, '')}...` : text, speaker: seg.speaker, startSec: seg.start, endSec: seg.end, sourceId: opts.sourceId, interviewId: opts.interviewId, attribution },
    });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map(x => x.q).sort((a, b) => a.startSec - b.startSec);
}

/** Quotes that may not run as direct quotes. */
export function quoteBlocked(q: ExtractedQuote): string | null {
  if (q.attribution === 'OFF_RECORD') return 'Off the record: this cannot run in the story.';
  if (q.attribution === 'DEEP_BACKGROUND') return 'Deep background: use for understanding only, no quote and no attribution.';
  return null;
}

/** How the quote must be attributed in copy. */
export function attributionLine(q: ExtractedQuote, sourceName?: string, sourceRole?: string): string {
  switch (q.attribution) {
    case 'ON_RECORD': return sourceName ? `${sourceName}${sourceRole ? `, ${sourceRole},` : ''} said` : 'the source said';
    case 'BACKGROUND': return 'a person familiar with the matter said';
    default: return '';
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Does a quote as written in the story actually appear in the transcript? Returns the best-matching
 * segment and a 0..1 word-overlap score. A score under ~0.9 means the quote was altered: flag it.
 */
export function verifyQuote(storyQuote: string, segments: ReadonlyArray<InterviewTranscriptSegment>): { best: InterviewTranscriptSegment | null; score: number; exact: boolean } {
  const q = norm(storyQuote);
  if (!q) return { best: null, score: 0, exact: false };
  const qw = q.split(' ');
  let best: InterviewTranscriptSegment | null = null; let bestScore = 0; let exact = false;
  for (let i = 0; i < segments.length; i++) {
    // allow a quote that spans two adjacent segments
    for (const span of [[i], [i, i + 1]]) {
      const segs = span.map(k => segments[k]).filter(Boolean);
      const t = norm(segs.map(s => s.text).join(' '));
      if (!t) continue;
      if (t.includes(q)) return { best: segs[0], score: 1, exact: true };
      const tw = new Set(t.split(' '));
      const hit = qw.filter(w => tw.has(w)).length / qw.length;
      if (hit > bestScore) { bestScore = hit; best = segs[0]; }
    }
  }
  return { best, score: Math.round(bestScore * 100) / 100, exact };
}

const TS = /^\s*[\[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\])]?\s*[-–]?\s*(.*)$/;

/**
 * Parse a pasted transcript. Understands "[01:23] Speaker: text", "01:23 text" and untimed lines.
 * Untimed lines get ESTIMATED times spread across `durationSec` (flagged by `estimated`).
 */
export function parseTranscript(raw: string, durationSec = 0): { segments: InterviewTranscriptSegment[]; estimated: boolean } {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: InterviewTranscriptSegment[] = [];
  let timed = 0;
  for (const line of lines) {
    const m = TS.exec(line);
    let start = -1; let rest = line;
    if (m) {
      const a = +m[1]; const b = +m[2]; const c = m[3] !== undefined ? +m[3] : null;
      start = c === null ? a * 60 + b : a * 3600 + b * 60 + c; rest = m[4]; timed++;
    }
    let speaker: string | undefined;
    const sp = /^([A-Z][\w .'-]{0,30}):\s+(.*)$/.exec(rest);
    if (sp) { speaker = sp[1].trim(); rest = sp[2]; }
    if (rest.trim()) out.push({ start, end: start, text: rest.trim(), ...(speaker ? { speaker } : {}) });
  }
  const estimated = timed < out.length;
  if (estimated) {
    const total = durationSec > 0 ? durationSec : out.length * 6;
    const step = total / Math.max(1, out.length);
    out.forEach((s, i) => { if (s.start < 0) { s.start = Math.round(i * step * 10) / 10; } });
  }
  for (let i = 0; i < out.length; i++) out[i].end = i + 1 < out.length ? Math.max(out[i].start, out[i + 1].start) : (durationSec > out[i].start ? durationSec : out[i].start + 5);
  return { segments: out, estimated };
}

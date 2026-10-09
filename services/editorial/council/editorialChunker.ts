// editorialChunker — how a 100,000-word book fits through a model: map, then reduce.
//
// MAP: split the manuscript into ~2,000-word chunks on paragraph boundaries, ask a model for a structured
// summary of each (plot/argument beats, voice notes, verbatim standout lines). REDUCE: the editors read a
// digest (chapter summaries plus the verbatim openings and standouts), not the full text, unless the piece is
// short enough to read whole. Every quote a model returns is checked against the real text before it can
// become an anchor (see locateQuote), so a model cannot invent a passage the author never wrote.
import { flatten, wordCount, type Flat } from './editorialMetrics';
import type { ManuscriptInput } from './editorialTypes';

export interface Chunk { id: string; chapterId: string; chapterTitle: string; start: number; end: number; text: string; words: number }
export interface ChunkSummary { chunkId: string; chapterTitle: string; summary: string; voice?: string; standouts: string[]; concerns: string[]; fallback?: boolean }

export const WHOLE_READ_WORDS = 7000;       // read in full below this
export const CHUNK_WORDS = 2000;
export const DIGEST_BUDGET_WORDS = 7000;     // what the editors see for a long book

export function chunkManuscript(flat: Flat, maxWords = CHUNK_WORDS): Chunk[] {
  const chunks: Chunk[] = [];
  for (const c of flat.chapters) {
    if (!c.text.trim()) continue;
    let cur = { start: c.start, text: '', words: 0 }; let pos = 0; let n = 0;
    const flush = (endPos: number) => { if (cur.text.trim()) chunks.push({ id: `${c.id}#${n++}`, chapterId: c.id, chapterTitle: c.title, start: cur.start, end: c.start + endPos, text: cur.text, words: cur.words }); };
    for (const para of c.text.split(/(\n+)/)) {
      const w = wordCount(para);
      if (cur.words + w > maxWords && cur.words > 0) { flush(pos); cur = { start: c.start + pos, text: '', words: 0 }; }
      // A single paragraph longer than the limit is split by sentence-ish boundaries.
      if (w > maxWords * 1.5) {
        const parts = para.split(/(?<=[.!?])\s+/); let buf = '';
        for (const part of parts) { if (wordCount(buf) + wordCount(part) > maxWords && buf) { cur.text += buf; cur.words += wordCount(buf); flush(pos); cur = { start: c.start + pos, text: '', words: 0 }; buf = ''; } buf += (buf ? ' ' : '') + part; }
        cur.text += buf; cur.words += wordCount(buf);
      } else { cur.text += para; cur.words += w; }
      pos += para.length;
    }
    flush(c.text.length);
  }
  return chunks;
}

export function mapSystem(): string {
  return 'You are a careful reading assistant for a team of editors. You summarise a section of a manuscript faithfully. You never judge or advise. You never invent: if something is not in the text, you do not mention it. Answer ONLY with JSON.';
}
export function mapUser(chunk: Chunk, kindLabel: string): string {
  return `This is section "${chunk.id}" (chapter: "${chunk.chapterTitle}", about ${chunk.words} words) of a ${kindLabel}.

TEXT:
"""
${chunk.text}
"""

Return JSON exactly: {"summary":"3 to 5 sentences: what happens or what is argued, in order","voice":"one sentence on narrative voice and point of view, or the register of the prose","standouts":["up to 3 short VERBATIM lines (10 to 35 words each, copied exactly) that best show the writing at its strongest or most distinctive"],"concerns":["up to 3 neutral factual observations a developmental editor might want to look at, such as an unexplained jump or a claim stated without support. No advice."]}`;
}
export function readChunkSummary(chunk: Chunk, raw: any): ChunkSummary | null {
  if (!raw || typeof raw !== 'object' || !String(raw.summary || '').trim()) return null;
  const arr = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map(x => String(x ?? '').trim().slice(0, max)).filter(Boolean).slice(0, n) : []);
  // Standouts must be verbatim; the others cannot be anchored later if they are not in the text.
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  const text = norm(chunk.text);
  return { chunkId: chunk.id, chapterTitle: chunk.chapterTitle, summary: String(raw.summary).trim().slice(0, 900), voice: raw.voice ? String(raw.voice).slice(0, 240) : undefined, standouts: arr(raw.standouts, 3, 300).filter(q => text.includes(norm(q))), concerns: arr(raw.concerns, 3, 240) };
}
/** If a model call fails for a chunk, fall back to its opening so the editors still have something true to read. */
export function fallbackSummary(chunk: Chunk): ChunkSummary {
  const first = chunk.text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, 3).join(' ').slice(0, 500);
  return { chunkId: chunk.id, chapterTitle: chunk.chapterTitle, summary: `(opening only, summary unavailable) ${first}`, standouts: [], concerns: [], fallback: true };
}

/** Run the map step with bounded concurrency. `ask` is injectable so tests and routes share the code. */
export async function mapChunks(chunks: Chunk[], kindLabel: string, ask: (system: string, user: string, maxTokens?: number) => Promise<string>, parseJson: (s: string) => any, concurrency = 4): Promise<ChunkSummary[]> {
  const out: ChunkSummary[] = new Array(chunks.length); let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++; const c = chunks[i];
      try { out[i] = readChunkSummary(c, parseJson(await ask(mapSystem(), mapUser(c, kindLabel), 900))) ?? fallbackSummary(c); }
      catch { out[i] = fallbackSummary(c); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return out;
}

/** The material the editors see. Whole text for short pieces; otherwise a verbatim-anchored digest. */
export function buildMaterial(m: ManuscriptInput, flat: Flat, summaries?: ChunkSummary[]): { material: string; mode: 'WHOLE' | 'DIGEST'; words: number } {
  const words = wordCount(flat.text);
  if (words <= WHOLE_READ_WORDS || !summaries?.length) {
    if (words <= WHOLE_READ_WORDS) return { material: flat.chapters.map(c => `### ${c.title}\n${c.text}`).join('\n\n'), mode: 'WHOLE', words };
    // No summaries (the map step failed everywhere): openings of each chapter, honestly labelled.
    const per = Math.max(120, Math.floor(DIGEST_BUDGET_WORDS / Math.max(1, flat.chapters.length)));
    return { material: 'NOTE: this is only the opening of each chapter, not the whole book.\n\n' + flat.chapters.map(c => `### ${c.title}\n${c.text.split(/\s+/).slice(0, per).join(' ')}`).join('\n\n'), mode: 'DIGEST', words };
  }
  const byChapter = new Map<string, ChunkSummary[]>(); for (const s of summaries) { const k = s.chunkId.split('#')[0]; byChapter.set(k, [...(byChapter.get(k) ?? []), s]); }
  const parts: string[] = [`NOTE: this book is about ${words.toLocaleString()} words, so you are reading a DIGEST: a summary of each section plus verbatim lines. You have not read all the text. Say so wherever it limits what you can claim.`];
  for (const c of flat.chapters) {
    const ss = byChapter.get(c.id); if (!ss) continue;
    const opening = c.text.split(/\s+/).slice(0, 180).join(' ');
    parts.push(`### ${c.title} (${c.words} words)\nOPENING (verbatim): ${opening}\nSUMMARY: ${ss.map(s => s.summary).join(' ')}\n${ss.some(s => s.voice) ? `VOICE: ${ss.find(s => s.voice)!.voice}\n` : ''}${ss.flatMap(s => s.standouts).slice(0, 3).map(q => `STANDOUT (verbatim): "${q}"`).join('\n')}${ss.flatMap(s => s.concerns).length ? `\nOBSERVATIONS: ${ss.flatMap(s => s.concerns).slice(0, 3).join(' | ')}` : ''}`);
  }
  let material = parts.join('\n\n');
  const cap = DIGEST_BUDGET_WORDS * 1.3; const w = material.split(/\s+/);
  if (w.length > cap) material = w.slice(0, Math.floor(cap)).join(' ') + '\n[digest truncated]';
  return { material, mode: 'DIGEST', words };
}
export const flattenManuscript = (m: ManuscriptInput) => flatten(m.chapters);

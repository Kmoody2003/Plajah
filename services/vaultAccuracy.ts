export interface VerifiedAudioAlignment {
  audioUrl: string;
  sourceUrl: string;
  reviewed: true;
  chapterIndex?: number;
  cues: Array<{ start: number; end: number; text: string; speaker?: string }>;
}

/** Timing belongs to a recording, never just a work title or a narrator. */
export function validAlignment(alignment: VerifiedAudioAlignment | undefined, audioUrl: string, chapterIndex?: number): alignment is VerifiedAudioAlignment {
  if (!alignment || alignment.reviewed !== true || !alignment.sourceUrl || alignment.audioUrl !== audioUrl || !audioUrl) return false;
  if (chapterIndex !== undefined && alignment.chapterIndex !== chapterIndex) return false;
  return Array.isArray(alignment.cues) && alignment.cues.length > 0 && alignment.cues.every((cue, i, cues) =>
    !!cue && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && typeof cue.text === 'string' && !!cue.text.trim() &&
    (i === 0 || cue.start >= cues[i - 1].end));
}

export function activeCueIndex(cues: Array<{ start: number; end: number }>, time: number): number {
  return cues.findIndex(cue => time >= cue.start && time < cue.end);
}

export const JFK_PHOTO = {
  url: 'https://cdn.loc.gov/service/pnp/ppmsc/02800/02882v.jpg',
  sourceUrl: 'https://www.loc.gov/pictures/item/00652309/',
  title: 'John F. Kennedy inaugural ceremony, January 20, 1961',
};

export function matchReferenceChapters(audioTitle: string, titles: string[]): number[] {
  if (!audioTitle?.trim()) return [];
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const exact = titles.map((t, i) => normalize(t) === normalize(audioTitle) ? i : -1).filter(i => i >= 0);
  if (exact.length === 1) return exact;
  const spec = (s: string) => {
    const m = s.trim().match(/^(chapter|chapters|letter|letters|part|parts|section|sections)\s+(\d+)(?:\s*(?:-|–|to|&)\s*(\d+))?\b/i);
    if (!m) return null;
    const first = Number(m[2]), last = Number(m[3] || first);
    if (first < 1 || last < first || last - first > 100) return null;
    return { kind: m[1].toLowerCase().replace(/s$/, ''), numbers: Array.from({length: last - first + 1}, (_, i) => first + i) };
  };
  const audio = spec(audioTitle);
  if (!audio) return [];
  const found = audio.numbers.map(n => titles.map((title, i) => ({ i, spec: spec(title) })).filter(t => t.spec?.kind === audio.kind && t.spec.numbers.length === 1 && t.spec.numbers[0] === n));
  return found.every(f => f.length === 1) ? found.map(f => f[0].i) : [];
}

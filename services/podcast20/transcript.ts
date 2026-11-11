// Transcripts for podcast:transcript. The timed text Plajah already stores per track is
// `timeCodedLyrics` ({ time, text }[] — start times only), written by the lyric/caption tools; a cue's
// end is the next cue's start (capped), and the last one runs to the track end or a few seconds.

export interface Cue { start: number; end: number; text: string; speaker?: string }

type TrackLike = { duration?: number; timeCodedLyrics?: { time: number; text: string }[] };

const MAX_CUE = 10;        // seconds a cue may linger when nothing follows soon
const LAST_CUE = 5;

export function cuesFromTimedLines(lines: { time: number; text: string }[] | undefined, durationSec?: number): Cue[] {
  if (!Array.isArray(lines)) return [];
  const clean = lines
    .map(l => ({ time: Number(l?.time), text: typeof l?.text === 'string' ? l.text.replace(/\s+/g, ' ').trim() : '' }))
    .filter(l => Number.isFinite(l.time) && l.time >= 0 && l.text)
    .sort((a, b) => a.time - b.time);
  const cues: Cue[] = [];
  for (let i = 0; i < clean.length; i++) {
    const start = clean[i].time;
    const nextStart = clean[i + 1]?.time;
    let end = nextStart !== undefined ? Math.min(nextStart, start + MAX_CUE) : start + LAST_CUE;
    if (durationSec && durationSec > start) end = Math.min(end, durationSec);
    if (end <= start) end = start + 0.5;
    cues.push({ start, end, text: clean[i].text });
  }
  return cues;
}

/** The cues for a track, or [] when it has no timed text. */
export function trackCues(track: TrackLike): Cue[] {
  const fromField = (track as any).transcriptCues;
  if (Array.isArray(fromField) && fromField.length) {
    return fromField
      .map((c: any) => ({ start: Number(c?.start), end: Number(c?.end), text: String(c?.text ?? '').trim(), ...(c?.speaker ? { speaker: String(c.speaker) } : {}) }))
      .filter((c: Cue) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start && c.text);
  }
  return cuesFromTimedLines(track.timeCodedLyrics, track.duration);
}

function stamp(sec: number, sep: '.' | ','): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

/** Cue text can't contain a blank line (it would end the cue) or "-->". */
const cueText = (t: string) => t.replace(/\r/g, '').replace(/\n{2,}/g, '\n').replace(/-->/g, '->');

const vttEsc = (t: string) => cueText(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toVtt(cues: Cue[]): string {
  const body = cues.map(c => {
    const text = c.speaker ? `<v ${vttEsc(c.speaker)}>${vttEsc(c.text)}` : vttEsc(c.text);
    return `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${text}`;
  }).join('\n\n');
  return `WEBVTT\n\n${body}${body ? '\n' : ''}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.speaker ? `${cueText(c.speaker)}: ` : ''}${cueText(c.text)}`).join('\n\n') + (cues.length ? '\n' : '');
}

/** Podcast Index JSON transcript format ({ version, segments: [{ speaker?, startTime, endTime, body }] }). */
export function toJsonTranscript(cues: Cue[]): { version: '1.0.0'; segments: Array<{ speaker?: string; startTime: number; endTime: number; body: string }> } {
  return { version: '1.0.0', segments: cues.map(c => ({ ...(c.speaker ? { speaker: c.speaker } : {}), startTime: c.start, endTime: c.end, body: c.text })) };
}

export const TRANSCRIPT_MIME = { vtt: 'text/vtt', srt: 'application/x-subrip', json: 'application/json' } as const;
export type TranscriptFormat = keyof typeof TRANSCRIPT_MIME;

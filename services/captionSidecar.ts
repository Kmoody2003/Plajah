// W4 Deliverables — caption/subtitle SIDECAR writers.
// ---------------------------------------------------------------------------
// The cue timing model already exists (Fabula subtitle clips, take transcripts);
// what was missing is a writer that emits a real sidecar FILE. Pure string
// formatting — SRT + WebVTT ship now (SCC/iTT/TTML are the harder follow-up).
// Reusable: Fabula's Deliver room can import these unchanged.

export interface Cue { start: number; end: number; text: string; }

function stamp(sec: number, sep: ',' | '.'): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${p(h)}:${p(m)}:${p(ss)}${sep}${p(ms, 3)}`;
}

/** SubRip (.srt). */
export function toSRT(cues: Cue[]): string {
  return cues
    .filter(c => c.text.trim())
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(Math.max(c.end, c.start + 0.4), ',')}\n${c.text.trim()}\n`)
    .join('\n');
}

/** WebVTT (.vtt). */
export function toVTT(cues: Cue[]): string {
  const body = cues
    .filter(c => c.text.trim())
    .map(c => `${stamp(c.start, '.')} --> ${stamp(Math.max(c.end, c.start + 0.4), '.')}\n${c.text.trim()}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/**
 * Assemble cues from transcribed takes (real timecodes from analyzeClipForScript),
 * concatenated in order and offset by each take's running duration — a real caption
 * starter an editor then refines to the locked cut.
 */
export function cuesFromTakes(
  takes: Array<{ transcript?: Array<{ time: number; speaker?: string; text: string }>; duration?: number }>,
): Cue[] {
  const cues: Cue[] = [];
  let offset = 0;
  for (const take of takes) {
    const segs = take.transcript || [];
    segs.forEach((seg, i) => {
      const start = offset + seg.time;
      const end = offset + (segs[i + 1]?.time ?? seg.time + 3);
      cues.push({ start, end, text: seg.speaker ? `${seg.speaker}: ${seg.text}` : seg.text });
    });
    offset += take.duration || (segs.length ? segs[segs.length - 1].time + 3 : 0);
  }
  return cues;
}

/** Trigger a browser download of a sidecar string. */
export function downloadSidecar(content: string, filename: string): void {
  const blob = new Blob([content], { type: filename.endsWith('.vtt') ? 'text/vtt' : 'application/x-subrip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

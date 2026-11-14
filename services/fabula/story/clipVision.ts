// clipVision — what Story Intelligence has actually SEEN in the bins.
//
// Reasoning about footage from its filename is guessing. Fabula already has a vision pass that watches
// a clip and returns what happens in it, where, and who says what when (`analyzeClipForScript`, the
// same one "build script from the cut" uses). This module decides which clips are worth watching,
// stores the result on the asset, and turns it into evidence the rest of the layer can use:
//
//   • the bin-reasoning pass reads the description instead of the clip's name
//   • a clip a character appears or speaks in is tagged to them — a look reference from the bins
//   • each stretch of a character speaking becomes a timed voice sample — so a voice lock can be built
//     from media that was never cut into the timeline
//
// The watching itself is a model call made by the caller; everything here is pure.

export interface ClipDialogueLine { time: number; speaker: string; text: string }

export interface ClipAnalysis {
  action: string;
  setting: string;
  dialogue: ClipDialogueLine[];
  /** When it was watched. */
  at: number;
}

/** What `analyzeClipForScript` returns, or null when the clip couldn't be read. */
export type RawClipAnalysis = { action?: string; setting?: string; dialogue?: { time?: number; speaker?: string; text?: string }[] } | null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lc = (s: any) => String(s || '').toLowerCase();

/** Clips to watch, most useful first: footage that isn't in the cut (that's where alternates and
 *  inserts are hiding), then anything else unwatched. Audio is included — it carries voice. */
export function clipsToWatch(prod: any, clips: any[], opts: { max?: number; includeWatched?: boolean } = {}): any[] {
  const used = new Set((clips || []).filter((c) => c && !c.disabled).map((c) => c.assetId).filter(Boolean));
  const pool: any[] = (prod?.mediaPool || []).filter((a: any) => ['video', 'image', 'audio'].includes(a?.type) && !a.board && (opts.includeWatched || !a.analysis));
  const rank = (a: any) => (used.has(a.id) ? 2 : 0) + (a.type === 'video' ? 0 : a.type === 'audio' ? 0.5 : 1);
  return pool.sort((a, b) => rank(a) - rank(b)).slice(0, opts.max ?? 24);
}

export function normalizeClipAnalysis(raw: RawClipAnalysis, at = Date.now()): ClipAnalysis | null {
  if (!raw) return null;
  const dialogue = (Array.isArray(raw.dialogue) ? raw.dialogue : [])
    .filter((d) => String(d?.text || '').trim())
    .map((d) => ({ time: Math.max(0, Number(d.time) || 0), speaker: String(d.speaker || '').trim(), text: String(d.text).trim() }))
    .sort((a, b) => a.time - b.time);
  const action = String(raw.action || '').trim();
  if (!action && !dialogue.length) return null;
  return { action, setting: String(raw.setting || '').trim(), dialogue, at };
}

/** The cast members a watched clip shows or hears: anyone who speaks in it, or is named in its action. */
export function castInClip(analysis: ClipAnalysis | undefined, cast: any[]): any[] {
  if (!analysis) return [];
  return (cast || []).filter((c) => c?.name && (
    analysis.dialogue.some((d) => lc(d.speaker) === lc(c.name))
    || new RegExp(`\\b${esc(c.name)}\\b`, 'i').test(analysis.action)
  ));
}

/** Store a clip's analysis on its asset and tag it to the cast it shows. Mutates `prod` — call it
 *  inside the production's update. Existing tags and an existing cast link are kept. */
export function fileClipAnalysis(prod: any, assetId: string, analysis: ClipAnalysis): { tagged: string[] } {
  const asset = (prod?.mediaPool || []).find((a: any) => a.id === assetId);
  if (!asset) return { tagged: [] };
  asset.analysis = analysis;
  const who = castInClip(analysis, prod.cast || []);
  asset.tags = Array.from(new Set([...(asset.tags || []), ...who.map((c) => lc(c.name))])).slice(0, 12);
  if (!asset.castId && who.length === 1) asset.castId = who[0].id;
  for (const c of who) {
    c.media = c.media || [];
    if (!c.media.some((m: any) => (typeof m === 'string' ? m : m?.assetId) === assetId)) c.media.push(assetId);
  }
  return { tagged: who.map((c) => c.name) };
}

export interface SpeechSegment { srcIn: number; duration: number; line: string }

/** The stretches of one speaker talking in a watched clip. Consecutive lines by the same speaker are
 *  joined; a stretch ends where the next speaker starts, or after the time the words would take. */
export function speechSegments(analysis: ClipAnalysis | undefined, speaker: string, assetDuration?: number): SpeechSegment[] {
  const lines = analysis?.dialogue || [];
  const out: SpeechSegment[] = [];
  for (let i = 0; i < lines.length; i++) {
    const d = lines[i];
    if (lc(d.speaker) !== lc(speaker)) continue;
    const spoken = d.text.split(/\s+/).length / 2.5 + 0.4;
    const next = lines[i + 1];
    let end = Math.min(d.time + spoken, next ? Math.max(next.time, d.time + 0.5) : d.time + spoken);
    if (assetDuration && assetDuration > 0) end = Math.min(end, assetDuration);
    const last = out[out.length - 1];
    const prev = lines[i - 1];
    // Same speaker carrying straight on → one stretch.
    if (last && prev && lc(prev.speaker) === lc(speaker) && d.time - (last.srcIn + last.duration) < 0.6) {
      last.duration = Math.round((end - last.srcIn) * 100) / 100;
      last.line = `${last.line} ${d.text}`;
    } else if (end - d.time >= 0.5) {
      out.push({ srcIn: Math.round(d.time * 100) / 100, duration: Math.round((end - d.time) * 100) / 100, line: d.text });
    }
  }
  return out;
}

/** One line describing a watched clip, for a model: what happens, where, and who speaks. */
export function describeAnalysis(analysis: ClipAnalysis | undefined, maxChars = 260): string {
  if (!analysis) return '';
  const speakers = Array.from(new Set(analysis.dialogue.map((d) => d.speaker).filter(Boolean)));
  const first = analysis.dialogue[0];
  const text = [
    analysis.setting && `${analysis.setting}.`,
    analysis.action,
    speakers.length && `Speaking: ${speakers.join(', ')}.`,
    first && `Opens on "${first.text.slice(0, 70)}"`,
  ].filter(Boolean).join(' ');
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

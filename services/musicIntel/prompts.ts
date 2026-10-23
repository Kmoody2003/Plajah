// Music Intelligence — prompts and response normalisers.
//
// Voice: a public-radio music host who loves the record — warm, curious, specific. Every
// claim about the sound is anchored to the measured facts or to what is audible; the host
// never invents credits, gear, samples or backstory, never tells the listener the artist
// meant something they didn't say, and never belittles. Where a choice could be read as a
// flaw, it is described as the choice it is and what it does for the song. Uncertain reads
// are said as impressions ("it sounds like…"), not facts.

import type { AlbumIntel, FilmContext, HostCard, HostCardKind, MeasuredAudio, TrackIntel } from './types';

export const TONE_RULES = `TONE — non-negotiable:
- You are a public-radio music host who genuinely respects this artist. Warm, curious, specific, never gushing filler.
- Every observation is insight, not judgement: say what a choice does for the song. No grades, no "weak", "flawed", "amateur", "could be better", no mixing advice to the artist.
- Never gaslight: do not claim the artist intended something they did not state, do not invent credits, gear, plugins, samples, collaborators, studios, chart history or backstory. If you are inferring, say so ("it sounds like", "the way I hear it").
- Ground sound claims in the MEASURED FACTS block (tempo, key, loudness, stereo, sections) or in what is clearly audible. Do not contradict the measurements; if you hear something different (e.g. half-time feel), explain it as feel.
- Quote lyrics only from the LYRICS block, verbatim, at most one line per standout. If there are no lyrics and you hear no words, treat it as instrumental.
- Plain language a listener can follow; one technical term at a time, explained in passing.`;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function measuredFactsBlock(m: MeasuredAudio | null): string {
  if (!m) return 'MEASURED FACTS: unavailable for this song (the audio could not be decoded) — rely on listening only, and say less about loudness/stereo.';
  const sb = m.spectralBalance;
  return [
    'MEASURED FACTS (from DSP on the actual file — treat as ground truth):',
    `- Duration ${fmtTime(m.durationSec)}; tempo ≈ ${m.tempo.bpm} BPM (confidence ${m.tempo.confidence}); key ≈ ${m.key.key} (confidence ${m.key.confidence}, runner-up ${m.key.alternate}).`,
    `- Integrated loudness ${m.integratedLufs ?? 'n/a'} LUFS, loudness range ${m.loudnessRangeLu} LU, sample peak ${m.samplePeakDbfs} dBFS, crest factor ${m.crestFactorDb ?? 'n/a'} dB.`,
    m.stereo ? `- Stereo width (side/mid) ${m.stereo.width}, L/R correlation ${m.stereo.correlation}.` : '- Mono file.',
    `- Spectral balance %: sub ${sb.sub}, low ${sb.low}, low-mid ${sb.lowMid}, high-mid ${sb.highMid}, presence ${sb.presence}, air ${sb.air}; brightness centroid ${m.brightnessHz ?? 'n/a'} Hz.`,
    `- Section boundaries by self-similarity (letters = harmonically similar parts, energy 0..1): ${m.sections.map(s => `${fmtTime(s.startSec)}–${fmtTime(s.endSec)} ${s.label} (e${s.energy})`).join('; ')}.`,
    `- Energy curve (every ${m.energyCurveStepSec}s, 0..1): ${m.energyCurve.join(' ')}`,
  ].join('\n');
}

export function lyricsBlock(lyrics: string): string {
  const t = lyrics.trim();
  return t ? `LYRICS (as published by the artist / synced from the recording):\n${t.slice(0, 6000)}` : 'LYRICS: none published.';
}

export interface TrackPromptInput {
  albumTitle: string;
  artist: string;
  genre?: string;
  trackTitle: string;
  trackNumber: number;
  trackCount: number;
  creatorNotes?: string;
  lyrics: string;
  measured: MeasuredAudio | null;
  film?: FilmContext;
}

export function trackPrompt(i: TrackPromptInput): string {
  return `You are listening to song ${i.trackNumber} of ${i.trackCount}, "${i.trackTitle}", from "${i.albumTitle}" by ${i.artist}${i.genre ? ` (filed under ${i.genre})` : ''}.
${i.creatorNotes ? `ARTIST'S OWN NOTES (their words — you may reference, never contradict):\n${i.creatorNotes.slice(0, 1500)}\n` : ''}${filmBlock(i.film)}
${measuredFactsBlock(i.measured)}

${lyricsBlock(i.lyrics)}

${TONE_RULES}

Listen to the whole recording, then return ONE JSON object with exactly these keys:
{
 "summary": "2-3 sentences: what this song is and what it does",
 "genreTags": ["3-6 style tags you hear"],
 "mood": {"primary": "one word", "secondary": ["2-3 words"], "valence": 0..1, "arousal": 0..1},
 "emotionalArc": [{"atSec": n, "emotion": "word", "intensity": 0..1, "note": "what the music does here"}]  // 4-8 points across the song,
 "sections": [{"startSec": n, "endSec": n, "label": "Intro|Verse 1|Pre-chorus|Chorus|Bridge|Drop|Breakdown|Outro|…", "description": "one sentence"}]  // refine the measured boundaries; keep them unless clearly wrong,
 "lyrics": {"hasVocals": bool, "themes": [], "imagery": [], "perspective": "who is speaking to whom", "storyArc": "how the words move", "craft": "rhyme, meter, hooks, wordplay — specific", "standoutLines": [{"line": "verbatim from LYRICS", "why": "…"}]},
 "composition": {"key": "", "tempoBpm": n, "timeSignature": "4/4", "harmony": "", "melody": "", "rhythm": "", "arrangement": "how parts enter and leave", "instrumentation": ["what you hear"], "chordChart": [{"section": "Verse", "chords": ["Am","F","C","G"]}]},
 "production": {"overview": "", "techniques": [{"technique": "e.g. sidechain pumping, double-tracked vocal, tape saturation, filter sweep", "where": "m:ss or section", "effect": "what it does for the song"}], "vocals": "", "lowEnd": "", "space": "reverb, width, depth", "dynamics": "use the loudness range and crest factor"},
 "hostCards": [{"kind": "intro|lyric|composition|mix|emotion|context|outro", "title": "3-6 words", "text": "2-4 spoken sentences, as if on air", "atSec": n}]  // 5-8 cards, chronological where pinned, at least one each of lyric (if vocals), composition, mix, emotion,
 "linerNote": "one paragraph for the album booklet about this song"
}
Chord chart: use the measured key; write what you hear, simplest correct spelling; omit if you genuinely cannot tell.`;
}

export function filmBlock(film?: FilmContext): string {
  if (!film || film.status !== 'LINKED') return '';
  return `\nFILM CONTEXT — this is music for "${film.filmTitle}", a film by the same creator, analysed by Story Intelligence:
Logline: ${film.logline || 'n/a'}
Themes: ${(film.themes || []).join(', ') || 'n/a'}
Characters: ${(film.characters || []).join(', ') || 'n/a'}
Where it genuinely fits, say how the music serves the story. Never claim a specific cue plays over a specific scene unless the title or notes say so.\n`;
}

export interface AlbumPromptInput {
  albumTitle: string;
  artist: string;
  genre?: string;
  description?: string;
  creatorLinerNotes?: string;
  tracks: Pick<TrackIntel, 'trackId' | 'title' | 'summary' | 'mood' | 'composition' | 'lyrics' | 'linerNote'>[];
  measured: (MeasuredAudio | null)[];
  film?: FilmContext;
}

export function albumPrompt(i: AlbumPromptInput): string {
  const rows = i.tracks.map((t, n) => {
    const m = i.measured[n];
    return `${n + 1}. [${t.trackId}] "${t.title}" — ${t.summary} | mood ${t.mood.primary}${m ? ` | ${m.tempo.bpm} BPM, ${m.key.key}, ${m.integratedLufs} LUFS` : ''} | themes: ${t.lyrics.themes.join(', ') || 'instrumental'}`;
  }).join('\n');
  return `You have just listened to every song on "${i.albumTitle}" by ${i.artist}${i.genre ? ` (${i.genre})` : ''}, in sequence.
${i.description ? `ARTIST'S DESCRIPTION: ${i.description.slice(0, 1500)}\n` : ''}${i.creatorLinerNotes ? `ARTIST'S OWN LINER NOTES (their words — reference, never contradict): ${i.creatorLinerNotes.slice(0, 2500)}\n` : ''}${filmBlock(i.film)}
TRACK READS:
${rows}

${TONE_RULES}

Return ONE JSON object:
{
 "overview": "3-5 sentences on the record as a whole",
 "sonicSignature": "what makes it sound like itself — specific",
 "sequencing": "how the running order moves: tempo, key, energy, story",
 "throughlines": ["3-5 recurring ideas, lyrical or musical"],
 "standoutMoments": [{"trackId": "id from the list", "atSec": n, "why": "…"}],
 "linerNotes": "3-5 paragraphs of album liner notes, in the host's warm voice, grounded in the track reads"${i.film?.status === 'LINKED' ? ',\n "filmConnection": "2-4 sentences on how this music and the film inform each other"' : ''},
 "hostCards": [{"kind": "intro|context|outro", "title": "", "text": "2-4 spoken sentences"}]  // 2-3 cards that open and close the album
}`;
}

// ─── Normalisers: model JSON → typed objects, never throwing ───────────────────

const str = (v: any, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: any, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };
const strs = (v: any, n = 12, max = 200) => (Array.isArray(v) ? v.map(x => str(x, max)).filter(Boolean).slice(0, n) : []);
const arr = (v: any, n = 24): any[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, n) : []);
const KINDS: HostCardKind[] = ['intro', 'lyric', 'composition', 'mix', 'emotion', 'context', 'outro'];

export function parseJsonLoose(raw: string): any {
  const t = (raw || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* */ } }
  return null;
}

export function normalizeHostCards(v: any, durationSec?: number): HostCard[] {
  return arr(v, 10).map(c => {
    const kind = KINDS.includes(c.kind) ? c.kind : 'context';
    const at = num(c.atSec, 0, durationSec ?? Infinity);
    return { kind, title: str(c.title, 80), text: str(c.text, 700), ...(at !== undefined ? { atSec: Math.round(at) } : {}) } as HostCard;
  }).filter(c => c.text);
}

/** Only keep standout lines that really appear in the lyrics — the host may not misquote. */
function realLines(v: any, lyrics: string): { line: string; why: string }[] {
  const hay = lyrics.toLowerCase().replace(/\s+/g, ' ');
  return arr(v, 4)
    .map(x => ({ line: str(x.line, 240), why: str(x.why, 400) }))
    .filter(x => x.line && hay.includes(x.line.toLowerCase().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '')));
}

export function normalizeTrackIntel(raw: any, base: Pick<TrackIntel, 'trackId' | 'title' | 'version' | 'analyzedAt' | 'sourceUrl' | 'measured'>, lyrics: string): TrackIntel {
  const r = raw && typeof raw === 'object' ? raw : {};
  const m = base.measured;
  const dur = m?.durationSec;
  const lyr = r.lyrics || {}, comp = r.composition || {}, prod = r.production || {}, mood = r.mood || {};
  return {
    ...base,
    summary: str(r.summary, 900),
    genreTags: strs(r.genreTags, 6, 40),
    mood: { primary: str(mood.primary, 40), secondary: strs(mood.secondary, 3, 40), valence: num(mood.valence, 0, 1) ?? 0.5, arousal: num(mood.arousal, 0, 1) ?? 0.5 },
    emotionalArc: arr(r.emotionalArc, 10).map(p => ({ atSec: Math.round(num(p.atSec, 0, dur ?? Infinity) ?? 0), emotion: str(p.emotion, 40), intensity: num(p.intensity, 0, 1) ?? 0.5, note: str(p.note, 300) })).filter(p => p.emotion).sort((a, b) => a.atSec - b.atSec),
    sections: arr(r.sections, 20).map(s => ({ startSec: Math.round(num(s.startSec, 0) ?? 0), endSec: Math.round(num(s.endSec, 0) ?? 0), label: str(s.label, 40), description: str(s.description, 300) })).filter(s => s.label),
    lyrics: {
      hasVocals: !!lyr.hasVocals || !!lyrics.trim(),
      themes: strs(lyr.themes, 6, 80), imagery: strs(lyr.imagery, 6, 120),
      perspective: str(lyr.perspective, 300), storyArc: str(lyr.storyArc, 600), craft: str(lyr.craft, 600),
      standoutLines: realLines(lyr.standoutLines, lyrics),
    },
    composition: {
      // The measured key/tempo win unless the model gave a value; both are shown to the listener.
      key: str(comp.key, 30) || m?.key.key || '',
      tempoBpm: num(comp.tempoBpm, 30, 260) ?? m?.tempo.bpm ?? 0,
      timeSignature: str(comp.timeSignature, 8) || '4/4',
      harmony: str(comp.harmony, 600), melody: str(comp.melody, 600), rhythm: str(comp.rhythm, 600), arrangement: str(comp.arrangement, 700),
      instrumentation: strs(comp.instrumentation, 14, 60),
      chordChart: arr(comp.chordChart, 12).map(c => ({ section: str(c.section, 40), chords: strs(c.chords, 16, 12) })).filter(c => c.section && c.chords.length),
    },
    production: {
      overview: str(prod.overview, 700),
      techniques: arr(prod.techniques, 8).map(t => ({ technique: str(t.technique, 80), where: str(t.where, 40), effect: str(t.effect, 300) })).filter(t => t.technique),
      vocals: str(prod.vocals, 400), lowEnd: str(prod.lowEnd, 400), space: str(prod.space, 400), dynamics: str(prod.dynamics, 400),
    },
    hostCards: normalizeHostCards(r.hostCards, dur),
    linerNote: str(r.linerNote, 1500),
  };
}

export function normalizeAlbumIntel(raw: any, trackIds: string[]): AlbumIntel & { filmConnection?: string } {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    overview: str(r.overview, 1500),
    sonicSignature: str(r.sonicSignature, 800),
    sequencing: str(r.sequencing, 900),
    throughlines: strs(r.throughlines, 6, 240),
    standoutMoments: arr(r.standoutMoments, 6).map(s => ({ trackId: str(s.trackId, 160), why: str(s.why, 400), ...(num(s.atSec, 0) !== undefined ? { atSec: Math.round(num(s.atSec, 0)!) } : {}) })).filter(s => trackIds.includes(s.trackId) && s.why),
    linerNotes: str(r.linerNotes, 6000),
    hostCards: normalizeHostCards(r.hostCards),
    ...(str(r.filmConnection) ? { filmConnection: str(r.filmConnection, 900) } : {}),
  };
}

/** Is this album music for a film? Genre/title words, or an explicit link the creator set. */
export function looksLikeSoundtrack(album: { title?: string; genre?: string; tags?: string[]; description?: string; relatedProjectIds?: string[] }): boolean {
  const hay = [album.title, album.genre, ...(album.tags || []), album.description?.slice(0, 300)].join(' ').toLowerCase();
  return /\b(soundtrack|original score|film score|motion picture|o\.?s\.?t\.?|music from (the )?(film|movie)|score)\b/.test(hay);
}

/** Title words that identify the film ("Moonbreaker (Original Soundtrack)" → moonbreaker). */
export function filmTitleTokens(title: string): string[] {
  return title.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(original|motion|picture|soundtrack|score|ost|music|from|the|film|movie|deluxe|edition|vol\.?|volume|\d+)\b/g, ' ')
    .split(/[^a-z0-9']+/).filter(w => w.length > 1);
}

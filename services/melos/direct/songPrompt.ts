// Chora Direct — the song prompt language.
//
// People arrive knowing the Suno way of writing a song: a style line of comma-separated tags, then
// lyrics with [Section] metatags, (ad-libs) in parentheses. This parser reads that paradigm as-is
// and then goes further, because Chora has a real timeline, real players and a real score behind
// the prompt:
//
//   style line     "deep house, 122 bpm, F minor, warm rhodes, female vocal, no guitars"
//   section tags   [Verse 1]  [Chorus]  [Drop]  [Sax Solo]  [Instrumental]  [Fade Out]
//   Chora extras   [Verse 1 | 8 bars | mp | whispered]   bars, dynamics and delivery per section
//                  [Solo: tenor sax | 16 bars]           who takes it
//                  [Key: F minor] [Tempo: 122] [Time: 6/8]
//                  {Fm9 | Bbm7 Eb7 | Abmaj7 | C7}        a chord chart for the section
//                  word~  ^word  wo-o-ord  /             hold · accent · melisma · breath
//
// Pure text in, typed structure out. No model, no network. Everything a model later receives is
// built from this structure, so the prompt can also be checked by the composers and players.

export type SectionKind =
  | 'intro' | 'verse' | 'prechorus' | 'chorus' | 'postchorus' | 'hook' | 'bridge' | 'refrain'
  | 'build' | 'drop' | 'breakdown' | 'solo' | 'interlude' | 'instrumental' | 'outro'
  // score and jazz forms
  | 'theme' | 'development' | 'recap' | 'coda' | 'head' | 'cue';

export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';

/** A mark on one sung word: how it is delivered, beyond pitch and time. */
export type WordMark = 'hold' | 'accent' | 'melisma' | 'breath-after' | 'emphasis';

export interface ParsedWord {
  text: string;
  /** Syllables as written for the singer ("wo-o-ord" keeps its three). */
  syllables: string[];
  marks: WordMark[];
}

export interface ParsedLine {
  /** The line as the singer reads it: marks and ad-libs stripped. */
  text: string;
  words: ParsedWord[];
  syllables: number;
  /** Backing vocals / ad-libs written in (parentheses). */
  adlibs: string[];
  /** Inline delivery tags on the line: "[whispered] I never said goodbye". */
  delivery: string[];
}

export interface ParsedSection {
  kind: SectionKind;
  /** As typed, tidied: "Verse 1", "Sax Solo". */
  label: string;
  /** 1-based ordinal when the tag carried one ("Verse 2" → 2). */
  ordinal?: number;
  /** Explicit length ("8 bars"); undefined = the brief decides. */
  bars?: number;
  dynamic?: Dynamic;
  /** Delivery and arrangement words that came with the tag: "whispered", "half-time", "strings only". */
  modifiers: string[];
  /** Who is featured: "tenor sax" in [Solo: tenor sax], "guitar" in [Guitar Solo]. */
  feature?: string;
  /** A typed chord chart for this section, bars split on "|". */
  chart?: string[][];
  lines: ParsedLine[];
  /** True when the section carries no sung words. */
  instrumental: boolean;
}

export interface StyleDirectives {
  bpm?: number;
  /** Tonic pitch class (C = 0) and mode id ('major', 'minor', 'dorian', …). */
  key?: { tonic: number; mode: string };
  meter?: [number, number];
  durationSec?: number;
}

export interface VocalDirective {
  /** 'none' when the prompt asks for an instrumental. */
  presence: 'unspecified' | 'none' | 'lead';
  gender?: 'female' | 'male' | 'mixed';
  /** Delivery words found: "rap", "falsetto", "choir", "spoken word", "belted"… */
  styles: string[];
}

export interface ParsedStyle {
  raw: string;
  /** Every tag, lower-cased, in the order written. Directives ("122 bpm") are lifted out. */
  tags: string[];
  /** Tags the user excluded: "no guitars", "-vocals", "without drums". */
  exclude: string[];
  directives: StyleDirectives;
  vocal: VocalDirective;
}

export interface ParsedSongPrompt {
  title?: string;
  style: ParsedStyle;
  sections: ParsedSection[];
  /** Song-level actions from tags that are not sections: 'fade-out', 'end', 'key-change'. */
  actions: { afterSection: number; action: string }[];
  /** Tags we did not understand. Kept, never silently dropped: the UI shows them back. */
  unknownTags: string[];
}

// ─── Small readers ──────────────────────────────────────────────────────────────

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const MODES = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'harmonic minor', 'melodic minor'] as const;

/** "F# minor", "Bb", "D dorian", "Am", "C#m" → key. Null when the text is not a key. */
export function readKey(text: string): { tonic: number; mode: string } | null {
  const t = text.trim().toLowerCase().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\bflat\b/g, 'b').replace(/\bsharp\b/g, '#')
    .replace(/^(?:in\s+)?(?:the\s+)?key\s*(?:of|:)?\s*/, '').replace(/^in\s+/, '');
  const m = t.match(/^([a-g])\s*([#b]?)\s*(m|min|maj|major|minor|dorian|phrygian|lydian|mixolydian|aeolian|locrian|harmonic minor|melodic minor)?$/);
  if (!m) return null;
  const tonic = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = m[3];
  const mode = !q || q === 'maj' || q === 'major' ? 'major' : q === 'm' || q === 'min' || q === 'minor' || q === 'aeolian' ? 'minor' : q;
  return { tonic, mode };
}

/** "122 bpm", "bpm 122", "tempo 96", "at 140" → tempo. */
export function readTempo(text: string): number | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/^(?:tempo|bpm)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)(?:\s*bpm)?$/) ?? t.match(/^(\d{2,3}(?:\.\d+)?)\s*bpm$/);
  if (!m) return null;
  const bpm = Number(m[1]);
  return bpm >= 30 && bpm <= 300 ? bpm : null;
}

/** "6/8", "time 3/4", "in 5/4", "waltz time" → meter. */
export function readMeter(text: string): [number, number] | null {
  const t = text.trim().toLowerCase();
  if (/^waltz(?: time)?$/.test(t)) return [3, 4];
  const m = t.match(/^(?:(?:time|meter|time signature)\s*[:=]?\s*|in\s+)?(\d{1,2})\s*\/\s*(2|4|8|16)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 15 ? [n, Number(m[2])] : null;
}

/** "3:30", "3 min", "90 seconds", "2 minutes 15" → seconds. */
export function readDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  let m = t.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)(?:\s*(\d{1,2})(?:\s*(?:s|sec|seconds?))?)?(?:\s+long)?$/);
  if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0));
  m = t.match(/^(\d+)\s*(?:s|sec|secs|seconds?)(?:\s+long)?$/);
  if (m) return Number(m[1]);
  return null;
}

const DYNAMICS: [RegExp, Dynamic][] = [
  [/^(pp|pianissimo|very (?:soft|quiet))$/, 'pp'], [/^(p|piano dynamic|soft|quiet|gentle)$/, 'p'],
  [/^(mp|mezzo[- ]piano)$/, 'mp'], [/^(mf|mezzo[- ]forte)$/, 'mf'],
  [/^(f|forte|loud|strong)$/, 'f'], [/^(ff|fortissimo|very loud|full power|explosive)$/, 'ff'],
];
export function readDynamic(text: string): Dynamic | null {
  const t = text.trim().toLowerCase();
  return DYNAMICS.find(([re]) => re.test(t))?.[1] ?? null;
}

// ─── Syllables ──────────────────────────────────────────────────────────────────

/**
 * Split one word into singable syllables. A rules reader, good enough to place one note per
 * syllable; the vocal engine's own phoneme pass refines it. A word the writer hyphenated
 * ("wo-o-ord", "ev-ry") is taken exactly as written.
 */
export function syllabify(word: string): string[] {
  if (word.includes('-')) { const parts = word.split('-').filter(Boolean); if (parts.length) return parts; }
  const w = word;
  const lower = w.toLowerCase();
  const letters = lower.replace(/[^a-z']/g, '');
  if (!letters) return [w];
  // Vowel groups are the nuclei.
  const nuclei: { start: number; end: number }[] = [];
  const re = /[aeiouy]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) nuclei.push({ start: m.index, end: m.index + m[0].length });
  // Silent final e ("love", "time"), but not "-le" after a consonant ("little") or "the"/"be".
  if (nuclei.length > 1) {
    const last = nuclei[nuclei.length - 1];
    const tail = lower.slice(last.start).replace(/[^a-z]/g, '');
    const before = lower[last.start - 1];
    if (tail === 'e' && before && !/[aeiouy]/.test(before) && !(before === 'l' && /[^aeiouy]/.test(lower[last.start - 2] ?? 'a'))) nuclei.pop();
    else if (/^es?$/.test(tail) && tail === 'es' && before && !/[sxz]|h/.test(before)) nuclei.pop();
    else if (tail === 'ed' && before && !/[td]/.test(before)) nuclei.pop();
  }
  if (nuclei.length <= 1) return [w];
  // Cut between nuclei: a single consonant goes with the next syllable, a cluster is split.
  const cuts: number[] = [];
  for (let i = 0; i < nuclei.length - 1; i++) {
    const gapStart = nuclei[i].end, gapEnd = nuclei[i + 1].start;
    const gap = gapEnd - gapStart;
    cuts.push(gap <= 1 ? gapStart : gapStart + Math.floor(gap / 2));
  }
  const out: string[] = [];
  let at = 0;
  for (const c of cuts) { out.push(w.slice(at, c)); at = c; }
  out.push(w.slice(at));
  return out.filter(Boolean);
}

function readWord(raw: string): ParsedWord | null {
  let t = raw;
  const marks: WordMark[] = [];
  if (/^\*.+\*$/.test(t)) { marks.push('emphasis'); t = t.slice(1, -1); }
  if (t.startsWith('^')) { marks.push('accent'); t = t.slice(1); }
  // Trailing punctuation stays with the word for the lyric sheet; marks sit before it.
  const tail = t.match(/[.,!?;:…"”’)]*$/)?.[0] ?? '';
  let core = tail ? t.slice(0, t.length - tail.length) : t;
  if (core.endsWith('~')) { marks.push('hold'); core = core.replace(/~+$/, ''); }
  if (!core.replace(/[^\p{L}\p{N}']/gu, '')) return null;
  const hyphenated = /\p{L}-\p{L}/u.test(core);
  // "wo-o-ord" (a repeated vowel across hyphens) is a melisma; "twenty-one" is just two words joined.
  if (hyphenated && /(\p{L})-\1/u.test(core.toLowerCase())) marks.push('melisma');
  const syllables = syllabify(core);
  const text = (marks.includes('melisma') ? core.replace(/-/g, '') : core) + tail;
  return { text, syllables, marks };
}

/** One lyric line → words, syllables, ad-libs and inline delivery tags. */
export function readLine(raw: string): ParsedLine {
  const adlibs: string[] = [];
  const delivery: string[] = [];
  let t = raw.replace(/\(([^)]*)\)/g, (_, a: string) => { if (a.trim()) adlibs.push(a.trim()); return ' '; });
  t = t.replace(/\[([^\]]*)\]/g, (_, d: string) => { if (d.trim()) delivery.push(d.trim().toLowerCase()); return ' '; });
  const words: ParsedWord[] = [];
  for (const tok of t.split(/\s+/).filter(Boolean)) {
    if (tok === '/' || tok === '//') { const prev = words[words.length - 1]; if (prev && !prev.marks.includes('breath-after')) prev.marks.push('breath-after'); continue; }
    const w = readWord(tok);
    if (w) words.push(w);
  }
  return {
    text: words.map((w) => w.text).join(' '),
    words, adlibs, delivery,
    syllables: words.reduce((n, w) => n + w.syllables.length, 0),
  };
}

// ─── Section tags ───────────────────────────────────────────────────────────────

const SECTION_WORDS: [RegExp, SectionKind][] = [
  [/^(pre[- ]?chorus|pre|lift|climb)$/, 'prechorus'],
  [/^(post[- ]?chorus)$/, 'postchorus'],
  [/^(intro|introduction|opening|prelude|overture)$/, 'intro'],
  [/^(verse|rap verse|v)$/, 'verse'],
  [/^(chorus|refrain chorus|final chorus|last chorus|double chorus)$/, 'chorus'],
  [/^(refrain)$/, 'refrain'],
  [/^(hook)$/, 'hook'],
  [/^(bridge|middle 8|middle eight)$/, 'bridge'],
  [/^(build|build[- ]?up|buildup|riser|rise)$/, 'build'],
  [/^(drop|second drop|final drop|bass drop|beat drop)$/, 'drop'],
  [/^(break|breakdown|break[- ]?down)$/, 'breakdown'],
  [/^(solo)$/, 'solo'],
  [/^(interlude|transition|turnaround|vamp)$/, 'interlude'],
  [/^(instrumental|inst|instrumental break|instrumental interlude)$/, 'instrumental'],
  [/^(outro|ending|tag|outro chorus)$/, 'outro'],
  [/^(theme|main theme|exposition|a section|a)$/, 'theme'],
  [/^(development|b section|b|variation)$/, 'development'],
  [/^(recap|recapitulation|reprise|return)$/, 'recap'],
  [/^(coda|finale)$/, 'coda'],
  [/^(head|head in|head out|melody)$/, 'head'],
  [/^(cue|scene)$/, 'cue'],
];

const ACTION_WORDS: [RegExp, string][] = [
  [/^(fade ?out|fade)$/, 'fade-out'], [/^(end|stop|hard stop|cold ending)$/, 'end'],
  [/^(key change|modulation|modulate(?: up)?)$/, 'key-change'], [/^(tempo change|double time|half time|half-time|double-time)$/, 'tempo-feel'],
  [/^(silence|pause|beat of silence)$/, 'silence'],
];

const VOICE_WORDS = /^(?:(female|male|woman|man|girl|boy|duet|mixed|group|gang|choir|crowd)\s+)?(vocals?|voice|singer|singing|rap|rapper|rapping|spoken(?: word)?|whisper(?:ed|s|ing)?|belt(?:ed|ing)?|falsetto|harmon(?:y|ies)|scat(?:ting)?|ad-?libs?|humming|chant(?:ing|ed)?|shout(?:ed|ing)?|growl(?:ed)?|vocoder|auto-?tune(?:d)?|operatic|choir|backing vocals?|call and response)$/;

function sectionOf(head: string): { kind: SectionKind; ordinal?: number; feature?: string } | null {
  let t = head.trim().toLowerCase().replace(/\s+/g, ' ');
  let ordinal: number | undefined;
  const num = t.match(/^(.*?)[ #]*(\d{1,2})$/);
  if (num && num[1].trim()) { t = num[1].trim(); ordinal = Number(num[2]); }
  const direct = SECTION_WORDS.find(([re]) => re.test(t));
  if (direct) return { kind: direct[1], ordinal };
  // "guitar solo", "sax solo", "piano intro", "drum break", "string interlude"
  const m = t.match(/^(.+?)\s+(solo|intro|outro|break|breakdown|interlude|instrumental|bridge|vamp)$/);
  if (m) {
    const tail = SECTION_WORDS.find(([re]) => re.test(m[2]))!;
    return { kind: tail[1], ordinal, feature: m[1] };
  }
  return null;
}

/** A chord chart typed in braces: "{Fm9 | Bbm7 Eb7 | Abmaj7 | C7}" → bars of chord symbols. */
export function readChart(text: string): string[][] | null {
  const bars = text.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean)).filter((b) => b.length);
  if (!bars.length) return null;
  const ok = bars.every((b) => b.every((c) => c === '%' || /^[A-G][#b]?[A-Za-z0-9#b+°ø()\-]*(?:\/[A-G][#b]?)?$/.test(c)));
  if (!ok) return null;
  // "%" repeats the previous bar.
  return bars.map((b, i) => (b.length === 1 && b[0] === '%' && i > 0 ? bars[i - 1] : b));
}

interface TagRead {
  section?: Omit<ParsedSection, 'lines' | 'instrumental'>;
  action?: string;
  directive?: Partial<StyleDirectives>;
  voice?: string;
  unknown?: string;
}

/** Read one bracket tag standing on its own line. */
export function readTag(inner: string): TagRead {
  const parts = inner.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { unknown: inner };
  // "Solo: tenor sax", "Verse 1: whispered", "Key: F minor"
  const [headRaw, ...rest] = parts;
  const colon = headRaw.indexOf(':');
  const head = colon >= 0 ? headRaw.slice(0, colon).trim() : headRaw;
  const afterColon = colon >= 0 ? headRaw.slice(colon + 1).split(',').map((s) => s.trim()).filter(Boolean) : [];

  if (/^key$/i.test(head) && afterColon.length) { const k = readKey(afterColon.join(' ')); if (k) return { directive: { key: k } }; }
  if (/^(tempo|bpm)$/i.test(head) && afterColon.length) { const b = readTempo(`tempo ${afterColon[0].replace(/\s*bpm$/i, '')}`); if (b) return { directive: { bpm: b } }; }
  if (/^(time|meter|time signature)$/i.test(head) && afterColon.length) { const mt = readMeter(afterColon[0]); if (mt) return { directive: { meter: mt } }; }
  const whole = headRaw.toLowerCase();
  const bare = readTempo(whole) ? { bpm: readTempo(whole)! } : readMeter(whole) ? { meter: readMeter(whole)! } : null;
  if (bare && !rest.length) return { directive: bare };

  const sec = sectionOf(head);
  if (sec) {
    const out: Omit<ParsedSection, 'lines' | 'instrumental'> = {
      kind: sec.kind, ordinal: sec.ordinal, feature: sec.feature, modifiers: [],
      label: head.replace(/\s+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase()),
    };
    const extras = [...afterColon, ...rest.flatMap((r) => r.split(',').map((s) => s.trim()).filter(Boolean))];
    // In "[Solo: tenor sax]" the first word after the colon names who takes it.
    if (colon >= 0 && (sec.kind === 'solo' || sec.kind === 'instrumental' || sec.kind === 'interlude') && afterColon.length && !out.feature) {
      out.feature = afterColon[0].toLowerCase();
      extras.shift();
    }
    for (const e of extras) {
      const bars = e.toLowerCase().match(/^(\d{1,3})\s*(?:bars?|measures?)$/);
      if (bars) { out.bars = Math.max(1, Math.min(128, Number(bars[1]))); continue; }
      const dyn = readDynamic(e);
      if (dyn) { out.dynamic = dyn; continue; }
      out.modifiers.push(e.toLowerCase());
    }
    return { section: out };
  }
  const action = ACTION_WORDS.find(([re]) => re.test(whole));
  if (action) return { action: whole.replace(/\s+/g, '-') === action[1] ? action[1] : `${action[1]}:${whole}` };
  if (VOICE_WORDS.test(whole)) return { voice: whole };
  return { unknown: inner.trim() };
}

// ─── Style line ─────────────────────────────────────────────────────────────────

const NO_VOCALS = /^(instrumental|instrumental only|no vocals?|no singing|no lyrics|without vocals?|wordless)$/;

export function parseStyle(raw: string): ParsedStyle {
  const style: ParsedStyle = { raw: raw.trim(), tags: [], exclude: [], directives: {}, vocal: { presence: 'unspecified', styles: [] } };
  const pieces = raw.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
  for (const piece of pieces) {
    const p = piece.toLowerCase().replace(/\s+/g, ' ');
    const bpm = readTempo(p); if (bpm) { style.directives.bpm = bpm; continue; }
    const meter = readMeter(p); if (meter) { style.directives.meter = meter; continue; }
    const dur = readDuration(p); if (dur) { style.directives.durationSec = dur; continue; }
    // A bare letter ("a", "e") is a word, not a key: require a quality or an accidental, or "key of".
    if (/^(?:in\s+)?(?:the\s+)?key\b/.test(p) || /^(?:in\s+)?[a-g](?:[#b♯♭]| ?(?:flat|sharp))?\s*(?:m|min|maj|major|minor|dorian|phrygian|lydian|mixolydian|aeolian|locrian)$/.test(p)) {
      const key = readKey(p); if (key) { style.directives.key = key; continue; }
    }
    if (NO_VOCALS.test(p)) { style.vocal.presence = 'none'; style.tags.push('instrumental'); continue; }
    const neg = p.match(/^(?:no|without|minus|-)\s*(.+)$/);
    if (neg) { style.exclude.push(neg[1]); continue; }
    const v = p.match(VOICE_WORDS);
    if (v) {
      if (style.vocal.presence !== 'none') style.vocal.presence = 'lead';
      if (v[1]) style.vocal.gender = /female|woman|girl/.test(v[1]) ? 'female' : /^(male|man|boy)$/.test(v[1]) ? 'male' : 'mixed';
      if (!/^(vocals?|voice|singer|singing)$/.test(v[2])) style.vocal.styles.push(v[2]);
    }
    style.tags.push(p);
  }
  if (style.exclude.some((e) => /^(vocals?|singing|lyrics|voice)$/.test(e))) style.vocal.presence = 'none';
  return style;
}

// ─── The whole prompt ───────────────────────────────────────────────────────────

/**
 * Parse a song prompt. Either pass the two boxes people know from Suno (`style` and `lyrics`), or
 * one text: everything before the first [Section] tag is the style, the rest is the song.
 */
export function parseSongPrompt(input: string | { style?: string; lyrics?: string; title?: string }): ParsedSongPrompt {
  let styleText = '', lyricText = '', title: string | undefined;
  if (typeof input === 'string') {
    const lines = input.replace(/\r/g, '').split('\n');
    const first = lines.findIndex((l) => /^\s*\[[^\]]+\]\s*$/.test(l) || /^\s*\{[^}]+\}\s*$/.test(l));
    styleText = (first < 0 ? lines : lines.slice(0, first)).join('\n');
    lyricText = first < 0 ? '' : lines.slice(first).join('\n');
  } else {
    styleText = input.style ?? ''; lyricText = input.lyrics ?? ''; title = input.title?.trim() || undefined;
  }
  const tm = styleText.match(/^\s*title\s*:\s*(.+)$/im);
  if (tm) { title = title ?? tm[1].trim(); styleText = styleText.replace(tm[0], ''); }

  const style = parseStyle(styleText);
  const out: ParsedSongPrompt = { title, style, sections: [], actions: [], unknownTags: [] };
  let current: ParsedSection | null = null;
  const open = (s: Omit<ParsedSection, 'lines' | 'instrumental'>) => { current = { ...s, lines: [], instrumental: false }; out.sections.push(current); };

  for (const rawLine of lyricText.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const chart = line.match(/^\{([^}]+)\}$/);
    if (chart) {
      const bars = readChart(chart[1]);
      if (bars) { if (!current) open({ kind: 'verse', label: 'Verse', modifiers: [] }); current!.chart = [...(current!.chart ?? []), ...bars]; }
      else out.unknownTags.push(line);
      continue;
    }
    const tag = line.match(/^\[([^\]]+)\]$/);
    if (tag) {
      const r = readTag(tag[1]);
      if (r.section) open(r.section);
      else if (r.directive) Object.assign(style.directives, r.directive);
      else if (r.action) out.actions.push({ afterSection: out.sections.length - 1, action: r.action });
      else if (r.voice) {
        // A voice tag on its own line colours the section it sits in (or the whole song before any).
        if (current) (current as ParsedSection).modifiers.push(r.voice);
        else { if (style.vocal.presence !== 'none') style.vocal.presence = 'lead'; style.vocal.styles.push(r.voice); }
      } else if (r.unknown) {
        // Unknown tags inside a section are kept as modifiers so nothing typed is lost.
        if (current) (current as ParsedSection).modifiers.push(r.unknown.toLowerCase());
        out.unknownTags.push(r.unknown);
      }
      continue;
    }
    if (!current) open({ kind: 'verse', label: 'Verse', modifiers: [] });
    const parsed = readLine(line);
    if (parsed.words.length || parsed.adlibs.length) current!.lines.push(parsed);
  }

  for (const s of out.sections) {
    const sung = s.lines.some((l) => l.words.length > 0);
    s.instrumental = !sung;
  }
  if (out.sections.some((s) => !s.instrumental) && style.vocal.presence === 'unspecified') style.vocal.presence = 'lead';
  return out;
}

/** Write the lyric sheet back as text, for the editor and for audio models that read tagged lyrics. */
export function writeLyrics(sections: ParsedSection[], opts: { instrumentalTag?: boolean } = {}): string {
  const blocks: string[] = [];
  for (const s of sections) {
    const head = `[${s.label}]`;
    const body = s.lines.map((l) => [l.text, ...l.adlibs.map((a) => `(${a})`)].filter(Boolean).join(' '));
    if (s.instrumental && !body.length && opts.instrumentalTag && !['instrumental', 'solo', 'intro', 'outro', 'build', 'drop', 'breakdown', 'interlude'].includes(s.kind)) blocks.push(`${head}\n[Instrumental]`);
    else blocks.push([head, ...body].join('\n'));
  }
  return blocks.join('\n\n');
}

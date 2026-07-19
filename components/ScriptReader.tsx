// ScriptReader — Lorea's read-only script experience.
//
// WHY THIS IS A SEPARATE COMPONENT (and not a `readOnly` prop on
// ScriptWritingStudio):
//
// ScriptWritingStudio is ~1,500 lines that own Firestore autosave, world
// linking, AI generation, revision colours, drag reordering and a keyboard
// system, all wired through live <textarea> elements. A `readOnly` flag would
// have to defuse every one of those paths, and a single missed path is a write
// into the reader's own script library. This component renders <div>s — there
// is no textarea, no contentEditable, no Firestore import, and no save path
// anywhere in the file — so it is non-editable by construction rather than by
// configuration. It reuses the studio's screenplay page geometry and element
// style map so the page still reads like Lorea.
//
// Text is fetched from Project Gutenberg through the app's existing first-party
// `/api/proxy` endpoint. Gutenberg sends no Access-Control-Allow-Origin header,
// so a direct browser fetch is blocked by CORS — verified, see the report in
// data/publicDomainScripts.ts for the licence position.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Search, X, List, Loader2, AlertCircle, ExternalLink,
  Minus, Plus, BookOpen, ScrollText, ShieldCheck, ChevronRight,
} from 'lucide-react';
import { screenplayFromText } from '../services/documentImport';
import type { ScriptElement, ScriptElementType } from '../types';
import type { PublicDomainScript } from '../data/publicDomainScripts';
import { PD_LICENSE_STATEMENT, TRADITION_BY_ID } from '../data/publicDomainScripts';

// ── Text preparation ─────────────────────────────────────────────────────────

/** Drop the Project Gutenberg licence header and footer around the work itself. */
function stripGutenbergBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');
  const start = text.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
  if (start && start.index != null) text = text.slice(start.index + start[0].length);
  const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
  if (end && end.index != null) text = text.slice(0, end.index);
  // Gutenberg often follows the start marker with a transcriber credit block.
  return text.replace(/^\s*(?:Produced by|Transcribed from|E-text prepared by)[^\n]*\n/i, '').trim();
}

const CUE_STOPWORDS = /^(ACT|SCENE|PROLOGUE|EPILOGUE|INDUCTION|ENTER|EXIT|EXEUNT|CURTAIN|THE END|FINIS|DRAMATIS|PERSONS|CHARACTERS|CONTENTS|NOTE|PREFACE)\b/;

/** Structural headers that anchor the reader's navigator. */
const NAV_PREFIX = /^(ACT|SCENE|PROLOGUE|EPILOGUE|INDUCTION|PART|CHAPTER)\b/i;

/**
 * An all-caps speaker cue on its own line, as printed in play texts. Editions
 * variously terminate the cue with a period or a colon, and may hang a stage
 * direction off it (`CYRANO (bounding on to him):`) — all of which is stripped
 * before the all-caps test.
 */
function isPlayCue(line: string): boolean {
  const t = line.trim()
    .replace(/[.:]+$/, '')
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/[.:]+$/, '');
  if (!t || t.length > 38) return false;
  if (/[a-z]/.test(t)) return false;
  if (!/[A-Z]{2}/.test(t)) return false;
  if (CUE_STOPWORDS.test(t)) return false;
  if (/[!?,:;"]$/.test(t)) return false;
  return true;
}

/** `MRS. ALVING. I say that…` / `COUNTY ATTORNEY: This feels good.` — cue and speech share a line. */
const INLINE_CUE = /^([A-Z][A-Z0-9 .'’\-]{1,30})[.:]\s+(\S.*)$/;

/** `ANNA--[In a subdued voice.] Then all the others…` — O'Neill's em-dash cues. */
const DASH_CUE = /^([A-Z][A-Z0-9 .'’]{1,30})--\s*(\S.*)$/;

/**
 * `Rom. Thou wast neuer with mee…` (Folio abbreviations) and `Seward: I
 * appreciate your kindness…` (italicised cues, once the emphasis underscores
 * are stripped). Both are Title-case and so indistinguishable from an ordinary
 * sentence on a single line. They are identified statistically instead: a short
 * capitalised token that opens dozens of lines in the same text is a speaker,
 * not prose.
 */
const ABBREV_CUE = /^([A-Z][A-Za-z'’]{1,14})[.:]\s+(\S.*)$/;
const ABBREV_BLOCKLIST = new Set([
  'Mr', 'Mrs', 'Ms', 'Dr', 'St', 'Sir', 'No', 'Vol', 'Ch', 'Etc', 'Fig', 'Ibid',
  'Enter', 'Exit', 'Exeunt', 'Scene', 'Act', 'Note', 'The', 'And', 'But', 'For',
  'He', 'She', 'It', 'They', 'We', 'You', 'I', 'A', 'An', 'In', 'On', 'At', 'To',
]);
const ABBREV_MIN_OCCURRENCES = 8;

/** Tokens that open enough lines in this text to be speaker cues. */
function detectAbbreviatedCues(lines: string[]): Set<string> {
  const freq = new Map<string, number>();
  for (const line of lines) {
    const m = line.trim().match(ABBREV_CUE);
    if (!m || ABBREV_BLOCKLIST.has(m[1])) continue;
    freq.set(m[1], (freq.get(m[1]) ?? 0) + 1);
  }
  const cues = new Set<string>();
  for (const [token, n] of freq) if (n >= ABBREV_MIN_OCCURRENCES) cues.add(token);
  return cues;
}

/**
 * Nudge a printed stage-play text into the shape the screenplay parser expects.
 * Printed editions vary in three ways that all defeat the parser's heuristics:
 *
 *   1. cues carry a trailing period      — `HAMLET.`
 *   2. a blank line sits between the cue and its speech, so the parser sees a
 *      one-line block and files it as action (this is how the Gutenberg
 *      Glaspell and several O'Neill editions are set)
 *   3. cue and speech share a line       — `MRS PETERS: I'm not--cold.`
 *
 * All three are normalised to `CUE\nspeech`. Nothing is discarded — only
 * whitespace, emphasis underscores and the cue's own punctuation change.
 */
function normalisePlayText(text: string): string {
  const lines = text.replace(/_([^_\n]{1,200})_/g, '$1').split('\n');
  const abbrevCues = detectAbbreviatedCues(lines);
  const out: string[] = [];

  const pushCue = (cue: string) => {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push(cue);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // (3) inline cue — split it so the cue owns its own line.
    const dash = trimmed.match(DASH_CUE);
    if (dash && isPlayCue(dash[1])) {
      pushCue(dash[1].trim().replace(/[.:]+$/, ''));
      out.push(dash[2]);
      continue;
    }
    const inline = trimmed.match(INLINE_CUE);
    if (inline && isPlayCue(inline[1])) {
      pushCue(inline[1].trim().replace(/[.:]+$/, ''));
      out.push(inline[2]);
      continue;
    }

    // (3b) Folio-style abbreviated cue, confirmed by frequency across the text.
    const abbrev = trimmed.match(ABBREV_CUE);
    if (abbrev && abbrevCues.has(abbrev[1])) {
      pushCue(abbrev[1].toUpperCase());
      out.push(abbrev[2]);
      continue;
    }

    if (isPlayCue(trimmed)) {
      // (2) look past up to two blank lines for the speech this cue introduces.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '' && j - i <= 3) j++;
      const following = (lines[j] ?? '').trim();
      // Only bind the cue if what follows is actually speech, not another cue
      // or a structural header — otherwise leave the line untouched.
      if (following && !isPlayCue(following) && !NAV_PREFIX.test(following)) {
        pushCue(trimmed.replace(/[.:]+$/, ''));
        i = j - 1; // the blank lines between cue and speech are dropped
        continue;
      }
    }

    out.push(line);
  }
  return out.join('\n');
}

/**
 * Promote act / scene headers into SECTION elements so the navigator has a
 * table of contents to build from. The parser files them as ACTION when they
 * stand alone, and as CHARACTER when a contents line happens to follow — in
 * the latter case that trailing "dialogue" is demoted back to action.
 */
function promoteActsAndScenes(els: ScriptElement[]): ScriptElement[] {
  const isHeader = (el: ScriptElement) => {
    const t = el.text.trim();
    return !t.includes('\n') && t.length <= 70 && NAV_PREFIX.test(t);
  };
  const out = els.map(el => ({ ...el }));
  for (let i = 0; i < out.length; i++) {
    const el = out[i];
    if (el.type === 'ACTION' && isHeader(el)) {
      el.type = 'SECTION' as ScriptElementType;
    } else if (el.type === 'CHARACTER' && isHeader(el)) {
      el.type = 'SECTION' as ScriptElementType;
      const next = out[i + 1];
      if (next && next.type === 'DIALOGUE') next.type = 'ACTION' as ScriptElementType;
    }
  }
  return out;
}

const LINES_PER_PAGE = 55;

function estimatePages(elements: ScriptElement[]): number {
  let lines = 0;
  for (const el of elements) {
    if (el.type === 'SCENE_HEADING' || el.type === 'TRANSITION') { lines += 2; continue; }
    if (el.type === 'SECTION' || el.type === 'NOTE') continue;
    const charsPerLine = el.type === 'DIALOGUE' ? 35 : el.type === 'ACTION' ? 60 : 35;
    lines += Math.max(1, Math.ceil((el.text.length || 1) / charsPerLine)) + 1;
  }
  return Math.max(1, Math.round(lines / LINES_PER_PAGE));
}

// ── Element styling (mirrors ScriptWritingStudio.elStyle) ────────────────────

function elStyle(type: ScriptElementType, scale: number): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
    fontSize: `${12 * scale}pt`,
    lineHeight: '1.5',
    color: '#111',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    display: 'block',
    width: '100%',
  };
  switch (type) {
    case 'SCENE_HEADING': return { ...base, textTransform: 'uppercase', fontWeight: 'bold', paddingTop: '24px' };
    case 'ACTION':        return { ...base, paddingTop: '12px' };
    case 'CHARACTER':     return { ...base, marginLeft: '37%', width: '26%', textTransform: 'uppercase', paddingTop: '12px' };
    case 'DIALOGUE':      return { ...base, marginLeft: '23%', width: '54%' };
    case 'PARENTHETICAL': return { ...base, marginLeft: '28%', width: '44%', fontStyle: 'italic' };
    case 'TRANSITION':    return { ...base, textAlign: 'right', textTransform: 'uppercase', paddingTop: '12px', paddingBottom: '12px' };
    case 'SHOT':          return { ...base, textTransform: 'uppercase', fontWeight: 'bold', paddingTop: '12px' };
    case 'SECTION':       return { ...base, color: '#FF8C00', fontWeight: 'bold', paddingTop: '24px', textTransform: 'uppercase' };
    case 'NOTE':          return { ...base, color: '#888', fontStyle: 'italic', fontSize: `${10 * scale}pt` };
    default:              return base;
  }
}

/** Render an element's text with every match of `query` marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const needle = query.trim().toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const haystack = text.toLowerCase();
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at < 0) break;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={`${at}`} style={{ background: 'rgba(255,140,0,0.35)', color: 'inherit', padding: 0 }}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    cursor = at + needle.length;
  }
  if (!parts.length) return <>{text}</>;
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// ── Fetching ─────────────────────────────────────────────────────────────────

/** Module-level cache so re-opening a script is instant within a session. */
const textCache = new Map<string, string>();

async function fetchScriptText(script: PublicDomainScript, signal: AbortSignal): Promise<string> {
  const cached = textCache.get(script.id);
  if (cached) return cached;

  // Gutenberg serves no CORS header, so the browser cannot fetch it directly.
  // Route through the app's existing first-party proxy (same one BookReader and
  // the podcast/RSS readers use).
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(script.textUrl)}`, { signal });
  if (!res.ok) throw new Error(`Couldn’t reach Project Gutenberg (${res.status}).`);
  const raw = await res.text();
  if (raw.length < 500) throw new Error('The source returned an unexpectedly short file.');
  textCache.set(script.id, raw);
  return raw;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  script: PublicDomainScript;
  onBack: () => void;
}

const SCALES = [0.85, 1, 1.15, 1.35, 1.6];

const ScriptReader: React.FC<Props> = ({ script, onBack }) => {
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  const [error, setError] = useState<string>('');
  const [elements, setElements] = useState<ScriptElement[]>([]);
  const [scaleIdx, setScaleIdx] = useState(1);
  const [showNav, setShowNav] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const elRefs = useRef(new Map<string, HTMLDivElement>());
  const scale = SCALES[scaleIdx];
  const tradition = TRADITION_BY_ID[script.tradition];

  useEffect(() => {
    const ac = new AbortController();
    setStatus('LOADING');
    setError('');
    (async () => {
      try {
        const raw = await fetchScriptText(script, ac.signal);
        const body = normalisePlayText(stripGutenbergBoilerplate(raw));
        const parsed = promoteActsAndScenes(screenplayFromText(body));
        if (ac.signal.aborted) return;
        setElements(parsed);
        setStatus('READY');
      } catch (e: any) {
        if (ac.signal.aborted) return;
        setError(e?.message || 'Couldn’t load this script.');
        setStatus('ERROR');
      }
    })();
    return () => ac.abort();
  }, [script]);

  const pages = useMemo(() => estimatePages(elements), [elements]);

  const navItems = useMemo(
    () => elements
      .map((el, i) => ({ el, i }))
      .filter(({ el }) => el.type === 'SECTION' || el.type === 'SCENE_HEADING')
      .map(({ el, i }) => ({ id: el.id, index: i, label: el.text.trim().replace(/\s+/g, ' ').slice(0, 60) })),
    [elements],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as string[];
    return elements.filter(el => el.text.toLowerCase().includes(q)).map(el => el.id);
  }, [elements, query]);

  const scrollTo = useCallback((id: string) => {
    const node = elRefs.current.get(id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => { setMatchIdx(0); }, [query]);

  const jumpToMatch = (dir: 1 | -1) => {
    if (!matches.length) return;
    const next = (matchIdx + dir + matches.length) % matches.length;
    setMatchIdx(next);
    scrollTo(matches[next]);
  };

  const refFor = (id: string) => (node: HTMLDivElement | null) => {
    if (node) elRefs.current.set(id, node);
    else elRefs.current.delete(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-[#0a0812] text-white flex flex-col"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-black/70 backdrop-blur-xl border-b border-white/5">
        <div className="px-3 py-2.5 flex items-center gap-2">
          <button onClick={onBack}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-black truncate">{script.title}</h1>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest truncate">
              {script.author}{script.translator ? ` · trans. ${script.translator}` : ''} · {script.year}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowNav(v => !v)} title="Scenes"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showNav ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 hover:bg-white/10'}`}>
              <List size={15} />
            </button>
            <button onClick={() => { setShowSearch(v => !v); setQuery(''); }} title="Search"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showSearch ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 hover:bg-white/10'}`}>
              {showSearch ? <X size={15} /> : <Search size={15} />}
            </button>
            <div className="hidden sm:flex items-center gap-0.5 bg-white/5 rounded-full p-0.5">
              <button onClick={() => setScaleIdx(i => Math.max(0, i - 1))} disabled={scaleIdx === 0}
                title="Smaller text"
                className="w-8 h-8 rounded-full hover:bg-white/10 disabled:opacity-30 flex items-center justify-center transition-all">
                <Minus size={13} />
              </button>
              <span className="text-[9px] font-black tabular-nums text-white/50 w-8 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScaleIdx(i => Math.min(SCALES.length - 1, i + 1))} disabled={scaleIdx === SCALES.length - 1}
                title="Larger text"
                className="w-8 h-8 rounded-full hover:bg-white/10 disabled:opacity-30 flex items-center justify-center transition-all">
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Read-only + provenance strip */}
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-white/50">
            <ScrollText size={9} /> Read-only
          </span>
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300/80">
            <ShieldCheck size={9} /> {script.license}
          </span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 ${tradition?.accent ?? 'text-white/50'}`}>
            {tradition?.label}
          </span>
          {status === 'READY' && (
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-white/40 tabular-nums">
              ≈{pages} pages
            </span>
          )}
          <a href={script.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-white/50 transition-all">
            <ExternalLink size={9} /> Source
          </a>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="px-3 pb-2.5 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white/5 rounded-full px-3 py-2">
              <Search size={13} className="text-white/30 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') jumpToMatch(e.shiftKey ? -1 : 1); }}
                placeholder="Search this script…"
                className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-white/25"
              />
              {query.trim().length >= 2 && (
                <span className="text-[9px] font-black text-white/40 tabular-nums shrink-0">
                  {matches.length ? `${matchIdx + 1} / ${matches.length}` : 'none'}
                </span>
              )}
            </div>
            <button onClick={() => jumpToMatch(-1)} disabled={!matches.length}
              className="px-3 py-2 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 text-[9px] font-black uppercase tracking-widest transition-all">Prev</button>
            <button onClick={() => jumpToMatch(1)} disabled={!matches.length}
              className="px-3 py-2 rounded-full bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-[9px] font-black uppercase tracking-widest transition-all">Next</button>
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">

        {/* Scene navigator */}
        {showNav && (
          <div className="w-60 shrink-0 border-r border-white/5 bg-black/40 overflow-y-auto custom-scrollbar hidden md:block">
            <div className="px-3 py-3 sticky top-0 bg-black/60 backdrop-blur-xl border-b border-white/5">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
                Navigate · {navItems.length} marks
              </p>
            </div>
            {navItems.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-white/30 leading-relaxed">
                No act or scene markers were found in this edition — scroll or use search instead.
              </p>
            ) : (
              <div className="py-2">
                {navItems.map(item => (
                  <button key={item.id} onClick={() => scrollTo(item.id)}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 transition-all flex items-center gap-2 group">
                    <ChevronRight size={11} className="text-white/20 group-hover:text-amber-400 shrink-0 transition-colors" />
                    <span className="text-[11px] text-white/60 group-hover:text-white truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Script paper */}
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
          {status === 'LOADING' && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-white/40">
              <Loader2 size={22} className="animate-spin text-amber-400" />
              <p className="text-[10px] font-black uppercase tracking-widest">Fetching from Project Gutenberg</p>
              <p className="text-[11px] text-white/25">{script.title}</p>
            </div>
          )}

          {status === 'ERROR' && (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertCircle size={22} className="text-red-400" />
              <p className="text-sm font-black">Couldn’t load this script</p>
              <p className="text-[11px] text-white/40 max-w-sm leading-relaxed">{error}</p>
              <a href={script.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-[9px] font-black uppercase tracking-widest transition-all">
                <ExternalLink size={11} /> Read at Project Gutenberg
              </a>
            </div>
          )}

          {status === 'READY' && (
            <div className="py-8 px-3 sm:px-4 flex justify-center">
              <div
                className="w-full bg-white shadow-2xl rounded-sm relative"
                style={{ maxWidth: '8.5in', minHeight: '11in', padding: '1in 1.5in' }}
              >
                {/* Title block */}
                <div className="text-center pb-8 mb-4 border-b border-black/10"
                     style={{ fontFamily: '"Courier Prime", Courier, monospace' }}>
                  <h2 className="uppercase font-bold text-black" style={{ fontSize: `${14 * scale}pt` }}>{script.title}</h2>
                  <p className="text-black mt-4" style={{ fontSize: `${12 * scale}pt` }}>by</p>
                  <p className="text-black" style={{ fontSize: `${12 * scale}pt` }}>{script.author}</p>
                  {script.translator && (
                    <p className="text-gray-500 mt-2" style={{ fontSize: `${10 * scale}pt` }}>
                      translated by {script.translator}
                    </p>
                  )}
                  <p className="text-gray-400 mt-4" style={{ fontSize: `${9 * scale}pt` }}>{script.year}</p>
                </div>

                {elements.map(el => (
                  <div key={el.id} ref={refFor(el.id)} style={elStyle(el.type, scale)}>
                    <Highlighted text={el.text} query={query} />
                  </div>
                ))}

                {/* Provenance footer — the licence claim travels with the text */}
                <div className="mt-16 pt-6 border-t border-black/10 text-gray-400"
                     style={{ fontFamily: '"Courier Prime", Courier, monospace', fontSize: '9pt', lineHeight: 1.6 }}>
                  <p className="uppercase tracking-widest font-bold text-gray-500 mb-2" style={{ fontSize: '8pt' }}>
                    Public domain · why you can read this here
                  </p>
                  <p>{script.licenseBasis}</p>
                  <p className="mt-2">{PD_LICENSE_STATEMENT}</p>
                  <p className="mt-2">
                    Source: Project Gutenberg eBook #{script.sourceId} — {script.sourceUrl}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile navigator drawer */}
        {showNav && (
          <div className="md:hidden fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" onClick={() => setShowNav(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0812] border-r border-white/10 overflow-y-auto custom-scrollbar"
                 onClick={e => e.stopPropagation()}>
              <div className="px-3 py-3 flex items-center justify-between border-b border-white/5">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Navigate</p>
                <button onClick={() => setShowNav(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                  <X size={14} />
                </button>
              </div>
              {navItems.length === 0 ? (
                <p className="px-3 py-4 text-[11px] text-white/30">No act or scene markers in this edition.</p>
              ) : navItems.map(item => (
                <button key={item.id} onClick={() => { scrollTo(item.id); setShowNav(false); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-white/5 flex items-center gap-2">
                  <BookOpen size={11} className="text-white/20 shrink-0" />
                  <span className="text-[11px] text-white/60 truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ScriptReader;

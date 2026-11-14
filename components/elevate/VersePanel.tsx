// components/elevate/VersePanel.tsx
// The scripture panel beside the Elevate player. One sheet of paper, not a dark frame around one:
// what is being read, the passages this source has gone through, and the text itself, set large
// enough to read across a room. It never invents a passage — it is empty until the stream (or the
// viewer) brings one, and it shows the scripture of the org's own faith.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Ear, EarOff, Maximize2, Search, Type, X } from 'lucide-react';
import { EV, EV_FONT } from './vellum';
import type { FaithId } from '../../data/sacredLibrary/readerCatalog';
import { SACRED_WORKS, worksForFaith } from '../../data/sacredLibrary/readerCatalog';
import { loadSacredSection } from '../../services/sacredReaderService';
import { getParallel } from '../../services/scriptureText';
import { formatRef, parseRef, parseRefId, refId as toRefId } from '../../services/scriptureRef';
import { EXTRA_ENGLISH_EDITIONS, TRANSLATIONS } from '../../services/bibleService';
import { formatTC } from '../../services/serviceNotes';
import { verseNotes } from '../../services/readerNotes';
import { FAITH_SCRIPTURE_NAME, type WatchPassage } from '../../services/watchScripture';
import type { FeedScriptureState } from '../../hooks/useFeedScripture';
import type { ReadingSpot } from '../../hooks/useReadAlong';
import { lineWords } from '../../services/readAlong';

// ── Reading surfaces ────────────────────────────────────────────────────────
// Clear is the default: flat warm paper, high-contrast ink. The Lectio papers stay one tap away.

export interface VerseSkin { id: string; label: string; bg: string; ink: string; muted: string; num: string; mark: string; line: string }

export const VERSE_SKINS: readonly VerseSkin[] = [
  { id: 'clear', label: 'Clear', bg: '#FBFAF7', ink: '#1D1A24', muted: '#6F6A7A', num: '#8A6A26', mark: 'rgba(226,194,126,0.30)', line: 'rgba(29,26,36,0.09)' },
  { id: 'dusk', label: 'Dusk', bg: '#17141D', ink: '#EEE9F3', muted: '#9B94A9', num: '#E2C27E', mark: 'rgba(226,194,126,0.15)', line: 'rgba(255,255,255,0.08)' },
  { id: 'vellum', label: 'Vellum', bg: 'radial-gradient(120% 90% at 30% 0%, #F7F1E2 0%, #EFE7D4 55%, #E7DDC6 100%)', ink: '#241E14', muted: '#7B7059', num: '#A8862E', mark: 'rgba(226,194,126,0.34)', line: 'rgba(36,30,20,0.12)' },
  { id: 'lamplight', label: 'Lamplight', bg: 'radial-gradient(120% 90% at 50% 0%, #2A2015 0%, #1B140C 60%, #120D07 100%)', ink: '#F0E2C6', muted: '#9A8A6C', num: '#E2C27E', mark: 'rgba(226,194,126,0.26)', line: 'rgba(240,226,198,0.1)' },
  { id: 'onion', label: 'Onion Skin', bg: 'linear-gradient(180deg, #FBFAF7 0%, #F3F2EE 100%)', ink: '#1E1E22', muted: '#77777F', num: '#8A7430', mark: 'rgba(160,140,60,0.28)', line: 'rgba(30,30,34,0.1)' },
  { id: 'night', label: 'Night', bg: 'linear-gradient(180deg, #0C0B12 0%, #08070C 100%)', ink: '#DED8EA', muted: '#6E6688', num: '#E2C27E', mark: 'rgba(226,194,126,0.2)', line: 'rgba(255,255,255,0.07)' },
];
export const DEFAULT_VERSE_SKIN = 'clear';
/** The Bible editions the panel offers: the shared list plus the public-domain modern English ones. */
export const PANEL_EDITIONS = [...TRANSLATIONS, ...EXTRA_ENGLISH_EDITIONS];
export const editionLabel = (slug: string) => PANEL_EDITIONS.find(t => t.slug === slug)?.label ?? slug;
export const TEXT_SIZES = [{ id: 's', px: 16 }, { id: 'm', px: 18 }, { id: 'l', px: 21 }] as const;
export type TextSizeId = (typeof TEXT_SIZES)[number]['id'];

// ── Passage text ────────────────────────────────────────────────────────────

export interface PassageLine { id: string; n: string; text: string; original?: string }
export interface PassageText { title: string; edition?: string; lines: PassageLine[]; called: string; dir?: 'rtl' | 'ltr' }

/** Sacred Library passages are stored as `${workId}#${section}#${segment}`. */
export const sacredRefId = (workId: string, section: number, segment?: number | string) =>
  `${workId}#${section}#${segment ?? ''}`;
const parseSacredRefId = (id: string) => {
  const [workId, section, segment] = id.split('#');
  const work = SACRED_WORKS.find(w => w.id === workId);
  return work && Number(section) ? { work, section: Number(section), segment: segment || '' } : null;
};

/** Load the text for a passage in the org's scripture. */
export function usePassageText(faith: FaithId, passage: WatchPassage | null, translation: string) {
  const [text, setText] = useState<PassageText | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const id = passage?.refId || '';

  useEffect(() => {
    if (!id) { setText(null); setError(''); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      const bible = parseRefId(id);
      if (bible && faith === 'christianity') {
        const res = await getParallel(bible.book, bible.chapter, [translation]);
        const verses = res[translation] || [];
        const tr = PANEL_EDITIONS.find(t => t.slug === translation);
        return {
          title: formatRef({ ...bible, verse: undefined, endVerse: undefined }, 'display'),
          edition: tr?.label,
          lines: verses.map(v => ({ id: String(v.verse), n: String(v.verse), text: v.text })),
          called: String(bible.verse ?? 1),
          dir: tr?.rtl ? 'rtl' as const : 'ltr' as const,
        };
      }
      // The Tanakh: heard as a Hebrew Bible reference, read from the Tanakh edition.
      const sacred = bible && faith === 'judaism'
        ? (() => { const work = SACRED_WORKS.find(w => w.id === `tanakh-${bible.book}`); return work ? { work, section: bible.chapter, segment: String(bible.verse ?? 1) } : null; })()
        : parseSacredRefId(id);
      if (!sacred) throw Error('This passage isn’t in this scripture.');
      const { data } = await loadSacredSection(sacred.work, sacred.section);
      return {
        title: data.title,
        edition: data.edition,
        lines: data.segments.map((s, i) => ({ id: s.id, n: String(i + 1), text: s.text, original: s.original })),
        called: sacred.segment || data.segments[0]?.id || '',
      };
    })()
      .then(t => { if (!cancelled) { setText(t); setLoading(false); } })
      .catch(e => { if (!cancelled) { setText(null); setLoading(false); setError(String((e as Error)?.message || 'The text could not be loaded.')); } });
    return () => { cancelled = true; };
  }, [faith, id, translation]);

  return { text, loading, error };
}

// ── Go to a passage ─────────────────────────────────────────────────────────

/** Turn what the viewer typed into a passage of the org's scripture. */
export function parsePick(faith: FaithId, input: string, workId?: string): { refId: string; label: string } | null {
  const q = input.trim();
  if (!q) return null;
  if (faith === 'christianity' || faith === 'judaism') {
    const ref = parseRef(q);
    if (!ref) return null;
    if (faith === 'judaism' && ref.book > 39) return null;
    return { refId: toRefId(ref), label: formatRef(ref, 'display') };
  }
  const work = SACRED_WORKS.find(w => w.id === workId) ?? worksForFaith(faith)[0];
  const m = q.match(/(\d+)(?:\s*[:.\s]\s*(\d+))?/);
  if (!work || !m) return null;
  const section = Number(m[1]);
  if (section < 1 || section > work.sections) return null;
  return { refId: sacredRefId(work.id, section, m[2]), label: `${work.title.split(' · ')[0]} ${section}${m[2] ? `:${m[2]}` : ''}` };
}

const PICK_HINT: Record<FaithId, string> = {
  christianity: 'Go to a passage — “John 3:16”',
  judaism: 'Go to a passage — “Isaiah 6”',
  islam: 'Surah and ayah — “2:255”',
  hinduism: 'Chapter — “2”',
  sikhism: 'Ang — “1”',
  buddhism: 'Chapter — “1”',
};

// ── Panel ───────────────────────────────────────────────────────────────────

interface VersePanelProps {
  faith: FaithId;
  passage: WatchPassage | null;
  /** Every passage this source has gone through, oldest first. */
  passages: WatchPassage[];
  text: PassageText | null;
  loading: boolean;
  error: string;
  isLive: boolean;
  /** False when the viewer picked a passage themselves; the stream no longer moves the panel. */
  following: boolean;
  onFollow: () => void;
  onPick: (refId: string, label: string) => void;
  onJump: (p: WatchPassage) => void;
  listen: FeedScriptureState;
  /** Where the reader is while the passage is read out loud. */
  reading?: ReadingSpot | null;
  /** The panel switched edition to match the reader's wording. */
  editionSwitch?: { from: string; to: string } | null;
  onUndoEdition?: () => void;
  onDismissEdition?: () => void;
  listenEnabled: boolean;
  onToggleListen?: () => void;
  /** The org's Stage team is publishing cues for this source. */
  stageFollowing: boolean;
  translation: string;
  onTranslation: (slug: string) => void;
  skin: VerseSkin;
  onSkin: (id: string) => void;
  textSize: TextSizeId;
  onTextSize: (id: TextSizeId) => void;
  onOpenStudy?: () => void;
  onClose?: () => void;
}

const SOURCE_WORD: Record<WatchPassage['source'], string> = { heard: 'Heard', stage: 'Stage', picked: 'Your pick' };

export const VersePanel: React.FC<VersePanelProps> = props => {
  const { faith, passage, passages, text, loading, error, isLive, following, listen, listenEnabled, stageFollowing, skin, textSize } = props;
  const reading = props.reading && text && props.reading.line < text.lines.length ? props.reading : null;
  const [display, setDisplay] = useState(false);
  const [pick, setPick] = useState('');
  const [pickWork, setPickWork] = useState(() => worksForFaith(faith)[0]?.id);
  const [pickError, setPickError] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const calledRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const userScrollAt = useRef(0);
  const notes = useVerseNotes(faith === 'christianity');
  const scriptureName = FAITH_SCRIPTURE_NAME[faith];
  const px = TEXT_SIZES.find(s => s.id === textSize)?.px ?? 18;
  const dark = skin.id === 'dusk' || skin.id === 'lamplight' || skin.id === 'night';
  const works = faith === 'christianity' || faith === 'judaism' ? [] : worksForFaith(faith);

  // Bring the called verse into view inside the panel only — never scroll the page. Hold off
  // while the viewer is reading around on their own.
  useEffect(() => {
    const body = bodyRef.current, el = calledRef.current;
    if (!body || !el || Date.now() - userScrollAt.current < 4000) return;
    const top = el.offsetTop - body.clientHeight * 0.28;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [text, passage?.refId]);

  // While it is read out loud, keep the verse being read in view as the reader moves on.
  const readingRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const body = bodyRef.current, el = readingRef.current;
    if (!body || !el || !reading?.live || Date.now() - userScrollAt.current < 4000) return;
    // Move only when the verse has drifted above the panel or into its lower part — not on every word.
    const above = el.offsetTop < body.scrollTop;
    const low = el.offsetTop + Math.min(el.offsetHeight, body.clientHeight * 0.4) > body.scrollTop + body.clientHeight * 0.75;
    if (above || low) body.scrollTo({ top: Math.max(0, el.offsetTop - body.clientHeight * 0.28), behavior: 'smooth' });
  }, [reading?.line, reading?.word, reading?.live]);

  useEffect(() => {
    const t = trailRef.current;
    if (t) t.scrollTo({ left: t.scrollWidth, behavior: 'smooth' });
  }, [passages.length]);

  const status = useMemo(() => {
    if (!following && !(reading?.live && listen.status === 'listening')) return { word: 'Paused on your pick', tone: 'muted' as const };
    if (stageFollowing) return { word: 'Following the Stage team', tone: 'live' as const };
    if (listen.status === 'listening' && reading?.live && text) return { word: `Reading along · verse ${text.lines[reading.line].n}`, tone: 'live' as const };
    if (listen.status === 'listening') return { word: listen.hearing ? `Hearing ${listen.hearing.label}…` : 'Listening to the stream', tone: 'live' as const };
    if (listen.status === 'starting' || listen.status === 'waiting') return { word: listen.detail || 'Getting ready…', tone: 'muted' as const };
    if (listen.status === 'embed') return { word: 'Can’t hear this source', tone: 'muted' as const };
    if (listen.status === 'error') return { word: 'Not listening', tone: 'muted' as const };
    return { word: listenEnabled ? 'Not listening' : 'Listening off', tone: 'muted' as const };
  }, [following, stageFollowing, listen, listenEnabled, reading?.live, reading?.line, text]);

  const submitPick = () => {
    const hit = parsePick(faith, pick, pickWork);
    if (!hit) { setPickError(true); return; }
    setPickError(false);
    setPick('');
    userScrollAt.current = 0;
    props.onPick(hit.refId, hit.label);
  };

  const calledNote = passage && faith === 'christianity' && text
    ? notes[`${parseRefId(passage.refId)?.book}:${parseRefId(passage.refId)?.chapter}:${text.called}`]
    : undefined;

  return (
    <aside
      className="relative flex flex-col h-full min-h-[560px] lg:max-h-[760px]"
      style={{ background: skin.bg, color: skin.ink, fontFamily: EV_FONT.ui }}
      aria-label={`${scriptureName} beside the player`}
    >
      {/* ── Header ── */}
      <header className="px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${skin.line}` }}>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold tracking-[0.02em]" style={{ color: skin.muted }}>{scriptureName}</span>
          <span className="flex items-center gap-1.5 min-w-0 text-[12px]" style={{ color: skin.muted }} aria-live="polite">
            <span aria-hidden>·</span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.tone === 'live' ? 'animate-pulse' : ''}`}
              style={{ background: status.tone === 'live' ? (isLive ? EV.ember : '#8B5CF6') : skin.muted, opacity: status.tone === 'live' ? 1 : 0.5 }}
            />
            <span className="truncate">{status.word}</span>
          </span>
          <span className="flex-1" />
          {props.onToggleListen && (
            <IconBtn skin={skin} onClick={props.onToggleListen} title={listenEnabled ? 'Stop listening to the stream for scripture' : 'Listen to the stream for scripture'}>
              {listenEnabled ? <Ear size={15} /> : <EarOff size={15} />}
            </IconBtn>
          )}
          <IconBtn skin={skin} onClick={() => setDisplay(d => !d)} title="Text and paper" active={display}><Type size={15} /></IconBtn>
          {props.onOpenStudy && passage && <IconBtn skin={skin} onClick={props.onOpenStudy} title={`Open in the full ${scriptureName}`}><Maximize2 size={14} /></IconBtn>}
          {props.onClose && <IconBtn skin={skin} onClick={props.onClose} title="Hide"><X size={15} /></IconBtn>}
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <h3 className="text-[24px] leading-[1.15] font-semibold tracking-[-0.01em] min-w-0" style={{ fontFamily: EV_FONT.display }}>
            {passage ? passage.label : <span style={{ color: skin.muted }}>Nothing read yet</span>}
          </h3>
          {faith === 'christianity' && (
            <select
              value={props.translation}
              onChange={e => props.onTranslation(e.target.value)}
              aria-label="Translation"
              className="h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold outline-none cursor-pointer"
              style={{ background: 'transparent', color: skin.ink, border: `1px solid ${skin.line}` }}
            >
              {PANEL_EDITIONS.map(t => <option key={t.slug} value={t.slug} style={{ color: '#111' }}>{t.label}</option>)}
            </select>
          )}
        </div>
        {props.editionSwitch && (
          <EditionNote skin={skin} to={editionLabel(props.editionSwitch.to)} from={editionLabel(props.editionSwitch.from)}
            onUndo={props.onUndoEdition} onDismiss={props.onDismissEdition} />
        )}
        {text?.edition && faith !== 'christianity' && <div className="mt-1 text-[12px] truncate" style={{ color: skin.muted }}>{text.edition}</div>}

        {!following && (
          <button onClick={props.onFollow} className="mt-3 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold text-white" style={{ background: '#6D3FD6' }}>
            Follow the stream again <ChevronRight size={13} />
          </button>
        )}

        {/* This source's passages, in the order they came up. */}
        {passages.length > 0 && (
          <div ref={trailRef} className="mt-3 -mx-1 px-1 flex gap-1.5 overflow-x-auto scrollbar-hide" role="list" aria-label="Passages in this session">
            {passages.map((p, i) => {
              const on = passage && p.refId === passage.refId && p.tc === passage.tc;
              return (
                <button
                  key={`${p.refId}_${p.tc}_${i}`}
                  role="listitem"
                  onClick={() => props.onJump(p)}
                  title={`${SOURCE_WORD[p.source]} at ${formatTC(p.tc)}${p.heard ? ` — “${p.heard}”` : ''}`}
                  className="shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
                  style={on
                    ? { background: skin.ink, color: dark ? '#17141D' : '#FBFAF7' }
                    : { background: 'transparent', color: skin.ink, border: `1px solid ${skin.line}` }}
                >
                  <span className="tabular-nums" style={{ opacity: 0.6 }}>{formatTC(p.tc)}</span>
                  <span className="whitespace-nowrap">{p.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ── Display: paper + size ── */}
      {display && (
        <div className="absolute right-4 top-14 z-20 w-[244px] rounded-2xl p-4 shadow-2xl" style={{ background: EV.panel, border: `1px solid ${EV.line}`, color: EV.ink }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: EV.muted }}>Paper</div>
          <div className="grid grid-cols-3 gap-2">
            {VERSE_SKINS.map(s => (
              <button key={s.id} onClick={() => props.onSkin(s.id)} className="flex flex-col items-center gap-1.5" title={s.label}>
                <span className="w-full h-9 rounded-lg" style={{ background: s.bg, boxShadow: s.id === skin.id ? `0 0 0 2px ${EV.gold}` : `inset 0 0 0 1px ${EV.line}` }} />
                <span className="text-[11px]" style={{ color: s.id === skin.id ? EV.ink : EV.muted }}>{s.label}</span>
              </button>
            ))}
          </div>
          <div className="text-[12px] font-semibold mt-4 mb-2" style={{ color: EV.muted }}>Text size</div>
          <div className="flex gap-1.5">
            {TEXT_SIZES.map(s => (
              <button key={s.id} onClick={() => props.onTextSize(s.id)} className="flex-1 h-9 rounded-lg font-semibold"
                style={{ fontFamily: EV_FONT.scripture, fontSize: s.px - 3, background: s.id === textSize ? EV.raised : 'transparent', border: `1px solid ${s.id === textSize ? EV.gold : EV.line}` }}>
                Aa
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── The text ── */}
      <div
        ref={bodyRef}
        onWheel={() => { userScrollAt.current = Date.now(); }}
        onTouchMove={() => { userScrollAt.current = Date.now(); }}
        className="relative flex-1 overflow-y-auto px-6 py-5 custom-scrollbar"
        dir={text?.dir}
      >
        {!passage ? (
          <EmptyState skin={skin} scriptureName={scriptureName} listen={listen} listenEnabled={listenEnabled} stageFollowing={stageFollowing} faith={faith} />
        ) : loading && !text ? (
          <div className="space-y-3 pt-2" aria-label="Loading">
            {[92, 80, 88, 64, 84].map((w, i) => <div key={i} className="h-4 rounded" style={{ width: `${w}%`, background: skin.line }} />)}
          </div>
        ) : error ? (
          <p className="text-[14px]" style={{ color: skin.muted }}>{error}</p>
        ) : text ? (
          <div style={{ fontFamily: EV_FONT.scripture, fontSize: px, lineHeight: 1.7 }}>
            {passage.heard && passage.source === 'heard' && (
              <p className="mb-4 text-[13px] italic" style={{ fontFamily: EV_FONT.ui, color: skin.muted }}>“…{passage.heard}…”</p>
            )}
            {text.lines.map((l, idx) => {
              // The verse being read takes the mark; until reading is heard, the verse the reference named has it.
              const isReading = reading?.line === idx;
              const called = reading ? isReading : l.id === text.called;
              const noteKey = faith === 'christianity' && passage ? `${parseRefId(passage.refId)?.book}:${parseRefId(passage.refId)?.chapter}:${l.id}` : '';
              const hasNote = !!(noteKey && notes[noteKey]);
              return (
                <div
                  key={l.id}
                  ref={el => { if (l.id === text.called) calledRef.current = el; if (isReading) readingRef.current = el; }}
                  className="relative rounded-xl transition-colors duration-300"
                  style={called
                    ? { background: skin.mark, padding: '10px 14px', margin: '6px -14px', boxShadow: isReading && reading?.live ? `inset 3px 0 0 ${skin.num}` : undefined }
                    : { padding: '2px 0' }}
                  aria-current={isReading && reading?.live ? 'true' : undefined}
                >
                  <p>
                    <sup className="mr-1.5 tabular-nums" style={{ fontFamily: EV_FONT.ui, fontSize: 11, fontWeight: 600, color: skin.num, top: '-0.5em' }}>{l.n}</sup>
                    {hasNote && <span title="You have a note on this verse" className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: '#8B5CF6' }} />}
                    {isReading && reading ? <ReadWords text={l.text} word={reading.word} live={reading.live} skin={skin} dark={dark} /> : l.text}
                  </p>
                  {l.original && <p className="mt-1 text-[0.92em]" dir={text.dir === 'rtl' || /[֐-ۿ]/.test(l.original) ? 'rtl' : 'ltr'} style={{ color: skin.muted }}>{l.original}</p>}
                  {called && calledNote && (
                    <p className="mt-2 pt-2 text-[13px] whitespace-pre-line" style={{ fontFamily: EV_FONT.ui, color: skin.muted, borderTop: `1px solid ${skin.line}` }}>
                      {calledNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* ── Go to a passage ── */}
      <form
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderTop: `1px solid ${skin.line}` }}
        onSubmit={e => { e.preventDefault(); submitPick(); }}
      >
        {works.length > 1 && (
          <select value={pickWork} onChange={e => setPickWork(e.target.value)} aria-label="Text"
            className="h-10 max-w-[38%] rounded-full px-3 text-[12px] font-semibold outline-none"
            style={{ background: 'transparent', color: skin.ink, border: `1px solid ${skin.line}` }}>
            {works.map(w => <option key={w.id} value={w.id} style={{ color: '#111' }}>{w.title}</option>)}
          </select>
        )}
        <label className="flex-1 min-w-0 h-10 rounded-full flex items-center gap-2 px-3.5" style={{ border: `1px solid ${pickError ? EV.warn : skin.line}` }}>
          <Search size={14} style={{ color: skin.muted }} className="shrink-0" />
          <input
            value={pick}
            onChange={e => { setPick(e.target.value); setPickError(false); }}
            placeholder={PICK_HINT[faith]}
            aria-label="Go to a passage"
            className="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
            style={{ color: skin.ink }}
          />
        </label>
      </form>
    </aside>
  );
};

/** "Switched to World English Bible to match the reader · Undo". Goes away on its own. */
const EditionNote: React.FC<{ skin: VerseSkin; to: string; from: string; onUndo?: () => void; onDismiss?: () => void }> = ({ skin, to, from, onUndo, onDismiss }) => {
  useEffect(() => {
    if (!onDismiss) return;
    const t = window.setTimeout(onDismiss, 15000);
    return () => window.clearTimeout(t);
  }, [to, onDismiss]);
  return (
    <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: skin.muted }} role="status">
      <span className="min-w-0">Switched to <b style={{ color: skin.ink }}>{to}</b> to match the reader</span>
      {onUndo && (
        <button type="button" onClick={onUndo} className="shrink-0 font-semibold underline underline-offset-2" style={{ color: skin.ink }} title={`Back to ${from}`}>
          Undo
        </button>
      )}
    </div>
  );
};

/** A verse being read: words already read in full ink, the word the reader is on lit, the rest softer. */
const ReadWords: React.FC<{ text: string; word: number; live: boolean; skin: VerseSkin; dark: boolean }> = ({ text, word, live, skin, dark }) => {
  const words = lineWords(text);
  return (
    <>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span
            className="transition-[color,background-color,opacity] duration-200"
            style={i === word && live
              ? { background: skin.num, color: dark ? '#17141D' : '#FFFFFF', borderRadius: 4, padding: '1px 2px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }
              : { opacity: live && i > word ? 0.5 : 1 }}
          >
            {w}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </>
  );
};

const IconBtn: React.FC<{ skin: VerseSkin; onClick: () => void; title: string; active?: boolean; children: React.ReactNode }> = ({ skin, onClick, title, active, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
    style={{ color: skin.ink, background: active ? skin.line : 'transparent' }}
    onMouseEnter={e => { e.currentTarget.style.background = skin.line; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? skin.line : 'transparent'; }}
  >
    {children}
  </button>
);

const EmptyState: React.FC<{ skin: VerseSkin; scriptureName: string; listen: FeedScriptureState; listenEnabled: boolean; stageFollowing: boolean; faith: FaithId }> = ({
  skin, scriptureName, listen, listenEnabled, stageFollowing, faith,
}) => {
  const hears = faith === 'christianity' || faith === 'judaism';
  const why = stageFollowing
    ? 'The Stage team’s next passage will open here.'
    : !hears
      ? `Go to a passage below to read along. Passages from the ${scriptureName} aren’t picked up from speech yet.`
      : listen.status === 'embed'
        ? 'This source plays in its own frame, so its audio can’t be heard here. A passage the Stage team puts up will still open here.'
        : !listenEnabled
          ? 'Listening is off. Turn it on with the ear button, or go to a passage below.'
          : listen.status === 'error'
            ? listen.detail || 'The stream’s audio can’t be heard right now.'
            : 'When a passage is read on this stream, it opens here.';
  return (
    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6">
      <span className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: skin.line, color: skin.num }}>
        <BookOpen size={20} />
      </span>
      <p className="text-[15px] max-w-[300px] leading-relaxed" style={{ color: skin.muted }}>{why}</p>
      {listen.heard && listen.status === 'listening' && (
        <p className="mt-4 text-[13px] italic max-w-[320px] line-clamp-2" style={{ color: skin.muted, opacity: 0.8 }}>“…{listen.heard}”</p>
      )}
    </div>
  );
};

function useVerseNotes(on: boolean): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>(() => (on ? verseNotes.read() : {}));
  useEffect(() => {
    if (!on) { setMap({}); return; }
    setMap(verseNotes.read());
    return verseNotes.subscribe(() => setMap(verseNotes.read()));
  }, [on]);
  return map;
}

export default VersePanel;

// Lorea Lexicon — the dictionary, thesaurus, etymology, slang and multilingual word room in Lorea.
//
// A folio of laid paper on the night-library desk: search with live suggestions, the word of the day,
// and for each word six bookmarked chapters — Meaning · Thesaurus · Origins · Across languages ·
// Slang · Life of the word. Every linked word is a door to the next entry.
//
// Data: services/lexicon (open sources, see docs/LOREA_LEXICON.md). Opened from anywhere with
// `plajah:openLexicon` {word, lang?, tab?} (services/lexicon/client.ts → openLexicon()).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KinshipVerdict, LangEntry, LexiconTab, Seg, SlangEntry, ThesaurusNode, ThesaurusRelation, UsagePoint, WordEntry, CompareResult } from '../../../services/lexicon/types';
import * as api from '../../../services/lexicon/client';
import { kinshipFor, meaningPrism } from '../../../services/lexicon/compare';
import { segText } from '../../../services/lexicon/wikitext';
import { DEFAULT_COMPARE_LANGS, LANGS, langName, speechTag, FAMILY_COLOR, familyOf } from '../../../services/lexicon/languages';
import { PAPER, INK, HAND_FONT, grainUri, usePaperFonts } from '../exhibits/paperKit';
import { OriginsJourney, CognateFan, ThesaurusWeb, PrismTable, LifeChart, KIN_COLOR, KIN_LABEL, REL_STYLE } from './LexiconViz';

export interface LoreaLexiconProps {
  initialWord?: string;
  initialTab?: LexiconTab;
  initialLang?: string;
  onBack?: () => void;
  /** Kids Mode: no Slang chapter, explicit senses filtered. */
  kidsMode?: boolean;
}

const TABS: { id: LexiconTab; label: string; hint: string }[] = [
  { id: 'meaning', label: 'Meaning', hint: 'Definitions, labels, examples' },
  { id: 'thesaurus', label: 'Thesaurus', hint: 'Synonyms, opposites, kin' },
  { id: 'origins', label: 'Origins', hint: 'Etymology and history' },
  { id: 'languages', label: 'Across languages', hint: 'Translations, cognates, false friends' },
  { id: 'slang', label: 'Slang', hint: 'Street, historical and community' },
  { id: 'life', label: 'Life of the word', hint: 'Usage over two centuries' },
];

const TRY = ['gift', 'once', 'bank', 'cool', 'serendipity', 'saudade', 'robot', 'nice'];
const LANG_PREF_KEY = 'lorea.lexicon.langs';
const RECENT_KEY = 'lorea.lexicon.recent';

function readLocal<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } }
function writeLocal(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

function speak(word: string, lang: string) {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    const u = new SpeechSynthesisUtterance(word);
    const tag = speechTag(lang) ?? lang;
    u.lang = tag;
    const v = synth.getVoices().find(x => x.lang.toLowerCase().startsWith(tag.toLowerCase().slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 0.9;
    synth.cancel(); synth.speak(u);
  } catch { /* no speech engine */ }
}

/** Render definition segments with linked words as doors. */
function Segs({ segs, onWord }: { segs: Seg[]; onWord: (w: string) => void }) {
  return <>{segs.map((s, i) => s.w
    ? <button key={i} className="lx-link" onClick={() => onWord(s.w!)} title={s.lang ? `${langName(s.lang)}: ${s.w}` : `Look up “${s.w}”`}>{s.t}</button>
    : <React.Fragment key={i}>{s.t}</React.Fragment>)}</>;
}

export default function LoreaLexicon({ initialWord, initialTab, initialLang, onBack, kidsMode }: LoreaLexiconProps) {
  usePaperFonts();
  const [query, setQuery] = useState(initialWord ?? '');
  const [word, setWord] = useState<string | null>(initialWord ?? null);
  const [tab, setTab] = useState<LexiconTab>(initialTab ?? 'meaning');
  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [home, setHome] = useState<string>(initialLang ?? 'en');
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [thes, setThes] = useState<ThesaurusNode[] | null>(null);
  const [usagePts, setUsagePts] = useState<UsagePoint[] | null | undefined>(undefined);
  const [slangRows, setSlangRows] = useState<SlangEntry[] | null>(null);
  const [today, setToday] = useState<WordEntry | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>(() => readLocal(RECENT_KEY, []));
  const [saved, setSaved] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabs =kidsMode ? TABS.filter(t => t.id !== 'slang') : TABS;

  // ── navigation ──
  const go = useCallback((w: string, opts: { tab?: LexiconTab; lang?: string } = {}) => {
    const clean = w.trim(); if (!clean) return;
    setTrail(t => (word && word !== clean ? [...t.slice(-12), word] : t));
    setWord(clean); setQuery(clean); setSuggestions([]);
    if (opts.tab) setTab(opts.tab);
    if (opts.lang) setHome(opts.lang);
    rootRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [word]);

  useEffect(() => {
    if (!word) { setEntry(null); return; }
    let live = true;
    setLoading(true); setMissing(null); setError(null); setThes(null); setUsagePts(undefined); setSlangRows(null);
    api.lookup(word).then(e => {
      if (!live) return;
      setEntry(e);
      const langs = e.langs.map(l => l.lang);
      setHome(h => (langs.includes(h) ? h : langs.includes('en') ? 'en' : langs[0] ?? 'en'));
      setRecent(r => { const next = [e.title, ...r.filter(x => x !== e.title)].slice(0, 14); writeLocal(RECENT_KEY, next); return next; });
    }).catch(err => {
      if (!live) return;
      setEntry(null);
      if (err?.status === 404) setMissing(err.body?.suggestions ?? []); else setError(err?.message ?? 'Something went wrong.');
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [word]);

  // Word of the day + the journal.
  useEffect(() => {
    api.wordOfTheDay().then(r => api.lookup(r.word)).then(setToday).catch(() => {});
    api.journal().then(rows => setSaved(rows.map(r => r.word))).catch(() => {});
  }, []);

  // Lazy chapter data.
  useEffect(() => {
    if (!entry) return;
    if (tab === 'thesaurus' && thes === null) api.thesaurus(entry.title, home).then(setThes).catch(() => setThes([]));
    if (tab === 'life' && usagePts === undefined) api.usage(entry.title, home).then(setUsagePts).catch(() => setUsagePts(null));
    if (tab === 'slang' && slangRows === null && !kidsMode) api.slang(entry.title, true).then(setSlangRows).catch(() => setSlangRows([]));
  }, [entry, tab, home, thes, usagePts, slangRows, kidsMode]);

  // Thesaurus also feeds the meaning comparison (synonyms bridge "present" ↔ "gift").
  useEffect(() => { if (entry && tab === 'languages' && thes === null) api.thesaurus(entry.title, home).then(setThes).catch(() => setThes([])); }, [entry, tab, home, thes]);

  // Suggestions while typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === word) { setSuggestions([]); return; }
    const t = setTimeout(() => api.suggestWords(q).then(setSuggestions).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [query, word]);

  // Keyboard: "/" focuses search.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); inputRef.current?.focus(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const L = entry?.langs.find(l => l.lang === home) ?? entry?.langs[0];
  const isSaved = !!entry && saved.includes(entry.title);
  const toggleSave = async () => {
    if (!entry) return;
    try {
      if (isSaved) { await api.unsaveWord(entry.title); setSaved(s => s.filter(x => x !== entry.title)); }
      else { await api.saveWord(entry.title, home); setSaved(s => [entry.title, ...s]); }
    } catch (e: any) { setError(e?.status === 401 ? 'Sign in to keep a word journal — it syncs to every device.' : 'Could not save that word.'); }
  };

  const rootStyle = useMemo<React.CSSProperties>(() => ({
    ['--lx-paper' as any]: PAPER.vellum.bg, ['--lx-edge' as any]: PAPER.vellum.edge, ['--lx-ink' as any]: INK['iron-gall'],
    ['--lx-accent' as any]: '#a8301d', ['--lx-wash1' as any]: '#e9d7a8', ['--lx-wash2' as any]: '#c9d8cf',
    ['--lx-hand' as any]: HAND_FONT.script, ['--lx-grain' as any]: grainUri(PAPER.vellum.grain, false, 11),
  }), []);

  return (
    <div className="lx-root" style={rootStyle} ref={rootRef}>
      <style>{CSS}</style>
      <header className="lx-top">
        {onBack && <button className="lx-back" onClick={onBack} aria-label="Back to Lorea">← Lorea</button>}
        <div className="lx-brand"><span className="lx-brand-mark">L</span><span>Lorea <em>Lexicon</em></span></div>
        <form className="lx-search" onSubmit={e => { e.preventDefault(); go(query); }} role="search">
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Look up any word, in any language…" aria-label="Look up a word" autoComplete="off" spellCheck={false} />
          <button type="submit" aria-label="Look up">Look up</button>
          {suggestions.length > 0 && (
            <ul className="lx-suggest" role="listbox">
              {suggestions.map(s => <li key={s}><button type="button" onClick={() => go(s)}>{s}</button></li>)}
            </ul>
          )}
        </form>
      </header>

      <main className="lx-desk">
        {!word && <Lobby today={today} recent={recent} saved={saved} onWord={go} />}
        {word && (
          <article className="lx-folio">
            {trail.length > 0 && (
              <nav className="lx-trail" aria-label="Words you came through">
                {trail.slice(-6).map((t, i) => <button key={`${t}-${i}`} onClick={() => { setTrail(tr => tr.slice(0, tr.lastIndexOf(t))); setWord(t); setQuery(t); }}>{t}</button>)}
                <span aria-hidden>→</span><b>{word}</b>
              </nav>
            )}
            {loading && <div className="lx-loading"><span className="lx-quill" /> Turning the pages…</div>}
            {error && <p className="lx-error" role="alert">{error}</p>}
            {missing && (
              <div className="lx-missing">
                <h2>“{word}” isn't in the open dictionaries yet.</h2>
                {missing.length > 0 && <p>Did you mean {missing.slice(0, 6).map((m, i) => <React.Fragment key={m}>{i ? ', ' : ''}<button className="lx-link" onClick={() => go(m)}>{m}</button></React.Fragment>)}?</p>}
                {!kidsMode && <p className="lx-muted">If it's slang, you can add it to the community shelf from the Slang chapter of a nearby word.</p>}
              </div>
            )}
            {entry && L && !loading && (
              <>
                <EntryHead entry={entry} L={L} home={home} setHome={setHome} isSaved={isSaved} onSave={toggleSave} />
                <nav className="lx-tabs" role="tablist" aria-label="Chapters">
                  {tabs.map((t, i) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} style={{ ['--i' as any]: i }} title={t.hint}>{t.label}</button>
                  ))}
                </nav>
                <section className="lx-chapter" role="tabpanel" key={`${entry.title}-${tab}-${home}`}>
                  {tab === 'meaning' && <MeaningChapter L={L} onWord={go} onTab={setTab} />}
                  {tab === 'thesaurus' && <ThesaurusChapter word={entry.title} nodes={thes} onWord={go} />}
                  {tab === 'origins' && <OriginsChapter entry={entry} L={L} onWord={go} />}
                  {tab === 'languages' && <LanguagesChapter entry={entry} L={L} thes={thes} onWord={go} />}
                  {tab === 'slang' && !kidsMode && <SlangChapter word={entry.title} rows={slangRows} reload={() => api.slang(entry.title, true).then(setSlangRows)} />}
                  {tab === 'life' && <LifeChapter word={entry.title} L={L} points={usagePts} />}
                </section>
                <Sources entry={entry} tab={tab} />
              </>
            )}
          </article>
        )}
      </main>
    </div>
  );
}

// ─── lobby ───────────────────────────────────────────────────────────────────

function Lobby({ today, recent, saved, onWord }: { today: WordEntry | null; recent: string[]; saved: string[]; onWord: (w: string) => void }) {
  const tL = today?.langs.find(l => l.lang === 'en') ?? today?.langs[0];
  const first = tL?.etymologies.flatMap(g => g.pos.flatMap(p => p.senses.map(s => ({ s, pos: p.pos }))))[0];
  const ety = tL?.etymologies.find(g => g.etymology)?.etymology;
  return (
    <div className="lx-lobby">
      <section className="lx-hero">
        <p className="lx-kicker">A living dictionary · thesaurus · etymology · slang · every language</p>
        <h1>Every word<br /><em>has travelled.</em></h1>
        <p className="lx-lede">Look a word up and follow it — back through the languages that carried it, across to its cousins abroad, through the slang of the street and the books of two centuries.</p>
        <div className="lx-try">{TRY.map(w => <button key={w} onClick={() => onWord(w)}>{w}</button>)}</div>
      </section>
      {today && tL && (
        <section className="lx-wotd" onClick={() => onWord(today.title)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onWord(today.title)}>
          <span className="lx-stamp">Word of the day</span>
          <h2>{today.title}</h2>
          {tL.pronunciation?.ipa[0] && <p className="lx-ipa">{tL.pronunciation.ipa[0]}</p>}
          {first && <p className="lx-wotd-def"><i>{first.pos.toLowerCase()}</i> — {segText(first.s.text)}</p>}
          {ety && ety.chain.length > 0 && (
            <p className="lx-wotd-chain">{[...ety.chain].reverse().slice(-4).map((c, i) => <span key={i}>{i ? ' → ' : ''}<b style={{ color: FAMILY_COLOR[familyOf(c.lang)] }}>{c.langName}</b> <i>{c.word}</i></span>)} → <b>{today.title}</b></p>
          )}
          <span className="lx-more">Open the entry →</span>
        </section>
      )}
      <section className="lx-shelves">
        {saved.length > 0 && <div><h3>Your word journal</h3><div className="lx-cloud">{saved.slice(0, 30).map(w => <button key={w} onClick={() => onWord(w)}>{w}</button>)}</div></div>}
        {recent.length > 0 && <div><h3>Recently opened</h3><div className="lx-cloud">{recent.map(w => <button key={w} onClick={() => onWord(w)}>{w}</button>)}</div></div>}
        <div><h3>Wander by letter</h3><div className="lx-letters">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => <LetterDoor key={c} letter={c} onWord={onWord} />)}</div></div>
      </section>
    </div>
  );
}

function LetterDoor({ letter, onWord }: { letter: string; onWord: (w: string) => void }) {
  const pick = async () => {
    const opts = await api.suggestWords(letter.toLowerCase() + 'a').catch(() => [] as string[]);
    const pool = opts.filter(o => /^[a-z]+$/.test(o) && o.length > 3);
    onWord(pool[Math.floor(Math.random() * pool.length)] ?? letter.toLowerCase());
  };
  return <button className="lx-letter" onClick={pick} aria-label={`A word starting with ${letter}`}>{letter}</button>;
}

// ─── entry header ────────────────────────────────────────────────────────────

function EntryHead({ entry, L, home, setHome, isSaved, onSave }: { entry: WordEntry; L: LangEntry; home: string; setHome: (l: string) => void; isSaved: boolean; onSave: () => void }) {
  const p = L.pronunciation;
  const [playing, setPlaying] = useState<string | null>(null);
  const play = (url: string) => { const a = new Audio(url); setPlaying(url); a.onended = () => setPlaying(null); a.onerror = () => setPlaying(null); a.play().catch(() => setPlaying(null)); };
  return (
    <header className="lx-head">
      <div className="lx-head-main">
        <h1 className="lx-headword" lang={speechTag(L.lang) ?? L.lang}>{entry.title}</h1>
        <div className="lx-pron">
          {p?.syllables && <span className="lx-syl">{p.syllables}</span>}
          {p?.ipa.slice(0, 3).map(i => <span key={i} className="lx-ipa">{i}</span>)}
          {p?.audio.slice(0, 3).map(a => (
            <button key={a.url} className={`lx-play ${playing === a.url ? 'on' : ''}`} onClick={() => play(a.url)} aria-label={`Play pronunciation${a.accent ? ` (${a.accent})` : ''}`}>
              <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden><path d="M4 7h3l4-3v12l-4-3H4z" fill="currentColor" /><path d="M14 6c1.5 1.2 1.5 6.8 0 8M16.5 4c2.6 2.4 2.6 9.6 0 12" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
              {a.accent ?? 'listen'}
            </button>
          ))}
          {!p?.audio.length && <button className="lx-play" onClick={() => speak(entry.title, L.lang)}>speak</button>}
          {p?.rhymes && <span className="lx-rhyme">rhymes {p.rhymes}</span>}
        </div>
      </div>
      <div className="lx-head-side">
        <button className={`lx-save ${isSaved ? 'on' : ''}`} onClick={onSave} aria-pressed={isSaved}>{isSaved ? '★ In your journal' : '☆ Save word'}</button>
        {entry.langs.length > 1 && (
          <div className="lx-langs" aria-label="This spelling in other languages">
            <span>Also a word in</span>
            {entry.langs.map(l => (
              <button key={l.lang} className={l.lang === home ? 'on' : ''} onClick={() => setHome(l.lang)} style={{ ['--fam' as any]: FAMILY_COLOR[familyOf(l.lang)] }}>{l.langName}</button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Meaning ─────────────────────────────────────────────────────────────────

function MeaningChapter({ L, onWord, onTab }: { L: LangEntry; onWord: (w: string) => void; onTab: (t: LexiconTab) => void }) {
  return (
    <div className="lx-meaning">
      {L.etymologies.map((g, gi) => (
        <div key={gi} className="lx-etygroup">
          {L.etymologies.length > 1 && <h3 className="lx-homograph">{L.langName} · sense family {gi + 1}</h3>}
          {g.pos.map((p, pi) => (
            <section key={pi} className="lx-pos">
              <h2><span>{p.pos}</span>{p.forms && <small>{p.forms}</small>}</h2>
              <ol>
                {p.senses.map(s => (
                  <li key={s.id} className={s.depth > 1 ? 'sub' : ''}>
                    {s.labels.length > 0 && <span className="lx-labels">{s.labels.map(l => <span key={l} className={`lx-label ${/slang|vulgar|offensive|derogatory|informal|colloquial/i.test(l) ? 'hot' : /archaic|obsolete|dated|historical/i.test(l) ? 'old' : ''}`}>{l}</span>)}</span>}
                    <span className="lx-def"><Segs segs={s.text} onWord={onWord} /></span>
                    {s.dated && <span className="lx-dated">since {s.dated}</span>}
                    {s.examples.slice(0, 2).map((x, i) => <blockquote key={i} className="lx-ex">{x}</blockquote>)}
                    {(s.synonyms.length > 0 || s.antonyms.length > 0) && (
                      <div className="lx-sensesyn">
                        {s.synonyms.slice(0, 8).map(w => <button key={w} className="lx-chip" onClick={() => onWord(w)}>{w}</button>)}
                        {s.antonyms.slice(0, 5).map(w => <button key={w} className="lx-chip anti" onClick={() => onWord(w)}>≠ {w}</button>)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {g.etymology && segText(g.etymology.prose) && (
            <aside className="lx-etyteaser" onClick={() => onTab('origins')} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onTab('origins')}>
              <span className="lx-stamp small">Origin</span>
              <p>{segText(g.etymology.prose).slice(0, 220)}{segText(g.etymology.prose).length > 220 ? '…' : ''}</p>
              <span className="lx-more">Follow the journey →</span>
            </aside>
          )}
        </div>
      ))}
      {(L.derived.length > 0 || L.related.length > 0) && (
        <section className="lx-family">
          {L.related.length > 0 && <><h3>Related words</h3><div className="lx-cloud">{L.related.slice(0, 40).map(w => <button key={w} onClick={() => onWord(w)}>{w}</button>)}</div></>}
          {L.derived.length > 0 && <><h3>Made from it</h3><div className="lx-cloud">{L.derived.slice(0, 60).map(w => <button key={w} onClick={() => onWord(w)}>{w}</button>)}</div></>}
        </section>
      )}
    </div>
  );
}

// ─── Thesaurus ───────────────────────────────────────────────────────────────

const WEB_RELS: ThesaurusRelation[] = ['synonym', 'similar', 'antonym', 'broader', 'narrower', 'partOf', 'hasPart', 'triggers'];

function ThesaurusChapter({ word, nodes, onWord }: { word: string; nodes: ThesaurusNode[] | null; onWord: (w: string) => void }) {
  const [show, setShow] = useState<Set<ThesaurusRelation>>(() => new Set(['synonym', 'similar', 'antonym', 'broader', 'narrower']));
  if (nodes === null) return <div className="lx-loading"><span className="lx-quill" /> Gathering kindred words…</div>;
  if (!nodes.length) return <p className="lx-muted">No thesaurus links recorded for “{word}”.</p>;
  const counts = new Map<ThesaurusRelation, number>(); nodes.forEach(n => counts.set(n.relation, (counts.get(n.relation) ?? 0) + 1));
  const toggle = (r: ThesaurusRelation) => setShow(s => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const rhymes = nodes.filter(n => n.relation === 'rhyme');
  return (
    <div className="lx-thes">
      <div className="lx-filters">
        {WEB_RELS.filter(r => counts.get(r)).map(r => (
          <button key={r} className={show.has(r) ? 'on' : ''} onClick={() => toggle(r)} style={{ ['--c' as any]: REL_STYLE[r].color }} aria-pressed={show.has(r)}>
            <i /> {REL_STYLE[r].label} <small>{counts.get(r)}</small>
          </button>
        ))}
      </div>
      <ThesaurusWeb word={word} nodes={nodes} show={show} onWord={onWord} />
      <div className="lx-thes-lists">
        {WEB_RELS.filter(r => show.has(r) && counts.get(r)).map(r => (
          <div key={r}><h4 style={{ color: REL_STYLE[r].color }}>{REL_STYLE[r].label}</h4>
            <div className="lx-cloud">{nodes.filter(n => n.relation === r).slice(0, 30).map(n => <button key={n.word} onClick={() => onWord(n.word)}>{n.word}</button>)}</div></div>
        ))}
        {rhymes.length > 0 && <div><h4 style={{ color: REL_STYLE.rhyme.color }}>Rhymes</h4><div className="lx-cloud">{rhymes.map(n => <button key={n.word} onClick={() => onWord(n.word)}>{n.word}</button>)}</div></div>}
      </div>
    </div>
  );
}

// ─── Origins ─────────────────────────────────────────────────────────────────

function OriginsChapter({ entry, L, onWord }: { entry: WordEntry; L: LangEntry; onWord: (w: string) => void }) {
  const verdicts = useMemo(() => kinshipFor(entry, L.lang), [entry, L.lang]);
  const groups = L.etymologies.filter(g => g.etymology);
  if (!groups.length) return <p className="lx-muted">No etymology is recorded for “{entry.title}” in {L.langName} yet.</p>;
  return (
    <div className="lx-origins">
      {groups.map((g, i) => {
        const e = g.etymology!;
        const prose = segText(e.prose);
        return (
          <section key={i} className="lx-ety">
            {groups.length > 1 && <h3 className="lx-homograph">Origin {i + 1} — {g.pos.map(p => p.pos.toLowerCase()).join(', ')}</h3>}
            <h2 className="lx-h2">The journey</h2>
            <OriginsJourney chain={e.chain} roots={e.roots} today={entry.title} todayLang={L.lang} onWord={onWord} />
            {prose && <p className="lx-manuscript"><span className="lx-dropcap">{prose[0]}</span><Segs segs={trimFirst(e.prose)} onWord={onWord} /></p>}
            <div className="lx-ety-facts">
              {e.attested && <span className="lx-fact"><b>Attested</b> {e.attested}</span>}
              {e.roots.length > 0 && <span className="lx-fact"><b>Root</b> {e.roots.map(r => `${r.langName} ${r.word}`).join(' · ')}</span>}
              {e.doublets.length > 0 && <span className="lx-fact"><b>Doublet</b> {e.doublets.map(d => <button key={d} className="lx-link" onClick={() => onWord(d)}>{d}</button>)} <small>(same source, different road)</small></span>}
            </div>
            {e.cognates.length > 0 && (
              <>
                <h2 className="lx-h2">Cousins in other languages</h2>
                <p className="lx-muted">Words that grew from the same ancestor. Colour shows whether the meaning stayed or wandered.</p>
                <KinLegend />
                <CognateFan root={(e.roots[0]?.word ?? [...e.chain].reverse()[0]?.word ?? entry.title)} cognates={e.cognates} verdicts={verdicts} onWord={onWord} />
              </>
            )}
          </section>
        );
      })}
      {L.descendants.length > 0 && (
        <section><h2 className="lx-h2">Where it went next</h2>
          <div className="lx-cloud">{L.descendants.slice(0, 40).map((d, i) => <button key={i} onClick={() => onWord(d.word)}><small>{d.langName}</small> {d.word}</button>)}</div></section>
      )}
    </div>
  );
}

function trimFirst(segs: Seg[]): Seg[] { if (!segs.length) return segs; const [f, ...rest] = segs; return f.t.length > 1 ? [{ ...f, t: f.t.slice(1) }, ...rest] : rest; }

function KinLegend() {
  return <div className="lx-legend">{(['same', 'shifted', 'drifted', 'false-friend'] as const).map(k => <span key={k}><i style={{ background: KIN_COLOR[k] }} />{KIN_LABEL[k]}</span>)}</div>;
}

// ─── Across languages ────────────────────────────────────────────────────────

function LanguagesChapter({ entry, L, thes, onWord }: { entry: WordEntry; L: LangEntry; thes: ThesaurusNode[] | null; onWord: (w: string, o?: { lang?: string }) => void }) {
  const [langs, setLangs] = useState<string[]>(() => readLocal(LANG_PREF_KEY, DEFAULT_COMPARE_LANGS));
  const [filter, setFilter] = useState('');
  const [picker, setPicker] = useState(false);
  const bridge = useMemo(() => (thes ?? []).filter(n => n.relation === 'synonym').slice(0, 12).map(n => n.word), [thes]);
  const verdicts = useMemo(() => kinshipFor(entry, L.lang, bridge), [entry, L.lang, bridge]);
  const prism = useMemo(() => meaningPrism(L, langs), [L, langs]);
  const allItems = L.translations.flatMap(t => t.items.map(i => ({ ...i, gloss: t.gloss })));
  const byLang = new Map<string, typeof allItems>();
  for (const i of allItems) { if (i.note) continue; byLang.set(i.lang, [...(byLang.get(i.lang) ?? []), i]); }
  const available = [...byLang.keys()];
  const shown = available.filter(c => langs.includes(c) || (filter && (langName(c) + (LANGS[c]?.native ?? '')).toLowerCase().includes(filter.toLowerCase())));
  const setPref = (next: string[]) => { setLangs(next); writeLocal(LANG_PREF_KEY, next); };

  return (
    <div className="lx-across">
      <section>
        <h2 className="lx-h2">Kindred &amp; false friends</h2>
        <p className="lx-muted">The same spelling — or the same ancestor — in other languages, and whether the meaning survived the trip.</p>
        {verdicts.length ? <>
          <KinLegend />
          <div className="lx-kin-grid">{verdicts.slice(0, 18).map(v => <KinCard key={`${v.lang}-${v.word}`} v={v} onWord={w => onWord(w)} />)}</div>
        </> : <p className="lx-muted">No look-alikes or glossed cousins recorded for this word.</p>}
      </section>

      <section>
        <div className="lx-row-head">
          <h2 className="lx-h2">The meaning prism</h2>
          <button className="lx-ghost" onClick={() => setPicker(p => !p)}>{picker ? 'Done' : 'Choose languages'}</button>
        </div>
        <p className="lx-muted">One English word, many meanings — and how each language divides them. Where a row changes colour, that language needs a different word.</p>
        {picker && (
          <div className="lx-picker">
            {available.sort((a, b) => langName(a).localeCompare(langName(b))).map(c => (
              <label key={c}><input type="checkbox" checked={langs.includes(c)} onChange={e => setPref(e.target.checked ? [...langs, c] : langs.filter(x => x !== c))} /> {langName(c)}</label>
            ))}
          </div>
        )}
        <PrismTable prism={prism} onSpeak={speak} />
      </section>

      <section>
        <div className="lx-row-head">
          <h2 className="lx-h2">Translation atlas</h2>
          <input className="lx-filter" placeholder="Find a language…" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter languages" />
        </div>
        {available.length === 0 && <p className="lx-muted">{L.lang === 'en' ? 'No translation tables for this word yet.' : `Translation tables live on English entries — tap an English meaning in the Meaning chapter to cross over.`}</p>}
        <div className="lx-atlas">
          {shown.map(code => {
            const items = byLang.get(code)!; const info = LANGS[code];
            const words = [...new Map(items.map(i => [i.word, i])).values()].slice(0, 5);
            return (
              <div key={code} className="lx-atlas-card" style={{ ['--fam' as any]: FAMILY_COLOR[familyOf(code)] }}>
                <header><b>{langName(code)}</b>{info?.native && info.native !== langName(code) && <span>{info.native}</span>}</header>
                {words.map(w => (
                  <div key={w.word} className="lx-atlas-word">
                    <button className="lx-speak" onClick={() => speak(w.word, code)} aria-label={`Hear ${w.word}`}>♪</button>
                    <span lang={speechTag(code) ?? code} className="lx-foreign">{w.word}</span>
                    {w.gender && <i className="lx-gender">{w.gender}</i>}
                    {w.tr && <small className="lx-tr">{w.tr}</small>}
                    <small className="lx-for" title={w.gloss}>{w.gloss.length > 28 ? w.gloss.slice(0, 27) + '…' : w.gloss}</small>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {available.length > shown.length && !filter && <p className="lx-muted">{available.length - shown.length} more languages — search above or choose languages for the prism.</p>}
      </section>

      <CompareBench entry={entry} L={L} />
    </div>
  );
}

function KinCard({ v, onWord }: { v: KinshipVerdict; onWord: (w: string) => void }) {
  return (
    <article className="lx-kin" style={{ ['--k' as any]: KIN_COLOR[v.kinship] }}>
      <header><span className="lx-kin-lang">{v.langName}</span><span className="lx-kin-badge">{KIN_LABEL[v.kinship]}</span></header>
      <button className="lx-kin-word" onClick={() => onWord(v.word)} lang={speechTag(v.lang) ?? v.lang}>{v.word}</button>
      <p className="lx-kin-gloss">means <i>{v.gloss.length > 90 ? v.gloss.slice(0, 89) + '…' : v.gloss}</i></p>
      <div className="lx-meter" aria-label={`Meaning overlap ${Math.round(v.overlap * 100)}%`}><i style={{ width: `${Math.max(4, v.overlap * 100)}%` }} /></div>
      <p className="lx-kin-why">{v.why}</p>
    </article>
  );
}

function CompareBench({ entry, L }: { entry: WordEntry; L: LangEntry }) {
  const [other, setOther] = useState('');
  const [otherLang, setOtherLang] = useState(L.lang === 'en' ? 'fr' : 'en');
  const [res, setRes] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const run = async (e: React.FormEvent) => {
    e.preventDefault(); if (!other.trim()) return;
    setBusy(true); setErr(null);
    try { setRes(await api.compare(entry.title, L.lang, other.trim(), otherLang)); } catch (x: any) { setErr(x?.message ?? 'Could not compare.'); setRes(null); } finally { setBusy(false); }
  };
  return (
    <section className="lx-bench">
      <h2 className="lx-h2">Compare with another word</h2>
      <p className="lx-muted">Put “{entry.title}” beside any word in any language and see where their meanings meet and part.</p>
      <form onSubmit={run} className="lx-bench-form">
        <span className="lx-bench-a">{entry.title} <small>{L.langName}</small></span>
        <span aria-hidden>⇄</span>
        <input value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. présent, regalo, present" aria-label="Word to compare" />
        <select value={otherLang} onChange={e => setOtherLang(e.target.value)} aria-label="Its language">
          {Object.entries(LANGS).filter(([, v]) => v.bcp47 || ['en', 'la', 'grc'].includes(v.name)).map(([c, v]) => <option key={c} value={c}>{v.name}</option>)}
        </select>
        <button type="submit" disabled={busy}>{busy ? 'Weighing…' : 'Compare'}</button>
      </form>
      {err && <p className="lx-error">{err}</p>}
      {res && (
        <div className="lx-bench-res" style={{ ['--k' as any]: KIN_COLOR[res.verdict] }}>
          <p className="lx-bench-sum"><span className="lx-kin-badge">{KIN_LABEL[res.verdict]}</span> {res.summary} <b>{Math.round(res.score * 100)}%</b></p>
          <div className="lx-align">
            {res.pairs.slice(0, 6).map((p, i) => (
              <div key={i} className="lx-align-row">
                <p>{p.a}</p>
                <div className="lx-align-bridge"><i style={{ opacity: 0.25 + p.overlap * 0.75, height: `${2 + p.overlap * 6}px` }} /><small>{Math.round(p.overlap * 100)}%</small></div>
                <p>{p.b}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Slang ───────────────────────────────────────────────────────────────────

function SlangChapter({ word, rows, reload }: { word: string; rows: SlangEntry[] | null; reload: () => void }) {
  const [form, setForm] = useState({ meaning: '', example: '', region: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (rows === null) return <div className="lx-loading"><span className="lx-quill" /> Listening on the corner…</div>;
  const shelves: { id: SlangEntry['source']; title: string; sub: string }[] = [
    { id: 'community', title: 'On the street now', sub: 'Added and voted on by Plajah members' },
    { id: 'wiktionary', title: 'In the dictionaries', sub: 'Slang and informal senses recorded by Wiktionary' },
    { id: 'grose1811', title: 'The Vulgar Tongue, 1811', sub: "Captain Grose's dictionary of London cant — public domain" },
  ];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { await api.addSlang({ word, ...form }); setForm({ meaning: '', example: '', region: '' }); setOpen(false); setMsg('Added to the street shelf.'); reload(); }
    catch (x: any) { setMsg(x?.status === 401 ? 'Sign in to add slang.' : x?.message ?? 'Could not add it.'); }
  };
  const vote = async (id: string, dir: 1 | -1) => { try { await api.voteSlang(id, dir); reload(); } catch (x: any) { setMsg(x?.status === 401 ? 'Sign in to vote.' : x?.status === 409 ? 'You already voted on that one.' : 'Could not vote.'); } };
  const report = async (id: string) => { try { await api.reportSlang(id); setMsg('Reported — thanks. Three reports hide an entry for review.'); reload(); } catch { setMsg('Sign in to report.'); } };
  return (
    <div className="lx-slang">
      <p className="lx-muted">Explicit entries are kept off this page. {rows.length === 0 && `No slang recorded for “${word}” yet — be the first.`}</p>
      {msg && <p className="lx-note" role="status">{msg}</p>}
      {shelves.map(s => {
        const list = rows.filter(r => r.source === s.id);
        if (!list.length && s.id !== 'community') return null;
        return (
          <section key={s.id} className={`lx-shelf lx-shelf-${s.id}`}>
            <header><h3>{s.title}</h3><small>{s.sub}</small></header>
            {list.map(r => (
              <article key={r.id} className="lx-slang-card">
                <div className="lx-slang-top">
                  <b>{r.word}</b>
                  {r.region && <span className="lx-label">{r.region}</span>}
                  {r.era && <span className="lx-label old">{r.era}</span>}
                </div>
                <p>{r.meaning}</p>
                {r.example && <blockquote className="lx-ex">{r.example}</blockquote>}
                {r.source === 'community' && (
                  <footer>
                    <button onClick={() => vote(r.id, 1)} aria-label="Up-vote">▲</button><span>{r.votes ?? 0}</span><button onClick={() => vote(r.id, -1)} aria-label="Down-vote">▼</button>
                    {r.byName && <small>added by {r.byName}</small>}
                    <button className="lx-report" onClick={() => report(r.id)}>Report</button>
                  </footer>
                )}
              </article>
            ))}
            {s.id === 'community' && (open ? (
              <form className="lx-slang-form" onSubmit={submit}>
                <label>What does “{word}” mean on the street?<textarea required minLength={4} maxLength={500} value={form.meaning} onChange={e => setForm({ ...form, meaning: e.target.value })} /></label>
                <label>Use it in a sentence<input maxLength={300} value={form.example} onChange={e => setForm({ ...form, example: e.target.value })} /></label>
                <label>Where is it said?<input maxLength={60} placeholder="e.g. Atlanta, London, online" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></label>
                <div><button type="submit">Add to the shelf</button> <button type="button" className="lx-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
              </form>
            ) : <button className="lx-ghost" onClick={() => setOpen(true)}>+ Add a street meaning for “{word}”</button>)}
          </section>
        );
      })}
    </div>
  );
}

// ─── Life of the word ────────────────────────────────────────────────────────

function LifeChapter({ word, L, points }: { word: string; L: LangEntry; points: UsagePoint[] | null | undefined }) {
  const dated = L.etymologies.flatMap(g => g.pos.flatMap(p => p.senses.filter(s => s.dated).map(s => ({ s, pos: p.pos }))));
  const attested = L.etymologies.map(g => g.etymology?.attested).filter(Boolean);
  const story = useMemo(() => {
    if (!points?.length) return null;
    const avg = (a: number, b: number) => { const xs = points.filter(p => p.year >= a && p.year <= b); return xs.reduce((n, p) => n + p.perMillion, 0) / (xs.length || 1); };
    const then = avg(1800, 1820); const now = avg(2000, 2019);
    const peak = points.reduce((a, b) => (b.perMillion > a.perMillion ? b : a), points[0]);
    const ratio = then > 0 ? now / then : Infinity;
    const trend = !Number.isFinite(ratio) ? 'appeared in print after 1820 and has been gaining ground since' : ratio > 1.6 ? `is about ${ratio.toFixed(1)}× as common in books now as in 1810` : ratio < 0.6 ? `has faded to about ${Math.round(ratio * 100)}% of its 1810 frequency` : 'has held remarkably steady since 1810';
    return { peak, trend, now };
  }, [points]);
  return (
    <div className="lx-life-ch">
      <h2 className="lx-h2">Two centuries in print</h2>
      {points === undefined && <div className="lx-loading"><span className="lx-quill" /> Counting through two hundred years of books…</div>}
      {points === null && <p className="lx-muted">Usage history isn't available for this word or language.</p>}
      {points && points.length > 0 && <>
        {story && <p className="lx-story">“{word}” {story.trend}. It peaked around <b>{story.peak.year}</b>; today it turns up roughly <b>{story.now < 1 ? story.now.toFixed(2) : Math.round(story.now)}</b> times per million words.</p>}
        <LifeChart points={points} word={word} />
      </>}
      {(dated.length > 0 || attested.length > 0) && (
        <section className="lx-dates">
          <h3>When its meanings arrived</h3>
          <ul>
            {attested.map((a, i) => <li key={`a${i}`}><b>The word</b> — {a}</li>)}
            {dated.map(({ s, pos }) => <li key={s.id}><b>{s.dated}</b> <i>{pos.toLowerCase()}</i> — {segText(s.text)}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── attribution ─────────────────────────────────────────────────────────────

function Sources({ entry, tab }: { entry: WordEntry; tab: LexiconTab }) {
  return (
    <footer className="lx-sources">
      Entry text from <a href={entry.source.wiktionaryUrl} target="_blank" rel="noreferrer">Wiktionary</a>{entry.source.revision ? ` (revision ${entry.source.revision})` : ''}, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
      {tab === 'thesaurus' && <> · relations from <a href="https://www.datamuse.com/api/" target="_blank" rel="noreferrer">Datamuse</a> (WordNet)</>}
      {tab === 'life' && <> · usage from <a href="https://books.google.com/ngrams" target="_blank" rel="noreferrer">Google Books Ngram</a> (CC BY 3.0)</>}
      {tab === 'slang' && <> · Grose, <i>Dictionary of the Vulgar Tongue</i> (1811), public domain via Project Gutenberg</>}
      {tab === 'languages' && <> · meaning comparisons computed by Plajah from the glosses above</>}
    </footer>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const CSS = `
.lx-root{min-height:100%;background:radial-gradient(1200px 600px at 20% -10%,#3a2b4d 0%,#1c1424 55%,#130d19 100%);color:var(--lx-ink);font-family:'EB Garamond',Georgia,serif;padding:0 0 64px}
.lx-root *{box-sizing:border-box}
:where(.lx-root button){font:inherit;color:inherit;cursor:pointer}
.lx-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;padding:14px clamp(16px,4vw,48px);background:linear-gradient(#1c1424f2,#1c1424d9);backdrop-filter:blur(8px);border-bottom:1px solid #ffffff14}
.lx-back{background:none;border:0;color:#efe6d1;opacity:.75;font-size:15px}
.lx-back:hover{opacity:1}
.lx-brand{display:flex;align-items:center;gap:10px;color:#efe6d1;font-size:20px;letter-spacing:.02em;white-space:nowrap}
.lx-brand em{font-family:'IM Fell English',serif}
.lx-brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--lx-accent);color:#f7f2e7;font-family:'IM Fell English',serif;font-size:22px;box-shadow:0 0 0 3px #a8301d33}
.lx-search{position:relative;flex:1;display:flex;max-width:680px;margin-left:auto}
.lx-search input{flex:1;min-width:0;font-family:'EB Garamond',serif;font-size:19px;font-style:italic;padding:10px 16px;border-radius:999px 0 0 999px;border:1px solid #efe6d133;background:#efe6d114;color:#f7f2e7;outline:none;transition:background .2s,border-color .2s}
.lx-search input:focus{background:#efe6d126;border-color:#efe6d177}
.lx-search input::placeholder{color:#efe6d177}
.lx-search>button{border:0;border-radius:0 999px 999px 0;padding:0 18px;background:var(--lx-accent);color:#f7f2e7;font-size:15px;letter-spacing:.04em}
.lx-suggest{position:absolute;top:calc(100% + 6px);left:0;right:0;list-style:none;margin:0;padding:6px;border-radius:12px;background:var(--lx-paper);background-image:var(--lx-grain);box-shadow:0 18px 40px #0008;z-index:30}
.lx-suggest button{display:block;width:100%;text-align:left;border:0;background:none;padding:8px 12px;border-radius:8px;font-size:18px}
.lx-suggest button:hover{background:#00000010}
.lx-desk{padding:clamp(16px,4vw,48px);max-width:1180px;margin:0 auto}
.lx-folio{position:relative;background-color:var(--lx-paper);background-image:var(--lx-grain),radial-gradient(900px 400px at 0% 0%,var(--lx-wash1) 0%,transparent 60%),radial-gradient(700px 500px at 100% 100%,var(--lx-wash2) 0%,transparent 55%);border-radius:6px;padding:clamp(18px,4vw,56px) clamp(16px,4.5vw,64px) 72px;box-shadow:0 30px 80px #0009,inset 0 0 0 1px var(--lx-edge),inset 0 0 120px #8a6a3a22;animation:lx-in .5s ease both}
@keyframes lx-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.lx-trail{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:14px;margin-bottom:12px;opacity:.75}
.lx-trail button{border:0;background:none;text-decoration:underline dotted;padding:0}
.lx-loading{display:flex;align-items:center;gap:12px;font-style:italic;opacity:.75;padding:24px 0}
.lx-quill{width:22px;height:22px;border:2px solid var(--lx-ink);border-top-color:transparent;border-radius:50%;animation:lx-spin 1s linear infinite}
@keyframes lx-spin{to{transform:rotate(360deg)}}
.lx-error{color:var(--lx-accent);font-style:italic}
.lx-note{background:#245e5214;border-left:3px solid #245e52;padding:8px 12px;border-radius:4px}
.lx-muted{opacity:.7;font-style:italic;margin:.2em 0 .9em}
.lx-missing h2{font-weight:500;font-size:28px}
.lx-link{border:0;background:none;padding:0;text-decoration:underline;text-decoration-style:dotted;text-decoration-color:color-mix(in srgb,var(--lx-accent) 70%,transparent);text-underline-offset:3px}
.lx-link:hover{color:var(--lx-accent)}
.lx-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:20px;align-items:flex-end;border-bottom:1.5px solid var(--lx-ink);padding-bottom:18px;margin-bottom:6px}
.lx-headword{font-family:'EB Garamond',serif;font-weight:500;font-size:clamp(48px,9vw,104px);line-height:.9;margin:0;letter-spacing:-.01em;text-shadow:1px 1px 0 #fff6,0 0 1px var(--lx-ink);overflow-wrap:anywhere}
.lx-pron{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.lx-ipa{font-family:'Charis SIL','Doulos SIL','Gentium Plus','EB Garamond',serif;font-size:19px;opacity:.85}
.lx-syl{font-variant:small-caps;letter-spacing:.08em;opacity:.7}
.lx-play{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--lx-ink);background:transparent;border-radius:999px;padding:3px 11px;font-size:14px}
.lx-play:hover,.lx-play.on{background:var(--lx-ink);color:var(--lx-paper)}
.lx-rhyme{font-size:14px;opacity:.65;font-style:italic}
.lx-head-side{display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:440px}
.lx-save{border:1.5px solid var(--lx-accent);color:var(--lx-accent);background:transparent;border-radius:999px;padding:6px 16px;font-size:15px}
.lx-save.on{background:var(--lx-accent);color:#f7f2e7}
.lx-langs{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;font-size:13px;align-items:center}
.lx-langs span{opacity:.6;font-style:italic;margin-right:2px}
.lx-langs button{border:1px solid color-mix(in srgb,var(--fam) 50%,transparent);background:transparent;border-radius:4px;padding:2px 8px;color:var(--fam)}
.lx-langs button.on{background:var(--fam);color:var(--lx-paper)}
.lx-tabs{display:flex;gap:4px;margin:0 -8px 26px;padding:0 8px;overflow-x:auto;scrollbar-width:none}
.lx-tabs::-webkit-scrollbar{display:none}
.lx-tabs button{flex:none;border:0;background:color-mix(in srgb,var(--lx-paper) 70%,var(--lx-wash1));padding:12px 16px 10px;border-radius:0 0 10px 10px;font-size:16px;letter-spacing:.02em;box-shadow:inset 0 3px 4px -2px #0003;transform:translateY(-1px);transition:transform .2s,background .2s;animation:lx-tab .35s calc(var(--i)*50ms) ease both}
@keyframes lx-tab{from{transform:translateY(-14px);opacity:0}}
.lx-tabs button:hover{transform:translateY(2px)}
.lx-tabs button.on{background:var(--lx-ink);color:var(--lx-paper);transform:translateY(5px);box-shadow:0 6px 12px -6px #0008}
.lx-chapter{animation:lx-in .35s ease both}
.lx-h2{font-family:'IM Fell English',serif;font-weight:400;font-size:28px;margin:28px 0 6px}
.lx-pos h2{display:flex;align-items:baseline;gap:12px;font-weight:500;font-size:15px;letter-spacing:.18em;text-transform:uppercase;margin:26px 0 10px;color:var(--lx-accent)}
.lx-pos h2 small{letter-spacing:0;text-transform:none;font-style:italic;color:var(--lx-ink);opacity:.6;font-size:15px}
.lx-pos ol{margin:0;padding-left:1.6em;counter-reset:s}
.lx-pos li{font-size:20px;line-height:1.5;margin:0 0 12px;padding-left:4px}
.lx-pos li::marker{font-family:'IM Fell English',serif;color:var(--lx-accent)}
.lx-pos li.sub{margin-left:1.4em;font-size:18px;list-style-type:lower-alpha}
.lx-labels{display:inline-flex;flex-wrap:wrap;gap:4px;margin-right:8px;vertical-align:2px}
.lx-label{font-family:'Kalam',cursive;font-size:12.5px;line-height:1;padding:4px 7px 3px;border:1px solid currentColor;border-radius:3px;color:#1f2b5c;transform:rotate(-1.5deg);display:inline-block}
.lx-label.hot{color:var(--lx-accent)}
.lx-label.old{color:#7a5a1e}
.lx-dated{margin-left:8px;font-size:14px;font-style:italic;opacity:.65}
.lx-ex{margin:6px 0 4px;padding-left:14px;border-left:2px solid color-mix(in srgb,var(--lx-accent) 45%,transparent);font-style:italic;font-size:17px;opacity:.85}
.lx-sensesyn{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.lx-chip{border:1px solid #1f2b5c55;color:#1f2b5c;background:#1f2b5c0a;border-radius:999px;padding:1px 10px;font-size:15px}
.lx-chip.anti{border-color:#a8301d55;color:#a8301d;background:#a8301d0a}
.lx-homograph{font-family:'Kalam',cursive;font-weight:400;opacity:.7;margin-top:28px}
.lx-etyteaser{margin:18px 0;padding:16px 20px;background:#ffffff40;border:1px dashed var(--lx-edge);border-radius:6px;cursor:pointer;transition:background .2s}
.lx-etyteaser:hover{background:#ffffff70}
.lx-etyteaser p{margin:6px 0;font-size:18px}
.lx-stamp{display:inline-block;font-family:'Kalam',cursive;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--lx-accent);border:2px solid var(--lx-accent);padding:3px 10px 2px;border-radius:4px;transform:rotate(-3deg);opacity:.85}
.lx-stamp.small{font-size:11px;padding:2px 7px 1px}
.lx-more{font-size:15px;color:var(--lx-accent)}
.lx-cloud{display:flex;flex-wrap:wrap;gap:6px 8px;margin:6px 0 14px}
.lx-cloud button{border:0;border-bottom:1px solid #2a223633;background:none;padding:1px 2px;font-size:17px}
.lx-cloud button:hover{color:var(--lx-accent);border-color:var(--lx-accent)}
.lx-cloud small{opacity:.55;font-size:12px;margin-right:3px}
.lx-family h3,.lx-shelves h3,.lx-dates h3{font-family:'IM Fell English',serif;font-weight:400;font-size:21px;margin:22px 0 4px}
.lx-filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.lx-filters button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--c);color:var(--c);background:transparent;border-radius:999px;padding:3px 12px;font-size:14px;opacity:.55}
.lx-filters button.on{opacity:1;background:color-mix(in srgb,var(--c) 10%,transparent)}
.lx-filters i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.lx-filters small{opacity:.7}
.lx-web{width:100%;max-height:600px;display:block}
.lx-web-center{font-family:'EB Garamond',serif;font-size:40px;font-weight:500;fill:var(--lx-ink)}
.lx-web-word{font-family:'EB Garamond',serif;transition:opacity .2s}
.lx-node{animation:lx-pop .5s ease both;transform-box:fill-box;transform-origin:center}
.lx-node:hover .lx-web-word,.lx-node:focus .lx-web-word{text-decoration:underline}
.lx-node:focus{outline:none}
@keyframes lx-pop{from{opacity:0;transform:scale(.4)}}
.lx-thes-lists{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px 28px}
.lx-thes-lists h4{margin:14px 0 2px;font-weight:500;font-size:15px;letter-spacing:.1em;text-transform:uppercase}
.lx-scrollx{overflow-x:auto;margin:0 -8px;padding:0 8px;scrollbar-width:thin}
.lx-journey{min-width:760px;width:100%;display:block}
.lx-axis{font-family:'EB Garamond',serif;font-size:12px;fill:var(--lx-ink)}
.lx-st-lang{font-family:'Kalam',cursive;font-size:11.5px}
.lx-st-word{font-family:'EB Garamond',serif;font-size:17px;font-style:italic;fill:var(--lx-ink)}
.lx-st-gloss{font-family:'EB Garamond',serif;font-size:10.5px;fill:var(--lx-ink);opacity:.7}
.lx-st-rel{font-family:'Kalam',cursive;font-size:11px;fill:var(--lx-accent);opacity:.85}
.lx-station{animation:lx-rise .5s ease both}
@keyframes lx-rise{from{opacity:0;transform:translateY(8px)}}
.lx-draw{stroke-dasharray:1400;stroke-dashoffset:1400;animation:lx-drawin 1.6s ease forwards}
@keyframes lx-drawin{to{stroke-dashoffset:0}}
.lx-manuscript{font-size:20px;line-height:1.6;margin:18px 0}
.lx-dropcap{float:left;font-family:'IM Fell English',serif;font-size:66px;line-height:.8;padding:6px 10px 0 0;color:var(--lx-accent)}
.lx-ety-facts{display:flex;flex-wrap:wrap;gap:10px;clear:both}
.lx-fact{background:#ffffff4d;border:1px solid var(--lx-edge);border-radius:6px;padding:6px 12px;font-size:16px}
.lx-fact b{font-family:'Kalam',cursive;font-weight:400;color:var(--lx-accent);margin-right:6px}
.lx-fan{min-width:620px;width:100%;display:block}
.lx-fan-root{font-family:'EB Garamond',serif;font-style:italic;font-size:15px;fill:var(--lx-paper)}
.lx-fan-label{font-family:'EB Garamond',serif;font-size:15px;fill:var(--lx-ink)}
.lx-branch{animation:lx-rise .45s ease both}
.lx-branch:hover .lx-fan-label{text-decoration:underline}
.lx-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:14px;margin:4px 0 10px}
.lx-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:0}
.lx-kin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.lx-kin{position:relative;background:#ffffff55;border:1px solid var(--lx-edge);border-top:4px solid var(--k);border-radius:6px;padding:12px 14px 12px;animation:lx-in .4s ease both}
.lx-kin header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.lx-kin-lang{font-family:'Kalam',cursive;font-size:14px;opacity:.75}
.lx-kin-badge{font-family:'Kalam',cursive;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--k);border:1.5px solid var(--k);border-radius:3px;padding:2px 6px 1px;transform:rotate(-2deg);display:inline-block;white-space:nowrap}
.lx-kin-word{display:block;border:0;background:none;padding:0;font-size:30px;font-style:italic;margin:4px 0 2px}
.lx-kin-gloss{margin:0;font-size:17px}
.lx-kin-why{margin:6px 0 0;font-size:14px;opacity:.75}
.lx-meter{height:5px;background:#00000012;border-radius:9px;margin-top:8px;overflow:hidden}
.lx-meter i{display:block;height:100%;background:var(--k);border-radius:9px;transition:width .6s ease}
.lx-row-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:12px}
.lx-ghost{border:1px dashed var(--lx-ink);background:transparent;border-radius:999px;padding:4px 14px;font-size:15px;opacity:.8}
.lx-ghost:hover{opacity:1;background:#ffffff40}
.lx-picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px;max-height:220px;overflow:auto;padding:10px;border:1px solid var(--lx-edge);border-radius:6px;background:#ffffff40;margin-bottom:12px;font-size:16px}
.lx-prism{border-collapse:separate;border-spacing:0;width:100%;min-width:560px;font-size:16px}
.lx-prism th{font-weight:500;text-align:left;padding:8px 10px;vertical-align:bottom}
.lx-prism thead th{font-size:14px;font-style:italic;border-bottom:1.5px solid var(--lx-ink);max-width:220px}
.lx-sense-no{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--lx-ink);color:var(--lx-paper);font-style:normal;font-size:12px;margin-right:6px}
.lx-prism tbody th{font-family:'Kalam',cursive;font-weight:400;white-space:nowrap}
.lx-prism td{padding:6px 8px;border-bottom:1px solid #2a22361a;vertical-align:top}
.lx-prism tr:hover td,.lx-prism tr:hover th{background:#ffffff40}
.lx-chipword{border:0;border-radius:4px;padding:2px 8px;margin:2px 4px 2px 0;font-size:16px;font-style:italic}
.lx-dash{opacity:.3}
.lx-shape{font-family:'Kalam',cursive;font-size:12.5px;white-space:nowrap;opacity:.8}
.lx-shape-splits{color:var(--lx-accent)}
.lx-shape-mirrors{color:#245e52}
.lx-filter{border:1px solid var(--lx-edge);background:#ffffff60;border-radius:999px;padding:6px 14px;font:inherit;font-size:16px;min-width:0;width:220px;max-width:100%}
.lx-atlas{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:10px}
.lx-atlas-card{background:#ffffff4a;border:1px solid var(--lx-edge);border-left:4px solid var(--fam);border-radius:6px;padding:10px 12px}
.lx-atlas-card header{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:4px}
.lx-atlas-card header span{font-size:14px;opacity:.65}
.lx-atlas-word{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;padding:3px 0}
.lx-foreign{font-size:21px}
.lx-speak{border:0;background:var(--fam);color:var(--lx-paper);width:22px;height:22px;border-radius:50%;font-size:12px;line-height:22px;padding:0;flex:none}
.lx-gender{font-size:13px;opacity:.6}
.lx-tr{opacity:.7;font-style:italic}
.lx-for{flex-basis:100%;padding-left:28px;font-size:13px;opacity:.55;font-style:italic}
.lx-bench{margin-top:20px;padding:18px 20px;border:1.5px solid var(--lx-ink);border-radius:8px;background:#ffffff33}
.lx-bench-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lx-bench-a{font-size:22px;font-style:italic}
.lx-bench-a small{font-size:13px;font-style:normal;opacity:.6}
.lx-bench-form input,.lx-bench-form select{font:inherit;font-size:17px;padding:6px 12px;border:1px solid var(--lx-edge);border-radius:6px;background:#ffffffa0;min-width:0}
.lx-bench-form input{flex:1 1 180px}
.lx-bench-form button,.lx-slang-form button[type=submit]{border:0;background:var(--lx-ink);color:var(--lx-paper);border-radius:999px;padding:7px 18px;font-size:15px}
.lx-bench-res{margin-top:14px}
.lx-bench-sum{font-size:18px}
.lx-bench-sum b{color:var(--k)}
.lx-align-row{display:grid;grid-template-columns:1fr 70px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dotted #2a223633;font-size:16px}
.lx-align-row p{margin:0}
.lx-align-bridge{display:flex;flex-direction:column;align-items:center;gap:2px}
.lx-align-bridge i{display:block;width:100%;background:var(--k);border-radius:4px}
.lx-align-bridge small{font-size:12px;opacity:.7}
.lx-slang{display:flex;flex-direction:column;gap:10px}
.lx-shelf{padding:16px 18px 18px;border-radius:8px;background:#ffffff40;border:1px solid var(--lx-edge)}
.lx-shelf header{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:8px}
.lx-shelf h3{margin:0;font-family:'IM Fell English',serif;font-weight:400;font-size:23px}
.lx-shelf header small{font-style:italic;opacity:.6}
.lx-shelf-community{background:linear-gradient(135deg,#1f2b5c0d,#a8301d0d);border-style:dashed}
.lx-shelf-grose1811{background:#7a5a1e0f;font-family:'IM Fell English',serif}
.lx-slang-card{padding:10px 0;border-top:1px dotted #2a223633}
.lx-slang-card:first-of-type{border-top:0}
.lx-slang-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lx-slang-top b{font-size:19px}
.lx-slang-card p{margin:4px 0;font-size:18px}
.lx-slang-card footer{display:flex;align-items:center;gap:8px;font-size:14px}
.lx-slang-card footer button{border:1px solid var(--lx-edge);background:transparent;border-radius:4px;padding:0 6px}
.lx-report{margin-left:auto;opacity:.55}
.lx-slang-form{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.lx-slang-form label{display:flex;flex-direction:column;gap:4px;font-size:16px}
.lx-slang-form textarea,.lx-slang-form input{font:inherit;font-size:17px;padding:8px 10px;border:1px solid var(--lx-edge);border-radius:6px;background:#ffffffa0}
.lx-slang-form textarea{min-height:80px}
.lx-life{width:100%;display:block;cursor:crosshair}
.lx-ink-line{stroke-dasharray:1;stroke-dashoffset:1;animation:lx-drawin 2.2s ease forwards}
.lx-peak{font-family:'Kalam',cursive;font-size:13px;fill:var(--lx-accent)}
.lx-tip-y{font-family:'EB Garamond',serif;font-size:15px;font-weight:600;fill:var(--lx-ink)}
.lx-tip-v{font-family:'EB Garamond',serif;font-size:12.5px;fill:var(--lx-ink)}
.lx-story{font-size:20px;line-height:1.5;max-width:760px}
.lx-dates ul{padding-left:1.2em;font-size:17px;line-height:1.5}
.lx-sources{margin-top:44px;padding-top:12px;border-top:1px solid var(--lx-edge);font-size:13px;opacity:.7}
.lx-sources a{color:inherit}
.lx-lobby{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:clamp(20px,4vw,48px);align-items:start}
.lx-hero{color:#efe6d1;padding-top:clamp(8px,4vw,40px)}
.lx-kicker{font-family:'Kalam',cursive;letter-spacing:.06em;opacity:.7;margin:0}
.lx-hero h1{font-family:'EB Garamond',serif;font-weight:500;font-size:clamp(46px,7.5vw,92px);line-height:.95;margin:14px 0 18px}
.lx-hero h1 em{font-family:'IM Fell English',serif;color:#e9b48a}
.lx-lede{font-size:20px;line-height:1.55;max-width:560px;opacity:.85}
.lx-try{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.lx-try button{border:1px solid #efe6d144;background:#efe6d10d;color:#efe6d1;border-radius:999px;padding:5px 15px;font-size:17px;font-style:italic;transition:background .2s}
.lx-try button:hover{background:#efe6d126}
.lx-wotd{position:relative;background-color:var(--lx-paper);background-image:var(--lx-grain),radial-gradient(500px 300px at 100% 0%,var(--lx-wash1),transparent 70%);border-radius:6px;padding:28px 28px 24px;box-shadow:0 24px 60px #0009;transform:rotate(1.2deg);cursor:pointer;transition:transform .3s;margin-top:clamp(0px,3vw,36px)}
.lx-wotd:hover{transform:rotate(0) translateY(-3px)}
.lx-wotd h2{font-family:'EB Garamond',serif;font-weight:500;font-size:clamp(40px,5vw,60px);margin:12px 0 0;line-height:1}
.lx-wotd-def{font-size:18px;line-height:1.45}
.lx-wotd-chain{font-size:15px;line-height:1.6;opacity:.9}
.lx-shelves{grid-column:1/-1;color:#efe6d1}
.lx-shelves .lx-cloud button{color:#efe6d1;border-color:#efe6d133}
.lx-letters{display:flex;flex-wrap:wrap;gap:6px}
.lx-letter{width:44px;height:52px;border:1px solid #efe6d133;background:#efe6d10a;color:#efe6d1;border-radius:4px;font-family:'IM Fell English',serif;font-size:26px;transition:transform .2s,background .2s}
.lx-letter:hover{transform:translateY(-3px) rotate(-2deg);background:var(--lx-accent);border-color:var(--lx-accent)}
@media (max-width:760px){
  .lx-top{flex-wrap:wrap;gap:10px;padding:10px 16px}
  .lx-search{order:3;flex-basis:100%;max-width:none}
  .lx-desk{padding:16px}
  .lx-lobby{grid-template-columns:1fr}
  .lx-wotd{transform:none}
  .lx-head-side{align-items:flex-start;max-width:none}
  .lx-langs{justify-content:flex-start}
  .lx-pos li{font-size:18px}
  .lx-align-row{grid-template-columns:1fr;gap:4px}
  .lx-align-bridge{flex-direction:row}
  .lx-align-bridge i{width:60px}
}
@media (prefers-reduced-motion:reduce){.lx-root *{animation:none!important;transition:none!important}.lx-draw,.lx-ink-line{stroke-dashoffset:0}}
`;

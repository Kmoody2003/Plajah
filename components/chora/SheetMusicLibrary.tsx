// ─────────────────────────────────────────────────────────────────────────────
// SheetMusicLibrary — the free sheet-music catalogue, rendered as a tab inside
// <ChoraConservatory>.
//
// ~3,300 scores from OpenScore (CC0 MusicXML, engraved in-app by Verovio) and the
// Mutopia Project (PDF + MIDI, public domain / CC BY / CC BY-SA). Every score shows two
// rights lines kept apart on purpose: the EDITION's licence (this engraving) and, per
// country, whether the MUSIC itself is public domain — from services/publicDomainRights.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, FileMusic, ExternalLink, ChevronLeft, Loader2, ShieldCheck, Download, ScrollText, Globe2, FolderDown,
} from 'lucide-react';
import {
  loadScoreCatalog, scoreRights, filterScores, scoreFileUrl, scoreSourceFileUrl, SCORE_SHELVES, SOURCE_LABEL, SOURCE_HOME,
  type ScoreCatalog, type ScoreEntry, type ScoreFileKind,
} from '../../services/scoreCatalog';
import { downloadScorePack, estimatePackBytes, canPickPackFolder, type PackProgress, type PackResult } from '../../services/scorePack';
import { LIFE_TERMS } from '../../services/publicDomainRights';

const VerovioScore = lazy(() => import('../VerovioScore'));

const ACCENT = '#E0A458';
const PAGE = 48;

const lifespan = (e: ScoreEntry) =>
  e.traditional ? 'Traditional' : e.born || e.died ? `${e.born ?? '?'}–${e.died ?? '?'}` : '';

const countryName = (code: string) => (code === 'US' ? 'United States' : LIFE_TERMS[code]?.name ?? code);

// ── card ─────────────────────────────────────────────────────────────────────

const ScoreCard: React.FC<{ entry: ScoreEntry; onOpen: () => void }> = ({ entry, onOpen }) => {
  const rights = useMemo(() => scoreRights(entry), [entry]);
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-3xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.28em] truncate" style={{ color: ACCENT }}>
          {entry.composer}
        </p>
        <FileMusic size={13} style={{ color: ACCENT }} className="shrink-0" />
      </div>
      <h3 className="text-[14px] font-black tracking-tight leading-snug mt-1 line-clamp-2">{entry.title}</h3>
      {entry.set && <p className="text-[11px] text-white/35 mt-0.5 line-clamp-1">{entry.set}</p>}
      <div className="flex items-center gap-2 mt-2 text-[10px] font-bold uppercase tracking-widest text-white/30 flex-wrap">
        {lifespan(entry) && <span>{lifespan(entry)}</span>}
        {entry.forces && <span className="truncate max-w-[12rem]">{entry.forces}</span>}
      </div>
      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <ShieldCheck size={10} style={{ color: rights.compositionFreeUS ? ACCENT : 'rgba(255,255,255,0.42)' }} />
        <span
          className="text-[9px] font-black uppercase tracking-widest leading-snug"
          style={{ color: rights.compositionFreeUS ? ACCENT : 'rgba(255,255,255,0.42)' }}
        >
          {rights.label}
        </span>
      </div>
    </button>
  );
};

// ── detail ───────────────────────────────────────────────────────────────────

const ScoreDetail: React.FC<{ entry: ScoreEntry; catalog: ScoreCatalog | null; onBack: () => void }> = ({ entry, catalog, onBack }) => {
  const rights = useMemo(() => scoreRights(entry), [entry]);
  const file = (kind: ScoreFileKind) => scoreFileUrl(catalog, entry, kind);
  // Our copy first; if the engraver can't load it, try the original source once before giving up.
  const [mxlUrl, setMxlUrl] = useState(() => file('mxl'));
  const [mxlFailed, setMxlFailed] = useState(false);
  const onMxlFail = () => {
    const source = scoreSourceFileUrl(entry, 'mxl');
    if (source && mxlUrl !== source) setMxlUrl(source); else setMxlFailed(true);
  };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
      >
        <ChevronLeft size={13} /> Back to the catalogue
      </button>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: ACCENT }}>
          {entry.composer}{lifespan(entry) ? ` · ${lifespan(entry)}` : ''}
        </p>
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight mt-1">{entry.title}</h2>
        <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-widest text-white/30 flex-wrap">
          {entry.set && <span>{entry.set}</span>}
          {entry.forces && <span>{entry.forces}</span>}
          {entry.style && <span>{entry.style}</span>}
          {entry.dateText && <span>{entry.dateText}</span>}
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {entry.pdfUrl && (
            <a href={file('pdf')} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: ACCENT, color: '#000' }}>
              <Download size={12} /> PDF
            </a>
          )}
          {entry.pdfZipUrl && (
            <a href={file('pdfZip')} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: ACCENT, color: '#000' }}>
              <Download size={12} /> PDF parts (zip)
            </a>
          )}
          {entry.mxlUrl && (
            <a href={file('mxl')} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/60 hover:text-white transition-colors">
              <Download size={12} /> MusicXML
            </a>
          )}
          {entry.midiUrl && (
            <a href={file('midi')} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/60 hover:text-white transition-colors">
              <Download size={12} /> MIDI
            </a>
          )}
          <a href={entry.sourceUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors">
            {SOURCE_LABEL[entry.source]} <ExternalLink size={11} />
          </a>
        </div>

        {/* Rights: the edition and the music, kept apart */}
        <div className="mt-5 pt-4 border-t border-white/8 grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-1.5">
              <ScrollText size={11} /> This edition
            </p>
            <p className="text-[12px] font-black mt-1.5" style={{ color: ACCENT }}>
              <a href={entry.edition.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{entry.edition.label}</a>
              {entry.engraver ? ` · engraved by ${entry.engraver}` : ''}
            </p>
            <p className="text-[11px] text-white/40 leading-relaxed mt-1">{rights.use}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-1.5">
              <Globe2 size={11} /> The music itself
            </p>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {rights.composition.map(v => (
                <span
                  key={v.jurisdiction}
                  title={`${countryName(v.jurisdiction)} — ${v.reason}`}
                  className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
                  style={v.status === 'PUBLIC_DOMAIN'
                    ? { background: `${ACCENT}1a`, borderColor: `${ACCENT}4a`, color: ACCENT }
                    : v.status === 'PROTECTED'
                      ? { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
                      : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)' }}
                >
                  {v.jurisdiction} {v.status === 'PUBLIC_DOMAIN' ? 'free' : v.status === 'PROTECTED' ? `from ${v.freeFrom}` : '?'}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed mt-1.5">
              {entry.traditional
                ? 'A traditional tune with no author to count from. Treat it as the heritage of the community it comes from, and name that community when you use it.'
                : entry.died
                  ? `Counted from the composer's death in ${entry.died}${entry.datesFrom === 'wikidata' ? ' (date from Wikidata)' : ''}. Hover a country for its rule.` +
                    (entry.died > 1926
                      ? ` The US counts from first publication instead: music published in ${new Date().getFullYear() - 96} or earlier is free there, and ${SOURCE_LABEL[entry.source]} only engraves editions it holds to be public domain.`
                      : '')
                  : `The composer's death year isn't recorded. ${SOURCE_LABEL[entry.source]} publishes only public domain music or new work its author has licensed to it.`}
            </p>
          </div>
        </div>
      </div>

      {/* The score itself */}
      {mxlUrl && !mxlFailed ? (
        <Suspense fallback={<div className="flex items-center justify-center gap-2 py-20 text-white/35"><Loader2 size={16} className="animate-spin" /> Loading engraver</div>}>
          <VerovioScore key={mxlUrl} mxlUrl={mxlUrl} title={entry.title} paged onFail={onMxlFail} />
        </Suspense>
      ) : entry.pdfUrl ? (
        <div className="rounded-3xl overflow-hidden border border-white/10 bg-white">
          <iframe src={file('pdf')} title={entry.title} className="w-full h-[80vh]" />
        </div>
      ) : (
        <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-8 text-center text-[12px] text-white/40">
          This score ships as a zip of separate parts — download it above.
        </div>
      )}
    </motion.div>
  );
};

// ── download packs ───────────────────────────────────────────────────────────

const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

const PackBar: React.FC<{ catalog: ScoreCatalog; shelfEntries: ScoreEntry[]; shelfName: string }> = ({ catalog, shelfEntries, shelfName }) => {
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [result, setResult] = useState<PackResult | null>(null);
  const busy = !!progress && !result;

  const run = async (entries: ScoreEntry[], name: string) => {
    setResult(null);
    setProgress({ done: 0, total: 1, bytes: 0 });
    const r = await downloadScorePack({ catalog, entries, packName: name, onProgress: setProgress });
    if (!r) { setProgress(null); return; }
    setResult(r);
  };

  const everything = catalog.entries.length !== shelfEntries.length;
  return (
    <div className="mt-3 pt-3 border-t border-white/8">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          disabled={busy}
          onClick={() => run(shelfEntries, shelfName)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
          style={{ background: ACCENT, color: '#000' }}
        >
          <FolderDown size={12} /> Download this shelf · ~{mb(estimatePackBytes(shelfEntries))}
        </button>
        {everything && (
          <button
            disabled={busy}
            onClick={() => run(catalog.entries, 'Everything')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/60 hover:text-white transition-colors disabled:opacity-40"
          >
            <FolderDown size={12} /> Everything · {catalog.entries.length.toLocaleString()} scores · ~{mb(estimatePackBytes(catalog.entries))}
          </button>
        )}
      </div>
      <p className="text-[11px] text-white/35 leading-relaxed mt-2">
        {busy
          ? `Downloading ${progress!.done.toLocaleString()} of ${progress!.total.toLocaleString()} files · ${mb(progress!.bytes)}${progress!.current ? ` · ${progress!.current}` : ''}`
          : result
            ? `${result.target === 'folder' ? 'Saved' : 'Zipped'} ${result.saved.toLocaleString()} files (${mb(result.bytes)})` +
              (result.skipped ? `, ${result.skipped.toLocaleString()} already there` : '') +
              (result.failed.length ? `. ${result.failed.length} could not be fetched — run it again later to fill them in.` : '.') +
              ' CREDITS.txt lists every edition and how to credit it.'
            : canPickPackFolder()
              ? 'Pick a folder on any drive. PDFs, MusicXML and MIDI land in Plajah Sheet Music, sorted by composer, ready offline. Run it again any time to resume or add new scores.'
              : 'Downloads as one .zip with PDFs, MusicXML and MIDI, sorted by composer, plus CREDITS.txt.'}
      </p>
    </div>
  );
};

// ── main ─────────────────────────────────────────────────────────────────────

const SheetMusicLibrary: React.FC = () => {
  const [catalog, setCatalog] = useState<ScoreCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [shelfId, setShelfId] = useState('folk');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<ScoreEntry | null>(null);

  useEffect(() => {
    let live = true;
    loadScoreCatalog().then(c => { if (!live) return; if (c) setCatalog(c); else setFailed(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => { setLimit(PAGE); }, [shelfId, query]);

  const results = useMemo(
    () => (catalog ? filterScores(catalog.entries, shelfId, query) : []),
    [catalog, shelfId, query],
  );
  const shelf = SCORE_SHELVES.find(s => s.id === shelfId) ?? SCORE_SHELVES[0];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><FileMusic size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Free Sheet Music</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">
          {catalog ? `${catalog.stats.total.toLocaleString()} Scores, Free To Play` : 'Free To Play'}
        </h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
          Engraved scores from{' '}
          <a href={SOURCE_HOME.OPENSCORE_LIEDER} target="_blank" rel="noreferrer" className="underline underline-offset-2">OpenScore</a>{' '}
          and the{' '}
          <a href={SOURCE_HOME.MUTOPIA} target="_blank" rel="noreferrer" className="underline underline-offset-2">Mutopia Project</a>.
          Print them, perform them, record them. Each score says where the music is free and how to credit the edition.
        </p>
        <div className="mt-4 flex items-center gap-2 max-w-lg">
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.05] border border-white/10">
            <Search size={13} className="text-white/30 shrink-0" />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(null); }}
              placeholder="Search — Schubert, carol, guitar, Danny Boy…"
              className="bg-transparent outline-none text-[13px] w-full placeholder:text-white/25"
            />
          </div>
        </div>
      </div>

      {!open && (
        <div className="flex gap-2 flex-wrap">
          {SCORE_SHELVES.map(s => {
            const active = s.id === shelfId;
            return (
              <button
                key={s.id}
                onClick={() => setShelfId(s.id)}
                className="px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
                style={active
                  ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        {open ? (
          <ScoreDetail key={`score-${open.id}`} entry={open} catalog={catalog} onBack={() => setOpen(null)} />
        ) : (
          <motion.div key={`grid-${shelfId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
              <h2 className="text-lg font-black uppercase tracking-tight">{shelf.label}</h2>
              <p className="text-[13px] text-white/50 leading-relaxed mt-1">{shelf.blurb}</p>
              {catalog && (
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mt-2">
                  {results.length.toLocaleString()} {results.length === 1 ? 'score' : 'scores'}
                </p>
              )}
              {catalog && results.length > 0 && (
                <PackBar
                  catalog={catalog}
                  shelfEntries={results}
                  shelfName={query.trim() ? `${shelf.label} — ${query.trim()}` : shelf.label}
                />
              )}
            </div>

            {!catalog && !failed ? (
              <div className="flex items-center justify-center gap-2 py-20 text-white/35">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest">Opening the catalogue</span>
              </div>
            ) : failed ? (
              <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 text-center text-[12px] text-white/40">
                The score catalogue didn't load. Check your connection and reopen this tab.
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 text-center text-[12px] text-white/40">
                No scores match that. Try a composer, an instrument or a song title.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.slice(0, limit).map(e => <ScoreCard key={e.id} entry={e} onOpen={() => setOpen(e)} />)}
                </div>
                {results.length > limit && (
                  <div className="text-center">
                    <button
                      onClick={() => setLimit(l => l + PAGE)}
                      className="px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/60 hover:text-white transition-colors"
                    >
                      Show more · {(results.length - limit).toLocaleString()} left
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SheetMusicLibrary;

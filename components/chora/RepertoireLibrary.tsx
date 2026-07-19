// ─────────────────────────────────────────────────────────────────────────────
// RepertoireLibrary — Blueprint Part 4.3: "study the score while you listen."
//
// Every work is public domain. Where we have it, the score is now engraved
// NATIVELY, in-app, by Verovio — real notation on a real white page, not a link
// out — and a recording plays alongside it so you can follow along. IMSLP stays
// as the secondary "full edition" action for everything.
//
//   Scores : OpenScore Lieder Corpus, CC0-1.0, zipped MusicXML (.mxl).
//   Audio  : Internet Archive, licence surfaced per item.
//   Both   : see data/repertoireScores.ts — every URL there was HTTP-verified.
//
// Rendered as a tab inside <ChoraConservatory>.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, FileMusic, ExternalLink, Library, Users2, CalendarDays, X,
  BookOpen, Play, Pause, SkipBack, SkipForward, Scale, Loader2, Music4, Volume2,
} from 'lucide-react';
import { REPERTOIRE, REPERTOIRE_ERAS, type RepertoireEra, type RepertoireWork } from '../../data/repertoire';
import {
  REPERTOIRE_MEDIA, openScoreUrl, archiveAudioUrl, archiveItemUrl,
  OPENSCORE_CORPUS_URL, OPENSCORE_LICENCE, OPENSCORE_LICENCE_URL,
  NATIVE_SCORE_COUNT, AUDIO_COUNT,
  type RepertoireMedia,
} from '../../data/repertoireScores';

const VerovioScore = lazy(() => import('../VerovioScore'));

const ACCENT = '#E0A458';
const ALL = '__all__';

// ─── The reader ──────────────────────────────────────────────────────────────
// Score on the left (or on top, on a phone), transport + track list beside it.

const Transport: React.FC<{
  media: RepertoireMedia;
  index: number;
  onIndex: (i: number) => void;
}> = ({ media, index, onIndex }) => {
  const audio = media.audio!;
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const track = audio.tracks[index] || audio.tracks[0];

  // A new track should keep playing if we were already playing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (playing) { el.play().catch(() => setPlaying(false)); }
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => setPlaying(false)); } else { el.pause(); }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">Listen while you read</p>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="text-white/40 hover:text-white disabled:opacity-25 transition-colors"
          title="Previous"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={toggle}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105"
          style={{ background: ACCENT, color: '#000' }}
          title={playing ? 'Pause' : 'Play'}
        >
          {loading ? <Loader2 size={17} className="animate-spin" />
            : playing ? <Pause size={17} fill="currentColor" />
              : <Play size={17} className="translate-x-0.5" fill="currentColor" />}
        </button>
        <button
          onClick={() => onIndex(Math.min(audio.tracks.length - 1, index + 1))}
          disabled={index >= audio.tracks.length - 1}
          className="text-white/40 hover:text-white disabled:opacity-25 transition-colors"
          title="Next"
        >
          <SkipForward size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-white leading-snug truncate">{track?.title}</p>
          {audio.performer && <p className="text-[10px] text-white/35 truncate">{audio.performer}</p>}
        </div>
      </div>

      <audio
        ref={ref}
        src={track ? archiveAudioUrl(track) : undefined}
        preload="none"
        controls
        className="w-full mt-3 h-9"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onEnded={() => { if (index < audio.tracks.length - 1) onIndex(index + 1); else setPlaying(false); }}
      />

      {audio.tracks.length > 1 && (
        <div className="mt-3 max-h-56 overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
          {audio.tracks.map((t, i) => (
            <button
              key={`${t.itemId}-${t.file}`}
              onClick={() => onIndex(i)}
              className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors"
              style={i === index
                ? { background: `${ACCENT}1f`, color: '#fff' }
                : { color: 'rgba(255,255,255,0.45)' }}
            >
              <span className="text-[9px] font-black tabular-nums w-5 shrink-0"
                style={{ color: i === index ? ACCENT : 'rgba(255,255,255,0.25)' }}>{i + 1}</span>
              <span className="text-[11.5px] truncate flex-1">{t.title}</span>
              {i === index && playing && <Volume2 size={11} style={{ color: ACCENT }} />}
            </button>
          ))}
          {audio.truncated && (
            <p className="text-[10px] text-white/25 italic px-2.5 pt-1.5">
              Showing the first {audio.tracks.length} tracks — the full item has more.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-white/8 flex items-start gap-2 text-[10px] text-white/30 leading-relaxed">
        <Scale size={12} className="shrink-0 mt-0.5" />
        <span>
          Recording licence:{' '}
          <a href={audio.licenceUrl} target="_blank" rel="noreferrer" className="underline hover:text-white/60">{audio.licence}</a>
          {' · '}
          <a href={archiveItemUrl(audio.itemId)} target="_blank" rel="noreferrer" className="underline hover:text-white/60">
            item on the Internet Archive
          </a>
        </span>
      </div>
    </div>
  );
};

const Reader: React.FC<{ work: RepertoireWork; media: RepertoireMedia; onClose: () => void }> = ({ work, media, onClose }) => {
  const movements = media.score?.movements || [];
  const tracks = media.audio?.tracks || [];
  /** When a cycle's songs and its recording's tracks line up 1:1, move them together. */
  const linked = movements.length > 1 && movements.length === tracks.length;

  const [mv, setMv] = useState(0);
  const [tr, setTr] = useState(0);
  const [failed, setFailed] = useState(false);

  const setMovement = (i: number) => { setMv(i); if (linked) setTr(i); };
  const setTrack = (i: number) => { setTr(i); if (linked) setMv(i); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const current = movements[mv];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.24 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-6xl rounded-none sm:rounded-3xl border border-white/10 bg-[#0b0b0f] p-4 sm:p-6 my-0 sm:my-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>{work.composer}</p>
            <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-tight mt-1">{work.title}</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-1.5">
              {[work.year, work.forces].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-4 mt-5">
          {/* Score */}
          <div className="min-w-0">
            {movements.length > 0 ? (
              <>
                {movements.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap mb-3 max-h-24 overflow-y-auto custom-scrollbar">
                    {movements.map((m, i) => (
                      <button
                        key={m.path}
                        onClick={() => setMovement(i)}
                        className="px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all"
                        style={i === mv
                          ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                          : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}
                        title={m.title}
                      >
                        {i + 1}. {m.title}
                      </button>
                    ))}
                  </div>
                )}

                {failed ? (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-8 text-center">
                    <FileMusic size={22} className="mx-auto text-white/20" />
                    <p className="text-[12px] text-white/40 mt-3 leading-relaxed">
                      The engraver couldn't render this score in your browser. The full edition is on IMSLP.
                    </p>
                    <a href={work.imslpUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest"
                      style={{ background: ACCENT, color: '#000' }}>
                      Open on IMSLP <ExternalLink size={11} />
                    </a>
                  </div>
                ) : (
                  <Suspense fallback={
                    <div className="h-52 flex items-center justify-center gap-2 text-white/35">
                      <Loader2 size={18} className="animate-spin" />
                      <span className="text-[9px] font-black uppercase tracking-widest">Loading the engraver…</span>
                    </div>
                  }>
                    <VerovioScore
                      key={current?.path}
                      mxlUrl={current ? openScoreUrl(current.path) : undefined}
                      title={`${work.composer} — ${current?.title || work.title}`}
                      paged
                      onFail={() => setFailed(true)}
                    />
                  </Suspense>
                )}

                <div className="mt-3 flex items-start gap-2 text-[10px] text-white/30 leading-relaxed">
                  <Scale size={12} className="shrink-0 mt-0.5" />
                  <span>
                    Score:{' '}
                    <a href={OPENSCORE_CORPUS_URL} target="_blank" rel="noreferrer" className="underline hover:text-white/60">OpenScore Lieder Corpus</a>
                    {' · '}
                    <a href={OPENSCORE_LICENCE_URL} target="_blank" rel="noreferrer" className="underline hover:text-white/60">{OPENSCORE_LICENCE}</a>
                    {' — engraved in-app by Verovio.'}
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-8 text-center">
                <Music4 size={22} className="mx-auto text-white/20" />
                <p className="text-[12px] text-white/40 mt-3 leading-relaxed max-w-sm mx-auto">
                  We have a recording of this work on-platform, but no natively-rendered score yet. The
                  free full edition is on IMSLP.
                </p>
                <a href={work.imslpUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest"
                  style={{ background: ACCENT, color: '#000' }}>
                  Free score on IMSLP <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>

          {/* Player + notes */}
          <div className="space-y-3">
            {media.audio
              ? <Transport media={media} index={tr} onIndex={setTrack} />
              : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">Audio</p>
                  <p className="text-[12px] text-white/40 mt-2 leading-relaxed">
                    No public-domain recording of this work has been verified for the library yet — so
                    the score stands on its own here.
                  </p>
                </div>
              )}

            {linked && (
              <p className="text-[10px] text-white/25 italic leading-relaxed px-1">
                The songs and the recording's tracks line up, so choosing one moves the other.
              </p>
            )}

            {work.note && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">What to look for</p>
                <p className="text-[12.5px] text-white/55 leading-relaxed mt-2">{work.note}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <a href={work.imslpUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors">
                Full edition on IMSLP <ExternalLink size={11} />
              </a>
              {work.wikiSlug && (
                <a href={`https://en.wikipedia.org/wiki/${work.wikiSlug}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors">
                  Background <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Cards ───────────────────────────────────────────────────────────────────

const Chip: React.FC<{ children: React.ReactNode; solid?: boolean }> = ({ children, solid }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"
    style={solid
      ? { background: `${ACCENT}1f`, color: ACCENT, border: `1px solid ${ACCENT}3a` }
      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
  >
    {children}
  </span>
);

const WorkCard: React.FC<{ work: RepertoireWork; index: number; onOpen: () => void }> = ({ work, index, onOpen }) => {
  const media = REPERTOIRE_MEDIA[work.id];
  const score = media?.score?.movements.length || 0;
  const audio = media?.audio?.tracks.length || 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.32, delay: (index % 3) * 0.04 }}
      className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 hover:bg-white/[0.05] transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: ACCENT }}>{work.composer}</p>
          <h3 className="text-[16px] font-black tracking-tight leading-tight mt-1">{work.title}</h3>
        </div>
        <span
          className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}3a` }}
        >
          <FileMusic size={14} style={{ color: ACCENT }} />
        </span>
      </div>

      <div className="flex items-center gap-3 mt-2.5 flex-wrap text-[10px] text-white/35 font-bold uppercase tracking-widest">
        {work.year && <span className="flex items-center gap-1.5"><CalendarDays size={11} /> {work.year}</span>}
        {work.forces && <span className="flex items-center gap-1.5"><Users2 size={11} /> {work.forces}</span>}
      </div>

      {(score > 0 || audio > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          {score > 0 && <Chip solid><BookOpen size={9} /> Score in app{score > 1 ? ` · ${score} songs` : ''}</Chip>}
          {audio > 0 && <Chip><Play size={9} /> {audio > 1 ? `${audio} tracks` : 'Recording'}</Chip>}
        </div>
      )}

      {work.note && <p className="text-[13px] text-white/55 leading-relaxed mt-3 flex-1">{work.note}</p>}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {(score > 0 || audio > 0) && (
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
            style={{ background: ACCENT, color: '#000' }}
          >
            {score > 0 ? <><BookOpen size={11} /> Read the score</> : <><Play size={11} /> Listen</>}
          </button>
        )}
        <a
          href={work.imslpUrl} target="_blank" rel="noreferrer"
          className={score > 0 || audio > 0
            ? 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors'
            : 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all'}
          style={score > 0 || audio > 0 ? undefined : { background: ACCENT, color: '#000' }}
        >
          {score > 0 ? 'Full edition' : 'Free score on IMSLP'} <ExternalLink size={11} />
        </a>
        {work.wikiSlug && (
          <a
            href={`https://en.wikipedia.org/wiki/${work.wikiSlug}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors"
          >
            Background <ExternalLink size={11} />
          </a>
        )}
      </div>
    </motion.article>
  );
};

// ─── Library ─────────────────────────────────────────────────────────────────

const RepertoireLibrary: React.FC = () => {
  const [era, setEra] = useState<RepertoireEra | typeof ALL>(ALL);
  const [query, setQuery] = useState('');
  const [onPlatformOnly, setOnPlatformOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REPERTOIRE.filter(w => {
      if (era !== ALL && w.era !== era) return false;
      if (onPlatformOnly && !REPERTOIRE_MEDIA[w.id]) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        w.composer.toLowerCase().includes(q) ||
        (w.note || '').toLowerCase().includes(q)
      );
    });
  }, [era, query, onPlatformOnly]);

  const activeEra = era === ALL ? null : REPERTOIRE_ERAS.find(e => e.id === era) || null;
  const openWork = openId ? REPERTOIRE.find(w => w.id === openId) : null;
  const openMedia = openId ? REPERTOIRE_MEDIA[openId] : undefined;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><Library size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>The Repertoire Library</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Study the Score While You Listen</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
          {REPERTOIRE.length} public-domain works, medieval chant to ragtime. {NATIVE_SCORE_COUNT} of them now open
          as real engraved notation right here in Chora, and {AUDIO_COUNT} come with a recording you can play
          alongside. Everything else still links to its free full edition on IMSLP.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search works or composers…"
          className="w-full rounded-2xl bg-white/[0.04] border border-white/8 pl-11 pr-4 py-3 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Era filter */}
      <div className="flex gap-2 flex-wrap">
        {[{ id: ALL, label: 'All eras' }, ...REPERTOIRE_ERAS.map(e => ({ id: e.id, label: e.label }))].map(e => {
          const active = era === e.id;
          return (
            <button
              key={e.id}
              onClick={() => setEra(e.id as RepertoireEra | typeof ALL)}
              className="px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
              style={active
                ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
            >
              {e.label}
            </button>
          );
        })}
        <button
          onClick={() => setOnPlatformOnly(v => !v)}
          className="px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5"
          style={onPlatformOnly
            ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
            : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
        >
          <BookOpen size={10} /> On platform
        </button>
      </div>

      {activeEra && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[13px] text-white/55 leading-relaxed">{activeEra.blurb}</p>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-[13px] text-white/35 italic py-8 text-center">Nothing in the library matches that search.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((w, i) => <WorkCard key={w.id} work={w} index={i} onOpen={() => setOpenId(w.id)} />)}
        </div>
      )}

      <p className="text-[11px] text-white/25 italic leading-relaxed pt-2">
        Note: a public-domain composition can still sit under a live recording copyright. The scores here come
        from the CC0 OpenScore Lieder Corpus and from IMSLP; the recordings come from the Internet Archive and
        each carries its own licence, shown next to the player.
      </p>

      <AnimatePresence>
        {openWork && openMedia && (
          <Reader key={openWork.id} work={openWork} media={openMedia} onClose={() => setOpenId(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RepertoireLibrary;

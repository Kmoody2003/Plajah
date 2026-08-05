// ─────────────────────────────────────────────────────────────────────────────
// InstrumentPrimers — Blueprint Part 4.5.
//
// A browsable grid of every orchestra/band instrument family → a detail panel
// with the written range, the ensemble role, and a live Wikipedia enrichment
// (photograph + encyclopaedic extract) fetched through the same fetchWiki()
// helper the museum halls use, so nothing is duplicated and nothing is stale.
//
// Rendered as a tab inside <ChoraConservatory>.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, ExternalLink, Search, Gauge, Users, Waves, Loader2, AudioLines, Play, Square,
} from 'lucide-react';
import { fetchWiki } from '../MuseumHall';
import {
  playInstrumentDemo, pickPlayableSample,
  type InstrumentDemo, type InstrumentSample,
} from '../../services/instrumentAudio';
import { attributionRequired } from '../../data/instrumentSamples';
import YouTubeEmbed from '../labs/YouTubeEmbed';
import {
  INSTRUMENT_FAMILIES, INSTRUMENTS,
  type Instrument, type InstrumentFamilyId,
} from '../../data/instrumentPrimers';

const ACCENT = '#E0A458';

// ── Detail ────────────────────────────────────────────────────────────────────
const InstrumentDetail: React.FC<{ instrument: Instrument; onBack: () => void }> = ({ instrument, onBack }) => {
  const [wiki, setWiki] = useState<{ thumb: string; extract: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setWiki(null);
    fetchWiki(instrument.wikiSlug)
      .then(d => { if (alive) { setWiki(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [instrument.wikiSlug]);

  const family = INSTRUMENT_FAMILIES.find(f => f.id === instrument.family);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="space-y-5"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
      >
        <ChevronLeft size={14} /> All instruments
      </button>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black overflow-hidden">
        <div className="grid md:grid-cols-[minmax(0,320px)_1fr]">
          {/* Portrait */}
          <div className="relative bg-black/50 min-h-[220px] flex items-center justify-center">
            {wiki?.thumb ? (
              <img
                src={wiki.thumb}
                alt={instrument.name}
                loading="lazy"
                className="w-full h-full object-cover max-h-[380px]"
              />
            ) : loading ? (
              <Loader2 size={26} className="animate-spin text-white/25" />
            ) : (
              <AudioLines size={54} style={{ color: `${ACCENT}55` }} />
            )}
          </div>

          {/* Head */}
          <div className="p-5 sm:p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>
              {family?.label ?? instrument.family}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none mt-1.5">
              {instrument.name}
            </h2>
            <p className="text-sm text-white/55 leading-relaxed mt-3">{instrument.blurb}</p>

            <div className="mt-4">
              <HearIt instrument={instrument} />
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Gauge size={11} style={{ color: ACCENT }} />
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Range</p>
                </div>
                <p className="text-[13px] text-white/75 font-bold leading-snug">{instrument.range}</p>
                {instrument.transposition && (
                  <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">{instrument.transposition}</p>
                )}
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Users size={11} style={{ color: ACCENT }} />
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Role</p>
                </div>
                <p className="text-[12.5px] text-white/70 leading-relaxed">{instrument.role}</p>
              </div>
            </div>

            {family && (
              <div className="mt-3 rounded-2xl p-3.5 border" style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}10` }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Waves size={11} style={{ color: ACCENT }} />
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/45">How it makes sound</p>
                </div>
                <p className="text-[12.5px] text-white/70 leading-relaxed">{family.mechanism}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Wikipedia enrichment */}
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 sm:p-6">
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2.5">From Wikipedia</p>
        {loading ? (
          <div className="flex items-center gap-2 text-white/30 text-[13px]">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : wiki?.extract ? (
          <p className="text-[15px] text-white/60 leading-relaxed">{wiki.extract}</p>
        ) : (
          <p className="text-[13px] text-white/35 italic">No summary available offline — open the full article below.</p>
        )}
        <a
          href={`https://en.wikipedia.org/wiki/${instrument.wikiSlug}`}
          target="_blank" rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white transition-colors"
        >
          Read the full article <ExternalLink size={11} />
        </a>
      </div>

      {instrument.videoId && (
        <YouTubeEmbed id={instrument.videoId} title={instrument.name} channel="Instrument primer" accent={ACCENT} />
      )}
    </motion.div>
  );
};

// ── Card ──────────────────────────────────────────────────────────────────────
const InstrumentCard: React.FC<{ instrument: Instrument; index: number; onOpen: () => void }> = ({ instrument, index, onOpen }) => (
  <motion.button
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-30px' }}
    transition={{ duration: 0.32, delay: (index % 4) * 0.04 }}
    onClick={onOpen}
    className="text-left rounded-3xl border border-white/8 bg-white/[0.03] p-4 sm:p-5 hover:bg-white/[0.06] hover:border-white/15 transition-all"
  >
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-[15px] font-black uppercase tracking-tight leading-tight">{instrument.name}</h3>
      <HearIt instrument={instrument} variant="icon" />
    </div>
    <p className="text-[11px] font-bold tabular-nums mt-2" style={{ color: ACCENT }}>{instrument.range}</p>
    <p className="text-[12.5px] text-white/50 leading-relaxed mt-2 line-clamp-3">{instrument.role}</p>
  </motion.button>
);

// ── "Hear it" ─────────────────────────────────────────────────────────────────
// Plays a REAL recording of the instrument when we have a verified one that this
// browser can decode (see services/instrumentAudio.ts); otherwise the family
// synthesiser stands in. Samples buffer over the network, so this carries a
// loading state the synth path never needs — and CC BY / CC BY-SA recordings are
// legally required to name their author, so the credit line is not optional.

/** Bytes → 'MB' / 'KB', for warning about the couple of multi-megabyte transfers. */
const formatBytes = (n?: number) =>
  !n ? null : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

const SampleCredit: React.FC<{ sample: InstrumentSample }> = ({ sample }) => (
  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">
      Recording {attributionRequired(sample) ? '— attribution required' : ''}
    </p>
    <p className="text-[12px] text-white/60 leading-relaxed">{sample.note}</p>
    <p className="text-[11px] text-white/40 leading-relaxed mt-1.5">
      <span className="text-white/60">{sample.attribution}</span>
      {' · '}
      {sample.licenseUrl ? (
        <a
          href={sample.licenseUrl} target="_blank" rel="noreferrer"
          className="underline decoration-white/20 hover:text-white transition-colors"
        >
          {sample.license}
        </a>
      ) : sample.license}
      {' · '}
      <a
        href={sample.sourcePageUrl} target="_blank" rel="noreferrer"
        className="underline decoration-white/20 hover:text-white transition-colors"
      >
        Source
      </a>
    </p>
  </div>
);

const HearIt: React.FC<{ instrument: Instrument; variant?: 'pill' | 'icon' }> = ({ instrument, variant = 'pill' }) => {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState<InstrumentDemo | null>(null);
  const handleRef = useRef<InstrumentDemo | null>(null);

  // What WOULD play, before anyone presses anything — lets the pill label itself
  // honestly ("Hear a recording" vs "Hear it") and size the download warning.
  const availableSample = useMemo(() => pickPlayableSample(instrument.id), [instrument.id]);

  useEffect(() => () => { handleRef.current?.stop(); handleRef.current = null; }, []);

  const reset = () => { handleRef.current = null; setPlaying(false); setLoading(false); setDemo(null); };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();          // never let this trigger the card's open handler
    if (playing || loading) {
      handleRef.current?.stop();
      reset();
      return;
    }
    // Started inside the click so the AudioContext (synth) and autoplay policy
    // (sample) both see a genuine user gesture.
    setLoading(true);
    const h = playInstrumentDemo(instrument, {
      onPlaying: () => setLoading(false),
      onEnded: reset,
      // The sample died after we committed to it and the synth took over — drop
      // the credit line so we never attribute audio we are not actually playing.
      onFallback: () => setDemo(null),
    });
    if (!h) { reset(); return; }
    handleRef.current = h;
    setDemo(h);
    setPlaying(true);
    if (h.source === 'synth') setLoading(false);
  };

  const busy = playing || loading;
  const label = availableSample ? `Hear a recording of the ${instrument.name}` : `Hear the ${instrument.name}`;

  if (variant === 'icon') {
    return (
      <button
        onClick={toggle}
        title={busy ? 'Stop' : label}
        aria-label={busy ? 'Stop' : label}
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:brightness-125"
        style={{ background: busy ? ACCENT : `${ACCENT}1a`, border: `1px solid ${ACCENT}3a` }}
      >
        {loading
          ? <Loader2 size={11} className="animate-spin text-black" />
          : playing
            ? <Square size={11} className="text-black" fill="currentColor" />
            : <Play size={12} style={{ color: ACCENT }} fill="currentColor" className="translate-x-[1px]" />}
      </button>
    );
  }

  const size = formatBytes(availableSample?.bytes);

  return (
    <div className="space-y-2.5 w-full">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={toggle}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-110"
          style={busy ? { background: ACCENT, color: '#000' } : { background: `${ACCENT}1f`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}
          title={availableSample
            ? 'A real recording of this instrument, streamed from its archive'
            : "No free recording of this instrument yet — synthesised in your browser, in its written range"}
        >
          {loading
            ? <><Loader2 size={12} className="animate-spin" /> Loading</>
            : playing
              ? <><Square size={12} fill="currentColor" /> Stop</>
              : <><Play size={12} fill="currentColor" /> Hear it</>}
        </button>
        <span className="text-[10px] text-white/30 leading-snug">
          {availableSample
            ? <>Real recording{size ? ` · ${size}` : ''}</>
            : 'Synthesised live in this instrument’s written range'}
        </span>
      </div>

      {/* Credit only while a sample is genuinely the thing making the sound. */}
      {demo?.source === 'sample' && demo.sample && <SampleCredit sample={demo.sample} />}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const ALL = '__all__';

const InstrumentPrimers: React.FC = () => {
  const [family, setFamily] = useState<InstrumentFamilyId | typeof ALL>(ALL);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Instrument | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INSTRUMENTS.filter(i => {
      if (family !== ALL && i.family !== family) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.role.toLowerCase().includes(q) ||
        i.blurb.toLowerCase().includes(q)
      );
    });
  }, [family, query]);

  const activeFamily = family === ALL ? null : INSTRUMENT_FAMILIES.find(f => f.id === family) || null;

  if (open) {
    return (
      <AnimatePresence mode="wait">
        <InstrumentDetail key={open.id} instrument={open} onBack={() => setOpen(null)} />
      </AnimatePresence>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><AudioLines size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Instrument Primers</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">How Every Instrument Works</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
          {INSTRUMENTS.length} instruments across {INSTRUMENT_FAMILIES.length} families — what makes the sound, where the
          notes live, and what the instrument is actually for in an ensemble. Press “Hear it” for a real recording of the
          instrument, freely licensed and credited. Photographs and articles stream live from Wikipedia.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search instruments, ranges or roles…"
          className="w-full rounded-2xl bg-white/[0.04] border border-white/8 pl-11 pr-4 py-3 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Family filter */}
      <div className="flex gap-2 flex-wrap">
        {[{ id: ALL, label: 'All' }, ...INSTRUMENT_FAMILIES.map(f => ({ id: f.id, label: f.label }))].map(f => {
          const active = family === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFamily(f.id as InstrumentFamilyId | typeof ALL)}
              className="px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
              style={active
                ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {activeFamily && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[13px] text-white/55 leading-relaxed">{activeFamily.blurb}</p>
          <p className="text-[12px] text-white/40 leading-relaxed mt-2 italic">{activeFamily.mechanism}</p>
        </div>
      )}

      {/* Grid */}
      {list.length === 0 ? (
        <p className="text-[13px] text-white/35 italic py-8 text-center">No instruments match that search.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((i, idx) => (
            <InstrumentCard key={i.id} instrument={i} index={idx} onOpen={() => setOpen(i)} />
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default InstrumentPrimers;

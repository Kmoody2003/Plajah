/**
 * CivicsHallView — Civics Hall, with the Telescoping Text reader as its front door.
 *
 * Two tabs:
 *  • The Texts — the signature mechanic. One document, five zoom levels, real public-domain words
 *    at every band. Pick a document, pick a band, read the actual text with a teaching lens.
 *  • Curriculum — the five strands on the shared School chassis (<SchoolView>), which handles
 *    progress and the Learner Ledger writes.
 *
 * Everything here is public domain, which is what lets the header say so plainly.
 */
import React, { useState } from 'react';
import { ArrowLeft, ScrollText, GraduationCap, ExternalLink, ShieldCheck } from 'lucide-react';
import SchoolView from './school/SchoolView';
import { CIVICS_HALL } from '../data/civicsCurriculum';
import { FOUNDING_DOCS, DOC_BANDS, type DocBand } from '../data/foundingDocuments';
import { NATION_MODULES, US_ANCHOR } from '../data/comparativeCivics';

const ACCENT = '#D40055';

const TelescopingReader: React.FC = () => {
  const [docId, setDocId] = useState(FOUNDING_DOCS[0].id);
  const [band, setBand] = useState<DocBand>('g68');
  const doc = FOUNDING_DOCS.find(d => d.id === docId) || FOUNDING_DOCS[0];
  const zoom = doc.zooms[band];

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Document list */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
          The corpus · {FOUNDING_DOCS.length} documents
        </p>
        <div className="flex gap-2 overflow-x-auto lg:block lg:overflow-visible">
          {FOUNDING_DOCS.map(d => {
            const on = d.id === docId;
            return (
              <button
                key={d.id}
                onClick={() => setDocId(d.id)}
                className="mb-1 w-full min-w-[220px] rounded-xl px-3 py-2.5 text-left transition-all lg:min-w-0"
                style={{
                  background: on ? `${ACCENT}22` : 'transparent',
                  boxShadow: on ? `inset 0 0 0 1px ${ACCENT}66` : 'none',
                }}
              >
                <span className="block text-[13px] font-bold leading-tight text-white">{d.title}</span>
                <span className="mt-0.5 block text-[11px] text-white/40">
                  {d.year}{d.author ? ` · ${d.author}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reader */}
      <div className="rounded-2xl border border-white/10 bg-[rgba(4,3,10,0.6)] p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: ACCENT }}>
              Telescoping Text
            </p>
            <h3 className="mt-1 text-xl font-black text-white sm:text-2xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {doc.title} <span className="font-medium text-white/35">· {doc.year}</span>
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DOC_BANDS.map(b => (
              <button
                key={b.id}
                onClick={() => setBand(b.id)}
                className="h-8 rounded-full px-3 text-[12px] font-bold transition-all"
                style={{
                  background: band === b.id ? ACCENT : 'rgba(255,255,255,0.05)',
                  color: band === b.id ? '#fff' : 'rgba(255,255,255,0.55)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* The actual words */}
        <blockquote
          className="mt-5 border-l-2 pl-5 text-[17px] leading-[1.75] text-white/90"
          style={{ borderColor: ACCENT, fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {zoom.text}
        </blockquote>

        {/* The lens */}
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
            Reading it at {DOC_BANDS.find(b => b.id === band)?.label}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-white/70">{zoom.lens}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/35">
          <a
            href={doc.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-white/70"
          >
            <ExternalLink size={11} /> {doc.source.label}
          </a>
          <span className="font-mono">public domain · id: {doc.id}</span>
        </div>
      </div>
    </div>
  );
};


/** Comparative civics — one template, seven nations, with the speech clauses side by side. */
const NationsReader: React.FC = () => {
  const [id, setId] = useState(NATION_MODULES[0].id);
  const n = NATION_MODULES.find(x => x.id === id) || NATION_MODULES[0];

  return (
    <div>
      {/* Nation picker */}
      <div className="flex flex-wrap gap-2">
        {NATION_MODULES.map(x => (
          <button
            key={x.id}
            onClick={() => setId(x.id)}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-bold transition-all"
            style={{
              background: x.id === id ? `${x.accent}26` : 'rgba(255,255,255,0.05)',
              color: x.id === id ? '#fff' : 'rgba(255,255,255,0.55)',
              boxShadow: x.id === id ? `inset 0 0 0 1px ${x.accent}88` : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            <span>{x.flag}</span>{x.nation}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[13px] italic leading-relaxed text-white/60">{n.hook}</p>

      {/* Founding texts */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Founding texts</p>
        {n.foundingTexts.map(t => (
          <div key={t.title} className="mt-3 border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
            <p className="text-[14px] font-bold text-white">
              {t.title} <span className="font-normal text-white/35">· {t.year}</span>
              {!t.hostable && (
                <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/45">
                  link only
                </span>
              )}
            </p>
            <p className="mt-1 text-[12px] text-white/50">{t.note}</p>
            <a href={t.source.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-white/35 underline hover:text-white/70">
              {t.source.label}
            </a>
          </div>
        ))}
      </div>

      {/* The template, re-instantiated */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { k: 'Government structure', v: n.structure },
          { k: 'Rights tradition', v: n.rightsTradition },
          { k: 'Civic life today', v: n.civicLife },
        ].map(c => (
          <div key={c.k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: n.accent }}>{c.k}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/65">{c.v}</p>
          </div>
        ))}
      </div>

      {/* The side-by-side — the point of the whole module */}
      <div className="mt-5 rounded-2xl border p-5" style={{ borderColor: `${n.accent}44`, background: `linear-gradient(120deg, ${n.accent}14, transparent)` }}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: n.accent }}>
          Read the world&rsquo;s promises — free expression, side by side
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[{ ...US_ANCHOR, nation: 'United States', flag: '\u{1F1FA}\u{1F1F8}' }, { ...n.speechClause, nation: n.nation, flag: n.flag }].map(c => (
            <div key={c.nation} className="rounded-xl border border-white/10 bg-[rgba(4,3,10,0.5)] p-4">
              <p className="text-[12px] font-bold text-white/70">{c.flag} {c.nation} — {c.label}</p>
              <blockquote
                className="mt-2.5 border-l-2 border-white/20 pl-4 text-[14px] leading-[1.7] text-white/85"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {c.text}
              </blockquote>
              <p className="mt-3 text-[12px] leading-relaxed text-white/45">{c.probe}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Capstone */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">The capstone question</p>
        <p className="mt-2 text-[14px] leading-relaxed text-white/80">{n.capstone}</p>
        <p className="mt-3 text-[11px] text-white/30">
          This module does not rank nations. Ask the same question of your own country, with the same
          standard of evidence.
        </p>
      </div>
    </div>
  );
};

const CivicsHallView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<'TEXTS' | 'NATIONS' | 'CURRICULUM'>('TEXTS');
  const lessons = CIVICS_HALL.tracks.reduce((n, t) => n + t.lessons.length, 0);

  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>

        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(212,0,85,0.22), rgba(107,0,153,0.16) 60%, transparent)' }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: ACCENT }}>
            Plajah Academia · Civics
          </p>
          <h1 className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Civics Hall
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">{CIVICS_HALL.blurb}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: <GraduationCap size={12} />, label: `${CIVICS_HALL.tracks.length} strands · ${lessons} lessons` },
              { icon: <ScrollText size={12} />, label: `${FOUNDING_DOCS.length} documents × 5 zoom levels` },
              { icon: <ShieldCheck size={12} />, label: 'Aligned to the NCSS C3 Framework' },
              { icon: <ScrollText size={12} />, label: `${NATION_MODULES.length} nations, compared in their own words` },
            ].map(chip => (
              <span key={chip.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">
                {chip.icon}{chip.label}
              </span>
            ))}
          </div>

          <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/35">
            Every document here is public domain — print it, remix it, keep it. Sources: the National
            Archives, the Library of Congress, Project Gutenberg and Wikisource. Contested questions are
            taught as contested: where Americans genuinely disagree, this course argues both sides.
          </p>
        </div>

        <div className="mt-6 flex gap-2">
          {([['TEXTS', 'The Texts'], ['NATIONS', 'Seven Nations'], ['CURRICULUM', 'Curriculum']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="h-10 rounded-full px-5 text-[13px] font-black uppercase tracking-wider transition-all"
              style={{
                background: tab === id ? ACCENT : 'rgba(255,255,255,0.05)',
                color: tab === id ? '#fff' : 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'TEXTS' ? <TelescopingReader /> : tab === 'NATIONS' ? <NationsReader /> : <SchoolView curriculum={CIVICS_HALL} embedded />}
        </div>
      </div>
    </div>
  );
};

export default CivicsHallView;

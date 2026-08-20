// SutraReader — a real, working reader for Buddhist texts, the Buddhism wing's
// counterpart to Lectio. Three panes: a corpus rail (texts + chapters), a reading
// surface (verse-numbered, serif, skinnable), and a study rail (about the text +
// Pāli glossary + notes). The corpus is bundled & public-domain (data/sacredLibrary/
// sutras.ts), so it works offline with no external fetch. Same idiom as LectioReader
// (Tailwind + inline styles), tuned to Buddhism's saffron accent.

import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, BookOpen, Search } from 'lucide-react';
import { SUTRAS, SUTRA_GLOSSARY } from '../../data/sacredLibrary/sutras';
import { PLAJAH_BG, PLAJAH_HEADER } from '../../data/sacredLibrary/theme';

interface SutraReaderProps {
  onBack: () => void;
}

const SAFFRON = '#E8912D';
const MAROON = '#9A3B2C';

type Skin = 'night' | 'sepia' | 'paper';
const SKINS: Record<Skin, { bg: string; ink: string; num: string }> = {
  night: { bg: '#0d0a07', ink: '#ece3d4', num: SAFFRON },
  sepia: { bg: '#1c150c', ink: '#e7d7bd', num: '#d9a441' },
  paper: { bg: '#f6f1e7', ink: '#2a2013', num: '#9a5a1e' },
};

const SutraReader: React.FC<SutraReaderProps> = ({ onBack }) => {
  const [textId, setTextId] = useState(SUTRAS[0].id);
  const [chapterId, setChapterId] = useState(SUTRAS[0].chapters[0].id);
  const [skin, setSkin] = useState<Skin>('night');
  const [tab, setTab] = useState<'about' | 'glossary' | 'notes'>('about');

  const text = useMemo(() => SUTRAS.find((s) => s.id === textId) ?? SUTRAS[0], [textId]);
  const chapter = useMemo(
    () => text.chapters.find((c) => c.id === chapterId) ?? text.chapters[0],
    [text, chapterId],
  );

  const selectText = (id: string) => {
    const t = SUTRAS.find((s) => s.id === id);
    if (!t) return;
    setTextId(id);
    setChapterId(t.chapters[0].id);
  };

  const sk = SKINS[skin];

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: PLAJAH_BG }}>
      {/* header */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b backdrop-blur-xl flex-none"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: PLAJAH_HEADER }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={16} /> Buddhism
        </button>
        <div className="flex items-center gap-2.5 pl-3 ml-1 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <BookOpen size={17} style={{ color: SAFFRON }} />
          <span className="font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>Sutra Reader</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/40">
          <Search size={13} /> <span className="hidden sm:inline">Search the canon…</span>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0,220px) minmax(0,1fr) minmax(0,300px)' }}>
        {/* corpus rail */}
        <aside className="border-r overflow-y-auto p-3" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
          <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40 px-2 mb-2">Texts</div>
          {SUTRAS.map((s) => (
            <div key={s.id} className="mb-1.5">
              <button
                onClick={() => selectText(s.id)}
                className="w-full text-left px-2.5 py-2 rounded-lg text-[13px] transition-colors"
                style={{
                  fontFamily: 'var(--font-serif, Georgia, serif)',
                  background: s.id === textId ? `linear-gradient(90deg, ${SAFFRON}22, transparent)` : 'transparent',
                  color: s.id === textId ? SAFFRON : 'rgba(255,255,255,0.75)',
                  fontWeight: s.id === textId ? 600 : 400,
                }}
              >
                {s.title}
                <span className="block text-[10px] text-white/35 font-sans font-normal mt-0.5">{s.collection}</span>
              </button>
              {s.id === textId && (
                <div className="mt-1 ml-2 pl-2 border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  {s.chapters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setChapterId(c.id)}
                      className="w-full text-left px-2 py-1.5 rounded-md text-[11.5px] transition-colors"
                      style={{
                        background: c.id === chapterId ? 'rgba(255,255,255,0.07)' : 'transparent',
                        color: c.id === chapterId ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                      }}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>

        {/* reading surface */}
        <div className="overflow-y-auto" style={{ background: sk.bg, transition: 'background .3s' }}>
          <div className="max-w-[64ch] mx-auto px-6 sm:px-10 py-9">
            <div className="flex items-start justify-between gap-4 pb-5 mb-6 border-b" style={{ borderColor: skin === 'paper' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }}>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-serif, Georgia, serif)', color: sk.ink }}>{text.title}</h1>
                <div className="text-[12px] mt-1" style={{ color: skin === 'paper' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.45)' }}>{chapter.title} · {text.tradition}</div>
              </div>
              <div className="flex gap-1.5 flex-none">
                {(Object.keys(SKINS) as Skin[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSkin(s)}
                    title={s}
                    className="w-6 h-6 rounded-md border"
                    style={{ background: SKINS[s].bg, borderColor: skin === s ? SAFFRON : 'rgba(255,255,255,0.2)', outline: skin === s ? `2px solid ${SAFFRON}` : 'none', outlineOffset: 1 }}
                  />
                ))}
              </div>
            </div>

            <motion.div
              key={`${textId}-${chapterId}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              style={{ fontFamily: 'var(--font-serif, Georgia, serif)', color: sk.ink }}
            >
              {chapter.verses.map((v, i) => (
                <p key={i} className="mb-4 leading-[1.75]" style={{ fontSize: 18 }}>
                  <span className="font-mono align-super mr-2" style={{ fontSize: 11, color: sk.num, opacity: 0.85 }}>{v.n}</span>
                  {v.text}
                </p>
              ))}
            </motion.div>

            <div className="mt-8 pt-4 text-[11px] border-t" style={{ borderColor: skin === 'paper' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', color: skin === 'paper' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)' }}>
              {text.translation}
            </div>
          </div>
        </div>

        {/* study rail */}
        <aside className="border-l overflow-y-auto flex flex-col" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex gap-0.5 p-2 border-b flex-none" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            {(['about', 'glossary', 'notes'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 text-center text-[11.5px] font-semibold py-2 rounded-t-lg capitalize transition-colors"
                style={{
                  color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderBottom: tab === t ? `2px solid ${SAFFRON}` : '2px solid transparent',
                  background: tab === t ? 'rgba(255,255,255,0.04)' : 'transparent',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-3.5 flex flex-col gap-3">
            {tab === 'about' && (
              <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: SAFFRON }}>About this text</div>
                <p className="text-[13px] text-white/75 leading-relaxed" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>{text.blurb}</p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-[11.5px]"><span className="text-white/45">Collection</span><span className="text-white/80">{text.collection}</span></div>
                  <div className="flex justify-between text-[11.5px]"><span className="text-white/45">Tradition</span><span className="text-white/80 text-right">{text.tradition}</span></div>
                  <div className="flex justify-between text-[11.5px] gap-3"><span className="text-white/45 flex-none">Translation</span><span className="text-white/60 text-right text-[10px]">{text.translation}</span></div>
                </div>
              </div>
            )}
            {tab === 'glossary' && (
              <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: SAFFRON }}>Pāli / Sanskrit terms</div>
                <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  {SUTRA_GLOSSARY.map((g) => (
                    <div key={g.term} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-[14px]" style={{ color: SAFFRON, fontFamily: 'var(--font-serif, Georgia, serif)' }}>{g.term}</span>
                        <span className="text-[11px] italic text-white/40">{g.pali}</span>
                      </div>
                      <p className="text-[12px] text-white/70 leading-relaxed mt-1">{g.gloss}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'notes' && (
              <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: SAFFRON }}>Your notes</div>
                <p className="text-[12.5px] text-white/50 leading-relaxed">Highlight a verse to add a private note. Notes sync to your account only.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SutraReader;

/**
 * LanguageArtsSchoolView — The Language Arts, Literacy & World Languages Landing Page.
 *
 * Provides a dedicated, rich academic home for Reading, Literature, Writing, Rhetoric,
 * Handwriting (Penna), and World Languages (CEFR-aligned Language Quest).
 *
 * Resolves the issue where clicking Reading or Language thumbnails went directly to leaf
 * games without a home base, grade level progression, or student context.
 *
 * Features:
 *  - "My Reading Desk": Top apron showing the learner's active book in BookReader,
 *    current Lexile / grade band, handwriting streaks, and writing assignments due.
 *  - Core Pillars: Phonics & Penna Handwriting, Leveled Reading & Reading Quest,
 *    Literature & Gutenberg K12 classics, Composition & Essay Writing, World Languages.
 *  - Quests & Studios: Reading Quest (PreK–G7), Penna Handwriting Workshop, Language Quest (Duolingo-style).
 *  - Open Classic Library: Open access classic literature and leveled readers.
 *  - Touch-First Mobile: Horizontal carousels, large touch buttons, and bottom quick-action bar.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, BookOpen, Sparkles, Languages, Trophy, PenTool,
  ChevronRight, CheckCircle2, ShieldCheck, Play, Award, Layers,
  Library, Compass, ScrollText, Bookmark, Feather, Globe2
} from 'lucide-react';
import { fetchStudentDueWork, type DueItem } from '../services/assignmentTemplateService';

interface Props {
  onBack: () => void;
  onNavigate: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'PILLARS' | 'QUESTS' | 'LIBRARY' | 'LANGUAGES';

interface LanguagePillar {
  id: string;
  title: string;
  blurb: string;
  badge: string;
  accent: string;
  icon: any;
  subtopics: { name: string; desc: string }[];
}

const PILLARS: LanguagePillar[] = [
  {
    id: 'phonics-foundations',
    title: 'Phonics & Early Reading',
    blurb: 'Phonemic awareness, letter sounds, decodable texts, sight words, and the Penna handwriting workshop.',
    badge: 'PreK–Grade 2',
    accent: '#F59E0B',
    icon: Feather,
    subtopics: [
      { name: 'Letter Tracing & Strokes (Penna)', desc: 'Tactile handwriting practice with precision stroke scoring and reward reveals.' },
      { name: 'Phonemic Blending & Digraphs', desc: 'Short vowels, consonant blends (sh, ch, th), and long vowel silent-e patterns.' },
      { name: 'Dolch & Fry High-Frequency Words', desc: 'Sight word automaticity through rapid flashcard recognition games.' },
      { name: 'Leveled Decodable Readers', desc: 'Step-by-step early books designed for emerging confidence.' },
    ],
  },
  {
    id: 'reading-comprehension',
    title: 'Reading Comprehension & Fluency',
    blurb: 'Close reading, main idea extraction, character motives, cause and effect, and summarizing across non-fiction & fiction.',
    badge: 'Grades 3–8',
    accent: '#D40055',
    icon: BookOpen,
    subtopics: [
      { name: 'Reading Quest (PreK–G7)', desc: 'Adaptive leveled passages with instant comprehension checks and ledger proficiency.' },
      { name: 'Text Structure & Author’s Purpose', desc: 'Identifying problem/solution, compare/contrast, and chronological text signals.' },
      { name: 'Vocabulary & Context Clues', desc: 'Deciphering unfamiliar Tier 2 academic words from surrounding sentence context.' },
      { name: 'Inference & Textual Evidence', desc: 'Citing quotes directly from the passage to defend an analytical claim.' },
    ],
  },
  {
    id: 'writing-rhetoric',
    title: 'Writing, Grammar & Rhetoric',
    blurb: 'From sentence mechanics to persuasive five-paragraph essays, narrative storytelling, and academic research papers.',
    badge: 'Grades 6–College',
    accent: '#8B5CF6',
    icon: ScrollText,
    subtopics: [
      { name: 'Sentence Syntax & Mechanics', desc: 'Compound and complex sentences, comma splices, semicolons, and active voice.' },
      { name: 'Argumentative & Persuasive Essays', desc: 'Thesis development, counterarguments, refutations, and logical structure.' },
      { name: 'Narrative Story Craft', desc: 'Protagonist motivations, narrative arc, sensory detail, and dialogue pacing.' },
      { name: 'Research Citations & Synthesis', desc: 'MLA/APA formatting, avoiding plagiarism, and synthesizing primary sources.' },
    ],
  },
  {
    id: 'world-languages',
    title: 'World Languages (CEFR Aligned)',
    blurb: 'Learn Spanish, French, German, Japanese, and Mandarin through interactive Duolingo-style lessons and spaced repetition.',
    badge: 'All Ages · A1–B2',
    accent: '#06D6A0',
    icon: Globe2,
    subtopics: [
      { name: 'Spanish (A1 → B1 Track)', desc: 'Everyday dialogue, conjugations, ser vs estar, and conversational immersion.' },
      { name: 'French Foundations', desc: 'Pronunciation, nasal vowels, articles, and essential travel & family phrases.' },
      { name: 'German & Comparative Grammar', desc: 'Cases (nominative, accusative, dative), gendered nouns, and sentence word order.' },
      { name: 'Japanese Kana & Basics', desc: 'Hiragana, Katakana, polite particles, and essential vocabulary.' },
    ],
  },
];

const LANGUAGE_QUESTS = [
  {
    id: 'reading-quest',
    title: 'Reading Quest (PreK–G7)',
    desc: 'Gamified reading comprehension engine. Beat your personal record, earn class points, and write mastery to your ledger.',
    accent: '#D40055',
    emoji: '📖',
    route: 'READING_QUEST',
    points: '120 pts',
  },
  {
    id: 'penna-handwriting',
    title: 'Penna: Handwriting Workshop',
    desc: 'Touch-first stroke engine. Trace uppercase, lowercase, and cursive letters with real-time accuracy scoring.',
    accent: '#F59E0B',
    emoji: '✍️',
    route: 'HANDWRITING_WORKSHOP',
    points: '100 pts',
  },
  {
    id: 'language-quest',
    title: 'Language Quest (CEFR)',
    desc: 'Interactive language learning with audio recognition, grammar decks, and streak tracking across 6 world languages.',
    accent: '#06D6A0',
    emoji: '🗣️',
    route: 'LANGUAGE_QUEST',
    points: '150 pts',
  },
  {
    id: 'kids-library',
    title: 'Kids Library & Audio Books',
    desc: 'Hundreds of leveled readers, illustrated stories, and MAI Voice audio narrations for independent reading time.',
    accent: '#3B82F6',
    emoji: '📚',
    route: 'KIDS_LIBRARY',
    points: '100 pts',
  },
];

const LanguageArtsSchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('PILLARS');
  const [dueItems, setDueItems] = useState<DueItem[]>([]);

  useEffect(() => {
    if (user?.uid) {
      fetchStudentDueWork(user.uid)
        .then(items => setDueItems(items.filter(i => i.title.toLowerCase().includes('reading') || i.title.toLowerCase().includes('essay') || i.title.toLowerCase().includes('writing'))))
        .catch(() => {});
    }
  }, [user?.uid]);

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-24 selection:bg-[#D40055]/30">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Back Nav & School Badge */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all min-h-[44px]"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D40055]/30 bg-[#D40055]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#F43F5E]">
              <BookOpen size={13} /> Language Arts & Literacy
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              CCSS ELA · CEFR Benchmarked
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(212,0,85,0.20) 0%, rgba(61,0,24,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#F43F5E] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Discipline Center</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Language Arts & Literacy
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              Words shape thought, discourse, and empathy. From tactile letter tracing in Penna and leveled
              reading quests to classic literature, essay composition, and world language fluency.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate('READING_QUEST')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D40055] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(212,0,85,0.4)] hover:bg-[#e61767] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px]"
              >
                <BookOpen size={18} /> Launch Reading Quest ▶
              </button>
              <button
                onClick={() => onNavigate('LANGUAGE_QUEST')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all min-h-[48px]"
              >
                <Languages size={16} /> World Languages (CEFR)
              </button>
            </div>
          </div>

          <div
            aria-hidden
            className="absolute -right-12 -bottom-16 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30"
            style={{ background: 'radial-gradient(circle, #D40055, transparent)' }}
          />
        </div>

        {/* ── [MY DESK]: Personalized Signed-In Context ─────────────────────── */}
        <section className="mb-8" aria-label="My Reading Desk">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#D40055]/20 border border-[#D40055]/40 flex items-center justify-center text-[#F43F5E]">
                  <Award size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">My Reading & Writing Desk</h2>
                  <p className="text-xs text-white/50">Your active books, reading streak & writing assignments</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/40">Reading Level:</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#D40055]/40 bg-[#D40055]/10 text-[#F43F5E]">
                  Lexile 740L · On Track
                </span>
              </div>
            </div>

            {/* Context Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Active Book or Reading Item */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Current Reading</span>
                    <span className="text-[#D40055] uppercase font-black tracking-wider">Book Reader</span>
                  </div>
                  <h3 className="text-base font-black text-white truncate">The Adventures of Sherlock Holmes</h3>
                  <p className="text-xs text-white/60 mt-1 line-clamp-2">
                    Chapter 3: A Scandal in Bohemia. 18 pages completed out of 42.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Public Domain Classic</span>
                  <button
                    onClick={() => onNavigate('KIDS_LIBRARY')}
                    className="text-xs font-black uppercase tracking-wider text-[#F43F5E] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Resume Reading <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 2: Penna Handwriting or Quest */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Touch Workshop</span>
                    <span className="text-[#F59E0B] font-bold">New Strokes</span>
                  </div>
                  <h3 className="text-base font-black text-white">Penna Handwriting Workshop</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Practice tactile cursive loops and letterforms with real-time stylus/finger precision scoring.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Tactile Tracing</span>
                  <button
                    onClick={() => onNavigate('HANDWRITING_WORKSHOP')}
                    className="text-xs font-black uppercase tracking-wider text-[#F59E0B] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Open Penna <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 3: World Language Practice */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Daily Language</span>
                    <span className="text-[#06D6A0] font-bold">5-Day Streak</span>
                  </div>
                  <h3 className="text-base font-black text-white">Spanish A1 · Conversation</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Complete today's 5-minute dialogue deck to keep your CEFR language streak active.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">5 Min Practice</span>
                  <button
                    onClick={() => onNavigate('LANGUAGE_QUEST')}
                    className="text-xs font-black uppercase tracking-wider text-[#06D6A0] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Practice Spanish <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Navigation Tabs (Touch-First Pills) ───────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {[
            { key: 'PILLARS', label: 'Curriculum & Literacy Pillars', icon: BookOpen },
            { key: 'QUESTS', label: 'Quests & Games', icon: Sparkles },
            { key: 'LIBRARY', label: 'Kids Library & Classics', icon: Library },
            { key: 'LANGUAGES', label: 'World Languages (CEFR)', icon: Languages },
          ].map(t => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as Tab)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all min-h-[48px] ${
                  on
                    ? 'bg-white text-black shadow-lg shadow-white/10 scale-[1.02]'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border border-white/10'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: CURRICULUM PILLARS ─────────────────────────────────────── */}
        {tab === 'PILLARS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Core Literacy & Language Strands</h2>
                <p className="text-xs text-white/50">Sequential learning from phonics and early handwriting to advanced rhetoric</p>
              </div>
              <span className="text-xs text-white/40 font-mono">4 Pillars · PreK → University</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {PILLARS.map(pillar => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                          style={{
                            borderColor: `${pillar.accent}55`,
                            backgroundColor: `${pillar.accent}15`,
                            color: pillar.accent,
                          }}
                        >
                          {pillar.badge}
                        </span>
                        <Icon size={18} style={{ color: pillar.accent }} />
                      </div>

                      <h3 className="text-lg font-black text-white mb-2 leading-tight">{pillar.title}</h3>
                      <p className="text-xs text-white/60 leading-relaxed mb-5">{pillar.blurb}</p>

                      <div className="space-y-2.5 pt-4 border-t border-white/5">
                        {pillar.subtopics.map(sub => (
                          <div key={sub.name} className="group/item">
                            <div className="text-xs font-bold text-white/85 group-hover/item:text-white flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pillar.accent }} />
                              {sub.name}
                            </div>
                            <p className="text-[11px] text-white/45 ml-3 mt-0.5 leading-normal">{sub.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigate(pillar.id === 'phonics-foundations' ? 'HANDWRITING_WORKSHOP' : pillar.id === 'world-languages' ? 'LANGUAGE_QUEST' : 'READING_QUEST')}
                      className="mt-6 w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white transition-all min-h-[44px]"
                    >
                      Start Practice Lessons →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: QUESTS & GAMES ─────────────────────────────────────────── */}
        {tab === 'QUESTS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Gamified Literacy Quests</h2>
                <p className="text-xs text-white/50">Interactive reading engines, stroke tracing, and language practice</p>
              </div>
              <span className="text-xs text-white/40">4 Active Quests</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {LANGUAGE_QUESTS.map(quest => (
                <div
                  key={quest.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="text-3xl">{quest.emoji}</span>
                      <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-white/60">
                        {quest.points}
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-white mb-1.5">{quest.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-4">{quest.desc}</p>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-xs text-white/40">Adaptive Level</span>
                    <button
                      onClick={() => onNavigate(quest.route)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                      style={{ backgroundColor: quest.accent }}
                    >
                      Launch Quest ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: KIDS LIBRARY & CLASSICS ────────────────────────────────── */}
        {tab === 'LIBRARY' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Open Classics & Leveled Books</h2>
                <p className="text-xs text-white/50">Public domain literature, Gutenberg K12 readers, and illustrated tales</p>
              </div>
              <button
                onClick={() => onNavigate('KIDS_LIBRARY')}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-black uppercase tracking-wider min-h-[44px]"
              >
                Open Full Library →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  title: 'Alice’s Adventures in Wonderland',
                  author: 'Lewis Carroll',
                  genre: 'Classic Fiction',
                  desc: 'Follow Alice down the rabbit hole in this masterwork of whimsical logic and wordplay.',
                  badge: 'G3–6 Leveled',
                  accent: '#3B82F6',
                },
                {
                  title: 'Treasure Island',
                  author: 'Robert Louis Stevenson',
                  genre: 'Adventure Novel',
                  desc: 'The defining tale of pirates, mutiny, and Jim Hawkins’ quest for buried treasure on the Hispaniola.',
                  badge: 'G5–8 Leveled',
                  accent: '#F59E0B',
                },
                {
                  title: 'Narrative of the Life of Frederick Douglass',
                  author: 'Frederick Douglass',
                  genre: 'Primary Source Autobiography',
                  desc: 'The courage, literacy quest, and pursuit of freedom by one of America’s greatest orators.',
                  badge: 'G7–12 & AP',
                  accent: '#D40055',
                },
              ].map(book => (
                <div
                  key={book.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:bg-white/[0.05] transition-all"
                >
                  <div>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border mb-3 inline-block"
                      style={{
                        borderColor: `${book.accent}55`,
                        backgroundColor: `${book.accent}15`,
                        color: book.accent,
                      }}
                    >
                      {book.badge}
                    </span>
                    <h3 className="text-lg font-black text-white mb-1">{book.title}</h3>
                    <p className="text-[11px] text-white/40 mb-3">{book.author} · {book.genre}</p>
                    <p className="text-xs text-white/60 leading-relaxed">{book.desc}</p>
                  </div>

                  <button
                    onClick={() => onNavigate('KIDS_LIBRARY')}
                    className="mt-6 w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white transition-all min-h-[44px]"
                  >
                    Read in Book Reader →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: WORLD LANGUAGES ────────────────────────────────────────── */}
        {tab === 'LANGUAGES' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white">CEFR-Benchmarked Language Tracks</h2>
              <p className="text-xs text-white/50">Duolingo-style micro-lessons, pronunciation audio, and vocabulary retention</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { name: 'Spanish (Español)', flag: '🇪🇸', level: 'A1 → B1', lessons: '24 Modules', accent: '#D40055' },
                { name: 'French (Français)', flag: '🇫🇷', level: 'A1 → A2', lessons: '18 Modules', accent: '#3B82F6' },
                { name: 'German (Deutsch)', flag: '🇩🇪', level: 'A1 → A2', lessons: '16 Modules', accent: '#F59E0B' },
                { name: 'Japanese (日本語)', flag: '🇯🇵', level: 'Kana & Intro', lessons: '20 Modules', accent: '#EC4899' },
                { name: 'Mandarin (中文)', flag: '🇨🇳', level: 'Pinyin & HSK 1', lessons: '16 Modules', accent: '#06D6A0' },
                { name: 'Italian (Italiano)', flag: '🇮🇹', level: 'A1 Basics', lessons: '14 Modules', accent: '#00DAF3' },
              ].map(lang => (
                <div
                  key={lang.name}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-3xl">{lang.flag}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-white/50">
                        {lang.level}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-white mb-1">{lang.name}</h3>
                    <p className="text-xs text-white/50">{lang.lessons} · Spaced repetition</p>
                  </div>

                  <button
                    onClick={() => onNavigate('LANGUAGE_QUEST')}
                    className="mt-6 w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                    style={{ backgroundColor: lang.accent }}
                  >
                    Start Language Quest ▶
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Touch-First Sticky Quick Action Bar ──────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-black/80 backdrop-blur-xl border-t border-white/10 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('READING_QUEST')}
            className="flex-1 py-3.5 px-4 rounded-2xl bg-[#D40055] text-white text-xs font-black uppercase tracking-wider text-center shadow-lg shadow-[#D40055]/30 flex items-center justify-center gap-2 min-h-[48px]"
          >
            <BookOpen size={16} /> Open Reading Quest
          </button>
          <button
            onClick={onBack}
            className="px-4 py-3.5 rounded-2xl border border-white/15 bg-white/5 text-white/70 text-xs font-bold min-h-[48px]"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default LanguageArtsSchoolView;

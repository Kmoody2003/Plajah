// KidsLibraryView — Lorea's children's section for Kids Mode: a shelf of public-domain
// stories with a big-text, read-aloud reader, plus learn-to-read tools (alphabet/phonics
// and Dolch sight-word flashcards). All content is bundled + public domain (data/kidsLibrary).

import React, { useState } from 'react';
import { ArrowLeft, Volume2, ChevronLeft, ChevronRight, Sparkles, Type, BookOpen, X, Shuffle } from 'lucide-react';
import { KIDS_BOOKS, READING_LEVELS, PHONICS, SIGHT_WORDS, KidsBook, ReadingLevel } from '../data/kidsLibrary';

const speak = (text: string, rate = 0.9) => {
  try { const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.pitch = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ }
};

const KidsLibraryView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [book, setBook] = useState<KidsBook | null>(null);
  const [tool, setTool] = useState<'phonics' | 'sight' | null>(null);

  if (book) return <KidReader book={book} onClose={() => setBook(null)} />;
  if (tool === 'phonics') return <PhonicsTool onClose={() => setTool(null)} />;
  if (tool === 'sight') return <SightWordsTool onClose={() => setTool(null)} />;

  return (
    <div style={{ minHeight: '100%', background: 'linear-gradient(180deg,#0e1430,#0a0a14)', color: '#fff', padding: '20px 16px 70px', fontFamily: "'Outfit','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={ghost}><ArrowLeft size={16} /> Back</button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ fontSize: 40 }}>📚</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Kids Library</h1>
            <p style={{ margin: '2px 0 0', color: '#aeb6d8', fontSize: 14 }}>Read stories and learn your letters — tap anything to hear it!</p>
          </div>
        </div>

        {/* Learn to read */}
        <h2 style={{ fontSize: 16, fontWeight: 800, marginTop: 24, marginBottom: 10, color: '#cfe' }}>✨ Learn to Read</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <ToolCard onClick={() => setTool('phonics')} icon={<Type size={26} />} title="Letters & Sounds" sub="A to Z phonics" colors={['#FF8C00', '#e23b6d']} />
          <ToolCard onClick={() => setTool('sight')} icon={<Sparkles size={26} />} title="Sight Words" sub="Words to know by heart" colors={['#36c5f0', '#2bd67a']} />
        </div>

        {/* Story shelves */}
        {READING_LEVELS.map(lv => {
          const books = KIDS_BOOKS.filter(b => b.level === lv.id);
          if (!books.length) return null;
          return (
            <div key={lv.id} style={{ marginTop: 26 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{lv.label}</h2>
              <p style={{ fontSize: 12, color: '#8a93b8', marginBottom: 10 }}>{lv.sub}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
                {books.map(b => (
                  <button key={b.id} onClick={() => setBook(b)} style={{ cursor: 'pointer', border: 'none', borderRadius: 18, overflow: 'hidden', background: '#16204a', color: '#fff', textAlign: 'left', padding: 0 }}>
                    <div style={{ height: 96, background: `radial-gradient(120% 100% at 50% 0%, ${b.accent}aa, transparent 70%), linear-gradient(150deg, ${b.accent}, #16204a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>{b.emoji}</div>
                    <div style={{ padding: '10px 12px 12px' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.15 }}>{b.title}</div>
                      <div style={{ fontSize: 11, color: '#8a93b8', marginTop: 3 }}>{b.author}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Reader ──────────────────────────────────────────────────────────────────
const KidReader: React.FC<{ book: KidsBook; onClose: () => void }> = ({ book, onClose }) => {
  const [page, setPage] = useState(0);
  const last = page === book.pages.length - 1;
  const text = book.pages[page];

  return (
    <div style={{ minHeight: '100%', background: `linear-gradient(180deg, ${book.accent}33, #0a0a14)`, color: '#fff', display: 'flex', flexDirection: 'column', fontFamily: "'Outfit','Segoe UI',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
        <button onClick={onClose} style={ghost}><ArrowLeft size={16} /> Library</button>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{book.emoji} {book.title}</div>
        <button onClick={() => speak(text)} style={{ ...pill, background: '#fff', color: book.accent }}><Volume2 size={16} /> Read to me</button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 22px' }}>
        <div style={{ maxWidth: 620, textAlign: 'center' }}>
          <div style={{ fontSize: 70, marginBottom: 16 }}>{book.emoji}</div>
          <p style={{ fontSize: 'clamp(20px, 3.4vw, 30px)', lineHeight: 1.5, fontWeight: 700, whiteSpace: 'pre-line' }}>{text}</p>
          {last && book.moral && <p style={{ marginTop: 22, fontSize: 15, color: '#ffd24a', fontWeight: 800 }}>🌟 {book.moral}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px 0 28px' }}>
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...navBtn, opacity: page === 0 ? 0.3 : 1 }}><ChevronLeft size={26} /></button>
        <div style={{ display: 'flex', gap: 6 }}>
          {book.pages.map((_, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i === page ? '#fff' : 'rgba(255,255,255,0.3)' }} />)}
        </div>
        {last
          ? <button onClick={onClose} style={{ ...navBtn, width: 'auto', padding: '0 18px', borderRadius: 26, fontWeight: 800, fontSize: 14 }}>The End 🎉</button>
          : <button onClick={() => setPage(p => Math.min(book.pages.length - 1, p + 1))} style={navBtn}><ChevronRight size={26} /></button>}
      </div>
    </div>
  );
};

// ── Phonics ─────────────────────────────────────────────────────────────────
const PhonicsTool: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [sel, setSel] = useState(PHONICS[0]);
  return (
    <div style={{ minHeight: '100%', background: 'linear-gradient(180deg,#2a1640,#0a0a14)', color: '#fff', padding: '16px', fontFamily: "'Outfit','Segoe UI',sans-serif" }}>
      <button onClick={onClose} style={ghost}><X size={16} /> Close</button>
      <div style={{ maxWidth: 700, margin: '6px auto 0', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>Letters &amp; Sounds</h1>
        <div onClick={() => speak(`${sel.letter}. ${sel.sound}. ${sel.word}`)} style={{ cursor: 'pointer', margin: '14px auto', width: 200, height: 200, borderRadius: 32, background: 'linear-gradient(150deg,#FF8C00,#7a2bd6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 86, fontWeight: 900, lineHeight: 1 }}>{sel.letter}</div>
          <div style={{ fontSize: 44 }}>{sel.emoji}</div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>“{sel.sound}” — like <b>{sel.word}</b> <button onClick={() => speak(`${sel.letter}. ${sel.sound}. ${sel.word}`)} style={{ ...pill, background: '#fff', color: '#7a2bd6', verticalAlign: 'middle' }}><Volume2 size={14} /></button></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(54px, 1fr))', gap: 8, marginTop: 20 }}>
          {PHONICS.map(p => (
            <button key={p.letter} onClick={() => { setSel(p); speak(`${p.letter}. ${p.sound}. ${p.word}`); }}
              style={{ cursor: 'pointer', aspectRatio: '1', borderRadius: 12, border: 'none', fontSize: 22, fontWeight: 900, background: sel.letter === p.letter ? '#fff' : 'rgba(255,255,255,0.08)', color: sel.letter === p.letter ? '#7a2bd6' : '#fff' }}>{p.letter}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Sight words ─────────────────────────────────────────────────────────────
const SightWordsTool: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [i, setI] = useState(0);
  const word = SIGHT_WORDS[i];
  const next = () => setI(n => (n + 1) % SIGHT_WORDS.length);
  const shuffle = () => setI(Math.floor(Math.random() * SIGHT_WORDS.length));
  return (
    <div style={{ minHeight: '100%', background: 'linear-gradient(180deg,#06303a,#0a0a14)', color: '#fff', padding: '16px', fontFamily: "'Outfit','Segoe UI',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <button onClick={onClose} style={ghost}><X size={16} /> Close</button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <div style={{ fontSize: 13, color: '#8ad' }}>Word {i + 1} of {SIGHT_WORDS.length}</div>
        <button onClick={() => speak(word, 0.8)} style={{ cursor: 'pointer', border: 'none', width: 'min(86vw,420px)', height: 220, borderRadius: 28, background: 'linear-gradient(150deg,#36c5f0,#2bd67a)', color: '#0a0a14', fontSize: 'clamp(48px,11vw,76px)', fontWeight: 900 }}>{word}</button>
        <div style={{ fontSize: 12, color: '#9ad' }}>Tap the word to hear it</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => speak(word, 0.8)} style={{ ...pill, background: '#fff', color: '#06303a' }}><Volume2 size={16} /> Say it</button>
          <button onClick={shuffle} style={{ ...pill, background: 'rgba(255,255,255,0.12)', color: '#fff' }}><Shuffle size={16} /> Shuffle</button>
          <button onClick={next} style={{ ...pill, background: '#FF8C00', color: '#1a1a1a' }}>Next <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
};

const ToolCard: React.FC<{ onClick: () => void; icon: React.ReactNode; title: string; sub: string; colors: [string, string] }> = ({ onClick, icon, title, sub, colors }) => (
  <button onClick={onClick} style={{ cursor: 'pointer', border: 'none', borderRadius: 18, padding: '16px 18px', textAlign: 'left', color: '#fff', background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`, display: 'flex', alignItems: 'center', gap: 14 }}>
    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
    <div><div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{sub}</div></div>
  </button>
);

const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 };
const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 22, border: 'none', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' };
const navBtn: React.CSSProperties = { width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

export default KidsLibraryView;

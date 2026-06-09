/**
 * ArtistBoards — Visual creative workspace for artists.
 * Boards for: Marketing Art, Stage Design, Lighting Mood, Ticket Design,
 * Poster Concepts, Brand Colors, Venue Layout, and custom boards.
 * Card types: Image (URL), Text note, Color palette, Link reference, Aria note, Video URL.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image, Type, Palette, Link2, Sparkles, Video, Plus, X, Trash2,
  ArrowLeft, Edit2, Grid3X3, Layers, Lightbulb, Megaphone, Star,
  Tag, Eye, Download, Share2, MoreHorizontal, ChevronRight,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

type CardType = 'IMAGE' | 'TEXT' | 'COLOR' | 'LINK' | 'ARIA' | 'VIDEO';

interface BoardCard {
  id: string;
  type: CardType;
  content: string;        // URL / text / hex color / aria note / video URL
  label?: string;
  color?: string;         // accent color for card UI
  createdAt: number;
}

interface Board {
  id: string;
  title: string;
  category: string;
  coverColor: string;
  emoji: string;
  cards: BoardCard[];
  createdAt: number;
}

interface Props {
  onBack?: () => void;
}

// ─── Storage ─────────────────────────────────────────────────────────────────────

const BOARDS_KEY = 'plajah_artist_boards_v1';
function loadBoards(): Board[] { try { return JSON.parse(localStorage.getItem(BOARDS_KEY) || '[]'); } catch { return []; } }
function saveBoards(b: Board[]) { try { localStorage.setItem(BOARDS_KEY, JSON.stringify(b)); } catch {} }
function uuid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }

// ─── Starter board templates ──────────────────────────────────────────────────

const BOARD_TEMPLATES = [
  { title: 'Marketing Campaign', category: 'Marketing', coverColor: '#FF8C00', emoji: '📣' },
  { title: 'Stage Design', category: 'Production', coverColor: '#a855f7', emoji: '🎭' },
  { title: 'Lighting Mood', category: 'Production', coverColor: '#3b82f6', emoji: '💡' },
  { title: 'Ticket & Poster Concepts', category: 'Design', coverColor: '#10b981', emoji: '🎟️' },
  { title: 'Brand & Identity', category: 'Design', coverColor: '#ef4444', emoji: '✨' },
  { title: 'Venue Layout', category: 'Planning', coverColor: '#f59e0b', emoji: '🗺️' },
];

const CARD_TYPE_META: Record<CardType, { icon: React.ReactNode; label: string; placeholder: string; color: string }> = {
  IMAGE: { icon: <Image size={13} />,     label: 'Image URL',    placeholder: 'https://image-url.com/photo.jpg', color: '#FF8C00' },
  TEXT:  { icon: <Type size={13} />,      label: 'Text Note',    placeholder: 'Write anything — ideas, quotes, references…', color: '#a855f7' },
  COLOR: { icon: <Palette size={13} />,   label: 'Color Swatch', placeholder: '#FF8C00 or "deep midnight blue"', color: '#10b981' },
  LINK:  { icon: <Link2 size={13} />,     label: 'Reference Link', placeholder: 'https://inspiration-reference.com', color: '#3b82f6' },
  ARIA:  { icon: <Sparkles size={13} />,  label: 'Aria Note',    placeholder: 'What do you want Aria to design or suggest?', color: '#f59e0b' },
  VIDEO: { icon: <Video size={13} />,     label: 'Video URL',    placeholder: 'YouTube / Vimeo / Plajah video URL', color: '#ef4444' },
};

// ─── Color swatch display ─────────────────────────────────────────────────────

function isHexColor(s: string) { return /^#([0-9A-Fa-f]{3}){1,2}$/.test(s.trim()); }

// ─── Board Card component ─────────────────────────────────────────────────────

const BoardCardComponent: React.FC<{ card: BoardCard; onRemove: (id: string) => void }> = ({ card, onRemove }) => {
  const meta = CARD_TYPE_META[card.type];

  const openAria = () => {
    window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: {
      prompt: `Act as Aria, my AI Art Director. I'm working on a visual board and I need your help with: "${card.content}". Give me specific visual direction — describe colors, mood, composition, typography styles, and reference points I should look up. Be a real creative director.`,
    }}));
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="group relative break-inside-avoid mb-3 rounded-2xl overflow-hidden border border-white/[0.07] hover:border-white/20 transition-all">

      {/* Remove button */}
      <button onClick={() => onRemove(card.id)}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white/60 hover:text-red-400 transition-all">
        <X size={11} />
      </button>

      {/* IMAGE */}
      {card.type === 'IMAGE' && (
        <div className="bg-white/[0.03]">
          <img src={card.content} alt={card.label || 'Reference'} className="w-full object-cover max-h-64" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {card.label && <p className="px-3 py-2 text-[10px] font-bold text-white/50">{card.label}</p>}
        </div>
      )}

      {/* VIDEO */}
      {card.type === 'VIDEO' && (
        <div className="bg-black/30 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <Video size={16} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-white truncate">{card.label || 'Video Reference'}</p>
            <p className="text-[10px] text-white/30 truncate">{card.content}</p>
          </div>
          <a href={card.content} target="_blank" rel="noopener noreferrer"
            className="text-[10px] font-black text-white/40 hover:text-red-400 transition-colors uppercase tracking-widest">
            Open
          </a>
        </div>
      )}

      {/* TEXT */}
      {card.type === 'TEXT' && (
        <div className="p-4 bg-white/[0.03]">
          {card.label && <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">{card.label}</p>}
          <p className="text-sm text-white/70 leading-relaxed">{card.content}</p>
        </div>
      )}

      {/* COLOR */}
      {card.type === 'COLOR' && (
        <div className="flex items-center gap-3 p-3 bg-white/[0.03]">
          <div className="w-12 h-12 rounded-xl shrink-0 border border-white/10"
            style={{ background: isHexColor(card.content) ? card.content : '#888' }} />
          <div>
            <p className="text-sm font-black text-white">{card.label || card.content}</p>
            {card.label && <p className="text-[10px] text-white/30 font-mono">{card.content}</p>}
          </div>
        </div>
      )}

      {/* LINK */}
      {card.type === 'LINK' && (
        <div className="p-4 bg-white/[0.03] flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <Link2 size={14} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">{card.label || 'Reference'}</p>
            <a href={card.content} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-400/70 hover:text-blue-400 truncate block transition-colors">{card.content}</a>
          </div>
        </div>
      )}

      {/* ARIA */}
      {card.type === 'ARIA' && (
        <div className="p-4 bg-amber-500/5 border-t-2 border-amber-500/40">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} className="text-amber-400" />
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Aria Direction</p>
          </div>
          <p className="text-sm text-white/70 leading-relaxed mb-3">{card.content}</p>
          <button onClick={openAria}
            className="flex items-center gap-1.5 text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-widest transition-colors">
            <Sparkles size={10} /> Ask Aria about this
          </button>
        </div>
      )}

      {/* Type badge */}
      <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-[9px] font-black uppercase tracking-widest"
          style={{ color: meta.color }}>
          {meta.icon} {meta.label}
        </span>
      </div>
    </motion.div>
  );
};

// ─── Board detail view ────────────────────────────────────────────────────────

const BoardDetail: React.FC<{ board: Board; onUpdate: (b: Board) => void; onBack: () => void }> = ({ board, onUpdate, onBack }) => {
  const [addingType, setAddingType] = useState<CardType | null>(null);
  const [form, setForm] = useState({ content: '', label: '' });

  const addCard = () => {
    if (!addingType || !form.content.trim()) return;
    const newCard: BoardCard = { id: uuid(), type: addingType, content: form.content.trim(), label: form.label.trim() || undefined, createdAt: Date.now() };
    onUpdate({ ...board, cards: [...board.cards, newCard] });
    setForm({ content: '', label: '' });
    setAddingType(null);
  };

  const removeCard = (id: string) => onUpdate({ ...board, cards: board.cards.filter(c => c.id !== id) });

  const askAria = () => {
    window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: {
      prompt: `Act as Aria, my AI Art Director and Creative Producer. I'm working on a board called "${board.title}" for ${board.category}. I have ${board.cards.length} items on this board. Based on this context, give me:\n1. A cohesive visual direction and mood\n2. 5 specific references I should look up\n3. Color palette recommendation (5 colors with hex codes)\n4. Typography pairing suggestion\n5. What's missing from this board that I should add\nBe specific, practical, and inspiring like a real creative director.`,
    }}));
  };

  const meta = addingType ? CARD_TYPE_META[addingType] : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 px-6 py-4 border-b border-white/[0.06]">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm font-black">
          <ArrowLeft size={14} /> Boards
        </button>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-2xl">{board.emoji}</span>
          <div>
            <h2 className="text-base font-black text-white">{board.title}</h2>
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">{board.category} · {board.cards.length} items</p>
          </div>
        </div>
        <button onClick={askAria}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-widest hover:bg-amber-500/25 transition-all">
          <Sparkles size={12} /> Art Director
        </button>
      </div>

      {/* Add card type picker */}
      <div className="shrink-0 px-6 py-3 border-b border-white/[0.04] flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-black text-white/25 uppercase tracking-widest shrink-0 mr-1">Add:</span>
        {(Object.keys(CARD_TYPE_META) as CardType[]).map(t => {
          const m = CARD_TYPE_META[t];
          return (
            <button key={t} onClick={() => setAddingType(addingType === t ? null : t)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${addingType === t ? 'text-black border-transparent' : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07] text-white/40'}`}
              style={addingType === t ? { background: m.color, borderColor: 'transparent' } : {}}>
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      {/* Add form */}
      <AnimatePresence>
        {addingType && meta && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b border-white/[0.06]">
            <div className="px-6 py-4 flex gap-3 items-end">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: meta.color }}>{meta.label}</label>
                  <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                    placeholder={meta.placeholder} rows={2}
                    className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold resize-none transition-all focus:border-white/25" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 block mb-1">Label (optional)</label>
                  <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Short label"
                    className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all focus:border-white/25" />
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={addCard} className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-black transition-all hover:opacity-80"
                    style={{ background: meta.color }}>Add Card</button>
                  <button onClick={() => setAddingType(null)} className="py-2 px-3 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">✕</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards masonry grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
        {board.cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="text-6xl">{board.emoji}</div>
            <p className="text-sm font-black uppercase tracking-widest text-white/30">{board.title}</p>
            <p className="text-xs text-white/20 max-w-xs">Add images, notes, colors, links, and Aria directions to build your visual vision for this board.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
            <AnimatePresence>
              {board.cards.map(card => (
                <BoardCardComponent key={card.id} card={card} onRemove={removeCard} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main ArtistBoards component ─────────────────────────────────────────────

const ArtistBoards: React.FC<Props> = ({ onBack }) => {
  const [boards, setBoards] = useState<Board[]>(() => loadBoards());
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Design');

  const save = (b: Board[]) => { saveBoards(b); setBoards(b); };

  const createBoard = (template?: typeof BOARD_TEMPLATES[0]) => {
    const title = template?.title || newTitle || 'New Board';
    const b: Board = {
      id: uuid(), title, category: template?.category || newCategory,
      coverColor: template?.coverColor || '#FF8C00',
      emoji: template?.emoji || '📋', cards: [], createdAt: Date.now(),
    };
    const updated = [...boards, b];
    save(updated);
    setActiveBoard(b);
    setCreatingNew(false);
    setNewTitle('');
  };

  const updateBoard = (board: Board) => {
    const updated = boards.map(b => b.id === board.id ? board : b);
    save(updated);
    setActiveBoard(board);
  };

  const removeBoard = (id: string) => {
    save(boards.filter(b => b.id !== id));
    if (activeBoard?.id === id) setActiveBoard(null);
  };

  if (activeBoard) {
    const liveBoard = boards.find(b => b.id === activeBoard.id) || activeBoard;
    return <BoardDetail board={liveBoard} onUpdate={updateBoard} onBack={() => setActiveBoard(null)} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center">
            <Layers size={16} className="text-[#FF8C00]" />
          </div>
          <div>
            <h1 className="text-base font-black uppercase tracking-widest text-white">Artist Boards</h1>
            <p className="text-[10px] text-white/35">Visual planning for marketing, stage design, lighting, and more</p>
          </div>
        </div>
        <button onClick={() => setCreatingNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/25 transition-all">
          <Plus size={13} /> New Board
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8">
        {/* Quick start templates */}
        {boards.length === 0 && (
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Start with a Template</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {BOARD_TEMPLATES.map(t => (
                <button key={t.title} onClick={() => createBoard(t)}
                  className="group relative aspect-video rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/20 transition-all flex flex-col items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${t.coverColor}30, ${t.coverColor}08)` }}>
                  <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 30%, ${t.coverColor}25 0%, transparent 70%)` }} />
                  <span className="text-3xl relative z-10">{t.emoji}</span>
                  <div className="relative z-10 text-center">
                    <p className="text-xs font-black text-white">{t.title}</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">{t.category}</p>
                  </div>
                  <Plus size={14} className="absolute top-3 right-3 text-white/20 group-hover:text-white/60 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Existing boards */}
        {boards.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Your Boards</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {boards.map(b => (
                <div key={b.id} className="group relative">
                  <button onClick={() => setActiveBoard(b)}
                    className="w-full aspect-video rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/20 transition-all flex flex-col items-center justify-center gap-2 relative"
                    style={{ background: `linear-gradient(135deg, ${b.coverColor}30, ${b.coverColor}08)` }}>
                    <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 30%, ${b.coverColor}25 0%, transparent 70%)` }} />
                    <span className="text-3xl relative z-10">{b.emoji}</span>
                    <div className="relative z-10 text-center">
                      <p className="text-xs font-black text-white">{b.title}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest">{b.category} · {b.cards.length} items</p>
                    </div>
                    <ChevronRight size={14} className="absolute bottom-3 right-3 text-white/20 group-hover:text-white/60 transition-colors" />
                  </button>
                  <button onClick={() => removeBoard(b.id)}
                    className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white/40 hover:text-red-400 transition-all">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {/* Add new board card */}
              <button onClick={() => setCreatingNew(true)}
                className="aspect-video rounded-2xl border border-dashed border-white/15 hover:border-[#FF8C00]/40 hover:bg-[#FF8C00]/5 transition-all flex flex-col items-center justify-center gap-2 text-white/25 hover:text-[#FF8C00]">
                <Plus size={20} />
                <p className="text-xs font-black uppercase tracking-widest">New Board</p>
              </button>
            </div>
          </div>
        )}

        {/* Template bar when boards exist */}
        {boards.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Add from Template</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {BOARD_TEMPLATES.filter(t => !boards.some(b => b.title === t.title)).map(t => (
                <button key={t.title} onClick={() => createBoard(t)}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] hover:border-white/20 text-xs font-black text-white/40 hover:text-white transition-all">
                  {t.emoji} {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New board form */}
      <AnimatePresence>
        {creatingNew && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4">
              <h3 className="text-base font-black text-white">New Board</h3>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Board Title</label>
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Album Art Concepts" onKeyDown={e => e.key === 'Enter' && createBoard()}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-[#FF8C00]/50 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Category</label>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
                  {['Design', 'Marketing', 'Production', 'Planning', 'Creative', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => createBoard()} className="flex-1 py-2.5 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all">Create Board</button>
                <button onClick={() => setCreatingNew(false)} className="py-2.5 px-4 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ArtistBoards;

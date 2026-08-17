/**
 * AriaHalo — Aria's ambient command palette (the "Halo" surface).
 *
 * Summoned with Cmd/Ctrl-K from anywhere, it blooms over the current screen as
 * a lightweight, context-aware command surface: type a question or pick a
 * suggestion scoped to where you are, and it hands off to Aria's full panel
 * (PlajahAgent) seeded with your prompt. Nothing navigates you away.
 *
 * One persona: Halo is a door into the same Aria, not a separate assistant.
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CornerDownLeft } from 'lucide-react';
import AriaMark from './AriaMark';

interface Suggestion { label: string; prompt: string; }

const VIEW_LABEL: Record<string, string> = {
  MUSIC: 'Chora', VIDEOS: 'Reello', MOVIES_TV: 'Taleo', BOOKS: 'Lorea',
  PRAXIS: 'Praxis', BUSINESS_DASHBOARD: 'your dashboard', PLAJAH_BUSINESS: 'Business',
  DASHBOARD: 'the Global Archive', FEED: 'your feed', PLAJAH_LABS: 'Labs',
  CLASSROOMS: 'Academia', ACADEMIA_HOME: 'Academia',
};

const SUGGESTIONS: Record<string, Suggestion[]> = {
  MUSIC: [
    { label: 'Plan a release', prompt: 'Help me plan a music release — timing, credits, and promo.' },
    { label: 'Write my artist bio', prompt: 'Write me a short, compelling artist bio.' },
    { label: 'What should I make next?', prompt: 'Based on my music, what should I create next?' },
  ],
  PRAXIS: [
    { label: "What's my next step?", prompt: 'Look at my venture and tell me the single most important next step to take.' },
    { label: 'Explain my P&L', prompt: 'Read my P&L and explain what it means in plain terms.' },
    { label: 'Am I missing any filings?', prompt: 'Check my compliance calendar — what deadlines are coming up?' },
  ],
  BUSINESS_DASHBOARD: [
    { label: 'How is my business doing?', prompt: 'Give me a quick read on how my business is doing this month.' },
    { label: 'Draft a promo message', prompt: 'Draft a short promo message for my customers.' },
    { label: 'What should I restock?', prompt: "What's low on inventory that I should restock?" },
  ],
  DASHBOARD: [
    { label: "What's new for me?", prompt: "What's new on Plajah that I'd like?" },
    { label: 'Summarize my day', prompt: 'Summarize what needs my attention today.' },
    { label: 'Find something to watch', prompt: 'Find me something great to watch right now.' },
  ],
};

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: 'What can you do?', prompt: 'What can you help me with on Plajah?' },
  { label: 'Help me create something', prompt: 'Help me create something new.' },
  { label: 'Where should I go?', prompt: 'Where should I go on Plajah right now?' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentView?: string;
  /** Hand the prompt to Aria's full panel */
  onSubmit: (prompt: string) => void;
}

const AriaHalo: React.FC<Props> = ({ isOpen, onClose, currentView, onSubmit }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = (currentView && SUGGESTIONS[currentView]) || DEFAULT_SUGGESTIONS;
  const viewName = currentView ? VIEW_LABEL[currentView] : undefined;

  useEffect(() => {
    if (!isOpen) return;
    setQ('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  const submit = (prompt: string) => { const p = prompt.trim(); if (!p) return; onSubmit(p); onClose(); };

  const rows: Suggestion[] = q.trim() ? [{ label: `Ask Aria: “${q.trim()}”`, prompt: q.trim() }] : suggestions;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex items-start justify-center px-4"
          style={{ paddingTop: 'min(16vh, 140px)', background: 'rgba(3,1,8,0.5)', backdropFilter: 'blur(6px)' }}
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onMouseDown={e => e.stopPropagation()}
            className="w-full max-w-[560px] rounded-[1.4rem] overflow-hidden relative"
            style={{
              background: 'rgba(10,6,22,0.94)',
              border: '1px solid rgba(139,92,246,0.32)',
              backdropFilter: 'blur(32px)',
              boxShadow: '0 30px 80px -18px rgba(0,0,0,0.8), 0 0 50px -12px rgba(139,92,246,0.35)',
            }}
          >
            <div className="absolute top-0 inset-x-0 h-[2px]" style={{ background: 'linear-gradient(100deg,#00daf3,#5baef0 28%,#d0bcff 50%,#d40055 76%,#ff8c00)' }} />

            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <AriaMark size={30} thinking={!!q.trim()} />
              <input
                ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(q); }}
                placeholder="Ask Aria anything…" aria-label="Ask Aria"
                className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/35"
              />
              <span className="text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5">esc</span>
            </div>

            {viewName && (
              <div className="px-4 pb-2.5">
                <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-white/55 bg-white/[0.06] border border-white/10 px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-[3px]" style={{ background: 'linear-gradient(135deg,#6b0099,#00daf3)' }} /> On {viewName}
                </span>
              </div>
            )}

            <div className="border-t border-white/[0.06]">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35 px-4 pt-3 pb-1.5">
                {q.trim() ? 'Press ↵ to ask' : 'Aria suggests'}
              </div>
              <div className="px-2 pb-2.5">
                {rows.map((s, i) => (
                  <button key={i} onClick={() => submit(s.prompt)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left group">
                    <AriaMark size={22} petals={false} />
                    <span className="text-[13.5px] text-white/85 flex-1">{s.label}</span>
                    <CornerDownLeft size={13} className="text-white/25 group-hover:text-white/50" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default AriaHalo;

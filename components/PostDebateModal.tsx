/**
 * PostDebateModal
 *
 * Opened when the user clicks "Debate this post".
 * The challenger:
 *   1. Highlights one or more spans of the original post text as references.
 *   2. States their challenge points (1–5 bullet points).
 *   3. Submits — creates a PENDING debate and opens DebateView.
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Swords, Plus, Trash2, Loader2, AlertCircle, Highlighter } from 'lucide-react';
import { issuePostDebateChallenge } from '../services/debateService';
import { DebateHighlightSegment } from '../types';

interface Props {
  postId: string;
  postText: string;
  postAuthorId: string;
  postAuthorName: string;
  postAuthorPhoto: string;
  heroImageUrl?: string;
  onClose: () => void;
  onDebateCreated: (debateId: string) => void;
}

const MAX_POINTS = 5;
const MAX_SEGMENTS = 4;

export default function PostDebateModal({
  postId,
  postText,
  postAuthorId,
  postAuthorName,
  postAuthorPhoto,
  heroImageUrl,
  onClose,
  onDebateCreated,
}: Props) {
  const [segments, setSegments]       = useState<DebateHighlightSegment[]>([]);
  const [points, setPoints]           = useState<string[]>(['']);
  const [pendingSegment, setPending]  = useState<DebateHighlightSegment | null>(null);
  const [status, setStatus]           = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError]             = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // ── Text selection → pending highlight ──────────────────────────────────────

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !textRef.current) return;

    const range = sel.getRangeAt(0);
    const container = textRef.current;

    // Walk text nodes to compute character offsets
    let start = 0;
    let end   = 0;
    let found = { start: false, end: false };

    function walk(node: Node, offset: number): number {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent ?? '').length;
        if (!found.start && node === range.startContainer) {
          start = offset + range.startOffset;
          found.start = true;
        }
        if (!found.end && node === range.endContainer) {
          end = offset + range.endOffset;
          found.end = true;
        }
        return offset + len;
      }
      let cur = offset;
      for (const child of Array.from(node.childNodes)) {
        cur = walk(child, cur);
        if (found.start && found.end) break;
      }
      return cur;
    }
    walk(container, 0);

    const text = postText.slice(start, end).trim();
    if (text.length < 3 || start >= end) return;

    sel.removeAllRanges();
    setPending({ start, end, text });
  }, [postText]);

  const addPendingSegment = () => {
    if (!pendingSegment || segments.length >= MAX_SEGMENTS) return;
    // Skip if already covered
    if (segments.some(s => s.start === pendingSegment.start && s.end === pendingSegment.end)) {
      setPending(null);
      return;
    }
    setSegments(prev => [...prev, pendingSegment]);
    setPending(null);
  };

  const removeSegment = (i: number) => setSegments(prev => prev.filter((_, idx) => idx !== i));

  // ── Challenge points ─────────────────────────────────────────────────────────

  const setPoint = (i: number, val: string) =>
    setPoints(prev => prev.map((p, idx) => (idx === i ? val : p)));

  const addPoint = () => {
    if (points.length < MAX_POINTS) setPoints(prev => [...prev, '']);
  };

  const removePoint = (i: number) =>
    setPoints(prev => prev.filter((_, idx) => idx !== i));

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const filledPoints = points.map(p => p.trim()).filter(Boolean);
    if (filledPoints.length === 0) {
      setError('State at least one challenge point.');
      return;
    }
    if (segments.length === 0) {
      setError('Highlight at least one part of the post you are challenging.');
      return;
    }

    setStatus('loading');
    setError(null);
    try {
      const id = await issuePostDebateChallenge({
        sourcePostId:        postId,
        sourcePostText:      postText,
        defenderId:          postAuthorId,
        defenderName:        postAuthorName,
        defenderPhoto:       postAuthorPhoto,
        heroImageUrl,
        highlightedSegments: segments,
        challengePoints:     filledPoints,
      });
      if (id) onDebateCreated(id);
    } catch (err: any) {
      setError(err.message || 'Failed to issue challenge');
      setStatus('error');
    }
  };

  // ── Rendered post text with highlights ───────────────────────────────────────

  const HighlightedText = () => {
    if (segments.length === 0 && !pendingSegment) {
      return <span>{postText}</span>;
    }

    // Build sorted, merged spans
    const allSpans = [
      ...segments.map(s => ({ ...s, type: 'committed' as const })),
      ...(pendingSegment ? [{ ...pendingSegment, type: 'pending' as const }] : []),
    ].sort((a, b) => a.start - b.start);

    const parts: React.ReactNode[] = [];
    let cursor = 0;

    for (const span of allSpans) {
      if (span.start > cursor) {
        parts.push(<span key={`t-${cursor}`}>{postText.slice(cursor, span.start)}</span>);
      }
      const from = Math.max(span.start, cursor);
      const to   = span.end;
      if (from < to) {
        parts.push(
          <mark
            key={`h-${span.start}`}
            className={`rounded px-0.5 ${
              span.type === 'pending'
                ? 'bg-orange-400/25 text-orange-200'
                : 'bg-orange-500/35 text-orange-100 border-b border-orange-400/60'
            }`}
          >
            {postText.slice(from, to)}
          </mark>
        );
        cursor = to;
      }
    }

    if (cursor < postText.length) {
      parts.push(<span key={`t-end`}>{postText.slice(cursor)}</span>);
    }

    return <>{parts}</>;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm px-0 sm:px-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className="w-full max-w-2xl bg-[#0e0e0e] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[92dvh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
                <Swords size={16} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Debate This Post</p>
                <p className="text-[10px] text-white/40">by {postAuthorName}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-2">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

            {/* Step 1 — Highlight */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-black text-black">1</div>
                <p className="text-xs font-black text-white/80 uppercase tracking-widest">Mark what you're challenging</p>
                <Highlighter size={12} className="text-orange-400/60" />
              </div>
              <p className="text-[10px] text-white/35 mb-3 leading-relaxed">
                Select text in the post below. Your selection appears highlighted as a visual reference in the debate.
              </p>

              {/* Post text — selectable */}
              <div
                ref={textRef}
                onMouseUp={handleMouseUp}
                onTouchEnd={handleMouseUp}
                className="bg-white/4 border border-white/8 rounded-2xl px-4 py-4 text-sm text-white/75 leading-7 select-text cursor-text font-serif"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              >
                <HighlightedText />
              </div>

              {/* Pending selection confirmation */}
              <AnimatePresence>
                {pendingSegment && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-2 flex items-center gap-3 bg-orange-500/10 border border-orange-500/25 rounded-2xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-orange-400/70 font-black uppercase tracking-widest mb-0.5">Selected Reference</p>
                      <p className="text-xs text-white/70 truncate">"{pendingSegment.text.slice(0, 80)}{pendingSegment.text.length > 80 ? '…' : ''}"</p>
                    </div>
                    <button
                      onClick={addPendingSegment}
                      disabled={segments.length >= MAX_SEGMENTS}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-orange-500 text-black text-[10px] font-black uppercase tracking-wider hover:bg-orange-400 transition-all disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button onClick={() => setPending(null)} className="text-white/30 hover:text-white transition-colors">
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Committed segments */}
              {segments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {segments.map((seg, i) => (
                    <div key={i} className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/15 rounded-xl px-3 py-2">
                      <div className="w-4 h-4 rounded-full bg-orange-500/25 flex items-center justify-center text-[8px] font-black text-orange-400 shrink-0 mt-0.5">{i + 1}</div>
                      <p className="flex-1 text-[11px] text-white/60 leading-relaxed">"{seg.text.slice(0, 120)}{seg.text.length > 120 ? '…' : ''}"</p>
                      <button onClick={() => removeSegment(i)} className="text-white/20 hover:text-red-400 transition-colors shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Step 2 — Challenge points */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-black text-black">2</div>
                <p className="text-xs font-black text-white/80 uppercase tracking-widest">State your challenge</p>
              </div>
              <p className="text-[10px] text-white/35 mb-3 leading-relaxed">
                What specifically do you dispute? Be precise — Aria will judge on these points.
              </p>

              <div className="space-y-2">
                {points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-white/8 flex items-center justify-center text-[8px] font-black text-white/40 shrink-0 mt-2">{i + 1}</div>
                    <textarea
                      value={pt}
                      onChange={e => setPoint(i, e.target.value)}
                      placeholder={`Challenge point ${i + 1}…`}
                      rows={2}
                      maxLength={280}
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-orange-500/40 focus:bg-white/8 transition-all"
                    />
                    {points.length > 1 && (
                      <button onClick={() => removePoint(i)} className="text-white/20 hover:text-red-400 transition-colors mt-2 shrink-0">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {points.length < MAX_POINTS && (
                <button
                  onClick={addPoint}
                  className="mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-orange-400 transition-colors"
                >
                  <Plus size={12} /> Add another point
                </button>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-4 border-t border-white/8 shrink-0 space-y-3">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5"
                >
                  <AlertCircle size={13} className="shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-white/5 text-white/60 text-sm font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={status === 'loading'}
                className="flex-1 py-3.5 rounded-2xl bg-orange-500 text-black text-sm font-black uppercase tracking-widest hover:bg-orange-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <><Loader2 size={16} className="animate-spin" /> Issuing Challenge…</>
                ) : (
                  <><Swords size={16} /> Issue Challenge</>
                )}
              </button>
            </div>

            <p className="text-center text-[9px] text-white/20 leading-relaxed">
              {postAuthorName} has 6 hours to accept. Aria judges at the end of 24 hours.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

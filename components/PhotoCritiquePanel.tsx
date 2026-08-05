// PhotoCritiquePanel — Part 3C: critique circles.
//
// Opt-in structured feedback on a single photograph. Three 1–5 axes (composition, light,
// story) plus a written note, an aggregate read-out so the photographer can see *which*
// axis is landing, and the list of critiques underneath.
//
// Surfaced from the photo detail in GlobalPhotosView. Every service call is non-throwing,
// so a Firestore outage degrades this panel to "no critiques yet" rather than breaking the
// photo viewer around it.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquareQuote, Star, Send, Trash2, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import {
  fetchCritiques, submitCritique, deleteMyCritique, aggregateCritiques, findMyCritique,
  CRITIQUE_AXES, type PhotoCritique, type CritiqueAxis,
} from '../services/photoCritique';
import { auth } from '../services/backendService';

const ACCENT = '#C9A55C';

const AXIS_LABEL: Record<CritiqueAxis, string> = {
  composition: 'Composition',
  light: 'Light',
  story: 'Story',
};

// ── Score selector ────────────────────────────────────────────────────────────
const ScoreRow: React.FC<{
  label: string; hint: string; value: number; onChange: (n: number) => void; disabled?: boolean;
}> = ({ label, hint, value, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 py-2.5">
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/70">{label}</p>
      <p className="text-[11px] text-white/35 leading-snug mt-0.5">{hint}</p>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-label={`${label} ${n} of 5`}
          className="p-0.5 disabled:opacity-40 transition-transform hover:scale-110"
        >
          <Star
            size={18}
            style={{ color: n <= value ? ACCENT : undefined }}
            className={n <= value ? '' : 'text-white/15'}
            fill={n <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  </div>
);

// ── Aggregate bar ─────────────────────────────────────────────────────────────
const AxisBar: React.FC<{ label: string; score: number }> = ({ label, score }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/45">{label}</span>
      <span className="text-[11px] font-black tabular-nums" style={{ color: ACCENT }}>
        {score ? score.toFixed(1) : '—'}
      </span>
    </div>
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${(score / 5) * 100}%`, background: ACCENT }}
      />
    </div>
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props {
  photoId: string;
  /** The photo's owner — the owner sees the aggregate but cannot critique their own work. */
  ownerId?: string;
}

const PhotoCritiquePanel: React.FC<Props> = ({ photoId, ownerId }) => {
  const [critiques, setCritiques] = useState<PhotoCritique[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [composition, setComposition] = useState(3);
  const [light, setLight] = useState(3);
  const [story, setStory] = useState(3);
  const [comment, setComment] = useState('');

  const uid = auth.currentUser?.uid || '';
  const isOwner = !!ownerId && ownerId === uid;

  const load = useCallback(async () => {
    setIsLoading(true);
    const list = await fetchCritiques(photoId);
    setCritiques(list);
    const mine = findMyCritique(list);
    if (mine) {
      setComposition(mine.composition);
      setLight(mine.light);
      setStory(mine.story);
      setComment(mine.comment);
    }
    setIsLoading(false);
  }, [photoId]);

  useEffect(() => { void load(); }, [load]);

  const agg = useMemo(() => aggregateCritiques(critiques), [critiques]);
  const mine = useMemo(() => findMyCritique(critiques), [critiques]);

  const handleSubmit = async () => {
    if (!auth.currentUser || isSaving) return;
    setIsSaving(true);
    const saved = await submitCritique(photoId, { composition, light, story, comment });
    if (saved) {
      setCritiques(prev => [saved, ...prev.filter(c => c.id !== saved.id)]);
      setIsOpen(false);
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!mine || isSaving) return;
    setIsSaving(true);
    const ok = await deleteMyCritique(photoId);
    if (ok) setCritiques(prev => prev.filter(c => c.id !== mine.id));
    setIsSaving(false);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <MessageSquareQuote size={16} style={{ color: ACCENT }} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Critique Circle</p>
            <p className="text-[11px] text-white/35 truncate">
              {agg.count ? `${agg.count} critique${agg.count === 1 ? '' : 's'}` : 'Structured feedback, not likes'}
            </p>
          </div>
        </div>
        {isLoading && <Loader2 size={15} className="animate-spin text-white/30 shrink-0" />}
      </div>

      {/* Aggregate */}
      {agg.count > 0 && (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Average</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: ACCENT }}>
              {agg.overall.toFixed(1)}<span className="text-white/25 text-sm font-bold"> / 5</span>
            </span>
          </div>
          <AxisBar label="Composition" score={agg.composition} />
          <AxisBar label="Light" score={agg.light} />
          <AxisBar label="Story" score={agg.story} />

          {agg.count >= 2 && agg.strongestAxis && agg.weakestAxis && agg.strongestAxis !== agg.weakestAxis && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 border-t border-white/8 mt-1">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300/80">
                <TrendingUp size={12} /> Strongest: {AXIS_LABEL[agg.strongestAxis]}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-300/80">
                <TrendingDown size={12} /> Work on: {AXIS_LABEL[agg.weakestAxis]}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Compose */}
      {!auth.currentUser ? (
        <p className="text-[11px] text-white/30 italic mt-5">Sign in to leave a critique.</p>
      ) : isOwner ? (
        <p className="text-[11px] text-white/30 italic mt-5">
          This is your photograph — you can read the critiques but not score your own work.
        </p>
      ) : (
        <>
          <button
            onClick={() => setIsOpen(v => !v)}
            className="mt-5 w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            style={isOpen ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' } : { background: ACCENT, color: '#000' }}
          >
            {isOpen ? 'Cancel' : mine ? 'Edit your critique' : 'Leave a critique'}
          </button>

          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-5">
                  <div className="divide-y divide-white/5">
                    {CRITIQUE_AXES.map(axis => {
                      const value = axis.id === 'composition' ? composition : axis.id === 'light' ? light : story;
                      const setter = axis.id === 'composition' ? setComposition : axis.id === 'light' ? setLight : setStory;
                      return (
                        <ScoreRow
                          key={axis.id}
                          label={axis.label}
                          hint={axis.hint}
                          value={value}
                          onChange={setter}
                          disabled={isSaving}
                        />
                      );
                    })}
                  </div>

                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value.slice(0, 2000))}
                    disabled={isSaving}
                    rows={4}
                    placeholder="Describe what you actually see before you evaluate it. Name the single biggest opportunity, not fifteen small ones."
                    className="mt-4 w-full rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-[13px] text-white/80 placeholder:text-white/25 leading-relaxed outline-none focus:border-white/25 transition-colors resize-none custom-scrollbar"
                  />
                  <div className="flex items-center justify-between mt-3 gap-3">
                    <span className="text-[10px] tabular-nums text-white/25">{comment.length} / 2000</span>
                    <div className="flex items-center gap-2">
                      {mine && (
                        <button
                          onClick={handleDelete}
                          disabled={isSaving}
                          className="px-4 py-2.5 rounded-full bg-white/5 text-white/40 hover:text-red-300 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <Trash2 size={12} /> Withdraw
                        </button>
                      )}
                      <button
                        onClick={handleSubmit}
                        disabled={isSaving || !comment.trim()}
                        className="px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40"
                        style={{ background: ACCENT, color: '#000' }}
                      >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        {mine ? 'Update' : 'Submit'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* List */}
      {critiques.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Critiques</p>
          {critiques.map(c => (
            <div key={c.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/60 truncate">
                  {c.critiqueId === uid ? 'You' : c.authorName}
                </p>
                <div className="flex items-center gap-2.5 shrink-0 text-[10px] font-black tabular-nums text-white/45">
                  <span>C {c.composition}</span>
                  <span>L {c.light}</span>
                  <span>S {c.story}</span>
                </div>
              </div>
              {c.comment && <p className="text-[13px] text-white/65 leading-relaxed">{c.comment}</p>}
              {c.createdAt ? (
                <p className="text-[10px] text-white/20 mt-2.5 uppercase tracking-widest">
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!isLoading && critiques.length === 0 && (
        <p className="text-[11px] text-white/25 italic mt-5">
          No critiques yet. Be the first — describe before you evaluate.
        </p>
      )}
    </div>
  );
};

export default PhotoCritiquePanel;

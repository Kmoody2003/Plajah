/**
 * Community Notes UI.
 *
 *   <CommunityNoteBadge contentId={post.id} contentType="post" postAuthorId={…} />
 *     Drop-in for any post/video card. Shows:
 *       📝 "Community context" banner when a note is published (note inline)
 *       ⏳ "Context proposed — rating in progress" subtle chip while pending
 *       ✚  entry point to read all notes / propose / rate
 *
 *   <CommunityNotesPanel …/> — the full experience: notes with transparent
 *     status timelines and live score breakdowns, rate buttons with structured
 *     reasons, the note composer (claim + summary + required sources), author
 *     response, and instant contributor enrollment.
 *
 * Differences from X's version, by design: pending notes are visible (speed),
 * scoring is public and explained on every note (transparency), published
 * notes have reversal hysteresis (stability), and post authors get a public
 * response slot (recourse).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, Clock, X, Plus, ExternalLink, CheckCircle2, ThumbsUp,
  ThumbsDown, Minus, ShieldCheck, MessageCircle, ChevronDown, ChevronUp, Scale,
} from 'lucide-react';
import { auth } from '../../services/firebase';
import {
  type CommunityNote, type NoteScore, type HelpfulVote,
  fetchNotesForContent, proposeNote, rateNote, respondToNote,
  isContributor, enrollContributor, CONTRIBUTOR_GUIDELINES, MIN_RATINGS,
} from '../../services/communityNotesService';

type ScoredNote = CommunityNote & { score: NoteScore };

// ─── Status timeline (the transparency X lacks) ──────────────────────────────

const StatusTimeline: React.FC<{ note: ScoredNote }> = ({ note }) => {
  const steps = [
    { label: 'Proposed', done: true },
    { label: `Rating (${note.score.ratings}/${MIN_RATINGS}+)`, done: note.score.ratings >= MIN_RATINGS },
    {
      label: note.score.effectiveStatus === 'PUBLISHED' ? 'Published'
        : note.score.effectiveStatus === 'NOT_HELPFUL' ? 'Not shown'
        : 'Decision pending',
      done: note.score.effectiveStatus !== 'NEEDS_RATINGS',
    },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="w-4 h-px bg-white/15" />}
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border ${
            s.done ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-white/5 border-white/10 text-white/35'}`}>
            {s.done ? <CheckCircle2 size={8} /> : <Clock size={8} />} {s.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Single note card ────────────────────────────────────────────────────────

const RATE_REASONS: { id: NonNullable<import('../../services/communityNotesService').NoteRating['reasons']>[number]; label: string; positive: boolean }[] = [
  { id: 'SOURCED', label: 'Well sourced', positive: true },
  { id: 'NEUTRAL', label: 'Neutral tone', positive: true },
  { id: 'ADDRESSES_CLAIM', label: 'On the claim', positive: true },
  { id: 'UNSOURCED', label: 'Weak sources', positive: false },
  { id: 'BIASED', label: 'Biased', positive: false },
  { id: 'OFF_TOPIC', label: 'Off topic', positive: false },
  { id: 'INCORRECT', label: 'Incorrect', positive: false },
];

const NoteCard: React.FC<{
  note: ScoredNote;
  postAuthorId?: string;
  onRated: () => void;
}> = ({ note, postAuthorId, onRated }) => {
  const uid = auth.currentUser?.uid;
  const [rating, setRating] = useState<HelpfulVote | null>(null);
  const [reasons, setReasons] = useState<NonNullable<import('../../services/communityNotesService').NoteRating['reasons']>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [rated, setRated] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [responseDraft, setResponseDraft] = useState('');
  const [showRespond, setShowRespond] = useState(false);

  const published = note.score.effectiveStatus === 'PUBLISHED';
  const canRate = !!uid && uid !== note.authorId && !rated;
  const isPostAuthor = !!uid && uid === postAuthorId;

  const submitRating = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    const ok = await rateNote(note.id, rating, reasons);
    setSubmitting(false);
    if (ok) { setRated(true); onRated(); }
  };

  return (
    <div className={`p-4 rounded-2xl border space-y-3 ${
      published ? 'bg-sky-500/[0.06] border-sky-500/25' : 'bg-white/[0.03] border-white/8'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={12} className={published ? 'text-sky-400' : 'text-white/40'} />
          <span className={`text-[9px] font-black uppercase tracking-widest ${published ? 'text-sky-400' : 'text-white/50'}`}>
            {published ? 'Community context' : note.score.effectiveStatus === 'NOT_HELPFUL' ? 'Rated not helpful' : 'Proposed context — rating in progress'}
          </span>
        </div>
        <StatusTimeline note={note} />
      </div>

      {note.claim && (
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
          On the claim: <span className="text-white/55 normal-case font-bold tracking-normal">“{note.claim}”</span>
        </p>
      )}

      <p className="text-[12px] text-white/80 leading-relaxed">{note.summary}</p>

      <div className="flex flex-wrap gap-1.5">
        {note.sources.map((src, i) => {
          let domain = src; try { domain = new URL(src).hostname.replace(/^www\./, ''); } catch {}
          return (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-sky-400/40 transition-all">
              <ExternalLink size={8} /> {domain}
            </a>
          );
        })}
      </div>

      {/* Author response — the post author's public recourse */}
      {note.authorResponse && (
        <div className="p-3 rounded-xl bg-white/[0.04] border-l-2 border-[#FF8C00]/50">
          <p className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00]/80 mb-1">Post author's response</p>
          <p className="text-[11px] text-white/65 leading-relaxed">{note.authorResponse.text}</p>
        </div>
      )}
      {isPostAuthor && published && !note.authorResponse && (
        <div>
          {showRespond ? (
            <div className="space-y-2">
              <textarea value={responseDraft} onChange={e => setResponseDraft(e.target.value)} maxLength={600}
                placeholder="Your public response to this note (one per note)…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF8C00]/50 min-h-16" />
              <button
                onClick={async () => { if (await respondToNote(note.id, responseDraft)) { setShowRespond(false); onRated(); } }}
                className="px-3 py-1.5 rounded-full bg-[#FF8C00] text-black text-[8px] font-black uppercase tracking-widest">
                Post response
              </button>
            </div>
          ) : (
            <button onClick={() => setShowRespond(true)}
              className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/35 hover:text-[#FF8C00] transition-colors">
              <MessageCircle size={9} /> Respond as post author
            </button>
          )}
        </div>
      )}

      {/* Transparent score breakdown */}
      <button onClick={() => setShowScore(s => !s)}
        className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
        <Scale size={9} /> Why {published ? 'is this shown' : 'isn’t this shown yet'}?
        {showScore ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>
      {showScore && (
        <div className="p-3 rounded-xl bg-black/30 border border-white/8 space-y-1.5">
          <p className="text-[10px] text-white/60 leading-relaxed">{note.score.explanation}</p>
          <div className="flex gap-4 text-[8px] font-black uppercase tracking-widest text-white/35">
            <span>{note.score.ratings} ratings</span>
            <span>{Math.round(note.score.helpfulPct * 100)}% helpful</span>
            {note.score.clusterA.count >= 2 && note.score.clusterB.count >= 2 && (
              <span className={note.score.bridged ? 'text-emerald-400' : 'text-amber-400'}>
                perspectives: {Math.round(note.score.clusterA.helpfulPct * 100)}% / {Math.round(note.score.clusterB.helpfulPct * 100)}%
              </span>
            )}
          </div>
          <p className="text-[8px] text-white/25 leading-relaxed">
            Notes publish when rated helpful by people who usually disagree — not by volume alone. Scoring is computed from public ratings; anyone can verify it.
          </p>
        </div>
      )}

      {/* Rating workflow */}
      {canRate && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Is this note helpful context?</p>
          <div className="flex gap-1.5">
            {([
              { v: 'HELPFUL' as HelpfulVote, icon: ThumbsUp, label: 'Helpful' },
              { v: 'SOMEWHAT' as HelpfulVote, icon: Minus, label: 'Somewhat' },
              { v: 'NOT_HELPFUL' as HelpfulVote, icon: ThumbsDown, label: 'Not helpful' },
            ]).map(({ v, icon: Icon, label }) => (
              <button key={v} onClick={() => setRating(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
                  rating === v ? 'bg-sky-500 text-black border-sky-500' : 'bg-white/5 border-white/10 text-white/45 hover:text-white'}`}>
                <Icon size={9} /> {label}
              </button>
            ))}
          </div>
          {rating && (
            <>
              <div className="flex flex-wrap gap-1">
                {RATE_REASONS.filter(r => (rating === 'NOT_HELPFUL') !== r.positive).map(r => (
                  <button key={r.id}
                    onClick={() => setReasons(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                    className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest border transition-all ${
                      reasons.includes(r.id) ? 'bg-white/15 border-white/30 text-white' : 'bg-white/[0.03] border-white/8 text-white/35'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
              <button onClick={submitRating} disabled={submitting}
                className="px-4 py-2 rounded-full bg-sky-500 text-black text-[9px] font-black uppercase tracking-widest hover:bg-sky-400 transition-colors disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Submit rating'}
              </button>
            </>
          )}
        </div>
      )}
      {rated && (
        <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">✓ Rating recorded — thank you</p>
      )}
    </div>
  );
};

// ─── Note composer ───────────────────────────────────────────────────────────

const NoteComposer: React.FC<{
  contentId: string;
  contentType: CommunityNote['contentType'];
  onDone: () => void;
  onCancel: () => void;
}> = ({ contentId, contentType, onDone, onCancel }) => {
  const [claim, setClaim] = useState('');
  const [summary, setSummary] = useState('');
  const [sources, setSources] = useState(['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    const validSources = sources.map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
    if (summary.trim().length < 30) { setError('Summaries need at least 30 characters of substance.'); return; }
    if (!validSources.length) { setError('At least one source link (https://…) is required.'); return; }
    setSubmitting(true);
    const id = await proposeNote({ contentId, contentType, claim, summary, sources: validSources });
    setSubmitting(false);
    if (id) onDone();
    else setError('Could not submit — check you are signed in and enrolled.');
  };

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-sky-500/25 space-y-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-sky-400">Propose context</p>
      <input value={claim} onChange={e => setClaim(e.target.value)} maxLength={200}
        placeholder="Which specific claim does this address?"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-sky-400/50" />
      <textarea value={summary} onChange={e => setSummary(e.target.value)} maxLength={1200}
        placeholder="Neutral, factual context a reader should know. No opinions — describe what the sources show."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-sky-400/50 min-h-24" />
      <div className="space-y-1.5">
        {sources.map((s, i) => (
          <div key={i} className="flex gap-1.5">
            <input value={s} onChange={e => setSources(prev => prev.map((x, j) => j === i ? e.target.value : x))}
              placeholder="https://source-anyone-can-check.example"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-sky-400/50" />
            {sources.length > 1 && (
              <button onClick={() => setSources(prev => prev.filter((_, j) => j !== i))} className="px-2 text-white/30 hover:text-white"><X size={12} /></button>
            )}
          </div>
        ))}
        <button onClick={() => setSources(prev => [...prev, ''])}
          className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/35 hover:text-sky-400 transition-colors">
          <Plus size={9} /> Add source
        </button>
      </div>
      {error && <p className="text-[9px] text-red-400 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting}
          className="px-4 py-2 rounded-full bg-sky-500 text-black text-[9px] font-black uppercase tracking-widest hover:bg-sky-400 transition-colors disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit for rating'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/45 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Contributor enrollment ──────────────────────────────────────────────────

const EnrollGate: React.FC<{ onEnrolled: () => void }> = ({ onEnrolled }) => {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={13} className="text-sky-400" />
        <p className="text-[10px] font-black uppercase tracking-widest">Become a Notes contributor</p>
      </div>
      <p className="text-[10px] text-white/45 leading-relaxed">
        Contributors add context to posts and rate others' notes. Enrollment is instant — agree to the guidelines and start.
      </p>
      <ul className="space-y-1">
        {CONTRIBUTOR_GUIDELINES.map((g, i) => (
          <li key={i} className="text-[9px] text-white/50 leading-relaxed flex gap-2"><span className="text-sky-400">•</span>{g}</li>
        ))}
      </ul>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="accent-sky-500" />
        <span className="text-[9px] font-bold text-white/60">I agree to the contributor guidelines</span>
      </label>
      <button disabled={!agreed || busy}
        onClick={async () => { setBusy(true); if (await enrollContributor()) onEnrolled(); setBusy(false); }}
        className="px-4 py-2 rounded-full bg-sky-500 text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-40 hover:bg-sky-400 transition-colors">
        {busy ? 'Enrolling…' : 'Start contributing'}
      </button>
    </div>
  );
};

// ─── Panel: all notes on a piece of content ──────────────────────────────────

export const CommunityNotesPanel: React.FC<{
  contentId: string;
  contentType?: CommunityNote['contentType'];
  postAuthorId?: string;
  onClose: () => void;
}> = ({ contentId, contentType = 'post', postAuthorId, onClose }) => {
  const [notes, setNotes] = useState<ScoredNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [contributor, setContributor] = useState<boolean | null>(null);

  const reload = useCallback(() => {
    fetchNotesForContent(contentId).then(n => { setNotes(n); setLoading(false); });
  }, [contentId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { isContributor().then(setContributor); }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-sky-400" />
          <p className="text-[10px] font-black uppercase tracking-widest">Community Notes</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10"><X size={13} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          {notes.length === 0 && !composing && (
            <p className="text-[10px] text-white/35 text-center py-4">No context notes on this yet.</p>
          )}
          <div className="space-y-2.5">
            {notes.map(n => <NoteCard key={n.id} note={n} postAuthorId={postAuthorId} onRated={reload} />)}
          </div>

          {composing ? (
            <NoteComposer contentId={contentId} contentType={contentType}
              onDone={() => { setComposing(false); reload(); }} onCancel={() => setComposing(false)} />
          ) : contributor === false ? (
            <EnrollGate onEnrolled={() => setContributor(true)} />
          ) : contributor && (
            <button onClick={() => setComposing(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-sky-500/10 border border-sky-500/30 text-[9px] font-black uppercase tracking-widest text-sky-400 hover:bg-sky-500/20 transition-colors">
              <Plus size={10} /> Propose context
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ─── Badge: drop-in for post cards ───────────────────────────────────────────

export const CommunityNoteBadge: React.FC<{
  contentId: string;
  contentType?: CommunityNote['contentType'];
  postAuthorId?: string;
}> = ({ contentId, contentType = 'post', postAuthorId }) => {
  const [notes, setNotes] = useState<ScoredNote[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchNotesForContent(contentId).then(n => { if (mounted) { setNotes(n); setLoaded(true); } });
    return () => { mounted = false; };
  }, [contentId]);

  if (!loaded) return null;

  const published = notes.find(n => n.score.effectiveStatus === 'PUBLISHED');
  const pending = notes.filter(n => n.score.effectiveStatus === 'NEEDS_RATINGS');

  return (
    <div className="mt-2" onClick={e => e.stopPropagation()}>
      {/* Published note: shown inline, like a banner readers can't miss */}
      {published && !open && (
        <button onClick={() => setOpen(true)}
          className="w-full text-left p-3 rounded-2xl bg-sky-500/[0.07] border border-sky-500/30 hover:border-sky-400/50 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={11} className="text-sky-400" />
            <span className="text-[8px] font-black uppercase tracking-widest text-sky-400">Readers added context</span>
          </div>
          <p className="text-[11px] text-white/75 leading-relaxed line-clamp-3">{published.summary}</p>
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mt-1.5">Tap for sources, ratings & responses</p>
        </button>
      )}

      {/* Pending: the speed fix — visible the moment review starts */}
      {!published && pending.length > 0 && !open && (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-all">
          <Clock size={9} /> Context proposed — rating in progress
        </button>
      )}

      {/* No notes: quiet entry point */}
      {!published && pending.length === 0 && !open && (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-sky-400 transition-colors">
          <FileText size={9} /> Add context
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <CommunityNotesPanel contentId={contentId} contentType={contentType} postAuthorId={postAuthorId} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CommunityNoteBadge;

// PartyPolls — the poll card everyone answers, and the host's composer (polls + multi-question surveys).
// Auto "how was that song?" polls render through the same card; they just carry a song chip.

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Plus, Send, Star, X } from 'lucide-react';
import {
  PartyPoll, PartyVote, POLL_OPTION_MAX, POLL_QUESTION_MAX, POLL_TEXT_ANSWER_MAX, RATING_MAX, normalizePollDraft, tallyPoll,
  type PollDraft, type PollKind,
} from '../../services/partyEngagement';
import { PartyMoment, castPollVote, closePartyPoll, createPartyPoll, listenPollVotes } from '../../services/partyService';
import { auth } from '../../services/backendService';
import { partyToast } from './partyToast';

// ── The card ──────────────────────────────────────────────────────────────────────────────────────

export const PartyPollCard: React.FC<{
  partyId: string;
  poll: PartyPoll;
  canHost: boolean;
  getMoment: () => PartyMoment;
}> = ({ partyId, poll, canHost, getMoment }) => {
  const me = auth.currentUser?.uid || null;
  const [votes, setVotes] = useState<PartyVote[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => listenPollVotes(partyId, poll.id, setVotes), [partyId, poll.id]);

  const mine = useMemo(() => votes.find(v => v.uid === me) || null, [votes, me]);
  const tally = useMemo(() => tallyPoll(poll, votes), [poll, votes]);
  // Results are live for everyone while the party runs — you watch the room's answers land.
  const showResults = true;

  const vote = async (value: string | number) => {
    if (!me) { partyToast('Sign in to vote', 'info'); return; }
    setBusy(true);
    const ok = await castPollVote(partyId, poll, value, getMoment());
    setBusy(false);
    if (!ok) partyToast('Vote not sent', 'warn');
  };

  return (
    <div className="rounded-2xl p-3 text-white" style={{ background: 'linear-gradient(135deg, rgba(212,0,85,0.22), rgba(255,140,0,0.12))', border: '1px solid rgba(255,255,255,0.14)' }}>
      <div className="flex items-start gap-2">
        <BarChart3 size={14} className="mt-0.5 shrink-0 text-white/70" />
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-white/55">
            {poll.auto ? 'Quick poll' : poll.kind === 'text' ? 'Question' : 'Poll'}{poll.trackTitle && poll.auto ? ` · ${poll.trackTitle}` : ''}
          </div>
          <div className="text-sm font-bold leading-snug break-words">{poll.question}</div>
        </div>
        {canHost && !poll.closed && (
          <button onClick={() => closePartyPoll(partyId, poll.id)} aria-label="Close poll" title="Close poll" className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10"><X size={14} /></button>
        )}
      </div>

      {poll.kind === 'choice' && (
        <div className="mt-2 space-y-1.5">
          {(poll.options || []).map(o => {
            const n = tally.counts[o.id] || 0;
            const pct = tally.total ? Math.round((n / tally.total) * 100) : 0;
            const picked = mine?.value === o.id;
            return (
              <button key={o.id} disabled={busy || !!poll.closed} onClick={() => vote(o.id)}
                className={`relative w-full overflow-hidden rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${picked ? 'ring-2 ring-white/70' : 'hover:bg-white/10'}`}
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                {showResults && <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: 'rgba(255,255,255,0.16)', transition: 'width 400ms ease' }} aria-hidden />}
                <span className="relative flex items-center justify-between gap-2"><span className="break-words">{o.label}</span>{showResults && <span className="text-white/70 tabular-nums">{pct}%</span>}</span>
              </button>
            );
          })}
        </div>
      )}

      {poll.kind === 'rating' && (
        <div className="mt-2">
          <div className="flex items-center gap-1" role="group" aria-label="Rating">
            {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map(n => {
              const on = typeof mine?.value === 'number' && n <= (mine.value as number);
              return (
                <button key={n} disabled={busy || !!poll.closed} onClick={() => vote(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  className="p-1 rounded-lg active:scale-90 transition-transform hover:bg-white/10">
                  <Star size={26} className={on ? 'text-amber-300 fill-amber-300' : 'text-white/55'} />
                </button>
              );
            })}
            {showResults && tally.total > 0 && (
              <span className="ml-2 text-xs font-bold text-white/80 tabular-nums">{tally.avg?.toFixed(1)}★ <span className="text-white/50">· {tally.total}</span></span>
            )}
          </div>
        </div>
      )}

      {poll.kind === 'text' && (
        <div className="mt-2">
          {!mine && !poll.closed ? (
            <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); const t = draft.trim(); if (t) vote(t).then(() => setDraft('')); }}>
              <input value={draft} onChange={e => setDraft(e.target.value.slice(0, POLL_TEXT_ANSWER_MAX))} placeholder="Your answer"
                className="flex-1 min-w-0 bg-white/10 rounded-full px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:ring-2 ring-white/20" />
              <button type="submit" disabled={!draft.trim() || busy} className="p-2 rounded-full disabled:opacity-40" style={{ background: 'var(--pj-magenta)' }} aria-label="Send answer"><Send size={12} /></button>
            </form>
          ) : (
            <p className="text-xs text-white/70">{mine ? 'Thanks — your answer is in.' : 'Closed.'}</p>
          )}
          {canHost && !!tally.answers?.length && (
            <ul className="mt-2 max-h-28 overflow-y-auto space-y-1">
              {tally.answers.slice(0, 20).map((a, i) => <li key={i} className="text-xs text-white/85 bg-white/[0.07] rounded-lg px-2.5 py-1.5 break-words">{a}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="mt-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40">
        {tally.total} {tally.total === 1 ? 'answer' : 'answers'}{poll.closed ? ' · closed' : poll.auto ? ' · open into the next song' : ''}
      </div>
    </div>
  );
};

// ── The host's composer ───────────────────────────────────────────────────────────────────────────

interface Q { kind: PollKind; question: string; options: string[] }
const blankQ = (kind: PollKind = 'choice'): Q => ({ kind, question: '', options: ['', ''] });

export const PartyPollComposer: React.FC<{
  partyId: string;
  getMoment: () => PartyMoment;
  trackTitle?: string;
  onClose: () => void;
}> = ({ partyId, getMoment, trackTitle, onClose }) => {
  const [qs, setQs] = useState<Q[]>([blankQ()]);
  const [sending, setSending] = useState(false);
  const [expires, setExpires] = useState<number>(0);
  const set = (i: number, patch: Partial<Q>) => setQs(a => a.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const drafts: PollDraft[] = qs.map(q => ({ kind: q.kind, question: q.question, options: q.options, expiresInSec: expires || undefined }));
  const ready = drafts.map(normalizePollDraft);
  const canSend = ready.length > 0 && ready.every(Boolean);

  const send = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !canSend) return;
    setSending(true);
    const m = getMoment();
    const now = Date.now();
    try {
      await Promise.all(ready.map((p, i) => createPartyPoll(partyId, {
        id: `p_${now}_${i}`, kind: p!.kind, question: p!.question, options: p!.options,
        trackId: m.trackId, trackTitle: trackTitle || undefined,
        createdBy: uid, createdAt: now + i,
        expiresAt: p!.expiresInSec ? now + p!.expiresInSec * 1000 : undefined,
      })));
      partyToast(qs.length > 1 ? `Survey sent · ${qs.length} questions` : 'Poll sent', 'good');
      onClose();
    } catch { partyToast('Could not send — try again', 'warn'); }
    setSending(false);
  };

  return (
    <div className="rounded-2xl p-3 text-white space-y-3" style={{ background: '#15151F', border: '1px solid rgba(255,255,255,0.14)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/70">{qs.length > 1 ? `Survey · ${qs.length} questions` : 'New poll'}</span>
        <button onClick={onClose} aria-label="Cancel" className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10"><X size={14} /></button>
      </div>
      {qs.map((q, i) => (
        <div key={i} className="space-y-2 pb-3 border-b border-white/10 last:border-0 last:pb-0">
          <div className="flex items-center gap-1.5">
            {(['choice', 'rating', 'text'] as PollKind[]).map(k => (
              <button key={k} onClick={() => set(i, { kind: k })}
                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${q.kind === k ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                {k === 'choice' ? 'Choices' : k === 'rating' ? 'Stars' : 'Open'}
              </button>
            ))}
            {qs.length > 1 && <button onClick={() => setQs(a => a.filter((_, j) => j !== i))} aria-label="Remove question" className="ml-auto p-1 text-white/50 hover:text-white"><X size={12} /></button>}
          </div>
          <input value={q.question} onChange={e => set(i, { question: e.target.value.slice(0, POLL_QUESTION_MAX) })}
            placeholder={q.kind === 'text' ? 'Ask the room anything' : q.kind === 'rating' ? 'What should they rate?' : 'What do you want to ask?'}
            className="w-full bg-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 ring-white/20" />
          {q.kind === 'choice' && (
            <div className="space-y-1.5">
              {q.options.map((o, oi) => (
                <input key={oi} value={o} onChange={e => set(i, { options: q.options.map((x, xi) => (xi === oi ? e.target.value.slice(0, POLL_OPTION_MAX) : x)) })}
                  placeholder={`Option ${oi + 1}`}
                  className="w-full bg-white/[0.07] rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:ring-2 ring-white/20" />
              ))}
              {q.options.length < 6 && (
                <button onClick={() => set(i, { options: [...q.options, ''] })} className="text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white inline-flex items-center gap-1"><Plus size={11} /> Option</button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setQs(a => [...a, blankQ()])} disabled={qs.length >= 8}
          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1 disabled:opacity-40"><Plus size={11} /> Add question</button>
        <select value={expires} onChange={e => setExpires(Number(e.target.value))} aria-label="Close automatically"
          className="bg-white/10 rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white outline-none">
          <option value={0} className="text-black">Until I close</option>
          <option value={60} className="text-black">1 min</option>
          <option value={180} className="text-black">3 min</option>
          <option value={600} className="text-black">10 min</option>
        </select>
        <button onClick={send} disabled={!canSend || sending}
          className="ml-auto px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40 inline-flex items-center gap-1.5" style={{ background: 'var(--pj-grad-brand)' }}>
          <Send size={12} /> {sending ? 'Sending…' : qs.length > 1 ? 'Send survey' : 'Send poll'}
        </button>
      </div>
    </div>
  );
};

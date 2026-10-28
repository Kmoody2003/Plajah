// AnnouncementCard — one announcement in a feed: the post, its living flyer, a poll people vote in
// and a survey they fill out. Authors and managers see tallies, responses and a CSV download.
import React, { useEffect, useMemo, useState } from 'react';
import {
  deleteAnnouncement, flyerFromAnnouncement, listResponses, myResponse, respond, setAnnouncementPinned, surveyCsv, tally,
  ANNOUNCEMENTS_CHANGED, type Announcement, type AnnouncementResponse,
} from '../../services/announcements/announcementService';
import { saveTelaDoc, newTelaId } from '../../services/telaStore';
import FlyerView from './FlyerView';

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
const AUD_LABEL = { class: 'Class', members: 'Members', public: 'Public' } as const;

export default function AnnouncementCard({ a, viewer, canManage, returnLabel }: { a: Announcement; viewer: { uid: string; name: string }; canManage: boolean; returnLabel?: string }) {
  const flyer = useMemo(() => flyerFromAnnouncement(a), [a]);
  const [responses, setResponses] = useState<AnnouncementResponse[]>([]);
  const mine = myResponse(a.id, viewer.uid, responses);
  const isAuthor = a.authorUid === viewer.uid;
  const manage = canManage || isAuthor;
  const needResponses = !!(a.poll || a.survey);

  useEffect(() => {
    if (!needResponses) return;
    let live = true;
    const load = () => void listResponses(a.id).then(r => { if (live) setResponses(r); });
    load();
    window.addEventListener(ANNOUNCEMENTS_CHANGED, load);
    return () => { live = false; window.removeEventListener(ANNOUNCEMENTS_CHANGED, load); };
  }, [a.id, needResponses]);

  const editCopy = async () => {
    if (!flyer) return;
    const copy = { ...flyer, id: newTelaId(), ownerId: viewer.uid, title: `${flyer.title} · Copy`, orgOrigin: { orgId: a.orgId, orgName: a.orgName }, createdAt: Date.now(), updatedAt: Date.now() };
    const r = await saveTelaDoc(copy);
    if (r.ok) window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: copy.id, returnTo: { label: returnLabel || a.programName || 'announcements', programId: a.programId } } }));
  };

  return (
    <article className={`ann ${a.pinned ? 'pin' : ''}`} aria-label={a.title || `Announcement from ${a.authorName}`}>
      <div className="row">
        <div className="av" aria-hidden>{initials(a.authorName)}</div>
        <div className="grow">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="who">{a.authorName}</span>
            {a.authorRole && <span className="tag key">{a.authorRole}</span>}
            {a.pinned && <span className="tag soon">Pinned</span>}
          </div>
          <div className="small">{ago(a.createdAt)} · {a.programName && a.audience === 'class' ? a.programName : AUD_LABEL[a.audience]}</div>
        </div>
        {manage && (
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn sm" onClick={() => void setAnnouncementPinned(a, !a.pinned)}>{a.pinned ? 'Unpin' : 'Pin'}</button>
            {flyer && <button type="button" className="btn sm" onClick={() => void editCopy()} title="Opens an editable copy in Tela">Edit copy</button>}
            {isAuthor && <button type="button" className="btn sm" onClick={() => { if (confirm('Delete this announcement for everyone?')) void deleteAnnouncement(a.id); }}>Delete</button>}
          </div>
        )}
      </div>

      {a.text && <p className="txt">{a.text}</p>}
      {flyer && <FlyerView doc={flyer} ctaUrl={a.ctaUrl} maxWidth={flyer.frames[0]?.w === 816 ? 620 : 520} label={a.title} />}
      {a.poll && <PollBlock a={a} responses={responses} mine={mine} viewer={viewer} manage={manage} />}
      {a.survey && <SurveyBlock a={a} responses={responses} mine={mine} viewer={viewer} manage={manage} />}
    </article>
  );
}

function PollBlock({ a, responses, mine, viewer, manage }: { a: Announcement; responses: AnnouncementResponse[]; mine?: AnnouncementResponse; viewer: { uid: string; name: string }; manage: boolean }) {
  const poll = a.poll!;
  const [pick, setPick] = useState<number[]>(mine?.choices || []);
  useEffect(() => { if (mine?.choices) setPick(mine.choices); }, [mine?.choices]);
  const voted = !!mine?.choices?.length;
  const closed = !!poll.closesAt && poll.closesAt < Date.now();
  const show = (voted || closed) && (poll.showResults !== false || manage) || manage;
  const { counts, voters } = tally(poll, responses);
  const toggle = (i: number) => setPick(p => (poll.multi ? (p.includes(i) ? p.filter(x => x !== i) : [...p, i]) : [i]));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row"><span className="eyebrow grow">Poll</span><span className="small">{voters} {voters === 1 ? 'vote' : 'votes'}{poll.multi ? ' · pick any' : ''}</span></div>
      <div className="t" style={{ fontFamily: 'var(--fd)', fontWeight: 800 }}>{poll.question}</div>
      {poll.options.map((o, i) => {
        const pct = voters ? Math.round((counts[i] / voters) * 100) : 0;
        return (
          <button key={i} type="button" className="opt" aria-pressed={pick.includes(i)} disabled={closed} onClick={() => toggle(i)}>
            {show && <span className="bar" style={{ width: `${pct}%` }} aria-hidden />}
            <span>{o}</span>
            {show && <span className="pct">{pct}% · {counts[i]}</span>}
          </button>
        );
      })}
      {!closed && (
        <div className="row">
          <button type="button" className="btn sm p" disabled={!pick.length || (voted && JSON.stringify(pick) === JSON.stringify(mine?.choices))} onClick={() => void respond(a, { uid: viewer.uid, name: viewer.name, choices: pick, answers: mine?.answers })}>{voted ? 'Change vote' : 'Vote'}</button>
          {voted && !show && <span className="small">Thanks, your vote is in.</span>}
        </div>
      )}
    </div>
  );
}

function SurveyBlock({ a, responses, mine, viewer, manage }: { a: Announcement; responses: AnnouncementResponse[]; mine?: AnnouncementResponse; viewer: { uid: string; name: string }; manage: boolean }) {
  const s = a.survey!;
  const [open, setOpen] = useState(false);
  const [ans, setAns] = useState<Record<string, string | number>>(mine?.answers || {});
  const done = !!mine?.answers;
  const answered = responses.filter(r => r.answers).length;
  const missing = s.questions.filter(q => q.required && (ans[q.id] === undefined || ans[q.id] === ''));
  const download = () => {
    const blob = new Blob([surveyCsv(a, responses)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const el = document.createElement('a');
    el.href = url; el.download = `${(s.title || a.title || 'survey').replace(/[^\w-]+/g, '_')}.csv`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="card" style={{ background: 'var(--g1)' }}>
      <div className="row wrap">
        <div className="grow"><div className="eyebrow">Survey{s.anonymous ? ' · anonymous' : ''}</div><div className="t">{s.title || `${s.questions.length} ${s.questions.length === 1 ? 'question' : 'questions'}`}</div></div>
        {manage && <span className="small">{answered} {answered === 1 ? 'response' : 'responses'}</span>}
        {manage && answered > 0 && <button type="button" className="btn sm" onClick={download}>Download CSV</button>}
        {!open && <button type="button" className={`btn sm ${done ? '' : 'p'}`} onClick={() => setOpen(true)}>{done ? 'Edit my answers' : 'Fill it out'}</button>}
      </div>
      {manage && answered > 0 && <SurveySummary a={a} responses={responses} />}
      {open && (
        <form className="stack" onSubmit={e => { e.preventDefault(); if (missing.length) return; void respond(a, { uid: viewer.uid, name: viewer.name, answers: ans, choices: mine?.choices }).then(() => setOpen(false)); }}>
          {s.questions.map(q => (
            <label key={q.id} className="lbl">{q.prompt}{q.required ? ' *' : ''}
              {q.type === 'short' && <input className="field" value={String(ans[q.id] ?? '')} maxLength={300} onChange={e => setAns(x => ({ ...x, [q.id]: e.target.value }))} />}
              {q.type === 'long' && <textarea className="field" rows={3} value={String(ans[q.id] ?? '')} maxLength={2000} onChange={e => setAns(x => ({ ...x, [q.id]: e.target.value }))} />}
              {q.type === 'choice' && <span className="chips">{(q.options || []).map(o => <button key={o} type="button" className="chip" aria-pressed={ans[q.id] === o} onClick={() => setAns(x => ({ ...x, [q.id]: o }))}>{o}</button>)}</span>}
              {q.type === 'scale' && <span className="chips">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className="chip" aria-pressed={ans[q.id] === n} onClick={() => setAns(x => ({ ...x, [q.id]: n }))}>{n}</button>)}</span>}
            </label>
          ))}
          <div className="row"><button type="submit" className="btn sm p" disabled={!!missing.length}>{done ? 'Update answers' : 'Send answers'}</button><button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {done && !open && <span className="small">Thanks, your answers are in.</span>}
    </div>
  );
}

function SurveySummary({ a, responses }: { a: Announcement; responses: AnnouncementResponse[] }) {
  const rows = (a.survey?.questions || []).filter(q => q.type === 'choice' || q.type === 'scale').map(q => {
    const vals = responses.map(r => r.answers?.[q.id]).filter(v => v !== undefined && v !== '');
    if (q.type === 'scale') { const nums = vals.map(Number).filter(n => !Number.isNaN(n)); return { q, line: nums.length ? `Average ${(nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1)} of 5` : 'No answers yet' }; }
    const counts = new Map<string, number>(); for (const v of vals) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
    return { q, line: [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || 'No answers yet' };
  });
  if (!rows.length) return null;
  return <div className="stack" style={{ gap: 4 }}>{rows.map(r => <div key={r.q.id} className="small"><b style={{ color: 'var(--dim)' }}>{r.q.prompt}</b> — {r.line}</div>)}</div>;
}

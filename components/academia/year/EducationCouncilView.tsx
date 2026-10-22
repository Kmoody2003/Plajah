// Education Council — the roster of seats, convening the council on a worksheet or a question, the deliberation
// transcript (with the lane each voice actually ran on), and the Commons where human educators propose and vote.
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Landmark, Users, Vote as VoteIcon, Loader2, X, Check, GitFork } from 'lucide-react';
import type { DayLesson, Worksheet } from '../../../services/yearCurriculum/types';
import { COUNCIL_SEATS, SEAT_KIND_LABEL, seatById, type SeatKind } from '../../../services/educationCouncil/members';
import { convene, TASK_LABEL, type CouncilSession, type CouncilTask } from '../../../services/educationCouncil/deliberate';
import { defaultSeats, FIX_LABEL } from '../../../services/educationCouncil/heuristics';
import { listProposals, loadMember, joinCommons, propose, castVote, tally, QUORUM, ROLE_LABEL, KIND_LABEL, type CommonsMember, type Proposal, type MemberRole, type ProposalKind, type Vote } from '../../../services/educationCouncil/commons';

interface Props { embedded?: boolean; worksheet?: Worksheet; lesson?: DayLesson; onClose?: () => void; onBack?: () => void; onApply?: (s: CouncilSession) => void }

const LANE_LABEL: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', local: 'On-device', heuristic: 'Rules' };
const LANE_COLOR: Record<string, string> = { claude: '#D97757', gemini: '#4F8DF5', local: '#06D6A0', heuristic: '#9CA3AF' };

function Monogram({ id, size = 34 }: { id: string; size?: number }) {
  const s = seatById(id);
  return <span className="shrink-0 rounded-full grid place-items-center font-black text-white" style={{ width: size, height: size, background: s?.color || '#555', fontSize: size * 0.4 }}>{s?.name[0] || '?'}</span>;
}

export default function EducationCouncilView({ embedded, worksheet, lesson, onClose, onBack, onApply }: Props) {
  const [tab, setTab] = useState<'convene' | 'roster' | 'commons'>(worksheet ? 'convene' : 'roster');
  const [task, setTask] = useState<CouncilTask>(worksheet ? 'review-worksheet' : 'research');
  const [question, setQuestion] = useState('');
  const [seats, setSeats] = useState<string[]>(() => defaultSeats(worksheet || null, worksheet ? 'review-worksheet' : 'research'));
  const [offline, setOffline] = useState(false);
  const [session, setSession] = useState<CouncilSession | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true); setSession(null);
    try { setSession(await convene({ task, worksheet, lesson, question: question || undefined, seats, offline })); } finally { setRunning(false); }
  };

  const tabs: Array<[typeof tab, string, React.ReactNode]> = [['convene', 'Convene', <Landmark size={14} />], ['roster', 'Seats', <Users size={14} />], ['commons', 'Commons', <VoteIcon size={14} />]];

  return (
    <div className={`${embedded ? '' : 'min-h-screen'} bg-[#0d0d14] text-white`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-10 bg-[#0d0d14]/95 backdrop-blur border-b border-white/10 px-5 py-3 flex items-center gap-3">
        {onBack && !embedded && <button type="button" onClick={onBack} aria-label="Back" className="p-2 rounded-full hover:bg-white/10"><ArrowLeft size={18} /></button>}
        <div>
          <div className="text-[11px] tracking-[0.14em] uppercase text-[#c4b5fd] font-bold">Plajah Academia</div>
          <h1 className="text-[19px] font-black" style={{ fontFamily: 'Outfit' }}>Education Council</h1>
        </div>
        <div className="ml-auto flex gap-1 rounded-full bg-white/[0.06] p-1">
          {tabs.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold inline-flex items-center gap-1.5 ${tab === id ? 'bg-white text-black' : 'text-white/75'}`}>{icon}{label}</button>)}
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/10"><X size={18} /></button>}
      </header>

      <div className="p-5 max-w-[1100px] mx-auto">
        {tab === 'roster' && <Roster />}

        {tab === 'convene' && (
          <div className="space-y-5">
            <p className="text-[13.5px] text-white/75 max-w-[720px]">Each seat reviews through its own lens on its own model lane — Claude for most seats, Gemini for research-minded ones, on-device for quick feasibility checks — and always starts from a rule-based review, so the council works offline too. The chair synthesises; you decide what to apply.</p>
            {worksheet && <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px]"><span className="text-white/55">On the table:</span> <b>{worksheet.title}</b> · {worksheet.kicker}</div>}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TASK_LABEL) as CouncilTask[]).filter(t => worksheet || t === 'research' || t === 'design-unit').map(t => (
                <button key={t} type="button" onClick={() => { setTask(t); setSeats(defaultSeats(worksheet || null, t)); }} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border ${task === t ? 'bg-[#c4b5fd] text-black border-[#c4b5fd]' : 'border-white/15'}`}>{TASK_LABEL[t]}</button>
              ))}
            </div>
            <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3} placeholder={worksheet ? 'Anything the council should weigh? (optional) e.g. “Half my class are newcomers to English.”' : 'Ask the council, e.g. “How should we sequence fractions so struggling Grade 4 readers aren’t locked out by the word problems?”'} className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[13.5px]" />
            <div>
              <div className="text-[12px] text-white/55 mb-2">Seats convened ({seats.length})</div>
              <div className="flex flex-wrap gap-2">
                {COUNCIL_SEATS.map(s => {
                  const on = seats.includes(s.id);
                  return <button key={s.id} type="button" onClick={() => setSeats(xs => (on ? xs.filter(x => x !== s.id) : [...xs, s.id]))} className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-[12px] ${on ? 'border-white/40 bg-white/10' : 'border-white/10 opacity-55'}`}><Monogram id={s.id} size={22} />{s.title}</button>;
                })}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" onClick={run} disabled={running || !seats.length} className="px-5 py-2.5 rounded-full font-bold bg-[#c4b5fd] text-black inline-flex items-center gap-2 disabled:opacity-50">{running ? <><Loader2 size={16} className="animate-spin" />The council is deliberating…</> : <><Landmark size={16} />Convene</>}</button>
              <label className="text-[12.5px] text-white/70 inline-flex items-center gap-2"><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)} />Rules only (no models, nothing leaves the device)</label>
            </div>
            {session && <SessionView s={session} onApply={onApply} />}
          </div>
        )}

        {tab === 'commons' && <Commons session={session} worksheet={worksheet} />}
      </div>
    </div>
  );
}

function Roster() {
  const kinds = Object.keys(SEAT_KIND_LABEL) as SeatKind[];
  return (
    <div className="space-y-6">
      <p className="text-[13.5px] text-white/75 max-w-[760px]">Every seat is a lens drawn from a real profession and teaching tradition — modelled on the role, never on a named person. Human educators join through the Commons, where their votes adopt curriculum changes.</p>
      {kinds.map(k => (
        <section key={k}>
          <h2 className="text-[12px] uppercase tracking-[0.12em] text-white/55 font-bold mb-2">{SEAT_KIND_LABEL[k]}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {COUNCIL_SEATS.filter(s => s.kind === k).map(s => (
              <article key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3"><Monogram id={s.id} /><div><div className="font-bold text-[14px]">{s.name} · {s.title}</div><div className="text-[12px] text-white/55">{s.region} · reasons on {LANE_LABEL[s.lane]}</div></div></div>
                <p className="text-[12.5px] text-white/80 mt-2 italic">“{s.conviction}”</p>
                <p className="text-[12px] text-white/60 mt-1.5">{s.tradition}</p>
                <div className="flex flex-wrap gap-1 mt-2">{s.lens.map(l => <span key={l} className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.07]">{l}</span>)}</div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LaneBadge({ lane, model }: { lane: string; model?: string }) {
  return <span title={model} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${LANE_COLOR[lane]}26`, color: LANE_COLOR[lane] }}>{LANE_LABEL[lane] || lane}</span>;
}

function SessionView({ s, onApply }: { s: CouncilSession; onApply?: (s: CouncilSession) => void }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#c4b5fd]/40 bg-[#c4b5fd]/[0.07] p-4">
        <div className="flex items-center gap-2"><h3 className="font-black text-[15px]">Chair’s synthesis</h3><LaneBadge lane={s.synthesis.lane} model={s.synthesis.model} /><span className="ml-auto text-[12px] text-white/65">{s.synthesis.approve} approve · {s.synthesis.revise} revise</span></div>
        {s.offline && <p className="text-[11.5px] text-white/55 mt-1">Rules-only session: no model was reached, so these are the seats’ rule-based reviews.</p>}
        <p className="text-[13.5px] text-white/90 mt-2">{s.synthesis.summary}</p>
        {s.synthesis.agreements.length > 0 && <><div className="text-[11.5px] text-white/55 mt-3 font-semibold">Agreements</div><ul className="list-disc pl-5 text-[12.5px] text-white/80">{s.synthesis.agreements.map(a => <li key={a}>{a}</li>)}</ul></>}
        {s.synthesis.tensions.length > 0 && <><div className="text-[11.5px] text-white/55 mt-3 font-semibold">Where the council disagrees</div><ul className="list-disc pl-5 text-[12.5px] text-white/80">{s.synthesis.tensions.map(a => <li key={a}>{a}</li>)}</ul></>}
        {s.synthesis.decisions.length > 0 && <><div className="text-[11.5px] text-white/55 mt-3 font-semibold">Decisions</div><ul className="list-disc pl-5 text-[12.5px] text-white/80">{s.synthesis.decisions.map(a => <li key={a}>{a}</li>)}</ul></>}
        {onApply && s.synthesis.fixes.length > 0 && (
          <button type="button" onClick={() => onApply(s)} className="mt-3 px-4 py-2 rounded-full bg-[#c4b5fd] text-black text-[12.5px] font-bold inline-flex items-center gap-1.5"><Check size={14} />Apply {s.synthesis.fixes.length} fix{s.synthesis.fixes.length > 1 ? 'es' : ''}: {s.synthesis.fixes.map(f => FIX_LABEL[f].toLowerCase()).join('; ')}</button>
        )}
      </section>
      <div className="grid md:grid-cols-2 gap-3">
        {s.reviews.map(r => {
          const seat = seatById(r.seat)!;
          return (
            <article key={r.seat} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5"><Monogram id={r.seat} size={28} /><div className="flex-1"><div className="text-[13px] font-bold">{seat.name} · {seat.title}</div><div className="text-[11px] text-white/50">{seat.region}</div></div><LaneBadge lane={r.lane} model={r.model} /></div>
              <div className={`mt-2 text-[11px] font-black uppercase tracking-wide ${r.verdict === 'approve' ? 'text-[#06D6A0]' : 'text-[#F5B83D]'}`}>{r.verdict}</div>
              <ul className="mt-1 space-y-1 text-[12.5px] text-white/85">{r.notes.map(n => <li key={n}>{n}</li>)}</ul>
              {r.fixes.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{r.fixes.map(f => <span key={f} className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/[0.07]">{FIX_LABEL[f]}</span>)}</div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Commons({ session, worksheet }: { session: CouncilSession | null; worksheet?: Worksheet }) {
  const [member, setMember] = useState<CommonsMember | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [join, setJoin] = useState({ name: '', role: 'teacher' as MemberRole, region: '' });
  const [draft, setDraft] = useState({ kind: 'lesson-revision' as ProposalKind, title: '', body: '' });
  const [forkOf, setForkOf] = useState<string | undefined>();
  useEffect(() => { loadMember().then(setMember); listProposals().then(setProposals); }, []);

  const vote = async (p: Proposal, v: Vote) => {
    if (!member) return;
    const reason = v === 'block' ? window.prompt('A block needs a reason the author can act on:') || undefined : undefined;
    if (v === 'block' && !reason) return;
    const next = await castVote(member, p, v, reason);
    setProposals(ps => ps.map(x => (x.id === p.id ? next : x)));
  };

  return (
    <div className="space-y-5">
      <p className="text-[13.5px] text-white/75 max-w-[760px]">The Commons is how Plajah’s curriculum changes: any educator proposes, anyone can fork, and a proposal is adopted at <b>{QUORUM.approvals} approvals from {QUORUM.regions}+ regions</b> with no unresolved block. AI seats advise; people decide.</p>
      {!member ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 grid sm:grid-cols-4 gap-2 items-end">
          <label className="text-[12px] text-white/60 sm:col-span-1">Name<input value={join.name} onChange={e => setJoin({ ...join, name: e.target.value })} className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-[13px] text-white" /></label>
          <label className="text-[12px] text-white/60">Role<select value={join.role} onChange={e => setJoin({ ...join, role: e.target.value as MemberRole })} className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-[13px] text-white">{(Object.keys(ROLE_LABEL) as MemberRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
          <label className="text-[12px] text-white/60">Country / region<input value={join.region} onChange={e => setJoin({ ...join, region: e.target.value })} className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-[13px] text-white" /></label>
          <button type="button" disabled={!join.name || !join.region} onClick={async () => setMember(await joinCommons({ ...join, subjects: ['math', 'ela'], grades: [] }))} className="px-4 py-2 rounded-full bg-[#c4b5fd] text-black text-[13px] font-bold disabled:opacity-40">Join the Commons</button>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <div className="text-[12px] text-white/60">Signed in as <b className="text-white">{member.name}</b> · {ROLE_LABEL[member.role]} · {member.region}{member.verified ? ' · verified' : ' · verification pending'}</div>
          {forkOf && <div className="text-[12px] text-[#c4b5fd]">Forking {proposals.find(p => p.id === forkOf)?.title} · <button type="button" className="underline" onClick={() => setForkOf(undefined)}>cancel</button></div>}
          <div className="grid sm:grid-cols-[180px_1fr] gap-2">
            <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as ProposalKind })} className="rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-[13px] text-white">{(Object.keys(KIND_LABEL) as ProposalKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={worksheet ? `Proposal for “${worksheet.title}”` : 'Proposal title'} className="rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-[13px] text-white" />
          </div>
          <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={3} placeholder="What should change, why, and what evidence or classroom experience supports it?" className="w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-[13px] text-white" />
          <button type="button" disabled={!draft.title || !draft.body} onClick={async () => {
            const p = await propose(member, { ...draft, lessonId: worksheet?.lessonId, grade: worksheet?.grade, subject: worksheet?.subject, forkOf }, session || undefined);
            setProposals(ps => [p, ...ps]); setDraft({ ...draft, title: '', body: '' }); setForkOf(undefined);
          }} className="px-4 py-2 rounded-full bg-[#c4b5fd] text-black text-[13px] font-bold disabled:opacity-40">Propose{session ? ' (with council session attached)' : ''}</button>
        </section>
      )}
      <div className="space-y-3">
        {!proposals.length && <p className="text-[13px] text-white/55">No proposals yet. Be the first.</p>}
        {proposals.map(p => {
          const t = tally(p);
          const mine = member ? p.ballots?.[member.uid]?.vote : undefined;
          return (
            <article key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white/[0.08]">{KIND_LABEL[p.kind]}</span>
                {p.forkOf && <span className="text-[10.5px] text-white/55 inline-flex items-center gap-1"><GitFork size={11} />fork</span>}
                <h3 className="font-bold text-[14px]">{p.title}</h3>
                <span className={`ml-auto text-[11px] font-black uppercase ${p.status === 'adopted' ? 'text-[#06D6A0]' : p.status === 'declined' ? 'text-[#ff8aa3]' : 'text-[#F5B83D]'}`}>{p.status}</span>
              </div>
              <div className="text-[11.5px] text-white/50 mt-0.5">{p.authorName} · {ROLE_LABEL[p.authorRole]} · {p.authorRegion}{p.lessonId ? ` · ${p.lessonId}` : ''}</div>
              <p className="text-[13px] text-white/85 mt-2 whitespace-pre-wrap">{p.body}</p>
              {p.council && <p className="text-[12px] text-[#c4b5fd] mt-2">Council: {p.council.summary} ({p.council.approve}–{p.council.revise}; lanes {p.council.lanes.join(', ')})</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="h-2 w-40 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#06D6A0]" style={{ width: `${Math.min(100, (t.approvals / QUORUM.approvals) * 100)}%` }} /></div>
                <span className="text-[11.5px] text-white/65">{t.approvals}/{QUORUM.approvals} approvals · {t.regions}/{QUORUM.regions} regions{t.revise ? ` · ${t.revise} revise` : ''}{t.blocks ? ` · ${t.blocks} block` : ''}</span>
                {member && p.status === 'open' && (['approve', 'revise', 'block'] as Vote[]).map(v => (
                  <button key={v} type="button" onClick={() => vote(p, v)} className={`px-3 py-1 rounded-full text-[11.5px] font-bold border ${mine === v ? 'bg-white text-black' : 'border-white/20'}`}>{v}</button>
                ))}
                {member && <button type="button" onClick={() => { setForkOf(p.id); setDraft({ kind: p.kind, title: `Alternative: ${p.title}`, body: '' }); }} className="px-3 py-1 rounded-full text-[11.5px] border border-white/20 inline-flex items-center gap-1"><GitFork size={11} />Fork</button>}
              </div>
              {Object.values(p.ballots || {}).filter(b => b.reason).map(b => <p key={b.at} className="text-[11.5px] text-[#ff8aa3] mt-1">Block — {b.name} ({b.region}): {b.reason}</p>)}
            </article>
          );
        })}
      </div>
    </div>
  );
}

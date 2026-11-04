// OrgCrewPanel — the "Aria's Crew" section in Elevate ops. The owner, org admins and IT Admins hire crew
// members, teach Front Desk, and approve what the crew drafts. Every rule is enforced on the server
// (routes/crew.ts → services/crew/crewPolicy.ts); this panel only shows and asks.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, HelpCircle, Plus, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { crewApi, type DeskReply, type OfferedCrew, type OrgCrewView } from '../../services/crew/crewClient';
import { EV } from '../elevate/vellum';
import AriaMark from '../aria/AriaMark';

type FaqRow = { id?: string; q: string; a: string };

const CrewCard: React.FC<{ c: OfferedCrew; busy: boolean; onToggle: (on: boolean) => void; onOpen?: () => void }> = ({ c, busy, onToggle, onOpen }) => {
  const live = c.status === 'live';
  return (
    <article className="ev-panel p-4 flex flex-col gap-3" style={{ border: `1px solid ${c.hired ? EV.violet : EV.line}` }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold" style={{ color: EV.ink }}>{c.name}</h3>
          <p className="text-[12px] mt-0.5" style={{ color: EV.ink2 }}>{c.role}</p>
        </div>
        {live ? (
          <button type="button" role="switch" aria-checked={c.hired} aria-label={`${c.hired ? 'Let go' : 'Hire'} ${c.name}`} disabled={busy}
                  onClick={() => onToggle(!c.hired)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold disabled:opacity-50"
                  style={{ background: c.hired ? EV.violet : EV.raised, color: c.hired ? '#fff' : EV.ink2, border: `1px solid ${c.hired ? EV.violet : EV.line}` }}>
            {c.hired ? 'On the crew' : 'Hire'}
          </button>
        ) : (
          <span className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1" style={{ background: EV.raised, color: EV.muted }}>
            <Clock size={11} /> Coming
          </span>
        )}
      </header>
      <p className="text-[12px] leading-relaxed" style={{ color: EV.muted }}>{c.promise}</p>
      <ul className="text-[11px] space-y-1" style={{ color: EV.muted }}>
        {c.never.map(n => <li key={n} className="flex gap-1.5"><X size={12} className="shrink-0 mt-px" style={{ color: EV.warn }} />{n}</li>)}
      </ul>
      <footer className="flex items-center justify-between text-[10px] mt-auto pt-1" style={{ color: EV.muted }}>
        <span>{c.approval === 'person_approves' ? 'You approve everything it drafts' : c.model === 'none' ? 'Rules only, no AI' : 'Answers on its own, from your facts'}</span>
        {live && c.hired && onOpen ? <button type="button" onClick={onOpen} className="font-bold" style={{ color: EV.violetText }}>Open {c.home} →</button> : <span>{c.home}</span>}
      </footer>
    </article>
  );
};

/** Teach Front Desk: the FAQ it may tell visitors, the questions it could not answer, and a place to try it. */
const FrontDeskDesk: React.FC<{ orgId: string; view: OrgCrewView; onView: (v: OrgCrewView) => void }> = ({ orgId, view, onView }) => {
  const [rows, setRows] = useState<FaqRow[]>(view.faq);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [reply, setReply] = useState<DeskReply | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { setRows(view.faq); }, [view.faq]);
  const dirty = JSON.stringify(rows.map(r => [r.q, r.a])) !== JSON.stringify(view.faq.map(r => [r.q, r.a]));

  const save = async () => {
    setSaving(true); setMsg(null);
    try { onView(await crewApi.saveFaq(orgId, rows.filter(r => r.q.trim() || r.a.trim()))); setMsg('Saved. Front Desk uses these answers now.'); }
    catch (e: any) { setMsg(e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  const ask = async () => {
    if (q.trim().length < 2) return;
    setAsking(true); setReply(null);
    try {
      const r = await crewApi.ask(orgId, q.trim());
      setReply(r);
      // An unanswered question lands on the server's list; reload so it shows up above.
      if (r.unknown) crewApi.org(orgId).then(onView).catch(() => {});
    }
    catch (e: any) { setReply({ answer: e?.message || 'Front Desk could not answer.', from: [], unknown: true, by: 'rules' }); }
    finally { setAsking(false); }
  };

  return (
    <section className="ev-panel p-5 space-y-5" aria-labelledby="fd-teach">
      <div>
        <h3 id="fd-teach" className="text-[15px] font-bold" style={{ color: EV.ink }}>Teach Front Desk</h3>
        <p className="text-[12px] mt-1" style={{ color: EV.muted }}>
          It already knows your page: about, address, phone, hours and public groups. Add the questions people ask most.
          Anything you write here can be told to any visitor, so leave out anything private.
        </p>
      </div>

      {view.unanswered.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: EV.violetWash }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: EV.violetText }}><HelpCircle size={13} /> Visitors asked, Front Desk didn't know</p>
            <button type="button" className="text-[11px] font-bold" style={{ color: EV.muted }}
                    onClick={async () => onView(await crewApi.clearUnanswered(orgId))}>Clear</button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {view.unanswered.slice(0, 10).map(u => (
              <li key={u.q + u.at} className="flex items-center justify-between gap-3 text-[12px]" style={{ color: EV.ink2 }}>
                <span className="min-w-0 break-words">“{u.q}”</span>
                <button type="button" className="shrink-0 font-bold text-[11px]" style={{ color: EV.violetText }}
                        onClick={() => setRows(r => (r.some(x => x.q.toLowerCase() === u.q.toLowerCase()) ? r : [...r, { q: u.q, a: '' }]))}>
                  Answer it
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] items-start">
            <input aria-label={`Question ${i + 1}`} value={r.q} maxLength={200} placeholder="Question"
                   onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
                   className="rounded-lg px-3 py-2 text-[13px]" style={{ background: EV.raised, color: EV.ink, border: `1px solid ${EV.line}` }} />
            <textarea aria-label={`Answer ${i + 1}`} value={r.a} maxLength={1200} rows={2} placeholder="Answer"
                      onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
                      className="rounded-lg px-3 py-2 text-[13px]" style={{ background: EV.raised, color: EV.ink, border: `1px solid ${EV.line}` }} />
            <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                    className="p-2 rounded-lg" style={{ color: EV.muted }}><Trash2 size={14} /></button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setRows(r => [...r, { q: '', a: '' }])} className="text-[12px] font-bold inline-flex items-center gap-1" style={{ color: EV.violetText }}>
            <Plus size={13} /> Add a question
          </button>
          <button type="button" disabled={!dirty || saving} onClick={save}
                  className="ml-auto px-4 py-2 rounded-full text-[12px] font-bold text-white disabled:opacity-40" style={{ background: EV.brand }}>
            {saving ? 'Saving…' : 'Save answers'}
          </button>
        </div>
        {msg && <p role="status" className="text-[12px]" style={{ color: EV.muted }}>{msg}</p>}
      </div>

      <div className="pt-4" style={{ borderTop: `1px solid ${EV.line}` }}>
        <p className="text-[12px] font-bold" style={{ color: EV.ink }}>Try it as a visitor</p>
        <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); ask(); }}>
          <input value={q} onChange={e => setQ(e.target.value)} maxLength={500} placeholder="What time is service on Sunday?" aria-label="Ask Front Desk"
                 className="flex-1 min-w-0 rounded-full px-4 py-2 text-[13px]" style={{ background: EV.raised, color: EV.ink, border: `1px solid ${EV.line}` }} />
          <button type="submit" disabled={asking || q.trim().length < 2} aria-label="Ask" className="px-3 rounded-full text-white disabled:opacity-40" style={{ background: EV.violet }}><Send size={14} /></button>
        </form>
        {reply && (
          <div className="mt-3 rounded-xl p-3 text-[13px]" style={{ background: EV.raised, color: EV.ink2 }}>
            <p>{reply.answer}</p>
            <p className="text-[10px] mt-1.5" style={{ color: EV.muted }}>
              {reply.unknown ? 'Added to “Visitors asked” above.' : `From: ${reply.from.join(', ') || 'your page'} · ${reply.by === 'model' ? 'worded by Aria, checked against your facts' : 'your words as written'}`}
            </p>
          </div>
        )}
        {!view.frontDeskModel && <p className="text-[10px] mt-2" style={{ color: EV.muted }}>Front Desk is answering with your words as written (the cloud model is not set up on this server).</p>}
      </div>
    </section>
  );
};

export const OrgCrewPanel: React.FC<{ org: { id: string; name: string }; onOpenSection?: (key: string) => void }> = ({ org, onOpenSection }) => {
  const [view, setView] = useState<OrgCrewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => crewApi.org(org.id).then(v => { setView(v); setError(null); }).catch(e => setError(e?.message || 'Could not load the crew.')), [org.id]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (c: OfferedCrew, on: boolean) => {
    setBusy(c.id);
    try { setView(await crewApi.hire(org.id, c.id, on)); setError(null); }
    catch (e: any) { setError(e?.message || 'Could not change the crew.'); }
    finally { setBusy(null); }
  };
  const decide = async (id: string, d: 'approved' | 'rejected') => {
    try { setView(await crewApi.decide(org.id, id, d)); } catch (e: any) { setError(e?.message || 'Could not save.'); }
  };

  const [live, planned] = useMemo(() => {
    const o = view?.offered || [];
    return [o.filter(c => c.status === 'live'), o.filter(c => c.status !== 'live')];
  }, [view]);
  const frontDesk = view?.offered.find(c => c.id === 'front_desk');
  const SECTION_FOR: Record<string, string> = { grants_scout: 'grants' };

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <AriaMark size={40} />
        <div>
          <h2 className="text-xl font-bold" style={{ color: EV.ink }}>Aria's crew</h2>
          <p className="text-[13px] mt-1 max-w-2xl" style={{ color: EV.muted }}>
            Helpers that work for {org.name} behind Aria. Each has one job. They draft and you decide: none of them moves money, sends, posts, deletes or changes your settings.
          </p>
        </div>
      </header>

      {error && <p role="alert" className="text-sm" style={{ color: EV.warn }}>{error}</p>}
      {!view && !error && <p className="text-sm" style={{ color: EV.muted }}>Loading the crew…</p>}

      {view && (
        <>
          {view.drafts.length > 0 && (
            <section className="ev-panel p-5" aria-labelledby="crew-drafts">
              <h3 id="crew-drafts" className="text-[15px] font-bold" style={{ color: EV.ink }}>Waiting for you</h3>
              <ul className="mt-3 space-y-3">
                {view.drafts.map(d => (
                  <li key={d.id} className="rounded-xl p-3" style={{ background: EV.raised }}>
                    <p className="text-[13px] font-semibold" style={{ color: EV.ink }}>{d.title}</p>
                    <p className="text-[12px] mt-1 whitespace-pre-wrap" style={{ color: EV.ink2 }}>{d.body}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => decide(d.id, 'approved')} className="px-3 py-1.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 text-white" style={{ background: EV.violet }}><Check size={12} /> Approve</button>
                      <button type="button" onClick={() => decide(d.id, 'rejected')} className="px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: EV.chrome, color: EV.ink2 }}>Not this</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Available now" className="grid gap-4 md:grid-cols-2">
            {live.map(c => (
              <CrewCard key={c.id} c={c} busy={busy === c.id} onToggle={on => toggle(c, on)}
                        onOpen={SECTION_FOR[c.id] && onOpenSection ? () => onOpenSection(SECTION_FOR[c.id]) : undefined} />
            ))}
          </section>

          {frontDesk?.hired && <FrontDeskDesk orgId={org.id} view={view} onView={setView} />}

          {planned.length > 0 && (
            <section aria-labelledby="crew-coming">
              <h3 id="crew-coming" className="text-[13px] font-bold mb-3" style={{ color: EV.ink2 }}>Joining the crew soon</h3>
              <div className="grid gap-4 md:grid-cols-2 opacity-80">
                {planned.map(c => <CrewCard key={c.id} c={c} busy onToggle={() => {}} />)}
              </div>
            </section>
          )}

          {view.log.length > 0 && (
            <details className="ev-panel p-4">
              <summary className="text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5" style={{ color: EV.ink2 }}><ShieldCheck size={13} /> Crew work log</summary>
              <ul className="mt-3 space-y-1 text-[11px]" style={{ color: EV.muted }}>
                {view.log.map((l, i) => (
                  <li key={i}>{new Date(l.at).toLocaleString()} · {view.offered.find(c => c.id === l.crewId)?.name || l.crewId} · {l.what}{l.by === 'model' ? ' (Aria)' : ''}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
};

export default OrgCrewPanel;

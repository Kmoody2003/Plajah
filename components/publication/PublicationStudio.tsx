/**
 * PublicationStudio — run a real periodical: masthead, staff, issues, page plan, sign-off, layout,
 * print and distribution to Lorea.
 *
 * One studio, two tiers:
 *   student  a class newspaper or magazine. Stories come from the Student Newsroom and count only when a
 *            teacher approved them from their account; the faculty adviser approves each issue from theirs.
 *   pro      an independent or professional outlet. Stories come from the Journalist Desk (published or
 *            scheduled articles); readiness mirrors industry practice (imprint, ISSN, corrections policy,
 *            editor-in-chief sign-off).
 * "Lay out in Tela" builds the issue as a Tela document with its print spec (newspaper, magazine, zine…),
 * where Prepress preflights and exports it for a home printer, a print shop or a newspaper press.
 * "Publish digital edition" freezes that layout and puts it on Lorea's Periodicals shelf.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, Circle, ExternalLink, Loader2, Newspaper, Plus, Send, ShieldCheck, Trash2, Wand2 } from 'lucide-react';
import type { DocPrintSpec } from '../../services/print/types';
import { PRINT_PRODUCTS, defaultSpecFor } from '../../services/print/products';
import type { Frequency, IssueStory, Periodical, PeriodicalIssue, PeriodicalKind, PeriodicalTier, StaffMember, StaffRole } from '../../services/publication/types';
import { STAFF_ROLE_LABEL } from '../../services/publication/types';
import { autoFlatplan, buildIssueTelaDoc, fromArticle, fromStudentStory, issueReadiness, newIssue, readyToPublish, validIssn } from '../../services/publication/issueLogic';
import { useStories } from '../../services/journalismSchool/newsroomStore';

const ACCENT = '#E8553E';
const inp = 'w-full h-9 px-2.5 rounded-[9px] text-[13px] bg-white/[0.05] border border-white/[0.12] text-white outline-none focus:border-[#E8553E]/60';
const lbl = 'block text-[9.5px] font-extrabold uppercase tracking-[.14em] text-white/40 mb-1';
const card = 'rounded-2xl border border-white/10 bg-white/[0.02] p-4';
const SECTIONS = ['News', 'Opinion', 'Features', 'Arts', 'Sports'];
const PRINT_CHOICES = PRINT_PRODUCTS.filter(p => ['newspaper', 'magazine', 'zine'].includes(p.kind));

interface Props {
  tier: PeriodicalTier;
  user?: { uid: string; displayName?: string | null } | null;
  /** Student tier: whether this account is a teacher (can be the adviser). */
  isTeacher?: boolean;
}

const PublicationStudio: React.FC<Props> = ({ tier, user, isTeacher }) => {
  const uid = user?.uid || '';
  const [store, setStore] = useState<typeof import('../../services/publication/periodicalStore') | null>(null);
  const [pubs, setPubs] = useState<Periodical[] | null>(null);
  const [issues, setIssues] = useState<PeriodicalIssue[]>([]);
  const [pubId, setPubId] = useState<string | null>(null);
  const [issueId, setIssueId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const s = store || await import('../../services/publication/periodicalStore');
    setStore(s);
    const [p, i] = await Promise.all([s.listMyPeriodicals(), s.listIssuesForStaff()]);
    setPubs(p.filter(x => (x.tier || 'pro') === tier)); setIssues(i);
  }, [store, tier]);
  useEffect(() => { if (uid) void reload().catch(() => setPubs([])); else setPubs([]); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const pub = pubs?.find(p => p.id === pubId) || null;
  const pubIssues = useMemo(() => issues.filter(i => i.publicationId === pubId), [issues, pubId]);
  const issue = pubIssues.find(i => i.id === issueId) || null;
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 5000); };

  if (!uid) return <p className="text-sm text-white/60">Sign in to start or join a publication.</p>;
  if (pubs === null) return <p className="text-sm text-white/50"><Loader2 size={14} className="mr-1 inline animate-spin" />Loading your publications…</p>;

  // ── Mutations ──
  const savePub = async (p: Periodical) => { setPubs(list => (list || []).map(x => (x.id === p.id ? p : x))); await store!.savePeriodical(p); };
  const createPub = async (name: string, kind: PeriodicalKind, frequency: Frequency, adviser: { uid: string; name: string; classId?: string } | null) => {
    const { newPublication } = await import('../../services/journalist/newsroomStore');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'publication';
    const base = newPublication(name, slug, { sections: SECTIONS, editors: [{ uid, name: user?.displayName || 'Editor' }], access: 'FREE' });
    const p: Periodical = {
      ...base, kind, tier, frequency, distributeToLorea: true,
      printProductId: kind === 'magazine' ? 'magazine-letter-saddle' : kind === 'zine' ? 'zine-half-letter' : tier === 'student' ? 'newspaper-letter-home' : 'newspaper-tabloid',
      staff: [{ uid, name: user?.displayName || 'Editor', role: 'editor-in-chief' }],
      correctionsPolicy: 'We correct errors of fact promptly and in public. Corrections run with the story online and in the next print issue.',
      ...(adviser ? { adviserUid: adviser.uid, adviserName: adviser.name, ...(adviser.classId ? { classId: adviser.classId } : {}) } : {}),
    };
    await store!.savePeriodical(p); await reload(); setPubId(p.id);
  };
  const saveIssueLocal = async (i: PeriodicalIssue) => { setIssues(list => list.map(x => (x.id === i.id ? i : x))); await store!.saveIssue(i); };
  const createIssue = async () => {
    if (!pub) return;
    const last = pubIssues[0];
    const i = newIssue(pub, uid, last ? { volume: last.volume, number: last.number } : null);
    // Student papers: everyone enrolled in the class is staff on the issue, so they can file stories.
    if (pub.classId) {
      const all: any[] = await import('../../services/backendService').then(m => m.fetchClassrooms()).catch(() => []);
      const cls = (all || []).find(c => c?.id === pub.classId);
      i.staffUids = [...new Set([...i.staffUids, ...((cls?.enrolledStudents as string[]) || [])])];
    }
    await store!.saveIssue(i); setIssues(list => [i, ...list]); setIssueId(i.id);
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_1fr]" data-testid="publication-studio">
      {msg && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-[13px] text-white shadow-xl">{msg}</div>}
      <aside className="space-y-4">
        <div className={card}>
          <p className={lbl}>{tier === 'student' ? 'Student publications' : 'Your periodicals'}</p>
          <ul className="space-y-1">
            {pubs.map(p => (
              <li key={p.id}><button onClick={() => { setPubId(p.id); setIssueId(null); }} className={`w-full rounded-lg px-3 py-2 text-left text-[13px] ${p.id === pubId ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/[0.05]'}`}>
                <span className="font-bold">{p.name}</span><span className="block text-[11px] text-white/40">{p.kind} · {p.frequency}{p.adviserUid === uid ? ' · you advise' : ''}</span>
              </button></li>
            ))}
            {!pubs.length && <li className="text-[12px] text-white/40">None yet.</li>}
          </ul>
        </div>
        <NewPublicationForm tier={tier} uid={uid} myName={user?.displayName || 'Teacher'} isTeacher={!!isTeacher} onCreate={createPub} />
      </aside>

      <main className="space-y-5 min-w-0">
        {!pub && <div className={`${card} text-sm text-white/60`}>Pick a publication or start one. A publication is a masthead with a staff, a schedule and numbered issues — {tier === 'student' ? 'your class paper or magazine' : 'a newspaper, magazine, newsletter or journal'}.</div>}
        {pub && !issue && (
          <>
            <MastheadEditor pub={pub} tier={tier} canEdit={pub.ownerId === uid} onSave={savePub} />
            <div className={card}>
              <div className="mb-3 flex items-center gap-2"><p className={lbl}>Issues</p>
                {pub.ownerId === uid && <button onClick={() => void createIssue()} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-black text-[#1a0d08]" style={{ background: ACCENT }} data-testid="new-issue"><Plus size={13} /> New issue</button>}</div>
              <ul className="divide-y divide-white/10">
                {pubIssues.map(i => (
                  <li key={i.id}><button onClick={() => setIssueId(i.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <Newspaper size={16} className="text-white/40" />
                    <span className="flex-1 text-[13px] text-white">Vol. {i.volume}, No. {i.number} <span className="text-white/40">· {i.date} · {i.stories.length} stories · {i.flatplan.length || '—'} pages</span></span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${i.status === 'published' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{i.status}</span>
                  </button></li>
                ))}
                {!pubIssues.length && <li className="py-3 text-[12px] text-white/40">No issues yet.</li>}
              </ul>
            </div>
          </>
        )}
        {pub && issue && store && (
          <IssueDesk pub={pub} issue={issue} uid={uid} userName={user?.displayName || 'Editor'} tier={tier} store={store} busy={busy} setBusy={setBusy}
            onBack={() => setIssueId(null)} onSave={saveIssueLocal} flash={flash} reload={reload} />
        )}
      </main>
    </div>
  );
};

// ── New publication ──────────────────────────────────────────────────────────
const NewPublicationForm: React.FC<{ tier: PeriodicalTier; uid: string; myName: string; isTeacher: boolean; onCreate: (name: string, kind: PeriodicalKind, f: Frequency, adviser: { uid: string; name: string; classId?: string } | null) => Promise<void> }> = ({ tier, uid, myName, isTeacher, onCreate }) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PeriodicalKind>('newspaper');
  const [freq, setFreq] = useState<Frequency>(tier === 'student' ? 'monthly' : 'weekly');
  const [advisers, setAdvisers] = useState<Array<{ uid: string; name: string; cls: string; classId: string }>>([]);
  const [adviser, setAdviser] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (tier !== 'student') return;
    import('../../services/backendService').then(m => m.fetchClassrooms()).then((all: any[]) => {
      const mine = (all || []).filter(c => c?.ownerId === uid || (c?.enrolledStudents || []).includes(uid));
      setAdvisers(mine.map(c => ({ uid: c.ownerId, name: c.ownerName || 'Teacher', cls: c.title || 'Class', classId: c.id })));
    }).catch(() => setAdvisers([]));
  }, [tier, uid]);
  // Value is a class id (the class's teacher advises and its students are the staff), or 'me' with no class.
  const adviserObj = adviser === 'me' ? { uid, name: myName } : (() => { const a = advisers.find(x => x.classId === adviser); return a ? { uid: a.uid, name: a.name, classId: a.classId } : null; })();
  const ok = name.trim().length > 1 && (tier === 'pro' || !!adviserObj);
  return (
    <div className={card}>
      <p className={lbl}>Start a publication</p>
      <div className="space-y-2">
        <input className={inp} placeholder={tier === 'student' ? 'The Eastside Eagle' : 'The Riverside Ledger'} value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className={inp} value={kind} onChange={e => setKind(e.target.value as PeriodicalKind)}>{(['newspaper', 'magazine', 'newsletter', 'zine', 'journal'] as PeriodicalKind[]).map(k => <option key={k}>{k}</option>)}</select>
          <select className={inp} value={freq} onChange={e => setFreq(e.target.value as Frequency)}>{(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semester', 'occasional'] as Frequency[]).map(k => <option key={k}>{k}</option>)}</select>
        </div>
        {tier === 'student' && (
          <label className="block"><span className={lbl}>Faculty adviser (approves every issue)</span>
            <select className={inp} value={adviser} onChange={e => setAdviser(e.target.value)}>
              <option value="">Choose…</option>
              {advisers.map(a => <option key={a.classId} value={a.classId}>{a.uid === uid ? 'Me' : a.name} — {a.cls} (class staff)</option>)}
              {isTeacher && <option value="me">Me, without a class</option>}
            </select>
          </label>
        )}
        <button disabled={!ok || busy} onClick={async () => { setBusy(true); await onCreate(name.trim(), kind, freq, tier === 'student' ? adviserObj : null); setName(''); setBusy(false); }}
          className="w-full rounded-xl py-2 text-[12px] font-black uppercase text-[#1a0d08] disabled:opacity-40" style={{ background: ACCENT }}>{busy ? 'Creating…' : 'Create'}</button>
      </div>
    </div>
  );
};

// ── Masthead & staff ─────────────────────────────────────────────────────────
const MastheadEditor: React.FC<{ pub: Periodical; tier: PeriodicalTier; canEdit: boolean; onSave: (p: Periodical) => Promise<void> }> = ({ pub, tier, canEdit, onSave }) => {
  const [p, setP] = useState(pub);
  useEffect(() => setP(pub), [pub.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<Periodical>) => setP(x => ({ ...x, ...patch }));
  const staff = p.staff || [];
  const setStaff = (s: StaffMember[]) => set({ staff: s });
  const issnOk = !p.issn || validIssn(p.issn);
  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2"><p className={lbl}>Masthead, staff &amp; imprint</p>{canEdit && <button onClick={() => void onSave(p)} className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white">Save</button>}</div>
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label><span className={lbl}>Name</span><input className={inp} value={p.name} onChange={e => set({ name: e.target.value })} /></label>
        <label><span className={lbl}>Tagline / motto</span><input className={inp} value={p.tagline || ''} onChange={e => set({ tagline: e.target.value })} /></label>
        {tier === 'student' && <label><span className={lbl}>School</span><input className={inp} value={p.schoolName || ''} onChange={e => set({ schoolName: e.target.value })} /></label>}
        <label><span className={lbl}>Print format</span>
          <select className={inp} value={p.printProductId || ''} onChange={e => set({ printProductId: e.target.value })}>{PRINT_CHOICES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        {tier === 'pro' && <>
          <label><span className={lbl}>Publisher (legal name)</span><input className={inp} value={p.publisherLegalName || ''} onChange={e => set({ publisherLegalName: e.target.value })} /></label>
          <label><span className={lbl}>Postal address</span><input className={inp} value={p.postalAddress || ''} onChange={e => set({ postalAddress: e.target.value })} /></label>
          <label><span className={lbl}>Contact email</span><input className={inp} value={p.contactEmail || ''} onChange={e => set({ contactEmail: e.target.value })} /></label>
          <label><span className={lbl}>Copyright holder</span><input className={inp} value={p.copyrightHolder || ''} onChange={e => set({ copyrightHolder: e.target.value })} /></label>
          <label><span className={lbl}>ISSN {p.issn ? (issnOk ? '✓ valid' : '✗ check digit fails') : '(optional)'}</span><input className={inp} placeholder="1234-5679" value={p.issn || ''} onChange={e => set({ issn: e.target.value })} style={{ borderColor: issnOk ? undefined : '#f87171' }} /></label>
        </>}
        <label className="md:col-span-2"><span className={lbl}>Corrections policy</span><input className={inp} value={p.correctionsPolicy || ''} onChange={e => set({ correctionsPolicy: e.target.value })} /></label>
        <label className="md:col-span-2"><span className={lbl}>Ethics / editorial policy link</span><input className={inp} placeholder="https://… or the SPJ code" value={p.ethicsUrl || ''} onChange={e => set({ ethicsUrl: e.target.value })} /></label>
        <label className="inline-flex items-center gap-2 text-[12px] text-white/70"><input type="checkbox" checked={p.distributeToLorea !== false} onChange={e => set({ distributeToLorea: e.target.checked })} /> Distribute issues on Lorea’s Periodicals shelf</label>
      </fieldset>
      <div className="mt-4">
        <span className={lbl}>Staff box</span>
        {staff.map((m, i) => (
          <div key={i} className="mb-1.5 flex flex-wrap gap-2">
            <input className={`${inp} max-w-[200px]`} value={m.name} disabled={!canEdit} onChange={e => setStaff(staff.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <select className={`${inp} max-w-[180px]`} value={m.role} disabled={!canEdit} onChange={e => setStaff(staff.map((x, j) => (j === i ? { ...x, role: e.target.value as StaffRole } : x)))}>
              {(Object.keys(STAFF_ROLE_LABEL) as StaffRole[]).filter(r => tier === 'student' || r !== 'adviser').map(r => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
            </select>
            {canEdit && <button onClick={() => setStaff(staff.filter((_, j) => j !== i))} className="text-white/40 hover:text-red-300"><Trash2 size={14} /></button>}
          </div>
        ))}
        {canEdit && <button onClick={() => setStaff([...staff, { name: '', role: 'reporter' }])} className="text-[12px] font-bold" style={{ color: ACCENT }}>+ Add staff</button>}
        {tier === 'student' && <p className="mt-2 text-[11px] text-white/40">Adviser: {p.adviserName || 'not set'}. Staff accounts are added to each new issue so they can file stories.</p>}
      </div>
    </div>
  );
};

// ── Issue desk ───────────────────────────────────────────────────────────────
interface DeskProps {
  pub: Periodical; issue: PeriodicalIssue; uid: string; userName: string; tier: PeriodicalTier;
  store: typeof import('../../services/publication/periodicalStore');
  busy: string | null; setBusy: (b: string | null) => void; onBack: () => void;
  onSave: (i: PeriodicalIssue) => Promise<void>; flash: (m: string) => void; reload: () => Promise<void>;
}

const IssueDesk: React.FC<DeskProps> = ({ pub, issue, uid, userName, tier, store, busy, setBusy, onBack, onSave, flash, reload }) => {
  const { stories: myStudentStories } = useStories(uid);
  const [articles, setArticles] = useState<Array<{ id: string; title: string; status: string }>>([]);
  useEffect(() => {
    if (tier !== 'pro') return;
    import('../../services/journalist/articleService').then(m => m.listMyArticles(uid)).then(r => setArticles(r.map(a => ({ id: a.id, title: a.title, status: a.status })))).catch(() => setArticles([]));
  }, [tier, uid]);

  const checks = issueReadiness(pub, issue);
  const ready = readyToPublish(checks);
  const isAdviser = pub.adviserUid === uid;
  const isEic = (pub.staff || []).some(m => m.uid === uid && (m.role === 'editor-in-chief' || m.role === 'publisher')) || pub.ownerId === uid;
  const locked = issue.status === 'published';
  const set = (patch: Partial<PeriodicalIssue>) => void onSave({ ...issue, ...patch });

  const addStory = (s: IssueStory) => set({ stories: [...issue.stories.filter(x => x.id !== s.id), s] });
  const addArticle = async (id: string) => {
    const { doc, getDoc } = await import('firebase/firestore'); const { db } = await import('../../services/firebase');
    const snap = await getDoc(doc(db, 'articles', id)); if (!snap.exists()) return;
    addStory(fromArticle({ id, ...(snap.data() as any) }));
  };
  const moveStory = (storyId: string, page: number) => set({ flatplan: issue.flatplan.map(sl => ({ ...sl, storyIds: sl.page === page ? [...sl.storyIds.filter(x => x !== storyId), storyId] : sl.storyIds.filter(x => x !== storyId) })) });
  const autoPlan = () => {
    const spec: DocPrintSpec = issue.printSpec || defaultSpecFor(pub.printProductId || 'newspaper-tabloid');
    const mult = PRINT_PRODUCTS.find(p => p.id === spec.productId)?.pageMultiple || 4;
    set({ flatplan: autoFlatplan(issue.stories, spec.trimIn, mult), status: issue.status === 'planning' ? 'production' : issue.status });
  };

  const layOut = async () => {
    setBusy('Laying out in Tela…');
    try {
      const doc = buildIssueTelaDoc(pub, issue.flatplan.length ? issue : { ...issue, flatplan: autoFlatplan(issue.stories, (issue.printSpec || defaultSpecFor(pub.printProductId || 'newspaper-tabloid')).trimIn) }, { ownerId: uid });
      const { saveTelaDoc } = await import('../../services/telaStore');
      await saveTelaDoc(doc);
      await onSave({ ...issue, telaDocId: doc.id });
      window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
    } catch (e) { flash(`Layout failed: ${(e as Error).message}`); }
    setBusy(null);
  };
  const publish = async () => {
    setBusy('Publishing the digital edition…');
    const { loadTelaDoc } = await import('../../services/telaStore');
    const doc = issue.telaDocId ? await loadTelaDoc(issue.telaDocId) : null;
    const res = await store.publishIssueEdition(issue, doc || buildIssueTelaDoc(pub, issue, { ownerId: uid }));
    setBusy(null);
    if (res.ok) { flash('Published. It’s on Lorea’s Periodicals shelf.'); await reload(); } else flash(res.error || 'Publishing failed.');
  };

  const approvedStudent = myStudentStories.filter(s => s.approval?.byUid && !issue.stories.some(x => x.id === `st:${s.id}`));
  const byId = new Map(issue.stories.map(s => [s.id, s]));

  return (
    <div className="space-y-4" data-testid="issue-desk">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-bold text-white/70">← Issues</button>
        <h3 className="text-lg font-black">{pub.name} · Vol. {issue.volume}, No. {issue.number}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${locked ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{issue.status}</span>
      </div>

      <div className={`${card} grid grid-cols-2 gap-3 md:grid-cols-4`}>
        <label><span className={lbl}>Volume</span><input type="number" min={1} className={inp} value={issue.volume} disabled={locked} onChange={e => set({ volume: +e.target.value })} /></label>
        <label><span className={lbl}>Number</span><input type="number" min={1} className={inp} value={issue.number} disabled={locked} onChange={e => set({ number: +e.target.value })} /></label>
        <label><span className={lbl}>Date</span><input type="date" className={inp} value={issue.date} disabled={locked} onChange={e => set({ date: e.target.value })} /></label>
        <label><span className={lbl}>Cover line</span><input className={inp} value={issue.coverLine || ''} disabled={locked} onChange={e => set({ coverLine: e.target.value })} /></label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={card}>
          <p className={lbl}>Stories in this issue ({issue.stories.length})</p>
          <ul className="space-y-1.5">
            {issue.stories.map(s => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[13px]">
                {s.approved ? <CheckCircle2 size={14} className="text-emerald-300" /> : <Circle size={14} className="text-amber-300" />}
                <span className="flex-1 min-w-[140px] text-white">{s.headline}<span className="block text-[11px] text-white/40">{s.byline} · {s.source === 'student' ? (s.approved ? `approved by ${s.approvedBy}` : 'needs teacher approval') : (s.approved ? 'published' : 'not published yet')}</span></span>
                <select className="rounded bg-white/[0.06] px-1.5 py-1 text-[11px] text-white" value={s.section} disabled={locked} onChange={e => set({ stories: issue.stories.map(x => (x.id === s.id ? { ...x, section: e.target.value } : x)) })}>{SECTIONS.map(x => <option key={x}>{x}</option>)}</select>
                <button title="Lead the front page" disabled={locked} onClick={() => set({ stories: issue.stories.map(x => ({ ...x, priority: x.id === s.id ? 10 : Math.min(x.priority ?? 0, 9) })) })} className={`text-[11px] font-bold ${s.priority === 10 ? 'text-[#ffb4a6]' : 'text-white/40'}`}>Lead</button>
                {!locked && <button onClick={() => set({ stories: issue.stories.filter(x => x.id !== s.id), flatplan: issue.flatplan.map(sl => ({ ...sl, storyIds: sl.storyIds.filter(x => x !== s.id) })) })} className="text-white/30 hover:text-red-300"><Trash2 size={13} /></button>}
              </li>
            ))}
          </ul>
          {!locked && tier === 'student' && approvedStudent.length > 0 && (
            <div className="mt-3"><p className={lbl}>File your approved newsroom stories</p>
              {approvedStudent.map(s => <button key={s.id} onClick={() => addStory(fromStudentStory(s))} className="mr-2 mb-1.5 inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[12px] text-white/80"><Plus size={12} />{s.headline || 'Untitled'}</button>)}
            </div>
          )}
          {!locked && tier === 'student' && <p className="mt-2 text-[11px] text-white/40">Reporters file their own teacher-approved stories here, or from the Press Room.</p>}
          {!locked && tier === 'pro' && (
            <div className="mt-3"><p className={lbl}>Add from the Journalist Desk</p>
              {articles.filter(a => !issue.stories.some(s => s.id === `ar:${a.id}`)).slice(0, 12).map(a => <button key={a.id} onClick={() => void addArticle(a.id)} className="mr-2 mb-1.5 inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[12px] text-white/80"><Plus size={12} />{a.title}<span className="text-white/35">· {a.status.toLowerCase()}</span></button>)}
              {!articles.length && <p className="text-[12px] text-white/40">No articles yet — write them in the Journalist Desk.</p>}
            </div>
          )}
        </section>

        <section className={card}>
          <div className="mb-2 flex items-center gap-2"><p className={lbl}>Flatplan ({issue.flatplan.length} pages)</p>
            {!locked && <button onClick={autoPlan} className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white"><Wand2 size={12} /> Auto-plan</button>}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {issue.flatplan.map(sl => (
              <div key={sl.page} className="min-h-[96px] rounded-lg border border-white/10 bg-[#f6f0e3] p-2 text-[#1a1612]">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#8a3324]">{sl.page} · {sl.section}</p>
                {sl.storyIds.map(id => <p key={id} className="mt-1 truncate text-[11px] font-semibold">{byId.get(id)?.headline || id}</p>)}
                {sl.note && <p className="mt-1 text-[10px] italic text-[#6b6258]">{sl.note}</p>}
              </div>
            ))}
          </div>
          {!locked && issue.flatplan.length > 0 && issue.stories.length > 0 && (
            <div className="mt-3 space-y-1">
              {issue.stories.map(s => {
                const at = issue.flatplan.find(sl => sl.storyIds.includes(s.id))?.page;
                return (
                  <div key={s.id} className="flex items-center gap-2 text-[12px] text-white/70">
                    <span className="flex-1 truncate">{s.headline}</span>
                    <button disabled={!at || at <= 1} onClick={() => at && moveStory(s.id, at - 1)} className="text-white/40 disabled:opacity-20"><ArrowUp size={12} /></button>
                    <span className="w-10 text-center">p.{at ?? '—'}</span>
                    <button disabled={!at || at >= issue.flatplan.length} onClick={() => at && moveStory(s.id, at + 1)} className="text-white/40 disabled:opacity-20"><ArrowDown size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className={card}>
        <p className={lbl}><ShieldCheck size={11} className="mr-1 inline" />Ready to publish?</p>
        <ul className="grid grid-cols-1 gap-1 md:grid-cols-2" data-testid="readiness">
          {checks.map(c => (
            <li key={c.id} className={`flex gap-2 text-[12.5px] ${c.ok ? 'text-white/70' : c.level === 'required' ? 'text-red-200' : 'text-amber-200/80'}`}>
              {c.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" /> : <Circle size={14} className="mt-0.5 shrink-0" />}
              <span>{c.label}{!c.ok && c.level === 'recommended' ? ' (recommended)' : ''}{c.detail ? <span className="block text-[11px] opacity-70">{c.detail}</span> : null}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {tier === 'pro' && isEic && !issue.approvals.some(a => a.uid === uid) && !locked && (
            <button onClick={() => set({ approvals: [...issue.approvals, { role: 'editor-in-chief', uid, name: userName, at: Date.now() }] })} className="rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-bold text-white/80">Sign off as editor-in-chief</button>
          )}
          {tier === 'student' && isAdviser && (
            <button onClick={async () => { const ok = await store.setAdviserApproval(issue.id, !issue.adviserApproval); flash(ok ? (issue.adviserApproval ? 'Approval withdrawn.' : 'Issue approved.') : 'Could not save the approval.'); await reload(); }}
              className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-[12px] font-bold text-emerald-200" data-testid="adviser-approve">{issue.adviserApproval ? 'Withdraw adviser approval' : 'Approve issue as adviser'}</button>
          )}
          {issue.adviserApproval && <span className="text-[12px] text-emerald-300">Adviser approved: {issue.adviserApproval.name}</span>}
        </div>
      </section>

      <section className={`${card} flex flex-wrap items-center gap-2`}>
        <button disabled={!!busy || !issue.stories.length} onClick={() => void layOut()} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-black text-[#1a0d08] disabled:opacity-40" style={{ background: ACCENT }} data-testid="layout-issue">
          <BookOpen size={14} /> {issue.telaDocId ? 'Rebuild layout in Tela' : 'Lay out in Tela'}
        </button>
        {issue.telaDocId && <button onClick={() => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: issue.telaDocId } }))} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-[12px] font-bold text-white/85"><ExternalLink size={14} /> Open layout · Prepress &amp; print</button>}
        <button disabled={!!busy || !ready || locked} onClick={() => void publish()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 px-4 py-2.5 text-[12px] font-bold text-emerald-200 disabled:opacity-40" data-testid="publish-issue">
          <Send size={14} /> {locked ? 'Published' : 'Publish digital edition to Lorea'}
        </button>
        {locked && <button onClick={() => window.dispatchEvent(new CustomEvent('plajah:openIssue', { detail: { issueId: issue.id } }))} className="text-[12px] font-bold text-white/70 underline">Read it</button>}
        {busy && <span className="text-[12px] text-white/60"><Loader2 size={12} className="mr-1 inline animate-spin" />{busy}</span>}
        <p className="w-full text-[11px] text-white/40">Rebuilding replaces the Tela layout with a fresh one from the flatplan. Print from Tela: File → Prepress &amp; print production (home printer, print shop, newspaper press).</p>
      </section>
    </div>
  );
};

export default PublicationStudio;

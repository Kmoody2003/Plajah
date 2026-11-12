/**
 * Civic Desk — Terra Civic's CRM for governments serving residents, businesses and organizations.
 *
 * Four views: the staff Queue (cases worked against response targets), People & orgs (a 360 view of
 * every resident, business and organization), the Dashboard (how the desk is doing, plus the public,
 * redacted view), and New request (the form residents use, which staff also use for phone and walk-in).
 *
 * PREVIEW: runs on fictional sample data stored in this browser (services/terra/civic/desk/deskStore).
 * All rules — routing, due dates, status changes, duplicate detection, redaction — live in deskCore.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Inbox, Users, BarChart3, PlusCircle, Search, Clock, AlertTriangle, CheckCircle2, User, Building2,
  Landmark, MapPin, Send, StickyNote, GitMerge, ChevronRight, Phone, Mail, Globe2, RotateCcw, Scale, Eye,
} from 'lucide-react';
import {
  type Case, type CaseStatus, type Constituent, type ServiceType, type SlaState, type Channel,
  STATUS_LABEL, canTransition, slaState, queue, metrics, setStatus, assign, transfer, addNote, reply, mergeDuplicate,
  likelyDuplicates, openCase, findMatches, constituentSummary, fillTemplate, redactCase, isOpen, HOUR_MS, DAY_MS,
} from '../../../services/terra/civic/desk/deskCore';
import type { DeskData } from '../../../services/terra/civic/desk/deskSample';
import { createPreviewStore } from '../../../services/terra/civic/desk/deskStore';

const CYAN = '#4FC3D6';
const ORANGE = '#FF8C00';
const VIOLET = '#A78BFA';
const RED = '#FF5C6C';
const AMBER = '#F5B544';
const GREEN = '#3DD68C';

const STAFF_ID = 's-you';
const STAFF_NAME = 'You (desk staff)';

type View = 'queue' | 'people' | 'dashboard' | 'new';

// ── small helpers ────────────────────────────────────────────────────────────
function ago(t: number, now: number): string {
  const d = now - t;
  if (d < HOUR_MS) return `${Math.max(1, Math.round(d / 60_000))}m ago`;
  if (d < DAY_MS) return `${Math.round(d / HOUR_MS)}h ago`;
  return `${Math.round(d / DAY_MS)}d ago`;
}
function until(t: number, now: number): string {
  const d = t - now, a = Math.abs(d);
  const s = a < HOUR_MS ? `${Math.max(1, Math.round(a / 60_000))}m` : a < DAY_MS ? `${Math.round(a / HOUR_MS)}h` : `${Math.round(a / DAY_MS)}d`;
  return d >= 0 ? `due in ${s}` : `${s} overdue`;
}
const SLA_STYLE: Record<SlaState, { label: string; color: string }> = {
  on_track: { label: 'On track', color: GREEN },
  due_soon: { label: 'Due soon', color: AMBER },
  overdue: { label: 'Overdue', color: RED },
  met: { label: 'Met target', color: GREEN },
  missed: { label: 'Missed target', color: AMBER },
};
const PRIORITY_COLOR = { urgent: RED, high: AMBER, normal: CYAN, low: '#8a8fa3' } as const;
const CHANNEL_LABEL: Record<Channel, string> = { web: 'Web', phone: 'Phone', email: 'Email', walk_in: 'Walk-in', app: 'App', sms: 'Text', meeting: 'Meeting', social: 'Social' };
const LANG: Record<string, string> = { en: 'English', es: 'Spanish', ar: 'Arabic' };

const Pill: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
    style={{ color, background: `${color}1a`, border: `1px solid ${color}44` }}>{children}</span>
);

const card = 'rounded-2xl border border-white/[0.07] bg-white/[0.025]';
const input = 'w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-300/60';
const btn = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-40';

// ── component ────────────────────────────────────────────────────────────────
export interface CivicDeskProps {
  onBack?: () => void;
  /** Open a section in the Terra Law Library. */
  onOpenLaw?: (sectionId: string) => void;
  /** Open the Terra map (optionally at a parcel). */
  onOpenMap?: () => void;
}

const CivicDesk: React.FC<CivicDeskProps> = ({ onBack, onOpenLaw, onOpenMap }) => {
  const store = useMemo(() => createPreviewStore(), []);
  const [data, setData] = useState<DeskData>(() => store.load());
  const [view, setView] = useState<View>('queue');
  const [now, setNow] = useState(() => Date.now());
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  /** Set only by "New request" on a person's record, so the form pre-fills just then. */
  const [prefillFor, setPrefillFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const commit = (next: DeskData, msg?: string) => { setData(next); store.save(next); if (msg) setToast(msg); };
  const updateCase = (c: Case, msg?: string) => commit({ ...data, cases: data.cases.map((x) => (x.id === c.id ? c : x)) }, msg);

  const svc = (id: string) => data.services.find((s) => s.id === id)!;
  const dept = (id: string) => data.departments.find((d) => d.id === id);
  const person = (id?: string) => (id ? data.constituents.find((p) => p.id === id) : undefined);
  const staffName = (id?: string) => (id === STAFF_ID ? STAFF_NAME : data.staff.find((s) => s.id === id)?.name);

  const m = useMemo(() => metrics(data.cases, now), [data.cases, now]);

  const tabs: { id: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'queue', label: 'Queue', icon: <Inbox size={14} />, badge: m.overdue },
    { id: 'people', label: 'People & orgs', icon: <Users size={14} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={14} /> },
    { id: 'new', label: 'New request', icon: <PlusCircle size={14} /> },
  ];

  const openPerson = (id: string) => { setSelectedPerson(id); setView('people'); };
  const openCaseView = (id: string) => { setSelectedCase(id); setView('queue'); };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#08090d] text-white">
      {/* top bar */}
      <div className="sticky top-0 z-30 bg-[#08090d]/95 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white" aria-label="Back"><ArrowLeft size={15} /></button>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${CYAN}, ${VIOLET})` }}><Landmark size={15} className="text-white" /></span>
            <span>
              <span className="block text-[13px] font-black leading-none">Civic Desk</span>
              <span className="block text-[10px] text-white/40">Terra Civic · resident &amp; business services</span>
            </span>
          </div>
          <Pill color={AMBER}>Preview · sample data</Pill>
          <nav className="flex gap-1 ml-auto overflow-x-auto" aria-label="Civic Desk views">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => { if (t.id === 'new') setPrefillFor(null); setView(t.id); }} aria-current={view === t.id ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${view === t.id ? 'bg-white text-black' : 'text-white/55 hover:text-white bg-white/[0.04]'}`}>
                {t.icon}{t.label}
                {!!t.badge && <span className="ml-0.5 px-1.5 rounded-full text-[9px]" style={{ background: view === t.id ? '#0002' : `${RED}33`, color: view === t.id ? '#000' : RED }}>{t.badge}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {view === 'queue' && (
          <QueueView data={data} now={now} selected={selectedCase} onSelect={setSelectedCase}
            svc={svc} dept={dept} person={person} staffName={staffName} updateCase={updateCase}
            commitBoth={(a, b, msg) => commit({ ...data, cases: data.cases.map((x) => (x.id === a.id ? a : x.id === b.id ? b : x)) }, msg)}
            openPerson={openPerson} onOpenLaw={onOpenLaw} onOpenMap={onOpenMap} />
        )}
        {view === 'people' && (
          <PeopleView data={data} now={now} selected={selectedPerson} onSelect={setSelectedPerson} svc={svc} openCase={openCaseView}
            newFor={(id) => { setPrefillFor(id); setView('new'); }} />
        )}
        {view === 'dashboard' && <DashboardView data={data} now={now} m={m} dept={dept} svc={svc} openCase={openCaseView} />}
        {view === 'new' && (
          <NewRequestView key={prefillFor ?? 'blank'} data={data} now={now} presetPerson={prefillFor}
            onCreate={(c, newPerson) => {
              commit({ ...data, seq: data.seq + 1, cases: [c, ...data.cases], constituents: newPerson ? [newPerson, ...data.constituents] : data.constituents }, `Request ${c.ref} created`);
            }}
            goToCase={openCaseView} />
        )}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/35">
          <span>Preview: fictional sample residents, businesses and cases, saved only in this browser.</span>
          <button onClick={() => { const d = store.reset(); setData(d); setSelectedCase(null); setSelectedPerson(null); setToast('Sample data reset'); }}
            className="inline-flex items-center gap-1.5 hover:text-white"><RotateCcw size={12} /> Reset sample</button>
        </div>
      </div>

      {toast && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white text-black text-xs font-black shadow-2xl">{toast}</div>}
    </div>
  );
};

// ── Queue ────────────────────────────────────────────────────────────────────
interface QueueProps {
  data: DeskData; now: number; selected: string | null; onSelect: (id: string | null) => void;
  svc: (id: string) => ServiceType; dept: (id: string) => DeskData['departments'][number] | undefined;
  person: (id?: string) => Constituent | undefined; staffName: (id?: string) => string | undefined;
  updateCase: (c: Case, msg?: string) => void; commitBoth: (a: Case, b: Case, msg?: string) => void;
  openPerson: (id: string) => void; onOpenLaw?: (id: string) => void; onOpenMap?: () => void;
}

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: 'open', label: 'Open' }, { id: 'overdue', label: 'Overdue' }, { id: 'due_soon', label: 'Due soon' },
  { id: 'waiting_on_resident', label: 'Waiting' }, { id: 'resolved', label: 'Resolved' }, { id: 'all', label: 'All' },
];

function QueueView(p: QueueProps) {
  const { data, now } = p;
  const [deptF, setDeptF] = useState('');
  const [statusF, setStatusF] = useState('open');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const rows = useMemo(() => queue(data.cases, {
    departmentId: deptF || undefined,
    status: statusF === 'overdue' || statusF === 'due_soon' ? 'open' : (statusF as any),
    sla: statusF === 'overdue' ? 'overdue' : statusF === 'due_soon' ? 'due_soon' : undefined,
    assignee: mine ? STAFF_ID : undefined, q,
  }, now), [data.cases, deptF, statusF, q, mine, now]);
  // Show the top of the queue until someone picks a case, so the desk opens in a working state.
  const current = data.cases.find((c) => c.id === p.selected) ?? rows[0] ?? null;

  return (
    <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2 mb-3">
          <label className="flex-1 min-w-[180px] flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3">
            <Search size={14} className="text-white/35" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ref, address, words" aria-label="Search cases" className="flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/30" />
          </label>
          <select value={deptF} onChange={(e) => setDeptF(e.target.value)} aria-label="Department" className="rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm text-white">
            <option value="">All departments</option>
            {data.departments.map((d) => <option key={d.id} value={d.id}>{d.publicName ?? d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setStatusF(f.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${statusF === f.id ? 'bg-white text-black' : 'bg-white/[0.05] text-white/60 hover:text-white'}`}>{f.label}</button>
          ))}
          <button onClick={() => setMine((v) => !v)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${mine ? 'bg-cyan-300 text-black' : 'bg-white/[0.05] text-white/60 hover:text-white'}`}>Assigned to me</button>
        </div>
        <div className={`${card} overflow-hidden divide-y divide-white/[0.05]`}>
          {rows.length === 0 && <p className="p-6 text-sm text-white/45">Nothing here. Try another filter.</p>}
          {rows.map((c) => {
            const sla = slaState(c, now), who = p.person(c.constituentId);
            return (
              <button key={c.id} onClick={() => p.onSelect(c.id)} aria-current={current?.id === c.id}
                className={`w-full text-left px-4 py-3.5 flex gap-3 hover:bg-white/[0.04] ${current?.id === c.id ? 'bg-white/[0.06]' : ''}`}>
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: PRIORITY_COLOR[c.priority] }} title={`${c.priority} priority`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-white/45">{c.ref}</span>
                    {isOpen(c) ? <Pill color={SLA_STYLE[sla].color}>{SLA_STYLE[sla].label}</Pill> : <Pill color="#8a8fa3">{STATUS_LABEL[c.status]}</Pill>}
                  </span>
                  <span className="block mt-1 text-[13.5px] font-bold text-white/90 truncate">{c.title}</span>
                  <span className="block mt-0.5 text-[11.5px] text-white/40 truncate">
                    {(p.dept(c.departmentId)?.publicName ?? '')} · {who ? who.name : 'Anonymous'} · {ago(c.createdAt, now)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-white/35">{rows.length} cases · overdue first, then priority, then soonest due.</p>
      </div>

      <div className="min-w-0">
        {current ? <CaseDetail {...p} c={current} /> : (
          <div className={`${card} p-10 text-center`}>
            <Inbox size={22} className="mx-auto text-white/25" />
            <p className="mt-3 text-sm font-bold text-white/70">Pick a case from the queue</p>
            <p className="mt-1 text-xs text-white/40">You'll see the resident, the timeline, likely duplicates and the rules behind the service.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CaseDetail(p: QueueProps & { c: Case }) {
  const { c, data, now } = p;
  const s = p.svc(c.serviceTypeId), d = p.dept(c.departmentId), who = p.person(c.constituentId), org = p.person(c.onBehalfOf);
  const sla = slaState(c, now);
  const [draft, setDraft] = useState('');
  const [tpl, setTpl] = useState('');
  useEffect(() => { setDraft(''); setTpl(''); }, [c.id]);
  const dups = useMemo(() => likelyDuplicates(data.cases, c), [data.cases, c]);
  const nextStatuses = (['triaged', 'in_progress', 'waiting_on_resident', 'resolved', 'closed'] as CaseStatus[]).filter((x) => canTransition(c.status, x));
  const deptStaff = data.staff.filter((x) => x.departmentId === c.departmentId);
  const templates = data.templates.filter((t) => !t.serviceTypeIds || t.serviceTypeIds.includes(c.serviceTypeId));

  return (
    <article className={`${card} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-white/50">{c.ref}</span>
        <Pill color={isOpen(c) ? SLA_STYLE[sla].color : '#8a8fa3'}>{STATUS_LABEL[c.status]}{isOpen(c) ? ` · ${until(c.dueAt, now)}` : ''}</Pill>
        <Pill color={PRIORITY_COLOR[c.priority]}>{c.priority} priority</Pill>
        <span className="text-[11px] text-white/40">via {CHANNEL_LABEL[c.channel]} · {ago(c.createdAt, now)}</span>
      </div>
      <h2 className="mt-3 text-xl sm:text-2xl font-black tracking-tight">{c.title}</h2>
      <p className="mt-1 text-[12px] text-white/45">{s.category} · {d?.publicName ?? d?.name}{c.assignee ? ` · assigned to ${p.staffName(c.assignee)}` : ' · unassigned'}</p>
      <p className="mt-4 text-[15px] leading-relaxed text-white/85">{c.description}</p>
      {c.answers && Object.keys(c.answers).length > 0 && (
        <dl className="mt-3 grid sm:grid-cols-2 gap-2">
          {(s.fields ?? []).filter((f) => c.answers?.[f.key]).map((f) => (
            <div key={f.key} className="rounded-xl bg-white/[0.03] px-3 py-2"><dt className="text-[10px] text-white/40">{f.label}</dt><dd className="text-sm">{c.answers![f.key]}</dd></div>
          ))}
        </dl>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Reported by</p>
          {who ? (
            <button onClick={() => p.openPerson(who.id)} className="mt-1.5 flex items-center gap-2 text-left group">
              {who.kind === 'person' ? <User size={15} className="text-white/45" /> : <Building2 size={15} className="text-white/45" />}
              <span>
                <span className="block text-sm font-bold group-hover:underline">{who.name}</span>
                <span className="block text-[11px] text-white/40">{who.language && who.language !== 'en' ? `Prefers ${LANG[who.language] ?? who.language} · ` : ''}{who.preferredChannel ? `contact by ${CHANNEL_LABEL[who.preferredChannel].toLowerCase()}` : ''}</span>
              </span>
            </button>
          ) : <p className="mt-1.5 text-sm text-white/55">Anonymous report — no follow-up possible</p>}
          {org && <button onClick={() => p.openPerson(org.id)} className="mt-2 text-[11px] text-cyan-200/80 hover:underline">For {org.name}</button>}
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Where</p>
          {c.location ? (
            <>
              <p className="mt-1.5 text-sm font-bold flex items-center gap-1.5"><MapPin size={14} className="text-white/45" />{c.location.line1}</p>
              <p className="text-[11px] text-white/40">{c.location.ward ? `Ward ${c.location.ward}` : ''}</p>
              {p.onOpenMap && <button onClick={p.onOpenMap} className="mt-2 text-[11px] text-cyan-200/80 hover:underline">Open in Terra map</button>}
            </>
          ) : <p className="mt-1.5 text-sm text-white/55">No location needed</p>}
        </div>
      </div>

      {s.lawRefs?.length ? (
        <div className="mt-3 rounded-xl bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35 flex items-center gap-1.5"><Scale size={12} /> The law behind this service</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.lawRefs.map((id) => (
              <button key={id} onClick={() => p.onOpenLaw?.(id)} className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold" style={{ color: VIOLET, background: `${VIOLET}1a` }}>
                MCL {id.replace('mcl-', '')}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {dups.length > 0 && isOpen(c) && (
        <div className="mt-3 rounded-xl p-3.5" style={{ background: `${AMBER}12`, border: `1px solid ${AMBER}40` }}>
          <p className="text-[12px] font-black flex items-center gap-1.5" style={{ color: AMBER }}><GitMerge size={13} /> {dups.length === 1 ? 'Looks like another report of the same thing' : `${dups.length} similar reports nearby`}</p>
          <div className="mt-2 space-y-1.5">
            {dups.map((x) => (
              <div key={x.id} className="flex items-center gap-2 text-[12px]">
                <span className="font-mono text-white/50">{x.ref}</span><span className="flex-1 truncate text-white/75">{x.location?.line1} · {ago(x.createdAt, now)}</span>
                <button onClick={() => { const m = mergeDuplicate(x.createdAt <= c.createdAt ? x : c, x.createdAt <= c.createdAt ? c : x, STAFF_ID, Date.now()); p.commitBoth(m.primary, m.dup, `Merged into ${m.primary.ref}`); }}
                  className={`${btn} bg-white/10 hover:bg-white/15 !py-1 !px-2.5`}>Merge</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-white/40">Merging keeps the older case open and tells the other reporter to follow it.</p>
        </div>
      )}

      {/* actions */}
      <div className="mt-5 flex flex-wrap gap-2 items-center">
        {nextStatuses.map((st) => (
          <button key={st} onClick={() => p.updateCase(setStatus(c, st, STAFF_ID, Date.now()), `Marked ${STATUS_LABEL[st].toLowerCase()}`)}
            className={`${btn} ${st === 'resolved' ? 'bg-emerald-300 text-black' : 'bg-white/[0.07] text-white/80 hover:text-white'}`}>
            {st === 'resolved' ? <CheckCircle2 size={13} /> : null}{STATUS_LABEL[st]}
          </button>
        ))}
        <select value="" onChange={(e) => e.target.value && p.updateCase(assign(c, e.target.value, STAFF_ID, Date.now()), 'Assigned')} aria-label="Assign" className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-[12px]">
          <option value="">Assign…</option>
          <option value={STAFF_ID}>{STAFF_NAME}</option>
          {deptStaff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select value="" onChange={(e) => e.target.value && p.updateCase(transfer(c, e.target.value, STAFF_ID, Date.now(), 'Transferred by desk staff'), 'Transferred')} aria-label="Transfer to department" className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-[12px]">
          <option value="">Transfer…</option>
          {data.departments.filter((x) => x.id !== c.departmentId).map((x) => <option key={x.id} value={x.id}>{x.publicName ?? x.name}</option>)}
        </select>
      </div>

      {/* composer */}
      {c.status !== 'duplicate' && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <select value={tpl} onChange={(e) => { setTpl(e.target.value); const t = data.templates.find((x) => x.id === e.target.value); if (t) setDraft(fillTemplate(t.body, { constituent: who, c, service: s, department: d })); }}
              aria-label="Reply template" className="rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1.5 text-[12px]">
              <option value="">Start from a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {who?.language && who.language !== 'en' && <span className="text-[11px]" style={{ color: AMBER }}>Resident prefers {LANG[who.language] ?? who.language}. Translation by ARIA is planned; staff review every reply.</span>}
          </div>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder={who ? `Write to ${who.name.split(' ')[0]}…` : 'Add a note…'} aria-label="Message" className={`${input} resize-y`} />
          <div className="mt-2 flex flex-wrap gap-2 justify-end">
            <button disabled={!draft.trim()} onClick={() => { p.updateCase(addNote(c, draft.trim(), STAFF_ID, Date.now(), true), 'Internal note added'); setDraft(''); setTpl(''); }}
              className={`${btn} bg-white/[0.07] text-white/80`}><StickyNote size={13} /> Internal note</button>
            <button disabled={!draft.trim() || !who} onClick={() => { p.updateCase(reply(c, draft.trim(), STAFF_ID, Date.now()), 'Reply sent to resident'); setDraft(''); setTpl(''); }}
              className={`${btn} text-black`} style={{ background: CYAN }} title={who ? undefined : 'Anonymous reports have no one to reply to'}><Send size={13} /> Reply to resident</button>
          </div>
        </div>
      )}

      {/* timeline */}
      <ol className="mt-6 space-y-3">
        {[...c.timeline].reverse().map((t, i) => (
          <li key={i} className={`rounded-xl px-3.5 py-2.5 ${t.internal ? 'bg-white/[0.02] border border-dashed border-white/10' : t.kind === 'reply' ? 'border' : 'bg-white/[0.03]'}`}
            style={t.kind === 'reply' && !t.internal ? { borderColor: `${CYAN}40`, background: `${CYAN}0d` } : undefined}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
              <span className="font-bold text-white/65">{t.kind === 'reply' ? 'Reply to resident' : t.kind === 'note' ? 'Internal note' : t.kind === 'status' ? `Status → ${STATUS_LABEL[t.to as CaseStatus] ?? t.to}` : t.kind === 'routed' ? 'Routed' : t.kind === 'assigned' ? 'Assigned' : t.kind === 'merged' ? 'Merged' : t.kind === 'priority' ? 'Priority raised' : 'Received'}</span>
              <span>· {t.by === 'system' ? 'Civic Desk' : p.staffName(t.by) ?? p.person(t.by)?.name ?? 'Resident'}</span>
              <span>· {ago(t.at, now)}</span>
              {t.internal && <span className="inline-flex items-center gap-1 text-white/35"><Eye size={11} /> staff only</span>}
            </div>
            {t.text && <p className="mt-1 text-[13px] text-white/80">{t.text}</p>}
            {t.kind === 'assigned' && <p className="mt-1 text-[13px] text-white/70">{p.staffName(t.to)}</p>}
            {t.kind === 'routed' && t.to && !t.text?.startsWith('Routed') && <p className="mt-1 text-[13px] text-white/70">To {p.dept(t.to)?.publicName}</p>}
          </li>
        ))}
      </ol>
    </article>
  );
}

// ── People & orgs ────────────────────────────────────────────────────────────
function PeopleView({ data, now, selected, onSelect, svc, openCase, newFor }: {
  data: DeskData; now: number; selected: string | null; onSelect: (id: string) => void; svc: (id: string) => ServiceType; openCase: (id: string) => void; newFor: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'person' | 'business' | 'organization'>('all');
  const list = data.constituents.filter((c) => (kind === 'all' || c.kind === kind) && (c.name + ' ' + (c.email ?? '') + ' ' + (c.address?.line1 ?? '')).toLowerCase().includes(q.toLowerCase()));
  const cur = data.constituents.find((c) => c.id === selected) ?? null;
  const sum = cur ? constituentSummary(cur, data.cases, now) : null;
  const related = cur ? data.constituents.filter((x) => cur.contacts?.includes(x.id) || x.contacts?.includes(cur.id)) : [];
  const icon = (k: Constituent['kind']) => (k === 'person' ? <User size={15} /> : k === 'business' ? <Building2 size={15} /> : <Users size={15} />);

  return (
    <div className="grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5 items-start">
      <div className="min-w-0">
        <label className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 mb-3">
          <Search size={14} className="text-white/35" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or address" aria-label="Search people and organizations" className="flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/30" />
        </label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['all', 'person', 'business', 'organization'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${kind === k ? 'bg-white text-black' : 'bg-white/[0.05] text-white/60'}`}>{k === 'all' ? 'Everyone' : k === 'person' ? 'Residents' : k === 'business' ? 'Businesses' : 'Organizations'}</button>
          ))}
        </div>
        <div className={`${card} divide-y divide-white/[0.05] overflow-hidden`}>
          {list.map((c) => {
            const s = constituentSummary(c, data.cases, now);
            return (
              <button key={c.id} onClick={() => onSelect(c.id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] ${selected === c.id ? 'bg-white/[0.06]' : ''}`}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.06] text-white/60 shrink-0">{icon(c.kind)}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold truncate">{c.name}</span><span className="block text-[11px] text-white/40 truncate">{c.address?.line1 ?? c.email}</span></span>
                {s.open > 0 && <Pill color={s.overdue ? RED : CYAN}>{s.open} open</Pill>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-w-0">
        {cur && sum ? (
          <article className={`${card} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start gap-4">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${CYAN}, ${VIOLET})` }}>{icon(cur.kind)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{cur.kind === 'person' ? 'Resident' : cur.kind === 'business' ? 'Business' : 'Organization'}</p>
                <h2 className="text-2xl font-black tracking-tight">{cur.name}</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/60">
                  {cur.email && <span className="inline-flex items-center gap-1.5"><Mail size={12} />{cur.email}</span>}
                  {cur.phone && <span className="inline-flex items-center gap-1.5"><Phone size={12} />{cur.phone}</span>}
                  {cur.address && <span className="inline-flex items-center gap-1.5"><MapPin size={12} />{cur.address.line1}{cur.address.ward ? ` · Ward ${cur.address.ward}` : ''}</span>}
                  {cur.language && <span className="inline-flex items-center gap-1.5"><Globe2 size={12} />{LANG[cur.language] ?? cur.language}</span>}
                </div>
              </div>
              <button onClick={() => newFor(cur.id)} className={`${btn} text-black`} style={{ background: CYAN }}><PlusCircle size={13} /> New request</button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[['Requests', sum.total], ['Open', sum.open], ['Overdue', sum.overdue]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-white/[0.03] p-3"><p className="text-2xl font-black tabular-nums">{v as number}</p><p className="text-[11px] text-white/40">{l}</p></div>
              ))}
            </div>
            {(cur.licenseIds?.length || related.length || cur.tags?.length) ? (
              <div className="mt-4 flex flex-wrap gap-2 text-[11.5px]">
                {cur.licenseIds?.map((l) => <span key={l} className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-white/70 font-mono">License {l}</span>)}
                {related.map((r) => <button key={r.id} onClick={() => onSelect(r.id)} className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-cyan-200/80 hover:underline">{cur.kind === 'person' ? 'Acts for ' : 'Contact: '}{r.name}</button>)}
                {cur.tags?.map((t) => <span key={t} className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-white/55">{t}</span>)}
              </div>
            ) : null}
            <h3 className="mt-6 mb-2 text-[11px] font-black uppercase tracking-widest text-white/35">Request history</h3>
            <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] overflow-hidden">
              {sum.cases.length === 0 && <p className="p-4 text-sm text-white/45">No requests yet.</p>}
              {sum.cases.map((x) => (
                <button key={x.id} onClick={() => openCase(x.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04]">
                  <span className="font-mono text-[11px] text-white/45 w-28 shrink-0">{x.ref}</span>
                  <span className="flex-1 min-w-0 text-[13px] truncate">{svc(x.serviceTypeId).name}{x.location ? ` · ${x.location.line1}` : ''}</span>
                  <Pill color={isOpen(x) ? SLA_STYLE[slaState(x, now)].color : '#8a8fa3'}>{STATUS_LABEL[x.status]}</Pill>
                  <ChevronRight size={14} className="text-white/25" />
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-white/35">{cur.updatesOptIn ? 'Opted in to city updates.' : 'Contacted only about their own requests.'} Contact details are never shown on public pages.</p>
          </article>
        ) : (
          <div className={`${card} p-10 text-center`}>
            <Users size={22} className="mx-auto text-white/25" />
            <p className="mt-3 text-sm font-bold text-white/70">One record per resident, business and organization</p>
            <p className="mt-1 text-xs text-white/40">Every request, reply and contact preference in one place, so nobody has to repeat themselves to a second department.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({ data, now, m, dept, svc, openCase }: {
  data: DeskData; now: number; m: ReturnType<typeof metrics>; dept: (id: string) => DeskData['departments'][number] | undefined; svc: (id: string) => ServiceType; openCase: (id: string) => void;
}) {
  const maxOpen = Math.max(1, ...m.byDepartment.map((d) => d.open));
  const recentPublic = data.cases.filter((c) => c.status !== 'duplicate').slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const tiles: [string, string, string?][] = [
    ['Open requests', String(m.open)],
    ['Overdue', String(m.overdue), m.overdue ? RED : undefined],
    ['Due soon', String(m.dueSoon), m.dueSoon ? AMBER : undefined],
    ['Resolved on time, 30 days', m.onTimeRate == null ? '—' : `${Math.round(m.onTimeRate * 100)}%`],
    ['Median first reply', m.medianFirstResponseH == null ? '—' : `${m.medianFirstResponseH < 1 ? '<1' : Math.round(m.medianFirstResponseH)} h`],
    ['New today', String(m.newToday)],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map(([l, v, col]) => (
          <div key={l} className={`${card} p-4`}><p className="text-3xl font-black tabular-nums" style={col ? { color: col } : undefined}>{v}</p><p className="mt-1 text-[11px] text-white/45">{l}</p></div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <section className={`${card} p-5`}>
          <h3 className="text-sm font-black">Open requests by department</h3>
          <p className="text-[11px] text-white/40">Red share is overdue.</p>
          <div className="mt-4 space-y-3">
            {m.byDepartment.map((d) => (
              <div key={d.departmentId} className="grid grid-cols-[140px_minmax(0,1fr)_40px] items-center gap-3 text-[12px]" title={`${d.open} open, ${d.overdue} overdue`}>
                <span className="text-white/65 truncate">{dept(d.departmentId)?.publicName}</span>
                <span className="h-3 rounded-full bg-white/[0.05] overflow-hidden flex" style={{ width: `${(d.open / maxOpen) * 100}%`, minWidth: 8 }}>
                  <span style={{ width: `${(d.overdue / d.open) * 100}%`, background: RED }} />
                  <span className="flex-1" style={{ background: CYAN, marginLeft: d.overdue && d.overdue < d.open ? 2 : 0 }} />
                </span>
                <span className="text-right tabular-nums text-white/70">{d.open}</span>
              </div>
            ))}
          </div>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-sm font-black flex items-center gap-2"><Globe2 size={14} /> What the public sees</h3>
          <p className="text-[11px] text-white/40">The public status page shows type, block and status only. Names, contacts, exact addresses and staff notes stay private.</p>
          <div className="mt-3 divide-y divide-white/[0.05]">
            {recentPublic.map((c) => {
              const r = redactCase(c, svc(c.serviceTypeId).name);
              return (
                <button key={c.id} onClick={() => openCase(c.id)} className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-white/[0.03]">
                  <span className="font-mono text-[11px] text-white/40 w-28 shrink-0">{r.ref}</span>
                  <span className="flex-1 min-w-0 text-[12.5px] truncate">{r.type}{r.area ? ` · ${r.area}` : ''}</span>
                  <span className="text-[11px] text-white/55 shrink-0">{r.status}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <p className="text-[11px] text-white/35">Every number here is computed from the cases themselves. Published versions of these metrics can go on the Civic Record so residents can check them.</p>
    </div>
  );
}

// ── New request (resident-facing) ────────────────────────────────────────────
function NewRequestView({ data, now, presetPerson, onCreate, goToCase }: {
  data: DeskData; now: number; presetPerson: string | null; onCreate: (c: Case, newPerson?: Constituent) => void; goToCase: (id: string) => void;
}) {
  const cats = [...new Set(data.services.map((s) => s.category))];
  const [cat, setCat] = useState(cats[0]);
  const [svcId, setSvcId] = useState(data.services.find((s) => s.category === cats[0])!.id);
  const s = data.services.find((x) => x.id === svcId)!;
  const preset = data.constituents.find((c) => c.id === presetPerson);
  const [desc, setDesc] = useState('');
  const [addr, setAddr] = useState('');
  const [ward, setWard] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [anon, setAnon] = useState(false);
  const [name, setName] = useState(preset?.name ?? '');
  const [email, setEmail] = useState(preset?.email ?? '');
  const [phone, setPhone] = useState(preset?.phone ?? '');
  const [channel, setChannel] = useState<Channel>(preset ? 'phone' : 'web');
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<Case | null>(null);

  const matches = useMemo(() => (anon || (!email && !phone && !name) ? [] : findMatches(data.constituents, { name, email, phone, address: { line1: addr } })), [data.constituents, anon, name, email, phone, addr]);
  const probe = useMemo(() => (addr ? openCase0(s, desc || 'probe', addr, now) : null), [s, desc, addr, now]);
  const nearby = useMemo(() => (probe ? likelyDuplicates(data.cases, probe) : []), [probe, data.cases]);

  if (done) {
    return (
      <div className={`${card} max-w-xl mx-auto p-8 text-center`}>
        <CheckCircle2 size={30} className="mx-auto" style={{ color: GREEN }} />
        <h2 className="mt-3 text-2xl font-black">Request received</h2>
        <p className="mt-2 text-white/60">Your reference is <span className="font-mono text-white">{done.ref}</span>. It's with {data.departments.find((d) => d.id === done.departmentId)?.publicName}, and the target is {new Date(done.dueAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</p>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <button onClick={() => goToCase(done.id)} className={`${btn} text-black`} style={{ background: CYAN }}>Open in the queue</button>
          <button onClick={() => { setDone(null); setDesc(''); setAddr(''); setAnswers({}); }} className={`${btn} bg-white/10`}>Another request</button>
        </div>
      </div>
    );
  }

  const submit = () => {
    let constituentId: string | undefined, newPerson: Constituent | undefined;
    if (!anon && (name || email || phone)) {
      const hit = matches[0]?.c;
      if (hit) constituentId = hit.id;
      else { newPerson = { id: `p-${Date.now()}`, kind: 'person', name: name || email || phone, email: email || undefined, phone: phone || undefined, address: addr ? { line1: addr, ward: ward || undefined } : undefined, createdAt: Date.now() }; constituentId = newPerson.id; }
    }
    const r = openCase({ serviceType: s, description: desc, channel, constituentId, location: s.needsLocation || addr ? { line1: addr, ward: ward || undefined } : undefined, answers, by: constituentId ?? 'anonymous', now: Date.now(), seq: data.seq + 1 }, `case-${Date.now()}`);
    if (r.problems.length) { setProblems(r.problems); return; }
    setProblems([]);
    onCreate(r.case, newPerson);
    setDone(r.case);
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-6 items-start max-w-5xl mx-auto">
      <div className={`${card} p-5 sm:p-7`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Report a problem or ask a question</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight">What do you need help with?</h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} onClick={() => { setCat(c); setSvcId(data.services.find((x) => x.category === c)!.id); }} className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${cat === c ? 'bg-white text-black' : 'bg-white/[0.05] text-white/60 hover:text-white'}`}>{c}</button>
          ))}
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {data.services.filter((x) => x.category === cat).map((x) => (
            <button key={x.id} onClick={() => setSvcId(x.id)} className={`text-left rounded-xl p-3 border ${svcId === x.id ? 'border-cyan-300/70 bg-cyan-300/[0.07]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
              <span className="block text-sm font-bold">{x.name}</span><span className="block text-[11.5px] text-white/50">{x.description}</span>
            </button>
          ))}
        </div>

        <label className="block mt-5 text-[12px] font-bold text-white/70" htmlFor="desk-desc">Describe it</label>
        <textarea id="desk-desc" value={desc} onChange={(e) => { setDesc(e.target.value); setProblems([]); }} rows={3} className={`${input} mt-1.5`} placeholder="What's happening, and since when?" />
        {(
          <div className="mt-4 grid sm:grid-cols-[minmax(0,1fr)_120px] gap-2">
            <div><label className="block text-[12px] font-bold text-white/70" htmlFor="desk-addr">Address or nearest intersection{s.needsLocation ? '' : ' (optional)'}</label>
              <input id="desk-addr" value={addr} onChange={(e) => { setAddr(e.target.value); setProblems([]); }} className={`${input} mt-1.5`} placeholder="e.g. 4400 Vernor Hwy" /></div>
            <div><label className="block text-[12px] font-bold text-white/70" htmlFor="desk-ward">Ward</label>
              <input id="desk-ward" value={ward} onChange={(e) => setWard(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} className={`${input} mt-1.5`} placeholder="optional" inputMode="numeric" /></div>
          </div>
        )}
        {(s.fields ?? []).map((f) => (
          <div key={f.key} className="mt-4"><label className="block text-[12px] font-bold text-white/70" htmlFor={`desk-f-${f.key}`}>{f.label}{f.required ? '' : ' (optional)'}</label>
            <input id={`desk-f-${f.key}`} value={answers[f.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} className={`${input} mt-1.5`} /></div>
        ))}

        <div className="mt-6 rounded-2xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-white/70">How can we follow up?</p>
            {s.allowAnonymous && <label className="inline-flex items-center gap-2 text-[12px] text-white/60"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Report anonymously</label>}
          </div>
          {!anon && (
            <div className="mt-3 grid sm:grid-cols-3 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" placeholder="Name" className={input} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" placeholder="Email" type="email" className={input} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone" placeholder="Phone" type="tel" className={input} />
            </div>
          )}
          {matches.length > 0 && <p className="mt-2 text-[11.5px]" style={{ color: CYAN }}>Matched to an existing record: {matches[0].c.name} ({matches[0].why.toLowerCase()}). The request joins their history.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-white/50">
            <span>Received by</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="Channel" className="rounded-lg bg-white/[0.06] border border-white/10 px-2 py-1 text-[12px] text-white">
              {(['web', 'phone', 'email', 'walk_in', 'app', 'sms'] as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
            <span className="text-white/35">(staff entering a call or walk-in pick the channel)</span>
          </div>
        </div>

        {problems.length > 0 && (
          <div className="mt-4 rounded-xl p-3 text-[12.5px]" style={{ background: `${RED}14`, border: `1px solid ${RED}44`, color: '#ffd5da' }} role="alert">
            <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> Before we can send this:</p>
            <ul className="mt-1 list-disc pl-5">{problems.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        <button onClick={submit} className={`${btn} mt-5 text-black !text-[12px] !px-5 !py-3`} style={{ background: ORANGE }}><Send size={14} /> Send request</button>
      </div>

      <aside className="space-y-4 min-w-0">
        <div className={`${card} p-5`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">What happens next</p>
          <p className="mt-2 text-sm text-white/80">This goes to <b>{data.departments.find((d) => d.id === s.departmentId)?.publicName}</b>.</p>
          <p className="mt-1 text-sm text-white/60 flex items-center gap-1.5"><Clock size={13} /> Target: {s.sla.unit === 'days' ? `${s.sla.amount} days` : `${s.sla.amount} business hours`}</p>
          <p className="mt-3 text-[11.5px] text-white/40">You get a reference number and updates by your preferred contact. Public pages show the type, block and status only, never your name or contact details.</p>
        </div>
        {nearby.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: `${AMBER}12`, border: `1px solid ${AMBER}40` }}>
            <p className="text-[12px] font-black" style={{ color: AMBER }}>Already reported nearby</p>
            {nearby.slice(0, 3).map((x) => (
              <p key={x.id} className="mt-1.5 text-[12px] text-white/70"><span className="font-mono text-white/50">{x.ref}</span> · {STATUS_LABEL[x.status]} · {ago(x.createdAt, now)}</p>
            ))}
            <p className="mt-2 text-[11px] text-white/45">You can still send yours. Staff will link the reports so everyone gets updates.</p>
          </div>
        )}
        {s.lawRefs?.length ? (
          <div className={`${card} p-5`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35 flex items-center gap-1.5"><Scale size={12} /> Know the rules</p>
            <p className="mt-2 text-[12px] text-white/60">This service follows Michigan law: {s.lawRefs.map((r) => `MCL ${r.replace('mcl-', '')}`).join(', ')}. Read it in the Terra Law Library.</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/** A throwaway case used only to look for nearby reports while the form is being filled in. */
function openCase0(s: ServiceType, desc: string, addr: string, now: number): Case {
  return { id: '__probe', ref: '', serviceTypeId: s.id, channel: 'web', title: '', description: desc, location: { line1: addr }, departmentId: s.departmentId, priority: s.priority, status: 'new', createdAt: now, dueAt: now, timeline: [] };
}

export default CivicDesk;

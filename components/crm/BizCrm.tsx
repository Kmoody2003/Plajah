// BizCrm — the small-business CRM: pipeline board, people list with bulk actions, preset segments, CSV
// import, and the contact drawer. Wired by the business's ops preset (pipelines, stages, custom fields,
// segments, tags, correspondence). Correspondence goes through CorrespondenceStudio.
//
// Staff mode: no delete, no export, no bulk promotional sends; sees contacts assigned to them + unassigned.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Users, KanbanSquare, Filter, Upload, ChevronLeft, ChevronRight, AlertTriangle, Tag, Send,
  Download, Printer, X, Clock, Loader2, ArrowRightLeft, CheckSquare,
} from 'lucide-react';
import type { BusinessPage, CrmContact } from '../../types';
import type { CrmPipeline, OpsPreset, SegmentRule } from '../../services/opsPresets/types';
import {
  contactMatchesQuery, daysInStage, followUps, formatCents, fullName, isStale, mailingRows,
  parseContactsCsv, pipelineSummary, planImport, segmentMatches, stageOf, suggestedTemplates, toCsv, lastTouchAt,
  type CsvParseResult,
} from '../../services/crm/crmCore';
import { bulkUpdate, importContacts, saveContact, subscribeContacts } from '../../services/crm/crmService';
import { CrmStyles, Field, downloadFile, relDays, rootStyle } from './crmTheme';
import { labelsHtml, printHtml } from './crmPrint';
import { ContactDrawer } from './ContactDrawer';
import { CorrespondenceStudio } from './CorrespondenceStudio';

export interface BizCrmProps {
  businessPage: BusinessPage;
  currentUser: { uid: string; displayName?: string };
  preset: OpsPreset;
  accent?: string;
  mode?: 'owner' | 'staff';
}

type View = 'board' | 'people' | 'segments' | 'import';

const BUILTIN_SEGMENTS: { id: string; label: string; rule: SegmentRule; test?: (c: CrmContact) => boolean }[] = [
  { id: '__all', label: 'Everyone', rule: {} },
  { id: '__optin', label: 'Agreed to marketing', rule: { optedIn: true } },
  { id: '__mail', label: 'Has a mailing address', rule: { hasAddress: true } },
  { id: '__email', label: 'Has an email', rule: {}, test: c => !!(c.email || '').trim() },
  { id: '__app', label: 'On Plajah', rule: {}, test: c => !!c.userId },
];

export const BizCrm: React.FC<BizCrmProps> = ({ businessPage, currentUser, preset, accent, mode = 'owner' }) => {
  const businessId = businessPage.id;
  const actor = useMemo(() => ({ uid: currentUser.uid, displayName: currentUser.displayName }), [currentUser.uid, currentUser.displayName]);
  const crm = preset.crm;
  const noun = crm.contactNoun || 'contact';

  const [all, setAll] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [view, setView] = useState<View>('board');
  const [pipelineId, setPipelineId] = useState<string>(crm.pipelines[0]?.id || '');
  const [openContact, setOpenContact] = useState<Partial<CrmContact> | null>(null);
  const [studio, setStudio] = useState<{ recipients: CrmContact[]; templateId?: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // People filters
  const [q, setQ] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [tag, setTag] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    return subscribeContacts(businessId, rows => { setAll(rows); setLoading(false); setLoadErr(''); },
      e => { setLoading(false); setLoadErr(/permission/i.test(e.message) ? 'You don’t have access to this business’s contacts.' : e.message); });
  }, [businessId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!crm.pipelines.some(p => p.id === pipelineId)) setPipelineId(crm.pipelines[0]?.id || ''); }, [crm.pipelines, pipelineId]);

  const contacts = useMemo(() => (mode === 'staff' ? all.filter(c => !c.assignedTo || c.assignedTo === currentUser.uid) : all), [all, mode, currentUser.uid]);
  const byId = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const pipeline = crm.pipelines.find(p => p.id === pipelineId);
  const summary = useMemo(() => (pipeline ? pipelineSummary(contacts, pipeline, now) : null), [contacts, pipeline, now]);
  const segments = useMemo(() => [...BUILTIN_SEGMENTS, ...crm.segments.map(s => ({ ...s, test: undefined }))], [crm.segments]);
  const allTags = useMemo(() => [...new Set([...(crm.tags || []), ...contacts.flatMap(c => c.tags || [])])].sort((a, b) => a.localeCompare(b)), [crm.tags, contacts]);

  const inSegment = useCallback((c: CrmContact, id: string) => {
    const s = segments.find(x => x.id === id);
    if (!s) return true;
    return segmentMatches(c, s.rule, now) && (!s.test || s.test(c));
  }, [segments, now]);

  const filtered = useMemo(() => contacts.filter(c =>
    contactMatchesQuery(c, q)
    && (!segmentId || inSegment(c, segmentId))
    && (!tag || (c.tags || []).includes(tag))
    && (!stageFilter || (stageFilter === '__none' ? !c.pipelineId : c.stageId === stageFilter)),
  ), [contacts, q, segmentId, tag, stageFilter, inSegment]);

  const selectedContacts = useMemo(() => [...selected].map(id => byId.get(id)).filter((c): c is CrmContact => !!c), [selected, byId]);

  // ── Actions ──

  const offerStageTemplate = (c: CrmContact, stageId: string) => {
    const t = suggestedTemplates(c, preset, { on: 'stage_enter', pipelineId: c.pipelineId, stageId })[0];
    const stage = pipeline?.stages.find(s => s.id === stageId);
    setToast({
      text: `${fullName(c)} moved to ${stage?.label || 'next stage'}.`,
      action: t ? { label: `Draft "${t.label}"`, run: () => setStudio({ recipients: [c], templateId: t.id }) } : undefined,
    });
  };

  const moveTo = async (c: CrmContact, p: CrmPipeline, stageId: string) => {
    if (c.stageId === stageId && c.pipelineId === p.id) return;
    try {
      const next = await saveContact({ id: c.id, businessId, pipelineId: p.id, stageId }, actor, c);
      offerStageTemplate(next, stageId);
    } catch (e: any) { setToast({ text: e?.message || 'Could not move that card.' }); }
  };

  const step = (c: CrmContact, dir: -1 | 1) => {
    if (!pipeline) return;
    const st = stageOf(c, pipeline);
    const i = pipeline.stages.findIndex(s => s.id === st?.id);
    const next = pipeline.stages[i + dir];
    if (next) moveTo(c, pipeline, next.id);
  };

  const openNew = (stageId?: string) => setOpenContact({
    businessId, tags: [], notes: '', rewardPoints: 0, totalSpend: 0, visitCount: 0,
    ...(pipeline && stageId ? { pipelineId: pipeline.id, stageId } : {}),
    ...(mode === 'staff' ? { assignedTo: currentUser.uid } : {}),
  });

  const exportCsv = (rows: CrmContact[]) => {
    if (mode !== 'owner') return;
    const slug = businessPage.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
    downloadFile(`${slug}-contacts-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };
  const printLabels = (rows: CrmContact[]) => {
    const m = mailingRows(rows);
    if (!m.length) { setToast({ text: 'None of these have a complete mailing address.' }); return; }
    const { html, css } = labelsHtml(m);
    printHtml('Mailing labels', html, css);
    if (m.length < rows.length) setToast({ text: `${m.length} labels printed; ${rows.length - m.length} skipped (no address or do-not-mail).` });
  };

  const pageAccent = accent || preset.accent;

  return (
    <div className="crm-root" style={{ ...rootStyle(pageAccent), padding: 16 }}>
      <CrmStyles />
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 className="crm-h crm-h1">{noun.charAt(0).toUpperCase() + noun.slice(1)}s</h2>
          <div className="crm-muted crm-small crm-num">{contacts.length} total{mode === 'staff' ? ' · yours and unassigned' : ''}</div>
        </div>
        <button className="crm-btn" onClick={() => setStudio({ recipients: selectedContacts.length ? selectedContacts : [] })}><Send size={16} /><span className="crm-hide-sm">Correspondence</span></button>
        <button className="crm-btn crm-btn-primary" onClick={() => openNew(view === 'board' ? pipeline?.stages[0]?.id : undefined)}><Plus size={16} />Add {noun}</button>
      </header>

      <nav className="crm-tabs" role="tablist" aria-label="CRM views" style={{ marginBottom: 16 }}>
        {([['board', 'Pipeline', <KanbanSquare key="i" size={16} />], ['people', 'People', <Users key="i" size={16} />], ['segments', 'Segments', <Filter key="i" size={16} />], ['import', 'Import', <Upload key="i" size={16} />]] as const)
          .filter(([id]) => id !== 'import' || mode === 'owner')
          .map(([id, label, icon]) => <button key={id} role="tab" aria-selected={view === id} className="crm-tab" onClick={() => setView(id)}>{icon}{label}</button>)}
      </nav>

      {loadErr && <div className="crm-note crm-warn" role="alert" style={{ marginBottom: 12 }}>{loadErr}</div>}
      {loading && <div className="crm-empty"><Loader2 size={20} className="animate-spin" /> Loading {noun}s…</div>}

      {!loading && view === 'board' && (
        <BoardView
          preset={preset} pipeline={pipeline} pipelineId={pipelineId} setPipelineId={setPipelineId}
          summary={summary} contacts={contacts} now={now}
          onOpen={c => setOpenContact(c)} onStep={step} onDrop={(c, stageId) => pipeline && moveTo(c, pipeline, stageId)} onAdd={openNew}
          onShowUnstaged={() => { setStageFilter('__none'); setView('people'); }}
        />
      )}

      {!loading && view === 'people' && (
        <PeopleView
          contacts={contacts} filtered={filtered} preset={preset} pipeline={pipeline} segments={segments} allTags={allTags} now={now} mode={mode}
          q={q} setQ={setQ} segmentId={segmentId} setSegmentId={setSegmentId} tag={tag} setTag={setTag} stageFilter={stageFilter} setStageFilter={setStageFilter}
          selected={selected} setSelected={setSelected} selectedContacts={selectedContacts}
          onOpen={c => setOpenContact(c)}
          onBulkTag={async (t) => { const n = await bulkUpdate(selectedContacts, c => ((c.tags || []).includes(t) ? null : { tags: [...(c.tags || []), t] }), actor); setToast({ text: `Tagged ${n} with "${t}".` }); }}
          onBulkStage={async (stageId) => { if (!pipeline) return; const n = await bulkUpdate(selectedContacts, c => (c.stageId === stageId && c.pipelineId === pipeline.id ? null : { pipelineId: pipeline.id, stageId }), actor); setToast({ text: `Moved ${n} to ${pipeline.stages.find(s => s.id === stageId)?.label}.` }); }}
          onSend={() => setStudio({ recipients: selectedContacts })}
          onExport={() => exportCsv(selectedContacts.length ? selectedContacts : filtered)}
          onLabels={() => printLabels(selectedContacts.length ? selectedContacts : filtered)}
        />
      )}

      {!loading && view === 'segments' && (
        <SegmentsView
          contacts={contacts} segments={segments} inSegment={inSegment} now={now}
          onFilter={id => { setSegmentId(id); setTag(''); setStageFilter(''); setQ(''); setSelected(new Set()); setView('people'); }}
          onSend={id => setStudio({ recipients: contacts.filter(c => inSegment(c, id)) })}
        />
      )}

      {!loading && view === 'import' && mode === 'owner' && (
        <ImportView
          contacts={contacts} tags={crm.tags}
          onImport={async rows => { const r = await importContacts(businessId, rows, actor, all); return r; }}
          onDone={() => setView('people')}
        />
      )}

      {openContact && (
        <ContactDrawer
          businessId={businessId}
          contact={openContact.id ? (byId.get(openContact.id) || openContact) : openContact}
          preset={preset} currentUser={currentUser} mode={mode}
          onClose={() => setOpenContact(null)}
          onSaved={(c, prev) => {
            if (!prev) setOpenContact(c);
            if (c.stageId && (c.stageId !== prev?.stageId || c.pipelineId !== prev?.pipelineId)) offerStageTemplate(c, c.stageId);
          }}
          onSend={(c, templateId) => setStudio({ recipients: [c], templateId })}
        />
      )}

      {studio && (
        <CorrespondenceStudio
          businessPage={businessPage} currentUser={currentUser} preset={preset} accent={pageAccent} mode={mode}
          recipients={studio.recipients} initialTemplateId={studio.templateId}
          onClose={() => setStudio(null)}
        />
      )}

      {toast && (
        <div className="crm-toast" role="status">
          <span style={{ flex: 1 }}>{toast.text}</span>
          {toast.action && <button className="crm-btn crm-btn-primary" onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>}
          <button className="crm-btn crm-btn-ghost crm-icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}
    </div>
  );
};

// ── Pipeline board ───────────────────────────────────────────────────────

const BoardView: React.FC<{
  preset: OpsPreset; pipeline?: CrmPipeline; pipelineId: string; setPipelineId: (id: string) => void;
  summary: ReturnType<typeof pipelineSummary> | null; contacts: CrmContact[]; now: number;
  onOpen: (c: CrmContact) => void; onStep: (c: CrmContact, d: -1 | 1) => void; onDrop: (c: CrmContact, stageId: string) => void;
  onAdd: (stageId?: string) => void; onShowUnstaged: () => void;
}> = ({ preset, pipeline, pipelineId, setPipelineId, summary, contacts, now, onOpen, onStep, onDrop, onAdd, onShowUnstaged }) => {
  const [over, setOver] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  if (!pipeline || !summary) return <div className="crm-empty">This business type has no pipeline yet.</div>;
  const byId = new Map(contacts.map(c => [c.id, c]));
  const unstaged = contacts.filter(c => !c.pipelineId).length;
  const lastIdx = pipeline.stages.length - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {preset.crm.pipelines.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {preset.crm.pipelines.map(p => <button key={p.id} className="crm-chip" aria-pressed={p.id === pipelineId} onClick={() => setPipelineId(p.id)}>{p.label}</button>)}
        </div>
      )}
      <div className="crm-card" style={{ padding: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div className="crm-stat"><span className="crm-muted crm-small">Open {pipeline.noun}s</span><b>{summary.openCount}</b></div>
        <div className="crm-stat"><span className="crm-muted crm-small">{pipeline.valueLabel || 'Pipeline value'}</span><b>{formatCents(summary.openValueCents, { compact: true })}</b></div>
        <div className="crm-stat"><span className="crm-muted crm-small">Weighted</span><b>{formatCents(summary.weightedCents, { compact: true })}</b></div>
        <div className="crm-stat"><span className="crm-muted crm-small">Won</span><b>{formatCents(summary.wonValueCents, { compact: true })}</b></div>
        <div className="crm-stat"><span className="crm-muted crm-small">Needs attention</span><b style={{ color: summary.staleCount ? '#FF9CC0' : undefined }}>{summary.staleCount}</b></div>
      </div>

      <div className="crm-board" aria-label={`${pipeline.label} board`}>
        {summary.stages.map((s, idx) => (
          <section
            key={s.stage.id} className="crm-col" data-over={over === s.stage.id}
            onDragOver={e => { e.preventDefault(); setOver(s.stage.id); }}
            onDragLeave={() => setOver(o => (o === s.stage.id ? null : o))}
            onDrop={e => { e.preventDefault(); setOver(null); const c = dragId.current && byId.get(dragId.current); dragId.current = null; if (c) onDrop(c, s.stage.id); }}
            aria-label={s.stage.label}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 className="crm-h crm-h3" style={{ flex: 1 }}>{s.stage.label}</h3>
              <span className="crm-pill crm-num">{s.count}</span>
            </div>
            <div className="crm-muted crm-small crm-num">
              {formatCents(s.valueCents, { compact: true })}{s.stage.kind === 'open' ? ` · ${s.stage.probability}%` : s.stage.kind === 'won' ? ' · won' : ' · lost'}
              {s.stage.slaDays ? ` · ${s.stage.slaDays}d SLA` : ''}
            </div>
            {s.contactIds.map(id => byId.get(id)!).sort((a, b) => Number(isStale(b, s.stage, now)) - Number(isStale(a, s.stage, now)) || (b.dealValueCents || 0) - (a.dealValueCents || 0)).map(c => {
              const stale = isStale(c, s.stage, now);
              const overdue = c.nextActionAt && c.nextActionAt < now;
              return (
                <div key={c.id} className="crm-dcard" data-stale={stale} draggable
                  onDragStart={e => { dragId.current = c.id; e.dataTransfer.effectAllowed = 'move'; }}
                  role="button" tabIndex={0} onClick={() => onOpen(c)} onKeyDown={e => { if (e.key === 'Enter') onOpen(c); }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(c)}</b>
                    {c.dealValueCents ? <span className="crm-num" style={{ fontWeight: 700 }}>{formatCents(c.dealValueCents, { compact: true })}</span> : null}
                  </div>
                  {c.company && <div className="crm-muted crm-small">{c.company}</div>}
                  {(c.nextAction || s.stage.nextAction) && (
                    <div className="crm-small" style={{ display: 'flex', gap: 6, alignItems: 'center', color: overdue ? '#FF9CC0' : 'var(--crm-muted)' }}>
                      <Clock size={13} />{c.nextAction || s.stage.nextAction}{c.nextActionAt ? ` · ${relDays(c.nextActionAt, now)}` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="crm-pill crm-num">{daysInStage(c, now)}d</span>
                    {stale && <span className="crm-pill crm-pill-stale"><AlertTriangle size={12} />Stale</span>}
                    <span style={{ flex: 1 }} />
                    <button className="crm-btn crm-btn-ghost crm-icon-btn" disabled={idx === 0} aria-label={`Move ${fullName(c)} back`} onClick={e => { e.stopPropagation(); onStep(c, -1); }}><ChevronLeft size={18} /></button>
                    <button className="crm-btn crm-btn-ghost crm-icon-btn" disabled={idx === lastIdx} aria-label={`Move ${fullName(c)} forward`} onClick={e => { e.stopPropagation(); onStep(c, 1); }}><ChevronRight size={18} /></button>
                  </div>
                </div>
              );
            })}
            {idx === 0 && <button className="crm-btn crm-btn-ghost" onClick={() => onAdd(s.stage.id)}><Plus size={16} />Add {pipeline.noun}</button>}
          </section>
        ))}
      </div>
      {unstaged > 0 && (
        <button className="crm-note" style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--crm-ink)', border: 0, minHeight: 44 }} onClick={onShowUnstaged}>
          <span className="crm-num">{unstaged}</span> {preset.crm.contactNoun}s aren&rsquo;t in a pipeline. Open them in People and use “Move to stage”.
        </button>
      )}
    </div>
  );
};

// ── People ───────────────────────────────────────────────────────────────

const PeopleView: React.FC<{
  contacts: CrmContact[]; filtered: CrmContact[]; preset: OpsPreset; pipeline?: CrmPipeline;
  segments: { id: string; label: string }[]; allTags: string[]; now: number; mode: 'owner' | 'staff';
  q: string; setQ: (v: string) => void; segmentId: string; setSegmentId: (v: string) => void; tag: string; setTag: (v: string) => void;
  stageFilter: string; setStageFilter: (v: string) => void;
  selected: Set<string>; setSelected: (s: Set<string>) => void; selectedContacts: CrmContact[];
  onOpen: (c: CrmContact) => void; onBulkTag: (t: string) => Promise<void>; onBulkStage: (stageId: string) => Promise<void>;
  onSend: () => void; onExport: () => void; onLabels: () => void;
}> = (p) => {
  const [bulkTag, setBulkTag] = useState('');
  const [busy, setBusy] = useState(false);
  const due = useMemo(() => followUps(p.contacts, p.preset.crm, p.now).slice(0, 8), [p.contacts, p.preset.crm, p.now]);
  const allVisibleSelected = p.filtered.length > 0 && p.filtered.every(c => p.selected.has(c.id));
  const toggle = (id: string) => { const s = new Set(p.selected); if (s.has(id)) s.delete(id); else s.add(id); p.setSelected(s); };
  const filtersOn = !!(p.q || p.segmentId || p.tag || p.stageFilter);
  const wrap = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const stageName = (c: CrmContact) => { const pipe = p.preset.crm.pipelines.find(x => x.id === c.pipelineId); return pipe ? stageOf(c, pipe) : undefined; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {due.length > 0 && (
        <div className="crm-card" style={{ padding: 12 }}>
          <h3 className="crm-h crm-h3" style={{ margin: '4px 4px 8px' }}>Needs you today</h3>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {due.map(f => (
              <button key={f.contact.id + f.reason} className="crm-dcard" style={{ flex: '0 0 220px' }} onClick={() => p.onOpen(f.contact)}>
                <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(f.contact)}</b>
                <span className={`crm-pill ${f.reason === 'overdue' || f.reason === 'stale' ? 'crm-pill-stale' : 'crm-pill-accent'}`} style={{ alignSelf: 'flex-start' }}>
                  {f.reason === 'overdue' ? 'Overdue' : f.reason === 'due_today' ? 'Due today' : f.reason === 'stale' ? 'Stale' : f.reason === 'birthday' ? 'Birthday' : 'New'}
                </span>
                <span className="crm-muted crm-small">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8 }}>
        <div style={{ position: 'relative', gridColumn: 'span 2' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--crm-muted)' }} />
          <input className="crm-input" style={{ paddingLeft: 36 }} placeholder="Search name, email, phone, tag" value={p.q} onChange={e => p.setQ(e.target.value)} aria-label="Search contacts" />
        </div>
        <select className="crm-input" value={p.segmentId} onChange={e => p.setSegmentId(e.target.value)} aria-label="Segment">
          <option value="">All segments</option>
          {p.segments.filter(s => s.id !== '__all').map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="crm-input" value={p.tag} onChange={e => p.setTag(e.target.value)} aria-label="Tag">
          <option value="">Any tag</option>
          {p.allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="crm-input" value={p.stageFilter} onChange={e => p.setStageFilter(e.target.value)} aria-label="Stage">
          <option value="">Any stage</option>
          <option value="__none">Not in a pipeline</option>
          {p.preset.crm.pipelines.map(pp => (
            <optgroup key={pp.id} label={pp.label}>{pp.stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label className="crm-checkwrap" title="Select all shown">
          <input type="checkbox" className="crm-check" checked={allVisibleSelected} onChange={() => p.setSelected(allVisibleSelected ? new Set() : new Set(p.filtered.map(c => c.id)))} aria-label="Select all shown" />
        </label>
        <span className="crm-muted crm-num" style={{ flex: 1 }}>{p.filtered.length} shown{p.selected.size ? ` · ${p.selected.size} selected` : ''}</span>
        {filtersOn && <button className="crm-btn crm-btn-ghost" onClick={() => { p.setQ(''); p.setSegmentId(''); p.setTag(''); p.setStageFilter(''); }}><X size={16} />Clear filters</button>}
        {p.mode === 'owner' && <button className="crm-btn" onClick={p.onExport} disabled={!p.filtered.length}><Download size={16} /><span className="crm-hide-sm">Export CSV</span></button>}
      </div>

      <div className="crm-card" style={{ overflow: 'hidden' }}>
        {p.filtered.length === 0 && <div className="crm-empty">{p.contacts.length ? 'Nobody matches these filters.' : `No ${p.preset.crm.contactNoun}s yet. Add one or import a CSV.`}</div>}
        {p.filtered.slice(0, 500).map(c => {
          const st = stageName(c);
          return (
            <div key={c.id} className="crm-row" data-selected={p.selected.has(c.id)}>
              <label className="crm-checkwrap"><input type="checkbox" className="crm-check" checked={p.selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${fullName(c)}`} /></label>
              <button onClick={() => p.onOpen(c)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', minHeight: 44, padding: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(c)}{c.company ? <span className="crm-muted" style={{ fontWeight: 400 }}> · {c.company}</span> : null}</div>
                <div className="crm-muted crm-small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[c.email, c.phone].filter(Boolean).join(' · ') || 'No email or phone'}
                </div>
              </button>
              <div className="crm-hide-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {st && <span className={`crm-pill ${st.kind === 'won' ? 'crm-pill-won' : st.kind === 'lost' ? 'crm-pill-lost' : 'crm-pill-accent'}`}>{st.label}</span>}
                {(c.tags || []).slice(0, 2).map(t => <span key={t} className="crm-pill">{t}</span>)}
              </div>
              <div className="crm-num crm-small" style={{ textAlign: 'right', minWidth: 76 }}>
                <div>{formatCents((c.totalSpend || 0) * 100, { compact: true })}</div>
                <div className="crm-muted">{relDays(lastTouchAt(c), p.now)}</div>
              </div>
            </div>
          );
        })}
        {p.filtered.length > 500 && <div className="crm-empty crm-num">Showing the first 500 of {p.filtered.length}. Narrow the search to see more.</div>}
      </div>

      {p.selected.size > 0 && (
        <div className="crm-bulk" aria-label="Bulk actions">
          <span className="crm-num" style={{ padding: '0 8px', fontWeight: 600 }}><CheckSquare size={16} style={{ verticalAlign: -3 }} /> {p.selected.size}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="crm-input" style={{ width: 130 }} list="crm-bulk-tags" placeholder="Tag" value={bulkTag} onChange={e => setBulkTag(e.target.value)} aria-label="Tag to add" />
            <datalist id="crm-bulk-tags">{p.allTags.map(t => <option key={t} value={t} />)}</datalist>
            <button className="crm-btn" disabled={!bulkTag.trim() || busy} onClick={wrap(async () => { await p.onBulkTag(bulkTag.trim()); setBulkTag(''); })}><Tag size={16} />Tag</button>
          </div>
          {p.pipeline && (
            <select className="crm-input" style={{ width: 'auto' }} value="" disabled={busy} onChange={e => { const v = e.target.value; if (v) wrap(() => p.onBulkStage(v))(); }} aria-label="Move to stage">
              <option value="">Move to stage…</option>
              {p.pipeline.stages.map(s => <option key={s.id} value={s.id}>{p.pipeline!.label}: {s.label}</option>)}
            </select>
          )}
          <button className="crm-btn crm-btn-primary" onClick={p.onSend}><Send size={16} />Send</button>
          <button className="crm-btn" onClick={p.onLabels}><Printer size={16} /><span className="crm-hide-sm">Labels</span></button>
          {p.mode === 'owner' && <button className="crm-btn" onClick={p.onExport}><Download size={16} /><span className="crm-hide-sm">Export</span></button>}
          <button className="crm-btn crm-btn-ghost crm-icon-btn" aria-label="Clear selection" onClick={() => p.setSelected(new Set())}><X size={16} /></button>
          {busy && <Loader2 size={16} className="animate-spin" />}
        </div>
      )}
    </div>
  );
};

// ── Segments ─────────────────────────────────────────────────────────────

function describeRule(r: SegmentRule): string {
  const parts: string[] = [];
  if (r.tagsAny?.length) parts.push(`tagged ${r.tagsAny.join(' or ')}`);
  if (r.stageIn?.length) parts.push(`in ${r.stageIn.length} stage${r.stageIn.length > 1 ? 's' : ''}`);
  if (r.minSpend != null) parts.push(`spent $${r.minSpend}+`);
  if (r.minVisits != null) parts.push(`${r.minVisits}+ visits`);
  if (r.inactiveDays != null) parts.push(`quiet ${r.inactiveDays}+ days`);
  if (r.newWithinDays != null) parts.push(`new in ${r.newWithinDays} days`);
  if (r.sourceIn?.length) parts.push(`from ${r.sourceIn.join(', ').replace(/_/g, ' ')}`);
  if (r.optedIn) parts.push('agreed to marketing');
  if (r.hasAddress) parts.push('has address');
  return parts.join(' · ');
}

const SegmentsView: React.FC<{
  contacts: CrmContact[]; segments: { id: string; label: string; rule: SegmentRule }[]; now: number;
  inSegment: (c: CrmContact, id: string) => boolean; onFilter: (id: string) => void; onSend: (id: string) => void;
}> = ({ contacts, segments, inSegment, onFilter, onSend }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
    {segments.map(s => {
      const n = s.id === '__all' ? contacts.length : contacts.filter(c => inSegment(c, s.id)).length;
      return (
        <div key={s.id} className="crm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 className="crm-h crm-h3" style={{ flex: 1 }}>{s.label}</h3>
            <b className="crm-num crm-h" style={{ fontSize: 22 }}>{n}</b>
          </div>
          <div className="crm-muted crm-small" style={{ minHeight: 18 }}>{s.id.startsWith('__') ? 'Built in' : describeRule(s.rule) || 'Everyone'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button className="crm-btn" style={{ flex: 1 }} disabled={!n} onClick={() => onFilter(s.id === '__all' ? '' : s.id)}><Users size={16} />View</button>
            <button className="crm-btn" style={{ flex: 1 }} disabled={!n} onClick={() => onSend(s.id)}><Send size={16} />Send</button>
          </div>
        </div>
      );
    })}
  </div>
);

// ── Import ───────────────────────────────────────────────────────────────

const ImportView: React.FC<{
  contacts: CrmContact[]; tags: string[];
  onImport: (rows: Partial<CrmContact>[]) => Promise<{ created: number; updated: number; duplicatesInFile: number; unchanged: number }>;
  onDone: () => void;
}> = ({ contacts, onImport, onDone }) => {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [tagAll, setTagAll] = useState(`import-${new Date().toISOString().slice(0, 10)}`);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  const parsed: CsvParseResult | null = useMemo(() => (text.trim() ? parseContactsCsv(text) : null), [text]);
  const hasOptInCol = !!parsed?.columns.some(c => c.field === 'optin');
  const rows = useMemo(() => (parsed?.rows || []).map(r => ({
    ...r,
    tags: tagAll.trim() ? [...new Set([...(r.tags || []), tagAll.trim()])] : r.tags,
    ...(!hasOptInCol && consent ? { marketingOptIn: true } : {}),
  })), [parsed, tagAll, consent, hasOptInCol]);
  const plan = useMemo(() => (rows.length ? planImport(contacts, rows) : null), [contacts, rows]);

  const onFile = (f?: File | null) => {
    if (!f) return;
    setFileName(f.name); setDone(''); setErr('');
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f);
  };

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await onImport(rows);
      setDone(`Imported: ${r.created} new, ${r.updated} updated${r.duplicatesInFile ? `, ${r.duplicatesInFile} duplicate rows merged` : ''}${r.unchanged ? `, ${r.unchanged} already up to date` : ''}.`);
      setText(''); setFileName('');
    } catch (e: any) { setErr(e?.message || 'Import failed.'); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="crm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 className="crm-h crm-h2">Import from a spreadsheet</h3>
        <p className="crm-muted" style={{ margin: 0 }}>Columns we read: name (or first + last), email, phone, company, tags, address, city, state, zip, notes, birthday. Matching emails or phone numbers update the existing person instead of adding a duplicate — nothing you&rsquo;ve already entered is overwritten.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="crm-btn" style={{ cursor: 'pointer' }}>
            <Upload size={16} />Choose CSV
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
          </label>
          {fileName && <span className="crm-muted">{fileName}</span>}
        </div>
        <Field label="…or paste CSV text">
          <textarea className="crm-input" rows={6} value={text} onChange={e => { setText(e.target.value); setDone(''); }} placeholder={'name,email,phone,city,state,zip\nJordan Lee,jordan@example.com,555-0100,Austin,TX,78701'} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
        </Field>
        <div className="crm-grid2">
          <Field label="Tag everyone in this import"><input className="crm-input" value={tagAll} onChange={e => setTagAll(e.target.value)} /></Field>
          {!hasOptInCol && (
            <label className="crm-switch" style={{ alignSelf: 'end' }}>
              <span><span style={{ display: 'block', fontWeight: 600 }}>These people agreed to marketing</span><span className="crm-muted crm-small">Only switch on if you collected their consent.</span></span>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            </label>
          )}
        </div>
      </div>

      {parsed && (
        <div className="crm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {parsed.columns.map((c, i) => <span key={i} className={`crm-pill ${c.field ? 'crm-pill-accent' : 'crm-pill-lost'}`}>{c.header || '(blank)'}{c.field ? ` → ${c.field}` : ' · ignored'}</span>)}
          </div>
          {plan && (
            <div className="crm-num" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div className="crm-stat"><span className="crm-muted crm-small">New</span><b>{plan.creates.length}</b></div>
              <div className="crm-stat"><span className="crm-muted crm-small">Fill in existing</span><b>{plan.updates.length}</b></div>
              <div className="crm-stat"><span className="crm-muted crm-small">Duplicate rows</span><b>{plan.duplicatesInFile}</b></div>
              <div className="crm-stat"><span className="crm-muted crm-small">Already up to date</span><b>{plan.unchanged}</b></div>
            </div>
          )}
          {parsed.errors.length > 0 && (
            <div className="crm-note crm-warn">
              {parsed.errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
              {parsed.errors.length > 6 && <div className="crm-num">…and {parsed.errors.length - 6} more.</div>}
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="crm-num" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr className="crm-muted" style={{ textAlign: 'left' }}>{['Name', 'Email', 'Phone', 'City', 'Tags'].map(h => <th key={h} style={{ padding: '6px 8px', fontWeight: 500, borderBottom: '1px solid var(--crm-line)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      {[r.name, r.email, r.phone, r.address?.city, (r.tags || []).join(', ')].map((v, j) => <td key={j} style={{ padding: '6px 8px', borderBottom: '1px solid var(--crm-line)', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <div className="crm-muted crm-small crm-num" style={{ padding: 8 }}>+ {rows.length - 20} more rows</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="crm-btn crm-btn-primary" disabled={!plan || busy || (!plan.creates.length && !plan.updates.length)} onClick={run}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}Import {plan ? plan.creates.length + plan.updates.length : 0}
            </button>
          </div>
        </div>
      )}
      {err && <div className="crm-note crm-warn" role="alert">{err}</div>}
      {done && (
        <div className="crm-note" role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{done}</span>
          <button className="crm-btn" onClick={onDone}><Users size={16} />See people</button>
        </div>
      )}
    </div>
  );
};

export default BizCrm;


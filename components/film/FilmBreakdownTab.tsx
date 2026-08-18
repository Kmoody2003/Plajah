import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Check, ClipboardCheck, Download, FileText, Image, Paperclip, Plus, Printer, Search, Sparkles, Trash2, Users } from 'lucide-react';
import { useProd } from './FilmProductionSuite';
import * as FP from '../../services/filmProductionService';
import {
  BREAKDOWN_CATEGORIES, approveBreakdownElement, breakdownElementToTask, buildDepartmentBreakdownPacket, canManageBreakdown,
  fetchApprovedScriptDraft, mapDraftElementsToScenes, normalizeTextRange, patchBreakdownElement,
  putBreakdownElement, removeBreakdownAttachment, removeBreakdownOccurrence, stableBreakdownElementId,
  stableBreakdownOccurrenceId, subscribeBreakdownElements, suggestProductionBreakdown, updateBreakdownOccurrence,
  uploadBreakdownAttachment, type BreakdownAttachment, type BreakdownCategory, type BreakdownElement,
  type BreakdownOccurrence, type BreakdownStatus, type DepartmentBreakdownPacket,
} from '../../services/productionBreakdownService';
import { Actions, Button, Chip, Eyebrow, Input, Surface, Textarea } from '../ui';
import type { ScriptDraft } from '../../services/productionGraph';
import type { ScriptElement } from '../../types';
import { patchBreakdownWithAction, putTaskWithAction } from '../../services/productionActionService';

type View = 'SCRIPT' | 'ELEMENTS' | 'SCENES' | 'DOOD' | 'REPORTS';
const STATUSES: BreakdownStatus[] = ['SUGGESTED', 'APPROVED', 'ASSIGNED', 'READY', 'BLOCKED', 'OMITTED'];

export const FilmBreakdownTab: React.FC = () => {
  const { prod, scenes, members, can, isOwner } = useProd();
  const [elements, setElements] = useState<BreakdownElement[]>([]);
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [view, setView] = useState<View>('SCRIPT');
  const [sceneFilter, setSceneFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | BreakdownCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BreakdownStatus>('ALL');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedElementId, setExpandedElementId] = useState<string | null>(null);
  const [tagSelection, setTagSelection] = useState<{
    sourceElementId: string; sceneId: string; startOffset: number; endOffset: number; quote: string;
  } | null>(null);
  const uid = FP.currentUid() || '';
  const authorityDepartment = prod?.authority?.[uid]?.department;
  const [form, setForm] = useState({
    name: '', category: 'PROPS' as BreakdownCategory, department: 'ART' as FP.DeptKey,
    sceneId: '', quantity: '1', quote: '', continuityState: '', estimatedCost: '', vendor: '', notes: '',
  });

  useEffect(() => {
    if (!prod) return;
    return subscribeBreakdownElements(prod.id, setElements);
  }, [prod?.id]);

  useEffect(() => {
    let active = true;
    if (!prod?.currentDraftId) { setDraft(null); return; }
    fetchApprovedScriptDraft(prod.id, prod.currentDraftId)
      .then(value => { if (active) setDraft(value); })
      .catch(() => { if (active) setMessage('The approved script could not be loaded.'); });
    return () => { active = false; };
  }, [prod?.id, prod?.currentDraftId]);

  useEffect(() => {
    if (!form.sceneId && scenes[0]) setForm(current => ({ ...current, sceneId: scenes[0].id }));
  }, [scenes, form.sceneId]);

  const filtered = useMemo(() => elements.filter(element => {
    if (sceneFilter !== 'ALL' && !element.occurrences.some(occurrence => occurrence.sceneId === sceneFilter)) return false;
    if (categoryFilter !== 'ALL' && element.category !== categoryFilter) return false;
    if (statusFilter !== 'ALL' && element.status !== statusFilter) return false;
    if (search && !`${element.name} ${element.vendor || ''} ${element.notes || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [elements, sceneFilter, categoryFilter, statusFilter, search]);

  const canRunAi = !!prod && (isOwner || can('EDIT_SCRIPT_BREAKDOWN'));
  const canAdd = !!prod && (canRunAi || can('MANAGE_DEPARTMENT_BREAKDOWN'));
  const canViewAllReports = !!prod && (canRunAi || (can('MANAGE_REPORTS') && prod.authority?.[uid]?.roleKey !== 'DEPARTMENT_HEAD'));
  const draftSceneMap = useMemo(() => mapDraftElementsToScenes(draft?.elements || [], scenes), [draft, scenes]);
  const runAi = async () => {
    if (!prod) return;
    setAiBusy(true); setMessage('');
    try { const count = await suggestProductionBreakdown(prod.id); setMessage(`Pokee added or refreshed ${count} suggestions for human review.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Breakdown analysis failed.'); }
    finally { setAiBusy(false); }
  };

  const selectCategory = (category: BreakdownCategory) => {
    const meta = BREAKDOWN_CATEGORIES.find(item => item.id === category)!;
    setForm(current => ({ ...current, category, department: authorityDepartment || meta.department }));
  };

  const saveManual = async () => {
    if (!prod || !form.name.trim() || !form.sceneId) return;
    const scene = scenes.find(item => item.id === form.sceneId);
    if (!scene) return;
    const department = authorityDepartment && !canRunAi ? authorityDepartment : form.department;
    const now = Date.now();
    const id = stableBreakdownElementId(prod.id, form.category, form.name);
    const prior = elements.find(element => element.id === id);
    const occurrenceId = stableBreakdownOccurrenceId(
      id, scene.id, tagSelection?.sourceElementId, tagSelection?.startOffset, tagSelection?.endOffset,
    );
    const occurrence: BreakdownOccurrence = {
      id: occurrenceId, sceneId: scene.id, sceneNum: scene.sceneNum,
      quote: form.quote || undefined, quantity: Math.max(1, Number(form.quantity) || 1),
      sourceElementId: tagSelection?.sourceElementId,
      startOffset: tagSelection?.startOffset, endOffset: tagSelection?.endOffset,
    };
    const occurrences = prior?.occurrences.some(item => item.id === occurrenceId)
      ? prior.occurrences.map(item => item.id === occurrenceId ? occurrence : item)
      : [...(prior?.occurrences || []), occurrence];
    await putBreakdownElement(prod.id, {
      id, productionId: prod.id, name: form.name.trim(), category: form.category, department,
      status: 'APPROVED', occurrences,
      quantity: Math.max(1, Number(form.quantity) || 1), continuityState: form.continuityState || undefined,
      estimatedCost: Number(form.estimatedCost) || 0, vendor: form.vendor || undefined, notes: form.notes || undefined,
      dependencies: [], source: 'MANUAL', sourceDraftId: prod.currentDraftId,
      createdBy: prior?.createdBy || uid, approvedBy: uid, approvedAt: now, createdAt: prior?.createdAt || now, updatedAt: now,
    });
    setAdding(false);
    setTagSelection(null);
    setForm(current => ({ ...current, name: '', quantity: '1', quote: '', continuityState: '', estimatedCost: '', vendor: '', notes: '' }));
  };

  const selectScriptText = (element: ScriptElement, container: HTMLElement) => {
    if (!canAdd) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(container);
    prefix.setEnd(range.startContainer, range.startOffset);
    const normalized = normalizeTextRange(element.text, prefix.toString().length, prefix.toString().length + range.toString().length);
    const sceneId = draftSceneMap.get(element.id);
    if (!normalized || !sceneId) return;
    setTagSelection({ sourceElementId: element.id, sceneId, ...normalized });
    setForm(current => ({ ...current, sceneId, quote: normalized.quote, name: '' }));
    setAdding(true);
    setMessage('Selection captured. Name it, choose a category, and add it to the breakdown.');
  };

  const approve = async (element: BreakdownElement) => {
    if (!prod) return;
    try { await approveBreakdownElement(prod.id, element, uid); setMessage(`${element.name} approved.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not approve this element.'); }
  };

  const updateStatus = async (element: BreakdownElement, status: BreakdownStatus) => {
    if (!prod || !canManageBreakdown(prod, uid, element.department)) return;
    await patchBreakdownWithAction(prod.id, element, { status }, uid, members.find(member => member.uid === uid)?.name || prod.title);
  };

  const assign = async (element: BreakdownElement, memberId: string) => {
    if (!prod || !canManageBreakdown(prod, uid, element.department)) return;
    const member = members.find(item => item.id === memberId);
    await patchBreakdownElement(prod.id, element.id, { ownerMemberId: memberId || undefined, ownerRole: member?.role, status: memberId ? 'ASSIGNED' : 'APPROVED' });
  };

  const createTask = async (element: BreakdownElement) => {
    if (!prod || !can('MANAGE_TASKS')) return;
    const member = members.find(item => item.id === element.ownerMemberId);
    await putTaskWithAction(prod.id, breakdownElementToTask(element, member), uid, members.find(row => row.uid === uid)?.name || prod.title);
    setMessage(`Task created for ${element.name}.`);
  };

  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Element','Category','Department','Status','Scenes','Quantity','Owner','Vendor','Estimated Cost','Continuity']]
      .concat(filtered.map(element => [element.name, element.category, element.department, element.status, element.occurrences.map(item => item.sceneNum).join('; '), String(element.quantity), element.ownerRole || '', element.vendor || '', String(element.estimatedCost || 0), element.continuityState || '']));
    const blob = new Blob([rows.map(row => row.map(quote).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${prod?.title || 'production'}-breakdown.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (!prod) return null;
  const counts = {
    suggested: elements.filter(item => item.status === 'SUGGESTED').length,
    blocked: elements.filter(item => item.status === 'BLOCKED').length,
    ready: elements.filter(item => item.status === 'READY').length,
  };

  return (
    <div className="space-y-6">
      <Surface level={2} shape="hero" brand className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Eyebrow>Script to department work</Eyebrow><h2 className="type-title-lg mt-1">Production Breakdown</h2><p className="type-body-sm mt-1 text-white/55">Every element stays attached to stable scenes, owned by the responsible department, and reviewed by a person before it becomes production truth.</p></div>
          <Actions>
            <Button variant="secondary" icon={<Sparkles />} loading={aiBusy} disabled={!canRunAi || !prod.currentDraftId} onClick={runAi}>Suggest with Pokee</Button>
            <Button variant="primary" icon={<Plus />} disabled={!canAdd} onClick={() => setAdding(true)}>New element</Button>
          </Actions>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Elements', elements.length], ['Needs review', counts.suggested], ['Blocked', counts.blocked], ['Ready', counts.ready]].map(([label, value]) => <Surface key={label} level={1}><Eyebrow>{label}</Eyebrow><p className="type-title-md mt-1">{value}</p></Surface>)}
        </div>
        {message && <p className="type-body-sm text-white/60" role="status">{message}</p>}
      </Surface>

      <div className="flex flex-wrap items-center gap-2">
        {(['SCRIPT','ELEMENTS','SCENES','DOOD','REPORTS'] as View[]).map(item => <Chip key={item} interactive selected={view === item} onClick={() => setView(item)}>{item === 'DOOD' ? 'Cast DOOD' : item[0] + item.slice(1).toLowerCase()}</Chip>)}
        <div className="ml-auto flex gap-2"><Button variant="ghost" size="sm" icon={<Download />} onClick={exportCsv}>CSV</Button><Button variant="ghost" size="sm" icon={<Printer />} onClick={() => window.print()}>Print / PDF</Button></div>
      </div>

      {adding && (
        <Surface level={3} shape="sheet" className="space-y-4">
          <div><Eyebrow>{tagSelection ? 'Selected from approved script' : 'Human-approved element'}</Eyebrow>{tagSelection && <blockquote className="type-body-md mt-2 border-l-2 border-orange-400 pl-3 text-white/75">“{tagSelection.quote}”</blockquote>}</div>
          <div className="grid md:grid-cols-2 gap-3"><Input label="Element name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /><Input label="Quantity" type="number" min="1" value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} /></div>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="type-label-lg">Category<select className="pj-input mt-2" value={form.category} onChange={event => selectCategory(event.target.value as BreakdownCategory)}>{BREAKDOWN_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="type-label-lg">Department<select className="pj-input mt-2" disabled={!!authorityDepartment && !canRunAi} value={authorityDepartment && !canRunAi ? authorityDepartment : form.department} onChange={event => setForm(current => ({ ...current, department: event.target.value as FP.DeptKey }))}>{FP.DEPARTMENTS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <label className="type-label-lg">Scene<select className="pj-input mt-2" value={form.sceneId} onChange={event => setForm(current => ({ ...current, sceneId: event.target.value }))}>{scenes.map(scene => <option key={scene.id} value={scene.id}>#{scene.sceneNum} · {scene.set}</option>)}</select></label>
          </div>
          <Textarea label="Script evidence / note" value={form.quote} onChange={event => setForm(current => ({ ...current, quote: event.target.value }))} />
          <div className="grid md:grid-cols-3 gap-3"><Input label="Continuity state" value={form.continuityState} onChange={event => setForm(current => ({ ...current, continuityState: event.target.value }))} /><Input label="Vendor" value={form.vendor} onChange={event => setForm(current => ({ ...current, vendor: event.target.value }))} /><Input label="Estimated cost" type="number" value={form.estimatedCost} onChange={event => setForm(current => ({ ...current, estimatedCost: event.target.value }))} /></div>
          <Textarea label="Preparation notes" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />
          <Actions><Button variant="ghost" onClick={() => { setAdding(false); setTagSelection(null); }}>Cancel</Button><Button variant="primary" icon={<Check />} disabled={!form.name.trim() || !form.sceneId} onClick={saveManual}>Add approved element</Button></Actions>
        </Surface>
      )}

      <Surface level={1} className="space-y-3">
        <div className="grid md:grid-cols-4 gap-2">
          <div className="relative"><Search size={14} className="absolute left-3 top-3 text-white/30" /><input className="pj-input pl-9" aria-label="Search breakdown" placeholder="Search elements" value={search} onChange={event => setSearch(event.target.value)} /></div>
          <select className="pj-input" value={sceneFilter} onChange={event => setSceneFilter(event.target.value)}><option value="ALL">All scenes</option>{scenes.map(scene => <option key={scene.id} value={scene.id}>Scene {scene.sceneNum}</option>)}</select>
          <select className="pj-input" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value as any)}><option value="ALL">All categories</option>{BREAKDOWN_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select className="pj-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value as any)}><option value="ALL">All statuses</option>{STATUSES.map(item => <option key={item} value={item}>{item.replace('_',' ')}</option>)}</select>
        </div>
      </Surface>

      {view === 'SCRIPT' ? <ScriptTaggingReader draft={draft} scenes={scenes} elementSceneMap={draftSceneMap} canTag={canAdd} onSelect={selectScriptText} /> : view === 'REPORTS' ? <DepartmentReports production={prod} elements={elements} scenes={scenes} authorityDepartment={authorityDepartment} canViewAll={canViewAllReports} /> : view === 'DOOD' ? <CastDood elements={filtered} scenes={scenes} /> : view === 'SCENES' ? <SceneBreakdown elements={filtered} scenes={scenes} /> : (
        <div className="space-y-3">
          {filtered.map(element => {
            const editable = canManageBreakdown(prod, uid, element.department);
            const departmentMembers = members.filter(member => member.dept === element.department);
            return (
              <Surface key={element.id} level={element.status === 'SUGGESTED' ? 2 : 1} brand={element.status === 'SUGGESTED'} className="space-y-3">
                <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Chip brand={element.status === 'SUGGESTED'}>{element.category.replace('_',' ')}</Chip><Chip>{FP.deptMeta(element.department).label}</Chip><Chip>{element.status}</Chip>{element.source === 'AI' && <Chip><Bot size={11} /> {Math.round((element.confidence || 0) * 100)}%</Chip>}</div><h3 className="type-title-sm mt-2">{element.name}</h3><p className="type-body-sm mt-1 text-white/50">Scenes {element.occurrences.map(item => item.sceneNum).join(', ')} · Qty {element.quantity}{element.vendor ? ` · ${element.vendor}` : ''}{element.estimatedCost ? ` · $${element.estimatedCost.toLocaleString()}` : ''}</p></div>{element.status === 'SUGGESTED' && editable && <Button variant="success" size="sm" icon={<ClipboardCheck />} onClick={() => approve(element)}>Approve</Button>}</div>
                {element.occurrences.some(item => item.quote) && <p className="type-body-sm text-white/45">“{element.occurrences.find(item => item.quote)?.quote}”</p>}
                {element.notes && <p className="type-body-sm flex gap-2 text-white/55"><AlertTriangle size={14} className="text-amber-400 shrink-0" />{element.notes}</p>}
                {element.status !== 'SUGGESTED' && <div className="grid md:grid-cols-4 gap-2"><select className="pj-input" disabled={!editable} value={element.status} onChange={event => updateStatus(element, event.target.value as BreakdownStatus)}>{STATUSES.filter(item => item !== 'SUGGESTED').map(item => <option key={item} value={item}>{item}</option>)}</select><select className="pj-input" disabled={!editable} value={element.ownerMemberId || ''} onChange={event => assign(element, event.target.value)}><option value="">Unassigned</option>{departmentMembers.map(member => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select><Button variant="secondary" disabled={!can('MANAGE_TASKS')} onClick={() => createTask(element)}>Create task</Button><Button variant="outline" icon={<Paperclip />} onClick={() => setExpandedElementId(current => current === element.id ? null : element.id)}>{expandedElementId === element.id ? 'Close details' : `Details · ${element.attachments?.length || 0}`}</Button></div>}
                {expandedElementId === element.id && <ElementDetails productionId={prod.id} element={element} actorUid={uid} editable={editable} scenes={scenes} onMessage={setMessage} />}
              </Surface>
            );
          })}
          {!filtered.length && <Surface level={1} className="text-center py-12"><Sparkles size={24} className="mx-auto text-white/25" /><p className="type-title-sm mt-3">No matching breakdown elements</p><p className="type-body-sm mt-1 text-white/45">Add one manually or run Pokee suggestions from the approved script.</p></Surface>}
        </div>
      )}
    </div>
  );
};

const ScriptTaggingReader: React.FC<{
  draft: ScriptDraft | null;
  scenes: FP.ProductionScene[];
  elementSceneMap: Map<string, string>;
  canTag: boolean;
  onSelect: (element: ScriptElement, container: HTMLElement) => void;
}> = ({ draft, scenes, elementSceneMap, canTag, onSelect }) => {
  const sceneById = useMemo(() => new Map(scenes.map(scene => [scene.id, scene])), [scenes]);
  if (!draft) return <Surface level={1} className="py-12 text-center"><ClapperboardIcon /><p className="type-title-sm mt-3">Greenlight a script to begin tagging</p><p className="type-body-sm mt-1 text-white/45">The immutable approved draft becomes the source for every production element.</p></Surface>;
  return (
    <Surface level={1} className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div><Eyebrow>Approved draft · {draft.revisionLabel}</Eyebrow><h3 className="type-title-md mt-1">{draft.title}</h3></div>
        <Chip brand>{canTag ? 'Select text to tag' : 'Read only'}</Chip>
      </div>
      <div className="mx-auto max-w-[720px] rounded-[var(--pj-radius-lg)] bg-[#f6f2e9] px-6 py-10 text-[#171717] shadow-2xl md:px-12">
        {draft.elements.map(element => {
          const scene = sceneById.get(elementSceneMap.get(element.id) || '');
          const classes = scriptElementClasses(element.type);
          return <div key={element.id} className="relative">
            {element.type === 'SCENE_HEADING' && scene && <span className="absolute -left-9 top-0 font-mono text-[10px] font-bold text-black/40">{scene.sceneNum}</span>}
            <div
              data-script-element-id={element.id}
              className={`${classes} ${canTag ? 'cursor-text selection:bg-orange-300/80' : ''}`}
              onMouseUp={event => onSelect(element, event.currentTarget)}
            >{element.text || '\u00a0'}</div>
          </div>;
        })}
      </div>
    </Surface>
  );
};

const ClapperboardIcon = () => <Sparkles size={24} className="mx-auto text-white/25" />;

function scriptElementClasses(type: ScriptElement['type']): string {
  const base = 'whitespace-pre-wrap font-mono text-[13px] leading-6';
  if (type === 'SCENE_HEADING') return `${base} mt-7 font-black uppercase`;
  if (type === 'CHARACTER') return `${base} mt-4 ml-[38%] uppercase`;
  if (type === 'DIALOGUE') return `${base} mx-[18%]`;
  if (type === 'PARENTHETICAL') return `${base} mx-[28%]`;
  if (type === 'TRANSITION') return `${base} mt-4 text-right uppercase`;
  if (type === 'SHOT') return `${base} mt-4 font-bold uppercase`;
  return `${base} mt-3`;
}

const ElementDetails: React.FC<{
  productionId: string; element: BreakdownElement; actorUid: string; editable: boolean;
  scenes: FP.ProductionScene[]; onMessage: (message: string) => void;
}> = ({ productionId, element, actorUid, editable, scenes, onMessage }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const upload = async (file?: File) => {
    if (!file || !editable) return;
    setUploading(true); setProgress(0);
    try { await uploadBreakdownAttachment(productionId, element, actorUid, file, setProgress); onMessage(`${file.name} attached to ${element.name}.`); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Attachment upload failed.'); }
    finally { setUploading(false); }
  };
  const removeAttachment = async (attachment: BreakdownAttachment) => {
    try { await removeBreakdownAttachment(productionId, element, actorUid, attachment); onMessage(`${attachment.name} removed.`); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Could not remove the attachment.'); }
  };
  return (
    <Surface level={2} className="space-y-4">
      <div><Eyebrow>Scene occurrences</Eyebrow><div className="mt-3 space-y-3">{element.occurrences.map(occurrence => <OccurrenceEditor key={occurrence.id} productionId={productionId} element={element} occurrence={occurrence} actorUid={actorUid} editable={editable} scene={scenes.find(scene => scene.id === occurrence.sceneId)} onMessage={onMessage} />)}</div></div>
      <div className="border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><Eyebrow>Media & documents</Eyebrow><p className="type-body-sm mt-1 text-white/45">Reference photos, diagrams, quotes, permits, and department paperwork · 25 MB each.</p></div>{editable && <label className="pj-btn pj-btn--secondary pj-btn--sm tap cursor-pointer"><Paperclip size={14} />{uploading ? `Uploading ${progress}%` : 'Attach file'}<input className="sr-only" type="file" disabled={uploading} accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx" onChange={event => { upload(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{(element.attachments || []).map(attachment => <Surface key={attachment.id} level={1} className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5">{attachment.kind === 'MEDIA' ? <Image size={16} /> : <FileText size={16} />}</div><a className="min-w-0 flex-1" href={attachment.url} target="_blank" rel="noreferrer"><p className="truncate type-label-lg text-white/80">{attachment.name}</p><p className="type-body-sm text-white/35">{attachment.kind} · {formatBytes(attachment.size)}</p></a>{editable && <Button variant="danger-quiet" size="xs" iconOnly aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment)}><Trash2 /></Button>}</Surface>)}{!element.attachments?.length && <p className="type-body-sm text-white/35">No files attached yet.</p>}</div>
      </div>
    </Surface>
  );
};

const OccurrenceEditor: React.FC<{
  productionId: string; element: BreakdownElement; occurrence: BreakdownOccurrence; actorUid: string;
  editable: boolean; scene?: FP.ProductionScene; onMessage: (message: string) => void;
}> = ({ productionId, element, occurrence, actorUid, editable, scene, onMessage }) => {
  const [draft, setDraft] = useState({ quote: occurrence.quote || '', quantity: String(occurrence.quantity), notes: occurrence.notes || '' });
  useEffect(() => setDraft({ quote: occurrence.quote || '', quantity: String(occurrence.quantity), notes: occurrence.notes || '' }), [occurrence.quote, occurrence.quantity, occurrence.notes]);
  const save = async () => {
    try { await updateBreakdownOccurrence(productionId, element, actorUid, occurrence.id, { quote: draft.quote, quantity: Number(draft.quantity) || 1, notes: draft.notes }); onMessage(`Scene ${occurrence.sceneNum} occurrence updated.`); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Could not update the occurrence.'); }
  };
  const remove = async () => {
    try { await removeBreakdownOccurrence(productionId, element, actorUid, occurrence.id); onMessage(`Scene ${occurrence.sceneNum} occurrence removed.`); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Could not remove the occurrence.'); }
  };
  return <Surface level={1} className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="type-label-lg">Scene {occurrence.sceneNum} · {scene?.set || 'Approved script'}</p>{occurrence.sourceElementId && <p className="type-body-sm text-white/35">Anchored range {occurrence.startOffset ?? '—'}–{occurrence.endOffset ?? '—'}</p>}</div><Chip>{occurrence.quantity} needed</Chip></div><Textarea label="Script evidence" disabled={!editable} value={draft.quote} onChange={event => setDraft(current => ({ ...current, quote: event.target.value }))} /><div className="grid gap-3 md:grid-cols-[140px_1fr]"><Input label="Scene quantity" type="number" min="1" disabled={!editable} value={draft.quantity} onChange={event => setDraft(current => ({ ...current, quantity: event.target.value }))} /><Input label="Occurrence notes" disabled={!editable} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></div>{editable && <Actions><Button variant="danger-quiet" size="sm" disabled={element.occurrences.length <= 1} onClick={remove}>Remove occurrence</Button><Button variant="secondary" size="sm" icon={<Check />} onClick={save}>Save occurrence</Button></Actions>}</Surface>;
};

const DepartmentReports: React.FC<{
  production: FP.Production; elements: BreakdownElement[]; scenes: FP.ProductionScene[];
  authorityDepartment?: FP.DeptKey; canViewAll: boolean;
}> = ({ production, elements, scenes, authorityDepartment, canViewAll }) => {
  const elementDepartments = [...new Set(elements.map(element => element.department))];
  const allowed = canViewAll ? (elementDepartments.length ? elementDepartments : FP.DEPARTMENTS.map(item => item.key)) : authorityDepartment ? [authorityDepartment] : [];
  const [department, setDepartment] = useState<FP.DeptKey>(allowed[0] || 'OTHER');
  useEffect(() => { if (!allowed.includes(department) && allowed[0]) setDepartment(allowed[0]); }, [allowed.join('|'), department]);
  if (!allowed.length) return <Surface level={1} className="py-12 text-center"><FileText size={24} className="mx-auto text-white/25"/><p className="type-title-sm mt-3">No department report access</p><p className="type-body-sm mt-1 text-white/45">Your production role has not been assigned a reportable department.</p></Surface>;
  const packet = buildDepartmentBreakdownPacket(production, department, elements, scenes);
  return <div className="space-y-4"><Surface level={2} shape="hero" brand><div className="flex flex-wrap items-end justify-between gap-4"><div><Eyebrow>Department packet</Eyebrow><h3 className="type-title-lg mt-1">{packet.departmentLabel} Breakdown</h3><p className="type-body-sm mt-1 text-white/50">A role-scoped preparation packet generated from approved production truth.</p></div><Actions><select className="pj-input" value={department} onChange={event => setDepartment(event.target.value as FP.DeptKey)}>{allowed.map(key => <option key={key} value={key}>{FP.deptMeta(key).label}</option>)}</select><Button variant="secondary" icon={<Download />} onClick={() => downloadDepartmentCsv(packet)}>CSV</Button><Button variant="primary" icon={<Printer />} onClick={() => printDepartmentPacket(packet)}>Print packet</Button></Actions></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">{[['Elements',packet.summary.total],['Ready',packet.summary.ready],['Blocked',packet.summary.blocked],['Unassigned',packet.summary.unassigned],['Estimated',`$${packet.summary.estimatedCost.toLocaleString()}`]].map(([label,value]) => <Surface key={label} level={1}><Eyebrow>{label}</Eyebrow><p className="type-title-sm mt-1">{value}</p></Surface>)}</div></Surface><div className="space-y-3">{packet.scenes.map(scene => <Surface key={scene.sceneId} level={1}><div className="flex justify-between gap-3"><div><Eyebrow>Scene {scene.sceneNum}</Eyebrow><h4 className="type-title-sm mt-1">{scene.heading}</h4></div><Chip>{scene.elements.length} elements</Chip></div><div className="mt-3 divide-y divide-white/5">{scene.elements.map(element => <div key={element.id} className="grid gap-2 py-3 md:grid-cols-[1fr_120px_120px]"><div><p className="type-label-lg">{element.name}</p><p className="type-body-sm text-white/40">{element.category.replaceAll('_',' ')} · Qty {element.quantity}{element.ownerRole ? ` · ${element.ownerRole}` : ''}{element.attachmentCount ? ` · ${element.attachmentCount} files` : ''}</p>{element.evidence[0] && <p className="type-body-sm mt-1 text-white/50">“{element.evidence[0]}”</p>}</div><Chip brand={element.status === 'BLOCKED'}>{element.status}</Chip><span className="type-body-sm text-white/50">{element.vendor || 'No vendor'}</span></div>)}</div></Surface>)}{!packet.scenes.length && <Surface level={1} className="py-10 text-center"><p className="type-body-sm text-white/40">No active elements for this department.</p></Surface>}</div></div>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadDepartmentCsv(packet: DepartmentBreakdownPacket) {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['Scene','Heading','Element','Category','Status','Quantity','Owner','Vendor','Estimated Cost','Continuity','Evidence','Attachments'], ...packet.scenes.flatMap(scene => scene.elements.map(element => [scene.sceneNum, scene.heading, element.name, element.category, element.status, element.quantity, element.ownerRole || '', element.vendor || '', element.estimatedCost || 0, element.continuityState || '', element.evidence.join(' | '), element.attachmentCount]))];
  const blob = new Blob([rows.map(row => row.map(quote).join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${packet.productionTitle}-${packet.department}-breakdown.csv`; anchor.click(); URL.revokeObjectURL(url);
}

function printDepartmentPacket(packet: DepartmentBreakdownPacket) {
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]!));
  const popup = window.open('', '_blank');
  if (!popup) return;
  popup.opener = null;
  popup.document.write(`<!doctype html><html><head><title>${escape(packet.productionTitle)} · ${escape(packet.departmentLabel)}</title><style>body{font-family:Arial,sans-serif;color:#171717;margin:36px}h1{margin-bottom:4px}.meta{color:#666}.summary{display:flex;gap:24px;padding:16px 0;border-bottom:2px solid #111}.scene{break-inside:avoid;margin-top:24px}.item{display:grid;grid-template-columns:1fr 100px 70px;gap:12px;border-top:1px solid #ddd;padding:10px 0}.small{font-size:12px;color:#555}@media print{button{display:none}}</style></head><body><h1>${escape(packet.productionTitle)}</h1><p class="meta">${escape(packet.departmentLabel)} Breakdown · ${new Date(packet.generatedAt).toLocaleString()}</p><div class="summary"><b>${packet.summary.total} elements</b><span>${packet.summary.ready} ready</span><span>${packet.summary.blocked} blocked</span><span>${packet.summary.unassigned} unassigned</span><span>$${packet.summary.estimatedCost.toLocaleString()} estimated</span></div>${packet.scenes.map(scene => `<section class="scene"><h2>Scene ${escape(scene.sceneNum)} · ${escape(scene.heading)}</h2>${scene.elements.map(element => `<div class="item"><div><b>${escape(element.name)}</b><div class="small">${escape(element.category.replaceAll('_',' '))}${element.ownerRole ? ` · ${escape(element.ownerRole)}` : ''}${element.vendor ? ` · ${escape(element.vendor)}` : ''}</div>${element.evidence[0] ? `<p>“${escape(element.evidence[0])}”</p>` : ''}</div><b>${escape(element.status)}</b><span>Qty ${escape(element.quantity)}</span></div>`).join('')}</section>`).join('')}<script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

const SceneBreakdown: React.FC<{ elements: BreakdownElement[]; scenes: FP.ProductionScene[] }> = ({ elements, scenes }) => (
  <div className="space-y-4">{scenes.map(scene => { const rows = elements.filter(element => element.occurrences.some(item => item.sceneId === scene.id)); return <Surface key={scene.id} level={1}><div className="flex justify-between gap-3"><div><Eyebrow>Scene {scene.sceneNum}</Eyebrow><h3 className="type-title-sm mt-1">{scene.intExt}. {scene.set} — {scene.dayNight}</h3></div><Chip>{rows.length} elements</Chip></div><div className="flex flex-wrap gap-2 mt-3">{rows.map(element => <Chip key={element.id} brand={element.status === 'BLOCKED'}>{element.name} · {element.status}</Chip>)}</div></Surface>; })}</div>
);

const CastDood: React.FC<{ elements: BreakdownElement[]; scenes: FP.ProductionScene[] }> = ({ elements, scenes }) => {
  const cast = elements.filter(element => element.category === 'CAST' || element.category === 'EXTRAS');
  return <Surface level={1} padded={false} className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-white/10"><th className="p-3 type-label-lg">Cast / group</th>{scenes.map(scene => <th key={scene.id} className="p-3 type-label-lg text-center">Sc {scene.sceneNum}<br/><span className="text-white/35">Day {scene.shootDay || '—'}</span></th>)}</tr></thead><tbody>{cast.map(element => <tr key={element.id} className="border-b border-white/5"><td className="p-3"><p className="type-label-lg">{element.name}</p><p className="type-body-sm text-white/35">{element.status}</p></td>{scenes.map(scene => <td key={scene.id} className="p-3 text-center">{element.occurrences.some(item => item.sceneId === scene.id) ? <Users size={15} className="inline text-violet-400" /> : <span className="text-white/15">—</span>}</td>)}</tr>)}</tbody></table>{!cast.length && <p className="p-8 text-center type-body-sm text-white/40">No cast breakdown elements have been approved yet.</p>}</Surface>;
};

export default FilmBreakdownTab;

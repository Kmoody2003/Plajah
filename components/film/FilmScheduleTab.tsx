import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronUp, Copy, FileText, GripVertical, MapPin, Plus, Save, Sparkles, Trash2, Truck, Users } from 'lucide-react';
import { useProd } from './FilmProductionSuite';
import * as FP from '../../services/filmProductionService';
import { subscribeBreakdownElements, type BreakdownElement } from '../../services/productionBreakdownService';
import {
  addScheduleDay, addScheduleMarker, analyzeSchedule, approveSchedulePlan, cloneSchedulePlan,
  createSchedulePlan, generateCallSheetsFromApprovedSchedule, moveScheduleStrip, putScheduleConstraint,
  putSchedulePlan, removeScheduleConstraint, subscribeScheduleConstraints, subscribeSchedulePlans,
  type ScheduleConflict, type ScheduleConstraint, type ScheduleConstraintType, type SchedulePlan, type ScheduleStrip,
} from '../../services/productionScheduleService';
import { Actions, Button, Chip, Eyebrow, Input, Surface, Textarea } from '../ui';
import { analyzeScheduleImpact } from '../../services/productionActionService';

export const FilmScheduleTab: React.FC = () => {
  const { prod, scenes, members, locations, clearances, tasks, can, goTab } = useProd();
  const [plans, setPlans] = useState<SchedulePlan[]>([]);
  const [constraints, setConstraints] = useState<ScheduleConstraint[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownElement[]>([]);
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState<SchedulePlan | null>(null);
  const [message, setMessage] = useState('');
  const [constraintOpen, setConstraintOpen] = useState(false);
  const [constraintForm, setConstraintForm] = useState({ type: 'MEMBER_UNAVAILABLE' as ScheduleConstraintType, label: '', memberId: '', locationId: '', sceneId: '', date: '', dayNumber: '', severity: 'HARD' as 'HARD' | 'SOFT', notes: '' });
  const actorUid = FP.currentUid() || '';
  const canSchedule = can('MANAGE_SCHEDULE');
  const canCalls = can('MANAGE_CALL_SHEETS');

  useEffect(() => {
    if (!prod) return;
    return subscribeSchedulePlans(prod.id, setPlans);
  }, [prod?.id]);
  useEffect(() => {
    if (!prod) return;
    return subscribeScheduleConstraints(prod.id, setConstraints);
  }, [prod?.id]);
  useEffect(() => {
    if (!prod) return;
    return subscribeBreakdownElements(prod.id, setBreakdown);
  }, [prod?.id]);
  useEffect(() => {
    if (!plans.length) { setActiveId(''); setDraft(null); return; }
    const selected = plans.find(plan => plan.id === activeId) || plans.find(plan => plan.id === prod?.approvedScheduleId) || plans[0];
    setActiveId(selected.id); setDraft(selected);
  }, [plans, activeId, prod?.approvedScheduleId]);

  const conflicts = useMemo(() => draft && prod ? analyzeSchedule(draft, prod, scenes, members, locations, breakdown, constraints, clearances) : [], [draft, prod, scenes, members, locations, breakdown, constraints, clearances]);
  const blocking = conflicts.filter(conflict => conflict.severity === 'ERROR');
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(plans.find(plan => plan.id === draft.id));
  const approvalImpact = useMemo(() => draft && prod ? analyzeScheduleImpact(prod, draft, scenes, members, plans.find(plan => plan.status === 'APPROVED' && plan.id !== draft.id)) : null, [draft, prod, scenes, members, plans]);

  if (!prod) return null;
  const startPlan = async () => {
    const plan = createSchedulePlan(prod, scenes, actorUid);
    await putSchedulePlan(prod.id, plan); setActiveId(plan.id); setDraft(plan);
  };
  const save = async () => { if (draft) { await putSchedulePlan(prod.id, draft); setMessage('Schedule saved.'); } };
  const duplicate = async () => {
    if (!draft) return;
    const alternate = cloneSchedulePlan(draft, actorUid, `${draft.label} Alternate`);
    await putSchedulePlan(prod.id, alternate); setActiveId(alternate.id); setDraft(alternate); setMessage('Alternate schedule created.');
  };
  const approve = async () => {
    if (!draft || blocking.length) return;
    try { await approveSchedulePlan(prod.id, draft, actorUid); setMessage(`${draft.label} approved as production truth.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not approve the schedule.'); }
  };
  const generate = async () => {
    if (!draft) return;
    try { const sheets = await generateCallSheetsFromApprovedSchedule(prod, draft, scenes, members, locations, actorUid); setMessage(`${sheets.length} schedule-linked call sheets generated.`); goTab('film_callsheets'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not generate call sheets.'); }
  };
  const addConstraint = async () => {
    if (!constraintForm.label.trim()) return;
    const row: ScheduleConstraint = {
      id: `constraint_${FP.uid8()}`, productionId: prod.id, type: constraintForm.type,
      label: constraintForm.label.trim(), severity: constraintForm.severity,
      memberId: constraintForm.type === 'MEMBER_UNAVAILABLE' ? constraintForm.memberId || undefined : undefined,
      locationId: constraintForm.type === 'LOCATION_UNAVAILABLE' ? constraintForm.locationId || undefined : undefined,
      sceneId: constraintForm.type === 'SCENE_RESTRICTION' ? constraintForm.sceneId || undefined : undefined,
      date: constraintForm.date || undefined, dayNumber: Number(constraintForm.dayNumber) || undefined,
      notes: constraintForm.notes || undefined, createdBy: actorUid, createdAt: Date.now(),
    };
    await putScheduleConstraint(prod.id, row); setConstraintOpen(false); setConstraintForm(current => ({ ...current, label: '', notes: '', date: '', dayNumber: '' }));
  };

  return <div className="space-y-5">
    <Surface level={2} shape="hero" brand className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Eyebrow>Plan production from shared truth</Eyebrow><h2 className="type-title-lg mt-1">Versioned Stripboard</h2><p className="type-body-sm mt-1 max-w-3xl text-white/55">Arrange stable scenes, compare alternates, expose conflicts, and approve one schedule before call sheets can be generated.</p></div><Actions>{draft && <Button variant="secondary" icon={<Copy />} disabled={!canSchedule} onClick={duplicate}>Create alternate</Button>}{!draft && <Button variant="primary" icon={<Plus />} disabled={!canSchedule || !scenes.length} onClick={startPlan}>Build first schedule</Button>}</Actions></div>
      {draft && <div className="flex flex-wrap items-center gap-2"><select className="pj-input max-w-xs" value={draft.id} onChange={event => { const selected = plans.find(plan => plan.id === event.target.value); if (selected) { setActiveId(selected.id); setDraft(selected); } }}>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.label} · v{plan.version} · {plan.status}</option>)}</select><Chip brand={draft.status === 'APPROVED'}>{draft.status}</Chip><Chip>{draft.days.length} days</Chip><Chip brand={blocking.length > 0}>{blocking.length} blockers</Chip><Chip>{conflicts.filter(item => item.severity === 'WARNING').length} warnings</Chip></div>}
      {message && <p role="status" className="type-body-sm text-white/60">{message}</p>}
    </Surface>

    {!draft ? <Surface level={1} className="py-14 text-center"><CalendarDays size={28} className="mx-auto text-white/25"/><p className="type-title-sm mt-3">No schedule version yet</p><p className="type-body-sm mt-1 text-white/45">Greenlit scenes become strips when a schedule manager creates the first plan.</p></Surface> : <>
      <Surface level={1} className="flex flex-wrap items-end gap-3"><Input label="Plan name" disabled={draft.status !== 'DRAFT' || !canSchedule} value={draft.label} onChange={event => setDraft(current => current ? { ...current, label: event.target.value } : current)} /><Actions><Button variant="outline" icon={<Plus />} disabled={draft.status !== 'DRAFT' || !canSchedule} onClick={() => setDraft(current => current ? addScheduleDay(current) : current)}>Add shoot day</Button><Button variant="secondary" icon={<Save />} disabled={!dirty || !canSchedule} onClick={save}>Save version</Button>{draft.status === 'DRAFT' ? <Button variant="primary" icon={<Check />} disabled={!canSchedule || blocking.length > 0 || dirty} onClick={approve}>Approve schedule</Button> : draft.status === 'APPROVED' ? <Button variant="primary" icon={<FileText />} disabled={!canCalls} onClick={generate}>Generate call sheets</Button> : null}</Actions></Surface>

      {draft.status === 'DRAFT' && approvalImpact && <Surface level={2} brand><div className="flex items-start gap-3"><div className="pj-icon-container"><Sparkles size={18} /></div><div className="min-w-0"><Eyebrow>Change impact before approval</Eyebrow><h3 className="type-title-sm mt-1">{approvalImpact.headline}</h3><p className="type-body-sm mt-2 text-[var(--text-secondary)]">Approval will route a live schedule card to Announcements and Schedule & Calls, then request acknowledgement from {approvalImpact.affectedUids.length} active people.</p></div></div><div className="grid md:grid-cols-2 gap-3 mt-4"><Surface level={1}><Eyebrow>Downstream effects</Eyebrow>{approvalImpact.consequences.map(row => <p key={row} className="type-body-sm mt-2">• {row}</p>)}</Surface><Surface level={1}><Eyebrow>Review flags</Eyebrow>{approvalImpact.risks.length ? approvalImpact.risks.map(row => <p key={row} className="type-body-sm mt-2 text-amber-300">• {row}</p>) : <p className="type-body-sm mt-2 text-emerald-300">No additional workflow risks detected.</p>}</Surface></div></Surface>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]"><div className="space-y-4">{[...draft.days].sort((a,b) => a.dayNumber - b.dayNumber).map(day => <ScheduleDayColumn key={day.id} productionId={prod.id} day={day} plan={draft} scenes={scenes} tasks={tasks} canEdit={canSchedule && draft.status === 'DRAFT'} conflicts={conflicts.filter(conflict => conflict.dayId === day.id)} onPlan={setDraft} />)}</div><div className="space-y-4"><ConflictPanel conflicts={conflicts} /><ConstraintPanel constraints={constraints} productionId={prod.id} canEdit={canSchedule} onOpen={() => setConstraintOpen(current => !current)} />{constraintOpen && <Surface level={2} className="space-y-3"><Eyebrow>Add availability or production constraint</Eyebrow><label className="type-label-lg">Type<select className="pj-input mt-2" value={constraintForm.type} onChange={event => setConstraintForm(current => ({ ...current, type: event.target.value as ScheduleConstraintType }))}><option value="MEMBER_UNAVAILABLE">Cast / crew unavailable</option><option value="LOCATION_UNAVAILABLE">Location unavailable</option><option value="SCENE_RESTRICTION">Scene restriction</option></select></label><Input label="Constraint label" value={constraintForm.label} onChange={event => setConstraintForm(current => ({ ...current, label: event.target.value }))}/>{constraintForm.type === 'MEMBER_UNAVAILABLE' && <label className="type-label-lg">Person<select className="pj-input mt-2" value={constraintForm.memberId} onChange={event => setConstraintForm(current => ({ ...current, memberId: event.target.value }))}><option value="">Choose person</option>{members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>}{constraintForm.type === 'LOCATION_UNAVAILABLE' && <label className="type-label-lg">Location<select className="pj-input mt-2" value={constraintForm.locationId} onChange={event => setConstraintForm(current => ({ ...current, locationId: event.target.value }))}><option value="">Choose location</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}{constraintForm.type === 'SCENE_RESTRICTION' && <label className="type-label-lg">Scene<select className="pj-input mt-2" value={constraintForm.sceneId} onChange={event => setConstraintForm(current => ({ ...current, sceneId: event.target.value }))}><option value="">Choose scene</option>{scenes.map(scene => <option key={scene.id} value={scene.id}>#{scene.sceneNum} · {scene.set}</option>)}</select></label>}<div className="grid grid-cols-2 gap-2"><Input label="Date" type="date" value={constraintForm.date} onChange={event => setConstraintForm(current => ({ ...current, date: event.target.value }))}/><Input label="Shoot day" type="number" min="1" value={constraintForm.dayNumber} onChange={event => setConstraintForm(current => ({ ...current, dayNumber: event.target.value }))}/></div><label className="type-label-lg">Severity<select className="pj-input mt-2" value={constraintForm.severity} onChange={event => setConstraintForm(current => ({ ...current, severity: event.target.value as 'HARD'|'SOFT' }))}><option value="HARD">Hard blocker</option><option value="SOFT">Warning</option></select></label><Textarea label="Notes" value={constraintForm.notes} onChange={event => setConstraintForm(current => ({ ...current, notes: event.target.value }))}/><Actions><Button variant="ghost" onClick={() => setConstraintOpen(false)}>Cancel</Button><Button variant="primary" disabled={!constraintForm.label.trim()} onClick={addConstraint}>Add constraint</Button></Actions></Surface>}</div></div>
    </>}
  </div>;
};

const ScheduleDayColumn: React.FC<{ productionId: string; day: SchedulePlan['days'][number]; plan: SchedulePlan; scenes: FP.ProductionScene[]; tasks: FP.ProdTask[]; canEdit: boolean; conflicts: ScheduleConflict[]; onPlan: React.Dispatch<React.SetStateAction<SchedulePlan | null>> }> = ({ productionId, day, plan, scenes, tasks, canEdit, conflicts, onPlan }) => {
  const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
  const strips = plan.strips.filter(strip => strip.dayId === day.id).sort((a,b) => a.order - b.order);
  const pageTotal = strips.reduce((sum, strip) => sum + (strip.sceneId ? sceneById.get(strip.sceneId)?.pages || 0 : 0), 0);
  const linkedTasks = tasks.filter(task => task.shootDay === day.dayNumber);
  const availableTasks = tasks.filter(task => !task.shootDay);
  const updateDay = (patch: Partial<typeof day>) => onPlan(current => current ? { ...current, days: current.days.map(item => item.id === day.id ? { ...item, ...patch } : item), updatedAt: Date.now() } : current);
  const move = (strip: ScheduleStrip, delta: number) => onPlan(current => current ? moveScheduleStrip(current, strip.id, day.id, strip.order + delta) : current);
  return <Surface level={2} className="overflow-hidden" padded={false} onDragOver={event => canEdit && event.preventDefault()} onDrop={event => { if (!canEdit) return; const id = event.dataTransfer.getData('text/schedule-strip'); onPlan(current => current ? moveScheduleStrip(current, id, day.id, strips.length) : current); }}><div className="border-b border-white/10 bg-white/[0.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><Eyebrow>Day {day.dayNumber} · {day.unit} unit</Eyebrow><input className="mt-1 bg-transparent type-title-sm outline-none disabled:opacity-100" disabled={!canEdit} value={day.label} onChange={event => updateDay({ label: event.target.value })}/><p className="type-body-sm mt-1 text-white/40">{strips.filter(strip => strip.type === 'SCENE').length} scenes · {FP.pagesToEighths(pageTotal)} pages · {Math.round(strips.reduce((sum,strip) => sum + strip.estimatedMinutes, 0) / 60 * 10) / 10} hrs</p></div><div className="flex gap-2"><input aria-label={`Date for day ${day.dayNumber}`} className="pj-input" type="date" disabled={!canEdit} value={day.date} onChange={event => updateDay({ date: event.target.value })}/><input aria-label={`General call for day ${day.dayNumber}`} className="pj-input w-28" type="time" disabled={!canEdit} value={day.generalCall} onChange={event => updateDay({ generalCall: event.target.value })}/></div></div>{canEdit && <Actions className="mt-3"><Button variant="ghost" size="xs" icon={<Plus />} onClick={() => onPlan(current => current ? addScheduleMarker(current, day.id, 'BANNER', 'Schedule banner') : current)}>Banner</Button><Button variant="ghost" size="xs" icon={<Truck />} onClick={() => onPlan(current => current ? addScheduleMarker(current, day.id, 'COMPANY_MOVE', 'Company move') : current)}>Company move</Button></Actions>}</div><div className="divide-y divide-white/5">{strips.map(strip => <ScheduleStripRow key={strip.id} strip={strip} scene={strip.sceneId ? sceneById.get(strip.sceneId) : undefined} canEdit={canEdit} conflicts={conflicts.filter(conflict => conflict.sceneId === strip.sceneId)} onMove={move} onDropBefore={id => onPlan(current => current ? moveScheduleStrip(current, id, day.id, strip.order) : current)} onChange={patch => onPlan(current => current ? { ...current, strips: current.strips.map(item => item.id === strip.id ? { ...item, ...patch } : item), updatedAt: Date.now() } : current)} onRemove={() => onPlan(current => current ? { ...current, strips: current.strips.filter(item => item.id !== strip.id), updatedAt: Date.now() } : current)} />)}{!strips.length && <p className="p-8 text-center type-body-sm text-white/30">Drop strips here.</p>}</div><div className="border-t border-white/10 bg-white/[0.015] p-3"><div className="flex flex-wrap items-center gap-2"><Eyebrow className="mr-2">Day dependencies</Eyebrow>{linkedTasks.map(task => <Chip key={task.id}>{task.title} · {task.status}</Chip>)}{canEdit && availableTasks.length > 0 && <select aria-label={`Link task to day ${day.dayNumber}`} className="pj-input max-w-xs" value="" onChange={event => { if (event.target.value) FP.patchTask(productionId, event.target.value, { shootDay: day.dayNumber }); }}><option value="">Link task to this day…</option>{availableTasks.map(task => <option key={task.id} value={task.id}>{task.title} · {task.dept || 'General'}</option>)}</select>}</div></div>{conflicts.some(conflict => !conflict.sceneId) && <div className="border-t border-red-500/15 p-3">{conflicts.filter(conflict => !conflict.sceneId).map(conflict => <p key={conflict.id} className="type-body-sm text-amber-300">{conflict.title} · {conflict.detail}</p>)}</div>}</Surface>;
};

const ScheduleStripRow: React.FC<{ strip: ScheduleStrip; scene?: FP.ProductionScene; canEdit: boolean; conflicts: ScheduleConflict[]; onMove: (strip: ScheduleStrip, delta: number) => void; onDropBefore: (id:string) => void; onChange:(patch:Partial<ScheduleStrip>)=>void; onRemove:()=>void }> = ({ strip, scene, canEdit, conflicts, onMove, onDropBefore, onChange, onRemove }) => <div draggable={canEdit} onDragStart={event => event.dataTransfer.setData('text/schedule-strip', strip.id)} onDragOver={event => canEdit && event.preventDefault()} onDrop={event => { if (!canEdit) return; event.stopPropagation(); onDropBefore(event.dataTransfer.getData('text/schedule-strip')); }} className={`p-3 ${strip.type === 'BANNER' ? 'bg-violet-500/10' : strip.type === 'COMPANY_MOVE' ? 'bg-amber-500/10' : ''}`}><div className="flex items-center gap-3">{canEdit && <GripVertical size={15} className="shrink-0 text-white/25"/>}{scene ? <><span className="w-10 shrink-0 type-title-sm text-violet-300">#{scene.sceneNum}</span><div className="min-w-0 flex-1"><p className="truncate type-label-lg">{scene.intExt}. {scene.set} — {scene.dayNight}</p><p className="truncate type-body-sm text-white/40">{scene.synopsis || 'No synopsis'} · {FP.pagesToEighths(scene.pages)} pages · {scene.characters.join(', ') || 'No cast'}</p></div><Input aria-label="Estimated minutes" className="w-24" type="number" min="5" disabled={!canEdit} value={String(strip.estimatedMinutes)} onChange={event => onChange({ estimatedMinutes: Math.max(5, Number(event.target.value) || 5) })}/></> : <><div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5">{strip.type === 'COMPANY_MOVE' ? <Truck size={15}/> : <Sparkles size={15}/>}</div><input className="min-w-0 flex-1 bg-transparent type-label-lg outline-none" disabled={!canEdit} value={strip.label || ''} onChange={event => onChange({ label: event.target.value })}/><span className="type-body-sm text-white/40">{strip.estimatedMinutes}m</span></>}{canEdit && <div className="flex"><Button variant="ghost" size="xs" iconOnly aria-label="Move up" onClick={() => onMove(strip,-1)}><ChevronUp/></Button><Button variant="ghost" size="xs" iconOnly aria-label="Move down" onClick={() => onMove(strip,1)}><ChevronDown/></Button>{strip.type !== 'SCENE' && <Button variant="danger-quiet" size="xs" iconOnly aria-label="Remove marker" onClick={onRemove}><Trash2/></Button>}</div>}</div>{conflicts.length > 0 && <div className="mt-2 ml-8 flex flex-wrap gap-2">{conflicts.map(conflict => <Chip key={conflict.id} brand={conflict.severity === 'ERROR'}>{conflict.title}</Chip>)}</div>}</div>;

const ConflictPanel: React.FC<{ conflicts: ScheduleConflict[] }> = ({ conflicts }) => <Surface level={2} className="space-y-3"><div><Eyebrow>Constraint engine</Eyebrow><h3 className="type-title-sm mt-1">{conflicts.length ? `${conflicts.length} scheduling conflicts` : 'Schedule clear'}</h3></div>{conflicts.slice(0,12).map(conflict => <div key={conflict.id} className="flex gap-2 border-t border-white/5 pt-3"><AlertTriangle size={14} className={conflict.severity === 'ERROR' ? 'text-red-400' : 'text-amber-400'}/><div><p className="type-label-lg">{conflict.title}</p><p className="type-body-sm text-white/40">{conflict.detail}</p></div></div>)}{!conflicts.length && <p className="type-body-sm text-emerald-300">No cast, location, daylight, workload, breakdown, or move conflicts detected.</p>}</Surface>;

const ConstraintPanel: React.FC<{ constraints: ScheduleConstraint[]; productionId: string; canEdit: boolean; onOpen:()=>void }> = ({ constraints, productionId, canEdit, onOpen }) => <Surface level={2} className="space-y-3"><div className="flex items-center justify-between gap-3"><div><Eyebrow>Availability & restrictions</Eyebrow><h3 className="type-title-sm mt-1">{constraints.length} active constraints</h3></div>{canEdit && <Button variant="secondary" size="sm" icon={<Plus/>} onClick={onOpen}>Add</Button>}</div>{constraints.map(row => <div key={row.id} className="flex items-start gap-2 border-t border-white/5 pt-3"><div className="flex-1"><p className="type-label-lg">{row.label}</p><p className="type-body-sm text-white/35">{row.type.replaceAll('_',' ')} · {row.date || (row.dayNumber ? `Day ${row.dayNumber}` : 'All days')} · {row.severity}</p></div>{canEdit && <Button variant="danger-quiet" size="xs" iconOnly aria-label={`Remove ${row.label}`} onClick={() => removeScheduleConstraint(productionId,row.id)}><Trash2/></Button>}</div>)}</Surface>;

export default FilmScheduleTab;

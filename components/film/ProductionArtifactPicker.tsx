import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clapperboard, FileText, ListChecks, MapPin, UserRound, X } from 'lucide-react';
import { subCallSheets, subLocations, subMembers, subScenes, subTasks, type CallSheet, type ProdTask, type ProductionLocation, type ProductionMember, type ProductionScene } from '../../services/filmProductionService';
import { subscribeBreakdownElements, type BreakdownElement } from '../../services/productionBreakdownService';
import { subscribeSchedulePlans, type SchedulePlan } from '../../services/productionScheduleService';
import { createProductionDecision, type ProductionEntityRef, type ProductionEntityType } from '../../services/productionChatArtifacts';
import { createSafetyAlertWithAction } from '../../services/productionActionService';
import { Button, IconButton, Input, Surface, Eyebrow } from '../ui';

interface Choice { reference: ProductionEntityRef; title: string; detail: string; type: ProductionEntityType }
const ICONS = { TASK: ListChecks, SCENE: Clapperboard, BREAKDOWN: CheckCircle2, CALL_SHEET: FileText, SCHEDULE: Calendar, DECISION: CheckCircle2, ALERT: AlertTriangle, MEMBER: UserRound, LOCATION: MapPin };

const ProductionArtifactPicker: React.FC<{ productionId: string; uid: string; userName: string; onSelect: (choice: Choice) => void; onClose: () => void }> = ({ productionId, uid, userName, onSelect, onClose }) => {
  const [tasks, setTasks] = useState<ProdTask[]>([]); const [scenes, setScenes] = useState<ProductionScene[]>([]);
  const [sheets, setSheets] = useState<CallSheet[]>([]); const [breakdown, setBreakdown] = useState<BreakdownElement[]>([]); const [plans, setPlans] = useState<SchedulePlan[]>([]);
  const [members, setMembers] = useState<ProductionMember[]>([]); const [locations, setLocations] = useState<ProductionLocation[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => { const unsubs = [subTasks(productionId, setTasks), subScenes(productionId, setScenes), subCallSheets(productionId, setSheets), subMembers(productionId, setMembers), subLocations(productionId, setLocations), subscribeBreakdownElements(productionId, setBreakdown), subscribeSchedulePlans(productionId, setPlans)]; return () => unsubs.forEach(unsub => unsub()); }, [productionId]);
  const choices = useMemo<Choice[]>(() => [
    ...tasks.map(row => ({ reference: { productionId, entityType: 'TASK' as const, entityId: row.id }, title: row.title, detail: `${row.status} · ${row.assigneeName || row.dept || 'Unassigned'}`, type: 'TASK' as const })),
    ...scenes.map(row => ({ reference: { productionId, entityType: 'SCENE' as const, entityId: row.id }, title: `Scene ${row.sceneNum} · ${row.set}`, detail: `${row.intExt} ${row.dayNight} · ${row.status}`, type: 'SCENE' as const })),
    ...breakdown.map(row => ({ reference: { productionId, entityType: 'BREAKDOWN' as const, entityId: row.id }, title: row.name, detail: `${row.department} · ${row.status}`, type: 'BREAKDOWN' as const })),
    ...sheets.map(row => ({ reference: { productionId, entityType: 'CALL_SHEET' as const, entityId: row.id }, title: `Call Sheet · Day ${row.shootDay}`, detail: `${row.date || 'Date TBD'} · ${row.generalCall}`, type: 'CALL_SHEET' as const })),
    ...plans.map(row => ({ reference: { productionId, entityType: 'SCHEDULE' as const, entityId: row.id }, title: row.label, detail: `v${row.version} · ${row.status}`, type: 'SCHEDULE' as const })),
    ...members.map(row => ({ reference: { productionId, entityType: 'MEMBER' as const, entityId: row.id }, title: row.name, detail: `${row.role} · ${row.dept.replaceAll('_', ' ')}`, type: 'MEMBER' as const })),
    ...locations.map(row => ({ reference: { productionId, entityType: 'LOCATION' as const, entityId: row.id }, title: row.name, detail: `${row.city || row.address || 'Address pending'} · ${row.permitStatus}`, type: 'LOCATION' as const })),
  ].filter(row => !search || `${row.title} ${row.detail}`.toLowerCase().includes(search.toLowerCase())), [productionId, tasks, scenes, breakdown, sheets, plans, members, locations, search]);
  const decision = async () => { const title = window.prompt('Decision title:'); if (!title) return; const detail = window.prompt('What is being decided?') || ''; const row = await createProductionDecision(productionId, uid, userName, title, detail); onSelect({ reference: { productionId, entityType: 'DECISION', entityId: row.id }, title: row.title, detail: row.detail, type: 'DECISION' }); };
  const alert = async () => { const title = window.prompt('Alert title:'); if (!title) return; const detail = window.prompt('What does the crew need to know?') || ''; const requested = (window.prompt('Severity: INFO, IMPORTANT, or URGENT', 'IMPORTANT') || 'IMPORTANT').toUpperCase(); const severity = (['INFO', 'IMPORTANT', 'URGENT'].includes(requested) ? requested : 'IMPORTANT') as 'INFO' | 'IMPORTANT' | 'URGENT'; const action = await createSafetyAlertWithAction(productionId, uid, userName, title, detail, severity); onSelect({ reference: action.entity, title, detail, type: 'ALERT' }); };
  return <Surface level={5} shape="sheet" className="absolute bottom-full left-3 mb-3 z-50 w-[520px] max-w-[calc(100vw-24px)] max-h-[65vh] overflow-hidden flex flex-col p-4">
    <div className="flex items-start justify-between gap-3"><div><Eyebrow>Share live production data</Eyebrow><h3 className="type-title-lg mt-1">Choose an original record</h3></div><IconButton variant="ghost" size="sm" aria-label="Close production data picker" onClick={onClose}><X /></IconButton></div>
    <div className="grid grid-cols-2 gap-2 mt-4"><Button variant="secondary" icon={<CheckCircle2 />} onClick={decision}>New decision</Button><Button variant="accent" icon={<AlertTriangle />} onClick={alert}>New alert</Button></div>
    <div className="mt-3"><Input aria-label="Search production records" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search scenes, tasks, calls…" /></div>
    <div className="mt-3 overflow-y-auto pj-stack-2">{choices.map(choice => { const Icon = ICONS[choice.type]; return <Button key={`${choice.type}_${choice.reference.entityId}`} variant="ghost" className="w-full justify-start h-auto py-3" icon={<Icon />} onClick={() => onSelect(choice)}><span className="min-w-0 text-left"><span className="block type-label-lg truncate">{choice.title}</span><span className="block type-body-sm text-[var(--text-secondary)] truncate">{choice.detail}</span></span></Button>; })}{choices.length === 0 && <p className="type-body-sm text-[var(--text-secondary)] text-center py-8">No matching production records.</p>}</div>
  </Surface>;
};

export default ProductionArtifactPicker;

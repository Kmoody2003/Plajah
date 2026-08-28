import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc,
  where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  computeSunTimes, fetchProduction, generateCallSheet, hasProductionPermission, isClearanceCleared, uid8,
  type CallSheet, type DeptKey, type Production, type ProductionClearance, type ProductionLocation, type ProductionMember,
  type ProductionScene,
} from './filmProductionService';
import type { BreakdownElement } from './productionBreakdownService';
import type { WorkflowEvent } from './productionGraph';
import {
  analyzeCallSheetImpact, analyzeScheduleImpact, dispatchProductionAction, makeProductionAction,
} from './productionActionService';

export type SchedulePlanStatus = 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
export type ScheduleStripType = 'SCENE' | 'BANNER' | 'COMPANY_MOVE';

export interface ScheduleDay {
  id: string;
  dayNumber: number;
  date: string;
  label: string;
  generalCall: string;
  unit: string;
}

export interface ScheduleStrip {
  id: string;
  type: ScheduleStripType;
  dayId: string;
  order: number;
  sceneId?: string;
  label?: string;
  unit: string;
  estimatedMinutes: number;
}

export interface SchedulePlan {
  id: string;
  productionId: string;
  label: string;
  status: SchedulePlanStatus;
  version: number;
  sourceDraftId?: string;
  days: ScheduleDay[];
  strips: ScheduleStrip[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  approvedBy?: string;
  approvedAt?: number;
}

export type ScheduleConstraintType = 'MEMBER_UNAVAILABLE' | 'LOCATION_UNAVAILABLE' | 'SCENE_RESTRICTION';
export interface ScheduleConstraint {
  id: string;
  productionId: string;
  type: ScheduleConstraintType;
  label: string;
  memberId?: string;
  locationId?: string;
  sceneId?: string;
  date?: string;
  dayNumber?: number;
  severity: 'HARD' | 'SOFT';
  notes?: string;
  createdBy: string;
  createdAt: number;
}

export type ScheduleConflictType = 'CAST' | 'LOCATION' | 'DAYLIGHT' | 'WORKLOAD' | 'BREAKDOWN' | 'COMPANY_MOVE' | 'CONSTRAINT' | 'CLEARANCE';
export interface ScheduleConflict {
  id: string;
  type: ScheduleConflictType;
  severity: 'ERROR' | 'WARNING';
  dayId: string;
  sceneId?: string;
  title: string;
  detail: string;
  relatedIds: string[];
}

export type DeliveryStatus = 'DELIVERED' | 'VIEWED' | 'CONFIRMED' | 'PROBLEM' | 'SUPERSEDED';
export interface RecipientDelivery {
  id: string;
  productionId: string;
  callSheetId: string;
  callSheetVersion: number;
  schedulePlanId?: string;
  memberId: string;
  memberUid?: string;
  memberName: string;
  role: string;
  department: DeptKey;
  channel: 'IN_APP' | 'LINK' | 'EMAIL' | 'SMS';
  status: DeliveryStatus;
  packet: { yourCall: string; sceneIds: string[]; includesSides: boolean; includesDepartmentBrief: boolean };
  deltaSummary?: string;
  deliveredAt: number;
  viewedAt?: number;
  confirmedAt?: number;
  problemNote?: string;
  updatedAt: number;
}

export interface CallSheetTemplate {
  id: string;
  productionId: string;
  name: string;
  generalCall: string;
  notes?: string;
  safetyNotes?: string;
  parkingNote?: string;
  basecampNote?: string;
  nearestHospital?: string;
  meals: Array<{ label: string; offsetMinutes: number; note?: string }>;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const minutes = (hhmm: string) => {
  const [hours, mins] = (hhmm || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (mins || 0);
};

export function createSchedulePlan(
  production: Production, scenes: ProductionScene[], actorUid: string, label = 'Working Schedule', now = Date.now(),
): SchedulePlan {
  const maxAssignedDay = Math.max(1, ...scenes.map(scene => scene.shootDay || 1));
  const dayCount = Math.max(1, Math.min(60, maxAssignedDay));
  const days: ScheduleDay[] = Array.from({ length: dayCount }, (_, index) => ({
    id: `day_${index + 1}`, dayNumber: index + 1, date: '', label: `Shoot Day ${index + 1}`, generalCall: '07:00', unit: 'MAIN',
  }));
  const rawStrips = scenes.filter(scene => scene.status !== 'OMIT').map((scene, index) => {
    const assigned = Math.max(1, Math.min(dayCount, scene.shootDay || 1));
    return {
      id: `strip_${scene.id}`, type: 'SCENE' as const, dayId: `day_${assigned}`,
      order: index, sceneId: scene.id, unit: 'MAIN', estimatedMinutes: Math.max(30, Math.round(scene.pages * 60)),
    };
  });
  const strips = days.flatMap(day => rawStrips.filter(strip => strip.dayId === day.id).map((strip, order) => ({ ...strip, order })));
  return {
    id: `schedule_${uid8()}`, productionId: production.id, label, status: 'DRAFT', version: 1,
    sourceDraftId: production.currentDraftId, days, strips, createdBy: actorUid, createdAt: now, updatedAt: now,
  };
}

export function cloneSchedulePlan(plan: SchedulePlan, actorUid: string, label: string, now = Date.now()): SchedulePlan {
  return clean({
    ...plan, id: `schedule_${uid8()}`, label: label.trim() || `${plan.label} Alternate`, status: 'DRAFT',
    version: plan.version + 1, createdBy: actorUid, createdAt: now, updatedAt: now,
    approvedBy: undefined, approvedAt: undefined,
  });
}

export function moveScheduleStrip(plan: SchedulePlan, stripId: string, targetDayId: string, targetIndex: number): SchedulePlan {
  if (plan.status !== 'DRAFT' || !plan.days.some(day => day.id === targetDayId)) return plan;
  const moving = plan.strips.find(strip => strip.id === stripId);
  if (!moving) return plan;
  const remaining = plan.strips.filter(strip => strip.id !== stripId);
  const target = remaining.filter(strip => strip.dayId === targetDayId).sort((a, b) => a.order - b.order);
  const safeIndex = Math.max(0, Math.min(target.length, targetIndex));
  target.splice(safeIndex, 0, { ...moving, dayId: targetDayId });
  const byDay = new Map(plan.days.map(day => [day.id, remaining.filter(strip => strip.dayId === day.id && strip.id !== stripId).sort((a, b) => a.order - b.order)]));
  byDay.set(targetDayId, target);
  return { ...plan, strips: plan.days.flatMap(day => (byDay.get(day.id) || []).map((strip, order) => ({ ...strip, order }))), updatedAt: Date.now() };
}

export function addScheduleDay(plan: SchedulePlan): SchedulePlan {
  if (plan.status !== 'DRAFT') return plan;
  const dayNumber = Math.max(0, ...plan.days.map(day => day.dayNumber)) + 1;
  return { ...plan, days: [...plan.days, { id: `day_${uid8()}`, dayNumber, date: '', label: `Shoot Day ${dayNumber}`, generalCall: '07:00', unit: 'MAIN' }], updatedAt: Date.now() };
}

export function addScheduleMarker(plan: SchedulePlan, dayId: string, type: 'BANNER' | 'COMPANY_MOVE', label: string): SchedulePlan {
  if (plan.status !== 'DRAFT') return plan;
  const dayRows = plan.strips.filter(strip => strip.dayId === dayId);
  return { ...plan, strips: [...plan.strips, { id: `strip_${uid8()}`, type, dayId, order: Math.max(-1, ...dayRows.map(row => row.order)) + 1, label: label.trim() || (type === 'BANNER' ? 'Schedule note' : 'Company move'), unit: 'MAIN', estimatedMinutes: type === 'COMPANY_MOVE' ? 60 : 0 }], updatedAt: Date.now() };
}

export function analyzeSchedule(
  plan: SchedulePlan, production: Production, scenes: ProductionScene[], members: ProductionMember[], locations: ProductionLocation[],
  breakdown: BreakdownElement[], constraints: ScheduleConstraint[], clearances: ProductionClearance[] = [],
): ScheduleConflict[] {
  const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
  const locationById = new Map(locations.map(location => [location.id, location]));
  const result: ScheduleConflict[] = [];
  const push = (conflict: Omit<ScheduleConflict, 'id'>) => result.push({ id: `conflict_${result.length}_${conflict.dayId}_${conflict.sceneId || conflict.type}`, ...conflict });
  for (const day of plan.days) {
    const rows = plan.strips.filter(strip => strip.dayId === day.id).sort((a, b) => a.order - b.order);
    const sceneRows = rows.filter(strip => strip.type === 'SCENE').map(strip => ({ strip, scene: sceneById.get(strip.sceneId || '') })).filter((row): row is { strip: ScheduleStrip; scene: ProductionScene } => !!row.scene);
    const pages = sceneRows.reduce((sum, row) => sum + row.scene.pages, 0);
    const duration = rows.reduce((sum, row) => sum + row.estimatedMinutes, 0);
    if (pages > 8) push({ type: 'WORKLOAD', severity: 'WARNING', dayId: day.id, title: 'Heavy page count', detail: `${pages.toFixed(1)} pages exceed the 8-page planning threshold.`, relatedIds: sceneRows.map(row => row.scene.id) });
    if (duration > 720) push({ type: 'WORKLOAD', severity: 'ERROR', dayId: day.id, title: 'Day exceeds 12 hours', detail: `${Math.round(duration / 60 * 10) / 10} estimated hours before meal and travel buffers.`, relatedIds: sceneRows.map(row => row.scene.id) });
    let elapsed = minutes(day.generalCall);
    sceneRows.forEach(({ strip, scene }, sceneIndex) => {
      const date = day.date;
      const sceneConstraints = constraints.filter(constraint =>
        (constraint.dayNumber == null || constraint.dayNumber === day.dayNumber) && (!constraint.date || constraint.date === date),
      );
      const matchingLocation = scene.locationId ? locationById.get(scene.locationId) : locations.find(location => location.name.toUpperCase() === scene.set.toUpperCase());
      const cast = members.filter(member => (member.isCast || member.dept === 'CAST') && scene.characters.some(character => {
        const key = (member.character || member.role || member.name).toUpperCase();
        const expected = character.toUpperCase();
        return key.includes(expected) || expected.includes(key.split(' ')[0]);
      }));
      sceneConstraints.filter(constraint => constraint.type === 'SCENE_RESTRICTION' && constraint.sceneId === scene.id).forEach(constraint => push({ type: 'CONSTRAINT', severity: constraint.severity === 'HARD' ? 'ERROR' : 'WARNING', dayId: day.id, sceneId: scene.id, title: constraint.label, detail: constraint.notes || 'Scene restriction conflicts with this shoot day.', relatedIds: [constraint.id, scene.id] }));
      cast.forEach(member => sceneConstraints.filter(constraint => constraint.type === 'MEMBER_UNAVAILABLE' && constraint.memberId === member.id).forEach(constraint => push({ type: 'CAST', severity: constraint.severity === 'HARD' ? 'ERROR' : 'WARNING', dayId: day.id, sceneId: scene.id, title: `${member.name} unavailable`, detail: constraint.notes || `${member.name} is constrained on this shoot day.`, relatedIds: [member.id, constraint.id] })));
      if (matchingLocation) sceneConstraints.filter(constraint => constraint.type === 'LOCATION_UNAVAILABLE' && constraint.locationId === matchingLocation.id).forEach(constraint => push({ type: 'LOCATION', severity: constraint.severity === 'HARD' ? 'ERROR' : 'WARNING', dayId: day.id, sceneId: scene.id, title: `${matchingLocation.name} unavailable`, detail: constraint.notes || 'Location is constrained on this shoot day.', relatedIds: [matchingLocation.id, constraint.id] }));
      const blocked = breakdown.filter(element => element.status === 'BLOCKED' && element.occurrences.some(occurrence => occurrence.sceneId === scene.id));
      if (blocked.length) push({ type: 'BREAKDOWN', severity: 'ERROR', dayId: day.id, sceneId: scene.id, title: `${blocked.length} blocked production element${blocked.length === 1 ? '' : 's'}`, detail: blocked.map(element => element.name).join(', '), relatedIds: blocked.map(element => element.id) });
      // Clearances: a logged legal clearance that isn't in hand (or has expired before the shoot date)
      // blocks the day. Only clearances the production has actually recorded are checked, so this stays
      // quiet until a producer logs one — then scheduling its scene/cast/location surfaces the gap.
      const dayDateMs = day.date ? Date.parse(day.date) : NaN;
      clearances
        .filter(clearance =>
          (clearance.sceneId && clearance.sceneId === scene.id) ||
          (clearance.memberId && cast.some(member => member.id === clearance.memberId)) ||
          (matchingLocation && clearance.locationId === matchingLocation.id))
        .forEach(clearance => {
          const expired = clearance.expiresAt != null && !Number.isNaN(dayDateMs) && dayDateMs > clearance.expiresAt;
          if (isClearanceCleared(clearance) && !expired) return;
          const hardType = clearance.type === 'MINOR' || clearance.type === 'PERMIT' || clearance.type === 'LOCATION_RELEASE';
          push({
            type: 'CLEARANCE', severity: hardType ? 'ERROR' : 'WARNING', dayId: day.id, sceneId: scene.id,
            title: expired ? `${clearance.title} expired` : `${clearance.title} not cleared`,
            detail: expired
              ? `Clearance expired before this shoot day — re-clear before shooting Scene ${scene.sceneNum}.`
              : `Status ${clearance.status}. Scene ${scene.sceneNum} cannot lawfully shoot until this clearance is in hand.`,
            relatedIds: [clearance.id, scene.id],
          });
        });
      if (date && production.lat != null && production.lng != null) {
        const sun = computeSunTimes(production.lat, production.lng, date, -(new Date().getTimezoneOffset()));
        if (sun) {
          const start = elapsed;
          if ((scene.dayNight === 'DAY' || scene.dayNight === 'DUSK') && start > minutes(sun.sunset)) push({ type: 'DAYLIGHT', severity: 'ERROR', dayId: day.id, sceneId: scene.id, title: 'Day scene scheduled after sunset', detail: `Estimated start ${toTime(start)}; sunset ${sun.sunset}.`, relatedIds: [scene.id] });
          if (scene.dayNight === 'NIGHT' && start < minutes(sun.sunset) - 30) push({ type: 'DAYLIGHT', severity: 'WARNING', dayId: day.id, sceneId: scene.id, title: 'Night scene scheduled before darkness', detail: `Estimated start ${toTime(start)}; sunset ${sun.sunset}.`, relatedIds: [scene.id] });
        }
      }
      const previous = sceneRows[sceneIndex - 1];
      if (previous && previous.scene.set !== scene.set) {
        const previousOrder = previous.strip.order;
        const hasMove = rows.some(row => row.type === 'COMPANY_MOVE' && row.order > previousOrder && row.order < strip.order);
        if (!hasMove) push({ type: 'COMPANY_MOVE', severity: 'WARNING', dayId: day.id, sceneId: scene.id, title: 'Unmarked company move', detail: `${previous.scene.set} → ${scene.set} needs a move strip and travel allowance.`, relatedIds: [previous.scene.id, scene.id] });
      }
      elapsed += strip.estimatedMinutes;
    });
  }
  return result;
}

const toTime = (total: number) => `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
export const recipientDeliveryId = (callSheetId: string, version: number, memberId: string) => `${callSheetId}_v${version}_${memberId}`;

export function subscribeSchedulePlans(productionId: string, callback: (plans: SchedulePlan[]) => void): () => void {
  return onSnapshot(collection(db, 'productions', productionId, 'schedulePlans'), snapshot => callback(snapshot.docs.map(item => item.data() as SchedulePlan).sort((a, b) => b.updatedAt - a.updatedAt)));
}
export function subscribeScheduleConstraints(productionId: string, callback: (rows: ScheduleConstraint[]) => void): () => void {
  return onSnapshot(collection(db, 'productions', productionId, 'scheduleConstraints'), snapshot => callback(snapshot.docs.map(item => item.data() as ScheduleConstraint)));
}
export const putSchedulePlan = (productionId: string, plan: SchedulePlan) => setDoc(doc(db, 'productions', productionId, 'schedulePlans', plan.id), clean({ ...plan, updatedAt: Date.now() }));
export const putScheduleConstraint = (productionId: string, row: ScheduleConstraint) => setDoc(doc(db, 'productions', productionId, 'scheduleConstraints', row.id), clean(row));
export const removeScheduleConstraint = (productionId: string, id: string) => deleteDoc(doc(db, 'productions', productionId, 'scheduleConstraints', id));

export async function approveSchedulePlan(productionId: string, plan: SchedulePlan, actorUid: string): Promise<void> {
  const production = await fetchProduction(productionId);
  if (!production || !hasProductionPermission(production, actorUid, 'MANAGE_SCHEDULE')) throw new Error('Your role cannot approve production schedules.');
  const plansSnapshot = await getDocs(collection(db, 'productions', productionId, 'schedulePlans'));
  const [memberSnapshot, sceneSnapshot] = await Promise.all([
    getDocs(collection(db, 'productions', productionId, 'members')),
    getDocs(collection(db, 'productions', productionId, 'scenes')),
  ]);
  const members = memberSnapshot.docs.map(item => item.data() as ProductionMember);
  const scenes = sceneSnapshot.docs.map(item => item.data() as ProductionScene);
  const previous = plansSnapshot.docs.map(item => item.data() as SchedulePlan).find(item => item.status === 'APPROVED' && item.id !== plan.id) || null;
  const now = Date.now();
  const batch = writeBatch(db);
  plansSnapshot.docs.forEach(snapshot => {
    const existing = snapshot.data() as SchedulePlan;
    if (existing.id !== plan.id && existing.status === 'APPROVED') batch.update(snapshot.ref, { status: 'SUPERSEDED', updatedAt: now });
  });
  batch.update(doc(db, 'productions', productionId, 'schedulePlans', plan.id), { status: 'APPROVED', approvedBy: actorUid, approvedAt: now, updatedAt: now });
  batch.update(doc(db, 'productions', productionId), { approvedScheduleId: plan.id, approvedScheduleVersion: plan.version, totalDays: plan.days.length, updatedAt: now });
  const dayById = new Map(plan.days.map(day => [day.id, day.dayNumber]));
  plan.strips.filter(strip => strip.type === 'SCENE' && strip.sceneId).forEach(strip => batch.update(doc(db, 'productions', productionId, 'scenes', strip.sceneId!), { shootDay: dayById.get(strip.dayId) || 0, updatedAt: now }));
  const event: WorkflowEvent = { id: `evt_${uid8()}`, productionId, type: 'SCHEDULE_APPROVED', actorUid, entityType: 'schedulePlan', entityId: plan.id, summary: `${plan.label} v${plan.version} approved`, data: { dayCount: plan.days.length, sceneCount: plan.strips.filter(strip => strip.type === 'SCENE').length }, createdAt: now };
  batch.set(doc(db, 'productions', productionId, 'workflowEvents', event.id), event);
  const actor = members.find(member => member.uid === actorUid);
  const impact = analyzeScheduleImpact(production, plan, scenes, members, previous);
  const action = makeProductionAction({
    productionId, trigger: 'SCHEDULE_APPROVED', title: `${plan.label} approved`, summary: impact.headline,
    entity: { productionId, entityType: 'SCHEDULE', entityId: plan.id }, impact,
    routeChannelKeys: ['announcements', 'schedule-calls'], targetUids: impact.affectedUids,
    requiredAcknowledgementUids: impact.affectedUids, requiredPermission: 'MANAGE_SCHEDULE',
    severity: impact.risks.length ? 'IMPORTANT' : 'ROUTINE', actorUid, actorName: actor?.name || production.title,
    dueAt: now + 12 * 60 * 60 * 1000,
  }, now);
  batch.set(doc(db, 'productions', productionId, 'productionActions', action.id), clean(action));
  await batch.commit();
  dispatchProductionAction(productionId, action.id, actorUid).catch(error => console.warn('[production-actions] schedule queued for retry', error));
}

export async function generateCallSheetsFromApprovedSchedule(
  production: Production, plan: SchedulePlan, scenes: ProductionScene[], members: ProductionMember[], locations: ProductionLocation[], actorUid: string,
): Promise<CallSheet[]> {
  const currentProduction = await fetchProduction(production.id);
  if (!currentProduction || plan.status !== 'APPROVED' || currentProduction.approvedScheduleId !== plan.id) throw new Error('Approve this schedule before generating call sheets.');
  if (!hasProductionPermission(currentProduction, actorUid, 'MANAGE_CALL_SHEETS')) throw new Error('Your role cannot generate call sheets.');
  const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
  const dayById = new Map(plan.days.map(day => [day.id, day]));
  const generated: CallSheet[] = [];
  const batch = writeBatch(db);
  for (const day of plan.days) {
    const dayScenes = plan.strips.filter(strip => strip.dayId === day.id && strip.type === 'SCENE').sort((a, b) => a.order - b.order).flatMap(strip => {
      const scene = sceneById.get(strip.sceneId || '');
      return scene ? [{ ...scene, shootDay: day.dayNumber }] : [];
    });
    if (!dayScenes.length) continue;
    const location = locations.find(row => row.id === dayScenes[0].locationId) || locations.find(row => row.name.toUpperCase() === dayScenes[0].set.toUpperCase());
    const sheet = generateCallSheet(currentProduction, dayScenes, members, day.dayNumber, { date: day.date, generalCall: day.generalCall, locationName: location?.name || dayScenes[0].set, locationAddress: location ? `${location.address}${location.city ? `, ${location.city}` : ''}` : '' });
    sheet.id = `cs_${plan.id}_${day.id}_v${plan.version}`;
    sheet.schedulePlanId = plan.id; sheet.scheduleVersion = plan.version; sheet.scheduleDayId = day.id;
    sheet.changeLog = [{ at: Date.now(), summary: `Generated from approved ${plan.label} v${plan.version}` }];
    generated.push(sheet);
    batch.set(doc(db, 'productions', production.id, 'callsheets', sheet.id), clean(sheet));
  }
  const now = Date.now();
  const event: WorkflowEvent = { id: `evt_${uid8()}`, productionId: production.id, type: 'CALLSHEETS_GENERATED', actorUid, entityType: 'schedulePlan', entityId: plan.id, summary: `${generated.length} call sheets generated from approved schedule`, data: { callSheetIds: generated.map(sheet => sheet.id) }, createdAt: now };
  batch.set(doc(db, 'productions', production.id, 'workflowEvents', event.id), event);
  await batch.commit();
  return generated;
}

export function subscribeRecipientDeliveries(productionId: string, callback: (rows: RecipientDelivery[]) => void): () => void {
  return onSnapshot(collection(db, 'productions', productionId, 'recipientDeliveries'), snapshot => callback(snapshot.docs.map(item => item.data() as RecipientDelivery)));
}

export function subscribeCallSheetTemplates(productionId: string, callback: (rows: CallSheetTemplate[]) => void): () => void {
  return onSnapshot(collection(db, 'productions', productionId, 'callSheetTemplates'), snapshot => callback(snapshot.docs.map(item => item.data() as CallSheetTemplate).sort((a, b) => a.name.localeCompare(b.name))));
}

export const putCallSheetTemplate = (productionId: string, template: CallSheetTemplate) => setDoc(doc(db, 'productions', productionId, 'callSheetTemplates', template.id), clean({ ...template, updatedAt: Date.now() }));

export function callSheetTemplateFromSheet(productionId: string, sheet: CallSheet, actorUid: string, name: string, now = Date.now()): CallSheetTemplate {
  const base = minutes(sheet.generalCall);
  return {
    id: `call_template_${uid8()}`, productionId, name: name.trim() || 'Call Sheet Template', generalCall: sheet.generalCall,
    notes: sheet.notes, safetyNotes: sheet.safetyNotes, parkingNote: sheet.parkingNote, basecampNote: sheet.basecampNote,
    nearestHospital: sheet.nearestHospital,
    meals: sheet.meals.map(meal => ({ label: meal.label, offsetMinutes: minutes(meal.time) - base, note: meal.note })),
    createdBy: actorUid, createdAt: now, updatedAt: now,
  };
}

export function applyCallSheetTemplate(sheet: CallSheet, template: CallSheetTemplate): CallSheet {
  const delta = minutes(template.generalCall) - minutes(sheet.generalCall);
  return {
    ...sheet, generalCall: template.generalCall,
    shootingCall: sheet.shootingCall ? toTime(minutes(sheet.shootingCall) + delta) : undefined,
    estWrap: sheet.estWrap ? toTime(minutes(sheet.estWrap) + delta) : undefined,
    deptCalls: sheet.deptCalls.map(call => ({ ...call, callTime: toTime(minutes(call.callTime) + delta) })),
    castRows: sheet.castRows.map(row => ({ ...row,
      pickup: row.pickup ? toTime(minutes(row.pickup) + delta) : undefined,
      makeup: row.makeup ? toTime(minutes(row.makeup) + delta) : undefined,
      wardrobe: row.wardrobe ? toTime(minutes(row.wardrobe) + delta) : undefined,
      onSet: row.onSet ? toTime(minutes(row.onSet) + delta) : undefined,
    })),
    meals: template.meals.map(meal => ({ label: meal.label, time: toTime(minutes(template.generalCall) + meal.offsetMinutes), note: meal.note })),
    notes: template.notes, safetyNotes: template.safetyNotes, parkingNote: template.parkingNote,
    basecampNote: template.basecampNote, nearestHospital: template.nearestHospital, updatedAt: Date.now(),
  };
}

export async function publishCallSheetPackets(
  productionId: string, sheet: CallSheet, members: ProductionMember[], actorUid: string, deltaSummary: string,
): Promise<number> {
  const production = await fetchProduction(productionId);
  if (!production || !hasProductionPermission(production, actorUid, 'MANAGE_CALL_SHEETS')) throw new Error('Your role cannot publish call-sheet packets.');
  const now = Date.now();
  const version = sheet.status === 'PUBLISHED' ? sheet.version + 1 : sheet.version;
  const batch = writeBatch(db);
  batch.set(doc(db, 'productions', productionId, 'callsheets', sheet.id), clean({ ...sheet, status: 'PUBLISHED', version, publishedAt: now, updatedAt: now, changeLog: [...(sheet.changeLog || []), { at: now, summary: deltaSummary }] }));
  const prior = await getDocs(query(collection(db, 'productions', productionId, 'recipientDeliveries'), where('callSheetId', '==', sheet.id)));
  prior.docs.forEach(snapshot => { const row = snapshot.data() as RecipientDelivery; if (row.callSheetVersion < version && row.status !== 'SUPERSEDED') batch.update(snapshot.ref, { status: 'SUPERSEDED', updatedAt: now }); });
  const sceneIds = sheet.sceneRows.map(scene => scene.sceneId).filter((id): id is string => !!id);
  const calledIds = new Set([...sheet.castRows.map(row => row.memberId).filter(Boolean), ...members.filter(member => member.status === 'ACTIVE' && member.dept !== 'CAST').map(member => member.id)]);
  members.filter(member => calledIds.has(member.id)).forEach(member => {
    const isCast = member.isCast || member.dept === 'CAST';
    const castRow = sheet.castRows.find(row => row.memberId === member.id);
    const deptCall = sheet.deptCalls.find(row => row.dept === member.dept);
    const yourCall = isCast ? castRow?.pickup || castRow?.onSet || sheet.generalCall : deptCall?.callTime || sheet.generalCall;
    const id = recipientDeliveryId(sheet.id, version, member.id);
    const delivery: RecipientDelivery = { id, productionId, callSheetId: sheet.id, callSheetVersion: version, schedulePlanId: sheet.schedulePlanId, memberId: member.id, memberUid: member.uid, memberName: member.name, role: member.role, department: member.dept, channel: 'IN_APP', status: 'DELIVERED', packet: { yourCall, sceneIds: isCast ? sheet.sceneRows.filter(scene => scene.characters.some(character => (member.character || member.role).toUpperCase().includes(character.toUpperCase()))).map(scene => scene.sceneId).filter((sceneId): sceneId is string => !!sceneId) : sceneIds, includesSides: isCast, includesDepartmentBrief: !isCast }, deltaSummary: version > 1 ? deltaSummary : undefined, deliveredAt: now, updatedAt: now };
    batch.set(doc(db, 'productions', productionId, 'recipientDeliveries', id), clean(delivery));
  });
  const event: WorkflowEvent = { id: `evt_${uid8()}`, productionId, type: version > 1 ? 'CALLSHEET_REPUBLISHED' : 'CALLSHEET_PUBLISHED', actorUid, entityType: 'callSheet', entityId: sheet.id, summary: `${sheet.id} published to ${calledIds.size} recipients`, data: { version, deltaSummary }, createdAt: now };
  batch.set(doc(db, 'productions', productionId, 'workflowEvents', event.id), event);
  const publishedSheet = { ...sheet, status: 'PUBLISHED' as const, version, publishedAt: now, updatedAt: now };
  const impact = analyzeCallSheetImpact(publishedSheet, members);
  const actor = members.find(member => member.uid === actorUid);
  const action = makeProductionAction({
    productionId, trigger: version > 1 ? 'CALLSHEET_REPUBLISHED' : 'CALLSHEET_PUBLISHED',
    title: `Call Sheet · Day ${sheet.shootDay}${version > 1 ? ` · Revision ${version}` : ''}`,
    summary: version > 1 ? deltaSummary : impact.headline,
    entity: { productionId, entityType: 'CALL_SHEET', entityId: sheet.id }, impact,
    routeChannelKeys: ['schedule-calls', `shoot-day-${sheet.shootDay}`], targetUids: impact.affectedUids,
    requiredAcknowledgementUids: impact.affectedUids, requiredPermission: 'MANAGE_CALL_SHEETS',
    severity: version > 1 || impact.risks.length ? 'IMPORTANT' : 'ROUTINE', actorUid,
    actorName: actor?.name || production.title, dueAt: now + 6 * 60 * 60 * 1000,
  }, now);
  batch.set(doc(db, 'productions', productionId, 'productionActions', action.id), clean(action));
  await batch.commit();
  dispatchProductionAction(productionId, action.id, actorUid).catch(error => console.warn('[production-actions] call sheet queued for retry', error));
  return calledIds.size;
}

export async function markRecipientDeliveryViewed(productionId: string, callSheetId: string, version: number, member: ProductionMember): Promise<void> {
  const id = recipientDeliveryId(callSheetId, version, member.id);
  await runTransaction(db, async transaction => {
    const reference = doc(db, 'productions', productionId, 'recipientDeliveries', id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const row = snapshot.data() as RecipientDelivery;
    if (row.status === 'DELIVERED') transaction.update(reference, { status: 'VIEWED', viewedAt: Date.now(), updatedAt: Date.now() });
  });
}

export async function acknowledgeRecipientDelivery(productionId: string, callSheetId: string, version: number, member: ProductionMember, problemNote?: string): Promise<void> {
  const id = recipientDeliveryId(callSheetId, version, member.id);
  const reference = doc(db, 'productions', productionId, 'recipientDeliveries', id);
  const now = Date.now();
  await updateDoc(reference, problemNote ? { status: 'PROBLEM', problemNote: problemNote.slice(0, 500), viewedAt: now, updatedAt: now } : { status: 'CONFIRMED', confirmedAt: now, viewedAt: now, updatedAt: now });
}

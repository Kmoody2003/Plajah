import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { encryptText } from './cryptoService';
import { sendMessage } from './backendService';
import {
  fetchProduction, hasProductionPermission, uid8,
  type CallSheet, type DeptKey, type ProdTask, type Production, type ProductionLocation,
  type ProductionMember, type ProductionPermission, type ProductionScene,
} from './filmProductionService';
import type { BreakdownElement } from './productionBreakdownService';
import type { SchedulePlan } from './productionScheduleService';
import type { ProductionArtifactAcknowledgement, ProductionEntityRef } from './productionChatArtifacts';
import { productionRoomId } from './productionChatService';

export type ProductionActionTrigger =
  | 'SCHEDULE_APPROVED' | 'CALLSHEET_PUBLISHED' | 'CALLSHEET_REPUBLISHED'
  | 'SCENE_CHANGED' | 'BREAKDOWN_BLOCKED' | 'TASK_ASSIGNED' | 'SAFETY_ALERT'
  | 'MEMBER_JOINED' | 'LOCATION_CHANGED' | 'MANUAL';
export type ProductionActionStatus = 'READY' | 'PUBLISHING' | 'PUBLISHED' | 'ESCALATED' | 'CANCELLED';
export type ProductionActionSeverity = 'ROUTINE' | 'IMPORTANT' | 'URGENT';

export interface ProductionImpact {
  headline: string;
  affectedDepartments: DeptKey[];
  affectedUids: string[];
  affectedSceneIds: string[];
  consequences: string[];
  risks: string[];
}

export interface ProductionAction {
  id: string;
  productionId: string;
  trigger: ProductionActionTrigger;
  title: string;
  summary: string;
  entity: ProductionEntityRef;
  impact: ProductionImpact;
  routeChannelKeys: string[];
  targetUids: string[];
  requiredAcknowledgementUids: string[];
  requiredPermission: ProductionPermission;
  department?: DeptKey;
  departmentChannel?: string;
  status: ProductionActionStatus;
  severity: ProductionActionSeverity;
  actorUid: string;
  actorName: string;
  dueAt?: number;
  deliveredChannelKeys?: string[];
  createdAt: number;
  publishedAt?: number;
  escalatedAt?: number;
  updatedAt: number;
}

export interface ProductionWorkItem {
  id: string;
  kind: 'ACKNOWLEDGEMENT' | 'CALL_SHEET' | 'TASK' | 'ALERT' | 'PUBLISH';
  title: string;
  detail: string;
  urgency: ProductionActionSeverity;
  dueAt?: number;
  entity?: ProductionEntityRef;
  actionId?: string;
  callSheetVersion?: number;
}

const activeMembers = (members: ProductionMember[]) => members.filter(member => member.status === 'ACTIVE' && member.uid);
const unique = <T,>(values: T[]) => Array.from(new Set(values));
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const departmentChannel = (department?: DeptKey) => department ? `dept-${department.toLowerCase()}` : 'general';
const memberUids = (members: ProductionMember[], department?: DeptKey) => activeMembers(members)
  .filter(member => !department || member.dept === department || member.dept === 'PRODUCTION' || member.dept === 'DIRECTION')
  .map(member => member.uid!);

export function canPublishProductionAction(production: Production, actorUid: string, action: ProductionAction): boolean {
  if (hasProductionPermission(production, actorUid, action.requiredPermission)) return true;
  const isMember = production.ownerUid === actorUid || (production.memberUids || []).includes(actorUid);
  if (action.trigger === 'SAFETY_ALERT') return isMember;
  if (action.trigger === 'MEMBER_JOINED') return isMember && action.entity.entityType === 'MEMBER' && action.entity.entityId === actorUid;
  if (action.trigger === 'BREAKDOWN_BLOCKED') {
    const authority = production.authority?.[actorUid];
    return !!action.department && authority?.department === action.department && authority.permissions.includes('MANAGE_DEPARTMENT_BREAKDOWN');
  }
  return false;
}

/** Pure impact engine. It deliberately reports consequences rather than mutating downstream records. */
export function analyzeScheduleImpact(
  production: Production,
  plan: SchedulePlan,
  scenes: ProductionScene[],
  members: ProductionMember[],
  previous?: SchedulePlan | null,
): ProductionImpact {
  const scheduledIds = plan.strips.filter(strip => strip.type === 'SCENE' && strip.sceneId).map(strip => strip.sceneId!);
  const priorDay = new Map((previous?.strips || []).filter(strip => strip.sceneId).map(strip => [strip.sceneId!, strip.dayId]));
  const moved = plan.strips.filter(strip => strip.sceneId && priorDay.has(strip.sceneId) && priorDay.get(strip.sceneId) !== strip.dayId).map(strip => strip.sceneId!);
  const scheduledScenes = scenes.filter(scene => scheduledIds.includes(scene.id));
  const text = scheduledScenes.map(scene => `${scene.synopsis} ${scene.notes || ''}`).join(' ').toLowerCase();
  const departments = unique(activeMembers(members).map(member => member.dept));
  const consequences = [
    `${plan.days.length} shoot day${plan.days.length === 1 ? '' : 's'} become production truth.`,
    `${scheduledIds.length} scene assignment${scheduledIds.length === 1 ? '' : 's'} feed call sheets and personal briefs.`,
    ...(moved.length ? [`${moved.length} scene${moved.length === 1 ? '' : 's'} moved from the previous approved plan.`] : []),
    'Cast calls, department prep, locations, transport, meals, and shoot-day rooms may be regenerated.',
  ];
  const risks = [
    ...(scheduledIds.length !== scenes.length ? [`${Math.abs(scenes.length - scheduledIds.length)} production scene${Math.abs(scenes.length - scheduledIds.length) === 1 ? '' : 's'} are not represented in this plan.`] : []),
    ...(/stunt|fight|weapon|fire|crash|explosion/.test(text) ? ['Safety and Stunts/SFX review is required for risk-bearing scenes.'] : []),
    ...(plan.days.some(day => !day.date) ? ['One or more shoot days do not have a date.'] : []),
  ];
  return {
    headline: `${production.title}: ${plan.label} v${plan.version} affects ${scheduledIds.length} scenes and ${activeMembers(members).length} active people.`,
    affectedDepartments: departments,
    affectedUids: activeMembers(members).map(member => member.uid!),
    affectedSceneIds: unique(scheduledIds), consequences, risks,
  };
}

export function analyzeCallSheetImpact(sheet: CallSheet, members: ProductionMember[]): ProductionImpact {
  const active = activeMembers(members);
  const calledMemberIds = new Set([
    ...sheet.castRows.map(row => row.memberId).filter(Boolean),
    ...active.filter(member => member.dept !== 'CAST').map(member => member.id),
  ]);
  const called = active.filter(member => calledMemberIds.has(member.id));
  const risks = [
    ...(!sheet.nearestHospital ? ['Nearest hospital is missing.'] : []),
    ...(!sheet.safetyNotes ? ['Safety notes have not been added.'] : []),
    ...(!sheet.locationAddress ? ['Location address is missing.'] : []),
  ];
  return {
    headline: `Shoot Day ${sheet.shootDay} calls ${called.length} people at ${sheet.generalCall}.`,
    affectedDepartments: unique(called.map(member => member.dept)),
    affectedUids: called.map(member => member.uid!),
    affectedSceneIds: sheet.sceneRows.map(row => row.sceneId).filter((id): id is string => !!id),
    consequences: [
      `${called.length} personalized call packets require confirmation.`,
      `${sheet.sceneRows.length} scene${sheet.sceneRows.length === 1 ? '' : 's'} drive sides and department briefs.`,
      `Schedule & Calls and Shoot Day ${sheet.shootDay} receive the authoritative live card.`,
    ],
    risks,
  };
}

export function makeProductionAction(input: Omit<ProductionAction, 'id' | 'status' | 'deliveredChannelKeys' | 'createdAt' | 'updatedAt'>, now = Date.now()): ProductionAction {
  return { ...input, id: `action_${uid8()}`, status: 'READY', deliveredChannelKeys: [], createdAt: now, updatedAt: now };
}

export async function queueProductionAction(action: ProductionAction): Promise<void> {
  await setDoc(doc(db, 'productions', action.productionId, 'productionActions', action.id), clean(action));
}

export function subscribeProductionActions(productionId: string, callback: (rows: ProductionAction[]) => void): () => void {
  return onSnapshot(collection(db, 'productions', productionId, 'productionActions'), snapshot => callback(snapshot.docs.map(item => item.data() as ProductionAction).sort((a, b) => b.createdAt - a.createdAt)));
}

export async function dispatchProductionAction(productionId: string, actionId: string, actorUid: string): Promise<void> {
  const production = await fetchProduction(productionId);
  const reference = doc(db, 'productions', productionId, 'productionActions', actionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('Production action not found.');
  const action = snapshot.data() as ProductionAction;
  if (!production || !canPublishProductionAction(production, actorUid, action)) throw new Error('Your production role cannot publish this change.');
  if (action.status === 'CANCELLED') throw new Error('This production action was cancelled.');
  await updateDoc(reference, { status: 'PUBLISHING', updatedAt: Date.now() });
  const delivered = new Set(action.deliveredChannelKeys || []);
  try {
    for (const key of action.routeChannelKeys) {
      if (delivered.has(key)) continue;
      const roomId = productionRoomId(productionId, key);
      await sendMessage(roomId, {
        senderId: actorUid, senderName: action.actorName, senderPhoto: '', type: 'ACTION',
        text: await encryptText(`${action.title}: ${action.summary}`, roomId), productionEntity: { ...action.entity, actionId: action.id },
        mentionUids: action.targetUids.slice(0, 100),
      });
      delivered.add(key);
      await updateDoc(reference, { deliveredChannelKeys: [...delivered], updatedAt: Date.now() });
    }
    await updateDoc(reference, { status: action.status === 'ESCALATED' ? 'ESCALATED' : 'PUBLISHED', publishedAt: Date.now(), deliveredChannelKeys: [...delivered], updatedAt: Date.now() });
  } catch (error) {
    await updateDoc(reference, { status: 'READY', deliveredChannelKeys: [...delivered], updatedAt: Date.now() });
    throw error;
  }
}

export async function queueAndDispatchProductionAction(action: ProductionAction): Promise<void> {
  await queueProductionAction(action);
  await dispatchProductionAction(action.productionId, action.id, action.actorUid);
}

async function productionContext(productionId: string): Promise<{ production: Production; members: ProductionMember[] }> {
  const [production, snapshot] = await Promise.all([
    fetchProduction(productionId), getDocs(collection(db, 'productions', productionId, 'members')),
  ]);
  if (!production) throw new Error('Production not found.');
  return { production, members: snapshot.docs.map(item => item.data() as ProductionMember) };
}

async function publishBestEffort(action: ProductionAction): Promise<ProductionAction> {
  await queueProductionAction(action);
  dispatchProductionAction(action.productionId, action.id, action.actorUid)
    .catch(error => console.warn('[production-actions] change queued for retry', error));
  return action;
}

export async function putTaskWithAction(productionId: string, task: ProdTask, actorUid: string, actorName: string): Promise<ProductionAction> {
  const { production, members } = await productionContext(productionId);
  if (!hasProductionPermission(production, actorUid, 'MANAGE_TASKS')) throw new Error('Your production role cannot assign tasks.');
  await setDoc(doc(db, 'productions', productionId, 'tasks', task.id), clean(task));
  const assignee = members.find(member => member.id === task.assigneeMemberId);
  const affected = unique([...(assignee?.uid ? [assignee.uid] : []), ...memberUids(members, task.dept)]);
  const action = makeProductionAction({
    productionId, trigger: 'TASK_ASSIGNED', title: task.title,
    summary: assignee ? `Assigned to ${assignee.name}${task.due ? ` · due ${task.due}` : ''}.` : `New ${task.dept || 'production'} task is ready for assignment.`,
    entity: { productionId, entityType: 'TASK', entityId: task.id },
    impact: { headline: `${task.title} is now production work.`, affectedDepartments: task.dept ? [task.dept] : [], affectedUids: affected, affectedSceneIds: [], consequences: [assignee ? `${assignee.name} owns this task.` : 'A department owner is still required.'], risks: task.priority === 'URGENT' ? ['Urgent task requires prompt review.'] : [] },
    routeChannelKeys: unique([departmentChannel(task.dept), assignee ? 'crew-help' : 'general']), targetUids: affected,
    requiredAcknowledgementUids: assignee?.uid ? [assignee.uid] : [], requiredPermission: 'MANAGE_TASKS', department: task.dept,
    severity: task.priority === 'URGENT' ? 'URGENT' : task.priority === 'HIGH' ? 'IMPORTANT' : 'ROUTINE', actorUid, actorName,
    dueAt: task.due ? new Date(`${task.due}T23:59:59`).getTime() : undefined,
  });
  return publishBestEffort(action);
}

export async function patchSceneWithAction(productionId: string, sceneId: string, patch: Partial<ProductionScene>, actorUid: string, actorName: string): Promise<ProductionAction> {
  const { production, members } = await productionContext(productionId);
  if (!hasProductionPermission(production, actorUid, 'EDIT_SCRIPT_BREAKDOWN')) throw new Error('Your production role cannot update scenes.');
  const reference = doc(db, 'productions', productionId, 'scenes', sceneId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('Scene not found.');
  const previous = snapshot.data() as ProductionScene;
  const next = { ...previous, ...patch };
  await updateDoc(reference, { ...patch, updatedAt: Date.now() });
  const scheduleSensitive = ['shootDay', 'locationId', 'set', 'dayNight', 'status'].some(key => key in patch);
  const affected = activeMembers(members).filter(member => ['PRODUCTION', 'DIRECTION', 'SCRIPT', 'CAST', 'LOCATIONS'].includes(member.dept)).map(member => member.uid!);
  return publishBestEffort(makeProductionAction({
    productionId, trigger: 'SCENE_CHANGED', title: `Scene ${next.sceneNum} updated`, summary: `${next.set} · ${next.status.replaceAll('_', ' ')}`,
    entity: { productionId, entityType: 'SCENE', entityId: sceneId },
    impact: { headline: `Scene ${next.sceneNum} changed from the current production truth.`, affectedDepartments: ['DIRECTION', 'SCRIPT', ...(scheduleSensitive ? ['PRODUCTION', 'LOCATIONS'] as DeptKey[] : [])], affectedUids: affected, affectedSceneIds: [sceneId], consequences: [scheduleSensitive ? 'Schedule, calls, and live call-sheet projections may change.' : 'Creative and continuity views update from the original scene.'], risks: next.status === 'OMIT' ? ['Omitting a scene may affect schedule and continuity.'] : [] },
    routeChannelKeys: unique([scheduleSensitive ? 'schedule-calls' : 'dept-direction', 'dept-script']), targetUids: affected,
    requiredAcknowledgementUids: scheduleSensitive ? affected : [], requiredPermission: 'EDIT_SCRIPT_BREAKDOWN', severity: scheduleSensitive ? 'IMPORTANT' : 'ROUTINE', actorUid, actorName,
  }));
}

export async function putLocationWithAction(productionId: string, location: ProductionLocation, actorUid: string, actorName: string): Promise<ProductionAction> {
  const { production, members } = await productionContext(productionId);
  if (!hasProductionPermission(production, actorUid, 'MANAGE_LOCATIONS')) throw new Error('Your production role cannot update locations.');
  const prior = await getDoc(doc(db, 'productions', productionId, 'locations', location.id));
  await setDoc(doc(db, 'productions', productionId, 'locations', location.id), { ...location, updatedAt: Date.now() });
  const material = prior.exists() && ['address', 'city', 'permitStatus'].some(key => prior.data()[key] !== (location as any)[key]);
  const affected = activeMembers(members).filter(member => ['PRODUCTION', 'DIRECTION', 'LOCATIONS', 'TRANSPORT'].includes(member.dept)).map(member => member.uid!);
  return publishBestEffort(makeProductionAction({
    productionId, trigger: 'LOCATION_CHANGED', title: `${location.name} ${prior.exists() ? 'updated' : 'added'}`, summary: `${location.address}${location.city ? `, ${location.city}` : ''} · permit ${location.permitStatus.toLowerCase()}`,
    entity: { productionId, entityType: 'LOCATION', entityId: location.id },
    impact: { headline: `${location.name} is now linked production data.`, affectedDepartments: ['LOCATIONS', 'TRANSPORT', 'PRODUCTION'], affectedUids: affected, affectedSceneIds: [], consequences: ['Location, transport, schedule, and call-sheet teams see the live source record.'], risks: ['DENIED', 'PENDING'].includes(location.permitStatus) ? [`Permit is ${location.permitStatus.toLowerCase()}.`] : [] },
    routeChannelKeys: unique(['dept-locations', ...(material || location.permitStatus !== 'APPROVED' ? ['schedule-calls'] : [])]), targetUids: affected,
    requiredAcknowledgementUids: material ? affected : [], requiredPermission: 'MANAGE_LOCATIONS', department: 'LOCATIONS', severity: location.permitStatus === 'DENIED' ? 'URGENT' : material || location.permitStatus === 'PENDING' ? 'IMPORTANT' : 'ROUTINE', actorUid, actorName,
  }));
}

export async function patchBreakdownWithAction(productionId: string, element: BreakdownElement, patch: Partial<Pick<BreakdownElement, 'status' | 'ownerMemberId' | 'ownerRole' | 'notes'>>, actorUid: string, actorName: string): Promise<ProductionAction | null> {
  const { production, members } = await productionContext(productionId);
  const authority = production.authority?.[actorUid];
  const allowed = hasProductionPermission(production, actorUid, 'EDIT_SCRIPT_BREAKDOWN') || (authority?.department === element.department && authority.permissions.includes('MANAGE_DEPARTMENT_BREAKDOWN'));
  if (!allowed) throw new Error('Your production role cannot update this department breakdown.');
  await updateDoc(doc(db, 'productions', productionId, 'breakdownElements', element.id), { ...patch, updatedAt: Date.now() });
  if (patch.status !== 'BLOCKED' || element.status === 'BLOCKED') return null;
  const affected = memberUids(members, element.department);
  const safety = ['SAFETY', 'STUNTS', 'SFX', 'INTIMACY', 'ANIMALS'].includes(element.category);
  return publishBestEffort(makeProductionAction({
    productionId, trigger: 'BREAKDOWN_BLOCKED', title: `Blocked: ${element.name}`, summary: patch.notes || element.notes || `${element.department.replaceAll('_', ' ')} needs help before this element is ready.`,
    entity: { productionId, entityType: 'BREAKDOWN', entityId: element.id },
    impact: { headline: `${element.name} is blocking ${element.occurrences.length} scene occurrence(s).`, affectedDepartments: [element.department], affectedUids: affected, affectedSceneIds: unique(element.occurrences.map(row => row.sceneId)), consequences: ['Department readiness and dependent scene prep are blocked.'], risks: safety ? ['This element carries a safety-sensitive category.'] : [] },
    routeChannelKeys: unique([departmentChannel(element.department), ...(safety ? ['safety'] : ['crew-help'])]), targetUids: affected,
    requiredAcknowledgementUids: affected, requiredPermission: 'EDIT_SCRIPT_BREAKDOWN', department: element.department,
    departmentChannel: departmentChannel(element.department), severity: safety ? 'URGENT' : 'IMPORTANT', actorUid, actorName,
  }));
}

export async function announceProductionMemberJoined(productionId: string, member: ProductionMember, actorUid: string, actorName: string, joinedVia: 'HIRING' | 'INVITE' | 'MANUAL'): Promise<ProductionAction> {
  const { members } = await productionContext(productionId);
  const affected = unique(activeMembers(members).map(row => row.uid!));
  return publishBestEffort(makeProductionAction({
    productionId, trigger: 'MEMBER_JOINED', title: `${member.name} joined the production`, summary: `${member.role} · ${member.dept.replaceAll('_', ' ')} · joined via ${joinedVia.toLowerCase()}`,
    entity: { productionId, entityType: 'MEMBER', entityId: member.uid || member.id },
    impact: { headline: `${member.name} is active in the production roster.`, affectedDepartments: [member.dept], affectedUids: affected, affectedSceneIds: [], consequences: ['Their role controls production access, briefs, channels, and assigned work.'], risks: [] },
    routeChannelKeys: joinedVia === 'INVITE' ? ['general'] : unique(['general', departmentChannel(member.dept)]), targetUids: affected, requiredAcknowledgementUids: [],
    requiredPermission: joinedVia === 'HIRING' ? 'MANAGE_HIRING' : 'MANAGE_ROSTER', department: member.dept, severity: 'ROUTINE', actorUid, actorName,
  }));
}

export async function createSafetyAlertWithAction(productionId: string, actorUid: string, actorName: string, title: string, detail: string, severity: 'INFO' | 'IMPORTANT' | 'URGENT'): Promise<ProductionAction> {
  const { production, members } = await productionContext(productionId);
  if (!(production.ownerUid === actorUid || (production.memberUids || []).includes(actorUid))) throw new Error('Only production members can send safety alerts.');
  const now = Date.now(); const id = `alert_${now.toString(36)}`;
  await setDoc(doc(db, 'productions', productionId, 'alerts', id), { id, productionId, title: title.trim(), detail: detail.trim(), severity, status: 'ACTIVE', authorUid: actorUid, authorName: actorName, createdAt: now, updatedAt: now });
  const affected = activeMembers(members).map(member => member.uid!);
  return publishBestEffort(makeProductionAction({
    productionId, trigger: 'SAFETY_ALERT', title: title.trim(), summary: detail.trim(), entity: { productionId, entityType: 'ALERT', entityId: id },
    impact: { headline: `Safety notice from ${actorName}.`, affectedDepartments: unique(activeMembers(members).map(member => member.dept)), affectedUids: affected, affectedSceneIds: [], consequences: ['The Safety room receives the authoritative live alert.'], risks: severity === 'URGENT' ? ['Stop-work review and acknowledgement may be required.'] : [] },
    routeChannelKeys: ['safety'], targetUids: affected, requiredAcknowledgementUids: severity === 'URGENT' ? affected : [], requiredPermission: 'MANAGE_ROSTER',
    severity: severity === 'URGENT' ? 'URGENT' : severity === 'IMPORTANT' ? 'IMPORTANT' : 'ROUTINE', actorUid, actorName, dueAt: severity === 'URGENT' ? now + 30 * 60 * 1000 : undefined,
  }, now));
}

export async function escalateProductionAction(productionId: string, actionId: string, actorUid: string): Promise<void> {
  const production = await fetchProduction(productionId);
  if (!production || !(hasProductionPermission(production, actorUid, 'MANAGE_ROSTER') || hasProductionPermission(production, actorUid, 'MANAGE_SCHEDULE') || hasProductionPermission(production, actorUid, 'MANAGE_CALL_SHEETS'))) throw new Error('Your role cannot escalate production work.');
  await updateDoc(doc(db, 'productions', productionId, 'productionActions', actionId), { status: 'ESCALATED', severity: 'URGENT', escalatedAt: Date.now(), updatedAt: Date.now() });
}

export function buildProductionWorkItems(input: {
  productionId: string; uid: string; member: ProductionMember | null; actions: ProductionAction[]; acknowledgements: ProductionArtifactAcknowledgement[];
  tasks: ProdTask[]; deliveries: Array<{ id: string; memberUid?: string; status: string; callSheetId: string; callSheetVersion: number; deltaSummary?: string }>;
  canPublish: (permission: ProductionPermission) => boolean; canPublishAction?: (action: ProductionAction) => boolean;
}, now = Date.now()): ProductionWorkItem[] {
  const { productionId, uid, member, actions, acknowledgements, tasks, deliveries, canPublish } = input;
  const acknowledged = new Set(acknowledgements.filter(row => row.uid === uid && row.state === 'ACKNOWLEDGED').map(row => row.actionId || `${row.entityType}:${row.entityId}`));
  const items: ProductionWorkItem[] = [];
  actions.forEach(action => {
    if (action.status === 'READY' && (input.canPublishAction?.(action) ?? canPublish(action.requiredPermission))) items.push({ id: `publish_${action.id}`, kind: 'PUBLISH', title: `Publish: ${action.title}`, detail: action.impact.headline, urgency: action.severity, dueAt: action.dueAt, entity: action.entity, actionId: action.id });
    if (['PUBLISHED', 'ESCALATED'].includes(action.status) && action.requiredAcknowledgementUids.includes(uid) && !acknowledged.has(action.id)) items.push({ id: `ack_${action.id}`, kind: 'ACKNOWLEDGEMENT', title: action.title, detail: `${action.summary} · acknowledgement required`, urgency: action.dueAt && action.dueAt < now ? 'URGENT' : action.severity, dueAt: action.dueAt, entity: { ...action.entity, actionId: action.id }, actionId: action.id });
  });
  deliveries.filter(row => row.memberUid === uid && !['CONFIRMED', 'SUPERSEDED'].includes(row.status)).forEach(row => items.push({ id: `delivery_${row.id}`, kind: 'CALL_SHEET', title: `Confirm call sheet v${row.callSheetVersion}`, detail: row.deltaSummary || 'Review your personal call and confirm receipt.', urgency: 'IMPORTANT', entity: { productionId, entityType: 'CALL_SHEET', entityId: row.callSheetId }, callSheetVersion: row.callSheetVersion }));
  tasks.filter(task => member && task.assigneeMemberId === member.id && task.status !== 'DONE').forEach(task => items.push({ id: `task_${task.id}`, kind: 'TASK', title: task.title, detail: `${task.status.replace('_', ' ')}${task.due ? ` · due ${task.due}` : ''}`, urgency: task.priority === 'URGENT' ? 'URGENT' : task.priority === 'HIGH' ? 'IMPORTANT' : 'ROUTINE', entity: { productionId, entityType: 'TASK', entityId: task.id } }));
  return items.sort((a, b) => (a.urgency === 'URGENT' ? -2 : a.urgency === 'IMPORTANT' ? -1 : 0) - (b.urgency === 'URGENT' ? -2 : b.urgency === 'IMPORTANT' ? -1 : 0) || (a.dueAt || Infinity) - (b.dueAt || Infinity));
}

import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db } from './firebase';
import {
  DEPARTMENTS, hasProductionPermission, type CallSheet, type DeptKey, type Production,
  type ProductionMember, type ProductionScene,
} from './filmProductionService';
import type { ChatRoom } from '../types';

export type ProductionChannelKind = NonNullable<ChatRoom['productionChannelKind']>;

export interface ProductionChannelBlueprint {
  key: string;
  name: string;
  description: string;
  kind: ProductionChannelKind;
  department?: DeptKey;
  dayNumber?: number;
  radioChannel: number;
  postingPolicy: 'ALL_MEMBERS' | 'PRODUCTION_LEADS';
  reason: string;
}

export interface ProductionPersonalNote {
  id: string;
  productionId: string;
  uid: string;
  text: string;
  updatedAt: number;
}

export interface ProductionRadioTransmission {
  id: string;
  productionId: string;
  channelKey: string;
  radioChannel: number;
  fromUid: string;
  fromName: string;
  audioUrl: string;
  storagePath: string;
  durationMs: number;
  createdAt: number;
}

const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
export const productionRoomId = (productionId: string, key: string) => `prodchat_${safe(productionId)}_${safe(key)}`;

const BASE_CHANNELS: ProductionChannelBlueprint[] = [
  { key: 'announcements', name: 'Announcements', description: 'Approved production-wide decisions and urgent notices.', kind: 'ANNOUNCEMENTS', radioChannel: 1, postingPolicy: 'PRODUCTION_LEADS', reason: 'Every production needs one authoritative broadcast lane.' },
  { key: 'general', name: 'General', description: 'Company-wide conversation and coordination.', kind: 'GENERAL', radioChannel: 1, postingPolicy: 'ALL_MEMBERS', reason: 'Every production needs a shared company room.' },
  { key: 'schedule-calls', name: 'Schedule & Calls', description: 'Schedule changes, call sheets, availability, and movement.', kind: 'SCHEDULE', radioChannel: 1, postingPolicy: 'ALL_MEMBERS', reason: 'Schedule truth and acknowledgement need a shared operational lane.' },
  { key: 'safety', name: 'Safety', description: 'Hazards, incidents, medical information, and stop-work alerts.', kind: 'SAFETY', radioChannel: 1, postingPolicy: 'ALL_MEMBERS', reason: 'Every set needs a visible safety channel.' },
  { key: 'crew-help', name: 'Crew Help', description: 'Questions, requests, lost-and-found, and practical support.', kind: 'HELP', radioChannel: 1, postingPolicy: 'ALL_MEMBERS', reason: 'Keeps operational questions out of authoritative channels.' },
];

export function deriveProductionChannels(
  production: Production,
  members: ProductionMember[],
  scenes: ProductionScene[] = [],
  callSheets: CallSheet[] = [],
): ProductionChannelBlueprint[] {
  const active = members.filter(member => member.status === 'ACTIVE');
  const departments = new Set(active.map(member => member.dept));
  const channels = [...BASE_CHANNELS];
  DEPARTMENTS.filter(dept => departments.has(dept.key) && !['PRODUCTION', 'OTHER'].includes(dept.key)).forEach(dept => {
    channels.push({
      key: `dept-${dept.key.toLowerCase()}`, name: dept.label, description: dept.focus.slice(0, 2).join(' · '),
      kind: 'DEPARTMENT', department: dept.key, radioChannel: dept.channel, postingPolicy: 'ALL_MEMBERS',
      reason: `${active.filter(member => member.dept === dept.key).length} active ${dept.label} member(s).`,
    });
  });
  const sceneText = scenes.map(scene => `${scene.set} ${scene.synopsis} ${scene.notes || ''}`).join(' ').toLowerCase();
  const uniqueSets = new Set(scenes.map(scene => scene.set.trim().toLowerCase()).filter(Boolean));
  const inferred: DeptKey[] = [];
  if (/stunt|fight|crash|weapon|fire|explosion|fall|chase/.test(sceneText)) inferred.push('STUNTS_SFX');
  if (uniqueSets.size > 1) inferred.push('LOCATIONS', 'TRANSPORT');
  inferred.filter(department => !departments.has(department)).forEach(department => {
    const dept = DEPARTMENTS.find(row => row.key === department)!;
    channels.push({ key: `dept-${department.toLowerCase()}`, name: dept.label, description: dept.focus.slice(0, 2).join(' · '), kind: 'DEPARTMENT', department, radioChannel: dept.channel, postingPolicy: 'ALL_MEMBERS', reason: `The ${production.format || 'film'} scene plan indicates ${dept.label.toLowerCase()} coordination is needed.` });
  });
  const days = new Map<number, CallSheet>();
  callSheets.filter(sheet => sheet.status === 'PUBLISHED' || !!sheet.schedulePlanId).forEach(sheet => days.set(sheet.shootDay, sheet));
  [...days.entries()].sort(([a], [b]) => a - b).forEach(([day, sheet]) => channels.push({
    key: `shoot-day-${day}`, name: `Shoot Day ${day}`, description: `${sheet.date || 'Date TBD'} · ${sheet.locationName || 'Location TBD'} · call ${sheet.generalCall}`,
    kind: 'SHOOT_DAY', dayNumber: day, radioChannel: 1, postingPolicy: 'ALL_MEMBERS',
    reason: `Generated from call sheet ${sheet.id}.`,
  }));
  // A no-roster development project remains intentionally small; rooms appear as staffing and calls solidify.
  return channels.filter((channel, index, all) => all.findIndex(row => row.key === channel.key) === index);
}

export const canManageProductionChat = (production: Production, uid: string) =>
  production.ownerUid === uid || hasProductionPermission(production, uid, 'MANAGE_ROSTER') || hasProductionPermission(production, uid, 'MANAGE_SCHEDULE');

export async function provisionProductionChat(
  production: Production,
  members: ProductionMember[],
  scenes: ProductionScene[],
  callSheets: CallSheet[],
  actorUid: string,
): Promise<ProductionChannelBlueprint[]> {
  if (!canManageProductionChat(production, actorUid)) throw new Error('Your production role cannot change the chat structure.');
  const blueprints = deriveProductionChannels(production, members, scenes, callSheets);
  const participants = Array.from(new Set([production.ownerUid, ...members.filter(member => member.status === 'ACTIVE' && member.uid).map(member => member.uid!)]));
  const productionLeadUids = Array.from(new Set([production.ownerUid, ...Object.entries(production.authority || {}).filter(([, authority]) => authority.permissions.includes('MANAGE_ROSTER') || authority.permissions.includes('MANAGE_SCHEDULE')).map(([uid]) => uid)]));
  const batch = writeBatch(db);
  const now = Date.now();
  blueprints.forEach(channel => {
    const id = productionRoomId(production.id, channel.key);
    const channelParticipants = channel.kind === 'DEPARTMENT'
      ? Array.from(new Set([...productionLeadUids, ...members.filter(member => member.status === 'ACTIVE' && member.uid && (member.dept === channel.department || member.dept === 'PRODUCTION' || member.dept === 'DIRECTION')).map(member => member.uid!)]))
      : participants;
    const room: ChatRoom = {
      id, participants: channelParticipants, type: 'GROUP', name: channel.name, ownerId: production.ownerUid, updatedAt: now,
      workspaceType: 'PRODUCTION', productionId: production.id, productionTitle: production.title,
      productionChannelKey: channel.key, productionChannelKind: channel.kind,
      productionDepartment: channel.department, productionDayNumber: channel.dayNumber,
      channelDescription: channel.description, radioChannel: channel.radioChannel,
      nibblesEnabled: false, postingPolicy: channel.postingPolicy, productionLeadUids,
    };
    batch.set(doc(db, 'chat_rooms', id), JSON.parse(JSON.stringify(room)), { merge: true });
  });
  batch.set(doc(db, 'productions', production.id), { chatProvisionedAt: now, chatChannelKeys: blueprints.map(channel => channel.key), updatedAt: now }, { merge: true });
  await batch.commit();
  return blueprints;
}

export function subscribeProductionRooms(productionId: string, uid: string, callback: (rooms: ChatRoom[]) => void): () => void {
  return onSnapshot(query(collection(db, 'chat_rooms'), where('participants', 'array-contains', uid)), snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ChatRoom)).filter(room => room.productionId === productionId).sort((a, b) => (a.productionChannelKey || '').localeCompare(b.productionChannelKey || '')));
  });
}

export function subscribePersonalProductionNote(productionId: string, uid: string, callback: (note: ProductionPersonalNote | null) => void): () => void {
  return onSnapshot(doc(db, 'productions', productionId, 'memberNotes', uid), snapshot => callback(snapshot.exists() ? snapshot.data() as ProductionPersonalNote : null));
}

export function savePersonalProductionNote(productionId: string, uid: string, text: string): Promise<void> {
  const note: ProductionPersonalNote = { id: uid, productionId, uid, text: text.slice(0, 10000), updatedAt: Date.now() };
  return setDoc(doc(db, 'productions', productionId, 'memberNotes', uid), note);
}

export function subscribeProductionRadio(productionId: string, channelKey: string, callback: (rows: ProductionRadioTransmission[]) => void): () => void {
  return onSnapshot(query(collection(db, 'productions', productionId, 'radioTransmissions'), orderBy('createdAt', 'asc')), snapshot => {
    callback(snapshot.docs.map(item => item.data() as ProductionRadioTransmission).filter(row => row.channelKey === channelKey).slice(-20));
  });
}

export async function sendProductionRadio(
  productionId: string, channelKey: string, radioChannel: number, fromUid: string, fromName: string, blob: Blob, durationMs: number,
): Promise<ProductionRadioTransmission> {
  const id = `radio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `productionRadio/${safe(productionId)}/${safe(channelKey)}/${id}.webm`;
  const reference = storageRef(getStorage(), path);
  await uploadBytes(reference, blob, { contentType: blob.type || 'audio/webm' });
  const row: ProductionRadioTransmission = {
    id, productionId, channelKey, radioChannel, fromUid, fromName, audioUrl: await getDownloadURL(reference),
    storagePath: path, durationMs, createdAt: Date.now(),
  };
  await setDoc(doc(db, 'productions', productionId, 'radioTransmissions', id), row);
  return row;
}

export const removeProductionRadio = (productionId: string, id: string) => deleteDoc(doc(db, 'productions', productionId, 'radioTransmissions', id));

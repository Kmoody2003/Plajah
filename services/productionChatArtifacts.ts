import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { hasProductionPermission, type Production, type ProductionPermission } from './filmProductionService';

export type ProductionEntityType = 'TASK' | 'SCENE' | 'BREAKDOWN' | 'CALL_SHEET' | 'SCHEDULE' | 'DECISION' | 'ALERT' | 'MEMBER' | 'LOCATION';
export interface ProductionEntityRef { productionId: string; entityType: ProductionEntityType; entityId: string; actionId?: string }

export interface ProductionDecision {
  id: string; productionId: string; title: string; detail: string;
  status: 'OPEN' | 'DECIDED'; outcome?: string;
  authorUid: string; authorName: string; createdAt: number; updatedAt: number;
}
export interface ProductionAlert {
  id: string; productionId: string; title: string; detail: string;
  severity: 'INFO' | 'IMPORTANT' | 'URGENT'; status: 'ACTIVE' | 'RESOLVED';
  authorUid: string; authorName: string; createdAt: number; updatedAt: number; resolvedAt?: number;
}
export interface ProductionArtifactAcknowledgement {
  id: string; productionId: string; entityType: ProductionEntityType; entityId: string;
  actionId?: string; uid: string; state: 'ACKNOWLEDGED' | 'NEEDS_CLARIFICATION'; note?: string; updatedAt: number;
}

const entityCollection = (type: ProductionEntityType) => ({
  TASK: 'tasks', SCENE: 'scenes', BREAKDOWN: 'breakdownElements', CALL_SHEET: 'callsheets',
  SCHEDULE: 'schedulePlans', DECISION: 'decisions', ALERT: 'alerts',
  MEMBER: 'members', LOCATION: 'locations',
}[type]);

export function subscribeProductionEntity(reference: ProductionEntityRef, callback: (value: Record<string, any> | null) => void): () => void {
  return onSnapshot(doc(db, 'productions', reference.productionId, entityCollection(reference.entityType), reference.entityId), snapshot => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null));
}

export function subscribeAllArtifactAcknowledgements(productionId: string, callback: (rows: ProductionArtifactAcknowledgement[]) => void): () => void {
  return onSnapshot(collection(db, 'productions', productionId, 'artifactAcknowledgements'), snapshot => callback(snapshot.docs.map(item => item.data() as ProductionArtifactAcknowledgement)));
}

export function subscribeArtifactAcknowledgements(reference: ProductionEntityRef, callback: (rows: ProductionArtifactAcknowledgement[]) => void): () => void {
  return subscribeAllArtifactAcknowledgements(reference.productionId, rows => callback(rows.filter(row => row.entityType === reference.entityType && row.entityId === reference.entityId && (reference.actionId ? row.actionId === reference.actionId : !row.actionId))));
}

export function acknowledgeProductionArtifact(reference: ProductionEntityRef, uid: string, state: ProductionArtifactAcknowledgement['state'], note?: string): Promise<void> {
  const id = `${reference.actionId || `${reference.entityType.toLowerCase()}_${reference.entityId}`}_${uid}`;
  return setDoc(doc(db, 'productions', reference.productionId, 'artifactAcknowledgements', id), {
    id, ...reference, uid, state, note: note?.slice(0, 500) || '', updatedAt: Date.now(),
  });
}

export function createProductionDecision(productionId: string, authorUid: string, authorName: string, title: string, detail: string): Promise<ProductionDecision> {
  const now = Date.now();
  const row: ProductionDecision = { id: `decision_${now.toString(36)}`, productionId, title: title.trim(), detail: detail.trim(), status: 'OPEN', authorUid, authorName, createdAt: now, updatedAt: now };
  return setDoc(doc(db, 'productions', productionId, 'decisions', row.id), row).then(() => row);
}

export function createProductionAlert(productionId: string, authorUid: string, authorName: string, title: string, detail: string, severity: ProductionAlert['severity']): Promise<ProductionAlert> {
  const now = Date.now();
  const row: ProductionAlert = { id: `alert_${now.toString(36)}`, productionId, title: title.trim(), detail: detail.trim(), severity, status: 'ACTIVE', authorUid, authorName, createdAt: now, updatedAt: now };
  return setDoc(doc(db, 'productions', productionId, 'alerts', row.id), row).then(() => row);
}

export const updateProductionDecision = (productionId: string, id: string, patch: Partial<Pick<ProductionDecision, 'title' | 'detail' | 'status' | 'outcome'>>) => updateDoc(doc(db, 'productions', productionId, 'decisions', id), { ...patch, updatedAt: Date.now() });
export const updateProductionAlert = (productionId: string, id: string, patch: Partial<Pick<ProductionAlert, 'title' | 'detail' | 'severity' | 'status'>>) => updateDoc(doc(db, 'productions', productionId, 'alerts', id), { ...patch, ...(patch.status === 'RESOLVED' ? { resolvedAt: Date.now() } : {}), updatedAt: Date.now() });

export function canEditProductionEntity(production: Production | null, uid: string, type: ProductionEntityType, entity: Record<string, any> | null): boolean {
  if (!production || !uid || !entity) return false;
  if (production.ownerUid === uid) return true;
  if ((type === 'DECISION' || type === 'ALERT') && entity.authorUid === uid) return true;
  if (type === 'BREAKDOWN') {
    const authority = production.authority?.[uid];
    if (authority?.department === entity.department && authority.permissions?.includes('MANAGE_DEPARTMENT_BREAKDOWN')) return true;
  }
  const permission: Partial<Record<ProductionEntityType, ProductionPermission>> = {
    TASK: 'MANAGE_TASKS', SCENE: 'EDIT_SCRIPT_BREAKDOWN', BREAKDOWN: 'EDIT_SCRIPT_BREAKDOWN',
    CALL_SHEET: 'MANAGE_CALL_SHEETS', SCHEDULE: 'MANAGE_SCHEDULE', DECISION: 'MANAGE_SCHEDULE', ALERT: 'MANAGE_ROSTER',
    MEMBER: 'MANAGE_ROSTER', LOCATION: 'MANAGE_LOCATIONS',
  };
  return !!permission[type] && hasProductionPermission(production, uid, permission[type]!);
}

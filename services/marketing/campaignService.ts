// ─── Marketing — campaign CRUD ───────────────────────────────────────────────
// Stored at users/{uid}/campaigns/{id}, mirroring scheduledPostsService: the
// document always lives under the OPERATING user's subtree (the only place
// per-user rules permit a write), and a managed identity (BUSINESS/ORG) is a
// logical partition via `scope`/`authorOrgId`, filtered in memory so no
// composite (scope.id + createdAt) index is ever required.

import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy,
} from 'firebase/firestore';
import { onSnapshot } from '../safeSnapshot';
import { v4 as uuidv4 } from 'uuid';
import { db, auth } from '../firebase';
import type { MarketingScope } from '../../components/MarketingKit';
import type {
  Campaign, CampaignObjective, CampaignBudget, GeoRadius, AudienceList,
  CampaignCreative, Placement,
} from './campaignTypes';

function colRef(uid: string) {
  return collection(db, 'users', uid, 'campaigns');
}

export interface NewCampaignInput {
  scope: MarketingScope;
  name: string;
  objective: CampaignObjective;
  schedule: { start: number; end: number };
  budget: CampaignBudget;
  audience: { geo?: GeoRadius; list?: AudienceList };
  creatives: CampaignCreative[];
  placements: Placement[];
}

function stripUndefined<T>(value: T): T {
  // Firestore rejects `undefined` anywhere in a written document — same trap
  // scheduledPostsService dodges with the JSON round-trip.
  return JSON.parse(JSON.stringify(value));
}

export async function createCampaign(input: NewCampaignInput): Promise<Campaign> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  if (!input.name.trim()) throw new Error('Name the campaign before saving');
  if (!input.placements.length) throw new Error('Pick at least one channel');

  const now = Date.now();
  const managed = input.scope.kind !== 'CREATOR';
  const campaign: Campaign = {
    id: uuidv4(),
    scope: input.scope,
    ownerId: uid,
    authorOrgId: managed ? input.scope.id : undefined,
    name: input.name.trim(),
    objective: input.objective,
    status: 'draft',
    schedule: input.schedule,
    budget: input.budget,
    audience: input.audience,
    creatives: input.creatives,
    placements: input.placements,
    createdAt: now,
    updatedAt: now,
  };

  const clean = stripUndefined(campaign);
  await setDoc(doc(colRef(uid), campaign.id), clean);
  return campaign;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const clean = stripUndefined({ ...patch, updatedAt: Date.now() });
  await updateDoc(doc(colRef(uid), id), clean);
}

export async function deleteCampaign(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  await deleteDoc(doc(colRef(uid), id));
}

export async function listCampaigns(scopeId?: string): Promise<Campaign[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(query(colRef(uid), orderBy('createdAt', 'desc')));
  const all = snap.docs.map(d => d.data() as Campaign);
  if (!scopeId) return all;
  return all.filter(c => c.scope.id === scopeId);
}

/** Live campaign list for a managed identity. Same single-field createdAt
 *  index as the base query; scope filtering happens client-side. */
export function listenToCampaigns(
  callback: (campaigns: Campaign[]) => void,
  scopeId?: string,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { callback([]); return () => {}; }
  return onSnapshot(query(colRef(uid), orderBy('createdAt', 'desc')), snap => {
    const all = snap.docs.map(d => d.data() as Campaign);
    callback(scopeId ? all.filter(c => c.scope.id === scopeId) : all);
  });
}

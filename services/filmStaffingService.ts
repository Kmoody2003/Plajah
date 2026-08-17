/** Film staffing adapter over Plajah's shared job-posting and application collections. */
import {
  collection, doc, getDocs, query, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Application, ApplicationStage, JobPosting } from '../types';
import type { DeptKey, Production, ProductionMember, ProductionRoleKey } from './filmProductionService';
import { uid8 } from './filmProductionService';

export interface ProductionOpeningInput {
  title: string;
  department: DeptKey;
  roleKey: ProductionRoleKey;
  description?: string;
  location?: string;
  compRange?: string;
  employmentType?: JobPosting['employmentType'];
}

export async function createProductionOpening(prod: Production, input: ProductionOpeningInput): Promise<JobPosting> {
  const actor = auth.currentUser;
  if (!actor) throw new Error('Sign in to post a crew opening.');
  const now = Date.now();
  const ref = doc(collection(db, 'jobPostings'));
  const posting: JobPosting = {
    id: ref.id,
    orgId: `production:${prod.id}`,
    productionId: prod.id,
    productionTitle: prod.title,
    productionDepartment: input.department,
    productionRoleKey: input.roleKey,
    postingType: 'JOB',
    title: input.title.trim(),
    roleKey: input.roleKey,
    description: input.description?.trim() || '',
    location: input.location?.trim() || undefined,
    compRange: input.compRange?.trim() || undefined,
    employmentType: input.employmentType || 'GIG',
    status: 'OPEN', createdBy: actor.uid, createdAt: now, updatedAt: now,
  };
  await setDoc(ref, JSON.parse(JSON.stringify(posting)));
  return posting;
}

export async function fetchProductionOpenings(prodId: string): Promise<JobPosting[]> {
  const snap = await getDocs(query(collection(db, 'jobPostings'), where('productionId', '==', prodId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchOpenProductionOpenings(): Promise<JobPosting[]> {
  const snap = await getDocs(query(collection(db, 'jobPostings'), where('status', '==', 'OPEN')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting))
    .filter(p => !!p.productionId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchProductionApplications(prodId: string): Promise<Application[]> {
  const snap = await getDocs(query(collection(db, 'applications'), where('productionId', '==', prodId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Application)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function moveProductionApplication(appId: string, stage: ApplicationStage): Promise<void> {
  await updateDoc(doc(db, 'applications', appId), { stage, updatedAt: Date.now() });
}

/**
 * Hiring enrolls the Plajah user into the production and roster. It does not silently elevate
 * authority: only advertised Crew/Cast/Viewer roles are provisioned by staffing leads. A production
 * owner may later assign a privileged role through the authority controls.
 */
export async function hireProductionApplicant(prod: Production, posting: JobPosting, app: Application): Promise<void> {
  if (!app.applicantUid) throw new Error('This applicant must connect a Plajah account before joining the production.');
  const actor = auth.currentUser;
  if (!actor) throw new Error('Sign in to hire crew.');
  const requested = (posting.productionRoleKey || 'CREW') as ProductionRoleKey;
  const safeRole: ProductionRoleKey = requested === 'CAST' ? 'CAST' : requested === 'VIEWER' ? 'VIEWER' : 'CREW';
  const dept = (posting.productionDepartment || (safeRole === 'CAST' ? 'CAST' : 'OTHER')) as DeptKey;
  const member: ProductionMember = {
    id: uid8(), uid: app.applicantUid, name: app.applicantName,
    role: posting.title, roleKey: safeRole, dept,
    email: app.applicantEmail, isCast: safeRole === 'CAST',
    status: 'ACTIVE', createdAt: Date.now(),
  };
  await runTransaction(db, async tx => {
    const prodRef = doc(db, 'productions', prod.id);
    const prodSnap = await tx.get(prodRef);
    if (!prodSnap.exists()) throw new Error('Production not found.');
    const current = prodSnap.data() as Production;
    tx.update(prodRef, {
      memberUids: [...new Set([...(current.memberUids || []), app.applicantUid!])],
      updatedAt: Date.now(),
    });
    tx.set(doc(db, 'productions', prod.id, 'members', member.id), JSON.parse(JSON.stringify(member)));
    tx.update(doc(db, 'applications', app.id), { stage: 'HIRED', updatedAt: Date.now() });
  });
}

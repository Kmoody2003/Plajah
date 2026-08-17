// hiringService — a lean ATS on the Organization backbone (see docs/ATS_HIRING_VOLUNTEERS_PLAN.md).
//
// JobPostings belong to an org; Applications are their own entity with real stages. On HIRED an
// application becomes an employee (+ work badge) via the Phase-2/3 employee pipeline. Same engine
// serves paid hiring and volunteer signups (postingType). Flat top-level collections keep owner
// queries single-equality (no composite-index traps).

import {
  collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit as fbLimit, arrayUnion,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { addOrgMember, createManagedEmployee } from './organizationService';
import { logOrgAction } from './orgAudit';
import type { Application, ApplicationStage, JobPosting, StaffNote } from '../types';

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

// ── Job postings ────────────────────────────────────────────────────────────
export async function createJobPosting(data: Partial<JobPosting> & { orgId: string; title: string }): Promise<JobPosting | null> {
  if (!auth.currentUser) return null;
  const now = Date.now();
  const ref = doc(collection(db, 'jobPostings'));
  const posting: JobPosting = {
    id: ref.id,
    orgId: data.orgId,
    postingType: data.postingType || 'JOB',
    title: data.title,
    roleKey: data.roleKey,
    productionId: data.productionId,
    productionTitle: data.productionTitle,
    productionDepartment: data.productionDepartment,
    productionRoleKey: data.productionRoleKey,
    description: data.description || '',
    location: data.location,
    isRemote: data.isRemote,
    employmentType: data.employmentType,
    compRange: data.compRange,
    shiftNeeds: data.shiftNeeds,
    questions: data.questions,
    status: data.status || 'OPEN',
    createdBy: auth.currentUser.uid,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, stripUndefined(posting));
  await logOrgAction(data.orgId, 'PAGE_EDITED', { meta: { jobPosting: posting.title } });
  return posting;
}

export async function updateJobPosting(id: string, updates: Partial<JobPosting>): Promise<void> {
  await updateDoc(doc(db, 'jobPostings', id), { ...stripUndefined(updates), updatedAt: Date.now() });
}

export async function closeJobPosting(id: string): Promise<void> {
  await updateDoc(doc(db, 'jobPostings', id), { status: 'CLOSED', updatedAt: Date.now() });
}

export async function fetchOrgPostings(orgId: string): Promise<JobPosting[]> {
  const snap = await getDocs(query(collection(db, 'jobPostings'), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Public board — open postings (newest first). */
export async function fetchOpenPostings(max = 60): Promise<JobPosting[]> {
  const snap = await getDocs(query(collection(db, 'jobPostings'), where('status', '==', 'OPEN'), fbLimit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting)).sort((a, b) => b.createdAt - a.createdAt);
}

// ── Applications ────────────────────────────────────────────────────────────
export async function submitApplication(
  posting: JobPosting,
  data: { applicantName?: string; applicantEmail?: string; answers?: Record<string, string>; resumeUrl?: string; links?: string[] },
): Promise<Application | null> {
  const u = auth.currentUser;
  const now = Date.now();
  const ref = doc(collection(db, 'applications'));
  const application: Application = {
    id: ref.id,
    jobId: posting.id,
    orgId: posting.orgId,
    productionId: posting.productionId,
    applicantUid: u?.uid,
    // Auto-seed from the Plajah profile — the "one-tap apply" win.
    applicantName: data.applicantName || u?.displayName || 'Applicant',
    applicantEmail: data.applicantEmail || u?.email || undefined,
    applicantPhoto: u?.photoURL || undefined,
    answers: data.answers,
    resumeUrl: data.resumeUrl,
    links: data.links,
    stage: 'APPLIED',
    source: posting.postingType === 'VOLUNTEER' ? 'volunteer' : 'career-page',
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, stripUndefined(application));
  await logOrgAction(posting.orgId, 'MEMBER_APPLIED', { targetName: application.applicantName, meta: { job: posting.title } });
  return application;
}

export async function fetchApplications(orgId: string, jobId?: string): Promise<Application[]> {
  const q = jobId
    ? query(collection(db, 'applications'), where('jobId', '==', jobId))
    : query(collection(db, 'applications'), where('orgId', '==', orgId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Application)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function moveApplicationStage(app: Application, stage: ApplicationStage): Promise<void> {
  await updateDoc(doc(db, 'applications', app.id), { stage, updatedAt: Date.now() });
  await logOrgAction(app.orgId, 'ROLE_CHANGED', { targetName: app.applicantName, meta: { stage } });
}

export async function rateApplication(appId: string, rating: number): Promise<void> {
  await updateDoc(doc(db, 'applications', appId), { rating, updatedAt: Date.now() });
}

export async function addApplicationNote(appId: string, text: string): Promise<void> {
  if (!auth.currentUser || !text.trim()) return;
  const note: StaffNote = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    authorUid: auth.currentUser.uid,
    authorName: auth.currentUser.displayName || '',
    text: text.trim(),
    timestamp: Date.now(),
  };
  await updateDoc(doc(db, 'applications', appId), { notes: arrayUnion(stripUndefined(note as any)), updatedAt: Date.now() });
}

export async function withdrawApplication(appId: string): Promise<void> {
  await updateDoc(doc(db, 'applications', appId), { stage: 'WITHDRAWN', updatedAt: Date.now() });
}

/**
 * Hire an applicant: turns the application into an employee (+ work badge) and marks it HIRED.
 * If they applied as a real user we add them as a member so the badge lands in their switcher;
 * otherwise we create a managed employee profile with their name.
 */
export async function hireApplicant(
  posting: JobPosting,
  app: Application,
  roleKey?: string,
  baseRole?: any,
): Promise<void> {
  const key = roleKey || posting.roleKey;
  if (app.applicantUid) {
    await addOrgMember(posting.orgId, {
      userId: app.applicantUid,
      displayName: app.applicantName,
      photoUrl: app.applicantPhoto,
      role: baseRole || 'STAFF',
      title: posting.title,
    });
  } else {
    await createManagedEmployee(posting.orgId, { displayName: app.applicantName, roleKey: key, role: baseRole || 'STAFF', title: posting.title, photoURL: app.applicantPhoto });
  }
  await updateDoc(doc(db, 'applications', app.id), { stage: 'HIRED', updatedAt: Date.now() });
  await logOrgAction(posting.orgId, 'EMPLOYEE_ADDED', { targetName: app.applicantName, meta: { via: 'hire', job: posting.title, roleKey: key } });
}

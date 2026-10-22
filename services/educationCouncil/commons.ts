// The Education Commons — the decentralized half of the Education Council. Teachers, researchers, psychologists and
// school leaders anywhere join as members, propose changes to Plajah's year curriculum (a revised lesson, a new unit,
// an adaptation pattern, a research brief), attach a council session as evidence, and vote. No single owner adopts
// curriculum: a proposal is adopted when it reaches quorum — at least three approvals from at least two regions, with
// no unresolved block. Any member can fork a proposal to offer an alternative. The AI seats advise; people decide.
//
// Firestore: educationCouncilMembers/{uid}, educationCommons/{proposalId}. Rules in firestore.rules (block
// "Education Commons"). Every call degrades to a local mirror when signed out or offline, so the lab and demo work.
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import type { CouncilSession } from './deliberate';

export type MemberRole = 'teacher' | 'researcher' | 'psychologist' | 'specialist' | 'admin' | 'family' | 'student-teacher';
export const ROLE_LABEL: Record<MemberRole, string> = { teacher: 'Teacher', researcher: 'Researcher', psychologist: 'Child psychologist', specialist: 'Specialist (SPED / ELL)', admin: 'School leader', family: 'Family member', 'student-teacher': 'Student teacher' };

export interface CommonsMember { uid: string; name: string; role: MemberRole; region: string; subjects: string[]; grades: string[]; joinedAt: number; verified: boolean }

export type ProposalKind = 'lesson-revision' | 'new-unit' | 'adaptation-pattern' | 'research-brief' | 'worksheet-design';
export const KIND_LABEL: Record<ProposalKind, string> = { 'lesson-revision': 'Lesson revision', 'new-unit': 'New unit', 'adaptation-pattern': 'Adaptation pattern', 'research-brief': 'Research brief', 'worksheet-design': 'Worksheet design' };

export type Vote = 'approve' | 'revise' | 'block';
export interface Ballot { vote: Vote; region: string; role: MemberRole; name: string; reason?: string; at: number }

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  body: string;
  lessonId?: string;
  grade?: string;
  subject?: string;
  authorUid: string;
  authorName: string;
  authorRegion: string;
  authorRole: MemberRole;
  forkOf?: string;
  council?: { summary: string; decisions: string[]; approve: number; revise: number; lanes: string[] };
  ballots: Record<string, Ballot>;
  status: 'open' | 'adopted' | 'declined';
  createdAt: number;
  updatedAt: number;
}

export const QUORUM = { approvals: 3, regions: 2 };

export function tally(p: Proposal) {
  const bs = Object.values(p.ballots || {});
  const approvals = bs.filter(b => b.vote === 'approve');
  const regions = new Set(approvals.map(b => b.region.trim().toLowerCase())).size;
  const blocks = bs.filter(b => b.vote === 'block');
  const revise = bs.filter(b => b.vote === 'revise').length;
  const reached = approvals.length >= QUORUM.approvals && regions >= QUORUM.regions && !blocks.length;
  return { approvals: approvals.length, regions, revise, blocks: blocks.length, reached, status: (reached ? 'adopted' : blocks.length >= 3 ? 'declined' : 'open') as Proposal['status'] };
}

// ── local mirror ─────────────────────────────────────────────────────────────
const LS_P = 'pj:eduCommons:proposals', LS_M = 'pj:eduCommons:member';
const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

async function fb() {
  try {
    const m = await import('../firebase');
    return m.auth.currentUser ? m : null;
  } catch { return null; }
}

export async function loadMember(): Promise<CommonsMember | null> {
  const f = await fb();
  if (f) { try { const s = await getDoc(doc(f.db, 'educationCouncilMembers', f.auth.currentUser!.uid)); if (s.exists()) return s.data() as CommonsMember; } catch { /* fall through */ } }
  return lsGet<CommonsMember | null>(LS_M, null);
}

export async function joinCommons(m: Omit<CommonsMember, 'uid' | 'joinedAt' | 'verified'>): Promise<CommonsMember> {
  const f = await fb();
  const member: CommonsMember = { ...m, uid: f?.auth.currentUser?.uid || 'local', joinedAt: Date.now(), verified: false };
  if (f) { try { await setDoc(doc(f.db, 'educationCouncilMembers', member.uid), member); } catch { /* keep local */ } }
  lsSet(LS_M, member);
  return member;
}

export async function listProposals(max = 60): Promise<Proposal[]> {
  const f = await fb();
  if (f) {
    try {
      const snap = await getDocs(query(collection(f.db, 'educationCommons'), orderBy('updatedAt', 'desc'), limit(max)));
      return snap.docs.map(d => d.data() as Proposal);
    } catch { /* fall through */ }
  }
  return lsGet<Proposal[]>(LS_P, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function propose(member: CommonsMember, input: Pick<Proposal, 'kind' | 'title' | 'body' | 'lessonId' | 'grade' | 'subject' | 'forkOf'>, session?: CouncilSession): Promise<Proposal> {
  const now = Date.now();
  const p: Proposal = {
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as typeof input,
    id: `prop_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    authorUid: member.uid, authorName: member.name, authorRegion: member.region, authorRole: member.role,
    ballots: {}, status: 'open', createdAt: now, updatedAt: now,
    ...(session ? { council: { summary: session.synthesis.summary, decisions: session.synthesis.decisions, approve: session.synthesis.approve, revise: session.synthesis.revise, lanes: [...new Set(session.reviews.map(r => r.lane))] } } : {}),
  };
  const f = await fb();
  if (f) { try { await setDoc(doc(f.db, 'educationCommons', p.id), p); } catch { /* keep local */ } }
  lsSet(LS_P, [p, ...lsGet<Proposal[]>(LS_P, []).filter(x => x.id !== p.id)]);
  return p;
}

export async function castVote(member: CommonsMember, p: Proposal, vote: Vote, reason?: string): Promise<Proposal> {
  const ballot: Ballot = { vote, region: member.region, role: member.role, name: member.name, at: Date.now(), ...(reason ? { reason: reason.slice(0, 600) } : {}) };
  const next: Proposal = { ...p, ballots: { ...p.ballots, [member.uid]: ballot }, updatedAt: Date.now() };
  next.status = tally(next).status;
  const f = await fb();
  if (f) {
    try { await updateDoc(doc(f.db, 'educationCommons', p.id), { [`ballots.${member.uid}`]: ballot, status: next.status, updatedAt: next.updatedAt }); }
    catch { /* keep local */ }
  }
  lsSet(LS_P, lsGet<Proposal[]>(LS_P, []).map(x => (x.id === p.id ? next : x)));
  return next;
}

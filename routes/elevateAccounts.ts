// elevateAccounts router — the member's side of pre-provisioned Plajah accounts (services/elevateAccounts.ts).
//
// A church imports its people; each one gets a managed `users/prov_…` profile + an orgMemberships seat that
// already carries their role and departments. The real person then CLAIMS the seat here:
//   POST /lookup  { org, memberNumber + lastName | email }  → masked preview ("J••• S••••, Member, Youth")
//   POST /redeem  { org, memberNumber + lastName | email }  → seat.userId := caller; chmsPeople.linkedUid := caller;
//                                                             orgMemberIndex written; org chat rooms re-pointed.
// Runs server-side (SA-signed REST, like routes/schools.ts) so nobody can enumerate a congregation from the
// client: a member ID alone is never enough (last name must match), and an email claim only works when it is
// the signed-in account's own email. Rate-limited in server.ts with authLimiter.
//
// Mounted in server.ts as:  app.use('/api/elevate/claim', express.json({ limit: '8kb' }), elevateAccountsRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsSet, fsCreate, fsQuery, fsDelete, adminConfig } from '../services/firebaseAdminRest';

export const elevateAccountsRouter = Router();

const normMember = (s: string) => (s || '').trim().toUpperCase().replace(/\s+/g, '');
const normName = (s: string) => (s || '').trim().toLowerCase().replace(/[^a-zÀ-ɏ' -]/g, '').replace(/\s+/g, ' ');
const normEmail = (s: string) => (s || '').trim().toLowerCase();
const mask = (s: string) => { const t = (s || '').trim(); return t ? t[0] + '•'.repeat(Math.max(2, Math.min(6, t.length - 1))) : ''; };

const ROLE_LABELS: Record<string, string> = {
  SENIOR_PASTOR: 'Senior Pastor', PASTOR: 'Pastor', MINISTER: 'Minister', ELDER: 'Elder', DEACON: 'Deacon',
  DEPARTMENT_HEAD: 'Department Head', DEPARTMENT_ADMIN: 'Department Administrator', INSTRUCTOR: 'Instructor',
  FINANCE_DIRECTOR: 'Finance Director', TREASURER: 'Treasurer', TRUSTEE: 'Trustee', BOOKKEEPER: 'Bookkeeper', ACCOUNTANT: 'Accountant / Auditor',
  MEDIA_TEAM: 'Media Team', STAFF: 'Staff', PRAYER_WARRIOR: 'Prayer Warrior', DEPARTMENT_VOLUNTEER: 'Department Volunteer', VOLUNTEER: 'Volunteer', MEMBER: 'Member',
};

async function caller(req: Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(auth.slice(7));
  return t && !t.isAnonymous ? t : null;
}

/** Resolve the org from an id or @handle. */
async function resolveOrg(key: string): Promise<{ id: string; data: Record<string, any> } | null> {
  const k = (key || '').trim().replace(/^@/, '');
  if (!k || k.length > 120) return null;
  const direct = await fsGet(`organizations/${k}`);
  if (direct) return { id: k, data: direct };
  const byHandle = await fsQuery('organizations', [{ field: 'handle', value: k.toLowerCase() }], 1);
  return byHandle[0] || null;
}

function hashCodeDigits(seed: string, min = 10000, span = 90000): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return String(min + (h % span));
}

function orgPrefix(orgId: string, orgData: Record<string, any>): string {
  if (orgData?.memberNumberPrefix) return String(orgData.memberNumberPrefix).trim().toUpperCase().slice(0, 4);
  const initials = String(orgData?.name || '').split(/\s+/).map(w => w[0]).filter(c => /[A-Za-z]/.test(c || '')).join('').toUpperCase().slice(0, 3);
  return initials || orgId.slice(0, 3).toUpperCase();
}

interface Seat { id: string; data: Record<string, any> }
/** Find the unclaimed seat behind the identifiers (Member/Employee ID + Last Name, Email, or First + Last Name). */
async function findSeat(orgId: string, body: any, callerEmail?: string): Promise<{ seat?: Seat; resolvedOrgId?: string; reason?: string; alreadyClaimed?: boolean }> {
  const memberNumber = normMember(body.memberNumber || body.employeeNumber || '');
  const firstName = normName(body.firstName || '');
  const lastName = normName(body.lastName || '');
  const email = normEmail(body.email || callerEmail || '');

  // Priority 1: Email match (works with or without orgId, and even if the user also typed a memberNumber without lastName)
  if (email) {
    const filters = orgId
      ? [{ field: 'orgId', value: orgId }, { field: 'claimEmailLower', value: email }]
      : [{ field: 'claimEmailLower', value: email }];
    let seats = await fsQuery('orgMemberships', filters, 5);
    if (!seats.length && orgId) {
      // Fallback: if the user selected a duplicate org shell, check across orgMemberships by email
      seats = await fsQuery('orgMemberships', [{ field: 'claimEmailLower', value: email }], 5);
    }
    const seat = seats.find(s => s.data.isProvisioned) || seats[0];
    if (seat) {
      if (!seat.data.isProvisioned) return { alreadyClaimed: true, resolvedOrgId: String(seat.data.orgId || orgId), reason: 'This account has already been claimed.' };
      return { seat, resolvedOrgId: String(seat.data.orgId || orgId) };
    }
  }

  if (memberNumber) {
    const byMem = await fsQuery('orgMemberships', orgId ? [{ field: 'orgId', value: orgId }, { field: 'memberNumber', value: memberNumber }] : [{ field: 'memberNumber', value: memberNumber }], 5);
    const byEmp = byMem.length ? [] : await fsQuery('orgMemberships', orgId ? [{ field: 'orgId', value: orgId }, { field: 'employeeNumber', value: memberNumber }] : [{ field: 'employeeNumber', value: memberNumber }], 5);
    const seats = [...byMem, ...byEmp];
    const seat = seats.find(s => {
      if (!lastName) return seats.length === 1;
      const dn = normName(String(s.data.displayName || ''));
      return dn === lastName || dn.endsWith(lastName) || dn.includes(` ${lastName}`);
    });
    if (!seat) {
      if (!lastName && seats.length > 1) return { reason: 'Enter the last name on file with your ID.' };
      return seats.length ? { reason: 'That ID and last name do not match our records.' } : { reason: 'No pre-set seat matched that ID — you can still submit your claim below without an ID and your numbers will auto-populate upon approval.' };
    }
    if (!seat.data.isProvisioned) return { alreadyClaimed: true, resolvedOrgId: String(seat.data.orgId || orgId), reason: 'This account has already been claimed. Sign in with the account you used, or ask the office to reset it.' };
    return { seat, resolvedOrgId: String(seat.data.orgId || orgId) };
  }

  if (firstName && lastName && orgId) {
    const fullTarget = `${firstName} ${lastName}`.trim();
    const allOrgSeats = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'isProvisioned', value: true }], 200);
    const matchedByName = allOrgSeats.find(s => normName(String(s.data.displayName || '')) === fullTarget);
    if (matchedByName) return { seat: matchedByName, resolvedOrgId: orgId };
  }

  return { reason: 'No pre-provisioned seat found yet — click below to submit your membership claim without an ID, and your Member ID & Employment Number will auto-populate upon approval.' };
}

const deptNames = (org: Record<string, any>, ids: string[] = []) =>
  ids.map(id => (org.ministries || []).find((m: any) => m.id === id)?.name).filter(Boolean) as string[];

// ── POST /lookup ───────────────────────────────────────────────────────────────
elevateAccountsRouter.post('/lookup', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for account claims.' });
  const who = await caller(req);
  let org = await resolveOrg(String(req.body?.org || ''));
  const r = await findSeat(org?.id || '', req.body || {}, who?.email);
  if (!org && r.resolvedOrgId) org = await resolveOrg(r.resolvedOrgId);
  if (org && r.resolvedOrgId && r.resolvedOrgId !== org.id) {
    const resolved = await resolveOrg(r.resolvedOrgId);
    if (resolved) org = resolved;
  }
  if (!org) return res.status(404).json({ found: false, reason: 'We could not find that organization. Enter the email address or Member ID from your invitation.' });
  if (!r.seat) return res.json({ found: false, orgId: org.id, orgName: org.data.name, orgLogoUrl: org.data.logoUrl, reason: r.reason, alreadyClaimed: !!r.alreadyClaimed });
  const d = r.seat.data;
  const [first = '', ...rest] = String(d.displayName || '').split(' ');
  return res.json({
    found: true, orgId: org.id, orgName: org.data.name, orgLogoUrl: org.data.logoUrl,
    maskedName: `${mask(first)} ${mask(rest.join(' '))}`.trim(),
    roleLabel: d.title || ROLE_LABELS[d.roleKey] || 'Member',
    departments: deptNames(org.data, d.ministryIds || (d.ministryRoles || []).map((x: any) => x.ministryId)),
    memberNumber: d.memberNumber || undefined,
    employeeNumber: d.employeeNumber || undefined,
  });
});

// ── POST /redeem ───────────────────────────────────────────────────────────────
elevateAccountsRouter.post('/redeem', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for account claims.' });
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'Sign in to claim your account.' });
  let org = await resolveOrg(String(req.body?.org || ''));
  const r = await findSeat(org?.id || '', req.body || {}, who.email);
  if (!org && r.resolvedOrgId) org = await resolveOrg(r.resolvedOrgId);
  if (org && r.resolvedOrgId && r.resolvedOrgId !== org.id) {
    const resolved = await resolveOrg(r.resolvedOrgId);
    if (resolved) org = resolved;
  }
  if (!org) return res.status(404).json({ error: 'We could not find that organization.' });
  if (!r.seat) return res.status(r.alreadyClaimed ? 409 : 404).json({ error: r.reason });
  const seat = r.seat; const d = seat.data; const uid = who.uid; const now = Date.now();
  const provUid = String(d.userId || '');
  if (!provUid.startsWith('prov_')) return res.status(409).json({ error: 'This seat is not claimable.' });

  const prefix = orgPrefix(org.id, org.data);
  const seed = String(d.provisionedPersonId || uid || seat.id);
  const assignedMemberNumber = String(d.memberNumber || `${prefix}-${hashCodeDigits(seed, 10000, 90000)}`).toUpperCase();
  const assignedEmployeeNumber = String(d.employeeNumber || `${prefix}-EMP-${hashCodeDigits(`emp:${seed}`, 1000, 9000)}`).toUpperCase();

  // The caller may already be in the org (self-joined, or claimed another seat): fold the seat into their row.
  const mine = await fsQuery('orgMemberships', [{ field: 'orgId', value: org.id }, { field: 'userId', value: uid }], 3);
  const profile = await fsGet(`users/${uid}`);
  const submittedFullName = [String(req.body?.firstName || '').trim(), String(req.body?.lastName || '').trim()].filter(Boolean).join(' ').trim();
  const displayName = String(submittedFullName || profile?.displayName || d.displayName || 'Member');
  const photoUrl = String(profile?.photoURL || d.photoUrl || '');
  const claimedFields = {
    isProvisioned: false, claimedAt: now, userId: uid, displayName, photoUrl, status: 'ACTIVE', acceptedAt: now,
    employeeProfileUid: null, claimEmailLower: null,
    memberNumber: assignedMemberNumber,
    employeeNumber: assignedEmployeeNumber,
  };
  let membershipId = seat.id;
  if (mine[0] && mine[0].id !== seat.id) {
    // Merge: keep their existing row id, lift the seat's role/departments onto it, retire the seat.
    membershipId = mine[0].id;
    await fsPatch(`orgMemberships/${membershipId}`, {
      ...claimedFields, role: d.role, roleKey: d.roleKey, title: d.title, rosterGroup: d.rosterGroup, isEmployee: !!d.isEmployee,
      ministryIds: d.ministryIds || [], ministryRoles: d.ministryRoles || [], memberNumber: assignedMemberNumber, employeeNumber: assignedEmployeeNumber, provisionedPersonId: d.provisionedPersonId,
      joinedAt: Math.min(Number(mine[0].data.joinedAt || now), Number(d.joinedAt || now)),
    });
    await fsDelete(`orgMemberships/${seat.id}`);
  } else {
    await fsPatch(`orgMemberships/${seat.id}`, claimedFields);
  }
  // Retire the managed profile (kept for audit; claimedByUid links it, like business employee profiles).
  await fsPatch(`users/${provUid}`, { claimedByUid: uid, claimedAt: now });
  // Link the congregation record and auto-populate memberNumber + employeeNumber.
  if (d.provisionedPersonId) {
    const person = await fsGet(`chmsPeople/${d.provisionedPersonId}`);
    if (person && (!person.linkedUid || person.linkedUid === uid)) {
      const personPatch: Record<string, any> = {
        linkedUid: uid,
        provisionedUid: null,
        memberNumber: assignedMemberNumber,
        employeeNumber: assignedEmployeeNumber,
        updatedAt: now,
      };
      if (req.body?.firstName && req.body?.lastName) {
        personPatch.firstName = String(req.body.firstName).trim();
        personPatch.lastName = String(req.body.lastName).trim();
      }
      await fsPatch(`chmsPeople/${d.provisionedPersonId}`, personPatch);
    }
  }
  // Member index (rules use it for department feeds / comments).
  const ministryIds: string[] = Array.from(new Set([...(d.ministryIds || []), ...((d.ministryRoles || []) as any[]).map(x => x.ministryId)].filter(Boolean)));
  await fsSet(`orgMemberIndex/${org.id}_${uid}`, { orgId: org.id, userId: uid, ministryIds, updatedAt: now });
  // Update leaderUids on the organization if the seat had ministryRoles or DEPARTMENT_HEAD
  if (Array.isArray(org.data.leaderUids) && org.data.leaderUids.includes(provUid)) {
    const nextLeaders = Array.from(new Set(org.data.leaderUids.filter((u: string) => u !== provUid).concat(uid)));
    await fsPatch(`organizations/${org.id}`, { leaderUids: nextLeaders, updatedAt: now }).catch(() => {});
  }
  // Chat: every org room the seat sat in now seats the real person.
  const rooms = await fsQuery('chat_rooms', [{ field: 'orgId', value: org.id }, { field: 'workspaceType', value: 'ORGANIZATION' }], 300);
  for (const room of rooms) {
    const parts: string[] = Array.isArray(room.data.participants) ? room.data.participants : [];
    if (!parts.includes(provUid) && !(['announcements', 'general'].includes(String(room.data.orgChannelKey || '')))) continue;
    const next = Array.from(new Set(parts.filter(p => p !== provUid).concat(uid)));
    if (next.length !== parts.length || !parts.includes(uid)) await fsPatch(`chat_rooms/${room.id}`, { participants: next, updatedAt: now });
  }
  // Mirror the role + auto-populated IDs on their profile.
  const aff = {
    orgId: org.id,
    orgName: org.data.name,
    orgLogoUrl: org.data.logoUrl || null,
    roleKey: d.roleKey || 'MEMBER',
    title: d.title || ROLE_LABELS[d.roleKey] || 'Member',
    memberNumber: assignedMemberNumber,
    employeeNumber: assignedEmployeeNumber,
    since: now,
  };
  const cur: any[] = Array.isArray(profile?.orgAffiliations) ? profile!.orgAffiliations : [];
  await fsPatch(`users/${uid}`, { orgAffiliations: [...cur.filter(a => a?.orgId !== org.id), aff] });
  await fsCreate(`organizations/${org.id}/audit`, { orgId: org.id, action: 'ELEVATE_ACCOUNT_CLAIMED', actorUid: uid, actorName: displayName, targetId: d.provisionedPersonId || seat.id, targetName: d.displayName, timestamp: now, meta: { memberNumber: assignedMemberNumber, employeeNumber: assignedEmployeeNumber, via: req.body?.memberNumber ? 'memberNumber' : (req.body?.email ? 'email' : 'name') } });
  return res.json({ orgId: org.id, orgName: org.data.name, roleLabel: d.title || ROLE_LABELS[d.roleKey] || 'Member', membershipId, memberNumber: assignedMemberNumber, employeeNumber: assignedEmployeeNumber });
});

// POST /sync-index { orgId, uid? } — rebuild orgMemberIndex/{orgId_uid} from the real orgMemberships.
// Clients may not write the marker themselves (it is what members-only and department feeds trust), so every
// membership change asks the server to re-derive it. The result is fully determined by the membership docs, so
// any signed-in caller may request a resync for anyone; nothing they send can widen it.
elevateAccountsRouter.post('/sync-index', async (req: Request, res: Response) => {
  const t = await caller(req);
  if (!t) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.body?.orgId || '').trim();
  const uid = String(req.body?.uid || t.uid).trim();
  if (!orgId || orgId.length > 120 || !uid || uid.length > 128 || /[\/]/.test(orgId + uid)) return res.status(400).json({ error: 'Bad request.' });
  const org = await fsGet(`organizations/${orgId}`);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
  const rows = await fsQuery('orgMemberships', [{ field: 'orgId', value: orgId }, { field: 'userId', value: uid }], 20);
  const active = rows.map(r => r.data).filter(m => m.status === 'ACTIVE');
  if (!active.length) {
    await fsDelete(`orgMemberIndex/${orgId}_${uid}`).catch(() => false);
    return res.json({ active: false, ministryIds: [] });
  }
  // Department heads count as members of the department they lead.
  const headed = ((org.ministries || []) as any[]).filter(m => Array.isArray(m?.headUids) && m.headUids.includes(uid)).map(m => m.id);
  const ministryIds: string[] = Array.from(new Set([
    ...active.flatMap(m => [...(m.ministryIds || []), ...((m.ministryRoles || []) as any[]).map(x => x?.ministryId)]),
    ...headed,
  ].filter((x): x is string => typeof x === 'string' && !!x)));
  await fsSet(`orgMemberIndex/${orgId}_${uid}`, { orgId, userId: uid, ministryIds, updatedAt: Date.now() });
  return res.json({ active: true, ministryIds });
});

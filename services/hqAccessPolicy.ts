// Who may see an organization's Content HQ file. One rule, used by the file list and every download.
//
// The org's owner and IT Admins see everything. Org Admins see everything except Finance. Finance is
// its own department's and those it grants. Everyone else sees a department's files only if they are
// in that department. An explicit grant reaches one person, inside the org or out. Pure, so tests hold it.

type Row = Record<string, any>;

const lower = (s: unknown) => String(s || '').trim().toLowerCase();

export const isFinanceDepartmentName = (name: unknown) => /\b(finance|financial|accounting|treasur(y|er)|payroll|bookkeeping|giving)\b/i.test(String(name || ''));
const isEducationDepartmentName = (name: unknown) => /\beducation$/i.test(String(name || '').trim());

/** The department a file belongs to, if its folder is one of the org's departments. */
export function fileDepartment(asset: Row, org: Row): Row | null {
  const ministries: Row[] = org.ministries || [];
  return ministries.find(m => m.id && m.id === asset.departmentId) || ministries.find(m => lower(m.name) && lower(m.name) === lower(asset.folder)) || null;
}

export function isInDepartment(uid: string, dept: Row, org: Row, membership: Row | null): boolean {
  if ((dept.headUids || []).includes(uid) || (org.departmentUids?.[dept.id] || []).includes(uid)) return true;
  if (!membership) return false;
  return [...(membership.ministryIds || []), ...(membership.ministryRoles || []).map((r: Row) => r?.ministryId)].includes(dept.id);
}

export function canSeeOrgFile(uid: string, asset: Row, org: Row | null, membership: Row | null): boolean {
  if (!org || !uid) return false;
  if (org.creatorId === uid || (org.itAdminUids || []).includes(uid)) return true;
  const active = membership?.status === 'ACTIVE';

  // Restricted or revoked: only the people it was granted to, and its author while they hold a seat.
  if ((asset.access || 'open') !== 'open') return (asset.accessUids || []).includes(uid) || (asset.uploadedByUid === uid && active);

  const isOrgAdmin = (org.admins || []).includes(uid);
  const isStaff = (org.staffUids || []).includes(uid);
  if (!active && !isOrgAdmin && !isStaff) return false;

  const dept = fileDepartment(asset, org);
  const name = dept?.name || asset.folder;
  const inDept = !!dept && isInDepartment(uid, dept, org, membership);

  if (isFinanceDepartmentName(name)) {
    return inDept || [org.seniorPastorUids, org.financeUids, org.givingViewUids, org.accountingUids, org.accountingViewUids].some(list => (list || []).includes(uid));
  }
  if (isOrgAdmin) return true;
  if (asset.assetVariant === 'ANSWER_KEY') return inDept || isStaff;
  if (!dept || isEducationDepartmentName(name)) return true;
  return inDept || asset.uploadedByUid === uid;
}

/**
 * The marker rules read, since they can't see departments: who may change an open file that belongs to a department,
 * beyond its author, the owner and IT Admins (rules always let those through). null means the file has no department
 * limit, so the scope's staff keep write access. Finance stays with finance. Education stays open to all staff, as reading does.
 */
export function hqWriteUidsFor(asset: Row, org: Row, members: Row[]): string[] | null {
  if ((asset.access || 'open') !== 'open') return null;
  const dept = fileDepartment(asset, org);
  if (!dept) return null;
  const name = dept.name || asset.folder;
  if (isEducationDepartmentName(name)) return null;
  const out = new Set<string>();
  for (const m of members) if (m.status === 'ACTIVE' && m.userId && isInDepartment(String(m.userId), dept, org, m)) out.add(String(m.userId));
  for (const u of [...(dept.headUids || []), ...(org.departmentUids?.[dept.id] || [])]) out.add(u);
  if (isFinanceDepartmentName(name)) for (const u of [...(org.seniorPastorUids || []), ...(org.financeUids || []), ...(org.accountingUids || [])]) out.add(u);
  else for (const u of org.admins || []) out.add(u);
  return [...out].sort();
}

/** A business's files: its owner and whoever holds a staff seat. A seat that ended takes the files with it. */
export function canSeeBusinessFile(uid: string, asset: Row, page: Row | null): boolean {
  if (!page || !uid) return false;
  if (page.ownerId === uid) return true;
  const seated = (page.staffUids || []).includes(uid);
  if ((asset.access || 'open') !== 'open') return (asset.accessUids || []).includes(uid) || (asset.uploadedByUid === uid && seated);
  return seated;
}

/** Managers and the owner change a business's files. Other staff can read and comment. */
export function canWriteBusinessFiles(uid: string, page: Row | null): boolean {
  if (!page || !uid) return false;
  if (page.ownerId === uid) return true;
  return (page.staffUids || []).includes(uid) && page.staffSeats?.[uid]?.role === 'MANAGER';
}

/**
 * A file one org deliberately shared with another reaches the people who run the receiving org, while they're in
 * it. It's a grant between orgs: never a person's own, and never on anyone's personal "Shared with me".
 */
export function canUseOrgShare(uid: string, targetOrg: Row | null): boolean {
  if (!uid || !targetOrg) return false;
  return targetOrg.creatorId === uid || [...(targetOrg.itAdminUids || []), ...(targetOrg.admins || []), ...(targetOrg.staffUids || [])].includes(uid);
}

/** Only an open, live org file can go to another org. Restricting or trashing it ends the share. */
export function isOrgShareable(asset: Row): boolean {
  return asset.scopeKind === 'org' && (asset.access || 'open') === 'open' && !asset.deletedAt;
}

/** What the receiving org sees: the file, not who at the other org made it or who else has it. */
export function hqRecordForOrgShare(asset: Row): Row {
  const { storagePath, sharedOrgIds, accessSpec, accessUids, uploadedByUid, deletedByUid, folder, departmentId, departmentName, ...rest } = hqRecordForClient(asset);
  return rest;
}

/** Any kind of file. A person's file is only ever that person's. */
export function canSeeHqFile(uid: string, asset: Row, owner: Row | null, membership: Row | null): boolean {
  if (!uid) return false;
  if (asset.scopeKind === 'user') return asset.scopeId === uid;
  if (asset.scopeKind === 'org') return canSeeOrgFile(uid, asset, owner, membership);
  if (asset.scopeKind === 'business') return canSeeBusinessFile(uid, asset, owner);
  return false;
}

/** Who reads the security log: an org's owner and IT Admins. Nobody else, not even org admins. */
export function canReviewHqSecurity(uid: string, kind: string, owner: Row | null): boolean {
  if (!uid || !owner) return false;
  if (kind === 'org') return owner.creatorId === uid || (owner.itAdminUids || []).includes(uid);
  if (kind === 'business') return owner.ownerId === uid;
  return false;
}

/** Firestore holds a document to 1 MiB, and the text shares it with nothing else. */
export const HQ_TEXT_MAX_CHARS = 900_000;

/** What leaves the server about a file. Its text is fetched on its own, through the same check. */
export function hqRecordForClient(asset: Row): Row {
  const { rawContentText, hqWriteUids: _writers, ...rest } = asset;
  return rawContentText ? { ...rest, hasText: true } : rest;
}

/** Changing a file. A restricted file's grantees can read it but not this. Org members without staff standing can't either. */
export function canWriteHqFile(uid: string, asset: Row, owner: Row | null): boolean {
  if (!uid) return false;
  if (asset.scopeKind === 'user') return asset.scopeId === uid;
  if (!owner) return false;
  if (asset.scopeKind === 'org') {
    if (owner.creatorId === uid || (owner.itAdminUids || []).includes(uid)) return true;
    if ((asset.access || 'open') !== 'open') return asset.uploadedByUid === uid;
    return asset.uploadedByUid === uid || (owner.admins || []).includes(uid) || (owner.staffUids || []).includes(uid);
  }
  if (asset.scopeKind === 'business') return canWriteBusinessFiles(uid, owner);
  return false;
}

/** Who can be asked to review a file: people in its org or business who can already open it. Never the person asking. */
export function reviewerCandidates(asset: Row, owner: Row | null, members: Row[], callerUid: string): { uid: string; name: string; photo?: string }[] {
  if (!owner) return [];
  const out = new Map<string, { uid: string; name: string; photo?: string }>();
  if (asset.scopeKind === 'business') {
    if (owner.ownerId) out.set(owner.ownerId, { uid: owner.ownerId, name: 'Owner' });
    for (const uid of owner.staffUids || []) out.set(uid, { uid, name: owner.staffSeats?.[uid]?.name || 'Team member' });
  } else if (asset.scopeKind === 'org') {
    for (const m of members) {
      const uid = String(m.userId || '');
      // Staff records with no sign-in have an emp_ id and can't review anything.
      if (!uid || uid.startsWith('emp_') || m.status !== 'ACTIVE' || !canSeeOrgFile(uid, asset, owner, m)) continue;
      out.set(uid, { uid, name: String(m.displayName || 'Member'), ...(m.photoURL ? { photo: String(m.photoURL) } : {}) });
    }
  }
  out.delete(callerUid);
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** A file record may only name a stored object inside its own owner's space. */
export function hqObjectPathInScope(asset: Row | null | undefined, path: unknown): boolean {
  if (!asset || typeof path !== 'string' || !asset.scopeKind || !asset.scopeId) return false;
  if (path.includes('..') || path.includes('//')) return false;
  return path.startsWith(`protected-hq/${asset.scopeKind}/${asset.scopeId}/`);
}

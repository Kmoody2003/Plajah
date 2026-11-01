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

/** A file record may only name a stored object inside its own owner's space. */
export function hqObjectPathInScope(asset: Row | null | undefined, path: unknown): boolean {
  if (!asset || typeof path !== 'string' || !asset.scopeKind || !asset.scopeId) return false;
  if (path.includes('..') || path.includes('//')) return false;
  return path.startsWith(`protected-hq/${asset.scopeKind}/${asset.scopeId}/`);
}

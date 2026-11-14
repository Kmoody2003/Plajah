// memberDepartments — the departments one person actually belongs to in an org (no fallbacks).
// Sources: roster ministry ids, ministry roles held, department head lists, the org's
// departmentUids index, and Christian Education when they teach or are enrolled in a class
// (or run classes as staff).
import type { Ministry, Organization, OrgMembership } from '../types';
import type { ChurchProgram } from './churchEducationService';
import { isEducationMinistry } from './elevateTemplates';

export function educationDepartment(org: Organization): Ministry | undefined {
  const all = org.ministries || [];
  return all.find(m => m.templateKey === 'education' && !m.parentId) || all.find(m => !m.parentId && isEducationMinistry(m)) || all.find(m => isEducationMinistry(m));
}

/** Classes this person sees as theirs: taught (creator, teacher list, assigned team) or enrolled. */
export function myClassRoles(programs: ChurchProgram[], uid: string): { teaching: ChurchProgram[]; enrolled: ChurchProgram[] } {
  if (!uid) return { teaching: [], enrolled: [] };
  const teaching = programs.filter(p => p.createdBy === uid || (p.teacherUids || []).includes(uid) || (p.assignedTeam || []).some(t => t.uid === uid));
  const enrolled = programs.filter(p => !teaching.includes(p) && ((p.studentUids || []).includes(uid) || (p.students || []).some(s => s.uid === uid)));
  return { teaching, enrolled };
}

export function memberDepartments(
  org: Organization,
  membership: OrgMembership | null | undefined,
  uid: string,
  opts: { programs?: ChurchProgram[]; runsChristianEd?: boolean } = {},
): Ministry[] {
  const ids = new Set<string>(membership?.ministryIds || []);
  (membership?.ministryRoles || []).forEach(r => ids.add(r.ministryId));
  const all = org.ministries || [];
  if (uid) {
    all.forEach(m => { if ((m.headUids || []).includes(uid)) ids.add(m.id); });
    const index = ((org as unknown as { departmentUids?: Record<string, string[]> }).departmentUids) || {};
    Object.entries(index).forEach(([id, uids]) => { if (Array.isArray(uids) && uids.includes(uid)) ids.add(id); });
  }
  const edu = educationDepartment(org);
  if (edu) {
    const { teaching, enrolled } = myClassRoles(opts.programs || [], uid);
    if (teaching.length || enrolled.length || (opts.runsChristianEd && (opts.programs || []).length > 0)) ids.add(edu.id);
  }
  // Org order; internal back-office groups only when the person is explicitly in them (they are, if listed).
  return all.filter(m => ids.has(m.id));
}

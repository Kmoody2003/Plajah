import { useCallback, useEffect, useState } from 'react';
import { auth } from '../../services/backendService';
import { fetchUserOrganizations, fetchOrgMembers } from '../../services/organizationService';
import { orgCan } from '../../services/orgPermissions';
import { listForOrg, listOwned, removeItem, saveItem, type NewsroomCollection } from '../../services/journalist/newsroomStore';
import type { Organization, OrgMembership } from '../../types';

export interface Scope {
  /** undefined = personal desk (single user). */
  org?: Organization;
  members: OrgMembership[];
  /** May this user move/assign work in the selected scope? Personal desk: always. */
  canManage: boolean;
}

/** The organizations the signed-in user belongs to, plus their RBAC for the selected one. */
export function useScope() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>('');
  const [members, setMembers] = useState<OrgMembership[]>([]);
  useEffect(() => {
    const uid = auth.currentUser?.uid; if (!uid) return;
    fetchUserOrganizations(uid).then(setOrgs).catch(() => setOrgs([]));
  }, []);
  useEffect(() => {
    if (!orgId) { setMembers([]); return; }
    fetchOrgMembers(orgId).then(setMembers).catch(() => setMembers([]));
  }, [orgId]);
  const org = orgs.find(o => o.id === orgId);
  const me = members.find(m => m.userId === auth.currentUser?.uid);
  const canManage = !org || orgCan(me as any, org as any, 'MANAGE_CONTENT');
  const scope: Scope = { org, members, canManage };
  return { orgs, orgId, setOrgId, scope };
}

/** Owned (and, when an org is selected, org-scoped) rows of one newsroom collection. */
export function useNewsroomList<T extends { id: string; orgId?: string }>(col: NewsroomCollection, orgId?: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const mine = await listOwned<T>(col);
      let rows = mine;
      const orgScoped = col !== 'newsroom_sources' && col !== 'newsroom_source_log' && col !== 'newsroom_interviews';
      if (orgId && orgScoped) {
        const shared = await listForOrg<T>(col as any, orgId);
        const seen = new Set(shared.map(r => r.id));
        rows = [...shared, ...mine.filter(r => !seen.has(r.id) && !r.orgId)];
      } else if (!orgId) rows = mine.filter(r => !r.orgId);
      setItems(rows);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); }
    finally { setLoading(false); }
  }, [col, orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const save = useCallback(async (item: T) => {
    setItems(prev => (prev.some(p => p.id === item.id) ? prev.map(p => (p.id === item.id ? item : p)) : [item, ...prev]));
    try { await saveItem(col, item); } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); void reload(); }
  }, [col, reload]);
  const remove = useCallback(async (id: string) => {
    setItems(prev => prev.filter(p => p.id !== id));
    try { await removeItem(col, id); } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed.'); void reload(); }
  }, [col, reload]);
  return { items, loading, error, reload, save, remove, setItems };
}

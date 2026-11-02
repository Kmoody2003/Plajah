// One loader for organizations/{id}/private/finance. Finance roles read the private doc; everyone else with a reason
// (members for their statements, department leaders for approval limits) gets a narrow view from the server.
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { mergeOrgFinance, type OrgFinanceFields } from './orgFinanceCore';
import type { Organization } from '../types';

export { mergeOrgFinance, orgCanReceiveGiving, orgOffersFeeCover } from './orgFinanceCore';

export async function loadOrgFinance(orgId: string): Promise<OrgFinanceFields | null> {
  try {
    const snap = await getDoc(doc(db, 'organizations', orgId, 'private', 'finance'));
    return snap.exists() ? snap.data() : {};
  } catch (e: any) {
    if (e?.code !== 'permission-denied') return null;
  }
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;
    const res = await fetch(`/api/org-finance/view?orgId=${encodeURIComponent(orgId)}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function withOrgFinance<T extends Organization>(org: T): Promise<T> {
  return mergeOrgFinance(org, await loadOrgFinance(org.id));
}

/** The org with the finance fields this viewer may see, plus whether the load has finished. Forms that seed
 *  from these fields must wait on `ready`, or saving would blank them. */
export function useOrgFinance<T extends Organization>(org: T): { org: T; ready: boolean } {
  const [fin, setFin] = useState<{ id: string; v: OrgFinanceFields | null } | null>(null);
  useEffect(() => {
    let live = true;
    loadOrgFinance(org.id).then(v => { if (live) setFin({ id: org.id, v }); });
    return () => { live = false; };
  }, [org.id]);
  const ready = fin?.id === org.id;
  return { org: ready ? mergeOrgFinance(org, fin!.v) : org, ready };
}

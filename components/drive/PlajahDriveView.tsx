// The app's Drive screen: PlajahDrive on the real /api/drive with the signed-in user's token.
// While the server has DRIVE_ENABLED off, the API answers 503 drive_off and the view shows
// "Drive is almost here". The rail lists every org whose Drive this person may open — the same
// rule the server applies (routes/drive.ts liveOrgAccess): owner, admin, IT admin or staff.
// Plain members aren't listed; the server would refuse them.

import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../../services/backendService';
import { fetchUserOrganizations } from '../../services/organizationService';
import { createDriveApi } from '../../services/drive/client';
import PlajahDrive, { type DriveOrg } from './PlajahDrive';

export function driveOrgsFor(uid: string, orgs: Array<Record<string, any>>): DriveOrg[] {
  const has = (list: unknown) => Array.isArray(list) && list.includes(uid);
  return orgs
    .filter(o => o?.id && (o.creatorId === uid || has(o.admins) || has(o.itAdminUids) || has(o.staffUids)))
    .map(o => ({ id: String(o.id), name: String(o.name || 'Organization') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function PlajahDriveView({ onBack, orgs: given, apiBase = '' }: { onBack?: () => void; orgs?: DriveOrg[]; apiBase?: string }) {
  const api = useMemo(() => createDriveApi({ apiBase, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), [apiBase]);
  const [orgs, setOrgs] = useState<DriveOrg[]>(given ?? []);
  useEffect(() => {
    if (given) { setOrgs(given); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let live = true;
    fetchUserOrganizations(uid)
      .then(list => { if (live) setOrgs(driveOrgsFor(uid, list as any)); })
      .catch(() => { /* rail just shows My Drive */ });
    return () => { live = false; };
  }, [given]);
  return <PlajahDrive api={api} orgs={orgs} onBack={onBack} />;
}

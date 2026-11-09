// The app's Drive screen: PlajahDrive on the real /api/drive with the signed-in user's token.
// While the server has DRIVE_ENABLED off, the API answers 503 drive_off and the view shows
// "Drive is almost here". Org Drives join the rail once org membership is passed in (orgs prop).

import React, { useMemo } from 'react';
import { auth } from '../../services/backendService';
import { createDriveApi } from '../../services/drive/client';
import PlajahDrive, { type DriveOrg } from './PlajahDrive';

export default function PlajahDriveView({ onBack, orgs, apiBase = '' }: { onBack?: () => void; orgs?: DriveOrg[]; apiBase?: string }) {
  const api = useMemo(() => createDriveApi({ apiBase, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), [apiBase]);
  return <PlajahDrive api={api} orgs={orgs} onBack={onBack} />;
}

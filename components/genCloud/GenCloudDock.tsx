// components/genCloud/GenCloudDock.tsx — hosts the Plajah Cloud panel once, app-wide.
// Rooms call openGenCloud() (services/genCloud/open.ts). Coming back from Stripe Checkout
// (?credits=success|cancelled) opens the Credits tab with a note and clears the query param.

import React, { useEffect, useState } from 'react';
import GenCloudStudio from './GenCloudStudio';
import { GEN_CLOUD_OPEN_EVENT, type GenCloudOpenRequest } from '../../services/genCloud/open';

export { openGenCloud } from '../../services/genCloud/open';

export default function GenCloudDock() {
  const [req, setReq] = useState<GenCloudOpenRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => { setNotice(null); setReq((e as CustomEvent<GenCloudOpenRequest>).detail || {}); };
    window.addEventListener(GEN_CLOUD_OPEN_EVENT, onOpen);

    const url = new URL(window.location.href);
    const back = url.searchParams.get('credits');
    if (back === 'success' || back === 'cancelled') {
      url.searchParams.delete('credits');
      window.history.replaceState(window.history.state, '', url.toString());
      setNotice(back === 'success' ? 'Thanks! Your credits are on the way. They usually show up within a minute.' : null);
      setReq({ source: 'app', tab: 'credits' });
    }
    return () => window.removeEventListener(GEN_CLOUD_OPEN_EVENT, onOpen);
  }, []);

  if (!req) return null;
  return <GenCloudStudio key={JSON.stringify({ s: req.source, k: req.kinds, t: req.tab })} request={req} notice={notice} onClose={() => setReq(null)} />;
}

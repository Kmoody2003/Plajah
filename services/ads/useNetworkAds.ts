import { useEffect, useState } from 'react';
import { fetchAdNetwork, publishAdAudience, type AdNetworkState } from './googleAds';
import { AD_AUDIENCE_STORAGE_KEY, type AdAudience } from './networkAds';

/**
 * The viewer's ad audience, set by App.tsx from the signed-in profile (networkAds.adAudienceFor) and
 * read by every surface that might load a network ad. Until App has decided, it is 'restricted': no
 * network ad is ever shown on a guess.
 */
let audience: AdAudience = 'restricted';
let decided = false;
const subs = new Set<(a: AdAudience) => void>();

export function setAdAudience(a: AdAudience): void {
  decided = true;
  publishAdAudience(a);
  if (a === audience) return;
  audience = a;
  subs.forEach(fn => fn(a));
}

export function currentAdAudience(): AdAudience {
  if (decided) return audience;
  try { return localStorage.getItem(AD_AUDIENCE_STORAGE_KEY) === 'general' ? 'general' : 'restricted'; } catch { return 'restricted'; }
}

/** null while loading. `allowed` = the network is on AND this viewer may see network ads. */
export function useNetworkAds(): (AdNetworkState & { audience: AdAudience; allowed: boolean }) | null {
  const [state, setState] = useState<AdNetworkState | null>(null);
  const [aud, setAud] = useState<AdAudience>(currentAdAudience());
  useEffect(() => {
    let alive = true;
    fetchAdNetwork().then(s => { if (alive) setState(s); });
    subs.add(setAud);
    setAud(currentAdAudience());
    return () => { alive = false; subs.delete(setAud); };
  }, []);
  if (!state) return null;
  return { ...state, audience: aud, allowed: state.config.enabled && aud === 'general' };
}

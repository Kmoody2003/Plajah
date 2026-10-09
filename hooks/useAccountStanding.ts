import { useSyncExternalStore } from 'react';
import { subscribeStanding, getStandingSnapshot, refreshStanding, type StandingState } from '../services/enforcement/standingStore';

/**
 * The signed-in user's Fair Process standing: live user_sanctions/{uid} → capabilities (pure core).
 * Use it to DISABLE-WITH-EXPLANATION, never to hide. `caps.canAppeal` is always true.
 */
export function useAccountStanding(): StandingState & { refresh: () => void } {
  const s = useSyncExternalStore(subscribeStanding, getStandingSnapshot, getStandingSnapshot);
  return { ...s, refresh: refreshStanding };
}

export default useAccountStanding;

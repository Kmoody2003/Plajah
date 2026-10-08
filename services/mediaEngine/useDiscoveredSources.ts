// Tiny React binding over the React-free SourceDiscovery core.
import { useEffect, useSyncExternalStore } from 'react';
import { getSourceDiscovery, type DiscoverySnapshot, type SourceDiscovery } from './sourceDiscovery';

/** Subscribes to the shared discovery manager and keeps it running while any component is mounted. */
export function useDiscoveredSources(): DiscoverySnapshot & { manager: SourceDiscovery; rescan: () => Promise<void> } {
  const manager = getSourceDiscovery();
  const snap = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  useEffect(() => { manager.start(); return () => manager.stop(); }, [manager]);
  return { ...snap, manager, rescan: () => manager.scanNow() };
}

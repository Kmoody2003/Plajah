// The app's one NetworkOutputManager, wired to the Windows app's media engine and the real
// program frame feeder. Kept apart from networkOutputs.ts so tests import only the pure logic.

import { useSyncExternalStore } from 'react';
import { isWindowsApp, onNativeMessage } from '../windowsBridgeService';
import { NetworkOutputManager, type OutputBridge } from './networkOutputs';
import { ProgramFrameFeeder } from './programFrameFeeder';

const engineInvoke = () => (typeof window !== 'undefined' ? (window as any).__plajahMediaEngine?.invoke : null);

const realBridge: OutputBridge = {
  hasNative: () => isWindowsApp() && !!engineInvoke(),
  invoke: (cmd, args) => {
    const inv = engineInvoke();
    return inv ? (window as any).__plajahMediaEngine.invoke(cmd, args) : Promise.reject(new Error('No native media engine'));
  },
  onStatus: cb => onNativeMessage((m: any) => { if (m?.type === 'PROGRAM_OUT_STATUS') cb(m); }),
};

let shared: NetworkOutputManager | null = null;
export const programFeeder = new ProgramFrameFeeder();

export function getNetworkOutputs(): NetworkOutputManager {
  if (!shared) {
    let storage: Storage | null = null;
    try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch { storage = null; }
    shared = new NetworkOutputManager(realBridge, programFeeder, storage);
    shared.start();
  }
  return shared;
}

/** Re-renders whenever an output's settings or status change. */
export function useNetworkOutputs(): NetworkOutputManager {
  const m = getNetworkOutputs();
  useSyncExternalStore(fn => m.subscribe(fn), () => m.getVersion(), () => 0);
  return m;
}

// Outputs left on resume as soon as Stage loads in the Windows app, not when the menu is first opened.
if (typeof window !== 'undefined' && isWindowsApp()) queueMicrotask(() => { getNetworkOutputs(); });

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  getNetworkMonitor,
  type NetworkSample,
  type DegradationEvent,
  type NetworkPrefs,
} from '../services/networkDiagnostics';

interface NetworkMonitorContextValue {
  sample: NetworkSample | null;
  prefs: NetworkPrefs;
  setPrefs: (p: Partial<NetworkPrefs>) => void;
  /** Force a fresh latency burst now. */
  refresh: () => Promise<void>;
  /** Force a full download/upload throughput test now. */
  runFullTest: () => Promise<void>;
  testing: boolean;
}

const NetworkMonitorContext = createContext<NetworkMonitorContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  /**
   * Called whenever the connection degrades to a warning/critical level.
   * Wire this to the host app's toast/notification system.
   */
  onDegradation?: (event: DegradationEvent) => void;
}

export const NetworkMonitorProvider: React.FC<ProviderProps> = ({ children, onDegradation }) => {
  const monitor = useMemo(() => getNetworkMonitor(), []);
  const [sample, setSample] = useState<NetworkSample | null>(monitor.getLast());
  const [prefs, setPrefsState] = useState<NetworkPrefs>(monitor.getPrefs());
  const [testing, setTesting] = useState(false);
  const degradationRef = useRef(onDegradation);
  degradationRef.current = onDegradation;

  useEffect(() => {
    if (prefs.enabled) monitor.start();
    const unsubSample = monitor.subscribe(setSample);
    const unsubDeg = monitor.onDegradation((e) => degradationRef.current?.(e));
    return () => { unsubSample(); unsubDeg(); };
  }, [monitor]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPrefs = useCallback((p: Partial<NetworkPrefs>) => {
    monitor.setPrefs(p);
    setPrefsState(monitor.getPrefs());
  }, [monitor]);

  const refresh = useCallback(async () => { await monitor.sampleLatency(); }, [monitor]);

  const runFullTest = useCallback(async () => {
    setTesting(true);
    try { await monitor.runThroughput(); } finally { setTesting(false); }
  }, [monitor]);

  const value = useMemo<NetworkMonitorContextValue>(
    () => ({ sample, prefs, setPrefs, refresh, runFullTest, testing }),
    [sample, prefs, setPrefs, refresh, runFullTest, testing],
  );

  return <NetworkMonitorContext.Provider value={value}>{children}</NetworkMonitorContext.Provider>;
};

export function useNetworkMonitor(): NetworkMonitorContextValue {
  const ctx = useContext(NetworkMonitorContext);
  if (!ctx) throw new Error('useNetworkMonitor must be used within NetworkMonitorProvider');
  return ctx;
}

/** Non-throwing variant for surfaces that may render outside the provider. */
export function useNetworkMonitorOptional(): NetworkMonitorContextValue | null {
  return useContext(NetworkMonitorContext);
}

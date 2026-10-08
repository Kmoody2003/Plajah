// kaijuSignal — the tiny context the mascots read the "what's playing" signal from.
//
// Kept dependency-free on purpose: KaijuMascots can render in previews / storybook-style harnesses
// without dragging in the global player (and Firebase behind it). The app mounts
// <KaijuGlobalSignal> (KaijuGlobalSignal.tsx) to feed it from the real GlobalPlayer.

import { createContext, useContext } from 'react';

export interface KaijuSignal { analyser: AnalyserNode | null; isPlaying: boolean }

export const KaijuSignalContext = createContext<KaijuSignal | null>(null);

export function useKaijuSignal(): KaijuSignal {
  return useContext(KaijuSignalContext) ?? { analyser: null, isPlaying: false };
}

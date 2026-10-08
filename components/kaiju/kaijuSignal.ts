// kaijuSignal — the tiny context the mascots read the "what's playing" signal from.
//
// Kept light on purpose: KaijuMascots can render in previews / storybook-style harnesses
// without dragging in the global player (and Firebase behind it). The app mounts
// <KaijuGlobalSignal> (KaijuGlobalSignal.tsx) to feed it from the real GlobalPlayer.
//
// useKaijuSignal() additionally prefers "side audio" (hover previews, ad pillar audio —
// services/sideAudioSignal.ts) while one is audibly playing, so the kaiju nod to those too.

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { getSideAudio, pickKaijuSignal, subscribeSideAudio } from '../../services/sideAudioSignal';

export interface KaijuSignal {
  analyser: AnalyserNode | null; isPlaying: boolean;
  /** Set when audio plays but has no readable analyser: consumers synthesize a steady beat at this BPM. */
  fallbackBpm?: number;
  /** Identity of the audio source ('main' | 'side:<n>'); KaijuAudio resets its beat clock when it changes. */
  key?: string;
}

export const KaijuSignalContext = createContext<KaijuSignal | null>(null);

const IDLE: KaijuSignal = { analyser: null, isPlaying: false };

export function useKaijuSignal(): KaijuSignal {
  const main = useContext(KaijuSignalContext) ?? IDLE;
  const side = useSyncExternalStore(subscribeSideAudio, getSideAudio, () => null);
  return useMemo(() => pickKaijuSignal(main, side), [main, side]);
}

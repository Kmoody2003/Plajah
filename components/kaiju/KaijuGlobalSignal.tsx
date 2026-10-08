// KaijuGlobalSignal — feeds the kaiju mascots from the app's GlobalPlayer (analyser + play state).
import React from 'react';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { KaijuSignalContext } from './kaijuSignal';

export const KaijuGlobalSignal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { analyser, isPlaying } = useGlobalPlayerState();
  const value = React.useMemo(() => ({ analyser: analyser ?? null, isPlaying: !!isPlaying }), [analyser, isPlaying]);
  return <KaijuSignalContext.Provider value={value}>{children}</KaijuSignalContext.Provider>;
};

export default KaijuGlobalSignal;

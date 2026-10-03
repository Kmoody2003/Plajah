import { useCallback, useEffect, useRef, useState } from 'react';
import { ariaVoice } from './ariaVoice';
import type { SpeakOptions, VoiceProfile } from './types';

/** React binding for the shared Aria voice. Cancels on unmount only if this component started the speech. */
export function useAriaVoice() {
  const [state, setState] = useState(ariaVoice.getState());
  const [profile, setProfile] = useState<VoiceProfile>(ariaVoice.getProfile());
  const spoke = useRef(false);

  useEffect(() => {
    const off = ariaVoice.onState(s => { setState(s); setProfile(ariaVoice.getProfile()); });
    return () => { off(); if (spoke.current) ariaVoice.cancel(); };
  }, []);

  const speak = useCallback((text: string, opts?: SpeakOptions) => { spoke.current = true; return ariaVoice.speak(text, opts); }, []);
  const cancel = useCallback(() => ariaVoice.cancel(), []);
  const setProfileId = useCallback((id: string) => { ariaVoice.setProfile(id); setProfile(ariaVoice.getProfile()); }, []);

  return { speak, cancel, speaking: state.speaking, provider: state.provider, profile, setProfileId };
}

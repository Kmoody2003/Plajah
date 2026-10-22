import { useEffect, useState } from 'react';
import { getActiveSupports, SUPPORT_EVENT, type Supports } from '../services/learningSupport';

/** The learning supports active on this device, live: re-renders when the dock, the Support Center or another tab changes them. */
export function useActiveSupports(): Supports {
  const [s, setS] = useState<Supports>(getActiveSupports);
  useEffect(() => {
    const on = () => setS(getActiveSupports());
    window.addEventListener(SUPPORT_EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(SUPPORT_EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return s;
}

import React, { useEffect, useRef, useState } from 'react';
import { loadGpt } from '../../services/ads/googleAds';
import { reportAdEvent } from '../../services/adEvents';

/**
 * One Google Ad Manager display ad in the side ad panel. If Google has nothing to show (no fill, a
 * blocked tag, an ad blocker, a slow network) the slot shows `fallback` instead, Plajah's own ad, so
 * the panel is never an empty box.
 */
let slotSeq = 0;

const SIZES: Array<[number, number]> = [[300, 250], [250, 250], [200, 200]];
/** Nothing back in this long → treat as no fill. */
const FILL_DEADLINE_MS = 5000;

const NetworkAdSlot: React.FC<{ unitPath: string; fallback: React.ReactNode }> = ({ unitPath, fallback }) => {
  const [state, setState] = useState<'loading' | 'filled' | 'empty'>('loading');
  const idRef = useRef(`plajah-gpt-${++slotSeq}`);

  useEffect(() => {
    let alive = true;
    let slot: any = null;
    let listener: ((e: any) => void) | null = null;
    const deadline = window.setTimeout(() => { if (alive) setState(s => (s === 'loading' ? 'empty' : s)); }, FILL_DEADLINE_MS);
    loadGpt().then(googletag => {
      if (!alive) return;
      googletag.cmd.push(() => {
        if (!alive) return;
        slot = googletag.defineSlot(unitPath, SIZES, idRef.current);
        if (!slot) { setState('empty'); return; }
        slot.addService(googletag.pubads());
        listener = (e: any) => {
          if (e.slot !== slot || !alive) return;
          clearTimeout(deadline);
          if (e.isEmpty) setState('empty');
          else { setState('filled'); reportAdEvent(`gam_${unitPath.split('/').pop() || 'rail'}`, 'impression', 'network'); }
        };
        googletag.pubads().addEventListener('slotRenderEnded', listener);
        googletag.display(idRef.current);
      });
    }).catch(() => { if (alive) setState('empty'); });
    return () => {
      alive = false;
      clearTimeout(deadline);
      const g = (window as any).googletag;
      if (g && slot) g.cmd.push(() => {
        try { if (listener) g.pubads().removeEventListener('slotRenderEnded', listener); } catch { /* */ }
        try { g.destroySlots([slot]); } catch { /* */ }
      });
    };
  }, [unitPath]);

  if (state === 'empty') return <>{fallback}</>;
  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ background: 'radial-gradient(120% 90% at 50% 10%, #160a26 0%, #07050c 75%)' }}>
      <span className="absolute top-2 left-2 text-[8px] font-black uppercase tracking-[0.35em] text-white/35">Advertisement</span>
      <div id={idRef.current} className="flex items-center justify-center" style={{ minWidth: 200, minHeight: 200 }} />
    </div>
  );
};

export default NetworkAdSlot;

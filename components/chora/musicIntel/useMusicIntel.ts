// Reads an album's Music Intelligence bundle, polls while the analysis is running, and nudges a
// stalled job (uploader closed the tab mid-album) to resume — once per page view.
import { useEffect, useRef, useState } from 'react';
import { continueMusicIntel, driveMusicIntel, fetchMusicIntel, type MusicIntelBundle } from '../../../services/musicIntelService';

const RUNNING = new Set(['QUEUED', 'LISTENING', 'SYNTHESIZING']);

export function useMusicIntel(albumId: string | undefined, enabled = true) {
  const [bundle, setBundle] = useState<(MusicIntelBundle & { stalled?: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const nudged = useRef<string | null>(null);

  useEffect(() => {
    if (!albumId || !enabled) { setBundle(null); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      setLoading(true);
      const b = await fetchMusicIntel(albumId);
      if (!alive) return;
      setLoading(false);
      setBundle(b);
      if (b?.stalled && nudged.current !== albumId) {
        nudged.current = albumId;
        void continueMusicIntel(albumId);
      }
      if (b?.job && (RUNNING.has(b.job.status) || b.stalled)) timer = setTimeout(load, 20_000);
    };
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [albumId, enabled, tick]);

  /** Owner: start (or re-run) the analysis, then refresh. */
  const run = (force = false) => {
    if (!albumId) return;
    void driveMusicIntel(albumId, { force });
    setTimeout(() => setTick(t => t + 1), 2500);
  };

  return { bundle, loading, run, running: !!bundle?.job && RUNNING.has(bundle.job.status) };
}

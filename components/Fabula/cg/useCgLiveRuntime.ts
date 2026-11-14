// useCgLiveRuntime — the master-side live services for a CG playout: keeps data
// sources used by the rundown subscribed, keeps trackers running for anchored
// graphics on air, and grows "follow" rundowns as rows arrive. Mounted by the
// Graphics workspace (Fabula, TV Studio dock) — every output then just draws.
import { useEffect } from 'react';
import '../../../services/liveData/liveDataAdapters';
import '../../../services/visualFill/visualProviders';
import { keepAnchoredTrackersRunning, keepBoundSourcesLive, runFollows } from '../../../services/fabula/cg/cgLive';
import type { CgPlayout } from '../../../services/fabula/cg/cgPlayout';

export function useCgLiveRuntime(playout: CgPlayout) {
  useEffect(() => {
    const a = keepBoundSourcesLive(playout);
    const b = keepAnchoredTrackersRunning(playout);
    const c = runFollows(playout);
    // Live data and tracking change without playout commits: nudge outputs to redraw.
    return () => { a(); b(); c(); };
  }, [playout]);
}

// The Samples-room → pads bridge. A SampleCandidate pinned in Melos becomes a loadable sound in
// the Beats browser, and its ClearanceRecord status travels ONTO the pad — the point being that
// you learn a sample is uncleared while you're building the beat, not at release time.
//
// The Beats engine stays Melos-agnostic (hard rule: services/melos/beats/engine imports nothing
// from the workspace), so this adapter lives on the component side and passes plain data down.

import { CLEARANCE_BLOCKING, clearanceMeta, type SampleCandidate } from '../../../services/melosService';

export interface MelosSampleRef {
  id: string;
  title: string;
  subtitle: string;      // source artist / work, for the browser row
  url: string;           // clipUrl preferred (the trimmed selection), else the full source
  clearance: string;     // ClearanceStatus, stamped onto PadConfig.melos
  clearanceLabel: string;
  clearanceColor: string;
  blocking: boolean;     // cannot release with this as-is
  origin: string;
}

export function toMelosSampleRefs(samples: SampleCandidate[]): MelosSampleRef[] {
  return samples
    .filter((s) => !!(s.clipUrl || s.url))
    .map((s) => {
      const meta = clearanceMeta(s.clearance.status);
      return {
        id: s.id,
        title: s.title || 'Untitled sample',
        subtitle: [s.sourceArtist, s.sourceWork].filter(Boolean).join(' — '),
        url: (s.clipUrl || s.url)!,
        clearance: s.clearance.status,
        clearanceLabel: meta.label,
        clearanceColor: meta.color,
        blocking: CLEARANCE_BLOCKING.includes(s.clearance.status),
        origin: s.origin,
      };
    });
}

/** Look up the CURRENT clearance for a pad's stamped sample — statuses change in the Samples room. */
export function liveClearance(refs: MelosSampleRef[] | undefined, sampleId: string): MelosSampleRef | null {
  return refs?.find((r) => r.id === sampleId) || null;
}

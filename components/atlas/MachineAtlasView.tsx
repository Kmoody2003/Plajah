// App entry for the AppView 'MACHINE_ATLAS'. Reads ?atlas=brakes&part=caliper (query-param deep link) and the
// OPEN_MACHINE_ATLAS window event (handled inside AtlasViewer).
import React, { useMemo } from 'react';
import AtlasViewer from './AtlasViewer';
import { parseAtlasQuery } from '../../services/machineAtlas/registry';

export default function MachineAtlasView({ onBack, initial }: { onBack?: () => void; initial?: { systemId?: string; partId?: string; scenarioId?: string; faultId?: string } }) {
  const d = useMemo(() => initial || (typeof window !== 'undefined' ? parseAtlasQuery(window.location.search) : null) || {}, [initial]);
  return <AtlasViewer systemId={d.systemId || 'brakes'} partId={d.partId} scenarioId={d.scenarioId} faultId={d.faultId} onClose={onBack} />;
}

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { TrackRightsQuestions } from '../../components/rights/TrackRightsQuestions';
import { canAirTrack, publishBlockers, trackClearance, type TrackRights } from '../../services/rights/trackClearance';

const Lab = () => {
  const [rights, setRights] = useState<TrackRights | undefined>();
  const track = { trackMeta: { rights } };
  return (
    <main className="max-w-3xl mx-auto p-4 space-y-3 text-white">
      <TrackRightsQuestions rights={rights} onChange={setRights} />
      <dl id="result" className="grid grid-cols-[auto_1fr] gap-x-3 text-[12px] text-white/70">
        <dt>Status</dt><dd id="status">{trackClearance(track)}</dd>
        <dt>Can publish</dt><dd id="publish">{String(publishBlockers([track]).length === 0)}</dd>
        <dt>Can air</dt><dd id="air">{String(canAirTrack(track))}</dd>
      </dl>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);

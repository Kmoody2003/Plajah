// Chora Session Band lab: the Beats room (no sign-in) so the band console can be driven in a
// browser — Timeline → Session Band.
//   npx vite --config chora-band-lab.vite.config.mjs  ->  http://127.0.0.1:3186/chora-band-lab.html
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';

const BeatsRoom = React.lazy(() => import('./components/melos/beats/BeatsRoom'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ padding: 24 }}>Loading Chora Studio…</div>}>
    <BeatsRoom onClose={() => { /* lab: nowhere to go */ }} />
  </Suspense>,
);

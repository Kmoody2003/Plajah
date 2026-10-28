// Chora hardware-inputs lab: the Beats room with a SIMULATED desktop ASIO bridge (labs/chora-inputs),
// so the Inputs panel, multi-arm and record → clips import run in a browser.
//   npx vite --config chora-inputs-lab.vite.config.mjs  ->  http://127.0.0.1:3184/chora-inputs-lab.html
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { installFakeAsioBridge } from './labs/chora-inputs/fakeAsioBridge';

installFakeAsioBridge();
const BeatsRoom = React.lazy(() => import('./components/melos/beats/BeatsRoom'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ padding: 24 }}>Loading Chora Studio…</div>}>
    <BeatsRoom onClose={() => { /* lab: nowhere to go */ }} />
  </Suspense>,
);

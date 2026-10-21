// Chora Studio lab — mounts the Beats room on its own, signed out (in-memory 'local' doc), so the
// timeline / MEKA / Glass, tempo track, meter, snap and engine can be exercised without the app
// shell or an account. Served by the normal dev server: npm run dev → /chora-studio-lab.html
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import BeatsRoom from './components/melos/beats/BeatsRoom';

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ padding: 24 }}>Loading Chora Studio…</div>}>
    <BeatsRoom onClose={() => { /* lab: nowhere to go */ }} />
  </Suspense>,
);

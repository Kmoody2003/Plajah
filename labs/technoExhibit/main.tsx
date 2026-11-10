// Lab entry for Machine Soul. ?room=tx-atkins opens on a room.
import React from 'react';
import { createRoot } from 'react-dom/client';
import TechnoExhibit from '../../components/exhibits/technoHistory/TechnoExhibit';

const room = new URLSearchParams(location.search).get('room') || undefined;
createRoot(document.getElementById('root')!).render(
  <TechnoExhibit initialRoom={room} onBack={() => history.back()} onShare={async (r) => { await new Promise((ok) => setTimeout(ok, 400)); console.log('[lab] would post', r); }} />,
);

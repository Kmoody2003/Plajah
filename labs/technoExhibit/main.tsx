// Lab entry for Machine Soul. ?room=tx-atkins opens on a room.
import React from 'react';
import { createRoot } from 'react-dom/client';
import TechnoExhibit from '../../components/exhibits/technoHistory/TechnoExhibit';

const room = new URLSearchParams(location.search).get('room') || undefined;
createRoot(document.getElementById('root')!).render(
  <TechnoExhibit initialRoom={room} onBack={() => history.back()} onShare={(w) => alert(`Share ${w} → Plajah feed (wired in the app)`)} />,
);

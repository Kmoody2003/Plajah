import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import MusicLawLibrary from './components/academia/MusicLawLibrary';

// ?chora=1 mounts the real Chora workspace opened on its Music Law room (after the Mastering Desk).
const MelosWorkspace = React.lazy(() => import('./components/melos/MelosWorkspace'));
const inChora = new URLSearchParams(location.search).get('chora') === '1';
// Signed out + demo production, so the workspace renders without Firestore access.
if (inChora) { try { localStorage.setItem('plajah_demo_mode_v1', '1'); } catch { /* */ } }

createRoot(document.getElementById('root')!).render(
  inChora
    ? <div style={{ height: '100vh' }}><Suspense fallback={null}><MelosWorkspace currentUser={null as any} initialRoom="law" /></Suspense></div>
    : <MusicLawLibrary />,
);

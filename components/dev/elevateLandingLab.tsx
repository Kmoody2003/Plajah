// Elevate landing lab (no sign-in): renders PlajahElevate standalone.
//   npx vite --config elevate-landing-lab.vite.config.mjs  ->  http://127.0.0.1:3168/elevate-landing-lab.html
// ?elevateTab=overview | church | faith | nonprofit | charity | cultural
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PlajahElevate from '../PlajahElevate';

const log = (what: string) => (arg?: unknown) => console.info('[elevate-lab]', what, arg ?? '');

createRoot(document.getElementById('root')!).render(
  <PlajahElevate onOpenOrg={log('openOrg')} onCreate={log('create')} onNavigate={log('navigate')} isSignedIn={false} />,
);

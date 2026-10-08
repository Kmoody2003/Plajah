// The full platform tree, split out of index.tsx so it can be code-split: the local-media fast
// path (components/LocalMediaLaunch) must be able to boot without parsing App or initialising
// Firebase. Normal launches import this immediately, so they pay only one local chunk hop.
import React from 'react';
import App from '../App';
import { GlobalPlayerProvider } from '../contexts/GlobalPlayerContext';

export default function FullApp() {
  return (
    <GlobalPlayerProvider>
      <App />
    </GlobalPlayerProvider>
  );
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { TerraExplorer } from './components/terra/TerraExplorer';

// The real Terra map with live city layers and Firestore reads (terra-lab.vite.config.mjs).
createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh' }}>
    <TerraExplorer onOpenPassport={id => console.log('[lab] passport', id)} onOpenStudio={id => console.log('[lab] studio', id)} />
  </div>,
);

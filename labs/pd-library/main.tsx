// Dev lab for Chora's Public Domain Library — era and world shelves, live from the Internet Archive.
// npx vite --config pd-library-lab.vite.config.mjs → http://127.0.0.1:3190/pd-library-lab.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PublicDomainLibrary from '../../components/chora/PublicDomainLibrary';
import { GlobalPlayerProvider } from './playerShim';

createRoot(document.getElementById('root')!).render(
  <GlobalPlayerProvider>
    <div className="min-h-screen text-white max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
      <PublicDomainLibrary />
    </div>
  </GlobalPlayerProvider>,
);

// src/comicMangaStudioLab.tsx — Plajah Comic, Manga & Storybook Studio Working Lab
// Mounts the real ComicMangaCreatorStudio inside the real Plajah Design Language environment.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ComicMangaCreatorStudio } from '../components/tela/studio/ComicMangaCreatorStudio';
import '../styles/plajah-ds.css';

const ComicMangaStudioLab: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#090a0f' }}>
      <ComicMangaCreatorStudio
        initialTitle="The Pumpkin Patch: Sector Zero Chrono-Tale"
        onClose={() => {
          if (window.history.length > 1) window.history.back();
          else window.location.href = '/';
        }}
        onInsertIntoTelaDoc={(page) => {
          console.log('[ComicMangaStudioLab] Inserted page into Tela document:', page);
          alert(`Successfully compiled ${page.panels.length}-panel sequential page into Tela Scene Graph!`);
        }}
      />
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<ComicMangaStudioLab />);
}

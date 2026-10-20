import React from 'react';
import { createRoot } from 'react-dom/client';
import { HauntedCastleExhibition } from '../../components/taleo/HauntedCastleExhibition';
import './preview.css';

createRoot(document.getElementById('root')!).render(
  <HauntedCastleExhibition
    onBackToVault={() => {}}
    onPlayPumpkinPatch={() => {}}
    onSelectArchiveFilm={() => {}}
  />
);

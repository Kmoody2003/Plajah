// src/fabulaLab.tsx — Fabula without the full app (served by the tela-comic-lab dev server), for
// checking the Anima ↔ Fabula hand-off.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import Fabula from '../components/Fabula/Fabula';

createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh', overflow: 'auto' }}>
    <Fabula />
  </div>
);

// src/animaLab.tsx — Anima Studio outside Fabula (served by the tela-comic-lab dev server).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import AnimaStudio from '../components/Fabula/anima/AnimaStudio';

createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh', background: '#0e0b14' }}>
    <AnimaStudio onBackToEdit={() => {}} />
  </div>
);

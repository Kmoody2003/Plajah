// src/merchStudioLab.tsx — Tela's Merch Designer outside the full app. ?project=<id> opens a saved project.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import MerchDesignerStudio from '../components/tela/merch/MerchDesignerStudio';

const project = new URLSearchParams(location.search).get('project') ?? undefined;

createRoot(document.getElementById('root')!).render(
  <MerchDesignerStudio initialProjectId={project} onClose={() => location.reload()} />,
);

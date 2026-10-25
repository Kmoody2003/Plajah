// src/telaTypeToolLab.tsx — the full Tela document editor outside the app, for the Type tool,
// text layers vs text box layers and the tool-options row.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import TelaView from '../components/tela/TelaView';

createRoot(document.getElementById('root')!).render(<TelaView onBack={() => {}} />);

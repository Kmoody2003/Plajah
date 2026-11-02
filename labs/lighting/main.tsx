// The real board with no app around it: real engine, no signed-in user, no music player.
//   npx vite --config lighting-lab.vite.config.mjs  ->  http://127.0.0.1:3213/lighting-lab.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { LightBoard } from '../../components/lighting/LightBoard';
import { boardEngine } from '../../services/lighting/boardEngine';

(window as any).board = boardEngine;
createRoot(document.getElementById('root')!).render(<LightBoard />);

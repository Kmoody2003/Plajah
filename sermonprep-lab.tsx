// Sermon prep lab: the real SermonPrep, no app boot (guest storage, local only).
//   npx vite --config lectio-lab.vite.config.mjs -> http://127.0.0.1:3171/sermonprep-lab.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import SermonPrep from './components/elevate/SermonPrep';

const church: any = { id: 'lab', name: 'Grace Chapel (lab)' };
createRoot(document.getElementById('root')!).render(<SermonPrep church={church} onClose={() => {}} />);

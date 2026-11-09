// The Sewing & Plush pattern room with no app around it.
//   npx vite --config sew-lab.vite.config.mjs  ->  http://127.0.0.1:3233/
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PatternRoom from '../../components/soft/PatternRoom';
import * as patterns from '../../services/soft/patterns';
import * as layout from '../../services/soft/layout';

(window as any).soft = { patterns, layout };
createRoot(document.getElementById('root')!).render(<PatternRoom onAddToTela={async a => { (window as any).lastAdd = a; console.log('[sew-lab] add', a.title, a.width, a.height); }}/>);

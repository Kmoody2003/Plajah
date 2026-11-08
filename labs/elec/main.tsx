// The Electronics Lab room with no app around it.
//   npx vite --config elec-lab.vite.config.mjs  ->  http://127.0.0.1:3231/
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import ElecRoom from '../../components/elec/ElecRoom';
import * as sim from '../../services/elec/sim';
import * as designs from '../../services/elec/designs';
import * as checks from '../../services/elec/checks';

(window as any).elec = { sim, designs, checks };
createRoot(document.getElementById('root')!).render(<ElecRoom
  onAddToTela={async a => { (window as any).lastAdd = a; console.log('[elec-lab] add', a.width, a.height, a.summary); }}
  onSendTable={async (title, rows) => { (window as any).lastTable = { title, rows }; }}/>);

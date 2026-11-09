// Build Studio with no app around it.
//   npx vite --config studio-lab.vite.config.mjs  ->  http://127.0.0.1:3234/
//   ?starter=keychain  ?lesson=traffic-light-101  ?hub=1 (the Plajah Build hub, to test launches)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import BuildStudio from '../../components/build/studio/BuildStudio';
import * as shapes from '../../services/build/studio/shapes';
import * as csg from '../../services/build/studio/csg';
import * as breadboard from '../../services/build/studio/breadboard';
import * as blocks from '../../services/build/studio/blocks';
import * as starters from '../../services/build/studio/starters';

(window as any).studio = { shapes, csg, breadboard, blocks, starters };
const q = new URLSearchParams(location.search);
const Hub = React.lazy(() => import('../../components/build/PlajahBuildHub'));
const root = createRoot(document.getElementById('root')!);
if (q.get('hub')) root.render(<React.Suspense fallback={null}><Hub/></React.Suspense>);
else root.render(<BuildStudio starter={q.get('starter') ?? undefined} lesson={q.get('lesson') ?? undefined}
  onSubmit={async w => { (window as any).lastSubmit = w; console.log('[studio-lab] submit', w.title, w.thumbnail?.slice(0, 30)); }}
  onClose={() => console.log('[studio-lab] close')}/>);

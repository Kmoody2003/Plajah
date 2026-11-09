// Fabula Disc Authoring with no app around it.
//   npx vite --config disc-lab.vite.config.mjs  ->  http://127.0.0.1:3232/
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import DiscAuthoring, { type DiscSource } from '../../components/fabula/DiscAuthoring';
import type { DiscProject } from '../../services/disc/project';
import * as budget from '../../services/disc/budget';
import * as validate from '../../services/disc/validate';
import * as nav from '../../services/disc/navigation';

const sources: DiscSource[] = [
  { id: 'tl', name: 'Night Train — final cut', durationSec: 6840, kind: 'timeline', markers: [{ t: 0 }, { t: 412, label: 'The Platform' }, { t: 1210, label: 'Eastbound' }, { t: 2034, label: 'The Dining Car' }, { t: 2980, label: 'Tunnel' }, { t: 3720, label: 'Border' }, { t: 4511, label: 'The Letter' }, { t: 5390, label: 'Last Stop' }, { t: 6300, label: 'Credits' }] },
  { id: 'bts', name: 'Making Night Train', durationSec: 1320, kind: 'edit' },
  { id: 'trl', name: 'Theatrical Trailer', durationSec: 142, kind: 'asset' },
];
function Lab() {
  const [discs, setDiscs] = useState<DiscProject[]>([]);
  (window as any).discs = discs;
  return <DiscAuthoring discs={discs} onChange={setDiscs} sources={sources} productionTitle="Night Train" ownerId="lab" ping={m => console.log('[disc-lab]', m)} />;
}
(window as any).disc = { budget, validate, nav };
createRoot(document.getElementById('root')!).render(<Lab />);

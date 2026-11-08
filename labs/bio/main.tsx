// The Biology Lab room with no app around it.
//   npx vite --config bio-lab.vite.config.mjs  ->  http://127.0.0.1:3230/
//   ?tab=pathway opens the simulator.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import BioRoom from '../../components/bio/BioRoom';
import * as structure from '../../services/bio/structure';
import * as sbml from '../../services/bio/sbml';
import { STARTERS } from '../../services/bio/models';

// "Add to document" in the lab builds the real Tela device with blob URLs instead of uploads.
const upload = async (f: File) => ({ src: URL.createObjectURL(f), sessionOnly: true });
const onAddToTela = async (device: any) => { (window as any).lastDevice = device; console.log('[bio-lab] device', device); };

(window as any).bio = { structure, sbml, STARTERS };
const tab = new URLSearchParams(location.search).get('tab') === 'pathway' ? 'pathway' : 'molecule';
createRoot(document.getElementById('root')!).render(<BioRoom initialTab={tab} upload={upload} makeId={() => `dev_${Date.now()}`} onAddToTela={onAddToTela}/>);

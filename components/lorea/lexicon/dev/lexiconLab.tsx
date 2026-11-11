// Lorea Lexicon lab entry — see lexicon-lab.vite.config.mjs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import LoreaLexicon from '../LoreaLexicon';
import { configureLexiconClient } from '../../../../services/lexicon/client';
import type { LexiconTab } from '../../../../services/lexicon/types';

configureLexiconClient({ token: async () => 'lab' });
const q = new URLSearchParams(location.search);

createRoot(document.getElementById('root')!).render(
  <LoreaLexicon
    key={q.get('w') ?? 'lobby'}
    initialWord={q.get('w') ?? undefined}
    initialTab={(q.get('tab') as LexiconTab) ?? undefined}
    kidsMode={q.get('kids') === '1'}
    onBack={() => { location.search = ''; }}
  />,
);

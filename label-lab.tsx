import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { LabelDesk, setLabelIdentity } from './components/chora/LabelDesk';

// The real Label Desk and routes/labels.ts over an in-memory store (label-lab.vite.config.mjs). ?as= picks who's signed in.
// ?chora=1 mounts the real Chora workspace opened on its Label room.
const USERS = [['boss', 'Label owner'], ['artist', 'Artist with two albums'], ['kim', 'Another person']];
const params = new URLSearchParams(location.search);
const uid = params.get('as') || 'boss';
setLabelIdentity(async () => ({ token: `lab:${uid}`, uid }));

const MelosWorkspace = React.lazy(() => import('./components/melos/MelosWorkspace'));
const inChora = params.get('chora') === '1';
if (inChora) { try { localStorage.setItem('plajah_demo_mode_v1', '1'); } catch { /* */ } }

createRoot(document.getElementById('root')!).render(
  inChora ? <div style={{ height: '100vh' }}><Suspense fallback={null}><MelosWorkspace currentUser={null as any} initialRoom="label" /></Suspense></div> : (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <nav aria-label="Lab user" className="mb-5 flex flex-wrap gap-2 text-xs">
        {USERS.map(([id, text]) => (
          <a key={id} href={`?as=${id}`} className={`rounded-full border px-3 py-1 ${id === uid ? 'border-[#FF8C00] text-white' : 'border-white/15 text-white/50'}`}>{text}</a>
        ))}
      </nav>
      <LabelDesk />
    </div>
  ),
);

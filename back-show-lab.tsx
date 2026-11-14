import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { BackShowDesk, BackShowPage, setBackShowToken } from './components/chora/BackThisShow';

// The real screens and routes/backShow.ts over an in-memory store and a fake Stripe (back-show-lab.vite.config.mjs).
// ?as= picks who's signed in (as=none is signed out). ?show=<id> or /back/<id> opens the public page.
const q = new URLSearchParams(location.search);
const uid = q.get('as') ?? 'artist';
setBackShowToken(async () => (uid === 'none' ? null : `lab:${uid}`));
const show = q.get('show');

createRoot(document.getElementById('root')!).render(
  <div className="mx-auto max-w-5xl p-4 sm:p-6">
    <nav aria-label="Lab user" className="mb-5 flex flex-wrap gap-2 text-xs">
      {[['artist', 'Artist'], ['fan', 'Fan'], ['biz', 'Small business'], ['none', 'Signed out']].map(([id, text]) => (
        <a key={id} href={`?as=${id}${show ? `&show=${show}` : ''}`} className={`rounded-full border px-3 py-1 ${id === uid ? 'border-[#FF8C00] text-white' : 'border-white/15 text-white/50'}`}>{text}</a>
      ))}
    </nav>
    {location.pathname.startsWith('/back/verify/') ? <BackShowPage id="verify" /> : show ? <BackShowPage id={show} signedIn={uid !== 'none'} onSignIn={() => { location.search = `?as=fan&show=${show}`; }} /> : <BackShowDesk />}
  </div>,
);

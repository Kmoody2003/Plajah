// Show Mode lab: the real ShowModeView inside the real GlobalPlayerProvider, fed a local album.
// Track 1 carries timed lyrics (overlay check); track 2 has none (exercises the on-demand sync
// call, which 404s here since this lab has no API server — the stage must keep running).
// ?mode=FX|SLIDES|DEFAULT  ?noart=1 (no cover: the floor falls back to the gradient)
import React from 'react';
import { createRoot } from 'react-dom/client';
import './showModeLab.css';
import { GlobalPlayerProvider } from '../contexts/GlobalPlayerContext';
import ShowModeView from '../components/ShowModeView';

const q = new URLSearchParams(location.search);
const cover = q.get('noart') ? '' : '/og-default.png';
const lines = Array.from({ length: 40 }, (_, i) => ({ time: 2 + i * 3, text: ['Lights up over the city', 'We keep the rhythm alive', 'Hands high, hearts on fire', 'Sing it back to me now', '(instrumental)'][i % 5] }));

const album: any = {
  id: 'lab-album', title: 'Show Mode Lab', artist: 'Plajah Test Artist', ownerId: 'lab-owner',
  type: 'MUSIC', coverImage: cover, tracks: [
    { id: 't1', title: 'Anthem One', url: '/audio/anthems/alg.mp3', timeCodedLyrics: lines },
    { id: 't2', title: 'Anthem Two', url: '/audio/anthems/arg.mp3' },
  ],
};

createRoot(document.getElementById('root')!).render(
  <GlobalPlayerProvider>
    <ShowModeView album={album} mode={(q.get('mode') as any) || 'DEFAULT'} onExit={() => location.reload()} onSignUp={() => {}} />
  </GlobalPlayerProvider>,
);

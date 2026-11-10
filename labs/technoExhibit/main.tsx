// Lab entry for Machine Soul. ?room=tx-atkins opens on a room; ?view=embed shows the feed cards.
import React from 'react';
import { createRoot } from 'react-dom/client';
import TechnoExhibit from '../../components/exhibits/technoHistory/TechnoExhibit';
import { TechnoExhibitEmbed } from '../../components/exhibits/technoHistory/TechnoShare';

const q = new URLSearchParams(location.search);
const room = q.get('room') || undefined;
// The lab has no sign-in, so sharing is faked; the app posts through backendService.createPost.
const fakeShare = async (r: string) => { await new Promise((ok) => setTimeout(ok, 400)); console.log('[lab] would post', r); };
window.addEventListener('plajah:openTechnoExhibit', (e) => { location.search = `?room=${(e as CustomEvent).detail?.room || ''}`; });

createRoot(document.getElementById('root')!).render(
  q.get('view') === 'embed'
    ? <div style={{ display: 'grid', gap: 24, maxWidth: 520, margin: '40px auto', padding: 16 }}><TechnoExhibitEmbed embed={{ roomId: 'tx-entrance', subtitle: 'Detroit techno · the Berlin connection · the godfathers' }} /><TechnoExhibitEmbed embed={{ roomId: 'tx-atkins', subtitle: 'The Originator: a tribute to Juan Atkins' }} /></div>
    : <TechnoExhibit initialRoom={room} onBack={() => history.back()} onShare={fakeShare} />,
);

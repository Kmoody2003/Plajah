// Dev lab for the Lorea Exhibition Hall — the hall, every nugget variant and the feed card without
// booting the app. npx vite --config lorea-exhibits-lab.vite.config.mjs → http://127.0.0.1:3144/lorea-exhibits-lab.html
// ?view=nuggets shows the planted variants on a Lorea-coloured page.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoreaExhibitHall from '../LoreaExhibitHall';
import { LoreaExhibitEmbed, LoreaNuggetView } from '../LoreaNugget';
import { dailyNuggets, requestLoreaExhibit, useLoreaDepth, useLoreaExhibits } from '../../../../services/loreaExhibits/loreaExhibitStore';
import { validateLoreaExhibit } from '../../../../services/loreaExhibits/loreaExhibitTypes';

function Nuggets() {
  const ex = useLoreaExhibits();
  const [depth] = useLoreaDepth();
  if (!ex) return null;
  const all = dailyNuggets(ex, depth);
  const issues = ex.flatMap(validateLoreaExhibit);
  return (
    <div style={{ background: '#160024', minHeight: '100vh', padding: 32, color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <p>{ex.length} exhibits · {all.length} nuggets at {depth} · validator issues: {issues.length} {issues.slice(0, 5).join(' | ')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start', marginTop: 24 }}>
        {all.slice(0, 3).map(p => <LoreaNuggetView key={p.nugget.id} picked={p} variant="scrap" />)}
        {all.slice(3, 5).map(p => <LoreaNuggetView key={p.nugget.id} picked={p} variant="margin" />)}
      </div>
      <div style={{ maxWidth: 560, marginTop: 40, background: '#0d0d12', padding: 16, borderRadius: 16 }}>
        <p style={{ fontSize: 11, opacity: .6 }}>feed card</p>
        {all[6] && <LoreaNuggetView picked={all[6]} variant="card" />}
        <p style={{ fontSize: 11, opacity: .6, marginTop: 20 }}>shared post embed</p>
        <LoreaExhibitEmbed embed={{ id: 'rhythm', roomId: ex.find(e => e.id === 'rhythm')?.rooms[1].id, title: 'The Rhythm Exhibit', subtitle: 'The Hall of Feet', accent: '#b8321f', motif: 'metronome' }} />
      </div>
    </div>
  );
}

function Lab() {
  const q = new URLSearchParams(location.search);
  const [key, setKey] = useState(0);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail || {}; requestLoreaExhibit(d.id, d.roomId); setKey(k => k + 1); history.replaceState(null, '', '?'); };
    window.addEventListener('plajah:openLoreaExhibit', h);
    return () => window.removeEventListener('plajah:openLoreaExhibit', h);
  }, []);
  if (q.get('view') === 'nuggets' && key === 0) return <Nuggets />;
  const id = q.get('ex');
  return <LoreaExhibitHall key={key} initialId={key === 0 ? (id as any) : undefined} />;
}

createRoot(document.getElementById('root')!).render(<Lab />);

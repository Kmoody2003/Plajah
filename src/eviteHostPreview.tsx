// Dev-only: Events home + Evite studio with mocked host data (see src/mocks). /evite-host.html?view=home|studio|manage
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EventsHome from '../components/events/EventsHome';
import EviteStudio from '../components/evite/EviteStudio';

function App() {
  const q = new URLSearchParams(location.search);
  const [view, setView] = useState<'home' | 'studio'>(q.get('view') === 'studio' || q.get('view') === 'manage' ? 'studio' : 'home');
  const [ctx, setCtx] = useState<{ editId?: string; plateId?: string; host?: any }>(q.get('view') === 'manage' ? { editId: 'demo1234' } : {});
  const user = { uid: 'me', displayName: 'Kenne Moody' };
  const note = (m: string) => () => console.log('[preview]', m);
  return view === 'home'
    ? <EventsHome currentUser={user} onCreate={o => { setCtx({ plateId: o?.plateId, host: o?.host }); setView('studio'); }} onManage={id => { setCtx({ editId: id }); setView('studio'); }}
        onOpenEvent={note('open event')} onCreateTicketed={note('ticketed')} onOpenTicketing={note('ticketing')} onOpenProduction={note('production')} onSignIn={note('sign in')} />
    : <EviteStudio key={`${ctx.editId}-${ctx.plateId}`} currentUser={user} editId={ctx.editId} initialPlate={ctx.plateId} host={ctx.host} onBack={() => setView('home')} />;
}
createRoot(document.getElementById('root')!).render(<App />);

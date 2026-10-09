// Reader lab: mounts the REAL BookReader with a REAL published album (?id=showcase_moon-blanket) so reader behaviour can be driven by a browser test.
//   npx vite --config reader-lab.vite.config.mjs  ->  http://127.0.0.1:3150/reader-lab.html?id=showcase_moon-blanket
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './services/firebase';
import BookReader from './components/BookReader';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';

const Lab: React.FC = () => {
  const id = new URLSearchParams(location.search).get('id') || 'showcase_moon-blanket';
  const [book, setBook] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { getDoc(doc(db, 'albums', id)).then(s => s.exists() ? setBook({ id: s.id, ...s.data(), skipOpeningScene: true }) : setErr('album not found')).catch(e => setErr(String(e?.message || e))); }, [id]);
  if (err) return <p data-testid="err">{err}</p>;
  if (!book) return <p>Loading {id}...</p>;
  return <div style={{ height: '100vh' }}><BookReader book={book} onBack={() => {}} currentUser={null} /></div>;
};
createRoot(document.getElementById('root')!).render(<GlobalPlayerProvider><Lab /></GlobalPlayerProvider>);

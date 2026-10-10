// Reader lab: mounts the REAL BookReader with a REAL published album (?id=showcase_moon-blanket) so reader behaviour can be driven by a browser test.
//   npx vite --config reader-lab.vite.config.mjs  ->  http://127.0.0.1:3150/reader-lab.html?id=showcase_moon-blanket
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './services/firebase';
import BookReader from './components/BookReader';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
import { loadShowcaseTelaDoc, makeShowcaseBundle } from './services/showcase/livingDoc';

const Lab: React.FC = () => {
  const id = new URLSearchParams(location.search).get('id') || 'showcase_moon-blanket';
  const [book, setBook] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => {
    getDoc(doc(db, 'albums', id)).then(async s => {
      if (!s.exists()) return setErr('album not found');
      const album: any = { id: s.id, ...s.data(), skipOpeningScene: true };
      // ?living=1 : read the LIVING edition built locally from the real designers + data/showcase/living (no publish, no private album read).
      if (new URLSearchParams(location.search).get('living') === '1') {
        const bookId = id.replace(/^showcase_(zz_test_)?/, '');
        const tdoc = await loadShowcaseTelaDoc(bookId);
        const bundle = makeShowcaseBundle(tdoc, 'lab-living', Date.now(), 'lab', { albumId: id });
        await new Promise<void>((res, rej) => { const r = indexedDB.open('plajah-book-tela', 1); r.onupgradeneeded = () => { r.result.createObjectStore('upgrades', { keyPath: 'bookId' }); r.result.createObjectStore('bundles', { keyPath: 'key' }); }; r.onsuccess = () => { const tx = r.result.transaction('bundles', 'readwrite'); tx.objectStore('bundles').put({ key: `${id}:lab-living`, albumId: id, versionId: 'lab-living', json: JSON.stringify(bundle), at: Date.now() }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
        album.bookTela = { enabled: true, docId: tdoc.id, versionId: 'lab-living', upgradedAt: Date.now(), versions: [{ versionId: 'lab-living', createdAt: 1 }], edition: 'living', hasLiving: true };
      }
      setBook(album);
    }).catch(e => setErr(String(e?.message || e)));
  }, [id]);
  if (err) return <p data-testid="err">{err}</p>;
  if (!book) return <p>Loading {id}...</p>;
  return <div style={{ height: '100vh' }}><BookReader book={book} onBack={() => {}} currentUser={null} /></div>;
};
createRoot(document.getElementById('root')!).render(<GlobalPlayerProvider><Lab /></GlobalPlayerProvider>);

// "My purchases" — the books the signed-in reader has bought, read from their contentLicenses
// (minted server-side by the Stripe webhook). Renders nothing until there is at least one.
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Gift, ShieldCheck } from 'lucide-react';
import { OPEN_MY_GIFTS_EVENT } from '../../services/sponsorCopies/client';
import type { Album } from '../../types';
import { auth, fetchProjectFromCloud } from '../../services/backendService';
import { listContentLicenses } from '../../services/contentLicense';

interface Props { onSelectBook: (book: Album) => void }

const PurchasedBooksShelf: React.FC<Props> = ({ onSelectBook }) => {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [books, setBooks] = useState<Album[]>([]);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);

  useEffect(() => {
    if (!uid) { setBooks([]); return; }
    let alive = true;
    (async () => {
      const now = Date.now();
      const lics = (await listContentLicenses(uid, 'book')).filter(l => l.expiresAt == null || l.expiresAt > now);
      const albums = await Promise.all(lics.map(l => fetchProjectFromCloud(l.contentId).catch(() => null)));
      if (alive) setBooks(albums.filter((a): a is Album => !!a));
    })();
    return () => { alive = false; };
  }, [uid]);

  if (!books.length) return null;
  return (
    <section className="s" aria-label="My purchases">
      <div className="eyebrow">My purchases</div>
      <h2 className="disp">Your shelf, on every device.</h2>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_MY_GIFTS_EVENT))}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white">
        <Gift size={13} /> Books I’ve gifted
      </button>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {books.map(b => (
          <button key={b.id} type="button" onClick={() => onSelectBook(b)} className="shrink-0 w-32 text-left group">
            <div className="relative w-32 h-48 rounded-2xl overflow-hidden bg-white/5 shadow-xl">
              {b.coverImage && <img src={b.coverThumb || b.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />}
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/80 text-white text-[9px] font-black uppercase tracking-widest">
                <ShieldCheck size={10} /> Owned
              </span>
            </div>
            <p className="mt-2 text-xs font-bold text-white line-clamp-2">{b.title}</p>
            {b.artist && <p className="text-[11px] text-white/50 truncate">{b.artist}</p>}
          </button>
        ))}
      </div>
    </section>
  );
};

export default PurchasedBooksShelf;

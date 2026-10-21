// On a book's purchase screen / reader: open giveaways ("Acme Library is giving away 12 free copies") and
// the "Gift this book" button. The dialogs themselves live in SponsorCopies.tsx (mounted once in App).
import React, { useEffect, useState } from 'react';
import { Gift, Heart } from 'lucide-react';
import { fetchBookGiveaways, openClaim, openSponsor, type PublicPool } from '../../services/sponsorCopies/client';

interface Props {
  book: { id: string; title: string; price?: number; ownerId?: string; coverImage?: string; artist?: string };
  /** Show open giveaways (purchase screen); the reader only needs the gift button. */
  showGiveaways?: boolean;
  isAuthor?: boolean;
  className?: string;
}

const BookGiveaways: React.FC<Props> = ({ book, showGiveaways, isAuthor, className }) => {
  const [pools, setPools] = useState<PublicPool[]>([]);
  useEffect(() => {
    if (!showGiveaways) return;
    let alive = true;
    fetchBookGiveaways(book.id).then(p => { if (alive) setPools(p); }).catch(() => {});
    return () => { alive = false; };
  }, [book.id, showGiveaways]);
  if (!(book.price && book.price > 0) && !isAuthor) return null;
  return (
    <div className={`flex flex-col items-center gap-2 ${className || ''}`}>
      {pools.map(p => (
        <button key={p.poolId} type="button" onClick={() => openClaim({ poolId: p.poolId })}
          className="w-full max-w-sm inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-black hover:bg-emerald-500/25">
          <Heart size={14} /> Claim a free copy · {p.line}
        </button>
      ))}
      <button type="button" onClick={() => openSponsor({ book })}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-black uppercase tracking-widest">
        <Gift size={14} /> {isAuthor ? 'Give away copies' : 'Gift this book'}
      </button>
    </div>
  );
};

export default BookGiveaways;

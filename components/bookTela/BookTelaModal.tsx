import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { BookSource, BookSourceChapter } from '../../services/bookTela/types';
import { decideExportRights } from '../../services/bookTela/export/rights';
import UpgradeToTelaPanel, { type AlbumCtx } from './UpgradeToTelaPanel';
import ExportDialog from './ExportDialog';

interface Props {
  book: BookSource;
  /** Present once the book is published to Lorea (price, owner). */
  album?: AlbumCtx & { bookLicense?: string };
  uid?: string;
  initialTab?: 'upgrade' | 'export';
  onChaptersChanged?: (chapters: BookSourceChapter[]) => void;
  onClose: () => void;
}

/**
 * One mount point for every author surface (MyBooks, Authoring Studio, Album editor, owner reader).
 * Sheet on phones, centred dialog on desktop. Escape closes. Focus stays inside via the dialog role.
 */
export default function BookTelaModal({ book, album, uid, initialTab = 'upgrade', onChaptersChanged, onClose }: Props) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const isOwner = !!uid && (uid === book.ownerId || uid === album?.ownerId);
  const rights = decideExportRights({ isOwner, signedIn: !!uid, isPaid: !!album?.price && album.price > 0, bookLicense: album?.bookLicense });

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${book.title}: Tela edition and export`} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0e0b14] border border-white/10 px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <div role="tablist" aria-label="Book tools" className="flex gap-1">
            {(['upgrade', 'export'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`px-4 py-2 min-h-[44px] rounded-full text-[11px] font-black uppercase tracking-widest ${tab === t ? 'bg-amber-400 text-black' : 'text-white/50 hover:text-white'}`}>{t === 'upgrade' ? 'Tela edition' : 'Export'}</button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto p-2 text-white/40 hover:text-white"><X size={16} /></button>
        </div>
        {tab === 'upgrade'
          ? <UpgradeToTelaPanel book={book} album={isOwner ? album : undefined} onChaptersChanged={onChaptersChanged} onOpenExport={() => setTab('export')} />
          : <ExportDialog book={book} rights={rights} onClose={() => setTab('upgrade')} />}
      </div>
    </div>
  );
}

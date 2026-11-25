/**
 * Living Field Journal Modal — shows every solved handmade discovery across all worlds
 * and compiles a print-ready Lorea Keepsake Book HTML file on demand.
 */

import React from 'react';
import { BookMarked, Download, X } from 'lucide-react';
import type { JournalEntry } from '../../services/academiaGames/contracts';
import { compileKeepsakeBookHtml } from '../../services/academiaGames/fieldJournal';
import { DecklePaperCard, StitchedClothButton, WaxSealBadge } from './craftPrimitives';

interface Props {
  open: boolean;
  entries: JournalEntry[];
  onClose: () => void;
}

const EMBLEM_GLYPH: Record<JournalEntry['emblem'], string> = {
  lantern: '☀',
  waterwheel: '☸',
  oak: '❀',
  knot: '∞',
  astrolabe: '✦',
  olive: '❧',
};

export const LivingJournalModal: React.FC<Props> = ({ open, entries, onClose }) => {
  if (!open) return null;

  const exportBook = () => {
    const html = compileKeepsakeBookHtml('Plajah Learner', entries);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plajah-living-field-journal.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Living Field Journal"
      className="fixed inset-0 z-50 bg-[#14100C]/72 backdrop-blur-sm grid place-items-center p-4"
    >
      <DecklePaperCard copperplate tone="cream" className="w-full max-w-2xl max-h-[84vh] overflow-hidden p-6 text-[#35261B]">
        <div className="flex items-start justify-between gap-4 pb-3.5 border-b border-[#CDB998]">
          <div className="flex items-center gap-3">
            <WaxSealBadge label={`${entries.length}`} color="terracotta" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#7D664E] font-semibold flex items-center gap-1.5">
                <BookMarked size={12} /> Lorea Living Field Journal
              </div>
              <h2 className="text-[22px] font-bold mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
                Your Illustrated Keepsake Book
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Field Journal"
            className="w-8 h-8 rounded-full grid place-items-center hover:bg-black/5 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto max-h-[54vh] pr-1">
          {entries.length === 0 ? (
            <div className="p-6 text-center italic text-[#6D5844] bg-[#EFE5D1]/70 rounded border border-[#D4C2A3]" style={{ fontFamily: 'Georgia, serif' }}>
              Your cotton-rag pages are fresh and waiting. Complete any discovery in Lantern (Reading), Mill (Math), Grove (Science), Press (9–12), Atlas (History), or Parables (Elevate) to stamp your first illustrated page.
            </div>
          ) : (
            entries.map((entry, idx) => (
              <article key={entry.id} className="p-4 rounded bg-[#FAF3E6] border border-[#D3C0A0]">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[#7A644E]">
                  <span>
                    {EMBLEM_GLYPH[entry.emblem]} Folio {entries.length - idx} · {entry.world}
                  </span>
                  <span>{entry.band}</span>
                </div>
                <h3 className="text-[16px] font-bold mt-1" style={{ fontFamily: 'Georgia, serif' }}>
                  {entry.title}
                </h3>
                <p className="text-[13px] text-[#473527] mt-1 leading-relaxed">{entry.summary}</p>
                <div className="mt-2 px-3 py-1.5 bg-[#EFE5D1] border-l-[3px] border-[#C6923A] text-[12.5px] italic text-[#4E3B2B]">
                  {entry.artifactNote}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {entry.standards.map(s => (
                    <span
                      key={`${s.framework}-${s.code}`}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-[#C6B18F] text-[#5C4938]"
                    >
                      {s.framework} {s.code}
                    </span>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="mt-4 pt-3.5 border-t border-[#CDB998] flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-[#6B5642] italic" style={{ fontFamily: 'Georgia, serif' }}>
            Every entry stays saved locally and compiles into a printable Lorea keepsake edition.
          </p>
          <div className="flex items-center gap-2">
            <StitchedClothButton onClick={exportBook} tone="sage">
              <Download size={13} /> Export Keepsake Book
            </StitchedClothButton>
            <StitchedClothButton onClick={onClose} tone="linen">
              Back to Valley
            </StitchedClothButton>
          </div>
        </div>
      </DecklePaperCard>
    </div>
  );
};

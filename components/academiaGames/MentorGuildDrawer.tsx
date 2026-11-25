/**
 * Playable 13-Seat Education Council ("The Mentor Guild") Drawer.
 *
 * Presents tiered Socratic guidance (1: Nudge -> 2: Structural Lens -> 3: Worked Scaffold)
 * anchored to real seats from services/educationCouncil/members.ts, rendered as a torn cotton-rag
 * folio card with an honest deterministic-provenance footer.
 */

import React from 'react';
import { BookOpen, Sparkles, X } from 'lucide-react';
import type { MentorHint } from '../../services/academiaGames/contracts';
import { DecklePaperCard, StitchedClothButton } from './craftPrimitives';

interface Props {
  open: boolean;
  hint: MentorHint;
  tier: 1 | 2 | 3;
  onSelectTier: (tier: 1 | 2 | 3) => void;
  onClose: () => void;
}

const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: '1 · Gentle Nudge',
  2: '2 · Visual Lens',
  3: '3 · Worked Step',
};

export const MentorGuildDrawer: React.FC<Props> = ({ open, hint, tier, onSelectTier, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Education Council Mentor Guide"
      className="fixed right-4 bottom-20 z-50 w-[min(390px,calc(100vw-2rem))]"
    >
      <DecklePaperCard copperplate tone="cream" className="p-5 text-[#36271C]">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#CDB998]">
          <div className="flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold text-white shrink-0"
              style={{ background: hint.seatColor, fontFamily: 'Georgia, serif' }}
            >
              {hint.seatName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#7A644E] font-semibold flex items-center gap-1">
                <Sparkles size={11} /> Plajah Education Council
              </div>
              <div className="text-[15px] font-bold" style={{ fontFamily: 'Georgia, serif' }}>
                {hint.seatName} · <span className="font-normal italic text-[#5E4B3B]">{hint.seatTitle}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Mentor Guide"
            className="w-7 h-7 rounded-full grid place-items-center text-[#5E4B3B] hover:bg-black/5 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tier progression pills: Nudge -> Lens -> Worked Example (worked-example fading) */}
        <div className="flex gap-1.5 mt-3">
          {([1, 2, 3] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onSelectTier(t)}
              className="flex-1 px-2 py-1.5 rounded text-[11px] font-semibold cursor-pointer transition-colors"
              style={{
                background: tier === t ? '#36271C' : 'rgba(130,104,76,0.12)',
                color: tier === t ? '#F6EFE2' : '#4E3B2B',
                fontFamily: 'Georgia, serif',
              }}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="mt-3.5 space-y-1.5">
          <h3 className="text-[15px] font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            {hint.heading}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-[#3D2E22]">
            {hint.message}
          </p>
        </div>

        <div className="mt-4 pt-2.5 border-t border-[#D9C7A9] flex items-center justify-between gap-2 text-[11px] text-[#7A644E]">
          <span className="inline-flex items-center gap-1">
            <BookOpen size={11} /> Local Socratic rule engine · zero silent cloud AI
          </span>
          {tier < 3 && (
            <StitchedClothButton onClick={() => onSelectTier((tier + 1) as 2 | 3)} tone="linen" className="!py-1 !px-2.5 !text-[11px]">
              Next clue
            </StitchedClothButton>
          )}
        </div>
      </DecklePaperCard>
    </div>
  );
};

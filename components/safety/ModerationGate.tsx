/**
 * ModerationGate — honours the SERVER moderation fields (routes/trustSafety.ts) wherever media renders.
 *
 *   moderationStatus 'label'             → children render; safetyLabels flow into SensitiveContentGate
 *                                          (viewer's own blur settings decide)
 *   moderationStatus 'blur_interstitial' → always blurred behind a tap-to-reveal interstitial (viewer opt-in),
 *                                          regardless of settings — this is how creative graphic work stays up
 *   hidden statuses (blocked / removed / pending_review_hidden) → nothing for viewers; the AUTHOR sees a
 *                                          notice instead of their content
 *
 * Pure decisions: services/safety/safetyPolicy.ts (moderationVisibility).
 */
import React, { useState } from 'react';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { moderationVisibility } from '../../services/safety/safetyPolicy';

const LABEL_COPY: Record<string, string> = {
  GRAPHIC_VIOLENCE: 'Graphic content',
  MATURE_18: 'Mature content',
  ARTISTIC_NUDITY: 'Artistic nudity',
  SENSITIVE_OTHER: 'Sensitive content',
};

export const ModerationGate: React.FC<{
  status?: unknown;
  labels?: string[];
  viewerIsAuthor?: boolean;
  children: React.ReactNode;
}> = ({ status, labels, viewerIsAuthor, children }) => {
  const [revealed, setRevealed] = useState(false);
  const vis = moderationVisibility(status);

  if (vis === 'hidden') {
    if (!viewerIsAuthor) return null;
    return (
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
        <ShieldAlert size={18} className="text-[#FF8C00] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-white">
            {status === 'removed' ? 'Removed by Plajah' : status === 'pending_review_hidden' ? 'Under review' : 'Not visible'}
          </p>
          <p className="text-[11px] text-white/50 leading-relaxed">
            {status === 'pending_review_hidden'
              ? 'Only you can see this notice. Our safety team is reviewing this post; it is hidden from others until then.'
              : 'Only you can see this notice. This post broke Plajah’s content rules and is not shown to anyone else.'}
          </p>
        </div>
      </div>
    );
  }

  if (vis !== 'interstitial' || revealed) {
    return (
      <>
        {children}
        {vis === 'interstitial' && revealed && (
          <button
            onClick={() => setRevealed(false)}
            className="mt-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            <EyeOff size={9} /> Hide again
          </button>
        )}
      </>
    );
  }

  const names = (labels || []).map(l => LABEL_COPY[l]).filter(Boolean);
  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div className="pointer-events-none select-none blur-2xl saturate-50 opacity-60" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm p-6">
        <ShieldAlert size={22} className="text-[#FF8C00]" />
        <p className="font-black uppercase tracking-widest text-white text-center text-[10px]">
          {names.length ? names.join(' · ') : 'Sensitive content'}
        </p>
        <p className="text-[9px] text-white/50 text-center max-w-60 leading-relaxed">
          This may be disturbing to some viewers. Do you want to see it?
        </p>
        <button
          onClick={() => setRevealed(true)}
          className="flex items-center gap-1.5 rounded-full bg-[#FF8C00] text-black font-black uppercase tracking-widest hover:bg-[#ffa033] transition-colors px-4 py-2 text-[9px] mt-1">
          <Eye size={11} /> View
        </button>
      </div>
    </div>
  );
};

export default ModerationGate;

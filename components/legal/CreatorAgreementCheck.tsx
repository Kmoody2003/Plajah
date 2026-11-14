// The Creator Agreement checkbox, with the full text one tap away, plus the call that records
// acceptance on the server when the release is published (routes/legalAcceptance.ts).

import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { auth } from '../../services/firebase';
import { CREATOR_AGREEMENT, CREATOR_AGREEMENT_VERSION, CREATOR_ATTESTATION } from '../../services/legal/creatorAgreement';
import { sha256Hex } from '../../services/chora/contrib/client';

export const CreatorAgreementCheck: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 cursor-pointer group">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-small-orange border-small-orange' : 'border-white/30 group-hover:border-white/60'}`}
        >
          {checked && <Check size={12} className="text-white" />}
        </button>
        <span className="text-[10px] font-semibold text-white/60 leading-relaxed">{CREATOR_ATTESTATION}</span>
      </label>
      <button type="button" onClick={() => setOpen((v) => !v)} className="ml-8 text-[10px] font-bold text-small-orange underline flex items-center gap-1">
        {open ? 'Hide' : 'Read'} the Creator Agreement <ChevronDown size={11} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="ml-8 max-h-72 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-black/40 p-4 space-y-3 text-[11px] leading-relaxed text-white/70">
          {CREATOR_AGREEMENT.map((s) => (
            <section key={s.heading}>
              <h4 className="font-bold text-white/90 mb-1">{s.heading}</h4>
              {s.body.map((p, i) => <p key={i} className="mb-1">{p}</p>)}
            </section>
          ))}
          <p className="text-white/35">Version {CREATOR_AGREEMENT_VERSION}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Record that the signed-in creator accepted the current agreement for `contentId`, covering these
 * files. Hashing runs in the background; a failure is logged, never thrown (publishing must not break).
 */
export async function recordCreatorAgreement(contentId: string, contentKind: string, files: ReadonlyArray<Blob>): Promise<boolean> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;
    const fileSha256: string[] = [];
    for (const f of files.slice(0, 200)) fileSha256.push(await sha256Hex(f));
    const res = await fetch('/api/legal/creator-agreement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ version: CREATOR_AGREEMENT_VERSION, contentId, contentKind, fileSha256 }),
    });
    if (!res.ok) console.warn('[creator-agreement] not recorded', res.status);
    return res.ok;
  } catch (e) {
    console.warn('[creator-agreement] not recorded', e);
    return false;
  }
}

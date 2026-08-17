// BuyToOwn — reusable ownership gate + purchase button for paid content
// (Taleo films, Lorea books). One place to check "does this uid own this work?"
// and to start the Stripe "buy to own" (or rent) checkout. Backed by the license
// spine: services/contentLicense (read) + stripeService.purchaseContent (checkout)
// → the webhook mints the "own it forever" license server-side.

import React, { useEffect, useState } from 'react';
import { Download, ShieldCheck, Lock, Loader2 } from 'lucide-react';
import { getContentLicense, type ContentKind, type ContentLicense, type LicenseGrant } from '../services/contentLicense';
import { purchaseContent } from '../services/stripeService';

export interface Ownership {
  loading: boolean;
  owned: boolean;                 // owned forever OR rental still valid
  license: ContentLicense | null;
}

/** Live ownership state for the current user + one work. Re-checks when inputs change. */
export function useOwnership(kind: ContentKind, contentId: string | undefined, uid: string | undefined): Ownership {
  const [state, setState] = useState<Ownership>({ loading: !!(uid && contentId), owned: false, license: null });
  useEffect(() => {
    let alive = true;
    if (!uid || !contentId) { setState({ loading: false, owned: false, license: null }); return; }
    setState(s => ({ ...s, loading: true }));
    getContentLicense(uid, kind, contentId).then(lic => {
      if (!alive) return;
      const owned = !!lic && (lic.expiresAt == null || lic.expiresAt > Date.now());
      setState({ loading: false, owned, license: lic });
    });
    return () => { alive = false; };
  }, [kind, contentId, uid]);
  return state;
}

interface BuyToOwnProps {
  kind: ContentKind;
  contentId: string;
  creatorUid: string;
  title?: string;
  /** Buy-to-own price in dollars (0/undefined ⇒ no buy option shown). */
  purchasePrice?: number;
  /** Optional rental price in dollars ⇒ also show a Rent button. */
  rentalPrice?: number;
  rentalWindowHrs?: number;
  delivery?: 'DOWNLOAD_OPEN' | 'PLAJAH_ONLY';
  watermark?: boolean;
  /** Current user's uid — checkout requires sign-in. */
  uid?: string;
  ownership?: Ownership;          // pass a shared useOwnership result, or omit to self-manage
  onRequestSignIn?: () => void;
  compact?: boolean;
  className?: string;
}

/**
 * Renders the right control for a paid work: an "Owned" chip when the user has a
 * license, otherwise Buy (and Rent, if priced). Gating the actual play/read is the
 * caller's job — read `ownership.owned` (via useOwnership) at the play/open handler.
 */
export const BuyToOwn: React.FC<BuyToOwnProps> = (props) => {
  const {
    kind, contentId, creatorUid, title, purchasePrice, rentalPrice, rentalWindowHrs,
    delivery, watermark, uid, onRequestSignIn, compact, className,
  } = props;
  const self = useOwnership(kind, contentId, uid);
  const own = props.ownership ?? self;
  const [busy, setBusy] = useState<LicenseGrant | null>(null);

  const start = async (grant: LicenseGrant, price: number) => {
    if (!uid) { onRequestSignIn?.(); return; }
    setBusy(grant);
    try {
      await purchaseContent({ kind, contentId, creatorUid, title, grant, price, delivery, watermark, rentalWindowHrs });
      // purchaseContent redirects to Stripe on success; if it returns, no redirect happened.
    } catch (e: any) {
      setBusy(null);
      alert(e?.message || 'Could not start checkout. Please try again.');
    }
  };

  if (own.loading) {
    return <span className={`inline-flex items-center gap-2 text-white/40 text-xs font-bold ${className || ''}`}><Loader2 size={14} className="animate-spin" /></span>;
  }

  // Already owned / rented → status chip. Playback/reading is gated by the caller.
  if (own.owned) {
    const lic = own.license;
    const isRental = lic?.grant === 'RENTAL' && lic?.expiresAt;
    const canDownload = lic?.delivery === 'DOWNLOAD_OPEN';
    return (
      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-black ${className || ''}`}>
        <ShieldCheck size={14} />
        {isRental ? 'Rented' : 'Owned'}
        {canDownload && !isRental && <span className="inline-flex items-center gap-1 text-emerald-200/70"><Download size={12} /> yours to keep</span>}
      </span>
    );
  }

  const buyable = typeof purchasePrice === 'number' && purchasePrice > 0;
  const rentable = typeof rentalPrice === 'number' && rentalPrice > 0;
  if (!buyable && !rentable) return null;

  const btn = compact
    ? 'h-9 px-4 text-xs'
    : 'h-12 px-6 text-sm';

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className || ''}`}>
      {buyable && (
        <button type="button" disabled={!!busy} onClick={() => start('PURCHASE', purchasePrice!)}
          className={`${btn} bg-small-orange hover:bg-orange-500 disabled:opacity-60 text-white font-black uppercase tracking-widest rounded-full inline-flex items-center gap-2 transition-colors shadow-lg`}>
          {busy === 'PURCHASE' ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
          Buy ${purchasePrice!.toFixed(2)}
        </button>
      )}
      {rentable && (
        <button type="button" disabled={!!busy} onClick={() => start('RENTAL', rentalPrice!)}
          className={`${btn} bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white font-black uppercase tracking-widest rounded-full inline-flex items-center gap-2 transition-colors`}>
          {busy === 'RENTAL' ? <Loader2 size={16} className="animate-spin" /> : null}
          Rent ${rentalPrice!.toFixed(2)}
        </button>
      )}
    </div>
  );
};

export default BuyToOwn;

// ArtistSupportSheet — ONE sheet for every way to back an artist from a release:
//   • Gift     — pure gift, Connect DIRECT, 0% platform fee (stripeService.giftArtist)
//   • Buy      — album / track purchase, only offered when the artist has priced it
//                (stripeService.purchaseMusic; the server reads the price, never the client)
//   • Plajah+  — a short, sincere invite; opens the existing Plajah+ landing bound to this artist
// Used by Show Mode and the album page so the copy, fee story and ownership state stay identical.

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Gift, ShoppingBag, Sparkles, ShieldCheck } from 'lucide-react';
import type { Album, Track } from '../types';
import { Button, Chip, Eyebrow } from './ui';
import { giftArtist, purchaseMusic } from '../services/stripeService';
import { useOwnership } from './BuyToOwn';

const PlajahPlusLanding = React.lazy(() => import('./PlajahPlusLanding'));

export type SupportTab = 'gift' | 'buy' | 'plus';
const AMOUNTS = [3, 5, 10, 25];

interface Props {
  album: Album;
  /** The track in focus (shared/now-playing) — offers "buy this track" when it is priced. */
  track?: Track | null;
  user?: { uid?: string } | null;
  initialTab?: SupportTab;
  /** The 30-second preview just ended — say so at the top of the Buy tab. */
  previewEnded?: boolean;
  onClose: () => void;
  onSignUp: () => void;
}

const money = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

/** What can be bought right now. Exported so callers can decide whether to show a Buy button at all. */
export function musicOffers(album: Album, track?: Track | null) {
  const albumPrice = album.price && album.price > 0 ? album.price : 0;
  const trackPrice = track?.price && track.price > 0 ? track.price : 0;
  return { albumPrice, trackPrice, any: albumPrice > 0 || trackPrice > 0 };
}

const ArtistSupportSheet: React.FC<Props> = ({ album, track, user, initialTab = 'gift', previewEnded, onClose, onSignUp }) => {
  const offers = useMemo(() => musicOffers(album, track), [album, track]);
  const [tab, setTab] = useState<SupportTab>(initialTab === 'buy' && !offers.any ? 'gift' : initialTab);
  const [amount, setAmount] = useState(5);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showPlus, setShowPlus] = useState(false);

  const albumOwn = useOwnership('album', album.id, user?.uid);
  const trackOwn = useOwnership('track', track ? `${album.id}__${track.id}` : undefined, user?.uid);

  const artist = album.artist || 'the artist';
  const owner = album.ownerId;
  const finalAmount = custom ? Number(custom) : amount;
  const amountOk = Number.isFinite(finalAmount) && finalAmount >= 1 && finalAmount <= 500;

  const run = async (key: string, fn: () => Promise<void>) => {
    if (!user?.uid) { onSignUp(); return; }
    setBusy(key); setError('');
    try { await fn(); } // redirects to Stripe on success
    catch (e: any) { setError(e?.message || 'Payment could not be started. Try again.'); setBusy(null); }
  };

  const tabs: [SupportTab, string][] = [['gift', 'Gift'], ...(offers.any ? [['buy', 'Buy'] as [SupportTab, string]] : []), ['plus', 'Plajah+']];

  return createPortal(
    <div className="fixed inset-0 z-[9100] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-label={`Support ${artist}`} onClick={e => e.stopPropagation()}
        className="pj-surface pj-surface--5 pj-surface--sheet relative w-full sm:max-w-[520px] max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-b-[28px] p-6"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose} className="absolute top-3 right-3"><X /></Button>

        <div className="flex gap-1.5 mb-4 pr-10">
          {tabs.map(([k, label]) => <Chip key={k} interactive selected={tab === k} onClick={() => { setTab(k); setError(''); }}>{label}</Chip>)}
        </div>

        {tab === 'gift' && (
          <>
            <Eyebrow>Support the artist</Eyebrow>
            <h3 className="type-headline-sm font-black mt-1 mb-4">{artist}</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {AMOUNTS.map(a => <Chip key={a} interactive selected={!custom && amount === a} onClick={() => { setAmount(a); setCustom(''); }}>{money(a)}</Chip>)}
              <input aria-label="Other amount in dollars" inputMode="decimal" placeholder="Other" value={custom}
                onChange={e => setCustom(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))}
                className="pj-chip w-24 text-center bg-transparent" />
            </div>
            <p className="text-sm text-white/55 mb-5">100% goes straight to the artist. You'll finish on a secure Stripe checkout.</p>
            <div className="pj-actions">
              <Button variant="primary" size="lg" icon={<Gift />} loading={busy === 'gift'} disabled={!amountOk || !owner}
                onClick={() => run('gift', () => giftArtist({ creatorId: owner!, amount: finalAmount, albumId: album.id, title: album.title, artistName: album.artist }))}>
                Send {amountOk ? money(finalAmount) : ''} gift
              </Button>
              {offers.any && <Button variant="secondary" size="lg" onClick={() => setTab('buy')}>Buy instead</Button>}
            </div>
            {!owner && <p className="text-xs text-white/40 mt-3">This release can't receive gifts yet.</p>}
          </>
        )}

        {tab === 'buy' && (
          <>
            <Eyebrow>{previewEnded ? 'Preview over' : 'Own it'}</Eyebrow>
            <h3 className="type-headline-sm font-black mt-1 mb-4">{previewEnded ? 'Want to hear the rest?' : 'Buy from the artist'}</h3>
            {offers.trackPrice > 0 && track && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 mb-2">
                <span className="min-w-0 truncate">{track.title} <span className="text-white/40">· this track</span></span>
                {trackOwn.owned
                  ? <span className="flex items-center gap-1 text-emerald-300 text-xs font-black"><ShieldCheck size={14} /> Owned</span>
                  : <Button variant="accent" size="sm" icon={<ShoppingBag />} loading={busy === 'track'}
                      onClick={() => run('track', () => purchaseMusic({ kind: 'track', albumId: album.id, trackId: track.id, title: track.title }))}>{money(offers.trackPrice)}</Button>}
              </div>
            )}
            {offers.albumPrice > 0 && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 mb-2">
                <span className="min-w-0 truncate">{album.title} <span className="text-white/40">· full album{album.tracks?.length ? ` · ${album.tracks.length} tracks` : ''}</span></span>
                {albumOwn.owned
                  ? <span className="flex items-center gap-1 text-emerald-300 text-xs font-black"><ShieldCheck size={14} /> Owned</span>
                  : <Button variant="accent" size="sm" icon={<ShoppingBag />} loading={busy === 'album'}
                      onClick={() => run('album', () => purchaseMusic({ kind: 'album', albumId: album.id, title: album.title }))}>{money(offers.albumPrice)}</Button>}
              </div>
            )}
            <p className="text-sm text-white/55 mt-3 mb-4">Streaming stays free. Buying means you own it: it joins your library and you can download it to your device. Paid to the artist through Stripe.</p>
            <Button variant="secondary" size="md" fullWidth onClick={() => setTab('gift')}>Or send a gift instead</Button>
          </>
        )}

        {tab === 'plus' && (
          <>
            <Eyebrow>Plajah+ · An invite</Eyebrow>
            <h3 className="type-headline-sm font-black mt-1 mb-3">Help {artist} keep making music</h3>
            <p className="text-base leading-relaxed text-white/70 mb-5">
              Plajah+ is how we keep creators paid fairly. At least 60% of your membership goes straight to the artist you pick, starting with {artist}. If this music moved you, it is the most lasting way to say thanks.
            </p>
            <div className="pj-actions">
              <Button variant="primary" size="lg" icon={<Sparkles />} onClick={() => setShowPlus(true)}>Join Plajah+ from $4.99</Button>
              <Button variant="secondary" size="lg" onClick={() => setTab('gift')}>Just send a gift</Button>
            </div>
          </>
        )}

        {error && <p role="alert" className="text-sm mt-4" style={{ color: 'var(--pj-danger)' }}>{error}</p>}
      </div>

      {showPlus && (
        <React.Suspense fallback={null}>
          <div className="fixed inset-0 z-[9200]" onClick={e => e.stopPropagation()}>
            <PlajahPlusLanding onClose={() => setShowPlus(false)} defaultCreatorId={owner} defaultCreatorName={artist} />
          </div>
        </React.Suspense>
      )}
    </div>,
    document.body,
  );
};

export default ArtistSupportSheet;

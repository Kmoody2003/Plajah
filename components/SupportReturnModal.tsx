// SupportReturnModal — what the listener sees when they come back from Stripe.
//   gift     → a real thank-you that names the artist.
//   purchase → "it's yours": waits for the licence the webhook mints, refreshes the player's
//              ownership cache, then offers (or, when the device already allows it, performs) the
//              download. The tracks are also in the buyer's private locker (added server-side).

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Check, Download, FolderOpen } from 'lucide-react';
import type { Album } from '../types';
import { Button, Eyebrow } from './ui';
import { loadOwnedMusic, ownsRelease } from './../services/musicAccess';
import { downloadRelease, hasSilentFolderAccess, canPickFolder, type DownloadResult } from '../services/musicDownload';

export type ReturnInfo =
  | { mode: 'gift'; artist: string; title: string; amount: number }
  | { mode: 'purchase'; album: Album; kind: 'album' | 'track'; trackId?: string };

const Shell: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => createPortal(
  <div className="fixed inset-0 z-[9300] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
    <div role="dialog" onClick={e => e.stopPropagation()}
      className="pj-surface pj-surface--5 pj-surface--sheet w-full max-w-[460px] p-7 text-center">
      {children}
    </div>
  </div>, document.body);

const GiftThanks: React.FC<{ info: Extract<ReturnInfo, { mode: 'gift' }>; onClose: () => void }> = ({ info, onClose }) => (
  <Shell onClose={onClose}>
    <div className="mx-auto mb-4 w-16 h-16 rounded-full grid place-items-center" style={{ background: 'var(--pj-grad-warm)', boxShadow: 'var(--pj-glow-brand)' }}>
      <Heart size={28} fill="currentColor" />
    </div>
    <Eyebrow>Gift sent</Eyebrow>
    <h3 className="type-headline-sm font-black mt-1 mb-3">Thank you{info.artist ? ` for backing ${info.artist}` : ''}</h3>
    <p className="text-base leading-relaxed text-white/70 mb-6">
      {info.amount ? `Your $${info.amount % 1 === 0 ? info.amount.toFixed(0) : info.amount.toFixed(2)} gift is on its way` : 'Your gift is on its way'}
      {info.artist ? ` to ${info.artist}` : ''}, and all of it goes to them. Gifts like yours are what let artists keep making things. We're glad you were there to hear it.
    </p>
    <Button variant="primary" size="lg" fullWidth onClick={onClose}>Keep listening</Button>
  </Shell>
);

const PurchaseDone: React.FC<{ info: Extract<ReturnInfo, { mode: 'purchase' }>; onClose: () => void; uid?: string }> = ({ info, onClose, uid }) => {
  const { album, kind, trackId } = info;
  const [state, setState] = useState<'confirming' | 'ready' | 'slow'>('confirming');
  const [prog, setProg] = useState<{ done: number; total: number; current?: string } | null>(null);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const autoRan = useRef(false);

  const tracks = kind === 'track' ? (album.tracks || []).filter(t => t.id === trackId) : (album.tracks || []);
  const label = kind === 'track' ? (tracks[0]?.title || album.title) : album.title;

  // The licence is minted by the Stripe webhook a moment after checkout — poll for it.
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < 10 && alive; i++) {
        await loadOwnedMusic(uid, true);
        if (ownsRelease(album.id, trackId)) { if (alive) setState('ready'); return; }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (alive) setState('slow');
    })();
    return () => { alive = false; };
  }, [uid, album.id, trackId]);

  const run = async (interactive: boolean) => {
    setBusy(true);
    const r = await downloadRelease(album, tracks, { interactive, onProgress: setProg });
    setResult(r); setBusy(false);
  };

  // If this device already lets us write to the Music folder (Android app, or a desktop folder the
  // user chose before), save automatically — no click needed.
  useEffect(() => {
    if (state !== 'ready' || autoRan.current) return;
    autoRan.current = true;
    hasSilentFolderAccess().then(ok => { if (ok) run(false); });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const where = result?.target === 'android-music' ? 'your Music folder (Plajah)' : result?.target === 'folder' ? `your Music folder${result.folderName ? ` (${result.folderName})` : ''}` : 'your downloads';

  return (
    <Shell onClose={onClose}>
      <div className="mx-auto mb-4 w-16 h-16 rounded-full grid place-items-center" style={{ background: state === 'ready' ? 'var(--pj-grad-warm)' : 'var(--pj-glass-3)' }}>
        <Check size={28} />
      </div>
      <Eyebrow>{state === 'confirming' ? 'Confirming your purchase' : 'It\'s yours'}</Eyebrow>
      <h3 className="type-headline-sm font-black mt-1 mb-3">{label}</h3>
      {state === 'confirming' && <p className="text-white/60 mb-2">One moment while the artist's payment clears.</p>}
      {state === 'slow' && <p className="text-white/70 mb-4">Your payment went through, but it is taking a little longer to show up. It will appear in your library shortly. You can close this.</p>}
      {state === 'ready' && !result && (
        <>
          <p className="text-base leading-relaxed text-white/70 mb-5">
            {kind === 'album' ? 'The whole album' : 'This track'} now plays in full and is in your library on every device. Save a copy to this one?
          </p>
          <div className="pj-actions" style={{ justifyContent: 'stretch' }}>
            <Button variant="primary" size="lg" icon={canPickFolder() ? <FolderOpen /> : <Download />} loading={busy} onClick={() => run(true)}>
              {canPickFolder() ? 'Save to my Music folder' : 'Download'}
            </Button>
            <Button variant="secondary" size="lg" onClick={onClose}>Not now</Button>
          </div>
          {busy && prog && <p className="text-xs text-white/50 mt-3">Saving {prog.done + 1} of {prog.total}{prog.current ? ` · ${prog.current}` : ''}</p>}
        </>
      )}
      {result && (
        <>
          <p className="text-base leading-relaxed text-white/70 mb-5">
            {result.saved > 0 ? `Saved ${result.saved} ${result.saved === 1 ? 'track' : 'tracks'} to ${where}.` : 'Nothing was saved.'}
            {result.failed.length > 0 && ` ${result.failed.length} could not be downloaded; you can retry from your library.`}
          </p>
          <Button variant="primary" size="lg" fullWidth onClick={onClose}>Start listening</Button>
        </>
      )}
    </Shell>
  );
};

const SupportReturnModal: React.FC<{ info: ReturnInfo; uid?: string; onClose: () => void }> = ({ info, uid, onClose }) =>
  info.mode === 'gift' ? <GiftThanks info={info} onClose={onClose} /> : <PurchaseDone info={info} uid={uid} onClose={onClose} />;

export default SupportReturnModal;

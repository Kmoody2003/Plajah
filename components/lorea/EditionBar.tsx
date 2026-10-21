// The reader's edition control: which version they're reading, what changed, a way back to the version they
// bought (or any earlier one they own), and a paid-upgrade offer for a newer edition. Same for the classic
// (vault) reader and the Tela reader — both get their facts from services/bookEditions/policy.ts.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Loader2, Sparkles, X } from 'lucide-react';
import { describeVersion, type BookVersionStamp, type EditionInfo, type EditionRegistry } from '../../services/bookEditions/policy';
import { setPreferredVersion } from '../../services/bookEditions/readerPrefs';
import { purchaseContent } from '../../services/stripeService';

interface Props {
  bookId: string;
  bookTitle?: string;
  creatorUid?: string;
  registry?: EditionRegistry;
  version: BookVersionStamp | null;
  followLatest: boolean;
  readable: BookVersionStamp[];
  purchased?: BookVersionStamp | null;
  upgradeOffer?: EditionInfo | null;
}

const when = (t: number) => { try { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };

const EditionBar: React.FC<Props> = ({ bookId, bookTitle, creatorUid, registry, version, followLatest, readable, purchased, upgradeOffer }) => {
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  if (!version || (readable.length < 2 && !upgradeOffer)) return null;
  const latest = readable[0];
  const pick = (v: BookVersionStamp | null) => { setPreferredVersion(bookId, v && v.versionId !== latest?.versionId ? v.versionId : null); setOpen(false); };
  const upgrade = async () => {
    if (!upgradeOffer) return;
    setBuying(true);
    try {
      await purchaseContent({ kind: 'book', contentId: bookId, creatorUid: creatorUid || '', title: bookTitle, price: upgradeOffer.upgradePrice || 0, upgradeEdition: upgradeOffer.number });
    } catch (e: any) { setBuying(false); alert(e?.message || 'Could not start the upgrade.'); }
  };

  return createPortal(
    <div className="fixed left-3 bottom-20 sm:bottom-6 z-[95] max-w-[calc(100vw-24px)]">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-black/70 backdrop-blur border border-white/15 text-white/85 text-[11px] font-bold shadow-xl hover:bg-black/85">
          {upgradeOffer ? <Sparkles size={14} className="text-amber-300" /> : <History size={14} />}
          {describeVersion(version, registry)}{followLatest ? '' : ' · earlier version'}
        </button>
      ) : (
        <div role="dialog" aria-label="Book versions" className="w-[340px] max-w-full rounded-2xl bg-[#0e0b14]/95 backdrop-blur border border-white/15 shadow-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Versions you own</p>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-white/10" aria-label="Close"><X size={14} /></button>
          </div>
          <p className="text-[11px] text-white/55 mb-3 leading-snug">
            {followLatest ? 'You get the author’s corrections and updates automatically.' : 'You are reading an earlier version. Switch back to get updates again.'}
          </p>
          <ul className="space-y-1 max-h-60 overflow-y-auto">
            {readable.map((v, i) => {
              const active = v.versionId === version.versionId;
              return (
                <li key={v.versionId}>
                  <button type="button" onClick={() => pick(i === 0 ? null : v)} aria-pressed={active}
                    className={`w-full text-left rounded-xl px-3 py-2 border ${active ? 'border-small-orange bg-small-orange/10' : 'border-transparent hover:bg-white/5'}`}>
                    <span className="block text-xs font-bold">
                      {describeVersion(v, registry)}
                      {i === 0 && <span className="ml-1 text-emerald-300">· latest</span>}
                      {purchased?.versionId === v.versionId && <span className="ml-1 text-amber-300">· the version you bought</span>}
                    </span>
                    <span className="block text-[10px] text-white/45">{when(v.createdAt)}{v.notes ? ` — ${v.notes}` : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {upgradeOffer && (
            <button type="button" disabled={buying} onClick={upgrade}
              className="mt-3 w-full h-10 rounded-full bg-small-orange hover:bg-orange-500 disabled:opacity-60 text-white text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2">
              {buying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Upgrade to {upgradeOffer.label || `Edition ${upgradeOffer.number}`} · ${(upgradeOffer.upgradePrice || 0).toFixed(2)}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default EditionBar;

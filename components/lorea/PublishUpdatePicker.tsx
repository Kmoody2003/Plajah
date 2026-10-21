// "What kind of update is this?" — shown when an author republishes a book readers have already bought.
// Corrections and updates reach every buyer of the current edition automatically; a new edition is a free or
// paid upgrade (services/bookEditions/policy.ts). Used by the book editor (AlbumCreator) and the Tela panel.
import React from 'react';
import type { PublishUpdate } from '../../services/bookEditions/policy';

interface Props {
  value: PublishUpdate;
  onChange: (next: PublishUpdate) => void;
  currentEdition: number;
  /** The book's own price, used as the suggested upgrade price. */
  bookPrice?: number;
  className?: string;
}

const KINDS: Array<{ id: PublishUpdate['kind']; title: string; hint: string }> = [
  { id: 'CORRECTION', title: 'Correction', hint: 'Typos and fixes. Every buyer gets it automatically.' },
  { id: 'MINOR', title: 'Update', hint: 'New or revised material within this edition. Every buyer gets it automatically.' },
  { id: 'NEW_EDITION', title: 'New edition', hint: 'A substantial revision. You choose whether current owners get it free or pay to upgrade.' },
];

const PublishUpdatePicker: React.FC<Props> = ({ value, onChange, currentEdition, bookPrice, className }) => {
  const set = (patch: Partial<PublishUpdate>) => onChange({ ...value, ...patch });
  const input = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30';
  return (
    <fieldset className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 ${className || ''}`}>
      <legend className="px-1 text-[10px] font-black uppercase tracking-widest text-white/50">Readers own this book — what are you publishing?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map(k => (
          <button key={k.id} type="button" aria-pressed={value.kind === k.id} onClick={() => set({ kind: k.id })}
            className={`text-left rounded-xl border p-3 transition-colors ${value.kind === k.id ? 'border-small-orange bg-small-orange/10' : 'border-white/10 hover:border-white/25'}`}>
            <span className="block text-sm font-bold text-white">{k.title}{k.id === 'NEW_EDITION' ? ` (edition ${currentEdition + 1})` : ''}</span>
            <span className="block text-[11px] leading-snug text-white/55 mt-1">{k.hint}</span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-[11px] font-bold text-white/60">What changed (readers see this)</span>
        <textarea rows={2} maxLength={600} value={value.notes || ''} onChange={e => set({ notes: e.target.value })} className={`${input} mt-1`} placeholder="Fixed chapter 3 dates; new afterword." />
      </label>
      {value.kind === 'NEW_EDITION' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-bold text-white/60">Edition name (optional)</span>
            <input value={value.editionLabel || ''} maxLength={80} onChange={e => set({ editionLabel: e.target.value })} className={`${input} mt-1`} placeholder={`Edition ${currentEdition + 1}`} />
          </label>
          <div>
            <span className="text-[11px] font-bold text-white/60">Current owners</span>
            <div className="mt-1 flex gap-2">
              <button type="button" aria-pressed={value.upgrade !== 'PAID'} onClick={() => set({ upgrade: 'FREE', upgradePrice: undefined })}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${value.upgrade !== 'PAID' ? 'border-small-orange text-white' : 'border-white/10 text-white/50'}`}>Get it free</button>
              <button type="button" aria-pressed={value.upgrade === 'PAID'} onClick={() => set({ upgrade: 'PAID', upgradePrice: value.upgradePrice || Math.max(0.99, Math.round((bookPrice || 4.99) * 50) / 100) })}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${value.upgrade === 'PAID' ? 'border-small-orange text-white' : 'border-white/10 text-white/50'}`}>Pay to upgrade</button>
            </div>
            {value.upgrade === 'PAID' && (
              <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
                Upgrade price $
                <input type="number" min={0.99} max={200} step={0.01} value={value.upgradePrice ?? ''} onChange={e => set({ upgradePrice: parseFloat(e.target.value) || undefined })} className={`${input} w-24`} />
              </label>
            )}
          </div>
        </div>
      )}
      <p className="text-[11px] text-white/45 leading-snug">
        Every published version is kept. Readers can always switch back to the version they bought. New buyers get the newest edition.
      </p>
    </fieldset>
  );
};

export default PublishUpdatePicker;

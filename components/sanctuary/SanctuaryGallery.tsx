import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Lock, Trash2, Play, Volume2 } from 'lucide-react';
import { SanctuaryGalleryItem, SanctuaryMembership } from '../../types';
import {
  listenToSanctuaryGallery, addSanctuaryGalleryItem, deleteSanctuaryGalleryItem, hasAccess,
} from '../../services/sanctuaryService';
import { purchaseSanctuaryUnlock } from '../../services/stripeService';
import { uploadFile } from '../../services/backendService';
import { auth } from '../../services/firebase';
import { SANCTUARY_THEME, SanctuaryLockChip, SanctuaryPriceTag } from './SanctuaryIdentity';

interface Props {
  sanctuaryId: string;
  isOwner?: boolean;
  membership?: SanctuaryMembership | null;
  purchasedIds: Set<string>;
  onPurchased: (id: string) => void;
}

const kindOf = (file: File): SanctuaryGalleryItem['type'] =>
  file.type.startsWith('video') ? 'VIDEO' : file.type.startsWith('audio') ? 'AUDIO' : 'PHOTO';

const SanctuaryGallery: React.FC<Props> = ({ sanctuaryId, isOwner, membership, purchasedIds, onPurchased }) => {
  const [items, setItems] = useState<SanctuaryGalleryItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [unlocking, setUnlocking] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => listenToSanctuaryGallery(sanctuaryId, setItems), [sanctuaryId]);

  const ctx = { isOwner, membership, purchasedItemIds: purchasedIds };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(`sanctuaries/${sanctuaryId}/gallery/${Date.now()}_${file.name}`, file);
      await addSanctuaryGalleryItem({ sanctuaryId, url, type: kindOf(file), title: file.name, accessType: 'TIER', requiredTierIds: [] });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const unlock = async (it: SanctuaryGalleryItem) => {
    setUnlocking(it.id);
    try { await purchaseSanctuaryUnlock({ creatorId: sanctuaryId, itemId: it.id, itemType: 'CONTENT', itemTitle: it.title, price: it.oneTimePrice || 0 }); }
    catch { setUnlocking(''); }
  };

  return (
    <div className="space-y-4">
      {isOwner && (
        <>
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <ImagePlus size={14} style={{ color: SANCTUARY_THEME.gold }} /> {uploading ? 'Uploading…' : 'Add to the vault'}
          </button>
        </>
      )}

      {items.length === 0 ? (
        <div className="py-16 text-center">
          <ImagePlus size={30} className="mx-auto mb-3" style={{ color: 'rgba(201,165,92,0.3)' }} />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/25">The vault is empty</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map(it => {
            const open = hasAccess({ accessType: it.accessType, requiredTierIds: it.requiredTierIds }, it.id, ctx);
            return (
              <div key={it.id} className="relative rounded-2xl overflow-hidden aspect-square group" style={{ border: `1px solid ${SANCTUARY_THEME.line}` }}>
                {open ? (
                  it.type === 'PHOTO'
                    ? <img src={it.url} className="w-full h-full object-cover" alt={it.title || ''} loading="lazy" />
                    : it.type === 'VIDEO'
                      ? <video src={it.url} className="w-full h-full object-cover" muted playsInline controls />
                      : <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/50"><Volume2 size={22} style={{ color: SANCTUARY_THEME.gold }} /><audio src={it.url} controls className="w-[90%] h-8" /></div>
                ) : (
                  <button onClick={() => it.accessType === 'ONE_TIME' && unlock(it)} disabled={unlocking === it.id}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(12,10,13,0.85)' }}>
                    {it.thumbnailUrl && <img src={it.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover opacity-25" alt="" />}
                    <Lock size={20} style={{ color: SANCTUARY_THEME.gold }} className="relative" />
                    <span className="relative text-[9px] font-black uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft }}>
                      {it.accessType === 'ONE_TIME' ? (unlocking === it.id ? 'Unlocking…' : `Unlock · $${it.oneTimePrice}`) : 'Members'}
                    </span>
                  </button>
                )}
                <div className="absolute top-2 left-2">
                  {it.accessType === 'ONE_TIME' ? <SanctuaryPriceTag price={it.oneTimePrice} /> : it.accessType === 'FREE' ? <SanctuaryPriceTag tier="Free" /> : <SanctuaryLockChip text="Members" />}
                </div>
                {open && it.type !== 'PHOTO' && <div className="absolute bottom-2 right-2 opacity-70"><Play size={14} className="text-white" /></div>}
                {isOwner && (
                  <button onClick={() => deleteSanctuaryGalleryItem(it.id)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white/60 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SanctuaryGallery;

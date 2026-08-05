import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Lock, Send, Trash2, Globe, Gem, DollarSign, ImagePlus, X } from 'lucide-react';
import { SanctuaryPost, SanctuaryMembership, SanctuaryTier, SanctuaryAccessType } from '../../types';
import {
  listenToSanctuaryPosts, createSanctuaryPost, likeSanctuaryPost, deleteSanctuaryPost,
  hasAccess,
} from '../../services/sanctuaryService';
import { purchaseSanctuaryUnlock } from '../../services/stripeService';
import { uploadFile } from '../../services/backendService';
import { auth } from '../../services/firebase';
import { SANCTUARY_THEME, SanctuaryLockChip, SanctuaryPriceTag } from './SanctuaryIdentity';

interface Props {
  sanctuaryId: string;
  isOwner?: boolean;
  membership?: SanctuaryMembership | null;
  tiers?: SanctuaryTier[];
  purchasedIds: Set<string>;
  onPurchased: (itemId: string) => void;
}

const ACCESS_LABEL: Record<SanctuaryAccessType, string> = { FREE: 'Everyone', TIER: 'Members', ONE_TIME: 'Paid' };

const SanctuaryFeed: React.FC<Props> = ({ sanctuaryId, isOwner, membership, purchasedIds, onPurchased }) => {
  const [posts, setPosts] = useState<SanctuaryPost[]>([]);
  const [text, setText] = useState('');
  const [access, setAccess] = useState<SanctuaryAccessType>('TIER');
  const [price, setPrice] = useState(3);
  const [posting, setPosting] = useState(false);
  const [unlocking, setUnlocking] = useState('');
  const [media, setMedia] = useState<{ url: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => listenToSanctuaryPosts(sanctuaryId, setPosts), [sanctuaryId]);

  const ctx = useMemo(() => ({ isOwner, membership, purchasedItemIds: purchasedIds }), [isOwner, membership, purchasedIds]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(`sanctuaries/${sanctuaryId}/posts/${Date.now()}_${file.name}`, file);
      setMedia({ url, type: file.type.startsWith('video') ? 'VIDEO' : 'PHOTO' });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const submit = async () => {
    if ((!text.trim() && !media) || posting) return;
    setPosting(true);
    try {
      await createSanctuaryPost({
        sanctuaryId, content: text.trim(), accessType: access,
        ...(media ? { attachments: [{ type: media.type, url: media.url }] } : {}),
        ...(access === 'TIER' ? { requiredTierIds: [] } : {}),
        ...(access === 'ONE_TIME' ? { oneTimePrice: price } : {}),
      });
      setText(''); setMedia(null);
    } finally { setPosting(false); }
  };

  const unlock = async (p: SanctuaryPost) => {
    setUnlocking(p.id);
    try {
      // Stripe Checkout; the webhook records the purchase and access unlocks on return.
      await purchaseSanctuaryUnlock({ creatorId: sanctuaryId, itemId: p.id, itemType: 'POST', itemTitle: 'Sanctuary post', price: p.oneTimePrice || 0 });
    } catch { setUnlocking(''); }
  };

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="rounded-2xl p-4" style={{ background: SANCTUARY_THEME.panel, border: `1px solid ${SANCTUARY_THEME.line}` }}>
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder="Share with your sanctuary — a secret, a preview, a drop…"
            rows={3}
            className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-white/25"
          />
          {media && (
            <div className="relative inline-block mt-1 rounded-xl overflow-hidden border border-white/10">
              {media.type === 'VIDEO'
                ? <video src={media.url} className="h-24 w-auto object-cover" muted />
                : <img src={media.url} className="h-24 w-auto object-cover" alt="" />}
              <button onClick={() => setMedia(null)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"><X size={10} /></button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/8 mt-2">
            <div className="flex items-center gap-1.5">
              <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/45 hover:text-white border border-white/10 disabled:opacity-50" title="Attach media">
                <ImagePlus size={13} />
              </button>
              {(['FREE', 'TIER', 'ONE_TIME'] as SanctuaryAccessType[]).map(a => (
                <button key={a} onClick={() => setAccess(a)}
                  className="px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
                  style={access === a
                    ? { color: '#000', background: SANCTUARY_THEME.gold }
                    : { color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {a === 'FREE' ? <Globe size={9} /> : a === 'TIER' ? <Gem size={9} /> : <DollarSign size={9} />}
                  {ACCESS_LABEL[a]}
                </button>
              ))}
              {access === 'ONE_TIME' && (
                <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-black/40 border border-white/10">
                  <span className="text-white/40 text-xs">$</span>
                  <input type="number" min={1} value={price} onChange={e => setPrice(Number(e.target.value))}
                    className="w-10 bg-transparent text-xs outline-none tabular-nums" />
                </div>
              )}
            </div>
            <button onClick={submit} disabled={(!text.trim() && !media) || posting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-30"
              style={{ background: SANCTUARY_THEME.gold }}>
              <Send size={11} /> Post
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="py-16 text-center">
          <Gem size={30} className="mx-auto mb-3" style={{ color: 'rgba(201,165,92,0.3)' }} />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Nothing posted yet</p>
        </div>
      ) : posts.map(p => {
        const unlocked = hasAccess({ accessType: p.accessType, requiredTierIds: p.requiredTierIds }, p.id, ctx);
        const liked = !!uid && p.likes?.includes(uid);
        return (
          <div key={p.id} className="rounded-2xl p-4" style={{ background: 'rgba(23,18,22,0.6)', border: `1px solid ${unlocked ? 'rgba(255,255,255,0.08)' : SANCTUARY_THEME.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <img src={p.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.authorId}`} className="w-7 h-7 rounded-full border border-white/10" alt="" />
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide">{p.authorName}</p>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest">{new Date(p.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
              {p.accessType === 'FREE'
                ? <SanctuaryPriceTag tier="Free" />
                : p.accessType === 'ONE_TIME'
                  ? <SanctuaryPriceTag price={p.oneTimePrice} />
                  : <SanctuaryLockChip text="Members" />}
            </div>

            {unlocked ? (
              <>
                {p.content && <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{p.content}</p>}
                {p.attachments?.map((a, i) => (
                  <div key={i} className="mt-2 rounded-xl overflow-hidden border border-white/10">
                    {a.type === 'VIDEO'
                      ? <video src={a.url} controls playsInline className="w-full max-h-[420px] object-contain bg-black" />
                      : <img src={a.url} className="w-full max-h-[420px] object-cover" alt={a.title || ''} loading="lazy" />}
                  </div>
                ))}
              </>
            ) : (
              <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(0,0,0,0.4)', border: `1px dashed ${SANCTUARY_THEME.line}` }}>
                <Lock size={20} className="mx-auto mb-2" style={{ color: SANCTUARY_THEME.gold }} />
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: SANCTUARY_THEME.goldSoft }}>
                  {p.accessType === 'ONE_TIME' ? 'Unlock this post' : 'Members-only'}
                </p>
                {p.accessType === 'ONE_TIME' ? (
                  <button onClick={() => unlock(p)} disabled={unlocking === p.id}
                    className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40"
                    style={{ background: SANCTUARY_THEME.gold }}>
                    {unlocking === p.id ? 'Unlocking…' : `Unlock · $${p.oneTimePrice}`}
                  </button>
                ) : (
                  <p className="text-[9px] text-white/30 uppercase tracking-widest">Join a tier to read</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 mt-3 pt-2 border-t border-white/6">
              <button onClick={() => uid && likeSanctuaryPost(p.id, !liked)}
                className={`flex items-center gap-1.5 text-[10px] font-bold ${liked ? 'text-rose-400' : 'text-white/35 hover:text-white'}`}>
                <Heart size={13} fill={liked ? 'currentColor' : 'none'} /> {p.likes?.length || 0}
              </button>
              {isOwner && (
                <button onClick={() => deleteSanctuaryPost(p.id)} className="text-white/25 hover:text-rose-400 ml-auto"><Trash2 size={13} /></button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SanctuaryFeed;

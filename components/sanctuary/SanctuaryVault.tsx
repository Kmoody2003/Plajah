import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Lock, Play, Video, Music, FileText, Radio, Download, Gem, Check, Sparkles,
} from 'lucide-react';
import { SanctuaryExclusiveContent, SanctuaryMembership, SanctuaryContentKind } from '../../types';
import { listenToExclusiveContent, hasAccess } from '../../services/sanctuaryService';
import { purchaseSanctuaryUnlock } from '../../services/stripeService';
import { SANCTUARY_THEME } from './SanctuaryIdentity';
import SanctuaryGallery from './SanctuaryGallery';

// ── Membership Home · The Vault ─────────────────────────────────────────────────
// The creator's gated content as a grid. Each item shows a kind badge and one of
// three lock states: à-la-carte price (ONE_TIME), "included with membership" (TIER),
// or "free preview" (FREE). Reuses hasAccess + the existing Stripe unlock flow, and
// embeds the existing media-wall gallery below.

const KIND_ICON: Record<SanctuaryContentKind, React.FC<any>> = {
  VIDEO: Video, AUDIO: Music, POST: FileText, ARTICLE: FileText, LIVE: Radio, DOWNLOAD: Download,
  PLAYLIST: Music, REMIX: Music, BOOK: FileText, FILM: Video, DELETED_SCENE: Video, BTS: Video,
  GAME: FileText, WHITEPAPER: FileText, RESEARCH: FileText, CONVERSATION: FileText, COLLAB: Music, LIVESTREAM: Radio,
};

interface Props {
  sanctuaryId: string;
  isOwner?: boolean;
  membership: SanctuaryMembership | null;
  purchasedIds: Set<string>;
  onPurchased: (id: string) => void;
}

const SanctuaryVault: React.FC<Props> = ({ sanctuaryId, isOwner, membership, purchasedIds, onPurchased }) => {
  const [content, setContent] = useState<SanctuaryExclusiveContent[]>([]);
  const [unlocking, setUnlocking] = useState('');

  useEffect(() => listenToExclusiveContent(sanctuaryId, setContent), [sanctuaryId]);

  const ctx = useMemo(() => ({ isOwner, membership, purchasedItemIds: purchasedIds }), [isOwner, membership, purchasedIds]);

  const unlock = async (item: SanctuaryExclusiveContent) => {
    setUnlocking(item.id);
    try {
      // Existing Stripe Checkout; webhook records the purchase, access unlocks on return.
      await purchaseSanctuaryUnlock({ creatorId: sanctuaryId, itemId: item.id, itemType: 'CONTENT', itemTitle: item.title, price: item.oneTimePrice || 0 });
    } catch { setUnlocking(''); }
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl md:text-3xl font-black italic tracking-tight" style={{ color: SANCTUARY_THEME.goldSoft }}>The Vault</h2>
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{content.length} item{content.length !== 1 ? 's' : ''}</span>
        </div>

        {content.length === 0 ? (
          <div className="py-16 text-center rounded-3xl" style={{ background: SANCTUARY_THEME.panel, border: `1px dashed ${SANCTUARY_THEME.line}` }}>
            <Gem size={30} className="mx-auto mb-3" style={{ color: 'rgba(201,165,92,0.3)' }} />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/25">The vault is still being filled</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {content.map(item => {
              const Icon = KIND_ICON[item.type] || FileText;
              const unlocked = hasAccess({ accessType: item.accessType, requiredTierIds: item.requiredTierIds, isPublicPreview: item.isPublicPreview }, item.id, ctx);
              const type = item.accessType || (item.isPublicPreview ? 'FREE' : 'TIER');

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                  className="relative rounded-2xl overflow-hidden group border"
                  style={{ borderColor: unlocked ? 'rgba(255,255,255,0.08)' : SANCTUARY_THEME.line, background: 'rgba(23,18,22,0.6)' }}
                >
                  <div className="aspect-video bg-black/40 relative overflow-hidden">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className={`w-full h-full object-cover transition-all duration-500 ${unlocked ? 'group-hover:scale-105' : 'grayscale opacity-40'}`} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Icon size={30} className="text-white/10" /></div>
                    )}

                    {/* Kind badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-lg flex items-center gap-1">
                      <Icon size={9} className="text-white/60" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{item.type.replace('_', ' ')}</span>
                    </div>

                    {unlocked ? (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                          <Play size={18} className="text-white" fill="white" />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => type === 'ONE_TIME' && unlock(item)}
                        disabled={unlocking === item.id}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/62 backdrop-blur-sm disabled:opacity-70"
                      >
                        <Lock size={22} style={{ color: SANCTUARY_THEME.gold }} />
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft }}>
                          {type === 'ONE_TIME'
                            ? (unlocking === item.id ? 'Unlocking…' : `Unlock · $${item.oneTimePrice}`)
                            : 'Members only'}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="p-3">
                    <h4 className="text-[11px] font-black uppercase tracking-wider truncate mb-1">{item.title}</h4>
                    {/* Access status line */}
                    {type === 'FREE' || item.isPublicPreview ? (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-white/40">
                        <Sparkles size={9} style={{ color: SANCTUARY_THEME.gold }} /> Free preview
                      </span>
                    ) : type === 'ONE_TIME' ? (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft }}>
                        À la carte · ${item.oneTimePrice}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-white/40">
                        {unlocked ? <><Check size={9} style={{ color: SANCTUARY_THEME.gold }} /> Unlocked</> : <><Gem size={9} style={{ color: SANCTUARY_THEME.gold }} /> Included with membership</>}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* The existing gated media wall (photos / clips / stems) */}
      <section>
        <h2 className="text-xl md:text-2xl font-black italic tracking-tight mb-4" style={{ color: SANCTUARY_THEME.goldSoft }}>Media wall</h2>
        <SanctuaryGallery
          sanctuaryId={sanctuaryId} isOwner={isOwner} membership={membership}
          purchasedIds={purchasedIds} onPurchased={onPurchased}
        />
      </section>
    </div>
  );
};

export default SanctuaryVault;

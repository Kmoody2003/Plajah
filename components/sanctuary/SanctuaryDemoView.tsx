import React from 'react';
import { ChevronLeft, Crown, Users, Gem, Check, Heart, Lock } from 'lucide-react';
import { SANCTUARY_THEME, SanctuaryBadge, SanctuaryLockChip, SanctuaryPriceTag } from './SanctuaryIdentity';
import SanctuaryCampaignBanner from './SanctuaryCampaignBanner';
import DemoRibbon from '../DemoRibbon';
import { DEMO_SANCTUARY, DEMO_SANCTUARY_TIERS, DEMO_SANCTUARY_POSTS } from '../../data/demoShowcase';

// A curated, static tour of a Sanctuary — hero, live campaign, tiers, and a gated
// feed preview — so anyone (incl. guests) can see what a creator membership looks
// like, then build their own. No Firestore, no listeners (unlike the live view).
const SanctuaryDemoView: React.FC<{ onBack?: () => void; onCreate: () => void }> = ({ onBack, onCreate }) => {
  const s = DEMO_SANCTUARY;
  const demoAction = () => alert('This is a live demo. Create your own Sanctuary to accept real memberships, unlocks and backing.');

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: SANCTUARY_THEME.obsidian }}>
      <DemoRibbon label="sanctuary" accent={SANCTUARY_THEME.gold} ctaText="Create your Sanctuary" onCreate={onCreate} />

      {/* Hero */}
      <div className="relative">
        <div className="h-48 md:h-60 relative overflow-hidden" style={{ background: SANCTUARY_THEME.heroGradient }}>
          <img src={s.bannerUrl} className="absolute inset-0 w-full h-full object-cover opacity-35" alt="" />
          <div className="absolute inset-0" style={{ background: SANCTUARY_THEME.goldSheen }} />
          {onBack && (
            <button onClick={onBack} className="absolute top-4 left-6 flex items-center gap-1.5 text-white/60 hover:text-white text-[11px] font-bold uppercase tracking-widest">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <div className="absolute top-4 right-6"><SanctuaryBadge /></div>
        </div>

        <div className="px-6 pb-6 pt-4">
          <div className="flex items-end gap-4 -mt-12 mb-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 shadow-xl" style={{ border: `3px solid ${SANCTUARY_THEME.gold}` }}>
              <img src={s.avatarUrl} className="w-full h-full object-cover" alt="" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight truncate" style={{ color: SANCTUARY_THEME.goldSoft }}>{s.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[9px] font-bold text-white/35 uppercase tracking-widest"><Users size={9} /> {s.memberCount.toLocaleString()} members</span>
                <span className="flex items-center gap-1 text-[9px] font-bold text-white/35 uppercase tracking-widest"><Crown size={9} /> {DEMO_SANCTUARY_TIERS.length} tiers</span>
              </div>
            </div>
          </div>
          <p className="text-[13px] text-white/55 leading-relaxed max-w-2xl mb-6">{s.tagline}</p>

          {/* Campaign */}
          {s.campaign && (
            <div className="mb-8">
              <SanctuaryCampaignBanner sanctuary={s} isOwner={false} onContribute={async () => demoAction()} onSave={async () => {}} />
            </div>
          )}

          {/* Tiers */}
          <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: SANCTUARY_THEME.gold }}>Membership tiers</p>
          <div className="grid sm:grid-cols-3 gap-3 mb-10">
            {DEMO_SANCTUARY_TIERS.map(t => (
              <div key={t.id} className="rounded-2xl p-4 flex flex-col" style={{ background: 'rgba(23,18,22,0.6)', border: `1px solid ${SANCTUARY_THEME.line}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg">{t.iconEmoji}</span>
                  <span className="text-lg font-black tabular-nums" style={{ color: t.color }}>${t.price}<span className="text-[9px] text-white/30">/mo</span></span>
                </div>
                <h3 className="text-sm font-black uppercase tracking-wide text-white">{t.name}</h3>
                <p className="text-[11px] text-white/45 leading-snug mt-1 mb-3 flex-1">{t.description}</p>
                <ul className="space-y-1 mb-3">
                  {t.benefits.slice(0, 4).map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/55"><Check size={11} className="shrink-0 mt-0.5" style={{ color: t.color }} /> {b}</li>
                  ))}
                </ul>
                <button onClick={demoAction} className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-black" style={{ background: t.color }}>
                  Join {t.name}
                </button>
              </div>
            ))}
          </div>

          {/* Gated feed preview */}
          <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: SANCTUARY_THEME.gold }}>The feed</p>
          <div className="space-y-4 max-w-2xl">
            {DEMO_SANCTUARY_POSTS.map(p => {
              const open = p.accessType === 'FREE';
              return (
                <div key={p.id} className="rounded-2xl p-4" style={{ background: 'rgba(23,18,22,0.6)', border: `1px solid ${open ? 'rgba(255,255,255,0.08)' : SANCTUARY_THEME.line}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <img src={p.authorPhoto} className="w-7 h-7 rounded-full border border-white/10" alt="" />
                      <p className="text-[11px] font-black uppercase tracking-wide">{p.authorName}</p>
                    </div>
                    {p.accessType === 'FREE' ? <SanctuaryPriceTag tier="Free" /> : p.accessType === 'ONE_TIME' ? <SanctuaryPriceTag price={p.oneTimePrice} /> : <SanctuaryLockChip text="Members" />}
                  </div>
                  {open ? (
                    <p className="text-sm text-white/85 leading-relaxed">{p.content}</p>
                  ) : (
                    <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(0,0,0,0.4)', border: `1px dashed ${SANCTUARY_THEME.line}` }}>
                      <Lock size={20} className="mx-auto mb-2" style={{ color: SANCTUARY_THEME.gold }} />
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: SANCTUARY_THEME.goldSoft }}>
                        {p.accessType === 'ONE_TIME' ? 'Unlock this post' : 'Members-only'}
                      </p>
                      <button onClick={demoAction} className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-black" style={{ background: SANCTUARY_THEME.gold }}>
                        {p.accessType === 'ONE_TIME' ? `Unlock · $${p.oneTimePrice}` : 'Join a tier'}
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-white/6">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-white/35"><Heart size={13} /> {p.likes?.length || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 mb-6 rounded-2xl p-6 text-center" style={{ background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <Gem size={24} className="mx-auto mb-2" style={{ color: SANCTUARY_THEME.gold }} />
            <p className="text-sm font-black uppercase tracking-widest mb-1" style={{ color: SANCTUARY_THEME.goldSoft }}>Your turn</p>
            <p className="text-[12px] text-white/50 max-w-md mx-auto mb-4">Launch your own Sanctuary in minutes — set tiers, gate any content, run a campaign, and get paid.</p>
            <button onClick={onCreate} className="px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest text-black" style={{ background: SANCTUARY_THEME.gold }}>
              Create your Sanctuary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SanctuaryDemoView;

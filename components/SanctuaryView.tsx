import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Star, Crown, Zap, Check, Lock, Unlock, Users, MessageSquare,
  Play, Music, FileText, Video, Download, Heart, ChevronRight, Plus,
  Edit3, Trash2, X, Globe, Eye, EyeOff, Calendar, ChevronLeft,
  Sparkles, Trophy, Gift, Radio, Presentation, Gem, Settings2,
} from 'lucide-react';
import { auth, followUser, unfollowUser, isFollowing } from '../services/backendService';
import {
  fetchCreatorTiers, listenToCreatorTiers, joinSanctuaryTier,
  cancelMembership, checkMembership, fetchMyMemberships,
  listenToExclusiveContent, publishExclusiveContent,
  deleteExclusiveContent, fetchCreatorMembers,
  saveSanctuaryTier, updateSanctuaryTier, deleteSanctuaryTier,
  listenToSanctuary, createOrUpdateSanctuary,
  fetchMyPurchases, hasAccess, listenToSanctuaryPledges,
} from '../services/sanctuaryService';
import { startSanctuaryTierCheckout, backSanctuaryCampaign } from '../services/stripeService';
import { SanctuaryTier, SanctuaryMembership, SanctuaryExclusiveContent, Sanctuary, PitchDeck } from '../types';
import { UserProfile } from '../types';
import { generateSanctuaryDeck } from '../services/pitchDeckTemplates';
import { SANCTUARY_THEME, SanctuaryBadge } from './sanctuary/SanctuaryIdentity';
import SanctuaryCampaignBanner from './sanctuary/SanctuaryCampaignBanner';
import SanctuaryCover from './sanctuary/SanctuaryCover';
import SanctuaryTierCard from './sanctuary/SanctuaryTierCard';
import SanctuaryInside from './sanctuary/SanctuaryInside';
import SanctuaryVault from './sanctuary/SanctuaryVault';

// ── Tier color palettes ────────────────────────────────────────────────────────
const TIER_PRESETS = [
  { color: '#6B7280', name: 'Silver', icon: '🥈' },
  { color: '#F59E0B', name: 'Gold', icon: '🥇' },
  { color: '#8B5CF6', name: 'Amethyst', icon: '💜' },
  { color: '#EC4899', name: 'Rose', icon: '🌹' },
  { color: '#10B981', name: 'Emerald', icon: '💚' },
  { color: '#3B82F6', name: 'Sapphire', icon: '💙' },
  { color: '#EF4444', name: 'Ruby', icon: '❤️' },
  { color: '#F97316', name: 'Amber', icon: '🔥' },
];

const CONTENT_TYPE_ICONS: Record<SanctuaryExclusiveContent['type'], React.FC<any>> = {
  VIDEO: Video,
  AUDIO: Music,
  POST: FileText,
  ARTICLE: FileText,
  LIVE: Radio,
  DOWNLOAD: Download,
  // Expanded Sanctuary content kinds (Patreon/Kickstarter hybrid).
  PLAYLIST: Music,
  REMIX: Music,
  BOOK: FileText,
  FILM: Video,
  DELETED_SCENE: Video,
  BTS: Video,
  GAME: FileText,
  WHITEPAPER: FileText,
  RESEARCH: FileText,
  CONVERSATION: FileText,
  COLLAB: Music,
  LIVESTREAM: Radio,
};

// ── Exclusive Content Card (owner console preview) ─────────────────────────────
const ContentCard: React.FC<{
  content: SanctuaryExclusiveContent;
  isUnlocked: boolean;
  onDelete?: () => void;
}> = ({ content, isUnlocked, onDelete }) => {
  const Icon = CONTENT_TYPE_ICONS[content.type] || FileText;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative rounded-2xl border overflow-hidden group transition-all ${
        isUnlocked ? 'bg-white/[0.05] border-white/[0.08] hover:border-white/[0.14]' : 'bg-white/[0.02] border-white/[0.04]'
      }`}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-black/40 relative overflow-hidden">
        {content.thumbnailUrl ? (
          <img src={content.thumbnailUrl} alt="" className={`w-full h-full object-cover transition-all duration-500 ${isUnlocked ? 'group-hover:scale-105' : 'grayscale opacity-40'}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon size={32} className="text-white/10" />
          </div>
        )}

        {!isUnlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Lock size={24} className="text-white/40" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Members Only</span>
            </div>
          </div>
        )}

        {isUnlocked && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
              <Play size={20} className="text-white" fill="white" />
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-lg flex items-center gap-1">
          <Icon size={9} className="text-white/60" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{content.type}</span>
        </div>
      </div>

      <div className="p-3">
        <h4 className="text-[11px] font-black uppercase tracking-wider truncate mb-0.5">{content.title}</h4>
        {content.description && <p className="text-[9px] text-white/30 line-clamp-2">{content.description}</p>}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[8px] text-white/20">{new Date(content.publishedAt).toLocaleDateString()}</span>
          <span className="flex items-center gap-1 text-[8px] text-white/20"><Heart size={8} /> {content.likesCount}</span>
        </div>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 p-1.5 bg-black/60 text-white/30 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 size={12} />
        </button>
      )}
    </motion.div>
  );
};

// ── Creator Setup Panel ───────────────────────────────────────────────────────
const CreatorSetupPanel: React.FC<{ creatorId: string }> = ({ creatorId }) => {
  const [tiers, setTiers] = useState<SanctuaryTier[]>([]);
  const [members, setMembers] = useState<SanctuaryMembership[]>([]);
  const [content, setContent] = useState<SanctuaryExclusiveContent[]>([]);
  const [showTierModal, setShowTierModal] = useState(false);
  const [showContentModal, setShowContentModal] = useState(false);
  const [editingTier, setEditingTier] = useState<Partial<SanctuaryTier> | null>(null);
  const [activeTab, setActiveTab] = useState<'TIERS' | 'CONTENT' | 'MEMBERS'>('TIERS');

  // Tier form state
  const [tierForm, setTierForm] = useState({
    name: '', description: '', price: 5, annualPrice: undefined as number | undefined,
    color: '#8B5CF6', iconEmoji: '⭐', benefits: [''], hasPrivateChat: true, hasMemberBadge: true,
    sortOrder: 0, isActive: true,
  });

  // Content form
  const [contentForm, setContentForm] = useState({
    title: '', description: '', type: 'POST' as SanctuaryExclusiveContent['type'],
    contentUrl: '', thumbnailUrl: '', requiredTierIds: [] as string[], isPublicPreview: false,
  });

  useEffect(() => {
    const unsub = listenToCreatorTiers(creatorId, setTiers);
    return unsub;
  }, [creatorId]);

  useEffect(() => {
    const unsub = listenToExclusiveContent(creatorId, setContent);
    return unsub;
  }, [creatorId]);

  useEffect(() => {
    fetchCreatorMembers(creatorId).then(setMembers).catch(err => console.warn('[sanctuary] members:', err.message));
  }, [creatorId]);

  const handleSaveTier = async () => {
    try {
      if (editingTier?.id) {
        await updateSanctuaryTier(editingTier.id, { ...tierForm });
      } else {
        await saveSanctuaryTier({ ...tierForm, creatorId });
      }
      setShowTierModal(false);
      setEditingTier(null);
      setTierForm({ name: '', description: '', price: 5, annualPrice: undefined, color: '#8B5CF6', iconEmoji: '⭐', benefits: [''], hasPrivateChat: true, hasMemberBadge: true, sortOrder: tiers.length, isActive: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePublishContent = async () => {
    try {
      await publishExclusiveContent({ ...contentForm, creatorId });
      setShowContentModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const totalMonthlyRevenue = tiers.reduce((sum, tier) => sum + tier.price * tier.memberCount, 0);

  return (
    <div className="space-y-6">
      {/* Revenue summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Members', value: members.length, icon: Users, color: '#8B5CF6' },
          { label: 'Monthly Revenue', value: `$${totalMonthlyRevenue.toFixed(0)}`, icon: Zap, color: '#F59E0B' },
          { label: 'Tiers Active', value: tiers.filter(t => t.isActive).length, icon: Crown, color: '#10B981' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} style={{ color }} />
              <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{label}</span>
            </div>
            <div className="text-2xl font-black">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-black/30 rounded-2xl">
        {(['TIERS', 'CONTENT', 'MEMBERS'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'TIERS' && (
        <div className="space-y-4">
          <button
            onClick={() => { setEditingTier(null); setShowTierModal(true); }}
            className="w-full py-3 border-2 border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:border-small-orange/40 hover:text-small-orange transition-all flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Add Tier
          </button>
          {tiers.map(tier => (
            <div key={tier.id} className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{tier.iconEmoji}</span>
                <div>
                  <p className="text-sm font-black uppercase tracking-wider">{tier.name}</p>
                  <p className="text-[9px] text-white/30">${tier.price}/mo · {tier.memberCount} members</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingTier(tier); setTierForm({ ...tier, annualPrice: tier.annualPrice ?? undefined, benefits: [...tier.benefits] }); setShowTierModal(true); }}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all"><Edit3 size={14} className="text-white/40" /></button>
                <button onClick={() => deleteSanctuaryTier(tier.id)}
                  className="p-2 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={14} className="text-red-400/50 hover:text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'CONTENT' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowContentModal(true)}
            className="w-full py-3 border-2 border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:border-small-orange/40 hover:text-small-orange transition-all flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Publish Exclusive Content
          </button>
          <div className="grid grid-cols-2 gap-4">
            {content.map(item => (
              <ContentCard
                key={item.id}
                content={item}
                isUnlocked
                onDelete={() => deleteExclusiveContent(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'MEMBERS' && (
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="py-16 text-center">
              <Users size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No members yet</p>
              <p className="text-[9px] text-white/15 mt-2">Share your Sanctuary page to attract members</p>
            </div>
          ) : members.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10">
                <img src={m.memberPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.memberId}`} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider truncate">{m.memberName}</p>
                <p className="text-[9px] text-white/25">{m.tierName} · Since {new Date(m.startedAt).toLocaleDateString()}</p>
              </div>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: m.tierColor }} />
            </div>
          ))}
        </div>
      )}

      {/* Tier Modal */}
      <AnimatePresence>
        {showTierModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[500] flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowTierModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="max-w-lg w-full bg-[#111] border border-white/10 rounded-3xl p-6 space-y-4 my-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-tighter">{editingTier?.id ? 'Edit Tier' : 'Create Tier'}</h3>
                <button onClick={() => setShowTierModal(false)}><X size={18} /></button>
              </div>

              {/* Color picker */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {TIER_PRESETS.map(p => (
                    <button key={p.color} onClick={() => setTierForm(f => ({ ...f, color: p.color, iconEmoji: p.icon }))}
                      className={`w-8 h-8 rounded-xl transition-all ${tierForm.color === p.color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                      style={{ background: p.color }} title={p.name} />
                  ))}
                </div>
              </div>

              {[
                { label: 'Tier Name', key: 'name', placeholder: 'Gold Supporter' },
                { label: 'Description', key: 'description', placeholder: 'Join for exclusive access…' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5">{label}</label>
                  <input value={(tierForm as any)[key]} onChange={e => setTierForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-small-orange/40 transition-all" />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5">Monthly Price ($)</label>
                  <input type="number" min="1" value={tierForm.price} onChange={e => setTierForm(f => ({ ...f, price: +e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-small-orange/40" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5">Annual Price ($)</label>
                  <input type="number" min="0" value={tierForm.annualPrice || ''} onChange={e => setTierForm(f => ({ ...f, annualPrice: e.target.value ? +e.target.value : undefined }))}
                    placeholder="Optional"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-small-orange/40" />
                </div>
              </div>

              {/* Benefits */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2">Benefits</label>
                {tierForm.benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input value={b} onChange={e => {
                      const nb = [...tierForm.benefits]; nb[i] = e.target.value; setTierForm(f => ({ ...f, benefits: nb }));
                    }} placeholder={`Benefit ${i + 1}`}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-small-orange/40" />
                    <button onClick={() => setTierForm(f => ({ ...f, benefits: f.benefits.filter((_, idx) => idx !== i) }))}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg"><X size={12} className="text-red-400/60" /></button>
                  </div>
                ))}
                <button onClick={() => setTierForm(f => ({ ...f, benefits: [...f.benefits, ''] }))}
                  className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors flex items-center gap-1">
                  <Plus size={11} /> Add benefit
                </button>
              </div>

              {/* Perks toggles */}
              <div className="flex gap-4">
                {[
                  { label: 'Private Chat', key: 'hasPrivateChat' },
                  { label: 'Member Badge', key: 'hasMemberBadge' },
                ].map(({ label, key }) => (
                  <button key={key} onClick={() => setTierForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                    className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${(tierForm as any)[key] ? 'text-small-orange' : 'text-white/25 hover:text-white'}`}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${(tierForm as any)[key] ? 'bg-small-orange border-small-orange' : 'border-white/20'}`}>
                      {(tierForm as any)[key] && <Check size={9} className="text-white" />}
                    </div>
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowTierModal(false)} className="flex-1 py-3 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 transition-all">Cancel</button>
                <button onClick={handleSaveTier} disabled={!tierForm.name.trim()}
                  className="flex-1 py-3 bg-small-orange rounded-full text-[10px] font-black uppercase tracking-widest text-white hover:bg-small-orange/80 transition-all disabled:opacity-30">
                  {editingTier?.id ? 'Save' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Modal */}
      <AnimatePresence>
        {showContentModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[500] flex items-center justify-center p-4"
            onClick={() => setShowContentModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="max-w-lg w-full bg-[#111] border border-white/10 rounded-3xl p-6 space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-tighter">Publish Exclusive Content</h3>
                <button onClick={() => setShowContentModal(false)}><X size={18} /></button>
              </div>

              {/* Type selector */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2">Content Type</label>
                <div className="flex flex-wrap gap-2">
                  {(['VIDEO', 'AUDIO', 'POST', 'ARTICLE', 'LIVE', 'DOWNLOAD'] as const).map(type => (
                    <button key={type} onClick={() => setContentForm(f => ({ ...f, type }))}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${contentForm.type === type ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {[
                { label: 'Title', key: 'title', placeholder: 'Exclusive: Behind the scenes…' },
                { label: 'Description', key: 'description', placeholder: 'Optional description…' },
                { label: 'Content URL', key: 'contentUrl', placeholder: 'https://…' },
                { label: 'Thumbnail URL', key: 'thumbnailUrl', placeholder: 'https://… (optional)' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5">{label}</label>
                  <input value={(contentForm as any)[key]} onChange={e => setContentForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-small-orange/40" />
                </div>
              ))}

              {/* Required tiers */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2">Required Tiers (min 1)</label>
                <div className="flex flex-wrap gap-2">
                  {tiers.map(t => (
                    <button key={t.id}
                      onClick={() => setContentForm(f => ({
                        ...f,
                        requiredTierIds: f.requiredTierIds.includes(t.id)
                          ? f.requiredTierIds.filter(id => id !== t.id)
                          : [...f.requiredTierIds, t.id],
                      }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${contentForm.requiredTierIds.includes(t.id) ? 'text-white' : 'text-white/30 border-white/10 hover:border-white/20'}`}
                      style={contentForm.requiredTierIds.includes(t.id) ? { background: t.color, borderColor: t.color } : {}}>
                      {t.iconEmoji} {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowContentModal(false)} className="flex-1 py-3 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/40">Cancel</button>
                <button onClick={handlePublishContent} disabled={!contentForm.title.trim()}
                  className="flex-1 py-3 bg-small-orange rounded-full text-[10px] font-black uppercase tracking-widest text-white hover:bg-small-orange/80 disabled:opacity-30">
                  Publish
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main SanctuaryView ────────────────────────────────────────────────────────
interface SanctuaryViewProps {
  creatorId: string;
  creatorProfile?: UserProfile;
  currentUserProfile?: UserProfile;
  onBack?: () => void;
  isOwnProfile?: boolean;
  onCreatePitchDeck?: (deck: PitchDeck) => void;
}

const SanctuaryView: React.FC<SanctuaryViewProps> = ({
  creatorId, creatorProfile, currentUserProfile, onBack, isOwnProfile, onCreatePitchDeck,
}) => {
  const [tiers, setTiers] = useState<SanctuaryTier[]>([]);
  const [tiersLoaded, setTiersLoaded] = useState(false);
  const [myMembership, setMyMembership] = useState<SanctuaryMembership | null>(null);
  const [sanctuary, setSanctuary] = useState<Sanctuary | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [pledgeStats, setPledgeStats] = useState({ raised: 0, backers: 0 });
  const [isLoadingJoin, setIsLoadingJoin] = useState(false);
  // Membership Home has two fan tabs (Home | Vault); the owner also gets Manage.
  const [view, setView] = useState<'HOME' | 'VAULT' | 'MANAGE'>('HOME');
  const [joinError, setJoinError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const tiersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = listenToCreatorTiers(creatorId, t => { setTiers(t); setTiersLoaded(true); });
    return unsub;
  }, [creatorId]);

  useEffect(() => {
    if (!auth.currentUser) return;
    checkMembership(creatorId).then(setMyMembership).catch(err => console.warn('[sanctuary] check membership:', err.message));
    fetchMyPurchases(creatorId)
      .then(ps => setPurchasedIds(new Set(ps.map(p => p.itemId))))
      .catch(() => {});
  }, [creatorId]);

  // Follow state (reuses the platform follow graph — not membership).
  useEffect(() => {
    if (!auth.currentUser || isOwnProfile) return;
    isFollowing(creatorId).then(setFollowing).catch(() => {});
  }, [creatorId, isOwnProfile]);

  const toggleFollow = async () => {
    if (!auth.currentUser) { setJoinError('Sign in to follow'); return; }
    setFollowBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      await (next ? followUser(creatorId) : unfollowUser(creatorId));
    } catch {
      setFollowing(!next); // revert on failure
    } finally {
      setFollowBusy(false);
    }
  };

  // Sanctuary identity doc (name / banner / campaign). Auto-provision for the owner
  // so every account has a real, distinct Sanctuary the first time they open it.
  useEffect(() => {
    const unsub = listenToSanctuary(creatorId, s => {
      setSanctuary(s);
      if (!s && isOwnProfile && auth.currentUser?.uid === creatorId) {
        createOrUpdateSanctuary({
          ownerId: creatorId,
          ownerName: creatorProfile?.displayName || auth.currentUser.displayName || 'Creator',
          ownerPhoto: creatorProfile?.photoURL,
        }).catch(() => {});
      }
    });
    return unsub;
  }, [creatorId, isOwnProfile, creatorProfile]);

  // Live campaign totals summed from real (Stripe-recorded) pledges.
  useEffect(() => listenToSanctuaryPledges(creatorId, ps =>
    setPledgeStats({ raised: ps.reduce((s, p) => s + (p.amount || 0), 0), backers: ps.length })
  ), [creatorId]);

  const contribute = async (amount: number) => {
    await backSanctuaryCampaign({ sanctuaryId: creatorId, creatorId, amount, campaignTitle: sanctuary?.campaign?.title });
  };
  const saveSanctuary = async (patch: Partial<Sanctuary>) => {
    await createOrUpdateSanctuary({ ownerId: creatorId, ...patch });
  };

  // Overlay live pledge totals onto the campaign for display.
  const displaySanctuary = sanctuary?.campaign
    ? { ...sanctuary, campaign: {
        ...sanctuary.campaign,
        raisedAmount: (sanctuary.campaign.raisedAmount || 0) + pledgeStats.raised,
        backerCount: (sanctuary.campaign.backerCount || 0) + pledgeStats.backers,
      } }
    : sanctuary;

  const handleJoin = async (tier: SanctuaryTier) => {
    if (!auth.currentUser) { setJoinError('Sign in to join'); return; }
    setIsLoadingJoin(true);
    setJoinError('');
    try {
      if (tier.price > 0) {
        // Paid tier → Stripe Checkout. On return the webhook records the
        // membership; this call redirects the browser away.
        await startSanctuaryTierCheckout({
          tierId: tier.id, creatorId, tierName: tier.name, tierColor: tier.color,
          monthlyPrice: tier.price, annualPrice: tier.annualPrice, billingCycle: 'MONTHLY',
        });
        return;
      }
      // Free tier → instant join.
      await joinSanctuaryTier(tier);
      const updated = await checkMembership(creatorId);
      setMyMembership(updated);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join');
    } finally {
      setIsLoadingJoin(false);
    }
  };

  const handleCancel = async (membership: SanctuaryMembership) => {
    if (!window.confirm('Cancel your membership? You will lose access at the end of your billing period.')) return;
    await cancelMembership(membership.id, membership.tierId);
    setMyMembership(null);
  };

  const onPurchased = (id: string) => setPurchasedIds(prev => new Set(prev).add(id));

  const memberCount = sanctuary?.memberCount || tiers.reduce((s, t) => s + t.memberCount, 0);
  const sanctuaryName = sanctuary?.name || `${creatorProfile?.displayName || 'Creator'} Sanctuary`;
  // Monthly membership total, shown only if the creator opted to expose it.
  const monthlyTotal = sanctuary?.showMonthlyTotal
    ? tiers.reduce((s, t) => s + t.price * t.memberCount, 0)
    : null;

  // The "most popular" tier: the one with the most members, else the middle tier.
  const featuredTierId = (() => {
    if (tiers.length === 0) return null;
    const top = [...tiers].sort((a, b) => b.memberCount - a.memberCount)[0];
    if (top && top.memberCount > 0) return top.id;
    return tiers[Math.floor((tiers.length - 1) / 2)].id;
  })();

  const scrollToTiers = () => {
    setView('HOME');
    requestAnimationFrame(() => tiersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const loading = !tiersLoaded;

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: SANCTUARY_THEME.obsidian }}>
      {loading ? (
        // ── Loading skeleton ──────────────────────────────────────────────────
        <div className="animate-pulse">
          <div className="h-52 md:h-72" style={{ background: SANCTUARY_THEME.heroGradient }} />
          <div className="px-5 md:px-8 -mt-16 relative">
            <div className="w-28 h-28 rounded-3xl bg-white/5 border-2 border-white/10" />
            <div className="h-8 w-64 rounded-lg bg-white/5 mt-4" />
            <div className="h-4 w-40 rounded bg-white/5 mt-3" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              {[0, 1, 2].map(i => <div key={i} className="h-64 rounded-3xl bg-white/[0.04] border border-white/[0.06]" />)}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 1 · Cover + identity + primary CTAs */}
          <SanctuaryCover
            sanctuary={sanctuary} creatorProfile={creatorProfile} creatorId={creatorId}
            sanctuaryName={sanctuaryName} memberCount={memberCount} tierCount={tiers.length}
            monthlyTotal={monthlyTotal} isOwner={isOwnProfile} membership={myMembership}
            following={following} followBusy={followBusy} onFollow={toggleFollow}
            onJoinClick={scrollToTiers}
            onManageMembership={() => myMembership && handleCancel(myMembership)}
            onOwnerConsole={() => setView('MANAGE')}
            onBack={onBack}
          />

          <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
            {joinError && <p className="text-red-400 text-[11px] mb-4">{joinError}</p>}
            <AnimatePresence>
              {showSuccess && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl text-[11px] font-bold mb-4"
                  style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}>
                  <Check size={14} /> Welcome to the Sanctuary — your access is unlocked.
                </motion.div>
              )}
            </AnimatePresence>

            {/* Home | Vault (+ Manage while the owner is in the console) */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl mb-8 w-fit" style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${SANCTUARY_THEME.line}` }}>
              {([
                { id: 'HOME', label: 'Home', icon: Gem },
                { id: 'VAULT', label: 'Vault', icon: Eye },
                ...(isOwnProfile ? [{ id: 'MANAGE' as const, label: 'Manage', icon: Settings2 }] : []),
              ] as const).map(({ id, label, icon: Icon }) => {
                const active = view === id;
                return (
                  <button key={id} onClick={() => setView(id)}
                    className="min-w-[92px] py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all"
                    style={active ? { color: '#000', background: SANCTUARY_THEME.gold } : { color: 'rgba(255,255,255,0.45)' }}>
                    <Icon size={12} /> {label}
                  </button>
                );
              })}
            </div>

            {view === 'HOME' && (
              <div className="space-y-12">
                {/* 2 · Campaign banner — only when a live campaign exists (owner sees launch CTA). */}
                {displaySanctuary && (displaySanctuary.campaign?.isActive || isOwnProfile) && (
                  <SanctuaryCampaignBanner sanctuary={displaySanctuary} isOwner={isOwnProfile} onContribute={contribute} onSave={saveSanctuary} />
                )}

                {/* 3 · Tiers */}
                <section ref={tiersRef}>
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="text-2xl md:text-3xl font-black italic tracking-tight" style={{ color: SANCTUARY_THEME.goldSoft }}>
                      {myMembership ? 'Your membership' : 'Choose your tier'}
                    </h2>
                    {tiers.length > 0 && <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Cancel anytime</span>}
                  </div>
                  {tiers.length === 0 ? (
                    // Empty state — no tiers yet.
                    <div className="py-16 text-center rounded-3xl" style={{ background: SANCTUARY_THEME.panel, border: `1px dashed ${SANCTUARY_THEME.line}` }}>
                      <Gem size={34} className="mx-auto mb-3" style={{ color: 'rgba(201,165,92,0.35)' }} />
                      <p className="text-sm font-black tracking-tight mb-1" style={{ color: SANCTUARY_THEME.goldSoft }}>This Sanctuary is just getting started</p>
                      <p className="text-[11px] text-white/40">{isOwnProfile ? 'Open the owner console to create your first tier.' : 'Follow to be first in when membership opens.'}</p>
                      {isOwnProfile && (
                        <button onClick={() => setView('MANAGE')} className="mt-4 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest text-black" style={{ background: SANCTUARY_THEME.gold }}>
                          Set up tiers
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                      {tiers.map(tier => (
                        <SanctuaryTierCard
                          key={tier.id} tier={tier}
                          membership={myMembership?.tierId === tier.id ? myMembership : null}
                          featured={!myMembership && tier.id === featuredTierId}
                          isLoading={isLoadingJoin}
                          onJoin={handleJoin} onManage={handleCancel}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* 4 · Inside the Sanctuary — feed preview, lounge teaser, next event */}
                <SanctuaryInside
                  sanctuaryId={creatorId} isOwner={isOwnProfile} membership={myMembership}
                  tiers={tiers} purchasedIds={purchasedIds} onPurchased={onPurchased}
                  onJoinClick={scrollToTiers}
                />
              </div>
            )}

            {/* 5 · Vault — gated content grid + media wall */}
            {view === 'VAULT' && (
              <SanctuaryVault
                sanctuaryId={creatorId} isOwner={isOwnProfile} membership={myMembership}
                purchasedIds={purchasedIds} onPurchased={onPurchased}
              />
            )}

            {/* Owner console (existing management entry — dedicated console is a later wave) */}
            {view === 'MANAGE' && isOwnProfile && (
              <div className="space-y-6">
                {onCreatePitchDeck && (
                  <button
                    onClick={() => {
                      const profile = creatorProfile ?? { uid: creatorId, displayName: 'Creator', photoURL: '', email: '', followerCount: 0, followingCount: 0, storageLimit: 0, storageUsage: { total: 0, audio: 0, video: 0, photos: 0 } } as UserProfile;
                      onCreatePitchDeck(generateSanctuaryDeck(profile, tiers));
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-colors"
                    style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}
                  >
                    <Presentation size={14} /> Create Pitch Deck
                  </button>
                )}
                <CreatorSetupPanel creatorId={creatorId} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SanctuaryView;

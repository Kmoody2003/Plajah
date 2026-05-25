import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Star, Crown, Zap, Check, Lock, Unlock, Users, MessageSquare,
  Play, Music, FileText, Video, Download, Heart, ChevronRight, Plus,
  Edit3, Trash2, X, Globe, Eye, EyeOff, Calendar, ChevronLeft,
  Sparkles, Trophy, Gift, Radio,
} from 'lucide-react';
import { auth } from '../services/backendService';
import {
  fetchCreatorTiers, listenToCreatorTiers, joinSanctuaryTier,
  cancelMembership, checkMembership, fetchMyMemberships,
  listenToExclusiveContent, publishExclusiveContent,
  deleteExclusiveContent, fetchCreatorMembers,
  saveSanctuaryTier, updateSanctuaryTier, deleteSanctuaryTier,
} from '../services/sanctuaryService';
import { SanctuaryTier, SanctuaryMembership, SanctuaryExclusiveContent } from '../types';
import { UserProfile } from '../types';

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
};

// ── Tier Card ─────────────────────────────────────────────────────────────────
const TierCard: React.FC<{
  tier: SanctuaryTier;
  membership: SanctuaryMembership | null;
  onJoin: (tier: SanctuaryTier) => void;
  onCancel: (membership: SanctuaryMembership) => void;
  isLoading: boolean;
}> = ({ tier, membership, onJoin, onCancel, isLoading }) => {
  const isMember = !!membership;
  const isAnnual = membership?.billingCycle === 'ANNUAL';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl border overflow-hidden"
      style={{ borderColor: `${tier.color}30` }}
    >
      {/* Top accent bar */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${tier.color}, ${tier.color}88)` }} />

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${tier.color}12 0%, transparent 70%)` }} />

      <div className="p-6 relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-2xl">{tier.iconEmoji}</span>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter">{tier.name}</h3>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{tier.memberCount} members</p>
              </div>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">{tier.description}</p>
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className="text-3xl font-black" style={{ color: tier.color }}>${tier.price}</div>
            <div className="text-[9px] font-bold text-white/25 uppercase tracking-widest">/month</div>
            {tier.annualPrice && (
              <div className="text-[8px] font-bold text-green-400 mt-0.5">${tier.annualPrice}/yr (save {Math.round((1 - tier.annualPrice / (tier.price * 12)) * 100)}%)</div>
            )}
          </div>
        </div>

        {/* Benefits */}
        <div className="space-y-2 mb-6">
          {tier.benefits.map((benefit, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${tier.color}25` }}>
                <Check size={9} style={{ color: tier.color }} />
              </div>
              <span className="text-[11px] text-white/70 leading-tight">{benefit}</span>
            </div>
          ))}
          {tier.hasPrivateChat && (
            <div className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${tier.color}25` }}>
                <MessageSquare size={9} style={{ color: tier.color }} />
              </div>
              <span className="text-[11px] text-white/70">Private member chat room</span>
            </div>
          )}
          {tier.hasMemberBadge && (
            <div className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${tier.color}25` }}>
                <Shield size={9} style={{ color: tier.color }} />
              </div>
              <span className="text-[11px] text-white/70">Exclusive member badge</span>
            </div>
          )}
        </div>

        {/* Action */}
        {isMember ? (
          <div className="space-y-2">
            <div
              className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
              style={{ background: `${tier.color}20`, color: tier.color, border: `1px solid ${tier.color}40` }}
            >
              <Check size={14} />
              Active Member
            </div>
            <button
              onClick={() => onCancel(membership)}
              className="w-full py-2 rounded-xl text-[9px] font-bold text-white/20 hover:text-red-400 transition-colors uppercase tracking-widest"
            >
              Cancel membership
            </button>
          </div>
        ) : (
          <button
            onClick={() => onJoin(tier)}
            disabled={isLoading}
            className="w-full py-3.5 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}bb)` }}
          >
            Join for ${tier.price}/mo
          </button>
        )}
      </div>
    </motion.div>
  );
};

// ── Exclusive Content Card ────────────────────────────────────────────────────
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
}

const SanctuaryView: React.FC<SanctuaryViewProps> = ({
  creatorId, creatorProfile, currentUserProfile, onBack, isOwnProfile,
}) => {
  const [tiers, setTiers] = useState<SanctuaryTier[]>([]);
  const [myMembership, setMyMembership] = useState<SanctuaryMembership | null>(null);
  const [exclusiveContent, setExclusiveContent] = useState<SanctuaryExclusiveContent[]>([]);
  const [isLoadingJoin, setIsLoadingJoin] = useState(false);
  const [activeTab, setActiveTab] = useState<'TIERS' | 'CONTENT' | 'COMMUNITY'>('TIERS');
  const [joinError, setJoinError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const unsub = listenToCreatorTiers(creatorId, setTiers);
    return unsub;
  }, [creatorId]);

  useEffect(() => {
    const unsub = listenToExclusiveContent(creatorId, setContent => {
      setExclusiveContent(setContent);
    });
    return unsub;
  }, [creatorId]);

  useEffect(() => {
    if (!auth.currentUser) return;
    checkMembership(creatorId).then(setMyMembership).catch(err => console.warn('[sanctuary] check membership:', err.message));
  }, [creatorId]);

  const handleJoin = async (tier: SanctuaryTier) => {
    if (!auth.currentUser) { setJoinError('Sign in to join'); return; }
    setIsLoadingJoin(true);
    setJoinError('');
    try {
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

  const isContentUnlocked = (content: SanctuaryExclusiveContent) => {
    if (isOwnProfile) return true;
    if (!myMembership) return content.isPublicPreview;
    return content.requiredTierIds.includes(myMembership.tierId);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-black/40">
      {/* Hero */}
      <div className="relative">
        {/* Cover */}
        <div className="h-48 md:h-64 bg-gradient-to-br from-purple-900/60 via-black to-amber-900/40 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(139,92,246,0.3),transparent_70%)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield size={64} className="text-white/5" />
          </div>
        </div>

        {/* Back + Creator info */}
        <div className="px-6 pb-6 pt-4">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-4">
              <ChevronLeft size={18} /> Back
            </button>
          )}

          <div className="flex items-end gap-4 -mt-12 mb-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-black shadow-xl shrink-0">
              <img src={creatorProfile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${creatorId}`}
                className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter">{creatorProfile?.displayName || 'Creator'} Sanctuary</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[9px] font-bold text-white/30 uppercase"><Users size={9} /> {tiers.reduce((s, t) => s + t.memberCount, 0)} members</span>
                <span className="flex items-center gap-1 text-[9px] font-bold text-white/30 uppercase"><Crown size={9} /> {tiers.length} tier{tiers.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Member status badge */}
          {myMembership && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest mb-4"
              style={{ color: myMembership.tierColor, borderColor: `${myMembership.tierColor}40`, background: `${myMembership.tierColor}10` }}
            >
              <Shield size={12} />
              {myMembership.tierName} Member · Renews {new Date(myMembership.renewsAt).toLocaleDateString()}
            </div>
          )}

          {joinError && <p className="text-red-400 text-[11px] mb-4">{joinError}</p>}

          <AnimatePresence>
            {showSuccess && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-2 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-2xl text-green-400 text-[11px] font-bold mb-4">
                <Check size={14} /> Welcome to the Sanctuary! You now have access to exclusive content.
              </motion.div>
            )}
          </AnimatePresence>

          {/* Creator setup or fan tabs */}
          {isOwnProfile ? (
            <CreatorSetupPanel creatorId={creatorId} />
          ) : (
            <>
              <div className="flex items-center gap-2 p-1 bg-black/30 rounded-2xl mb-6">
                {([
                  { id: 'TIERS', label: 'Join', icon: Crown },
                  { id: 'CONTENT', label: 'Exclusives', icon: Sparkles },
                  { id: 'COMMUNITY', label: 'Community', icon: Users },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === id ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>

              {activeTab === 'TIERS' && (
                <div className="space-y-4">
                  {tiers.length === 0 ? (
                    <div className="py-16 text-center">
                      <Shield size={32} className="text-white/10 mx-auto mb-3" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No membership tiers yet</p>
                    </div>
                  ) : tiers.map(tier => (
                    <TierCard key={tier.id} tier={tier} membership={myMembership?.tierId === tier.id ? myMembership : null}
                      onJoin={handleJoin} onCancel={handleCancel} isLoading={isLoadingJoin} />
                  ))}
                </div>
              )}

              {activeTab === 'CONTENT' && (
                <div>
                  {!myMembership && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 mb-4">
                      <Lock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Members only content</p>
                        <p className="text-[9px] text-white/30">Join a tier to unlock exclusive videos, audio, posts, and more.</p>
                      </div>
                    </div>
                  )}
                  {exclusiveContent.length === 0 ? (
                    <div className="py-12 text-center">
                      <Sparkles size={28} className="text-white/10 mx-auto mb-3" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No exclusive content yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {exclusiveContent.map(content => (
                        <ContentCard key={content.id} content={content} isUnlocked={isContentUnlocked(content)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'COMMUNITY' && (
                <div className="py-12 text-center">
                  <MessageSquare size={32} className="text-white/10 mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Member chat coming soon</p>
                  <p className="text-[9px] text-white/15 mt-2">Join a tier with private chat access</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SanctuaryView;

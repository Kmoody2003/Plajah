import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Check, Crown, X, Settings, Users, RefreshCw, Star } from 'lucide-react';
import { PlajahPlusSubscription, CreatorSplit, CreatorSplitEntry, SubscriptionTier } from '../types';
import {
  listenToMySubscription,
  listenToCreatorSubscriberCount,
  fetchCreatorSplit,
  saveCreatorSplit,
} from '../services/subscriptionService';
import { startSubscriptionCheckout, openBillingPortal, TIER_META } from '../services/stripeService';
import { auth } from '../services/firebase';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlajahPlusButtonProps {
  creatorId: string;
  creatorName: string;
  isOwnProfile: boolean;
  onOpenLanding?: () => void;
}

// ── Split Manager (creator view) ──────────────────────────────────────────────

const SplitManager: React.FC<{
  creatorId: string;
  tier: SubscriptionTier;
  onClose: () => void;
}> = ({ creatorId, tier, onClose }) => {
  const [splits, setSplits] = useState<CreatorSplitEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchCreatorSplit(creatorId).then(s => { if (s) setSplits(s.splits); });
  }, [creatorId]);

  const addSplit = () => {
    if (splits.length >= 3) return;
    setSplits(prev => [...prev, { targetId: '', targetType: 'USER', targetName: '', percentage: 0 }]);
  };

  const removeSplit = (i: number) => setSplits(prev => prev.filter((_, idx) => idx !== i));

  const updateSplit = (i: number, field: keyof CreatorSplitEntry, value: any) => {
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCreatorSplit(splits, tier);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPct = splits.reduce((acc, s) => acc + (Number(s.percentage) || 0), 0);
  const creatorRetains = 100 - totalPct;
  const creatorShareMap: Record<SubscriptionTier, number> = { 1: 3.00, 2: 7.00, 3: 11.00 };
  const creatorRetainsDollars = (creatorShareMap[tier] * creatorRetains / 100).toFixed(2);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">Manage Your Split</h3>
        <button onClick={onClose}><X size={16} className="text-white/40" /></button>
      </div>

      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
        <p className="text-[10px] text-white/40 mb-1">Creator retains</p>
        <p className="text-2xl font-black text-white">{creatorRetains.toFixed(1)}%</p>
        <p className="text-xs text-white/50">${creatorRetainsDollars}/subscriber/month</p>
        {creatorRetainsDollars < '1.00' && (
          <p className="text-[10px] text-red-400 mt-1">Must retain at least $1.00</p>
        )}
      </div>

      <div className="space-y-3">
        {splits.map((split, i) => (
          <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Recipient {i + 1}</p>
              <button onClick={() => removeSplit(i)}><X size={12} className="text-white/30 hover:text-white" /></button>
            </div>
            <input
              value={split.targetName}
              onChange={e => updateSplit(i, 'targetName', e.target.value)}
              placeholder="Creator / Charity / Club name..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 outline-none"
            />
            <input
              value={split.targetId}
              onChange={e => updateSplit(i, 'targetId', e.target.value)}
              placeholder="User ID or club ID..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 outline-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={split.targetType}
                onChange={e => updateSplit(i, 'targetType', e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                <option value="USER">Artist/User</option>
                <option value="CHARITY">Charity</option>
                <option value="CLUB">Club</option>
              </select>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={split.percentage || ''}
                  onChange={e => updateSplit(i, 'percentage', parseFloat(e.target.value) || 0)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none text-right"
                />
                <span className="text-xs text-white/40">%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {splits.length < 3 && (
        <button
          onClick={addSplit}
          className="w-full py-3 border border-dashed border-white/20 rounded-2xl text-xs text-white/40 hover:text-white hover:border-white/40 transition-all"
        >
          + Add Recipient
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || parseFloat(creatorRetainsDollars) < 1.00}
        className="w-full py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-40"
      >
        {success ? '✓ Saved' : saving ? 'Saving…' : 'Save Split'}
      </button>
    </div>
  );
};

// ── Main Button ───────────────────────────────────────────────────────────────

const PlajahPlusButton: React.FC<PlajahPlusButtonProps> = ({
  creatorId,
  creatorName,
  isOwnProfile,
  onOpenLanding,
}) => {
  const [sub, setSub] = useState<PlajahPlusSubscription | null>(null);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBoundToThisCreator = sub?.boundCreatorId === creatorId && sub?.status === 'active';

  useEffect(() => {
    const unsub1 = listenToMySubscription(setSub);
    const unsub2 = listenToCreatorSubscriberCount(creatorId, setSubscriberCount);
    return () => { unsub1(); unsub2(); };
  }, [creatorId]);

  const handleManageBilling = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      await openBillingPortal(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const TIER_ICON = sub?.tier === 3 ? Zap : sub?.tier === 2 ? Crown : Star;
  const TIER_COLOR = sub?.tier === 3 ? '#D40055' : sub?.tier === 2 ? '#6B0099' : '#FF8C00';

  return (
    <>
      <div className="flex flex-col items-start gap-2">
        {/* Subscriber count badge */}
        {subscriberCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full">
            <Users size={10} className="text-white/30" />
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
              {subscriberCount.toLocaleString()} {subscriberCount === 1 ? 'subscriber' : 'subscribers'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Main Plajah+ button */}
          {isOwnProfile ? (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D40055] via-[#6B0099] to-[#FF8C00] rounded-full text-[9px] font-black uppercase tracking-widest text-white hover:scale-105 transition-all shadow-lg"
            >
              <Settings size={10} />
              Manage Plajah+
            </button>
          ) : isBoundToThisCreator ? (
            <button
              onClick={handleManageBilling}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-full text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/15 transition-all"
            >
              <Check size={10} className="text-green-400" />
              Subscribed
              <RefreshCw size={10} className="text-white/40" />
            </button>
          ) : (
            <button
              onClick={onOpenLanding}
              className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D40055] to-[#FF8C00] rounded-full text-[9px] font-black uppercase tracking-widest text-white hover:scale-105 transition-all shadow-lg shadow-[#D40055]/20"
            >
              <Zap size={10} />
              Plajah+
              <span className="opacity-60 group-hover:opacity-100 transition-opacity">Subscribe</span>
            </button>
          )}

          {/* Active sub indicator */}
          {sub && !isBoundToThisCreator && !isOwnProfile && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border"
              style={{ borderColor: `${TIER_COLOR}40`, color: TIER_COLOR, background: `${TIER_COLOR}10` }}
            >
              <TIER_ICON size={9} />
              {TIER_META[sub.tier].label.replace('Plajah+ ', '')}
            </div>
          )}
        </div>

        {error && <p className="text-[9px] text-red-400">{error}</p>}
      </div>

      {/* Creator management modal */}
      <AnimatePresence>
        {showModal && isOwnProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-6"
            >
              {sub ? (
                <SplitManager
                  creatorId={creatorId}
                  tier={sub.tier}
                  onClose={() => setShowModal(false)}
                />
              ) : (
                <div className="text-center space-y-4">
                  <Zap size={32} className="text-[#FF8C00] mx-auto" />
                  <h3 className="text-sm font-black text-white">No Active Subscription</h3>
                  <p className="text-xs text-white/40">You don't have a Plajah+ subscription yet. Subscribe to manage creator splits.</p>
                  <button
                    onClick={() => { setShowModal(false); onOpenLanding?.(); }}
                    className="w-full py-3 bg-gradient-to-r from-[#D40055] to-[#FF8C00] rounded-2xl text-xs font-black uppercase tracking-widest text-white"
                  >
                    View Plans
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PlajahPlusButton;

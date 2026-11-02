import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Check, Crown, X, Settings, Users, RefreshCw, Star } from 'lucide-react';
import { PlajahPlusSubscription, SplitRecipient } from '../types';
import {
  listenToMySubscription,
  listenToCreatorSubscriberCount,
} from '../services/subscriptionService';
import { fetchCreatorSplitConfig, saveCreatorSplitConfig } from '../services/backendService';
import { startSubscriptionCheckout, openBillingPortal, TIER_META } from '../services/stripeService';
import { auth } from '../services/firebase';
import PlajahPlusLanding from './PlajahPlusLanding';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlajahPlusButtonProps {
  creatorId: string;
  creatorName: string;
  isOwnProfile: boolean;
  onOpenLanding?: () => void;
}

// ── Split Manager (creator view) ──────────────────────────────────────────────

const SplitManager: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [splits, setSplits] = useState<SplitRecipient[]>([]);
  const [appliesTo, setAppliesTo] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchCreatorSplitConfig().then(cfg => {
      setSplits(cfg.recipients || []);
      setAppliesTo(cfg.appliesTo || []);
    });
  }, []);

  const addSplit = () => {
    if (splits.length >= 3) return;
    setSplits(prev => [...prev, { creatorUid: '', displayName: '', percentage: 0 }]);
  };

  const removeSplit = (i: number) => setSplits(prev => prev.filter((_, idx) => idx !== i));

  const updateSplit = (i: number, field: keyof SplitRecipient, value: any) => {
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Same config as the Payments dashboard: this screen adds Plajah+ and leaves other categories as they are.
      await saveCreatorSplitConfig(splits, appliesTo.includes('plajahplus') ? appliesTo : [...appliesTo, 'plajahplus']);
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">Manage Your Split</h3>
        <button onClick={onClose}><X size={16} className="text-white/40" /></button>
      </div>

      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
        <p className="text-[10px] text-white/40 mb-1">Creator retains</p>
        <p className="text-2xl font-black text-white">{creatorRetains.toFixed(1)}%</p>
      </div>

      <div className="space-y-3">
        {splits.map((split, i) => (
          <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Recipient {i + 1}</p>
              <button onClick={() => removeSplit(i)}><X size={12} className="text-white/30 hover:text-white" /></button>
            </div>
            <input
              value={split.displayName}
              onChange={e => updateSplit(i, 'displayName', e.target.value)}
              placeholder="Creator name..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 outline-none"
            />
            <input
              value={split.creatorUid}
              onChange={e => updateSplit(i, 'creatorUid', e.target.value.trim())}
              placeholder="User ID..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 outline-none"
            />
            <div className="flex items-center gap-2">
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
        disabled={saving || creatorRetains <= 0}
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
  const [showInternalLanding, setShowInternalLanding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenLanding = onOpenLanding ?? (() => setShowInternalLanding(true));

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
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#D40055] via-[#6B0099] to-[#FF8C00] px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95"
            >
              <Settings size={12} />
              Manage Plajah+
            </button>
          ) : isBoundToThisCreator ? (
            <button
              onClick={handleManageBilling}
              disabled={loading}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/15"
            >
              <Check size={12} className="text-green-400" />
              Subscribed
              <RefreshCw size={12} className="text-white/40" />
            </button>
          ) : (
            <button
              onClick={handleOpenLanding}
              className="group inline-flex h-[42px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00] px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-[#D40055]/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              <Zap size={12} />
              Plajah+
              <span className="opacity-60 transition-opacity group-hover:opacity-100">Subscribe</span>
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
              <SplitManager onClose={() => setShowModal(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Internal landing modal — used when no onOpenLanding prop is provided */}
      <AnimatePresence>
        {showInternalLanding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setShowInternalLanding(false); }}
          >
            <button
              onClick={() => setShowInternalLanding(false)}
              className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
            >
              <X size={18} />
            </button>
            <PlajahPlusLanding
              defaultCreatorId={creatorId}
              defaultCreatorName={creatorName}
              onClose={() => setShowInternalLanding(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PlajahPlusButton;

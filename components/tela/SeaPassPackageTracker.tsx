import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wine, Beer, Coffee, Utensils, Sparkles, Clock, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, History, MapPin, Info,
  ShieldCheck, RefreshCw, Zap, Award, QrCode, CreditCard, ChevronRight
} from 'lucide-react';
import { TicketPurchasedPackage, PackageRedemptionRecord } from '../../types';

interface Props {
  packages: TicketPurchasedPackage[];
  ticketId: string;
  holderName?: string;
  tierName?: string;
  onRedeem?: (packageId: string, itemName: string, stationName: string) => Promise<boolean>;
  compact?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<any>> = {
  ALCOHOL: Wine,
  DRINK: Coffee,
  FOOD_AND_BEVERAGE: Utensils,
  CUSTOM: Sparkles,
};

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
  ALCOHOL: {
    bg: 'rgba(236,72,153,0.12)',
    border: 'rgba(236,72,153,0.3)',
    text: '#f472b6',
    gradient: 'from-pink-500/20 via-rose-500/10 to-transparent',
  },
  DRINK: {
    bg: 'rgba(6,182,212,0.12)',
    border: 'rgba(6,182,212,0.3)',
    text: '#22d3ee',
    gradient: 'from-cyan-500/20 via-blue-500/10 to-transparent',
  },
  FOOD_AND_BEVERAGE: {
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
    text: '#fbbf24',
    gradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
  },
  CUSTOM: {
    bg: 'rgba(168,85,247,0.12)',
    border: 'rgba(168,85,247,0.3)',
    text: '#c084fc',
    gradient: 'from-purple-500/20 via-indigo-500/10 to-transparent',
  },
};

export const SeaPassPackageTracker: React.FC<Props> = ({
  packages,
  ticketId,
  holderName = 'Guest Attendee',
  tierName = 'General Admission',
  onRedeem,
  compact = false,
}) => {
  const [expandedPkgId, setExpandedPkgId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<TicketPurchasedPackage | null>(null);
  const [showRulesModal, setShowRulesModal] = useState<TicketPurchasedPackage | null>(null);
  const [now, setNow] = useState(Date.now());

  // Live timer tick for cooldown countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!packages || packages.length === 0) {
    return null;
  }

  const getCooldownInfo = (pkg: TicketPurchasedPackage) => {
    if (!pkg.cooldownMinutes || !pkg.lastRedeemedAt) {
      return { active: false, remainingSeconds: 0 };
    }
    const elapsedMs = now - pkg.lastRedeemedAt;
    const cooldownMs = pkg.cooldownMinutes * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      return { active: true, remainingSeconds };
    }
    return { active: false, remainingSeconds: 0 };
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Plajah Perks Identity Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-black/60 border border-blue-400/20 p-3.5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
              <Award size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Plajah Pass Perks</span>
                <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 text-[8px] font-black uppercase tracking-wider rounded-md border border-blue-400/20">Active</span>
              </div>
              <p className="text-xs font-bold text-white/90">
                {packages.length} Active {packages.length === 1 ? 'Package' : 'Packages'} Attached
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-white/40 uppercase tracking-widest font-mono">Card ID</p>
            <p className="text-[10px] font-mono font-bold text-white/70">{ticketId.slice(-8).toUpperCase()}</p>
          </div>
        </div>
      </div>

      {/* Package Cards List */}
      <div className="space-y-3">
        {packages.map((pkg) => {
          const cat = CATEGORY_COLORS[pkg.category] || CATEGORY_COLORS.CUSTOM;
          const Icon = CATEGORY_ICONS[pkg.category] || Sparkles;
          const isExpanded = expandedPkgId === pkg.id;
          const cooldown = getCooldownInfo(pkg);

          // Calculate remaining progress
          const isUnlimited = pkg.type === 'UNLIMITED';
          const isCredits = pkg.type === 'QUANTITY_CREDITS';
          const isValue = pkg.type === 'VALUE_ALLOWANCE';

          let progressPct = 100;
          if (!isUnlimited && pkg.totalUnits > 0) {
            progressPct = Math.max(0, Math.min(100, Math.round((pkg.remainingUnits / pkg.totalUnits) * 100)));
          }

          return (
            <motion.div
              key={pkg.id}
              layout
              className={`rounded-2xl border transition-all overflow-hidden ${
                isExpanded ? 'bg-white/[0.05] border-white/20 shadow-xl' : 'bg-white/[0.025] border-white/10 hover:border-white/15'
              }`}
            >
              {/* Card Banner */}
              <div className={`p-4 bg-gradient-to-r ${cat.gradient}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                      style={{ background: cat.bg, borderColor: cat.border, color: cat.text }}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-white leading-tight">{pkg.name}</h4>
                        {pkg.souvenirCupIncluded && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-black uppercase tracking-wider">
                            Cup Included
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 line-clamp-1 mt-0.5">
                        {pkg.eligibleItemsDescription || 'Included across participating venue stations'}
                      </p>
                    </div>
                  </div>

                  {/* Top Right Status Badge */}
                  <div className="text-right shrink-0">
                    {isUnlimited ? (
                      cooldown.active ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                          <Clock size={11} className="animate-spin" />
                          <span>{formatSeconds(cooldown.remainingSeconds)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Ready</span>
                        </div>
                      )
                    ) : (
                      <div className="text-right">
                        <span className="text-sm font-black text-white">
                          {isValue ? `$${(pkg.remainingUnits / 100).toFixed(2)}` : pkg.remainingUnits}
                        </span>
                        <span className="text-[10px] text-white/40 block">
                          of {isValue ? `$${(pkg.totalUnits / 100).toFixed(2)}` : `${pkg.totalUnits} ${pkg.unitName}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress / Allowance Gauge */}
                {!isUnlimited && (
                  <div className="mt-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/40 font-semibold uppercase tracking-wider">Remaining Allowance</span>
                      <span className="font-bold font-mono" style={{ color: cat.text }}>
                        {progressPct}% Left
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden border border-white/5 p-0.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${cat.text}99, ${cat.text})`,
                        }}
                      />
                    </div>

                    {/* Visual Token Icons for Quantity Credits (e.g. 5 Drinks) */}
                    {isCredits && pkg.totalUnits <= 10 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        {Array.from({ length: pkg.totalUnits }).map((_, i) => {
                          const isClaimed = i >= pkg.remainingUnits;
                          return (
                            <div
                              key={i}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] border transition-all ${
                                isClaimed
                                  ? 'bg-black/30 border-white/5 text-white/20 line-through'
                                  : 'bg-white/10 border-white/20 text-white shadow-sm'
                              }`}
                              style={!isClaimed ? { borderColor: `${cat.text}60`, color: cat.text } : {}}
                            >
                              <Icon size={12} className={isClaimed ? 'opacity-20' : 'opacity-100'} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Unlimited Cooldown Alert Banner */}
                {isUnlimited && cooldown.active && (
                  <div className="mt-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="shrink-0" />
                      <span className="text-[11px]">Pacing cooldown timer active</span>
                    </div>
                    <span className="font-mono font-bold text-xs">
                      {formatSeconds(cooldown.remainingSeconds)}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Ribbon & Accordion Controls */}
              <div className="px-4 py-2.5 bg-black/40 border-t border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowRulesModal(pkg)}
                    className="flex items-center gap-1 text-[11px] font-bold text-white/50 hover:text-white transition-colors"
                  >
                    <Info size={12} />
                    <span>Eligible Items</span>
                  </button>

                  <button
                    onClick={() => setShowHistoryModal(pkg)}
                    className="flex items-center gap-1 text-[11px] font-bold text-white/50 hover:text-white transition-colors"
                  >
                    <History size={12} />
                    <span>Ledger ({pkg.redemptions?.length || 0})</span>
                  </button>
                </div>

                <button
                  onClick={() => setExpandedPkgId(isExpanded ? null : pkg.id)}
                  className="flex items-center gap-1 text-[11px] font-bold text-white/60 hover:text-white transition-colors"
                >
                  <span>{isExpanded ? 'Less' : 'Details'}</span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* Expanded Tray */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/5 p-4 bg-black/60 space-y-3 text-xs"
                  >
                    {/* Stations */}
                    {pkg.stations && pkg.stations.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5 flex items-center gap-1">
                          <MapPin size={10} /> Participating Bars & Stations
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {pkg.stations.map((st, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/80 font-medium"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Eligible Inclusions */}
                    {pkg.eligibleItems && pkg.eligibleItems.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5 flex items-center gap-1">
                          <CheckCircle2 size={10} className="text-emerald-400" /> Included Items
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {pkg.eligibleItems.map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-medium"
                            >
                              ✓ {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Staff Anti-Abuse Rules */}
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] text-white/40 space-y-1">
                      <p className="font-bold text-white/60">Pass Guidelines:</p>
                      <p>• 1 item dispensed per pass per order. Pass cannot be shared or transferred.</p>
                      {pkg.cooldownMinutes && (
                        <p>• {pkg.cooldownMinutes}-minute cooling-off period enforced between orders.</p>
                      )}
                      <p>• Show this screen or your pass QR code to bartender or server.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Eligible Items Modal */}
      <AnimatePresence>
        {showRulesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setShowRulesModal(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#121214] border border-white/15 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Inclusions Menu</span>
                  <h3 className="text-base font-black text-white">{showRulesModal.name}</h3>
                </div>
                <button
                  onClick={() => setShowRulesModal(null)}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-white/70 leading-relaxed">
                {showRulesModal.description}
              </p>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Eligible Menu Items</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(showRulesModal.eligibleItems || ['Craft Draft Beers', 'Specialty Cocktails', 'Zero-Proof Beverages']).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowRulesModal(null)}
                className="w-full py-3 bg-white text-black font-black text-xs uppercase tracking-wider rounded-xl hover:bg-white/90"
              >
                Got It
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Redemption Ledger Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setShowHistoryModal(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#121214] border border-white/15 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Real-Time Ledger</span>
                  <h3 className="text-base font-black text-white">{showHistoryModal.name}</h3>
                </div>
                <button
                  onClick={() => setShowHistoryModal(null)}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {(!showHistoryModal.redemptions || showHistoryModal.redemptions.length === 0) ? (
                  <div className="text-center py-8 text-white/40 text-xs">
                    <History size={24} className="mx-auto mb-2 opacity-30" />
                    <p className="font-bold">No redemptions yet</p>
                    <p className="text-[10px] text-white/30">Head to any participating bar to claim your first drink!</p>
                  </div>
                ) : (
                  showHistoryModal.redemptions.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/8 flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-white">{rec.itemName}</p>
                        <p className="text-[10px] text-white/40 flex items-center gap-1">
                          <MapPin size={9} /> {rec.stationName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block">
                          -{rec.unitsRedeemed} {showHistoryModal.unitName}
                        </span>
                        <span className="text-[9px] text-white/30 font-mono">
                          {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setShowHistoryModal(null)}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-wider rounded-xl"
              >
                Close Ledger
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const PackagePerksTracker = SeaPassPackageTracker;
export default SeaPassPackageTracker;

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Plus, LogOut, ChevronRight, Zap, X, Check, Keyboard } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';

export interface LinkedAccount {
  slot: 1 | 2 | 3 | 4;
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: string;
  lastUsed?: number;
}

interface AccountSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  linkedAccounts: LinkedAccount[];
  onSwitchAccount: (slot: 1 | 2 | 3 | 4) => Promise<void>;
  onAddAccount: () => Promise<void>;
  onSignOut: () => Promise<void>;
  hotSwitchSlot?: number | null;
}

const SLOT_COLORS = {
  1: { bg: 'rgba(107,0,153,0.25)', border: 'rgba(107,0,153,0.5)', glow: '#6B0099' },
  2: { bg: 'rgba(255,140,0,0.2)', border: 'rgba(255,140,0,0.5)', glow: '#FF8C00' },
  3: { bg: 'rgba(0,112,255,0.2)', border: 'rgba(0,112,255,0.5)', glow: '#0070FF' },
  4: { bg: 'rgba(0,200,120,0.2)', border: 'rgba(0,200,120,0.5)', glow: '#00C878' },
};

function Avatar({ user, size = 40 }: { user: { photoURL?: string; displayName?: string } | null; size?: number }) {
  return (
    <div
      className="rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {user?.photoURL
        ? <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
        : <User size={size * 0.4} className="text-white/40" />
      }
    </div>
  );
}

function SlotBadge({ slot }: { slot: 1 | 2 | 3 | 4 }) {
  const c = SLOT_COLORS[slot];
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      {slot}
    </span>
  );
}

export default function AccountSwitcher({
  isOpen, onClose, currentUser, linkedAccounts, onSwitchAccount, onAddAccount, onSignOut, hotSwitchSlot
}: AccountSwitcherProps) {
  const [switching, setSwitching] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSwitch = async (slot: 1 | 2 | 3 | 4) => {
    setSwitching(slot);
    try {
      await onSwitchAccount(slot);
    } finally {
      setSwitching(null);
    }
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      await onAddAccount();
    } finally {
      setAdding(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  // Current user's slot (if any)
  const currentSlot = linkedAccounts.find(a => a.uid === currentUser?.uid)?.slot;

  const filledSlots = new Set(linkedAccounts.map(a => a.slot));
  const canAddMore = linkedAccounts.length < 4;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-[301] bottom-24 left-6 w-80"
            style={{
              background: 'rgba(8,6,12,0.92)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '1.5rem',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.07]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white">Accounts</p>
                <p className="text-[8px] font-bold text-white/30 mt-0.5 uppercase tracking-widest">Switch · Manage · Hot Switch</p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all"
              >
                <X size={12} className="text-white/40" />
              </button>
            </div>

            {/* Current account */}
            {currentUser && (
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/25 mb-3">Active</p>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar user={currentUser} size={40} />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#08060c]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{currentUser.displayName || 'You'}</p>
                    <p className="text-[8px] text-white/35 truncate">{currentUser.email}</p>
                  </div>
                  {currentSlot && <SlotBadge slot={currentSlot} />}
                </div>
              </div>
            )}

            {/* Linked accounts */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/25 mb-3">
                Linked Slots
                <span className="ml-2 text-white/15 font-bold normal-case tracking-normal">Insert + 1-4 to hot switch</span>
              </p>

              {([1, 2, 3, 4] as const).map(slot => {
                const acc = linkedAccounts.find(a => a.slot === slot);
                const isActive = acc?.uid === currentUser?.uid;
                const isSwitchingThis = switching === slot;
                const isHotTarget = hotSwitchSlot === slot;
                const colors = SLOT_COLORS[slot];

                return (
                  <motion.div
                    key={slot}
                    animate={isHotTarget ? { scale: [1, 1.03, 1] } : {}}
                    transition={{ duration: 0.4, repeat: isHotTarget ? Infinity : 0 }}
                  >
                    {acc ? (
                      <button
                        onClick={() => !isActive && handleSwitch(slot)}
                        disabled={isActive || isSwitchingThis}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left"
                        style={isActive
                          ? { background: colors.bg, border: `1px solid ${colors.border}`, boxShadow: `0 0 20px ${colors.glow}22` }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }
                        }
                      >
                        <SlotBadge slot={slot} />
                        <Avatar user={acc} size={32} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{acc.displayName || acc.email}</p>
                          <p className="text-[7px] text-white/35 truncate">{acc.email}</p>
                        </div>
                        {isActive
                          ? <Check size={12} className="text-white/50 shrink-0" />
                          : isSwitchingThis
                            ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}>
                                <Zap size={12} className="text-white/30 shrink-0" />
                              </motion.div>
                            : <ChevronRight size={12} className="text-white/20 shrink-0" />
                        }
                      </button>
                    ) : (
                      <button
                        onClick={handleAdd}
                        disabled={adding}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left border border-dashed border-white/10 hover:border-white/20 hover:bg-white/[0.03]"
                      >
                        <SlotBadge slot={slot} />
                        <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center">
                          <Plus size={12} className="text-white/25" />
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Add account</p>
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Hot switch hint */}
            <div className="mx-5 mb-4 px-3 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start gap-2">
                <Keyboard size={11} className="text-white/20 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Hot Switch</p>
                  <p className="text-[7px] text-white/20 mt-0.5 leading-relaxed">Hold <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/40 font-mono text-[6px]">Insert</kbd> + <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/40 font-mono text-[6px]">1–4</kbd> to instantly jump between linked slots. Credentials must be saved or linked.</p>
                </div>
              </div>
            </div>

            {/* Sign out */}
            <div className="px-5 pb-5 border-t border-white/[0.07] pt-4">
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all hover:bg-red-500/10 border border-transparent hover:border-red-500/20 group"
              >
                <div className="w-7 h-7 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0 group-hover:bg-red-500/20 transition-all">
                  <LogOut size={12} className="text-red-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400/70 group-hover:text-red-400 transition-all">
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </p>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hot-switch overlay — shown briefly when Insert+N is pressed
export function HotSwitchOverlay({ slot, account, active }: { slot: number; account?: LinkedAccount; active: boolean }) {
  const colors = SLOT_COLORS[slot as 1 | 2 | 3 | 4] ?? SLOT_COLORS[1];
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none"
        >
          <div
            className="flex flex-col items-center gap-4 px-10 py-8 rounded-[2rem]"
            style={{
              background: 'rgba(8,6,12,0.95)',
              border: `1px solid ${colors.border}`,
              boxShadow: `0 0 80px ${colors.glow}33, 0 0 200px ${colors.glow}11`,
              backdropFilter: 'blur(32px)',
            }}
          >
            <motion.div
              animate={{ boxShadow: [`0 0 20px ${colors.glow}44`, `0 0 50px ${colors.glow}88`, `0 0 20px ${colors.glow}44`] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ background: colors.bg, border: `2px solid ${colors.border}` }}
            >
              {account?.photoURL
                ? <img src={account.photoURL} alt="" className="w-full h-full object-cover" />
                : <User size={28} className="text-white/50" />
              }
            </motion.div>
            <div className="text-center">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Hot Switching</p>
              <p className="text-base font-black uppercase tracking-tight text-white">
                {account ? account.displayName || account.email : `Slot ${slot}`}
              </p>
              {account?.email && <p className="text-[9px] text-white/30 mt-0.5">{account.email}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <Zap size={10} className="text-white/30" />
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Slot {slot}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

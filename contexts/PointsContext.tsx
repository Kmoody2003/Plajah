import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Coins, Zap } from 'lucide-react';
import {
  fetchUserPointsBalance,
  addPoints as firebaseAddPoints,
  redeemPlajahBucks as firebaseRedeemBucks,
  fetchUserTransactionHistory,
} from '../services/pointsService';
import { UserPointsBalance, PointsTransaction } from '../types';

interface PointsContextType {
  balance: UserPointsBalance | null;
  transactions: PointsTransaction[];
  addPoints: (amount: number, type: PointsTransaction['type'], source?: string) => void;
  redeemBucks: (bucks: number, description: string) => void;
  loadBalance: (userId: string) => void;
  loadTransactionHistory: (userId: string) => void;
  isLoading: boolean;
}

const PointsContext = createContext<PointsContextType | undefined>(undefined);

export const PointsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [balance, setBalance] = useState<UserPointsBalance | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{ amount: number; type: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const loadBalance = useCallback(async (userId: string) => {
    setCurrentUserId(userId);
    setIsLoading(true);
    try {
      const bal = await fetchUserPointsBalance(userId);
      setBalance(bal);
    } catch (error) {
      console.error('Error loading points balance:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTransactionHistory = useCallback(async (userId: string) => {
    try {
      const txns = await fetchUserTransactionHistory(userId, 50);
      setTransactions(txns);
    } catch (error) {
      console.error('Error loading transaction history:', error);
    }
  }, []);

  const fireNotification = useCallback((amount: number, type: 'EARNED' | 'REDEEMED') => {
    setActiveNotification({ amount, type });
  }, []);

  const addPoints = useCallback(
    async (amount: number, type: PointsTransaction['type'], source?: string) => {
      if (!currentUserId) return;

      try {
        const success = await firebaseAddPoints(currentUserId, amount, type, source);
        if (success) {
          await loadBalance(currentUserId);
          fireNotification(amount, 'EARNED');
        }
      } catch (error) {
        console.error('Error adding points:', error);
      }
    },
    [currentUserId, loadBalance, fireNotification]
  );

  const redeemBucks = useCallback(
    async (bucks: number, description: string) => {
      if (!currentUserId) return;

      try {
        const success = await firebaseRedeemBucks(currentUserId, bucks, description);
        if (success) {
          await loadBalance(currentUserId);
          fireNotification(bucks, 'REDEEMED');
        }
      } catch (error) {
        console.error('Error redeeming bucks:', error);
      }
    },
    [currentUserId, loadBalance, fireNotification]
  );

  return (
    <PointsContext.Provider
      value={{
        balance,
        transactions,
        addPoints,
        redeemBucks,
        loadBalance,
        loadTransactionHistory,
        isLoading,
      }}
    >
      {children}

      <AnimatePresence>
        {activeNotification && (
          <motion.div
            key="points-notification"
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
            onAnimationComplete={() => { setTimeout(() => setActiveNotification(null), 4000); }}
            className="fixed top-8 right-8 z-[999] pointer-events-none"
          >
            <div className={`${
              activeNotification.type === 'EARNED'
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/40'
                : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/40'
            } backdrop-blur-2xl rounded-xl p-4 flex items-center gap-3`}>
              {activeNotification.type === 'EARNED' ? (
                <Zap size={20} className="text-green-400" />
              ) : (
                <Coins size={20} className="text-purple-400" />
              )}
              <div>
                <p className="text-sm font-bold text-white">
                  {activeNotification.type === 'EARNED' ? '+' : '-'}{activeNotification.amount}
                </p>
                <p className="text-xs text-white/60">
                  {activeNotification.type === 'EARNED' ? 'Points Earned' : 'Plajah Bucks Redeemed'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PointsContext.Provider>
  );
};

export const usePoints = () => {
  const context = useContext(PointsContext);
  if (!context) throw new Error('usePoints must be used within PointsProvider');
  return context;
};

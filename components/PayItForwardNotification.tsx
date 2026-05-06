import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Gift, ArrowRight, X } from 'lucide-react';
import { PayItForwardWinner } from '../types';
import { claimPayItForward, passPayItForward } from '../services/backendService';

interface PayItForwardNotificationProps {
  winnerRecord: PayItForwardWinner | null;
  onClose: () => void;
}

const PayItForwardNotification: React.FC<PayItForwardNotificationProps> = ({ winnerRecord, onClose }) => {
  if (!winnerRecord) return null;

  const handleClaim = async () => {
    if (!winnerRecord.id) return;
    await claimPayItForward(winnerRecord.id);
    onClose();
    alert('Congratulations! The blessing has been claimed and added to your account.');
  };

  const handlePass = async () => {
    if (!winnerRecord.id) return;
    await passPayItForward(winnerRecord.id);
    onClose();
    alert('You have chosen to Pay It Forward! The blessing will be added to tomorrow\'s pool.');
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 100, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.9 }}
        className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4"
      >
        <div className="bg-[#111] border-2 border-small-orange rounded-3xl p-6 shadow-2xl shadow-small-orange/20 overflow-hidden relative">
          {/* Background Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-small-orange/20 blur-[60px] -z-10" />
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-small-orange flex items-center justify-center shrink-0 shadow-lg shadow-small-orange/40">
              <Gift className="text-white" size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">You've Been Selected!</h3>
                <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-white/60 leading-relaxed mb-6">
                You are today's "Pay It Forward" recipient. You can claim this blessing now, or pay it forward to make the pot even bigger for someone else tomorrow.
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleClaim}
                  className="py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all active:scale-[0.98]"
                >
                  Claim Blessing
                </button>
                <button 
                  onClick={handlePass}
                  className="py-3 bg-white/5 border border-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  Pay It Forward
                  <ArrowRight size={12} className="text-small-orange" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-center gap-2">
            <Heart size={12} className="text-small-orange" fill="currentColor" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Plajah Charity Foundation</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PayItForwardNotification;

import React, { useState } from 'react';
import { Heart, X, Check, DollarSign, MessageSquare, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { processDonation, auth } from '../services/backendService';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  toId: string;
  toName: string;
  albumId?: string;
  albumTitle?: string;
}

const DonationModal: React.FC<DonationModalProps> = ({ 
  isOpen, 
  onClose, 
  toId, 
  toName, 
  albumId, 
  albumTitle 
}) => {
  const [amount, setAmount] = useState<number>(10);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleDonate = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await processDonation({
        fromId: auth.currentUser.uid,
        fromName: auth.currentUser.displayName || 'Anonymous Supporter',
        toId,
        albumId,
        amount,
        message
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Donation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const presets = [5, 10, 25, 50, 100];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-theme-card border border-white/10 rounded-[3rem] p-10 shadow-3xl overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-small-orange/20 rounded-full blur-[100px] pointer-events-none" />
            
            <button 
              onClick={onClose}
              className="absolute top-8 right-8 p-3 hover:bg-white/5 rounded-full transition-all"
            >
              <X size={20} />
            </button>

            {success ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-8">
                  <Check size={48} className="text-green-500" />
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tightest mb-4">Gifts & tips Received!</h2>
                <p className="text-white/40 uppercase font-bold text-[10px] tracking-widest">Your contribution has been sent to {toName}.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-4 bg-small-orange/10 rounded-2xl">
                    <Heart size={24} className="text-small-orange fill-small-orange" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tightest">Gifts & tips for {toName}</h2>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                      {albumTitle ? `Contributing to: ${albumTitle}` : 'Direct Artist Support'}
                    </p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 block">Select Gift Amount</label>
                    <div className="grid grid-cols-5 gap-3 mb-6">
                      {presets.map((p) => (
                        <button
                          key={p}
                          onClick={() => setAmount(p)}
                          className={`py-4 rounded-2xl font-black text-xs transition-all border ${
                            amount === p 
                              ? 'bg-white text-black border-white shadow-xl scale-105' 
                              : 'bg-white/5 text-white border-white/5 hover:bg-white/10'
                          }`}
                        >
                          ${p}
                        </button>
                      ))}
                    </div>
                    
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" />
                      <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl py-5 pl-14 pr-6 outline-none focus:border-small-orange/50 transition-all font-black text-lg"
                        placeholder="Custom Gift Amount"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 block">Add a Message (Optional)</label>
                    <div className="relative">
                      <MessageSquare size={16} className="absolute left-6 top-6 text-white/20" />
                      <textarea 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-[2rem] py-5 pl-14 pr-6 outline-none focus:border-small-orange/50 transition-all text-sm min-h-[120px] resize-none"
                        placeholder="Say something nice..."
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleDonate}
                    disabled={loading || amount <= 0}
                    className="w-full py-6 bg-white text-black rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Send Gift
                      </>
                    )}
                  </button>
                  
                  <p className="text-center text-[9px] font-bold text-white/20 uppercase tracking-widest leading-relaxed">
                    100% of your gift goes directly to the artist.<br/>Thank you for your generosity.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DonationModal;

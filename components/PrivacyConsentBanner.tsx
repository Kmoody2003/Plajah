import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const CONSENT_KEY = 'plajah_privacy_consent_v1';

const PrivacyConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONSENT_KEY);
      if (!saved) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = (all: boolean) => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ accepted: true, analytics: all, timestamp: Date.now() }));
    } catch {}
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', damping: 24 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-2xl px-4"
        >
          <div className="bg-black/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="p-6 flex items-start gap-4">
              <div className="p-3 bg-small-orange/20 rounded-xl shrink-0 mt-0.5">
                <Shield size={20} className="text-small-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Your Privacy Matters</h3>
                  <button onClick={() => accept(false)} className="p-1.5 text-white/30 hover:text-white transition-colors shrink-0">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-[10px] text-white/50 uppercase tracking-widest leading-relaxed mb-4">
                  Plajah uses essential cookies for authentication and preferences. We do not sell your data. Private messages are encrypted at rest. You can delete your account and all associated data at any time.
                </p>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-4"
                    >
                      <div className="space-y-2 text-[9px] text-white/40 uppercase tracking-widest leading-relaxed border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                        <p><span className="text-white/60 font-bold">Data collected:</span> Display name, profile photo, content you upload, interactions (plays, follows, comments).</p>
                        <p><span className="text-white/60 font-bold">Data NOT collected:</span> Your private messages are AES-256 encrypted — we cannot read them. Login email is never shown publicly.</p>
                        <p><span className="text-white/60 font-bold">GDPR / International:</span> EU users have the right to access, correct, and erase their data. Request deletion via Settings → Account → Delete Account.</p>
                        <p><span className="text-white/60 font-bold">Children:</span> Plajah is not directed to users under 13. Do not use if you are under 13 (16 in the EU without parental consent).</p>
                        <p><span className="text-white/60 font-bold">Retention:</span> Account data is kept while your account is active. Content you delete is removed from our servers within 30 days.</p>
                        <p><span className="text-white/60 font-bold">Third parties:</span> We use Firebase (Google) for authentication and storage, governed by Google's Privacy Policy.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => accept(true)}
                    className="px-6 py-2.5 bg-white text-black rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all"
                  >
                    Accept All
                  </button>
                  <button
                    onClick={() => accept(false)}
                    className="px-6 py-2.5 bg-white/5 border border-white/10 text-white/60 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Essential Only
                  </button>
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-1 px-4 py-2.5 text-white/30 hover:text-white text-[9px] font-black uppercase tracking-widest transition-colors"
                  >
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {expanded ? 'Less' : 'Details'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PrivacyConsentBanner;

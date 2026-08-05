import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, X } from 'lucide-react';
import PlajahPlusLanding from './PlajahPlusLanding';

interface PlajahPlusPillProps {
  creatorId: string;
  creatorName: string;
  size?: 'XS' | 'SM';
}

const PlajahPlusPill: React.FC<PlajahPlusPillProps> = ({ creatorId, creatorName, size = 'SM' }) => {
  const [showLanding, setShowLanding] = useState(false);

  return (
    <>
      <motion.button
        onClick={e => { e.stopPropagation(); setShowLanding(true); }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white font-black uppercase tracking-widest shadow-md shadow-[#D40055]/20 hover:shadow-[#D40055]/40 transition-all ${
          size === 'XS'
            ? 'px-2 py-0.5 text-[7px] gap-0.5'
            : 'px-2.5 py-1 text-[8px]'
        }`}
        title={`Subscribe to ${creatorName} on Plajah+`}
      >
        <Zap size={size === 'XS' ? 7 : 9} />
        <span>Plajah+</span>
      </motion.button>

      <AnimatePresence>
        {showLanding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setShowLanding(false); }}
          >
            <button
              onClick={() => setShowLanding(false)}
              className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
            >
              <X size={18} />
            </button>
            <PlajahPlusLanding
              defaultCreatorId={creatorId}
              defaultCreatorName={creatorName}
              onClose={() => setShowLanding(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PlajahPlusPill;

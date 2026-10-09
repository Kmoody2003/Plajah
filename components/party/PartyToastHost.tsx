// PartyToastHost — renders partyToast() messages as gentle bottom pills (auto-dismiss, no modals).
// Mounted by App (for join-time notices) and by every PartyBar; a singleton guard makes sure only
// the first mounted instance renders, so toasts never double up.

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PARTY_TOAST_EVENT } from './partyToast';

let activeHosts = 0;

const PartyToastHost: React.FC = () => {
  const [owner, setOwner] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: string }[]>([]);

  useEffect(() => {
    activeHosts += 1;
    const mine = activeHosts === 1;
    setOwner(mine);
    if (!mine) return () => { activeHosts -= 1; };
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const id = Date.now() + Math.random();
      setToasts(t => [...t.slice(-2), { id, message: String(d.message || ''), tone: d.tone || 'info' }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
    };
    window.addEventListener(PARTY_TOAST_EVENT, on);
    return () => { activeHosts -= 1; window.removeEventListener(PARTY_TOAST_EVENT, on); };
  }, []);

  if (!owner) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2 pointer-events-none w-[calc(100vw-32px)] max-w-md">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="px-4 py-2 rounded-full text-xs font-bold text-white text-center" role="status"
            style={{
              background: 'rgba(10,10,14,0.78)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
              boxShadow: 'var(--pj-elev-3, 0 10px 28px rgba(0,0,0,0.45))',
              border: `1px solid ${t.tone === 'warn' ? 'var(--pj-warning)' : t.tone === 'good' ? 'var(--pj-success)' : 'rgba(255,255,255,0.12)'}`,
            }}>
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PartyToastHost;

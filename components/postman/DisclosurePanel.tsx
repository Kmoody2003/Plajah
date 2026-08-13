import React from 'react';
import { motion } from 'motion/react';
import { Check, ExternalLink, X } from 'lucide-react';
import { IconButton } from '../ui';

/**
 * The honesty. Shown before first use and reachable from the header forever.
 * Every line here is a claim the code actually keeps — see the acceptance criteria
 * in the Source Mode spec. Nothing in this panel overstates what Phase 1 does,
 * because a journalist who trusts an overstated claim can get a source hurt.
 */
const DisclosurePanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
    className="fixed inset-0 z-[130] grid place-items-center p-4 sm:p-6 bg-black/70 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-label="What Source Mode does and does not do"
  >
    <motion.div
      initial={{ scale: 0.96, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.96, y: 20 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      onClick={(e) => e.stopPropagation()}
      className="pj-surface pj-surface--5 pj-surface--sheet w-full max-w-lg max-h-[88vh] overflow-y-auto"
      style={{ padding: 0 }}
    >
      <div
        className="px-6 py-4 border-b border-theme flex items-center justify-between sticky top-0 z-10"
        style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}
      >
        <h2 className="type-title-md">How Source Mode protects you</h2>
        <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X /></IconButton>
      </div>

      <div className="px-6 py-6 flex flex-col gap-6 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
        <section>
          <h3 className="pj-eyebrow mb-3" style={{ color: 'var(--pj-success)' }}>What it does</h3>
          <ul className="flex flex-col gap-2.5">
            {[
              'Your vault is encrypted on your device. Plajah cannot read it, and cannot recover it if you lose your passphrase.',
              'Protected conversations are never sent to AI features.',
              'Notifications for protected threads show no sender and no message text.',
              'Photos you send in a protected thread have their location and camera data removed.',
              'Protected messages can delete themselves on your schedule, and are left out of data exports.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check size={15} className="text-state-success shrink-0 mt-0.5" />
                <span style={{ color: 'var(--text-primary)' }}>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="pj-eyebrow mb-3" style={{ color: 'var(--pj-danger)' }}>What it does not do</h3>
          <ul className="flex flex-col gap-2.5">
            {[
              'Plajah can still read the messages themselves. End-to-end encryption is coming; it is not here yet.',
              'It does not hide your IP address, or theirs. We can see roughly where you connect from, and so can your internet provider.',
              'It does not hide that you two talked, or when.',
              'It cannot protect you from the other person’s device, or their choices.',
              'If a court orders us to hand over what we hold, we have to.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <X size={15} className="text-state-danger shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card border border-theme p-4" style={{ background: 'var(--glass-1)' }}>
          <h3 className="pj-eyebrow mb-2">If you need real anonymity</h3>
          <p className="leading-relaxed">
            For anonymous source submission, use <b style={{ color: 'var(--text-primary)' }}>SecureDrop</b>.
            For conversations that must not be traceable, use <b style={{ color: 'var(--text-primary)' }}>Signal</b>.
            Both are free, and both are built for a threat model this feature does not meet.
          </p>
          <div className="flex flex-wrap gap-4 mt-3">
            <a href="https://securedrop.org/" target="_blank" rel="noopener noreferrer nofollow"
               className="inline-flex items-center gap-1.5 text-brand-orange text-xs font-bold">
              SecureDrop <ExternalLink size={12} />
            </a>
            <a href="https://signal.org/" target="_blank" rel="noopener noreferrer nofollow"
               className="inline-flex items-center gap-1.5 text-brand-orange text-xs font-bold">
              Signal <ExternalLink size={12} />
            </a>
          </div>
        </section>
      </div>
    </motion.div>
  </motion.div>
);

export default DisclosurePanel;

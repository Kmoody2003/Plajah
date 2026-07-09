import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bug, X, ShieldCheck, Check, Loader2 } from 'lucide-react';
import { reportBug } from '../services/errorReporting';

interface BugReportButtonProps {
  /** Current app view, attached to the report for context. */
  currentView?: string;
}

/**
 * A platform-wide "Report a bug" affordance. On submit it files a report to the
 * admin error store with the user's last 5 minutes of session activity attached
 * automatically (see sessionTrace + reportBug).
 */
const BugReportButton: React.FC<BugReportButtonProps> = ({ currentView }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'warning' | 'error'>('warning');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Opened from the main navigation "More" drawer (the floating button was removed).
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener('OPEN_BUG_REPORT', h);
    return () => window.removeEventListener('OPEN_BUG_REPORT', h);
  }, []);

  const submit = async () => {
    if (!message.trim() || state === 'sending') return;
    setState('sending');
    const ok = await reportBug({ message: message.trim(), currentView, severity });
    setState(ok ? 'sent' : 'error');
    if (ok) {
      setTimeout(() => { setOpen(false); setMessage(''); setState('idle'); setSeverity('warning'); }, 1800);
    }
  };

  return (
    <>
      {/* Trigger lives in the main navigation "More" drawer — this component only
          renders the modal, opened via the OPEN_BUG_REPORT event. */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => state !== 'sending' && setOpen(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#0c0c0e] border border-white/12 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <Bug size={16} className="text-[#EF4444]" />
                  <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Report a bug</span>
                </div>
                <button onClick={() => setOpen(false)} disabled={state === 'sending'} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-colors disabled:opacity-40">
                  <X size={15} />
                </button>
              </div>

              {state === 'sent' ? (
                <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#10B981]/15 flex items-center justify-center"><Check size={22} className="text-[#10B981]" /></div>
                  <p className="text-sm font-black text-white">Thank you — report sent</p>
                  <p className="text-[11px] text-white/45 max-w-xs">Our team can now see exactly what led up to this. We'll look into it.</p>
                </div>
              ) : (
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40">What happened?</label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      autoFocus
                      rows={4}
                      placeholder="Describe what went wrong or what you expected to happen…"
                      className="mt-2 w-full bg-white/[0.05] border border-white/12 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/30 transition-colors resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Severity</span>
                    {(['warning', 'error'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setSeverity(s)}
                        className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${severity === s ? (s === 'error' ? 'bg-[#EF4444] text-white' : 'bg-[#F59E0B] text-black') : 'bg-white/[0.06] text-white/40 hover:text-white'}`}
                      >
                        {s === 'warning' ? 'Annoying' : 'Broken'}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 text-[10px] text-white/40 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2.5 leading-relaxed">
                    <ShieldCheck size={13} className="text-[#10B981] shrink-0 mt-0.5" />
                    <span>We'll automatically attach a log of your last 5 minutes (screens you visited, clicks, and errors) — never your passwords or what you typed — so we can reproduce it.</span>
                  </div>

                  {state === 'error' && <p className="text-[11px] text-[#EF4444] font-bold">Couldn't send — check your connection and try again.</p>}

                  <button
                    onClick={submit}
                    disabled={!message.trim() || state === 'sending'}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-black text-[11px] font-black uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {state === 'sending' ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Send report'}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BugReportButton;

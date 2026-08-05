import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Wrench, X, Sparkles, ArrowRight } from 'lucide-react';
import { LATEST_ENTRY_ID, entriesSince, majorEntries, minorEntries, ChangelogEntry } from '../data/changelog';
import { getPlatformInfo } from '../hooks/usePlatform';

// v2: we now store the newest changelog ENTRY id the user has acknowledged (not the hand-bumped
// APP_BUILD string). Bumping the key name migrates everyone cleanly — a v1 build string can no
// longer be mistaken for "unseen" and trigger a spurious one-time popup on this release.
const LAST_SEEN_KEY = 'plajah_last_seen_entry_v2';

/** Persist the acknowledged entry id to both stores (one flaky store can't make it recur). */
function markSeen() {
  try { localStorage.setItem(LAST_SEEN_KEY, LATEST_ENTRY_ID); } catch { /* */ }
  try { sessionStorage.setItem(LAST_SEEN_KEY, LATEST_ENTRY_ID); } catch { /* */ }
}

// Survives component REMOUNTS within a session (module scope, not React state). Without this, if the
// app subtree remounts — an ErrorBoundary auto-recovery, an app-reset — and localStorage.setItem is
// flaky (some TV WebViews / private mode), the panel re-appeared on every remount. Once we've shown
// it this session we never show it again, whatever the storage does.
let SHOWN_THIS_SESSION = false;

interface UpdateNotificationProps {
  /** Open the full What's-New history page. */
  onOpenChangelog: () => void;
}

/**
 * Shows a "what's new" panel the first time a user loads a new build. Splits the
 * release into Major (new capabilities) and Minor (fixes & refinements) columns.
 * Self-managing: reads/writes the last-seen build in localStorage.
 */
const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onOpenChangelog }) => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (SHOWN_THIS_SESSION) return;
    SHOWN_THIS_SESSION = true;
    // Never on a TV: this is a pointer-designed modal (click-to-dismiss, not D-pad focusable), and a
    // 10-foot viewer can't easily close it. The What's-New history stays reachable in Settings.
    try { if (getPlatformInfo().isTV) return; } catch { /* */ }
    let lastSeen: string | null = null;
    // Read from BOTH stores; writes go to both — so a flaky localStorage can't make it recur.
    try { lastSeen = localStorage.getItem(LAST_SEEN_KEY); } catch { /* */ }
    if (!lastSeen) { try { lastSeen = sessionStorage.getItem(LAST_SEEN_KEY); } catch { /* */ } }
    const fresh = entriesSince(lastSeen);
    if (fresh.length > 0) {
      setEntries(fresh);
      setShow(true);
      // Record "seen" the moment we SHOW it — not only when the user clicks dismiss. Closing the tab,
      // reloading, or ignoring the panel used to leave it unrecorded, so it reappeared every load.
      markSeen();
    } else {
      // Nothing genuinely new (already current / first visit / cleared storage): sync the marker
      // silently so the NEXT real entry is what triggers the panel, and this load stays quiet.
      markSeen();
    }
  }, []);

  const dismiss = () => {
    markSeen();
    setShow(false);
  };

  if (!show || entries.length === 0) return null;

  const majors = majorEntries(entries);
  const minors = minorEntries(entries);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl bg-[#0c0c0e] border border-white/12 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]"
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-5 border-b border-white/8 shrink-0">
            <div className="absolute inset-0 opacity-50" style={{ background: 'radial-gradient(120% 100% at 0% 0%, rgba(139,92,246,0.25), transparent 60%)' }} />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles size={15} className="text-[#C4B5FD]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">What's New on Plajah</span>
                </div>
                <p className="text-white/45 text-xs">We shipped {majors.length} new {majors.length === 1 ? 'feature' : 'features'} and {minors.length} {minors.length === 1 ? 'improvement' : 'improvements'}.</p>
              </div>
              <button onClick={dismiss} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-colors shrink-0">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Two columns: Major / Minor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/8 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Rocket size={13} className="text-[#8B5CF6]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#C4B5FD]">Major — New Features</span>
              </div>
              {majors.length === 0 ? (
                <p className="text-[11px] text-white/25">No major changes this release.</p>
              ) : (
                <ul className="space-y-3">
                  {majors.map(e => (
                    <li key={e.id}>
                      <p className="text-[12px] font-black text-white leading-tight">{e.title}</p>
                      <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">{e.plain}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Wrench size={13} className="text-white/50" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/45">Minor — Improvements</span>
              </div>
              {minors.length === 0 ? (
                <p className="text-[11px] text-white/25">No minor changes this release.</p>
              ) : (
                <ul className="space-y-3">
                  {minors.map(e => (
                    <li key={e.id}>
                      <p className="text-[12px] font-bold text-white/85 leading-tight">{e.title}</p>
                      <p className="text-[11px] text-white/45 leading-relaxed mt-0.5">{e.plain}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between gap-3 shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <button onClick={() => { dismiss(); onOpenChangelog(); }} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
              Full history <ArrowRight size={12} />
            </button>
            <button onClick={dismiss} className="px-5 py-2.5 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all">
              Got it
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpdateNotification;

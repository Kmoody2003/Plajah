import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, X } from 'lucide-react';
import { useFollowedLive } from '../hooks/useFollowedLive';
import type { LiveFeed } from '../types';

// Pop-up pills: when someone you follow is live, a stackable pill greets you (a few seconds) with a
// Watch button that jumps straight into the stream. Mobile → above the bottom nav; desktop → a
// bottom-right toast, deliberately BELOW the update notification (z-90 < the notification's z-100).

const SEEN_KEY = 'plajah_live_pill_seen_v1';
const AUTO_HIDE_MS = 9000;
const MAX_STACK = 3;

function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-60))); } catch { /* */ }
}

interface Props {
  uid: string | null | undefined;
  isMobile: boolean;
  onWatch: (feed: LiveFeed) => void;
}

const LiveFollowPills: React.FC<Props> = ({ uid, isMobile, onWatch }) => {
  const liveFeeds = useFollowedLive(uid);
  const [visible, setVisible] = useState<LiveFeed[]>([]);
  const seenRef = useRef<Set<string>>(loadSeen());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = (id: string) => {
    setVisible(v => v.filter(x => (x as any).id !== id));
    seenRef.current.add(id); saveSeen(seenRef.current);
    if (timersRef.current[id]) { clearTimeout(timersRef.current[id]); delete timersRef.current[id]; }
  };

  // Surface any newly-live follow we haven't shown yet; auto-hide each after a few seconds.
  useEffect(() => {
    const fresh = liveFeeds.filter(f => {
      const id = (f as any).id;
      return id && !seenRef.current.has(id) && !visible.some(v => (v as any).id === id);
    });
    if (!fresh.length) return;
    setVisible(v => [...v, ...fresh].slice(-MAX_STACK));
    fresh.forEach(f => {
      const id = (f as any).id;
      timersRef.current[id] = setTimeout(() => dismiss(id), AUTO_HIDE_MS);
    });
  }, [liveFeeds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout); }, []);

  if (!visible.length) return null;

  const watch = (f: LiveFeed) => { dismiss((f as any).id); onWatch(f); };

  return (
    <div
      className="fixed z-[90] pointer-events-none flex flex-col items-stretch gap-2"
      style={
        isMobile
          ? { left: 10, right: 10, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)' }
          : { right: 20, bottom: 20, width: 340 }
      }
    >
      <AnimatePresence>
        {visible.map(f => {
          const feed = f as any;
          return (
            <motion.div
              key={feed.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="pointer-events-auto flex items-center gap-3 pl-2 pr-2 py-2 rounded-2xl border border-white/12 shadow-2xl"
              style={{ background: 'linear-gradient(120deg, rgba(20,16,25,.96), rgba(28,10,24,.96))', backdropFilter: 'blur(10px)' }}
            >
              <div className="relative shrink-0">
                {feed.ownerPhoto
                  ? <img src={feed.ownerPhoto} alt="" className="w-11 h-11 rounded-full object-cover border border-white/15" />
                  : <div className="w-11 h-11 rounded-full bg-white/10" />}
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[7px] font-black uppercase tracking-widest leading-none">
                  <span className="w-1 h-1 rounded-full bg-white animate-pulse" />Live
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">{feed.ownerName || 'Someone'} is live</p>
                <p className="text-[10px] text-white/50 truncate">{feed.title || 'Tap to watch'}</p>
              </div>
              <button
                onClick={() => watch(f)}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-110"
                style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
              >
                <Play size={12} fill="currentColor" /> Watch
              </button>
              <button onClick={() => dismiss(feed.id)} aria-label="Dismiss" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default LiveFollowPills;

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, X, Radio } from 'lucide-react';
import { useFollowedLive } from '../hooks/useFollowedLive';
import type { LiveFeed } from '../types';

// Unobtrusive live alerts: When someone you follow goes live, surfaces as a lightweight
// push notification or a compact non-blocking top banner. Never overtakes the screen.
// Once dismissed, stays quiet unless a completely new broadcast begins, and remains accessible
// in the sliding Comms panel on the right.

const SEEN_KEY = 'plajah_live_seen_streams_v2';
const AUTO_HIDE_MS_MOBILE = 4500;
const AUTO_HIDE_MS_DESKTOP = 7000;

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveSeen(s: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-100)));
  } catch { /* */ }
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
    seenRef.current.add(id);
    saveSeen(seenRef.current);
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  };

  // Surface newly-live follows that haven't been seen yet
  useEffect(() => {
    const fresh = liveFeeds.filter(f => {
      const id = (f as any).id;
      return id && !seenRef.current.has(id) && !visible.some(v => (v as any).id === id);
    });

    if (!fresh.length) return;

    // Trigger OS Push Notification if permitted on Android / Web
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      fresh.forEach(f => {
        const feed = f as any;
        try {
          const notif = new Notification(`${feed.ownerName || 'Someone'} is live!`, {
            body: feed.title || 'Tap to watch on Plajah',
            icon: feed.ownerPhoto || '/pwa-192x192.png',
            tag: `live_${feed.id}`,
            silent: false,
          });
          notif.onclick = () => {
            window.focus();
            dismiss(feed.id);
            onWatch(f);
          };
        } catch { /* ignored */ }
      });
    }

    // On mobile, only show 1 compact banner at a time to prevent overtaking the screen
    const maxStack = isMobile ? 1 : 2;
    setVisible(v => [...v, ...fresh].slice(-maxStack));

    const timeout = isMobile ? AUTO_HIDE_MS_MOBILE : AUTO_HIDE_MS_DESKTOP;
    fresh.forEach(f => {
      const id = (f as any).id;
      timersRef.current[id] = setTimeout(() => dismiss(id), timeout);
    });
  }, [liveFeeds, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout); }, []);

  if (!visible.length) return null;

  const watch = (f: LiveFeed) => {
    dismiss((f as any).id);
    onWatch(f);
  };

  return (
    <div
      className="fixed z-[90] pointer-events-none flex flex-col items-center gap-2"
      style={
        isMobile
          ? { left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }
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
              initial={{ opacity: 0, y: isMobile ? -16 : 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isMobile ? -12 : 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className="pointer-events-auto w-full flex items-center gap-3 pl-3 pr-2 py-2 rounded-2xl border border-white/15 shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(24,12,32,0.96), rgba(12,6,18,0.96))',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="relative shrink-0">
                {feed.ownerPhoto ? (
                  <img src={feed.ownerPhoto} alt="" className="w-10 h-10 rounded-full object-cover border border-red-500/50" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center border border-red-500/40">
                    <Radio size={16} className="text-red-400" />
                  </div>
                )}
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1 py-0.2 rounded-full bg-red-600 text-white text-[6.5px] font-black uppercase tracking-wider leading-none">
                  <span className="w-1 h-1 rounded-full bg-white animate-pulse" />Live
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-white truncate">
                  {feed.ownerName || 'Channel'} is live
                </p>
                <p className="text-[10px] text-white/55 truncate">
                  {feed.title || 'Tap to watch live channel'}
                </p>
              </div>
              <button
                onClick={() => watch(f)}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-[9px] font-black uppercase tracking-widest hover:brightness-110 shadow-md"
                style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)' }}
              >
                <Play size={10} fill="currentColor" /> Watch
              </button>
              <button
                onClick={() => dismiss(feed.id)}
                aria-label="Dismiss alert"
                title="Dismiss (saved to Live tab)"
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default LiveFollowPills;

/**
 * Now Listening Bar
 *
 * Shows a live presence feed of followed users currently listening to music.
 * Uses a Firestore `now_listening` collection with TTL docs (auto-expire after 10 min).
 * Current user's presence is broadcast when they play a track.
 *
 * Unique to Plajah — no other streaming/social platform surfaces this in real time.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music2, Users, Headphones, Play, X, Radio } from 'lucide-react';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../services/backendService';
import { NowListeningPresence } from '../types';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

const PRESENCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Broadcast own presence ────────────────────────────────────────────────────

export async function broadcastNowListening(
  uid: string,
  track: { id: string; title: string; artist: string; albumCover?: string; albumId?: string },
  displayName: string,
  photoURL: string,
  isPublic = true
): Promise<void> {
  await setDoc(doc(db, 'now_listening', uid), {
    uid,
    displayName,
    photoURL,
    trackId: track.id,
    trackTitle: track.title,
    artist: track.artist,
    albumCover: track.albumCover || null,
    albumId: track.albumId || null,
    startedAt: Date.now(),
    isPublic,
    expiresAt: Date.now() + PRESENCE_TTL_MS,
    _serverTs: serverTimestamp(),
  });
}

export async function clearNowListening(uid: string): Promise<void> {
  try { await deleteDoc(doc(db, 'now_listening', uid)); } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NowListeningBarProps {
  followingIds: string[];
  onJoinSession?: (presence: NowListeningPresence) => void;
  compact?: boolean;
}

const NowListeningBar: React.FC<NowListeningBarProps> = ({
  followingIds,
  onJoinSession,
  compact = false,
}) => {
  const [presences, setPresences] = useState<NowListeningPresence[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentTrack } = useGlobalPlayerState();

  // Broadcast own presence when playing
  useEffect(() => {
    const u = auth.currentUser;
    if (!u || !currentTrack) return;
    broadcastNowListening(u.uid, {
      id: currentTrack.id,
      title: currentTrack.title,
      artist: currentTrack.artist,
      albumCover: currentTrack.albumCover,
      albumId: (currentTrack as any).albumId,
    }, u.displayName || 'Listener', u.photoURL || '').catch(() => {});

    const expire = setTimeout(() => clearNowListening(u.uid), PRESENCE_TTL_MS);
    return () => { clearTimeout(expire); clearNowListening(u.uid); };
  }, [currentTrack?.id]);

  // Listen to followed users' presence
  useEffect(() => {
    if (followingIds.length === 0) return;

    const now = Date.now();
    const unsub = onSnapshot(
      query(collection(db, 'now_listening'), where('isPublic', '==', true)),
      snap => {
        const live: NowListeningPresence[] = [];
        snap.docs.forEach(d => {
          const data = d.data() as any;
          // Only show followed users, exclude self, check not expired
          if (
            data.uid !== auth.currentUser?.uid &&
            followingIds.includes(data.uid) &&
            data.expiresAt > Date.now()
          ) {
            live.push(data as NowListeningPresence);
          }
        });
        live.sort((a, b) => b.startedAt - a.startedAt);
        setPresences(live);
      }
    );
    return () => unsub();
  }, [followingIds.join(',')]);

  if (presences.length === 0) return null;

  const displayed = isExpanded ? presences : presences.slice(0, 3);
  const minutesAgo = (ts: number) => {
    const m = Math.floor((Date.now() - ts) / 60_000);
    return m <= 0 ? 'just now' : `${m}m ago`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {presences.slice(0, 5).map(p => (
          <button
            key={p.uid}
            onClick={() => onJoinSession?.(p)}
            title={`${p.displayName} — ${p.trackTitle}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shrink-0"
          >
            <div className="relative">
              <img src={p.photoURL} className="w-5 h-5 rounded-full object-cover" alt="" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-black" />
            </div>
            <Music2 size={10} className="text-green-400 animate-pulse" />
            <span className="text-[9px] font-black text-white/60 max-w-[80px] truncate">{p.trackTitle}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <Headphones size={14} className="text-green-400" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest text-white/60">Now Listening</span>
          <span className="bg-green-400/20 border border-green-400/30 text-green-400 text-[8px] font-black px-1.5 py-0.5 rounded-full">
            {presences.length} live
          </span>
        </div>
        <Users size={13} className="text-white/25" />
      </button>

      {/* Presence list */}
      <div className="divide-y divide-white/5">
        {displayed.map(p => (
          <div key={p.uid} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group">
            <div className="relative shrink-0">
              <img src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.uid}`} className="w-9 h-9 rounded-full object-cover border border-white/10" alt="" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-black" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-white/80 truncate">{p.displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Music2 size={9} className="text-green-400 shrink-0" />
                <p className="text-[10px] text-white/45 truncate">
                  <span className="text-white/70">{p.trackTitle}</span>
                  {p.artist && <span className="text-white/30"> · {p.artist}</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[8px] text-white/25 font-bold">{minutesAgo(p.startedAt)}</span>
              {onJoinSession && (
                <button
                  onClick={() => onJoinSession(p)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/25 text-green-400 text-[9px] font-black uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all hover:bg-green-500/25"
                >
                  <Play size={9} fill="currentColor" />
                  Join
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {presences.length > 3 && (
        <button
          onClick={() => setIsExpanded(v => !v)}
          className="w-full py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 hover:bg-white/[0.03] transition-all border-t border-white/5"
        >
          {isExpanded ? 'Show less' : `+${presences.length - 3} more listening`}
        </button>
      )}
    </motion.div>
  );
};

export default NowListeningBar;

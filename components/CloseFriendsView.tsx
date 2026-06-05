import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Star, UserMinus, Search, Lock, Users, Plus, ArrowLeft, Check } from 'lucide-react';
import { CloseFriend } from '../types';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  query, orderBy, getDocs, where,
} from 'firebase/firestore';
import { db, auth } from '../services/backendService';
import { searchUsers } from '../services/backendService';
import { formatDistanceToNow } from 'date-fns';

// ── Service ────────────────────────────────────────────────────────────────────

export async function addCloseFriend(friend: CloseFriend): Promise<void> {
  if (!auth.currentUser) return;
  await setDoc(
    doc(db, 'users', auth.currentUser.uid, 'close_friends', friend.uid),
    { ...friend, addedAt: Date.now() }
  );
}

export async function removeCloseFriend(friendUid: string): Promise<void> {
  if (!auth.currentUser) return;
  await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'close_friends', friendUid));
}

export function listenCloseFriends(callback: (friends: CloseFriend[]) => void): () => void {
  if (!auth.currentUser) return () => {};
  return onSnapshot(
    query(collection(db, 'users', auth.currentUser.uid, 'close_friends'), orderBy('addedAt', 'desc')),
    snap => callback(snap.docs.map(d => d.data() as CloseFriend))
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CloseFriendsViewProps {
  onBack?: () => void;
  onVisitUser?: (uid: string) => void;
}

const CloseFriendsView: React.FC<CloseFriendsViewProps> = ({ onBack, onVisitUser }) => {
  const [friends, setFriends] = useState<CloseFriend[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [tab, setTab] = useState<'FRIENDS' | 'ADD'>('FRIENDS');
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = listenCloseFriends(setFriends);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQ.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchUsers(searchQ).catch(() => []);
      // Exclude already-added friends
      const friendIds = new Set(friends.map(f => f.uid));
      setSearchResults(results.filter((u: any) => u.uid !== auth.currentUser?.uid && !friendIds.has(u.uid)));
      setSearching(false);
    }, 280);
  }, [searchQ, friends]);

  const handleAdd = async (user: any) => {
    setAdding(user.uid);
    await addCloseFriend({
      uid: user.uid,
      displayName: user.displayName || 'Unknown',
      photoURL: user.photoURL || '',
      addedAt: Date.now(),
    });
    setAdding(null);
    setSearchQ('');
  };

  const handleRemove = async (uid: string) => {
    setRemoving(uid);
    await removeCloseFriend(uid);
    setRemoving(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Close Friends</h2>
            <Lock size={12} className="text-yellow-400/60" />
          </div>
          <p className="text-[9px] text-white/30">Your inner circle · {friends.length} people</p>
        </div>
        <Star size={16} className="text-yellow-400" fill="currentColor" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {(['FRIENDS', 'ADD'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors relative ${
              tab === t ? 'text-white' : 'text-white/30 hover:text-white/60'
            }`}
          >
            {t === 'FRIENDS' ? `My Circle (${friends.length})` : 'Add People'}
            {tab === t && <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-orange-400 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'FRIENDS' ? (
          <div className="px-4 py-4">
            {friends.length === 0 ? (
              <div className="py-16 text-center text-white/20">
                <Star size={40} className="mx-auto mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest">Your inner circle is empty</p>
                <p className="text-[9px] text-white/15 mt-1">Add your closest fans and collaborators</p>
                <button onClick={() => setTab('ADD')} className="mt-4 px-5 py-2 rounded-full bg-white/8 border border-white/15 text-white/50 text-[9px] font-black uppercase tracking-wider hover:bg-white/12 transition-all">
                  Add People
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map(f => (
                  <motion.div
                    key={f.uid}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8 group"
                  >
                    <button onClick={() => onVisitUser?.(f.uid)} className="relative shrink-0">
                      <img src={f.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.uid}`} className="w-10 h-10 rounded-full object-cover border border-yellow-400/30" alt="" />
                      <Star size={10} className="absolute -bottom-0.5 -right-0.5 text-yellow-400" fill="currentColor" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-white truncate">{f.displayName}</p>
                      <p className="text-[9px] text-white/30">Added {formatDistanceToNow(f.addedAt, { addSuffix: true })}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(f.uid)}
                      disabled={removing === f.uid}
                      className="p-2 rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <UserMinus size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="relative mb-4">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search by name…"
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/40 transition-all"
              />
            </div>
            {searching && <p className="text-[9px] text-white/25 text-center py-3 uppercase tracking-widest">Searching…</p>}
            {!searching && searchQ.length >= 2 && searchResults.length === 0 && (
              <p className="text-[9px] text-white/20 text-center py-3 uppercase tracking-widest">No results</p>
            )}
            <div className="space-y-2">
              {searchResults.map(u => (
                <div key={u.uid} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8">
                  <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black text-white truncate">{u.displayName}</p>
                    {u.isArtist && <p className="text-[9px] text-orange-400/70">Creator</p>}
                  </div>
                  <button
                    onClick={() => handleAdd(u)}
                    disabled={adding === u.uid}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-yellow-400/15 border border-yellow-400/30 text-yellow-400 text-[9px] font-black hover:bg-yellow-400/25 transition-all disabled:opacity-50"
                  >
                    {adding === u.uid ? <Check size={11} /> : <Plus size={11} />}
                    {adding === u.uid ? 'Added' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="px-6 py-3 border-t border-white/5 shrink-0">
        <div className="flex items-start gap-2">
          <Lock size={11} className="text-white/20 shrink-0 mt-0.5" />
          <p className="text-[9px] text-white/20 leading-relaxed">
            Close Friends posts are only visible to people in this list. They don't know they've been added.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CloseFriendsView;

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Megaphone, Bell, BellOff, Send, ArrowLeft, Plus, Heart,
  Smile, Image as ImageIcon, BarChart2, Pin, Trash2, Radio,
} from 'lucide-react';
import { BroadcastChannel, BroadcastMessage } from '../types';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, deleteDoc, setDoc, arrayUnion, arrayRemove,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { db, auth } from '../services/backendService';
import { formatDistanceToNow } from 'date-fns';

const QUICK_REACTIONS = ['❤️','🔥','🎉','👏','🤯','😍'];

// ── Message bubble ────────────────────────────────────────────────────────────

const BroadcastBubble: React.FC<{ msg: BroadcastMessage; isOwner: boolean; onDelete: (id: string) => void }> = ({ msg, isOwner, onDelete }) => {
  const uid = auth.currentUser?.uid || '';
  const totalReactions = Object.values(msg.reactions || {}).reduce((s, a) => s + a.length, 0);

  const handleReact = async (emoji: string) => {
    if (!uid) return;
    const ref = doc(db, 'broadcast_messages', msg.id);
    const hasReacted = (msg.reactions?.[emoji] || []).includes(uid);
    await updateDoc(ref, {
      [`reactions.${emoji}`]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
    });
  };

  return (
    <div className="group flex flex-col gap-1.5">
      {msg.pinned && (
        <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-yellow-400/70">
          <Pin size={9} /> Pinned
        </div>
      )}

      <div className={`rounded-2xl bg-white/[0.04] border border-white/8 p-4 ${msg.pinned ? 'border-yellow-500/20 bg-yellow-500/5' : ''}`}>
        {msg.mediaUrl && msg.mediaType === 'PHOTO' && (
          <img src={msg.mediaUrl} className="w-full max-h-64 object-cover rounded-xl mb-3" alt="" />
        )}
        {msg.mediaUrl && msg.mediaType === 'VIDEO' && (
          <video src={msg.mediaUrl} controls className="w-full max-h-64 rounded-xl mb-3" />
        )}
        <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        <p className="text-[9px] text-white/25 mt-2 font-bold">{formatDistanceToNow(msg.timestamp, { addSuffix: true })}</p>
      </div>

      {/* Reactions + actions */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        {QUICK_REACTIONS.map(emoji => {
          const count = (msg.reactions?.[emoji] || []).length;
          const reacted = (msg.reactions?.[emoji] || []).includes(uid);
          return (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] transition-all ${
                reacted ? 'bg-white/15 border border-white/20' : 'bg-white/5 border border-white/8 hover:bg-white/10'
              }`}
            >
              {emoji}{count > 0 && <span className="text-[9px] text-white/50 font-bold">{count}</span>}
            </button>
          );
        })}
        {isOwner && (
          <button onClick={() => onDelete(msg.id)} className="ml-auto opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface BroadcastChannelViewProps {
  onBack?: () => void;
  profileUid?: string;
}

const BroadcastChannelView: React.FC<BroadcastChannelViewProps> = ({ onBack, profileUid }) => {
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);
  const [selected, setSelected] = useState<BroadcastChannel | null>(null);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const uid = auth.currentUser?.uid;
  const isOwner = selected?.ownerId === uid;

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'broadcast_channels'), orderBy('lastPostAt', 'desc'), limit(30)),
      snap => setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastChannel)))
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'broadcast_subscriptions', uid), snap => {
      if (snap.exists()) setSubscribed(new Set(snap.data().channels || []));
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!selected) return;
    const unsub = onSnapshot(
      query(collection(db, 'broadcast_messages'), where('channelId', '==', selected.id), orderBy('timestamp', 'desc'), limit(50)),
      snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastMessage)).reverse())
    );
    return () => unsub();
  }, [selected?.id]);

  const toggleSubscribe = async (channelId: string) => {
    if (!uid) return;
    const ref = doc(db, 'broadcast_subscriptions', uid);
    const isSubbed = subscribed.has(channelId);
    await setDoc(ref, {
      channels: isSubbed ? arrayRemove(channelId) : arrayUnion(channelId),
    }, { merge: true });
    if (isSubbed) {
      await updateDoc(doc(db, 'broadcast_channels', channelId), { subscriberCount: increment(-1) });
    } else {
      await updateDoc(doc(db, 'broadcast_channels', channelId), { subscriberCount: increment(1) });
    }
  };

  const handleSend = async () => {
    if (!composerText.trim() || !selected || !uid || sending || !isOwner) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'broadcast_messages'), {
        channelId: selected.id,
        text: composerText.trim(),
        timestamp: Date.now(),
        reactions: {},
        pinned: false,
      });
      await updateDoc(doc(db, 'broadcast_channels', selected.id), { lastPostAt: Date.now() });
      setComposerText('');
    } finally { setSending(false); }
  };

  const handleDelete = async (msgId: string) => {
    await deleteDoc(doc(db, 'broadcast_messages', msgId));
  };

  const handleCreateChannel = async () => {
    if (!newName.trim() || !uid || creating) return;
    setCreating(true);
    try {
      const ref = doc(collection(db, 'broadcast_channels'));
      await setDoc(ref, {
        id: ref.id,
        ownerId: uid,
        ownerName: auth.currentUser?.displayName || 'Creator',
        ownerPhoto: auth.currentUser?.photoURL || '',
        name: newName.trim(),
        description: newDesc.trim() || null,
        subscriberCount: 0,
        createdAt: Date.now(),
        lastPostAt: Date.now(),
        isVerified: false,
      });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    } finally { setCreating(false); }
  };

  // Channel detail view
  if (selected) {
    const isSubbed = subscribed.has(selected.id);
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 shrink-0">
          <button onClick={() => setSelected(null)} className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={15} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-white truncate">{selected.name}</p>
              {selected.isVerified && <span className="text-blue-400 text-xs">✓</span>}
            </div>
            <p className="text-[9px] text-white/30">{selected.subscriberCount} subscribers</p>
          </div>
          <button
            onClick={() => toggleSubscribe(selected.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border ${
              isSubbed
                ? 'bg-white/5 border-white/15 text-white/40 hover:text-red-400 hover:border-red-400/30'
                : 'bg-orange-500/15 border-orange-500/30 text-orange-400 hover:bg-orange-500/25'
            }`}
          >
            {isSubbed ? <><BellOff size={11} /> Unsubscribe</> : <><Bell size={11} /> Subscribe</>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="py-20 text-center text-white/20">
              <Radio size={36} className="mx-auto mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest">No broadcasts yet</p>
            </div>
          ) : (
            messages.map(msg => (
              <BroadcastBubble key={msg.id} msg={msg} isOwner={isOwner} onDelete={handleDelete} />
            ))
          )}
        </div>

        {isOwner && (
          <div className="px-4 py-3 border-t border-white/5 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={composerText}
                onChange={e => setComposerText(e.target.value)}
                placeholder="Broadcast to your subscribers…"
                rows={2}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-orange-500/40 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!composerText.trim() || sending}
                className="p-3 rounded-xl bg-orange-500 text-black disabled:opacity-40 hover:bg-orange-400 transition-all shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
              <ArrowLeft size={15} />
            </button>
          )}
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Broadcasts</h2>
            <p className="text-[9px] text-white/30 uppercase tracking-widest">Direct to your fans</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[9px] font-black uppercase tracking-wider hover:bg-orange-500/25 transition-all"
        >
          <Plus size={11} /> Create
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/5"
          >
            <div className="px-6 py-4 space-y-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Channel name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/40"
              />
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/40"
              />
              <button onClick={handleCreateChannel} disabled={!newName.trim() || creating}
                className="px-5 py-2 rounded-full bg-orange-500 text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 hover:bg-orange-400 transition-all">
                {creating ? 'Creating…' : 'Create Channel'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {channels.map(ch => {
          const isSubbed = subscribed.has(ch.id);
          const isOwner = ch.ownerId === uid;
          return (
            <button
              key={ch.id}
              onClick={() => setSelected(ch)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shrink-0 overflow-hidden">
                {ch.coverImage
                  ? <img src={ch.coverImage} className="w-full h-full object-cover" alt="" />
                  : <Megaphone size={16} className="text-white" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12px] font-black text-white truncate">{ch.name}</p>
                  {ch.isVerified && <span className="text-blue-400 text-[10px]">✓</span>}
                  {isOwner && <span className="text-[7px] text-orange-400 font-black uppercase tracking-wider">Yours</span>}
                </div>
                <p className="text-[10px] text-white/35">{ch.subscriberCount} subscribers</p>
              </div>
              <div className={`shrink-0 p-1.5 rounded-full transition-colors ${isSubbed ? 'text-orange-400' : 'text-white/20 group-hover:text-white/50'}`}>
                {isSubbed ? <Bell size={14} fill="currentColor" /> : <Bell size={14} />}
              </div>
            </button>
          );
        })}
        {channels.length === 0 && (
          <div className="py-20 text-center text-white/20">
            <Megaphone size={40} className="mx-auto mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest">No channels yet</p>
            <p className="text-[9px] text-white/15 mt-1">Create the first one</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BroadcastChannelView;

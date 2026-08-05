import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageCircle, Bell, RefreshCw, Send, X, ChevronLeft,
  LogIn, ExternalLink, Loader2, AtSign, Lock,
} from 'lucide-react';
import { useFediverse } from '../contexts/FediverseContext';
import FediversePostCard from './FediversePostCard';
import type { FediverseProtocol } from '../services/fediverse/types';
import type { BskyConversation } from '../services/fediverse/bluesky';

// ─── Protocol badge ────────────────────────────────────────────────────────────

const PROTO_STYLE: Record<FediverseProtocol, { color: string; bg: string; label: string }> = {
  bluesky:  { color: '#0085ff', bg: 'rgba(0,133,255,0.12)',   label: 'Bluesky' },
  mastodon: { color: '#6364FF', bg: 'rgba(99,100,255,0.12)',  label: 'Mastodon' },
  threads:  { color: '#aaaaaa', bg: 'rgba(255,255,255,0.06)', label: 'Threads' },
};

function ProtoBadge({ protocol }: { protocol: FediverseProtocol }) {
  const s = PROTO_STYLE[protocol];
  return (
    <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shrink-0"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ─── Relative time ─────────────────────────────────────────────────────────────

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

// ─── Compose Bar ──────────────────────────────────────────────────────────────

function ComposeBar() {
  const { accounts, crossPost, isCrossPosting, accountsByProtocol } = useFediverse();
  const [text, setText] = useState('');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Default to all active accounts
    setTargetIds(accounts.filter(a => a.isActive).map(a => a.id));
  }, [accounts.map(a => a.id).join(',')]);

  const remaining = 300 - text.length;

  const handlePost = async () => {
    if (!text.trim() || isCrossPosting) return;
    await crossPost(text.trim(), {}, targetIds.length ? targetIds : undefined);
    setText('');
    setOpen(false);
  };

  if (!accounts.length) return null;

  return (
    <div className="border-b border-white/[0.06] pb-4 mb-4">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-white/10 flex items-center justify-center">
            <AtSign size={14} className="text-white/30" />
          </div>
          <span className="text-sm text-white/25">What's on your mind? Post to all connected networks…</span>
        </button>
      ) : (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="What's on your mind?"
            className="w-full bg-transparent outline-none resize-none text-sm text-white placeholder:text-white/20 leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {accounts.filter(a => a.isActive).map(a => {
                const s = PROTO_STYLE[a.protocol];
                const selected = targetIds.includes(a.id);
                return (
                  <button key={a.id} type="button"
                    onClick={() => setTargetIds(prev => selected ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all"
                    style={{ background: selected ? s.bg : 'rgba(255,255,255,0.05)', color: selected ? s.color : 'rgba(255,255,255,0.3)', border: `1px solid ${selected ? s.color + '44' : 'rgba(255,255,255,0.08)'}` }}>
                    <ProtoBadge protocol={a.protocol} />
                    <span>{a.handle}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-[10px] font-black ${remaining < 20 ? 'text-red-400' : 'text-white/20'}`}>{remaining}</span>
              <button onClick={() => { setOpen(false); setText(''); }}
                className="p-1.5 rounded-xl text-white/30 hover:text-white transition-all"><X size={14} /></button>
              <button onClick={handlePost} disabled={!text.trim() || isCrossPosting || !targetIds.length}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-40"
                style={{ background: '#0085ff', color: '#fff' }}>
                {isCrossPosting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Post
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── DM Thread ────────────────────────────────────────────────────────────────

function DmThread({ convo, myDid, onBack }: { convo: BskyConversation; myDid: string; onBack: () => void }) {
  const { dmMessages, loadDmMessages, sendDmMessage } = useFediverse();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = dmMessages[convo.id] ?? [];
  const other = convo.members.find(m => m.did !== myDid);

  useEffect(() => { loadDmMessages(convo.id); }, [convo.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try { await sendDmMessage(convo.id, text.trim()); setText(''); }
    finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06] mb-4">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-all">
          <ChevronLeft size={18} />
        </button>
        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-white/10">
          {other?.avatarUrl && <img src={other.avatarUrl} className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black uppercase tracking-widest truncate">{other?.displayName ?? other?.handle ?? 'Unknown'}</p>
          <p className="text-[9px] text-white/30">@{other?.handle}</p>
        </div>
        <ProtoBadge protocol="bluesky" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 mb-4">
        {messages.length === 0 && (
          <p className="text-[9px] text-white/20 text-center py-8 uppercase tracking-widest">No messages yet — say hello!</p>
        )}
        {messages.map(m => {
          const isMe = m.senderDid === myDid;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                style={{ background: isMe ? '#0085ff' : 'rgba(255,255,255,0.08)', color: isMe ? '#fff' : 'rgba(255,255,255,0.85)' }}>
                {m.text}
                <p className="text-[8px] opacity-50 mt-1 text-right">{m.sentAt ? relTime(new Date(m.sentAt).getTime()) : ''}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Send a message…"
          className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#0085ff]/50 transition-all" />
        <button onClick={send} disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-40"
          style={{ background: '#0085ff', color: '#fff' }}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────

type HubTab = 'feed' | 'notifications' | 'messages';

interface FediverseHubProps {
  onOpenSettings?: () => void;
}

export default function FediverseHub({ onOpenSettings }: FediverseHubProps) {
  const {
    accounts, feed, notifications, isLoadingAccounts, isLoadingFeed,
    refreshFeed, refreshNotifications, hasProtocol,
    dmConversations, isDmLoading, loadDmConversations,
  } = useFediverse();

  const [tab, setTab] = useState<HubTab>('feed');
  const [filterProto, setFilterProto] = useState<FediverseProtocol | 'all'>('all');
  const [activeDm, setActiveDm] = useState<BskyConversation | null>(null);

  const bskyAccount = accounts.find(a => a.protocol === 'bluesky' && a.isActive);
  const myDid = bskyAccount?.credentials?.did ?? '';

  useEffect(() => {
    if (tab === 'notifications') refreshNotifications();
    if (tab === 'messages' && !dmConversations.length) loadDmConversations();
  }, [tab]);

  const filteredFeed = filterProto === 'all' ? feed : feed.filter(p => p.protocol === filterProto);
  const unreadNotifs = notifications.filter(n => !n.isRead).length;
  const unreadDms = dmConversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  // ── No accounts connected ─────────────────────────────────────────────────

  if (!isLoadingAccounts && !accounts.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
          <AtSign size={28} className="text-white/20" />
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-white/60">No accounts connected</p>
          <p className="text-[10px] text-white/30 mt-1.5 max-w-xs">
            Link your Bluesky or Mastodon account to read your following feed, send DMs, and post natively — all without leaving Plajah.
            Your accounts are bound to your Plajah login and stored securely.
          </p>
        </div>
        {onOpenSettings && (
          <button onClick={onOpenSettings}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={{ background: '#0085ff', color: '#fff' }}>
            <LogIn size={13} /> Connect Bluesky / Mastodon
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[8px] text-white/20 uppercase tracking-widest">
          <Lock size={9} /> End-to-end encrypted credentials · Never shared with third parties
        </div>
      </div>
    );
  }

  // ── Connected accounts header ─────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Account chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {accounts.filter(a => a.isActive).map(a => {
          const s = PROTO_STYLE[a.protocol];
          return (
            <a key={a.id} href={a.profileUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105"
              style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}>
              {a.avatarUrl && <img src={a.avatarUrl} className="w-4 h-4 rounded-full object-cover" />}
              <span>{a.handle}</span>
              <ExternalLink size={9} className="opacity-50" />
            </a>
          );
        })}
        {onOpenSettings && (
          <button onClick={onOpenSettings}
            className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            + Connect
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {([
          { id: 'feed', label: 'Following Feed' },
          { id: 'notifications', label: `Alerts${unreadNotifs ? ` (${unreadNotifs})` : ''}` },
          { id: 'messages', label: `Messages${unreadDms ? ` (${unreadDms})` : ''}`, disabled: !hasProtocol('bluesky') },
        ] as { id: HubTab; label: string; disabled?: boolean }[]).map(t => (
          <button key={t.id} disabled={t.disabled} onClick={() => setTab(t.id)}
            className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
            style={tab === t.id
              ? { background: '#0085ff', color: '#fff' }
              : { color: 'rgba(255,255,255,0.4)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">

        {/* ── FEED ── */}
        {tab === 'feed' && (
          <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <ComposeBar />

            {/* Protocol filter */}
            {accounts.length > 1 && (
              <div className="flex items-center gap-2">
                {(['all', ...new Set(accounts.map(a => a.protocol))] as (FediverseProtocol | 'all')[]).map(p => (
                  <button key={p} onClick={() => setFilterProto(p)}
                    className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all"
                    style={filterProto === p
                      ? { background: p === 'all' ? '#fff' : PROTO_STYLE[p as FediverseProtocol].color, color: '#000' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                    {p === 'all' ? 'All' : PROTO_STYLE[p as FediverseProtocol].label}
                  </button>
                ))}
                <button onClick={refreshFeed} disabled={isLoadingFeed}
                  className="ml-auto p-1.5 rounded-xl text-white/30 hover:text-white transition-all disabled:opacity-40">
                  <RefreshCw size={12} className={isLoadingFeed ? 'animate-spin' : ''} />
                </button>
              </div>
            )}

            {isLoadingFeed && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-white/20" />
              </div>
            )}

            {!isLoadingFeed && filteredFeed.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-[10px] text-white/20 uppercase tracking-widest">No posts yet</p>
                <button onClick={refreshFeed} className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
            )}

            <div className="space-y-2">
              {filteredFeed.map(post => (
                <FediversePostCard key={`${post.protocol}-${post.id}`} post={post} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab === 'notifications' && (
          <motion.div key="notifs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] text-white/30 uppercase tracking-widest font-black">Recent activity</p>
              <button onClick={refreshNotifications} className="text-white/30 hover:text-white transition-all">
                <RefreshCw size={12} />
              </button>
            </div>
            {notifications.length === 0 && (
              <p className="text-[10px] text-white/20 uppercase tracking-widest text-center py-12">No notifications</p>
            )}
            {notifications.map(n => (
              <div key={n.id}
                className="flex items-start gap-3 p-3 rounded-2xl transition-all"
                style={{ background: n.isRead ? 'rgba(255,255,255,0.03)' : 'rgba(0,133,255,0.06)', border: `1px solid ${n.isRead ? 'rgba(255,255,255,0.05)' : 'rgba(0,133,255,0.2)'}` }}>
                <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-white/10">
                  {n.actor?.avatarUrl && <img src={n.actor.avatarUrl} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-white/80">{n.actor?.displayName ?? n.actor?.handle}</span>
                    <ProtoBadge protocol={n.protocol} />
                    <span className="text-[8px] text-white/30">{relTime(n.createdAt)}</span>
                  </div>
                  <p className="text-[9px] text-white/40 mt-0.5 capitalize">
                    {n.type === 'like' ? '❤ liked your post' : n.type === 'repost' || n.type === 'reblog' ? '🔁 reposted you' : n.type === 'follow' ? '👤 started following you' : n.type === 'mention' ? '💬 mentioned you' : n.type === 'reply' ? '↩ replied to you' : n.type}
                  </p>
                  {n.post && <p className="text-[9px] text-white/25 mt-1 truncate">{n.post.contentText}</p>}
                </div>
                <Bell size={10} className={n.isRead ? 'text-white/10' : 'text-[#0085ff]'} />
              </div>
            ))}
          </motion.div>
        )}

        {/* ── MESSAGES (Bluesky DMs) ── */}
        {tab === 'messages' && (
          <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {activeDm ? (
              <DmThread convo={activeDm} myDid={myDid} onBack={() => setActiveDm(null)} />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] text-white/30 uppercase tracking-widest font-black">Bluesky Messages</p>
                  <button onClick={loadDmConversations} disabled={isDmLoading} className="text-white/30 hover:text-white transition-all">
                    <RefreshCw size={12} className={isDmLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {isDmLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-white/20" />
                  </div>
                )}

                {!isDmLoading && dmConversations.length === 0 && (
                  <div className="py-12 text-center space-y-2">
                    <MessageCircle size={32} className="mx-auto text-white/10" />
                    <p className="text-[10px] text-white/20 uppercase tracking-widest">No conversations</p>
                    <p className="text-[9px] text-white/15">Start a DM on Bluesky and it will appear here</p>
                  </div>
                )}

                {dmConversations.map(convo => {
                  const other = convo.members.find(m => m.did !== myDid);
                  return (
                    <button key={convo.id} onClick={() => setActiveDm(convo)}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all hover:bg-white/[0.06]"
                      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${convo.unreadCount ? 'rgba(0,133,255,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden bg-white/10 relative">
                        {other?.avatarUrl && <img src={other.avatarUrl} className="w-full h-full object-cover" />}
                        {convo.unreadCount > 0 && (
                          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0085ff] flex items-center justify-center">
                            <span className="text-[7px] font-black text-white">{convo.unreadCount > 9 ? '9+' : convo.unreadCount}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest truncate">{other?.displayName ?? other?.handle ?? 'Unknown'}</p>
                        <p className="text-[9px] text-white/30 truncate mt-0.5">
                          {convo.lastMessage?.text ?? 'No messages yet'}
                        </p>
                      </div>
                      <div className="text-[8px] text-white/20 shrink-0">
                        {convo.lastMessage?.sentAt ? relTime(new Date(convo.lastMessage.sentAt).getTime()) : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

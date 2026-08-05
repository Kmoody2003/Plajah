// RoomView — a live Room: real-time presence + chat, a countdown to the room's end, and a
// share button (native share / copy link). Any user can host; guests join. Mirrors the sports
// fan-room experience, generalized. On open the viewer joins (presence); on leave they're removed.

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Radio, Users, Share2, Send, Clock, X, Check, Megaphone } from 'lucide-react';
import {
  subscribeRoom, subscribeMembers, subscribeRoomChat, joinRoom, leaveRoom, sendRoomMessage, endRoom,
  isLive, minsLeft, roomShareUrl, type LiveRoom, type RoomMember, type RoomMessage,
} from '../services/roomService';
import { useFediverse } from '../contexts/FediverseContext';

const T = {
  bg: '#0a0a0f', card: '#12121a', cardAlt: '#15151f', border: '#20202c',
  ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', red: '#e23b3b', green: '#5fd17f', violet: '#8166e6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const RoomView: React.FC<{ roomId: string; user?: any; onBack?: () => void }> = ({ roomId, user, onBack }) => {
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [chat, setChat] = useState<RoomMessage[]>([]);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [announced, setAnnounced] = useState(false);
  const [, tick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { accounts, crossPost, isCrossPosting } = useFediverse();

  useEffect(() => {
    const unsubR = subscribeRoom(roomId, setRoom);
    const unsubM = subscribeMembers(roomId, setMembers);
    const unsubC = subscribeRoomChat(roomId, setChat);
    if (user?.uid) joinRoom(roomId, user).catch(() => {});
    const t = setInterval(() => tick(n => n + 1), 1000 * 20);
    return () => { unsubR(); unsubM(); unsubC(); clearInterval(t); if (user?.uid) leaveRoom(roomId, user.uid).catch(() => {}); };
  }, [roomId, user?.uid]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.length]);

  const live = isLive(room);
  const isHost = !!user?.uid && room?.hostId === user.uid;

  const send = async () => {
    const body = text.trim();
    if (!body || !user?.uid || !live) return;
    setText('');
    await sendRoomMessage(roomId, { uid: user.uid, displayName: user.displayName || 'Guest', photoURL: user.photoURL || null, text: body }).catch(() => {});
  };

  const share = async () => {
    const url = roomShareUrl(roomId);
    const title = room?.title ? `Join my live room: ${room.title}` : 'Join my live room on Plajah';
    try {
      if (navigator.share) { await navigator.share({ title, text: title, url }); return; }
    } catch { /* fall through to copy */ }
    try { await navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ }
  };

  // Announce the room to the host's connected Mastodon / Bluesky / Threads accounts.
  const announce = async () => {
    if (!accounts.length) return;
    const text = `🔴 Live now: ${room?.title || 'a room'} — join me on Plajah: ${roomShareUrl(roomId)}`;
    try { await crossPost(text); setAnnounced(true); setTimeout(() => setAnnounced(false), 2200); } catch { /* */ }
  };

  const end = async () => { await endRoom(roomId); onBack?.(); };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '16px 14px 24px', fontFamily: T.font, display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}><ArrowLeft size={16} /> Leave</button>}
          <div style={{ flex: 1 }} />
          <button onClick={share} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
            {copied ? <><Check size={14} color={T.green} /> Copied</> : <><Share2 size={14} /> Share</>}
          </button>
          {live && accounts.length > 0 && (
            <button onClick={announce} disabled={isCrossPosting} title="Announce to your connected Mastodon / Bluesky / Threads" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: `1px solid ${announced ? T.green : T.violet}`, background: 'transparent', color: announced ? T.green : T.violet, fontSize: 12, cursor: isCrossPosting ? 'default' : 'pointer', fontWeight: 700, opacity: isCrossPosting ? 0.6 : 1 }}>
              {announced ? <><Check size={14} /> Posted</> : <><Megaphone size={14} /> {isCrossPosting ? 'Posting…' : 'Announce'}</>}
            </button>
          )}
          {isHost && live && <button onClick={end} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.red}`, background: 'transparent', color: T.red, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}><X size={14} /> End</button>}
        </div>

        {/* room card */}
        <div style={{ borderRadius: 16, padding: 18, marginBottom: 12, border: `1px solid ${live ? 'rgba(255,140,0,0.35)' : T.border}`, background: live ? 'linear-gradient(120deg, rgba(255,140,0,0.1), rgba(129,102,230,0.08))' : T.card }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {live ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: T.red, padding: '3px 9px', borderRadius: 99 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: '#fff' }} /> Live
              </span>
            ) : (
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.muted, background: 'rgba(255,255,255,0.06)', padding: '3px 9px', borderRadius: 99 }}>Ended</span>
            )}
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted }}>Room</span>
            {live && room && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.orange, fontWeight: 700 }}><Clock size={12} /> {minsLeft(room)}m left</span>}
          </div>
          <div style={{ fontWeight: 900, fontSize: 20, lineHeight: 1.2 }}>{room?.title || 'Live Room'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {room?.hostPhoto ? <img src={room.hostPhoto} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} /> : <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.violet, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 11 }}>{(room?.hostName || '?').charAt(0)}</span>}
            <span style={{ fontSize: 12.5, color: T.muted }}>hosted by <b style={{ color: T.ink }}>{room?.hostName || '…'}</b></span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.muted }}><Users size={13} /> {members.length}</span>
          </div>
        </div>

        {/* presence */}
        {members.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {members.slice(0, 14).map(m => (
              <span key={m.uid} title={m.displayName} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px 4px 4px', borderRadius: 99, border: `1px solid ${T.border}`, background: T.cardAlt }}>
                {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} /> : <span style={{ width: 18, height: 18, borderRadius: '50%', background: T.violet, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 9 }}>{m.displayName.charAt(0)}</span>}
                <span style={{ fontSize: 11, fontWeight: 700 }}>{m.displayName}{m.uid === room?.hostId ? ' · host' : ''}</span>
              </span>
            ))}
            {members.length > 14 && <span style={{ fontSize: 11, color: T.muted, alignSelf: 'center' }}>+{members.length - 14}</span>}
          </div>
        )}

        {/* chat */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 2px' }}>
          {chat.length === 0 && <div style={{ color: T.muted, fontSize: 13, textAlign: 'center', margin: 'auto 0' }}>{live ? 'Say hi 👋 — the room is live.' : 'This room has ended.'}</div>}
          {chat.map(m => {
            const mine = m.uid === user?.uid;
            return (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
                {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }} /> : <span style={{ width: 26, height: 26, borderRadius: '50%', background: mine ? T.orange : T.violet, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 11, flexShrink: 0, color: mine ? '#1a1a1a' : '#fff' }}>{m.displayName.charAt(0)}</span>}
                <div style={{ maxWidth: '72%' }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>{mine ? 'You' : m.displayName}</div>
                  <div style={{ background: mine ? 'rgba(255,140,0,0.16)' : T.cardAlt, border: `1px solid ${mine ? 'rgba(255,140,0,0.3)' : T.border}`, borderRadius: 12, padding: '8px 11px', fontSize: 14, lineHeight: 1.35, wordBreak: 'break-word' }}>{m.text}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* composer */}
        {live ? (
          user?.uid ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} placeholder="Message the room…" maxLength={500}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.border}`, background: T.card, color: T.ink, fontSize: 14, fontFamily: T.font, outline: 'none' }} />
              <button onClick={send} disabled={!text.trim()} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: text.trim() ? T.orange : T.cardAlt, color: text.trim() ? '#1a1a1a' : T.muted, cursor: text.trim() ? 'pointer' : 'default', display: 'grid', placeItems: 'center' }}><Send size={18} /></button>
            </div>
          ) : (
            <div style={{ marginTop: 10, textAlign: 'center', color: T.muted, fontSize: 13, padding: 12, border: `1px solid ${T.border}`, borderRadius: 12 }}>Sign in to join the conversation.</div>
          )
        ) : (
          <div style={{ marginTop: 10, textAlign: 'center', color: T.muted, fontSize: 13, padding: 12, border: `1px solid ${T.border}`, borderRadius: 12, display: 'inline-flex', justifyContent: 'center', gap: 6 }}><Radio size={15} /> Room ended — chat is read-only.</div>
        )}
      </div>
    </div>
  );
};

export default RoomView;

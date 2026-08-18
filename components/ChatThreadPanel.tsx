import React, { useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import type { ChatMessage, ChatRoom, UserProfile } from '../types';
import { auth, sendMessage } from '../services/backendService';
import { encryptText } from '../services/cryptoService';
import { Button, IconButton, Surface, Eyebrow } from './ui';

const ChatThreadPanel: React.FC<{ room: ChatRoom; root: ChatMessage; replies: ChatMessage[]; profiles: Record<string, UserProfile>; canPost?: boolean; onClose: () => void }> = ({ room, root, replies, profiles, canPost = true, onClose }) => {
  const [text, setText] = useState(''); const [sending, setSending] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const value = text.trim(); if (!value || sending) return; setText(''); setSending(true); try { const lower = value.toLowerCase(); const mentionUids = Object.entries(profiles).filter(([, profile]) => { const name = (profile.displayName || '').toLowerCase(); return name && (lower.includes(`@${name}`) || lower.includes(`@${name.split(' ')[0]}`)); }).map(([uid]) => uid); await sendMessage(room.id, { senderId: auth.currentUser?.uid || '', senderName: auth.currentUser?.displayName || 'Crew', senderPhoto: auth.currentUser?.photoURL || '', text: await encryptText(value, room.id), type: 'TEXT', threadRootId: root.id, mentionUids }); } finally { setSending(false); } };
  return <Surface level={5} shape="sheet" className="absolute inset-y-3 right-3 z-[55] w-[390px] max-w-[calc(100vw-24px)] flex flex-col overflow-hidden p-0">
    <div className="p-4 border-b border-[var(--m3-border)] flex items-start justify-between"><div><Eyebrow>Thread</Eyebrow><h3 className="type-title-lg mt-1">Focused conversation</h3></div><IconButton variant="ghost" size="sm" aria-label="Close thread" onClick={onClose}><X /></IconButton></div>
    <div className="flex-1 overflow-y-auto p-4 pj-stack-2"><Surface level={2} className="p-3"><p className="type-label-lg">{root.senderName}</p><p className="type-body-md mt-1">{root.text || 'Production object'}</p></Surface>{replies.map(reply => <Surface key={reply.id} level={1} className="p-3"><p className="type-label-lg">{reply.senderName}</p><p className="type-body-md mt-1">{reply.text}</p></Surface>)}{replies.length === 0 && <div className="text-center py-8"><MessageSquare className="mx-auto text-[var(--text-secondary)]" /><p className="type-body-sm text-[var(--text-secondary)] mt-2">Start the focused discussion here.</p></div>}</div>
    {canPost ? <form onSubmit={submit} className="p-3 border-t border-[var(--m3-border)] flex gap-2"><input className="pj-input flex-1" value={text} onChange={event => setText(event.target.value)} placeholder="Reply in thread… use @name" /><Button variant="accent" icon={<Send />} loading={sending} type="submit" aria-label="Send thread reply" /></form> : <p className="p-4 border-t border-[var(--m3-border)] type-body-sm text-[var(--text-secondary)]">This authoritative channel is read-only for your production role.</p>}
  </Surface>;
};
export default ChatThreadPanel;

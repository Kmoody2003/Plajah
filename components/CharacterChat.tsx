import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, Sparkles, Bot } from 'lucide-react';
import type { Character } from '../types';
import { auth } from '../services/backendService';
import { CHARACTER_GRADIENT } from '../services/characterAccountService';

/**
 * Chat with a living character persona (Phase 1). Sends the conversation to /api/character/chat,
 * which builds the guardrailed persona server-side and answers via Claude. Always shows an
 * AI-persona disclosure. Opened via the OPEN_CHARACTER_CHAT event from the character profile.
 */
type Msg = { role: 'user' | 'assistant'; content: string };

const CharacterChat: React.FC<{ character: Character; onClose: () => void }> = ({ character, onClose }) => {
  const greeting = character.account?.greeting || `Hi, I'm ${character.name}. Ask me anything.`;
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: greeting }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const token = await auth.currentUser?.getIdToken?.();
      const res = await fetch('/api/character/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // Send only the real conversation (drop the local greeting) so the model isn't fed a line it "said".
        body: JSON.stringify({ worldId: character.worldId, characterId: character.id, messages: next.slice(1) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      setMessages(m => [...m, { role: 'assistant', content: data.reply || '…' }]);
    } catch (e: any) {
      setError(e.message || 'Could not reach the character.');
      setMessages(m => m.slice(0, -1)); // roll back the unanswered user turn
      setInput(text);
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full sm:max-w-md h-[80dvh] sm:h-[70dvh] flex flex-col bg-[#0b0710] sm:rounded-3xl overflow-hidden border border-violet-400/20" style={{ boxShadow: '0 0 40px -8px rgba(124,58,237,0.5)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10" style={{ background: 'linear-gradient(180deg, rgba(124,58,237,0.22), transparent)' }}>
          <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0">
            {character.imageUrl ? <img src={character.imageUrl} className="w-full h-full object-cover" alt="" /> : <Bot size={16} className="m-2.5 text-white/40" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black truncate">{character.name}</p>
            <p className="text-[8px] font-black uppercase tracking-widest text-violet-300/70 flex items-center gap-1"><Sparkles size={9} /> AI persona</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><X size={18} className="text-white/60" /></button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-[13px] leading-snug break-words ${m.role === 'user' ? 'text-white' : 'bg-white/8 text-white/90'}`} style={m.role === 'user' ? { background: CHARACTER_GRADIENT } : {}}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && <div className="flex justify-start"><div className="px-3.5 py-2 rounded-2xl bg-white/8"><Loader2 size={14} className="animate-spin text-white/50" /></div></div>}
          {error && <p className="text-red-400 text-[11px] text-center">{error}</p>}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-3 border-t border-white/10" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <input
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder={`Message ${character.name}…`}
            className="flex-1 bg-white/8 rounded-full px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:ring-2 ring-violet-400/30"
          />
          <button onClick={send} disabled={!input.trim() || sending} className="p-2.5 rounded-full text-white disabled:opacity-30 active:scale-95" style={{ background: CHARACTER_GRADIENT }}><Send size={16} /></button>
        </div>
        <p className="text-[8px] text-white/25 text-center pb-2 -mt-1">AI persona · replies are fictional</p>
      </div>
    </div>
  );
};

export default CharacterChat;

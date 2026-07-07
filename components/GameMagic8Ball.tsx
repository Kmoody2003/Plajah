import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { auth } from '../services/backendService';
import { subscribeMagic8, addMyAnswer, setMyAnswers, shakeMagic8, type Magic8Doc } from '../services/intimateGames';

interface Props {
  roomId: string;
  accent?: string;
  onClose: () => void;
}

const GameMagic8Ball: React.FC<Props> = ({ roomId, accent = '#ff6b6b', onClose }) => {
  const [doc, setDoc] = useState<Magic8Doc | null>(null);
  const [draft, setDraft] = useState('');
  const [shaking, setShaking] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const uid = auth.currentUser?.uid || '';

  useEffect(() => subscribeMagic8(roomId, setDoc), [roomId]);

  const myAnswers = (doc?.answersByUid || {})[uid] || [];
  const result = doc?.lastResult;

  const shake = async () => {
    setShaking(true);
    await shakeMagic8(roomId);
    setTimeout(() => setShaking(false), 700);
  };
  const add = async () => { const t = draft.trim(); if (!t) return; setDraft(''); await addMyAnswer(roomId, t); };
  const removeMine = async (i: number) => { await setMyAnswers(roomId, myAnswers.filter((_, idx) => idx !== i)); };

  return (
    <div className="fixed inset-0 z-[82] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border overflow-hidden"
        style={{ background: 'rgba(14,5,9,0.96)', borderColor: `${accent}44` }}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: `${accent}22` }}>
          <Sparkles size={16} style={{ color: accent }} />
          <span className="text-sm font-black uppercase tracking-widest">Magic 8-Ball</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {/* The ball */}
          <motion.button
            onClick={shake}
            animate={shaking ? { rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.6 }}
            className="w-40 h-40 rounded-full grid place-items-center relative"
            style={{ background: 'radial-gradient(circle at 35% 30%, #333 0%, #000 70%)', boxShadow: `0 12px 40px ${accent}33` }}
          >
            <div className="w-20 h-20 rounded-full grid place-items-center text-center px-2"
              style={{ background: `radial-gradient(circle at 50% 40%, ${accent} 0%, #4a0d1e 90%)` }}>
              <span className="text-[9px] font-black text-white leading-tight">
                {shaking ? '…' : (result?.text || 'Ask & tap to shake')}
              </span>
            </div>
          </motion.button>
          <p className="text-[9px] text-white/30 uppercase tracking-widest">
            {result ? (result.byUid === uid ? 'You shook it' : 'They shook it') : 'Think of a question, then shake'}
          </p>

          {/* My secret answers */}
          <div className="w-full pt-3 border-t" style={{ borderColor: `${accent}18` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Your secret answers</span>
              <span className="text-[8px] text-white/25">· hidden from them</span>
              <button onClick={() => setShowMine(s => !s)} className="ml-auto p-1 text-white/30 hover:text-white">
                {showMine ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                placeholder="Add an answer only they'll get by chance…"
                className="flex-1 min-w-0 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-white/30"
              />
              <button onClick={add} className="px-3 py-2 rounded-xl text-black" style={{ background: accent }}><Plus size={14} /></button>
            </div>
            {myAnswers.length === 0 ? (
              <p className="text-[9px] text-white/25 uppercase tracking-widest text-center py-2">No custom answers yet — the classics will be used.</p>
            ) : showMine ? (
              <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                {myAnswers.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] text-xs">
                    <span className="flex-1 truncate">{a}</span>
                    <button onClick={() => removeMine(i)} className="text-white/30 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px] text-white/30 text-center py-1">{myAnswers.length} secret answer{myAnswers.length > 1 ? 's' : ''} in the ball 🔒</p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GameMagic8Ball;

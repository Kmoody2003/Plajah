import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Globe, Power, MessageCircle, Bot, Loader2, Wand2, Users } from 'lucide-react';
import type { Character } from '../types';
import {
  CHARACTER_GRADIENT, canDriveCharacter, isCharacterAccountLive,
  enableCharacterAccount, disableCharacterAccount, updateCharacterAccount, buildCharacterSystemPrompt,
} from '../services/characterAccountService';

/**
 * Base profile for a CHARACTER account — a living digital being tied to its World. Violet/purple
 * hue so it always reads as a fictional AI persona (never a real person). Only the character's
 * creator (driver) can turn it on or drive it. Chat/living-avatar are later phases; this is the
 * foundation (profile + creator controls + persona spine). See the character-avatars blueprint.
 */
const CharacterProfileView: React.FC<{
  character: Character;
  worldName?: string;
  onBack?: () => void;
  onVisitWorld?: (worldId: string) => void;
}> = ({ character, worldName, onBack, onVisitWorld }) => {
  const [char, setChar] = useState<Character>(character);
  const [busy, setBusy] = useState(false);
  const [persona, setPersona] = useState(character.account?.persona || '');
  const [showPrompt, setShowPrompt] = useState(false);

  const canDrive = canDriveCharacter(char);
  const live = isCharacterAccountLive(char);
  const aiOn = !!char.account?.aiEnabled;

  const toggleLive = async () => {
    if (!canDrive || busy) return;
    setBusy(true);
    try {
      if (live) { await disableCharacterAccount(char); setChar(c => ({ ...c, account: { ...(c.account || {}), enabled: false } })); }
      else { await enableCharacterAccount(char); setChar(c => ({ ...c, account: { ...(c.account || {}), enabled: true } })); }
    } catch { /* */ } finally { setBusy(false); }
  };

  const toggleAi = async () => {
    if (!canDrive || busy) return;
    setBusy(true);
    try { await updateCharacterAccount(char, { aiEnabled: !aiOn }); setChar(c => ({ ...c, account: { ...(c.account || {}), aiEnabled: !aiOn } })); }
    catch { /* */ } finally { setBusy(false); }
  };

  const savePersona = async () => {
    if (!canDrive || busy) return;
    setBusy(true);
    try { await updateCharacterAccount(char, { persona }); setChar(c => ({ ...c, account: { ...(c.account || {}), persona } })); }
    catch { /* */ } finally { setBusy(false); }
  };

  // Not switched on + you're not the creator → nothing to see (a character isn't public until its
  // creator brings it to life).
  if (!live && !canDrive) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4 text-white/40">
        <Bot size={44} className="text-violet-400/40" />
        <p className="text-[11px] font-black uppercase tracking-[0.3em]">This character isn't awake yet</p>
        {onBack && <button onClick={onBack} className="mt-2 px-5 py-2 rounded-full bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest">Back</button>}
      </div>
    );
  }

  const hero = char.imageUrl || char.gallery?.[0] || '';

  return (
    <div className="w-full min-h-screen text-white pb-24" style={{ background: 'radial-gradient(120% 60% at 50% -10%, rgba(124,58,237,0.28), transparent 60%), #0a0710' }}>
      {/* Hero */}
      <div className="relative h-[42vh] min-h-[300px] w-full overflow-hidden">
        {hero && <img src={hero} alt={char.name} className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'saturate(1.15)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,7,16,0.15) 0%, rgba(10,7,16,0.55) 55%, #0a0710 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 70% at 20% 20%, rgba(124,58,237,0.35), transparent 60%)', mixBlendMode: 'screen' }} />

        <div className="relative z-10 flex items-center justify-between p-5">
          {onBack ? <button onClick={onBack} className="p-2.5 rounded-full bg-black/40 backdrop-blur text-white"><ArrowLeft size={20} /></button> : <span />}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white" style={{ background: CHARACTER_GRADIENT }}>
            <Sparkles size={11} /> AI Persona
          </span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
          {(worldName || char.worldId) && (
            <button onClick={() => onVisitWorld?.(char.worldId)} className="inline-flex items-center gap-1.5 mb-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-[9px] font-black uppercase tracking-widest hover:bg-violet-500/30 transition-all">
              <Globe size={11} /> {worldName || 'World'}
            </button>
          )}
          <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.9] italic">{char.name}</h1>
          {char.role && <p className="text-violet-300/80 text-sm font-black uppercase tracking-widest mt-1">{char.role}</p>}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 -mt-2 space-y-6">
        {/* Chat CTA — gated: live only when the creator has enabled AI. */}
        <button
          disabled={!aiOn}
          onClick={() => { if (aiOn) window.dispatchEvent(new CustomEvent('OPEN_CHARACTER_CHAT', { detail: { character: char } })); }}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
          style={{ background: CHARACTER_GRADIENT }}
        >
          <MessageCircle size={16} /> {aiOn ? `Chat with ${char.name}` : 'Chat coming soon'}
        </button>

        {/* Creator control deck — only the character's creator can drive it. */}
        {canDrive && (
          <div className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.06] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wand2 size={14} className="text-violet-300" />
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Creator controls</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white">Bring {char.name} to life</p>
                <p className="text-[9px] text-white/40 mt-0.5">Publishes this violet character profile. Off = private.</p>
              </div>
              <button onClick={toggleLive} disabled={busy} className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${live ? 'text-white' : 'bg-white/10 text-white/60'}`} style={live ? { background: CHARACTER_GRADIENT } : {}}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} {live ? 'Live' : 'Turn on'}
              </button>
            </div>

            {live && (
              <>
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-1.5"><Bot size={12} className="text-violet-300" /> AI chatbot</p>
                    <p className="text-[9px] text-white/40 mt-0.5">Let people chat with {char.name} (Plajah AI or bring your own).</p>
                  </div>
                  <button onClick={toggleAi} disabled={busy} className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${aiOn ? 'text-white' : 'bg-white/10 text-white/60'}`} style={aiOn ? { background: CHARACTER_GRADIENT } : {}}>
                    {aiOn ? 'Enabled' : 'Enable'}
                  </button>
                </div>

                <div className="pt-3 border-t border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1.5">Personality direction</p>
                  <textarea
                    value={persona} onChange={e => setPersona(e.target.value)} onBlur={savePersona}
                    placeholder={`How should ${char.name} speak & behave? (their bio, lore & relationships are already built in)`}
                    className="w-full h-20 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none focus:border-violet-400/40 resize-none"
                  />
                  <button onClick={() => setShowPrompt(s => !s)} className="mt-2 text-[9px] font-black uppercase tracking-widest text-violet-300/80 hover:text-violet-200">
                    {showPrompt ? 'Hide' : 'Preview'} how {char.name} will think
                  </button>
                  {showPrompt && (
                    <pre className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-white/50 bg-black/30 border border-white/10 rounded-xl p-3 max-h-52 overflow-y-auto">{buildCharacterSystemPrompt({ ...char, account: { ...(char.account || {}), persona } }, worldName)}</pre>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Bio / lore */}
        {(char.bio || char.lore) && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            {char.bio && <p className="text-white/80 leading-relaxed">{char.bio}</p>}
            {char.lore && <p className="text-white/45 leading-relaxed mt-3 text-sm">{char.lore}</p>}
          </div>
        )}

        {/* Gallery */}
        {(char.gallery?.length ?? 0) > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {char.gallery!.slice(0, 9).map((g, i) => (
              <div key={i} className="aspect-square rounded-2xl overflow-hidden bg-white/5 border border-violet-400/10">
                <img src={g} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        )}

        {/* Relationships */}
        {(char.relationships?.length ?? 0) > 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-violet-300/70 mb-3 flex items-center gap-1.5"><Users size={12} /> Relationships</p>
            <div className="space-y-2">
              {char.relationships!.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-white/80 font-bold">{(r as any).name || r.characterId}</span>
                  {(r as any).type && <span className="text-[9px] font-black uppercase tracking-widest text-violet-300/60">{(r as any).type}</span>}
                  {(r as any).description && <span className="text-white/40 text-xs truncate">— {(r as any).description}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterProfileView;

// EmoteStudioSheet — the creator's emote controls during a live stream:
//   • stream switches (chorus, Crowd Light, kaiju summons, emote-only chat, bake into the stream)
//   • "your chat lights your room" — Crowd Light on connected smart lights
//   • channel emotes: upload your own, choose who can use them, their motion and gel
//   • ask the Council of Art Directors for a channel emote-set concept (through Aria)

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Lightbulb, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import type { EmoteAccess, EmoteDef, EmoteMotion, StreamEmoteSettings } from '../../services/emotes/emoteTypes';
import {
  CHANNEL_CODE_RE, deleteChannelEmote, saveStreamEmoteSettings, uploadChannelEmote,
} from '../../services/emotes/emoteLive';
import { ACCESS_LABEL } from '../../services/emotes/emoteEngine';
import { EmoteGlyph } from './EmoteGlyph';

const MOTIONS: EmoteMotion[] = ['float', 'pop', 'bounce', 'spin', 'shake', 'rain', 'stomp', 'beam', 'orbit', 'pulse'];
const GELS = ['#B04BFF', '#FF3D8B', '#FF8C00', '#FFC21F', '#22C55E', '#3FE6FF', '#3B82F6', '#FFFFFF'];

export interface EmoteStudioSheetProps {
  streamId: string | null;
  settings: StreamEmoteSettings;
  channelEmotes: EmoteDef[];
  roomLights: boolean;
  onRoomLights: (on: boolean) => void;
  roomLightsAvailable: boolean;
  /** Turning on "bake" needs the effects engine running; the streamer passes its engage function. */
  ensureComposer?: () => Promise<void>;
  onClose: () => void;
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; title: string; hint: string; disabled?: boolean }> = ({ on, onChange, title, hint, disabled }) => (
  <button type="button" disabled={disabled} onClick={() => onChange(!on)} role="switch" aria-checked={on}
    className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-2xl ${disabled ? 'opacity-40' : 'hover:bg-white/[0.04]'}`}>
    <span className="flex-1 min-w-0">
      <span className="block text-[13px] font-semibold text-white">{title}</span>
      <span className="block text-[11px] text-white/50 leading-snug">{hint}</span>
    </span>
    <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055]' : 'bg-white/15'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

export const EmoteStudioSheet: React.FC<EmoteStudioSheetProps> = ({ streamId, settings, channelEmotes, roomLights, onRoomLights, roomLightsAvailable, ensureComposer, onClose }) => {
  const [s, setS] = useState<StreamEmoteSettings>(settings);
  useEffect(() => setS(settings), [settings]);
  const set = async (patch: Partial<StreamEmoteSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    if (patch.bake && ensureComposer) await ensureComposer().catch(() => {});
    if (streamId) await saveStreamEmoteSettings(streamId, next).catch(() => {});
  };

  // ── channel emote upload ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [access, setAccess] = useState<EmoteAccess>('everyone');
  const [motion, setMotion] = useState<EmoteMotion>('pop');
  const [gel, setGel] = useState(GELS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const upload = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      await uploadChannelEmote(file, { code: code.toLowerCase(), name: code, access, motion, gel });
      setFile(null); setCode('');
    } catch (e: any) { setErr(e?.message || 'Upload failed.'); }
    finally { setBusy(false); }
  };

  // ── council concept ──
  const [vibe, setVibe] = useState('');
  const [council, setCouncil] = useState<{ busy: boolean; text?: string; quotes?: { who: string; line: string }[]; error?: string }>({ busy: false });
  const askCouncil = async () => {
    setCouncil({ busy: true });
    try {
      const { councilService, COUNCIL_DIRECTORS } = await import('../../services/council/councilService');
      const d = await councilService.deliberate({
        ask: `Design a channel emote set (8–12 emotes) for my Reello live streams. My channel: ${vibe || 'not described yet'}.`,
        surface: 'Reello Live channel emotes — 28 px in chat, 96–128 px when they fly across the stream',
        domain: 'live-stream emotes',
        constraints: ['Every emote must read at 28 px in chat.', 'For each emote give a code, what it shows, its motion (float, pop, bounce, spin, shake, rain, stomp, beam, orbit, pulse) and the colour of light it throws.'],
      }, { depth: 'QUICK' });
      const syn = d.synthesis;
      setCouncil({
        busy: false,
        text: syn ? `${syn.ariaSummary}\n\n${syn.direction}${syn.keepFromCounterpoint ? `\n\nKeep from the counterpoint: ${syn.keepFromCounterpoint}` : ''}${syn.openDecision ? `\n\nYour call: ${syn.openDecision}` : ''}` : (d.error || 'The council did not reach a synthesis.'),
        quotes: syn?.quotes?.map(q => ({ who: (COUNCIL_DIRECTORS as any)[q.directorId]?.name ?? q.directorId, line: q.line })),
      });
    } catch (e: any) { setCouncil({ busy: false, error: e?.message || 'The council is unavailable right now.' }); }
  };

  const codeOk = CHANNEL_CODE_RE.test(code.toLowerCase());

  return (
    <div className="absolute inset-x-0 bottom-0 z-[60] max-h-[78%] flex flex-col rounded-t-[28px] bg-[#120a1c]/95 backdrop-blur-xl border-t border-white/10" onClick={e => e.stopPropagation()} role="dialog" aria-label="Emote studio">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-[15px] font-black text-white">Emotes</p>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-white/[0.07] flex items-center justify-center text-white/80"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="px-3 pt-1 pb-1 text-[11px] uppercase tracking-wider text-white/40">On this stream</p>
        <Toggle on={s.chorus !== false} onChange={v => set({ chorus: v })} title="Chorus" hint="When lots of people send the same emote at once it grows — a wall, a storm, a firework." />
        <Toggle on={s.summons !== false} onChange={v => set({ summons: v })} title="Kaiju summons" hint="A full chorus of a Lorik or Lumi emote brings the kaiju onto your stream." />
        <Toggle on={s.crowdLight !== false} onChange={v => set({ crowdLight: v })} title="Crowd Light" hint="The colours your chat sends glow around the edge of the stream." />
        <Toggle on={!!s.emoteOnly} onChange={v => set({ emoteOnly: v })} title="Emote-only chat" hint="Chat messages must be emotes. Good for hype moments and slowing a raid." />
        <Toggle on={!!s.bake} onChange={v => set({ bake: v })} title="Bake emotes into the stream" hint="Draws emotes into the video itself, so recordings and restreams keep them. Uses the effects engine (warmer phone)." />

        <p className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" /> Your room</p>
        <Toggle on={roomLights} onChange={onRoomLights} disabled={!roomLightsAvailable} title="Your chat lights your room"
          hint={roomLightsAvailable ? 'Your smart lights slowly take on the colours your audience sends. Never flashes; never goes dark on you.' : 'Connect Hue, Nanoleaf, Govee or Razer lights in LD (Lighting Designer) first.'} />

        <p className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-white/40">Channel emotes</p>
        {channelEmotes.length > 0 && (
          <div className="grid grid-cols-5 gap-1 px-2 pb-2">
            {channelEmotes.map(e => (
              <div key={e.id} className="relative rounded-2xl bg-white/[0.04] p-2 flex flex-col items-center gap-1">
                <EmoteGlyph def={e} size={40} />
                <code className="text-[10px] text-white/60 truncate max-w-full">:{e.code}:</code>
                <span className="text-[9px] text-white/40">{ACCESS_LABEL[e.access ?? 'everyone']}</span>
                <button type="button" onClick={() => deleteChannelEmote(e.code)} aria-label={`Delete ${e.code}`} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/70"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mx-2 rounded-2xl bg-white/[0.04] p-3 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 shrink-0 rounded-2xl bg-white/[0.06] border border-dashed border-white/20 flex items-center justify-center overflow-hidden">
              {preview ? <img src={preview} alt="" className="w-full h-full object-contain" /> : <ImagePlus className="w-6 h-6 text-white/50" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center h-9 rounded-xl bg-black/30 px-2 text-[13px] text-white">
                <span className="text-white/40">:</span>
                <input value={code} onChange={e => setCode(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24))} placeholder="code" className="flex-1 bg-transparent outline-none px-0.5" />
                <span className="text-white/40">:</span>
              </div>
              <div className="flex gap-1.5">
                <select value={access} onChange={e => setAccess(e.target.value as EmoteAccess)} className="flex-1 h-8 rounded-lg bg-black/30 text-white text-[12px] px-1.5">
                  {(['everyone', 'follower', 'member'] as EmoteAccess[]).map(a => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
                </select>
                <select value={motion} onChange={e => setMotion(e.target.value as EmoteMotion)} className="flex-1 h-8 rounded-lg bg-black/30 text-white text-[12px] px-1.5">
                  {MOTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Light colour">
            <span className="text-[11px] text-white/50 mr-1">Light</span>
            {GELS.map(g => <button key={g} type="button" role="radio" aria-checked={gel === g} aria-label={g} onClick={() => setGel(g)} className={`w-6 h-6 rounded-full ${gel === g ? 'ring-2 ring-white ring-offset-2 ring-offset-[#120a1c]' : ''}`} style={{ background: g, boxShadow: `0 0 10px ${g}88` }} />)}
          </div>
          {err && <p className="text-[12px] text-rose-300">{err}</p>}
          <button type="button" disabled={!file || !codeOk || busy} onClick={upload}
            className="h-10 rounded-full bg-white text-black text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Add emote
          </button>
          <p className="text-[10px] text-white/40">PNG, GIF or WebP up to 512 KB. Transparent backgrounds look best. Codes: 2–24 lowercase letters, numbers, _.</p>
        </div>

        <p className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Design a set with the Council</p>
        <div className="mx-2 rounded-2xl bg-white/[0.04] p-3 flex flex-col gap-2">
          <textarea value={vibe} onChange={e => setVibe(e.target.value)} rows={2} placeholder="Describe your channel — what you stream, your in-jokes, your colours…"
            className="w-full rounded-xl bg-black/30 text-[13px] text-white p-2 outline-none resize-none placeholder:text-white/35" />
          <button type="button" disabled={council.busy} onClick={askCouncil}
            className="h-10 rounded-full bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-[13px] font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            {council.busy ? <><Loader2 className="w-4 h-4 animate-spin" /> The council is arguing it out…</> : 'Ask the council'}
          </button>
          {council.error && <p className="text-[12px] text-rose-300">{council.error}</p>}
          {council.text && <p className="text-[12px] text-white/80 whitespace-pre-line leading-relaxed">{council.text}</p>}
          {council.quotes?.map((q, i) => <p key={i} className="text-[11px] text-white/60 italic">“{q.line}” — {q.who}</p>)}
        </div>
      </div>
    </div>
  );
};

export default EmoteStudioSheet;

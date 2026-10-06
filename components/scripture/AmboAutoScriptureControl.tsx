// AmboAutoScriptureControl — "Auto scripture" on the audio bar.
//
// Listens to the room (default mic, a chosen input) and, when the speaker cites
// a verse, brings it up: straight to Program, or into Preview for one-click Take.
// Basic overlay (lower third over whatever is live) or any scripture look.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenCheck, X, Mic, Radio, AlertTriangle, Layers, Sparkles } from 'lucide-react';
import {
  getAutoScripturePrefs, getAutoScriptureState, subscribeAutoScripture, setAutoScripturePrefs,
  startAutoScripture, stopAutoScripture, type AutoScripturePrefs,
} from '../../services/ambo/autoScripture';
import { listAudioInputs } from '../../services/ambo/liveTranscriber';
import { SCRIPTURE_LAYOUTS } from '../../services/ambo/scriptureLayouts';
import { TRANSLATIONS } from '../../services/bibleService';

const OVERLAYS = SCRIPTURE_LAYOUTS.filter(l => l.background === 'transparent' || l.family === 'Overlay');
const LOOKS = SCRIPTURE_LAYOUTS;

const useAuto = () => {
  const prefs = useSyncExternalStore(subscribeAutoScripture, getAutoScripturePrefs);
  const state = useSyncExternalStore(subscribeAutoScripture, getAutoScriptureState);
  return { prefs, state };
};

const Seg: React.FC<{ value: string; options: Array<[string, string, string?]>; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <div className="flex gap-1">
    {options.map(([v, label, hint]) => (
      <button key={v} onClick={() => onChange(v)} title={hint}
        className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${value === v ? 'text-[#E3C57E] bg-[#E3C57E]/15 border-[#E3C57E]/40' : 'text-white/60 border-white/10 hover:text-white hover:bg-white/5'}`}>{label}</button>
    ))}
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2">
    <span className="w-[74px] flex-none text-[9px] font-extrabold uppercase tracking-wider text-white/40">{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

const AmboAutoScriptureControl: React.FC = () => {
  const { prefs, state } = useAuto();
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<Array<{ deviceId: string; label: string }>>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const set = (p: Partial<AutoScripturePrefs>) => setAutoScripturePrefs(p);

  useEffect(() => { if (open) void listAudioInputs().then(setInputs); }, [open, state.running]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const on = state.running;
  const layouts = prefs.style === 'overlay' ? OVERLAYS : LOOKS;
  const layoutId = prefs.style === 'overlay' ? prefs.overlayLayoutId : prefs.lookLayoutId;
  const pick = (id: string) => set(prefs.style === 'overlay' ? { overlayLayoutId: id } : { lookLayoutId: id });

  const panel = open ? createPortal(
    <div ref={panelRef} className="fixed z-[10000] w-[440px] max-w-[calc(100vw-24px)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: 'rgba(14,11,22,0.98)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)', ...anchorPos(btnRef.current) }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <BookOpenCheck size={14} className="text-[#E3C57E]" />
        <div className="text-[11px] font-bold text-white">Auto scripture</div>
        {on && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black text-black bg-[#2BE0A8]">LISTENING</span>}
        <div className="flex-1" />
        <button onClick={() => setOpen(false)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" aria-label="Close"><X size={13} /></button>
      </div>

      <div className="p-3 flex flex-col gap-2.5 max-h-[70vh] overflow-y-auto">
        <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 min-h-[54px]">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-white/40">
            <Mic size={10} /> Hearing
            {on && <span className="ml-auto h-1.5 w-16 rounded-full bg-white/10 overflow-hidden"><span className="block h-full bg-[#2BE0A8] transition-all" style={{ width: `${Math.round(state.level * 100)}%` }} /></span>}
          </div>
          <div className="text-[11.5px] text-white/80 leading-snug mt-1 break-words">
            {on ? (state.heard || <span className="text-white/35">Waiting for speech…</span>) : <span className="text-white/35">Off. Turn it on and Ambo listens for verses the speaker mentions.</span>}
          </div>
          {state.hearing && <div className="mt-1.5 text-[10.5px] font-bold text-[#E3C57E]"><Sparkles size={10} className="inline mr-1" />Heard “{state.hearing.label}” — confirming…</div>}
          {state.error && <div className="mt-1.5 text-[10.5px] text-[#F5C542]"><AlertTriangle size={10} className="inline mr-1" />{state.error}</div>}
        </div>

        <Row label="When heard">
          <Seg value={prefs.delivery} onChange={v => set({ delivery: v as any })} options={[
            ['cue', 'Cue to Preview', 'Safe: it waits in Preview, you press Take'],
            ['auto', 'Push to outputs', 'It goes straight to Program and every output'],
          ]} />
        </Row>
        <Row label="Style">
          <Seg value={prefs.style} onChange={v => set({ style: v as any })} options={[
            ['overlay', 'Basic overlay', 'A lower third over whatever is live'],
            ['look', 'Template', 'Any scripture look, picked below'],
          ]} />
        </Row>
        <Row label={prefs.style === 'overlay' ? 'Overlay' : 'Template'}>
          <select value={layoutId} onChange={e => pick(e.target.value)}
            className="w-full h-8 rounded-md bg-white/5 border border-white/10 text-[11px] text-white px-2">
            {layouts.map(l => <option key={l.id} value={l.id} className="bg-[#14101e]">{l.family} · {l.name}</option>)}
          </select>
        </Row>
        <Row label="Translation">
          <select value={prefs.translation} onChange={e => set({ translation: e.target.value })}
            className="w-full h-8 rounded-md bg-white/5 border border-white/10 text-[11px] text-white px-2">
            {TRANSLATIONS.filter(t => t.lang === 'en').map(t => <option key={t.slug} value={t.slug} className="bg-[#14101e]">{t.label}</option>)}
          </select>
        </Row>
        <Row label="Listen to">
          <div className="flex gap-1.5">
            <Seg value={prefs.source} onChange={v => set({ source: v as any })} options={[['mic', 'Default mic'], ['device', 'Audio input']]} />
            {prefs.source === 'device' && (
              <select value={prefs.deviceId} onChange={e => set({ deviceId: e.target.value })}
                className="flex-1 min-w-0 h-7 rounded-md bg-white/5 border border-white/10 text-[10.5px] text-white px-1.5">
                <option value="" className="bg-[#14101e]">Choose input…</option>
                {inputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-[#14101e]">{d.label}</option>)}
              </select>
            )}
          </div>
        </Row>
        <Row label="Verses">
          <div className="flex items-center gap-2 text-[10.5px] text-white/70">
            <select value={prefs.versesPerScreen} onChange={e => set({ versesPerScreen: Number(e.target.value) })}
              className="h-7 rounded-md bg-white/5 border border-white/10 text-[11px] text-white px-1.5">
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n} className="bg-[#14101e]">{n}</option>)}
            </select> per screen
          </div>
        </Row>
        {prefs.delivery === 'auto' && (
          <Row label="Auto clear">
            <select value={prefs.autoClearSec} onChange={e => set({ autoClearSec: Number(e.target.value) })}
              className="h-7 rounded-md bg-white/5 border border-white/10 text-[11px] text-white px-1.5">
              {[[0, 'Leave it up'], [15, 'After 15 s'], [30, 'After 30 s'], [60, 'After 1 min']].map(([v, l]) => <option key={v} value={v} className="bg-[#14101e]">{l}</option>)}
            </select>
          </Row>
        )}

        {state.history.length > 0 && (
          <div className="border-t border-white/10 pt-2">
            <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Recent</div>
            <div className="flex flex-wrap gap-1">
              {state.history.slice(0, 6).map((h, i) => (
                <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] border ${h.ok ? 'text-white/80 border-white/15' : 'text-[#F5C542] border-[#F5C542]/30'}`}>
                  {h.label}{h.ok ? (h.delivered === 'auto' ? ' · live' : ' · cued') : ' · not found'}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <div className="text-[9px] text-white/40 flex-1 leading-snug">
            “turn to John three sixteen”, “Romans chapter eight verse twenty-eight”. A bare chapter needs a cue like “open to Psalm 23”.
            {state.engine === 'speech' && ' Browser speech engines may send audio to their vendor.'}
          </div>
          <button onClick={() => (on ? stopAutoScripture() : void startAutoScripture())} disabled={state.starting}
            className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black disabled:opacity-40 ${on ? 'text-white bg-white/10 hover:bg-white/20 border border-white/15' : 'text-black bg-[#E3C57E] hover:brightness-110'}`}>
            {state.starting ? 'Starting…' : on ? 'Stop listening' : 'Start listening'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        className={`px-2 py-1 rounded text-[9.5px] font-bold border flex items-center gap-1 ${on ? 'text-black bg-[#2BE0A8] border-[#2BE0A8]' : open ? 'text-[#E3C57E] bg-[#E3C57E]/15 border-[#E3C57E]/30' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
        title="Listen for scripture the speaker mentions and bring it on screen">
        {on ? <Radio size={11} className="animate-pulse" /> : <Layers size={11} />} Auto scripture{on ? ' · ON' : ''}
      </button>
      {panel}
    </>
  );
};

function anchorPos(el: HTMLElement | null): React.CSSProperties {
  if (!el || typeof window === 'undefined') return { right: 12, bottom: 60 };
  const r = el.getBoundingClientRect();
  const right = Math.max(12, Math.min(window.innerWidth - r.right, window.innerWidth - 452));
  return r.top > window.innerHeight / 2 ? { right, bottom: window.innerHeight - r.top + 8 } : { right, top: r.bottom + 8 };
}

export default AmboAutoScriptureControl;

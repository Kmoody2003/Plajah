// AmboSlideEditor — edit a slide as a Tela document. The slide's text lives in a
// Tela Writer device on a 16:9 SCREEN frame (services/ambo/telaSlide.ts), so slides
// are authored on the same document model as the rest of Plajah. Author-in-place:
// the text is edited directly on the slide canvas, with a floating format menu.
// Scripture slides show their binding (the verse the text follows). Plajah language.

import React, { useMemo, useState } from 'react';
import { ChevronLeft, Check, Link2 } from 'lucide-react';
import type { Slide } from '../../services/ambo/showModel';
import { slideText } from '../../services/ambo/servicePlanDemo';
import { slideToTela } from '../../services/ambo/telaSlide';

interface AmboSlideEditorProps {
  slide: Slide;
  /** e.g. "Luke 15:20 · KJV" when this slide's text follows a scripture ref. */
  boundRef?: string | null;
  onSave: (text: string) => void;
  onClose: () => void;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const CYAN = '#00DAF3';
const LILAC = '#D0BCFF';
const GOLD = '#E3C57E';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.15)';
const glass = 'rgba(255,255,255,0.04)';

const AmboSlideEditor: React.FC<AmboSlideEditorProps> = ({ slide, boundRef, onSave, onClose }) => {
  const [text, setText] = useState(() => slideText(slide));
  const doc = useMemo(() => slideToTela(slide), [slide.id]); // for the tela:// identity + frame
  const telaUri = `tela://ambo/${doc.id.replace(/^tela_ambo_/, '')}`;

  const save = () => { onSave(text); onClose(); };

  return (
    <div className="fixed inset-0 z-[130] flex flex-col" style={{ background: '#08060f' }}>
      {/* toolbar */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b backdrop-blur-xl flex-none" style={{ borderColor: line, background: 'rgba(10,7,17,0.72)' }}>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors">
          <ChevronLeft size={16} /> Back to Live
        </button>
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg grid place-items-center text-white font-extrabold text-[15px]" style={{ background: BRAND, boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}>A</span>
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-[15px]">Slide Editor</div>
            <div className="text-[9.5px] text-white/40 -mt-0.5">{slide.label ?? 'Slide'}</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 h-[26px] px-3 rounded-full text-[11px] font-bold" style={{ color: '#07131a', background: `linear-gradient(135deg,${CYAN},${LILAC})`, boxShadow: '0 0 20px rgba(0,218,243,0.3)' }}>
          ✦ Powered by Tela
        </span>
        <div className="flex-1" />
        <button onClick={save} className="h-9 px-5 rounded-lg text-white font-bold text-[13px]" style={{ background: BRAND, boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}>
          <span className="inline-flex items-center gap-1.5"><Check size={15} /> Done</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,300px)' }}>
        {/* Tela canvas */}
        <div className="relative grid place-items-center p-9" style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.014) 0 13px, transparent 13px 26px), #08060f' }}>
          <div className="relative w-full max-w-[760px]" style={{ aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', boxShadow: '0 22px 52px rgba(0,0,0,0.55)', border: `1px solid ${line2}` }}>
            {/* slide background hint */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1a0b2e,#06121f)' }} />
            {/* author-in-place flying menu */}
            <div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 flex items-center gap-1 p-1.5 rounded-xl" style={{ background: 'rgba(14,11,22,0.94)', backdropFilter: 'blur(14px)', border: `1px solid ${line2}`, boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
              <span className="w-7 h-7 grid place-items-center rounded-md text-white/80 font-extrabold text-[12px] cursor-pointer hover:bg-white/10">B</span>
              <span className="w-7 h-7 grid place-items-center rounded-md text-white/80 italic text-[12px] cursor-pointer hover:bg-white/10">I</span>
              <span className="w-7 h-7 grid place-items-center rounded-md text-white/80 underline text-[12px] cursor-pointer hover:bg-white/10">U</span>
              <span className="w-px h-4 mx-0.5" style={{ background: line }} />
              <span className="px-2 h-7 grid place-items-center rounded-md text-white/70 text-[11px] cursor-pointer hover:bg-white/10" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }}>Iowan ▾</span>
              <span className="px-2 h-7 grid place-items-center rounded-md text-white/70 font-mono text-[11px] cursor-pointer hover:bg-white/10">54</span>
              <span className="w-7 h-7 grid place-items-center rounded-md cursor-pointer hover:bg-white/10"><span className="w-4 h-4 rounded" style={{ background: GOLD, border: '1px solid rgba(255,255,255,0.4)' }} /></span>
              {boundRef && (
                <>
                  <span className="w-px h-4 mx-0.5" style={{ background: line }} />
                  <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-bold" style={{ color: '#04222a', background: CYAN }}><Link2 size={12} /> Bound</span>
                </>
              )}
            </div>
            {/* the editable text, centred on the slide */}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              spellCheck={false}
              className="absolute inset-0 w-full h-full bg-transparent text-center resize-none outline-none px-[9%] flex"
              style={{
                fontFamily: 'Palatino Linotype, Palatino, Georgia, serif',
                color: '#fff', fontWeight: 700,
                fontSize: 'clamp(20px,3.4vw,40px)', lineHeight: 1.2,
                textShadow: '0 2px 18px rgba(0,0,0,0.6)',
                paddingTop: '30%',
              }}
            />
            {boundRef && (
              <span className="absolute right-3 bottom-3 z-20 font-mono text-[10px] font-bold px-2 py-1 rounded" style={{ color: '#04222a', background: CYAN }}>
                🔗 {boundRef}
              </span>
            )}
          </div>
          <div className="mt-4 text-[11px] text-white/40 text-center">
            One canvas everywhere — the same <b style={{ color: LILAC }}>Tela</b> document model powers slides, Lorea pages, titling and Fabula lower-thirds.
          </div>
        </div>

        {/* inspector */}
        <aside className="border-l overflow-y-auto flex flex-col" style={{ borderColor: line, background: 'rgba(0,0,0,0.16)' }}>
          <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Text</div>
          <div className="px-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">Slide text</span>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
                className="rounded-lg px-3 py-2 text-[13px] text-white outline-none resize-none"
                style={{ background: glass, border: `1px solid ${line}`, fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">Font</span><div className="h-8 rounded-lg px-2.5 flex items-center text-[12px] text-white/80" style={{ background: glass, border: `1px solid ${line}` }}>Iowan Old Style</div></div>
              <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">Size</span><div className="h-8 rounded-lg px-2.5 flex items-center font-mono text-[12px] text-white/80" style={{ background: glass, border: `1px solid ${line}` }}>54</div></div>
            </div>
          </div>

          {boundRef && (
            <div className="m-4 mt-5 rounded-xl p-3.5" style={{ border: '1px solid rgba(0,218,243,0.32)', background: 'rgba(0,218,243,0.06)' }}>
              <div className="flex items-center gap-2 text-[11.5px] font-bold mb-1.5" style={{ color: CYAN }}><Link2 size={14} /> Data binding</div>
              <p className="text-[12px] text-white/75 leading-relaxed">This text follows <b style={{ color: CYAN }}>{boundRef}</b> on the scripture layer. Change the reference or translation and every bound slide reflows — a Tela binding, shared with titling &amp; Lorea.</p>
            </div>
          )}

          <div className="mt-auto px-4 py-3 border-t text-[11px]" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)', color: 'rgba(255,255,255,0.4)' }}>
            ✦ <b style={{ color: CYAN }}>Tela</b> document · <span className="font-mono">{telaUri}</span>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AmboSlideEditor;

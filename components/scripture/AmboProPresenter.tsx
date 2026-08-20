// AmboProPresenter — a ProPresenter-style presenter for Ambo, in the Plajah design
// language. Additive: a new surface (AppView 'AMBO_PRO') that leaves the existing
// AmboPresenter/AmboStage untouched. Built on the canonical showModel (Show/Slide/
// LiveStack/LayerRenderer) so what the operator takes composites for real.
//
// Layout mirrors ProPresenter so their operators feel at home: Library + Playlists
// (left), a grouped slide grid (centre, the hero), audience output + media bin +
// outputs (right). Output placement is a choice (right column default, or a top bar).
// Scripture is reachable from the Library/toolbar. Palette is Plajah brand
// (purple→magenta gradient primary, orange = live wire, cyan = preview, gold =
// scripture), with per-group colour rails.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, MonitorPlay, Plus, Pencil, BookOpen } from 'lucide-react';
import {
  applySlide, LAYER_ORDER, LAYER_LABEL, type LiveStack, type Show, type Slide,
} from '../../services/ambo/showModel';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { DEMO_LIBRARY, DEMO_PLAYLIST, slideText } from '../../services/ambo/servicePlanDemo';
import AmboStageDisplay from './AmboStageDisplay';

interface AmboProPresenterProps {
  onBack?: () => void;
}

// ── Plajah design language ──
const GROUND = '#0A0711';
const HEADER = 'rgba(10,7,17,0.72)';
const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const ORANGE = '#FF8C00';   // the live wire
const CYAN = '#00DAF3';     // preview / realtime
const GOLD = '#E3C57E';     // scripture
const LILAC = '#D0BCFF';
const glass = 'rgba(255,255,255,0.035)';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.15)';

/** A live canvas driven by the shared renderer — same compositor the outputs run. */
const OutputMonitor: React.FC<{ stack: LiveStack; audio?: boolean; className?: string }> = ({ stack, audio, className }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = new LayerRenderer(c, { w: 960, h: 540 });
    r.setOptions({ audioEnabled: !!audio });
    r.start();
    rendererRef.current = r;
    return () => { r.dispose(); rendererRef.current = null; };
  }, [audio]);
  useEffect(() => { rendererRef.current?.setStack(stack); }, [stack]);
  return <canvas ref={ref} className={`w-full block bg-black ${className ?? ''}`} />;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const AmboProPresenter: React.FC<AmboProPresenterProps> = ({ onBack }) => {
  const library = DEMO_LIBRARY;
  const playlist = DEMO_PLAYLIST;
  // Open on the live item (the sermon) so the presenter reads as mid-service.
  const initial = playlist.find(p => p.live) ?? playlist[playlist.length - 1];
  const [activeShowId, setActiveShowId] = useState<string>(initial.show.id);
  const activeShow: Show = useMemo(
    () => library.find(s => s.id === activeShowId) ?? initial.show,
    [library, activeShowId, initial.show],
  );
  const slides = activeShow.slides;

  const [live, setLive] = useState<LiveStack>({});
  const [liveSlideId, setLiveSlideId] = useState<string | null>(null);
  const [liveSlideObj, setLiveSlideObj] = useState<Slide | null>(null);
  const [selected, setSelected] = useState(2); // preview cursor
  const [placement, setPlacement] = useState<'right' | 'top'>('right');
  const [stageOpen, setStageOpen] = useState(false);
  const [elapsed, setElapsed] = useState(1 * 3600 + 12 * 44);

  useEffect(() => {
    const t = setInterval(() => setElapsed(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const previewSlide = slides[Math.min(selected, slides.length - 1)];
  const previewStack = useMemo(
    () => (previewSlide ? applySlide(live, previewSlide, Date.now()) : live),
    [live, previewSlide],
  );

  const take = (s: Slide) => {
    setLive(prev => applySlide(prev, s, Date.now()));
    setLiveSlideId(s.id);
    setLiveSlideObj(s);
  };
  const takeSelected = () => { if (previewSlide) take(previewSlide); };

  const liveIdx = slides.findIndex(s => s.id === liveSlideId);
  const nextSlide = liveIdx >= 0 && liveIdx + 1 < slides.length ? slides[liveIdx + 1] : previewSlide;

  const elapsedClock = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  // Which layer slots are currently live (for the layer bar).
  const liveSlots = new Set(Object.keys(live));

  const OutputPreview: React.FC<{ compact?: boolean }> = ({ compact }) => (
    <div className={compact ? '' : 'p-3.5'}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: ORANGE }}>● Audience Output</span>
        <span className="font-mono text-[9.5px] text-white/40">1920×1080</span>
      </div>
      <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: liveSlideId ? 'rgba(255,140,0,0.75)' : line2, boxShadow: liveSlideId ? '0 0 22px rgba(255,140,0,0.28)' : 'none' }}>
        <OutputMonitor stack={live} audio />
      </div>
      <div className="flex items-center justify-between mt-3 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CYAN }}>Preview · Next</span>
        <span className="font-mono text-[9.5px] text-white/40">{nextSlide?.label ?? '—'}</span>
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(0,218,243,0.4)' }}>
        <OutputMonitor stack={previewStack} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: GROUND }}>
      {/* toolbar */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b backdrop-blur-xl flex-none" style={{ borderColor: line, background: HEADER }}>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors">
            <ChevronLeft size={16} /> Exit
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg grid place-items-center text-white font-extrabold text-[15px]" style={{ background: BRAND, boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}>A</span>
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-[15px]">Ambo</div>
            <div className="text-[9.5px] text-white/40 -mt-0.5">MEDIA SERVER</div>
          </div>
        </div>
        <div className="pl-4 ml-1 border-l leading-tight" style={{ borderColor: line }}>
          <div className="text-[13px] font-semibold">Sunday Gathering</div>
          <div className="text-[10.5px] text-white/45">Grace City Church · 10:00</div>
        </div>
        <div className="flex-1" />
        <button onClick={() => setStageOpen(true)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-semibold border" style={{ borderColor: line2, background: glass }}>
          <MonitorPlay size={14} style={{ color: CYAN }} /> Stage
        </button>
        <button className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-semibold border" style={{ borderColor: line2, background: glass }}>
          <BookOpen size={14} style={{ color: GOLD }} /> Scripture
        </button>
        <span className="inline-flex items-center gap-2 h-[26px] px-3 rounded-full text-[11.5px] font-bold text-white border" style={{ background: 'rgba(255,140,0,0.14)', borderColor: 'rgba(255,140,0,0.5)', boxShadow: '0 0 22px rgba(255,140,0,0.3)' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: ORANGE }} /> ON AIR
        </span>
        <div className="flex flex-col items-end leading-none">
          <span className="font-mono text-[19px] font-semibold tabular-nums">{elapsedClock}</span>
          <span className="text-[9px] text-white/40 uppercase tracking-widest">Elapsed</span>
        </div>
        <button onClick={takeSelected} className="h-11 px-6 rounded-xl text-white font-extrabold tracking-wide text-[14.5px]" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)', boxShadow: '0 0 22px rgba(255,140,0,0.3)' }}>
          TAKE ▸
        </button>
      </header>

      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0,240px) minmax(0,1fr) minmax(0,288px)' }}>
        {/* LIBRARY + PLAYLISTS */}
        <aside className="border-r overflow-y-auto min-w-0" style={{ borderColor: line, background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40">Library</span>
            <Plus size={13} className="text-white/40" />
          </div>
          <div className="px-2">
            {library.map(sh => (
              <button key={sh.id} onClick={() => setActiveShowId(sh.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12.5px] text-left transition-colors"
                style={{ background: sh.id === activeShowId ? glass : 'transparent', color: sh.id === activeShowId ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: sh.id === activeShowId ? 600 : 400 }}>
                <span className="w-4 text-center text-white/40">{sh.kind === 'SONG' ? '♪' : sh.kind === 'SCRIPTURE' ? '✦' : sh.kind === 'MEDIA' ? '◈' : '▤'}</span>
                <span className="truncate">{sh.title}</span>
              </button>
            ))}
          </div>
          <div className="h-px mx-3 my-2.5" style={{ background: line }} />
          <div className="flex items-center justify-between px-3.5 pb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40">Playlist · Sunday</span>
          </div>
          <div className="px-2 pb-3 ml-3 border-l" style={{ borderColor: line }}>
            {playlist.map(pi => (
              <button key={pi.id} onClick={() => setActiveShowId(pi.show.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-left transition-colors"
                style={{ background: pi.live ? 'linear-gradient(90deg, rgba(255,140,0,0.16), transparent)' : pi.show.id === activeShowId ? glass : 'transparent', color: pi.live ? '#fff' : 'rgba(255,255,255,0.6)', boxShadow: pi.live ? `inset 2px 0 0 ${ORANGE}` : undefined }}>
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: pi.live ? ORANGE : 'rgba(255,255,255,0.25)', boxShadow: pi.live ? '0 0 8px rgba(255,140,0,0.6)' : undefined }} />
                <span className="truncate flex-1">{pi.title}</span>
                <span className="font-mono text-[9px] text-white/35">{fmt(pi.plannedSec)}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* SLIDE GRID (the hero) */}
        <div className="flex flex-col min-w-0" style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(107,0,153,0.10), transparent 55%)' }}>
          <div className="flex items-center gap-3 px-4.5 py-3 border-b" style={{ borderColor: line, paddingLeft: 18, paddingRight: 18 }}>
            <div className="leading-tight">
              <div className="font-semibold text-[18px]" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }}>{activeShow.title}</div>
              <div className="text-[11.5px] text-white/45">{activeShow.author ? `${activeShow.author} · ` : ''}{slides.length} slides</div>
            </div>
            {activeShow.arrangement && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ color: LILAC, background: 'rgba(208,188,255,0.1)', border: '1px solid rgba(208,188,255,0.28)' }}>
                {activeShow.arrangement.join(' · ')}
              </span>
            )}
            <div className="flex-1" />
            {/* output placement toggle */}
            <span className="inline-flex gap-0.5 p-0.5 rounded-lg border" style={{ borderColor: line, background: glass }} title="Where the audience output shows">
              {(['right', 'top'] as const).map(p => (
                <button key={p} onClick={() => setPlacement(p)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize"
                  style={{ background: placement === p ? 'rgba(255,255,255,0.10)' : 'transparent', color: placement === p ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                  {p === 'right' ? '▤ Right' : '▙ Top'}
                </button>
              ))}
            </span>
            <button className="w-8 h-8 grid place-items-center rounded-lg border text-white/60" style={{ borderColor: line, background: glass }} title="Edit slide in Tela">
              <Pencil size={14} />
            </button>
          </div>

          {placement === 'top' && (
            <div className="grid gap-3.5 px-4.5 pt-4 pb-1 border-b" style={{ gridTemplateColumns: '1.5fr 1fr', borderColor: line, paddingLeft: 18, paddingRight: 18 }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: ORANGE }}>● Audience Output</div>
                <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: 'rgba(255,140,0,0.75)', boxShadow: '0 0 22px rgba(255,140,0,0.28)' }}>
                  <OutputMonitor stack={live} audio />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: CYAN }}>Preview · Next</div>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(0,218,243,0.4)' }}>
                  <OutputMonitor stack={previewStack} />
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4.5" style={{ padding: 18 }}>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {slides.map((s, i) => {
                const isLive = s.id === liveSlideId;
                const isSel = i === selected;
                const prevGroup = i > 0 ? slides[i - 1].group : undefined;
                const showHeader = s.group && s.group !== prevGroup;
                return (
                  <React.Fragment key={s.id}>
                    {showHeader && (
                      <div className="flex items-center gap-2 mt-1.5" style={{ gridColumn: '1 / -1' }}>
                        <span className="inline-block w-4 h-[3px] rounded" style={{ background: s.groupColor ?? '#888' }} />
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.12em]" style={{ color: s.groupColor ?? '#aaa' }}>{s.group}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setSelected(i)}
                      onDoubleClick={() => take(s)}
                      className="relative rounded-[10px] overflow-hidden border-2 text-left transition-transform hover:-translate-y-0.5"
                      style={{ borderColor: isLive ? ORANGE : isSel ? CYAN : line, boxShadow: isLive ? '0 0 18px rgba(255,140,0,0.3)' : isSel ? '0 0 16px rgba(0,218,243,0.25)' : 'none' }}
                    >
                      {!isLive && !isSel && s.groupColor && <span className="absolute top-0 left-0 right-0 h-[3px] z-[3]" style={{ background: s.groupColor }} />}
                      <span className="absolute top-1 left-1.5 z-[3] font-mono text-[9px] text-white/70">{i + 1}</span>
                      {isLive && <span className="absolute top-1 right-1.5 z-[3] text-[8px] font-extrabold px-1.5 rounded" style={{ background: ORANGE, color: '#2a1400' }}>LIVE</span>}
                      {!isLive && isSel && <span className="absolute top-1 right-1.5 z-[3] text-[8px] font-extrabold px-1.5 rounded" style={{ background: CYAN, color: '#04222a' }}>PREVIEW</span>}
                      <div className="aspect-video grid place-items-center px-2 text-center" style={{ background: 'linear-gradient(135deg,#1a0b2e,#06121f)' }}>
                        <span className="text-[12px] font-semibold text-white leading-tight line-clamp-3" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                          {slideText(s)}
                        </span>
                      </div>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* layer bar — the media-server identity, ProPresenter-subtle */}
          <div className="flex items-center gap-2 px-4.5 py-2.5 border-t overflow-x-auto flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.22)', paddingLeft: 18, paddingRight: 18 }}>
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/40 flex-none">Layers</span>
            {LAYER_ORDER.map(slot => {
              const on = liveSlots.has(slot);
              return (
                <span key={slot} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] flex-none border" style={{ borderColor: on ? line2 : line, background: on ? glass : 'transparent', color: on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: slot === 'scripture' ? GOLD : slot === 'background' ? CYAN : slot === 'prop' ? '#D40055' : on ? LILAC : 'rgba(255,255,255,0.2)' }} />
                  {LAYER_LABEL[slot]}
                </span>
              );
            })}
          </div>
        </div>

        {/* RIGHT: output preview + media bin + outputs */}
        <aside className="border-l overflow-y-auto flex flex-col" style={{ borderColor: line, background: 'rgba(0,0,0,0.16)' }}>
          {placement === 'right' && <OutputPreview />}
          <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5" style={placement === 'right' ? { borderTop: `1px solid ${line}` } : undefined}>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40">Media Bin</span>
            <Plus size={13} className="text-white/40" />
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {[['Aurora', 'radial-gradient(120% 90% at 20% 10%, rgba(0,218,243,.7), transparent 60%), radial-gradient(120% 90% at 90% 90%, #6b0099, transparent 55%), #160a26'],
              ['Liquid Light', 'linear-gradient(120deg,#00daf3,#6b0099 60%,#d40055)'],
              ['Storm', 'radial-gradient(80% 120% at 50% 0, rgba(0,218,243,.5), transparent), linear-gradient(180deg,#0a1826,#04070d)'],
              ['Nebula', 'radial-gradient(100% 100% at 70% 30%, rgba(212,0,85,.8), transparent 55%), #0a0713']].map(([nm, bg]) => (
              <div key={nm} className="rounded-lg overflow-hidden border aspect-[16/10] flex items-end cursor-pointer" style={{ borderColor: line, background: bg as string }}>
                <span className="text-[10px] font-semibold text-white px-2 py-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{nm}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5 border-t" style={{ borderColor: line }}>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/40">Outputs</span>
            <span className="font-mono text-[9px] text-white/35">4 active</span>
          </div>
          <div className="px-3 pb-4 flex flex-col gap-2">
            {[['Program', '1920×1080 · Main', true], ['Stage Display', 'Confidence', true], ['Key / Alpha', 'to ATEM', true], ['Lobby', '4K · Idle', false]].map(([nm, sub, on]) => (
              <div key={nm as string} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border" style={{ borderColor: line, background: glass }}>
                <MonitorPlay size={15} style={{ color: on ? ORANGE : 'rgba(255,255,255,0.4)' }} />
                <div className="flex-1 leading-tight min-w-0">
                  <div className="text-[12px] font-semibold truncate">{nm}</div>
                  <div className="font-mono text-[9.5px] text-white/40 truncate">{sub}</div>
                </div>
                <span className="w-8 h-5 rounded-full relative flex-none" style={{ background: on ? ORANGE : 'rgba(255,255,255,0.2)' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 16 : 2 }} />
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {stageOpen && (
        <AmboStageDisplay
          currentSlide={liveSlideObj}
          nextSlide={nextSlide}
          elapsedSec={elapsed}
          live={!!liveSlideId}
          onClose={() => setStageOpen(false)}
        />
      )}
    </div>
  );
};

export default AmboProPresenter;

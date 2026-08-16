// AmboStage — the media console: show, slides, layers, library, outputs.
//
// Sits alongside the scripture composer rather than replacing it. Scripture is
// one layer source among many now; this is where the rest of the service gets
// built — the loop behind the songs, the lower third for the guest speaker, the
// sting under the offering.
//
// The live preview is the SAME LayerRenderer the outputs run, so what the
// operator approves here is what every screen composites.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Play, Eraser, Layers as LayersIcon, Image as ImageIcon,
  Music, Sparkles, MonitorPlay, Type, Search, Square, Monitor, X, Clock, BookOpen, GripVertical,
} from 'lucide-react';
import {
  applySlide, clearAll, clearLayer, LAYER_ORDER, LAYER_LABEL, textSlide,
  type LayerSlot, type LiveStack, type Show, type Slide,
} from '../../services/ambo/showModel';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import {
  GENERATOR_ITEMS, PROP_ITEMS, SCRIPTURE_ITEMS, searchLibrary, kindForFile, mediaItem,
  type LibraryItem,
} from '../../services/ambo/mediaLibrary';
import {
  OutputRouter, makeOutput, detectScreens,
  type AmboOutput, type OutputKind,
} from '../../services/ambo/outputRouter';
import {
  makeTimer, timerValue, timerSnapshot, startTimer, pauseTimer, resetTimer, formatTimer,
  type Timer,
} from '../../services/ambo/serviceRunner';

const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** A live canvas driven by the shared renderer. */
const StageMonitor: React.FC<{
  stack: LiveStack; label: string; live?: boolean; audio?: boolean;
}> = ({ stack, label, live, audio }) => {
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

  return (
    <div className="relative rounded-md overflow-hidden border-2"
      style={{ borderColor: live ? '#FF4B50' : '#2BE0A8' }}>
      <span className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[8px] font-mono tracking-widest"
        style={{ background: live ? '#FF4B50' : '#2BE0A8', color: live ? '#fff' : '#062' }}>
        {label}
      </span>
      <canvas ref={ref} className="w-full block bg-black" />
    </div>
  );
};

const AmboStage: React.FC = () => {
  // A playlist of shows — the ProPresenter/FreeShow workflow. One deck per item
  // in the run of show, not one deck for the whole service.
  const [playlist, setPlaylist] = useState<Show[]>(() => [
    { id: newId('show'), title: 'Countdown', kind: 'MEDIA', slides: [textSlide('Starting soon', { label: 'Countdown' })] },
    { id: newId('show'), title: 'Welcome', kind: 'PRESENTATION', slides: [textSlide('Welcome', { label: 'Welcome' })] },
  ]);
  const [showIdx, setShowIdx] = useState(0);
  const [selected, setSelected] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const show = playlist[showIdx];
  const setShow = (fn: Show | ((s: Show) => Show)) =>
    setPlaylist(list => list.map((sh, i) => (i === showIdx ? (typeof fn === 'function' ? (fn as any)(sh) : fn) : sh)));
  const [live, setLive] = useState<LiveStack>({});
  const [tab, setTab] = useState<'backgrounds' | 'props' | 'scripture' | 'media'>('backgrounds');
  const [q, setQ] = useState('');
  const [media, setMedia] = useState<LibraryItem[]>([]);
  const [timers, setTimers] = useState<Timer[]>(() => [
    makeTimer('countdown', 'Pre-service', 'COUNTDOWN', { durationSec: 300 }),
    makeTimer('message', 'Message', 'ELAPSED'),
    makeTimer('wrap', 'Wrap in', 'COUNTDOWN', { durationSec: 1800, overrun: true }),
  ]);
  const [tick, setTick] = useState(0);
  const [outputs, setOutputs] = useState<AmboOutput[]>(() => [
    makeOutput('PROGRAM', 'Auditorium'),
    makeOutput('KEY', 'Switcher key'),
    makeOutput('STAGE', 'Stage display'),
  ]);
  const [screens, setScreens] = useState<Array<{ label: string }>>([]);
  const routerRef = useRef<OutputRouter | null>(null);

  // One router for the session; it owns the channel and the windows.
  useEffect(() => {
    const r = new OutputRouter(outputs);
    routerRef.current = r;
    return () => { r.dispose(); routerRef.current = null; };
  }, []);

  // One second is the right cadence: timers are read to the second on every
  // surface, and a faster tick would broadcast the whole stack pointlessly.
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const r = routerRef.current;
    if (!r) return;
    r.outputs = outputs;
    r.send(live, timerSnapshot(timers, Date.now()));
  }, [live, outputs, timers, tick]);

  const slide = show.slides[selected];
  const preview = useMemo(() => (slide ? applySlide(live, slide, Date.now()) : live), [live, slide]);

  // ── editing ────────────────────────────────────────────────────────────────
  const patchSlide = (i: number, fn: (s: Slide) => Slide) =>
    setShow(s => ({ ...s, slides: s.slides.map((sl, idx) => (idx === i ? fn(sl) : sl)) }));

  const addSlide = () => {
    setShow(s => ({ ...s, slides: [...s.slides, textSlide('', { label: `Slide ${s.slides.length + 1}` })] }));
    setSelected(show.slides.length);
  };

  const removeSlide = (i: number) => {
    setShow(s => ({ ...s, slides: s.slides.filter((_, idx) => idx !== i) }));
    setSelected(v => Math.max(0, Math.min(v, show.slides.length - 2)));
  };

  const addLayerFrom = (item: LibraryItem) => {
    if (!slide) return;
    patchSlide(selected, s => ({
      ...s,
      layers: [...s.layers.filter(l => l.slot !== item.slot), {
        id: newId('ly'), slot: item.slot, content: item.content,
      }],
    }));
  };

  const removeLayer = (slot: LayerSlot) =>
    patchSlide(selected, s => ({ ...s, layers: s.layers.filter(l => l.slot !== slot) }));

  const setText = (text: string) =>
    patchSlide(selected, s => {
      const others = s.layers.filter(l => l.slot !== 'slide');
      return { ...s, layers: [...others, { id: newId('ly'), slot: 'slide', content: { kind: 'TEXT', blocks: [{ text }] } }] };
    });

  const take = () => { if (slide) setLive(l => applySlide(l, slide, Date.now())); };

  // ── library ────────────────────────────────────────────────────────────────
  const items = tab === 'backgrounds' ? GENERATOR_ITEMS
    : tab === 'props' ? PROP_ITEMS
    : tab === 'scripture' ? SCRIPTURE_ITEMS
    : media;
  const shown = useMemo(() => searchLibrary(items, q), [items, q]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const added: LibraryItem[] = [];
    for (const f of Array.from(e.dataTransfer.files || [])) {
      const kind = kindForFile(f.name);
      if (!kind) continue;
      added.push(mediaItem(newId('m'), f.name.replace(/\.[^.]+$/, ''), kind, URL.createObjectURL(f)));
    }
    if (added.length) { setMedia(m => [...added, ...m]); setTab('media'); }
  }, []);

  const currentText = (slide?.layers.find(l => l.slot === 'slide')?.content as any)?.blocks?.[0]?.text ?? '';

  const openOutput = async (o: AmboOutput) => {
    const list = await detectScreens();
    setScreens(list);
    const ok = routerRef.current?.openWindow(o, list);
    if (!ok) alert('The browser blocked the output window. Allow pop-ups for this site, then try again.');
  };

  const chip = (on: boolean) =>
    `px-2 py-[3px] rounded-full text-[8.5px] font-black uppercase tracking-widest border transition-all ${
      on ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'border-white/12 text-white/40 hover:text-white'
    }`;

  return (
    <div className="flex h-full min-h-0 text-white" onDragOver={e => e.preventDefault()} onDrop={onDrop}>

      {/* ── Playlist + slide grid ──────────────────────────────── */}
      <aside className="w-[300px] shrink-0 border-r border-white/10 bg-black/25 flex flex-col">

        {/* the playlist: one deck per item in the run of show */}
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">Playlist</span>
          <button title="Add presentation"
            onClick={() => { setPlaylist(l => [...l, { id: newId('show'), title: `Item ${l.length + 1}`, kind: 'PRESENTATION', slides: [textSlide('', { label: 'Slide 1' })] }]); setShowIdx(playlist.length); setSelected(0); }}
            className="text-white/45 hover:text-white"><Plus size={13} /></button>
        </div>
        <div className="max-h-[168px] overflow-y-auto custom-scrollbar p-2 space-y-1">
          {playlist.map((sh, i) => (
            <div key={sh.id}
              onClick={() => { setShowIdx(i); setSelected(0); }}
              className={`group px-2.5 py-1.5 rounded-md border cursor-pointer flex items-center gap-2 transition-colors ${
                i === showIdx ? 'border-[#d4af37]/55 bg-[#d4af37]/[0.09]' : 'border-white/10 hover:border-white/25'
              }`}>
              <span className="flex-1 text-[11px] text-white/75 truncate">{sh.title}</span>
              <span className="text-[8px] font-mono text-white/25">{sh.slides.length}</span>
              {playlist.length > 1 && (
                <button onClick={e => { e.stopPropagation(); setPlaylist(l => l.filter((_, x) => x !== i)); setShowIdx(v => Math.max(0, Math.min(v, playlist.length - 2))); }}
                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-[#FF4B50]"><Trash2 size={10} /></button>
              )}
            </div>
          ))}
        </div>

        {/* the slide grid — drag to arrange, exactly the ProPresenter workflow */}
        <div className="px-3 py-2 border-y border-white/10 flex items-center justify-between">
          <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 truncate">
            {show?.title} · slides
          </span>
          <button onClick={addSlide} title="Add slide" className="text-white/45 hover:text-white"><Plus size={13} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          <div className="grid grid-cols-2 gap-2">
            {(show?.slides ?? []).map((sl, i) => {
              const txt = (sl.layers.find(l => l.slot === 'slide')?.content as any)?.blocks?.[0]?.text ?? '';
              const verse = sl.layers.find(l => l.slot === 'scripture');
              return (
                <div key={sl.id}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (dragFrom == null || dragFrom === i) return;
                    setShow(sh => {
                      const next = [...sh.slides];
                      const [moved] = next.splice(dragFrom, 1);
                      next.splice(i, 0, moved);
                      return { ...sh, slides: next };
                    });
                    setSelected(i); setDragFrom(null);
                  }}
                  onClick={() => setSelected(i)}
                  className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-colors ${
                    i === selected ? 'border-[#d4af37]/60 ring-1 ring-[#d4af37]/30' : 'border-white/12 hover:border-white/30'
                  }`}>
                  {/* 16:9 thumb */}
                  <div className="aspect-video bg-black relative flex items-center justify-center px-1.5">
                    <span className="text-[8px] text-white/70 text-center line-clamp-3 leading-tight"
                      style={{ fontFamily: '"Palatino Linotype", Palatino, Georgia, serif' }}>
                      {txt || <span className="text-white/20">Empty</span>}
                    </span>
                    {verse && (
                      <span className="absolute bottom-0 left-0 right-0 py-0.5 text-[6.5px] font-mono uppercase tracking-widest text-center"
                        style={{ background: 'rgba(212,175,55,.22)', color: '#d4af37' }}>verse</span>
                    )}
                    <GripVertical size={9} className="absolute top-1 left-1 text-white/20 opacity-0 group-hover:opacity-100" />
                    <button onClick={e => { e.stopPropagation(); removeSlide(i); }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-white/40 hover:text-[#FF4B50]"><Trash2 size={9} /></button>
                  </div>
                  <div className="px-1.5 py-1 flex items-center gap-1 bg-black/40">
                    <span className="text-[7.5px] font-black uppercase tracking-widest text-white/35 flex-1 truncate">
                      {sl.label || `Slide ${i + 1}`}
                    </span>
                    {sl.layers.map(l => (
                      <span key={l.id} title={LAYER_LABEL[l.slot]} className="w-1 h-1 rounded-full"
                        style={{ background: l.slot === 'background' ? '#A98BFF' : l.slot === 'scripture' ? '#d4af37' : l.slot === 'prop' ? '#2BE0A8' : 'rgba(255,255,255,.5)' }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[8px] text-white/22 mt-2 leading-relaxed">Drag a slide onto another to reorder.</p>
        </div>
      </aside>

      {/* ── Monitors + editor ──────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4">
        <div className="grid grid-cols-2 gap-3 max-w-4xl">
          <StageMonitor stack={preview} label="PREVIEW" />
          <StageMonitor stack={live} label="PROGRAM" live audio />
        </div>

        <div className="flex gap-1.5 mt-3 max-w-4xl">
          <button onClick={take}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest">
            <Play size={11} fill="currentColor" /> Take
          </button>
          <button onClick={() => setLive(clearAll())}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-[#FF4B50]/50 text-[#FF4B50] text-[9px] font-black uppercase tracking-widest">
            <Square size={10} fill="currentColor" /> Clear all
          </button>
        </div>

        {/* Per-layer clear — the thing a slide-only tool cannot do */}
        <div className="mt-3 max-w-4xl">
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Live layers · clear independently</p>
          <div className="flex gap-1.5 flex-wrap">
            {LAYER_ORDER.map(slot => {
              const on = !!live[slot];
              return (
                <button key={slot} disabled={!on}
                  onClick={() => setLive(l => clearLayer(l, slot))}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[8.5px] font-black uppercase tracking-widest transition-colors ${
                    on ? 'border-[#d4af37]/50 text-[#d4af37] hover:bg-[#d4af37]/10' : 'border-white/8 text-white/20'
                  }`}>
                  {on && <Eraser size={9} />} {LAYER_LABEL[slot]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timers — one source, read identically by the stage display and program */}
        <div className="mt-4 max-w-4xl">
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">
            <Clock size={9} className="inline mr-1" /> Timers
          </p>
          <div className="grid grid-cols-3 gap-2">
            {timers.map(t => {
              const v = timerValue(t, Date.now());
              const over = v < 0;
              return (
                <div key={t.id}
                  className="px-2.5 py-2 rounded-lg border"
                  style={{ borderColor: over ? 'rgba(255,75,80,.5)' : t.running ? 'rgba(43,224,168,.4)' : 'rgba(255,255,255,.1)' }}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/35">{t.name}</span>
                    <span className="font-mono text-[13px] tabular-nums"
                      style={{ color: over ? '#FF4B50' : t.running ? '#2BE0A8' : 'rgba(255,255,255,.55)' }}>
                      {formatTimer(v)}
                    </span>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    <button
                      onClick={() => setTimers(ts => ts.map(x => x.id === t.id
                        ? (x.running ? pauseTimer(x, Date.now()) : startTimer(x, Date.now())) : x))}
                      className="flex-1 py-1 rounded text-[7.5px] font-black uppercase tracking-widest border border-white/12 text-white/55 hover:text-white">
                      {t.running ? 'Pause' : 'Start'}
                    </button>
                    <button
                      onClick={() => setTimers(ts => ts.map(x => (x.id === t.id ? resetTimer(x) : x)))}
                      className="flex-1 py-1 rounded text-[7.5px] font-black uppercase tracking-widest border border-white/12 text-white/40 hover:text-white">
                      Reset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Slide text */}
        <div className="mt-4 max-w-4xl">
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Slide text</p>
          <textarea
            value={currentText}
            onChange={e => setText(e.target.value)}
            placeholder="Lyrics, an announcement, a point…"
            className="w-full bg-black/40 border border-white/12 rounded-lg px-3 py-2.5 text-[13px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/50 resize-none min-h-[80px]"
            style={{ fontFamily: '"Palatino Linotype", Palatino, Georgia, serif' }}
          />
        </div>

        {/* Layers on this slide */}
        <div className="mt-4 max-w-4xl">
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">
            <LayersIcon size={9} className="inline mr-1" /> Layers on this slide
          </p>
          <div className="space-y-1">
            {(slide?.layers ?? []).map(l => (
              <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-white/10">
                <span className="text-[8.5px] font-black uppercase tracking-widest text-white/35 w-20">{LAYER_LABEL[l.slot]}</span>
                <span className="flex-1 text-[10.5px] text-white/60 truncate">
                  {l.content.kind}{(l.content as any).mode ? ` · ${(l.content as any).mode}` : ''}
                </span>
                <button onClick={() => removeLayer(l.slot)} className="text-white/30 hover:text-[#FF4B50]"><X size={11} /></button>
              </div>
            ))}
            {!slide?.layers.length && <p className="text-[10px] text-white/25">No layers — add one from the library.</p>}
          </div>
        </div>

        {/* Outputs */}
        <div className="mt-5 max-w-4xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">
              <Monitor size={9} className="inline mr-1" /> Outputs · {outputs.length}
            </span>
            <div className="flex gap-1.5">
              {(['PROGRAM', 'KEY', 'STAGE', 'AUX', 'LOOP'] as OutputKind[]).map(k => (
                <button key={k}
                  onClick={() => setOutputs(o => [...o, makeOutput(k, `${k[0]}${k.slice(1).toLowerCase()} ${o.length + 1}`)])}
                  className="px-2 py-1 rounded-md border border-white/12 text-[8px] font-black uppercase tracking-widest text-white/45 hover:text-white">
                  + {k}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {outputs.map(o => (
              <div key={o.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-white/10">
                <span className="text-[10.5px] text-white/70 flex-1 truncate">{o.name}</span>
                <span className="text-[8px] font-mono uppercase tracking-widest text-white/25">{o.layers.join(' · ')}</span>
                {o.alpha && <span className="px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase tracking-widest border border-[#A98BFF]/40 text-[#A98BFF]">Alpha</span>}
                <button onClick={() => openOutput(o)}
                  className="px-2 py-1 rounded-md bg-[#d4af37]/15 border border-[#d4af37]/40 text-[8px] font-black uppercase tracking-widest text-[#d4af37]">
                  Open
                </button>
                <button onClick={() => { routerRef.current?.remove(o.id); setOutputs(x => x.filter(y => y.id !== o.id)); }}
                  className="text-white/25 hover:text-[#FF4B50]"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
          <p className="text-[8.5px] text-white/25 mt-1.5 leading-relaxed">
            Each output composites for itself — a key carries no background, a stage display no props.
            {screens.length > 0 && ` ${screens.length} screen${screens.length === 1 ? '' : 's'} detected.`}
          </p>
        </div>
      </main>

      {/* ── Library ────────────────────────────────────────────── */}
      <aside className="w-[240px] shrink-0 border-l border-white/10 bg-black/25 flex flex-col">
        <div className="flex border-b border-white/10">
          {([['backgrounds', Sparkles], ['props', Type], ['scripture', BookOpen], ['media', ImageIcon]] as const).map(([id, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 py-2 text-[8.5px] font-black uppercase tracking-[0.14em] border-b-2 flex items-center justify-center gap-1 transition-colors ${
                tab === id ? 'text-[#d4af37] border-[#d4af37]' : 'text-white/35 border-transparent hover:text-white/70'
              }`}>
              <Icon size={10} /> {id === 'backgrounds' ? 'BG' : id === 'scripture' ? 'VERSE' : id}
            </button>
          ))}
        </div>

        <div className="p-2.5 border-b border-white/8">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/50" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5">
          {tab === 'media' && media.length === 0 && (
            <p className="text-[10px] text-white/25 leading-relaxed py-3">
              Drag images, videos or audio anywhere on this page to add them.
            </p>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {shown.map(item => (
              <button key={item.id} onClick={() => addLayerFrom(item)}
                title={`${item.name} → ${LAYER_LABEL[item.slot]}`}
                className="text-left p-2 rounded-lg border border-white/10 hover:border-[#d4af37]/45 hover:bg-[#d4af37]/[0.06] transition-colors">
                <div className="flex items-center gap-1 mb-0.5">
                  {item.content.kind === 'AUDIO' ? <Music size={9} className="text-[#2BE0A8]" />
                    : item.content.kind === 'GENERATOR' ? <Sparkles size={9} className="text-[#A98BFF]" />
                    : <MonitorPlay size={9} className="text-white/40" />}
                  <span className="text-[9.5px] font-bold text-white/80 truncate">{item.name}</span>
                </div>
                <span className="text-[8px] uppercase tracking-widest text-white/25">{item.category}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default AmboStage;

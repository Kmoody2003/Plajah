import React, {
  useState, useRef, useCallback, useEffect,
} from 'react';
import { Stage, Layer, Rect, Image as KImage, Text, Group, Transformer } from 'react-konva';
import Konva from 'konva';
import {
  MessageCircle, Zap, AlignLeft, AlignCenter, Trash2, Plus, Upload,
  Type, RotateCcw, Square, Sun, Moon, Palette, Move, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, X, LayoutGrid, Images, Loader2,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { StudioPage, StudioPanel, SpeechBubble } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../services/firebase';
import { layoutsFor, type ComicLayout, type LayoutPanelSpec } from '../data/comicLayouts';

// Build fresh panels from a preset layout, carrying existing art/bubbles across by index
// so re-templating a page keeps the work already placed.
function panelsFromLayout(specs: LayoutPanelSpec[], prev: StudioPanel[], isBW: boolean): StudioPanel[] {
  return specs.map((s, i) => {
    const carry = prev[i];
    return {
      id: uuidv4(),
      x: s.x, y: s.y, width: s.width, height: s.height,
      shape: s.shape ?? 'rect',
      bgColor: carry?.bgColor ?? (isBW ? '#1a1a1a' : '#111'),
      imageUrl: carry?.imageUrl,
      bubbles: carry?.bubbles ?? [],
      caption: carry?.caption,
      captionPos: carry?.captionPos,
      borderStyle: carry?.borderStyle ?? 'solid',
    };
  });
}

// ─── Bubble type configs ───────────────────────────────────────────────────────

const BUBBLE_STYLES: Record<SpeechBubble['type'], { label: string; color: string; textColor: string; borderRadius: number; fontWeight: string }> = {
  speech:    { label: 'Speech',    color: '#ffffff', textColor: '#000000', borderRadius: 16,  fontWeight: '500'  },
  thought:   { label: 'Thought',   color: '#f0f0ff', textColor: '#333366', borderRadius: 999, fontWeight: '500'  },
  shout:     { label: 'Shout!',    color: '#fff200', textColor: '#000000', borderRadius: 4,   fontWeight: '900'  },
  whisper:   { label: 'Whisper',   color: '#e8e8e8', textColor: '#555555', borderRadius: 12,  fontWeight: '300'  },
  narration: { label: 'Caption',   color: '#000033', textColor: '#ffffff', borderRadius: 0,   fontWeight: '500'  },
  sfx:       { label: 'SFX',       color: 'transparent', textColor: '#ff2200', borderRadius: 0, fontWeight: '900' },
};

// ─── Screen tone patterns (manga) ─────────────────────────────────────────────

const TONES = ['none', 'dots-fine', 'dots-coarse', 'lines-h', 'lines-v', 'crosshatch'];

// ─── Panel image loader hook ──────────────────────────────────────────────────

function useImage(url?: string): [HTMLImageElement | null] {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImg(null); return; }
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
    el.src = url;
  }, [url]);
  return [img];
}

// ─── Single panel on the canvas ───────────────────────────────────────────────

interface PanelNodeProps {
  panel: StudioPanel;
  canvasW: number;
  canvasH: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (p: StudioPanel) => void;
  gutter: number;
  isBW: boolean;
}

function PanelNode({ panel, canvasW, canvasH, selected, onSelect, onChange, gutter, isBW }: PanelNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [img] = useImage(panel.imageUrl);

  const px = (panel.x / 100) * canvasW + gutter / 2;
  const py = (panel.y / 100) * canvasH + gutter / 2;
  const pw = (panel.width / 100) * canvasW - gutter;
  const ph = (panel.height / 100) * canvasH - gutter;

  useEffect(() => {
    if (selected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const borderColor = panel.borderStyle === 'none' ? 'transparent' : isBW ? '#000000' : '#ffffff';
  const strokeWidth = panel.borderStyle === 'thick' ? 4 : panel.borderStyle === 'double' ? 3 : 2;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    onChange({
      ...panel,
      x: Math.max(0, Math.min(100, (node.x() / canvasW) * 100)),
      y: Math.max(0, Math.min(100, (node.y() / canvasH) * 100)),
    });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const newW = Math.max(5, (pw * scaleX / canvasW) * 100);
    const newH = Math.max(5, (ph * scaleY / canvasH) * 100);
    onChange({
      ...panel,
      x: (node.x() / canvasW) * 100,
      y: (node.y() / canvasH) * 100,
      width: newW,
      height: newH,
    });
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={px} y={py}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        clipFunc={ctx => { ctx.rect(0, 0, pw, ph); }}
      >
        {/* Background */}
        <Rect width={pw} height={ph} fill={panel.bgColor ?? '#111'} />

        {/* Panel image */}
        {img && (
          <KImage
            image={img}
            width={pw} height={ph}
            filters={isBW ? [Konva.Filters.Grayscale] : []}
          />
        )}

        {/* Border */}
        <Rect width={pw} height={ph} stroke={borderColor} strokeWidth={strokeWidth} fill="transparent" />

        {/* Speech bubbles */}
        {panel.bubbles.map(b => {
          const style = BUBBLE_STYLES[b.type];
          const bx = (b.x / 100) * pw;
          const by = (b.y / 100) * ph;
          const bw = (b.width / 100) * pw;
          const isNarr = b.type === 'narration';
          const isSfx  = b.type === 'sfx';

          return (
            <Group key={b.id} x={bx} y={by}>
              {!isSfx && (
                <Rect
                  width={bw}
                  height={28}
                  fill={isNarr ? '#00003388' : style.color}
                  cornerRadius={style.borderRadius}
                  stroke={isSfx ? 'transparent' : '#33333360'}
                  strokeWidth={1}
                />
              )}
              <Text
                text={b.text || (b.type === 'sfx' ? 'POW!' : 'Text…')}
                width={bw}
                padding={4}
                fontSize={isSfx ? 22 : b.fontSize ?? 11}
                fontStyle={isSfx ? 'bold' : style.fontWeight}
                fill={style.textColor}
                align="center"
                verticalAlign="middle"
                height={isSfx ? undefined : 28}
                wrap="word"
              />
            </Group>
          );
        })}

        {/* Caption */}
        {panel.caption && (
          <Group x={0} y={panel.captionPos === 'top' ? 0 : ph - 24}>
            <Rect width={pw} height={24} fill="#000000aa" />
            <Text text={panel.caption} width={pw} height={24} fontSize={9} fill="#fff" align="left" padding={4} verticalAlign="middle" />
          </Group>
        )}

        {/* SFX text */}
        {panel.sfxText && (
          <Text
            text={panel.sfxText}
            x={pw * 0.2} y={ph * 0.3}
            fontSize={panel.sfxStyle === 'manga' ? 48 : 36}
            fontStyle="bold"
            fill={isBW ? '#000' : '#ff2200'}
            rotation={-15}
          />
        )}
      </Group>

      {selected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 40 || newBox.height < 40) return oldBox;
            return newBox;
          }}
          enabledAnchors={['top-left','top-right','bottom-left','bottom-right','middle-right','middle-left','top-center','bottom-center']}
          borderStroke="#ff8c00"
          anchorFill="#ff8c00"
          anchorStroke="#ff8c00"
          rotateEnabled={false}
        />
      )}
    </>
  );
}

// ─── Bubble editor sidebar ────────────────────────────────────────────────────

function BubbleSidebar({ panel, onChange }: { panel: StudioPanel; onChange: (p: StudioPanel) => void }) {
  const addBubble = (type: SpeechBubble['type']) => {
    const bubble: SpeechBubble = {
      id: uuidv4(),
      type,
      text: type === 'sfx' ? 'POW!' : 'Text here…',
      x: 5, y: 5, width: 50,
      tailDir: 'br',
    };
    onChange({ ...panel, bubbles: [...panel.bubbles, bubble] });
  };

  const updateBubble = (id: string, updates: Partial<SpeechBubble>) => {
    onChange({ ...panel, bubbles: panel.bubbles.map(b => b.id === id ? { ...b, ...updates } : b) });
  };

  const deleteBubble = (id: string) => {
    onChange({ ...panel, bubbles: panel.bubbles.filter(b => b.id !== id) });
  };

  return (
    <div className="space-y-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Add speech element</p>
      <div className="grid grid-cols-3 gap-1">
        {(Object.keys(BUBBLE_STYLES) as SpeechBubble['type'][]).map(type => (
          <button key={type} onClick={() => addBubble(type)}
            className="py-1.5 text-[10px] rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-center">
            {BUBBLE_STYLES[type].label}
          </button>
        ))}
      </div>

      {panel.bubbles.length > 0 && (
        <div className="space-y-2 mt-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">Bubbles on this panel</p>
          {panel.bubbles.map(b => (
            <div key={b.id} className="bg-white/5 border border-white/10 rounded-xl p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/40 uppercase">{b.type}</span>
                <button onClick={() => deleteBubble(b.id)} className="text-red-400/60 hover:text-red-400"><Trash2 size={10} /></button>
              </div>
              <input
                type="text"
                value={b.text}
                onChange={e => updateBubble(b.id, { text: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                placeholder="Bubble text…"
              />
              <div className="grid grid-cols-3 gap-1">
                {(['x','y','width'] as const).map(key => (
                  <div key={key}>
                    <div className="text-[8px] text-white/25 uppercase">{key}%</div>
                    <input type="number" min={0} max={100} value={b[key]} onChange={e => updateBubble(b.id, { [key]: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white focus:outline-none" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SFX text */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5">Panel SFX text</p>
        <input
          type="text"
          value={panel.sfxText ?? ''}
          onChange={e => onChange({ ...panel, sfxText: e.target.value })}
          placeholder="BOOM! CRASH! (optional)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none mb-1"
        />
        <div className="flex gap-1">
          {(['bold','impact','manga'] as const).map(s => (
            <button key={s} onClick={() => onChange({ ...panel, sfxStyle: s })}
              className={`flex-1 py-0.5 rounded text-[9px] border transition-colors ${panel.sfxStyle === s ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Panel image */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5">Panel image</p>
        <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white text-xs transition-colors">
          <Upload size={11} /> Upload image
          <input type="file" accept="image/*" className="hidden" onChange={async e => {
            const file = e.target.files?.[0];
            if (!file || !auth.currentUser) return;
            const storageRef = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            onChange({ ...panel, imageUrl: url });
          }} />
        </label>
        {panel.imageUrl && (
          <button onClick={() => onChange({ ...panel, imageUrl: undefined })} className="mt-1 text-[10px] text-red-400/60 hover:text-red-400 flex items-center gap-1">
            <Trash2 size={10} /> Remove image
          </button>
        )}
      </div>

      {/* Caption */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1.5">Caption bar</p>
        <input
          type="text"
          value={panel.caption ?? ''}
          onChange={e => onChange({ ...panel, caption: e.target.value })}
          placeholder="Narration / caption text…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none mb-1"
        />
        <div className="flex gap-1">
          {(['top','bottom'] as const).map(pos => (
            <button key={pos} onClick={() => onChange({ ...panel, captionPos: pos })}
              className={`flex-1 py-0.5 rounded text-[9px] border transition-colors capitalize ${panel.captionPos === pos ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
              {pos}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main comic panel builder ─────────────────────────────────────────────────

interface Props {
  page: StudioPage;
  onChange: (p: StudioPage) => void;
  isManga: boolean;
}

const CANVAS_W = 800;
const CANVAS_H = 1100;

export default function ComicPanelBuilder({ page, onChange, isManga }: Props) {
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [isBW, setIsBW] = useState(page.colorMode === 'bw' || isManga);
  const [gutter, setGutter] = useState(page.panelGutter ?? 6);
  const [scale, setScale] = useState(0.65);
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const panels = page.panels ?? [];
  const selectedPanel = panels.find(p => p.id === selectedPanelId) ?? null;

  const updatePanel = (updated: StudioPanel) => {
    onChange({ ...page, panels: panels.map(p => p.id === updated.id ? updated : p) });
  };

  const addPanel = () => {
    const maxX = panels.reduce((m, p) => Math.max(m, p.x + p.width), 0);
    const newPanel: StudioPanel = {
      id: uuidv4(),
      x: maxX > 80 ? 0 : maxX,
      y: maxX > 80 ? panels.reduce((m, p) => Math.max(m, p.y + p.height), 0) : 0,
      width: 50, height: 50,
      bgColor: isBW ? '#1a1a1a' : '#111',
      bubbles: [],
      borderStyle: 'solid',
      shape: 'rect',
    };
    onChange({ ...page, panels: [...panels, newPanel] });
    setSelectedPanelId(newPanel.id);
  };

  const deletePanel = (id: string) => {
    onChange({ ...page, panels: panels.filter(p => p.id !== id) });
    if (selectedPanelId === id) setSelectedPanelId(null);
  };

  const [showLayouts, setShowLayouts] = useState(panels.length === 0);
  const [uploading, setUploading] = useState(false);

  // Apply a preset layout to the page (keeps existing art by index).
  const applyLayout = (layout: ComicLayout) => {
    onChange({ ...page, panels: panelsFromLayout(layout.panels, panels, isBW) });
    setSelectedPanelId(null);
    setShowLayouts(false);
  };

  // Reading order (matches how the page renders / exports).
  const readingOrder = (list: StudioPanel[]) => isManga
    ? [...list].sort((a, b) => a.x !== b.x ? b.x - a.x : a.y - b.y)
    : [...list].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  // Drop N images and auto-format them into panels: upload all, then assign to panels in
  // reading order. If there aren't enough panels, extend with a matching grid first.
  const autoFillImages = async (files: FileList | null) => {
    if (!files?.length || !auth.currentUser) return;
    setUploading(true);
    try {
      const uid = auth.currentUser.uid;
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const storageRef = ref(storage, `books/${uid}/${uuidv4()}_${file.name}`);
        await uploadBytes(storageRef, file);
        urls.push(await getDownloadURL(storageRef));
      }
      // Ensure there are at least as many panels as images.
      let target = panels;
      if (target.length < urls.length) {
        const n = urls.length;
        const cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
        const rowsN = Math.ceil(n / cols);
        const specs: LayoutPanelSpec[] = [];
        for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); specs.push({ x: (100 / cols) * c, y: (100 / rowsN) * r, width: 100 / cols, height: 100 / rowsN }); }
        target = panelsFromLayout(specs, target, isBW);
      }
      const ordered = readingOrder(target);
      const byId: Record<string, string> = {};
      ordered.forEach((p, i) => { if (urls[i]) byId[p.id] = urls[i]; });
      onChange({ ...page, panels: target.map(p => byId[p.id] ? { ...p, imageUrl: byId[p.id] } : p) });
    } finally {
      setUploading(false);
    }
  };

  const deselect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === stageRef.current) setSelectedPanelId(null);
  };

  // Render panels in RTL order for manga
  const orderedPanels = isManga
    ? [...panels].sort((a, b) => a.x !== b.x ? b.x - a.x : a.y - b.y)
    : [...panels].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  return (
    <div className="flex h-full" style={{ backgroundColor: page.bgColor ?? '#0a0a0a' }}>
      {/* Canvas area */}
      <div className="flex-1 flex flex-col">
        {/* Canvas toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/30 shrink-0">
          <button onClick={() => setShowLayouts(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showLayouts ? 'bg-orange-500 text-black' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'}`}>
            <LayoutGrid size={12} /> Layouts
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold cursor-pointer transition-colors">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Images size={12} />} Auto-fill images
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => autoFillImages(e.target.files)} />
          </label>
          <button onClick={addPanel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-colors">
            <Plus size={12} /> Panel
          </button>
          <button onClick={() => { if (selectedPanelId) deletePanel(selectedPanelId); }}
            disabled={!selectedPanelId}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs disabled:opacity-30 hover:bg-red-500/20 transition-colors">
            <Trash2 size={12} /> Delete
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* B&W toggle */}
          <button onClick={() => { setIsBW(v => !v); onChange({ ...page, colorMode: isBW ? 'color' : 'bw' }); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${isBW ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
            {isBW ? <Moon size={12} /> : <Sun size={12} />}
            {isBW ? 'B&W' : 'Color'}
          </button>

          {/* Gutter */}
          <label className="flex items-center gap-2 text-xs text-white/40">
            Gutter
            <input type="range" min={0} max={20} value={gutter}
              onChange={e => { const v = Number(e.target.value); setGutter(v); onChange({ ...page, panelGutter: v }); }}
              className="w-20 accent-orange-500" />
            <span className="text-white/30 w-4">{gutter}</span>
          </label>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"><ZoomOut size={13} /></button>
            <span className="text-xs text-white/30 w-10 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(1.5, s + 0.1))} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"><ZoomIn size={13} /></button>
          </div>
        </div>

        {/* Layout template strip */}
        {showLayouts && (
          <div className="shrink-0 border-b border-white/5 bg-black/40 px-4 py-3 overflow-x-auto">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">{isManga ? 'Manga & comic layouts' : 'Comic & manga layouts'} — pick a page template</p>
            <div className="flex gap-2">
              {layoutsFor(isManga).map(layout => (
                <button key={layout.id} onClick={() => applyLayout(layout)} title={layout.name}
                  className="shrink-0 group flex flex-col items-center gap-1">
                  <div className="relative w-14 h-[76px] rounded-md bg-white/[0.06] border border-white/10 group-hover:border-orange-500/60 overflow-hidden transition-colors">
                    {layout.panels.map((p, i) => (
                      <div key={i} className="absolute bg-white/20 group-hover:bg-orange-400/40 border border-black/40 transition-colors"
                        style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%` }} />
                    ))}
                  </div>
                  <span className="text-[8px] font-bold text-white/35 group-hover:text-white/70 max-w-[56px] truncate">{layout.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Konva canvas */}
        <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center p-6"
          style={{ backgroundColor: isBW ? '#555' : '#333' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            <Stage
              ref={stageRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ background: page.bgColor ?? '#0a0a0a', borderRadius: 4, boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}
              onMouseDown={deselect}
              onTouchStart={deselect as any}
            >
              <Layer>
                {/* Page background */}
                <Rect width={CANVAS_W} height={CANVAS_H} fill={page.bgColor ?? '#0a0a0a'} />

                {/* Panels */}
                {orderedPanels.map(panel => (
                  <PanelNode
                    key={panel.id}
                    panel={panel}
                    canvasW={CANVAS_W}
                    canvasH={CANVAS_H}
                    selected={panel.id === selectedPanelId}
                    onSelect={() => setSelectedPanelId(panel.id)}
                    onChange={updatePanel}
                    gutter={gutter}
                    isBW={isBW}
                  />
                ))}

                {/* Reading direction indicator for manga */}
                {isManga && (
                  <Text
                    text="← 読む方向"
                    x={CANVAS_W - 90} y={10}
                    fontSize={11} fill="#ffffff40"
                  />
                )}
              </Layer>
            </Stage>
          </div>
        </div>

        {/* Panel position controls (keyboard-accessible) */}
        {selectedPanel && (
          <div className="shrink-0 border-t border-white/5 bg-black/20 px-4 py-2 flex items-center gap-4 text-xs text-white/40">
            <span className="text-white/20">Position</span>
            {(['x','y','width','height'] as const).map(key => (
              <label key={key} className="flex items-center gap-1.5">
                <span className="uppercase text-[9px] text-white/25">{key}</span>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={Math.round(selectedPanel[key] * 10) / 10}
                  onChange={e => updatePanel({ ...selectedPanel, [key]: Number(e.target.value) })}
                  className="w-14 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white focus:outline-none text-xs"
                />
                <span className="text-white/20">%</span>
              </label>
            ))}
            <label className="flex items-center gap-1.5 ml-4">
              <span className="text-[9px] text-white/25">BORDER</span>
              <select
                value={selectedPanel.borderStyle ?? 'solid'}
                onChange={e => updatePanel({ ...selectedPanel, borderStyle: e.target.value as any })}
                className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"
              >
                {['solid','thick','double','none'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[9px] text-white/25">BG</span>
              <input type="color" value={selectedPanel.bgColor ?? '#111'}
                onChange={e => updatePanel({ ...selectedPanel, bgColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-white/10 bg-transparent" />
            </label>
          </div>
        )}
      </div>

      {/* Right sidebar: bubble editor */}
      <div className="w-[220px] shrink-0 border-l border-white/5 bg-[#0d0d0d] overflow-y-auto p-3">
        {selectedPanel ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-white/60">Panel editor</div>
              <button onClick={() => setSelectedPanelId(null)} className="text-white/20 hover:text-white">
                <X size={12} />
              </button>
            </div>
            <BubbleSidebar panel={selectedPanel} onChange={updatePanel} />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-white/20">
            <Square size={24} className="opacity-30" />
            <p className="text-xs">Click a panel on the canvas to edit it</p>
            <p className="text-[10px] text-white/10">Add speech bubbles, images, captions, and SFX text</p>
          </div>
        )}
      </div>
    </div>
  );
}

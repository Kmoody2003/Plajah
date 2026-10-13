import React, {
  useState, useRef, useCallback, useEffect,
} from 'react';
import { Stage, Layer, Rect, Image as KImage, Text, Group, Transformer, Path } from 'react-konva';
import Konva from 'konva';
import {
  MessageCircle, Zap, AlignLeft, AlignCenter, Trash2, Plus, Upload,
  Type, RotateCcw, Square, Sun, Moon, Palette, Move, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, X, LayoutGrid, Images, Loader2, Brush, BookOpen, Sparkles, Sliders,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { StudioPage, StudioPanel, SpeechBubble } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../services/firebase';
import { layoutsFor, type ComicLayout, type LayoutPanelSpec } from '../data/comicLayouts';
import { parseScript, applyScriptToPage, charactersInScript, type ScriptCharacter } from '../services/comicScript';
import { takeComicHandoff } from '../services/comicHandoff';
import ComicDrawCanvas from './ComicDrawCanvas';

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
  selectedBubbleId: string | null;
  onSelect: () => void;
  onSelectBubble: (id: string | null) => void;
  onUpdateBubble: (id: string, updates: Partial<SpeechBubble>) => void;
  onChange: (p: StudioPanel) => void;
  gutter: number;
  isBW: boolean;
}

function PanelNode({
  panel,
  canvasW,
  canvasH,
  selected,
  selectedBubbleId,
  onSelect,
  onSelectBubble,
  onUpdateBubble,
  onChange,
  gutter,
  isBW,
}: PanelNodeProps) {
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
    // Only drag the panel if the panel group itself was the drag target
    if (e.target !== groupRef.current) return;
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

        {/* Speech bubbles with interactive dragging & vector tails */}
        {panel.bubbles.map(b => {
          const style = BUBBLE_STYLES[b.type] || BUBBLE_STYLES.speech;
          const bx = (b.x / 100) * pw;
          const by = (b.y / 100) * ph;
          const bw = (b.width / 100) * pw;
          const isNarr = b.type === 'narration';
          const isSfx  = b.type === 'sfx';
          const isSelected = selectedBubbleId === b.id;

          // Multi-line height wrapping estimation
          const textLen = (b.text || '').length;
          const charsPerLine = Math.max(10, Math.floor(bw / 7.5));
          const lineCount = Math.max(1, Math.ceil(textLen / charsPerLine));
          const bubbleH = isSfx ? 36 : Math.max(28, lineCount * 16 + 10);

          // Vector speech bubble tail path
          let tailPath = '';
          if (b.tailDir === 'br') {
            tailPath = `M ${Math.max(10, bw - 26)} ${bubbleH - 1} L ${Math.max(10, bw - 8)} ${bubbleH + 14} L ${Math.max(10, bw - 12)} ${bubbleH - 1} Z`;
          } else if (b.tailDir === 'bl') {
            tailPath = `M 12 ${bubbleH - 1} L 8 ${bubbleH + 14} L 26 ${bubbleH - 1} Z`;
          } else if (b.tailDir === 'tr') {
            tailPath = `M ${Math.max(10, bw - 26)} 1 L ${Math.max(10, bw - 8)} -14 L ${Math.max(10, bw - 12)} 1 Z`;
          } else if (b.tailDir === 'tl') {
            tailPath = `M 12 1 L 8 -14 L 26 1 Z`;
          }

          return (
            <Group
              key={b.id}
              x={bx}
              y={by}
              draggable
              onClick={e => {
                e.cancelBubble = true;
                onSelect();
                onSelectBubble(b.id);
              }}
              onTap={e => {
                e.cancelBubble = true;
                onSelect();
                onSelectBubble(b.id);
              }}
              onDragStart={e => {
                e.cancelBubble = true;
              }}
              onDragEnd={e => {
                e.cancelBubble = true;
                const newX = Math.max(0, Math.min(100 - (bw / pw) * 100, (e.target.x() / pw) * 100));
                const newY = Math.max(0, Math.min(100 - (bubbleH / ph) * 100, (e.target.y() / ph) * 100));
                onUpdateBubble(b.id, { x: Math.round(newX), y: Math.round(newY) });
              }}
            >
              {/* Speaker Character badge */}
              {b.character && !isSfx && !isNarr && (
                <Text
                  text={b.character.toUpperCase()}
                  y={-12}
                  fontSize={8.5}
                  fontStyle="bold"
                  fill={isBW ? '#ffffff' : '#ff8c00'}
                  shadowColor="#000000"
                  shadowBlur={4}
                  shadowOpacity={0.8}
                />
              )}

              {/* Bubble body */}
              {!isSfx && (
                <Rect
                  width={bw}
                  height={bubbleH}
                  fill={isNarr ? '#000033ee' : style.color}
                  cornerRadius={style.borderRadius}
                  stroke={isSelected ? '#ff8c00' : isNarr ? '#3b82f6' : '#33333360'}
                  strokeWidth={isSelected ? 2 : 1}
                  shadowColor={isSelected ? '#ff8c00' : '#000000'}
                  shadowBlur={isSelected ? 8 : 4}
                  shadowOpacity={0.4}
                />
              )}

              {/* Vector tail */}
              {tailPath && !isSfx && !isNarr && (
                <Path
                  data={tailPath}
                  fill={style.color}
                  stroke={isSelected ? '#ff8c00' : '#33333360'}
                  strokeWidth={1}
                />
              )}

              {/* Dialogue text */}
              <Text
                text={b.text || (b.type === 'sfx' ? 'POW!' : 'Text…')}
                width={bw}
                padding={6}
                fontSize={isSfx ? 22 : b.fontSize ?? 11}
                fontStyle={isSfx ? 'bold' : style.fontWeight}
                fill={style.textColor}
                align="center"
                verticalAlign="middle"
                height={bubbleH}
                wrap="word"
              />
            </Group>
          );
        })}

        {/* Narrative Caption */}
        {panel.caption && (
          <Group
            x={0}
            y={panel.captionPos === 'top' ? 0 : ph - 28}
            onClick={e => {
              e.cancelBubble = true;
              onSelect();
              // Click caption to toggle top / bottom position
              onChange({ ...panel, captionPos: panel.captionPos === 'top' ? 'bottom' : 'top' });
            }}
          >
            <Rect width={pw} height={28} fill="#000000ee" stroke="#ffffff25" strokeWidth={1} />
            <Text
              text={panel.caption}
              width={pw}
              height={28}
              fontSize={9.5}
              fill="#f59e0b"
              fontFamily="Courier New, monospace"
              fontStyle="bold"
              align="left"
              padding={6}
              verticalAlign="middle"
            />
          </Group>
        )}

        {/* Kinetic SFX text */}
        {panel.sfxText && (
          <Text
            text={panel.sfxText}
            x={pw * 0.25}
            y={ph * 0.35}
            fontSize={panel.sfxStyle === 'manga' ? 44 : 34}
            fontStyle="bold"
            fill={isBW ? '#ffffff' : '#ff2200'}
            stroke="#000000"
            strokeWidth={4}
            rotation={-12}
            draggable
            onClick={e => {
              e.cancelBubble = true;
              onSelect();
            }}
            onDragStart={e => {
              e.cancelBubble = true;
            }}
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

function BubbleSidebar({
  panel,
  selectedBubbleId,
  onSelectBubble,
  onChange,
  onDraw,
}: {
  panel: StudioPanel;
  selectedBubbleId: string | null;
  onSelectBubble: (id: string | null) => void;
  onChange: (p: StudioPanel) => void;
  onDraw: () => void;
}) {
  const selectedBubble = panel.bubbles.find(b => b.id === selectedBubbleId) || null;

  const addBubble = (type: SpeechBubble['type']) => {
    const bubble: SpeechBubble = {
      id: uuidv4(),
      type,
      text: type === 'sfx' ? 'POW!' : 'Dialogue text…',
      x: 15, y: 15, width: 60,
      tailDir: 'br',
      fontSize: 11,
    };
    onChange({ ...panel, bubbles: [...panel.bubbles, bubble] });
    onSelectBubble(bubble.id);
  };

  const updateBubble = (id: string, updates: Partial<SpeechBubble>) => {
    onChange({ ...panel, bubbles: panel.bubbles.map(b => b.id === id ? { ...b, ...updates } : b) });
  };

  const deleteBubble = (id: string) => {
    onChange({ ...panel, bubbles: panel.bubbles.filter(b => b.id !== id) });
    if (selectedBubbleId === id) onSelectBubble(null);
  };

  return (
    <div className="space-y-4">
      {/* If a bubble is selected, show focused editor */}
      {selectedBubble ? (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">
              Selected {selectedBubble.type}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteBubble(selectedBubble.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete bubble"
              >
                <Trash2 size={12} />
              </button>
              <button
                onClick={() => onSelectBubble(null)}
                className="text-white/40 hover:text-white p-1"
                title="Deselect"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Speaker character tag */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Speaker Character</label>
            <input
              type="text"
              value={selectedBubble.character ?? ''}
              onChange={e => updateBubble(selectedBubble.id, { character: e.target.value })}
              placeholder="e.g. Silas Vane, Echo-9"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-orange-400/50"
            />
          </div>

          {/* Dialogue text */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Dialogue Text</label>
            <textarea
              rows={3}
              value={selectedBubble.text}
              onChange={e => updateBubble(selectedBubble.id, { text: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-400/50 resize-none font-sans"
              placeholder="Enter speech or thought..."
            />
          </div>

          {/* Bubble style pills */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Bubble Style</label>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(BUBBLE_STYLES) as SpeechBubble['type'][]).map(type => (
                <button
                  key={type}
                  onClick={() => updateBubble(selectedBubble.id, { type })}
                  className={`py-1 text-[9px] rounded-lg border transition-colors ${
                    selectedBubble.type === type
                      ? 'bg-orange-500 border-orange-400 text-black font-bold'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {BUBBLE_STYLES[type].label}
                </button>
              ))}
            </div>
          </div>

          {/* Tail direction */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Tail Direction</label>
            <div className="grid grid-cols-4 gap-1">
              {(['tl', 'tr', 'bl', 'br'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => updateBubble(selectedBubble.id, { tailDir: dir })}
                  className={`py-1 text-[9px] uppercase font-bold rounded border transition-colors ${
                    selectedBubble.tailDir === dir
                      ? 'bg-orange-500/20 border-orange-400 text-orange-400'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>

          {/* Width & Font Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Width %</label>
              <input
                type="number"
                min={20}
                max={95}
                value={selectedBubble.width}
                onChange={e => updateBubble(selectedBubble.id, { width: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Font Size</label>
              <input
                type="number"
                min={8}
                max={32}
                value={selectedBubble.fontSize ?? 11}
                onChange={e => updateBubble(selectedBubble.id, { fontSize: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Add new bubble elements */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-2">Add speech element</p>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(BUBBLE_STYLES) as SpeechBubble['type'][]).map(type => (
            <button
              key={type}
              onClick={() => addBubble(type)}
              className="py-1.5 text-[10px] rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors text-center"
            >
              + {BUBBLE_STYLES[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* All bubbles on panel */}
      {panel.bubbles.length > 0 && !selectedBubble && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Bubbles on this panel</p>
          {panel.bubbles.map(b => (
            <div
              key={b.id}
              onClick={() => onSelectBubble(b.id)}
              className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:border-orange-500/50 cursor-pointer transition-colors"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-black uppercase text-orange-400">{b.character || b.type}</span>
                </div>
                <p className="text-[11px] text-white/70 truncate">{b.text || 'Empty'}</p>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation();
                  deleteBubble(b.id);
                }}
                className="text-white/20 hover:text-red-400 p-1"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Caption bar */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Narrative Caption</p>
        <textarea
          rows={2}
          value={panel.caption ?? ''}
          onChange={e => onChange({ ...panel, caption: e.target.value })}
          placeholder="Monologue / Time-Location caption…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none mb-1.5 resize-none font-mono"
        />
        <div className="flex gap-1">
          {(['top', 'bottom'] as const).map(pos => (
            <button
              key={pos}
              onClick={() => onChange({ ...panel, captionPos: pos })}
              className={`flex-1 py-1 rounded text-[9px] border transition-colors capitalize ${
                panel.captionPos === pos ? 'bg-orange-500/20 border-orange-500 text-orange-400 font-bold' : 'border-white/10 text-white/40 hover:text-white'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* SFX text */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Panel SFX Text</p>
        <input
          type="text"
          value={panel.sfxText ?? ''}
          onChange={e => onChange({ ...panel, sfxText: e.target.value })}
          placeholder="BOOM! SHHH! (optional)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none mb-1.5 font-bold"
        />
        <div className="flex gap-1">
          {(['bold', 'impact', 'manga'] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...panel, sfxStyle: s })}
              className={`flex-1 py-0.5 rounded text-[9px] border transition-colors ${
                panel.sfxStyle === s ? 'bg-orange-500/20 border-orange-500 text-orange-400 font-bold' : 'border-white/10 text-white/30 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Panel image */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Panel Artwork</p>
        {panel.imageUrl && (
          <div className="mb-2 rounded-lg overflow-hidden border border-white/10 aspect-video bg-black relative">
            <img src={panel.imageUrl} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onChange({ ...panel, imageUrl: undefined })}
              className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 p-1 rounded text-white"
              title="Remove art"
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center justify-center gap-1.5 cursor-pointer px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs transition-colors">
            <Upload size={11} /> Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file || !auth.currentUser) return;
                const storageRef = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                onChange({ ...panel, imageUrl: url });
              }}
            />
          </label>
          <button
            onClick={onDraw}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 text-xs transition-colors"
          >
            <Brush size={11} /> Draw
          </button>
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
  currentPageIndex?: number;
  totalPages?: number;
  onNavigatePage?: (delta: number) => void;
  onOpenInLorea?: () => void;
}

const CANVAS_W = 800;
const CANVAS_H = 1100;

export default function ComicPanelBuilder({
  page,
  onChange,
  isManga,
  currentPageIndex,
  totalPages,
  onNavigatePage,
  onOpenInLorea,
}: Props) {
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
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

  const updateBubbleOnActivePanel = (bubbleId: string, updates: Partial<SpeechBubble>) => {
    if (!selectedPanel) return;
    const updatedBubbles = selectedPanel.bubbles.map(b => b.id === bubbleId ? { ...b, ...updates } : b);
    updatePanel({ ...selectedPanel, bubbles: updatedBubbles });
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

  // Script → panels (character-tagged; may arrive from Fabula/Lorea via a handoff).
  const [showScript, setShowScript] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [handoffChars, setHandoffChars] = useState<ScriptCharacter[]>([]);
  const [handoffSource, setHandoffSource] = useState<string | null>(null);
  useEffect(() => {
    const h = takeComicHandoff();
    if (h) {
      if (h.script) setScriptText(h.script);
      if (h.characters?.length) setHandoffChars(h.characters);
      setHandoffSource(h.source);
      setShowScript(true);
    }
  }, []);
  const scriptBeats = scriptText.trim() ? parseScript(scriptText) : [];
  const scriptCast = charactersInScript(scriptBeats);

  const applyScript = () => {
    if (!scriptBeats.length) return;
    onChange(applyScriptToPage(page, scriptBeats, { isManga, characters: handoffChars }));
    setShowScript(false);
    setSelectedPanelId(null);
  };

  // Draw the selected panel's art on the paint canvas → upload → set as its image.
  const [drawingPanelId, setDrawingPanelId] = useState<string | null>(null);
  const drawingPanel = panels.find(p => p.id === drawingPanelId) || null;
  const saveDrawing = async (blob: Blob) => {
    if (!drawingPanel || !auth.currentUser) return;
    const storageRef = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_panel.png`);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    updatePanel({ ...drawingPanel, imageUrl: url });
    setDrawingPanelId(null);
  };

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

  const deselect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === stageRef.current) {
      setSelectedPanelId(null);
      setSelectedBubbleId(null);
    }
  };

  // Render panels in RTL order for manga
  const orderedPanels = isManga
    ? [...panels].sort((a, b) => a.x !== b.x ? b.x - a.x : a.y - b.y)
    : [...panels].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  return (
    <div className="flex h-full" style={{ backgroundColor: page.bgColor ?? '#0a0a0a' }}>
      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canvas toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/40 shrink-0 overflow-x-auto no-scrollbar">
          {/* Quick Page Navigation */}
          {totalPages !== undefined && currentPageIndex !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs shrink-0">
              <button
                onClick={() => onNavigatePage && onNavigatePage(-1)}
                disabled={currentPageIndex <= 0}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-20 text-white/60 hover:text-white transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-bold text-white/80 px-1 whitespace-nowrap">
                Page {currentPageIndex + 1} of {totalPages}
              </span>
              <button
                onClick={() => onNavigatePage && onNavigatePage(1)}
                disabled={currentPageIndex >= totalPages - 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-20 text-white/60 hover:text-white transition-colors"
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <button onClick={() => setShowLayouts(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showLayouts ? 'bg-orange-500 text-black' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'}`}>
            <LayoutGrid size={12} /> Layouts
          </button>
          <button onClick={() => setShowScript(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-colors">
            <Type size={12} /> Script
          </button>
          <button onClick={addPanel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-colors">
            <Plus size={12} /> Panel
          </button>
          <button onClick={() => { if (selectedPanelId) deletePanel(selectedPanelId); }}
            disabled={!selectedPanelId}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs disabled:opacity-30 hover:bg-red-500/20 transition-colors">
            <Trash2 size={12} /> Delete
          </button>

          <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />

          {/* B&W toggle */}
          <button onClick={() => { setIsBW(v => !v); onChange({ ...page, colorMode: isBW ? 'color' : 'bw' }); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${isBW ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
            {isBW ? <Moon size={12} /> : <Sun size={12} />}
            {isBW ? 'B&W' : 'Color'}
          </button>

          {/* Gutter */}
          <label className="flex items-center gap-2 text-xs text-white/40 shrink-0">
            Gutter
            <input type="range" min={0} max={20} value={gutter}
              onChange={e => { const v = Number(e.target.value); setGutter(v); onChange({ ...page, panelGutter: v }); }}
              className="w-16 accent-orange-500" />
            <span className="text-white/30 w-4">{gutter}</span>
          </label>

          {/* Lorea Reader Link */}
          {onOpenInLorea && (
            <button
              onClick={onOpenInLorea}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 text-xs font-bold transition-all shadow-sm shrink-0 ml-1"
              title="Preview in Lorea Reader"
            >
              <BookOpen size={12} /> Read in Lorea
            </button>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0">
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
          style={{ backgroundColor: isBW ? '#222' : '#181818' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            <Stage
              ref={stageRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ background: page.bgColor ?? '#0a0a0a', borderRadius: 6, boxShadow: '0 0 50px rgba(0,0,0,0.8)' }}
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
                    selectedBubbleId={selectedBubbleId}
                    onSelect={() => {
                      setSelectedPanelId(panel.id);
                    }}
                    onSelectBubble={(bubbleId) => {
                      setSelectedPanelId(panel.id);
                      setSelectedBubbleId(bubbleId);
                    }}
                    onUpdateBubble={updateBubbleOnActivePanel}
                    onChange={updatePanel}
                    gutter={gutter}
                    isBW={isBW}
                  />
                ))}

                {/* Reading direction indicator for manga */}
                {isManga && (
                  <Text
                    text="← 読む方向 (RTL Manga Flow)"
                    x={CANVAS_W - 160} y={12}
                    fontSize={11} fill="#ffffff50" fontStyle="bold"
                  />
                )}
              </Layer>
            </Stage>
          </div>
        </div>

        {/* Panel position controls (keyboard-accessible) */}
        {selectedPanel && (
          <div className="shrink-0 border-t border-white/5 bg-black/30 px-4 py-2 flex items-center gap-4 text-xs text-white/40 overflow-x-auto no-scrollbar">
            <span className="text-white/30 font-bold uppercase text-[9px]">Panel Geometry</span>
            {(['x','y','width','height'] as const).map(key => (
              <label key={key} className="flex items-center gap-1.5 shrink-0">
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
            <label className="flex items-center gap-1.5 ml-2 shrink-0">
              <span className="text-[9px] text-white/25">BORDER</span>
              <select
                value={selectedPanel.borderStyle ?? 'solid'}
                onChange={e => updatePanel({ ...selectedPanel, borderStyle: e.target.value as any })}
                className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"
              >
                {['solid','thick','double','none'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] text-white/25">BG</span>
              <input type="color" value={selectedPanel.bgColor ?? '#111'}
                onChange={e => updatePanel({ ...selectedPanel, bgColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-white/10 bg-transparent" />
            </label>
          </div>
        )}
      </div>

      {/* Right sidebar: bubble editor */}
      <div className="w-[240px] shrink-0 border-l border-white/5 bg-[#0d0d0f] overflow-y-auto p-3">
        {selectedPanel ? (
          <>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
              <div className="text-xs font-black uppercase tracking-wider text-white/70">Panel Layer Editor</div>
              <button onClick={() => { setSelectedPanelId(null); setSelectedBubbleId(null); }} className="text-white/20 hover:text-white">
                <X size={12} />
              </button>
            </div>
            <BubbleSidebar
              panel={selectedPanel}
              selectedBubbleId={selectedBubbleId}
              onSelectBubble={setSelectedBubbleId}
              onChange={updatePanel}
              onDraw={() => setDrawingPanelId(selectedPanel.id)}
            />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-white/20 p-4">
            <Square size={24} className="opacity-30" />
            <p className="text-xs font-bold text-white/40">Select a Panel</p>
            <p className="text-[10px] text-white/30 leading-relaxed">
              Click any panel on the canvas to drag speech bubbles with directional tails, edit character dialogue, adjust captions, and replace artwork.
            </p>
          </div>
        )}
      </div>

      {/* Script → panels */}
      {showScript && (
        <div className="fixed inset-0 z-[400] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowScript(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-3xl bg-[#0b0b0d] border border-white/10">
            <div className="sticky top-0 flex items-center gap-2 px-5 py-4 border-b border-white/8 bg-[#0b0b0d]">
              <Type size={16} className="text-orange-400" />
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Script → panels</p>
              {handoffSource && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">From {handoffSource}</span>}
              <button onClick={() => setShowScript(false)} className="ml-auto text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[11px] text-white/40 leading-relaxed">Paste a script — use <span className="text-white/70 font-bold">NAME: dialogue</span> for tagged speech, <span className="text-white/70 font-bold">CAPTION:</span> / <span className="text-white/70 font-bold">SFX:</span> lines, and <span className="text-white/70 font-bold">PANEL</span> to start a new panel. It auto-flows into this page's panels in reading order.</p>
              <textarea value={scriptText} onChange={e => setScriptText(e.target.value)} rows={10}
                placeholder={'PANEL 1\nNARRATOR: The city never slept.\nALICE: We need to move — now.\nSFX: BOOM\n\nPANEL 2\nBORIS: Too late for that.'}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500/50 resize-none font-mono" />
              <div className="flex items-center justify-between text-[10px] text-white/40">
                <span>{scriptBeats.length} beats · {panels.length} panels on page</span>
                {scriptCast.length > 0 && <span className="truncate max-w-[60%]">Cast: <span className="text-orange-400/80">{scriptCast.join(', ')}</span></span>}
              </div>
              {handoffChars.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {handoffChars.map(c => (
                    <span key={c.name} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-bold text-white/60">
                      {c.imageUrl && <img src={c.imageUrl} className="w-4 h-4 rounded-full object-cover" alt="" />}{c.name}
                    </span>
                  ))}
                  <span className="text-[9px] text-white/25 self-center">— world cast; images auto-fill empty panels</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={applyScript} disabled={!scriptBeats.length || !panels.length} className="flex-1 py-3 rounded-full bg-orange-500 text-black font-black text-xs uppercase tracking-widest hover:bg-orange-400 disabled:opacity-40">Flow into panels</button>
                <button onClick={() => setShowScript(false)} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/70 font-black text-xs uppercase tracking-widest">Cancel</button>
              </div>
              {!panels.length && <p className="text-[10px] text-orange-400/70">Pick a layout first so there are panels to flow into.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Drawing canvas */}
      {drawingPanel && (
        <ComicDrawCanvas
          width={Math.max(600, Math.round((drawingPanel.width / 100) * CANVAS_W * 2))}
          height={Math.max(600, Math.round((drawingPanel.height / 100) * CANVAS_H * 2))}
          initialImageUrl={drawingPanel.imageUrl}
          onSave={saveDrawing}
          onClose={() => setDrawingPanelId(null)}
        />
      )}
    </div>
  );
}

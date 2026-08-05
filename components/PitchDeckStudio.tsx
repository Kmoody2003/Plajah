/**
 * PitchDeckStudio
 *
 * A mini-PowerPoint authoring experience built for:
 *  - Sanctuary fundraising pages
 *  - Charity pages
 *  - Business / brand pages
 *  - Club pages
 *
 * Architecture:
 *  - Left: mini slide timeline (drag to reorder)
 *  - Center: WYSIWYG canvas — free-position elements via drag handles
 *  - Right: properties panel (element styling, slide settings)
 *  - Bottom: narration/audio timeline strip
 *
 * Themes: music · film · business · fashion (each provides starter slides)
 * Export paths: share link · iframe embed · vertical-video reflow
 */

import React, {
  useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense,
} from 'react';
import { motion, AnimatePresence, useDragControls, Reorder } from 'motion/react';
import {
  ArrowLeft, Plus, Trash2, ChevronLeft, ChevronRight, Type, Image,
  Film, Square, Circle, Link2, Mic, Music2, Upload, Download,
  Eye, Share2, Settings2, X, Check, Palette, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, ZoomIn, ZoomOut, RotateCcw,
  Copy, Layers, Sparkles, Play, Pause, Volume2, VolumeX,
  Save, Globe, Smartphone, Monitor, Mail, ChevronDown, GripVertical, Hash,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  PitchDeck, PitchSlide, PitchElement, PitchElementType,
  PitchDeckTheme, PitchTransition,
} from '../types';
import { auth, storage, db } from '../services/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// ─── Theme presets ─────────────────────────────────────────────────────────────

const THEME_META: Record<PitchDeckTheme, { label: string; icon: string; palette: string[] }> = {
  music:    { label: 'Music',    icon: '🎵', palette: ['#0a0a0a','#ff8c00','#ffffff','#1a1a2e'] },
  film:     { label: 'Film',     icon: '🎬', palette: ['#0d0d0d','#1a1a1a','#c9a96e','#ffffff'] },
  business: { label: 'Business', icon: '💼', palette: ['#0f1923','#1e3a5f','#ffffff','#4a90d9'] },
  fashion:  { label: 'Fashion',  icon: '👗', palette: ['#f5f0e8','#1a1a1a','#c9b99a','#000000'] },
};

const makeElement = (type: PitchElementType, overrides: Partial<PitchElement> = {}): PitchElement => ({
  id: uuidv4(),
  type,
  x: 20, y: 20, width: 60, height: 20,
  zIndex: 1,
  opacity: 1,
  ...overrides,
});

function makeSlide(order: number, overrides: Partial<PitchSlide> = {}): PitchSlide {
  return {
    id: uuidv4(),
    order,
    bgType: 'color',
    bgValue: '#0a0a0a',
    elements: [],
    transition: 'fade',
    duration: 0,
    layout: 'hero',
    ...overrides,
  };
}

// Theme starter templates — 4 slides each
const THEME_TEMPLATES: Record<PitchDeckTheme, PitchSlide[]> = {
  music: [
    makeSlide(0, {
      bgType: 'gradient',
      bgValue: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      layout: 'hero',
      elements: [
        makeElement('text', { x:10, y:28, width:80, height:18, content:'YOUR ARTIST NAME', fontSize:52, fontWeight:'900', color:'#ff8c00', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:4, animation:'fade-in' }),
        makeElement('text', { x:15, y:52, width:70, height:10, content:'New EP · Available Now', fontSize:20, fontWeight:'400', color:'rgba(255,255,255,0.6)', textAlign:'center', fontFamily:'"Noto Serif",serif', animation:'slide-up', animationDelay:300 }),
        makeElement('button', { x:30, y:72, width:40, height:10, label:'Listen Now', href:'#', btnColor:'#ff8c00', btnTextColor:'#000', btnBorderRadius:999, animation:'pop', animationDelay:600 }),
      ],
    }),
    makeSlide(1, {
      bgType: 'color',
      bgValue: '#111',
      layout: 'split',
      elements: [
        makeElement('text', { x:5, y:10, width:50, height:12, content:'THE SOUND', fontSize:36, fontWeight:'900', color:'#fff', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:5, y:28, width:48, height:50, content:'Describe your music, your influences, what drives you to create. This is where your story begins.', fontSize:16, fontWeight:'400', color:'rgba(255,255,255,0.6)', textAlign:'left', lineHeight:1.7 }),
        makeElement('shape', { x:55, y:5, width:40, height:88, shapeType:'rect', fill:'#1a1a2e', borderRadius:16 }),
      ],
    }),
    makeSlide(2, {
      bgType: 'gradient',
      bgValue: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)',
      layout: 'text-only',
      elements: [
        makeElement('text', { x:10, y:15, width:80, height:12, content:'WHAT YOU GET', fontSize:32, fontWeight:'900', color:'#ff8c00', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:10, y:35, width:80, height:8, content:'✓  Exclusive early access to every release', fontSize:18, color:'#fff', textAlign:'center' }),
        makeElement('text', { x:10, y:47, width:80, height:8, content:'✓  Monthly stems & behind-the-scenes', fontSize:18, color:'#fff', textAlign:'center' }),
        makeElement('text', { x:10, y:59, width:80, height:8, content:'✓  Private Discord with the band', fontSize:18, color:'#fff', textAlign:'center' }),
      ],
    }),
    makeSlide(3, {
      bgType: 'gradient',
      bgValue: 'linear-gradient(135deg, #ff8c00 0%, #ff4500 100%)',
      layout: 'cta',
      elements: [
        makeElement('text', { x:10, y:28, width:80, height:18, content:'JOIN THE COMMUNITY', fontSize:44, fontWeight:'900', color:'#000', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:15, y:52, width:70, height:10, content:'Be part of something real.', fontSize:22, color:'#000', textAlign:'center', opacity:0.7 }),
        makeElement('button', { x:28, y:70, width:44, height:12, label:'Subscribe Now →', href:'#', btnColor:'#000', btnTextColor:'#fff', btnBorderRadius:999 }),
      ],
    }),
  ],
  film: [
    makeSlide(0, {
      bgType: 'gradient',
      bgValue: 'linear-gradient(180deg, #000 0%, #1a1a1a 100%)',
      layout: 'hero',
      elements: [
        makeElement('text', { x:8, y:22, width:84, height:20, content:'FILM TITLE', fontSize:64, fontWeight:'900', color:'#c9a96e', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:6, animation:'fade-in' }),
        makeElement('text', { x:15, y:48, width:70, height:10, content:'A film by Director Name · 2025', fontSize:18, color:'rgba(255,255,255,0.5)', textAlign:'center', fontFamily:'"Noto Serif",serif', fontStyle:'italic' }),
        makeElement('button', { x:32, y:72, width:36, height:10, label:'Watch Trailer', href:'#', btnColor:'#c9a96e', btnTextColor:'#000', btnBorderRadius:4 }),
      ],
    }),
    makeSlide(1, {
      bgType: 'color', bgValue: '#0d0d0d', layout: 'split',
      elements: [
        makeElement('text', { x:5, y:8, width:48, height:12, content:'THE STORY', fontSize:36, fontWeight:'900', color:'#c9a96e', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:5, y:26, width:48, height:58, content:'In one powerful sentence, describe what your film is about. What drives the story? What do audiences feel?', fontSize:17, color:'rgba(255,255,255,0.7)', lineHeight:1.8 }),
        makeElement('shape', { x:57, y:5, width:40, height:88, shapeType:'rect', fill:'#1a1a1a', borderRadius:8 }),
        makeElement('text', { x:59, y:43, width:36, height:8, content:'POSTER', fontSize:14, color:'rgba(255,255,255,0.2)', textAlign:'center' }),
      ],
    }),
    makeSlide(2, {
      bgType: 'gradient', bgValue: 'linear-gradient(180deg, #0d0d0d 0%, #1a1200 100%)', layout: 'text-only',
      elements: [
        makeElement('text', { x:10, y:12, width:80, height:14, content:'FESTIVAL RUN', fontSize:34, fontWeight:'900', color:'#c9a96e', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:15, y:33, width:70, height:8, content:'Sundance · Tribeca · SXSW', fontSize:20, color:'#fff', textAlign:'center', letterSpacing:4 }),
        makeElement('text', { x:10, y:48, width:80, height:30, content:'"A stunning debut that redefines the genre." — Critic Name', fontSize:22, color:'rgba(255,255,255,0.6)', textAlign:'center', fontStyle:'italic', lineHeight:1.7 }),
      ],
    }),
    makeSlide(3, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #c9a96e 0%, #8b6914 100%)', layout: 'cta',
      elements: [
        makeElement('text', { x:10, y:25, width:80, height:18, content:'SUPPORT THIS FILM', fontSize:44, fontWeight:'900', color:'#000', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:15, y:50, width:70, height:12, content:'Every contribution keeps independent cinema alive.', fontSize:20, color:'rgba(0,0,0,0.7)', textAlign:'center' }),
        makeElement('button', { x:28, y:72, width:44, height:11, label:'Fund the Film →', href:'#', btnColor:'#000', btnTextColor:'#c9a96e', btnBorderRadius:4 }),
      ],
    }),
  ],
  business: [
    makeSlide(0, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #0f1923 0%, #1e3a5f 100%)', layout: 'hero',
      elements: [
        makeElement('text', { x:8, y:22, width:84, height:20, content:'COMPANY NAME', fontSize:56, fontWeight:'900', color:'#ffffff', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:2 }),
        makeElement('text', { x:12, y:48, width:76, height:10, content:'One-line value proposition that hooks investors immediately.', fontSize:19, color:'rgba(255,255,255,0.6)', textAlign:'center', lineHeight:1.5 }),
        makeElement('button', { x:30, y:72, width:40, height:10, label:'Learn More →', href:'#', btnColor:'#4a90d9', btnTextColor:'#fff', btnBorderRadius:8 }),
      ],
    }),
    makeSlide(1, {
      bgType: 'color', bgValue: '#0f1923', layout: 'split',
      elements: [
        makeElement('text', { x:5, y:8, width:55, height:12, content:'THE PROBLEM', fontSize:34, fontWeight:'900', color:'#4a90d9', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:5, y:26, width:52, height:55, content:'Describe the pain point clearly. What frustrates your target customer today? Make it tangible and visceral.', fontSize:17, color:'rgba(255,255,255,0.7)', lineHeight:1.8 }),
        makeElement('shape', { x:60, y:5, width:36, height:88, shapeType:'rect', fill:'#1e3a5f', borderRadius:12 }),
      ],
    }),
    makeSlide(2, {
      bgType: 'color', bgValue: '#0f1923', layout: 'split',
      elements: [
        makeElement('text', { x:5, y:8, width:55, height:12, content:'THE NUMBERS', fontSize:34, fontWeight:'900', color:'#4a90d9', textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:5, y:30, width:50, height:12, content:'$10M', fontSize:48, fontWeight:'900', color:'#fff', textAlign:'left' }),
        makeElement('text', { x:5, y:46, width:50, height:8, content:'Total Addressable Market', fontSize:15, color:'rgba(255,255,255,0.4)', textAlign:'left' }),
        makeElement('text', { x:5, y:62, width:50, height:10, content:'12x', fontSize:40, fontWeight:'900', color:'#4a90d9', textAlign:'left' }),
        makeElement('text', { x:5, y:75, width:50, height:8, content:'Year-over-year growth', fontSize:15, color:'rgba(255,255,255,0.4)', textAlign:'left' }),
      ],
    }),
    makeSlide(3, {
      bgType: 'gradient', bgValue: 'linear-gradient(135deg, #1e3a5f 0%, #0f1923 100%)', layout: 'cta',
      elements: [
        makeElement('text', { x:10, y:22, width:80, height:18, content:"LET'S BUILD THIS", fontSize:48, fontWeight:'900', color:'#fff', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        makeElement('text', { x:15, y:47, width:70, height:12, content:'We are raising a seed round. Join us.', fontSize:20, color:'rgba(255,255,255,0.6)', textAlign:'center' }),
        makeElement('button', { x:25, y:70, width:50, height:12, label:'Schedule a Call →', href:'#', btnColor:'#4a90d9', btnTextColor:'#fff', btnBorderRadius:8 }),
      ],
    }),
  ],
  fashion: [
    makeSlide(0, {
      bgType: 'color', bgValue: '#f5f0e8', layout: 'hero',
      elements: [
        makeElement('text', { x:8, y:22, width:84, height:20, content:'BRAND NAME', fontSize:64, fontWeight:'900', color:'#000000', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:12 }),
        makeElement('text', { x:15, y:52, width:70, height:10, content:'S S 2 5', fontSize:20, fontWeight:'400', color:'#c9b99a', textAlign:'center', fontFamily:'"Noto Serif",serif', letterSpacing:16, fontStyle:'italic' }),
        makeElement('button', { x:32, y:75, width:36, height:9, label:'VIEW COLLECTION', href:'#', btnColor:'#000', btnTextColor:'#f5f0e8', btnBorderRadius:0 }),
      ],
    }),
    makeSlide(1, {
      bgType: 'color', bgValue: '#1a1a1a', layout: 'split',
      elements: [
        makeElement('text', { x:5, y:15, width:45, height:14, content:'THE VISION', fontSize:38, fontWeight:'900', color:'#c9b99a', textAlign:'left', fontFamily:'"Outfit",sans-serif', letterSpacing:4 }),
        makeElement('text', { x:5, y:36, width:44, height:50, content:'Describe the creative direction. What story does this collection tell? What emotions does it evoke?', fontSize:17, color:'rgba(255,255,255,0.6)', lineHeight:1.9, fontStyle:'italic' }),
        makeElement('shape', { x:54, y:5, width:42, height:90, shapeType:'rect', fill:'#2a2a2a', borderRadius:0 }),
      ],
    }),
    makeSlide(2, {
      bgType: 'color', bgValue: '#f5f0e8', layout: 'text-only',
      elements: [
        makeElement('text', { x:5, y:12, width:90, height:14, content:'MATERIALS & CRAFT', fontSize:34, fontWeight:'900', color:'#000', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:4 }),
        makeElement('text', { x:10, y:35, width:80, height:8, content:'100% Organic Italian Linen', fontSize:19, color:'#1a1a1a', textAlign:'center', letterSpacing:2 }),
        makeElement('text', { x:10, y:48, width:80, height:8, content:'Hand-stitched in Naples', fontSize:19, color:'#1a1a1a', textAlign:'center', letterSpacing:2 }),
        makeElement('text', { x:10, y:61, width:80, height:8, content:'Limited — 50 pieces per style', fontSize:19, color:'#c9b99a', textAlign:'center', letterSpacing:2 }),
      ],
    }),
    makeSlide(3, {
      bgType: 'color', bgValue: '#000', layout: 'cta',
      elements: [
        makeElement('text', { x:8, y:25, width:84, height:20, content:'EXCLUSIVE ACCESS', fontSize:48, fontWeight:'900', color:'#c9b99a', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:4 }),
        makeElement('text', { x:15, y:52, width:70, height:10, content:'Members receive 48h early access before public drop.', fontSize:18, color:'rgba(255,255,255,0.5)', textAlign:'center', lineHeight:1.6 }),
        makeElement('button', { x:28, y:73, width:44, height:10, label:'JOIN THE LIST', href:'#', btnColor:'#c9b99a', btnTextColor:'#000', btnBorderRadius:0 }),
      ],
    }),
  ],
};

// ─── Slide thumbnail ───────────────────────────────────────────────────────────

function SlideThumbnail({ slide, active, index, onClick, onDelete, isDragging }:
  { slide: PitchSlide; active: boolean; index: number; onClick: () => void; onDelete: () => void; isDragging?: boolean }) {

  const bg = slide.bgType === 'gradient' ? slide.bgValue : slide.bgType === 'color' ? slide.bgValue : '#111';

  return (
    <div
      onClick={onClick}
      className={`group relative shrink-0 cursor-pointer rounded-xl border transition-all ${
        active ? 'border-orange-400/60 ring-1 ring-orange-400/20' : 'border-white/5 hover:border-white/15'
      } ${isDragging ? 'opacity-50 scale-95' : ''}`}
      style={{ width: 120, height: 68, background: bg }}
    >
      {/* Mini element previews */}
      {slide.elements.filter(e => e.type === 'text').slice(0,2).map(el => (
        <div key={el.id} style={{
          position:'absolute', left:`${el.x}%`, top:`${el.y}%`, width:`${el.width}%`,
          fontSize: 4, color: el.color ?? '#fff', fontWeight: el.fontWeight ?? '400',
          fontFamily: el.fontFamily ?? 'sans-serif', textAlign: el.textAlign ?? 'left',
          overflow: 'hidden', whiteSpace: 'nowrap',
          letterSpacing: el.letterSpacing ? el.letterSpacing * 0.1 : undefined,
        }}>
          {el.content}
        </div>
      ))}
      {/* Index */}
      <div className="absolute bottom-1 left-2 text-[7px] text-white/30 font-bold">{index + 1}</div>
      {/* Delete on hover */}
      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 hidden group-hover:flex w-4 h-4 bg-red-600 rounded-full items-center justify-center">
        <X size={8} className="text-white"/>
      </button>
    </div>
  );
}

// ─── Canvas element component ─────────────────────────────────────────────────

interface CanvasElementProps {
  el: PitchElement;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (e: PitchElement) => void;
  onDelete: () => void;
  scale: number;
  ctaUrl?: string;
}

function CanvasElement({ el, selected, onSelect, onUpdate, onDelete, scale, ctaUrl }: CanvasElementProps) {
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const resizeStart = useRef<{ mx: number; my: number; ow: number; oh: number } | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`, top: `${el.y}%`,
    width: `${el.width}%`, height: `${el.height}%`,
    zIndex: el.zIndex ?? 1,
    opacity: el.opacity ?? 1,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    cursor: 'move',
    userSelect: 'none',
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: el.x, oy: el.y };
    const onMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = (me.clientX - dragStart.current.mx) / (scale * 8);
      const dy = (me.clientY - dragStart.current.my) / (scale * 5.5);
      onUpdate({ ...el, x: Math.max(0, Math.min(90, dragStart.current.ox + dx)), y: Math.max(0, Math.min(90, dragStart.current.oy + dy)) });
    };
    const onUp = () => { dragStart.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeStart.current = { mx: e.clientX, my: e.clientY, ow: el.width, oh: el.height };
    const onMove = (me: MouseEvent) => {
      if (!resizeStart.current) return;
      const dx = (me.clientX - resizeStart.current.mx) / (scale * 8);
      const dy = (me.clientY - resizeStart.current.my) / (scale * 5.5);
      onUpdate({ ...el, width: Math.max(5, resizeStart.current.ow + dx), height: Math.max(3, resizeStart.current.oh + dy) });
    };
    const onUp = () => { resizeStart.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div style={style} onMouseDown={handleMouseDown}>
      {/* Content */}
      {el.type === 'text' && (
        <div
          ref={textRef}
          contentEditable={selected}
          suppressContentEditableWarning
          onBlur={e => onUpdate({ ...el, content: e.currentTarget.textContent ?? '' })}
          style={{
            width: '100%', height: '100%', outline: 'none',
            fontSize: el.fontSize ?? 18, fontWeight: el.fontWeight ?? '400',
            fontFamily: el.fontFamily ?? 'inherit', color: el.color ?? '#fff',
            textAlign: el.textAlign ?? 'left', lineHeight: el.lineHeight ?? 1.4,
            letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
            textShadow: el.textShadow, fontStyle: el.fontStyle ?? 'normal',
            wordBreak: 'break-word', overflow: 'hidden',
          }}
        >
          {el.content}
        </div>
      )}

      {el.type === 'image' && (
        <img src={el.src} alt="" style={{
          width:'100%', height:'100%', objectFit: el.objectFit ?? 'cover',
          borderRadius: el.borderRadius ?? 0,
          boxShadow: el.shadow,
        }}/>
      )}

      {el.type === 'video' && (
        <video src={el.videoSrc} autoPlay={el.autoPlay} loop={el.loop} muted={el.muted ?? true}
          style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius: el.borderRadius ?? 0 }}/>
      )}

      {el.type === 'button' && (
        <div style={{
          width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
          backgroundColor: el.btnColor ?? '#ff8c00', color: el.btnTextColor ?? '#000',
          borderRadius: el.btnBorderRadius ?? 8, fontWeight:'700',
          fontSize: el.fontSize ?? 16, fontFamily: el.fontFamily ?? 'inherit',
          cursor: 'pointer',
        }}>
          {el.label ?? 'Click Here'}
        </div>
      )}

      {el.type === 'shape' && (
        <div style={{
          width:'100%', height:'100%',
          backgroundColor: el.fill ?? 'rgba(255,255,255,0.1)',
          borderRadius: el.shapeType === 'circle' ? '50%' : el.borderRadius ?? 0,
          border: el.stroke ? `${el.strokeWidth ?? 2}px solid ${el.stroke}` : undefined,
        }}/>
      )}

      {/* Selection outline + handles */}
      {selected && (
        <>
          <div className="absolute inset-0 border-2 border-orange-400 pointer-events-none rounded-sm"/>
          {/* Delete */}
          <button onMouseDown={e => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-3 -right-3 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center z-50">
            <X size={10} className="text-white"/>
          </button>
          {/* Resize handle */}
          <div onMouseDown={handleResizeDown}
            className="absolute -bottom-2 -right-2 w-4 h-4 bg-orange-400 rounded-sm cursor-se-resize z-50"/>
        </>
      )}
    </div>
  );
}

// ─── Slide canvas ─────────────────────────────────────────────────────────────

function SlideCanvas({ slide, selected, onSelectEl, onUpdateEl, onDeleteEl, onDeselect, ctaUrl, scale = 1 }:
  { slide: PitchSlide; selected: string | null; onSelectEl: (id: string) => void; onUpdateEl: (el: PitchElement) => void; onDeleteEl: (id: string) => void; onDeselect: () => void; ctaUrl?: string; scale?: number }) {

  const bgStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    background: slide.bgType === 'gradient' || slide.bgType === 'color' ? slide.bgValue : '#000',
  };
  if (slide.bgType === 'image') {
    bgStyle.backgroundImage = `url(${slide.bgValue})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  }

  const sorted = [...slide.elements].sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));

  return (
    <div className="relative overflow-hidden" style={{ width:'100%', paddingTop:'56.25%' /* 16:9 */ }}>
      <div className="absolute inset-0" onClick={onDeselect}>
        {/* Background */}
        <div style={bgStyle}/>
        {slide.bgOverlay && (
          <div style={{ position:'absolute', inset:0, background: slide.bgOverlay }}/>
        )}
        {slide.bgType === 'video' && (
          <video src={slide.bgValue} autoPlay loop muted style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
        )}

        {/* Elements */}
        {sorted.map(el => (
          <CanvasElement
            key={el.id}
            el={el}
            selected={el.id === selected}
            onSelect={() => onSelectEl(el.id)}
            onUpdate={onUpdateEl}
            onDelete={() => onDeleteEl(el.id)}
            scale={scale}
            ctaUrl={ctaUrl}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Properties panel ──────────────────────────────────────────────────────────

function PropertiesPanel({ el, slide, onUpdateEl, onUpdateSlide, deck, onUpdateDeck }:
  { el: PitchElement | null; slide: PitchSlide; onUpdateEl: (e: PitchElement) => void; onUpdateSlide: (s: PitchSlide) => void; deck: PitchDeck; onUpdateDeck: (d: PitchDeck) => void }) {

  if (!el) {
    // Slide-level properties
    return (
      <div className="p-3 space-y-4 text-xs">
        <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-3">Slide</div>

        <div>
          <div className="text-white/30 mb-1.5">Background</div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {(['color','gradient','image','video'] as const).map(t => (
              <button key={t} onClick={() => onUpdateSlide({ ...slide, bgType: t })}
                className={`px-2 py-1 rounded-lg border capitalize transition-colors ${slide.bgType === t ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
                {t}
              </button>
            ))}
          </div>
          {slide.bgType === 'color' && (
            <input type="color" value={slide.bgValue} onChange={e => onUpdateSlide({ ...slide, bgValue: e.target.value })}
              className="w-full h-8 rounded-xl cursor-pointer border border-white/10"/>
          )}
          {slide.bgType === 'image' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-orange-400 hover:text-orange-300">
              <Upload size={11}/> Upload background
              <input type="file" accept="image/*,video/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file || !auth.currentUser) return;
                const r = storageRef(storage, `pitchdecks/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
                await uploadBytes(r, file);
                const url = await getDownloadURL(r);
                onUpdateSlide({ ...slide, bgValue: url, bgType: file.type.startsWith('video') ? 'video' : 'image' });
              }}/>
            </label>
          )}
        </div>

        <div>
          <div className="text-white/30 mb-1.5">Background overlay</div>
          <input type="color" value={slide.bgOverlay?.replace(/[^#\w]/g,'#000000') ?? '#000000'}
            onChange={e => onUpdateSlide({ ...slide, bgOverlay: `${e.target.value}80` })}
            className="w-8 h-6 rounded cursor-pointer border border-white/10 mr-2"/>
          <button onClick={() => onUpdateSlide({ ...slide, bgOverlay: undefined })}
            className="text-white/25 hover:text-white text-[10px] underline">Remove overlay</button>
        </div>

        <div>
          <div className="text-white/30 mb-1.5">Transition</div>
          <div className="flex gap-1.5 flex-wrap">
            {(['fade','slide-left','slide-up','zoom','none'] as PitchTransition[]).map(t => (
              <button key={t} onClick={() => onUpdateSlide({ ...slide, transition: t })}
                className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${slide.transition === t ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-white/30 mb-1">Auto-advance (sec, 0 = manual)</div>
          <input type="number" min={0} max={60} value={slide.duration ?? 0}
            onChange={e => onUpdateSlide({ ...slide, duration: Number(e.target.value) })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 focus:outline-none"/>
        </div>

        <div className="border-t border-white/5 pt-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2">Deck CTA</div>
          <div className="text-white/30 mb-1">CTA URL (links all buttons)</div>
          <input value={deck.ctaUrl ?? ''} onChange={e => onUpdateDeck({ ...deck, ctaUrl: e.target.value })}
            placeholder="https://…"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white focus:outline-none text-[10px]"/>
          <div className="text-white/30 mb-1 mt-2">CTA Label</div>
          <input value={deck.ctaLabel ?? ''} onChange={e => onUpdateDeck({ ...deck, ctaLabel: e.target.value })}
            placeholder="Join Now"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white focus:outline-none text-[10px]"/>
        </div>
      </div>
    );
  }

  // Element-level properties
  return (
    <div className="p-3 space-y-3 text-xs overflow-y-auto">
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2 capitalize">{el.type}</div>

      {el.type === 'text' && (
        <>
          <div>
            <div className="text-white/30 mb-1">Text</div>
            <textarea value={el.content ?? ''} onChange={e => onUpdateEl({ ...el, content: e.target.value })}
              rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white focus:outline-none resize-none"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-white/30 mb-1">Size</div>
              <input type="number" value={el.fontSize ?? 18} onChange={e => onUpdateEl({ ...el, fontSize: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 focus:outline-none"/>
            </div>
            <div>
              <div className="text-white/30 mb-1">Color</div>
              <input type="color" value={el.color ?? '#ffffff'} onChange={e => onUpdateEl({ ...el, color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer border border-white/10"/>
            </div>
          </div>
          <div className="flex gap-1">
            {(['400','700','900'] as const).map(w => (
              <button key={w} onClick={() => onUpdateEl({ ...el, fontWeight: w })}
                className={`flex-1 py-1 rounded border text-[10px] transition-colors ${el.fontWeight === w ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}
                style={{ fontWeight: w }}>{w === '400' ? 'Regular' : w === '700' ? 'Bold' : 'Black'}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['left','center','right'] as const).map(a => (
              <button key={a} onClick={() => onUpdateEl({ ...el, textAlign: a })}
                className={`flex-1 py-1 rounded border transition-colors ${el.textAlign === a ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
                {a === 'left' ? <AlignLeft size={10} className="mx-auto"/> : a === 'center' ? <AlignCenter size={10} className="mx-auto"/> : <AlignRight size={10} className="mx-auto"/>}
              </button>
            ))}
          </div>
          <div>
            <div className="text-white/30 mb-1">Letter spacing (px)</div>
            <input type="number" value={el.letterSpacing ?? 0} onChange={e => onUpdateEl({ ...el, letterSpacing: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 focus:outline-none"/>
          </div>
        </>
      )}

      {(el.type === 'image') && (
        <>
          <label className="flex items-center gap-1.5 cursor-pointer text-orange-400 text-[11px]">
            <Upload size={11}/> Change image
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0];
              if (!file || !auth.currentUser) return;
              const r = storageRef(storage, `pitchdecks/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
              await uploadBytes(r, file);
              onUpdateEl({ ...el, src: await getDownloadURL(r) });
            }}/>
          </label>
          <div>
            <div className="text-white/30 mb-1">Object fit</div>
            <div className="flex gap-1">
              {(['cover','contain','fill'] as const).map(f => (
                <button key={f} onClick={() => onUpdateEl({ ...el, objectFit: f })}
                  className={`flex-1 py-1 rounded border capitalize text-[10px] transition-colors ${el.objectFit === f ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-white/30 mb-1">Border radius</div>
            <input type="range" min={0} max={200} value={el.borderRadius ?? 0}
              onChange={e => onUpdateEl({ ...el, borderRadius: Number(e.target.value) })}
              className="w-full accent-orange-500"/>
          </div>
          <button
            onClick={async () => {
              if (!el.src) return;
              alert('AI background removal: connect your Gemini API key and call the image editing endpoint. The cutoutApplied flag will be set once processed.');
              onUpdateEl({ ...el, cutoutApplied: true, originalSrc: el.src });
            }}
            className="w-full py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 text-[11px] flex items-center justify-center gap-1.5">
            <Sparkles size={11}/> AI Background Remove
          </button>
        </>
      )}

      {el.type === 'button' && (
        <>
          <div>
            <div className="text-white/30 mb-1">Label</div>
            <input value={el.label ?? ''} onChange={e => onUpdateEl({ ...el, label: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white focus:outline-none"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><div className="text-white/30 mb-1">Color</div><input type="color" value={el.btnColor ?? '#ff8c00'} onChange={e => onUpdateEl({ ...el, btnColor: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-white/10"/></div>
            <div><div className="text-white/30 mb-1">Text</div><input type="color" value={el.btnTextColor ?? '#000000'} onChange={e => onUpdateEl({ ...el, btnTextColor: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-white/10"/></div>
          </div>
          <div>
            <div className="text-white/30 mb-1">Border radius</div>
            <input type="range" min={0} max={999} value={el.btnBorderRadius ?? 8} onChange={e => onUpdateEl({ ...el, btnBorderRadius: Number(e.target.value) })} className="w-full accent-orange-500"/>
          </div>
        </>
      )}

      {/* Universal position + size */}
      <div className="border-t border-white/5 pt-3">
        <div className="text-white/30 mb-1.5">Position & Size (%)</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['x','y','width','height'] as const).map(k => (
            <div key={k}>
              <div className="text-[8px] text-white/25 uppercase mb-0.5">{k}</div>
              <input type="number" step={0.5} value={Math.round(el[k] * 10) / 10}
                onChange={e => onUpdateEl({ ...el, [k]: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 focus:outline-none text-[11px]"/>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-white/30 mb-1">Opacity</div>
        <input type="range" min={0} max={1} step={0.05} value={el.opacity ?? 1}
          onChange={e => onUpdateEl({ ...el, opacity: Number(e.target.value) })}
          className="w-full accent-orange-500"/>
      </div>
      <div>
        <div className="text-white/30 mb-1">Rotation °</div>
        <input type="number" value={el.rotation ?? 0} onChange={e => onUpdateEl({ ...el, rotation: Number(e.target.value) })}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 focus:outline-none"/>
      </div>
    </div>
  );
}

// ─── Narration/audio strip ─────────────────────────────────────────────────────

function AudioStrip({ deck, onUpdate }: { deck: PitchDeck; onUpdate: (d: PitchDeck) => void }) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      if (!auth.currentUser) return;
      const r = storageRef(storage, `pitchdecks/${auth.currentUser.uid}/narration_${Date.now()}.webm`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      onUpdate({ ...deck, narrationUrl: url });
    };
    rec.start();
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5 bg-[#0d0d0d]">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">Narration</span>

      {recording ? (
        <button onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"/> Stop Recording
        </button>
      ) : (
        <button onClick={startRecording} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-xs hover:bg-white/10 transition-colors">
          <Mic size={11}/> Record Narration
        </button>
      )}

      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-xs cursor-pointer hover:bg-white/10 transition-colors">
        <Upload size={11}/> Upload Audio
        <input type="file" accept="audio/*" className="hidden" onChange={async e => {
          const file = e.target.files?.[0];
          if (!file || !auth.currentUser) return;
          const r = storageRef(storage, `pitchdecks/${auth.currentUser.uid}/narration_${Date.now()}_${file.name}`);
          await uploadBytes(r, file);
          onUpdate({ ...deck, narrationUrl: await getDownloadURL(r) });
        }}/>
      </label>

      {deck.narrationUrl && (
        <audio src={deck.narrationUrl} controls className="h-7 flex-1"/>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[9px] text-white/25">BG Music</span>
        <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs cursor-pointer hover:text-white transition-colors">
          <Music2 size={10}/>
          <input type="file" accept="audio/*" className="hidden" onChange={async e => {
            const file = e.target.files?.[0];
            if (!file || !auth.currentUser) return;
            const r = storageRef(storage, `pitchdecks/${auth.currentUser.uid}/bgmusic_${Date.now()}_${file.name}`);
            await uploadBytes(r, file);
            onUpdate({ ...deck, bgMusicUrl: await getDownloadURL(r) });
          }}/>
        </label>
        {deck.bgMusicUrl && (
          <input type="range" min={0} max={1} step={0.05} value={deck.bgMusicVolume ?? 0.3}
            onChange={e => onUpdate({ ...deck, bgMusicVolume: Number(e.target.value) })}
            className="w-16 accent-orange-500" title="BG music volume"/>
        )}
      </div>
    </div>
  );
}

// ─── Default blank deck ────────────────────────────────────────────────────────

function makeDefaultDeck(theme: PitchDeckTheme = 'business'): PitchDeck {
  const meta = THEME_META[theme];
  return {
    id: uuidv4(),
    title: 'My Pitch Deck',
    theme,
    slides: THEME_TEMPLATES[theme].map((s, i) => ({ ...s, id: uuidv4(), order: i })),
    bgMusicVolume: 0.3,
    createdBy: auth.currentUser?.uid ?? '',
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Debounced save ────────────────────────────────────────────────────────────

function useDebouncedDeckSave(deck: PitchDeck, delay = 1800) {
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!auth.currentUser) return;
      try {
        await setDoc(doc(db, 'pitch_decks', deck.id), { ...deck, userId: auth.currentUser.uid, savedAt: serverTimestamp() }, { merge: true });
        setSaved(true);
      } catch {}
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [deck, delay]);
  return saved;
}

// ─── Main Studio ──────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  initialDeck?: PitchDeck;
  linkedTo?: PitchDeck['linkedTo'];
}

const ADD_ELEMENT_MENU = [
  { type: 'text' as PitchElementType, label: 'Text', icon: <Type size={12}/> },
  { type: 'image' as PitchElementType, label: 'Image', icon: <Image size={12}/> },
  { type: 'video' as PitchElementType, label: 'Video', icon: <Film size={12}/> },
  { type: 'button' as PitchElementType, label: 'Button', icon: <Link2 size={12}/> },
  { type: 'shape' as PitchElementType, label: 'Shape', icon: <Square size={12}/> },
];

export default function PitchDeckStudio({ onBack, initialDeck, linkedTo }: Props) {
  const [themeChooser, setThemeChooser] = useState(!initialDeck);
  const [deck, setDeck] = useState<PitchDeck>(() => initialDeck ?? makeDefaultDeck());
  const [activeSlideId, setActiveSlideId] = useState(deck.slides[0]?.id ?? '');
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [showAddEl, setShowAddEl] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [scale] = useState(0.9);

  const saved = useDebouncedDeckSave(deck);

  const sortedSlides = useMemo(() => [...deck.slides].sort((a,b) => a.order - b.order), [deck.slides]);
  const activeSlide = deck.slides.find(s => s.id === activeSlideId) ?? deck.slides[0];
  const selectedEl = activeSlide?.elements.find(e => e.id === selectedElId) ?? null;

  const updateSlide = useCallback((updated: PitchSlide) => {
    setDeck(d => ({ ...d, updatedAt: Date.now(), slides: d.slides.map(s => s.id === updated.id ? updated : s) }));
  }, []);

  const addSlide = () => {
    const maxOrder = Math.max(0, ...deck.slides.map(s => s.order));
    const newSlide = makeSlide(maxOrder + 1);
    setDeck(d => ({ ...d, slides: [...d.slides, newSlide] }));
    setActiveSlideId(newSlide.id);
  };

  const deleteSlide = (id: string) => {
    if (deck.slides.length <= 1) return;
    const remaining = deck.slides.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i }));
    setDeck(d => ({ ...d, slides: remaining }));
    if (activeSlideId === id) setActiveSlideId(remaining[0]?.id ?? '');
  };

  const addElement = (type: PitchElementType) => {
    if (!activeSlide) return;
    const el = makeElement(type, {
      content: type === 'text' ? 'Double-click to edit' : undefined,
      src: type === 'image' ? undefined : undefined,
      label: type === 'button' ? 'Click Here' : undefined,
      shapeType: type === 'shape' ? 'rect' : undefined,
      fill: type === 'shape' ? 'rgba(255,255,255,0.1)' : undefined,
      btnColor: type === 'button' ? THEME_META[deck.theme].palette[1] : undefined,
      btnTextColor: type === 'button' ? '#000' : undefined,
      color: type === 'text' ? '#ffffff' : undefined,
      fontSize: type === 'text' ? 24 : type === 'button' ? 16 : undefined,
      fontWeight: type === 'text' ? '700' : undefined,
      textAlign: type === 'text' ? 'center' : undefined,
    });
    updateSlide({ ...activeSlide, elements: [...activeSlide.elements, el] });
    setSelectedElId(el.id);
    setShowAddEl(false);
  };

  const updateEl = (updated: PitchElement) => {
    if (!activeSlide) return;
    updateSlide({ ...activeSlide, elements: activeSlide.elements.map(e => e.id === updated.id ? updated : e) });
  };

  const deleteEl = (id: string) => {
    if (!activeSlide) return;
    updateSlide({ ...activeSlide, elements: activeSlide.elements.filter(e => e.id !== id) });
    if (selectedElId === id) setSelectedElId(null);
  };

  // Share panel
  const shareUrl = `${window.location.origin}?pitch=${deck.id}`;
  const embedCode = `<iframe src="${window.location.origin}/embed/pitch/${deck.id}" width="800" height="450" frameborder="0" allowfullscreen allow="autoplay"></iframe>`;

  // Theme chooser modal
  if (themeChooser) {
    return (
      <div className="flex flex-col h-screen bg-[#0c0c0c] text-white items-center justify-center p-8">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.4em] text-white/20">Choose a theme</div>
        <h1 className="text-3xl font-black mb-8">New Pitch Deck</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl w-full">
          {(Object.entries(THEME_META) as [PitchDeckTheme, typeof THEME_META[PitchDeckTheme]][]).map(([id, meta]) => (
            <button key={id} onClick={() => {
              setDeck(makeDefaultDeck(id));
              setActiveSlideId(THEME_TEMPLATES[id][0]?.id ?? '');
              setThemeChooser(false);
            }}
              className="flex flex-col items-center gap-3 p-6 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/6 hover:border-white/20 transition-all group">
              <div className="text-4xl">{meta.icon}</div>
              <div className="font-bold text-sm">{meta.label}</div>
              <div className="flex gap-1.5">
                {meta.palette.map(c => (
                  <div key={c} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: c }}/>
                ))}
              </div>
            </button>
          ))}
        </div>
        <button onClick={() => setThemeChooser(false)} className="mt-6 text-xs text-white/25 hover:text-white underline">Skip — start blank</button>
        <button onClick={onBack} className="mt-3 text-xs text-white/20 hover:text-white/40 flex items-center gap-1">
          <ArrowLeft size={11}/> Back
        </button>
      </div>
    );
  }

  if (previewMode) {
    const PitchDeckViewer = lazy(() => import('./PitchDeckViewer'));
    return (
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20">Loading viewer…</div>}>
        <PitchDeckViewer deck={deck} onClose={() => setPreviewMode(false)} autoPlay={false}/>
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0c0c0c] text-white overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.05] bg-[#0f0f0f] shrink-0 z-20">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={16}/>
        </button>
        <input value={deck.title} onChange={e => setDeck(d => ({ ...d, title: e.target.value }))}
          className="bg-transparent text-sm font-bold text-white focus:outline-none max-w-[180px] border-b border-transparent focus:border-orange-400/30 pb-px transition-colors mr-2"/>

        {/* Theme chips */}
        {(Object.entries(THEME_META) as [PitchDeckTheme, typeof THEME_META[PitchDeckTheme]][]).map(([id, m]) => (
          <button key={id} onClick={() => setDeck(d => ({ ...d, theme: id, slides: THEME_TEMPLATES[id].map((s,i) => ({ ...s, id: uuidv4(), order: i })) }))}
            title={m.label}
            className={`px-2 py-1 rounded-lg text-[10px] border transition-colors ${deck.theme === id ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-white/[0.02] border-white/5 text-white/25 hover:text-white'}`}>
            {m.icon}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <span className={`text-[10px] transition-colors mr-1 ${saved ? 'text-white/15' : 'text-orange-400/50'}`}>{saved ? 'Saved' : 'Saving…'}</span>

          <button onClick={() => setPreviewMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs text-white/50 hover:bg-white/8 hover:text-white transition-colors">
            <Eye size={11}/> Preview
          </button>

          <div className="relative">
            <button onClick={() => setShowSharePanel(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs text-white/50 hover:bg-white/8 hover:text-white transition-colors">
              <Share2 size={11}/> Share
            </button>
            <AnimatePresence>
              {showSharePanel && (
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.12}}
                  className="absolute right-0 top-full mt-2 w-80 bg-[#181818] border border-white/8 rounded-2xl p-4 shadow-2xl z-50 space-y-3">
                  <div className="text-xs font-bold text-white/60 mb-2">Share your pitch</div>
                  <div>
                    <div className="text-[10px] text-white/30 mb-1">Share link</div>
                    <div className="flex gap-2">
                      <input value={shareUrl} readOnly className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none"/>
                      <button onClick={() => navigator.clipboard.writeText(shareUrl)} className="px-2 py-1.5 bg-orange-500 text-black text-[10px] font-bold rounded-lg hover:bg-orange-400 transition-colors">Copy</button>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/30 mb-1">Embed code (iframe)</div>
                    <textarea value={embedCode} readOnly rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white/50 focus:outline-none resize-none font-mono"/>
                    <button onClick={() => navigator.clipboard.writeText(embedCode)} className="mt-1 text-[10px] text-orange-400 hover:text-orange-300">Copy embed code</button>
                  </div>
                  <div className="flex gap-2 pt-1 border-t border-white/5">
                    <div className="text-[9px] text-white/25 flex items-center gap-1"><Smartphone size={9}/> Reflows vertical on mobile</div>
                    <div className="text-[9px] text-white/25 flex items-center gap-1"><Globe size={9}/> Public link when deck is published</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={() => setShowSettings(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${showSettings ? 'bg-white/8 border-white/15 text-white' : 'bg-white/[0.02] border-white/[0.05] text-white/25 hover:text-white'}`}>
            <Settings2 size={13}/>
          </button>
        </div>
      </div>

      {/* ── Main body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: slide timeline */}
        <div className="w-[144px] shrink-0 border-r border-white/[0.05] bg-[#0f0f0f] flex flex-col">
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {sortedSlides.map((slide, i) => (
              <SlideThumbnail
                key={slide.id}
                slide={slide}
                active={slide.id === activeSlideId}
                index={i}
                onClick={() => { setActiveSlideId(slide.id); setSelectedElId(null); }}
                onDelete={() => deleteSlide(slide.id)}
              />
            ))}
          </div>
          <div className="p-2 border-t border-white/[0.05]">
            <button onClick={addSlide}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold hover:bg-orange-500/15 transition-colors">
              <Plus size={11}/> Add slide
            </button>
          </div>
        </div>

        {/* Center: canvas */}
        <div className="flex-1 overflow-auto bg-[#222] flex items-center justify-center p-8">
          {activeSlide && (
            <div style={{ width: '100%', maxWidth: 900 }}>
              <div className="rounded-xl overflow-hidden shadow-2xl" style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
                <SlideCanvas
                  slide={activeSlide}
                  selected={selectedElId}
                  onSelectEl={setSelectedElId}
                  onUpdateEl={updateEl}
                  onDeleteEl={deleteEl}
                  onDeselect={() => setSelectedElId(null)}
                  ctaUrl={deck.ctaUrl}
                  scale={scale}
                />
              </div>

              {/* Add element toolbar below canvas */}
              <div className="flex items-center gap-2 mt-3 justify-center">
                {ADD_ELEMENT_MENU.map(({ type, label, icon }) => (
                  <button key={type} onClick={() => addElement(type)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-white/50 text-xs hover:bg-white/10 hover:text-white transition-colors">
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: properties */}
        <AnimatePresence>
          {(showSettings || selectedElId) && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: 196, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="shrink-0 border-l border-white/[0.05] bg-[#0f0f0f] overflow-hidden"
            >
              <div className="w-[196px] overflow-y-auto h-full">
                <PropertiesPanel
                  el={selectedEl}
                  slide={activeSlide!}
                  onUpdateEl={updateEl}
                  onUpdateSlide={updateSlide}
                  deck={deck}
                  onUpdateDeck={setDeck}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Narration / audio timeline strip ── */}
      <AudioStrip deck={deck} onUpdate={setDeck}/>
    </div>
  );
}

/**
 * DemoPitchDeckCard
 *
 * Shows a live demo pitch deck preview on Sanctuary, Club, and Business pages.
 * Every page gets a contextual template — theme and copy adapt to the creator's
 * genre, club category, or business type automatically.
 *
 * Clicking "View Pitch" opens the full PitchDeckViewer in popup mode.
 * Clicking "Create / Edit Pitch" navigates to PitchDeckStudio.
 */

import React, { useState, lazy, Suspense, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, PenTool, Presentation, Zap, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PitchDeck, PitchDeckTheme, PitchSlide, PitchElement } from '../types';

const PitchDeckViewer = lazy(() => import('./PitchDeckViewer'));

// ─── Context types ─────────────────────────────────────────────────────────────

export type PitchDeckContext = 'sanctuary' | 'club' | 'business';

interface Props {
  context: PitchDeckContext;
  /** Creator / club / business name */
  name: string;
  /** Subtitle — genre, tagline, or category */
  subtitle?: string;
  /** Genre or category string for theme auto-detection */
  category?: string;
  /** Cover image URL — used as a background */
  coverImageUrl?: string;
  /** CTA URL — links pitch deck buttons to the right page */
  ctaUrl?: string;
  /** CTA label */
  ctaLabel?: string;
  /** Called when "Create / Edit Pitch" is clicked */
  onCreatePitch?: () => void;
  /** If true, user is the owner and sees "Edit" instead of "View" */
  isOwner?: boolean;
  /** Pre-existing deck to show instead of the auto-generated demo */
  existingDeck?: PitchDeck;
}

// ─── Theme detection ───────────────────────────────────────────────────────────

const MUSIC_KEYWORDS   = ['music','musician','artist','band','rapper','producer','dj','singer','songwriter','hiphop','hip-hop','r&b','pop','rock','jazz','electronic','edm'];
const FILM_KEYWORDS    = ['film','filmmaker','director','cinema','movie','documentary','animation','visual','creative','video','content'];
const FASHION_KEYWORDS = ['fashion','clothing','style','design','brand','luxury','apparel','boutique','jewelry','accessories'];

function detectTheme(category = '', context: PitchDeckContext): PitchDeckTheme {
  const s = category.toLowerCase();
  if (MUSIC_KEYWORDS.some(k => s.includes(k))) return 'music';
  if (FILM_KEYWORDS.some(k => s.includes(k))) return 'film';
  if (FASHION_KEYWORDS.some(k => s.includes(k))) return 'fashion';
  if (context === 'business') return 'business';
  if (context === 'club') return 'business';
  return 'music'; // sanctuary default
}

// ─── Slide factory ─────────────────────────────────────────────────────────────

function el(type: PitchElement['type'], overrides: Partial<PitchElement> = {}): PitchElement {
  return { id: uuidv4(), type, x: 10, y: 10, width: 80, height: 20, zIndex: 1, opacity: 1, ...overrides };
}

function slide(order: number, overrides: Partial<PitchSlide> = {}): PitchSlide {
  return { id: uuidv4(), order, bgType: 'color', bgValue: '#0a0a0a', elements: [], transition: 'fade', ...overrides };
}

function buildDeck(props: Props): PitchDeck {
  const theme = detectTheme(props.category, props.context);
  const name  = props.name || 'Creator';
  const sub   = props.subtitle || '';
  const cta   = props.ctaUrl ?? '#';
  const ctaLabel = props.ctaLabel ?? (props.context === 'sanctuary' ? 'Join the Community' : props.context === 'club' ? 'Join the Club' : 'Learn More');

  const PALETTES: Record<PitchDeckTheme, { bg1: string; bg2: string; accent: string; text: string; btnText: string }> = {
    music:    { bg1:'#0a0a0a', bg2:'#1a1a2e', accent:'#ff8c00', text:'#ffffff', btnText:'#000000' },
    film:     { bg1:'#0d0d0d', bg2:'#1a1200', accent:'#c9a96e', text:'#ffffff', btnText:'#000000' },
    business: { bg1:'#0f1923', bg2:'#1e3a5f', accent:'#4a90d9', text:'#ffffff', btnText:'#ffffff' },
    fashion:  { bg1:'#f5f0e8', bg2:'#1a1a1a', accent:'#c9b99a', text:'#000000', btnText:'#f5f0e8' },
  };

  const p  = PALETTES[theme];
  const gradBg = `linear-gradient(135deg, ${p.bg1} 0%, ${p.bg2} 100%)`;

  const COPY: Record<PitchDeckContext, { slides: [string, string, string, string] }> = {
    sanctuary: { slides: ['Welcome to my world', 'What you get as a member', 'Exclusive content & early access', 'Join the inner circle today'] },
    club:      { slides: [`Welcome to ${name}`, 'What we\'re about', 'Why join us', 'Become a member today'] },
    business:  { slides: [name, 'What we do', 'Why choose us', 'Get in touch'] },
  };

  const headlines = COPY[props.context].slides;

  const slides: PitchSlide[] = [
    // Slide 1 — Hero
    slide(0, {
      bgType: props.coverImageUrl ? 'image' : 'gradient',
      bgValue: props.coverImageUrl ? props.coverImageUrl : gradBg,
      bgOverlay: props.coverImageUrl ? 'rgba(0,0,0,0.55)' : undefined,
      layout: 'hero',
      transition: 'fade',
      elements: [
        el('text', { x:8, y:25, width:84, height:20, content: name.toUpperCase(), fontSize:52, fontWeight:'900', color: theme === 'fashion' ? p.text : '#fff', textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:2, animation:'fade-in' }),
        el('text', { x:12, y:52, width:76, height:10, content: sub || headlines[0], fontSize:18, fontWeight:'400', color: props.coverImageUrl ? 'rgba(255,255,255,0.75)' : `${p.accent}cc`, textAlign:'center', fontFamily:'"Noto Serif",serif', animation:'slide-up', animationDelay:300 }),
        el('button', { x:30, y:74, width:40, height:10, label: ctaLabel, href: cta, btnColor: p.accent, btnTextColor: p.btnText, btnBorderRadius:999, animation:'pop', animationDelay:600 }),
      ],
    }),

    // Slide 2 — What you offer
    slide(1, {
      bgType: 'color', bgValue: p.bg1,
      layout: 'split',
      transition: 'slide-left',
      elements: [
        el('text', { x:5, y:10, width:55, height:12, content: headlines[1], fontSize:34, fontWeight:'900', color: p.accent, textAlign:'left', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:5, y:28, width:52, height:50, content: props.context === 'sanctuary'
          ? 'Exclusive early releases · Behind-the-scenes access · Private community · Monthly content drops'
          : props.context === 'club'
          ? 'A passionate community · Regular events · Exclusive content · Direct access to creators'
          : 'Premium service · Expert team · Trusted by thousands · Results you can count on',
          fontSize:16, fontWeight:'400', color:'rgba(255,255,255,0.7)', textAlign:'left', lineHeight:1.85 }),
        el('shape', { x:60, y:5, width:37, height:88, shapeType:'rect', fill:`${p.bg2}`, borderRadius:16 }),
        el('text', { x:63, y:43, width:30, height:8, content:'✦', fontSize:36, color:`${p.accent}60`, textAlign:'center' }),
      ],
    }),

    // Slide 3 — Social proof / features
    slide(2, {
      bgType: 'gradient', bgValue: gradBg,
      layout: 'text-only',
      transition: 'zoom',
      elements: [
        el('text', { x:10, y:12, width:80, height:14, content: headlines[2], fontSize:32, fontWeight:'900', color: theme === 'fashion' ? '#000' : '#fff', textAlign:'center', fontFamily:'"Outfit",sans-serif' }),
        el('text', { x:12, y:33, width:76, height:8, content: props.context === 'sanctuary' ? '✓  Members-only tracks & sessions' : props.context === 'club' ? '✓  Weekly meetups & events' : '✓  Trusted · Professional · Results-driven', fontSize:17, color: theme === 'fashion' ? '#000' : '#fff', textAlign:'center' }),
        el('text', { x:12, y:46, width:76, height:8, content: props.context === 'sanctuary' ? '✓  Private Discord & direct messages' : props.context === 'club' ? '✓  Exclusive member-only content' : '✓  Fast response · Always available', fontSize:17, color: theme === 'fashion' ? '#000' : '#fff', textAlign:'center' }),
        el('text', { x:12, y:59, width:76, height:8, content: props.context === 'sanctuary' ? '✓  Early access to every release' : props.context === 'club' ? '✓  Community of passionate people' : '✓  Competitive pricing · No hidden fees', fontSize:17, color: theme === 'fashion' ? '#000' : '#fff', textAlign:'center' }),
      ],
    }),

    // Slide 4 — CTA
    slide(3, {
      bgType: 'color', bgValue: p.accent,
      layout: 'cta',
      transition: 'slide-up',
      elements: [
        el('text', { x:8, y:22, width:84, height:20, content: headlines[3], fontSize:48, fontWeight:'900', color: p.btnText, textAlign:'center', fontFamily:'"Outfit",sans-serif', letterSpacing:1 }),
        el('text', { x:12, y:50, width:76, height:12, content: props.context === 'sanctuary'
          ? 'Be part of the story. Join today.'
          : props.context === 'club'
          ? 'The community is waiting for you.'
          : 'Ready to work together?',
          fontSize:20, color: p.btnText, textAlign:'center', opacity:0.75, lineHeight:1.6 }),
        el('button', { x:28, y:74, width:44, height:11, label: ctaLabel + ' →', href: cta, btnColor: p.bg1, btnTextColor: p.accent, btnBorderRadius:999 }),
      ],
    }),
  ];

  return {
    id: `demo_${props.context}_${uuidv4()}`,
    title: `${name} — Pitch`,
    subtitle: sub,
    theme,
    slides,
    bgMusicVolume: 0.3,
    ctaUrl: cta,
    ctaLabel,
    createdBy: '',
    isPublic: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    coverImageUrl: props.coverImageUrl,
  };
}

// ─── Slide mini-preview ────────────────────────────────────────────────────────

function SlidePreview({ slide, scale = 1 }: { slide: PitchSlide; scale?: number }) {
  const bg: React.CSSProperties = {
    background: slide.bgType === 'gradient' || slide.bgType === 'color' ? slide.bgValue : '#111',
  };
  if (slide.bgType === 'image') {
    bg.backgroundImage = `url(${slide.bgValue})`;
    bg.backgroundSize = 'cover';
    bg.backgroundPosition = 'center';
  }

  const textEls = slide.elements.filter(e => e.type === 'text').slice(0, 2);
  const btnEl   = slide.elements.find(e => e.type === 'button');

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl" style={bg}>
      {slide.bgOverlay && <div style={{ position:'absolute', inset:0, background: slide.bgOverlay }}/>}
      {textEls.map(el => (
        <div key={el.id} style={{
          position:'absolute', left:`${el.x}%`, top:`${el.y}%`, width:`${el.width}%`,
          fontSize: Math.max(4, (el.fontSize ?? 18) * scale * 0.12),
          fontWeight: el.fontWeight ?? '400', color: el.color ?? '#fff',
          textAlign: el.textAlign ?? 'left', fontFamily: el.fontFamily ?? 'sans-serif',
          letterSpacing: el.letterSpacing ? el.letterSpacing * 0.05 : undefined,
          overflow:'hidden', whiteSpace:'nowrap',
        }}>
          {el.content}
        </div>
      ))}
      {btnEl && (
        <div style={{
          position:'absolute', left:`${btnEl.x}%`, top:`${btnEl.y}%`,
          width:`${btnEl.width}%`, height:`${btnEl.height}%`,
          backgroundColor: btnEl.btnColor ?? '#ff8c00',
          borderRadius: btnEl.btnBorderRadius ?? 8,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <span style={{ fontSize: 3.5 * scale, color: btnEl.btnTextColor ?? '#000', fontWeight:'700', whiteSpace:'nowrap' }}>
            {btnEl.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────────

export default function DemoPitchDeckCard({
  context, name, subtitle, category, coverImageUrl, ctaUrl, ctaLabel, onCreatePitch, isOwner, existingDeck,
}: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);

  const deck = useMemo(
    () => existingDeck ?? buildDeck({ context, name, subtitle, category, coverImageUrl, ctaUrl, ctaLabel, onCreatePitch, isOwner }),
    [existingDeck, context, name, subtitle, category, coverImageUrl, ctaUrl, ctaLabel]
  );

  const accentColor =
    deck.theme === 'music' ? '#ff8c00' :
    deck.theme === 'film'  ? '#c9a96e' :
    deck.theme === 'fashion' ? '#c9b99a' :
    '#4a90d9';

  return (
    <>
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: `${accentColor}20`, background: 'rgba(255,255,255,0.02)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentColor}15` }}>
              <Presentation size={13} style={{ color: accentColor }}/>
            </div>
            <div>
              <div className="text-xs font-bold text-white/70">Pitch Deck</div>
              <div className="text-[9px] text-white/25 uppercase tracking-wider">
                {isOwner ? 'Your pitch — shared with visitors' : 'From the creator'}
              </div>
            </div>
          </div>
          {isOwner && onCreatePitch && (
            <button
              onClick={onCreatePitch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition-colors hover:bg-white/8"
              style={{ borderColor: `${accentColor}30`, color: accentColor }}
            >
              <PenTool size={10}/> Edit
            </button>
          )}
        </div>

        {/* 4-slide thumbnail grid */}
        <div className="grid grid-cols-4 gap-1.5 px-4 pb-4" style={{ height: 90 }}>
          {deck.slides.slice(0, 4).map((s, i) => (
            <button
              key={s.id}
              onClick={() => setViewerOpen(true)}
              className="relative group rounded-lg overflow-hidden hover:ring-2 transition-all"
              style={{ borderColor: accentColor }}
            >
              <SlidePreview slide={s} scale={1.4}/>
              {i === 0 && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <Play size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"/>
                </div>
              )}
              <div className="absolute bottom-0.5 right-0.5 text-[6px] text-white/30 font-bold">{i+1}</div>
            </button>
          ))}
        </div>

        {/* Bottom action bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-t"
          style={{ borderColor: `${accentColor}10`, background: `${accentColor}06` }}
        >
          <button
            onClick={() => setViewerOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-colors"
            style={{ backgroundColor: accentColor, color: deck.theme === 'business' ? '#fff' : '#000' }}
          >
            <Play size={12}/> Watch pitch
          </button>
          {!isOwner && (
            <div className="flex items-center gap-1 text-[9px] text-white/20">
              <Zap size={9}/> {deck.slides.length} slides
            </div>
          )}
          {isOwner && !onCreatePitch && (
            <div className="text-[9px] text-white/20">
              {deck.slides.length} slides · visible to all visitors
            </div>
          )}
        </div>
      </motion.div>

      {/* Full-screen viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <Suspense fallback={null}>
            <PitchDeckViewer
              deck={deck}
              onClose={() => setViewerOpen(false)}
              autoPlay
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}

import React from 'react';
import type { Slide } from '../../services/ambo/showModel';
import { SlideThumb, ScriptureThumb } from './AmboTemplateThumbs';
import { AmboPoster } from './AmboPoster';
import { AmboVisualizerThumb } from './AmboVisualizerThumb';
import { Music, Video, Radio, Sparkles, BookOpen } from 'lucide-react';

interface AmboSlideStillProps {
  slide: Slide;
  className?: string;
}

export const AmboSlideStill: React.FC<AmboSlideStillProps> = ({ slide, className = 'absolute inset-0 w-full h-full' }) => {
  // 1. Precomputed or explicit thumbnail
  if (slide.thumb) {
    return <img src={slide.thumb} alt={slide.label || ''} className={`${className} object-cover`} />;
  }

  const layers = slide.layers.filter(l => l.enabled !== false && l.visible !== false);

  // 2. Tela Design Template
  const tela = layers.find(l => l.content.kind === 'TELA_TEMPLATE')?.content;
  if (tela && tela.kind === 'TELA_TEMPLATE') {
    return <SlideThumb templateId={tela.templateId} theme={tela.theme} fields={tela.fields} square className={className} />;
  }

  // 3. Scripture Slide
  const scr = layers.find(l => l.content.kind === 'SCRIPTURE')?.content;
  if (scr && scr.kind === 'SCRIPTURE') {
    const text = (scr.lines || []).join(' ') || scr.reference || slide.label || 'Scripture';
    return (
      <div className={`${className} relative overflow-hidden bg-gradient-to-br from-[#1a1230] via-[#0d071a] to-[#251b3d] flex flex-col justify-between p-2.5`}>
        <div className="flex items-center justify-between text-[8px] font-bold text-[#D0BCFF]">
          <span className="flex items-center gap-1 font-mono uppercase tracking-wider">
            <BookOpen size={10} className="text-[#00DAF3]" />
            {scr.translation || 'KJV'}
          </span>
          <span className="truncate max-w-[65%] font-extrabold text-white/90">{scr.reference}</span>
        </div>
        <div className="my-auto text-[11px] font-medium text-white/90 line-clamp-3 leading-snug text-center italic" style={{ fontFamily: 'Palatino Linotype, Georgia, serif' }}>
          "{text}"
        </div>
        <div className="h-1 w-8 rounded-full bg-[#00DAF3]/40 mx-auto" />
      </div>
    );
  }

  // 4. Image Layer
  const imgLayer = layers.find(l => l.content.kind === 'IMAGE' && (l.content as any).src)?.content as any;
  if (imgLayer && imgLayer.src) {
    return <img src={imgLayer.src} alt={slide.label || ''} className={`${className} object-cover`} />;
  }

  // 5. Video Layer
  const vidLayer = layers.find(l => l.content.kind === 'VIDEO' && (l.content as any).src)?.content as any;
  if (vidLayer && vidLayer.src) {
    return (
      <div className={`${className} relative overflow-hidden bg-black flex items-center justify-center`}>
        <AmboPoster label={slide.label || 'Video'} videoSrc={vidLayer.src} kind="video" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-black/60 border border-white/30 flex items-center justify-center text-white shadow-lg">
            <Video size={13} className="text-[#00DAF3]" />
          </div>
        </div>
      </div>
    );
  }

  // 6. Audio Slide (Audio Layer, Audio Group, or Audio Enter Action)
  const audioLayer = layers.find(l => l.content.kind === 'AUDIO')?.content as any;
  const hasAudio = !!audioLayer || slide.group === 'Audio Assets' || slide.group === 'Audio' || slide.onEnter?.some(a => a.kind === 'AUDIO_PLAY');
  if (hasAudio) {
    return (
      <div className={`${className} relative overflow-hidden bg-gradient-to-br from-[#1a0a2a] via-[#10061e] to-[#2a0e3a] p-2.5 flex flex-col justify-between`}>
        <div className="flex items-center justify-between text-[8px] font-bold text-[#FF8C00]">
          <span className="flex items-center gap-1 font-mono uppercase tracking-wider">
            <Music size={10} className="text-[#FF8C00]" />
            AUDIO
          </span>
          <span className="text-white/40 font-mono">STEREO</span>
        </div>
        
        {/* Animated mini EQ bars simulation */}
        <div className="flex items-end justify-center gap-1 h-10 my-auto px-2">
          {[40, 75, 55, 90, 65, 80, 45, 95, 70, 50, 85, 60].map((h, idx) => (
            <div
              key={idx}
              className="w-1.5 rounded-full transition-all"
              style={{
                height: `${h}%`,
                background: 'linear-gradient(to top, #6B0099, #D40055, #FF8C00)',
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        <div className="text-[10px] font-bold text-white truncate text-center font-display leading-tight">
          {slide.label || 'Audio Playback'}
        </div>
      </div>
    );
  }

  // 7. Visualizer (Generator or Shader)
  const genLayer = layers.find(l => l.content.kind === 'GENERATOR' || l.content.kind === 'SHADER')?.content as any;
  if (genLayer) {
    return (
      <div className={`${className} relative overflow-hidden bg-gradient-to-br from-[#0c001f] via-[#041124] to-[#12002b] flex items-center justify-center p-2`}>
        <AmboVisualizerThumb item={{ id: `sl-${slide.id}`, name: slide.label || 'Visualizer', kind: genLayer.kind, mode: genLayer.mode || genLayer.src }} />
        <div className="absolute top-1 left-1.5 px-1.5 py-0.5 rounded bg-black/60 border border-cyan-500/30 text-[8px] font-mono font-bold text-[#00DAF3] flex items-center gap-1">
          <Sparkles size={8} />
          <span>{genLayer.mode || 'FX'}</span>
        </div>
      </div>
    );
  }

  // 8. Live Input Feed
  const liveLayer = layers.find(l => l.content.kind === 'LIVE')?.content as any;
  if (liveLayer) {
    return (
      <div className={`${className} relative overflow-hidden bg-black flex flex-col items-center justify-center p-2 border border-blue-500/20`}>
        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-300 mb-1.5">
          <Radio size={14} className="animate-pulse" />
        </div>
        <span className="text-[9px] font-mono font-bold text-blue-300 uppercase tracking-wider">{liveLayer.inputId || 'Live Feed'}</span>
      </div>
    );
  }

  // 9. Text & Lyric Blocks
  const textLayer = layers.find(l => l.content.kind === 'TEXT' || l.content.kind === 'LYRICS')?.content as any;
  if (textLayer) {
    const rawBlocks = textLayer.blocks || (textLayer.lines ? textLayer.lines.map((l: string) => ({ text: l })) : []);
    const previewText = rawBlocks.map((b: any) => b.text).filter(Boolean).join(' / ');
    return (
      <div className={`${className} relative overflow-hidden bg-gradient-to-br from-[#120924] via-[#090514] to-[#1c0f33] p-2.5 flex flex-col justify-center items-center text-center`}>
        <div
          className="text-white font-bold text-[11px] line-clamp-4 leading-snug px-1"
          style={{ fontFamily: 'Outfit, Inter, sans-serif', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}
        >
          {previewText || slide.label || 'Text Slide'}
        </div>
      </div>
    );
  }

  // 10. Default / Empty Slide Representation
  return (
    <div className={`${className} relative overflow-hidden bg-gradient-to-br from-[#130b20] to-[#07030d] flex flex-col items-center justify-center p-2 text-center`}>
      <span className="w-8 h-5 rounded-[3px] border border-dashed border-white/20 mb-1" />
      <span className="text-[9.5px] font-bold text-white/50 uppercase tracking-wider font-mono">{slide.label || 'Slide'}</span>
    </div>
  );
};

export default AmboSlideStill;

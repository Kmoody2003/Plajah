// AmboShowStill — the square picture for a Show card: the show's FIRST slide, rendered.
//   Tela template / scripture look -> the same canvas renderers the outputs use (square frame)
//   background image / video / generator -> that picture, with the slide's text over it
//   text-only slide -> the slide's words on a dark card
import React from 'react';
import type { Show, Slide } from '../../services/ambo/showModel';
import { SlideThumb, ScriptureThumb } from './AmboTemplateThumbs';
import { AmboPoster } from './AmboPoster';
import { AmboVisualizerThumb } from './AmboVisualizerThumb';

const firstTexts = (sl: Slide): string[] =>
  sl.layers.flatMap(l => (l.content.kind === 'TEXT' ? l.content.blocks.map(b => b.text) : [])).filter(Boolean);

export const AmboShowStill: React.FC<{ show: Show }> = ({ show }) => {
  const sl = show.slides?.[0];
  if (!sl) return <AmboPoster label={show.title} gradient="linear-gradient(135deg,#1c1530,#0b0813)" />;
  const layers = sl.layers.filter(l => l.enabled !== false);
  const tela = layers.find(l => l.content.kind === 'TELA_TEMPLATE')?.content;
  if (tela && tela.kind === 'TELA_TEMPLATE') {
    return <SlideThumb templateId={tela.templateId} theme={tela.theme} fields={tela.fields} square className="absolute inset-0 w-full h-full" />;
  }
  const scr = layers.find(l => l.content.kind === 'SCRIPTURE')?.content;
  if (scr && scr.kind === 'SCRIPTURE') {
    const text = (scr.lines || []).join(' ') || scr.reference || show.title;
    return <ScriptureThumb layoutId={scr.layoutId || 'sanctuary'} accent={scr.accent} sample={{ text, reference: scr.reference || show.title, translation: scr.translation }} square className="absolute inset-0 w-full h-full" />;
  }
  const bg = layers.map(l => l.content).find(c => c.kind === 'IMAGE' || c.kind === 'VIDEO' || c.kind === 'GENERATOR');
  const texts = firstTexts(sl);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {bg?.kind === 'IMAGE' && <AmboPoster label={show.title} cover={bg.src} />}
      {bg?.kind === 'VIDEO' && <AmboPoster label={show.title} videoSrc={bg.src} kind="video" />}
      {bg?.kind === 'GENERATOR' && <AmboVisualizerThumb item={{ id: `show-${show.id}`, name: show.title, kind: 'GENERATOR', mode: bg.mode }} />}
      {!bg && (texts.length
        ? <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1c1530,#0b0813)' }} />
        : <AmboPoster label={show.title} gradient="linear-gradient(135deg,#1c1530,#0b0813)" />)}
      {texts.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '10%', background: bg ? 'rgba(0,0,0,.35)' : undefined }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.25, textAlign: 'center', textShadow: '0 1px 6px rgba(0,0,0,.7)', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {texts.join(' / ')}
          </div>
        </div>
      )}
    </div>
  );
};

export default AmboShowStill;

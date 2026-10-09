// EmoteGlyph — one emote, anywhere in the UI (chat inline, picker grid, tray, banners).
// Vector + uploaded emotes are a plain <img>. Kaiju emotes are a small canvas that plays the baked
// strip while `animate` is on (hover / focused / jumbo) and holds the poster frame otherwise.

import React, { useEffect, useRef, useState } from 'react';
import type { EmoteDef } from '../../services/emotes/emoteTypes';
import { emoteSrc, frameAt, getEmoteAsset, onEmoteAssetsChanged } from '../../services/emotes/emoteAssets';

// One shared ticker for every playing kaiju glyph on screen (a chat full of them = one rAF).
const players = new Set<(t: number) => void>();
let raf = 0;
const tick = (now: number) => { players.forEach(f => f(now / 1000)); raf = players.size ? requestAnimationFrame(tick) : 0; };
const play = (f: (t: number) => void) => { players.add(f); if (!raf) raf = requestAnimationFrame(tick); return () => { players.delete(f); }; };

export interface EmoteGlyphProps {
  def: EmoteDef;
  size?: number;
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const EmoteGlyph: React.FC<EmoteGlyphProps> = ({ def, size = 28, animate = false, className, style, title }) => {
  const [, bump] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const isKaiju = def.art.kind === 'kaiju';
  // vector emotes with an animation (neon flicker, gold sheen, riso boil, spotlight) play when big
  const plays = isKaiju || (def.art.kind === 'svg' && !!def.anim);
  const [ready, setReady] = useState(false);   // frames baked → swap the still for the player

  useEffect(() => {
    if (!isKaiju) return;
    let alive = true;
    const off = onEmoteAssetsChanged(() => alive && bump(x => x + 1));
    void getEmoteAsset(def, size);
    return () => { alive = false; off(); };
  }, [def, size, isKaiju]);

  useEffect(() => {
    if (!plays || !animate) return;
    let stop: (() => void) | null = null, alive = true;
    getEmoteAsset(def, size).then(a => {
      if (!a || !alive) return;
      setReady(true);
      stop = play(t => {
        const c = cv.current; if (!c) return;
        const g = c.getContext('2d')!;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(frameAt(a, t), 0, 0, c.width, c.height);
      });
    });
    return () => { alive = false; stop?.(); setReady(false); };
  }, [def, size, animate, plays]);

  const label = title ?? `:${def.code}:`;
  const common: React.CSSProperties = { width: size, height: size, display: 'inline-block', verticalAlign: 'middle', flex: 'none', ...style };
  if (plays && animate && (ready || !emoteSrc(def))) {
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    return <canvas ref={cv} width={Math.round(size * dpr)} height={Math.round(size * dpr)} className={className} style={common} role="img" aria-label={def.name} title={label} />;
  }
  const src = emoteSrc(def);
  if (!src) return <span className={className} style={{ ...common, borderRadius: '30%', background: `radial-gradient(circle, ${def.gel}55, transparent 70%)` }} role="img" aria-label={def.name} title={label} />;
  return <img src={src} width={size} height={size} alt={label} title={label} draggable={false} className={className} style={common} loading="lazy" decoding="async" />;
};

export default EmoteGlyph;

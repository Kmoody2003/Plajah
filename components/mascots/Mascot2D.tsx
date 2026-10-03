import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createMascot2D, type Mascot2D as Mascot2DApi, type Who2D, type Mood2D, type Reaction2D } from './mascot2dRuntime';

/**
 * Mascot2D — the interactive 2D (SVG) Chora / Reello. Same props as <PlajahMascot> (3D) so surfaces can
 * pick 2D for phones/TV/low-power or dense layouts and 3D for hero moments.
 *
 *   <Mascot2D who="reello" mood="listen" energy={0.4} prop="camera" ref={coach} onPoke={p => ...} />
 *   coach.current?.react('cheer')
 *
 * Eyes/head follow the pointer; tapping the head gives a grumpy boop, tapping the belly a giggle.
 */
export type { Who2D, Mood2D, Reaction2D };
export interface Mascot2DHandle { react: (r: Reaction2D) => void; lookAt: (clientX: number, clientY: number) => void }

interface Props {
  who: Who2D;
  mood?: Mood2D;
  energy?: number;
  prop?: 'book' | 'camera' | null;
  followPointer?: boolean;
  onPoke?: (part: 'head' | 'belly') => void;
  size?: number | string;
  className?: string;
}

export const Mascot2D = forwardRef<Mascot2DHandle, Props>(function Mascot2D(
  { who, mood = 'idle', energy = 0, prop = null, followPointer = true, onPoke, size = 200, className }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Mascot2DApi | null>(null);
  const pokeRef = useRef(onPoke); pokeRef.current = onPoke;

  useEffect(() => {
    if (!host.current) return;
    const m = createMascot2D(host.current, { who, mood, energy, prop, followPointer, onPoke: p => pokeRef.current?.(p) });
    api.current = m;
    return () => { m.destroy(); api.current = null; };
    // the puppet is rebuilt only when the character or pointer-follow changes; other props stream in below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, followPointer]);
  useEffect(() => { api.current?.setMood(mood); }, [mood]);
  useEffect(() => { api.current?.setEnergy(energy); }, [energy]);
  useEffect(() => { api.current?.setProp(prop); }, [prop]);
  useImperativeHandle(ref, () => ({
    react: r => api.current?.react(r),
    lookAt: (x, y) => api.current?.lookAt(x, y),
  }), []);

  return <div ref={host} className={className} style={{ width: size, aspectRatio: '480 / 510' }} />;
});

export default Mascot2D;

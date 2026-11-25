/**
 * React hook driving DOM micro-animations directly from Plajah's native Living runtime
 * (services/living/runtime/anim.ts -> compileAnim + seedForObject).
 *
 * Uses compositor-only WAAPI (transform/opacity/filter) and automatically respects
 * reduced-motion twins compiled by compileAnim().
 */

import { useEffect, useRef } from 'react';
import { compileAnim, seedForObject } from '../../services/living/runtime/anim';
import type { AnimSpec } from '../../services/living/contracts';

export function useLivingAnim<T extends HTMLElement = HTMLDivElement>(
  objectId: string,
  spec: AnimSpec | null,
  reducedMotion: boolean,
  triggerKey: number | string = 0,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !spec || typeof el.animate !== 'function') return;

    const compiled = compileAnim(spec, {
      box: { x: 0, y: 0, w: el.offsetWidth || 64, h: el.offsetHeight || 64 },
      pageW: 1280,
      pageH: 720,
      reduced: reducedMotion,
      seed: seedForObject(objectId),
    });

    if (compiled.skipped || !compiled.durationMs) return;

    const activeAnims: Animation[] = [];
    for (const [prop, frames] of Object.entries(compiled.channels)) {
      if (!frames?.length) continue;
      const keyframes: Keyframe[] = frames.map(f => ({
        offset: f.offset,
        [prop]: f.value,
        ...(f.easing ? { easing: f.easing } : {}),
      }));
      try {
        const anim = el.animate(keyframes, {
          duration: compiled.durationMs,
          delay: compiled.delayMs,
          iterations: compiled.iterations,
          direction: compiled.direction,
          easing: compiled.easing,
          fill: compiled.ambient ? 'none' : 'forwards',
        });
        activeAnims.push(anim);
      } catch {
        /* WAAPI unavailable in non-browser environment */
      }
    }

    return () => {
      activeAnims.forEach(a => a.cancel());
    };
  }, [objectId, spec?.preset, spec?.amount, spec?.durationMs, spec?.loop, reducedMotion, triggerKey]);

  return ref;
}

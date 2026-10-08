// KaijuLetterPeek — Chora & Reello (v2 3D kaiju) peeking out from BEHIND the letters of a page title.
//
// Drop it as a sibling of the title <h1>, inside a `position: relative` box where the h1 sits above it
// (PageHeader's `behind` prop and ChoraNextMasthead's `behindTitle` do exactly that):
//
//   <PageHeader behind={<KaijuLetterPeek />}>Plajah Chora</PageHeader>
//
// This file is tiny on purpose: three.js + the scene live in ./KaijuLetterPeekScene, loaded with React.lazy so the
// page's main chunk never pulls it in. Any failure (no WebGL, model 404, decode error…) renders nothing — a title
// must never break over a mascot. Reads the music signal from <KaijuGlobalSignal> when present.

import React, { lazy, Suspense } from 'react';
import type { KaijuLetterPeekSceneProps } from './KaijuLetterPeekScene';

const Scene = lazy(() => import('./KaijuLetterPeekScene'));

class Quiet extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { if (import.meta.env?.DEV) console.warn('[KaijuLetterPeek] disabled:', err); }
  render() { return this.state.failed ? null : this.props.children; }
}

let glOk: boolean | null = null;
function webglOk(): boolean {
  if (glOk !== null) return glOk;
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas'); const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    glOk = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext();   // probe only; hand the context straight back
  } catch { glOk = false; }
  return glOk;
}

export interface KaijuLetterPeekProps extends Partial<KaijuLetterPeekSceneProps> {
  /** Render nothing (e.g. TV UI). */
  disabled?: boolean;
}

export default function KaijuLetterPeek({ disabled, word = 'Chora', letters = { chora: 0, reello: 3 }, headScale }: KaijuLetterPeekProps) {
  const [ok] = React.useState(() => !disabled && webglOk());
  if (disabled || !ok) return null;
  return (
    <Quiet>
      <Suspense fallback={null}>
        <Scene word={word} letters={letters} headScale={headScale} />
      </Suspense>
    </Quiet>
  );
}

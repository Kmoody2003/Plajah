// ForestBackdrop — a photographic cyclorama behind the specimens.
//
// This is the oldest trick in natural-history display: the specimens are real
// and in front, and behind them a painted (here, photographed) backdrop supplies
// the depth the room can't. Every hall in the Smithsonian does it.
//
// It also solves a practical problem. An ORDINARY photo is not equirectangular,
// so it cannot be wrapped onto the sky without smearing — but it is exactly the
// right shape for a flat panel standing at the treeline. Three photos at 120°
// each close a full circle around the hall.
//
// The panels stand well beyond the specimens, take scene fog so they recede into
// the same haze as the far trees, and fade to transparent at their base so there
// is no visible bottom edge where photo meets grass.
//
// A panel accepts a PHOTO or a LOOPING VIDEO. Video is the stronger choice where
// you have it: motion at the horizon — leaves stirring, light shifting — reads as
// depth in a way no still can.

import { useMemo, useLayoutEffect, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
export const isVideoBackdrop = (url: string) => VIDEO_RE.test(url);

export interface ForestBackdropProps {
  /** Photos OR videos in public/backdrops/, arranged clockwise around the hall. */
  images: string[];
  radius?: number;
  height?: number;
  /** Lift the panel so the treeline sits above the horizon. */
  yOffset?: number;
  /** Brightness trim, to match the backdrop to the live lighting. */
  intensity?: number;
}

/**
 * A looping video panel. A moving backdrop — leaves stirring, light shifting —
 * does more for the illusion of a living forest than any still can, because the
 * eye reads motion at the horizon as depth.
 *
 * Muted + playsInline + loop is what browsers require to autoplay at all; a
 * rejected play() is retried on the first interaction, since a frozen first
 * frame still reads as a photograph and nothing looks broken.
 */
function useVideoTexture(url: string, active: boolean): THREE.VideoTexture | null {
  const [tex, setTex] = useState<THREE.VideoTexture | null>(null);
  const elRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const v = document.createElement('video');
    v.src = url;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    elRef.current = v;

    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    setTex(t);

    const tryPlay = () => { v.play().catch(() => { /* retried on gesture */ }); };
    tryPlay();
    const onGesture = () => { tryPlay(); };
    window.addEventListener('pointerdown', onGesture, { once: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', onGesture);
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* */ }
      t.dispose();
      elRef.current = null;
      setTex(null);
    };
  }, [url]);

  // Don't spend decode budget on a backdrop nobody is looking at.
  useEffect(() => {
    const v = elRef.current;
    if (!v) return;
    if (active) v.play().catch(() => {});
    else v.pause();
  }, [active]);

  return tex;
}

/** One curved panel carrying one photograph. */
function Panel({
  url, index, count, radius, height, yOffset, intensity,
}: { url: string; index: number; count: number; radius: number; height: number; yOffset: number; intensity: number }) {
  // One panel type, two sources: a still photograph or a looping video.
  const isVid = isVideoBackdrop(url);
  const vidTex = useVideoTexture(isVid ? url : '', isVid);
  const imgTex = useTexture(isVid ? TRANSPARENT_PX : url);
  const tex = isVid ? vidTex : imgTex;
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useLayoutEffect(() => {
    if (!tex || isVid) return;                      // video texture configures itself
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex, isVid]);

  // A cylinder SEGMENT: curved so the photo wraps with the horizon instead of
  // reading as a flat billboard, open-ended, and drawn from the inside.
  const geom = useMemo(() => {
    const arc = (Math.PI * 2) / count;
    const g = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true, index * arc, arc);
    // Fade the bottom out so the panel dissolves into the fog rather than
    // ending in a hard line across the grass.
    const pos = g.attributes.position;
    const alpha = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + height / 2) / height;          // 0 bottom → 1 top
      alpha[i] = Math.min(1, Math.max(0, (t - 0.06) / 0.3));
    }
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    return g;
  }, [index, count, radius, height]);

  useLayoutEffect(() => () => { geom.dispose(); }, [geom]);

  // Vertex-alpha fade grafted onto a basic material — the backdrop is a
  // photograph and must not be re-lit, only faded and fogged.
  const onBeforeCompile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vAlpha;');
  }, []);

  return (
    <mesh geometry={geom} position={[0, height / 2 + yOffset, 0]} renderOrder={-1}>
      <meshBasicMaterial
        ref={matRef}
        map={tex ?? undefined}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        fog={false}
        color={new THREE.Color(intensity, intensity, intensity)}
        onBeforeCompile={onBeforeCompile}
      />
    </mesh>
  );
}

export default function ForestBackdrop({
  images, radius = 78, height = 62, yOffset = -6, intensity = 1,
}: ForestBackdropProps) {
  if (!images.length) return null;
  return (
    <group>
      {images.map((url, i) => (
        <Panel
          key={url + i}
          url={url}
          index={i}
          count={images.length}
          radius={radius}
          height={height}
          yOffset={yOffset}
          intensity={intensity}
        />
      ))}
    </group>
  );
}

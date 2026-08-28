// ForestBackdrop — a photographic cyclorama behind the specimens.
//
// This is the oldest trick in natural-history display: the specimens are real
// and in front, and behind them a painted (here, photographed) backdrop supplies
// the depth the room can't. Every hall in the Smithsonian does it.
//
// It also solves a practical problem. An ORDINARY photo is not equirectangular,
// so it cannot be wrapped onto the sky without smearing — but it is exactly the
// right shape for a curved panel standing at the treeline.
//
// A panel accepts a PHOTO or a LOOPING VIDEO. Video is the stronger choice where
// you have it: motion at the horizon — leaves stirring, light shifting — reads as
// depth in a way no still can.
//
// ── Two things this has to get right ────────────────────────────────────────
//
// ASPECT. Sources are whatever the camera produced — a square photo, a 2.37:1
// ultrawide, a 16:9 clip. Giving them all identical panels stretches everything
// that isn't the one aspect the panel was cut for, and it shows immediately on
// tree trunks. So each panel's ARC is proportional to its source's aspect ratio
// and the panel height is derived from the radius. Every source then lands at
// its native proportions and the panels still close a full circle.
//
// DECODES. Panels repeat the source list to close the circle, so six panels may
// show three clips. A video texture is therefore created once per UNIQUE URL and
// shared, which keeps six panels costing three decodes instead of six — the
// difference between running and not running on a TV.

import { useMemo, useLayoutEffect, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
export const isVideoBackdrop = (url: string) => VIDEO_RE.test(url);

export interface ForestBackdropProps {
  /** Photos OR videos in public/backdrops/, arranged clockwise around the hall. */
  images: string[];
  /**
   * Width-over-height of each source, parallel to `images`. Supplying these is
   * what stops mixed-aspect sources from stretching; without them the circle is
   * divided equally and `height` is used as given.
   */
  aspects?: number[];
  radius?: number;
  height?: number;
  /** Lift the panel so the treeline sits above the horizon. */
  yOffset?: number;
  /** Brightness trim, to match the backdrop to the live lighting. */
  intensity?: number;
}

/**
 * One looping video texture per unique URL.
 *
 * Managed in a single effect rather than a hook per panel, so the hook count
 * never depends on how many panels a set happens to have — and so two panels
 * showing the same clip share one decode instead of racing two.
 *
 * Muted + playsInline + loop is what browsers require to autoplay at all; a
 * rejected play() is retried on the first interaction, since a frozen first
 * frame still reads as a photograph and nothing looks broken.
 */
function useVideoTextures(urls: string[]): Map<string, THREE.VideoTexture> {
  const [textures, setTextures] = useState<Map<string, THREE.VideoTexture>>(new Map());
  const key = urls.join('|');

  useEffect(() => {
    if (typeof document === 'undefined' || urls.length === 0) {
      setTextures(new Map());
      return undefined;
    }
    const made = new Map<string, THREE.VideoTexture>();
    const els: HTMLVideoElement[] = [];

    for (const url of urls) {
      const v = document.createElement('video');
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      els.push(v);
      const t = new THREE.VideoTexture(v);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      made.set(url, t);
      v.play().catch(() => { /* retried on the gesture below */ });
    }
    setTextures(made);

    const onGesture = () => { els.forEach((v) => { v.play().catch(() => {}); }); };
    window.addEventListener('pointerdown', onGesture, { once: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', onGesture);
      els.forEach((v) => {
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* */ }
      });
      made.forEach((t) => t.dispose());
      setTextures(new Map());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return textures;
}

/** One curved panel carrying one photograph or one shared video texture. */
function Panel({
  url, startAngle, arc, radius, height, yOffset, intensity, videoTex,
}: {
  url: string; startAngle: number; arc: number; radius: number; height: number;
  yOffset: number; intensity: number; videoTex: THREE.VideoTexture | null;
}) {
  const isVid = isVideoBackdrop(url);
  // Still panels load their own image; video panels take the shared texture.
  const imgTex = useTexture(isVid ? TRANSPARENT_PX : url);
  const tex = isVid ? videoTex : imgTex;

  useLayoutEffect(() => {
    if (!tex || isVid) return;                      // video texture configures itself
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex, isVid]);

  // A cylinder SEGMENT: curved so the image wraps with the horizon instead of
  // reading as a flat billboard, open-ended, and drawn from the inside.
  const geom = useMemo(() => {
    const g = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true, startAngle, arc);
    // Fade the bottom out so the panel dissolves into the scene rather than
    // ending in a hard line across the ground.
    const pos = g.attributes.position;
    const alpha = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + height / 2) / height;          // 0 bottom → 1 top
      alpha[i] = Math.min(1, Math.max(0, (t - 0.06) / 0.3));
    }
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    return g;
  }, [startAngle, arc, radius, height]);

  useLayoutEffect(() => () => { geom.dispose(); }, [geom]);

  // Vertex-alpha fade grafted onto a basic material — the backdrop is a
  // photograph and must not be re-lit, only faded.
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
      {/* fog={false}: a photograph must not be re-fogged. It already carries the
          aerial perspective of the day it was taken, and layering ours on top
          replaces a fifth of every pixel with flat pale blue — which is what was
          draining the colour out of the backdrops. Depth separation comes from
          the depth-of-field pass instead, which dims nothing. */}
      <meshBasicMaterial
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
  images, aspects, radius = 78, height = 62, yOffset = -6, intensity = 1,
}: ForestBackdropProps) {
  // One texture per unique clip, however many panels end up showing it.
  const videoUrls = useMemo(
    () => Array.from(new Set(images.filter(isVideoBackdrop))),
    [images],
  );
  const videoTextures = useVideoTextures(videoUrls);

  // Lay the panels out around the circle. With aspects supplied, each panel's
  // arc is proportional to its source's shape and the height falls out of the
  // radius — so panelWidth / panelHeight equals the source aspect exactly, and
  // nothing stretches however mixed the sources are.
  const { panels, panelHeight } = useMemo(() => {
    const n = images.length;
    if (n === 0) return { panels: [] as { url: string; startAngle: number; arc: number }[], panelHeight: height };

    const usable = aspects && aspects.length === n && aspects.every((a) => a > 0)
      ? aspects
      : null;

    if (!usable) {
      const arc = (Math.PI * 2) / n;
      return {
        panels: images.map((url, i) => ({ url, startAngle: i * arc, arc })),
        panelHeight: height,
      };
    }

    // We want panelWidth_i = radius * arc_i to equal h * aspect_i, with the arcs
    // summing to 2π. Solving both at once gives h directly:
    const total = usable.reduce((a, b) => a + b, 0);
    const h = (Math.PI * 2 * radius) / total;
    let angle = 0;
    const out = images.map((url, i) => {
      const arc = (usable[i] / total) * Math.PI * 2;
      const p = { url, startAngle: angle, arc };
      angle += arc;
      return p;
    });
    return { panels: out, panelHeight: h };
  }, [images, aspects, radius, height]);

  if (!images.length) return null;

  return (
    <group>
      {panels.map((p, i) => (
        <Panel
          key={p.url + i}
          url={p.url}
          startAngle={p.startAngle}
          arc={p.arc}
          radius={radius}
          height={panelHeight}
          yOffset={yOffset}
          intensity={intensity}
          videoTex={videoTextures.get(p.url) ?? null}
        />
      ))}
    </group>
  );
}

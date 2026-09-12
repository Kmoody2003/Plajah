import React from 'react';
import { adjustmentToCssFilter, type PhotoEditAdjustments } from '../services/photoEditingService';

/** Always-visible nondestructive preview. A remote image that WebGL cannot
 * sample must never become an opaque black canvas over a valid photo. */
export default function PhotoDevelopPreview({ src, alt, adjustments, compare }: { src: string; alt: string; adjustments: PhotoEditAdjustments; compare: boolean }) {
  const a = compare ? null : adjustments;
  const warmth = a?.warmth || 0, tint = a?.tint || 0;
  const warmColor = warmth >= 0 ? `rgba(255,132,45,${Math.abs(warmth)/520})` : `rgba(55,140,255,${Math.abs(warmth)/520})`;
  const tintColor = tint >= 0 ? `rgba(220,55,175,${Math.abs(tint)/620})` : `rgba(45,210,125,${Math.abs(tint)/620})`;
  const vignette = Math.max(0,a?.vignette||0)/100, grain = Math.max(0,a?.grain||0)/100;
  return <div className="relative max-w-full max-h-full overflow-hidden rounded-2xl" style={{transform:`rotate(${a?.rotation||0}deg)`,boxShadow:'0 24px 80px rgba(0,0,0,.6)',background:'#17191d'}}>
    {src?<img src={src} alt={alt} className="block max-w-full max-h-[calc(100vh-180px)] object-contain" style={{filter:a?adjustmentToCssFilter(a):'none'}}/>:<div className="w-[min(70vw,900px)] h-[55vh] grid place-items-center text-sm text-white/35">This photo has no preview source.</div>}
    {a&&<><div className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{background:warmColor}}/><div className="pointer-events-none absolute inset-0 mix-blend-color" style={{background:tintColor}}/>{vignette>0&&<div className="pointer-events-none absolute inset-0" style={{background:`radial-gradient(ellipse at center,transparent ${Math.max(20,72-vignette*32)}%,rgba(0,0,0,${Math.min(.82,vignette*.75)}) 100%)`}}/>}{grain>0&&<div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{opacity:grain*.42,backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=%270 0 180 180%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.85%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%27.7%27/%3E%3C/svg%3E")'}}/>}</>}
  </div>;
}

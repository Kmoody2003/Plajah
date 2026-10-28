// FlyerView — a Tela flyer read-only but alive: the living page runs (entrances, hover glows, tap
// bursts) and the call-to-action opens its link. Multi-page documents show a small page switcher.
import React, { useEffect, useMemo, useState } from 'react';
import type { TelaDoc } from '../../types';
import TelaLivePage from '../living/TelaLivePage';
import { frameObjects, frameSize, livingPageFor } from '../../services/living/runtime/objects';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';
import type { LivingPage } from '../../services/living/contracts';

const EMPTY = (page: number): LivingPage => ({ page, behaviors: [] });

function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return null;
  try { const url = new URL(u.trim(), window.location.href); return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : null; } catch { return null; }
}

const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export default function FlyerView({ doc, ctaUrl, maxWidth = 560, label, className }: { doc: TelaDoc; ctaUrl?: string; maxWidth?: number; label?: string; className?: string }) {
  const [page, setPage] = useState(0);
  const frame = doc.frames[Math.min(page, doc.frames.length - 1)];
  const objects = useMemo(() => (frame ? frameObjects(doc, frame) : []), [doc, frame]);
  const size = useMemo(() => (frame ? frameSize(doc, frame) : { width: 1080, height: 1350 }), [doc, frame]);
  const living = useMemo(() => livingPageFor(doc.living, page + 1) || EMPTY(page + 1), [doc.living, page]);
  const [reduced] = useState(prefersReduced);
  useEffect(() => { ensureFontsForObjects(objects); }, [objects]);
  if (!frame) return null;
  const onEmit = (name: string, payload?: unknown) => {
    if (name !== 'flyer:cta') return;
    const url = safeUrl((payload as { url?: string } | undefined)?.url) || safeUrl(ctaUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className={className} style={{ maxWidth, width: '100%' }}>
      <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 0 rgba(255,255,255,.06), 0 14px 40px rgba(0,0,0,.35)' }}>
        <TelaLivePage objects={objects} width={size.width} height={size.height} living={living} audio={null} soundEnabled={false} reducedMotion={reduced} pageAudio={false} hints={false} label={label || doc.title} onEmit={onEmit} />
      </div>
      {doc.frames.length > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          {doc.frames.map((f, i) => (
            <button key={f.id} type="button" onClick={() => setPage(i)} aria-label={`Page ${i + 1}`} aria-current={i === page}
              style={{ width: 8, height: 8, borderRadius: 99, border: 0, padding: 0, background: i === page ? 'currentColor' : 'rgba(255,255,255,.25)', cursor: 'pointer' }} />
          ))}
        </div>
      )}
    </div>
  );
}

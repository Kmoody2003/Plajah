/**
 * EraDesignGrid — the "Design eras" collection: one invitation per Tela design-history era, drawn in code (no image
 * credits). Thumbnails are rasterised in the browser on demand (services/evite/eraArt.ts), only when scrolled into view.
 * Used by the studio's design picker and the Events home collection tiles.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { EraEvite } from '../../services/evite/eraArt';

type EraModule = typeof import('../../services/evite/eraArt');
let mod: Promise<EraModule> | null = null;
export const loadEraModule = () => (mod ||= import('../../services/evite/eraArt'));

/** One lazily drawn era thumbnail (2:3). */
export function EraThumb({ id, alt, className, width = 240 }: { id: string; alt: string; className?: string; width?: number }) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let live = true;
    const go = () => loadEraModule().then(m => m.eraThumb(id, width)).then(u => { if (live) setSrc(u); }).catch(() => {});
    if (typeof IntersectionObserver === 'undefined') { go(); return () => { live = false; }; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [id, width]);
  return <img ref={ref} src={src || undefined} alt={alt} width={width} height={Math.round(width * 1.5)} className={className} style={{ background: 'linear-gradient(160deg,#1b1626,#0b0713)' }} />;
}

export default function EraDesignGrid({ value, onPick, columns = 'grid-cols-3 sm:grid-cols-4' }: { value?: string | null; onPick(id: string): void; columns?: string }) {
  const [list, setList] = useState<EraEvite[] | null>(null);
  useEffect(() => { let live = true; loadEraModule().then(m => { if (live) setList(m.ERA_EVITES); }).catch(() => setList([])); return () => { live = false; }; }, []);
  if (!list) return <div className={`grid ${columns} gap-2.5`}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />)}</div>;
  return (
    <div>
      <p className="text-xs text-white/60 mb-3">{list.length} design movements, each drawn from its own rules: palette, type and ornament.</p>
      <div className={`grid ${columns} gap-2.5`}>
        {list.map(e => { const on = e.id === value; return (
          <button key={e.id} onClick={() => onPick(e.id)} aria-pressed={on} title={`${e.label} · ${e.period}`}
            className={`relative rounded-2xl overflow-hidden border-2 text-left ${on ? 'border-orange-400' : 'border-transparent'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300`}>
            <EraThumb id={e.id} alt={e.label} className="w-full h-auto block aspect-[2/3] object-cover" />
            <span className="absolute left-1.5 bottom-1.5 right-1.5 text-[10px] font-bold bg-black/60 rounded-full px-2 py-0.5 truncate">{e.label}</span>
          </button>
        ); })}
      </div>
    </div>
  );
}

/** The lesson + structural law for the picked era (studio side panel). */
export function EraLesson({ id }: { id: string }) {
  const [e, setE] = useState<EraEvite | null>(null);
  useEffect(() => { let live = true; loadEraModule().then(m => { if (live) setE(m.eraEvite(id)); }).catch(() => {}); return () => { live = false; }; }, [id]);
  if (!e) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm grid gap-1">
      <b>{e.label} <span className="text-white/50 font-normal">· {e.period}</span></b>
      <span className="text-white/75">{e.lesson}</span>
      <span className="text-xs text-white/55">Design law: {e.cantusFirmus.label}. {e.cantusFirmus.governs}</span>
    </div>
  );
}

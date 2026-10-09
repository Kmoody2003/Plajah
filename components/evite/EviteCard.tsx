/**
 * EviteCard — the living invitation: EviteStage (plate + depth + motion) with the live text laid over it.
 * One component for the guest page, the host studio's live preview and the Events home, so what a host
 * designs is exactly what a guest opens.
 */
import React, { forwardRef, useEffect, useState } from 'react';
import EviteStage, { type EviteStageHandle } from './EviteStage';
import { plateUrls, plateVoice, isLightPlate } from '../../services/evite/plateCatalog';
import { recipeFor } from '../../services/evite/motionRecipes';
import { eraIdOf } from '../../services/evite/eraIds';
import type { EraArt } from '../../services/evite/eraArt';
import type { EviteFields } from '../../services/evite/eviteTypes';

/**
 * Design eras ("era/<eraId>") have no raster on the bucket: the plate and depth map are drawn in the browser from the
 * era's Tela designer (services/evite/eraArt.ts, loaded on demand and cached). undefined = not an era design;
 * null = still drawing.
 */
function useEraArt(plateId: string, showLaw: boolean | undefined, skip: boolean): EraArt | null | undefined {
  const eraId = skip ? null : eraIdOf(plateId);
  const key = `${eraId}|${showLaw ? 1 : 0}`;
  const [got, setGot] = useState<{ key: string; art: EraArt } | null>(null);
  useEffect(() => {
    if (!eraId) return;
    let live = true;
    import('../../services/evite/eraArt').then(m => m.eraArt(eraId, { showLaw })).then(a => { if (live) setGot({ key, art: a }); }).catch(e => console.warn('[EviteCard] era art', e));
    return () => { live = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!eraId) return undefined;
  return got && got.key.startsWith(`${eraId}|`) ? got.art : null;
}

/** Letterpress pull for relief-print eras (design-history council): the sheet lifts from the gripper edge in 280 ms, then the ink blooms for 120 ms. */
function LetterpressPull({ paper, ink }: { paper: string; ink: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: paper, animation: 'eviteLpWipe 280ms cubic-bezier(.3,.6,.2,1) both' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: 'linear-gradient(to bottom,rgba(0,0,0,.28),transparent)', animation: 'eviteLpEdge 280ms cubic-bezier(.3,.6,.2,1) both' }} />
      <div style={{ position: 'absolute', inset: 0, background: ink, mixBlendMode: 'multiply', opacity: 0, animation: 'eviteLpInk 120ms ease-out 280ms both' }} />
      <style>{'@keyframes eviteLpWipe{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(100% 0 0 0)}}@keyframes eviteLpEdge{from{top:0;opacity:1}to{top:100%;opacity:0}}@keyframes eviteLpInk{0%{opacity:0}45%{opacity:.2}100%{opacity:0}}'}</style>
    </div>
  );
}
const darkHex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return false; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 140; };

export function whenLines(f: Pick<EviteFields, 'startsAt' | 'endsAt' | 'timezone'>) {
  const tz = f.timezone || undefined;
  const d = new Date(f.startsAt);
  const safe = (o: Intl.DateTimeFormatOptions) => { try { return d.toLocaleString(undefined, { ...o, timeZone: tz }); } catch { return d.toLocaleString(undefined, o); } };
  const end = f.endsAt ? (() => { try { return new Date(f.endsAt!).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return ''; } })() : '';
  return { date: safe({ weekday: 'long', month: 'long', day: 'numeric' }), time: safe({ hour: 'numeric', minute: '2-digit' }) + (end ? ` – ${end}` : ''), year: safe({ year: 'numeric' }) };
}

export interface EviteCardProps {
  plateId: string;
  fields: Pick<EviteFields, 'headline' | 'subline' | 'startsAt' | 'endsAt' | 'timezone' | 'venueName'>;
  accent?: string;
  ctaLabel?: string;
  onCta?: () => void;
  reducedMotion?: boolean;
  style?: React.CSSProperties;
  /** smaller type for thumbnails in galleries */
  compact?: boolean;
  /** creator-theme art (design ids outside the catalogue): plate/depth URLs + which collection's motion and type to borrow */
  art?: { plate: string; depth?: string; preset: string; foil?: string; voice?: string; light?: boolean } | null;
  /** laid over the card inside the stage (the kids play gate); while `hideText` the words stay hidden underneath */
  overlay?: React.ReactNode;
  hideText?: boolean;
  /** Design eras: draw the era's structural law (ghost grid, ruled diagonal, dot grid…) faintly over the art */
  showLaw?: boolean;
}

export const cardAccent = (plateId: string, accent?: string) => { const u = plateUrls(plateId); return accent || (u ? recipeFor(u.collection, u.subject).foil.color : '#FF8C00'); };

const EviteCard = forwardRef<EviteStageHandle, EviteCardProps>(function EviteCard({ plateId, fields, accent, ctaLabel, onCta, reducedMotion, style, compact, art, overlay, hideText, showLaw }, ref) {
  const cat = plateUrls(plateId);
  const era = useEraArt(plateId, showLaw, !!cat || !!art);
  const urls = cat || (art ? { plate: art.plate, depth: art.depth, collection: art.preset, subject: 'custom' } : era ? { plate: era.plate, depth: era.depth, collection: era.preset, subject: era.eraId } : null);
  if (!urls) return era === null ? <div aria-busy="true" aria-label="Drawing the invitation" style={{ position: 'relative', width: '100%', aspectRatio: '2 / 3', borderRadius: compact ? 18 : 28, background: 'linear-gradient(160deg,#1b1626,#0b0713)', ...style }} /> : null;
  const base = era ? era.recipe : recipeFor(urls.collection, urls.subject);
  const recipe = art?.foil ? { ...base, foil: { ...base.foil, color: art.foil } } : base;
  const voice = era ? era.voice : plateVoice(art?.voice || urls.collection);
  const light = cat ? isLightPlate(plateId) : era ? era.light : !!art?.light;
  const acc = accent || (era ? era.cta : recipe.foil.color);
  const reduced = reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const w = whenLines(fields);
  const rise = (v: string, px: number): React.CSSProperties => ({ opacity: `var(${v})` as any, transform: `translateY(calc((1 - var(${v})) * ${px}px))` });
  const k = compact ? 0.62 : 1;
  return (
    <EviteStage ref={ref} plateUrl={urls.plate} depthUrl={urls.depth} recipe={recipe} reducedMotion={reducedMotion} label={`Invitation art: ${fields.headline}`} style={{ borderRadius: compact ? 18 : 28, boxShadow: '0 30px 80px -30px rgba(0,0,0,.8)', ...style }}>
      {era?.relief && !reduced && <LetterpressPull key={era.plate} paper={era.paper} ink={era.ink} />}
      <div aria-hidden={hideText || undefined} style={{ visibility: hideText ? 'hidden' : undefined, position: 'absolute', left: 0, right: 0, bottom: 0, padding: `${110 * k}px ${20 * k}px ${22 * k}px`, textAlign: 'center', color: light ? '#2b2420' : '#f4f1fa',
        background: light ? (era ? `linear-gradient(to top,${era.paper}f2,${era.paper}b8 55%,${era.paper}00)` : 'linear-gradient(to top,rgba(250,246,238,.94),rgba(250,246,238,.72) 55%,transparent)') : 'linear-gradient(to top,rgba(5,3,9,.86),rgba(5,3,9,.45) 55%,transparent)' }}>
        <div style={{ ...rise('--rv-head', 10), color: light ? '#7a5a2a' : acc, font: `800 ${11 * k}px Inter,sans-serif`, letterSpacing: '.28em', textTransform: 'uppercase' }}>{voice.eyebrow}</div>
        <div style={{ ...rise('--rv-head', 40), font: `${voice.displayStyle} ${compact ? 'clamp(18px,6vw,26px)' : 'clamp(34px,10vw,46px)'}/0.98 ${voice.display}`, textTransform: voice.tone === 'party' ? 'uppercase' : 'none', margin: `${8 * k}px 0`, textWrap: 'balance' as any, textShadow: light ? 'none' : '0 3px 18px rgba(0,0,0,.55)' }}>{fields.headline || 'Your headline'}</div>
        {fields.subline && !compact && <div style={{ ...rise('--rv-details', 12), font: '500 15px Inter,sans-serif', opacity: 0.9, marginBottom: 8 }}>{fields.subline}</div>}
        <div style={{ ...rise('--rv-details', 12), font: `700 ${15 * k}px Inter,sans-serif` }}>{w.date} · {w.time}</div>
        {fields.venueName && <div style={{ ...rise('--rv-details', 12), font: `500 ${13 * k}px Inter,sans-serif`, opacity: 0.82 }}>{fields.venueName}</div>}
        {ctaLabel && (
          <div style={{ ...rise('--rv-cta', 10), pointerEvents: 'auto', marginTop: 8 }}>
            <button onClick={onCta} style={{ minHeight: 48, padding: '0 26px', borderRadius: 999, border: 0, cursor: 'pointer', font: '800 13px Inter,sans-serif', letterSpacing: '.08em', textTransform: 'uppercase',
              background: voice.tone === 'formal' ? acc : 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', color: voice.tone === 'formal' && !darkHex(acc) ? '#1d1408' : '#fff' }}>{ctaLabel}</button>
          </div>
        )}
      </div>
      {overlay}
    </EviteStage>
  );
});
export default EviteCard;

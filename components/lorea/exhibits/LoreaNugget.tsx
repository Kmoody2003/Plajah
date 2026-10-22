// LoreaNugget — the small torn-paper teasers planted around Lorea (and in the feed). A spot shows a
// nugget only on some days and a different one each day, so readers stumble on them rather than
// look them up. Tapping one walks straight into the exhibit room it came from.
import React, { useEffect, useMemo, useRef } from 'react';
import type { LoreaExhibitId } from '../../../services/loreaExhibits/loreaExhibitTypes';
import { markNuggetSeen, openLoreaExhibit, pickNugget, useLoreaDepth, useLoreaExhibits, type PickedNugget } from '../../../services/loreaExhibits/loreaExhibitStore';
import { Motif, PAPER_CSS, grainUri, materialVars, seedOf, tornClip, usePaperFonts } from './paperKit';

export type NuggetVariant = 'scrap' | 'margin' | 'card';

interface SpotProps {
  /** a stable id for where this nugget is planted, e.g. "lorea/hero" */
  spot: string;
  /** probability (0–1) the spot shows anything today; default 0.7 */
  chance?: number;
  variant?: NuggetVariant;
  exhibitId?: LoreaExhibitId;
  className?: string;
  style?: React.CSSProperties;
}

/** A planted spot: picks today's nugget (or nothing) and renders it. */
export function LoreaNuggetSpot({ spot, chance = 0.7, variant = 'scrap', exhibitId, className, style }: SpotProps) {
  const exhibits = useLoreaExhibits();
  const [depth] = useLoreaDepth();
  const picked = useMemo(() => exhibits ? pickNugget(exhibits, spot, depth, { chance, exhibitId }) : null, [exhibits, spot, depth, chance, exhibitId]);
  if (!picked) return null;
  return <LoreaNuggetView picked={picked} variant={variant} className={className} style={style} />;
}

export function LoreaNuggetView({ picked, variant = 'scrap', className, style }: { picked: PickedNugget; variant?: NuggetVariant; className?: string; style?: React.CSSProperties }) {
  usePaperFonts();
  const { nugget: n, exhibit: ex } = picked;
  const ref = useRef<HTMLButtonElement>(null);
  const seed = seedOf(n.id);
  const room = ex.rooms.find(r => r.id === n.roomId);

  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { markNuggetSeen(n.id); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el); return () => io.disconnect();
  }, [n.id]);

  const open = (e: React.MouseEvent) => { e.stopPropagation(); openLoreaExhibit(ex.id, n.roomId); };
  const tilt = variant === 'card' ? 0 : ((seed % 7) - 3) * 0.7;

  return (
    <button ref={ref} type="button" onClick={open} className={`lx-scrap lx-scrap-${variant} ${className || ''}`} style={{ ...materialVars(ex.materials), ['--tilt' as any]: `${tilt}deg`, ...style }} aria-label={`${n.hook} — open the ${ex.title} exhibit`}>
      <style>{PAPER_CSS + NUGGET_CSS}</style>
      {variant !== 'margin' && <span className="lx-tape" style={{ top: -10, left: `${18 + (seed % 50)}%`, transform: `rotate(${(seed % 11) - 5}deg)` }} />}
      <span className="lx-scrap-paper lx-sheet" style={{ clipPath: variant === 'margin' ? undefined : tornClip(seed, { bottom: true, top: variant === 'card' ? false : seed % 2 === 0 }, 2.2) }}>
        <span className="lx-wash" style={{ width: 180, height: 120, right: -50, top: -40, background: 'var(--lx-wash1)' }} />
        <span className="lx-scrap-eyebrow"><Motif glyph={ex.materials.motif} size={variant === 'card' ? 30 : 22} /><span>{ex.kicker}</span></span>
        <span className="lx-scrap-hook lx-hand">{n.hook}</span>
        {variant !== 'margin' && <span className="lx-scrap-body">{n.body}</span>}
        {n.quote && variant !== 'margin' && <span className="lx-scrap-quote">“{n.quote.text}” <i>— {n.quote.cite}</i></span>}
        <span className="lx-scrap-go lx-note">walk into {ex.title}{room ? ` · ${room.title}` : ''} →</span>
      </span>
    </button>
  );
}

/** A shared exhibit room inside a feed post (assetEmbed type LOREA_EXHIBIT). Works without loading the exhibits. */
export function LoreaExhibitEmbed({ embed }: { embed: { id: LoreaExhibitId; roomId?: string; title?: string; subtitle?: string; accent?: string; motif?: string } }) {
  const accent = embed.accent || '#a8301d';
  return (
    <button type="button" onClick={e => { e.stopPropagation(); openLoreaExhibit(embed.id, embed.roomId); }}
      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left', border: 0, cursor: 'pointer', borderRadius: 4, color: '#2a2236', backgroundColor: '#f1e8d4', backgroundImage: grainUri(1), boxShadow: `inset 4px 0 0 ${accent}, 0 10px 22px -14px rgba(0,0,0,.7)` }}>
      <span style={{ color: accent, flexShrink: 0 }}><Motif glyph={(embed.motif as any) || 'quill'} size={36} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', font: "700 9px/1 'Kalam', cursive", letterSpacing: '.2em', textTransform: 'uppercase', color: accent }}>Lorea · Exhibition Hall</span>
        <span style={{ display: 'block', font: "700 22px/1.05 'Caveat', 'Gochi Hand', cursive", marginTop: 4 }}>{embed.title || 'The Writer’s Craft'}</span>
        {embed.subtitle && <span style={{ display: 'block', font: "15px/1.3 'EB Garamond', Georgia, serif", opacity: .8 }}>{embed.subtitle}</span>}
      </span>
      <span style={{ font: "700 16px/1 'Caveat', cursive", color: accent, flexShrink: 0 }}>walk in →</span>
    </button>
  );
}

const NUGGET_CSS = `
.lx-scrap { position: relative; display: block; text-align: left; border: 0; padding: 0; margin: 0; background: transparent; cursor: pointer; transform: rotate(var(--tilt)); transition: transform .3s cubic-bezier(.2,.8,.3,1.3); max-width: 360px; font-family: 'EB Garamond', Georgia, serif; }
.lx-scrap:hover, .lx-scrap:focus-visible { transform: rotate(0) translateY(-4px) scale(1.02); outline: none; }
.lx-scrap-paper { display: flex; flex-direction: column; gap: 6px; padding: 18px 18px 22px; overflow: hidden; box-shadow: 0 18px 30px -18px rgba(0,0,0,.7); }
.lx-scrap-eyebrow { position: relative; display: flex; align-items: center; gap: 6px; color: var(--lx-accent); font: 700 .66rem/1 'Kalam', cursive; letter-spacing: .14em; text-transform: uppercase; }
.lx-scrap-hook { position: relative; font-size: 1.6rem; line-height: 1.02; color: var(--lx-ink); }
.lx-scrap-body { position: relative; font-size: 1rem; line-height: 1.45; color: var(--lx-ink); opacity: .88; }
.lx-scrap-quote { position: relative; font-size: .95rem; line-height: 1.45; font-style: italic; color: var(--lx-ink); padding-left: 10px; border-left: 2px solid var(--lx-accent); }
.lx-scrap-quote i { font-style: normal; opacity: .7; }
.lx-scrap-go { position: relative; font-size: 1.15rem; color: var(--lx-accent); margin-top: 2px; }
.lx-scrap-margin { max-width: 300px; }
.lx-scrap-margin .lx-scrap-paper { padding: 10px 14px 12px; gap: 4px; border-radius: 2px; }
.lx-scrap-margin .lx-scrap-hook { font-size: 1.3rem; }
.lx-scrap-card { max-width: none; width: 100%; }
.lx-scrap-card .lx-scrap-paper { padding: 22px 22px 26px; border-radius: 3px 3px 0 0; }
.lx-scrap-card .lx-scrap-hook { font-size: 2rem; }
.lx-scrap-card .lx-scrap-body { font-size: 1.08rem; }
`;

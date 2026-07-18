import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Clock, Users, Landmark, Sparkles, Flag, ChevronLeft, ChevronRight, ExternalLink,
} from 'lucide-react';
import { fetchWiki } from '../MuseumHall';
import {
  HISTORY_ERAS, HISTORY_FIGURES, CIVILIZATIONS,
  type HistoryEra, type Civilization,
} from '../../data/worldHistoryData';
import type { MuseumFigure } from '../MuseumHall';
import { TYPE } from '../../src/lib/designSystem';

// ─────────────────────────────────────────────────────────────────────────────
// Eras Atlas — an interactive spine for World History.
//
// The nine eras in HISTORY_ERAS become a scrubbable horizontal timeline.
// Selecting one shows its developments and turning points, and pulls in every
// figure and civilisation whose dates overlap the era. The overlap is computed
// from the human-readable span strings already carried by the seed data, so no
// data file has to be duplicated or hand-maintained twice.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date().getFullYear();

/** Inclusive year range; BCE years are negative. */
interface YearRange { start: number; end: number; }

/**
 * Numeric bounds for each era, keyed by the ids in HISTORY_ERAS. Kept here
 * rather than in the data file so the seed stays purely descriptive — the
 * values simply restate each era's own printed span.
 */
const ERA_RANGE: Record<string, YearRange> = {
  prehistory:    { start: -300000, end: -3000 },  // display span runs to 3.3 Mya
  rivervalleys:  { start: -3500,   end: -1200 },
  classical:     { start: -800,    end: 500 },
  postclassical: { start: 500,     end: 1500 },
  earlymodern:   { start: 1450,    end: 1750 },
  revolutions:   { start: 1750,    end: 1850 },
  industrial:    { start: 1760,    end: 1914 },
  worldwars:     { start: 1914,    end: 1945 },
  contemporary:  { start: 1945,    end: NOW },
};

/**
 * Parse a span string like 'c.4500–539 BCE', '27 BCE–476 CE (West)',
 * 'c.2000 BCE–1500s CE', 'r. 1558–1603' or '1945 – present' into years.
 * A side with no BCE/CE marker inherits the marker from the other side.
 */
export function parseSpan(raw?: string): YearRange | null {
  if (!raw) return null;
  const s = raw.replace(/[–—−]/g, '-');
  // Split on the range dash, ignoring a leading 'c.' or 'r.' prefix.
  const parts = s.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const isBce = (p: string) => /\bB\.?C\.?(E)?\b/i.test(p);
  const isCe = (p: string) => /\b(C\.?E\.?|A\.?D\.?)\b/i.test(p);
  const num = (p: string): number | null => {
    if (/present|today|ongoing/i.test(p)) return NOW;
    const m = p.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  };

  const left = parts[0];
  const right = parts.length > 1 ? parts[1] : parts[0];

  let ln = num(left), rn = num(right);
  if (ln == null && rn == null) return null;
  if (ln == null) ln = rn as number;
  if (rn == null) rn = ln;

  // Determine the era marker for each side, inheriting where absent.
  const leftBce = isBce(left) || (!isCe(left) && isBce(right));
  const rightBce = isBce(right);

  const start = leftBce ? -ln : ln;
  const end = rightBce ? -rn : rn;
  return start <= end ? { start, end } : { start: end, end: start };
}

const overlaps = (a: YearRange, b: YearRange) => a.start <= b.end && b.start <= a.end;

const fmtYear = (y: number) => {
  if (y <= -1000000) return `${(Math.abs(y) / 1_000_000).toFixed(1)} Mya`;
  if (y < 0) return `${Math.abs(y).toLocaleString()} BCE`;
  if (y >= NOW) return 'today';
  return `${y} CE`;
};

// ── Small enriched card (Wikipedia thumb) ────────────────────────────────────
const WikiTile: React.FC<{
  slug: string; title: string; sub?: string; accent: string; icon: React.ReactNode;
}> = ({ slug, title, sub, accent, icon }) => {
  const [thumb, setThumb] = useState('');
  useEffect(() => { let a = true; fetchWiki(slug).then(d => a && setThumb(d.thumb)); return () => { a = false; }; }, [slug]);
  return (
    <a href={`https://en.wikipedia.org/wiki/${slug}`} target="_blank" rel="noreferrer"
      className="group text-left rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all block"
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${accent}66`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <div className="aspect-[4/3] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
        {thumb
          ? <img src={thumb} alt={title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center opacity-15">{icon}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="text-[12px] font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{title}</p>
          {sub && <p className={`${TYPE.labelSm} font-bold mt-0.5 line-clamp-1`} style={{ color: accent }}>{sub}</p>}
        </div>
      </div>
    </a>
  );
};

// ── Main ─────────────────────────────────────────────────────────────────────
interface Props { accent?: string; }

const ErasAtlas: React.FC<Props> = ({ accent = '#E8590C' }) => {
  const [activeId, setActiveId] = useState<string>(HISTORY_ERAS[0]?.id ?? '');
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ down: boolean; startX: number; startScroll: number; moved: boolean }>({
    down: false, startX: 0, startScroll: 0, moved: false,
  });

  const index = Math.max(0, HISTORY_ERAS.findIndex(e => e.id === activeId));
  const era: HistoryEra | undefined = HISTORY_ERAS[index];
  const range = era ? ERA_RANGE[era.id] : undefined;

  // Pre-parse figure and civilisation dates once.
  const figureRanges = useMemo(
    () => HISTORY_FIGURES.map(f => ({ figure: f as MuseumFigure, range: parseSpan(f.years) })),
    [],
  );
  const civRanges = useMemo(
    () => CIVILIZATIONS.map(c => ({ civ: c as Civilization, range: parseSpan(c.span) })),
    [],
  );

  const eraFigures = useMemo(
    () => (range ? figureRanges.filter(f => f.range && overlaps(f.range, range)).map(f => f.figure) : []),
    [figureRanges, range],
  );
  const eraCivs = useMemo(
    () => (range ? civRanges.filter(c => c.range && overlaps(c.range, range)).map(c => c.civ) : []),
    [civRanges, range],
  );

  // Keep the selected chip in view whenever selection changes.
  useEffect(() => {
    const el = trackRef.current?.querySelector<HTMLElement>(`[data-era="${activeId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  const step = useCallback((dir: -1 | 1) => {
    const next = Math.min(HISTORY_ERAS.length - 1, Math.max(0, index + dir));
    setActiveId(HISTORY_ERAS[next].id);
  }, [index]);

  // Drag-to-scrub the track.
  const onPointerDown = (e: React.PointerEvent) => {
    const t = trackRef.current; if (!t) return;
    dragRef.current = { down: true, startX: e.clientX, startScroll: t.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const t = trackRef.current; const d = dragRef.current;
    if (!t || !d.down) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    t.scrollLeft = d.startScroll - dx;
  };
  const endDrag = () => { dragRef.current.down = false; };

  // Relative weights so long eras read as longer without dwarfing the short ones.
  const weight = (id: string) => {
    const r = ERA_RANGE[id];
    if (!r) return 1;
    const yrs = Math.max(1, r.end - r.start);
    return Math.min(3, Math.max(1, Math.log10(yrs) / 1.6));
  };

  const label = `${TYPE.labelSm} font-black uppercase tracking-[0.3em] text-white/35`;

  return (
    <div className="space-y-5">
      {/* ── Scrubbable timeline ─────────────────────────────────────────── */}
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: accent }} />
            <p className={label}>The Spine of History</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} disabled={index === 0} aria-label="Previous era"
              className="w-8 h-8 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center hover:bg-white/[0.09] disabled:opacity-25 transition-all">
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => step(1)} disabled={index === HISTORY_ERAS.length - 1} aria-label="Next era"
              className="w-8 h-8 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center hover:bg-white/[0.09] disabled:opacity-25 transition-all">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
          }}
          tabIndex={0}
          role="listbox"
          aria-label="History eras"
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 cursor-grab active:cursor-grabbing focus:outline-none select-none"
        >
          {HISTORY_ERAS.map((e, i) => {
            const active = e.id === activeId;
            const r = ERA_RANGE[e.id];
            return (
              <button
                key={e.id}
                data-era={e.id}
                role="option"
                aria-selected={active}
                onClick={() => { if (!dragRef.current.moved) setActiveId(e.id); }}
                style={{
                  flex: `${weight(e.id)} 0 auto`,
                  minWidth: 158,
                  borderColor: active ? accent : 'rgba(255,255,255,0.08)',
                  background: active ? `${accent}1f` : 'rgba(255,255,255,0.03)',
                }}
                className="relative shrink-0 text-left rounded-2xl border p-3.5 transition-all hover:bg-white/[0.07]"
              >
                <p className={`${TYPE.labelSm} font-black uppercase tracking-widest tabular-nums`}
                  style={{ color: active ? accent : 'rgba(255,255,255,0.3)' }}>
                  {String(i + 1).padStart(2, '0')}
                </p>
                <p className="text-[13px] font-black uppercase tracking-tight leading-tight mt-1 text-white">{e.title}</p>
                <p className="text-[10px] text-white/40 mt-1 tabular-nums">{e.span}</p>
                {r && (
                  <div className="mt-2 h-1 rounded-full overflow-hidden bg-white/8">
                    <div className="h-full rounded-full" style={{ width: active ? '100%' : '28%', background: active ? accent : 'rgba(255,255,255,0.2)' }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-white/25 mt-2">Drag the strip or use ← → to move through time.</p>
      </div>

      {/* ── Era detail ──────────────────────────────────────────────────── */}
      {/* Keyed on the era id so React remounts (and re-animates) on every
          change. Deliberately not wrapped in AnimatePresence mode="wait" —
          an exit animation still in flight when the next era is picked leaves
          the previous panel mounted and the content goes stale. */}
      {era && (
          <motion.div key={era.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-4">

            {/* Header + essay */}
            <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute top-[-70px] right-[-40px] w-[280px] h-[280px] rounded-full blur-[90px] pointer-events-none"
                style={{ background: `${accent}14` }} />
              <div className="relative">
                <p className={`${TYPE.labelSm} font-black uppercase tracking-[0.4em]`} style={{ color: accent }}>
                  Era {index + 1} of {HISTORY_ERAS.length}
                </p>
                <h3 className="font-black uppercase tracking-tighter mt-1" style={{ fontSize: 'clamp(1.5rem,4.5vw,2.25rem)' }}>{era.title}</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`px-2.5 py-1 rounded-full ${TYPE.labelSm} font-black tabular-nums`}
                    style={{ background: `${accent}26`, border: `1px solid ${accent}4d`, color: accent }}>{era.span}</span>
                  {range && (
                    <span className={`px-2.5 py-1 rounded-full bg-white/5 border border-white/10 ${TYPE.labelSm} font-black text-white/45 tabular-nums`}>
                      {fmtYear(range.start)} → {fmtYear(range.end)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/60 leading-relaxed mt-3 max-w-3xl">{era.essay}</p>
              </div>
            </div>

            {/* Developments + turning points */}
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Sparkles size={14} style={{ color: accent }} />
                  <p className={label}>Developments</p>
                </div>
                <ul className="space-y-1.5">
                  {era.developments.map(d => (
                    <li key={d} className="type-body-sm text-white/60 flex gap-2 leading-relaxed">
                      <span style={{ color: accent }}>·</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Flag size={14} style={{ color: accent }} />
                  <p className={label}>Turning Points</p>
                </div>
                <ul className="space-y-1.5">
                  {era.turningPoints.map(t => (
                    <li key={t} className="type-body-sm text-white/60 flex gap-2 leading-relaxed">
                      <span style={{ color: accent }}>·</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Civilisations of the era */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Landmark size={14} style={{ color: accent }} />
                  <p className={label}>Civilisations of this era</p>
                </div>
                <span className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/25 tabular-nums`}>{eraCivs.length}</span>
              </div>
              {eraCivs.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {eraCivs.map(c => (
                    <WikiTile key={c.id} slug={c.wikiSlug} title={c.name} sub={c.span} accent={accent}
                      icon={<Landmark size={26} />} />
                  ))}
                </div>
              ) : (
                <p className="type-body-sm text-white/25">No seeded civilisation overlaps this era yet.</p>
              )}
            </div>

            {/* Figures of the era */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Users size={14} style={{ color: accent }} />
                  <p className={label}>Figures who lived through it</p>
                </div>
                <span className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/25 tabular-nums`}>{eraFigures.length}</span>
              </div>
              {eraFigures.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {eraFigures.map(f => (
                    <WikiTile key={f.id} slug={f.wikiSlug} title={f.name}
                      sub={f.years || f.role} accent={accent} icon={<Users size={26} />} />
                  ))}
                </div>
              ) : (
                <p className="type-body-sm text-white/25">No seeded figure falls inside this era yet — the record thins out the further back you go.</p>
              )}
            </div>

            <a href="https://openstax.org/subjects/social-sciences" target="_blank" rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
              <div>
                <p className="text-[13px] font-black text-white">Read the era in full · OpenStax World History</p>
                <p className="type-body-sm text-white/45 mt-0.5">The free, peer-reviewed CC-BY textbooks behind this discipline — also readable in Lorea from the Library tab.</p>
              </div>
              <ExternalLink size={14} className="text-white/30 shrink-0" />
            </a>
          </motion.div>
      )}
    </div>
  );
};

export default ErasAtlas;

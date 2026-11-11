// Lorea Lexicon — the drawn pieces: the etymology journey, the cognate fan, the thesaurus
// constellation, the meaning prism and the word's life over two centuries. Ink-on-paper SVG, driven
// by the --lx-* variables set on the Lexicon root.
import React, { useMemo, useState } from 'react';
import type { Cognate, EtymStep, Kinship, KinshipVerdict, MeaningPrism, ThesaurusNode, ThesaurusRelation, UsagePoint } from '../../../services/lexicon/types';
import { FAMILY_COLOR, eraOf, familyOf, yearLabel } from '../../../services/lexicon/languages';

export const KIN_COLOR: Record<Kinship, string> = {
  same: '#245e52', shifted: '#b06a12', drifted: '#5b3a7a', 'false-friend': '#a8301d', unrelated: '#7a7064',
};
export const KIN_LABEL: Record<Kinship, string> = {
  same: 'Same meaning', shifted: 'Shifted', drifted: 'Drifted apart', 'false-friend': 'False friend', unrelated: 'Unrelated',
};

// ─── Origins: the journey ────────────────────────────────────────────────────

/** Piecewise time scale: deep prehistory compressed, the last millennium given room. */
function eraX(y: number): number {
  const segs: [number, number, number, number][] = [[-5000, -500, 0, 0.17], [-500, 500, 0.17, 0.36], [500, 1500, 0.36, 0.72], [1500, 2030, 0.72, 1]];
  for (const [a, b, xa, xb] of segs) if (y <= b) return xa + ((Math.max(y, a) - a) / (b - a)) * (xb - xa);
  return 1;
}

interface Station { lang: string; langName: string; word: string; gloss?: string; relation?: string; year: number; span?: [number, number] }

export function OriginsJourney({ chain, roots, today, todayLang, onWord }: { chain: EtymStep[]; roots: EtymStep[]; today: string; todayLang: string; onWord: (w: string) => void }) {
  const stations = useMemo(() => {
    const raw: Station[] = [];
    const add = (s: EtymStep) => {
      const span = eraOf(s.lang);
      raw.push({ lang: s.lang, langName: s.langName, word: s.word, gloss: s.gloss, relation: s.relation, year: span ? (span[0] + span[1]) / 2 : NaN, span });
    };
    for (const r of roots) if (!chain.some(c => c.word === r.word)) add(r);
    for (const c of chain) add(c);
    raw.push({ lang: todayLang, langName: 'Today', word: today, year: 2010, span: [1900, 2026] });
    // Unknown eras slot between their neighbours (chain order is nearest-first, so walk it backwards).
    const known = raw.map(s => s.year);
    for (let i = 0; i < raw.length; i++) if (Number.isNaN(known[i])) {
      const prev = known.slice(0, i).reverse().find(v => !Number.isNaN(v)) ?? 1000;
      raw[i].year = prev - 50;
    }
    return raw.sort((a, b) => a.year - b.year);
  }, [chain, roots, today, todayLang]);

  if (stations.length < 2) return <p className="lx-muted">Wiktionary doesn't give an ancestor chain for this word yet — the story below is what's recorded.</p>;

  const W = 1000; const H = 250; const pad = 70;
  // Spread stations so labels never collide: at least 118px apart.
  const xs: number[] = [];
  stations.forEach((s, i) => { const x = pad + eraX(s.year) * (W - pad * 2); xs.push(i ? Math.max(x, xs[i - 1] + 118) : x); });
  const over = xs[xs.length - 1] - (W - pad); if (over > 0) for (let i = 0; i < xs.length; i++) xs[i] -= over * (i / (xs.length - 1 || 1));
  const minX = Math.min(...xs); if (minX < pad) for (let i = 0; i < xs.length; i++) xs[i] += (pad - minX) * (1 - i / (xs.length - 1 || 1));
  const trackY = 128;

  return (
    <div className="lx-scrollx">
      <svg viewBox={`0 0 ${W} ${H}`} className="lx-journey" role="img" aria-label={`The journey of ${today} from ${stations[0].langName}`}>
        <defs>
          <marker id="lx-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--lx-ink)" opacity=".55" /></marker>
          <filter id="lx-rough"><feTurbulence baseFrequency="0.04" numOctaves="2" seed="4" /><feDisplacementMap in="SourceGraphic" scale="2.2" /></filter>
        </defs>
        {[-4000, -1000, 0, 500, 1000, 1500, 2000].map(y => {
          const x = pad + eraX(y) * (W - pad * 2);
          return <g key={y} opacity=".35"><line x1={x} x2={x} y1={trackY - 6} y2={trackY + 6} stroke="var(--lx-ink)" /><text x={x} y={H - 8} textAnchor="middle" className="lx-axis">{yearLabel(y)}</text></g>;
        })}
        <path d={`M ${pad - 30} ${trackY} C ${W * 0.3} ${trackY - 10}, ${W * 0.6} ${trackY + 10}, ${W - pad + 30} ${trackY}`} stroke="var(--lx-ink)" strokeWidth="2.2" fill="none" filter="url(#lx-rough)" opacity=".7" strokeDasharray="1 0" className="lx-draw" />
        {stations.map((s, i) => {
          const x = xs[i]; const up = i % 2 === 0; const col = FAMILY_COLOR[familyOf(s.lang)];
          const cy = up ? trackY - 62 : trackY + 50; const last = i === stations.length - 1;
          return (
            <g key={`${s.lang}-${s.word}-${i}`} className="lx-station" style={{ animationDelay: `${i * 110}ms` }}>
              <line x1={x} x2={x} y1={trackY} y2={up ? cy + 26 : cy - 22} stroke={col} strokeWidth="1.3" strokeDasharray="3 3" />
              <circle cx={x} cy={trackY} r={last ? 9 : 6.5} fill={last ? 'var(--lx-accent)' : 'var(--lx-paper)'} stroke={col} strokeWidth="2.4" />
              {i < stations.length - 1 && <path d={`M ${x + 10} ${trackY - 12} Q ${(x + xs[i + 1]) / 2} ${trackY - 34} ${xs[i + 1] - 12} ${trackY - 12}`} fill="none" stroke="var(--lx-ink)" strokeOpacity=".35" markerEnd="url(#lx-arrow)" />}
              <g transform={`translate(${x}, ${cy})`} style={{ cursor: s.word && !s.word.startsWith('*') && !s.word.includes('+') ? 'pointer' : 'default' }}
                 onClick={() => { if (s.word && !s.word.startsWith('*') && !s.word.includes('+')) onWord(s.word); }}>
                <rect x={-56} y={-22} width={112} height={48} rx={5} fill="var(--lx-paper)" stroke={col} strokeWidth="1.4" transform={`rotate(${(i % 3) - 1})`} />
                <text y={-8} textAnchor="middle" className="lx-st-lang" fill={col}>{s.langName.length > 22 ? s.langName.slice(0, 21) + '…' : s.langName}</text>
                <text y={10} textAnchor="middle" className="lx-st-word">{(s.word || '—').length > 16 ? s.word.slice(0, 15) + '…' : s.word || '—'}</text>
                {s.gloss && <text y={22} textAnchor="middle" className="lx-st-gloss">‘{s.gloss.length > 20 ? s.gloss.slice(0, 19) + '…' : s.gloss}’</text>}
              </g>
              {s.relation && s.relation !== 'root' && !last && <text x={x} y={up ? trackY + 18 : trackY - 12} textAnchor="middle" className="lx-st-rel">{s.relation}</text>}
              {s.relation === 'root' && <text x={x} y={up ? trackY + 18 : trackY - 12} textAnchor="middle" className="lx-st-rel">root</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Origins: the cognate fan ────────────────────────────────────────────────

export function CognateFan({ root, cognates, verdicts, onWord }: { root: string; cognates: Cognate[]; verdicts: KinshipVerdict[]; onWord: (w: string) => void }) {
  const list = cognates.filter(c => c.word).slice(0, 18);
  if (!list.length) return null;
  const W = 760; const H = Math.max(240, list.length * 30 + 40); const cx = 120; const cy = H / 2;
  const kin = new Map(verdicts.map(v => [`${v.lang}|${v.word.toLowerCase()}`, v.kinship]));
  return (
    <div className="lx-scrollx">
      <svg viewBox={`0 0 ${W} ${H}`} className="lx-fan" role="img" aria-label="Cognates sharing this word's ancestor">
        <circle cx={cx} cy={cy} r={34} fill="var(--lx-ink)" />
        <text x={cx} y={cy + 5} textAnchor="middle" className="lx-fan-root">{root.length > 11 ? root.slice(0, 10) + '…' : root}</text>
        {list.map((c, i) => {
          const y = 24 + (i * (H - 48)) / Math.max(1, list.length - 1);
          const k = kin.get(`${c.lang}|${c.word.toLowerCase()}`);
          const col = k ? KIN_COLOR[k] : FAMILY_COLOR[familyOf(c.lang)];
          const x = 430;
          return (
            <g key={`${c.lang}-${c.word}-${i}`} className="lx-branch" style={{ animationDelay: `${i * 45}ms`, cursor: 'pointer' }} onClick={() => onWord(c.word)}>
              <path d={`M ${cx + 34} ${cy} C ${cx + 160} ${cy}, ${x - 170} ${y}, ${x - 8} ${y}`} fill="none" stroke={col} strokeWidth={k === 'drifted' || k === 'false-friend' ? 2.2 : 1.4} strokeDasharray={k === 'drifted' ? '5 4' : undefined} opacity=".75" />
              <circle cx={x} cy={y} r={4.5} fill={col} />
              <text x={x + 12} y={y + 4} className="lx-fan-label"><tspan fill={col} fontWeight={600}>{c.langName}</tspan> <tspan fontStyle="italic">{c.word}</tspan>{c.gloss && <tspan opacity=".75"> ‘{c.gloss}’</tspan>}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Thesaurus constellation ─────────────────────────────────────────────────

export const REL_STYLE: Record<ThesaurusRelation, { label: string; color: string; angle: number; spread: number; r: [number, number] }> = {
  synonym: { label: 'Synonyms', color: '#1f2b5c', angle: -90, spread: 150, r: [120, 175] },
  similar: { label: 'Close in meaning', color: '#245e52', angle: -90, spread: 250, r: [205, 250] },
  antonym: { label: 'Opposites', color: '#a8301d', angle: 90, spread: 90, r: [140, 190] },
  broader: { label: 'A kind of…', color: '#b06a12', angle: 0, spread: 40, r: [150, 220] },
  narrower: { label: 'Kinds of it', color: '#5b3a7a', angle: 180, spread: 50, r: [150, 230] },
  partOf: { label: 'Part of', color: '#2f6f8f', angle: 40, spread: 30, r: [170, 230] },
  hasPart: { label: 'Has parts', color: '#2f6f8f', angle: 140, spread: 30, r: [170, 230] },
  triggers: { label: 'Brings to mind', color: '#7a5a1e', angle: 90, spread: 200, r: [225, 262] },
  rhyme: { label: 'Rhymes', color: '#8f3f5f', angle: 0, spread: 0, r: [0, 0] },
  sounds: { label: 'Sounds like', color: '#8f3f5f', angle: 0, spread: 0, r: [0, 0] },
};

export function ThesaurusWeb({ word, nodes, show, onWord }: { word: string; nodes: ThesaurusNode[]; show: Set<ThesaurusRelation>; onWord: (w: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const placed = useMemo(() => {
    const byRel = new Map<ThesaurusRelation, ThesaurusNode[]>();
    for (const n of nodes) { if (!show.has(n.relation) || n.relation === 'rhyme' || n.relation === 'sounds') continue; byRel.set(n.relation, [...(byRel.get(n.relation) ?? []), n]); }
    const out: { n: ThesaurusNode; x: number; y: number; size: number }[] = [];
    for (const [rel, list] of byRel) {
      const st = REL_STYLE[rel];
      const take = list.sort((a, b) => b.score - a.score).slice(0, rel === 'similar' ? 14 : rel === 'synonym' ? 14 : 8);
      take.forEach((n, i) => {
        const t = take.length === 1 ? 0.5 : i / (take.length - 1);
        const ang = ((st.angle - st.spread / 2 + st.spread * t) * Math.PI) / 180;
        const r = st.r[0] + ((i % 3) / 2) * (st.r[1] - st.r[0]);
        const size = 11 + Math.min(6, Math.log10(1 + (n.freq ?? 1)) * 2.4);
        out.push({ n, x: 400 + Math.cos(ang) * r * 1.35, y: 285 + Math.sin(ang) * r, size });
      });
    }
    // Relax overlapping labels apart (approximate text boxes), keeping clear of the centre word.
    const w = (o: { n: ThesaurusNode; size: number }) => o.n.word.length * o.size * 0.52 + 10;
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const a = out[i]; const b = out[j];
        const ox = (w(a) + w(b)) / 2 - Math.abs(a.x - b.x); const oy = (a.size + b.size) * 0.62 - Math.abs(a.y - b.y);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (oy < ox) { const d = (oy / 2 + 0.5) * (a.y < b.y ? -1 : 1); a.y += d; b.y -= d; }
          else { const d = (ox / 2 + 0.5) * (a.x < b.x ? -1 : 1); a.x += d; b.x -= d; }
        }
      }
      for (const o of out) {
        const dx = o.x - 400; const dy = o.y - 285;
        if (Math.abs(dx) < 90 && Math.abs(dy) < 34) o.y += dy < 0 ? -2 : 2;
        o.x = Math.max(w(o) / 2 + 6, Math.min(800 - w(o) / 2 - 6, o.x)); o.y = Math.max(16, Math.min(560, o.y));
      }
      if (!moved) break;
    }
    return out;
  }, [nodes, show]);
  return (
    <svg viewBox="0 0 800 570" className="lx-web" role="img" aria-label={`Words connected to ${word}`}>
      <defs><radialGradient id="lx-glow"><stop offset="0" stopColor="var(--lx-wash1)" stopOpacity=".9" /><stop offset="1" stopColor="var(--lx-wash1)" stopOpacity="0" /></radialGradient></defs>
      <circle cx="400" cy="285" r="120" fill="url(#lx-glow)" />
      {[130, 200, 260].map(r => <ellipse key={r} cx="400" cy="285" rx={r * 1.35} ry={r} fill="none" stroke="var(--lx-ink)" strokeOpacity=".07" strokeDasharray="2 6" />)}
      {placed.map(({ n, x, y }, i) => (
        <line key={`l${i}`} x1="400" y1="285" x2={x} y2={y} stroke={REL_STYLE[n.relation].color} strokeOpacity={hover === null ? 0.18 : hover === n.word ? 0.7 : 0.06} strokeWidth={hover === n.word ? 1.6 : 1} />
      ))}
      <text x="400" y="296" textAnchor="middle" className="lx-web-center">{word}</text>
      {placed.map(({ n, x, y, size }, i) => (
        <g key={`${n.relation}-${n.word}`} className="lx-node" style={{ animationDelay: `${i * 18}ms`, cursor: 'pointer' }}
           onMouseEnter={() => setHover(n.word)} onMouseLeave={() => setHover(null)} onClick={() => onWord(n.word)}
           tabIndex={0} role="button" aria-label={`${n.word}, ${REL_STYLE[n.relation].label}`} onKeyDown={e => { if (e.key === 'Enter') onWord(n.word); }}>
          <text x={x} y={y} textAnchor="middle" fontSize={size} fill={REL_STYLE[n.relation].color} className="lx-web-word" opacity={hover && hover !== n.word ? 0.45 : 1}
                fontStyle={n.relation === 'antonym' ? 'italic' : undefined}>{n.word}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Meaning prism ───────────────────────────────────────────────────────────

const CELL_TINTS = ['#e8d9b5', '#cfe0d6', '#e6cfc8', '#d8d2e8', '#d6e2ea', '#efe0c2'];

export function PrismTable({ prism, onSpeak }: { prism: MeaningPrism; onSpeak: (w: string, lang: string) => void }) {
  if (!prism.rows.length) return <p className="lx-muted">No sense-by-sense translation tables for this word in the chosen languages.</p>;
  return (
    <div className="lx-scrollx">
      <table className="lx-prism">
        <thead><tr><th />{prism.senses.map((s, i) => <th key={i} title={s}><span className="lx-sense-no">{i + 1}</span>{s.length > 48 ? s.slice(0, 47) + '…' : s}</th>)}<th>shape</th></tr></thead>
        <tbody>
          {prism.rows.map(r => {
            const colorOf = new Map<string, string>();
            r.cells.flat().forEach(w => { if (!colorOf.has(w)) colorOf.set(w, CELL_TINTS[colorOf.size % CELL_TINTS.length]); });
            return (
              <tr key={r.lang}>
                <th scope="row">{r.langName}</th>
                {r.cells.map((c, i) => (
                  <td key={i}>{c.length ? c.slice(0, 3).map(w => (
                    <button key={w} className="lx-chipword" style={{ background: colorOf.get(w) }} onClick={() => onSpeak(w, r.lang)} title="Hear it">{w}</button>
                  )) : <span className="lx-dash">·</span>}</td>
                ))}
                <td><span className={`lx-shape lx-shape-${r.shape}`}>{r.shape === 'mirrors' ? 'one word for all' : r.shape === 'splits' ? `splits into ${r.distinct}` : 'partial'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Life of the word ────────────────────────────────────────────────────────

const ERAS: [number, number, string][] = [[1837, 1901, 'Victorian era'], [1914, 1918, 'WWI'], [1939, 1945, 'WWII'], [1991, 2019, 'the web']];

export function LifeChart({ points, word }: { points: UsagePoint[]; word: string }) {
  const [hoverI, setHoverI] = useState<number | null>(null);
  const W = 900; const H = 300; const L = 54; const R = 18; const T = 22; const B = 36;
  const max = Math.max(...points.map(p => p.perMillion), 0.0001);
  const nice = (() => { const e = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / e) * e; })();
  const x = (y: number) => L + ((y - 1800) / 219) * (W - L - R);
  const y = (v: number) => H - B - (v / nice) * (H - T - B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.year).toFixed(1)},${y(p.perMillion).toFixed(1)}`).join(' ');
  const area = `${line} L${x(2019)},${H - B} L${x(1800)},${H - B} Z`;
  const peak = points.reduce((a, b) => (b.perMillion > a.perMillion ? b : a), points[0]);
  const h = hoverI !== null ? points[hoverI] : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lx-life" role="img" aria-label={`How often “${word}” appears in books, 1800 to 2019; peak ${peak.year}`}
         onMouseLeave={() => setHoverI(null)}
         onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const yr = 1800 + ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * 219; setHoverI(Math.max(0, Math.min(points.length - 1, Math.round(yr - 1800)))); }}>
      <defs>
        <pattern id="lx-graph" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="var(--lx-accent)" strokeOpacity=".13" /></pattern>
        <linearGradient id="lx-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--lx-accent)" stopOpacity=".38" /><stop offset="1" stopColor="var(--lx-accent)" stopOpacity=".03" /></linearGradient>
      </defs>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="url(#lx-graph)" />
      {ERAS.map(([a, b, label]) => (
        <g key={label}><rect x={x(a)} y={T} width={x(b) - x(a)} height={H - T - B} fill="var(--lx-ink)" opacity=".05" /><text x={(x(a) + x(b)) / 2} y={T + 12} textAnchor="middle" className="lx-axis" opacity=".6">{label}</text></g>
      ))}
      {[0, 0.5, 1].map(f => <text key={f} x={L - 8} y={y(nice * f) + 4} textAnchor="end" className="lx-axis">{+(nice * f).toPrecision(2)}</text>)}
      {[1800, 1850, 1900, 1950, 2000].map(yr => <text key={yr} x={x(yr)} y={H - 12} textAnchor="middle" className="lx-axis">{yr}</text>)}
      <path d={area} fill="url(#lx-fill)" />
      <path d={line} fill="none" stroke="var(--lx-ink)" strokeWidth="2.2" className="lx-ink-line" pathLength={1} />
      <g><circle cx={x(peak.year)} cy={y(peak.perMillion)} r="4.5" fill="var(--lx-accent)" /><text x={x(peak.year)} y={y(peak.perMillion) - 10} textAnchor={peak.year > 1980 ? 'end' : 'middle'} className="lx-peak">peak {peak.year}</text></g>
      {h && (
        <g pointerEvents="none">
          <line x1={x(h.year)} x2={x(h.year)} y1={T} y2={H - B} stroke="var(--lx-ink)" strokeOpacity=".4" strokeDasharray="3 3" />
          <circle cx={x(h.year)} cy={y(h.perMillion)} r="4" fill="var(--lx-ink)" />
          <rect x={Math.min(x(h.year) + 8, W - 170)} y={T + 20} width="150" height="40" rx="4" fill="var(--lx-paper)" stroke="var(--lx-edge)" />
          <text x={Math.min(x(h.year) + 18, W - 160)} y={T + 37} className="lx-tip-y">{h.year}</text>
          <text x={Math.min(x(h.year) + 18, W - 160)} y={T + 52} className="lx-tip-v">{h.perMillion} per million words</text>
        </g>
      )}
    </svg>
  );
}

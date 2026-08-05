import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Sun, Table2, BookA, Search, ExternalLink, AlertTriangle, Ruler,
} from 'lucide-react';
import SunPathCalculator from './SunPathCalculator';
import { AEC_GLOSSARY_SORTED, AEC_CATEGORIES, type AecCategory } from '../../data/aecGlossary';
import { TYPE } from '../../src/lib/designSystem';

// ─────────────────────────────────────────────────────────────────────────────
// The Practitioner Shelf — the working reference layer of the Architecture
// studio: a real sun-path/daylighting calculator, code-referenced span and
// load tables, and the AEC glossary.
//
// Every table below restates a published reference (IRC, IBC, ASCE 7) and links
// to the authority. Nothing here substitutes for the adopted code.
// ─────────────────────────────────────────────────────────────────────────────

type Shelf = 'sun' | 'tables' | 'glossary';

const SHELVES: { id: Shelf; label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[] = [
  { id: 'sun', label: 'Sun & Daylight', icon: Sun },
  { id: 'tables', label: 'Span & Load Tables', icon: Table2 },
  { id: 'glossary', label: 'AEC Glossary', icon: BookA },
];

// ── IRC Table R502.3.1(2) — floor joists, 40 psf live / 10 psf dead, L/360 ───
// Douglas Fir-Larch, No. 2. Maximum clear span, feet-inches.
const JOIST_SPANS: { size: string; oc12: string; oc16: string; oc24: string }[] = [
  { size: '2 × 6',  oc12: `10'-9"`, oc16: `9'-9"`,   oc24: `8'-1"` },
  { size: '2 × 8',  oc12: `14'-2"`, oc16: `12'-7"`,  oc24: `10'-3"` },
  { size: '2 × 10', oc12: `17'-9"`, oc16: `15'-5"`,  oc24: `12'-7"` },
  { size: '2 × 12', oc12: `20'-7"`, oc16: `17'-10"`, oc24: `14'-7"` },
];

// ── IBC Table 1604.3 — deflection limits ─────────────────────────────────────
const DEFLECTION_LIMITS: { member: string; live: string; total: string; note?: string }[] = [
  { member: 'Floor members', live: 'L/360', total: 'L/240' },
  { member: 'Roof members with plaster or stucco ceiling', live: 'L/360', total: 'L/240' },
  { member: 'Roof members with non-plaster ceiling', live: 'L/240', total: 'L/180' },
  { member: 'Roof members with no ceiling', live: 'L/180', total: 'L/120' },
  { member: 'Exterior walls with brittle finishes', live: 'L/240', total: '—', note: 'Wind load' },
  { member: 'Exterior walls with flexible finishes', live: 'L/120', total: '—', note: 'Wind load' },
];

// ── ASCE 7 Table 4.3-1 — minimum uniformly distributed live loads ────────────
const LIVE_LOADS: { use: string; psf: number }[] = [
  { use: 'Residential — dwellings, private rooms', psf: 40 },
  { use: 'Residential — public rooms and corridors', psf: 100 },
  { use: 'Office buildings — offices', psf: 50 },
  { use: 'Office buildings — lobbies and first-floor corridors', psf: 100 },
  { use: 'Corridors above the first floor', psf: 80 },
  { use: 'Assembly — fixed seats', psf: 60 },
  { use: 'Assembly — movable seats', psf: 100 },
  { use: 'Assembly — stages and platforms', psf: 125 },
  { use: 'Schools — classrooms', psf: 40 },
  { use: 'Schools — corridors above the first floor', psf: 80 },
  { use: 'Retail — first floor', psf: 100 },
  { use: 'Retail — upper floors', psf: 75 },
  { use: 'Libraries — reading rooms', psf: 60 },
  { use: 'Libraries — stack rooms', psf: 150 },
  { use: 'Storage — light', psf: 125 },
  { use: 'Storage — heavy', psf: 250 },
  { use: 'Stairs and exit ways', psf: 100 },
  { use: 'Balconies and decks', psf: 100 },
];

// ── Preliminary sizing heuristics (rules of thumb, not code) ─────────────────
const DEPTH_RATIOS: { system: string; ratio: string; typical: string }[] = [
  { system: 'Timber joist floor', ratio: 'L / 16 – L / 20', typical: 'Residential floors, short spans' },
  { system: 'Glulam / LVL beam', ratio: 'L / 16 – L / 20', typical: 'Mass-timber and heavy-timber framing' },
  { system: 'Steel beam (simple span)', ratio: 'L / 20 – L / 24', typical: 'Composite deck floors' },
  { system: 'Steel open-web joist', ratio: 'L / 20 – L / 24', typical: 'Long-span light roofs and floors' },
  { system: 'Steel truss', ratio: 'L / 10 – L / 15', typical: 'Long-span roofs' },
  { system: 'Reinforced concrete beam', ratio: 'L / 12 – L / 16', typical: 'Cast-in-place frames' },
  { system: 'Concrete one-way slab', ratio: 'L / 24 – L / 28', typical: 'Between beams' },
  { system: 'Concrete flat plate', ratio: 'L / 30 – L / 33', typical: 'Residential and hotel towers' },
  { system: 'Post-tensioned slab', ratio: 'L / 40 – L / 45', typical: 'Long-span parking and office floors' },
];

const REFS: { label: string; url: string; note: string }[] = [
  { label: 'AWC Span Calculator', url: 'https://awc.org/codes-standards/calculators-software/spancalc/', note: 'The American Wood Council\'s free calculator — every species, grade, load case and spacing.' },
  { label: 'ICC Digital Codes', url: 'https://codes.iccsafe.org/', note: 'Read the IBC and IRC online, including the full span and deflection tables.' },
  { label: 'ASCE 7 · Minimum Design Loads', url: 'https://www.asce.org/publications-and-news/asce-7', note: 'The load standard referenced by the IBC — dead, live, snow, wind, seismic, flood.' },
  { label: 'USGS Seismic Design Web Service', url: 'https://earthquake.usgs.gov/ws/designmaps/', note: 'Free API returning site-specific seismic design values for any latitude and longitude.' },
  { label: 'NOAA Solar Calculator', url: 'https://gml.noaa.gov/grad/solcalc/', note: 'The reference implementation of the solar-position maths used by the calculator here.' },
  { label: 'EnergyPlus Weather Data', url: 'https://energyplus.net/weather', note: 'Free TMY weather files for climate-based daylight and energy modelling worldwide.' },
];

interface Props { accent?: string; }

const PractitionerShelf: React.FC<Props> = ({ accent = '#B08968' }) => {
  const [shelf, setShelf] = useState<Shelf>('sun');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<AecCategory | 'all'>('all');

  const terms = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return AEC_GLOSSARY_SORTED.filter(t => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!needle) return true;
      return t.term.toLowerCase().includes(needle)
        || (t.aka || '').toLowerCase().includes(needle)
        || t.definition.toLowerCase().includes(needle);
    });
  }, [q, cat]);

  const label = `${TYPE.labelSm} font-black uppercase tracking-[0.3em] text-white/35`;
  const th = 'text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/35';
  const td = 'px-3 py-2 type-body-sm text-white/60 tabular-nums';

  return (
    <div className="space-y-5">
      {/* Shelf switch */}
      <div className="flex flex-wrap gap-1.5">
        {SHELVES.map(s => {
          const active = shelf === s.id; const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setShelf(s.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full ${TYPE.labelSm} font-black uppercase tracking-widest border transition-all`}
              style={active
                ? { background: `${accent}26`, borderColor: `${accent}66`, color: accent }
                : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
              <Icon size={13} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Sun & daylight ────────────────────────────────────────────────── */}
      {shelf === 'sun' && <SunPathCalculator accent={accent} />}

      {/* ── Span & load tables ────────────────────────────────────────────── */}
      {shelf === 'tables' && (
        <div className="space-y-5">
          <div className="rounded-2xl border p-4 flex gap-3" style={{ borderColor: '#f59e0b33', background: '#f59e0b0d' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
            <p className="type-body-sm text-white/55 leading-relaxed">
              These tables restate published references for study and preliminary sizing. The adopted code in your
              jurisdiction — with its local amendments — governs the real project, and a licensed engineer of record
              signs the structure. Always confirm against the source before you build.
            </p>
          </div>

          {/* Joist spans */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-center gap-2"><Table2 size={14} style={{ color: accent }} /><p className={label}>Floor Joist Spans</p></div>
            <p className="type-body-sm text-white/45 mt-1.5 leading-relaxed">
              Douglas Fir-Larch No. 2 · 40 psf live load, 10 psf dead load · deflection limit L/360 ·
              maximum clear span, restating IRC Table R502.3.1(2). Other species, grades and load cases change these
              numbers substantially — run the AWC calculator below for anything else.
            </p>
            <div className="mt-3 overflow-x-auto scrollbar-hide">
              <table className="w-full min-w-[440px] border-collapse">
                <thead><tr className="border-b border-white/8">
                  <th className={th}>Size</th><th className={th}>12" o.c.</th>
                  <th className={th}>16" o.c.</th><th className={th}>24" o.c.</th>
                </tr></thead>
                <tbody>
                  {JOIST_SPANS.map(r => (
                    <tr key={r.size} className="border-b border-white/5">
                      <td className={`${td} font-black text-white`}>{r.size}</td>
                      <td className={td}>{r.oc12}</td><td className={td}>{r.oc16}</td>
                      <td className={td}>{r.oc24}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deflection limits */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-center gap-2"><Ruler size={14} style={{ color: accent }} /><p className={label}>Deflection Limits</p></div>
            <p className="type-body-sm text-white/45 mt-1.5">Serviceability limits as a fraction of clear span L, restating IBC Table 1604.3.</p>
            <div className="mt-3 overflow-x-auto scrollbar-hide">
              <table className="w-full min-w-[440px] border-collapse">
                <thead><tr className="border-b border-white/8">
                  <th className={th}>Member</th><th className={th}>Live load L</th><th className={th}>Total D + L</th>
                </tr></thead>
                <tbody>
                  {DEFLECTION_LIMITS.map(r => (
                    <tr key={r.member} className="border-b border-white/5">
                      <td className={`${td} text-white/70`}>{r.member}{r.note && <span className="text-white/25"> · {r.note}</span>}</td>
                      <td className={td}>{r.live}</td><td className={td}>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live loads */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-center gap-2"><Table2 size={14} style={{ color: accent }} /><p className={label}>Minimum Live Loads</p></div>
            <p className="type-body-sm text-white/45 mt-1.5">Uniformly distributed minimums in pounds per square foot, restating ASCE 7 Table 4.3-1.</p>
            <div className="mt-3 grid sm:grid-cols-2 gap-x-6">
              {LIVE_LOADS.map(r => (
                <div key={r.use} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/5">
                  <span className="type-body-sm text-white/60">{r.use}</span>
                  <span className="text-[13px] font-black tabular-nums shrink-0" style={{ color: accent }}>{r.psf} psf</span>
                </div>
              ))}
            </div>
          </div>

          {/* Depth ratios */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-center gap-2"><Ruler size={14} style={{ color: accent }} /><p className={label}>Preliminary Depth Ratios</p></div>
            <p className="type-body-sm text-white/45 mt-1.5">
              Schematic-phase rules of thumb — structural depth as a fraction of span. Not code; a way to size a
              floor sandwich before an engineer is engaged.
            </p>
            <div className="mt-3 overflow-x-auto scrollbar-hide">
              <table className="w-full min-w-[440px] border-collapse">
                <thead><tr className="border-b border-white/8">
                  <th className={th}>System</th><th className={th}>Depth</th><th className={th}>Typical use</th>
                </tr></thead>
                <tbody>
                  {DEPTH_RATIOS.map(r => (
                    <tr key={r.system} className="border-b border-white/5">
                      <td className={`${td} font-black text-white`}>{r.system}</td>
                      <td className={td} style={{ color: accent }}>{r.ratio}</td>
                      <td className={`${td} text-white/45`}>{r.typical}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* References */}
          <div>
            <p className={`${label} mb-2.5`}>The Authorities</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {REFS.map(r => (
                <a key={r.url} href={r.url} target="_blank" rel="noreferrer"
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-black text-white">{r.label}</p>
                    <ExternalLink size={13} className="text-white/25 shrink-0" />
                  </div>
                  <p className="type-body-sm text-white/45 mt-1 leading-relaxed">{r.note}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Glossary ──────────────────────────────────────────────────────── */}
      {shelf === 'glossary' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search the vocabulary of practice…"
              className="w-full rounded-2xl bg-black/40 border border-white/10 pl-10 pr-3 py-3 text-sm text-white placeholder-white/25 focus:outline-none"
              onFocus={e => (e.currentTarget.style.borderColor = `${accent}66`)}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['all', ...AEC_CATEGORIES.map(c => c.id)] as (AecCategory | 'all')[]).map(c => {
              const active = cat === c;
              return (
                <button key={c} onClick={() => setCat(c)}
                  className={`px-2.5 py-1 rounded-full ${TYPE.labelSm} font-black uppercase tracking-widest border transition-all`}
                  style={active
                    ? { background: `${accent}26`, borderColor: `${accent}66`, color: accent }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                  {c === 'all' ? `All · ${AEC_GLOSSARY_SORTED.length}` : c}
                </button>
              );
            })}
          </div>

          {terms.length === 0 && (
            <p className="py-16 text-center text-sm text-white/25">No term matches “{q}”.</p>
          )}

          <div className="grid md:grid-cols-2 gap-2.5">
            {terms.map((t, i) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.015 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="text-[14px] font-black text-white leading-tight">{t.term}</p>
                  <span className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/30 shrink-0`}>{t.category}</span>
                </div>
                {t.aka && <p className={`${TYPE.labelSm} font-black uppercase tracking-widest mt-0.5`} style={{ color: accent }}>{t.aka}</p>}
                <p className="type-body-sm text-white/55 leading-relaxed mt-1.5">{t.definition}</p>
                {t.source && (
                  <a href={t.source.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-[9px] font-black uppercase tracking-widest hover:underline"
                    style={{ color: accent }}>
                    {t.source.label} <ExternalLink size={10} />
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PractitionerShelf;

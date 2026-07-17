// ─── SheetMusic — real engraved notation renderer (SVG) ───────────────────────
// Renders a Notation model (from services/musicNotation) as readable sheet music:
// grand staff per system, clefs, key & time signatures, noteheads at correct
// pitch, stems, flags, dots, accidentals, ledger lines, rests, barlines — plus an
// optional playhead synced to the live beat position. Used in the Breakdown and
// in Lorea's score viewer so the same engine drives both.

import React, { useMemo } from 'react';
import type { Notation, NStaff, NElement } from '../services/musicNotation';

const STEP_NUM: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Bottom staff line as a diatonic index (octave*7 + stepNum).
const BOTTOM_LINE = { treble: 4 * 7 + STEP_NUM.E, bass: 2 * 7 + STEP_NUM.G }; // E4 / G2

interface Props {
  notation: Notation;
  /** Live beat position (beats from grid start) for the playhead. Omit for static. */
  currentBeat?: number;
  measuresPerSystem?: number;
  color?: string;
  className?: string;
}

const LINE_GAP = 9;            // px between staff lines
const HALF = LINE_GAP / 2;     // one diatonic step
const STAFF_H = LINE_GAP * 4;  // 5 lines
const SYSTEM_GAP = 46;         // between treble and bass staves within a system
const SYSTEM_PAD = 58;         // vertical room per system (both staves + margin)
const LEFT = 8;
const HEADER_W = 56;           // clef + key + time signature width
const MEASURE_W = 132;

/** y of a pitch (relative to the staff's top line). */
function pitchY(step: string, octave: number, clef: 'treble' | 'bass'): number {
  const di = octave * 7 + (STEP_NUM[step] ?? 6);
  const stepsAboveBottom = di - BOTTOM_LINE[clef];
  // top line y = 0; bottom line y = STAFF_H. note y = bottom - steps*HALF.
  return STAFF_H - stepsAboveBottom * HALF;
}

const SheetMusic: React.FC<Props> = ({
  notation, currentBeat, measuresPerSystem = 4, color = '#e5e7eb', className,
}) => {
  const layout = useMemo(() => {
    const measureLen = notation.beats * notation.divisions * (4 / notation.beatType);
    const maxMeasures = Math.max(...notation.staves.map(s => s.measures.length), 1);
    const systems = Math.ceil(maxMeasures / measuresPerSystem);
    const width = LEFT + HEADER_W + measuresPerSystem * MEASURE_W + 12;
    const height = systems * SYSTEM_PAD + 12;
    return { measureLen, maxMeasures, systems, width, height };
  }, [notation, measuresPerSystem]);

  const accGlyph = (alter?: number) => (alter === 1 ? '♯' : alter === -1 ? '♭' : alter === 2 ? '𝄪' : alter === -2 ? '𝄫' : '');

  // Key-signature accidental positions (diatonic order of sharps/flats).
  const keySigGlyphs = (clef: 'treble' | 'bass') => {
    const f = notation.keyFifths;
    if (f === 0) return null;
    const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    const flats = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    // Octave each accidental sits in, per clef (standard engraving positions).
    const sharpOct = clef === 'treble' ? [5, 5, 5, 5, 4, 5, 4] : [3, 3, 3, 3, 2, 3, 2];
    const flatOct = clef === 'treble' ? [4, 5, 4, 5, 4, 5, 4] : [2, 3, 2, 3, 2, 3, 2];
    const n = Math.min(Math.abs(f), 7);
    const list = f > 0 ? sharps.slice(0, n) : flats.slice(0, n);
    const octs = f > 0 ? sharpOct : flatOct;
    return list.map((step, i) => {
      const di = octs[i] * 7 + STEP_NUM[step];
      const y = STAFF_H - (di - BOTTOM_LINE[clef]) * HALF;
      return { glyph: f > 0 ? '♯' : '♭', x: 26 + i * 6, y };
    });
  };

  const renderStaff = (staff: NStaff, sysIndex: number, topY: number, startMeasure: number) => {
    const clef = staff.clef;
    const items: React.ReactNode[] = [];
    const xLeft = LEFT;

    // Staff lines
    for (let l = 0; l < 5; l++) {
      const y = topY + l * LINE_GAP;
      items.push(<line key={`l${l}`} x1={xLeft} y1={y} x2={layout.width - 8} y2={y} stroke="currentColor" strokeOpacity={0.22} strokeWidth={1} />);
    }
    // Clef
    items.push(
      <text key="clef" x={xLeft + 4} y={topY + (clef === 'treble' ? STAFF_H - 1 : LINE_GAP + 2)}
        fontSize={clef === 'treble' ? 38 : 30} fill="currentColor" fillOpacity={0.85} fontFamily="serif">
        {clef === 'treble' ? '𝄞' : '𝄢'}
      </text>,
    );
    // Key signature
    const ksig = keySigGlyphs(clef);
    ksig?.forEach((k, i) => items.push(
      <text key={`ks${i}`} x={xLeft + k.x} y={topY + k.y + 3} fontSize={13} fill="currentColor" fillOpacity={0.7} fontFamily="serif">{k.glyph}</text>,
    ));
    // Time signature (only on the first system)
    if (sysIndex === 0) {
      items.push(<text key="tsa" x={xLeft + HEADER_W - 14} y={topY + LINE_GAP + 4} fontSize={13} fontWeight="bold" fill="currentColor" fillOpacity={0.7} textAnchor="middle">{notation.beats}</text>);
      items.push(<text key="tsb" x={xLeft + HEADER_W - 14} y={topY + STAFF_H + 1} fontSize={13} fontWeight="bold" fill="currentColor" fillOpacity={0.7} textAnchor="middle">{notation.beatType}</text>);
    }

    const measures = staff.measures.slice(startMeasure, startMeasure + measuresPerSystem);
    measures.forEach((m, mi) => {
      const mx = xLeft + HEADER_W + mi * MEASURE_W;
      // Barline at measure end
      items.push(<line key={`bar${mi}`} x1={mx + MEASURE_W} y1={topY} x2={mx + MEASURE_W} y2={topY + STAFF_H} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} />);
      // Notes laid out by cumulative division position
      let pos = 0;
      const total = notation.beats * notation.divisions * (4 / notation.beatType);
      m.elements.forEach((el, ei) => {
        const nx = mx + 14 + (pos / total) * (MEASURE_W - 22);
        pos += el.divisions;
        if (el.rest) {
          items.push(<text key={`r${mi}-${ei}`} x={nx} y={topY + STAFF_H / 2 + 4} fontSize={14} fill="currentColor" fillOpacity={0.4} fontFamily="serif">𝄽</text>);
          return;
        }
        const open = el.type === 'whole' || el.type === 'half';
        const short = el.type === 'eighth' || el.type === '16th';
        // Each chord pitch → a notehead (+ its own accidental / ledger lines).
        const ys = el.pitches.map(p => topY + pitchY(p.step, p.octave, clef));
        const yTop = Math.min(...ys), yBot = Math.max(...ys);
        const stemUp = (yTop + yBot) / 2 > topY + STAFF_H / 2;
        const heads: React.ReactNode[] = [];
        el.pitches.forEach((p, pi) => {
          const y = ys[pi];
          if (y < topY) for (let ly = topY - LINE_GAP; ly >= y - 1; ly -= LINE_GAP) heads.push(<line key={`u${pi}-${ly}`} x1={nx - 6} y1={ly} x2={nx + 6} y2={ly} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />);
          if (y > topY + STAFF_H) for (let ly = topY + STAFF_H + LINE_GAP; ly <= y + 1; ly += LINE_GAP) heads.push(<line key={`d${pi}-${ly}`} x1={nx - 6} y1={ly} x2={nx + 6} y2={ly} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />);
          if (p.alter) heads.push(<text key={`a${pi}`} x={nx - 11} y={y + 4} fontSize={11} fill={color} fontFamily="serif">{accGlyph(p.alter)}</text>);
          heads.push(<ellipse key={`h${pi}`} cx={nx} cy={y} rx={4.2} ry={3.1} transform={`rotate(-18 ${nx} ${y})`} fill={open ? 'none' : color} stroke={color} strokeWidth={open ? 1.3 : 0} />);
          el.dots && heads.push(...Array.from({ length: el.dots }, (_, di) => <circle key={`dt${pi}-${di}`} cx={nx + 7 + di * 3} cy={y} r={1} fill={color} />));
        });
        // One stem spanning the chord; flag on the stem end for eighth/16th.
        const stemX = stemUp ? nx + 4 : nx - 4;
        const stemFrom = stemUp ? yBot : yTop;
        const stemTo = (stemUp ? yTop : yBot) + (stemUp ? -16 : 16);
        items.push(
          <g key={`n${mi}-${ei}`}>
            {heads}
            {el.type !== 'whole' && <line x1={stemX} y1={stemFrom} x2={stemX} y2={stemTo} stroke={color} strokeWidth={1.1} />}
            {short && <line x1={stemX} y1={stemTo} x2={stemUp ? stemX + 5 : stemX + 5} y2={stemTo + (stemUp ? 6 : -6)} stroke={color} strokeWidth={1.1} />}
          </g>,
        );
      });
    });

    return <g key={`${staff.voice}-${sysIndex}`}>{items}</g>;
  };

  // Playhead position (which system + x) from currentBeat.
  const playhead = useMemo(() => {
    if (currentBeat == null) return null;
    const divPos = currentBeat * notation.divisions;
    const measureLen = layout.measureLen;
    const measureIdx = Math.floor(divPos / measureLen);
    if (measureIdx >= layout.maxMeasures) return null;
    const sys = Math.floor(measureIdx / measuresPerSystem);
    const mInSys = measureIdx % measuresPerSystem;
    const within = (divPos % measureLen) / measureLen;
    const x = LEFT + HEADER_W + mInSys * MEASURE_W + 14 + within * (MEASURE_W - 22);
    const topY = 8 + sys * SYSTEM_PAD;
    return { x, y1: topY - 4, y2: topY + STAFF_H + SYSTEM_GAP + STAFF_H + 4 };
  }, [currentBeat, notation.divisions, layout, measuresPerSystem]);

  // The engraved staves are EXPENSIVE (hundreds of SVG nodes) and depend only on the
  // notation — NOT the playhead. Memoize them so a per-frame `currentBeat` change re-renders
  // only the single playhead line, not the whole score. This is the fix for the render stutter.
  const staves = useMemo(() => (
    Array.from({ length: layout.systems }).map((_, sys) => {
      const topY = 8 + sys * SYSTEM_PAD;
      const startMeasure = sys * measuresPerSystem;
      return (
        <g key={sys}>
          {renderStaff(notation.staves[0], sys, topY, startMeasure)}
          {notation.staves[1] && renderStaff(notation.staves[1], sys, topY + STAFF_H + SYSTEM_GAP, startMeasure)}
        </g>
      );
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [notation, layout, measuresPerSystem, color]);

  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" className={className} style={{ color }}>
      {staves}
      {playhead && (
        <line x1={playhead.x} y1={playhead.y1} x2={playhead.x} y2={playhead.y2}
          stroke="#f97316" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.7} />
      )}
    </svg>
  );
};

export default React.memo(SheetMusic);

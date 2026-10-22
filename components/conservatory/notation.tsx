import React from 'react';
import type { RhythmCell } from '../../services/musicPedagogy/earTraining';

// ─────────────────────────────────────────────────────────────────────────────
// notation.tsx — the tiny engraver behind Staff Sprint and Rhythm Reader.
//
// Two pieces, both plain SVG so they theme, scale and print cleanly:
//   • <StaffNote>  one note on a treble or bass staff, with ledger lines, optional landmark
//                  ghost and optional colour-coded notehead (the classroom "Boomwhacker"
//                  colours — a scaffold that Staff Sprint fades out as reading improves).
//   • <RhythmBar>  one 4/4 bar of rhythm cells on a single-line staff, with beams,
//                  sixteenth sub-beams, flags, dots, rests and triplet brackets.
// ─────────────────────────────────────────────────────────────────────────────

export type Clef = 'treble' | 'bass';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = typeof LETTERS[number];

/** Classroom colour code — C red through B magenta. */
export const NOTE_COLORS: Record<Letter, string> = {
  C: '#E53935', D: '#FB8C00', E: '#FDD835', F: '#7CB342', G: '#00897B', A: '#5E35B1', B: '#D81B60',
};

/** 'G4' → diatonic step number (C0 = 0). */
export function stepOf(name: string): number {
  const letter = name[0] as Letter;
  const octave = parseInt(name.slice(1), 10);
  return LETTERS.indexOf(letter) + octave * 7;
}
export const nameOfStep = (step: number) => `${LETTERS[((step % 7) + 7) % 7]}${Math.floor(step / 7)}`;

/** Natural note name → MIDI. */
export function naturalMidi(name: string): number {
  const semis = [0, 2, 4, 5, 7, 9, 11][LETTERS.indexOf(name[0] as Letter)];
  return semis + (parseInt(name.slice(1), 10) + 1) * 12;
}

const BOTTOM_LINE: Record<Clef, number> = { treble: stepOf('E4'), bass: stepOf('G2') };

export const StaffNote: React.FC<{
  clef: Clef;
  note: string;
  color?: boolean;
  /** Landmark to ghost in beside the note (hint mode). */
  ghost?: string;
  /** Flash the notehead green/red after an answer. */
  state?: 'idle' | 'right' | 'wrong';
  ink?: string;
}> = ({ clef, note, color, ghost, state = 'idle', ink = 'rgba(255,255,255,0.85)' }) => {
  const S = 14; // line spacing
  const W = 260, H = 190;
  const bottomY = 120;
  const bottom = BOTTOM_LINE[clef];
  const yOf = (step: number) => bottomY - (step - bottom) * (S / 2);
  const lines = [0, 1, 2, 3, 4].map(i => bottomY - i * S);

  const ledgers = (step: number) => {
    const out: number[] = [];
    const rel = step - bottom;
    if (rel <= -2) for (let r = -2; r >= rel; r -= 2) out.push(yOf(bottom + r));
    if (rel >= 10) for (let r = 10; r <= rel; r += 2) out.push(yOf(bottom + r));
    return out;
  };

  const head = (step: number, x: number, fill: string, opacity = 1, key?: string, stem = true) => {
    const y = yOf(step);
    const up = step - bottom < 4; // stem direction: up below the middle line
    return (
      <g key={key} opacity={opacity}>
        {ledgers(step).map(ly => <line key={ly} x1={x - 16} x2={x + 16} y1={ly} y2={ly} stroke={ink} strokeWidth={1.6} />)}
        <ellipse cx={x} cy={y} rx={8.5} ry={6.2} transform={`rotate(-20 ${x} ${y})`} fill={fill} stroke={ink} strokeWidth={1} />
        {stem && <line x1={up ? x + 7.8 : x - 7.8} x2={up ? x + 7.8 : x - 7.8} y1={y} y2={up ? y - 3.4 * S : y + 3.4 * S} stroke={ink} strokeWidth={1.6} />}
      </g>
    );
  };

  const step = stepOf(note);
  const letter = note[0] as Letter;
  const fill = state === 'right' ? '#22C55E' : state === 'wrong' ? '#EF4444' : color ? NOTE_COLORS[letter] : ink;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label={`${clef} clef note`}>
      {lines.map(y => <line key={y} x1={10} x2={W - 10} y1={y} y2={y} stroke={ink} strokeWidth={1.4} opacity={0.75} />)}
      <text
        x={18} y={clef === 'treble' ? bottomY + 9 : bottomY - S * 1.05}
        fontSize={clef === 'treble' ? 82 : 50}
        fill={ink}
        style={{ fontFamily: '"Noto Music","Segoe UI Symbol","Bravura",serif' }}
      >{clef === 'treble' ? '\u{1D11E}' : '\u{1D122}'}</text>
      {ghost && head(stepOf(ghost), 128, 'transparent', 0.5, 'ghost', false)}
      {ghost && <text x={108} y={yOf(stepOf(ghost)) + 4} fontSize={10} fontWeight={700} fill={ink} opacity={0.6} textAnchor="end">{ghost}</text>}
      {head(step, ghost ? 178 : 160, fill)}
    </svg>
  );
};

// ── Rhythm ────────────────────────────────────────────────────────────────────

interface Ev { dur: number; rest: boolean; beam?: number; sub?: boolean; trip?: number }

/** Flatten cells into drawable events; beamed cells share a beam id. */
function events(bar: RhythmCell[]): Ev[] {
  const out: Ev[] = [];
  let beamId = 0;
  for (const c of bar) {
    const id = ++beamId;
    switch (c.id) {
      case 'ee': out.push({ dur: 0.5, rest: false, beam: id }, { dur: 0.5, rest: false, beam: id }); break;
      case 'ssss': for (let i = 0; i < 4; i++) out.push({ dur: 0.25, rest: false, beam: id, sub: true }); break;
      case 'ess': out.push({ dur: 0.5, rest: false, beam: id }, { dur: 0.25, rest: false, beam: id, sub: true }, { dur: 0.25, rest: false, beam: id, sub: true }); break;
      case 'sse': out.push({ dur: 0.25, rest: false, beam: id, sub: true }, { dur: 0.25, rest: false, beam: id, sub: true }, { dur: 0.5, rest: false, beam: id }); break;
      case 'trip': for (let i = 0; i < 3; i++) out.push({ dur: 1 / 3, rest: false, beam: id, trip: id }); break;
      default: for (const b of c.beats) out.push({ dur: Math.abs(b), rest: b < 0 });
    }
  }
  return out;
}

export const RhythmBar: React.FC<{ bar: RhythmCell[]; ink?: string; highlight?: string }> = ({ bar, ink = 'rgba(255,255,255,0.88)', highlight }) => {
  const evs = events(bar);
  const y0 = 52;
  const stemTop = y0 - 30;
  const unit = 54; // px per beat
  let x = 40;
  const placed = evs.map(e => { const px = x; x += Math.max(18, e.dur * unit); return { ...e, x: px }; });
  const W = Math.max(276, x + 14);

  const els: React.ReactNode[] = [];
  placed.forEach((e, i) => {
    const sx = e.x + 6;
    const dotted = Math.abs(e.dur - 1.5) < 1e-6 || Math.abs(e.dur - 3) < 1e-6;
    if (e.rest) {
      if (e.dur >= 2) els.push(<rect key={i} x={e.x - 6} y={y0 - 6} width={14} height={6} fill={ink} />);
      else els.push(
        <text key={i} x={e.x - 6} y={y0 + 10} fontSize={30} fill={ink} style={{ fontFamily: '"Noto Music","Segoe UI Symbol",serif' }}>
          {e.dur >= 1 ? '\u{1D13D}' : '\u{1D13E}'}
        </text>,
      );
      return;
    }
    const open = e.dur >= 2;
    els.push(<ellipse key={`h${i}`} cx={e.x} cy={y0} rx={7} ry={5} transform={`rotate(-20 ${e.x} ${y0})`} fill={open ? 'none' : ink} stroke={ink} strokeWidth={1.8} />);
    if (dotted) els.push(<circle key={`d${i}`} cx={e.x + 13} cy={y0 - 2} r={2.2} fill={ink} />);
    if (e.dur < 4) els.push(<line key={`s${i}`} x1={sx} x2={sx} y1={y0 - 2} y2={stemTop} stroke={ink} strokeWidth={1.6} />);
    // An unbeamed eighth gets a flag.
    if (!e.beam && e.dur <= 0.5) els.push(<path key={`f${i}`} d={`M ${sx} ${stemTop} q 12 8 6 20`} stroke={ink} strokeWidth={2} fill="none" />);
  });

  // Beams: primary across each group; secondary (16th) between adjacent sub-notes.
  const groups = new Map<number, typeof placed>();
  placed.forEach(e => { if (e.beam) groups.set(e.beam, [...(groups.get(e.beam) || []), e]); });
  groups.forEach((g, id) => {
    const x1 = g[0].x + 6, x2 = g[g.length - 1].x + 6;
    els.push(<rect key={`b${id}`} x={x1} y={stemTop} width={x2 - x1 + 1.6} height={4.5} fill={ink} />);
    for (let i = 0; i < g.length - 1; i++) {
      if (g[i].sub && g[i + 1].sub) els.push(<rect key={`b2${id}-${i}`} x={g[i].x + 6} y={stemTop + 7} width={g[i + 1].x - g[i].x + 1.6} height={4} fill={ink} />);
    }
    if (g[0].trip) els.push(<text key={`t${id}`} x={(x1 + x2) / 2} y={stemTop - 6} fontSize={12} fontStyle="italic" fontWeight={700} fill={ink} textAnchor="middle">3</text>);
  });

  return (
    <svg viewBox={`0 0 ${W} 74`} width="100%" style={{ display: 'block' }} role="img" aria-label="rhythm bar">
      {highlight && <rect x={0} y={0} width={W} height={74} rx={10} fill={highlight} opacity={0.18} />}
      <line x1={8} x2={W - 8} y1={y0} y2={y0} stroke={ink} strokeWidth={1.2} opacity={0.5} />
      <text x={12} y={y0 - 3} fontSize={15} fontWeight={800} fill={ink}>4</text>
      <text x={12} y={y0 + 13} fontSize={15} fontWeight={800} fill={ink}>4</text>
      <line x1={W - 10} x2={W - 10} y1={y0 - 12} y2={y0 + 12} stroke={ink} strokeWidth={1.6} />
      {els}
    </svg>
  );
};

// The Score lens — the piano roll's notes engraved as notation (scoreModel.ts), drawn in SVG with
// PROPORTIONAL spacing: a beat sits at the same x as in the roll, so Split view lines up note for
// note and a click maps straight to a beat. Clef + key signature + time signature live in a sticky
// gutter (the roll's keyboard column), meter changes are marked at their bar line.
//
// Draws: grand or single staff, noteheads (filled / open), stems, flags and beams per beat, dots,
// accidentals, ledger lines, rests, ties, triplet brackets, the playhead and the selection. The
// parent owns editing: it gets pointer events for heads and for empty staff positions.

import React, { useMemo } from 'react';
import { TPB, type Clef, type Score, type ScoreElement } from '../../../../services/melos/beats/notation/scoreModel';

const G = 8;                    // staff-line gap
const STAFF_H = G * 4;
const TOP = 34;                 // room for ledger lines above
const STAFF_GAP = 64;           // treble bottom line → bass top line
const BOTTOM_PAD = 30;
const STEP_IDX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const BOTTOM_DI: Record<Clef, number> = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 }; // E4, G2
const MID_DI: Record<Clef, number> = { treble: 4 * 7 + 6, bass: 3 * 7 + 1 };    // B4, D3
const ACC_GLYPH: Record<string, string> = { sharp: '♯', flat: '♭', natural: '♮', 'double-sharp': '𝄪', 'flat-flat': '𝄫' };
// Key-signature heights (diatonic index on each clef), standard engraving positions.
const KEY_SHARP_DI: Record<Clef, number[]> = { treble: [38, 35, 39, 36, 33, 37, 34], bass: [24, 21, 25, 22, 19, 23, 20] };
const KEY_FLAT_DI: Record<Clef, number[]> = { treble: [34, 37, 33, 36, 32, 35, 31], bass: [20, 23, 19, 22, 18, 21, 17] };

export const scoreHeight = (staves: number) => TOP + STAFF_H + (staves > 1 ? STAFF_GAP + STAFF_H : 0) + BOTTOM_PAD;

export interface ScoreHit { staff: number; clef: Clef; diatonic: number; beat: number }

interface Props {
  score: Score;
  pxPerBeat: number;
  gutter: number;                 // left gutter width (the roll's keyboard column)
  width: number;                  // drawable width right of the gutter
  selected: Set<string>;
  playheadBeat: number | null;    // content beats
  cursorBeat?: number | null;     // note-input caret
  dimmed?: { from: number; to: number }[];
  onNoteDown?: (noteId: string, e: React.PointerEvent) => void;
  onEmptyDown?: (hit: ScoreHit, e: React.PointerEvent) => void;
  onEmptyDouble?: (hit: ScoreHit, e: React.MouseEvent) => void;
}

export const ScoreView: React.FC<Props> = ({ score, pxPerBeat, gutter, width, selected, playheadBeat, cursorBeat, dimmed, onNoteDown, onEmptyDown, onEmptyDouble }) => {
  const staffTop = (s: number) => TOP + s * (STAFF_H + STAFF_GAP);
  const yOf = (s: number, di: number) => staffTop(s) + STAFF_H - (di - BOTTOM_DI[score.clefs[s]]) * (G / 2);
  const H = scoreHeight(score.clefs.length);
  const xBeat = (b: number) => gutter + b * pxPerBeat;

  const hitAt = (e: { clientX: number; clientY: number }, el: Element): ScoreHit => {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // Nearest staff by its centre.
    let staff = 0, best = Infinity;
    score.clefs.forEach((_, s) => { const c = staffTop(s) + STAFF_H / 2; if (Math.abs(y - c) < best) { best = Math.abs(y - c); staff = s; } });
    const clef = score.clefs[staff];
    const diatonic = Math.round(BOTTOM_DI[clef] + (staffTop(staff) + STAFF_H - y) / (G / 2));
    return { staff, clef, diatonic, beat: (x - gutter) / pxPerBeat };
  };

  const drawn = useMemo(() => {
    const out: React.ReactNode[] = [];
    const tieStarts: { id: string; x: number; y: number; up: boolean }[] = [];
    for (const m of score.measures) {
      const mx = xBeat(m.startContent);
      // bar line (all staves)
      if (mx >= gutter - 0.5) out.push(<line key={`bl${m.index}`} x1={mx} x2={mx} y1={staffTop(0)} y2={staffTop(score.clefs.length - 1) + STAFF_H} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />);
      if (m.showTime && mx > gutter + 1) {
        score.clefs.forEach((_, s) => out.push(
          <g key={`ts${m.index}-${s}`} fontFamily="Georgia, serif" fontWeight={700} fontSize={13} fill="rgba(208,188,255,0.85)" textAnchor="middle">
            <text x={mx + 8} y={staffTop(s) + 14}>{m.num}</text><text x={mx + 8} y={staffTop(s) + 30}>{m.den}</text>
          </g>,
        ));
      }
      // Group per staff + beat for beaming.
      const beamGroups = new Map<string, ScoreElement[]>();
      for (const e of m.elements) {
        const ex = xBeat(m.startContent + e.start / TPB) + 6;
        if (ex < gutter) continue;
        const s = e.staff;
        if (e.rest) { out.push(rest(e, ex, staffTop(s), `r${m.index}-${s}-${e.start}`)); continue; }
        const dis = e.notes.map((n) => n.octave * 7 + STEP_IDX[n.step]);
        const clef = score.clefs[s];
        const up = (Math.max(...dis) + Math.min(...dis)) / 2 < MID_DI[clef];
        const open = e.type === 'half' || e.type === 'whole';
        // ledger lines
        for (const di of dis) {
          const bottom = BOTTOM_DI[clef], topDi = bottom + 8;
          for (let l = bottom - 2; l >= di; l -= 2) out.push(<line key={`lg${m.index}-${e.start}-${di}-${l}`} x1={ex - 7} x2={ex + 7} y1={yOf(s, l)} y2={yOf(s, l)} stroke="rgba(255,255,255,0.55)" />);
          for (let l = topDi + 2; l <= di; l += 2) out.push(<line key={`lu${m.index}-${e.start}-${di}-${l}`} x1={ex - 7} x2={ex + 7} y1={yOf(s, l)} y2={yOf(s, l)} stroke="rgba(255,255,255,0.55)" />);
        }
        e.notes.forEach((n, i) => {
          const di = dis[i];
          const y = yOf(s, di);
          const sel = selected.has(n.id);
          const color = sel ? '#00DAF3' : 'rgba(255,255,255,0.92)';
          // Seconds in a chord: shift the upper head across the stem.
          const clash = dis.some((d) => d === di - 1);
          const hx = ex + (clash ? (up ? 9 : -9) : 0);
          out.push(
            <ellipse key={`h${n.id}-${m.index}-${e.start}`} cx={hx} cy={y} rx={G * 0.62} ry={G * 0.44} transform={`rotate(-22 ${hx} ${y})`}
              fill={open ? 'transparent' : color} stroke={color} strokeWidth={open ? 1.6 : 1}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onPointerDown={(ev) => { ev.stopPropagation(); onNoteDown?.(n.id, ev); }} />,
          );
          if (n.accidental) out.push(<text key={`a${n.id}-${m.index}-${e.start}`} x={hx - 15} y={y + 4} fontSize={13} fill={color} style={{ pointerEvents: 'none' }}>{ACC_GLYPH[n.accidental]}</text>);
          for (let d = 0; d < e.dots; d++) out.push(<circle key={`d${n.id}-${m.index}-${e.start}-${d}`} cx={hx + 10 + d * 4} cy={y - ((di % 2 === 0) ? G / 2 : 0)} r={1.5} fill={color} />);
          if (n.tieStart) tieStarts.push({ id: n.id, x: hx, y, up: !up });
          if (n.tieStop) {
            const k = tieStarts.findIndex((t) => t.id === n.id);
            if (k >= 0) {
              const t = tieStarts.splice(k, 1)[0];
              const dy = t.up ? -7 : 7;
              out.push(<path key={`tie${n.id}-${m.index}-${e.start}`} d={`M ${t.x + 5} ${t.y + dy * 0.4} Q ${(t.x + hx) / 2} ${t.y + dy * 1.8} ${hx - 5} ${y + dy * 0.4}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1.2} />);
            }
          }
        });
        if (e.type !== 'whole') {
          const key = `${s}:${Math.floor(e.start / TPB)}`;
          if (e.type === 'eighth' || e.type === '16th') (beamGroups.get(key) ?? beamGroups.set(key, []).get(key)!).push(e);
          else out.push(stem(e, ex, dis, s, up, `st${m.index}-${s}-${e.start}`));
        }
        if (e.triplet?.start) {
          const group = m.elements.filter((x) => x.staff === s && x.triplet && Math.floor(x.start / TPB) === Math.floor(e.start / TPB));
          const x0 = ex - 4, x1 = xBeat(m.startContent + group[group.length - 1].start / TPB) + 10;
          const yb = staffTop(s) - 12;
          out.push(<g key={`tp${m.index}-${s}-${e.start}`} stroke="rgba(208,188,255,0.7)" fill="none">
            <path d={`M ${x0} ${yb + 4} L ${x0} ${yb} L ${x1} ${yb} L ${x1} ${yb + 4}`} />
            <text x={(x0 + x1) / 2} y={yb - 2} fontSize={9} fill="rgba(208,188,255,0.9)" stroke="none" textAnchor="middle">3</text>
          </g>);
        }
      }
      // Beams: 2+ eighths/16ths in a beat share a beam; a lone one gets a flag.
      for (const [key, grp] of beamGroups) {
        const s = Number(key.split(':')[0]);
        const clef = score.clefs[s];
        const xs = grp.map((e) => xBeat(m.startContent + e.start / TPB) + 6);
        const diss = grp.map((e) => e.notes.map((n) => n.octave * 7 + STEP_IDX[n.step]));
        if (grp.length === 1) { out.push(stem(grp[0], xs[0], diss[0], s, (Math.max(...diss[0]) + Math.min(...diss[0])) / 2 < MID_DI[clef], `st${key}-${m.index}`, true)); continue; }
        const avg = diss.flat().reduce((a, b) => a + b, 0) / diss.flat().length;
        const up = avg < MID_DI[clef];
        const sx = (x: number) => x + (up ? G * 0.58 : -G * 0.58);
        const tipY = (i: number) => up ? yOf(s, Math.max(...diss[i])) - 3.5 * G : yOf(s, Math.min(...diss[i])) + 3.5 * G;
        const y0 = tipY(0), y1 = tipY(grp.length - 1);
        const slope = Math.max(-0.25, Math.min(0.25, (y1 - y0) / Math.max(1, xs[xs.length - 1] - xs[0])));
        // Keep every stem at least its normal length: shift the beam line past the extreme tip.
        let off = 0;
        grp.forEach((_, i) => { const line = y0 + slope * (xs[i] - xs[0]); const need = tipY(i); off = up ? Math.min(off, need - line) : Math.max(off, need - line); });
        const beamY = (x: number) => y0 + off + slope * (x - xs[0]);
        grp.forEach((_e, i) => {
          const far = up ? yOf(s, Math.min(...diss[i])) : yOf(s, Math.max(...diss[i]));
          out.push(<line key={`bs${key}-${m.index}-${i}`} x1={sx(xs[i])} x2={sx(xs[i])} y1={far} y2={beamY(xs[i])} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />);
        });
        const bw = 3.2;
        out.push(<path key={`bm${key}-${m.index}`} d={beamPath(sx(xs[0]), beamY(xs[0]), sx(xs[xs.length - 1]), beamY(xs[xs.length - 1]), up ? bw : -bw)} fill="rgba(255,255,255,0.9)" />);
        // Second beam between consecutive 16ths.
        for (let i = 0; i < grp.length - 1; i++) {
          if (grp[i].type === '16th' && grp[i + 1].type === '16th') {
            const dy = up ? 5.5 : -5.5;
            out.push(<path key={`bm2${key}-${m.index}-${i}`} d={beamPath(sx(xs[i]), beamY(xs[i]) + dy, sx(xs[i + 1]), beamY(xs[i + 1]) + dy, up ? bw : -bw)} fill="rgba(255,255,255,0.9)" />);
          }
        }
      }
    }
    return out;

    function stem(e: ScoreElement, ex: number, dis: number[], s: number, up: boolean, key: string, flag = false): React.ReactNode {
      const hi = yOf(s, Math.max(...dis)), lo = yOf(s, Math.min(...dis));
      const x = ex + (up ? G * 0.58 : -G * 0.58);
      const y1 = up ? lo : hi;
      const y2 = up ? hi - 3.5 * G : lo + 3.5 * G;
      const flags = flag ? (e.type === '16th' ? 2 : e.type === 'eighth' ? 1 : 0) : 0;
      return (
        <g key={key} stroke="rgba(255,255,255,0.85)" fill="none" strokeWidth={1.2}>
          <line x1={x} x2={x} y1={y1} y2={y2} />
          {Array.from({ length: flags }, (_, f) => {
            const fy = y2 + (up ? f * 6 : -f * 6);
            return <path key={f} d={up ? `M ${x} ${fy} q 2 6 8 9 q -2 -2 -1 4` : `M ${x} ${fy} q 2 -6 8 -9 q -2 2 -1 -4`} strokeWidth={1.4} />;
          })}
        </g>
      );
    }
    function rest(e: ScoreElement, ex: number, top: number, key: string): React.ReactNode {
      const mid = top + STAFF_H / 2;
      const c = 'rgba(255,255,255,0.6)';
      if (e.type === 'whole') return <rect key={key} x={ex - 5} y={top + G} width={10} height={G / 2} fill={c} />;
      if (e.type === 'half') return <rect key={key} x={ex - 5} y={top + 2 * G - G / 2} width={10} height={G / 2} fill={c} />;
      if (e.type === 'quarter') return <path key={key} d={`M ${ex - 2} ${mid - 11} l 5 6 l -4 5 l 5 6 q -6 -2 -4 6`} fill="none" stroke={c} strokeWidth={1.8} />;
      const n = e.type === '16th' ? 2 : 1;
      return (
        <g key={key} fill={c} stroke={c} strokeWidth={1.3}>
          <line x1={ex + 3} y1={mid - 7} x2={ex - 2} y2={mid + 8} />
          {Array.from({ length: n }, (_, i) => <circle key={i} cx={ex - 2 + i * -1.5} cy={mid - 6 + i * 6} r={2} />)}
        </g>
      );
    }
  }, [score, pxPerBeat, gutter, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalW = gutter + width;
  return (
    <div className="relative" style={{ width: totalW, height: H }}>
      <svg width={totalW} height={H} className="block select-none" style={{ background: '#0C0C11' }}>
        {/* background hit area */}
        <rect x={gutter} y={0} width={width} height={H} fill="transparent"
          onPointerDown={(e) => onEmptyDown?.(hitAt(e, e.currentTarget.ownerSVGElement!), e)}
          onDoubleClick={(e) => onEmptyDouble?.(hitAt(e, e.currentTarget.ownerSVGElement!), e)} />
        {dimmed?.map((r, i) => (
          <rect key={`dim${i}`} x={xBeat(r.from)} y={0} width={Math.max(0, (r.to - r.from) * pxPerBeat)} height={H} fill="rgba(0,0,0,0.35)" style={{ pointerEvents: 'none' }} />
        ))}
        {/* staff lines */}
        {score.clefs.map((_, s) => Array.from({ length: 5 }, (_, l) => (
          <line key={`sl${s}-${l}`} x1={gutter} x2={totalW} y1={staffTop(s) + l * G} y2={staffTop(s) + l * G} stroke="rgba(255,255,255,0.28)" style={{ pointerEvents: 'none' }} />
        )))}
        {/* Engraving ignores the pointer; noteheads opt back in (pointer-events: all) to be grabbed. */}
        <g style={{ pointerEvents: 'none' }}>{drawn}</g>
        {playheadBeat !== null && <line x1={xBeat(playheadBeat)} x2={xBeat(playheadBeat)} y1={0} y2={H} stroke="#00DAF3" strokeWidth={2} style={{ pointerEvents: 'none' }} />}
        {cursorBeat != null && <line x1={xBeat(cursorBeat)} x2={xBeat(cursorBeat)} y1={8} y2={H - 8} stroke="#FF4D8C" strokeWidth={1.5} strokeDasharray="3 3" style={{ pointerEvents: 'none' }} />}
      </svg>
      {/* Sticky gutter (clefs + key signature) — stays put while the score scrolls sideways. */}
      <div className="sticky left-0 pointer-events-none" style={{ width: gutter, height: H, marginTop: -H }}>
        <svg width={gutter} height={H} className="block">
          <rect x={0} y={0} width={gutter} height={H} fill="#0C0C11" />
          {score.clefs.map((clef, s) => (
            <g key={`gut${s}`}>
              {Array.from({ length: 5 }, (_, l) => <line key={l} x1={0} x2={gutter} y1={staffTop(s) + l * G} y2={staffTop(s) + l * G} stroke="rgba(255,255,255,0.28)" />)}
              <text x={2} y={clef === 'treble' ? staffTop(s) + STAFF_H + 6 : staffTop(s) + 20} fontSize={clef === 'treble' ? 40 : 30}
                fontFamily="'Segoe UI Symbol','Noto Music','Bravura',serif" fill="rgba(255,255,255,0.85)">{clef === 'treble' ? '𝄞' : '𝄢'}</text>
              {Array.from({ length: Math.abs(score.fifths) }, (_, i) => {
                const di = (score.fifths > 0 ? KEY_SHARP_DI : KEY_FLAT_DI)[clef][i];
                return <text key={i} x={22 + i * 3.4} y={yOf(s, di) + 4} fontSize={11} fill="rgba(255,255,255,0.85)">{score.fifths > 0 ? '♯' : '♭'}</text>;
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

/** A beam as a filled parallelogram from (x0,y0) to (x1,y1), `t` thick toward the heads. */
function beamPath(x0: number, y0: number, x1: number, y1: number, t: number): string {
  return `M ${x0} ${y0} L ${x1} ${y1} L ${x1} ${y1 + t} L ${x0} ${y0 + t} Z`;
}

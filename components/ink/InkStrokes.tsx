import React from 'react';
import type { TelaVectorObject } from '../../types';
import { pathData, boundsOf } from '../../services/inkMath';

/**
 * Display-only rendering of committed ink (Tela Vector PATH objects carrying a flat `points` polyline).
 * Shared by Notes, the Tela Ink tool and anything that shows a drawing without editing it.
 */
interface Props {
  width: number; height: number;
  strokes: TelaVectorObject[];
  /** Ids to draw a selection box around (lasso). */
  selection?: Set<string>;
  className?: string;
}

export const inkStrokesOf = (objects: TelaVectorObject[]) => objects.filter(o => o.kind === 'PATH' && o.points);

const InkStrokes: React.FC<Props> = ({ width, height, strokes, selection, className }) => {
  const sel = selection?.size ? strokes.filter(s => selection.has(s.id) && s.points) : [];
  const box = sel.length ? boundsOf(sel.flatMap(s => s.points!), 8) : null;
  return (
    <svg width={width} height={height} className={className ?? 'absolute inset-0 pointer-events-none'} aria-hidden>
      {strokes.map(s => s.points && (
        <path key={s.id} d={pathData(s.points)} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} strokeOpacity={s.opacity} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="rgba(0,218,243,0.08)" stroke="#00DAF3" strokeDasharray="6 4" strokeWidth={1.5} />}
    </svg>
  );
};

export default InkStrokes;

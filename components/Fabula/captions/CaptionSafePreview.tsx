// What a CEA-608 decoder shows: a 15-row x 32-column grid inside the title-safe area (80% of the
// picture), white text on black cells, wrapped exactly the way the encoder wraps. Roll-up shows the
// lines still on screen from the run; pop-on / paint-on show the caption block at its bottom row.

import React from 'react';
import { wrapLines, COLS } from '../../../services/crossover/captions/cea608';
import { withSpeaker } from '../../../services/crossover/captions/cea608';
import type { CaptionCue } from '../../../services/crossover/captions';

export default function CaptionSafePreview({ cues, time, showGrid = false }: { cues: CaptionCue[]; time: number; showGrid?: boolean }) {
  const live = [...cues].reverse().find((c) => time >= c.startSec && time < c.endSec);
  let rows: { row: number; text: string; align: CaptionCue['align'] }[] = [];
  if (live) {
    if (live.mode === 'rollup') {
      const depth = live.rollRows || 3;
      const base = Math.max(depth, live.row || 15);
      // The run: earlier roll-up cues that end where the next begins (within a frame or two).
      const run: CaptionCue[] = [live];
      let cur = live;
      for (;;) {
        // A decoded roll-up line "ends" at the next line's carriage return, a few frames before that
        // line's first character — still the same run on screen.
        const prev = cues.filter((c) => c.mode === 'rollup' && c.id !== cur.id && c.startSec < cur.startSec && c.endSec <= cur.startSec + 0.001 && cur.startSec - c.endSec < 0.5).sort((a, b) => b.endSec - a.endSec)[0];
        if (!prev || run.length >= depth * 2) break;
        run.unshift(prev); cur = prev;
      }
      const lines = run.flatMap((c) => wrapLines(withSpeaker(c))).slice(-depth);
      rows = lines.map((text, i) => ({ row: base - (lines.length - 1 - i), text, align: 'left' }));
    } else {
      const lines = wrapLines(withSpeaker(live));
      const bottom = live.row || 15;
      rows = lines.map((text, i) => ({ row: bottom - (lines.length - 1 - i), text, align: live.align || 'center' }));
    }
  }
  return (
    <div style={{ position: 'absolute', left: '10%', right: '10%', top: '10%', bottom: '10%', zIndex: 61, pointerEvents: 'none', containerType: 'size' } as React.CSSProperties}>
      {showGrid && Array.from({ length: 15 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i / 15) * 100}%`, height: `${100 / 15}%`, borderTop: '1px dashed rgba(255,255,255,.12)' }} />
      ))}
      {rows.map(({ row, text, align }) => (
        <div key={row} style={{ position: 'absolute', left: 0, right: 0, top: `${((row - 1) / 15) * 100}%`, height: `${100 / 15}%`, display: 'flex', alignItems: 'center',
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }}>
          <span style={{
            background: '#000', color: '#fff', whiteSpace: 'pre',
            fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace', fontWeight: 600,
            // One cell = 1/32 of the safe width; a monospace glyph is ~0.6em wide.
            fontSize: `min(${100 / COLS / 0.6}cqw, ${(100 / 15) * 0.78}cqh)`, lineHeight: 1.15, padding: '0 0.5ch',
          }} dangerouslySetInnerHTML={{ __html: text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/&lt;(\/?)i>/g, '<$1i>') }} />
        </div>
      ))}
    </div>
  );
}

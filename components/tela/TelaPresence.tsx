// components/tela/TelaPresence.tsx — collaborators on the canvas: their pointer and a coloured ring
// (with their name) around whatever they have selected. Drawn inside the world layer, so it pans and
// zooms with the canvas; labels counter-scale so they stay readable at any zoom.

import React, { useMemo } from 'react';
import type { TelaDoc } from '../../types';
import type { Presence } from '../../services/coedit/session';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World-space rectangles of every vector object and image layer, keyed by id. */
function objectRects(doc: TelaDoc): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const frame of doc.frames) {
    for (const id of frame.deviceIds) {
      const d = doc.devices[id];
      if (!d || (d.type !== 'VECTOR' && d.type !== 'IMAGE')) continue;
      const s = d.width ? frame.w / d.width : 1;
      if (d.type === 'VECTOR') {
        for (const o of d.objects) out.set(o.id, { x: frame.x + o.x * s, y: frame.y + o.y * s, w: Math.max(4, o.w * s), h: Math.max(4, o.h * s) });
      } else {
        for (const l of d.layers) {
          const w = (l.intrinsicWidth || 400) * (l.scale || 1) * s;
          const h = (l.intrinsicHeight || 300) * (l.scale || 1) * s;
          out.set(l.id, { x: frame.x + l.x * s, y: frame.y + l.y * s, w, h });
        }
      }
      // the device itself (a selected chart, text block…) rings its whole frame
      out.set(id, { x: frame.x, y: frame.y, w: frame.w, h: frame.h });
    }
    out.set(frame.id, { x: frame.x, y: frame.y, w: frame.w, h: frame.h });
  }
  return out;
}

const Tag: React.FC<{ color: string; name: string; z: number }> = ({ color, name, z }) => (
  <span
    className="absolute left-0 whitespace-nowrap rounded-[5px] px-1.5 py-[1px] text-[11px] font-extrabold text-black"
    style={{ background: color, top: 0, transform: `translateY(-100%) scale(${1 / z})`, transformOrigin: '0 100%' }}
  >
    {name}
  </span>
);

export const TelaPresenceLayer: React.FC<{ doc: TelaDoc; presence: Presence[]; z: number }> = ({ doc, presence, z }) => {
  const rects = useMemo(() => objectRects(doc), [doc]);
  const people = presence.filter((p) => p.mode !== 'draft'); // drafts are private work
  if (!people.length) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 60 }}>
      {people.flatMap((p) =>
        (p.sel ?? []).map((id) => {
          const r = rects.get(id);
          if (!r) return null;
          return (
            <div
              key={`${p.key}:${id}`}
              style={{ position: 'absolute', left: r.x - 3 / z, top: r.y - 3 / z, width: r.w + 6 / z, height: r.h + 6 / z, border: `${2 / z}px solid ${p.color}`, borderRadius: 4 / z, boxShadow: `0 0 0 ${1 / z}px rgba(0,0,0,.35)` }}
            >
              <Tag color={p.color} name={p.name.split(' ')[0]} z={z} />
            </div>
          );
        })
      )}
      {people.map((p) =>
        p.cur ? (
          <div key={`cur:${p.key}`} style={{ position: 'absolute', left: p.cur.x, top: p.cur.y, transition: 'left 180ms linear, top 180ms linear' }}>
            <svg width={18 / z} height={18 / z} viewBox="0 0 18 18" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}>
              <path d="M2 1 L2 15 L6 11 L9 17 L11.5 16 L8.6 10 L14 10 Z" fill={p.color} stroke="#000" strokeWidth={1} strokeLinejoin="round" />
            </svg>
            <span
              className="absolute whitespace-nowrap rounded-[5px] px-1.5 py-[1px] text-[11px] font-extrabold text-black"
              style={{ background: p.color, left: 14 / z, top: 14 / z, transform: `scale(${1 / z})`, transformOrigin: '0 0' }}
            >
              {p.name.split(' ')[0]}
              {p.focus ? <span className="font-semibold opacity-70"> · {p.focus}</span> : null}
            </span>
          </div>
        ) : null
      )}
    </div>
  );
};

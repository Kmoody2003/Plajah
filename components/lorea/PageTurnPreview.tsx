// Tiny looping demo of one page-turn style, for the author's "Page-turn style" picker and the reader settings.
// Two sample pages, auto-advances every ~2s, and holds still for reduced-motion users.

import React, { useEffect, useMemo, useState } from 'react';
import PageTurn from './PageTurn';
import { useSystemReducedMotion } from './usePageTurn';
import { getSpec, type PageTurnId } from '../../services/lorea/pageTransitions';

function Sample({ n }: { n: number }) {
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', padding: '12% 10%', background: n % 2 ? '#fdf6e3' : '#f4f8f1', color: '#3b342a', fontFamily: 'Georgia, serif', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', opacity: .5 }}>Chapter</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 8px' }}>{n % 2 ? 'Two' : 'One'}</div>
      {[88, 100, 94, 70, 100, 82].map((w, i) => <div key={i} style={{ height: 5, width: `${w}%`, background: 'currentColor', opacity: .22, borderRadius: 3, marginBottom: 7 }} />)}
    </div>
  );
}

export default function PageTurnPreview({ id, rtl = false, width = 112 }: { id: PageTurnId; rtl?: boolean; width?: number }) {
  const reduced = useSystemReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced || id === 'none') return;
    const t = setInterval(() => setN(v => v + 1), 2100);
    return () => clearInterval(t);
  }, [reduced, id]);
  const turn = useMemo(() => ({ id, durationMs: getSpec(id).durationMs, interactive: false, reason: 'user' as const }), [id]);
  // Ping-pong so a style is seen forward then back without the demo book running out of pages.
  const page = n % 2;
  return (
    <div aria-hidden="true" style={{ width, height: Math.round(width * 1.3), position: 'relative' }}>
      <PageTurn pageKey={`p${n}`} order={page === 0 ? 1 : 0} turn={turn} rtl={rtl} paper="#efe8d6" radius="6px" style={{ width: '100%', height: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.4)', borderRadius: 6 }}>
        <Sample n={page} />
      </PageTurn>
    </div>
  );
}

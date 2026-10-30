// A reading document shown as the original lays it out: each PDF page at its own proportions, every line
// where the page puts it (left / top / size as a share of the page width, so it scales to any screen).
// Nothing is added or reflowed. The text eases in line by line when the document opens.

import React from 'react';
import type { LayoutPage } from '../../services/documentLayout';

const LP_CSS = `
.lp{display:grid;gap:18px;justify-items:center}
.lp-page{position:relative;width:100%;max-width:820px;background:#fdfcf9;color:#1d1a16;border-radius:4px;box-shadow:0 10px 34px rgba(0,0,0,.35);container-type:inline-size;overflow:hidden}
.lp-line{position:absolute;white-space:pre;line-height:1.12;font-family:"Helvetica Neue",Arial,system-ui,sans-serif;opacity:0;transform:translateY(.35cqw);animation:lpIn .55s cubic-bezier(.2,.7,.2,1) forwards}
.lp-line.b{font-weight:700}
.lp-line.i{font-style:italic}
@keyframes lpIn{to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.lp-line{animation:none;opacity:1;transform:none}}
`;

export default function LayoutPages({ pages, title }: { pages: LayoutPage[]; title?: string }) {
  return (
    <div className="lp" aria-label={title}>
      <style>{LP_CSS}</style>
      {pages.map((pg, pi) => (
        <div key={pi} className="lp-page" style={{ aspectRatio: `1 / ${pg.aspect}` }} role="document" aria-label={`Page ${pi + 1}`}>
          {pg.lines.map((l, li) => (
            <div
              key={li}
              className={`lp-line${l.bold ? ' b' : ''}${l.italic ? ' i' : ''}`}
              style={{
                left: `${l.x}%`,
                top: `${l.y}cqw`,
                fontSize: `${l.size * 0.9}cqw`,
                // Pages after the first are usually off screen when it opens: they don't wait their turn.
                animationDelay: `${pi === 0 ? Math.min(li * 18, 1100) : Math.min(li * 6, 300)}ms`,
              }}
            >
              {l.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

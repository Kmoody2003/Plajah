import React, { useMemo, useState } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import type { BookDraft } from '../../services/bookmeta/types';
import { sanitizeHtmlLite } from '../../services/bookmeta/util';
import { titlePageHtml } from '../../services/bookmeta/manuscript';
import { copyrightHtml } from '../../services/bookmeta/copyright';
import { checkIsbn } from '../../services/bookmeta/isbn';

type Device = 'phone' | 'tablet' | 'eink';
const DEVICES: Record<Device, { label: string; icon: React.ComponentType<{ size?: number }>; w: number; h: number; font: number; css: string; frame: string }> = {
  phone:  { label: 'Phone',  icon: Smartphone, w: 280, h: 520, font: 15, css: 'bg-[#0d0d0d] text-white/85', frame: 'rounded-[2rem] border-[7px] border-[#222]' },
  tablet: { label: 'Tablet', icon: Tablet,     w: 400, h: 520, font: 16, css: 'bg-[#faf6ee] text-[#1b1b1b]', frame: 'rounded-[1.4rem] border-[9px] border-[#222]' },
  eink:   { label: 'E-ink',  icon: Monitor,    w: 340, h: 480, font: 16, css: 'bg-[#dcd9d0] text-[#161616]', frame: 'rounded-xl border-[10px] border-[#1a1a1a]' },
};

/** First-pages preview of how the book will read on a few screens. Uses the same sanitised HTML-lite the reader renders. */
export default function DevicePreview({ draft }: { draft: BookDraft }) {
  const [dev, setDev] = useState<Device>('phone');
  const [idx, setIdx] = useState(0);
  const d = DEVICES[dev];
  const pages = useMemo(() => {
    const m = draft.metadata;
    const out: { title: string; html: string }[] = [{ title: 'Title page', html: titlePageHtml(m) }];
    if (m.includeGeneratedCopyrightPage) out.push({ title: 'Copyright', html: copyrightHtml(m, m.isbn.mode === 'own' ? checkIsbn(m.isbn.value).isbn13 : undefined) });
    for (const c of (draft.manuscript?.chapters ?? []).filter(c => c.included && (c.kind ?? 'chapter') !== 'toc').slice(0, 4)) out.push({ title: c.title, html: `<h2>${c.title.replace(/</g, '&lt;')}</h2>\n${c.html.slice(0, 6000)}` });
    return out;
  }, [draft.metadata, draft.manuscript]);
  const page = pages[Math.min(idx, pages.length - 1)];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(Object.keys(DEVICES) as Device[]).map(k => { const I = DEVICES[k].icon; return (
          <button key={k} type="button" aria-pressed={dev === k} onClick={() => setDev(k)} className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-[11px] font-black uppercase tracking-widest border ${dev === k ? 'border-amber-400/50 bg-amber-400/10 text-white' : 'border-white/10 text-white/45'}`}><I size={13} /> {DEVICES[k].label}</button>); })}
        <select aria-label="Preview page" value={idx} onChange={e => setIdx(+e.target.value)} className="ml-auto bg-white/5 border border-white/10 rounded-xl text-xs text-white/70 px-2 py-2 min-h-[40px] max-w-[180px]">
          {pages.map((p, i) => <option key={i} value={i}>{p.title.slice(0, 28)}</option>)}
        </select>
      </div>
      <div className="flex justify-center overflow-x-auto py-2">
        <div className={`${d.frame} shadow-2xl flex-shrink-0 overflow-hidden`} style={{ width: d.w, maxWidth: '100%' }}>
          <div className={`${d.css} overflow-y-auto px-5 py-6 leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:text-center [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-3 [&_p]:mb-3 [&_p]:indent-0 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:opacity-80`}
            style={{ height: d.h, fontSize: d.font, fontFamily: dev === 'phone' ? 'system-ui, sans-serif' : 'Georgia, "Times New Roman", serif', filter: dev === 'eink' ? 'grayscale(1) contrast(1.05)' : undefined }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtmlLite(page?.html || '<p>Nothing to preview yet.</p>') }} />
        </div>
      </div>
      <p className="text-[11px] text-white/30 text-center mt-2">Approximation only. Readers can change font, size and margins; your book should survive that.</p>
    </div>
  );
}

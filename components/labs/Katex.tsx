// Shared KaTeX renderer (CDN, lazy, idempotent) for the Labs studios.
import React, { useEffect, useState } from 'react';

let katexLoaded = false, katexLoading = false;
const cbs: (() => void)[] = [];
function loadKaTeX(): Promise<void> {
  return new Promise(resolve => {
    if (katexLoaded) { resolve(); return; }
    cbs.push(resolve);
    if (katexLoading) return;
    katexLoading = true;
    if (typeof document === 'undefined') { resolve(); return; }
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css'; link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    s.onload = () => { katexLoaded = true; cbs.forEach(cb => cb()); cbs.length = 0; };
    s.onerror = () => { cbs.forEach(cb => cb()); cbs.length = 0; };
    document.head.appendChild(s);
  });
}

const Katex: React.FC<{ latex: string; display?: boolean }> = ({ latex, display = true }) => {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let a = true;
    loadKaTeX().then(() => {
      const k = (window as any).katex;
      if (a && k) { try { setHtml(k.renderToString(latex, { displayMode: display, throwOnError: false, output: 'html' })); } catch { /* */ } }
    });
    return () => { a = false; };
  }, [latex, display]);
  return html
    ? <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />
    : <code className="text-[12px] text-white/50 font-mono">{latex}</code>;
};

export default Katex;

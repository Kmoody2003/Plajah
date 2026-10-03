import React, { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';

/**
 * The Lorea page body in "folio" style (the book page we built for Academia lessons, adapted for books).
 *
 * It does not bring its own theme. BookReader already owns the reading theme, font, size, columns and the
 * orange read-along highlight, so this component takes all of those as props and only adds the page craft on top:
 * a hand-drawn rule, a drop cap on the first paragraph of a chapter, scene-break ornaments, figures set as plates
 * between paragraphs, an optional original-scan pair view, and a quiet page number.
 *
 * The text and figures are separate inputs. Today's text path supplies `paras` only; the EPUB, PDF and scan
 * adapters will supply `figures` and `scanUrl` per page without changing this component.
 */
export interface BookFigure { afterPara: number; src: string; alt: string; caption?: string }
type ReadingTheme = 'DEFAULT' | 'SEPIA' | 'DARK' | 'PAPER' | 'VIOLET';

interface Props {
  paras: string[];
  chapterTitle: string;
  bookTitle: string;
  author?: string;
  pageNo: number;
  pageCount: number;
  /** First page of a chapter: shows the header, rule and drop cap. */
  chapterStart: boolean;
  /** The cover banner already shows the chapter title, so the header only adds the kicker and rule. */
  titleShownElsewhere?: boolean;
  readingTheme: ReadingTheme;
  fontFamily: 'sans' | 'serif' | 'mono';
  /** Reader font-size percent and display-mode scale, exactly as the classic view applies them. */
  fontSizePct: number;
  doubleColumn: boolean;
  readAlong: { para: number; word: number } | null;
  wordRef: React.MutableRefObject<HTMLSpanElement | null>;
  onReadFrom?: (paraIndex: number) => void;
  figures?: BookFigure[];
  scanUrl?: string;
  /** Lazy original-page image (PDF): called only when the reader asks to see the page. */
  loadScan?: () => Promise<string>;
  easy: boolean;
  calm: boolean;
  seed: string;
}

// Palette per existing reading theme. `acc` mirrors the heading colour the classic view already uses.
const PALETTE: Record<ReadingTheme, { ink: string; mute: string; acc: string; line: string; hi: string }> = {
  SEPIA: { ink: '#4a3728', mute: 'rgba(74,55,40,.62)', acc: '#7a4f2b', line: 'rgba(122,79,43,.28)', hi: 'rgba(234,120,30,.30)' },
  PAPER: { ink: '#1a1a1a', mute: 'rgba(26,26,26,.55)', acc: '#c2410c', line: 'rgba(0,0,0,.16)', hi: 'rgba(249,115,22,.28)' },
  DARK: { ink: '#c8c8c8', mute: 'rgba(200,200,200,.5)', acc: 'var(--color-small-orange, #f97316)', line: 'rgba(255,255,255,.14)', hi: 'rgba(249,115,22,.42)' },
  VIOLET: { ink: '#e6e0f5', mute: 'rgba(230,224,245,.55)', acc: '#a98bff', line: 'rgba(169,139,255,.22)', hi: 'rgba(169,139,255,.30)' },
  DEFAULT: { ink: 'rgba(255,255,255,.85)', mute: 'rgba(255,255,255,.5)', acc: 'var(--color-small-orange, #f97316)', line: 'rgba(255,255,255,.14)', hi: 'rgba(249,115,22,.42)' },
};

let fontsAdded = false;
function ensureFonts() {
  if (fontsAdded || typeof document === 'undefined') return;
  fontsAdded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Cormorant+Garamond:wght@500;600&family=Atkinson+Hyperlegible:wght@400;700&display=swap';
  document.head.appendChild(l);
}

/** Stable per-book hash so each book keeps one hand-drawn rule, never a changing one. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function wobblyRule(seed: number, width = 600, steps = 12, amp = 1.1): string {
  const r = (n: number) => { let s = (seed + n * 374761393) >>> 0; s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296; };
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) pts.push(`${i === 0 ? 'M' : 'L'}${((width * i) / steps).toFixed(1)} ${(2 + (r(i) - 0.5) * 2 * amp).toFixed(2)}`);
  return pts.join(' ');
}

const SCENE_BREAK = /^\s*(?:[*•·]\s*){3,}\s*$|^\s*[-–—_=]{3,}\s*$/;

const CSS = `
.lbp{font-size:var(--lbp-fs);line-height:var(--lbp-lh);color:var(--lbp-ink);position:relative}
.lbp.easy{font-family:"Atkinson Hyperlegible",Verdana,sans-serif;letter-spacing:.02em;--lbp-lh:1.95}
.lbp-head{margin-bottom:1.7em;max-width:34em}
.lbp-kick{font:600 .6em/1.3 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--lbp-mute)}
.lbp-title{font:600 1.9em/1.1 "Cormorant Garamond",Georgia,serif;margin:.3em 0 .1em;color:var(--lbp-acc);text-wrap:balance}
.lbp.easy .lbp-title{font-family:"Atkinson Hyperlegible",Verdana,sans-serif;font-weight:700;font-size:1.6em}
.lbp-rule{display:block;width:100%;max-width:9em;height:6px;margin-top:.5em;color:var(--lbp-acc)}
.lbp-cols{max-width:34em}
.lbp-cols.two{max-width:none;columns:1;column-gap:3em;column-rule:1px solid var(--lbp-line)}
@media(min-width:768px){.lbp-cols.two{columns:2}}
.lbp-p{margin:0 0 1.05em;position:relative;text-wrap:pretty}
.lbp-cols.two .lbp-p{break-inside:avoid-column}
.lbp:not(.easy) .lbp-p.dc::first-letter{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:3.5em;line-height:.8;float:left;padding:.07em .1em 0 0;color:var(--lbp-acc)}
.lbp-p.cur{color:var(--lbp-ink)}
.lbp-w{border-radius:4px;transition:opacity .15s,background .15s}
.lbp-w.done{opacity:.55}
.lbp-w.on{background:var(--lbp-hi);padding:0 .22em;margin:0 -.22em;box-shadow:0 0 14px var(--lbp-hi)}
.lbp.calm .lbp-w.on{box-shadow:none;background:none;text-decoration:underline;text-decoration-color:var(--lbp-acc);text-decoration-thickness:3px;text-underline-offset:4px}
.lbp-play{position:absolute;left:-2.3em;top:.28em;width:1.7em;height:1.7em;border-radius:50%;border:1px solid var(--lbp-line);background:transparent;color:var(--lbp-acc);display:grid;place-items:center;opacity:0;cursor:pointer;transition:opacity .15s}
.lbp-p:hover .lbp-play,.lbp-play:focus-visible{opacity:1}
.lbp-play:focus-visible{outline:2px solid var(--lbp-acc);outline-offset:2px}
@media(max-width:900px){.lbp-play{display:none}}
.lbp-orn{text-align:center;letter-spacing:.7em;margin:1.4em 0;color:var(--lbp-mute)}
.lbp-fig{margin:1.5em 0 1.7em;border-block:1px solid var(--lbp-line);padding:.9em 0;break-inside:avoid;display:grid;gap:.6em}
.lbp-fig img{display:block;max-width:100%;max-height:26em;margin:0 auto;border-radius:4px;object-fit:contain}
.lbp-fig figcaption{font-style:italic;font-size:.88em;line-height:1.5;color:var(--lbp-mute);text-align:center}
.lbp-fig figcaption b{display:block;font:600 .7em/1 system-ui,sans-serif;font-style:normal;letter-spacing:.18em;text-transform:uppercase;color:var(--lbp-acc);margin-bottom:.4em}
.lbp-no{text-align:center;font:500 .62em/1 system-ui,sans-serif;letter-spacing:.2em;color:var(--lbp-mute);margin-top:2.2em}
.lbp-bar{display:flex;gap:8px;margin-bottom:1.4em;font:600 10px/1 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase}
.lbp-bar button{border:1px solid var(--lbp-line);background:transparent;color:var(--lbp-mute);border-radius:999px;padding:7px 12px;cursor:pointer}
.lbp-bar button[aria-pressed="true"]{color:var(--lbp-acc);border-color:var(--lbp-acc)}
.lbp-pair{display:grid;gap:2em;grid-template-columns:minmax(0,1fr)}
@media(min-width:900px){.lbp-pair.on{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.lbp-scan{position:sticky;top:0;align-self:start}
.lbp-scan img{width:100%;border-radius:4px;border:1px solid var(--lbp-line);box-shadow:0 8px 24px rgba(0,0,0,.25)}
.lbp-scan span{display:block;font:600 10px/1 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--lbp-mute);margin-bottom:8px}
@keyframes lbp-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes lbp-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.lbp:not(.calm) .lbp-p,.lbp:not(.calm) .lbp-fig{animation:lbp-rise .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*70ms)}
.lbp:not(.calm) .lbp-rule path{stroke-dasharray:1;animation:lbp-draw 1.1s ease-out .15s both}
@media(prefers-reduced-motion:reduce){.lbp .lbp-p,.lbp .lbp-fig,.lbp .lbp-rule path{animation:none!important}}
`;

const BookFolioBody: React.FC<Props> = ({
  paras, chapterTitle, bookTitle, author, pageNo, pageCount, chapterStart, titleShownElsewhere,
  readingTheme, fontFamily, fontSizePct, doubleColumn, readAlong, wordRef, onReadFrom,
  figures, scanUrl, loadScan, easy, calm, seed,
}) => {
  const [showScan, setShowScan] = useState(false);
  const [lazyScan, setLazyScan] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  useEffect(() => { ensureFonts(); }, []);
  useEffect(() => { setShowScan(false); setLazyScan(null); }, [scanUrl, loadScan]);
  const scanSrc = scanUrl || lazyScan;
  const toggleScan = () => {
    if (showScan) { setShowScan(false); return; }
    setShowScan(true);
    if (!scanSrc && loadScan) { setScanBusy(true); loadScan().then(setLazyScan).catch(() => setShowScan(false)).finally(() => setScanBusy(false)); }
  };

  const pal = PALETTE[readingTheme] || PALETTE.DEFAULT;
  const rule = useMemo(() => wobblyRule(seedOf(seed || bookTitle)), [seed, bookTitle]);
  const figsAfter = useMemo(() => {
    const m = new Map<number, BookFigure[]>();
    for (const f of figures || []) (m.get(f.afterPara) || m.set(f.afterPara, []).get(f.afterPara)!).push(f);
    return m;
  }, [figures]);

  // Serif is the book face; the reader's Mono choice is respected, and Easier to read swaps to Atkinson.
  const face = easy ? '"Atkinson Hyperlegible", Verdana, sans-serif'
    : fontFamily === 'mono' ? 'ui-monospace, Menlo, Consolas, monospace' : '"Source Serif 4", Georgia, serif';
  const firstTextIdx = paras.findIndex(p => !SCENE_BREAK.test(p));

  const style: React.CSSProperties = {
    ['--lbp-ink' as any]: pal.ink, ['--lbp-mute' as any]: pal.mute, ['--lbp-acc' as any]: pal.acc,
    ['--lbp-line' as any]: pal.line, ['--lbp-hi' as any]: pal.hi,
    ['--lbp-fs' as any]: `${(18 * fontSizePct) / 100}px`, ['--lbp-lh' as any]: 1.75,
    fontFamily: face,
  };

  const body = (
    <div>
      {chapterStart && (
        <header className="lbp-head">
          <div className="lbp-kick">{bookTitle}{author ? ` · ${author}` : ''}</div>
          {!titleShownElsewhere && <h3 className="lbp-title">{chapterTitle}</h3>}
          <svg className="lbp-rule" viewBox="0 0 600 4" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d={rule} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </header>
      )}
      <div className={`lbp-cols${doubleColumn ? ' two' : ''}`}>
        {(figsAfter.get(-1) || []).map((f, k) => (
          <figure key={`f-${k}`} className="lbp-fig">
            <img src={f.src} alt={f.alt} loading="lazy" />
            {f.caption && <figcaption><b>Plate</b>{f.caption}</figcaption>}
          </figure>
        ))}
        {paras.map((para, i) => {
          if (SCENE_BREAK.test(para)) return <div key={i} className="lbp-orn" aria-hidden="true">{'· · ·'}</div>;
          const active = readAlong?.para === i;
          const dc = chapterStart && i === firstTextIdx && para.length > 80;
          return (
            <React.Fragment key={i}>
              <p className={`lbp-p${dc ? ' dc' : ''}${active ? ' cur' : ''}`} style={{ ['--i' as any]: Math.min(i, 9) }} onDoubleClick={() => onReadFrom?.(i)}>
                {onReadFrom && <button type="button" className="lbp-play" aria-label="Read aloud from here" onClick={() => onReadFrom(i)}><Play size={11} fill="currentColor" /></button>}
                {active
                  ? (() => {
                      // Word spans exist only on the paragraph being read, so long pages stay light.
                      let w = 0;
                      return para.split(/(\s+)/).map((tok, k) => {
                        if (!tok || /^\s+$/.test(tok)) return tok;
                        const idx = w++;
                        const cur = idx === readAlong!.word;
                        return <span key={k} ref={cur ? wordRef : undefined} className={`lbp-w${cur ? ' on' : idx < readAlong!.word ? ' done' : ''}`}>{tok}</span>;
                      });
                    })()
                  : para}
              </p>
              {(figsAfter.get(i) || []).map((f, k) => (
                <figure key={`f${i}-${k}`} className="lbp-fig" style={{ ['--i' as any]: Math.min(i + 1, 9) }}>
                  <img src={f.src} alt={f.alt} loading="lazy" />
                  {f.caption && <figcaption><b>Plate</b>{f.caption}</figcaption>}
                </figure>
              ))}
            </React.Fragment>
          );
        })}
      </div>
      <div className="lbp-no">{pageNo} / {pageCount}</div>
    </div>
  );

  return (
    <div className={`lbp${easy ? ' easy' : ''}${calm ? ' calm' : ''}`} style={style}>
      <style>{CSS}</style>
      {(scanUrl || loadScan) && (
        <div className="lbp-bar">
          <button type="button" aria-pressed={showScan} onClick={toggleScan}>{showScan ? 'Hide original page' : 'Show original page'}</button>
        </div>
      )}
      {(scanUrl || loadScan) && showScan ? (
        <div className="lbp-pair on">
          {body}
          <div className="lbp-scan"><span>Original page · {pageNo}</span>{scanSrc ? <img src={scanSrc} alt={`Original of page ${pageNo}`} /> : <span>{scanBusy ? 'Loading the page…' : ''}</span>}</div>
        </div>
      ) : body}
    </div>
  );
};

export default BookFolioBody;

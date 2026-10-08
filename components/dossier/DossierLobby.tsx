import React, { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { DOSSIERS } from '../../data/dossier/registry';
import { DEFAULT_THEME, fitTitleCqw, inkOn } from '../../services/dossier/dossierTheme';
import { ensureDossierFonts } from './dossierFonts';

interface Props {
  onChoose: (id: string) => void;
  onBack?: () => void;
}

const KIND_LABEL = { biography: 'Biography', topic: 'Topic' } as const;
const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

/**
 * The lobby is a quad of tall panels, one per exhibit, each in its own ink, ground and display face.
 * The whole lobby fits the viewport: the header is compact and the panels share what is left.
 */
const CSS = `
.dl{height:100%;min-height:560px;display:flex;flex-direction:column;background:#0b0a0d;color:#f4efe6;font-family:'Inter',system-ui,sans-serif;position:relative;overflow:hidden}
.dl *{box-sizing:border-box}
.dl-serif{font-family:'Fraunces',Georgia,'Times New Roman',serif}
.dl-top{padding:10px 22px 0;flex:none}
.dl-back{display:inline-flex;align-items:center;gap:6px;background:none;border:0;color:rgba(244,239,230,.7);font-size:15px;cursor:pointer;padding:4px 0}
.dl-back:hover{color:#fff}
.dl-head{flex:none;display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 22px;padding:clamp(8px,1.6vh,20px) clamp(16px,3vw,44px) clamp(10px,1.8vh,22px)}
.dl-h1{margin:0;font-size:clamp(28px,3.6vw,56px);font-weight:800;line-height:1;letter-spacing:-.02em;animation:dlRise .8s ease both}
.dl-sub{color:#cfc8bc;font-size:clamp(16px,1.3vw,19px);animation:dlFade 1.2s ease .3s both}
.dl-row{flex:1;min-height:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(8px,1vw,16px);padding:0 clamp(12px,2vw,32px) clamp(12px,2vw,28px)}
.dl-card{--a:#f0c987;--b:#121014;--ink:#0b0a0d;position:relative;container-type:size;min-height:0;overflow:hidden;border:1px solid color-mix(in srgb,var(--a) 28%,transparent);border-top:4px solid var(--a);border-radius:4px;
  background:var(--b);cursor:pointer;text-align:left;color:inherit;padding:0;animation:dlRise .9s cubic-bezier(.2,.7,.2,1) both;transition:transform .4s cubic-bezier(.2,.7,.2,1),box-shadow .4s,border-color .3s}
.dl-card:nth-child(2){animation-delay:.1s}.dl-card:nth-child(3){animation-delay:.2s}.dl-card:nth-child(4){animation-delay:.3s}.dl-card:nth-child(5){animation-delay:.4s}
/* Five exhibits: five columns on a wide screen; two rows (three over two) on a laptop; the last card spans the row on a tablet. */
.dl-row[data-n="5"]{grid-template-columns:repeat(5,minmax(0,1fr))}
@media(max-width:1399px){.dl-row[data-n="5"]{grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.dl-row[data-n="5"] .dl-card{grid-column:span 2}.dl-row[data-n="5"] .dl-card:nth-child(n+4){grid-column:span 3}}
.dl-card:hover,.dl-card:focus-visible{transform:translateY(-5px);border-color:var(--a);box-shadow:0 26px 70px rgba(0,0,0,.6),0 0 0 2px var(--a);outline:none}
.dl-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 22%;transform:scale(1.02);transition:transform 9s ease-out}
.dl-card:hover img,.dl-card:focus-visible img{transform:scale(1.12)}
.dl-fallback{position:absolute;inset:0;background:linear-gradient(160deg,color-mix(in srgb,var(--a) 25%,var(--b)),var(--b) 70%)}
.dl-scrim{position:absolute;inset:0;background:linear-gradient(0deg,var(--b) 10%,color-mix(in srgb,var(--b) 92%,transparent) 42%,color-mix(in srgb,var(--b) 55%,transparent) 68%,transparent 100%)}
.dl-body{position:absolute;left:0;right:0;bottom:0;padding:0 clamp(14px,6cqw,26px) clamp(14px,4cqh,24px)}
.dl-years{font-size:clamp(15px,5cqw,18px);font-weight:600;color:var(--a);margin-bottom:6px}
.dl-script{display:flex;align-items:baseline;gap:10px;margin-bottom:4px;flex-wrap:wrap}
.dl-script b{font-weight:400;font-size:clamp(26px,10cqw,44px);line-height:1.5;color:var(--a);text-shadow:0 2px 14px #000,0 0 3px #000;padding:0 10px;border-radius:6px;background:color-mix(in srgb,var(--b) 72%,transparent)}
.dl-script span{font-size:14px;color:#d9d2c5}
.dl-title{margin:0;line-height:.9;text-wrap:balance;text-shadow:0 4px 30px rgba(0,0,0,.6)}
.dl-tag{margin-top:clamp(8px,2cqh,14px);font-family:'Source Serif 4',Georgia,serif;font-size:clamp(16px,5.2cqw,19px);color:#e9e2d5;line-height:1.4;max-width:30ch}
.dl-enter{margin-top:clamp(10px,2.4cqh,16px);display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:700;color:var(--ink);background:var(--a);padding:9px 18px;border-radius:999px}
.dl-kind{position:absolute;top:12px;left:12px;font-size:14px;font-weight:500;background:rgba(7,5,10,.62);backdrop-filter:blur(6px);border-radius:999px;padding:4px 12px;color:#e8e1d4}
@container (max-height:430px){.dl-tag{display:none}}
@keyframes dlRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes dlFade{from{opacity:0}to{opacity:1}}
@media(max-width:1000px){
  .dl{height:auto;min-height:100%;overflow:visible}
  .dl-row,.dl-row[data-n="5"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:none;grid-auto-rows:minmax(300px,calc((100dvh - 150px)/2))}
  .dl-row[data-n="5"] .dl-card,.dl-row[data-n="5"] .dl-card:nth-child(n+4){grid-column:auto}
  .dl-row[data-n="5"] .dl-card:nth-child(5){grid-column:1 / -1}
}
@media(max-width:620px){
  .dl-row,.dl-row[data-n="5"]{grid-template-columns:1fr;grid-auto-rows:minmax(340px,92vw)}
  .dl-row[data-n="5"] .dl-card:nth-child(5){grid-column:auto}
  .dl-card:hover{transform:none}
}
@media(prefers-reduced-motion:reduce){.dl *{animation:none!important;transition:none!important}.dl-card:hover img{transform:none}}
`;

export default function DossierLobby({ onChoose, onBack }: Props) {
  useEffect(() => { ensureDossierFonts(DOSSIERS.map(d => d.theme ?? DEFAULT_THEME)); }, []);
  return (
    <div className="dl">
      <style>{CSS}</style>
      {onBack && <div className="dl-top"><button className="dl-back" onClick={onBack}><ArrowLeft size={16} /> Back</button></div>}
      <header className="dl-head">
        <h1 className="dl-h1 dl-serif">The Exhibition Hall</h1>
        <div className="dl-sub">{COUNT_WORD[DOSSIERS.length] ?? DOSSIERS.length} exhibits, each researched, sourced and told at every reading level.</div>
      </header>
      <div className="dl-row" data-n={DOSSIERS.length}>
        {DOSSIERS.map(d => {
          const t = d.theme ?? DEFAULT_THEME;
          const title = t.heroTitle ?? d.title;
          const cqw = fitTitleCqw(title, t);
          return (
            <button key={d.id} className="dl-card" onClick={() => onChoose(d.id)} aria-label={`Enter ${d.title}`}
              style={{ ['--a' as string]: t.accent, ['--b' as string]: t.bg, ['--ink' as string]: inkOn(t.accent) } as React.CSSProperties}>
              {d.heroUrl ? <img src={d.heroUrl} alt="" loading="lazy" /> : <div className="dl-fallback" />}
              <div className="dl-scrim" />
              <span className="dl-kind">{KIND_LABEL[d.kind]}</span>
              <div className="dl-body">
                {t.script && (
                  <div className="dl-script">
                    <b lang="und" dir={t.script.dir ?? 'auto'} style={{ fontFamily: t.script.font }}>{t.script.word}</b>
                    <span>{t.script.reading}</span>
                  </div>
                )}
                {d.years && <div className="dl-years">{d.years}</div>}
                <h2 className="dl-title" style={{
                  fontFamily: t.display, textTransform: t.upper ? 'uppercase' : 'none', fontWeight: t.upper ? 400 : 700,
                  letterSpacing: t.upper ? '-.01em' : '-.025em', fontSize: `clamp(28px, min(${cqw}cqw, 21cqh), 150px)`,
                }}>{title}</h2>
                <div className="dl-tag">{d.tagline}</div>
                <span className="dl-enter">Enter <ArrowRight size={16} /></span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

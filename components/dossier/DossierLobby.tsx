import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { DOSSIERS } from '../../data/dossier/registry';

interface Props {
  onChoose: (id: string) => void;
  onBack?: () => void;
}

const KIND_LABEL = { biography: 'Biography', topic: 'Topic' } as const;

const CSS = `
.dl{min-height:100%;background:radial-gradient(1100px 600px at 50% -10%,rgba(107,0,153,.35),transparent 62%),#07050a;color:#f2ecf6;font-family:'Inter',system-ui,sans-serif;position:relative;overflow:hidden}
.dl *{box-sizing:border-box}
.dl-serif{font-family:'Fraunces',Georgia,'Times New Roman',serif}
.dl-top{padding:16px 22px}
.dl-back{display:inline-flex;align-items:center;gap:6px;background:none;border:0;color:rgba(242,236,246,.6);font-size:13px;cursor:pointer}
.dl-back:hover{color:#fff}
.dl-head{text-align:center;padding:clamp(18px,5vh,64px) 20px clamp(18px,4vh,44px)}
.dl-kick{font-size:11px;letter-spacing:.5em;text-transform:uppercase;color:rgba(242,236,246,.55);animation:dlFade 1.4s ease both}
.dl-h1{margin:14px 0 10px;font-size:clamp(34px,6vw,84px);font-weight:500;line-height:1.02;animation:dlRise 1.2s ease .15s both}
.dl-sub{color:#f0c987;font-size:clamp(14px,1.6vw,20px);animation:dlFade 1.6s ease .5s both}
.dl-row{display:flex;gap:clamp(14px,2vw,28px);justify-content:center;flex-wrap:wrap;padding:0 clamp(16px,4vw,56px) 64px;max-width:1500px;margin:0 auto}
.dl-card{position:relative;flex:1 1 300px;max-width:440px;height:clamp(380px,62vh,620px);border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.12);
  background:#0d0b10;cursor:pointer;text-align:left;color:inherit;padding:0;animation:dlRise 1s ease both;transition:transform .5s cubic-bezier(.2,.7,.2,1),box-shadow .5s,border-color .4s}
.dl-card:nth-child(2){animation-delay:.12s}.dl-card:nth-child(3){animation-delay:.24s}
.dl-card:hover,.dl-card:focus-visible{transform:translateY(-6px);border-color:rgba(240,201,135,.6);box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 50px rgba(240,201,135,.12);outline:none}
.dl-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 25%;filter:sepia(.5) contrast(1.1) brightness(.72);transition:transform 9s ease-out,filter .6s}
.dl-card:hover img,.dl-card:focus-visible img{transform:scale(1.12);filter:sepia(.35) contrast(1.1) brightness(.85)}
.dl-fallback{position:absolute;inset:0;background:linear-gradient(160deg,#2a1636,#0d0b10 70%)}
.dl-scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(7,5,10,.96) 0%,rgba(7,5,10,.5) 45%,rgba(7,5,10,.25) 70%,rgba(7,5,10,.6) 100%)}
.dl-body{position:absolute;left:0;right:0;bottom:0;padding:22px 22px 24px}
.dl-years{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#f0c987}
.dl-title{font-size:clamp(26px,3vw,38px);margin:8px 0 6px;font-weight:500;line-height:1.08}
.dl-tag{font-size:14px;color:rgba(242,236,246,.75);line-height:1.45;max-width:30ch}
.dl-enter{margin-top:16px;display:inline-block;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#f0c987;border:1px solid rgba(240,201,135,.55);padding:9px 18px;border-radius:999px;transition:background .3s,color .3s}
.dl-card:hover .dl-enter,.dl-card:focus-visible .dl-enter{background:#f0c987;color:#07050a}
.dl-kind{position:absolute;top:14px;left:14px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;border:1px solid rgba(255,255,255,.3);background:rgba(7,5,10,.55);backdrop-filter:blur(6px);border-radius:999px;padding:4px 10px;color:rgba(242,236,246,.85)}
@keyframes dlRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes dlFade{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.dl *{animation:none!important;transition:none!important}.dl-card:hover img{transform:none}}
`;

export default function DossierLobby({ onChoose, onBack }: Props) {
  return (
    <div className="dl">
      <style>{CSS}</style>
      {onBack && <div className="dl-top"><button className="dl-back" onClick={onBack}><ArrowLeft size={16} /> Back</button></div>}
      <header className="dl-head">
        <div className="dl-kick">A Plajah Dossier collection</div>
        <h1 className="dl-h1 dl-serif">The Exhibition Hall</h1>
        <div className="dl-sub dl-serif">Three lives and stories, each researched, sourced and told at every reading level.</div>
      </header>
      <div className="dl-row">
        {DOSSIERS.map(d => (
          <button key={d.id} className="dl-card" onClick={() => onChoose(d.id)} aria-label={`Enter ${d.title}`}>
            {d.heroUrl ? <img src={d.heroUrl} alt="" loading="lazy" /> : <div className="dl-fallback" />}
            <div className="dl-scrim" />
            <span className="dl-kind">{KIND_LABEL[d.kind]}</span>
            <div className="dl-body">
              {d.years && <div className="dl-years">{d.years}</div>}
              <div className="dl-title dl-serif">{d.title}</div>
              <div className="dl-tag dl-serif">{d.tagline}</div>
              <span className="dl-enter">Enter</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

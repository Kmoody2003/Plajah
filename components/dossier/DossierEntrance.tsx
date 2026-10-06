import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, SkipForward } from 'lucide-react';
import type { Dossier } from '../../services/dossier/dossierTypes';
import { commonsThumb } from '../../services/dossier/sourceAdapters';

interface Props {
  dossier: Dossier;
  onEnter: () => void;
}

/** Seconds each portrait holds; the whole montage is FRAME * count. */
const FRAME = 2.1;

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const css = (n: number) => {
  const total = n * FRAME;
  return `
.dx{position:fixed;inset:0;z-index:60;background:#050408;color:#f2ecf6;overflow:hidden;font-family:'Inter',system-ui,sans-serif;
  --dx-gold:#f0c987;--dx-fx:50%}
.dx *{box-sizing:border-box}
.dx-serif{font-family:'Fraunces',Georgia,'Times New Roman',serif}
.dx-frame{position:absolute;inset:0;opacity:0;will-change:transform,opacity}
.dx-frame img{position:absolute;max-width:none;width:auto;
  -webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 24%,#000 76%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0%,#000 24%,#000 76%,transparent 100%);
  filter:sepia(.55) contrast(1.12) brightness(.8) saturate(.85)}
.dx-tint{position:absolute;inset:0;background:linear-gradient(180deg,rgba(107,0,153,.38),rgba(255,140,0,.16));mix-blend-mode:soft-light}
.dx-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,transparent 28%,rgba(5,4,8,.78) 78%,#050408 100%)}
.dx-scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(5,4,8,.92) 0%,rgba(5,4,8,.35) 42%,rgba(5,4,8,.55) 100%)}
.dx-grain{position:absolute;inset:-50%;background-image:${GRAIN};opacity:.09;mix-blend-mode:overlay;animation:dxGrain .9s steps(6) infinite}
.dx-bar{position:absolute;left:0;right:0;height:11vh;background:#000;z-index:5}
.dx-bar.t{top:0;animation:dxBarT 1.6s cubic-bezier(.7,0,.2,1) both}
.dx-bar.b{bottom:0;animation:dxBarB 1.6s cubic-bezier(.7,0,.2,1) both}
.dx-kicker{position:absolute;top:50%;left:0;right:0;text-align:center;letter-spacing:.5em;font-size:11px;text-transform:uppercase;color:rgba(242,236,246,.7);
  opacity:0;animation:dxKicker 2.4s ease .4s both}
.dx-year{position:absolute;left:clamp(24px,6vw,96px);bottom:calc(11vh + 22px);font-size:13px;letter-spacing:.3em;color:var(--dx-gold);z-index:4;font-variant-numeric:tabular-nums}
.dx-year span{position:absolute;left:0;bottom:0;opacity:0}
.dx-stage{position:absolute;top:11vh;bottom:11vh;left:0;right:0;z-index:4;display:flex;flex-direction:column;justify-content:space-between;align-items:center;padding:clamp(14px,5vh,64px) 6vw clamp(12px,3vh,32px)}
.dx-title{text-align:center;pointer-events:none;margin-top:clamp(0px,4vh,48px)}
.dx-bottom{display:flex;flex-direction:column;align-items:center;gap:clamp(10px,2.6vh,24px);width:100%}
.dx-title h1{margin:0;font-weight:500;font-size:clamp(36px,min(9.5vw,17vh),148px);line-height:1;letter-spacing:.01em;text-shadow:0 8px 60px rgba(0,0,0,.85)}
.dx-word{display:inline-block;white-space:nowrap}
.dx-title h1 .dx-ch{display:inline-block;opacity:0;animation:dxLetter 1.1s cubic-bezier(.2,.7,.2,1) both}
.dx-tag{margin-top:clamp(10px,2vw,22px);font-size:clamp(15px,1.9vw,24px);color:var(--dx-gold);letter-spacing:.04em;opacity:0;animation:dxFade 1.4s ease both}
.dx-dates{margin-top:10px;font-size:clamp(12px,1.3vw,16px);letter-spacing:.42em;color:rgba(242,236,246,.65);opacity:0;animation:dxFade 1.4s ease both}
.dx-epi{text-align:center;opacity:0;animation:dxFade 1.8s ease both}
.dx-epi q{display:block;font-style:italic;font-size:clamp(14px,min(2.1vw,3.4vh),28px);line-height:1.45;max-width:30ch;margin:0 auto;quotes:"\\201C" "\\201D"}
.dx-epi cite{display:block;margin-top:10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,236,246,.55);font-style:normal}
.dx-cta{display:flex;justify-content:center;opacity:0;animation:dxFade 1.2s ease both}
.dx-btn{border:1px solid rgba(240,201,135,.7);background:rgba(5,4,8,.45);color:var(--dx-gold);padding:13px 34px;border-radius:999px;font-size:13px;letter-spacing:.32em;
  text-transform:uppercase;cursor:pointer;backdrop-filter:blur(8px);transition:background .3s,color .3s,box-shadow .3s}
.dx-btn:hover,.dx-btn:focus-visible{background:var(--dx-gold);color:#050408;box-shadow:0 0 50px rgba(240,201,135,.45);outline:none}
.dx-top{position:absolute;top:calc(11vh + 14px);right:clamp(16px,4vw,48px);z-index:7;display:flex;gap:8px}
.dx-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.2);background:rgba(5,4,8,.5);color:rgba(242,236,246,.8);border-radius:999px;
  padding:7px 13px;font-size:12px;cursor:pointer;backdrop-filter:blur(8px)}
.dx-chip:hover{color:#fff;border-color:rgba(255,255,255,.5)}
.dx-door{position:absolute;top:0;bottom:0;width:50.4%;z-index:9;background:linear-gradient(90deg,#14101a,#0b0910);box-shadow:0 0 80px #000;pointer-events:none}
.dx-door.l{left:0;transform:translateX(-102%);border-right:1px solid rgba(240,201,135,.35)}
.dx-door.r{right:0;transform:translateX(102%);border-left:1px solid rgba(240,201,135,.35)}
.dx.leaving .dx-door.l{animation:dxDoorL 1.15s cubic-bezier(.7,0,.2,1) both}
.dx.leaving .dx-door.r{animation:dxDoorR 1.15s cubic-bezier(.7,0,.2,1) both}
@keyframes dxFrame{0%{opacity:0;transform:scale(1.02) rotate(.2deg)}14%{opacity:1}86%{opacity:1}100%{opacity:0;transform:scale(1.14) rotate(-.2deg)}}
@keyframes dxFrameLast{0%{opacity:0;transform:scale(1.02) rotate(.2deg)}14%{opacity:1}100%{opacity:1;transform:scale(1.2) rotate(-.2deg)}}
@keyframes dxYear{0%{opacity:0;transform:translateY(8px)}14%{opacity:1;transform:none}86%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
@keyframes dxYearLast{0%{opacity:0;transform:translateY(8px)}14%,100%{opacity:1;transform:none}}
@keyframes dxLetter{0%{opacity:0;transform:translateY(22px) scale(1.04);filter:blur(14px);letter-spacing:.2em}100%{opacity:1;transform:none;filter:blur(0);letter-spacing:0}}
@keyframes dxFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes dxKicker{0%{opacity:0}30%,70%{opacity:1}100%{opacity:0}}
@keyframes dxBarT{from{transform:translateY(-100%)}to{transform:none}}
@keyframes dxBarB{from{transform:translateY(100%)}to{transform:none}}
@keyframes dxGrain{0%{transform:translate(0,0)}20%{transform:translate(-4%,3%)}40%{transform:translate(3%,-5%)}60%{transform:translate(-6%,-2%)}80%{transform:translate(5%,4%)}100%{transform:translate(0,0)}}
@keyframes dxDoorL{from{transform:translateX(-102%)}to{transform:translateX(0)}}
@keyframes dxDoorR{from{transform:translateX(102%)}to{transform:translateX(0)}}

@media(min-width:700px) and (min-aspect-ratio:3/2){
  .dx{--dx-fx:71%}
  .dx-scrim{background:linear-gradient(90deg,rgba(5,4,8,.94) 0%,rgba(5,4,8,.72) 34%,rgba(5,4,8,.12) 62%,rgba(5,4,8,.35) 100%),linear-gradient(0deg,rgba(5,4,8,.7) 0%,transparent 40%)}
  .dx-stage{align-items:flex-start;padding-left:clamp(28px,6.5vw,120px);padding-right:44vw}
  .dx-title{text-align:left;margin-top:clamp(0px,5vh,56px)}
  .dx-title h1{font-size:clamp(34px,min(6.6vw,15vh),120px);line-height:1.02}
  .dx-bottom{align-items:flex-start}
  .dx-epi{text-align:left}
  .dx-epi q{margin:0;max-width:26ch}
  .dx-cta{justify-content:flex-start}
  .dx-year{left:auto;right:clamp(24px,5vw,80px)}
}
@media(prefers-reduced-motion:reduce){
  .dx *{animation-duration:.01s!important;animation-delay:0s!important}
  .dx-frame:not(.last){display:none}
  .dx-frame.last{opacity:1!important}
}
.dx-total{--t:${total}s}
`;
};

export default function DossierEntrance({ dossier, onEnter }: Props) {
  const ent = dossier.entrance;
  const [leaving, setLeaving] = useState(false);
  const [sound, setSound] = useState(false);
  const [hasScore, setHasScore] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<number | undefined>(undefined);
  const btn = useRef<HTMLButtonElement | null>(null);

  const frames = useMemo(
    () => (ent?.montage ?? []).map(m => ({ ...m, asset: dossier.assets.find(a => a.id === m.assetId) })).filter(f => f.asset),
    [ent, dossier],
  );
  const n = frames.length;
  const titleDelay = Math.max(1.6, n * FRAME * 0.42);
  const epiDelay = titleDelay + 3.2;
  const ctaDelay = epiDelay + 2.2;

  // Only offer sound if a score file actually exists.
  useEffect(() => {
    if (!ent?.scoreUrl) return;
    let live = true;
    fetch(ent.scoreUrl, { method: 'HEAD' }).then(r => { if (live && r.ok && /audio|octet/.test(r.headers.get('content-type') ?? '')) setHasScore(true); }).catch(() => {});
    return () => { live = false; };
  }, [ent?.scoreUrl]);

  const ramp = useCallback((to: number) => {
    const a = audio.current; if (!a) return;
    window.clearInterval(fade.current);
    fade.current = window.setInterval(() => {
      const step = to > a.volume ? 0.03 : -0.05;
      a.volume = Math.min(1, Math.max(0, a.volume + step));
      if (Math.abs(a.volume - to) < 0.04) { a.volume = to; window.clearInterval(fade.current); if (to === 0) a.pause(); }
    }, 90);
  }, []);

  const toggleSound = () => {
    if (!ent?.scoreUrl) return;
    if (!audio.current) { audio.current = new Audio(ent.scoreUrl); audio.current.loop = true; audio.current.volume = 0; }
    if (!sound) { audio.current.play().then(() => { setSound(true); ramp(0.55); }).catch(() => {}); }
    else { setSound(false); ramp(0); }
  };

  useEffect(() => () => { window.clearInterval(fade.current); audio.current?.pause(); }, []);

  const enter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    if (sound) ramp(0.25);
    window.setTimeout(onEnter, 1150);
  }, [leaving, onEnter, sound, ramp]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') enter(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [enter]);

  useEffect(() => { const t = window.setTimeout(() => btn.current?.focus({ preventScroll: true }), (ctaDelay + 1) * 1000); return () => window.clearTimeout(t); }, [ctaDelay]);

  useEffect(() => { if (!ent) onEnter(); }, [ent, onEnter]);
  if (!ent) return null;

  return (
    <div className={`dx${leaving ? ' leaving' : ''}`} role="dialog" aria-label={`${dossier.subject} — opening`}>
      <style>{css(n)}</style>

      {frames.map((f, i) => {
        const last = i === n - 1;
        return (
          <div key={f.assetId} className={`dx-frame${last ? ' last' : ''}`} style={{ animation: `${last ? 'dxFrameLast' : 'dxFrame'} ${FRAME * (last ? 3 : 1.12)}s ease-in-out ${1.4 + i * FRAME}s both` }}>
            <img
              src={commonsThumb(f.asset!.url, 1280)}
              alt={f.asset!.title}
              style={{
                left: 'var(--dx-fx)', top: '52%',
                height: `${f.focus?.scale ?? 120}%`,
                transform: `translate(${-(f.focus?.x ?? 0.5) * 100}%, ${-(f.focus?.y ?? 0.4) * 100}%)`,
              }}
            />
          </div>
        );
      })}
      <div className="dx-tint" /><div className="dx-scrim" /><div className="dx-vig" /><div className="dx-grain" />

      <div className="dx-bar t" /><div className="dx-bar b" />
      <div className="dx-kicker">A Plajah Dossier</div>

      <div className="dx-year dx-serif" aria-hidden>
        {frames.map((f, i) => (
          <span key={f.assetId} style={{ animation: `${i === n - 1 ? 'dxYearLast' : 'dxYear'} ${FRAME * 1.12}s ease ${1.4 + i * FRAME}s both` }}>{f.label}</span>
        ))}
      </div>

      <div className="dx-stage">
      <div className="dx-title">
        <h1 className="dx-serif" aria-label={dossier.subject}>
          {(() => {
            let i = 0;
            return dossier.subject.split(' ').map((word, w) => (
              <React.Fragment key={w}>
                {w > 0 && ' '}
                <span className="dx-word" aria-hidden>
                  {[...word].map(ch => (
                    <span key={i} className="dx-ch" style={{ animationDelay: `${titleDelay + (i++) * 0.07}s` }}>{ch}</span>
                  ))}
                </span>
              </React.Fragment>
            ));
          })()}
        </h1>
        <div className="dx-tag dx-serif" style={{ animationDelay: `${titleDelay + 1.4}s` }}>{ent.tagline}</div>
        <div className="dx-dates" style={{ animationDelay: `${titleDelay + 1.9}s` }}>{ent.dates}</div>
      </div>

      <div className="dx-bottom">
      <div className="dx-epi dx-serif" style={{ animationDelay: `${epiDelay}s` }}>
        <q>{ent.epigraph.text}</q>
        <cite>{ent.epigraph.cite}</cite>
      </div>

      <div className="dx-cta" style={{ animationDelay: `${ctaDelay}s` }}>
        <button ref={btn} className="dx-btn" onClick={enter}>Enter the hall</button>
      </div>
      </div>
      </div>
      <div className="dx-top">
        {hasScore && (
          <button className="dx-chip" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />} {sound ? 'Sound on' : 'Sound off'}
          </button>
        )}
        <button className="dx-chip" onClick={enter}><SkipForward size={14} /> Skip</button>
      </div>


      <div className="dx-door l" /><div className="dx-door r" />
    </div>
  );
}

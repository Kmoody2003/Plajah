import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { Dossier } from '../../services/dossier/dossierTypes';
import { DEFAULT_THEME, entranceTitleVw, themeVars, type DossierTheme } from '../../services/dossier/dossierTheme';
import { commonsThumb } from '../../services/dossier/sourceAdapters';
import { ensureDossierFonts, prefersReducedMotion, whenDisplayFontReady } from './dossierFonts';

interface Props {
  dossier: Dossier;
  theme?: DossierTheme;
  onEnter: () => void;
}

/** Leaving: the doors close in 600ms (reduced motion: a 150ms fade). */
const LEAVE_MS = 600;
const LEAVE_REDUCED_MS = 150;
/** Ignore input this long after mounting so the click or key that opened the entrance cannot also skip it. */
const ARM_MS = 250;

const CSS = `
.dx{position:fixed;inset:0;z-index:60;background:var(--dh-bg);color:#f4efe6;overflow:hidden;font-family:'Inter',system-ui,sans-serif;--dx-pad:clamp(20px,6vw,110px);--dx-cap:17.5vh}
.dx *{box-sizing:border-box}
.dx-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:62% 45%;animation:dxFadeIn 1s ease both,dxDrift 9s ease-out both}
.dx-scrim{position:absolute;inset:0;background:linear-gradient(0deg,var(--dh-bg) 0%,color-mix(in srgb,var(--dh-bg) 80%,transparent) 30%,transparent 62%),linear-gradient(90deg,color-mix(in srgb,var(--dh-bg) 92%,transparent) 0%,color-mix(in srgb,var(--dh-bg) 55%,transparent) 42%,transparent 78%)}
.dx-bar{position:absolute;left:0;right:0;height:50vh;background:#000;z-index:5}
.dx-bar.t{top:0;transform:translateY(-41.5vh);animation:dxBarT 1s cubic-bezier(.7,0,.2,1) both}
.dx-bar.b{bottom:0;transform:translateY(41.5vh);animation:dxBarB 1s cubic-bezier(.7,0,.2,1) both}
.dx-stage{position:absolute;top:8.5vh;bottom:8.5vh;left:0;right:0;z-index:4;display:flex;flex-direction:column;justify-content:flex-end;gap:clamp(8px,1.6vh,22px);padding:0 var(--dx-pad) clamp(10px,2.2vh,30px)}
.dx-script{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;animation:dxRise .8s ease .3s both}
.dx-script b{font-weight:400;font-size:clamp(32px,min(4.2vw,7vh),76px);line-height:1.3;color:var(--dh-a)}
.dx-script span{font-size:clamp(15px,1.3vw,18px);color:#d9d2c5}
.dx-title{font-size:var(--fs-n);margin:0;line-height:.88;text-wrap:balance;max-width:min(100%,16ch);text-shadow:0 10px 70px rgba(0,0,0,.6);animation:dxTitle .9s cubic-bezier(.2,.7,.2,1) .35s both}
.dx-sub{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 18px;max-width:62ch;animation:dxRise .8s ease .95s both}
.dx-tag{font-family:var(--dh-font-b);font-size:clamp(18px,1.7vw,24px);line-height:1.4;color:#efe8db}
.dx-dates{font-size:clamp(16px,1.4vw,20px);font-weight:600;color:var(--dh-a)}
.dx-epi{max-width:44ch;animation:dxRise .8s ease 1.6s both}
.dx-epi q{display:block;font-family:var(--dh-font-b);font-style:italic;font-size:clamp(16px,min(1.9vw,3vh),26px);line-height:1.45;quotes:"\\201C" "\\201D"}
.dx-epi cite{display:block;margin-top:8px;font-size:15px;color:#b9b1a4;font-style:normal}
.dx-actions{display:flex;align-items:center;flex-wrap:wrap;gap:14px 22px;margin-top:4px}
.dx-btn{border:0;background:var(--dh-a);color:var(--dh-a-ink);padding:14px 34px;border-radius:999px;font:700 18px/1 'Inter',system-ui,sans-serif;cursor:pointer;transition:transform .2s,box-shadow .3s}
.dx-btn:hover,.dx-btn:focus-visible{transform:translateY(-2px);box-shadow:0 0 0 3px var(--dh-bg),0 0 0 6px var(--dh-a);outline:none}
.dx-hint{font-size:15px;color:#b9b1a4}
.dx-top{position:absolute;top:calc(8.5vh + 14px);right:clamp(16px,4vw,48px);z-index:7;display:flex;gap:8px}
.dx-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.25);background:rgba(5,4,8,.55);color:#e8e1d4;border-radius:999px;padding:8px 14px;font-size:14px;cursor:pointer;backdrop-filter:blur(8px)}
.dx-chip:hover{color:#fff;border-color:rgba(255,255,255,.55)}
.dx-door{position:absolute;top:0;bottom:0;width:50.4%;z-index:9;background:var(--dh-bg);box-shadow:0 0 80px #000;pointer-events:none}
.dx-door.l{left:0;transform:translateX(-102%);border-right:2px solid var(--dh-a)}
.dx-door.r{right:0;transform:translateX(102%);border-left:2px solid var(--dh-a)}
.dx.leaving .dx-door.l{animation:dxDoorL ${LEAVE_MS}ms cubic-bezier(.7,0,.2,1) both}
.dx.leaving .dx-door.r{animation:dxDoorR ${LEAVE_MS}ms cubic-bezier(.7,0,.2,1) both}
.dx:not(.go) .dx-title{animation:none;opacity:0}
@keyframes dxFadeIn{from{opacity:0}to{opacity:1}}
@keyframes dxDrift{from{transform:scale(1.03)}to{transform:scale(1.14) translate(-1.2%,.8%)}}
@keyframes dxTitle{from{opacity:0;transform:translateY(34px) scale(1.02)}to{opacity:1;transform:none}}
@keyframes dxRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes dxBarT{from{transform:translateY(0)}to{transform:translateY(-41.5vh)}}
@keyframes dxBarB{from{transform:translateY(0)}to{transform:translateY(41.5vh)}}
@keyframes dxDoorL{from{transform:translateX(-102%)}to{transform:translateX(0)}}
@keyframes dxDoorR{from{transform:translateX(102%)}to{transform:translateX(0)}}
@keyframes dxLeaveFade{to{opacity:0}}
@media(min-width:900px) and (min-aspect-ratio:4/3){
  .dx-img{left:34%;width:66%;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 34%);mask-image:linear-gradient(90deg,transparent 0,#000 34%)}
  .dx-scrim{background:linear-gradient(0deg,var(--dh-bg) 0%,color-mix(in srgb,var(--dh-bg) 70%,transparent) 22%,transparent 50%),linear-gradient(90deg,var(--dh-bg) 0%,color-mix(in srgb,var(--dh-bg) 60%,transparent) 30%,transparent 55%)}
  .dx-title{font-size:var(--fs-w);max-width:60%}
}
@media(max-height:800px){
  .dx{--dx-cap:14.5vh}
  .dx-script b{font-size:clamp(28px,min(4.2vw,6vh),64px)}
  .dx-epi q{font-size:clamp(15px,min(1.9vw,2.7vh),24px)}
  .dx-stage{gap:clamp(6px,1.2vh,14px)}
}
@media(max-width:700px){
  .dx-scrim{background:linear-gradient(0deg,var(--dh-bg) 0%,color-mix(in srgb,var(--dh-bg) 88%,transparent) 42%,color-mix(in srgb,var(--dh-bg) 25%,transparent) 75%,transparent 100%)}
  .dx-hint{display:none}
}
@media(prefers-reduced-motion:reduce){
  .dx *{animation:none!important}
  .dx-bar.t{transform:translateY(-41.5vh)}.dx-bar.b{transform:translateY(41.5vh)}
  .dx.leaving{animation:dxLeaveFade ${LEAVE_REDUCED_MS}ms linear both!important}
  .dx.leaving .dx-door{display:none}
}
`;

const IGNORED_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS', 'ContextMenu']);

export default function DossierEntrance({ dossier, theme: themeProp, onEnter }: Props) {
  const theme = themeProp ?? DEFAULT_THEME;
  const ent = dossier.entrance;
  const [leaving, setLeaving] = useState(false);
  const [sound, setSound] = useState(false);
  const [hasScore, setHasScore] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<number | undefined>(undefined);
  const btn = useRef<HTMLButtonElement | null>(null);
  const armed = useRef(false);

  const vars = useMemo(() => themeVars(theme), [theme]);

  // The one image the entrance holds on: the theme's choice, else the middle montage frame.
  const frame = useMemo(() => {
    const all = (ent?.montage ?? []).map(m => ({ ...m, asset: dossier.assets.find(a => a.id === m.assetId) })).filter(f => f.asset);
    return all.find(f => f.assetId === theme.entranceAsset) ?? all[Math.floor(all.length / 2)];
  }, [ent, dossier, theme.entranceAsset]);

  useEffect(() => {
    ensureDossierFonts([theme]);
    let live = true;
    whenDisplayFontReady(theme).then(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, [theme]);

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
    window.setTimeout(onEnter, prefersReducedMotion() ? LEAVE_REDUCED_MS : LEAVE_MS);
  }, [leaving, onEnter, sound, ramp]);

  // Enter is focused from frame one. Any key (bar modifiers and Tab) or any tap or click skips in.
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
    const arm = window.setTimeout(() => { armed.current = true; }, ARM_MS);
    const key = (e: KeyboardEvent) => {
      if (!armed.current || IGNORED_KEYS.has(e.key) || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
      enter();
    };
    const tap = (e: PointerEvent) => {
      if (!armed.current) return;
      if ((e.target as HTMLElement | null)?.closest('[data-dx-keep]')) return;
      enter();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', tap);
    return () => { window.clearTimeout(arm); window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', tap); };
  }, [enter]);

  useEffect(() => { if (!ent) onEnter(); }, [ent, onEnter]);
  if (!ent) return null;

  const title = theme.heroTitle ?? dossier.subject;
  const vwNarrow = entranceTitleVw(title, theme, 88);
  const vwWide = entranceTitleVw(title, theme, 58);
  const fs = (vw: number) => `clamp(42px, min(${vw}vw, var(--dx-cap)), ${Math.round(vw * 15)}px)`;
  const f = frame?.focus;
  const pos = f ? `${Math.round(f.x * 100)}% ${Math.round(f.y * 100)}%` : '50% 40%';
  const showSubject = !!theme.heroTitle && theme.heroTitle !== dossier.subject;

  return (
    <div className={`dx${leaving ? ' leaving' : ''}${fontsReady ? ' go' : ''}`} role="dialog" aria-label={`${dossier.subject}, opening`}
      style={{ ...vars, ['--dx-pos' as string]: pos } as React.CSSProperties}>
      <style>{CSS}</style>

      {frame?.asset && <img className="dx-img" src={commonsThumb(frame.asset.url, 1920)} alt={frame.asset.title} style={{ objectPosition: pos }} />}
      <div className="dx-scrim" />
      <div className="dx-bar t" /><div className="dx-bar b" />

      <div className="dx-stage">
        {theme.script && (
          <div className="dx-script">
            <b lang="und" dir={theme.script.dir ?? 'auto'} style={{ fontFamily: theme.script.font }}>{theme.script.word}</b>
            <span>{theme.script.reading}</span>
          </div>
        )}
        <h1 className="dx-title" style={{
          fontFamily: theme.display, textTransform: theme.upper ? 'uppercase' : 'none', fontWeight: theme.upper ? 400 : 700,
          letterSpacing: theme.upper ? '-.01em' : '-.025em',
          ['--fs-n' as string]: fs(vwNarrow), ['--fs-w' as string]: fs(vwWide),
        } as React.CSSProperties}>{title}</h1>
        <div className="dx-sub">
          <span className="dx-dates">{ent.dates}</span>
          <span className="dx-tag">{showSubject ? `${dossier.subject}. ` : ''}{ent.tagline}</span>
        </div>
        <div className="dx-epi">
          <q>{ent.epigraph.text}</q>
          <cite>{ent.epigraph.cite}</cite>
        </div>
        <div className="dx-actions">
          <button ref={btn} className="dx-btn" onClick={enter} autoFocus>Enter the hall</button>
          <span className="dx-hint">Or press any key, or tap, to go straight in.</span>
        </div>
      </div>

      {hasScore && (
        <div className="dx-top" data-dx-keep>
          <button className="dx-chip" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Volume2 size={15} /> : <VolumeX size={15} />} {sound ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      )}

      <div className="dx-door l" /><div className="dx-door r" />
    </div>
  );
}

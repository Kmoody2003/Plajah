import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ShieldCheck, AlertTriangle, ScrollText, MoreHorizontal } from 'lucide-react';
import { DEPTH_LEVELS, DEPTH_LABEL, type Claim, type DepthLevel, type Dossier, type DossierAsset } from '../../services/dossier/dossierTypes';
import { pickVariant } from '../../services/dossier/characterGateway';
import { commonsThumb } from '../../services/dossier/sourceAdapters';
import { DEFAULT_THEME, heroTitleVw, themeVars } from '../../services/dossier/dossierTheme';
import DossierBoundary from './DossierBoundary';
import { DOSSIERS, takeRequestedDossier, type DossierEntry } from '../../data/dossier/registry';
import DossierEntrance from './DossierEntrance';
import DossierLobby from './DossierLobby';
import { ensureDossierFonts, prefersReducedMotion } from './dossierFonts';

const DossierFilmPlayer = React.lazy(() => import('./DossierFilmPlayer'));
const ModelTExploded = React.lazy(() => import('./ModelTExploded'));
const FordMovingLine = React.lazy(() => import('./experiences/FordMovingLine'));
const PersiaRoad = React.lazy(() => import('./experiences/PersiaRoad'));
const FoundingTimeline = React.lazy(() => import('./experiences/FoundingTimeline'));
const DouglassComposingStick = React.lazy(() => import('./experiences/DouglassComposingStick'));
const PartitionPen = React.lazy(() => import('./experiences/PartitionPen'));

interface Props {
  dossier?: Dossier;
  /** Registry id; defaults to the one requested by the app event, else the first dossier. */
  dossierId?: string;
  onBack?: () => void;
}

/** Saves the generated timeline as a real Tela document and opens it in Tela. */
async function openTimelineInTela(entry: DossierEntry): Promise<void> {
  if (!entry.telaTimeline) return;
  const [raw, { saveTelaDoc }, { auth }] = await Promise.all([
    entry.telaTimeline(),
    import('../../services/telaStore'),
    import('../../services/backendService'),
  ]);
  const now = Date.now();
  const doc = { ...raw, ownerId: auth.currentUser?.uid || 'local', createdAt: now, updatedAt: now };
  await saveTelaDoc(doc);
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
}

/** Opens the generated documentary as an editable Fabula production. */
async function openFilmInFabula(entry: DossierEntry): Promise<void> {
  if (!entry.fabulaFilm) return;
  const [prod, { openProductionInFabula }] = await Promise.all([
    entry.fabulaFilm(),
    import('../../services/dossier/openInFabula'),
  ]);
  await openProductionInFabula(prod);
}

const DEPTH_KEY = 'plajah:dossier:depth';
const readDepth = (): DepthLevel => {
  try {
    const v = localStorage.getItem(DEPTH_KEY) as DepthLevel | null;
    if (v && DEPTH_LEVELS.includes(v)) return v;
  } catch { /* storage may be blocked */ }
  return 'middle';
};


const CONF_LABEL: Record<Claim['confidence'], string> = {
  established: 'Established',
  probable: 'Probable',
  contested: 'Contested',
  tradition: 'Tradition',
};

/** Slide timing: out 160ms + in 290ms = 450ms. Reduced motion: no slide, a 150ms fade. */
const SLIDE_OUT_MS = 160;
const SLIDE_IN_MS = 290;
const FADE_MS = 150;

const CSS = `
.dh{--dh-a:#f0c987;--dh-a-ink:#0b0a0d;--dh-bg:#121014;--dh-panel:#1b181e;--dh-panel-2:#25222a;--dh-line:rgba(255,255,255,.12);--dh-ink:#f4efe6;--dh-mute:#b4ac9f;
  --dh-font-d:'Fraunces',Georgia,serif;--dh-font-b:'Source Serif 4',Georgia,serif;--dh-upper:none;--dh-d-weight:700;--dh-d-track:-.025em;--dh-dir:1;
  --dh-pad:clamp(16px,5vw,72px);
  min-height:100%;background:radial-gradient(1200px 520px at 15% -8%,color-mix(in srgb,var(--dh-a) 11%,transparent),transparent 62%),var(--dh-bg);color:var(--dh-ink);
  font-family:'Inter',system-ui,sans-serif;overflow-x:clip}
.dh *{box-sizing:border-box}
.dh-serif{font-family:var(--dh-font-b)}
.dh-disp{font-family:var(--dh-font-d);text-transform:var(--dh-upper);font-weight:var(--dh-d-weight);letter-spacing:var(--dh-d-track)}
.dh-top{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:12px var(--dh-pad) 0;position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--dh-bg) 92%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--dh-line)}
.dh-crumbs{font-size:15px;color:var(--dh-mute);white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dh-crumbs b{font-size:18px;color:var(--dh-ink);font-weight:600}
.dh-plan{flex:0 0 100%;display:flex;gap:4px;padding:6px 0 0;margin-bottom:-1px}
.dh-plan i{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.14);transition:background .45s ease,transform .45s ease}
.dh-plan i.done{background:color-mix(in srgb,var(--dh-a) 55%,transparent)}
.dh-plan i.here{background:var(--dh-a);transform:scaleY(1.7)}
.dh-tools{position:relative}
.dh-tools summary{list-style:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--dh-mute);font-size:14px;padding:6px 12px;border:1px solid var(--dh-line);border-radius:999px}
.dh-tools summary::-webkit-details-marker{display:none}
.dh-tools[open] summary,.dh-tools summary:hover{color:var(--dh-ink);border-color:rgba(255,255,255,.35)}
.dh-tools-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:20;min-width:240px;display:grid;gap:2px;padding:6px;background:var(--dh-panel-2);border:1px solid var(--dh-line);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.6)}
.dh-tools-menu button{text-align:left;background:none;border:0;color:var(--dh-ink);font-size:15px;padding:10px 12px;border-radius:8px;cursor:pointer}
.dh-tools-menu button:hover,.dh-tools-menu button:focus-visible{background:rgba(255,255,255,.08);outline:none}
.dh-pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:34px 0 0}
.dh-pager button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--dh-panel);border:1px solid var(--dh-line);border-radius:12px;padding:18px 20px;color:var(--dh-ink);cursor:pointer;font-family:var(--dh-font-b);font-size:19px;line-height:1.3;transition:border-color .25s,transform .25s}
.dh-pager button:hover,.dh-pager button:focus-visible{border-color:var(--dh-a);transform:translateY(-2px);outline:none}
.dh-pager button.next{justify-content:space-between;text-align:right}
.dh-pager small{display:block;font-family:'Inter',system-ui,sans-serif;font-size:14px;color:var(--dh-a);margin-bottom:3px}
.dh-back{display:inline-flex;align-items:center;gap:6px;color:var(--dh-mute);background:none;border:0;cursor:pointer;font-size:15px;padding:6px 0}
.dh-back:hover{color:var(--dh-ink)}
.dh-lens{margin-left:auto;display:flex;gap:4px;padding:3px;border:1px solid var(--dh-line);border-radius:999px;background:rgba(255,255,255,.04)}
.dh-lens button{border:0;background:none;color:var(--dh-mute);font-size:14px;padding:6px 12px;border-radius:999px;cursor:pointer;white-space:nowrap}
.dh-lens button[aria-pressed=true]{background:var(--dh-a);color:var(--dh-a-ink);font-weight:600}
.dh-wrap{display:grid;grid-template-columns:280px minmax(0,1fr);gap:0;max-width:1320px;margin:0 auto}
.dh-wing{font-size:15px;font-weight:700;color:var(--dh-a);margin:20px 0 6px 4px}
.dh-wing:first-child{margin-top:0}
.dh-rail{padding:24px 16px 24px var(--dh-pad);border-right:1px solid var(--dh-line);position:sticky;top:74px;align-self:start;height:calc(100vh - 74px);overflow-y:auto;overflow-x:hidden}
.dh-room{display:block;width:100%;text-align:left;background:none;border:0;border-left:3px solid var(--dh-line);color:var(--dh-mute);padding:10px 12px;cursor:pointer;margin-left:6px;transition:border-color .3s,color .3s,background .3s}
.dh-room small{display:block;font-size:14px;opacity:.85}
.dh-room span{font-size:16px;line-height:1.3;font-family:var(--dh-font-b)}
.dh-room:hover{color:var(--dh-ink)}
.dh-room[aria-current=true]{border-left-color:var(--dh-a);color:var(--dh-ink);background:linear-gradient(90deg,color-mix(in srgb,var(--dh-a) 14%,transparent),transparent)}
.dh-room[aria-current=true] small{color:var(--dh-a);opacity:1}
.dh-main{padding:30px clamp(16px,4vw,48px) 80px;min-width:0}
.dh-banner{position:relative;min-height:clamp(440px,76vh,820px);overflow:hidden;background:var(--dh-bg);display:flex;align-items:flex-end;isolation:isolate}
.dh-banner-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transform:scale(1.06);animation:dhKen 26s ease-in-out infinite alternate}
.dh-banner-img.portrait{object-position:50% 20%}
.dh-banner-img.artifact{object-position:50% 40%}
.dh-banner-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.32) 0%,rgba(0,0,0,.08) 32%,color-mix(in srgb,var(--dh-bg) 70%,transparent) 72%,var(--dh-bg) 100%)}
.dh-banner-text{position:relative;width:100%;padding:0 var(--dh-pad) clamp(22px,5vh,56px)}
.dh-eyebrow{font-size:clamp(16px,1.5vw,20px);font-weight:600;color:var(--dh-a);margin:0 0 clamp(8px,1.4vw,16px);text-shadow:0 2px 14px rgba(0,0,0,.7)}
.dh-eyebrow span{color:#ece5d8;font-weight:500}
.dh-h1{margin:0;line-height:.9;max-width:18ch;text-wrap:balance;text-shadow:0 8px 60px rgba(0,0,0,.65);animation:dhRise .8s cubic-bezier(.2,.7,.2,1) both}
.dh-eyebrow{animation:dhRise .7s ease both}
.dh-recon-tag{display:inline-block;font:700 12px/1 'Inter',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:5px 9px;border:1.5px solid #ff6b57;color:#ff8a78;background:rgba(10,8,8,.72)}
.dh-banner .dh-recon-tag{position:absolute;top:20px;right:var(--dh-pad);z-index:2}
.dh-medal{position:absolute;right:var(--dh-pad);bottom:clamp(22px,5vh,56px);display:flex;gap:12px;align-items:center;padding:8px 14px 8px 8px;border:1px solid var(--dh-line);border-radius:999px;background:rgba(13,11,16,.66);backdrop-filter:blur(10px);max-width:340px}
.dh-medal img{width:54px;height:54px;border-radius:50%;object-fit:cover;object-position:50% 15%}
.dh-medal label{display:grid;gap:4px;font-size:14px;color:var(--dh-mute)}
.dh-medal b{color:var(--dh-ink)}
.dh-medal input{width:140px;accent-color:var(--dh-a)}
.dh-banner-cap{font-size:15px;color:var(--dh-mute);margin:0;padding:12px var(--dh-pad) 4px;line-height:1.55;max-width:1320px;margin-inline:auto}
.dh-reveal{position:fixed;inset:0;z-index:70;pointer-events:none;overflow:hidden}
.dh-reveal i{position:absolute;top:0;bottom:0;width:50.4%;background:var(--dh-bg);box-shadow:0 0 80px #000}
.dh-reveal i:first-child{left:0;border-right:2px solid var(--dh-a);animation:dhOpenL .75s cubic-bezier(.7,0,.2,1) both}
.dh-reveal i:last-child{right:0;border-left:2px solid var(--dh-a);animation:dhOpenR .75s cubic-bezier(.7,0,.2,1) both}
@keyframes dhOpenL{from{transform:none}to{transform:translateX(-102%)}}
@keyframes dhOpenR{from{transform:none}to{transform:translateX(102%)}}
@keyframes dhKen{from{transform:scale(1.05) translate(0,0)}to{transform:scale(1.16) translate(-1.6%,1.1%)}}
@keyframes dhRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes dhSlideOut{to{opacity:0;transform:translateX(calc(var(--dh-dir) * -56px))}}
@keyframes dhSlideIn{from{opacity:0;transform:translateX(calc(var(--dh-dir) * 56px))}to{opacity:1;transform:none}}
@keyframes dhFade{from{opacity:0}to{opacity:1}}
.dh[data-slide=out] .dh-sl{animation:dhSlideOut ${SLIDE_OUT_MS}ms ease-in both}
.dh[data-slide=in] .dh-sl{animation:dhSlideIn ${SLIDE_IN_MS}ms cubic-bezier(.2,.8,.2,1) both}
.dh[data-slide=fade] .dh-sl{animation:dhFade ${FADE_MS}ms linear both}
.dh-replay{border:0;background:none;color:var(--dh-mute);font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.dh-years{font-size:14px;color:var(--dh-a)}
.dh-age{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:14px;color:var(--dh-mute)}
.dh-age input{flex:1;accent-color:var(--dh-a)}
.dh-node{background:var(--dh-panel);border:1px solid var(--dh-line);border-top:3px solid var(--dh-a);border-radius:6px 6px 10px 10px;padding:clamp(20px,3.2vw,38px);margin-bottom:26px}
.dh-node h3{font-size:clamp(28px,4.2vw,54px);line-height:1;margin:0 0 6px;max-width:20ch;text-wrap:balance}
.dh-kind{font-size:15px;font-weight:600;color:var(--dh-a)}
.dh-body{font-family:var(--dh-font-b);font-size:clamp(18px,1.5vw,20px);line-height:1.7;margin:16px 0 20px;max-width:66ch;color:#e8e1d4}
.dh-body.early,.dh-body.elementary{font-size:clamp(20px,2vw,23px);line-height:1.75}
.dh-ev-btn{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--dh-a);border:1.5px solid var(--dh-a);border-radius:999px;padding:9px 18px;font-size:15px;font-weight:600;cursor:pointer}
.dh-ev-btn:hover,.dh-ev-btn[aria-expanded=true]{background:var(--dh-a);color:var(--dh-a-ink)}
.dh-claims{margin:16px 0 0;padding:0;list-style:none;display:grid;gap:10px}
.dh-claim{border-left:3px solid var(--pj-success,#06D6A0);padding:6px 0 6px 12px;font-size:16px;line-height:1.55}
.dh-claim.contested,.dh-claim.tradition{border-left-color:var(--pj-warning,#F59E0B);background:var(--pj-warning-soft,rgba(245,158,11,.14))}
.dh-claim.probable{border-left-color:var(--pj-info,#3B82F6)}
.dh-badge{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;margin-right:8px;color:var(--dh-mute)}
.dh-note{display:block;margin-top:4px;color:var(--dh-mute);font-size:15px}
.dh-src{font-size:14px;color:var(--dh-mute);margin-top:4px}
.dh-artifacts{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin:4px 0 22px}
.dh-art{margin:0;background:#0f0d0b;border:1px solid var(--dh-line);border-radius:8px;overflow:hidden}
.dh-art-btn{display:block;width:100%;border:0;padding:0;background:#000;cursor:zoom-in}
.dh-art img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .5s}
.dh-art-btn:hover img,.dh-art-btn:focus-visible img{transform:scale(1.05)}
.dh-art figcaption{font-size:14px;line-height:1.45;color:var(--dh-mute);padding:9px 11px}
.dh-art figcaption b{color:var(--dh-ink);font-weight:600}
.dh-zoom{position:fixed;inset:0;z-index:80;background:rgba(5,4,8,.92);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.dh-zoom figure{margin:0;max-width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px;cursor:default}
.dh-zoom img{max-width:100%;max-height:78vh;object-fit:contain;border-radius:6px;background:#000}
.dh-zoom figcaption{font-size:15px;color:rgba(242,236,246,.85);line-height:1.5}
.dh-zoom a{color:var(--dh-a)}
.dh-zoom-x{align-self:flex-start;border:1px solid rgba(255,255,255,.3);background:none;color:#fff;border-radius:999px;padding:7px 18px;font-size:14px;cursor:pointer}
.dh-recon{position:relative;margin:0 0 20px;max-width:min(100%,640px);border:1px solid var(--dh-line);border-radius:6px;overflow:hidden;background:#000}
.dh-recon img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.dh-recon figcaption{font-size:15px;color:var(--dh-mute);padding:10px 14px;line-height:1.5}
.dh-recon .dh-recon-tag{position:absolute;top:10px;left:10px;z-index:1}
.dh-credits{margin-top:40px;border-top:1px solid var(--dh-line);padding-top:18px;font-size:14px;color:var(--dh-mute);line-height:1.65}
.dh-credits h4{margin:0 0 8px;font-size:16px;font-weight:600;color:var(--dh-ink)}
.dh-credits a{color:inherit}
.dh-exp{margin:22px 0 26px}
@media(max-width:860px){
 .dh-wrap{grid-template-columns:1fr}
 .dh-rail{position:static;height:auto;display:flex;gap:6px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--dh-line);padding:10px 12px}
 .dh-wing{display:none}
 .dh-room{border-left:0;border-bottom:3px solid var(--dh-line);margin:0;min-width:160px}
 .dh-room[aria-current=true]{border-bottom-color:var(--dh-a)}
 .dh-medal{position:relative;right:auto;bottom:auto;margin:0 16px 16px;width:max-content}
 .dh-banner{min-height:clamp(420px,70vh,640px);flex-direction:column;justify-content:flex-end;align-items:stretch}
 .dh-lens{margin-left:0;overflow-x:auto;flex:1 1 calc(100% - 110px);min-width:0}
 .dh-top{flex-wrap:wrap}
 .dh-crumbs{flex:1 1 calc(100% - 150px);min-width:0}
 .dh-crumbs b{font-size:16px}
 .dh-pager{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){
 .dh-banner-img,.dh-h1,.dh-eyebrow{animation:none}
 .dh-reveal{display:none}
 .dh-plan i{transition:none}
 .dh[data-slide=out] .dh-sl,.dh[data-slide=in] .dh-sl{animation:dhFade ${FADE_MS}ms linear both}
 .dh[data-slide=out] .dh-sl{animation:none}
}
`;

export default function DossierHall(props: Props) {
  // Which exhibit: explicit prop, else what the app requested, else (single exhibit) that one, else the lobby.
  const [chosen, setChosen] = useState<string | null>(
    () => props.dossierId ?? takeRequestedDossier() ?? (DOSSIERS.length === 1 ? DOSSIERS[0].id : null),
  );
  const entry = useMemo(() => DOSSIERS.find(d => d.id === chosen) ?? null, [chosen]);
  const [loaded, setLoaded] = useState<Dossier | null>(props.dossier ?? null);
  useEffect(() => {
    if (props.dossier) { setLoaded(props.dossier); return; }
    if (!entry) { setLoaded(null); return; }
    let live = true;
    setLoaded(null);
    entry.load().then(d => { if (live) setLoaded(d); }).catch(() => {});
    return () => { live = false; };
  }, [entry, props.dossier]);
  if (!entry && !props.dossier) return <DossierLobby onChoose={setChosen} onBack={props.onBack} />;
  if (!loaded) return <div className="dh" style={{ padding: 40, color: 'rgba(242,236,246,.6)', background: '#121014' }}>Opening exhibit…</div>;
  const hasLobby = DOSSIERS.length > 1 && !props.dossier;
  const toLobby = hasLobby ? () => setChosen(null) : props.onBack;
  return (
    <DossierBoundary key={loaded.id} scope="exhibit" onBack={toLobby}>
      <HallInner dossier={loaded} entry={entry ?? DOSSIERS[0]} onBack={toLobby} backLabel={hasLobby ? 'Exhibition Hall' : 'Back'} />
    </DossierBoundary>
  );
}

/** Keys a TV remote, browser or phone sends for "Back". */
const isBackKey = (e: KeyboardEvent) =>
  e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'XF86Back' || e.keyCode === 10009 || e.keyCode === 461;

function HallInner({ dossier, entry, onBack, backLabel = 'Back' }: { dossier: Dossier; entry: DossierEntry; onBack?: () => void; backLabel?: string }) {
  const theme = entry.theme ?? DEFAULT_THEME;
  const vars = useMemo(() => themeVars(theme), [theme]);
  useEffect(() => { ensureDossierFonts([theme]); }, [theme]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [depth, setDepth] = useState<DepthLevel>(readDepth);
  /** `planId` is where the plan strip points (changes at once); `roomId` is the room on screen (changes mid-slide). */
  const [planId, setPlanId] = useState(dossier.rooms[0].id);
  const [roomId, setRoomId] = useState(dossier.rooms[0].id);
  const [slide, setSlide] = useState<'idle' | 'out' | 'in' | 'fade'>('idle');
  const [dir, setDir] = useState(1);
  const timers = useRef<number[]>([]);
  const history = useRef<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [age, setAge] = useState(30);
  const [intro, setIntro] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [film, setFilm] = useState(false);
  const [zoom, setZoom] = useState<DossierAsset | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [zoom]);
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); }, []);

  const scrollTop = () => rootRef.current?.scrollIntoView({ block: 'start' });
  /** Moves to a room: slide out (160ms), swap, slide in (290ms); reduced motion swaps with a 150ms fade. */
  const showRoom = useCallback((id: string, nextDir: number) => {
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
    setPlanId(id);
    if (prefersReducedMotion()) {
      setRoomId(id); setSlide('fade'); scrollTop();
      timers.current.push(window.setTimeout(() => setSlide('idle'), FADE_MS));
      return;
    }
    setDir(nextDir); setSlide('out');
    timers.current.push(window.setTimeout(() => { setRoomId(id); setSlide('in'); scrollTop(); }, SLIDE_OUT_MS));
    timers.current.push(window.setTimeout(() => setSlide('idle'), SLIDE_OUT_MS + SLIDE_IN_MS));
  }, []);
  const planRef = useRef(planId);
  planRef.current = planId;
  const goRoom = useCallback((id: string) => {
    const cur = planRef.current;
    if (id === cur) return;
    history.current.push(cur);
    const ci = dossier.rooms.findIndex(r => r.id === cur), ni = dossier.rooms.findIndex(r => r.id === id);
    showRoom(id, ni >= ci ? 1 : -1);
  }, [dossier, showRoom]);
  /** Back returns to the room you came from; with nothing to return to it does nothing (the app's own Back applies). */
  const goBackRoom = useCallback((): boolean => {
    const prev = history.current.pop();
    if (!prev) return false;
    const ci = dossier.rooms.findIndex(r => r.id === planRef.current), ni = dossier.rooms.findIndex(r => r.id === prev);
    showRoom(prev, ni >= ci ? 1 : -1);
    return true;
  }, [dossier, showRoom]);
  const finishIntro = () => { setIntro(false); setReveal(true); window.setTimeout(() => setReveal(false), 900); };

  useEffect(() => {
    try { localStorage.setItem(DEPTH_KEY, depth); } catch { /* ignore */ }
  }, [depth]);

  const claimById = useMemo(() => new Map(dossier.ledger.claims.map(c => [c.id, c])), [dossier]);
  const sourceById = useMemo(() => new Map(dossier.ledger.sources.map(s => [s.id, s])), [dossier]);
  const assetById = useMemo(() => new Map(dossier.assets.map(a => [a.id, a])), [dossier]);
  const room = dossier.rooms.find(r => r.id === roomId) ?? dossier.rooms[0];

  const figure = dossier.characters[0];
  const variant = figure ? pickVariant(figure, age) : undefined;
  const portrait: DossierAsset | undefined = variant ? assetById.get(variant.referenceAssetIds[0]) : undefined;
  const ageBounds: [number, number] = figure
    ? [Math.min(...figure.variants.map(v => v.ageRange[0])), Math.max(...figure.variants.map(v => v.ageRange[1]))]
    : [0, 0];

  const roomNumber = dossier.rooms.findIndex(r => r.id === room.id) + 1;
  const planNumber = dossier.rooms.findIndex(r => r.id === planId) + 1;
  const prevRoom = dossier.rooms[planNumber - 2];
  const nextRoom = dossier.rooms[planNumber];
  const wingOf = (rid: string) => dossier.wings?.find(w => w.roomIds.includes(rid));
  // Keep the active room visible in the rail (a sideways strip on phones).
  useEffect(() => {
    const rail = rootRef.current?.querySelector('.dh-rail') as HTMLElement | null;
    const it = rail?.querySelector('.dh-room[aria-current="true"]') as HTMLElement | null;
    if (!rail || !it) return;
    const rb = rail.getBoundingClientRect(), ib = it.getBoundingClientRect();
    // Scroll only the rail itself (never the page, which would jump the banner out of view).
    if (rail.scrollWidth > rail.clientWidth + 2) rail.scrollLeft += ib.left - rb.left - (rb.width - ib.width) / 2;
    else if (ib.top < rb.top || ib.bottom > rb.bottom) rail.scrollTop += ib.top - rb.top - (rb.height - ib.height) / 2;
  }, [planId]);
  // Arrow keys move between rooms; Back (Escape, remote Back) returns to the previous room.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (intro || zoom || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowRight' && nextRoom) goRoom(nextRoom.id);
      else if (e.key === 'ArrowLeft' && prevRoom) goRoom(prevRoom.id);
      else if (isBackKey(e) && goBackRoom()) e.preventDefault();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [intro, zoom, nextRoom?.id, prevRoom?.id, goRoom, goBackRoom]);
  // Age of the person in the middle of this room's years (null for topic dossiers or undated rooms).
  const roomAge = useMemo(() => {
    const m = room.years?.match(/(\d{4})\D+(\d{4})/);
    return m && figure?.birthYear ? Math.round((Number(m[1]) + Number(m[2])) / 2 - figure.birthYear) : null;
  }, [room, figure]);
  useEffect(() => {
    if (roomAge != null) setAge(Math.min(ageBounds[1], Math.max(ageBounds[0], roomAge)));
  }, [roomAge, ageBounds[0], ageBounds[1]]);
  // Before the earliest surviving photograph, do not dress a boyhood room in an adult face.
  const noPhotoEra = roomAge != null && figure ? roomAge < ageBounds[0] - 2 : false;
  const bannerAsset = room.nodes.flatMap(n => n.assetIds).map(id => assetById.get(id)).find(a => a?.kind === 'recreation');
  const depthRank = (d: DepthLevel) => DEPTH_LEVELS.indexOf(d);
  const visibleAt = (a?: DossierAsset): a is DossierAsset => !!a && (!a.minDepth || depthRank(depth) >= depthRank(a.minDepth));
  // Topic exhibits have no portrait: the first archival image in the room becomes the banner.
  const artifactBanner = bannerAsset || (portrait && !noPhotoEra) ? undefined
    : room.nodes.flatMap(n => n.assetIds).map(id => assetById.get(id)).find(a => visibleAt(a) && a.kind !== 'recreation' && /^https?:/.test(a.url));

  const usedAssets = useMemo(() => {
    const ids = new Set<string>(room.nodes.flatMap(n => n.assetIds));
    if (portrait) ids.add(portrait.id);
    return [...ids].map(id => assetById.get(id)).filter(a => visibleAt(a)) as DossierAsset[];
  }, [room, portrait, assetById, depth]);

  const titleVw = heroTitleVw(room.title, theme.upper);
  const wing = wingOf(room.id);

  return (
    <div className="dh" ref={rootRef} style={{ ...vars, '--dh-dir': String(dir) } as React.CSSProperties} data-slide={slide} data-exhibit={dossier.id}>
      <style>{CSS}</style>
      {intro && <DossierEntrance dossier={dossier} theme={theme} onEnter={finishIntro} />}
      {film && entry.film && (
        <React.Suspense fallback={null}>
          <DossierFilmPlayer load={entry.film} onClose={() => setFilm(false)} />
        </React.Suspense>
      )}
      {reveal && <div className="dh-reveal" aria-hidden><i /><i /></div>}
      {zoom && (
        <div className="dh-zoom" role="dialog" aria-label={zoom.title} onClick={() => setZoom(null)}>
          <figure onClick={e => e.stopPropagation()}>
            <img src={commonsThumb(zoom.url, 1280)} alt={zoom.title} />
            <figcaption>
              <b>{zoom.title}</b>. {zoom.rights.credit}; {zoom.rights.status.replace('-', ' ')}.
              {zoom.rights.verifiedAt && <> <a href={zoom.rights.verifiedAt} target="_blank" rel="noreferrer noopener">Record</a></>}
            </figcaption>
            <button className="dh-zoom-x" onClick={() => setZoom(null)}>Close</button>
          </figure>
        </div>
      )}
      <header className="dh-top">
        {onBack && (
          <button className="dh-back" onClick={onBack} aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}><ArrowLeft size={16} /> {backLabel}</button>
        )}
        <nav className="dh-crumbs" aria-label="You are here">
          <b>{dossier.subject}</b>
          <span className="dh-crumb-room"> · Room {planNumber} of {dossier.rooms.length}</span>
        </nav>
        <div className="dh-lens" role="group" aria-label="Reading level">
          {DEPTH_LEVELS.map(d => (
            <button key={d} aria-pressed={d === depth} onClick={() => setDepth(d)}>{DEPTH_LABEL[d]}</button>
          ))}
        </div>
        <details className="dh-tools">
          <summary aria-label="More: replay the opening, watch the film, open in Tela or Fabula"><MoreHorizontal size={16} /> More</summary>
          <div className="dh-tools-menu">
            {dossier.entrance && <button onClick={e => { setIntro(true); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>Replay the opening</button>}
            {entry.film && <button onClick={e => { setFilm(true); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>▶ Watch the film</button>}
            {entry.telaTimeline && <button onClick={e => { openTimelineInTela(entry).catch(() => {}); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>Open the timeline in Tela</button>}
            {entry.fabulaFilm && <button onClick={e => { openFilmInFabula(entry).catch(() => {}); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>Open the film in Fabula</button>}
          </div>
        </details>
        <div className="dh-plan" aria-hidden>
          {dossier.rooms.map((r, i) => <i key={r.id} className={i + 1 < planNumber ? 'done' : i + 1 === planNumber ? 'here' : ''} />)}
        </div>
      </header>

      <div className="dh-sl">
        <section className="dh-banner" key={room.id}>
          {bannerAsset ? (
            <img className="dh-banner-img" src={bannerAsset.url} alt={bannerAsset.title} />
          ) : portrait && !noPhotoEra ? (
            <img className="dh-banner-img portrait" src={commonsThumb(portrait.url, 1280)} alt={portrait.title} />
          ) : artifactBanner ? (
            <img className="dh-banner-img artifact" src={commonsThumb(artifactBanner.url, 1280)} alt={artifactBanner.title} />
          ) : null}
          <div className="dh-banner-scrim" />
          {bannerAsset && <span className="dh-recon-tag">Reconstruction</span>}
          <div className="dh-banner-text">
            <p className="dh-eyebrow">{wing ? `${wing.title} · ` : ''}Room {roomNumber} of {dossier.rooms.length}{room.years ? <span> · {room.years}</span> : null}</p>
            <h1 className="dh-h1 dh-disp" style={{ fontSize: `clamp(44px, ${titleVw}vw, ${Math.round(titleVw * 15)}px)` }}>{room.title}</h1>
          </div>
          {noPhotoEra && (
            <aside className="dh-medal"><label><span>No photograph of {dossier.subject.split(' ').slice(-1)[0]} survives from this period.</span></label></aside>
          )}
          {figure && variant && portrait && !noPhotoEra && (
            <aside className="dh-medal">
              <img src={commonsThumb(portrait.url, 330)} alt={portrait.title} />
              <label>
                <span>Face at age <b>{age}</b></span>
                <input type="range" min={ageBounds[0]} max={ageBounds[1]} value={age} onChange={e => setAge(Number(e.target.value))} aria-label="Age" />
              </label>
            </aside>
          )}
        </section>
        {artifactBanner && <p className="dh-banner-cap">{artifactBanner.title}. {artifactBanner.rights.credit}.</p>}
        {bannerAsset && <p className="dh-banner-cap"><b>Reconstruction.</b> {bannerAsset.title}. Imagined from: {bannerAsset.reconstruction?.basis}. {bannerAsset.rights.credit}.</p>}
      </div>

      <div className="dh-wrap">
        <nav className="dh-rail" aria-label="Rooms">
          {dossier.rooms.map((r, i) => {
            const w = dossier.wings?.find(x => x.roomIds[0] === r.id);
            return (
              <React.Fragment key={r.id}>
                {w && <div className="dh-wing" role="presentation">{w.title}</div>}
                <button className="dh-room" aria-current={r.id === planId} onClick={() => goRoom(r.id)}>
                  <small>Room {i + 1}{r.years ? ` · ${r.years}` : ''}</small>
                  <span>{r.title}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <main className="dh-main dh-sl">
          {room.nodes.map(n => {
            const claims = n.claimIds.map(c => claimById.get(c)).filter(Boolean) as Claim[];
            const isOpen = !!open[n.id];
            return (
              <article key={n.id} className="dh-node">
                <div className="dh-kind">{n.kind === 'source-reading' ? 'Primary source' : 'Story'}</div>
                <h3 className="dh-disp">{n.title}</h3>
                <p className={`dh-body ${depth}`}>{n.text[depth]}</p>
                <DossierBoundary key={n.id} scope="experience">
                {n.experience === 'model-t-exploded' && (
                  <React.Suspense fallback={<p className="dh-banner-cap">Opening the workshop…</p>}>
                    <ModelTExploded />
                  </React.Suspense>
                )}
                {n.experience === 'ford-moving-line' && (
                  <div className="dh-exp">
                    <React.Suspense fallback={<p className="dh-banner-cap">Starting the line…</p>}>
                      <FordMovingLine dossier={dossier} />
                    </React.Suspense>
                  </div>
                )}
                {n.experience === 'persia-road' && (
                  <div className="dh-exp">
                    <React.Suspense fallback={<p className="dh-banner-cap">Opening the road…</p>}>
                      <PersiaRoad />
                    </React.Suspense>
                  </div>
                )}
                {n.experience === 'douglass-composing-stick' && (
                  <div className="dh-exp">
                    <React.Suspense fallback={<p className="dh-banner-cap">Opening the case…</p>}>
                      <DouglassComposingStick />
                    </React.Suspense>
                  </div>
                )}
                {n.experience === 'partition-pen' && (
                  <div className="dh-exp">
                    <React.Suspense fallback={<p className="dh-banner-cap">Unrolling the map…</p>}>
                      <PartitionPen />
                    </React.Suspense>
                  </div>
                )}
                {n.experience === 'founding-timeline' && (
                  <div className="dh-exp">
                    <React.Suspense fallback={<p className="dh-banner-cap">Drawing the timeline…</p>}>
                      <FoundingTimeline dossier={dossier} onGoRoom={goRoom} />
                    </React.Suspense>
                  </div>
                )}
                </DossierBoundary>
                {n.assetIds.map(id => assetById.get(id)).filter((a): a is DossierAsset => !!a && a.kind === 'recreation' && a.id !== bannerAsset?.id).map(a => (
                  <figure key={a.id} className="dh-recon">
                    <span className="dh-recon-tag">Reconstruction</span>
                    <img src={a.url} alt={a.title} loading="lazy" />
                    <figcaption>{a.title}. Imagined from: {a.reconstruction?.basis}. {a.rights.credit}.</figcaption>
                  </figure>
                ))}
                {(() => {
                  const arts = n.assetIds.map(id => assetById.get(id))
                    .filter((a): a is DossierAsset => visibleAt(a) && a.kind !== 'recreation' && a.id !== artifactBanner?.id && a.id !== portrait?.id);
                  return arts.length ? (
                    <div className="dh-artifacts">
                      {arts.map(a => (
                        <figure key={a.id} className="dh-art">
                          <button className="dh-art-btn" onClick={() => setZoom(a)} aria-label={`View ${a.title}`}>
                            <img src={commonsThumb(a.url, 500)} alt={a.title} loading="lazy" />
                          </button>
                          <figcaption><b>{a.title}</b><br />{a.rights.credit}</figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : null;
                })()}
                <button className="dh-ev-btn" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [n.id]: !o[n.id] }))}>
                  <ShieldCheck size={15} /> Evidence ({claims.length})
                </button>
                {isOpen && (
                  <ul className="dh-claims">
                    {claims.map(c => (
                      <li key={c.id} className={`dh-claim ${c.confidence}`}>
                        <span className="dh-badge">
                          {c.confidence === 'contested' || c.confidence === 'tradition' ? <AlertTriangle size={12} /> : <BookOpen size={12} />}
                          {CONF_LABEL[c.confidence]}
                        </span>
                        {c.text}
                        {c.note && <span className="dh-note">{c.note}</span>}
                        <div className="dh-src">
                          <ScrollText size={12} style={{ display: 'inline', marginRight: 4 }} />
                          {c.sourceIds.map(s => sourceById.get(s)?.citation).filter(Boolean).join(' · ')}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}

          <footer className="dh-credits">
            <h4>Images in this room</h4>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {usedAssets.map(a => (
                <li key={a.id}>
                  {a.title} — {a.rights.credit}; {a.rights.status.replace('-', ' ')}.
                  {a.rights.verifiedAt && <> <a href={a.rights.verifiedAt} target="_blank" rel="noreferrer noopener">Record</a></>}
                  {a.reconstruction && <strong> Reconstruction: {a.reconstruction.basis}.</strong>}
                </li>
              ))}
            </ul>
          </footer>

          <nav className="dh-pager" aria-label="Move between rooms">
            {prevRoom ? (
              <button onClick={() => goRoom(prevRoom.id)}><ArrowLeft size={18} /><span><small>Previous room</small>{prevRoom.title}</span></button>
            ) : <span />}
            {nextRoom ? (
              <button className="next" onClick={() => goRoom(nextRoom.id)}><span><small>Next room</small>{nextRoom.title}</span><ArrowRight size={18} /></button>
            ) : onBack ? (
              <button className="next" onClick={onBack}><span><small>You have reached the end</small>{backLabel === 'Back' ? 'Leave the exhibit' : 'Back to the Exhibition Hall'}</span><ArrowRight size={18} /></button>
            ) : <span />}
          </nav>
        </main>
      </div>
    </div>
  );
}

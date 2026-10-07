import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ShieldCheck, AlertTriangle, ScrollText, MoreHorizontal } from 'lucide-react';
import { DEPTH_LEVELS, DEPTH_LABEL, type Claim, type DepthLevel, type Dossier, type DossierAsset } from '../../services/dossier/dossierTypes';
import { pickVariant } from '../../services/dossier/characterGateway';
import { commonsThumb } from '../../services/dossier/sourceAdapters';
import { DOSSIERS, takeRequestedDossier, type DossierEntry } from '../../data/dossier/registry';
import DossierEntrance from './DossierEntrance';
import DossierLobby from './DossierLobby';

const DossierFilmPlayer = React.lazy(() => import('./DossierFilmPlayer'));
const ModelTExploded = React.lazy(() => import('./ModelTExploded'));
const loadDouglassFilm = (w: number, h: number) => import('../../data/dossier/douglassFilm').then(m => m.loadDouglassFilm(w, h));

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

const CSS = `
.dh{--dh-bg:#0d0b10;--dh-panel:#16121b;--dh-line:rgba(255,255,255,.1);--dh-ink:#f2ecf6;--dh-mute:rgba(242,236,246,.62);
  min-height:100%;background:radial-gradient(1200px 600px at 20% -10%,rgba(107,0,153,.28),transparent 60%),var(--dh-bg);color:var(--dh-ink);
  font-family:'Inter',system-ui,sans-serif}
.dh *{box-sizing:border-box}
.dh-serif{font-family:'Fraunces',Georgia,'Times New Roman',serif}
.dh-top{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--dh-line);position:sticky;top:0;z-index:5;background:rgba(13,11,16,.92);backdrop-filter:blur(10px)}
.dh-crumbs{font-size:13px;color:var(--dh-mute);white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dh-crumbs b{font-size:18px;color:var(--dh-ink);font-weight:500}
.dh-tools{position:relative}
.dh-tools summary{list-style:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--dh-mute);font-size:12px;padding:6px 10px;border:1px solid var(--dh-line);border-radius:999px}
.dh-tools summary::-webkit-details-marker{display:none}
.dh-tools[open] summary,.dh-tools summary:hover{color:var(--dh-ink);border-color:rgba(255,255,255,.35)}
.dh-tools-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:20;min-width:230px;display:grid;gap:2px;padding:6px;background:#17131d;border:1px solid var(--dh-line);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.6)}
.dh-tools-menu button{text-align:left;background:none;border:0;color:var(--dh-ink);font-size:13px;padding:9px 12px;border-radius:8px;cursor:pointer}
.dh-tools-menu button:hover,.dh-tools-menu button:focus-visible{background:rgba(255,255,255,.08);outline:none}
.dh-pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:34px 0 0}
.dh-pager button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--dh-panel);border:1px solid var(--dh-line);border-radius:12px;padding:16px 18px;color:var(--dh-ink);cursor:pointer;font-family:'Fraunces',Georgia,serif;font-size:16px;line-height:1.3;transition:border-color .25s,transform .25s}
.dh-pager button:hover,.dh-pager button:focus-visible{border-color:rgba(240,201,135,.6);transform:translateY(-2px);outline:none}
.dh-pager button.next{justify-content:space-between;text-align:right}
.dh-pager small{display:block;font-family:'Inter',system-ui,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dh-mute);margin-bottom:3px}
.dh-back{display:inline-flex;align-items:center;gap:6px;color:var(--dh-mute);background:none;border:0;cursor:pointer;font-size:13px}
.dh-back:hover{color:var(--dh-ink)}
.dh-lens{margin-left:auto;display:flex;gap:4px;padding:3px;border:1px solid var(--dh-line);border-radius:999px;background:rgba(255,255,255,.04)}
.dh-lens button{border:0;background:none;color:var(--dh-mute);font-size:12px;padding:6px 11px;border-radius:999px;cursor:pointer;white-space:nowrap}
.dh-lens button[aria-pressed=true]{background:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055));color:#fff}
.dh-wrap{display:grid;grid-template-columns:260px minmax(0,1fr);gap:0;max-width:1240px;margin:0 auto}
.dh-wing{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dh-mute);margin:18px 0 6px 4px;white-space:nowrap}
.dh-wing:first-child{margin-top:0}
.dh-rail{padding:24px 16px 24px 20px;border-right:1px solid var(--dh-line);position:sticky;top:57px;align-self:start;height:calc(100vh - 57px);overflow:auto}
.dh-room{display:block;width:100%;text-align:left;background:none;border:0;border-left:2px solid var(--dh-line);color:var(--dh-mute);padding:10px 12px;cursor:pointer;margin-left:6px}
.dh-room small{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
.dh-room span{font-size:14px}
.dh-room[aria-current=true]{border-left-color:var(--pj-orange,#FF8C00);color:var(--dh-ink)}
.dh-main{padding:28px clamp(16px,4vw,48px) 80px;min-width:0}
.dh-banner{position:relative;height:clamp(300px,52vh,560px);margin:-28px calc(-1 * clamp(16px,4vw,48px)) 0;overflow:hidden;background:#000;animation:dhBanner .9s ease both}
.dh-banner-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;animation:dhPush 22s ease-out both}
.dh-banner-img.portrait{object-position:50% 20%;filter:sepia(.5) contrast(1.1) brightness(.7)}
.dh-banner-scrim{position:absolute;inset:0;background:linear-gradient(0deg,#0d0b10 2%,rgba(13,11,16,.55) 38%,rgba(13,11,16,.15) 70%,rgba(13,11,16,.5) 100%),radial-gradient(ellipse at 50% 40%,transparent 40%,rgba(13,11,16,.6) 100%)}
.dh-banner-text{position:absolute;left:clamp(16px,4vw,48px);bottom:clamp(18px,4vh,40px);max-width:min(760px,78%)}
.dh-numeral{font-size:clamp(70px,13vw,190px);line-height:.8;font-weight:300;color:rgba(255,140,0,.22);letter-spacing:-.02em;margin-bottom:-.18em;animation:dhRise 1s ease .15s both}
.dh-banner-text .dh-years,.dh-banner-text .dh-h1{animation:dhRise 1s ease .3s both}
.dh-banner-text .dh-h1{text-shadow:0 6px 40px rgba(0,0,0,.8)}
.dh-medal{position:absolute;right:clamp(16px,4vw,48px);bottom:clamp(18px,4vh,40px);display:flex;gap:12px;align-items:center;padding:8px 14px 8px 8px;border:1px solid var(--dh-line);border-radius:999px;background:rgba(13,11,16,.62);backdrop-filter:blur(10px)}
.dh-medal img{width:54px;height:54px;border-radius:50%;object-fit:cover;object-position:50% 15%;filter:sepia(.2)}
.dh-medal label{display:grid;gap:4px;font-size:11px;color:var(--dh-mute)}
.dh-medal b{color:var(--dh-ink)}
.dh-medal input{width:140px;accent-color:var(--pj-orange,#FF8C00)}
.dh-banner-cap{font-size:12px;color:var(--dh-mute);margin:10px 0 26px;line-height:1.5}
.dh-reveal{position:fixed;inset:0;z-index:70;pointer-events:none;overflow:hidden}
.dh-reveal i{position:absolute;top:0;bottom:0;width:50.4%;background:linear-gradient(90deg,#14101a,#0b0910);box-shadow:0 0 80px #000}
.dh-reveal i:first-child{left:0;border-right:1px solid rgba(240,201,135,.35);animation:dhOpenL 1.25s cubic-bezier(.7,0,.2,1) both}
.dh-reveal i:last-child{right:0;border-left:1px solid rgba(240,201,135,.35);animation:dhOpenR 1.25s cubic-bezier(.7,0,.2,1) both}
@keyframes dhOpenL{from{transform:none}to{transform:translateX(-102%)}}
@keyframes dhOpenR{from{transform:none}to{transform:translateX(102%)}}
@keyframes dhPush{from{transform:scale(1.02)}to{transform:scale(1.14)}}
@keyframes dhRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes dhBanner{from{opacity:0}to{opacity:1}}
.dh-replay{border:0;background:none;color:var(--dh-mute);font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.dh-frame{margin:0;background:var(--dh-panel);border:1px solid var(--dh-line);padding:10px 10px 8px;border-radius:4px;box-shadow:0 20px 50px rgba(0,0,0,.5)}
.dh-frame img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;object-position:50% 20%;background:#000;filter:sepia(.18) contrast(1.03)}
.dh-frame figcaption{font-size:11px;color:var(--dh-mute);line-height:1.45;margin-top:8px}
.dh-years{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--pj-orange,#FF8C00)}
.dh-h1{font-size:clamp(30px,5vw,54px);line-height:1.04;margin:6px 0 10px;font-weight:600}
.dh-age{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:12px;color:var(--dh-mute)}
.dh-age input{flex:1;accent-color:var(--pj-orange,#FF8C00)}
.dh-node{background:var(--dh-panel);border:1px solid var(--dh-line);border-radius:10px;padding:clamp(18px,3vw,30px);margin-bottom:22px}
.dh-node h3{font-size:clamp(20px,2.6vw,28px);margin:0 0 4px;font-weight:600}
.dh-kind{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dh-mute)}
.dh-body{font-size:clamp(16px,1.6vw,18px);line-height:1.75;margin:14px 0 18px;max-width:68ch}
.dh-body.early,.dh-body.elementary{font-size:clamp(18px,2vw,21px);line-height:1.8}
.dh-ev-btn{display:inline-flex;align-items:center;gap:8px;background:var(--pj-cyan-soft,rgba(0,218,243,.14));color:var(--pj-cyan,#00DAF3);border:1px solid rgba(0,218,243,.3);border-radius:999px;padding:7px 14px;font-size:12px;cursor:pointer}
.dh-claims{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:10px}
.dh-claim{border-left:3px solid var(--pj-success,#06D6A0);padding:6px 0 6px 12px;font-size:14px;line-height:1.55}
.dh-claim.contested,.dh-claim.tradition{border-left-color:var(--pj-warning,#F59E0B);background:var(--pj-warning-soft,rgba(245,158,11,.14))}
.dh-claim.probable{border-left-color:var(--pj-info,#3B82F6)}
.dh-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-right:8px;color:var(--dh-mute)}
.dh-note{display:block;margin-top:4px;color:var(--dh-mute);font-size:13px}
.dh-src{font-size:12px;color:var(--dh-mute);margin-top:4px}
.dh-banner-img.artifact{filter:sepia(.35) brightness(.62) saturate(.9);object-position:50% 40%}
.dh-artifacts{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin:4px 0 20px}
.dh-art{margin:0;background:#0f0c13;border:1px solid var(--dh-line);border-radius:8px;overflow:hidden}
.dh-art-btn{display:block;width:100%;border:0;padding:0;background:#000;cursor:zoom-in}
.dh-art img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;transition:transform .5s,filter .3s;filter:sepia(.2)}
.dh-art-btn:hover img,.dh-art-btn:focus-visible img{transform:scale(1.05);filter:none}
.dh-art figcaption{font-size:11px;line-height:1.4;color:var(--dh-mute);padding:8px 10px}
.dh-art figcaption b{color:var(--dh-ink);font-weight:600}
.dh-zoom{position:fixed;inset:0;z-index:80;background:rgba(5,4,8,.92);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.dh-zoom figure{margin:0;max-width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px;cursor:default}
.dh-zoom img{max-width:100%;max-height:78vh;object-fit:contain;border-radius:6px;background:#000}
.dh-zoom figcaption{font-size:13px;color:rgba(242,236,246,.8);line-height:1.5}
.dh-zoom a{color:var(--pj-cyan,#00DAF3)}
.dh-zoom-x{align-self:flex-start;border:1px solid rgba(255,255,255,.3);background:none;color:#fff;border-radius:999px;padding:6px 16px;font-size:12px;cursor:pointer}
.dh-recon{position:relative;margin:0 0 18px;border:1px solid var(--dh-line);border-radius:8px;overflow:hidden;background:#000}
.dh-recon img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.dh-recon figcaption{font-size:12px;color:var(--dh-mute);padding:8px 12px;line-height:1.45}
.dh-recon-tag{position:absolute;top:10px;left:10px;z-index:1;background:rgba(0,0,0,.72);color:var(--pj-orange,#FF8C00);border:1px solid rgba(255,140,0,.5);border-radius:999px;padding:3px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.dh-credits{margin-top:40px;border-top:1px solid var(--dh-line);padding-top:18px;font-size:12px;color:var(--dh-mute);line-height:1.6}
.dh-credits h4{margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.dh-credits a{color:inherit}
@media(max-width:860px){
 .dh-wrap{grid-template-columns:1fr}
 .dh-rail{position:static;height:auto;display:flex;gap:6px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--dh-line);padding:10px 12px}
 .dh-room{border-left:0;border-bottom:2px solid var(--dh-line);margin:0;min-width:150px}
 .dh-room[aria-current=true]{border-bottom-color:var(--pj-orange,#FF8C00)}
 .dh-medal{position:relative;right:auto;bottom:auto;margin:-64px 16px 0;width:max-content}
 .dh-banner-text{max-width:92%}
 .dh-lens{margin-left:0;overflow-x:auto;max-width:100%}
 .dh-top{flex-wrap:wrap}
 .dh-crumbs{flex:1 1 0}
 .dh-crumbs b{font-size:16px}
 .dh-pager{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){.dh-banner-img{animation:none}.dh-reveal{display:none}}
@media(prefers-reduced-motion:no-preference){.dh-node{animation:dhIn .35s ease both}@keyframes dhIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
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
  if (!loaded) return <div className="dh" style={{ padding: 40, color: 'rgba(242,236,246,.6)' }}>Opening exhibit…</div>;
  const hasLobby = DOSSIERS.length > 1 && !props.dossier;
  const toLobby = hasLobby ? () => setChosen(null) : props.onBack;
  return <HallInner key={loaded.id} dossier={loaded} entry={entry ?? DOSSIERS[0]} onBack={toLobby} backLabel={hasLobby ? 'Exhibition Hall' : 'Back'} />;
}

function HallInner({ dossier, entry, onBack, backLabel = 'Back' }: { dossier: Dossier; entry: DossierEntry; onBack?: () => void; backLabel?: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [depth, setDepth] = useState<DepthLevel>(readDepth);
  const [roomId, setRoomId] = useState(dossier.rooms[0].id);
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
  const goRoom = (id: string) => {
    setRoomId(id);
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'start' }));
  };
  const finishIntro = () => { setIntro(false); setReveal(true); window.setTimeout(() => setReveal(false), 1400); };

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
  const prevRoom = dossier.rooms[roomNumber - 2];
  const nextRoom = dossier.rooms[roomNumber];
  // Keep the active room visible in the rail (a sideways strip on phones).
  useEffect(() => {
    rootRef.current?.querySelector('.dh-room[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [room.id]);
  // Arrow keys move between rooms (not while typing, in the opening, or with the viewer open).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (intro || zoom || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowRight' && nextRoom) goRoom(nextRoom.id);
      if (e.key === 'ArrowLeft' && prevRoom) goRoom(prevRoom.id);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [intro, zoom, nextRoom?.id, prevRoom?.id]);
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

  return (
    <div className="dh" ref={rootRef}>
      <style>{CSS}</style>
      {intro && <DossierEntrance dossier={dossier} onEnter={finishIntro} />}
      {film && (
        <React.Suspense fallback={null}>
          <DossierFilmPlayer load={loadDouglassFilm} onClose={() => setFilm(false)} />
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
          <b className="dh-serif">{dossier.subject}</b>
          <span className="dh-crumb-room"> · Room {roomNumber} of {dossier.rooms.length}</span>
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
            {dossier.id === 'frederick-douglass' && <button onClick={e => { setFilm(true); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>▶ Watch the film</button>}
            {entry.telaTimeline && <button onClick={e => { openTimelineInTela(entry).catch(() => {}); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>Open the timeline in Tela</button>}
            {entry.fabulaFilm && <button onClick={e => { openFilmInFabula(entry).catch(() => {}); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>Open the film in Fabula</button>}
          </div>
        </details>
      </header>

      <div className="dh-wrap">
        <nav className="dh-rail" aria-label="Rooms">
          {dossier.rooms.map((r, i) => {
            const wing = dossier.wings?.find(w => w.roomIds[0] === r.id);
            return (
              <React.Fragment key={r.id}>
                {wing && <div className="dh-wing" role="presentation">{wing.title}</div>}
                <button className="dh-room" aria-current={r.id === room.id} onClick={() => goRoom(r.id)}>
                  <small>Room {i + 1}{r.years ? ` · ${r.years}` : ''}</small>
                  <span className="dh-serif">{r.title}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <main className="dh-main">
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
              <div className="dh-numeral dh-serif" aria-hidden>{String(roomNumber).padStart(2, '0')}</div>
              <div className="dh-years">{room.years}</div>
              <h1 className="dh-h1 dh-serif">{room.title}</h1>
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
          {bannerAsset && <p className="dh-banner-cap">{bannerAsset.title}. Imagined from: {bannerAsset.reconstruction?.basis}. {bannerAsset.rights.credit}.</p>}

          {room.nodes.map(n => {
            const claims = n.claimIds.map(c => claimById.get(c)).filter(Boolean) as Claim[];
            const isOpen = !!open[n.id];
            return (
              <article key={n.id} className="dh-node">
                <div className="dh-kind">{n.kind === 'source-reading' ? 'Primary source' : 'Story'}</div>
                <h3 className="dh-serif">{n.title}</h3>
                <p className={`dh-body ${depth}`}>{n.text[depth]}</p>
                {n.experience === 'model-t-exploded' && (
                  <React.Suspense fallback={<p className="dh-banner-cap">Opening the workshop…</p>}>
                    <ModelTExploded />
                  </React.Suspense>
                )}
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
                  <ShieldCheck size={14} /> Evidence ({claims.length})
                </button>
                {isOpen && (
                  <ul className="dh-claims">
                    {claims.map(c => (
                      <li key={c.id} className={`dh-claim ${c.confidence}`}>
                        <span className="dh-badge">
                          {c.confidence === 'contested' || c.confidence === 'tradition' ? <AlertTriangle size={11} /> : <BookOpen size={11} />}
                          {CONF_LABEL[c.confidence]}
                        </span>
                        {c.text}
                        {c.note && <span className="dh-note">{c.note}</span>}
                        <div className="dh-src">
                          <ScrollText size={11} style={{ display: 'inline', marginRight: 4 }} />
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
              <button onClick={() => goRoom(prevRoom.id)}><ArrowLeft size={16} /><span><small>Previous room</small>{prevRoom.title}</span></button>
            ) : <span />}
            {nextRoom ? (
              <button className="next" onClick={() => goRoom(nextRoom.id)}><span><small>Next room</small>{nextRoom.title}</span><ArrowRight size={16} /></button>
            ) : onBack ? (
              <button className="next" onClick={onBack}><span><small>You have reached the end</small>{backLabel === 'Back' ? 'Leave the exhibit' : 'Back to the Exhibition Hall'}</span><ArrowRight size={16} /></button>
            ) : <span />}
          </nav>
        </main>
      </div>
    </div>
  );
}

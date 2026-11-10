// Plajah Build: one front door for the maker and engineering tools. A blueprint-grid hero with a
// "What are you building?" prompt that routes the idea to the right room (sewing words open
// Sewing & Plush on the matching pattern, buildings open CAD, everything else is read by the
// Electronics Lab's describe-it designer), then a bento of rooms, each drawn in its own
// vernacular: circuit trace, floor plan, toolpath, pattern piece, supply network, helix.

import React, { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles, Ruler, Scissors, Dna, Store, Cog, Blocks } from 'lucide-react';
import { auth } from '../../services/backendService';
import { parseLaunch, routeIdea, PENDING_BUILD_KEY, type BuildLaunch, type Room } from '../../services/build/launch';
export { routeIdea, parseLaunch, PENDING_BUILD_KEY, type BuildLaunch };

const ExchangeRoom = React.lazy(() => import('../supply/ExchangeRoom'));
// Every design/make room opens inside the unified workspace shell, as a tab you can switch away from and back to.
const WorkspaceShell = React.lazy(() => import('../workspace/WorkspaceShell'));
const ROOM_WORKSPACE: Partial<Record<Room, string>> = { cad: 'architecture', elec: 'electronics', sew: 'sewing', bio: 'biology', studio: 'studio' };

const getToken = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);


const EXAMPLES = ['a MIDI controller with 3 knobs and 7 buttons', 'a 30 cm plush bunny', 'my own electric guitar, 25.5" scale', 'a hoodie in size L', 'a USB desk lamp with 6 warm LEDs', 'a queen fitted sheet'];
const TICKER = ['Ω · V · mA', 'E12 values', 'mm / in', '1:1 test square', 'IFC4', 'DXF · DWG · STEP', 'G-code · 9 dialects', 'SL1 resin', '3MF', 'seam allowance', 'grainline', 'yardage', 'CPSC recalls', '16 CFR 1501', 'ASTM F963', 'ADA 2010', 'FCC Part 15', 'Reese’s Law'];

const Loading = ({ label }: { label: string }) => <div className="fixed inset-0 grid place-items-center bg-[#0b0a0f] text-white/60 text-sm">Loading {label}…</div>;

/* ── Room drawings: small SVGs in each discipline's own visual language ─────────────────── */
const Circuit = () => <svg viewBox="0 0 320 150" className="pbh-art" aria-hidden="true">
  <g fill="none" stroke="rgba(255,140,0,.35)" strokeWidth="1.5"><path d="M10 110 H70 V40 H140"/><path d="M140 40 H200 V110 H310"/><path d="M70 110 V140"/><path d="M200 40 V12"/></g>
  <path className="pbh-trace" d="M10 110 H70 V40 H140 H200 V110 H310" fill="none" stroke="#FF8C00" strokeWidth="2.5" strokeLinecap="round"/>
  <rect x="122" y="28" width="36" height="24" rx="4" fill="#100d16" stroke="#FF8C00" strokeWidth="2"/><text x="140" y="44" fill="#FF8C00" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono, monospace">220Ω</text>
  <circle cx="200" cy="110" r="10" fill="#100d16" stroke="#FFB347" strokeWidth="2"/><circle className="pbh-led" cx="200" cy="110" r="5" fill="#FFD27A"/>
  <rect x="58" y="96" width="24" height="28" rx="3" fill="#100d16" stroke="rgba(255,140,0,.7)" strokeWidth="2"/><text x="70" y="113" fill="rgba(255,140,0,.9)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono, monospace">5V</text>
  <g fill="#FF8C00">{[[70, 40], [200, 40], [70, 110]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3"/>)}</g>
</svg>;
const FloorPlan = () => <svg viewBox="0 0 220 150" className="pbh-art" aria-hidden="true">
  <g fill="none" stroke="#00DAF3" strokeWidth="5" strokeLinejoin="miter"><path d="M20 20 H200 V130 H20 Z"/></g><path d="M110 20 V80" stroke="#00DAF3" strokeWidth="3.5"/><path d="M110 104 V130" stroke="#00DAF3" strokeWidth="3.5"/>
  <path d="M110 80 A24 24 0 0 1 134 104" fill="none" stroke="rgba(0,218,243,.6)" strokeWidth="1.2" strokeDasharray="3 2"/><path d="M110 80 L134 104" stroke="rgba(0,218,243,.8)" strokeWidth="1.2"/>
  <path d="M150 20 h28" stroke="#08070b" strokeWidth="6"/><path d="M150 18 h28 M150 22 h28" stroke="rgba(0,218,243,.7)" strokeWidth="1"/>
  <g stroke="rgba(255,255,255,.4)" strokeWidth="1"><path d="M20 142 H200"/><path d="M20 138 v8 M200 138 v8"/></g><text x="110" y="149" fill="rgba(255,255,255,.55)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono, monospace">6 400 mm</text>
  <text x="62" y="78" fill="rgba(0,218,243,.75)" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono, monospace">LIVING</text><text x="155" y="78" fill="rgba(0,218,243,.75)" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono, monospace">STUDIO</text>
</svg>;
const Toolpath = () => <svg viewBox="0 0 220 150" className="pbh-art" aria-hidden="true">
  {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M30 ${120 - i * 18} Q110 ${100 - i * 18} 190 ${120 - i * 18}`} fill="none" stroke={`rgba(255,140,0,${0.18 + i * 0.12})`} strokeWidth="2"/>)}
  <path className="pbh-trace" d="M30 48 Q110 28 190 48" fill="none" stroke="#FF8C00" strokeWidth="3" strokeLinecap="round"/>
  <g className="pbh-nozzle"><path d="M100 4 h20 l-4 18 h-12 z" fill="#100d16" stroke="#FFB347" strokeWidth="2"/><path d="M106 22 l4 8 l4 -8" fill="#FFB347"/></g>
  <text x="30" y="142" fill="rgba(255,255,255,.5)" fontSize="8" fontFamily="JetBrains Mono, monospace">G1 X190 Y48 E1.27 F1800</text>
</svg>;
const Pattern = () => <svg viewBox="0 0 160 190" className="pbh-art" aria-hidden="true">
  <path d="M80 18 C58 18 46 30 44 46 C30 40 20 52 30 64 C38 72 44 70 46 72 C34 86 30 104 36 120 C24 124 20 140 32 150 C40 156 52 154 58 148 L58 170 H102 L102 148 C108 154 120 156 128 150 C140 140 136 124 124 120 C130 104 126 86 114 72 C116 70 122 72 130 64 C140 52 130 40 116 46 C114 30 102 18 80 18 Z" fill="rgba(212,0,85,.14)" stroke="#F472B6" strokeWidth="2.2"/>
  <path d="M80 26 C62 26 52 36 51 50 C40 46 32 54 38 62 C44 68 50 67 53 70 C42 84 38 102 43 116 C32 120 29 134 37 142 C44 147 53 146 60 140 L64 162 H96 L100 140 C107 146 116 147 123 142 C131 134 128 120 117 116 C122 102 118 84 107 70 C110 67 116 68 122 62 C128 54 120 46 109 50 C108 36 98 26 80 26 Z" fill="none" stroke="rgba(147,197,253,.9)" strokeWidth="1.2" strokeDasharray="4 3"/>
  <path d="M80 64 V128" stroke="#4ade80" strokeWidth="2"/><path d="M76 70 L80 62 L84 70 M76 122 L80 130 L84 122" fill="none" stroke="#4ade80" strokeWidth="2"/>
  <circle cx="68" cy="58" r="4" fill="none" stroke="#f87171" strokeWidth="1.5"/><circle cx="92" cy="58" r="4" fill="none" stroke="#f87171" strokeWidth="1.5"/>
  <text x="80" y="184" fill="rgba(255,255,255,.55)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono, monospace">FRONT · CUT 1 · 6 mm SA</text>
</svg>;
const Network = () => <svg viewBox="0 0 220 150" className="pbh-art" aria-hidden="true">
  {[[40, 40], [180, 30], [190, 115], [35, 118], [110, 135]].map(([x, y], i) => <g key={i}><path d={`M110 75 L${x} ${y}`} stroke="rgba(208,188,255,.4)" strokeWidth="1.5" strokeDasharray="3 3" className="pbh-flow"/><circle cx={x} cy={y} r="9" fill="#100d16" stroke="#D0BCFF" strokeWidth="2"/></g>)}
  <circle cx="110" cy="75" r="20" fill="rgba(208,188,255,.12)" stroke="#D0BCFF" strokeWidth="2.5"/><text x="110" y="79" fill="#D0BCFF" fontSize="10" textAnchor="middle" fontFamily="Outfit, sans-serif" fontWeight="800">YOU</text>
</svg>;
const Helix = () => <svg viewBox="0 0 200 90" className="pbh-art" aria-hidden="true">
  <path d="M0 45 C25 5 50 5 75 45 S125 85 150 45 S190 5 200 25" fill="none" stroke="#5eead4" strokeWidth="2.5"/><path d="M0 45 C25 85 50 85 75 45 S125 5 150 45 S190 85 200 65" fill="none" stroke="rgba(94,234,212,.5)" strokeWidth="2.5"/>
  {[18, 38, 58, 92, 112, 132, 168, 186].map(x => <path key={x} d={`M${x} 28 V62`} stroke="rgba(94,234,212,.35)" strokeWidth="1.5"/>)}
</svg>;

const Studio = () => <svg viewBox="0 0 320 150" className="pbh-art" aria-hidden="true">
  <g fill="none" stroke="rgba(0,218,243,.22)" strokeWidth="1">{[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${20 + i * 22} 120 l60 -30`}/>)}{[0, 1, 2, 3].map(i => <path key={`b${i}`} d={`M20 ${120 - i * 0} l${110} 0`} transform={`translate(${i * 15} ${-i * 7.5})`}/>)}</g>
  <path d="M60 96 l34 -17 l34 17 l-34 17 z" fill="rgba(255,140,0,.25)" stroke="#FF8C00" strokeWidth="2"/><path d="M60 96 v-26 l34 -17 l34 17 v26" fill="none" stroke="#FF8C00" strokeWidth="2"/><path d="M94 79 v-26" stroke="#FF8C00" strokeWidth="1.5" strokeDasharray="3 3"/>
  <circle cx="94" cy="66" r="7" fill="#08070b" stroke="#9aa4b2" strokeWidth="1.5" strokeDasharray="2 2"/>
  <g transform="translate(176 22)"><rect width="120" height="22" rx="7" fill="#f76707"/><text x="10" y="15" fill="#fff" fontSize="10" fontFamily="Outfit, sans-serif" fontWeight="700">turn pin 13 on</text>
    <rect y="27" width="120" height="22" rx="7" fill="#0b98b8"/><text x="10" y="42" fill="#fff" fontSize="10" fontFamily="Outfit, sans-serif" fontWeight="700">wait 500 ms</text>
    <rect y="54" width="120" height="22" rx="7" fill="#f76707"/><text x="10" y="69" fill="#fff" fontSize="10" fontFamily="Outfit, sans-serif" fontWeight="700">turn pin 13 off</text>
    <circle className="pbh-led" cx="60" cy="104" r="8" fill="#ff4d4d"/><path d="M56 112 v14 M64 112 v10" stroke="rgba(255,255,255,.5)" strokeWidth="2"/></g>
</svg>;

const ROOMS: Array<{ id: Room; size: 'wide' | 'tall' | 'std' | 'band'; kicker: string; title: string; body: string; icon: React.ComponentType<{ size?: number }>; tone: string; art: React.ReactNode; chips: string[] }> = [
  { id: 'elec', size: 'wide', kicker: 'Electronics Lab', title: 'Describe it. We design it.', icon: Sparkles, tone: '#FF8C00', art: <Circuit/>,
    body: 'A lamp, a charger, a speaker, a MIDI controller, your own guitar. Plajah drafts the circuit, sizes every part, simulates it, fits it in a printable case and writes the firmware.',
    chips: ['Raspberry Pi · Pico · ESP32 · Arduino', 'Live simulation', 'FCC & EU radio checks'] },
  { id: 'sew', size: 'tall', kicker: 'Sewing & Plush', title: 'Plush, bedding, clothing.', icon: Scissors, tone: '#D40055', art: <Pattern/>,
    body: 'Patterns drafted to your measurements, printed 1:1 at home, cut on a Cricut or laser, or sent to a seamstress as a tech pack.',
    chips: ['10 patterns', 'Yardage', 'Tech packs'] },
  { id: 'cad', size: 'std', kicker: 'CAD & BIM', title: 'Draft it. Model it. Schedule it.', icon: Ruler, tone: '#00DAF3', art: <FloorPlan/>,
    body: 'Open DWG, DXF, IFC and STEP. Walls with doors and windows become BIM, with live schedules and ADA pre-checks.', chips: ['Own IFC4 writer', 'Snaps & layers'] },
  { id: 'cad', size: 'std', kicker: 'Make', title: 'Send it to the machine.', icon: Cog, tone: '#FFB347', art: <Toolpath/>,
    body: 'Slice for filament and resin, cut on laser, router and plasma, turn on a lathe, and send over your network or USB.', chips: ['Supports & brim', 'Klipper · PrusaLink · OctoPrint'] },
  { id: 'exchange', size: 'std', kicker: 'Maker Exchange', title: 'Find who can make it.', icon: Store, tone: '#D0BCFF', art: <Network/>,
    body: 'Parts with live prices, local maker shops, manufacturers for plush and cut-and-sew. Quotes come with the maker’s own payment link.', chips: ['35 suppliers', '0% held'] },
  { id: 'studio', size: 'wide', kicker: 'Build Studio', title: 'Shapes, circuits, blocks.', icon: Blocks, tone: '#00DAF3', art: <Studio/>,
    body: 'The free place to start: drag shapes into a keychain and print it, wire LEDs on a breadboard, and make them blink with blocks that turn into real Arduino and MicroPython code. Lessons check each step.',
    chips: ['3D for beginners', 'Breadboard + simulator', 'Blocks → C++ / MicroPython', 'Classroom lessons'] },
  { id: 'bio', size: 'std', kicker: 'Biology Lab', title: 'Molecules & pathways.', icon: Dna, tone: '#5eead4', art: <Helix/>,
    body: 'PDB and AlphaFold structures, SBML models on our own solver.', chips: ['BioModels by ID'] },
];

export default function PlajahBuildHub({ onBack }: { onBack?: () => void }) {
  const [room, setRoom] = useState<{ id: Room; prompt?: string; template?: string; starter?: string; lesson?: string } | null>(null);
  const [idea, setIdea] = useState('');
  const [ex, setEx] = useState(0);
  useEffect(() => { const t = setInterval(() => setEx(i => (i + 1) % EXAMPLES.length), 3200); return () => clearInterval(t); }, []);
  const close = () => setRoom(null);
  // Launch requests: a 'plajah:openBuild' window event, or one left in sessionStorage before this page mounted.
  useEffect(() => {
    const open = (l: BuildLaunch | null) => { if (l) setRoom({ id: l.room, prompt: l.prompt, template: l.template, starter: l.starter, lesson: l.lesson }); };
    try { const pending = sessionStorage.getItem(PENDING_BUILD_KEY); if (pending) { sessionStorage.removeItem(PENDING_BUILD_KEY); open(parseLaunch(pending)); } } catch { /* storage blocked */ }
    const onLaunch = (e: Event) => { open(parseLaunch((e as CustomEvent).detail)); try { sessionStorage.removeItem(PENDING_BUILD_KEY); } catch { /* storage blocked */ } };
    window.addEventListener('plajah:openBuild', onLaunch); return () => window.removeEventListener('plajah:openBuild', onLaunch);
  }, []);
  const go = (text: string) => { const t = text.trim(); if (!t) return; const r = routeIdea(t); setRoom({ id: r.room, prompt: r.room === 'elec' ? t : undefined, template: r.template, starter: r.starter }); };

  // Rooms are full-screen; a portal on <body> lifts them above the app's header and navigation.
  const layer = (label: string, node: React.ReactNode) => createPortal(<div className="fixed inset-0 z-[9990]"><Suspense fallback={<Loading label={label}/>}>{node}</Suspense></div>, document.body);
  const ws = room ? ROOM_WORKSPACE[room.id] : undefined;
  if (room && ws) return layer('your workspace', <WorkspaceShell initial={ws} launch={{ prompt: room.prompt, template: room.template, starter: room.starter, lesson: room.lesson }} getToken={getToken} onClose={close}/>);

  return <div className="pbh" data-testid="plajah-build-hub">
    <section className="pbh-hero">
      <div className="pbh-grid" aria-hidden="true"/>
      <div className="pbh-glow" aria-hidden="true"/>
      <div className="pbh-in">
        {onBack && <button onClick={onBack} className="pbh-back"><ArrowLeft size={15}/>Back</button>}
        <div className="pbh-kicker"><span className="pbh-dot"/>Plajah Build</div>
        <h1 className="pbh-h1"><span>Build</span><span className="pbh-grad">anything.</span></h1>
        <p className="pbh-lede">Electronics, buildings, fabrication, sewing and plush. Tell Plajah what you’re making and it designs it, checks it for safety, and gets it to a machine or a maker.</p>
        <form className="pbh-ask" onSubmit={e => { e.preventDefault(); go(idea); }}>
          <label htmlFor="pbh-idea" className="pbh-ask-label">What are you building?</label>
          <div className="pbh-ask-row">
            <input id="pbh-idea" value={idea} onChange={e => setIdea(e.target.value)} placeholder={EXAMPLES[ex]} autoComplete="off" data-testid="build-idea"/>
            <button type="submit" disabled={!idea.trim()} data-testid="build-idea-go">Design it<ArrowRight size={17}/></button>
          </div>
          <div className="pbh-try">{EXAMPLES.slice(0, 4).map(x => <button type="button" key={x} onClick={() => { setIdea(x); go(x); }}>{x}</button>)}</div>
        </form>
      </div>
      <div className="pbh-ticker" aria-hidden="true"><div className="pbh-ticker-run">{[...TICKER, ...TICKER].map((t, i) => <span key={i}>{t}</span>)}</div></div>
    </section>

    <section className="pbh-bento" aria-label="Rooms">
      {ROOMS.map((r, i) => { const Icon = r.icon; return <button key={`${r.kicker}${i}`} onClick={() => setRoom({ id: r.id })} className={`pbh-tile pbh-${r.size}${r.id === 'exchange' ? ' pbh-x' : ''}`} style={{ ['--tone' as any]: r.tone }} data-testid={`build-open-${r.kicker.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
        <div className="pbh-tile-art">{r.art}</div>
        <div className="pbh-tile-txt">
          <div className="pbh-tile-k"><Icon size={14}/>{r.kicker}</div>
          <h2 className="pbh-tile-h">{r.title}</h2>
          <p className="pbh-tile-p">{r.body}</p>
          <div className="pbh-chips">{r.chips.map(c => <span key={c}>{c}</span>)}</div>
          <span className="pbh-open">Open<ArrowRight size={15}/></span>
        </div>
      </button>; })}
    </section>

    <section className="pbh-safety">
      <ShieldCheck size={34} className="pbh-safety-ic"/>
      <div><h2>Safety comes first. In every room.</h2>
        <p>Warnings from the first design choice, recall lookups for products like yours, and gates that stop unsafe designs before you export, cut, print or sell. Plastic eyes on toys for toddlers, hood drawstrings on kids’ hoodies, uncertified mains modules: caught at the design stage.</p></div>
    </section>

    <section className="pbh-stats" aria-label="By the numbers">
      {[['3-in-1', 'beginner studio: 3D, circuits, blocks'], ['8', 'products you can describe'], ['10', 'sewing & plush patterns'], ['23', 'fabrication processes'], ['35', 'suppliers & makers'], ['0%', 'of your money held']].map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}
    </section>
    <p className="pbh-note">Working in a Tela document? The same rooms are in Tela’s app menu and put schematics, drawings, layouts and parts lists right into your page.</p>

    {room?.id === 'exchange' && layer('Maker Exchange', <ExchangeRoom getToken={getToken} onClose={close}/>)}

    <style>{`
.pbh{container-type:inline-size;min-height:100%;width:100%;background:#08070b;color:#f6f3fa;font-family:var(--font-body,Inter,system-ui,sans-serif);overflow-x:hidden}
.pbh .pbh-hero{position:relative;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.06)}
.pbh .pbh-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(0,218,243,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(0,218,243,.09) 1px,transparent 1px),linear-gradient(rgba(0,218,243,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(0,218,243,.045) 1px,transparent 1px);background-size:120px 120px,120px 120px,24px 24px,24px 24px;-webkit-mask-image:radial-gradient(120% 90% at 30% 20%,#000 40%,transparent 85%);mask-image:radial-gradient(120% 90% at 30% 20%,#000 40%,transparent 85%)}
.pbh .pbh-glow{position:absolute;inset:-20% -10% auto -10%;height:120%;background:radial-gradient(40% 50% at 12% 10%,rgba(107,0,153,.65),transparent 70%),radial-gradient(35% 45% at 85% 20%,rgba(212,0,85,.45),transparent 70%),radial-gradient(40% 40% at 60% 95%,rgba(255,140,0,.28),transparent 70%)}
.pbh .pbh-in{position:relative;max-width:1180px;margin:0 auto;padding:28px 24px 56px}
.pbh .pbh-back{display:flex;width:fit-content;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.8);font-size:13px;margin-bottom:28px}
.pbh .pbh-kicker{display:inline-flex;align-items:center;gap:10px;font:600 12px/1 var(--font-mono-tech,'JetBrains Mono',monospace);letter-spacing:.28em;text-transform:uppercase;color:#00DAF3}
.pbh .pbh-dot{width:8px;height:8px;border-radius:50%;background:#00DAF3;box-shadow:0 0 14px #00DAF3}
.pbh .pbh-h1{margin:14px 0 0;font-family:var(--font-display,Outfit,sans-serif);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.045em;line-height:.84;font-size:clamp(52px,12.5cqi,168px);display:flex;flex-wrap:wrap;column-gap:.22em;color:#fff}
.pbh .pbh-grad{background:linear-gradient(95deg,#FF8C00 0%,#D40055 45%,#a855f7 100%);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.pbh .pbh-lede{margin:22px 0 0;max-width:58ch;font-size:clamp(15px,1.6vw,18px);line-height:1.55;color:rgba(246,243,250,.72)}
.pbh .pbh-ask{margin-top:30px;max-width:820px;padding:18px;border-radius:28px;background:rgba(16,13,22,.72);border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px -30px rgba(212,0,85,.55),inset 0 1px 0 rgba(255,255,255,.06);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.pbh .pbh-ask-label{display:block;font:800 13px/1 var(--font-label,Outfit,sans-serif);letter-spacing:.14em;text-transform:uppercase;color:#FF8C00;margin:2px 4px 12px}
.pbh .pbh-ask-row{display:flex;gap:10px;flex-wrap:wrap}
.pbh .pbh-ask-row input{flex:1 1 260px;min-width:0;height:56px;padding:0 20px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:17px;outline:none}
.pbh .pbh-ask-row input:focus{border-color:#FF8C00;box-shadow:0 0 0 4px rgba(255,140,0,.18)}
.pbh .pbh-ask-row input::placeholder{color:rgba(255,255,255,.38)}
.pbh .pbh-ask-row button{height:56px;padding:0 26px;border-radius:999px;display:inline-flex;align-items:center;gap:10px;font:900 16px/1 var(--font-label,Outfit,sans-serif);color:#fff;background:linear-gradient(100deg,#6B0099,#D40055 55%,#FF8C00);box-shadow:0 10px 30px -8px rgba(212,0,85,.7)}
.pbh .pbh-ask-row button:disabled{opacity:.55}
.pbh .pbh-try{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.pbh .pbh-try button{font-size:12px;padding:7px 12px;border-radius:999px;color:rgba(255,255,255,.75);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}
.pbh .pbh-try button:hover{color:#fff;border-color:rgba(255,140,0,.6)}
.pbh .pbh-ticker{position:relative;border-top:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.35);overflow:hidden;white-space:nowrap}
.pbh .pbh-ticker-run{display:inline-flex;gap:38px;padding:12px 0;animation:pbh-tick 48s linear infinite}
.pbh .pbh-ticker span{font:500 12px/1 var(--font-mono-tech,'JetBrains Mono',monospace);letter-spacing:.12em;text-transform:uppercase;color:rgba(0,218,243,.75)}
.pbh .pbh-ticker span::after{content:'◆';margin-left:38px;color:rgba(212,0,85,.7)}
@keyframes pbh-tick{to{transform:translateX(-50%)}}
.pbh .pbh-bento{max-width:1180px;margin:0 auto;padding:44px 24px 12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(250px,auto);gap:16px}
.pbh .pbh-tile{position:relative;text-align:left;border-radius:28px;overflow:hidden;border:1px solid color-mix(in srgb,var(--tone) 28%,rgba(255,255,255,.08));background:linear-gradient(160deg,color-mix(in srgb,var(--tone) 16%,#100d16) 0%,#0e0b13 60%);display:flex;flex-direction:column;transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;min-width:0}
.pbh .pbh-tile:hover,.pbh .pbh-tile:focus-visible{transform:translateY(-4px);border-color:var(--tone);box-shadow:0 24px 60px -24px color-mix(in srgb,var(--tone) 70%,transparent);outline:none}
.pbh .pbh-wide{grid-column:span 3;flex-direction:row}
.pbh .pbh-tall{grid-row:span 2}
.pbh .pbh-band{grid-column:1/-1;flex-direction:row;align-items:center}
.pbh .pbh-band .pbh-tile-art{order:2;flex:1;padding:22px 30px}
.pbh .pbh-band .pbh-art{max-height:110px}
.pbh .pbh-band .pbh-tile-txt{flex:1.2}
.pbh .pbh-tile-art{display:grid;place-items:center;padding:22px 22px 0}
.pbh .pbh-wide .pbh-tile-art{flex:1.1;padding:28px;order:2}
.pbh .pbh-tall .pbh-tile-art{flex:1;padding:30px 30px 0}
.pbh .pbh-art{width:100%;max-height:170px;height:auto}
.pbh .pbh-tall .pbh-art{max-height:300px}
.pbh .pbh-wide .pbh-art{max-height:220px}
.pbh .pbh-tile-txt{padding:20px 22px 22px;display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
.pbh .pbh-wide .pbh-tile-txt{flex:1;padding:30px 30px 28px;justify-content:center}
.pbh .pbh-tile-k{display:inline-flex;align-items:center;gap:7px;font:700 11px/1 var(--font-mono-tech,'JetBrains Mono',monospace);letter-spacing:.18em;text-transform:uppercase;color:var(--tone)}
.pbh .pbh-tile-h{margin:0;font-family:var(--font-display,Outfit,sans-serif);font-weight:900;letter-spacing:-.02em;line-height:1.02;font-size:22px;color:#fff;text-wrap:balance}
.pbh .pbh-wide .pbh-tile-h{font-size:clamp(30px,3.4vw,44px);font-style:italic;text-transform:uppercase;letter-spacing:-.03em}
.pbh .pbh-tall .pbh-tile-h{font-size:28px}
.pbh .pbh-tile-p{margin:0;font-size:13.5px;line-height:1.5;color:rgba(246,243,250,.66)}
.pbh .pbh-wide .pbh-tile-p{font-size:15px;max-width:44ch}
.pbh .pbh-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.pbh .pbh-chips span{font:600 10.5px/1 var(--font-mono-tech,'JetBrains Mono',monospace);padding:6px 9px;border-radius:999px;color:color-mix(in srgb,var(--tone) 85%,#fff);background:color-mix(in srgb,var(--tone) 12%,transparent);border:1px solid color-mix(in srgb,var(--tone) 30%,transparent)}
.pbh .pbh-open{margin-top:auto;padding-top:8px;display:inline-flex;align-items:center;gap:6px;font:800 13px/1 var(--font-label,Outfit,sans-serif);color:#fff}
.pbh .pbh-open svg{transition:transform .2s}
.pbh .pbh-tile:hover .pbh-open svg{transform:translateX(3px)}
.pbh .pbh-trace{stroke-dasharray:520;stroke-dashoffset:520;animation:pbh-draw 3.6s ease-in-out infinite}
.pbh .pbh-led{animation:pbh-led 3.6s ease-in-out infinite;filter:drop-shadow(0 0 6px #FFB347)}
.pbh .pbh-nozzle{animation:pbh-noz 3.6s ease-in-out infinite}
.pbh .pbh-flow{animation:pbh-flow 1.6s linear infinite}
@keyframes pbh-draw{0%{stroke-dashoffset:520}55%,100%{stroke-dashoffset:0}}
@keyframes pbh-led{0%,50%{opacity:.15}60%,100%{opacity:1}}
@keyframes pbh-noz{0%{transform:translateX(-80px)}55%,100%{transform:translateX(80px)}}
@keyframes pbh-flow{to{stroke-dashoffset:-12}}
.pbh .pbh-safety{position:relative;max-width:1132px;margin:28px auto 0;display:flex;gap:20px;align-items:flex-start;border-radius:28px;background:linear-gradient(100deg,rgba(6,214,160,.16),rgba(6,214,160,.04) 60%,rgba(0,218,243,.08));border:1px solid rgba(6,214,160,.32)}
.pbh .pbh-safety-ic{flex:none;color:#06D6A0;margin:28px 0 0 28px;filter:drop-shadow(0 0 12px rgba(6,214,160,.6))}
.pbh .pbh-safety > div{padding:26px 28px 26px 0}
.pbh .pbh-safety h2{margin:0 0 6px;font-family:var(--font-display,Outfit,sans-serif);font-weight:900;font-size:clamp(22px,2.6vw,30px);letter-spacing:-.02em;color:#fff}
.pbh .pbh-safety p{margin:0;max-width:78ch;font-size:14.5px;line-height:1.55;color:rgba(220,255,244,.82)}
.pbh .pbh-stats{max-width:1180px;margin:28px auto 0;padding:0 24px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.pbh .pbh-stats div{padding:18px 4px;border-top:2px solid rgba(255,255,255,.1)}
.pbh .pbh-stats b{display:block;font-family:var(--font-display,Outfit,sans-serif);font-weight:900;font-size:clamp(34px,4.4vw,56px);line-height:1;letter-spacing:-.03em;background:linear-gradient(95deg,#fff,#FFB347);-webkit-background-clip:text;background-clip:text;color:transparent}
.pbh .pbh-stats span{display:block;margin-top:6px;font:600 11px/1.3 var(--font-mono-tech,'JetBrains Mono',monospace);letter-spacing:.08em;text-transform:uppercase;color:rgba(246,243,250,.5)}
.pbh .pbh-note{max-width:1180px;margin:18px auto 0;padding:0 24px 56px;font-size:13px;color:rgba(246,243,250,.5)}
@container (max-width:1180px){.pbh .pbh-safety{margin-left:24px;margin-right:24px}}
@container (max-width:1023px){.pbh .pbh-bento{grid-template-columns:repeat(2,minmax(0,1fr))}.pbh .pbh-wide{grid-column:span 2}.pbh .pbh-x{grid-column:1/-1;flex-direction:row;align-items:center}.pbh .pbh-x .pbh-tile-art{order:2;flex:1;padding:22px 30px}.pbh .pbh-x .pbh-tile-txt{flex:1.2}}
@container (max-width:639px){.pbh .pbh-in,.pbh .pbh-bento,.pbh .pbh-stats,.pbh .pbh-note{padding-left:16px;padding-right:16px}.pbh .pbh-safety{margin-left:16px;margin-right:16px;flex-direction:column;gap:0}.pbh .pbh-safety > div{padding:12px 22px 22px}.pbh .pbh-safety-ic{margin:22px 0 0 22px}.pbh .pbh-bento{grid-template-columns:minmax(0,1fr)}.pbh .pbh-wide,.pbh .pbh-tall,.pbh .pbh-band{grid-column:auto;grid-row:auto}.pbh .pbh-wide,.pbh .pbh-band{flex-direction:column;align-items:stretch}.pbh .pbh-wide .pbh-tile-art,.pbh .pbh-band .pbh-tile-art{order:0}.pbh .pbh-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.pbh .pbh-stats div:last-child{grid-column:1/-1}.pbh .pbh-x{flex-direction:column;align-items:stretch}.pbh .pbh-x .pbh-tile-art{order:0}}
@media (prefers-reduced-motion:reduce){.pbh .pbh-ticker-run,.pbh .pbh-trace,.pbh .pbh-led,.pbh .pbh-nozzle,.pbh .pbh-flow{animation:none}.pbh .pbh-trace{stroke-dashoffset:0}.pbh .pbh-led{opacity:1}.pbh .pbh-tile{transition:none}}
`}</style>
  </div>;
}

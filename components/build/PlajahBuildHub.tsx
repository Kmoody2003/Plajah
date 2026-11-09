// Plajah Build: one front door for the maker and engineering tools (Electronics Lab with
// describe-it design, CAD & BIM with the Make tab, Sewing & Plush, Biology Lab, Maker Exchange).
// Every room opens here on its own; inside a Tela document the same rooms can also add results to
// the page. Safety comes first in every room.

import React, { Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CircuitBoard, Ruler, Scissors, Dna, Store, Sparkles, ShieldCheck, Factory, ChevronRight } from 'lucide-react';
import { auth } from '../../services/backendService';

const ElecRoom = React.lazy(() => import('../elec/ElecRoom'));
const CadRoom = React.lazy(() => import('../cad/CadRoom'));
const PatternRoom = React.lazy(() => import('../soft/PatternRoom'));
const BioRoom = React.lazy(() => import('../bio/BioRoom'));
const ExchangeRoom = React.lazy(() => import('../supply/ExchangeRoom'));

type Room = 'elec' | 'cad' | 'sew' | 'bio' | 'exchange';
const getToken = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);

const ROOMS: Array<{ id: Room; title: string; tag: string; body: string; icon: React.ComponentType<{ size?: number; color?: string }>; tone: string; points: string[] }> = [
  { id: 'elec', title: 'Describe it, we design it', tag: 'Electronics Lab', icon: Sparkles, tone: '#FF8C00', body: 'Say what you are building: a lamp, a charger, a speaker, a MIDI controller, your own guitar. Plajah drafts the circuit, the case and the firmware.',
    points: ['Raspberry Pi, Pico, ESP32, Arduino', 'Simulate before you solder', 'Checks for ratings, radio and safety rules'] },
  { id: 'cad', title: 'CAD, BIM & Make', tag: 'Drafting · buildings · machines', icon: Ruler, tone: '#00DAF3', body: 'Open DWG, DXF, IFC, STEP and 3MF; draft plans with walls, doors and schedules; then slice and send to printers, lasers, CNC and lathes.',
    points: ['Own IFC4 writer and ADA pre-checks', 'FDM and resin slicing with supports', 'Klipper, PrusaLink, OctoPrint, Duet, USB'] },
  { id: 'sew', title: 'Sewing & Plush', tag: 'Plush · bedding · clothing', icon: Scissors, tone: '#D40055', body: 'Plush critters, pillows, throws, duvet covers, fitted sheets, totes, tees and hoodies: drafted from your measurements, ready to print, cut or send to a seamstress.',
    points: ['1:1 print-at-home patterns', 'Fabric layout and yardage', 'Tech packs for makers and factories'] },
  { id: 'bio', title: 'Biology Lab', tag: 'Molecules · pathways', icon: Dna, tone: '#5eead4', body: 'View protein structures from PDB and AlphaFold, and run SBML pathway models with our own solver.',
    points: ['Ribbon, ball-and-stick, spacefill', 'BioModels by ID', 'Charts straight into Tela'] },
  { id: 'exchange', title: 'Maker Exchange', tag: 'Parts · makers · manufacturers', icon: Store, tone: '#a78bfa', body: 'Find suppliers, local makers and manufacturers: parts, PCBs, machining, print-on-demand textiles, plush and cut-and-sew. Request quotes; pay makers directly.',
    points: ['35 suppliers, from DigiKey to Spoonflower', 'Local shops list their machines and skills', 'Plajah never holds your money'] },
];

const Loading = ({ label }: { label: string }) => <div className="fixed inset-0 z-[300] grid place-items-center bg-[#0b0a0f] text-white/60 text-sm">Loading {label}…</div>;

export default function PlajahBuildHub({ onBack }: { onBack?: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const close = () => setRoom(null);
  // Rooms are full-screen; a portal on <body> lifts them above the app's header and navigation.
  const layer = (label: string, node: React.ReactNode) => createPortal(<div className="fixed inset-0 z-[9990]"><Suspense fallback={<Loading label={label}/>}>{node}</Suspense></div>, document.body);
  if (room === 'elec') return layer('Electronics Lab', <ElecRoom getToken={getToken} onClose={close}/>);
  if (room === 'cad') return layer('CAD & BIM', <CadRoom getToken={getToken} onClose={close}/>);
  if (room === 'sew') return layer('Sewing & Plush', <PatternRoom getToken={getToken} onClose={close}/>);
  if (room === 'bio') return layer('Biology Lab', <BioRoom onClose={close}/>);

  return <div className="min-h-full w-full bg-[#0A0A0D] text-white" data-testid="plajah-build-hub">
    <div className="relative overflow-hidden border-b border-white/[.06]">
      <div className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(900px 340px at 10% -10%, rgba(107,0,153,.45), transparent 60%), radial-gradient(700px 300px at 90% 0%, rgba(212,0,85,.28), transparent 60%), radial-gradient(600px 260px at 60% 120%, rgba(255,140,0,.18), transparent 60%)' }}/>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-10">
        {onBack && <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white text-sm"><ArrowLeft size={15}/>Back</button>}
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.28em] text-[#00DAF3]"><Factory size={14}/>Plajah Build</div>
        <h1 className="mt-3 text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] max-w-3xl">Design it. Check it. Make it. <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg,#FF8C00,#D40055,#a855f7)' }}>Get it made.</span></h1>
        <p className="mt-4 max-w-2xl text-[15px]" style={{ color: "rgba(255,255,255,.66)" }}>Electronics, CAD and buildings, fabrication, sewing and plush, biology, and a maker exchange: free tools that run in your browser and drop straight into your Tela documents.</p>
        <div className="mt-6 inline-flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] px-4 py-3 text-[13px] text-emerald-100/90 max-w-2xl"><ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-300"/>Safety comes first: every room warns about hazards from the first design choice, checks recalls of similar products, and stops unsafe designs before you export or make them.</div>
      </div>
    </div>
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ROOMS.map(r => { const Icon = r.icon; return <button key={r.id} onClick={() => setRoom(r.id)} data-testid={`build-open-${r.id}`} className="group text-left rounded-[1.6rem] p-5 border border-white/[.08] bg-white/[.03] hover:bg-white/[.06] hover:-translate-y-0.5 transition-all">
        <div className="flex items-center gap-3"><div className="grid place-items-center w-11 h-11 rounded-2xl" style={{ background: `${r.tone}22`, border: `1px solid ${r.tone}55` }}><Icon size={20} color={r.tone}/></div>
          <div><div className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: r.tone }}>{r.tag}</div><div className="text-lg font-black tracking-tight" style={{ color: "#fff" }}>{r.title}</div></div></div>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,.64)" }}>{r.body}</p>
        <ul className="mt-3 space-y-1">{r.points.map(p => <li key={p} className="text-[12px] flex gap-2" style={{ color: "rgba(255,255,255,.8)" }}><span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: r.tone }}/>{p}</li>)}</ul>
        <div className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-white/80 group-hover:text-white">Open<ChevronRight size={14}/></div>
      </button>; })}
      <div className="rounded-[1.6rem] p-5 border border-dashed border-white/[.12] text-[13px] flex flex-col justify-center" style={{ color: "rgba(255,255,255,.58)" }}><CircuitBoard size={20} className="text-white/40 mb-2"/>Working in a Tela document? The same rooms are in Tela's app menu, and they put schematics, drawings, layouts and parts lists right into your page.</div>
    </div>
    {room === 'exchange' && layer('Maker Exchange', <ExchangeRoom getToken={getToken} onClose={close}/>)}
  </div>;
}

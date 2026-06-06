/**
 * Plajah Web3 Infographic
 * Admin-facing visual summary of the blockchain strategy.
 * Five panels showing: the problem, the opportunity, the 7 strategies,
 * the ecosystem flywheel, and the problem/solution pairs.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

// ─── Panel 1: The Problem ──────────────────────────────────────────────────────

const ProblemPanel: React.FC = () => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 300); }, []);

  const oldSlices = [
    { label: 'Label',       pct: 45, color: '#374151' },
    { label: 'Distributor', pct: 23, color: '#4b5563' },
    { label: 'Platform',    pct: 15, color: '#6b7280' },
    { label: 'Other',       pct: 5,  color: '#9ca3af' },
    { label: 'Artist',      pct: 12, color: '#f97316' },
  ];

  const newSlices = [
    { label: 'Plajah',  pct: 15, color: '#1f2937' },
    { label: 'Creator', pct: 85, color: '#f97316' },
  ];

  return (
    <div className="grid grid-cols-2 gap-12 items-center py-8">
      {/* Old world */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400/70 mb-4">The Old System</p>
        <p className="text-2xl font-black text-white mb-2">Artist gets <span className="text-red-400">12 cents</span></p>
        <p className="text-sm text-white/40 mb-8">on every dollar their work generates</p>
        <div className="space-y-2">
          {oldSlices.map((slice, i) => (
            <div key={slice.label} className="flex items-center gap-3">
              <div
                className="h-6 rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                style={{
                  width: animated ? `${slice.pct * 3}px` : '0px',
                  background: slice.color,
                  transitionDelay: `${i * 80}ms`,
                }}
              >
                <span className="text-[8px] font-black text-white/80">{slice.pct}%</span>
              </div>
              <span className={`text-[10px] font-bold ${slice.label === 'Artist' ? 'text-orange-400' : 'text-white/40'}`}>
                {slice.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* New world */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-400/70 mb-4">The Plajah System</p>
        <p className="text-2xl font-black text-white mb-2">Creator gets <span className="text-emerald-400">85 cents</span></p>
        <p className="text-sm text-white/40 mb-8">direct — instant — no middlemen</p>
        <div className="space-y-2">
          {newSlices.map((slice, i) => (
            <div key={slice.label} className="flex items-center gap-3">
              <div
                className="h-6 rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                style={{
                  width: animated ? `${slice.pct * 3}px` : '0px',
                  background: slice.color,
                  transitionDelay: `${600 + i * 120}ms`,
                }}
              >
                <span className="text-[8px] font-black text-white/80">{slice.pct}%</span>
              </div>
              <span className={`text-[10px] font-bold ${slice.label === 'Creator' ? 'text-emerald-400' : 'text-white/40'}`}>
                {slice.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <p className="text-xs font-black text-emerald-400">7× more revenue for creators.</p>
          <p className="text-[10px] text-white/40 mt-1">Paid in seconds. Not months.</p>
        </div>
      </div>
    </div>
  );
};

// ─── Panel 2: The 7 Strategies ─────────────────────────────────────────────────

const STRATEGIES = [
  {
    num: '01', title: 'Lightning Payments',
    desc: 'Sats flow to creators in real time as content plays. Paid per second — not per quarter.',
    color: '#f59e0b', phase: 'Phase 4',
    metrics: ['$0.01/min music', '$0.002/min video', '15% platform cut'],
  },
  {
    num: '02', title: 'Fan Investment',
    desc: 'Fans buy fractional ownership of content revenue. Artist raises capital upfront. Shareholders earn forever.',
    color: '#a855f7', phase: 'Phase 3',
    metrics: ['$2–$50 per share', '5% sale fee', '10% secondary'],
  },
  {
    num: '03', title: 'On-Chain Licensing',
    desc: 'Brands and studios license directly via smart contract. 10 minutes instead of 6 months.',
    color: '#3b82f6', phase: 'Phase 2',
    metrics: ['15% platform cut', 'Instant settlement', 'Immutable record'],
  },
  {
    num: '04', title: 'Creation Certificates',
    desc: 'Content fingerprint inscribed on Bitcoin permanently. Immutable proof of authorship.',
    color: '#f97316', phase: 'Phase 1',
    metrics: ['$5 service fee', 'Bitcoin-level security', 'AI-proof'],
  },
  {
    num: '05', title: 'Heritage Archives',
    desc: 'Detroit cultural heritage preserved on-chain. Grant-fundable. Licensing revenue.',
    color: '#10b981', phase: 'Phase 2',
    metrics: ['Grant income', 'Institutional licensing', 'City partnerships'],
  },
  {
    num: '06', title: 'Collaborative Contracts',
    desc: 'Multi-creator projects split revenue automatically. No labels. No accountants. No disputes.',
    color: '#ec4899', phase: 'Phase 3',
    metrics: ['10% platform cut', 'Up to 20 creators', 'Immutable splits'],
  },
  {
    num: '07', title: 'DeFi Creator Advances',
    desc: 'Borrow against verified royalty history. Smart contract repays automatically.',
    color: '#14b8a6', phase: 'Phase 5',
    metrics: ['4–8% interest', 'No credit check', 'No label needed'],
  },
];

const StrategiesPanel: React.FC = () => (
  <div className="py-8">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {STRATEGIES.map((s, i) => (
        <motion.div
          key={s.num}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl font-black" style={{ color: `${s.color}40` }}>{s.num}</span>
            <span
              className="text-[7px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: `${s.color}15`, color: s.color }}
            >
              {s.phase}
            </span>
          </div>
          <p className="text-xs font-black text-white mb-2">{s.title}</p>
          <p className="text-[9px] text-white/40 mb-4 leading-relaxed">{s.desc}</p>
          <div className="space-y-1.5">
            {s.metrics.map(m => (
              <div key={m} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full" style={{ background: s.color }} />
                <span className="text-[8px] font-bold text-white/50">{m}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {/* Platform revenue summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-5"
      >
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-orange-400/70 mb-3">Plajah Revenue</p>
        <p className="text-xs font-black text-white mb-3">All streams active simultaneously</p>
        <div className="space-y-2">
          {[
            ['1K users', '$4.5K/yr'],
            ['10K users', '$72K/yr'],
            ['50K users', '$260K/yr'],
            ['200K users', '$1.1M/yr'],
          ].map(([u, r]) => (
            <div key={u} className="flex justify-between">
              <span className="text-[9px] text-white/40">{u}</span>
              <span className="text-[9px] font-black text-orange-400">{r}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  </div>
);

// ─── Panel 3: Ecosystem Flywheel ───────────────────────────────────────────────

const VERTICALS = [
  { label: 'Music',      color: '#f97316', angle: 0   },
  { label: 'Film/TV',    color: '#a855f7', angle: 51  },
  { label: 'Books',      color: '#3b82f6', angle: 103 },
  { label: 'Journalism', color: '#10b981', angle: 154 },
  { label: 'IP Worlds',  color: '#f59e0b', angle: 206 },
  { label: 'Taleo',      color: '#ec4899', angle: 257 },
  { label: 'Rello',      color: '#14b8a6', angle: 309 },
];

const FlywheelPanel: React.FC = () => (
  <div className="flex items-center justify-center py-8 gap-16">
    {/* SVG flywheel */}
    <div className="relative">
      <svg width={380} height={380} viewBox="-190 -190 380 380">
        {/* Center PLAJ circle */}
        <circle cx={0} cy={0} r={55} fill="#f97316" fillOpacity={0.1} stroke="#f97316" strokeWidth={1} strokeOpacity={0.3} />
        <text x={0} y={-8} textAnchor="middle" fill="#f97316" fontSize={14} fontWeight="900" fontFamily="sans-serif">PLAJ</text>
        <text x={0} y={10} textAnchor="middle" fill="#f97316" fillOpacity={0.6} fontSize={8} fontFamily="sans-serif">Token Economy</text>

        {/* Connecting lines */}
        {VERTICALS.map((v) => {
          const rad = (v.angle - 90) * Math.PI / 180;
          const inner = 60;
          const outer = 130;
          return (
            <line
              key={v.label + 'line'}
              x1={Math.cos(rad) * inner} y1={Math.sin(rad) * inner}
              x2={Math.cos(rad) * outer} y2={Math.sin(rad) * outer}
              stroke={v.color} strokeWidth={1} strokeOpacity={0.3}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Vertical nodes */}
        {VERTICALS.map((v) => {
          const rad = (v.angle - 90) * Math.PI / 180;
          const r = 140;
          const x = Math.cos(rad) * r;
          const y = Math.sin(rad) * r;
          return (
            <g key={v.label}>
              <circle cx={x} cy={y} r={32} fill={v.color} fillOpacity={0.1} stroke={v.color} strokeWidth={1} strokeOpacity={0.4} />
              <text x={x} y={y + 4} textAnchor="middle" fill={v.color} fontSize={8} fontWeight="900" fontFamily="sans-serif">
                {v.label}
              </text>
            </g>
          );
        })}

        {/* Rotation arrows */}
        <path d="M -80,0 A 80,80 0 0,1 80,0" fill="none" stroke="#ffffff" strokeWidth={0.5} strokeOpacity={0.1} markerEnd="url(#arrow)" />
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M 0,0 L 6,3 L 0,6 Z" fill="rgba(255,255,255,0.2)" />
          </marker>
        </defs>
      </svg>
    </div>

    {/* Legend */}
    <div className="space-y-4 max-w-xs">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">How it connects</p>
        {[
          { from: 'Music', to: 'Film', via: 'Soundtracks commissioned on-chain' },
          { from: 'Books', to: 'IP Worlds', via: 'Characters migrate with license contracts' },
          { from: 'Journalism', to: 'Film', via: 'Investigations optioned for documentary' },
          { from: 'Film', to: 'Taleo', via: 'Talent sourced and paid via smart contract' },
        ].map(conn => (
          <div key={conn.from + conn.to} className="mb-3 border-l-2 border-white/10 pl-3">
            <p className="text-[9px] font-black text-white/60">
              {conn.from} <span className="text-white/25">→</span> {conn.to}
            </p>
            <p className="text-[8px] text-white/30">{conn.via}</p>
          </div>
        ))}
      </div>
      <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
        <p className="text-[9px] font-black text-orange-400">Every transaction earns Plajah revenue</p>
        <p className="text-[8px] text-white/40 mt-1">Cross-vertical = compounding platform income from every creative act.</p>
      </div>
    </div>
  </div>
);

// ─── Panel 4: Problems Solved ──────────────────────────────────────────────────

const PROBLEMS = [
  { problem: 'Royalty check arrives 90–180 days late',        solution: 'Lightning: paid in seconds',              icon: '⚡' },
  { problem: 'Label takes 80%, artist gets 20%',              solution: 'Smart contract: artist gets 85%',         icon: '💸' },
  { problem: 'No proof of ownership — theft happens',         solution: 'Bitcoin Ordinals: permanent timestamp',   icon: '🔒' },
  { problem: 'Sync licensing takes 6 months + lawyers',       solution: 'Smart contract: 10 minutes, no lawyers',  icon: '📋' },
  { problem: 'Co-creator disputes over money',                solution: 'Collaborative contract: splits immutable', icon: '🤝' },
  { problem: 'AI trains on content without permission',       solution: 'On-chain license required, enforceable',  icon: '🤖' },
  { problem: 'Advances require a label deal',                 solution: 'DeFi advance against royalty history',    icon: '🏦' },
  { problem: 'Detroit creators invisible to global market',   solution: 'On-chain licensing = global storefront',  icon: '🌍' },
  { problem: 'Platform goes down, content disappears',        solution: 'IPFS nodes: content lives on forever',   icon: '🌐' },
  { problem: 'Fan connection = algorithm-controlled feed',    solution: 'Fan investment = permanent stakeholder',  icon: '❤️' },
];

const ProblemsPanel: React.FC = () => (
  <div className="py-8">
    <div className="grid grid-cols-2 gap-3">
      {PROBLEMS.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex gap-4 bg-white/[0.02] border border-white/[0.04] rounded-2xl p-4 items-start"
        >
          <span className="text-xl shrink-0">{item.icon}</span>
          <div>
            <p className="text-[9px] text-red-400/70 font-bold mb-1 line-through">{item.problem}</p>
            <p className="text-[10px] font-black text-emerald-400">{item.solution}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

// ─── Panel 5: Market Opportunity ───────────────────────────────────────────────

const MARKETS = [
  { label: 'Global Creator Economy',    value: '$250B',    sub: 'annually',    color: '#f97316', width: 100 },
  { label: 'Music Royalties Market',    value: '$28B',     sub: 'annually',    color: '#a855f7', width: 56  },
  { label: 'Sync Licensing',            value: '$500M',    sub: 'annually',    color: '#3b82f6', width: 24  },
  { label: 'Film Financing Gap',        value: '$4.2B',    sub: 'indie films', color: '#10b981', width: 36  },
  { label: 'Independent Creators',      value: '50M+',     sub: 'globally',    color: '#f59e0b', width: 80  },
  { label: 'Underserved by DeFi',       value: '99%',      sub: 'of creators', color: '#ec4899', width: 99  },
];

const MarketPanel: React.FC = () => (
  <div className="py-8">
    <div className="grid grid-cols-2 gap-12 items-start">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-6">Market Size</p>
        <div className="space-y-5">
          {MARKETS.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-[10px] font-bold text-white/60">{m.label}</span>
                <span className="text-[10px] font-black" style={{ color: m.color }}>{m.value} {m.sub}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: m.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${m.width}%` }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">The Detroit Advantage</p>
        {[
          { title: 'First-mover in Detroit', desc: 'No blockchain music platform exists here. Every creator in the city is an available customer.' },
          { title: 'Cultural narrative', desc: 'Detroit + Bitcoin + music = a story that writes itself. Motown disrupted the industry. Plajah does it again.' },
          { title: 'Institutional play', desc: 'Heritage archive + Motown Museum + Detroit Historical Society = grant funding, press coverage, credibility.' },
          { title: 'Platform moat', desc: 'Once a creator\'s contracts are on Plajah\'s chain, their entire revenue infrastructure lives here. Extremely sticky.' },
        ].map(item => (
          <div key={item.title} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
            <p className="text-xs font-black text-white mb-1">{item.title}</p>
            <p className="text-[9px] text-white/40 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Main Infographic ──────────────────────────────────────────────────────────

const PANELS = [
  { id: 'problem',    title: 'The Problem',             subtitle: 'Why the creator economy is broken',           Component: ProblemPanel    },
  { id: 'strategies', title: '7 Revenue Strategies',    subtitle: 'For creators across all Plajah verticals',    Component: StrategiesPanel },
  { id: 'flywheel',  title: 'The Ecosystem Flywheel',   subtitle: 'How all verticals connect through PLAJ',      Component: FlywheelPanel   },
  { id: 'problems',  title: 'Problems Solved',          subtitle: '10 broken things Plajah fixes with Web3',     Component: ProblemsPanel   },
  { id: 'market',    title: 'The Opportunity',          subtitle: 'Market size, competitive moat, Detroit edge',  Component: MarketPanel     },
];

export const Web3Infographic: React.FC = () => {
  const [activePanel, setActivePanel] = useState(0);
  const panel = PANELS[activePanel];

  return (
    <div className="min-h-screen bg-[#050505] text-white py-12 px-8">
      <div className="max-w-5xl mx-auto">

        {/* Title */}
        <div className="text-center mb-10">
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-orange-400/70 mb-3">
            Plajah · Web3 Strategy · Admin Preview
          </p>
          <h1 className="text-4xl font-black text-white">
            Revolutionizing the Creator Economy
          </h1>
          <p className="text-base text-white/40 mt-2">
            Blockchain infrastructure for music, film, books, journalism, and beyond
          </p>
        </div>

        {/* Panel navigation */}
        <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
          {PANELS.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActivePanel(i)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                activePanel === i
                  ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400'
                  : 'bg-white/[0.03] border border-white/[0.05] text-white/40 hover:text-white/70'
              }`}
            >
              {i + 1}. {p.title}
            </button>
          ))}
        </div>

        {/* Active panel */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl px-10 py-6">
          <div className="mb-6">
            <h2 className="text-xl font-black text-white">{panel.title}</h2>
            <p className="text-sm text-white/40 mt-1">{panel.subtitle}</p>
          </div>
          <panel.Component />
        </div>

        {/* Navigation arrows */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setActivePanel(Math.max(0, activePanel - 1))}
            disabled={activePanel === 0}
            className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 hover:text-white/80 text-xs font-bold transition-all disabled:opacity-30"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-2">
            {PANELS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActivePanel(i)}
                className={`w-2 h-2 rounded-full transition-all ${activePanel === i ? 'bg-orange-400 w-6' : 'bg-white/20'}`}
              />
            ))}
          </div>
          <button
            onClick={() => setActivePanel(Math.min(PANELS.length - 1, activePanel + 1))}
            disabled={activePanel === PANELS.length - 1}
            className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 hover:text-white/80 text-xs font-bold transition-all disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
};

export default Web3Infographic;

// The designed product: what was built and why, the fitted enclosure (or guitar body plan), the
// firmware, extra hardware, build steps and downloads. Downloads go through `guard`, which stops
// until every critical safety hazard has been acknowledged.

import React, { useMemo, useState } from 'react';
import { Download, Copy, Box } from 'lucide-react';
import type { Build } from '../../services/elec/recipes';
import { writeStl } from '../../services/mech/geometry';
import { writeDxf } from '../../services/cad/dxf';
import { write3mf } from '../../services/fab/threeMf';

const DIM = 'rgba(255,255,255,.55)';
const dl = (name: string, data: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };

export default function BuildPanel({ build, guard }: { build: Build; guard: (fn: () => void) => void }) {
  const [copied, setCopied] = useState('');
  const enc = build.enclosure; const body = build.body; const base = build.title.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'design';
  const meshes = useMemo(() => enc?.model.meshes.map(m => ({ positions: m.positions, indices: m.indices, name: m.name })) ?? [], [enc]);
  return <div data-testid="elec-build" className="text-[12px]">
    <div className="font-bold text-[13px]">{build.title}</div>
    <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,.8)' }}>{build.summary}</div>
    {build.notes.map((n, i) => <div key={i} className="text-[11px] mt-1" style={{ color: DIM }}>• {n}</div>)}

    {enc && <div className="mt-3" data-testid="elec-enclosure">
      <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1 flex items-center gap-1" style={{ color: DIM }}><Box size={11}/>Enclosure</div>
      <EnclosureView enc={enc}/>
      {enc.notes.map((n, i) => <div key={i} className="text-[10.5px] mt-0.5" style={{ color: DIM }}>{n}</div>)}
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        <button className="elec-btn" onClick={() => guard(() => dl(`${base} enclosure.stl`, writeStl(meshes, `${base} enclosure`) as BlobPart, 'model/stl'))} data-testid="elec-enc-stl"><Download size={13}/>STL</button>
        <button className="elec-btn" onClick={() => guard(() => dl(`${base} enclosure.3mf`, write3mf(meshes, { title: `${base} enclosure`, dropToBed: false }) as BlobPart, 'model/3mf'))}><Download size={13}/>3MF</button>
        <button className="elec-btn" onClick={() => guard(() => dl(`${base} panels.dxf`, writeDxf(enc.panels), 'application/dxf'))} title="Flat panels for a laser cutter"><Download size={13}/>Laser panels</button>
      </div>
      <table className="w-full text-[10.5px] mt-2"><tbody>{enc.items.filter(i => i.note).map(i => <tr key={i.name} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}><td className="py-0.5 pr-2 font-semibold">{i.ref ?? i.name}</td><td style={{ color: DIM }}>{i.note}</td></tr>)}</tbody></table>
    </div>}

    {body && <div className="mt-3" data-testid="elec-body">
      <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Body plan (CNC router)</div>
      <BodyView build={build}/>
      <table className="w-full text-[10.5px] mt-1.5"><tbody>{body.routes.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)', color: i ? undefined : DIM, fontWeight: i ? 400 : 700 }}>{r.map((v, j) => <td key={j} className="py-0.5 pr-1.5 align-top">{v}</td>)}</tr>)}</tbody></table>
      <button className="elec-btn mt-1.5" onClick={() => guard(() => dl(`${base} body.dxf`, writeDxf(body.model), 'application/dxf'))} data-testid="elec-body-dxf"><Download size={13}/>Body + fretboard DXF</button>
    </div>}

    {build.firmware && <div className="mt-3" data-testid="elec-firmware">
      <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Firmware · {build.firmware.file}</div>
      <div className="text-[10.5px] mb-1" style={{ color: DIM }}>{build.firmware.about}</div>
      <pre className="text-[10px] p-2 rounded-lg overflow-auto max-h-56" style={{ background: '#07080b', border: '1px solid rgba(255,255,255,.08)' }}>{build.firmware.code}</pre>
      <div className="flex gap-1.5 mt-1.5 flex-wrap">
        <button className="elec-btn" onClick={() => { void navigator.clipboard?.writeText(build.firmware!.code); setCopied(build.firmware!.file); setTimeout(() => setCopied(''), 1500); }}><Copy size={13}/>{copied === build.firmware.file ? 'Copied' : 'Copy'}</button>
        <button className="elec-btn" onClick={() => guard(() => dl(build.firmware!.file, build.firmware!.code, 'text/plain'))}><Download size={13}/>{build.firmware.file}</button>
        {build.firmware.extra?.map(x => <button key={x.file} className="elec-btn" onClick={() => dl(x.file, x.code, 'text/plain')}><Download size={13}/>{x.file}</button>)}
      </div>
    </div>}

    <div className="mt-3"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Also needed</div>
      <table className="w-full text-[10.5px]"><tbody>{build.extras.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}><td className="py-0.5 pr-1.5 align-top">{r[0]}×</td><td className="pr-1.5 align-top">{r[1]}</td><td className="align-top" style={{ color: DIM }}>{r[2]}</td></tr>)}</tbody></table></div>
    <div className="mt-3"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>Build steps</div>
      <ol className="list-decimal pl-4 text-[11px] space-y-0.5">{build.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
    <div className="text-[10px] mt-3" style={{ color: DIM }}>Generated by Plajah and released to the public domain (CC0). Check Safety and Checks before building; you are responsible for your product.</div>
  </div>;
}

/** Top-down view of the box with the packed parts and the lid holes. */
function EnclosureView({ enc }: { enc: NonNullable<Build['enclosure']> }) {
  const W = 290; const s = Math.min(W / (enc.W + 2 * enc.wall), 150 / (enc.D + 2 * enc.wall)); const H = (enc.D + 2 * enc.wall) * s;
  const X = (x: number) => (x + enc.wall) * s, Y = (y: number) => H - (y + enc.wall) * s;
  const col: Record<string, string> = { top: '#fbbf24', front: '#4ade80', back: '#93c5fd', left: '#f472b6', right: '#f472b6', inside: '#94a3b8' };
  return <svg width={W} height={H + 4} className="rounded-lg" style={{ background: '#07080b' }}>
    <rect x={0.5} y={0.5} width={(enc.W + 2 * enc.wall) * s - 1} height={H - 1} fill="none" stroke="rgba(255,255,255,.4)"/>
    <rect x={X(0)} y={Y(enc.D)} width={enc.W * s} height={enc.D * s} fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.15)" strokeDasharray="3 2"/>
    {enc.items.map(i => <g key={i.name}><rect x={X(i.x - i.w / 2)} y={Y(i.y + i.d / 2)} width={i.w * s} height={i.d * s} rx={2} fill={`${col[i.face]}22`} stroke={col[i.face]}/>
      <text x={X(i.x)} y={Y(i.y) + 3} fontSize={8} fill="#e2e8f0" textAnchor="middle">{i.ref ?? i.name}</text></g>)}
    <text x={4} y={H - 4} fontSize={8} fill={DIM}>front</text>
  </svg>;
}

function BodyView({ build }: { build: Build }) {
  const m = build.body!.model; const W = 290, H = 220; const b = m.bounds; const s = Math.min(W / (b.max[0] - b.min[0]), H / (b.max[1] - b.min[1])) * 0.95;
  const X = (x: number) => (x - b.min[0]) * s + 4, Y = (y: number) => H - (y - b.min[1]) * s - 4; const col = Object.fromEntries(m.layers.map(l => [l.name, l.color]));
  return <svg width={W} height={H} className="rounded-lg" style={{ background: '#07080b' }}>
    {m.entities.map((e, i) => e.type === 'polyline' ? <polyline key={i} points={e.points.map(p => `${X(p[0])},${Y(p[1])}`).join(' ') + (e.closed ? ` ${X(e.points[0][0])},${Y(e.points[0][1])}` : '')} fill="none" stroke={col[e.layer] ?? '#fff'} strokeWidth={1}/>
      : e.type === 'line' ? <line key={i} x1={X(e.a[0])} y1={Y(e.a[1])} x2={X(e.b[0])} y2={Y(e.b[1])} stroke={col[e.layer] ?? '#fff'} strokeWidth={0.7}/> : null)}
  </svg>;
}

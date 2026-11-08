// Biology Lab results as ordinary Tela devices: a molecule is a MODEL_3D media device (GLB to
// show, the original file kept, credit attached); a simulation run is a native CHART device
// with the SBML that produced it. No new document format.

import type { TelaMediaDevice, TelaChartDevice } from '../../types';
import type { Structure } from './structure';
import { structureToGlb, type MolOptions } from './molScene';
import { writeSbml, type BioModel, type SimResult } from './sbml';

export type Upload = (file: File) => Promise<{ src: string; storagePath?: string; sessionOnly: boolean }>;

export async function structureToTelaDevice(s: Structure, source: { name: string; text: string; credit: string; licence: string }, o: MolOptions, upload: Upload, makeId: () => string): Promise<TelaMediaDevice> {
  const octet = 'application/octet-stream';
  const [glb, orig] = await Promise.all([
    structureToGlb(s, o).then(b => upload(new File([b as BlobPart], `${s.id}.glb`, { type: 'model/gltf-binary' }))),
    upload(new File([source.text], source.name, { type: octet })),
  ]);
  return {
    id: makeId(), type: 'MEDIA', kind: 'MODEL_3D', name: `${s.id}.glb`, src: glb.src, storagePath: glb.storagePath, sessionOnly: glb.sessionOnly || orig.sessionOnly,
    mimeType: 'model/gltf-binary', size: source.text.length, width: 720, height: 540,
    bio: { kind: 'STRUCTURE', id: s.id, title: s.title || s.id, sourceSrc: orig.src, sourceStoragePath: orig.storagePath, sourceName: source.name, credit: source.credit, licence: source.licence, style: o.style, color: o.color, stats: { atoms: s.atoms.length, residues: s.chains.reduce((n, c) => n + c.residues, 0), chains: s.chains.length } },
  };
}

/** Evenly spaced samples so the chart stays light (the full run stays in the SBML). */
function sample(n: number, max: number) { if (n <= max) return Array.from({ length: n }, (_, i) => i); return Array.from({ length: max }, (_, i) => Math.round(i * (n - 1) / (max - 1))); }

export async function simulationToTelaChart(m: BioModel, r: SimResult, shown: string[], settings: { params: Record<string, number>; initial: Record<string, number>; tEnd: number; mode?: 'ode' | 'stochastic'; unit?: number }, upload: Upload, makeId: () => string): Promise<TelaChartDevice> {
  const sbml = await upload(new File([writeSbml(m, settings)], `${m.id}.sbml`, { type: 'application/octet-stream' }));
  const idx = sample(r.time.length, 120);
  const names = new Map(m.species.map(s => [s.id, s.name]));
  const fmt = (t: number) => (Math.abs(t) >= 100 ? t.toFixed(0) : Math.abs(t) >= 10 ? t.toFixed(1) : t.toFixed(2));
  return {
    id: makeId(), type: 'CHART', name: m.name, title: m.name, subtitle: `Simulated ${fmt(settings.tEnd)} time units · ${settings.mode === 'stochastic' ? `stochastic (Gillespie), ${settings.unit ?? 1} molecules per unit` : r.solution.method === 'ros23' ? 'stiff solver' : 'Dormand–Prince'}`,
    width: 960, height: 540, kind: 'LINE', style: 'PLAJAH',
    // Tela charts print every label: name roughly ten of them so the axis stays readable.
    binding: { sourceType: 'INLINE', labels: idx.map((i, k) => k % Math.max(1, Math.round(idx.length / 10)) === 0 || k === idx.length - 1 ? fmt(r.time[i]) : ''), series: shown.map(id => ({ id, name: names.get(id) ?? id, values: idx.map(i => +r.series[id][i].toPrecision(6)) })) },
    showLegend: true, showValues: false, interactive: true,
    animation: { preset: 'DRAW', durationMs: 1200, staggerMs: 120 }, transition: { in: 'FADE', out: 'FADE' },
    bio: { kind: 'SIMULATION', modelName: m.name, sbmlSrc: sbml.src, sbmlStoragePath: sbml.storagePath, tEnd: settings.tEnd, method: settings.mode === 'stochastic' ? 'gillespie' : r.solution.method },
  };
}

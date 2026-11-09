// Destination paperwork: the burn job sheet for print-on-demand / short runs, and the press
// package manifest a replicator needs to premaster a retail disc.
import { planBudget } from './budget';
import type { DiscProject } from './project';
import { destinationById, mediumById } from './spec';

export interface Manifest {
  kind: 'burn' | 'press'; project: string; format: string; medium: string; region: string;
  video: string; titles: { n: number; name: string; runtime: string; videoMbps: number; audio: string[]; subtitles: string[]; chapters: number }[];
  sizeGB: number; checklist: { item: string; done: boolean; note?: string }[]; label: { innerMm: number; outerMm: number; printable: string };
  packaging?: { case: string; slipcover: boolean; upc?: string; catalog?: string };
}

const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function buildManifest(p: DiscProject): Manifest {
  const dest = destinationById(p.destination);
  const m = mediumById(p.mediumId)!;
  const b = planBudget(p);
  const press = dest.needsAacs;
  const titles = p.titles.map((t, i) => ({
    n: i + 1, name: t.name, runtime: hms(t.source.durationSec),
    videoMbps: +((b.titles.find(x => x.titleId === t.id)?.videoKbps || 0) / 1000).toFixed(1),
    audio: t.audio.map(a => `${a.label} (${a.codec.toUpperCase()} ${a.channels}ch ${a.kbps} kbps)`),
    subtitles: t.subtitles.map(s => `${s.label}${s.forced ? ' (forced)' : ''}`), chapters: t.chapters.length,
  }));
  const checklist = press ? [
    { item: 'BDMV + ISO verified by Plajah compliance check', done: false },
    { item: `${p.format === 'UHD' ? 'AACS 2' : 'AACS'} title order placed through the replicator`, done: false, note: 'Replicator holds the AACS licence; title fee + per-disc royalty.' },
    { item: 'Replicator premasters to cutting master (CMF) and returns a check disc', done: false },
    { item: 'Check disc approved on the tested-player list', done: false },
    { item: 'UPC barcode on packaging', done: !!p.packaging.upc },
    { item: 'Disc face, wrap and booklet art at replicator spec (CMYK, 3 mm bleed)', done: !!p.packaging.coverDocId && !!p.packaging.labelDocId },
    { item: 'Rights cleared for every title, music cue and extra', done: false },
    { item: 'Region coding agreed with distributor', done: p.region !== 'ABC' ? true : false, note: p.region === 'ABC' ? 'Region-free (A/B/C).' : `Region ${p.region}.` },
  ] : [
    { item: 'ISO built and verified', done: false },
    { item: `Blank ${m.label}${m.blankCostUsd ? ` (~$${m.blankCostUsd} each)` : ''}`, done: false },
    { item: 'Disc face art (printable hub 23 mm → 118 mm)', done: !!p.packaging.labelDocId },
    { item: 'Verify burn (read-back compare) after every disc', done: false },
    ...(p.format === 'UHD' ? [{ item: 'Test on a player from the tested-player list', done: false, note: 'Burned UHD discs play on most, not all, 4K players.' }] : []),
  ];
  return {
    kind: press ? 'press' : 'burn', project: p.name, format: p.format === 'UHD' ? 'Ultra HD Blu-ray' : 'Blu-ray', medium: m.label, region: p.region,
    video: `${p.video.w}×${p.video.h}${p.video.scan}${p.video.fps} ${p.video.codec.toUpperCase()} ${p.video.dynamic}`,
    titles, sizeGB: +(b.usedBytes / 1e9).toFixed(2), checklist,
    label: { innerMm: 23, outerMm: 118, printable: 'Inkjet-printable hub-to-edge' },
    packaging: press ? { case: p.packaging.case, slipcover: !!p.packaging.slipcover, upc: p.packaging.upc, catalog: p.packaging.catalog } : undefined,
  };
}

export function manifestText(m: Manifest): string {
  const lines = [
    `${m.kind === 'press' ? 'PRESS PACKAGE' : 'BURN JOB SHEET'} — ${m.project}`, '',
    `Format:  ${m.format}`, `Disc:    ${m.medium}`, `Region:  ${m.region}`, `Video:   ${m.video}`, `Size:    ${m.sizeGB} GB`, '',
    'TITLES',
    ...m.titles.flatMap(t => [`  ${t.n}. ${t.name}  ${t.runtime}  ${t.videoMbps} Mbit/s  ${t.chapters} chapters`, ...t.audio.map(a => `       audio: ${a}`), ...t.subtitles.map(s => `       subs:  ${s}`)]),
    '', 'CHECKLIST', ...m.checklist.map(c => `  [${c.done ? 'x' : ' '}] ${c.item}${c.note ? ` — ${c.note}` : ''}`),
  ];
  if (m.packaging) lines.push('', `Packaging: ${m.packaging.case}${m.packaging.slipcover ? ' + slipcover' : ''}  UPC ${m.packaging.upc || '—'}  Cat# ${m.packaging.catalog || '—'}`);
  lines.push('', 'Plays in Blu-ray players. Authored in Plajah Fabula.');
  return lines.join('\n');
}

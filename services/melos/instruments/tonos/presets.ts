// TONOS presets — one per instrument (the instrument as it is built and played), plus a few
// playing styles. A preset is only the instrument index and physical controls (tonos.rs).

import { TONOS_INSTRUMENTS, type TonosRegion } from './catalog';
import { P, RV, TN, TONOS_DEFAULTS } from './params';

export interface TonosPreset {
  id: string;
  name: string;
  instrument: number;
  region: TonosRegion;
  description: string;
  defaultNote: number;
  params: Record<number, number>;
}

const SLUGS = [
  'guzheng', 'koto', 'pipa', 'erhu', 'yangqin', 'shamisen', 'biwa', 'gayageum', 'haegeum', 'morin-khuur', 'dan-bau',
  'sitar', 'tanpura', 'sarod', 'sarangi', 'veena', 'santoor', 'esraj', 'dilruba',
  'oud', 'qanun', 'santur', 'kamancheh', 'tar', 'setar', 'baglama', 'dutar', 'rubab', 'tanbur', 'rebab',
  'bouzouki', 'balalaika', 'hurdy-gurdy', 'nyckelharpa', 'hardanger', 'kantele', 'cimbalom', 'lute', 'gusle', 'portuguese-guitar',
  'kora', 'kamale-ngoni', 'xalam', 'ekonting', 'krar', 'begena', 'masenqo', 'valiha', 'inanga', 'gimbri', 'goje', 'uhadi',
] as const;

/** Sympathetic tuning per instrument family (index into TONOS_SYMP_SCALES). */
const SYMP_SCALE: Record<string, number> = { nyckelharpa: 7, hardanger: 1, rubab: 2 };
/** Sympathetic key: a sitar's Sa is often C♯, a sarangi's D… */
const SYMP_KEY: Record<string, number> = { sitar: 1, sarod: 0, sarangi: 2, esraj: 0, dilruba: 7, rubab: 0, nyckelharpa: 0, hardanger: 2 };
/** Zithers whose players bend behind the bridges get more bend range. */
const BEND: Record<string, number> = { guzheng: 3, koto: 3, gayageum: 3, 'dan-bau': 7, sitar: 4, veena: 3 };

const bowed = (i: number) => ['bow', 'wheel'].includes(TONOS_INSTRUMENTS[i].excite);
const struck = (i: number) => TONOS_INSTRUMENTS[i].excite === 'hammer';
const zither = (i: number) => TONOS_INSTRUMENTS[i].opens.length === 0;

function defaultNote(i: number): number {
  const inst = TONOS_INSTRUMENTS[i];
  return inst.opens.length ? inst.opens[0] + 5 : inst.reference + 7;
}

function base(i: number): Record<number, number> {
  const slug = SLUGS[i];
  const inst = TONOS_INSTRUMENTS[i];
  const p: Record<number, number> = { ...TONOS_DEFAULTS, [TN.ENABLE]: 1, [TN.INSTRUMENT]: i };
  p[TN.SYMP] = inst.sympathetic > 0 ? 0.35 : 0;
  p[TN.SYMP_KEY] = SYMP_KEY[slug] ?? 0;
  p[TN.SYMP_SCALE] = SYMP_SCALE[slug] ?? 0;
  p[TN.RATTLE] = inst.rattle === 'sesse' && slug === 'kora' ? 0 : inst.rattle ? 0.5 : 0;
  // Harps, zithers and dulcimers ring on; necked plucked strings get damped; bows stop with the bow.
  p[TN.RELEASE_DAMP] = zither(i) || struck(i) ? 0 : bowed(i) ? 0.5 : 0.3;
  p[TN.VIB_DEPTH] = bowed(i) ? 0.35 : inst.stop === 'fretless' ? 0.2 : 0.1;
  p[P.BEND_RANGE] = (BEND[slug] ?? 2) / 24;
  return p;
}

function preset(i: number, id?: string, name?: string, description?: string, o: Record<number, number> = {}): TonosPreset {
  const inst = TONOS_INSTRUMENTS[i];
  return {
    id: id ?? `tonos-${SLUGS[i]}`,
    name: name ?? inst.name,
    instrument: i,
    region: inst.region,
    description: description ?? `${inst.origin}. ${inst.about}`,
    defaultNote: defaultNote(i),
    params: { ...base(i), ...o },
  };
}

const idx = (slug: (typeof SLUGS)[number]) => SLUGS.indexOf(slug);

export const TONOS_PRESETS: TonosPreset[] = [
  ...TONOS_INSTRUMENTS.map((_, i) => preset(i)),
  // ── playing styles ──
  preset(idx('sitar'), 'tonos-sitar-jhala', 'Sitar · Jhala with Tarafs', 'Hard mizrab strokes, the jawari wide open and the tarafs singing back in Yaman.', { [TN.JAWARI]: 0.95, [TN.SYMP]: 0.55, [TN.FORCE]: 0.65, [TN.HARDNESS]: 0.7 }),
  preset(idx('sitar'), 'tonos-sitar-thread', 'Sitar · Thread Lifted', 'The same sitar with the jawari thread pulled up: a plain, closed tone — hear what the bridge does.', { [TN.JAWARI]: 0.0, [TN.SYMP]: 0.2 }),
  preset(idx('tanpura'), 'tonos-tanpura-drone', 'Tanpura · Open Drone', 'Jawari fully open, strings left to ring into one another — play Pa Sa Sa Sa.', { [TN.JAWARI]: 1, [TN.RELEASE_DAMP]: 0, [TN.FORCE]: 0.4, [RV.MIX]: 0.2 }),
  preset(idx('pipa'), 'tonos-pipa-lunzhi', 'Pipa · Lunzhi Tremolo', 'All five fingers rolling across the string while you hold the note.', { [TN.TREMOLO]: 0.55, [TN.HARDNESS]: 0.65 }),
  preset(idx('guzheng'), 'tonos-guzheng-glide', 'Guzheng · Press & Glide', 'Long slides and deep presses behind the bridges — pitch bend is tension.', { [TN.SLIDE]: 0.5, [TN.VIB_DEPTH]: 0.45, [P.BEND_RANGE]: 4 / 24 }),
  preset(idx('gayageum'), 'tonos-gayageum-nonghyeon', 'Gayageum · Nonghyeon', 'Wide, slow vibrato on slack silk; hard plucks glide down as the tension settles.', { [TN.VIB_DEPTH]: 0.65, [TN.VIB_RATE]: 0.2, [TN.NONLIN]: 0.75 }),
  preset(idx('dan-bau'), 'tonos-dan-bau-rod', 'Đàn bầu · Bending Rod', 'Harmonics bent through a whole range by the rod — the bend wheel spans a fifth.', { [TN.VIB_DEPTH]: 0.5, [TN.SLIDE]: 0.55, [P.BEND_RANGE]: 7 / 24 }),
  preset(idx('erhu'), 'tonos-erhu-singing', 'Erhu · Singing Line', 'Generous vibrato and finger slides between notes, in one bow.', { [TN.VIB_DEPTH]: 0.6, [TN.SLIDE]: 0.4 }),
  preset(idx('oud'), 'tonos-oud-taqsim', 'Oud · Taqsim', 'Fretless slides and a softer risha for improvising in maqam.', { [TN.SLIDE]: 0.4, [TN.VIB_DEPTH]: 0.3, [TN.HARDNESS]: 0.4 }),
  preset(idx('bouzouki'), 'tonos-bouzouki-tremolo', 'Bouzouki · Tremolo', 'Fast pick tremolo on doubled steel courses.', { [TN.TREMOLO]: 0.65 }),
  preset(idx('balalaika'), 'tonos-balalaika-tremolo', 'Balalaika · Tremolo Strum', 'The index finger flickering across the strings.', { [TN.TREMOLO]: 0.75 }),
  preset(idx('hurdy-gurdy'), 'tonos-hurdy-gurdy-coups', 'Hurdy-gurdy · Chien & Coups', 'The wheel pulsed by the wrist so the trompette\'s dog buzzes in rhythm.', { [TN.RATTLE]: 0.75, [TN.TREMOLO]: 0.2 }),
  preset(idx('kora'), 'tonos-kora-sesse', 'Kora · With Sesse', 'The tin jingle plate fitted to the bridge, buzzing on the strong notes.', { [TN.RATTLE]: 0.6 }),
  preset(idx('kantele'), 'tonos-kantele-bright', 'Kantele · Bright Pluck', 'Hard plucks on slack steel — the pitch drops as each note settles.', { [TN.FORCE]: 0.8, [TN.NONLIN]: 0.9, [TN.HARDNESS]: 0.6 }),
  preset(idx('cimbalom'), 'tonos-cimbalom-dampers', 'Cimbalom · Dampers On', 'Pedal up: the dampers stop each note when you lift — tight, rhythmic playing.', { [TN.RELEASE_DAMP]: 0.8 }),
];

export const DEFAULT_TONOS_PRESET = TONOS_PRESETS[idx('oud')];

export function tonosPresetById(id: string | undefined): TonosPreset | undefined {
  return id ? TONOS_PRESETS.find((p) => p.id === id) : undefined;
}

export { SLUGS as TONOS_SLUGS };

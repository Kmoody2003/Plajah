// TONOS presets — rich per-instrument voicings and dedicated sub-presets for all 52 world
// string instruments. A preset is the instrument index and physical controls (tonos.rs).

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

type Slug = (typeof SLUGS)[number];

/** Sympathetic tuning per instrument family (index into TONOS_SYMP_SCALES). */
const SYMP_SCALE: Record<string, number> = { nyckelharpa: 7, hardanger: 1, rubab: 2, esraj: 1, dilruba: 2, sitar: 0, sarod: 0, sarangi: 3 };
/** Sympathetic key: a sitar's Sa is often C#, a sarangi's D... */
const SYMP_KEY: Record<string, number> = { sitar: 1, sarod: 0, sarangi: 2, esraj: 0, dilruba: 7, rubab: 0, nyckelharpa: 0, hardanger: 2 };
/** Zithers whose players bend behind the bridges get more bend range. */
const BEND: Record<string, number> = { guzheng: 3, koto: 3, gayageum: 3, 'dan-bau': 7, sitar: 4, veena: 3, erhu: 3, sarangi: 4 };

/** Distinct physical starting posture per instrument so every base patch plays true to its build. */
const BASE_VOICING: Partial<Record<Slug, Record<number, number>>> = {
  guzheng: { [TN.POSITION]: 0.42, [TN.HARDNESS]: 0.58, [TN.BODY]: 0.56, [TN.BODY_SIZE]: 0.54, [TN.HERITAGE_AGE]: 0.42, [TN.WIDTH]: 0.68, [RV.MIX]: 0.20 },
  koto: { [TN.POSITION]: 0.34, [TN.HARDNESS]: 0.68, [TN.BODY]: 0.60, [TN.BODY_SIZE]: 0.58, [TN.HERITAGE_AGE]: 0.48, [TN.DAMPING]: 0.54, [RV.MIX]: 0.18 },
  pipa: { [TN.POSITION]: 0.38, [TN.HARDNESS]: 0.72, [TN.FORCE]: 0.62, [TN.BODY]: 0.52, [TN.BODY_SIZE]: 0.42, [TN.DAMPING]: 0.56, [RV.MIX]: 0.16 },
  erhu: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.56, [TN.BOW_SPEED]: 0.54, [TN.BODY]: 0.64, [TN.SKIN_TENSION]: 0.58, [TN.SLIDE]: 0.34, [RV.MIX]: 0.22 },
  yangqin: { [TN.POSITION]: 0.52, [TN.HARDNESS]: 0.54, [TN.COURSE_DETUNE]: 0.52, [TN.BODY]: 0.50, [TN.DAMPING]: 0.42, [TN.WIDTH]: 0.72, [RV.MIX]: 0.24 },
  shamisen: { [TN.POSITION]: 0.36, [TN.HARDNESS]: 0.76, [TN.FORCE]: 0.72, [TN.SKIN_TENSION]: 0.68, [TN.JAWARI]: 0.74, [TN.DAMPING]: 0.66, [RV.MIX]: 0.10 },
  biwa: { [TN.POSITION]: 0.40, [TN.HARDNESS]: 0.64, [TN.FORCE]: 0.68, [TN.BODY]: 0.58, [TN.JAWARI]: 0.82, [TN.DAMPING]: 0.62, [RV.MIX]: 0.16 },
  gayageum: { [TN.POSITION]: 0.58, [TN.HARDNESS]: 0.34, [TN.BODY]: 0.64, [TN.BODY_SIZE]: 0.56, [TN.DAMPING]: 0.58, [TN.NONLIN]: 0.68, [RV.MIX]: 0.18 },
  haegeum: { [TN.POSITION]: 0.46, [TN.HARDNESS]: 0.60, [TN.BOW_SPEED]: 0.52, [TN.BODY]: 0.62, [TN.BODY_SIZE]: 0.38, [TN.SLIDE]: 0.32, [RV.MIX]: 0.20 },
  'morin-khuur': { [TN.POSITION]: 0.50, [TN.HARDNESS]: 0.48, [TN.BOW_SPEED]: 0.48, [TN.BODY]: 0.68, [TN.BODY_SIZE]: 0.62, [TN.SLIDE]: 0.36, [RV.MIX]: 0.22 },
  'dan-bau': { [TN.POSITION]: 0.35, [TN.HARDNESS]: 0.58, [TN.BODY]: 0.56, [TN.NONLIN]: 0.62, [TN.SLIDE]: 0.42, [RV.MIX]: 0.24 },
  sitar: { [TN.POSITION]: 0.44, [TN.HARDNESS]: 0.68, [TN.JAWARI]: 0.84, [TN.SYMP]: 0.46, [TN.BODY]: 0.58, [TN.NONLIN]: 0.64, [RV.MIX]: 0.20 },
  tanpura: { [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.28, [TN.JAWARI]: 0.94, [TN.BODY]: 0.66, [TN.BODY_SIZE]: 0.68, [TN.DAMPING]: 0.34, [RV.MIX]: 0.22 },
  sarod: { [TN.POSITION]: 0.36, [TN.HARDNESS]: 0.64, [TN.BODY]: 0.62, [TN.SKIN_TENSION]: 0.58, [TN.SYMP]: 0.48, [TN.DAMPING]: 0.60, [RV.MIX]: 0.18 },
  sarangi: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.52, [TN.BOW_SPEED]: 0.54, [TN.BODY]: 0.68, [TN.SYMP]: 0.58, [TN.SLIDE]: 0.40, [RV.MIX]: 0.24 },
  veena: { [TN.POSITION]: 0.54, [TN.HARDNESS]: 0.42, [TN.JAWARI]: 0.78, [TN.BODY]: 0.64, [TN.BODY_SIZE]: 0.62, [TN.NONLIN]: 0.62, [RV.MIX]: 0.22 },
  santoor: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.68, [TN.COURSE_DETUNE]: 0.44, [TN.BODY]: 0.48, [TN.WIDTH]: 0.78, [RV.MIX]: 0.24 },
  esraj: { [TN.POSITION]: 0.50, [TN.HARDNESS]: 0.48, [TN.BOW_SPEED]: 0.52, [TN.SYMP]: 0.52, [TN.BODY]: 0.62, [RV.MIX]: 0.24 },
  dilruba: { [TN.POSITION]: 0.52, [TN.HARDNESS]: 0.44, [TN.BOW_SPEED]: 0.48, [TN.SYMP]: 0.58, [TN.BODY_SIZE]: 0.60, [RV.MIX]: 0.26 },
  oud: { [TN.POSITION]: 0.52, [TN.HARDNESS]: 0.38, [TN.COURSE_DETUNE]: 0.42, [TN.BODY]: 0.68, [TN.BODY_SIZE]: 0.58, [TN.DAMPING]: 0.56, [RV.MIX]: 0.20 },
  qanun: { [TN.POSITION]: 0.40, [TN.HARDNESS]: 0.66, [TN.COURSE_DETUNE]: 0.38, [TN.SKIN_TENSION]: 0.62, [TN.WIDTH]: 0.72, [RV.MIX]: 0.20 },
  santur: { [TN.POSITION]: 0.46, [TN.HARDNESS]: 0.72, [TN.COURSE_DETUNE]: 0.48, [TN.BODY]: 0.46, [TN.WIDTH]: 0.76, [RV.MIX]: 0.22 },
  kamancheh: { [TN.POSITION]: 0.44, [TN.HARDNESS]: 0.58, [TN.BOW_SPEED]: 0.56, [TN.SKIN_TENSION]: 0.60, [TN.SLIDE]: 0.36, [RV.MIX]: 0.22 },
  tar: { [TN.POSITION]: 0.34, [TN.HARDNESS]: 0.72, [TN.SKIN_TENSION]: 0.64, [TN.COURSE_DETUNE]: 0.40, [TN.DAMPING]: 0.64, [RV.MIX]: 0.14 },
  setar: { [TN.POSITION]: 0.54, [TN.HARDNESS]: 0.62, [TN.FORCE]: 0.44, [TN.BODY]: 0.56, [TN.BODY_SIZE]: 0.40, [RV.MIX]: 0.20 },
  baglama: { [TN.POSITION]: 0.44, [TN.HARDNESS]: 0.60, [TN.COURSE_DETUNE]: 0.48, [TN.BODY]: 0.54, [TN.NONLIN]: 0.58, [RV.MIX]: 0.18 },
  dutar: { [TN.POSITION]: 0.56, [TN.HARDNESS]: 0.42, [TN.BODY]: 0.58, [TN.DAMPING]: 0.58, [TN.NONLIN]: 0.56, [RV.MIX]: 0.16 },
  rubab: { [TN.POSITION]: 0.42, [TN.HARDNESS]: 0.54, [TN.SKIN_TENSION]: 0.56, [TN.SYMP]: 0.48, [TN.DAMPING]: 0.62, [RV.MIX]: 0.18 },
  tanbur: { [TN.POSITION]: 0.42, [TN.HARDNESS]: 0.62, [TN.BODY]: 0.56, [TN.DAMPING]: 0.32, [TN.COURSE_DETUNE]: 0.36, [RV.MIX]: 0.24 },
  rebab: { [TN.POSITION]: 0.50, [TN.HARDNESS]: 0.56, [TN.BOW_SPEED]: 0.50, [TN.SKIN_TENSION]: 0.52, [TN.BODY]: 0.64, [RV.MIX]: 0.20 },
  bouzouki: { [TN.POSITION]: 0.38, [TN.HARDNESS]: 0.74, [TN.COURSE_DETUNE]: 0.42, [TN.BODY]: 0.46, [TN.DAMPING]: 0.44, [RV.MIX]: 0.18 },
  balalaika: { [TN.POSITION]: 0.56, [TN.HARDNESS]: 0.64, [TN.BODY]: 0.54, [TN.BODY_SIZE]: 0.42, [TN.DAMPING]: 0.58, [RV.MIX]: 0.14 },
  'hurdy-gurdy': { [TN.POSITION]: 0.38, [TN.HARDNESS]: 0.62, [TN.BOW_SPEED]: 0.58, [TN.RATTLE]: 0.48, [TN.BODY]: 0.60, [RV.MIX]: 0.18 },
  nyckelharpa: { [TN.POSITION]: 0.44, [TN.HARDNESS]: 0.58, [TN.BOW_SPEED]: 0.54, [TN.SYMP]: 0.50, [TN.BODY]: 0.60, [RV.MIX]: 0.22 },
  hardanger: { [TN.POSITION]: 0.46, [TN.HARDNESS]: 0.56, [TN.BOW_SPEED]: 0.58, [TN.SYMP]: 0.54, [TN.BODY]: 0.62, [RV.MIX]: 0.22 },
  kantele: { [TN.POSITION]: 0.54, [TN.HARDNESS]: 0.46, [TN.NONLIN]: 0.70, [TN.DAMPING]: 0.38, [TN.BODY]: 0.56, [RV.MIX]: 0.20 },
  cimbalom: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.44, [TN.COURSE_DETUNE]: 0.46, [TN.BODY]: 0.62, [TN.BODY_SIZE]: 0.64, [RV.MIX]: 0.24 },
  lute: { [TN.POSITION]: 0.56, [TN.HARDNESS]: 0.32, [TN.COURSE_DETUNE]: 0.36, [TN.BODY]: 0.66, [TN.DAMPING]: 0.58, [RV.MIX]: 0.22 },
  gusle: { [TN.POSITION]: 0.46, [TN.HARDNESS]: 0.64, [TN.BOW_SPEED]: 0.50, [TN.SKIN_TENSION]: 0.50, [TN.SLIDE]: 0.36, [RV.MIX]: 0.18 },
  'portuguese-guitar': { [TN.POSITION]: 0.36, [TN.HARDNESS]: 0.78, [TN.COURSE_DETUNE]: 0.38, [TN.BODY]: 0.48, [TN.DAMPING]: 0.44, [RV.MIX]: 0.18 },
  kora: { [TN.POSITION]: 0.58, [TN.HARDNESS]: 0.40, [TN.BODY]: 0.68, [TN.BODY_SIZE]: 0.62, [TN.SKIN_TENSION]: 0.56, [RV.MIX]: 0.18 },
  'kamale-ngoni': { [TN.POSITION]: 0.52, [TN.HARDNESS]: 0.48, [TN.RATTLE]: 0.48, [TN.BODY]: 0.62, [TN.SKIN_TENSION]: 0.54, [RV.MIX]: 0.14 },
  xalam: { [TN.POSITION]: 0.44, [TN.HARDNESS]: 0.66, [TN.FORCE]: 0.64, [TN.SKIN_TENSION]: 0.60, [TN.DAMPING]: 0.68, [RV.MIX]: 0.10 },
  ekonting: { [TN.POSITION]: 0.52, [TN.HARDNESS]: 0.58, [TN.FORCE]: 0.66, [TN.SKIN_TENSION]: 0.54, [TN.DAMPING]: 0.64, [RV.MIX]: 0.12 },
  krar: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.56, [TN.BODY]: 0.60, [TN.SKIN_TENSION]: 0.56, [TN.DAMPING]: 0.56, [RV.MIX]: 0.16 },
  begena: { [TN.POSITION]: 0.60, [TN.HARDNESS]: 0.36, [TN.JAWARI]: 0.90, [TN.BODY]: 0.72, [TN.BODY_SIZE]: 0.68, [TN.SKIN_TENSION]: 0.46, [RV.MIX]: 0.18 },
  masenqo: { [TN.POSITION]: 0.46, [TN.HARDNESS]: 0.62, [TN.BOW_SPEED]: 0.56, [TN.SKIN_TENSION]: 0.58, [TN.SLIDE]: 0.38, [RV.MIX]: 0.18 },
  valiha: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.68, [TN.BODY]: 0.60, [TN.DAMPING]: 0.42, [TN.WIDTH]: 0.64, [RV.MIX]: 0.18 },
  inanga: { [TN.POSITION]: 0.62, [TN.HARDNESS]: 0.28, [TN.FORCE]: 0.38, [TN.BODY]: 0.70, [TN.DAMPING]: 0.60, [RV.MIX]: 0.22 },
  gimbri: { [TN.POSITION]: 0.56, [TN.HARDNESS]: 0.34, [TN.FORCE]: 0.74, [TN.SKIN_TENSION]: 0.42, [TN.RATTLE]: 0.60, [TN.DAMPING]: 0.70, [RV.MIX]: 0.12 },
  goje: { [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.58, [TN.BOW_SPEED]: 0.52, [TN.SKIN_TENSION]: 0.50, [TN.SLIDE]: 0.36, [RV.MIX]: 0.16 },
  uhadi: { [TN.POSITION]: 0.50, [TN.HARDNESS]: 0.56, [TN.BODY]: 0.76, [TN.BODY_SIZE]: 0.54, [TN.SLIDE]: 0.32, [RV.MIX]: 0.20 },
};

const bowed = (i: number) => ['bow', 'wheel'].includes(TONOS_INSTRUMENTS[i].excite);
const struck = (i: number) => TONOS_INSTRUMENTS[i].excite === 'hammer';
const zither = (i: number) => TONOS_INSTRUMENTS[i].opens.length === 0;

function defaultNote(i: number, noteOffset = 0): number {
  const inst = TONOS_INSTRUMENTS[i];
  const baseNote = inst.opens.length ? inst.opens[0] + 5 : inst.reference + 7;
  return Math.max(24, Math.min(96, baseNote + noteOffset));
}

function base(i: number): Record<number, number> {
  const slug = SLUGS[i];
  const inst = TONOS_INSTRUMENTS[i];
  const p: Record<number, number> = { ...TONOS_DEFAULTS, [TN.ENABLE]: 1, [TN.INSTRUMENT]: i };
  p[TN.SYMP] = inst.sympathetic > 0 ? 0.42 : 0;
  p[TN.SYMP_KEY] = SYMP_KEY[slug] ?? 0;
  p[TN.SYMP_SCALE] = SYMP_SCALE[slug] ?? 0;
  p[TN.RATTLE] = inst.rattle === 'sesse' && slug === 'kora' ? 0 : inst.rattle ? 0.52 : 0;
  p[TN.JAWARI] = inst.jawari ? 0.80 : 0;
  // Harps, zithers and dulcimers ring on; necked plucked strings get damped; bows stop with the bow.
  p[TN.RELEASE_DAMP] = zither(i) || struck(i) ? 0 : bowed(i) ? 0.5 : 0.3;
  p[TN.VIB_DEPTH] = bowed(i) ? 0.36 : inst.stop === 'fretless' ? 0.22 : 0.10;
  p[P.BEND_RANGE] = (BEND[slug] ?? 2) / 24;
  return { ...p, ...(BASE_VOICING[slug] ?? {}) };
}

function preset(
  i: number,
  id?: string,
  name?: string,
  description?: string,
  o: Record<number, number> = {},
  noteOffset = 0,
): TonosPreset {
  const inst = TONOS_INSTRUMENTS[i];
  return {
    id: id ?? `tonos-${SLUGS[i]}`,
    name: name ?? inst.name,
    instrument: i,
    region: inst.region,
    description: description ?? `${inst.origin}. ${inst.about}`,
    defaultNote: defaultNote(i, noteOffset),
    params: { ...base(i), ...o },
  };
}

const idx = (slug: Slug) => SLUGS.indexOf(slug);

export const TONOS_PRESETS: TonosPreset[] = [
  ...TONOS_INSTRUMENTS.map((_, i) => preset(i)),

  // ── Existing Style & Heritage Presets (preserved IDs) ──────────────────────
  preset(idx('sitar'), 'tonos-sitar-jhala', 'Sitar · Jhala with Tarafs', 'Hard mizrab strokes, the jawari wide open and the tarafs singing back in Yaman.', { [TN.JAWARI]: 0.95, [TN.SYMP]: 0.58, [TN.FORCE]: 0.68, [TN.HARDNESS]: 0.74, [TN.POSITION]: 0.28 }),
  preset(idx('sitar'), 'tonos-sitar-thread', 'Sitar · Thread Lifted', 'The same sitar with the jawari thread pulled up: a plain, closed tone — hear what the bridge does.', { [TN.JAWARI]: 0.0, [TN.SYMP]: 0.22, [TN.HARDNESS]: 0.42 }),
  preset(idx('tanpura'), 'tonos-tanpura-drone', 'Tanpura · Open Drone', 'Jawari fully open, strings left to ring into one another — play Pa Sa Sa Sa.', { [TN.JAWARI]: 1, [TN.RELEASE_DAMP]: 0, [TN.FORCE]: 0.42, [RV.MIX]: 0.22 }),
  preset(idx('pipa'), 'tonos-pipa-lunzhi', 'Pipa · Lunzhi Tremolo', 'All five fingers rolling across the string while you hold the note.', { [TN.TREMOLO]: 0.55, [TN.HARDNESS]: 0.68, [TN.POSITION]: 0.30 }),
  preset(idx('guzheng'), 'tonos-guzheng-glide', 'Guzheng · Press & Glide', 'Long slides and deep presses behind the bridges — pitch bend is tension.', { [TN.SLIDE]: 0.52, [TN.VIB_DEPTH]: 0.45, [P.BEND_RANGE]: 4 / 24 }),
  preset(idx('gayageum'), 'tonos-gayageum-nonghyeon', 'Gayageum · Nonghyeon', 'Wide, slow vibrato on slack silk; hard plucks glide down as the tension settles.', { [TN.VIB_DEPTH]: 0.65, [TN.VIB_RATE]: 0.2, [TN.NONLIN]: 0.78 }),
  preset(idx('dan-bau'), 'tonos-dan-bau-rod', 'Đàn bầu · Bending Rod', 'Harmonics bent through a whole range by the rod — the bend wheel spans a fifth.', { [TN.VIB_DEPTH]: 0.5, [TN.SLIDE]: 0.55, [P.BEND_RANGE]: 7 / 24 }),
  preset(idx('erhu'), 'tonos-erhu-singing', 'Erhu · Singing Line', 'Generous vibrato and finger slides between notes, in one bow.', { [TN.VIB_DEPTH]: 0.6, [TN.SLIDE]: 0.4 }),
  preset(idx('oud'), 'tonos-oud-taqsim', 'Oud · Taqsim', 'Fretless slides and a softer risha for improvising in maqam.', { [TN.SLIDE]: 0.42, [TN.VIB_DEPTH]: 0.32, [TN.HARDNESS]: 0.38, [TN.POSITION]: 0.62 }),
  preset(idx('bouzouki'), 'tonos-bouzouki-tremolo', 'Bouzouki · Tremolo', 'Fast pick tremolo on doubled steel courses.', { [TN.TREMOLO]: 0.65, [TN.HARDNESS]: 0.76, [TN.POSITION]: 0.32 }),
  preset(idx('balalaika'), 'tonos-balalaika-tremolo', 'Balalaika · Tremolo Strum', 'The index finger flickering across the strings.', { [TN.TREMOLO]: 0.75, [TN.HARDNESS]: 0.68 }),
  preset(idx('hurdy-gurdy'), 'tonos-hurdy-gurdy-coups', 'Hurdy-gurdy · Chien & Coups', 'The wheel pulsed by the wrist so the trompette\'s dog buzzes in rhythm.', { [TN.RATTLE]: 0.78, [TN.TREMOLO]: 0.25, [TN.BOW_SPEED]: 0.62 }),
  preset(idx('kora'), 'tonos-kora-sesse', 'Kora · With Sesse', 'The tin jingle plate fitted to the bridge, buzzing on the strong notes.', { [TN.RATTLE]: 0.62, [TN.FORCE]: 0.65 }),
  preset(idx('kantele'), 'tonos-kantele-bright', 'Kantele · Bright Pluck', 'Hard plucks on slack steel — the pitch drops as each note settles.', { [TN.FORCE]: 0.8, [TN.NONLIN]: 0.9, [TN.HARDNESS]: 0.66, [TN.POSITION]: 0.30 }),
  preset(idx('cimbalom'), 'tonos-cimbalom-dampers', 'Cimbalom · Dampers On', 'Pedal up: the dampers stop each note when you lift — tight, rhythmic playing.', { [TN.RELEASE_DAMP]: 0.82, [TN.HARDNESS]: 0.56 }),
  preset(idx('sitar'), 'tonos-miraj-1948-sitar', '1948 Miraj Master Sitar', 'Seasoned Maharashtra tun tabli and sun-cured Pandharpur gourd, hand-parabolic bone jawari and 13 tarafs in Yaman.', { [TN.HERITAGE_AGE]: 0.86, [TN.CRAFT_ASYMMETRY]: 0.58, [TN.JAWARI]: 0.78, [TN.SYMP]: 0.62, [TN.SYMP_KEY]: 1, [TN.SYMP_SCALE]: 0, [TN.BODY]: 0.68, [RV.MIX]: 0.22 }),
  preset(idx('sarod'), 'tonos-kolkata-1935-sarod', '1935 Maihar Concert Sarod', 'Aged tun body under hand-scraped goatskin belly, coconut-shell jawa attack and deep Bhairav sympathetic halo.', { [TN.HERITAGE_AGE]: 0.82, [TN.CRAFT_ASYMMETRY]: 0.52, [TN.SYMP]: 0.64, [TN.SYMP_SCALE]: 3, [TN.SKIN_TENSION]: 0.64, [TN.HARDNESS]: 0.72, [RV.MIX]: 0.24 }),
  preset(idx('sarangi'), 'tonos-varanasi-old-sarangi', 'Old Varanasi Vocal Sarangi', 'Century-seasoned red cedar block with 35+ sympathetic resonances and gut cuticle slides that weep like a human voice.', { [TN.HERITAGE_AGE]: 0.88, [TN.CRAFT_ASYMMETRY]: 0.64, [TN.SYMP]: 0.72, [TN.VIB_DEPTH]: 0.52, [TN.SLIDE]: 0.45, [TN.BOW_SPEED]: 0.58, [RV.MIX]: 0.26 }),
  preset(idx('koto'), 'tonos-fukuyama-kiri-koto', 'Fukuyama Yaki-Sugi Koto', 'Scorched aged paulownia shell with hand-carved ayasugi herringbone inner grooves and crisp ivory tsume articulation.', { [TN.HERITAGE_AGE]: 0.78, [TN.CRAFT_ASYMMETRY]: 0.48, [TN.HARDNESS]: 0.76, [TN.BODY]: 0.66, [TN.POSITION]: 0.24, [RV.MIX]: 0.2 }),
  preset(idx('guzheng'), 'tonos-suzhou-heritage-guzheng', 'Suzhou Aged Rosewood Guzheng', 'Warm, bloomy paulownia soundboard with wide Weinreich dual-polarization aftersound and expressive left-hand pitch bends.', { [TN.HERITAGE_AGE]: 0.74, [TN.CRAFT_ASYMMETRY]: 0.46, [TN.VIB_DEPTH]: 0.42, [TN.SLIDE]: 0.44, [TN.WIDTH]: 0.78, [RV.MIX]: 0.25 }),
  preset(idx('shamisen'), 'tonos-tsugaru-bachi-snap', 'Tsugaru Aged Shamisen', 'Percussive tortoise/wood bachi slap onto taut aged skin with aggressive sawari neck buzz and woody transient punch.', { [TN.HERITAGE_AGE]: 0.68, [TN.CRAFT_ASYMMETRY]: 0.56, [TN.JAWARI]: 0.84, [TN.FORCE]: 0.82, [TN.HARDNESS]: 0.8, [TN.SKIN_TENSION]: 0.72 }),
  preset(idx('oud'), 'tonos-aleppo-walnut-oud', '1920 Aleppo Walnut Oud', 'Paper-thin aged spruce top with three hand-carved shamsiyya roses, gut-like warmth, and intimate Hijaz fretless bloom.', { [TN.HERITAGE_AGE]: 0.85, [TN.CRAFT_ASYMMETRY]: 0.54, [TN.MATERIAL]: 4, [TN.COURSE_DETUNE]: 0.34, [TN.BODY]: 0.74, [TN.SLIDE]: 0.36, [RV.MIX]: 0.2 }),
  preset(idx('qanun'), 'tonos-istanbul-mandal-qanun', 'Istanbul Fish-Skin Qanun', 'Triple nylon courses standing on aged parchment ray-skin windows — crystalline attack with warm Oriental shimmer.', { [TN.HERITAGE_AGE]: 0.72, [TN.CRAFT_ASYMMETRY]: 0.44, [TN.COURSE_DETUNE]: 0.32, [TN.SKIN_TENSION]: 0.68, [TN.HARDNESS]: 0.66, [TN.WIDTH]: 0.75, [RV.MIX]: 0.22 }),
  preset(idx('santoor'), 'tonos-srinagar-walnut-santoor', 'Srinagar Aged Walnut Santoor', 'Hundred-string Kashmiri hammered zither with seasoned mulberry/walnut top and shimmering three-string unison beating.', { [TN.HERITAGE_AGE]: 0.76, [TN.CRAFT_ASYMMETRY]: 0.5, [TN.COURSE_DETUNE]: 0.38, [TN.HARDNESS]: 0.62, [TN.WIDTH]: 0.82, [RV.MIX]: 0.28 }),
  preset(idx('kora'), 'tonos-mande-griot-kora', 'Old Brikama Griot Kora', 'Massive sun-cured calabash covered in seasoned cowhide, subtle sesse tin shimmer, and harp-like West African clarity.', { [TN.HERITAGE_AGE]: 0.8, [TN.CRAFT_ASYMMETRY]: 0.55, [TN.RATTLE]: 0.34, [TN.SKIN_TENSION]: 0.6, [TN.BODY]: 0.72, [TN.WIDTH]: 0.7, [RV.MIX]: 0.18 }),
  preset(idx('gimbri'), 'tonos-essaouira-gnawa-gimbri', 'Essaouira Gnawa Guembri', 'Deep carved log under thick aged camel hide with gut bass courses and loose iron sersal rattle for hypnotic desert grooves.', { [TN.HERITAGE_AGE]: 0.82, [TN.CRAFT_ASYMMETRY]: 0.62, [TN.RATTLE]: 0.68, [TN.FORCE]: 0.76, [TN.SKIN_TENSION]: 0.44, [TN.NONLIN]: 0.65 }),
  preset(idx('lute'), 'tonos-venice-1590-archlute', '1590 Venetian Gut Lute', 'Val di Fiemme spruce belly with carved rose, pure gut double courses, and delicate thumb-under Renaissance articulation.', { [TN.HERITAGE_AGE]: 0.94, [TN.CRAFT_ASYMMETRY]: 0.6, [TN.COURSE_DETUNE]: 0.28, [TN.HARDNESS]: 0.32, [TN.BODY]: 0.76, [RV.MIX]: 0.24 }),
  preset(idx('hardanger'), 'tonos-telemark-1895-hardingfele', '1895 Telemark Hardingfele', 'Ornate Norwegian fiddle with seasoned spruce Bridge-Hill bloom and five under-strings ringing in bright major resonance.', { [TN.HERITAGE_AGE]: 0.88, [TN.CRAFT_ASYMMETRY]: 0.58, [TN.SYMP]: 0.66, [TN.SYMP_KEY]: 2, [TN.SYMP_SCALE]: 1, [TN.BOW_SPEED]: 0.62, [RV.MIX]: 0.22 }),
  preset(idx('nyckelharpa'), 'tonos-uppland-silverbasharpa', 'Uppland Aged Nyckelharpa', 'Key-tangent Swedish bowed fiddle with 12 chromatic sympathetic strings and woody resinous chest resonance.', { [TN.HERITAGE_AGE]: 0.79, [TN.CRAFT_ASYMMETRY]: 0.52, [TN.SYMP]: 0.6, [TN.SYMP_SCALE]: 7, [TN.BODY]: 0.68, [RV.MIX]: 0.24 }),

  // ── Per-Instrument Sub-Presets (complete 52-instrument coverage, 3+ per instrument) ──
  // 0 Guzheng (+1)
  preset(idx('guzheng'), 'tonos-guzheng-bridge-crystal', 'Guzheng · Near-Bridge Crystal', 'Picks grazing near the right bridge: glassy overtone sparkle and quick ornamental arpeggios.', { [TN.POSITION]: 0.20, [TN.HARDNESS]: 0.82, [TN.BODY]: 0.44, [TN.DAMPING]: 0.38, [RV.MIX]: 0.22 }, 7),
  // 1 Koto (+2)
  preset(idx('koto'), 'tonos-koto-ikuta-tremolo', 'Koto · Ikuta Square-Pick', 'Broad square ivory tsume brushing across taut strings near the bridge with crisp articulation.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.86, [TN.FORCE]: 0.72, [TN.TREMOLO]: 0.38, [TN.BODY]: 0.52 }, 5),
  preset(idx('koto'), 'tonos-koto-hirajoshi-muted', 'Koto · Hirajoshi Palm Mute', 'Soft flesh-edge mute resting by the bridges for smoky, woody nocturnal chamber intervals.', { [TN.POSITION]: 0.64, [TN.HARDNESS]: 0.30, [TN.MUTE]: 0.44, [TN.BODY_SIZE]: 0.68, [TN.BODY]: 0.72, [RV.MIX]: 0.20 }, -5),
  // 2 Pipa (+2)
  preset(idx('pipa'), 'tonos-pipa-martial-snap', 'Pipa · Martial Wujia Snap', 'Violent bridge-edge snap and fierce tension bend for battle narratives (Ambush from Ten Sides).', { [TN.POSITION]: 0.18, [TN.HARDNESS]: 0.90, [TN.FORCE]: 0.88, [TN.NONLIN]: 0.85, [TN.RELEASE_DAMP]: 0.55, [RV.MIX]: 0.12 }, 0),
  preset(idx('pipa'), 'tonos-pipa-silk-court', 'Pipa · Silk Court Ballad', 'Historical braided-silk strings plucked softly higher up the neck for warm intimate chamber air.', { [TN.MATERIAL]: 5, [TN.POSITION]: 0.64, [TN.HARDNESS]: 0.34, [TN.FORCE]: 0.45, [TN.BODY]: 0.66, [RV.MIX]: 0.22 }, -3),
  // 3 Erhu (+2)
  preset(idx('erhu'), 'tonos-erhu-suzhou-velvet', 'Erhu · Suzhou Aged Python', 'Seasoned high-tension snake skin with warm resinous bow pressure and aching vocal slides.', { [TN.HERITAGE_AGE]: 0.78, [TN.SKIN_TENSION]: 0.70, [TN.BOW_SPEED]: 0.44, [TN.HARDNESS]: 0.42, [TN.VIB_DEPTH]: 0.66, [TN.SLIDE]: 0.48 }, -3),
  preset(idx('erhu'), 'tonos-erhu-horse-gallop', 'Erhu · Inner Steppe Gallop', 'Fast energetic bow strokes near the bridge, snappy tangent stops and brisk release damping.', { [TN.POSITION]: 0.26, [TN.BOW_SPEED]: 0.82, [TN.FORCE]: 0.76, [TN.HARDNESS]: 0.74, [TN.RELEASE_DAMP]: 0.72, [TN.SLIDE]: 0.12 }, 5),
  // 4 Yangqin (+3)
  preset(idx('yangqin'), 'tonos-yangqin-bare-bamboo', 'Yangqin · Bare Bamboo Click', 'Flipped hammers striking with bare seasoned bamboo backs: sparkling treble shimmer and woody clack.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.86, [TN.FORCE]: 0.70, [TN.COURSE_DETUNE]: 0.64, [TN.BODY]: 0.44 }, 7),
  preset(idx('yangqin'), 'tonos-yangqin-felt-warm', 'Yangqin · Soft Rubber Cushion', 'Cushioned bamboo tips near the string middle for lush, bell-like ensemble chords.', { [TN.POSITION]: 0.68, [TN.HARDNESS]: 0.20, [TN.BODY]: 0.66, [TN.BODY_SIZE]: 0.64, [TN.DAMPING]: 0.38, [RV.MIX]: 0.28 }, -5),
  preset(idx('yangqin'), 'tonos-yangqin-opera-damped', 'Yangqin · Crisp Cantonese Solo', 'Tight, focused articulation with finger damping on release and wide tripled course shine.', { [TN.POSITION]: 0.38, [TN.HARDNESS]: 0.68, [TN.RELEASE_DAMP]: 0.68, [TN.COURSE_DETUNE]: 0.58 }, 0),
  // 5 Shamisen (+2)
  preset(idx('shamisen'), 'tonos-shamisen-nagauta-clean', 'Shamisen · Nagauta Stage', 'Smaller lighter box and delicate bone bachi for refined kabuki accompaniment with tame sawari.', { [TN.SKIN_TENSION]: 0.66, [TN.BODY_SIZE]: 0.36, [TN.JAWARI]: 0.28, [TN.FORCE]: 0.50, [TN.HARDNESS]: 0.62, [RV.MIX]: 0.14 }, 3),
  preset(idx('shamisen'), 'tonos-shamisen-jiuta-dark', 'Shamisen · Jiuta Heavy Silk', 'Deep relaxed skin, heavy horn bachi and wet silk bass growl steeped in neck sawari buzz.', { [TN.SKIN_TENSION]: 0.34, [TN.BODY_SIZE]: 0.70, [TN.JAWARI]: 0.92, [TN.FORCE]: 0.76, [TN.HARDNESS]: 0.38, [TN.TENSION]: 0.38 }, -5),
  // 6 Biwa (+3)
  preset(idx('biwa'), 'tonos-biwa-heike-buzz', 'Biwa · Heike Dramatic Sawari', 'Maximum silk fret buzz, wide bachi crack and hollow pear body punch for heroic recitative.', { [TN.JAWARI]: 0.96, [TN.FORCE]: 0.86, [TN.HARDNESS]: 0.76, [TN.BODY]: 0.72, [TN.NONLIN]: 0.78 }, -3),
  preset(idx('biwa'), 'tonos-biwa-chikuzen-lyrical', 'Biwa · Chikuzen Lyric Silk', 'Softer high-neck plucks with generous pitch bend glides and tame neck buzz.', { [TN.POSITION]: 0.64, [TN.JAWARI]: 0.36, [TN.HARDNESS]: 0.32, [TN.SLIDE]: 0.45, [TN.VIB_DEPTH]: 0.44, [RV.MIX]: 0.22 }, 4),
  preset(idx('biwa'), 'tonos-biwa-percussive-mute', 'Biwa · Dry Staccato Slap', 'Short palm-muted thumps emphasizing the bachi wood slap over the hollow pear box.', { [TN.MUTE]: 0.56, [TN.FORCE]: 0.80, [TN.RELEASE_DAMP]: 0.75, [TN.DAMPING]: 0.72 }, 0),
  // 7 Gayageum (+2)
  preset(idx('gayageum'), 'tonos-gayageum-sanjo-snap', 'Gayageum · Sanjo Virtuoso', 'Brisk near-bridge thumb & finger flicks with tight nonghyeon bends on taut ramie/silk.', { [TN.POSITION]: 0.30, [TN.HARDNESS]: 0.54, [TN.FORCE]: 0.74, [TN.NONLIN]: 0.82, [TN.TENSION]: 0.60 }, 4),
  preset(idx('gayageum'), 'tonos-gayageum-court-jeongak', 'Gayageum · Court Jeongak', 'Deep stately broad silk plucks over a long carved paulownia chamber with lingering decay.', { [TN.POSITION]: 0.74, [TN.HARDNESS]: 0.22, [TN.BODY_SIZE]: 0.70, [TN.BODY]: 0.74, [TN.DAMPING]: 0.40, [RV.MIX]: 0.24 }, -5),
  // 8 Haegeum (+3)
  preset(idx('haegeum'), 'tonos-haegeum-court-nasal', 'Haegeum · Jeongak Nasal Silk', 'High rosin bite on bamboo-root box with long aching silk glissandi.', { [TN.POSITION]: 0.34, [TN.HARDNESS]: 0.72, [TN.BOW_SPEED]: 0.48, [TN.SLIDE]: 0.48, [TN.VIB_DEPTH]: 0.54 }, 0),
  preset(idx('haegeum'), 'tonos-haegeum-folk-brisk', 'Haegeum · Minsok Folk Bite', 'Nimble rhythmic bowing, tighter chest resonance and crisp string stops.', { [TN.BOW_SPEED]: 0.78, [TN.FORCE]: 0.72, [TN.RELEASE_DAMP]: 0.68, [TN.BODY_SIZE]: 0.32, [TN.SLIDE]: 0.16 }, 5),
  preset(idx('haegeum'), 'tonos-haegeum-warm-gut', 'Haegeum · Warm Gut Chamber', 'Spun gut-like warmth with slow gentle bow and deep breathy vibrato.', { [TN.MATERIAL]: 4, [TN.BOW_SPEED]: 0.40, [TN.HARDNESS]: 0.36, [TN.VIB_DEPTH]: 0.42, [RV.MIX]: 0.26 }, -4),
  // 9 Morin khuur (+3)
  preset(idx('morin-khuur'), 'tonos-morin-steppe-drone', 'Morin khuur · Urtyn Duu Drone', 'Massive slow horsehair bow stroke with deep chest resonance and slow vocal ornamentation.', { [TN.BOW_SPEED]: 0.42, [TN.FORCE]: 0.78, [TN.BODY]: 0.76, [TN.BODY_SIZE]: 0.72, [TN.VIB_DEPTH]: 0.50, [TN.SLIDE]: 0.46, [RV.MIX]: 0.28 }, -5),
  preset(idx('morin-khuur'), 'tonos-morin-gallop-tight', 'Morin khuur · Horse Gallop', 'Brighter near-bridge rosin crunch and quick bouncy rhythmic bowing.', { [TN.POSITION]: 0.26, [TN.BOW_SPEED]: 0.76, [TN.HARDNESS]: 0.72, [TN.RELEASE_DAMP]: 0.70, [TN.SLIDE]: 0.14 }, 4),
  preset(idx('morin-khuur'), 'tonos-morin-overtone-whisper', 'Morin khuur · Flageolet Sing', 'Light fast bow speed skating delicately to draw airy horsehair overtones.', { [TN.BOW_SPEED]: 0.80, [TN.FORCE]: 0.28, [TN.POSITION]: 0.22, [TN.HARDNESS]: 0.40, [RV.MIX]: 0.26 }, 7),
  // 10 Dan bau (+2)
  preset(idx('dan-bau'), 'tonos-dan-bau-octave-bell', 'Đàn bầu · Clear 4th Harmonic', 'Palm touching cleanly at the quarter-node for bell-like harmonic purity over gourd bloom.', { [TN.HARMONIC]: 3, [TN.POSITION]: 0.22, [TN.HARDNESS]: 0.72, [TN.DAMPING]: 0.32, [RV.MIX]: 0.26 }, 5),
  preset(idx('dan-bau'), 'tonos-dan-bau-bamboo-whisper', 'Đàn bầu · Whispered Gourd', 'Intimate soft pluck and deep syrupy pitch-rod sighs over an aged bottle gourd.', { [TN.HERITAGE_AGE]: 0.74, [TN.FORCE]: 0.34, [TN.HARDNESS]: 0.36, [TN.BODY]: 0.72, [TN.SLIDE]: 0.58, [RV.MIX]: 0.24 }, -3),
  // 11 Sitar (+0, already has 4: base + jhala + thread + 1948 miraj!)
  // 12 Tanpura (+2, currently base + open drone = 2 -> add 2 for 4)
  preset(idx('tanpura'), 'tonos-tanpura-thread-off', 'Tanpura · Plain Unbuzzed Jiva', 'Cotton thread shifted back away from the bridge crown — hear the bare steel-and-gourd resonance.', { [TN.JAWARI]: 0.08, [TN.POSITION]: 0.55, [TN.HARDNESS]: 0.44, [TN.BODY]: 0.62 }, 0),
  preset(idx('tanpura'), 'tonos-tanpura-kharaj-bass', 'Tanpura · Male Miraj Kharaj', 'Deep aged male gourd calibrated for low brass wound drone strings with slow harmonic bloom.', { [TN.HERITAGE_AGE]: 0.82, [TN.MATERIAL]: 9, [TN.JAWARI]: 0.96, [TN.BODY_SIZE]: 0.78, [TN.BODY]: 0.74, [TN.DAMPING]: 0.30, [RV.MIX]: 0.25 }, -7),
  // 13 Sarod (+2, currently base + 1935 Maihar = 2 -> add 2 for 4)
  preset(idx('sarod'), 'tonos-sarod-taut-jhala', 'Sarod · High Skin Jhala', 'Taut goatskin, heavy coconut plectrum near bridge, zero mute — slicing North Indian raga runs.', { [TN.POSITION]: 0.22, [TN.HARDNESS]: 0.86, [TN.FORCE]: 0.84, [TN.SKIN_TENSION]: 0.76, [TN.SYMP]: 0.56 }, 7),
  preset(idx('sarod'), 'tonos-sarod-meend-deep', 'Sarod · Smooth Bass Meend', 'Warm fretless steel-plate slides and heavy body resonance tuned down into deep alap.', { [TN.POSITION]: 0.62, [TN.HARDNESS]: 0.36, [TN.SLIDE]: 0.52, [TN.VIB_DEPTH]: 0.38, [TN.BODY_SIZE]: 0.66, [TN.SKIN_TENSION]: 0.42 }, -5),
  // 14 Sarangi (+2, currently base + Varanasi = 2 -> add 2 for 4)
  preset(idx('sarangi'), 'tonos-sarangi-cuticle-bright', 'Sarangi · Crisp Cuticle Soprano', 'Fingernail-cuticle stopping up the neck with tight goat hide and bright expressive gamak.', { [TN.POSITION]: 0.28, [TN.SKIN_TENSION]: 0.70, [TN.BOW_SPEED]: 0.66, [TN.HARDNESS]: 0.68, [TN.VIB_DEPTH]: 0.58 }, 7),
  preset(idx('sarangi'), 'tonos-sarangi-todi-halo', 'Sarangi · Todi Sympathetic Wash', 'Thirty-seven tarab understrings resonating in Raga Todi beneath slow legato gut bowing.', { [TN.SYMP]: 0.82, [TN.SYMP_SCALE]: 4, [TN.BOW_SPEED]: 0.46, [TN.SLIDE]: 0.50, [RV.MIX]: 0.28 }, -3),
  // 15 Saraswati veena (+3)
  preset(idx('veena'), 'tonos-veena-tanjore-brass', 'Saraswati veena · Tanjore Master', 'Aged carved jackwood and wide curved brass plate jawari for majestic Carnatic gamaka bends.', { [TN.HERITAGE_AGE]: 0.80, [TN.JAWARI]: 0.90, [TN.BODY]: 0.70, [TN.SLIDE]: 0.46, [TN.VIB_DEPTH]: 0.48, [TN.NONLIN]: 0.68 }, 0),
  preset(idx('veena'), 'tonos-veena-muted-pluck', 'Saraswati veena · Crisp Thanam', 'Closer to the brass bridge with firm pluck attack and rhythmic damped tala releases.', { [TN.POSITION]: 0.28, [TN.HARDNESS]: 0.74, [TN.FORCE]: 0.74, [TN.RELEASE_DAMP]: 0.58, [TN.JAWARI]: 0.66 }, 5),
  preset(idx('veena'), 'tonos-veena-warm-gourd', 'Saraswati veena · Singing Bronze', 'Bronze-wound mellow middle register with lifted jawari buzz for velvety vocal phrasing.', { [TN.MATERIAL]: 2, [TN.JAWARI]: 0.25, [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.30, [TN.BODY_SIZE]: 0.68, [RV.MIX]: 0.26 }, -5),
  // 16 Santoor (+2, currently base + Srinagar = 2 -> add 2 for 4)
  preset(idx('santoor'), 'tonos-santoor-crisp-chala', 'Santoor · Crisp Light Walnut', 'Featherweight curved mallets snapping near the right bridge for rapid cascade patterns.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.86, [TN.RELEASE_DAMP]: 0.36, [TN.TREMOLO]: 0.30 }, 7),
  preset(idx('santoor'), 'tonos-santoor-harp-bloom', 'Santoor · Luminous Raga Halo', 'Soft mallet strike high on the string letting tripled steel courses bloom into dense room air.', { [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.26, [TN.COURSE_DETUNE]: 0.54, [TN.DAMPING]: 0.32, [RV.MIX]: 0.30 }, -4),
  // 17 Esraj (+3)
  preset(idx('esraj'), 'tonos-esraj-shantiniketan-vocal', 'Esraj · Shantiniketan Rabindra', 'Warm singing bow gliding gently over gut/steel neck frets with lush Bilawal sympathetics.', { [TN.HERITAGE_AGE]: 0.70, [TN.SYMP]: 0.64, [TN.SYMP_SCALE]: 1, [TN.BOW_SPEED]: 0.50, [TN.SLIDE]: 0.44, [TN.VIB_DEPTH]: 0.52 }, 0),
  preset(idx('esraj'), 'tonos-esraj-taraf-shimmer', 'Esraj · High Taraf Shimmer', 'Bright crisp bridge rosin drawing dense upper sympathetic sparkles across the goatskin.', { [TN.POSITION]: 0.28, [TN.SYMP]: 0.82, [TN.SKIN_TENSION]: 0.72, [TN.BOW_SPEED]: 0.68, [TN.HARDNESS]: 0.68 }, 7),
  preset(idx('esraj'), 'tonos-esraj-dry-chamber', 'Esraj · Intimate Close Skin', 'Close dry skin belly with restrained sympathetics and gut-like warmth.', { [TN.MATERIAL]: 4, [TN.SYMP]: 0.22, [TN.SKIN_TENSION]: 0.42, [TN.BOW_SPEED]: 0.42, [RV.MIX]: 0.12 }, -5),
  // 18 Dilruba (+3)
  preset(idx('dilruba'), 'tonos-dilruba-patiala-deep', 'Dilruba · Patiala Deep Taraf', 'Larger drum cavity and aged hide, tuned in dark Kafi mode for deep devotional lines.', { [TN.HERITAGE_AGE]: 0.76, [TN.BODY_SIZE]: 0.68, [TN.SYMP]: 0.72, [TN.SYMP_SCALE]: 2, [TN.BOW_SPEED]: 0.46, [RV.MIX]: 0.26 }, -5),
  preset(idx('dilruba'), 'tonos-dilruba-sargam-crisp', 'Dilruba · Crisp Bowed Sargam', 'Tight goatskin and nimble bow changes for classical Sikh/Hindustani ornamental phrasing.', { [TN.SKIN_TENSION]: 0.68, [TN.POSITION]: 0.32, [TN.BOW_SPEED]: 0.68, [TN.RELEASE_DAMP]: 0.64, [TN.HARDNESS]: 0.64 }, 5),
  preset(idx('dilruba'), 'tonos-dilruba-sarangi-silk', 'Dilruba · Vocal Silk Weight', 'Smooth expressive slides and heavy pressure pulling the voice into the skin drum.', { [TN.FORCE]: 0.74, [TN.HARDNESS]: 0.38, [TN.VIB_DEPTH]: 0.56, [TN.SLIDE]: 0.48, [TN.BODY]: 0.72 }, 0),
  // 19 Oud (+1, currently base + taqsim + aleppo = 3 -> add 1 Baghdad Iraqi pick for 4)
  preset(idx('oud'), 'tonos-oud-iraqi-floating', 'Oud · Iraqi Crisp Floating-Bridge', 'Bright cedar soundboard, hard plectrum close to the floating bridge and subtle palm mute.', { [TN.POSITION]: 0.24, [TN.HARDNESS]: 0.76, [TN.BODY_SIZE]: 0.42, [TN.COURSE_DETUNE]: 0.26, [TN.MUTE]: 0.22, [TN.DAMPING]: 0.62, [RV.MIX]: 0.14 }, 5),
  // 20 Qanun (+2, currently base + Istanbul = 2 -> add 2 for 4)
  preset(idx('qanun'), 'tonos-qanun-cairo-crystal', 'Qanun · Cairo Crisp Treble', 'Tight bright horned ring-picks near the taut fish-skin bridge for blindingly fast tremolos.', { [TN.POSITION]: 0.24, [TN.HARDNESS]: 0.86, [TN.SKIN_TENSION]: 0.76, [TN.COURSE_DETUNE]: 0.46, [TN.TREMOLO]: 0.32 }, 8),
  preset(idx('qanun'), 'tonos-qanun-warm-bass', 'Qanun · Warm Wooden Arpeggio', 'Lower octave triple courses struck over the spruce board, lushly chorused with broad space.', { [TN.POSITION]: 0.62, [TN.HARDNESS]: 0.34, [TN.BODY]: 0.68, [TN.BODY_SIZE]: 0.64, [TN.COURSE_DETUNE]: 0.56, [RV.MIX]: 0.28 }, -7),
  // 21 Santur (+3)
  preset(idx('santur'), 'tonos-santur-tehran-bare', 'Santur · Tehrani Bare Mezrab', 'Ultra-hard thin walnut sticks bouncing on airy Persian steel quadruples for glassy sparkle.', { [TN.POSITION]: 0.30, [TN.HARDNESS]: 0.88, [TN.HERITAGE_AGE]: 0.68, [TN.COURSE_DETUNE]: 0.52, [TN.DAMPING]: 0.42 }, 5),
  preset(idx('santur'), 'tonos-santur-felt-ballad', 'Santur · Felt-Wrapped Radif', 'Thin felt cuffs damped onto the mezrab tips: tender Persian radif warmth without brittle sting.', { [TN.POSITION]: 0.64, [TN.HARDNESS]: 0.24, [TN.BODY]: 0.64, [TN.BODY_SIZE]: 0.60, [RV.MIX]: 0.26 }, -5),
  preset(idx('santur'), 'tonos-santur-kurdish-pulse', 'Santur · Tight Kurdish Groove', 'Short controlled release damping for syncopated mountain ensemble patterns.', { [TN.POSITION]: 0.42, [TN.HARDNESS]: 0.66, [TN.RELEASE_DAMP]: 0.72, [TN.FORCE]: 0.70 }, 0),
  // 22 Kamancheh (+3)
  preset(idx('kamancheh'), 'tonos-kamancheh-azeri-tight', 'Kamancheh · Azerbaijani Mugam', 'Bright high-tension fish/lambskin sphere with crisp agile phrasing and radiant upper overtones.', { [TN.SKIN_TENSION]: 0.78, [TN.POSITION]: 0.28, [TN.BOW_SPEED]: 0.68, [TN.HARDNESS]: 0.70, [TN.HERITAGE_AGE]: 0.70 }, 5),
  preset(idx('kamancheh'), 'tonos-kamancheh-isfahan-silk', 'Kamancheh · Isfahan Silk Radif', 'Warm mellow silk-weight bow strokes and aching fretless bends up the neck.', { [TN.MATERIAL]: 5, [TN.SKIN_TENSION]: 0.46, [TN.BOW_SPEED]: 0.46, [TN.VIB_DEPTH]: 0.58, [TN.SLIDE]: 0.48, [RV.MIX]: 0.25 }, -2),
  preset(idx('kamancheh'), 'tonos-kamancheh-alto-chest', 'Kamancheh · Deep Alto Bowl', 'Larger mulberry bowl and relaxed membrane opening up warm cello-like low mids.', { [TN.BODY_SIZE]: 0.72, [TN.SKIN_TENSION]: 0.36, [TN.BODY]: 0.74, [TN.BOW_SPEED]: 0.44, [RV.MIX]: 0.22 }, -7),
  // 23 Tar (+3)
  preset(idx('tar'), 'tonos-tar-tehran-riz', 'Tar · Tehrani Tremolo Riz', 'Fast stinging brass-mezrab tremolo rolls cutting cleanly across the taut figure-8 lambskin.', { [TN.TREMOLO]: 0.64, [TN.HARDNESS]: 0.84, [TN.SKIN_TENSION]: 0.74, [TN.POSITION]: 0.26, [TN.DAMPING]: 0.60 }, 3),
  preset(idx('tar'), 'tonos-tar-aged-mulberry', 'Tar · Aged Shiraz Mulberry', 'Vintage seasoned mulberry double bowl with warm skin snap and singing melodic clarity.', { [TN.HERITAGE_AGE]: 0.82, [TN.CRAFT_ASYMMETRY]: 0.56, [TN.BODY]: 0.68, [TN.SKIN_TENSION]: 0.54, [TN.SLIDE]: 0.34, [RV.MIX]: 0.20 }, 0),
  preset(idx('tar'), 'tonos-tar-bass-mute', 'Tar · Muted Bam Ostinato', 'Looser drum skin and edge-of-hand bridge damping for hypnotic rhythmic bass figures.', { [TN.MUTE]: 0.46, [TN.SKIN_TENSION]: 0.38, [TN.FORCE]: 0.76, [TN.DAMPING]: 0.72 }, -7),
  // 24 Setar (+3)
  preset(idx('setar'), 'tonos-setar-tehran-nail', 'Setar · Classical Index Nail', 'Delicate shimmering fingernail flick high on steel with hollow aged mulberry singing.', { [TN.HERITAGE_AGE]: 0.76, [TN.POSITION]: 0.48, [TN.HARDNESS]: 0.74, [TN.BODY]: 0.64, [TN.DAMPING]: 0.44, [RV.MIX]: 0.24 }, 4),
  preset(idx('setar'), 'tonos-setar-riz-drone', 'Setar · Shour Tremolo Roll', 'Brisk nail riz tremor and slight tension bend over the delicate hollow neck.', { [TN.TREMOLO]: 0.58, [TN.HARDNESS]: 0.70, [TN.NONLIN]: 0.68, [TN.VIB_DEPTH]: 0.30 }, 0),
  preset(idx('setar'), 'tonos-setar-intimate-wood', 'Setar · Soft Midnight Solo', 'Flesh-and-nail gentle pluck near the neck heel for hushed woody chamber intimacy.', { [TN.POSITION]: 0.72, [TN.HARDNESS]: 0.32, [TN.FORCE]: 0.36, [TN.BODY_SIZE]: 0.60, [RV.MIX]: 0.22 }, -5),
  // 25 Baglama (+3)
  preset(idx('baglama'), 'tonos-baglama-anatolian-tezene', 'Bağlama · Anatolian Tezene', 'Springy cherry-bark pick strokes driving tripled steel courses across Anatolia.', { [TN.POSITION]: 0.38, [TN.HARDNESS]: 0.74, [TN.COURSE_DETUNE]: 0.52, [TN.FORCE]: 0.70, [TN.TREMOLO]: 0.28 }, 3),
  preset(idx('baglama'), 'tonos-baglama-selpe-tap', 'Bağlama · Şelpe Bare-Finger Tap', 'No pick — warm flesh-and-finger hammering and pulling directly on the upper spruce soundboard.', { [TN.POSITION]: 0.68, [TN.HARDNESS]: 0.24, [TN.FORCE]: 0.54, [TN.BODY]: 0.68, [TN.NONLIN]: 0.72, [RV.MIX]: 0.20 }, -2),
  preset(idx('baglama'), 'tonos-baglama-divan-deep', 'Bağlama · Deep Divan Meydan', 'Huge long-scale Divan saz with deep carved mulberry belly and shimmering copper/bronze lows.', { [TN.HERITAGE_AGE]: 0.78, [TN.MATERIAL]: 2, [TN.BODY_SIZE]: 0.76, [TN.BODY]: 0.72, [TN.DAMPING]: 0.38, [RV.MIX]: 0.24 }, -7),
  // 26 Dutar (+3)
  preset(idx('dutar'), 'tonos-dutar-herat-silk', 'Dutar · Herati Strumming Silk', 'Aged mulberry pear bowl with wide soft silk sweeps and organic pitch droop.', { [TN.HERITAGE_AGE]: 0.74, [TN.POSITION]: 0.62, [TN.HARDNESS]: 0.34, [TN.NONLIN]: 0.72, [TN.BODY]: 0.66, [RV.MIX]: 0.20 }, 0),
  preset(idx('dutar'), 'tonos-dutar-turkmen-drive', 'Dutar · Turkmen Bright Snap', 'Higher tension nylon-steel snap near bridge with percussive driving thumb strikes.', { [TN.MATERIAL]: 8, [TN.POSITION]: 0.30, [TN.HARDNESS]: 0.76, [TN.FORCE]: 0.78, [TN.DAMPING]: 0.62 }, 5),
  preset(idx('dutar'), 'tonos-dutar-khorasan-soft', 'Dutar · Khorasan Chamber Mute', 'Relaxed lightly damped silk ostinatos sitting softly in a small room.', { [TN.MUTE]: 0.36, [TN.HARDNESS]: 0.28, [TN.RELEASE_DAMP]: 0.60, [RV.MIX]: 0.14 }, -4),
  // 27 Rubab (+3)
  preset(idx('rubab'), 'tonos-rubab-kabuli-bite', 'Rubab · Kabuli Horn Plectrum', 'Heavy goatskin punch under short gut courses with snarling plectrum snap and drone shine.', { [TN.POSITION]: 0.32, [TN.HARDNESS]: 0.78, [TN.FORCE]: 0.76, [TN.SKIN_TENSION]: 0.68, [TN.SYMP]: 0.56 }, 4),
  preset(idx('rubab'), 'tonos-rubab-deep-naghma', 'Rubab · Lush Naghma Sympathetics', 'Rich sympathetic Kafi resonance bloom beneath warm mid-neck gut melody runs.', { [TN.HERITAGE_AGE]: 0.76, [TN.SYMP]: 0.78, [TN.SYMP_SCALE]: 2, [TN.POSITION]: 0.58, [TN.HARDNESS]: 0.40, [RV.MIX]: 0.26 }, 0),
  preset(idx('rubab'), 'tonos-rubab-palm-drum', 'Rubab · Muted Skin Ostinato', 'Soft gut + damped palm strokes pulling dark drum thuds out of the goatskin lower belly.', { [TN.MUTE]: 0.52, [TN.SKIN_TENSION]: 0.40, [TN.FORCE]: 0.78, [TN.DAMPING]: 0.68 }, -5),
  // 28 Tanbur (+3)
  preset(idx('tanbur'), 'tonos-tanbur-mystic-shimmer', 'Tanbur · Infinite Sufi Sustain', 'Ultra-long neck and slice bowl tuned for endless silvery double-course sustain and slow bloom.', { [TN.HERITAGE_AGE]: 0.80, [TN.DAMPING]: 0.20, [TN.BODY]: 0.62, [TN.COURSE_DETUNE]: 0.48, [TN.RELEASE_DAMP]: 0.05, [RV.MIX]: 0.30 }, 0),
  preset(idx('tanbur'), 'tonos-tanbur-khorasan-nail', 'Tanbur · Striped Fingernail', 'Brisk Kurdish double-finger strumming close to the wooden bridge for piercing upper harmonics.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.80, [TN.TREMOLO]: 0.44, [TN.FORCE]: 0.70 }, 7),
  preset(idx('tanbur'), 'tonos-tanbur-deep-copper', 'Tanbur · Low Bronze Drone', 'Heavy bronze string response with gentle tortoise pick and deep hollow gourd/wood low end.', { [TN.MATERIAL]: 2, [TN.POSITION]: 0.58, [TN.HARDNESS]: 0.38, [TN.BODY_SIZE]: 0.70, [TN.DAMPING]: 0.35 }, -7),
  // 29 Rebab (+3)
  preset(idx('rebab'), 'tonos-rebab-javanese-court', 'Rebab · Gamelan Court Silk', 'Silky bowed overtones, subtle skin resonance and sliding vocal gamelan grace notes.', { [TN.MATERIAL]: 5, [TN.BOW_SPEED]: 0.48, [TN.SKIN_TENSION]: 0.58, [TN.SLIDE]: 0.48, [TN.VIB_DEPTH]: 0.48, [RV.MIX]: 0.26 }, 4),
  preset(idx('rebab'), 'tonos-rebab-desert-spike', 'Rebab · Maghreb Coarse Hair', 'Rough gritty horsehair grip over slack skin with heavy desert vocal rasp.', { [TN.FORCE]: 0.78, [TN.HARDNESS]: 0.74, [TN.SKIN_TENSION]: 0.38, [TN.BOW_SPEED]: 0.62 }, -3),
  preset(idx('rebab'), 'tonos-rebab-coconut-crisp', 'Rebab · Tight Coconut Cry', 'Compact coconut resonator with tight membrane and crisp piercing bow edge.', { [TN.BODY_SIZE]: 0.32, [TN.SKIN_TENSION]: 0.74, [TN.POSITION]: 0.26, [TN.BOW_SPEED]: 0.66 }, 7),
  // 30 Bouzouki (+2, currently base + tremolo = 2 -> add 2 for 4)
  preset(idx('bouzouki'), 'tonos-bouzouki-rebetiko-pick', 'Bouzouki · Rebetiko Taximi', 'Aged staved bowl with snappy tortoise pick, double-course octave sheen and slides.', { [TN.HERITAGE_AGE]: 0.72, [TN.POSITION]: 0.34, [TN.HARDNESS]: 0.82, [TN.SLIDE]: 0.28, [TN.COURSE_DETUNE]: 0.46, [RV.MIX]: 0.22 }, 3),
  preset(idx('bouzouki'), 'tonos-bouzouki-palm-mute', 'Bouzouki · Staved Palm-Mute', 'Tight rhythmic chugging close to the bridge for Zeibekiko bass and rhythm chords.', { [TN.MUTE]: 0.56, [TN.POSITION]: 0.22, [TN.HARDNESS]: 0.78, [TN.RELEASE_DAMP]: 0.68, [TN.DAMPING]: 0.62 }, -5),
  // 31 Balalaika (+2, currently base + tremolo = 2 -> add 2 for 4)
  preset(idx('balalaika'), 'tonos-balalaika-concert-nail', 'Balalaika · Concert Prima', 'Spruce triangular top struck crisply with the nail tip for bright sparkling folk lines.', { [TN.POSITION]: 0.36, [TN.HARDNESS]: 0.82, [TN.BODY_SIZE]: 0.40, [TN.FORCE]: 0.66, [RV.MIX]: 0.18 }, 6),
  preset(idx('balalaika'), 'tonos-balalaika-secunda-warm', 'Balalaika · Warm Gut Secunda', 'Larger triangular chamber tuned down with gut warmth and gentle thumb strokes.', { [TN.MATERIAL]: 4, [TN.BODY_SIZE]: 0.68, [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.28, [TN.BODY]: 0.68, [RV.MIX]: 0.22 }, -6),
  // 32 Hurdy-gurdy (+2, currently base + coups = 2 -> add 2 for 4)
  preset(idx('hurdy-gurdy'), 'tonos-hurdy-gurdy-lyrical', 'Hurdy-gurdy · Smooth Chanterelle', 'Rattling dog disengaged — pure singing rosined wheel over wooden tangents.', { [TN.RATTLE]: 0.0, [TN.BOW_SPEED]: 0.54, [TN.HARDNESS]: 0.46, [TN.BODY]: 0.66, [TN.SLIDE]: 0.24, [RV.MIX]: 0.24 }, 0),
  preset(idx('hurdy-gurdy'), 'tonos-hurdy-gurdy-trompette', 'Hurdy-gurdy · Fierce Trompette', 'Aggressive high-speed wrist wheel snaps triggering ferocious loose chien bridge clatter.', { [TN.RATTLE]: 0.94, [TN.TREMOLO]: 0.44, [TN.BOW_SPEED]: 0.78, [TN.FORCE]: 0.82, [TN.POSITION]: 0.26 }, 5),
  // 33 Nyckelharpa (+2, currently base + Uppland = 2 -> add 2 for 4)
  preset(idx('nyckelharpa'), 'tonos-nyckelharpa-polska-dry', 'Nyckelharpa · Crisp Dance Polska', 'Brisk bow articulation and firm key-tangent attack built for tight Swedish folk dances.', { [TN.BOW_SPEED]: 0.72, [TN.POSITION]: 0.30, [TN.HARDNESS]: 0.68, [TN.RELEASE_DAMP]: 0.66, [TN.SYMP]: 0.32, [RV.MIX]: 0.14 }, 4),
  preset(idx('nyckelharpa'), 'tonos-nyckelharpa-silver-chamber', 'Nyckelharpa · Lush Drone Halo', 'Wide rich sympathetic resonance ringing like a medieval string consort.', { [TN.SYMP]: 0.84, [TN.SYMP_SCALE]: 7, [TN.BOW_SPEED]: 0.44, [TN.HARDNESS]: 0.40, [TN.BODY]: 0.72, [RV.MIX]: 0.30 }, -4),
  // 34 Hardanger fiddle (+2, currently base + 1895 = 2 -> add 2 for 4)
  preset(idx('hardanger'), 'tonos-hardanger-halling-snap', 'Hardanger · Brisk Halling Bite', 'Close-to-bridge bow bite with snappy ornament slides and fiery folk accents.', { [TN.POSITION]: 0.24, [TN.BOW_SPEED]: 0.76, [TN.FORCE]: 0.78, [TN.HARDNESS]: 0.76, [TN.RELEASE_DAMP]: 0.62, [TN.SYMP]: 0.44 }, 5),
  preset(idx('hardanger'), 'tonos-hardanger-baroque-gut', 'Hardanger · Aged Gut Consort', 'Soft gut strings under relaxed rosin grip letting the spruce belly and understrings glow.', { [TN.MATERIAL]: 4, [TN.HERITAGE_AGE]: 0.84, [TN.BOW_SPEED]: 0.42, [TN.HARDNESS]: 0.34, [TN.SYMP]: 0.72, [RV.MIX]: 0.26 }, -3),
  // 35 Kantele (+2, currently base + bright = 2 -> add 2 for 4)
  preset(idx('kantele'), 'tonos-kantele-carved-hollow', 'Kantele · Hollow Carved Alder', 'Single-block hollowed spruce/alder trough plucked softly by bare fingertips over mist.', { [TN.HERITAGE_AGE]: 0.78, [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.24, [TN.BODY]: 0.72, [TN.BODY_SIZE]: 0.64, [RV.MIX]: 0.26 }, -4),
  preset(idx('kantele'), 'tonos-kantele-muted-dance', 'Kantele · Damped Folk Strums', 'Firm release damping and crisp mid-bridge strokes for rhythmic Finno-Ugric tunes.', { [TN.RELEASE_DAMP]: 0.68, [TN.POSITION]: 0.36, [TN.HARDNESS]: 0.62, [TN.DAMPING]: 0.56 }, 4),
  // 36 Cimbalom (+2, currently base + dampers = 2 -> add 2 for 4)
  preset(idx('cimbalom'), 'tonos-cimbalom-lush-concert', 'Cimbalom · Undamped Romantic', 'Open pedal with heavy cotton mallets blooming into massive Hungarian concert warmth.', { [TN.HERITAGE_AGE]: 0.76, [TN.BODY_SIZE]: 0.72, [TN.BODY]: 0.70, [TN.HARDNESS]: 0.32, [TN.DAMPING]: 0.28, [RV.MIX]: 0.28 }, -5),
  preset(idx('cimbalom'), 'tonos-cimbalom-bare-mallet', 'Cimbalom · Crisp Wood Hammer', 'Inverted wooden mallets hitting near the treble bridges for brilliant percussive runs.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.86, [TN.COURSE_DETUNE]: 0.56, [TN.RELEASE_DAMP]: 0.38 }, 7),
  // 37 Lute (+2, currently base + 1590 Venice = 2 -> add 2 for 4)
  preset(idx('lute'), 'tonos-lute-theorbo-bass', 'Lute · Deep Theorbo Courses', 'Huge warm gut bass range with slack long strings, soft thumb-under sweep and church stone.', { [TN.HERITAGE_AGE]: 0.86, [TN.BODY_SIZE]: 0.78, [TN.TENSION]: 0.36, [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.26, [RV.MIX]: 0.28 }, -7),
  preset(idx('lute'), 'tonos-lute-tastiera-bright', 'Lute · Crisp Near-Bridge', 'Firm index finger near the bridge for agile Baroque counterpoint and bright treble shine.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.64, [TN.COURSE_DETUNE]: 0.42, [TN.RELEASE_DAMP]: 0.44, [RV.MIX]: 0.16 }, 5),
  // 38 Gusle (+3)
  preset(idx('gusle'), 'tonos-gusle-epic-bark', 'Gusle · Balkan Epic Recitative', 'Gritty coarse horsehair bow rasping fiercely across raw animal hide with stark woody bite.', { [TN.FORCE]: 0.82, [TN.HARDNESS]: 0.76, [TN.BOW_SPEED]: 0.56, [TN.SKIN_TENSION]: 0.54, [TN.SLIDE]: 0.42 }, 0),
  preset(idx('gusle'), 'tonos-gusle-deep-vibrato', 'Gusle · Dark Mountain Lament', 'Lower relaxed skin tension, slow weeping bow strokes and wide haunting vibrato.', { [TN.SKIN_TENSION]: 0.36, [TN.BODY_SIZE]: 0.68, [TN.BOW_SPEED]: 0.38, [TN.VIB_DEPTH]: 0.64, [RV.MIX]: 0.24 }, -5),
  preset(idx('gusle'), 'tonos-gusle-taut-cry', 'Gusle · Taut Treble Ornament', 'High taut membrane snapping crisp trills into bright overtone-heavy phrases.', { [TN.SKIN_TENSION]: 0.76, [TN.POSITION]: 0.28, [TN.BOW_SPEED]: 0.72, [TN.HARDNESS]: 0.72 }, 6),
  // 39 Portuguese guitar (+3)
  preset(idx('portuguese-guitar'), 'tonos-portuguese-guitar-lisbon-unha', 'Portuguese · Lisbon Crisp Unha', 'Piercing scalloped-nail steel attack right at the bridge, shimmering with Lisbon fado clarity.', { [TN.POSITION]: 0.22, [TN.HARDNESS]: 0.90, [TN.COURSE_DETUNE]: 0.44, [TN.FORCE]: 0.72, [RV.MIX]: 0.20 }, 5),
  preset(idx('portuguese-guitar'), 'tonos-portuguese-guitar-coimbra', 'Portuguese · Coimbra Deep Tear', 'Aged spruce pear box tuned darker for sweeping, mournful academic Coimbra serenades.', { [TN.HERITAGE_AGE]: 0.80, [TN.BODY_SIZE]: 0.66, [TN.POSITION]: 0.52, [TN.HARDNESS]: 0.54, [TN.BODY]: 0.64, [RV.MIX]: 0.26 }, -4),
  preset(idx('portuguese-guitar'), 'tonos-portuguese-guitar-tremolo', 'Portuguese · Rolling Guitarrada', 'Rapid fingerpick tremolos and crisp damped releases dancing around vocal lines.', { [TN.TREMOLO]: 0.54, [TN.RELEASE_DAMP]: 0.42, [TN.HARDNESS]: 0.80, [TN.POSITION]: 0.30 }, 0),
  // 40 Kora (+1, currently base + sesse + griot = 3 -> add 1 Close Warm Harp for 4)
  preset(idx('kora'), 'tonos-kora-intimate-calabash', 'Kora · Intimate Pure Harp', 'Rattle-free warm fingerstyle over fresh cowhide — clean, bell-like Mande fountain cascade.', { [TN.RATTLE]: 0.0, [TN.POSITION]: 0.62, [TN.HARDNESS]: 0.34, [TN.BODY]: 0.72, [TN.DAMPING]: 0.44, [RV.MIX]: 0.22 }, 5),
  // 41 Kamale n'goni (+3)
  preset(idx('kamale-ngoni'), 'tonos-kamale-ngoni-wassoulou', 'Kamale n\'goni · Wassoulou Groove', 'Buzzy bridge jingle plate and snappy nylon plucks calibrated for hypnotic 6/8 grooves.', { [TN.RATTLE]: 0.68, [TN.FORCE]: 0.72, [TN.HARDNESS]: 0.60, [TN.SKIN_TENSION]: 0.60, [TN.DAMPING]: 0.62 }, 0),
  preset(idx('kamale-ngoni'), 'tonos-kamale-ngoni-clean-wood', 'Kamale n\'goni · Clean Calabash', 'Sesse rattle quieted down, highlighting the round woody goatskin belly.', { [TN.RATTLE]: 0.0, [TN.POSITION]: 0.62, [TN.HARDNESS]: 0.32, [TN.BODY]: 0.72, [RV.MIX]: 0.20 }, -4),
  preset(idx('kamale-ngoni'), 'tonos-kamale-ngoni-tight-treble', 'Kamale n\'goni · Taut Goatskin Lead', 'Tight bright hide and crisp near-bridge snap for soaring solo pentatonics.', { [TN.SKIN_TENSION]: 0.78, [TN.POSITION]: 0.28, [TN.HARDNESS]: 0.74, [TN.RATTLE]: 0.40 }, 7),
  // 42 Xalam (+3)
  preset(idx('xalam'), 'tonos-xalam-sabaro-snap', 'Xalam · Crisp Sabaro Nail', 'Percussive Senegalese fingernail flicks biting sharply off taut hide over carved wood.', { [TN.POSITION]: 0.28, [TN.HARDNESS]: 0.82, [TN.FORCE]: 0.76, [TN.SKIN_TENSION]: 0.70, [TN.DAMPING]: 0.70 }, 4),
  preset(idx('xalam'), 'tonos-xalam-thumb-mute', 'Xalam · Muted Bass Thumb', 'Deep damped bass strokes mixing skin thump with dry percussive gut warmth.', { [TN.MATERIAL]: 4, [TN.MUTE]: 0.48, [TN.SKIN_TENSION]: 0.44, [TN.FORCE]: 0.78 }, -6),
  preset(idx('xalam'), 'tonos-xalam-aged-griot', 'Xalam · Seasoned Griot Hollow', 'Resonant aged trough and relaxed hide tension singing warm West African proverbs.', { [TN.HERITAGE_AGE]: 0.76, [TN.BODY]: 0.72, [TN.POSITION]: 0.56, [TN.HARDNESS]: 0.46, [RV.MIX]: 0.16 }, 0),
  // 43 Ekonting (+3)
  preset(idx('ekonting'), 'tonos-ekonting-frailing-thump', 'Ekonting · Jola Frailing Slap', 'Strong down-stroke nail attack plus skin-head knock — the true gourd ancestor of clawhammer.', { [TN.FORCE]: 0.80, [TN.HARDNESS]: 0.68, [TN.SKIN_TENSION]: 0.56, [TN.DAMPING]: 0.64, [TN.POSITION]: 0.44 }, 0),
  preset(idx('ekonting'), 'tonos-ekonting-dry-palm', 'Ekonting · Muted Gourd Thump', 'Short damped bass pulse bringing out the dry circular gourd thud.', { [TN.MUTE]: 0.50, [TN.SKIN_TENSION]: 0.40, [TN.BODY_SIZE]: 0.68, [TN.FORCE]: 0.76 }, -5),
  preset(idx('ekonting'), 'tonos-ekonting-crisp-treble', 'Ekonting · High Taut Banjo', 'Tight bright hide and near-bridge frail with piercing rhythmic cut.', { [TN.SKIN_TENSION]: 0.76, [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.80 }, 5),
  // 44 Krar (+3)
  preset(idx('krar'), 'tonos-krar-addis-pick', 'Krar · Addis Electric Acoustic', 'Snappy plectrum picking right near the taut skin bridge with bright Ethiopian bite.', { [TN.POSITION]: 0.28, [TN.HARDNESS]: 0.76, [TN.SKIN_TENSION]: 0.68, [TN.FORCE]: 0.70 }, 4),
  preset(idx('krar'), 'tonos-krar-warm-strum', 'Krar · Mellow Tizita Lyre', 'Soft middle-string strums over rich hide for gentle nostalgic tizita ballads.', { [TN.POSITION]: 0.64, [TN.HARDNESS]: 0.34, [TN.BODY]: 0.72, [TN.BODY_SIZE]: 0.64, [RV.MIX]: 0.24 }, -3),
  preset(idx('krar'), 'tonos-krar-damped-ostinato', 'Krar · Muted Rhythm Lyre', 'Dry palm-damped chordal grooves accentuating percussive skin bounce.', { [TN.MUTE]: 0.46, [TN.RELEASE_DAMP]: 0.64, [TN.SKIN_TENSION]: 0.52 }, 0),
  // 45 Begena (+3)
  preset(idx('begena'), 'tonos-begena-heavy-leather', 'Begena · Heavy Leather Thongs', 'Maximum leather-thong bridge rattle transforming low gut plucks into an earthy liturgical growl.', { [TN.JAWARI]: 1.0, [TN.FORCE]: 0.76, [TN.SKIN_TENSION]: 0.42, [TN.BODY]: 0.76, [TN.HERITAGE_AGE]: 0.78 }, 0),
  preset(idx('begena'), 'tonos-begena-prayer-whisper', 'Begena · Quiet Prayer Bass', 'Soft flesh thumb plucks over a huge cowhide resonator with gentle organic buzz.', { [TN.JAWARI]: 0.64, [TN.FORCE]: 0.42, [TN.HARDNESS]: 0.24, [TN.POSITION]: 0.68, [RV.MIX]: 0.24 }, -4),
  preset(idx('begena'), 'tonos-begena-clear-gut', 'Begena · Unbuzzed Harp Bass', 'Thongs eased back for pure, warm medieval gut bass over deep Ethiopian cowhide.', { [TN.JAWARI]: 0.06, [TN.HARDNESS]: 0.38, [TN.DAMPING]: 0.46 }, 5),
  // 46 Masenqo (+3)
  preset(idx('masenqo'), 'tonos-masenqo-azmari-saw', 'Masenqo · Azmari Nasal Cry', 'Searing diamond-skin horsehair bite with tight skin and piercing vocal slides.', { [TN.SKIN_TENSION]: 0.72, [TN.BOW_SPEED]: 0.66, [TN.HARDNESS]: 0.76, [TN.FORCE]: 0.76, [TN.SLIDE]: 0.42 }, 4),
  preset(idx('masenqo'), 'tonos-masenqo-warm-chestnut', 'Masenqo · Warm Aged Hide', 'Mellow dark-voiced fiddle for slow Ethiopian poetry and meditative folk air.', { [TN.HERITAGE_AGE]: 0.78, [TN.SKIN_TENSION]: 0.42, [TN.BOW_SPEED]: 0.44, [TN.VIB_DEPTH]: 0.56, [RV.MIX]: 0.24 }, -4),
  preset(idx('masenqo'), 'tonos-masenqo-fast-dance', 'Masenqo · Eskista Brisk Bow', 'Fast articulated bow changes with quick damping between rhythmic shoulder-dance riffs.', { [TN.BOW_SPEED]: 0.82, [TN.RELEASE_DAMP]: 0.72, [TN.SLIDE]: 0.14, [TN.POSITION]: 0.28 }, 0),
  // 47 Valiha (+3)
  preset(idx('valiha'), 'tonos-valiha-bamboo-bright', 'Valiha · Clear Steel Bamboo', 'Bright steel wire on a resonant green bamboo cylinder with crisp rapid arpeggios.', { [TN.POSITION]: 0.32, [TN.HARDNESS]: 0.80, [TN.BODY]: 0.66, [TN.DAMPING]: 0.36, [RV.MIX]: 0.22 }, 5),
  preset(idx('valiha'), 'tonos-valiha-muted-bass', 'Valiha · Warm Hollow Bamboo', 'Softer thumb strokes and subtle damping highlighting the open air-column pipe resonances.', { [TN.POSITION]: 0.64, [TN.HARDNESS]: 0.34, [TN.MUTE]: 0.30, [TN.BODY_SIZE]: 0.70, [TN.BODY]: 0.76 }, -5),
  preset(idx('valiha'), 'tonos-valiha-aged-split-cane', 'Valiha · Aged Split-Cane Solo', 'Seasoned split-bamboo patina and micro-asymmetry for singing highland polyrhythms.', { [TN.HERITAGE_AGE]: 0.80, [TN.CRAFT_ASYMMETRY]: 0.62, [TN.WIDTH]: 0.76, [TN.TENSION]: 0.56 }, 0),
  // 48 Inanga (+3)
  preset(idx('inanga'), 'tonos-inanga-whisper-trough', 'Inanga · Night Whispered Gut', 'Ultra-soft gut trough plucked gently with bare skin — intimate Burundian midnight storytelling.', { [TN.HERITAGE_AGE]: 0.74, [TN.POSITION]: 0.68, [TN.HARDNESS]: 0.20, [TN.FORCE]: 0.34, [TN.BODY]: 0.76, [RV.MIX]: 0.26 }, 0),
  preset(idx('inanga'), 'tonos-inanga-crisp-cedar', 'Inanga · Brighter Hardwood Bark', 'Firmer fingertip articulation closer to the notched end, bringing out hollow wood clarity.', { [TN.POSITION]: 0.32, [TN.HARDNESS]: 0.58, [TN.FORCE]: 0.64, [TN.BODY_SIZE]: 0.42 }, 6),
  preset(idx('inanga'), 'tonos-inanga-deep-bass', 'Inanga · Deep Bass Trough', 'Long slack gut string response tuned low with resonant hollow cavity warmth.', { [TN.BODY_SIZE]: 0.74, [TN.TENSION]: 0.38, [TN.DAMPING]: 0.46, [RV.MIX]: 0.22 }, -6),
  // 49 Gimbri (+2, currently base + Essaouira = 2 -> add 2 for 4)
  preset(idx('gimbri'), 'tonos-gimbri-staccato-sersal', 'Gimbri · Dry Staccato Sersal', 'Punchy palm-muted bass snaps with fierce iron sersal jingle cut for sharp trance accents.', { [TN.MUTE]: 0.44, [TN.RATTLE]: 0.86, [TN.FORCE]: 0.84, [TN.HARDNESS]: 0.62, [TN.DAMPING]: 0.74, [RV.MIX]: 0.08 }, 0),
  preset(idx('gimbri'), 'tonos-gimbri-deep-sub', 'Gimbri · Deep Camel-Hide Sub', 'Sersal pulled gently back: pure woody camel-hide bass thump anchored in warm low-mid weight.', { [TN.RATTLE]: 0.16, [TN.POSITION]: 0.66, [TN.HARDNESS]: 0.24, [TN.SKIN_TENSION]: 0.34, [TN.BODY_SIZE]: 0.74, [TN.BODY]: 0.78 }, -5),
  // 50 Goje (+3)
  preset(idx('goje'), 'tonos-goje-sahel-calabash', 'Goje · Sahelian Griot Fiddle', 'Earthy horsehair on lizard skin over a deep round gourd, pulsing through vocal bluesy slides.', { [TN.HERITAGE_AGE]: 0.72, [TN.BOW_SPEED]: 0.54, [TN.SLIDE]: 0.44, [TN.VIB_DEPTH]: 0.48, [TN.SKIN_TENSION]: 0.48 }, 0),
  preset(idx('goje'), 'tonos-goje-gritty-chant', 'Goje · Gritty Rough Horsehair', 'Heavy rosin bite near the bridge for driving Songhai spirit-possession rhythms.', { [TN.FORCE]: 0.82, [TN.HARDNESS]: 0.78, [TN.POSITION]: 0.26, [TN.BOW_SPEED]: 0.70 }, 5),
  preset(idx('goje'), 'tonos-goje-tight-lizard', 'Goje · Tight Treble Lizard Skin', 'High tight skin response giving nasal cutting projection in outdoor desert ensembles.', { [TN.SKIN_TENSION]: 0.76, [TN.BODY_SIZE]: 0.36, [TN.BOW_SPEED]: 0.64, [RV.MIX]: 0.14 }, 7),
  // 51 Uhadi (+3)
  preset(idx('uhadi'), 'tonos-uhadi-chest-vowel', 'Uhadi · Swept Chest-Gourd Vowel', 'Pressing & opening the gourd resonator against the ribs — dramatic singing vowel overtone shifts.', { [TN.POSITION]: 0.72, [TN.BODY]: 0.82, [TN.BODY_SIZE]: 0.56, [TN.HERITAGE_AGE]: 0.70, [TN.HARDNESS]: 0.62 }, 0),
  preset(idx('uhadi'), 'tonos-uhadi-bright-harmonic', 'Uhadi · Open Overtones', 'Gourd held clear and struck briskly by the grass/wooden stick for clear harmonic harmonics.', { [TN.POSITION]: 0.26, [TN.HARDNESS]: 0.80, [TN.FORCE]: 0.74, [TN.BODY_SIZE]: 0.36 }, 7),
  preset(idx('uhadi'), 'tonos-uhadi-muted-stick', 'Uhadi · Muted Gourd Pulse', 'Half-covered chest gourd and soft wooden stick for hypnotic Xhosa bass overtone pulses.', { [TN.POSITION]: 0.40, [TN.MUTE]: 0.46, [TN.HARDNESS]: 0.36, [TN.BODY_SIZE]: 0.74, [TN.DAMPING]: 0.62 }, -5),
];

export const DEFAULT_TONOS_PRESET = TONOS_PRESETS[idx('oud')];

export function tonosPresetById(id: string | undefined): TonosPreset | undefined {
  return id ? TONOS_PRESETS.find((p) => p.id === id) : undefined;
}

export function tonosPresetsForInstrument(instIndex: number): TonosPreset[] {
  return TONOS_PRESETS.filter((p) => p.instrument === instIndex);
}

/** Compact pill label inside an instrument panel (strips redundant `<Instrument> · ` prefix). */
export function tonosSubPresetLabel(presetEntry: TonosPreset, instName: string): string {
  if (presetEntry.name === instName) return 'Signature';
  const prefix = `${instName} · `;
  if (presetEntry.name.startsWith(prefix)) return presetEntry.name.slice(prefix.length);
  return presetEntry.name;
}

export { SLUGS as TONOS_SLUGS };

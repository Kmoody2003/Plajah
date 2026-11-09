// Slicer profile import: read the printer, filament and process presets people already have from
// OrcaSlicer / Bambu Studio (JSON with `inherits` chains, preset bundles), PrusaSlicer / SuperSlicer
// (.ini exports and config bundles) and 3MF projects (Metadata/*.config), and map them onto our own
// FdmOptions and machine settings.
//
// We read the published file formats only; no slicer code is used. Nothing in a profile is ever run:
// custom G-code is kept as text, its placeholders are filled from our own values by a small template
// reader below, and anything we cannot resolve is commented out and listed for the user to review.

import { unzipSync, strFromU8 } from 'fflate';
import type { P2 } from './geom2d';
import type { FdmOptions, InfillPattern, SeamMode } from './cam';
import type { Dialect } from './machines';

export type ProfileKind = 'printer' | 'filament' | 'process';
export type ProfileSource = 'orca' | 'prusa' | '3mf';
export type Flat = Record<string, string | string[]>;

export interface PrinterSettings {
  bed: [number, number, number]; bedShape: 'rect' | 'circle'; bedMin: P2; bedCenter: P2; nozzle?: number; dialect?: Dialect;
  startGcode?: string; endGcode?: string;
  /** Machine limits from the profile (mm/s, mm/s²). */ limits: { maxX?: number; maxY?: number; maxZ?: number; maxE?: number; accel?: number; travelAccel?: number };
  minLayer?: number; maxLayer?: number; retract?: number; retractSpeed?: number; zHop?: number;
}
export interface FilamentSettings {
  type?: string; diameter?: number; density?: number; nozzleTemp?: number; firstLayerNozzleTemp?: number; bedTemp?: number; firstLayerBedTemp?: number;
  fan?: number; fanFirstLayers?: number; maxVolumetric?: number; retract?: number; retractSpeed?: number; zHop?: number; startGcode?: string; endGcode?: string;
}
export type ProcessSettings = Partial<Pick<FdmOptions, 'layer' | 'firstLayer' | 'walls' | 'infill' | 'infillPattern' | 'solidLayers' | 'topLayers' | 'speed' | 'outerWallSpeed' | 'innerWallSpeed' | 'infillSpeed' | 'solidSpeed' | 'travel' | 'firstLayerSpeed' | 'seam' | 'ironing' | 'ironingSpeed' | 'ironingFlow' | 'ironingSpacing' | 'supports' | 'supportStyle' | 'overhang' | 'supportDensity' | 'adhesion' | 'brimWidth' | 'maxVolumetric' | 'accel' | 'adaptive'>>;

export interface SavedProfile {
  id: string; name: string; kind: ProfileKind; source: ProfileSource; fileName: string; importedAt: number;
  /** The fully resolved settings (inherits merged), as the slicer wrote them. */ settings: Flat;
  printer?: PrinterSettings; filament?: FilamentSettings; process?: ProcessSettings; warnings: string[];
}
export interface ImportResult { profiles: SavedProfile[]; warnings: string[] }

// ---------------------------------------------------------------- reading files

/** INI as PrusaSlicer writes it: `key = value`, `#`/`;` comments, optional `[kind:Name]` sections. */
export function parseIni(text: string): { root: Flat; sections: Array<{ type: string; name: string; values: Flat }> } {
  const root: Flat = {}; const sections: Array<{ type: string; name: string; values: Flat }> = []; let cur = root;
  for (const raw of text.split(/\r?\n/)) {
    // 3MF Slic3r_PE.config writes every line as "; key = value".
    const line = raw.replace(/^;\s*(?=[a-z_0-9]+\s*=)/i, '').trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sec = /^\[([^\]:]+)(?::(.*))?\]$/.exec(line);
    if (sec) { const values: Flat = {}; sections.push({ type: sec[1].trim(), name: (sec[2] ?? '').trim(), values }); cur = values; continue; }
    const eq = line.indexOf('='); if (eq < 0) continue;
    // Multi-line G-code is written as one quoted, escaped string.
    const v = line.slice(eq + 1).trim();
    cur[line.slice(0, eq).trim()] = unescapeIni(v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);
  }
  return { root, sections };
}
const unescapeIni = (v: string) => v.replace(/\\(n|r|t|\\|")/g, (_, c) => ({ n: '\n', r: '', t: '\t', '\\': '\\', '"': '"' }[c as string]!));

const PRUSA_KIND: Record<string, ProfileKind> = { print: 'process', filament: 'filament', printer: 'printer', sla_print: 'process', sla_material: 'filament' };
const ORCA_KIND: Record<string, ProfileKind> = { machine: 'printer', machine_model: 'printer', filament: 'filament', process: 'process', print: 'process' };

interface RawPreset { name: string; kind: ProfileKind | null; source: ProfileSource; inherits: string[]; values: Flat; abstract?: boolean; fileName: string }

/** Classify a flat settings map that came without a declared kind (a single PrusaSlicer .ini or 3MF). */
const guessKinds = (v: Flat): ProfileKind[] => {
  const k: ProfileKind[] = [];
  if ('bed_shape' in v || 'printable_area' in v || 'machine_start_gcode' in v || 'start_gcode' in v) k.push('printer');
  if ('filament_diameter' in v || 'filament_type' in v || 'nozzle_temperature' in v || 'temperature' in v) k.push('filament');
  if ('layer_height' in v && ('perimeters' in v || 'wall_loops' in v || 'fill_density' in v || 'sparse_infill_density' in v)) k.push('process');
  return k;
};

function presetsFromJson(text: string, fileName: string): RawPreset[] {
  const j = JSON.parse(text);
  const list = Array.isArray(j) ? j : [j];
  return list.filter(x => x && typeof x === 'object').map((o: Record<string, unknown>) => {
    const values: Flat = {};
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) values[k] = v.map(x => String(x)); else if (v !== null && typeof v === 'object') continue; else values[k] = String(v);
    }
    const type = String(o.type ?? ''); const inh = String(o.inherits ?? '').trim();
    return { name: String(o.name ?? fileName.replace(/\.[^.]+$/, '')), kind: ORCA_KIND[type] ?? null, source: 'orca' as const, inherits: inh ? [inh] : [], values, abstract: o.instantiation === 'false', fileName };
  });
}

function presetsFromIni(text: string, fileName: string, source: ProfileSource = 'prusa'): RawPreset[] {
  const { root, sections } = parseIni(text); const out: RawPreset[] = [];
  const inh = (v: Flat) => String(v.inherits ?? '').split(';').map(s => s.trim()).filter(Boolean);
  for (const s of sections) {
    const kind = PRUSA_KIND[s.type]; if (!kind) continue;
    out.push({ name: s.name, kind, source, inherits: inh(s.values), values: s.values, abstract: s.name.startsWith('*'), fileName });
  }
  if (!sections.some(s => PRUSA_KIND[s.type]) && Object.keys(root).length) out.push({ name: fileName.replace(/\.[^.]+$/, ''), kind: null, source, inherits: [], values: root, fileName });
  return out;
}

function presetsFrom3mf(bytes: Uint8Array, fileName: string): RawPreset[] {
  const z = unzipSync(bytes); const out: RawPreset[] = [];
  for (const [path, data] of Object.entries(z)) {
    if (!/^Metadata\/.*\.config$/i.test(path)) continue;
    const text = strFromU8(data);
    if (/project_settings\.config$/i.test(path)) { const p = presetsFromJson(text, fileName)[0]; if (p) out.push({ ...p, source: '3mf', kind: null, inherits: [], name: fileName.replace(/\.3mf$/i, '') }); }
    else if (/Slic3r_PE\.config$/i.test(path)) { const p = presetsFromIni(text, fileName, '3mf')[0]; if (p) out.push({ ...p, kind: null, inherits: [], name: fileName.replace(/\.3mf$/i, '') }); }
  }
  return out;
}

/** Read one file (or a zipped preset bundle) into raw presets. */
export function readProfileFile(name: string, data: Uint8Array | string): RawPreset[] {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip && /\.3mf$/i.test(name)) return presetsFrom3mf(bytes, name);
  if (isZip) {
    // Orca/Bambu preset bundles (.orca_printer, .orca_filament, .bbscfg, .bbsflmt, .zip): JSON or INI inside.
    const z = unzipSync(bytes); const out: RawPreset[] = [];
    for (const [p, d] of Object.entries(z)) {
      if (/bundle_structure\.json$/i.test(p)) continue;
      if (/\.json$/i.test(p)) out.push(...presetsFromJson(strFromU8(d), p.split('/').pop()!));
      else if (/\.ini$/i.test(p)) out.push(...presetsFromIni(strFromU8(d), p.split('/').pop()!));
      else if (/\.3mf$/i.test(p)) out.push(...presetsFrom3mf(d, p.split('/').pop()!));
    }
    return out;
  }
  const text = typeof data === 'string' ? data : strFromU8(bytes);
  if (/^\s*[[{]/.test(text) && !/^\s*\[[a-z_]+:/im.test(text.slice(0, 200))) return presetsFromJson(text, name);
  return presetsFromIni(text, name);
}

// ---------------------------------------------------------------- inherits

/**
 * Resolve each preset's inherits chain (parents first, own values last) against the presets in this
 * import plus a library of already-saved settings. Orca names one parent; Prusa may list several,
 * separated by `;`, merged left to right.
 */
export function resolveInherits(presets: RawPreset[], library: Array<{ name: string; kind?: ProfileKind; settings: Flat }> = []): Array<RawPreset & { resolved: Flat; missing: string[] }> {
  // Names are only unique within a kind (a Prusa bundle can have both print:*common* and printer:*common*).
  const k = (kind: ProfileKind | null | undefined, name: string) => `${kind ?? '?'}|${name}`;
  const raw = new Map<string, RawPreset>(); const anyKind = new Map<string, RawPreset>();
  for (const p of presets) { raw.set(k(p.kind, p.name), p); if (!anyKind.has(p.name)) anyKind.set(p.name, p); }
  const lib = new Map<string, Flat>(); for (const l of library) { lib.set(k(l.kind, l.name), l.settings); if (!lib.has(k(null, l.name))) lib.set(k(null, l.name), l.settings); }
  const missing = new Set<string>();
  const resolve = (p: RawPreset, seen: Set<RawPreset>): Flat => {
    if (seen.has(p)) return p.values; // cycle: stop here
    seen.add(p);
    const merged: Flat = {};
    for (const parent of p.inherits) {
      const q = raw.get(k(p.kind, parent)) ?? anyKind.get(parent);
      if (q) { Object.assign(merged, resolve(q, seen)); continue; }
      const l = lib.get(k(p.kind, parent)) ?? lib.get(k(null, parent));
      if (l) Object.assign(merged, l); else missing.add(parent);
    }
    Object.assign(merged, p.values); return merged;
  };
  return presets.filter(p => !p.abstract).map(p => {
    missing.clear(); const resolved = resolve(p, new Set());
    const { inherits: _drop, ...rest } = resolved; void _drop;
    return { ...p, resolved: rest, missing: [...missing] };
  });
}

// ---------------------------------------------------------------- mapping

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PER_EXTRUDER_SPLIT = (key: string) => key !== 'bed_shape' && !/gcode|notes|compatible|inherits|_id$|settings_id/.test(key);
/** First value of a setting: arrays, or Prusa's comma lists for per-extruder values. */
export function val(s: Flat, ...keys: string[]): string | undefined {
  for (const k of keys) {
    let v = first(s[k]); if (v === undefined || v === '' || v === 'nil') continue;
    if (PER_EXTRUDER_SPLIT(k) && /^[^,]+,[^,]+/.test(v) && !/[\n{]/.test(v)) v = v.split(',')[0].trim();
    return v;
  }
  return undefined;
}
export function num(s: Flat, ...keys: string[]): number | undefined {
  const v = val(s, ...keys); if (v === undefined) return undefined; const n = parseFloat(v); return Number.isFinite(n) ? n : undefined;
}
/** A number or a percentage of `of`. */
const numPct = (s: Flat, of: number | undefined, ...keys: string[]) => {
  const v = val(s, ...keys); if (v === undefined) return undefined; const n = parseFloat(v); if (!Number.isFinite(n)) return undefined;
  return /%\s*$/.test(v) ? (of === undefined ? undefined : of * n / 100) : n;
};
const bool = (s: Flat, ...keys: string[]) => { const v = val(s, ...keys); return v === undefined ? undefined : /^(1|true|yes)$/i.test(v); };
const pos = (n: number | undefined) => (n !== undefined && n > 0 ? n : undefined);

const FLAVOR: Record<string, Dialect> = { marlin: 'marlin', marlin2: 'marlin', marlinlegacy: 'marlin', klipper: 'klipper', reprapfirmware: 'reprap', reprap: 'reprap', repetier: 'marlin', smoothie: 'marlin', teacup: 'marlin', makerware: 'marlin', sailfish: 'marlin', mach3: 'linuxcnc', machinekit: 'linuxcnc' };

/** Bed outline points "0x0,250x0,250x210,0x210" (Prusa) or ["0x0","256x0",...] (Orca). */
export function parseBedShape(v: string | string[] | undefined): P2[] {
  const items = Array.isArray(v) ? v : String(v ?? '').split(',');
  return items.map(t => t.trim().split('x').map(parseFloat) as P2).filter(p => p.length === 2 && p.every(Number.isFinite));
}

export function mapPrinter(s: Flat): PrinterSettings {
  const pts = parseBedShape(s.bed_shape ?? s.printable_area);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const min: P2 = pts.length ? [Math.min(...xs), Math.min(...ys)] : [0, 0]; const max: P2 = pts.length ? [Math.max(...xs), Math.max(...ys)] : [220, 220];
  // More than eight outline points on a symmetric shape: a round (delta) bed.
  const circle = pts.length > 8 && Math.abs((max[0] - min[0]) - (max[1] - min[1])) < 1;
  const flavor = (val(s, 'gcode_flavor') ?? '').toLowerCase();
  const height = num(s, 'max_print_height', 'printable_height') ?? 200;
  return {
    bed: [+(max[0] - min[0]).toFixed(3), +(max[1] - min[1]).toFixed(3), height], bedShape: circle ? 'circle' : 'rect', bedMin: min, bedCenter: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
    nozzle: num(s, 'nozzle_diameter'), dialect: FLAVOR[flavor],
    startGcode: val(s, 'machine_start_gcode', 'start_gcode'), endGcode: val(s, 'machine_end_gcode', 'end_gcode'),
    limits: { maxX: pos(num(s, 'machine_max_feedrate_x', 'machine_max_speed_x')), maxY: pos(num(s, 'machine_max_feedrate_y', 'machine_max_speed_y')), maxZ: pos(num(s, 'machine_max_feedrate_z', 'machine_max_speed_z')), maxE: pos(num(s, 'machine_max_feedrate_e', 'machine_max_speed_e')),
      accel: pos(num(s, 'machine_max_acceleration_extruding', 'default_acceleration', 'machine_max_acceleration_x')), travelAccel: pos(num(s, 'machine_max_acceleration_travel', 'travel_acceleration')) },
    minLayer: pos(num(s, 'min_layer_height')), maxLayer: pos(num(s, 'max_layer_height')),
    retract: num(s, 'retract_length', 'retraction_length'), retractSpeed: pos(num(s, 'retract_speed', 'retraction_speed')), zHop: num(s, 'retract_lift', 'z_hop'),
  };
}

export function mapFilament(s: Flat): FilamentSettings {
  const maxFan = num(s, 'max_fan_speed', 'fan_max_speed');
  // Orca stores the plate temperature per plate type; the hot plate (smooth PEI) is the usual one.
  const plate = (val(s, 'curr_bed_type') ?? '').toLowerCase();
  const plateKey = /cool/.test(plate) ? 'cool_plate_temp' : /eng/.test(plate) ? 'eng_plate_temp' : /textured/.test(plate) ? 'textured_plate_temp' : 'hot_plate_temp';
  const bed = num(s, 'bed_temperature', plateKey, 'hot_plate_temp');
  return {
    type: val(s, 'filament_type'), diameter: pos(num(s, 'filament_diameter')), density: pos(num(s, 'filament_density')),
    nozzleTemp: pos(num(s, 'temperature', 'nozzle_temperature')), firstLayerNozzleTemp: pos(num(s, 'first_layer_temperature', 'nozzle_temperature_initial_layer')),
    bedTemp: bed, firstLayerBedTemp: num(s, 'first_layer_bed_temperature', `${plateKey}_initial_layer`, 'hot_plate_temp_initial_layer'),
    fan: maxFan !== undefined ? maxFan / 100 : undefined, fanFirstLayers: num(s, 'disable_fan_first_layers', 'close_fan_the_first_x_layers'),
    maxVolumetric: pos(num(s, 'filament_max_volumetric_speed')),
    retract: num(s, 'filament_retract_length', 'filament_retraction_length'), retractSpeed: pos(num(s, 'filament_retract_speed', 'filament_retraction_speed')), zHop: num(s, 'filament_retract_lift', 'filament_z_hop'),
    startGcode: val(s, 'start_filament_gcode', 'filament_start_gcode'), endGcode: val(s, 'end_filament_gcode', 'filament_end_gcode'),
  };
}

const PATTERN: Record<string, InfillPattern> = { rectilinear: 'lines', line: 'lines', lines: 'lines', alignedrectilinear: 'lines', zigzag: 'lines', monotonic: 'lines', grid: 'grid', triangles: 'grid', stars: 'grid', cubic: 'cubic', adaptivecubic: 'cubic', supportcubic: 'cubic', '3devenly': 'cubic', gyroid: 'gyroid', tpmsd: 'gyroid', lightning: 'lines', honeycomb: 'grid', '3dhoneycomb': 'cubic' };
const SEAM: Record<string, SeamMode> = { aligned: 'aligned', rear: 'rear', back: 'rear', nearest: 'nearest', random: 'random' };

export function mapProcess(s: Flat): ProcessSettings {
  const p: ProcessSettings = {};
  const set = <K extends keyof ProcessSettings>(k: K, v: ProcessSettings[K] | undefined) => { if (v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))) p[k] = v; };
  set('layer', pos(num(s, 'layer_height')));
  set('firstLayer', pos(numPct(s, p.layer, 'first_layer_height', 'initial_layer_print_height')));
  set('walls', num(s, 'perimeters', 'wall_loops'));
  const fill = val(s, 'fill_density', 'sparse_infill_density'); if (fill !== undefined) { const n = parseFloat(fill); if (Number.isFinite(n)) p.infill = /%/.test(fill) || n > 1 ? n / 100 : n; }
  const pat = (val(s, 'fill_pattern', 'sparse_infill_pattern') ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (pat) set('infillPattern', PATTERN[pat] ?? 'lines');
  set('solidLayers', num(s, 'bottom_solid_layers', 'bottom_shell_layers')); set('topLayers', num(s, 'top_solid_layers', 'top_shell_layers'));
  const inner = pos(num(s, 'perimeter_speed', 'inner_wall_speed'));
  set('innerWallSpeed', inner); set('speed', inner ?? pos(num(s, 'infill_speed', 'sparse_infill_speed')));
  set('outerWallSpeed', pos(numPct(s, inner, 'external_perimeter_speed', 'outer_wall_speed')));
  set('infillSpeed', pos(num(s, 'infill_speed', 'sparse_infill_speed')));
  set('solidSpeed', pos(numPct(s, num(s, 'infill_speed', 'sparse_infill_speed'), 'solid_infill_speed', 'internal_solid_infill_speed')));
  set('travel', pos(num(s, 'travel_speed')));
  set('firstLayerSpeed', pos(numPct(s, inner, 'first_layer_speed', 'initial_layer_speed')));
  const seam = (val(s, 'seam_position') ?? '').toLowerCase(); if (seam) set('seam', SEAM[seam]);
  // Ironing: PrusaSlicer `ironing = 1` + ironing_type; Orca `ironing_type` = "no ironing" | top | topmost | solid.
  const ironType = (val(s, 'ironing_type') ?? '').toLowerCase();
  const ironOn = bool(s, 'ironing') ?? (ironType ? !/^no/.test(ironType) : undefined);
  if (ironOn !== undefined) set('ironing', ironOn);
  set('ironingSpeed', pos(num(s, 'ironing_speed')));
  const flow = num(s, 'ironing_flowrate', 'ironing_flow'); if (flow !== undefined) set('ironingFlow', flow > 1 ? flow / 100 : flow);
  set('ironingSpacing', pos(num(s, 'ironing_spacing')));
  // Supports.
  const supOn = bool(s, 'support_material', 'enable_support');
  if (supOn !== undefined) set('supports', supOn ? (bool(s, 'support_material_buildplate_only', 'support_on_build_plate_only') ? 'buildplate' : 'everywhere') : 'none');
  const style = (val(s, 'support_material_style', 'support_type', 'support_style') ?? '').toLowerCase(); if (style) set('supportStyle', /tree|organic/.test(style) ? 'tree' : 'grid');
  // Both slicers measure the threshold from the horizontal, which is how our support step reads `overhang`.
  const thr = num(s, 'support_material_threshold', 'support_threshold_angle'); if (thr) set('overhang', thr);
  const spacing = num(s, 'support_material_spacing', 'support_base_pattern_spacing'); if (spacing !== undefined && spacing >= 0) set('supportDensity', Math.min(1, 0.45 / (spacing + 0.45)));
  // Adhesion.
  const brim = num(s, 'brim_width'); const brimType = (val(s, 'brim_type') ?? '').toLowerCase(); const skirts = num(s, 'skirts', 'skirt_loops');
  if (brim && brim > 0 && !/no_brim/.test(brimType)) { set('adhesion', 'brim'); set('brimWidth', brim); } else if (skirts !== undefined) set('adhesion', skirts > 0 ? 'skirt' : 'none');
  set('maxVolumetric', pos(num(s, 'max_volumetric_speed')));
  set('accel', pos(num(s, 'default_acceleration', 'perimeter_acceleration', 'outer_wall_acceleration')));
  return p;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/** Turn files into saved profiles: resolve inherits, split combined configs into printer/filament/process. */
export function importProfiles(files: Array<{ name: string; data: Uint8Array | string }>, library: SavedProfile[] = []): ImportResult {
  const warnings: string[] = []; const raw: RawPreset[] = [];
  for (const f of files) {
    try { const got = readProfileFile(f.name, f.data); if (!got.length) warnings.push(`${f.name}: no slicer settings found.`); raw.push(...got); }
    catch (e) { warnings.push(`${f.name}: could not be read (${e instanceof Error ? e.message : String(e)}).`); }
  }
  const resolved = resolveInherits(raw, library.map(l => ({ name: l.name, kind: l.kind, settings: l.settings })));
  const profiles: SavedProfile[] = []; const now = Date.now();
  for (const r of resolved) {
    const kinds = r.kind ? [r.kind] : guessKinds(r.resolved);
    if (!kinds.length) { warnings.push(`${r.fileName}: "${r.name}" is not a printer, filament or process preset.`); continue; }
    for (const kind of kinds) {
      const ownName = kinds.length > 1 ? (val(r.resolved, kind === 'printer' ? 'printer_settings_id' : kind === 'filament' ? 'filament_settings_id' : 'print_settings_id') || `${r.name} (${kind})`) : r.name;
      const w = r.missing.map(m => `"${ownName}" inherits from "${m}", which was not in the import. Values it would supply fall back to ours; import that preset too (OrcaSlicer keeps system presets in resources/profiles/<vendor>/).`);
      const p: SavedProfile = { id: `${kind}-${slug(ownName)}-${now.toString(36)}`, name: ownName, kind, source: r.source, fileName: r.fileName, importedAt: now, settings: r.resolved, warnings: w };
      if (kind === 'printer') p.printer = mapPrinter(r.resolved);
      if (kind === 'filament') p.filament = mapFilament(r.resolved);
      if (kind === 'process') p.process = mapProcess(r.resolved);
      profiles.push(p);
    }
  }
  return { profiles, warnings };
}

// ---------------------------------------------------------------- applying profiles

export interface Applied { fdm: Partial<FdmOptions>; dialect?: Dialect; bed?: [number, number, number]; bedCenter?: P2; bedShape?: 'rect' | 'circle'; nozzle?: number; limits?: PrinterSettings['limits']; filamentType?: string }

/** Combine selected profiles into slicer options. Later layers win: printer, then filament, then process. */
export function applyProfiles(sel: { printer?: SavedProfile | null; filament?: SavedProfile | null; process?: SavedProfile | null }): Applied {
  const fdm: Partial<FdmOptions> = {}; const out: Applied = { fdm };
  const pr = sel.printer?.printer, fi = sel.filament?.filament, ps = sel.process?.process;
  const put = <K extends keyof FdmOptions>(k: K, v: FdmOptions[K] | undefined) => { if (v !== undefined) fdm[k] = v; };
  if (pr) {
    Object.assign(out, { dialect: pr.dialect, bed: pr.bed, bedCenter: pr.bedCenter, bedShape: pr.bedShape, nozzle: pr.nozzle, limits: pr.limits });
    put('nozzle', pr.nozzle); put('retract', pr.retract); put('retractSpeed', pr.retractSpeed); put('zHop', pr.zHop); put('accel', pr.limits.accel); put('travelAccel', pr.limits.travelAccel);
    if (pr.minLayer || pr.maxLayer) put('adaptive', { min: pr.minLayer, max: pr.maxLayer });
  }
  if (fi) {
    out.filamentType = fi.type;
    put('filament', fi.diameter); put('density', fi.density); put('nozzleTemp', fi.nozzleTemp); put('bedTemp', fi.bedTemp);
    put('firstLayerNozzleTemp', fi.firstLayerNozzleTemp); put('firstLayerBedTemp', fi.firstLayerBedTemp); put('fan', fi.fan); put('fanFirstLayers', fi.fanFirstLayers);
    put('maxVolumetric', fi.maxVolumetric); put('retract', fi.retract); put('retractSpeed', fi.retractSpeed); put('zHop', fi.zHop);
  }
  if (ps) {
    const { adaptive, maxVolumetric, accel, ...rest } = ps;
    Object.assign(fdm, rest);
    if (maxVolumetric !== undefined && (fdm.maxVolumetric === undefined || maxVolumetric < fdm.maxVolumetric)) fdm.maxVolumetric = maxVolumetric;
    if (accel !== undefined) fdm.accel = Math.min(accel, fdm.accel ?? Infinity);
    if (adaptive) fdm.adaptive = { ...(typeof fdm.adaptive === 'object' ? fdm.adaptive : {}), ...(typeof adaptive === 'object' ? adaptive : {}) };
  }
  return out;
}

// ---------------------------------------------------------------- custom G-code templates

type Value = number | string | boolean | Value[];
export type Vars = Record<string, Value>;

/** Settings as template variables: numbers where they parse, per-extruder lists as arrays. */
export function settingsVars(s: Flat): Vars {
  const v: Vars = {};
  const conv = (x: string): Value => { const t = x.trim(); if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t); if (/^(true|false)$/.test(t)) return t === 'true'; return x; };
  for (const [k, x] of Object.entries(s)) {
    if (Array.isArray(x)) v[k] = x.map(conv);
    else if (PER_EXTRUDER_SPLIT(k) && /^[^,\n{]+(,[^,\n{]+)+$/.test(x) && !/x/.test(x)) v[k] = x.split(',').map(conv);
    else v[k] = conv(x);
  }
  return v;
}

/** Our own values under the names both slicers' start G-code uses. */
export function jobVars(o: FdmOptions, extra: { bedMin?: P2; bedMax?: P2; firstLayerMin?: P2; firstLayerMax?: P2; layers?: number; maxZ?: number; filamentType?: string } = {}): Vars {
  const nt = o.nozzleTemp, bt = o.bedTemp, nt0 = o.firstLayerNozzleTemp ?? nt, bt0 = o.firstLayerBedTemp ?? bt;
  const fmin = extra.firstLayerMin ?? [0, 0], fmax = extra.firstLayerMax ?? [0, 0];
  return {
    temperature: [nt], nozzle_temperature: [nt], first_layer_temperature: [nt0], nozzle_temperature_initial_layer: [nt0],
    bed_temperature: [bt], first_layer_bed_temperature: [bt0], bed_temperature_initial_layer: [bt0], bed_temperature_initial_layer_single: bt0, hot_plate_temp_initial_layer: [bt0], hot_plate_temp: [bt],
    initial_extruder: 0, initial_tool: 0, current_extruder: 0, current_object_idx: 0, layer_num: 0, layer_z: o.firstLayer ?? o.layer,
    first_layer_height: o.firstLayer ?? o.layer, initial_layer_print_height: o.firstLayer ?? o.layer, layer_height: o.layer, nozzle_diameter: [o.nozzle], filament_diameter: [o.filament],
    total_layer_count: extra.layers ?? 0, max_layer_z: extra.maxZ ?? 0, total_toolchanges: 0, has_wipe_tower: false, is_extruder_used: [true], ...(extra.filamentType ? { filament_type: [extra.filamentType] } : {}),
    print_bed_min: extra.bedMin ?? [0, 0], print_bed_max: extra.bedMax ?? [0, 0], first_layer_print_min: fmin, first_layer_print_max: fmax, first_layer_print_size: [fmax[0] - fmin[0], fmax[1] - fmin[1]],
    retract_length: [o.retract ?? 0], retraction_length: [o.retract ?? 0],
  };
}

const MARK = '\u0001';
class Unresolved extends Error {}

/** A small expression reader for the `{...}` macro syntax: numbers, strings, variables with [index], + - * /, comparisons, and/or/not, min/max/int/round/abs/is_nil. */
function evalExpr(src: string, vars: Vars): Value {
  const toks = src.match(/\s*(?:(\d+\.?\d*|\.\d+)|("(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z_0-9]*)|(==|!=|<=|>=|&&|\|\||[-+*/%<>()[\],!]))/g)?.map(t => t.trim()) ?? [];
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Unresolved(src);
  let i = 0; const peek = () => toks[i]; const next = () => toks[i++];
  const n = (v: Value) => { const x = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : parseFloat(String(v)); if (!Number.isFinite(x)) throw new Unresolved(src); return x; };
  const prim = (): Value => {
    const t = next(); if (t === undefined) throw new Unresolved(src);
    if (t === '(') { const v = or(); if (next() !== ')') throw new Unresolved(src); return v; }
    if (t === '-') return -n(prim()); if (t === '!' || t === 'not') return !truthy(prim());
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (t.startsWith('"')) return JSON.parse(t);
    if (t === 'true' || t === 'false') return t === 'true';
    if (peek() === '(') {
      next(); const args: Value[] = []; if (peek() !== ')') { args.push(or()); while (peek() === ',') { next(); args.push(or()); } } if (next() !== ')') throw new Unresolved(src);
      if (t === 'is_nil') return false;
      const xs = args.map(n);
      if (t === 'min') return Math.min(...xs); if (t === 'max') return Math.max(...xs); if (t === 'int') return Math.trunc(xs[0]); if (t === 'round') return Math.round(xs[0]); if (t === 'abs') return Math.abs(xs[0]);
      throw new Unresolved(src);
    }
    if (!(t in vars)) throw new Unresolved(src);
    let v = vars[t];
    if (peek() === '[') { next(); const idx = n(or()); if (next() !== ']') throw new Unresolved(src); if (!Array.isArray(v)) { if (idx !== 0) throw new Unresolved(src); } else { if (v[idx] === undefined) throw new Unresolved(src); v = v[idx]; } }
    return v;
  };
  const mul = (): Value => { let v = prim(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next(); const r = n(prim()); v = op === '*' ? n(v) * r : op === '/' ? n(v) / r : n(v) % r; } return v; };
  const add = (): Value => { let v = mul(); while (peek() === '+' || peek() === '-') { const op = next(); const r = mul(); v = op === '+' ? (typeof v === 'string' || typeof r === 'string' ? `${v}${r}` : n(v) + n(r)) : n(v) - n(r); } return v; };
  const cmp = (): Value => {
    let v = add();
    while (['==', '!=', '<', '>', '<=', '>='].includes(peek() ?? '')) {
      const op = next(); const r = add(); const numeric = typeof v !== 'string' && typeof r !== 'string';
      const a = numeric ? n(v) : String(v), b = numeric ? n(r) : String(r);
      v = op === '==' ? a === b : op === '!=' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    }
    return v;
  };
  const and = (): Value => { let v = cmp(); while (peek() === 'and' || peek() === '&&') { next(); const r = cmp(); v = truthy(v) && truthy(r); } return v; };
  const or = (): Value => { let v = and(); while (peek() === 'or' || peek() === '||') { next(); const r = and(); v = truthy(v) || truthy(r); } return v; };
  const v = or(); if (i !== toks.length) throw new Unresolved(src); return v;
}
const truthy = (v: Value) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v !== '' && v !== '0' : !!v);
const fmt = (v: Value): string => (Array.isArray(v) ? fmt(v[0]) : typeof v === 'number' ? String(+v.toFixed(5)) : typeof v === 'boolean' ? (v ? '1' : '0') : v);

export interface Rendered { text: string; skipped: string[] }

/**
 * Fill a custom G-code template. Supports [var], [var_0], {var}, {var[i]}, {expressions} and
 * {if}/{elsif}/{else}/{endif}. Anything it cannot resolve is not guessed: the line is commented out
 * (a conditional block with an unreadable condition is commented out whole) and listed in `skipped`.
 */
export function renderGcode(template: string, vars: Vars): Rendered {
  const skipped: string[] = [];
  // Legacy [var] and [var_N], outside {…} blocks (where [i] is an index).
  const legacy = (s: string) => s.replace(/\[([A-Za-z_][A-Za-z_0-9]*?)(?:_(\d+))?\]/g, (m, name: string, idx?: string) => {
    const whole = idx !== undefined ? `${name}_${idx}` : name;
    if (whole in vars) return fmt(vars[whole]);
    if (name in vars) { const v = vars[name]; return fmt(idx !== undefined && Array.isArray(v) ? v[+idx] ?? v[0] : v); }
    return `${MARK}${m}${MARK}`;
  });
  // {…} blocks with control flow.
  const parts = template.split(/(\{[^{}]*\})/g); const out: string[] = []; const stack: Array<{ taking: boolean; done: boolean; broken: boolean; parentTaking: boolean }> = [];
  const taking = () => stack.every(s => s.taking && !s.broken);
  for (const part of parts) {
    const m = /^\{\s*(if|elsif|else|endif)\b\s*(.*?)\s*\}$/.exec(part);
    if (m) {
      const kw = m[1];
      if (kw === 'if') {
        const parentTaking = taking(); let cond = false, broken = false;
        try { cond = truthy(evalExpr(m[2], vars)); } catch { broken = true; }
        if (broken && parentTaking) out.push(`${MARK}conditional block ${part}${MARK}`);
        stack.push({ taking: cond, done: cond, broken, parentTaking });
      } else if (kw === 'elsif' || kw === 'else') {
        const top = stack[stack.length - 1]; if (!top) { out.push(`${MARK}${part}${MARK}`); continue; }
        if (top.broken) continue;
        if (top.done) top.taking = false;
        else if (kw === 'else') { top.taking = true; top.done = true; }
        else { try { top.taking = truthy(evalExpr(m[2], vars)); top.done = top.taking; } catch { top.broken = true; if (top.parentTaking) out.push(`${MARK}conditional block ${part}${MARK}`); } }
      } else stack.pop();
      continue;
    }
    if (!taking()) continue;
    if (/^\{.*\}$/s.test(part)) {
      try { out.push(fmt(evalExpr(part.slice(1, -1).trim(), vars))); } catch { out.push(`${MARK}${part}${MARK}`); }
    } else out.push(legacy(part));
  }
  const t = out.join('');
  const lines = t.split(/\r?\n/).map(line => {
    if (!line.includes(MARK)) return line;
    const clean = line.replace(new RegExp(MARK, 'g'), '');
    skipped.push(clean.trim()); return `; PLAJAH SKIPPED (review: placeholder not resolved): ${clean.replace(/^;\s*/, '')}`;
  });
  return { text: lines.join('\n'), skipped };
}

// ---------------------------------------------------------------- saved profiles (local, per user)

export interface ProfileStore { get(key: string): string | null; set(key: string, v: string): void }
const KEY = (user: string) => `plajah.fab.profiles.${user || 'local'}`;
export function loadProfiles(st: ProfileStore, user = ''): SavedProfile[] {
  try { const v = JSON.parse(st.get(KEY(user)) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveProfiles(st: ProfileStore, list: SavedProfile[], user = ''): boolean {
  try { st.set(KEY(user), JSON.stringify(list)); return true; } catch { return false; }
}
/** Add new profiles, replacing older ones of the same kind and name. */
export const mergeProfiles = (old: SavedProfile[], add: SavedProfile[]) => [...old.filter(o => !add.some(a => a.kind === o.kind && a.name === o.name)), ...add];

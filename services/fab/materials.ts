// Filament and resin starting points. Temperatures are typical ranges from public datasheets for
// generic grades; a spool's own label always wins. Densities are g/cm³.

export interface Filament {
  id: string; name: string; nozzle: number; bed: number; fan: number; density: number;
  retract: number; retractSpeed: number; speed: number; enclosure?: boolean; hardenedNozzle?: boolean; notes: string;
}

export const FILAMENTS: Filament[] = [
  { id: 'pla', name: 'PLA', nozzle: 210, bed: 60, fan: 1, density: 1.24, retract: 0.8, retractSpeed: 35, speed: 60, notes: 'Easiest to print; softens near 55 °C, so not for cars or dishwashers.' },
  { id: 'pla-plus', name: 'PLA+ / tough PLA', nozzle: 220, bed: 60, fan: 1, density: 1.23, retract: 0.8, retractSpeed: 35, speed: 60, notes: 'Less brittle than plain PLA.' },
  { id: 'petg', name: 'PETG', nozzle: 240, bed: 80, fan: 0.4, density: 1.27, retract: 1.2, retractSpeed: 30, speed: 50, notes: 'Tough, food-contact grades exist; strings if retraction is too short.' },
  { id: 'abs', name: 'ABS', nozzle: 245, bed: 100, fan: 0, density: 1.04, retract: 0.8, retractSpeed: 35, speed: 50, enclosure: true, notes: 'Needs an enclosure; ventilate (styrene fumes).' },
  { id: 'asa', name: 'ASA', nozzle: 250, bed: 100, fan: 0.2, density: 1.07, retract: 0.8, retractSpeed: 35, speed: 50, enclosure: true, notes: 'Outdoor/UV-stable ABS cousin; enclosure and ventilation.' },
  { id: 'tpu', name: 'TPU 95A (flexible)', nozzle: 225, bed: 50, fan: 0.6, density: 1.21, retract: 0, retractSpeed: 20, speed: 25, notes: 'Print slowly; direct-drive extruders work best; retraction off.' },
  { id: 'nylon', name: 'Nylon (PA6/PA12)', nozzle: 260, bed: 80, fan: 0, density: 1.08, retract: 1, retractSpeed: 35, speed: 45, enclosure: true, notes: 'Dry it first (absorbs water from air); very tough.' },
  { id: 'pc', name: 'Polycarbonate', nozzle: 280, bed: 110, fan: 0, density: 1.2, retract: 1, retractSpeed: 35, speed: 40, enclosure: true, notes: 'All-metal hotend and enclosure needed.' },
  { id: 'pla-cf', name: 'PLA-CF (carbon filled)', nozzle: 220, bed: 60, fan: 1, density: 1.3, retract: 0.8, retractSpeed: 35, speed: 50, hardenedNozzle: true, notes: 'Abrasive: use a hardened-steel or ruby nozzle, 0.4 mm or larger.' },
  { id: 'pa-cf', name: 'PA-CF (carbon nylon)', nozzle: 280, bed: 90, fan: 0, density: 1.2, retract: 1, retractSpeed: 35, speed: 40, enclosure: true, hardenedNozzle: true, notes: 'Stiff engineering parts; hardened nozzle, dry filament, enclosure.' },
  { id: 'bound-316l', name: 'Bound metal 316L', nozzle: 235, bed: 100, fan: 0, density: 5.0, retract: 0, retractSpeed: 20, speed: 25, hardenedNozzle: true, notes: 'Green part must be debound and sintered (about 16-20% shrink); export is pre-scaled.' },
];
export const filamentById = (id: string) => FILAMENTS.find(f => f.id === id);

/**
 * Upper ends of the usual print-temperature ranges for generic grades, from public datasheets
 * (°C). Above these a filament degrades and fumes; a spool's own label can allow more.
 * Order matters: the first match wins (PETG before PET, PLA before PA).
 */
export const MATERIAL_LIMITS: Array<{ match: RegExp; name: string; nozzle: number; bed: number }> = [
  { match: /tpu|tpe|flex/i, name: 'TPU', nozzle: 250, bed: 70 },
  { match: /pla/i, name: 'PLA', nozzle: 240, bed: 70 },
  { match: /petg|pet|pctg/i, name: 'PETG', nozzle: 265, bed: 90 },
  { match: /asa/i, name: 'ASA', nozzle: 275, bed: 115 },
  { match: /abs|hips/i, name: 'ABS', nozzle: 270, bed: 115 },
  { match: /\bpa\b|pa\d|pa-|nylon/i, name: 'Nylon', nozzle: 300, bed: 110 },
  { match: /\bpc\b|polycarb/i, name: 'PC', nozzle: 310, bed: 125 },
  { match: /\bpp\b|polyprop/i, name: 'PP', nozzle: 260, bed: 110 },
  { match: /pva|bvoh/i, name: 'PVA', nozzle: 225, bed: 65 },
];
export const DEFAULT_LIMIT = { name: 'unknown filament', nozzle: 300, bed: 120 };
export const materialLimit = (type = '') => MATERIAL_LIMITS.find(m => m.match.test(type)) ?? DEFAULT_LIMIT;

export interface Resin { id: string; name: string; exposure: number; bottomExposure: number; bottomLayers: number; density: number; notes: string }
export const RESINS: Resin[] = [
  { id: 'standard', name: 'Standard resin', exposure: 2.5, bottomExposure: 25, bottomLayers: 5, density: 1.1, notes: 'Exposure is printer-specific; run an exposure test (e.g. a calibration matrix) once per bottle.' },
  { id: 'abs-like', name: 'ABS-like / tough', exposure: 3, bottomExposure: 30, bottomLayers: 5, density: 1.12, notes: 'Less brittle; slightly longer exposure.' },
  { id: 'water-wash', name: 'Water-washable', exposure: 2.5, bottomExposure: 25, bottomLayers: 5, density: 1.1, notes: 'Wash water is still resin waste: cure it in sunlight before disposal.' },
  { id: 'castable', name: 'Castable (jewellery)', exposure: 4, bottomExposure: 40, bottomLayers: 6, density: 1.1, notes: 'Burns out cleanly for lost-wax casting.' },
  { id: 'dental-model', name: 'Model resin (dental/engineering)', exposure: 2.2, bottomExposure: 22, bottomLayers: 5, density: 1.15, notes: 'High accuracy; not biocompatible unless the bottle says so.' },
];
export const resinById = (id: string) => RESINS.find(r => r.id === id);

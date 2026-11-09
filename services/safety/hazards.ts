// Safety first: hazards for a design at every stage, from the first idea to selling it. Written in
// our own words; citations point at the public rule so makers can read the source. These are
// prompts to design safely, not a certification or a full risk assessment. A critical hazard has
// to be acknowledged before the design can be exported, added to a document or sent to a machine.

import type { Circuit } from '../elec/circuit';
import { parseSi } from '../elec/components';
import { materialLimit } from '../fab/materials';

export type Stage = 'idea' | 'schematic' | 'enclosure' | 'build' | 'make' | 'source' | 'sell';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export interface Hazard { id: string; stage: Stage; severity: Severity; title: string; why: string; mitigate: string[]; cite?: string; ack?: boolean; /** Cannot be acknowledged away: the design must change. */ block?: boolean }

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];
export const sortHazards = (h: Hazard[]) => [...h].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
export const needsAck = (h: Hazard[]) => h.filter(x => x.ack || x.block || x.severity === 'critical');
/** Hazards still holding up export: blocked ones always, the rest until acknowledged. */
export const openHazards = (h: Hazard[], acked: string[]) => needsAck(h).filter(x => x.block || !acked.includes(x.id));

export interface DesignContext { circuit?: Circuit; recipe?: string; toy?: boolean; enclosureMaterial?: string; wearable?: boolean; selling?: boolean; maxSurfaceC?: number }

/** Hazards from the parts and the kind of product. */
export function designHazards(ctx: DesignContext): Hazard[] {
  const out: Hazard[] = []; const parts = ctx.circuit?.parts ?? []; const has = (k: string) => parts.some(p => p.kind === k);
  const add = (h: Hazard) => { if (!out.some(x => x.id === h.id)) out.push(h); };
  if (has('mains') || has('acdc')) add({ id: 'mains-shock', stage: 'schematic', severity: 'critical', ack: true, title: 'Mains voltage: shock and fire', why: '120/230 V AC can kill, and a fault can start a fire inside the product or the wall.',
    mitigate: ['Use a certified, encapsulated AC-DC module; never a capacitive "transformerless" dropper.', 'Fuse the line conductor; strain-relieve the cord; keep 6 mm or more between mains and low-voltage copper.', 'Enclose every mains part so a finger (or a test probe) cannot reach it; use flame-rated (UL 94 V-0) material.', 'Never work on it plugged in. Have it tested by an accredited lab (NRTL / notified body) before anyone else uses it.'], cite: '29 CFR 1910.303; UL/IEC 62368-1; Directive 2014/35/EU' });
  if (has('coincell')) add({ id: 'coin-ingestion', stage: 'idea', severity: 'critical', ack: true, title: 'Button / coin battery: ingestion can kill a child', why: 'A swallowed coin cell can burn through a child\'s oesophagus in about two hours.',
    mitigate: ['Battery door needs a tool (screw) or two independent simultaneous movements to open.', 'Warnings on product, packaging and instructions; child-resistant packaging for spare cells.', 'Prefer AAA cells or a rechargeable pack with no loose cells.'], cite: "16 CFR part 1263 (Reese's Law); ANSI/UL 4200A" });
  if (has('battery')) {
    const v = Math.max(...parts.filter(p => p.kind === 'battery').map(p => parseSi(p.params.V ?? 9)));
    add({ id: 'battery-short', stage: 'schematic', severity: 'high', title: 'Battery short circuit and leakage', why: 'A shorted battery can overheat, leak or ignite; reversed cells leak.', mitigate: ['Add a fuse or resettable PTC at the battery.', 'Polarised holder; insulate every exposed terminal; no metal objects in the battery bay.', `Size wire for the fault current (${v} V pack).`], cite: 'UL 2054; IEC 62133 (rechargeable)' });
    add({ id: 'li-ion', stage: 'idea', severity: 'high', title: 'If you switch to lithium-ion', why: 'Li-ion cells store a lot of energy: overcharge, deep discharge or puncture causes thermal runaway (fire that re-ignites).',
      mitigate: ['Only cells with a protection circuit (BMS) and a matched charger IC; never bare 18650s from unknown sellers (counterfeits are common).', 'Mechanically protect the pack from crushing and puncture; no charging unattended in early prototypes.', 'Shipping Li-ion has its own rules (UN 38.3 test summary).'], cite: 'IEC 62133-2; UL 1642; UN 38.3' });
  }
  if (has('reg7805') || has('nmos') || has('acdc') || ctx.recipe === 'charger') add({ id: 'hot-surface', stage: 'enclosure', severity: 'medium', title: 'Hot parts and burn risk', why: 'Regulators, MOSFETs and power modules can reach 60-100 °C; plastics soften (PLA near 55 °C) and touchable surfaces above about 48 °C can burn.',
    mitigate: ['Check the Thermal results in Checks; add heatsinks or switch to a buck converter.', 'Vent slots above hot parts; keep them off the case wall.', 'Use PETG, ASA, PC or metal near heat. Not PLA.'], cite: 'IEC 62368-1 Table 38 (touch temperatures)' });
  if (has('esp32') || has('rpi') || parts.some(p => p.kind === 'pico' && /W$/.test(String(p.params.variant ?? '')))) {
    add({ id: 'rf-exposure', stage: 'schematic', severity: 'low', title: 'Radio near the body', why: 'Wi-Fi/Bluetooth modules are certified for a minimum distance (often 20 cm); worn or handheld use can need a separate RF-exposure evaluation.', mitigate: ['Keep the antenna 20 cm from people unless the module grant covers closer use.', 'For wearables, check the module\'s SAR / exposure conditions.'], cite: '47 CFR 1.1310, 2.1091, 2.1093' });
    add({ id: 'iot-security', stage: 'sell', severity: 'high', title: 'Connected-device security', why: 'A hacked device can be used against its owner (cameras, locks) or the network.', mitigate: ['No shared default passwords: unique per device or set at first use.', 'Signed updates, a way to report vulnerabilities, and a stated support period.', 'Store Wi-Fi credentials encrypted; turn off debug ports in production.'], cite: 'Cal. Civ. Code §1798.91.04; Delegated Reg. (EU) 2022/30; UK PSTI Act 2022' });
  }
  if (has('rpi') || has('pico') || has('esp32') || has('nano')) add({ id: 'gpio-damage', stage: 'schematic', severity: 'low', title: 'Board damage from wiring mistakes', why: '5 V into a 3.3 V pin, or a motor straight on a GPIO, destroys the board and can overheat.', mitigate: ['3.3 V logic only on Pi, Pico and ESP32 pins.', 'Switch loads through a transistor or MOSFET, with a flyback diode on coils and motors.'] });
  if (has('speaker') || has('amp')) add({ id: 'hearing', stage: 'idea', severity: 'low', title: 'Loud sound', why: 'Headphone outputs above about 85 dB(A) for long periods damage hearing; small speakers rarely do but headphone jacks can.', mitigate: ['If you add a headphone output, limit its maximum level.', 'Never connect the bridged amp outputs to ground (instant amplifier damage).'], cite: 'EN 50332 (headphone levels)' });
  if (has('ledstrip') || parts.filter(p => p.kind === 'led').length >= 6) add({ id: 'led-photobio', stage: 'idea', severity: 'low', title: 'Very bright LEDs', why: 'High-power or blue-rich LEDs viewed up close can cause glare and eye strain.', mitigate: ['Use a diffuser; avoid exposing bare high-power LEDs at eye level.'], cite: 'IEC 62471 (photobiological safety)' });
  if (ctx.recipe === 'guitar') add({ id: 'guitar-ground', stage: 'build', severity: 'medium', title: 'Grounding and amplifier faults', why: 'The strings are grounded through the bridge; a faulty, old or modified amp can put voltage on them.', mitigate: ['Ground the bridge to the jack sleeve as drawn; shield the cavity.', 'Only use amps in good repair; never "lift" an amp\'s earth pin.'] });
  if (ctx.toy) {
    add({ id: 'small-parts', stage: 'idea', severity: 'critical', ack: true, title: 'Children\'s product: choking and small parts', why: 'Parts that fit the small-parts cylinder are banned in products for children under 3 and need warnings for ages 3-6.', mitigate: ['Every part survives the use-and-abuse tests attached (torque, tension, drop).', 'No accessible small parts, magnets or button batteries; secure seams on plush.', 'Third-party testing and a Children\'s Product Certificate before sale in the US.'], cite: '16 CFR part 1501; 16 CFR part 1250 (ASTM F963); 15 U.S.C. 2063 (CPC)' });
    add({ id: 'magnets', stage: 'idea', severity: 'high', title: 'Magnets in children\'s products', why: 'Two swallowed strong magnets attract through intestine walls and cause perforation.', mitigate: ['Avoid loose or loosely held magnets; fully enclose and test any magnet.'], cite: 'ASTM F963 §4.38; 16 CFR part 1262' });
  }
  if (ctx.selling) add({ id: 'sell-ready', stage: 'sell', severity: 'high', title: 'Before you sell', why: 'Selling makes you the manufacturer in law: you carry product liability and must meet labelling, certification and recall duties.', mitigate: ['Get the required tests and declarations (see Checks › Regulatory).', 'Keep a technical file, a batch/date code on each unit and a list of buyers to support a recall.', 'Consider product liability insurance.'], cite: '15 U.S.C. 2064(b) (reporting); Regulation (EU) 2023/988 (GPSR)' });
  add({ id: 'soldering', stage: 'build', severity: 'low', title: 'Soldering', why: 'Solder fumes (flux) irritate lungs; leaded solder is toxic if ingested; irons run at 350 °C.', mitigate: ['Fume extraction or a fan pulling fumes away; wash hands after; lead-free solder for products sold in the EU.', 'Safety glasses when clipping leads.'] });
  return sortHazards(out);
}

/** Hazards of turning the schematic into a printed circuit board. Critical ones gate the Gerber download. */
export function pcbHazards(c?: Circuit): Hazard[] {
  const out: Hazard[] = []; const parts = c?.parts ?? []; const has = (k: string) => parts.some(p => p.kind === k);
  if (has('acdc') || has('mains')) out.push({ id: 'pcb-mains-creepage', stage: 'make', severity: 'critical', ack: true, title: 'Mains on the board: creepage and clearance',
    why: 'Copper carrying mains must stay far enough from low-voltage copper that a surge, dust or damp cannot arc across the board to parts a person can touch.',
    mitigate: ['The router keeps 6.0 mm between mains and low-voltage copper (above the reinforced-insulation creepage for 250 V, pollution degree 2) and 2.5 mm line to neutral; do not move tracks closer by hand.', 'Mill a slot in the board between the mains and low-voltage sides of the module if you need more creepage.', 'No vias, test points or ground pour in the mains area; keep the module\'s mains pins on the board edge nearest the inlet.', 'A test lab still has to confirm insulation (hi-pot) before anyone else uses it.'],
    cite: 'IEC 62368-1:2018 §5.4.2 (clearances), §5.4.3 (creepage distances); UL 62368-1' });
  if (has('battery') || has('coincell')) {
    const fused = parts.some(p => p.kind === 'fuse');
    out.push({ id: 'pcb-battery-protect', stage: 'make', severity: fused ? 'medium' : 'high', title: 'Battery protection on the board',
      why: 'A board short (a solder bridge, a scratched track, a stray screw) across a battery dumps its full current into copper that was sized for milliamps.',
      mitigate: [fused ? 'Keep the fuse as close to the battery connector as the layout allows.' : 'Add a fuse or resettable PTC right at the battery connector before the board goes to fab.', 'Polarised battery connector so the pack cannot plug in backwards (or a series diode / P-MOSFET for reverse protection).', 'Keep battery + and − tracks apart and away from mounting holes and screws.', 'For lithium cells, a protection IC (BMS) with over-current, over-discharge and over-charge cut-off.'],
      cite: 'IEC 62368-1 Annex M (batteries); IEC 62133-2; UL 2054' });
  }
  return sortHazards(out);
}

/** Hazards of running a machine or process. */
export function processHazards(processId: string, material = ''): Hazard[] {
  const out: Hazard[] = []; const m = material.toLowerCase();
  const add = (h: Omit<Hazard, 'stage'>) => out.push({ stage: 'make', ...h });
  if (processId.startsWith('laser')) {
    add({ id: 'laser-fire', severity: 'critical', ack: true, title: 'Laser cutting starts fires', why: 'Wood, card and acrylic can ignite under the beam; most laser fires happen when the machine is left running.', mitigate: ['Never leave it running unattended; keep a CO₂ extinguisher beside it.', 'Air assist on; clean the honeycomb and lens regularly.'] });
    add({ id: 'laser-eyes', severity: 'high', title: 'Laser radiation', why: 'Open-frame diode lasers are Class 4: direct or reflected light can blind instantly.', mitigate: ['Wear goggles rated for the exact wavelength (OD 5+), or use an enclosed Class 1 machine.', 'Interlocked lid on enclosed machines: never defeat it.'], cite: '21 CFR 1040.10; IEC 60825-1' });
    add({ id: 'laser-fumes', severity: /pvc|vinyl|pc|polycarb|abs/.test(m) ? 'critical' : 'high', ack: /pvc|vinyl/.test(m), title: 'Fumes', why: /pvc|vinyl/.test(m) ? 'PVC and vinyl release chlorine and hydrochloric acid: toxic and destroys the machine.' : 'Cutting releases smoke and particles; MDF releases formaldehyde.', mitigate: ['Vent outdoors or through a filter rated for the material.', 'Never cut PVC, vinyl, or anything you cannot identify.'] });
  }
  if (processId === 'router' || processId === 'mill3' || processId === 'mill5') {
    add({ id: 'cnc-entangle', severity: 'high', title: 'Spinning cutters and flying chips', why: 'Cutters at 10,000-24,000 rpm grab loose clothing, hair and gloves; broken bits fly.', mitigate: ['Eye and hearing protection; no gloves, loose sleeves or hanging hair near the spindle.', 'Clamp the work and use tabs so parts cannot fling free; know where the emergency stop is.'] });
    add({ id: 'wood-dust', severity: 'medium', title: 'Dust', why: 'Wood dust (hardwoods especially) is a respiratory sensitiser and a carcinogen; fine dust can explode in a closed space.', mitigate: ['Dust collection at the cutter plus a P2/N95 mask; avoid sweeping, vacuum instead.'], cite: 'IARC Group 1 (wood dust)' });
  }
  if (processId === 'lathe') add({ id: 'lathe-entangle', severity: 'critical', ack: true, title: 'Lathe entanglement', why: 'A rotating chuck or workpiece pulls in gloves, sleeves and hair in a fraction of a second.', mitigate: ['No gloves, jewellery or loose clothing at a running lathe; tie hair back.', 'Remove the chuck key every time; guard closed; know the emergency stop.'] });
  if (processId === 'plasma') add({ id: 'plasma', severity: 'high', title: 'Plasma arc, fumes and fire', why: 'The arc emits UV that burns eyes and skin; galvanised steel fumes cause metal fume fever.', mitigate: ['Shade 5-8 lens or an enclosed table; gloves and long sleeves.', 'Fume extraction; never cut galvanised or coated steel without it; fire extinguisher nearby.'] });
  if (processId === 'waterjet') add({ id: 'waterjet', severity: 'high', title: 'High-pressure water', why: 'A waterjet stream at 4,000 bar cuts flesh and injects water/abrasive under the skin.', mitigate: ['Never put any part of your body near the jet; treat any injection injury as an emergency.'] });
  if (processId === 'press-brake') add({ id: 'press-brake', severity: 'critical', ack: true, title: 'Crush and amputation', why: 'Press brakes close with tons of force; fingers between punch and die are crushed.', mitigate: ['Guards or light curtains working; two-hand or foot control; never reach into the die area.'], cite: '29 CFR 1910.212' });
  if (processId === 'fdm' || processId === 'bound-metal') {
    add({ id: 'printer-fire', severity: 'medium', title: 'Printer fire', why: 'A loose heater or thermistor without thermal-runaway protection can overheat.', mitigate: ['Confirm thermal-runaway protection is enabled in firmware; smoke alarm above the printer; do not print unattended on new machines.'] });
    if (/abs|asa|nylon|pc/.test(m)) add({ id: 'printer-voc', severity: 'medium', title: 'Fumes and ultrafine particles', why: 'ABS, ASA, nylon and PC release styrene/VOCs and ultrafine particles while printing.', mitigate: ['Enclosure with filtration or vented outdoors; not in a bedroom.'] });
  }
  if (processId === 'resin') add({ id: 'resin', severity: 'high', title: 'Liquid resin and solvent', why: 'Uncured resin is a skin and eye sensitiser (allergies can become permanent); IPA is flammable.', mitigate: ['Nitrile gloves and glasses; ventilate; cure waste before disposal.', 'Keep IPA away from flames and heaters.'] });
  if (processId === 'lpbf' || processId === 'ebm' || processId === 'binder-jet') add({ id: 'metal-powder', severity: 'critical', ack: true, title: 'Metal powder: explosion and inhalation', why: 'Fine titanium and aluminium powders are combustible and can explode; powders are toxic to inhale; inert gas displaces oxygen.', mitigate: ['Industrial machines and trained operators only; ATEX/NFPA 484 procedures; respirators and conductive PPE.', 'Oxygen monitoring where argon/nitrogen is used.'], cite: 'NFPA 484; ISO/ASTM 52931' });
  if (processId === 'ded') add({ id: 'ded', severity: 'high', title: 'Welding arc and fumes', why: 'WAAM/DED is welding: arc radiation, fumes, burns and fire.', mitigate: ['Welding PPE, fume extraction, fire watch.'] });
  if (processId === 'wire-edm') add({ id: 'edm', severity: 'medium', title: 'Dielectric fluid and electricity', why: 'EDM uses high voltage in deionised water or oil; oil dielectric is flammable.', mitigate: ['Keep fluid level above the work; interlocks on; fire suppression for oil machines.'] });
  if (processId === 'sewing' || processId === 'textile') add({ id: 'sewing', severity: 'low', title: 'Needles and cutters', why: 'Industrial machines and rotary cutters cause puncture and cut injuries.', mitigate: ['Finger guards, retract rotary blades, keep fingers clear of the needle.'] });
  return sortHazards(out);
}

// ---------------------------------------------------------------- imported slicer profiles

export interface ProfileCheck {
  material?: string; nozzleTemp: number; bedTemp: number; firstLayerNozzleTemp?: number; firstLayerBedTemp?: number;
  /** Fastest print and travel speeds the job will ask for, mm/s, and the machine's own maxima. */ speed: number; travel: number; maxX?: number; maxY?: number;
  /** Custom G-code from the profile, for review. */ gcode?: Array<{ label: string; text: string }>;
  source?: string;
}

/** Commands that change the machine itself rather than this print. */
const RISKY_GCODE: Array<{ re: RegExp; what: string; severity: Severity }> = [
  { re: /^M302\b/, what: 'M302 allows cold extrusion (grinds filament, can strip the extruder)', severity: 'critical' },
  { re: /^M211\s+S0\b/, what: 'M211 S0 turns off software endstops (the head can crash into the frame)', severity: 'critical' },
  { re: /^M50[0-2]\b/, what: 'M500/M501/M502 save, reload or factory-reset firmware settings', severity: 'critical' },
  { re: /^M997\b/, what: 'M997 starts a firmware update', severity: 'critical' },
  { re: /^M92\b/, what: 'M92 changes steps per mm (wrong values over- or under-extrude and mis-size parts)', severity: 'high' },
  { re: /^M90[67]\b/, what: 'M906/M907 change motor currents (drivers and motors can overheat)', severity: 'high' },
  { re: /^M303\b/, what: 'M303 runs heater auto-tuning (heats the hotend on its own)', severity: 'high' },
  { re: /^M20[1345]\b/, what: 'M201-M205 change the machine speed, acceleration or jerk limits', severity: 'medium' },
  { re: /^M112\b/, what: 'M112 emergency stop in the middle of the file', severity: 'medium' },
];

/**
 * Hazards from an imported slicer profile: temperatures above what the material tolerates, speeds
 * beyond the machine's own limits, and custom G-code that reconfigures the printer. Profiles are
 * other people's settings: we never run them blind, so the risky parts must be acknowledged.
 */
export function profileHazards(c: ProfileCheck): Hazard[] {
  const out: Hazard[] = []; const lim = materialLimit(c.material); const src = c.source ? ` (from ${c.source})` : '';
  const add = (h: Omit<Hazard, 'stage'>) => out.push({ stage: 'make', ...h });
  const nozzle = Math.max(c.nozzleTemp, c.firstLayerNozzleTemp ?? 0), bed = Math.max(c.bedTemp, c.firstLayerBedTemp ?? 0);
  if (nozzle > lim.nozzle) add({ id: 'profile-nozzle-temp', severity: 'critical', ack: true, title: `Nozzle ${nozzle} °C is above ${lim.name}'s ${lim.nozzle} °C`, why: `Overheated filament decomposes, gives off fumes and can char inside the hotend${src}.`, mitigate: [`Check the spool label; bring the nozzle back into its range (${lim.nozzle} °C or less).`, 'If the material really needs it, ventilate and stay with the printer.'], cite: `Generic ${lim.name} datasheet ranges (services/fab/materials.ts MATERIAL_LIMITS)` });
  if (nozzle > 240) add({ id: 'profile-ptfe', severity: 'high', title: 'PTFE-lined hotends should stay at or below 240 °C', why: 'PTFE (Teflon) tubing in the hot zone breaks down as it overheats, and its fumes are toxic, especially to pet birds.', mitigate: ['Use an all-metal hotend for anything hotter.', 'Ventilate the room.'], cite: 'Hotend makers\' ratings for PTFE-lined hotends; PTFE pyrolysis (polymer fume fever)' });
  if (bed > lim.bed) add({ id: 'profile-bed-temp', severity: 'critical', ack: true, title: `Bed ${bed} °C is above ${lim.name}'s ${lim.bed} °C`, why: `Very hot beds warp build sheets, soften adhesives and burn skin${src}.`, mitigate: [`Lower the bed to ${lim.bed} °C or below.`, 'Do not touch the bed while it is hot.'], cite: `Generic ${lim.name} datasheet ranges; IEC 62368-1 Table 38 (touch temperatures)` });
  const maxXY = Math.min(c.maxX ?? Infinity, c.maxY ?? Infinity);
  if (Number.isFinite(maxXY) && Math.max(c.speed, c.travel) > maxXY) add({ id: 'profile-speed', severity: 'high', ack: true, title: `Speed ${Math.round(Math.max(c.speed, c.travel))} mm/s is above the machine's ${Math.round(maxXY)} mm/s`, why: 'The firmware clamps it (so the time estimate is wrong) or, with limits raised, the motors skip steps and the print shifts or the head crashes.', mitigate: ['Lower print and travel speeds to the machine maximum.', 'Do not raise firmware limits beyond what the printer maker lists.'], cite: 'Printer profile machine_max_feedrate_x / machine_max_speed_x' });
  for (const g of c.gcode ?? []) {
    const found = new Map<string, Severity>();
    for (const raw of g.text.split(/\r?\n/)) {
      const line = raw.replace(/;.*$/, '').trim().toUpperCase(); if (!line) continue;
      for (const r of RISKY_GCODE) if (r.re.test(line)) found.set(r.what, r.severity);
      const t = /^M(104|109|140|190)\b.*\bS(\d+)/.exec(line);
      if (t) { const v = +t[2]; const isBed = t[1] === '140' || t[1] === '190'; const max = isBed ? lim.bed : lim.nozzle; if (v > max) found.set(`${line} sets ${v} °C, above ${lim.name}'s ${max} °C`, 'critical'); }
    }
    if (!found.size) continue;
    const sev = [...found.values()]; const worst: Severity = sev.includes('critical') ? 'critical' : sev.includes('high') ? 'high' : 'medium';
    add({ id: `profile-gcode-${g.label.toLowerCase().replace(/\W+/g, '-')}`, severity: worst, ack: worst !== 'medium', title: `${g.label} G-code changes the machine`, why: `The profile's ${g.label.toLowerCase()} G-code contains: ${[...found.keys()].join('; ')}.`, mitigate: ['Read the G-code shown under the profile; delete those lines unless you know why they are there.', 'We never run profile G-code ourselves; it only goes into the file you send.'], cite: 'Marlin and RepRapFirmware G-code references for each command' });
  }
  return sortHazards(out);
}

// ---------------------------------------------------------------- recalls and component advisories

export interface Advisory { id: string; kinds: string[]; severity: Severity; title: string; detail: string; source?: string }
/** Our own component advisories: patterns that cause recalls, fires and counterfeit failures. */
export const ADVISORIES: Advisory[] = [
  { id: 'adv-uncert-acdc', kinds: ['acdc'], severity: 'high', title: 'Uncertified mains modules', detail: 'Many low-cost encapsulated AC-DC modules on marketplaces carry no recognised safety certificate or carry copied marks. Buy from an authorised distributor and check the certificate number on the certifier\'s public database (e.g. UL Product iQ).' },
  { id: 'adv-li-counterfeit', kinds: ['battery'], severity: 'high', title: 'Counterfeit and re-wrapped lithium cells', detail: 'Re-wrapped used cells and inflated capacity ratings are common. Buy cells from authorised distributors; reject packs with no UN 38.3 test summary.' },
  { id: 'adv-coin-charger', kinds: ['coincell'], severity: 'critical', title: 'Coin-cell products are a top recall category', detail: 'Products with coin cells keep being recalled for failing the battery-compartment and warning requirements of Reese\'s Law. Design the screw-secured door in from the start.' },
  { id: 'adv-usb-charger', kinds: ['acdc', 'usbload'], severity: 'high', title: 'USB chargers and power adapters', detail: 'Chargers are recalled for shock (inadequate insulation between mains and USB) and fire. Keep creepage distances, use certified modules, and test before selling.' },
  { id: 'adv-counterfeit-ic', kinds: ['esp32', 'pico', 'nano', 'amp', 'reg7805', 'ne555', 'nmos', 'npn'], severity: 'medium', title: 'Counterfeit chips', detail: 'Clone and remarked ICs (regulators, MOSFETs, microcontrollers) often fail early or run hot. Buy from authorised distributors (they publish their franchise lines).' },
  { id: 'adv-ledstrip', kinds: ['ledstrip'], severity: 'medium', title: 'LED strip power supplies', detail: 'Strip lights are recalled mostly for their adapters overheating. Use a listed adapter rated 20% above the strip load.' },
];
export const advisoriesFor = (c?: Circuit) => { const kinds = new Set((c?.parts ?? []).map(p => p.kind)); return ADVISORIES.filter(a => a.kinds.some(k => kinds.has(k))); };

/** Search terms for public recall databases (CPSC in the US) from a design's parts and product type. */
export function recallQueries(c?: Circuit, recipe?: string): string[] {
  const kinds = new Set((c?.parts ?? []).map(p => p.kind)); const q = new Set<string>();
  const map: Record<string, string[]> = { acdc: ['power adapter', 'charger'], usbload: ['USB charger'], coincell: ['coin battery', 'button battery'], battery: ['battery pack'], ledstrip: ['LED strip light'], speaker: ['speaker'], amp: ['speaker'], rpi: ['Raspberry Pi'], esp32: ['smart plug'], mains: ['extension cord'] };
  for (const k of kinds) for (const s of map[k] ?? []) q.add(s);
  const byRecipe: Record<string, string[]> = { lamp: ['lamp', 'night light'], 'smart-lamp': ['LED light'], charger: ['USB charger', 'wall charger'], speaker: ['speaker'], guitar: ['guitar amplifier'], midi: ['USB'], sensor: ['thermometer'], pi: ['Raspberry Pi'], plush: ['plush toy', 'stuffed animal'], apparel: ['drawstring', 'children\'s sleepwear'], textile: ['weighted blanket', 'pillow'] };
  for (const s of byRecipe[recipe ?? ''] ?? []) q.add(s);
  return [...q].slice(0, 6);
}

export interface RecallHit { id: string; number: string; date: string; title: string; url: string; hazard: string; remedy: string; units: string; source: 'CPSC' }
/** Trim a CPSC Recall API record to what the panel shows. */
export function trimCpsc(r: any): RecallHit {
  return { id: String(r.RecallID ?? ''), number: String(r.RecallNumber ?? ''), date: String(r.RecallDate ?? '').slice(0, 10), title: String(r.Title ?? ''), url: String(r.URL ?? ''),
    hazard: (r.Hazards ?? []).map((h: any) => h.Name).filter(Boolean).join('; '), remedy: (r.Remedies ?? []).map((h: any) => h.Name).filter(Boolean).join('; '), units: (r.Products ?? []).map((p: any) => p.NumberOfUnits).filter(Boolean).join(', '), source: 'CPSC' };
}
/** Public search pages for other markets (no stable public API we can rely on). */
export const RECALL_LINKS = (q: string) => [
  { name: 'EU Safety Gate', url: `https://ec.europa.eu/safety-gate-alerts/screen/search?searchValue=${encodeURIComponent(q)}` },
  { name: 'UK Product Safety Database', url: 'https://www.gov.uk/product-safety-alerts-reports-recalls' },
  { name: 'Health Canada recalls', url: `https://recalls-rappels.canada.ca/en/search/site?search_api_fulltext=${encodeURIComponent(q)}` },
];

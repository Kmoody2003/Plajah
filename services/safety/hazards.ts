// Safety first: hazards for a design at every stage, from the first idea to selling it. Written in
// our own words; citations point at the public rule so makers can read the source. These are
// prompts to design safely, not a certification or a full risk assessment. A critical hazard has
// to be acknowledged before the design can be exported, added to a document or sent to a machine.

import type { Circuit } from '../elec/circuit';
import { parseSi } from '../elec/components';
import { moduleHazards } from '../elec/modules';

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
  if (has('esp32') || has('esp32s3') || has('rpi') || parts.some(p => p.kind === 'pico' && /W$/.test(String(p.params.variant ?? '')))) {
    add({ id: 'rf-exposure', stage: 'schematic', severity: 'low', title: 'Radio near the body', why: 'Wi-Fi/Bluetooth modules are certified for a minimum distance (often 20 cm); worn or handheld use can need a separate RF-exposure evaluation.', mitigate: ['Keep the antenna 20 cm from people unless the module grant covers closer use.', 'For wearables, check the module\'s SAR / exposure conditions.'], cite: '47 CFR 1.1310, 2.1091, 2.1093' });
    add({ id: 'iot-security', stage: 'sell', severity: 'high', title: 'Connected-device security', why: 'A hacked device can be used against its owner (cameras, locks) or the network.', mitigate: ['No shared default passwords: unique per device or set at first use.', 'Signed updates, a way to report vulnerabilities, and a stated support period.', 'Store Wi-Fi credentials encrypted; turn off debug ports in production.'], cite: 'Cal. Civ. Code §1798.91.04; Delegated Reg. (EU) 2022/30; UK PSTI Act 2022' });
  }
  if (has('rpi') || has('pico') || has('esp32') || has('esp32s3') || has('nano')) add({ id: 'gpio-damage', stage: 'schematic', severity: 'low', title: 'Board damage from wiring mistakes', why: '5 V into a 3.3 V pin, or a motor straight on a GPIO, destroys the board and can overheat.', mitigate: ['3.3 V logic only on Pi, Pico and ESP32 pins.', 'Switch loads through a transistor or MOSFET, with a flyback diode on coils and motors.'] });
  if (has('speaker') || has('amp')) add({ id: 'hearing', stage: 'idea', severity: 'low', title: 'Loud sound', why: 'Headphone outputs above about 85 dB(A) for long periods damage hearing; small speakers rarely do but headphone jacks can.', mitigate: ['If you add a headphone output, limit its maximum level.', 'Never connect the bridged amp outputs to ground (instant amplifier damage).'], cite: 'EN 50332 (headphone levels)' });
  if (has('ledstrip') || parts.filter(p => p.kind === 'led').length >= 6) add({ id: 'led-photobio', stage: 'idea', severity: 'low', title: 'Very bright LEDs', why: 'High-power or blue-rich LEDs viewed up close can cause glare and eye strain.', mitigate: ['Use a diffuser; avoid exposing bare high-power LEDs at eye level.'], cite: 'IEC 62471 (photobiological safety)' });
  if (ctx.recipe === 'guitar') add({ id: 'guitar-ground', stage: 'build', severity: 'medium', title: 'Grounding and amplifier faults', why: 'The strings are grounded through the bridge; a faulty, old or modified amp can put voltage on them.', mitigate: ['Ground the bridge to the jack sleeve as drawn; shield the cavity.', 'Only use amps in good repair; never "lift" an amp\'s earth pin.'] });
  if (ctx.toy) {
    add({ id: 'small-parts', stage: 'idea', severity: 'critical', ack: true, title: 'Children\'s product: choking and small parts', why: 'Parts that fit the small-parts cylinder are banned in products for children under 3 and need warnings for ages 3-6.', mitigate: ['Every part survives the use-and-abuse tests attached (torque, tension, drop).', 'No accessible small parts, magnets or button batteries; secure seams on plush.', 'Third-party testing and a Children\'s Product Certificate before sale in the US.'], cite: '16 CFR part 1501; 16 CFR part 1250 (ASTM F963); 15 U.S.C. 2063 (CPC)' });
    add({ id: 'magnets', stage: 'idea', severity: 'high', title: 'Magnets in children\'s products', why: 'Two swallowed strong magnets attract through intestine walls and cause perforation.', mitigate: ['Avoid loose or loosely held magnets; fully enclose and test any magnet.'], cite: 'ASTM F963 §4.38; 16 CFR part 1262' });
  }
  if (ctx.selling) add({ id: 'sell-ready', stage: 'sell', severity: 'high', title: 'Before you sell', why: 'Selling makes you the manufacturer in law: you carry product liability and must meet labelling, certification and recall duties.', mitigate: ['Get the required tests and declarations (see Checks › Regulatory).', 'Keep a technical file, a batch/date code on each unit and a list of buyers to support a recall.', 'Consider product liability insurance.'], cite: '15 U.S.C. 2064(b) (reporting); Regulation (EU) 2023/988 (GPSR)' });
  for (const m of moduleHazards(new Set(parts.map(p => p.kind)))) add(m);
  add({ id: 'soldering', stage: 'build', severity: 'low', title: 'Soldering', why: 'Solder fumes (flux) irritate lungs; leaded solder is toxic if ingested; irons run at 350 °C.', mitigate: ['Fume extraction or a fan pulling fumes away; wash hands after; lead-free solder for products sold in the EU.', 'Safety glasses when clipping leads.'] });
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

// ---------------------------------------------------------------- recalls and component advisories

export interface Advisory { id: string; kinds: string[]; severity: Severity; title: string; detail: string; source?: string }
/** Our own component advisories: patterns that cause recalls, fires and counterfeit failures. */
export const ADVISORIES: Advisory[] = [
  { id: 'adv-uncert-acdc', kinds: ['acdc'], severity: 'high', title: 'Uncertified mains modules', detail: 'Many low-cost encapsulated AC-DC modules on marketplaces carry no recognised safety certificate or carry copied marks. Buy from an authorised distributor and check the certificate number on the certifier\'s public database (e.g. UL Product iQ).' },
  { id: 'adv-li-counterfeit', kinds: ['battery', 'liion'], severity: 'high', title: 'Counterfeit and re-wrapped lithium cells', detail: 'Re-wrapped used cells and inflated capacity ratings are common. Buy cells from authorised distributors; reject packs with no UN 38.3 test summary.' },
  { id: 'adv-coin-charger', kinds: ['coincell'], severity: 'critical', title: 'Coin-cell products are a top recall category', detail: 'Products with coin cells keep being recalled for failing the battery-compartment and warning requirements of Reese\'s Law. Design the screw-secured door in from the start.' },
  { id: 'adv-usb-charger', kinds: ['acdc', 'usbload'], severity: 'high', title: 'USB chargers and power adapters', detail: 'Chargers are recalled for shock (inadequate insulation between mains and USB) and fire. Keep creepage distances, use certified modules, and test before selling.' },
  { id: 'adv-counterfeit-ic', kinds: ['esp32', 'esp32s3', 'pico', 'nano', 'amp', 'reg7805', 'ne555', 'nmos', 'npn'], severity: 'medium', title: 'Counterfeit chips', detail: 'Clone and remarked ICs (regulators, MOSFETs, microcontrollers) often fail early or run hot. Buy from authorised distributors (they publish their franchise lines).' },
  { id: 'adv-ledstrip', kinds: ['ledstrip'], severity: 'medium', title: 'LED strip power supplies', detail: 'Strip lights are recalled mostly for their adapters overheating. Use a listed adapter rated 20% above the strip load.' },
];
export const advisoriesFor = (c?: Circuit) => { const kinds = new Set((c?.parts ?? []).map(p => p.kind)); return ADVISORIES.filter(a => a.kinds.some(k => kinds.has(k))); };

/** Search terms for public recall databases (CPSC in the US) from a design's parts and product type. */
export function recallQueries(c?: Circuit, recipe?: string): string[] {
  const kinds = new Set((c?.parts ?? []).map(p => p.kind)); const q = new Set<string>();
  const map: Record<string, string[]> = { acdc: ['power adapter', 'charger'], usbload: ['USB charger'], coincell: ['coin battery', 'button battery'], battery: ['battery pack'], ledstrip: ['LED strip light'], speaker: ['speaker'], amp: ['speaker'], rpi: ['Raspberry Pi'], esp32: ['smart plug'], mains: ['extension cord'], liion: ['lithium-ion battery', 'power bank'], relay: ['smart plug', 'relay'], servo: ['toy robot'], neopixel: ['LED light'] };
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

// Safety notes for Build Studio, from the shared hazard library: printing (and small parts for
// little children) in 3D, and batteries, boards and soldering for circuits. Kid-friendly first
// lines; the full hazard text stays available for teachers.

import { designHazards, processHazards, sortHazards, type Hazard } from '../../safety/hazards';
import type { Circuit } from '../../elec/circuit';
import type { Audience } from './shapes';

export function studio3dHazards(audience: Audience): Hazard[] {
  const out = [...processHazards('fdm', 'pla')];
  out.push({ id: 'studio-hot-nozzle', stage: 'make', severity: 'medium', title: 'Hot nozzle and bed', why: 'The printer nozzle is over 200 °C and the bed about 60 °C.', mitigate: ['Hands off while it prints; let a grown-up take prints off the bed.', 'Wait for the bed to cool before peeling the print.'] });
  if (audience === 'under3') out.push(...designHazards({ toy: true }).filter(h => h.id === 'small-parts' || h.id === 'magnets'));
  else if (audience === 'kids') out.push({ id: 'studio-small-parts', stage: 'idea', severity: 'medium', title: 'Small parts', why: 'Small printed parts (keychains, game pieces) can choke children under 3.', mitigate: ['Keep small prints away from babies and toddlers.', 'For a toy for a little one, choose "Under 3" so Build Studio checks the size.'] });
  return sortHazards(out);
}

export function studioCircuitHazards(c?: Circuit): Hazard[] {
  const out = designHazards({ circuit: c }).filter(h => ['battery-short', 'gpio-damage', 'soldering', 'coin-ingestion', 'hearing', 'led-photobio'].includes(h.id));
  out.push({ id: 'studio-unplug', stage: 'build', severity: 'low', title: 'Unplug before you rewire', why: 'Moving wires on a powered board can short pins and damage the board.', mitigate: ['Unplug USB (or the battery) before changing wires; plug back in to test.', 'Only use the low-voltage parts in the kit: never wall power.'] });
  return sortHazards(out);
}

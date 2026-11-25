/**
 * Playable Education Council ("The Mentor Guild") Socratic Hint Engine.
 *
 * Imports Plajah's real 13-seat Education Council roster (services/educationCouncil/members.ts)
 * so in-world guidance stays anchored to authentic pedagogical traditions:
 *  - Efua (Accra): Science of Reading / oral language first
 *  - Wei Ling (Singapore): Concrete -> Pictorial -> Abstract bar models
 *  - Haruto (Kyoto): One rich problem / smaller-case hypothesis
 *  - Dr. Lindqvist (Sweden): Worked-example fading & retrieval
 *  - Yasmin (Morocco/France): Multilingual cognates & language scaffolding
 *  - Rafael (São Paulo): Primary-source perspective & learner agency
 *
 * Tiered hints (1=Nudge -> 2=Visual/Structural lens -> 3=Worked scaffold) never spoil the joy of solving on tap 1.
 * Provenance is explicitly tagged 'deterministic-council' (no silent cloud AI calls).
 */

import { seatById } from '../educationCouncil/members';
import {
  formatFraction,
  gcd,
} from './pedagogyEngine';
import type {
  FluxStudioQuest,
  HistoryDispatchQuest,
  MathWaterwheelQuest,
  MentorHint,
  ReadingQuest,
  ScienceBenchQuest,
} from './contracts';

function makeHint(seatId: string, tier: 1 | 2 | 3, heading: string, message: string): MentorHint {
  const seat = seatById(seatId);
  return {
    seatId,
    seatName: seat?.name ?? 'Council Guide',
    seatTitle: seat?.title ?? 'Educator',
    seatColor: seat?.color ?? '#6E4E34',
    tier,
    heading,
    message,
    provenance: 'deterministic-council',
  };
}

export function getReadingHint(quest: ReadingQuest, tier: 1 | 2 | 3): MentorHint {
  if (tier === 1) {
    return makeHint(
      'accra',
      1,
      'Hear the First Sound',
      `Say the word softly out loud first: it begins with the sound “${quest.tiles[0]}” and rhymes inside the story: “${quest.storyLine}”`,
    );
  }
  if (tier === 2) {
    const bridge = quest.cognateHint ? ` Meaning lantern: ${quest.cognateHint}` : '';
    return makeHint(
      'ell',
      2,
      'Clap the Syllables',
      `Break it into gentle beats: ${quest.syllables.join(' · ')} (${quest.tiles.length} wooden tiles).${bridge}`,
    );
  }
  return makeHint(
    'learnsci',
    3,
    'Worked Path',
    `Start with “${quest.tiles[0]}”, follow with “${quest.tiles[1] ?? ''}”${quest.tiles.length > 2 ? `, and finish with “${quest.tiles[quest.tiles.length - 1]}”` : ''}. Tap each tile slowly and hear it bloom.`,
  );
}

export function getMathHint(quest: MathWaterwheelQuest, currentA: number, currentB: number, tier: 1 | 2 | 3): MentorHint {
  const remaining = quest.targetTotal - currentA - quest.fixedC;
  if (tier === 1) {
    return makeHint(
      'singapore',
      1,
      'See the Whole Bar First',
      `Picture the aqueduct as ${quest.targetTotal} equal wooden cups (${quest.targetTotal}/${quest.denom}). Count how many cups are already filled before moving Gate B.`,
    );
  }
  if (tier === 2) {
    return makeHint(
      'kyoto',
      2,
      'Compare Filled vs. Remaining',
      `Channel A gives ${currentA}/${quest.denom}${quest.fixedC ? ` and Channel C gives ${quest.fixedC}/${quest.denom}` : ''} (that is ${currentA + quest.fixedC}/${quest.denom} so far). Notice the gap to ${quest.targetTotal}/${quest.denom}.`,
    );
  }
  const safeTarget = Math.max(quest.minB, Math.min(quest.maxB, remaining));
  return makeHint(
    'learnsci',
    3,
    'Worked Bar-Model Step',
    `${quest.targetTotal}/${quest.denom} − ${currentA + quest.fixedC}/${quest.denom} = ${remaining}/${quest.denom}. Try setting Brass Gate B to ${safeTarget}/${quest.denom} (${formatFraction(safeTarget, quest.denom)})${currentB === safeTarget ? ' — and tune Gate A if needed!' : '.'}`,
  );
}

export function getScienceHint(
  quest: ScienceBenchQuest,
  light: number,
  moisture: number,
  voltage: number,
  tier: 1 | 2 | 3,
): MentorHint {
  if (tier === 1) {
    return makeHint(
      'kyoto',
      1,
      'Change One Variable at a Time',
      'Hold two dials steady and move only Canopy Light first—watch how the oak foliage and root glow respond before touching Soil or Voltage.',
    );
  }
  if (tier === 2) {
    const dir = (v: number, [lo, hi]: [number, number], name: string) =>
      v < lo ? `${name} wants to rise` : v > hi ? `${name} wants to soften` : `${name} is already balanced`;
    return makeHint(
      'singapore',
      2,
      'Read the Living Clues',
      `${dir(light, quest.targetLight, 'Canopy Light')}; ${dir(moisture, quest.targetMoisture, 'Soil Moisture')}; ${dir(voltage, quest.targetVoltage, 'Galvanic Bench')}.`,
    );
  }
  const mid = ([lo, hi]: [number, number]) => Math.round((lo + hi) / 2);
  return makeHint(
    'learnsci',
    3,
    'Field Calibration Target',
    `A steady equilibrium sits near Canopy ${mid(quest.targetLight)}%, Soil ${mid(quest.targetMoisture)}%, and Bench ${mid(quest.targetVoltage)}%. Fine-tune around those marks to watch symbiosis peak.`,
  );
}

export function getFluxHint(quest: FluxStudioQuest, p: number, q: number, tier: 1 | 2 | 3): MentorHint {
  const g = gcd(p, q);
  if (tier === 1) {
    return makeHint(
      'kyoto',
      1,
      'Test a Simple Pair',
      `Watch the denominator of symmetry: right now (${p}, ${q}) shares a greatest common divisor of ${g}. What happens when both numbers are even?`,
    );
  }
  if (tier === 2) {
    return makeHint(
      'singapore',
      2,
      'Number Theory Controls Topology',
      'Every time p and q share a common factor d, the 3D golden filament breaks into d separate interlocking rings. Coprime pairs (gcd = 1) weave a single unbroken ribbon.',
    );
  }
  const suggestion = quest.goalKind === 'linked-rings' ? 'p = 4, q = 6 (gcd = 2)' : 'p = 5, q = 7 (gcd = 1)';
  return makeHint(
    'learnsci',
    3,
    'Worked Manifold Example',
    `Try sliding the Vernier brass markers to ${suggestion} and compare the phase-curve etching on the archival folio.`,
  );
}

export function getHistoryHint(quest: HistoryDispatchQuest, tier: 1 | 2 | 3): MentorHint {
  if (tier === 1) {
    return makeHint(
      'saopaulo',
      1,
      'Listen to Both Voices',
      `Notice who wrote each dispatch: ${quest.sources.map(s => `${s.speaker} (${s.role})`).join(' and ')}. What do both witnesses agree was happening in daily life?`,
    );
  }
  if (tier === 2) {
    return makeHint(
      'chicago',
      2,
      'Check Textual Evidence',
      'Eliminate any claim that contradicts either primary witness—good historical conclusions weave both perspectives together rather than erasing one.',
    );
  }
  return makeHint(
    'learnsci',
    3,
    'Corroboration Lens',
    'Look for the choice that connects economic livelihood and community knowledge/cooperation together—both dispatches point to mutual interdependence.',
  );
}

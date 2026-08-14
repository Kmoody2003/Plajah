// Edit-time groove tools: auto drum fill + quantize. These mutate the pattern (call inside the
// doc's mutate()) — they are editing gestures, not engine features, so Math.random here is fine
// (offline-render determinism only concerns the scheduler's probability rolls).

import type { GrooveDoc, Pattern } from './grooveDoc';

const findPads = (doc: GrooveDoc, match: (name: string, voice?: string) => boolean): number[] =>
  doc.kit.map((p, i) => (match(p.name.toLowerCase(), p.synthVoice) ? i : -1)).filter((i) => i >= 0);

/**
 * Write a fill into the LAST `fillSteps` steps of the pattern — the classic accelerating snare
 * ramp with a velocity crescendo, percussion answers on the offbeats, and an open-hat/crash
 * accent on the downbeat that follows (step 0, since the pattern loops).
 */
export function autoFill(doc: GrooveDoc, pattern: Pattern, fillSteps: 4 | 8 = 4): void {
  const snares = findPads(doc, (n, v) => v === 'snare' || v === 'clap' || /snare|clap|rim/.test(n));
  const percs = findPads(doc, (n) => /perc|tom|conga/.test(n));
  const opens = findPads(doc, (n, v) => v === 'hat-open' || /open hat|crash|cymbal/.test(n));
  if (!snares.length) return;
  const start = pattern.length - fillSteps;
  const lead = snares[0];
  const answer = snares[1] ?? percs[0] ?? snares[0];

  const row = (padIdx: number) => pattern.steps[padIdx] || (pattern.steps[padIdx] = {});

  // Clear the fill zone for the pads we're writing (leave kick/bass grooves running).
  for (const padIdx of [...snares, ...percs]) {
    const r = pattern.steps[padIdx];
    if (r) for (let s = start; s < pattern.length; s++) delete r[s];
  }

  for (let i = 0; i < fillSteps; i++) {
    const s = start + i;
    const frac = i / (fillSteps - 1 || 1);
    // 8-step fills breathe: first half on 8ths, second half a 16th roll. 4-step fills roll straight.
    const active = fillSteps === 8 ? (i < 4 ? i % 2 === 0 : true) : true;
    if (!active) continue;
    const pad = i % 4 === 3 && answer !== lead ? answer : lead;
    const vel = Math.round(58 + frac * 68 + (Math.random() * 8 - 4));
    row(pad)[s] = { v: Math.max(40, Math.min(127, vel)) };
    // Humanize the roll's tail slightly ahead of the beat — pushes into the drop.
    if (frac > 0.6) row(pad)[s].micro = -0.06 - Math.random() * 0.05;
  }
  // Accent that lands the loop: open hat / crash on the downbeat the fill resolves to.
  if (opens.length) row(opens[0])[0] = { v: 118 };
}

/**
 * Quantize: pull every micro-offset toward the grid by `strength` (1 = hard snap). Micro is the
 * only off-grid dimension in Phase 1 (imported/humanized notes); live-recording lands here too.
 */
export function quantizePattern(pattern: Pattern, strength = 1): void {
  for (const padKey of Object.keys(pattern.steps)) {
    const r = pattern.steps[Number(padKey)];
    for (const stepKey of Object.keys(r)) {
      const st = r[Number(stepKey)];
      if (!st?.micro) continue;
      st.micro *= 1 - strength;
      if (Math.abs(st.micro) < 0.02) delete st.micro;
    }
  }
}

// Brakes: bleeding and fluid. AI-draft content, generic archetypes.
import { part, fm, hook, port, mat, ASE } from './shared';

export const FLUID_PARTS = [
  part({
    id: 'bleeder_screw', name: 'Bleeder screw', category: 'hydraulic', generator: 'bleeder_screw',
    ports: [port('fluid', 'hydraulic', 'bidir', 'Caliper high point')],
    fn: 'Lets you open the hydraulic circuit at its highest point to push out trapped air and old fluid during bleeding or a flush.',
    inside: 'A small hollow screw with a conical seat in the caliper. Loosened a fraction of a turn, it opens a passage so fluid and bubbles can leave. Tight, its seat seals against pressure. It sits at the caliper\'s highest point because air rises.',
    wear: ['Seizes from corrosion and shears off.', 'Seat damage from overtightening causes leaks or air ingestion.', 'The passage clogs with debris.'],
    failures: [
      fm('bleeder_seized', 'Seized or broken bleeder', ['Cannot open the screw', 'Bleeder snaps off', 'Air cannot be bled'], ['Corrosion', 'Overtightening', 'Moisture in the fluid'], ['Try penetrating oil and gentle tapping before turning', 'Use the correct size six-point wrench']),
      fm('bleeder_leaks_air', 'Leaking seat draws air', ['Persistent bubbles in the bleed stream', 'Spongy pedal after bleeding'], ['Damaged seat', 'Loose bleeder'], ['Bleed with the nipple cap submerged in fluid and watch for continuous bubbles']),
    ],
    diag: ['Confirm the bleeder is the highest point of the caliper when mounted.', 'Look for fluid seepage at the screw.'],
    repair: { summary: 'Open and close the screw during bleeding; replace a damaged screw or the caliper if the seat is damaged.', steps: ['Soak with penetrating oil and clean the area.', 'Fit a six-point wrench or flare wrench and open slightly.', 'Bleed using a specified procedure and sequence.', 'Close to the specified torque; do not overtighten.', 'Replace the screw if the seat or threads are damaged.'], tools: ['Six-point wrench', 'Clear hose and catch bottle', 'Penetrating oil'], difficulty: 2, hours: [0.3, 1.2] },
    cost: { parts: [3, 25], labor: [0.3, 1.2] }, ase: ASE.hyd,
  }),
  part({
    id: 'brake_fluid', name: 'Brake fluid', category: 'fluid', generator: 'brake_fluid',
    ports: [port('fill', 'hydraulic', 'bidir', 'System fill')],
    materials: [mat('fluid', '#d9a441', 0.1, 0.3)],
    hooks: [hook('friction', 'boiling point vs water content', 'S1')],
    fn: 'Transmits pressure from the master cylinder to every wheel, resists boiling, lubricates seals and protects against corrosion.',
    inside: 'Glycol-ether based DOT 3, DOT 4 or DOT 5.1 fluid is hygroscopic: it absorbs water through hoses and the reservoir cap. Water lowers the boiling point (a typical "wet" minimum is much lower than "dry") and promotes corrosion. If fluid in a hot caliper boils, the vapor compresses and the pedal goes soft or sinks. DOT 5 silicone is a different, non-hygroscopic type and must not be mixed with glycol types.',
    wear: ['Absorbs water over months and years.', 'Copper and corrosion inhibitors deplete.', 'Dark, contaminated fluid shows wear debris.'],
    failures: [
      fm('contaminated_fluid', 'Wet or contaminated fluid', ['Spongy or fading pedal after hard braking', 'Pedal sinks on a long descent', 'Dark, cloudy fluid'], ['Moisture absorbed over time', 'Wrong fluid type mixed in', 'Seal breakdown contamination'], ['Test boiling point or water content with a tester', 'Check fluid color and compare with fresh', 'Look for corrosion in bleeder and caliper bores']),
      fm('fluid_wrong_type', 'Wrong or mixed fluid', ['Swollen rubber seals', 'Leaks at multiple points', 'Soft pedal'], ['Petroleum oil or the wrong DOT type added'], ['Check for swelling or fluid smell; flush completely if mineral oil entered']),
    ],
    diag: ['Test water content or boiling point at service intervals.', 'Look for dark fluid, debris and corrosion.'],
    repair: { summary: 'Flush and replace the fluid with the specified type, bleeding each wheel in the manual\'s sequence.', steps: ['Check the specified DOT type on the reservoir cap or manual.', 'Siphon old fluid from the reservoir.', 'Refill with fresh fluid and keep the reservoir above MIN throughout.', 'Open each bleeder in the specified sequence and flush until fresh fluid appears.', 'Top off, check pedal firmness and inspect for leaks.', 'Dispose of old fluid properly.'], tools: ['Bleeder kit or pressure bleeder', 'Clear hose and catch bottle', 'Fluid tester'], difficulty: 2, hours: [0.7, 1.5], safety: ['Keep fluid off painted surfaces and out of eyes; wash exposed skin.'] },
    cost: { parts: [10, 40], labor: [0.7, 1.5] }, ase: ASE.hyd,
  }),
];

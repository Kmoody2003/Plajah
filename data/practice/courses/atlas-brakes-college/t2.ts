import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-college';

export const PART: CoursePart = {
  track: {
    id: `${C}.t2`,
    title: 'Energy, Heat and Fade',
    blurb: 'Kinetic energy, stopping distance, temperature rise, brake fade and fluid boil.',
    level: 'ADVANCED',
    lessons: [
      {
        id: `${C}.l04`,
        title: 'Kinetic Energy and Stopping Distance',
        blurb: 'Energy, deceleration, reaction distance and why doubling speed quadruples braking distance.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'heat',
        anchors: parts('brake_pads', 'rotor', 'brake_pedal'),
        body: `The brakes must remove the vehicle's kinetic energy, KE = 1/2 m v squared. Braking distance for constant deceleration a follows from v squared = 2 a d, so d = v squared / (2 a). Both results show that speed matters squared: double the speed and the energy and the braking distance each become four times as large.

Worked example (illustrative). A 1,500 kg vehicle travels at 100 km/h = 27.78 m/s. v squared = 771.7. KE = 0.5 x 1,500 x 771.7 = 578,800 J, about 579 kJ. If the road and tires allow a deceleration of 0.8 g, then a = 0.8 x 9.81 = 7.848 m/s squared, and d = 771.7 / (2 x 7.848) = 771.7 / 15.696 = 49.2 m. At twice the speed, 55.56 m/s, v squared = 3,086.9, so d = 196.7 m, about four times as far.

Total stopping distance adds the distance covered during driver reaction. With an assumed reaction time of 1.5 s, the vehicle travels 1.5 x 27.78 = 41.7 m before braking begins, so the total at 100 km/h is about 41.7 + 49.2 = 90.9 m. Reaction distance grows linearly with speed, braking distance with its square.

The time to stop at constant deceleration is t = v / a = 27.78 / 7.848 = 3.54 s. The average power absorbed by the brakes during that stop is KE / t = 578,800 / 3.54 = about 163,500 W, or about 164 kW. This is much greater than the engine power of many ordinary vehicles and explains why brakes are sized as heat-management devices.

Real stops have varying deceleration, drag from the road, air and engine, and wheel and driveline rotational inertia, so the simplified results here describe a clean case. The deceleration a road surface allows depends on tire grip: a commonly cited range for dry asphalt is around 0.7 to 1.0 g, much lower on wet, snowy or icy surfaces. Verify with the tire and road data you use.`,
      },
      {
        id: `${C}.l05`,
        title: 'Heat, Brake Fade and Fluid Boil',
        blurb: 'Temperature rise estimates, pad, fluid and mechanical fade, and how a long descent differs from a single stop.',
        minutes: 13,
        asOf: '2026-10',
        atlasScenario: 'fault-fluid-boil',
        anchors: parts('rotor', 'brake_pads', 'brake_fluid', 'caliper_piston'),
        body: `Nearly all the kinetic energy becomes heat at the pad and rotor interface. Heat first goes into the rotor, then spreads by conduction into pads, caliper and hub, and leaves by convection and radiation. In a first estimate, ignore cooling and assume the rotor absorbs all the heat: the temperature rise is delta T = Q / (m x c), where m is the rotor mass and c its specific heat.

Worked example (illustrative; c for cast iron is commonly cited at around 460 J per kg K, to be verified). From the previous lesson, one stop from 100 km/h releases 579 kJ. At the 0.8 g ideal split the front axle does about 72 percent, so 416.8 kJ, and each front rotor takes about 208.4 kJ. A rotor of mass 8.0 kg gives delta T = 208,400 / (8.0 x 460) = 208,400 / 3,680 = about 57 K. One stop is therefore modest. Ten identical stops with no time to cool would add roughly 566 K, which shows how repeated stops raise temperatures sharply.

A long descent is a bigger problem. Descending 300 m of height with no engine braking gives potential energy m g h = 1,500 x 9.81 x 300 = 4.41 MJ. If the front axle absorbs 72 percent, that is 3.18 MJ, or 1.59 MJ per front rotor, and the no-cooling rise would be 1,589,000 / 3,680 = about 432 K. Actual rise is lower because of cooling, but the example shows why a lower gear matters: engine braking takes a share of the energy.

Three fade mechanisms are taught. Pad (friction) fade occurs when the pad material gets so hot that its binders and organic compounds break down and release gas or degrade, lowering mu. Fluid fade follows when the fluid temperature at the caliper reaches its boiling point, so vapor forms and the pedal gets spongy and long. Water absorbed in service lowers the boiling point, which is the reason for the dry and wet boiling point ratings. Mechanical fade involves thermal expansion, for example of a drum, which moves away from the shoes and increases pedal travel. Signs include a long soft pedal, a burning smell and reduced response.

Recovery usually needs cooling time, and overheated components may be damaged, so inspect after a severe event. Pads, rotor ventilation, fluid grade and cooling air flow should be selected to the duty. Use manufacturer specifications.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l04`, 1, 1, `If a vehicle doubles its speed, its kinetic energy becomes`, [`four times as large`, `twice as large`, `eight times as large`, `unchanged`], 0, `Energy depends on v squared.`, `KE = 1/2 m v squared, so doubling v quadruples the energy.`),
    mcq(`${C}.l04`, 2, 2, `A 1,500 kg vehicle travels at 27.78 m/s. What is its kinetic energy?`, [`About 579 kJ`, `About 21 kJ`, `About 1,158 kJ`, `About 41.7 kJ`], 0, `Use half m v squared.`, `0.5 x 1,500 x 27.78 squared = 0.5 x 1,500 x 771.7 = about 578,800 J.`),
    mcq(`${C}.l04`, 3, 2, `Deceleration of 7.848 m/s squared from 27.78 m/s gives a braking distance of`, [`about 49 m`, `about 98 m`, `about 3.5 m`, `about 24 m`], 0, `d = v squared / 2a.`, `771.7 / (2 x 7.848) = 49.2 m; forgetting the factor of 2 would give 98 m.`),
    mcq(`${C}.l04`, 4, 3, `With a 1.5 s reaction time, what is the total stopping distance from 27.78 m/s in the example?`, [`About 91 m`, `About 49 m`, `About 42 m`, `About 141 m`], 0, `Add reaction and braking distances.`, `Reaction distance 1.5 x 27.78 = 41.7 m plus braking distance 49.2 m is about 90.9 m.`),
    mcq(`${C}.l04`, 5, 3, `Which statement about average braking power in the example is correct?`, [`About 164 kW, which is KE divided by stopping time`, `About 579 kW, which is the energy stated as a rate`, `About 7.8 kW, which is the deceleration converted to power`, `About 49 kW, which is the braking distance divided by time`], 0, `Power is energy per unit time.`, `579 kJ over a 3.54 s stop is about 164 kW, a large rate that must be managed as heat.`),
    tf(`${C}.l04`, 6, 2, `Reaction distance grows in proportion to speed, while braking distance grows with the square of speed.`, 0, `Compare d = v t with d = v squared / 2a.`, `Reaction distance is speed times time, which is linear, while braking distance is v squared over 2a.`),

    mcq(`${C}.l05`, 1, 1, `Where does most of the vehicle's kinetic energy go during braking?`, [`Into heat at the pad and rotor interface`, `Into the brake fluid, which stores it as chemical energy`, `Into light from the brake lamps and the stop sensors`, `Into the tires, which store it as elastic energy`], 0, `Energy converts, it does not vanish.`, `Friction converts kinetic energy into heat, which then flows to the rotor, pads and surrounding air.`),
    mcq(`${C}.l05`, 2, 2, `A rotor of 8.0 kg with c about 460 J per kg K absorbs 208.4 kJ. What is the temperature rise with no cooling?`, [`About 57 K`, `About 25 K`, `About 114 K`, `About 566 K`], 0, `delta T = Q / (m c).`, `208,400 / (8.0 x 460) = 208,400 / 3,680 = about 57 K for a single stop.`),
    mcq(`${C}.l05`, 3, 3, `Descending 300 m with no engine braking and 72 percent to the front, each front rotor takes about 1.59 MJ in the example. Why does shifting to a lower gear help?`, [`Engine braking removes part of the energy, so the brakes absorb less`, `It makes the rotors heavier, so they heat up more slowly`, `It raises the fluid boiling point, so fluid fade can no longer occur`, `It increases pad friction, so less pedal force is needed`], 0, `Where else can the energy go?`, `Engine braking dissipates part of the potential energy, which reduces the heat load on the brakes.`),
    mcq(`${C}.l05`, 4, 3, `Which description fits pad (friction) fade?`, [`Pad binders overheat and degrade, lowering the friction coefficient`, `Vapor bubbles form in the brake fluid and compress under pedal force`, `A drum expands away from the shoes, increasing the pedal travel`, `A hose swells inside and traps pressure at one wheel`], 0, `It involves the friction material, not the fluid.`, `Pad fade is a loss of friction coefficient when the pad material overheats; fluid fade and mechanical fade have different causes.`),
    mcq(`${C}.l05`, 5, 3, `After a long steep descent the pedal goes soft and long but the pads are fine. Which is the best explanation?`, [`Fluid temperature reached its boiling point and vapor formed`, `The tone ring shrank with heat and the ABS cycled continuously`, `The brake light switch failed from the extended pedal use`, `The proportioning valve cooled and shifted its split point`], 0, `Vapor compresses.`, `Compressible vapor in the lines gives a soft, long pedal, especially with fluid that has absorbed water.`),
    tf(`${C}.l05`, 6, 2, `The no-cooling temperature estimates in this lesson overstate the actual rise because real brakes also lose heat to the air.`, 0, `Cooling is ignored in the estimate.`, `Convection and radiation remove heat during and after the stop, so the no-cooling result is an upper bound.`),
  ],
};

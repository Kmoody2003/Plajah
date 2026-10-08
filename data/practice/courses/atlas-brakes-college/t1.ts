import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-college';

export const PART: CoursePart = {
  track: {
    id: `${C}.t1`,
    title: 'Force, Torque and Brake Balance',
    blurb: 'From pedal force to clamp force, braking torque, brake factor, weight transfer and ideal brake force distribution.',
    level: 'ADVANCED',
    lessons: [
      {
        id: `${C}.l01`,
        title: 'The Force Chain: Pedal, Booster, Master Cylinder and Caliper',
        blurb: 'A full metric worked example from foot force to clamp force, including area ratios and the booster run-out point.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('brake_pedal', 'pushrod', 'brake_booster', 'master_cylinder', 'caliper_piston', 'brake_line'),
        body: `Treat the brake as a chain of multipliers, each defined by a ratio. The pedal is a lever with ratio r_p, the booster has an assist ratio r_b over its working range, the master cylinder converts piston force to pressure through its bore area, and the caliper converts pressure back to force through its piston area. Only the area ratio changes the trade between force and travel, because the fluid volume is conserved.

Worked example with illustrative values, not specifications. Foot force F_f = 150 N and pedal ratio 4.5:1, so pushrod force = 150 x 4.5 = 675 N. Booster assist ratio 4 gives F_mc = 675 x 4 = 2,700 N on the master cylinder piston. Master cylinder bore d_m = 24 mm, so A_m = (pi/4) x 24 squared = 0.7854 x 576 = 452.4 mm squared. Line pressure P = 2,700 N / 452.4 mm squared = 5.97 MPa (about 59.7 bar, or about 866 psi). A caliper piston of diameter 54 mm has A_c = 0.7854 x 2,916 = 2,290 mm squared. Piston force F_c = 5.97 x 2,290 = about 13,670 N. A shortcut confirms it: the area ratio is (54/24) squared = 5.0625, and 2,700 x 5.0625 = 13,669 N.

Travel runs the other way. Neglecting compliance and the other pistons that share the fluid, the caliper piston moves 1/5.0625 as far as the master cylinder piston. Because a caliper needs only a small pad travel to clamp, a larger caliper bore demands more fluid volume per unit of clamp force, which must be matched by the master cylinder bore and stroke. Pedal feel is a result of this matching and of system compliance.

A vacuum booster does not multiply without limit. At run-out, the diaphragm sees the full available pressure difference and cannot add more; additional pedal force then passes through at about the pedal ratio only. This is why stopping force at a very hard stop rises less quickly with extra leg force. A booster that has lost its vacuum is a different case: it adds no assist at all, so the pedal feels hard from the start. Real systems have losses from seal friction, hose expansion, caliper deflection and air, so the ideal results here are upper bounds. For specific bore sizes and ratios, consult the factory service manual.`,
      },
      {
        id: `${C}.l02`,
        title: 'Clamp Force, Braking Torque and Brake Factor',
        blurb: 'How clamp force becomes torque at the wheel, and why disc and drum brakes react differently to friction changes.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'fault-glazed',
        anchors: parts('caliper', 'brake_pads', 'rotor', 'brake_shoes', 'drum'),
        body: `A disc brake with a pad on each face of the rotor produces braking torque T = 2 x mu x F_clamp x r_eff. Here mu is the pad-to-rotor friction coefficient, F_clamp is the force with which each pad is pressed on the rotor (the same on both sides by Newton's third law), and r_eff is the effective radius, the distance from the rotor axis to the point where the friction force is taken to act, roughly the centroid of the pad contact patch. The factor 2 appears because there are two rubbing faces.

Continue the previous example. F_clamp = 13,670 N, mu = 0.40 and r_eff = 0.12 m. T = 2 x 0.40 x 13,670 x 0.12 = 1,312 N m. With a tire radius R = 0.32 m, the braking force at the road, if the tire holds, is T / R = 1,312 / 0.32 = 4,100 N for that wheel. This must be compared with the limit the tire can supply, mu_tire x F_z, a topic of the next lesson.

The brake factor BF (or C-star) is the ratio of total friction force at the rubbing surface to the actuating force. For a disc, BF = 2 x mu, so mu = 0.40 gives 0.80. It is a linear function of mu: if mu falls 20 percent, from 0.40 to 0.32, torque falls by the same 20 percent, from 1,312 to about 1,050 N m. This predictable behavior is a major reason discs became dominant.

Drum brakes use geometry to add help. In a leading-trailing design, the leading shoe is dragged into the drum, so friction itself adds to the apply force (self-energizing), and the brake factor is greater than that of a disc at the same actuating force. A duo-servo drum uses the primary shoe to push the secondary shoe and gets higher brake factor still. The cost is sensitivity: BF rises faster than linearly with mu, so a drum can grab if friction rises and fade more sharply if friction falls, and wet or contaminated linings change effort noticeably.

Pad changes of mu with temperature, wear and moisture are why friction ratings are published as temperature-dependent ranges. Treat a catalog friction rating as a guide, not a guarantee, and follow the manufacturer's pad requirements.`,
      },
      {
        id: `${C}.l03`,
        title: 'Weight Transfer and Brake Force Distribution',
        blurb: 'Axle loads during braking, the ideal front/rear split and why proportioning exists.',
        minutes: 13,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('proportioning_valve', 'abs_hcu', 'rotor', 'drum', 'brake_line'),
        body: `Braking shifts load from the rear axle to the front axle. For a vehicle of weight W, wheelbase L, center of gravity height h and distance b from the center of gravity to the rear axle, the dynamic front axle load at deceleration a_g (expressed in g) is F_zf = W x (b/L + a_g x h/L) and the rear is F_zr = W x ((L - b)/L - a_g x h/L). Each tire can transmit a longitudinal force up to about mu_tire x F_z, so the ideal split of braking force follows the load.

Worked example, illustrative numbers: mass 1,500 kg so W = 1,500 x 9.81 = 14,715 N; L = 2.70 m; b = 1.50 m; h = 0.55 m. Static front share = b/L = 0.5556, so static front load 8,175 N. At a_g = 0.8, the transfer term is 0.8 x 0.55 / 2.70 = 0.1630, so F_zf = 14,715 x (0.5556 + 0.1630) = 14,715 x 0.7185 = about 10,573 N (71.9 percent), and F_zr = 4,142 N (28.1 percent). At a_g = 0.4, the transfer term is 0.0815, so the front share is 63.7 percent and the rear 36.3 percent.

The ideal split therefore moves toward the front as deceleration rises. A fixed hydraulic split cannot match this at every level, so designers choose a front-biased compromise and then limit rear pressure at high line pressure with a proportioning valve, or use electronic brake force distribution (EBD) which trims rear pressure using wheel speed signals. Loading also matters: a heavy load behind the rear axle changes b and h, so the ideal split changes. Some vehicles use load-sensing valves for that reason.

If the rear brakes exceed the ideal share, the rear wheels lock first. A locked rear axle loses lateral force, and the vehicle can spin. If the front brakes exceed the ideal share, the front locks first, steering is lost but the vehicle remains straighter. This is why designers err toward front lock-up first, and why a failed proportioning valve or contaminated rear brakes is a safety issue. ABS reduces the danger but does not repeal the physics. Specific bias and valve settings belong to the manufacturer, so use the factory service manual.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l01`, 1, 2, `Using the lesson's example, a 150 N foot force goes through a 4.5:1 pedal and a booster with assist ratio 4. What force acts on the master cylinder piston?`, [`2,700 N`, `675 N`, `600 N`, `13,670 N`], 0, `Multiply the ratios in order.`, `150 x 4.5 = 675 N at the pushrod, then 675 x 4 = 2,700 N at the master cylinder piston.`),
    mcq(`${C}.l01`, 2, 2, `A master cylinder piston with 452.4 mm squared of area receives 2,700 N. What is the line pressure?`, [`About 5.97 MPa`, `About 0.17 MPa`, `About 1.22 MPa`, `About 59.7 MPa`], 0, `Pressure is N per mm squared when area is in mm squared.`, `2,700 N / 452.4 mm squared = 5.97 N per mm squared, which is 5.97 MPa or about 59.7 bar.`),
    mcq(`${C}.l01`, 3, 3, `A caliper piston has a 54 mm diameter and the master cylinder bore is 24 mm. At equal pressure, how much larger is the caliper piston force than the master cylinder force?`, [`About 5.06 times`, `About 2.25 times`, `About 1.5 times`, `About 12.8 times`], 0, `Force scales with area, which scales with diameter squared.`, `The area ratio is (54/24) squared = 5.0625, so the caliper piston force is about 5.06 times the master cylinder force.`),
    mcq(`${C}.l01`, 4, 3, `The caliper piston moves about how far compared with the master cylinder piston, ignoring compliance and other pistons, in the same example?`, [`About 1/5 as far`, `About 5 times as far`, `The same distance`, `About 2.25 times as far`], 0, `Volume of fluid displaced is conserved.`, `Equal fluid volume moves a piston with 5.06 times the area only 1/5.06 as far, which is the trade for the extra force.`),
    mcq(`${C}.l01`, 5, 2, `What happens at the run-out point of a vacuum booster?`, [`The assist is used up, so extra pedal force adds only at about the pedal ratio`, `The booster doubles its assist ratio to give the driver more help at hard stops`, `The booster stops working until the engine is restarted and vacuum rebuilds`, `The master cylinder bypasses the booster and sends fluid straight to the calipers`], 0, `The diaphragm already sees the full pressure difference.`, `At run-out the available pressure difference is fully used, so more pedal force adds only through the lever ratio.`),
    mcq(`${C}.l01`, 6, 2, `Why do real systems deliver somewhat less clamp force than the ideal chain calculation?`, [`Seal friction, hose expansion and caliper deflection absorb some of the input`, `Brake fluid loses mass each time it is pressurized`, `Pascal's principle fails whenever pressure exceeds one bar`, `The piston area changes with the color of the fluid`], 0, `Ideal results are upper bounds.`, `Losses and compliance in seals, hoses and the caliper body mean actual force and pedal feel fall below the ideal numbers.`),

    mcq(`${C}.l02`, 1, 1, `Why does the disc brake torque equation contain a factor of 2?`, [`There are two rubbing faces, one on each side of the rotor`, `The rotor turns twice for every turn of the wheel it is bolted to`, `Two caliper pistons always act on each pad, doubling the force`, `The fluid pressure doubles when it passes through the caliper bridge`], 0, `Count the pads.`, `A pad presses on each face of the rotor, so friction acts at two surfaces.`),
    mcq(`${C}.l02`, 2, 2, `With F_clamp 13,670 N, mu 0.40 and r_eff 0.12 m, what is the braking torque of one disc brake?`, [`About 1,312 N m`, `About 656 N m`, `About 3,281 N m`, `About 11,000 N m`], 0, `T = 2 mu F r.`, `2 x 0.40 x 13,670 x 0.12 = 1,312 N m, which is double the single-pad figure of 656 N m.`),
    mcq(`${C}.l02`, 3, 2, `If that wheel develops 1,312 N m and the tire radius is 0.32 m, what braking force acts at the road, assuming the tire holds?`, [`About 4,100 N`, `About 420 N`, `About 1,312 N`, `About 8,200 N`], 0, `Divide torque by radius.`, `Force at the road equals torque divided by tire radius, so 1,312 N m / 0.32 m = about 4,100 N.`),
    mcq(`${C}.l02`, 4, 3, `Friction coefficient falls from 0.40 to 0.32 because of pad fade. By what percentage does disc brake torque fall, other factors unchanged?`, [`20 percent, because torque is proportional to mu`, `36 percent, because torque goes with mu squared`, `8 percent, because only 0.08 is lost`, `It does not change, because pressure compensates`], 0, `BF is 2 mu for a disc.`, `For a disc, torque is linear in mu, so a 20 percent drop in mu gives a 20 percent drop in torque, from about 1,312 to 1,050 N m.`),
    mcq(`${C}.l02`, 5, 3, `Why is a drum brake generally more sensitive to changes in friction than a disc brake?`, [`Self-energizing makes its brake factor rise faster than linearly with mu`, `Its drum is always heavier than a rotor, so it stores more heat per stop`, `It operates at lower fluid pressure, which amplifies small friction changes`, `Its linings are always organic, which makes them swing with humidity`], 0, `Think about the leading shoe.`, `The friction on a leading shoe helps apply it, so small changes in mu produce a larger change in torque.`),
    tf(`${C}.l02`, 6, 1, `A published pad friction rating guarantees the same mu under all temperatures and moisture conditions.`, 1, `Friction changes with conditions.`, `Friction varies with temperature, wear and moisture, so ratings are guides rather than guarantees.`),

    mcq(`${C}.l03`, 1, 1, `During braking, axle load generally`, [`shifts toward the front axle`, `shifts toward the rear axle`, `stays equal at both axles`, `moves toward the outer wheels`], 0, `Think of the nose of the car dipping.`, `Deceleration pitches the vehicle forward, increasing front axle load and decreasing rear axle load.`),
    mcq(`${C}.l03`, 2, 2, `In the example with W = 14,715 N, L = 2.70 m, b = 1.50 m and h = 0.55 m, what is the static front axle share of weight?`, [`About 55.6 percent`, `About 44.4 percent`, `About 71.9 percent`, `About 50.0 percent`], 0, `Front share is b divided by L.`, `b/L = 1.50 / 2.70 = 0.5556, so 55.6 percent of the weight is on the front axle at rest.`),
    mcq(`${C}.l03`, 3, 3, `For the same vehicle at a deceleration of 0.8 g, what is the ideal share of braking force on the front axle?`, [`About 72 percent`, `About 56 percent`, `About 64 percent`, `About 28 percent`], 0, `Ideal split follows dynamic load.`, `F_zf share = 0.5556 + 0.8 x 0.55 / 2.70 = 0.5556 + 0.1630 = 0.7185, about 72 percent.`),
    mcq(`${C}.l03`, 4, 3, `At 0.4 g the same vehicle has an ideal front share near 63.7 percent. What does this show about a fixed hydraulic front/rear split?`, [`It cannot be ideal at every deceleration, so valves or EBD refine it`, `It is ideal at every deceleration, since weight transfer is zero when braking`, `It should always be 50/50 regardless of load or deceleration level`, `It only matters when the vehicle is stopped on a steep slope`], 0, `Compare 0.4 g with 0.8 g.`, `The ideal front share changes with deceleration (63.7 percent at 0.4 g, 71.9 percent at 0.8 g), so a fixed split compromises, and proportioning or EBD trims rear pressure.`),
    mcq(`${C}.l03`, 5, 2, `If the rear brakes receive more than the ideal share and lock first, what is the most likely vehicle response?`, [`Loss of rear lateral grip and a risk of spinning`, `Better steering response because the front tires unload`, `Lower rotor temperatures because the rear brakes stop working`, `No change, since the front tires carry all the lateral force`], 0, `A sliding rear axle cannot resist sideways motion.`, `A locked rear axle loses lateral force, so the tail can slide out, which is why rear lock-up must come after front lock-up.`),
    tf(`${C}.l03`, 6, 2, `Electronic brake force distribution can take over the work of a mechanical proportioning valve using wheel speed signals and the ABS modulator.`, 0, `It borrows ABS hardware.`, `EBD trims rear pressure with the ABS valves rather than a fixed mechanical valve.`),
  ],
};

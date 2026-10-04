import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-hs';

export const PART: CoursePart = {
  track: {
    id: `${C}.t1`,
    title: 'The Hydraulic Brake System',
    blurb: 'Pressure, area and force, the master cylinder, power boosters, lines and brake balance.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: `${C}.l01`,
        title: 'Hydraulic Principles: Force, Pressure and Area',
        blurb: 'Pressure equals force divided by area, and a worked pedal-to-caliper example.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('brake_pedal', 'pushrod', 'master_cylinder', 'caliper_piston', 'brake_fluid'),
        body: `Hydraulic brakes rely on one relationship: pressure equals force divided by area (P = F / A). Brake fluid is nearly incompressible and the system is sealed, so pressure created at the master cylinder is the same pressure that reaches every caliper piston and wheel cylinder. Force at any piston is then pressure times that piston's area (F = P x A).

Here is a worked example with illustrative numbers, not specifications. The driver pushes with 40 lbf. The pedal is a lever with a 4:1 ratio, so the pushrod sees 40 x 4 = 160 lbf. Suppose the booster multiplies that by 3, so the master cylinder piston receives 480 lbf. The master cylinder bore is 1.0 in, so its area is pi x 0.5 squared = 0.7854 in squared. Line pressure is 480 / 0.7854 = about 611 psi.

A caliper piston with a 2.0 in diameter has an area of pi x 1.0 squared = 3.1416 in squared. The force it makes is 611 x 3.1416 = about 1,920 lbf. That equals 480 x 4, because the piston areas differ by a ratio of 4 (2.0 squared over 1.0 squared).

There is a trade. Volume is conserved, so the larger piston moves only one quarter as far as the master cylinder piston, in this single-piston case. A larger bore gives more force but needs more fluid movement, which is why master cylinder and caliper sizes must be matched to each other by the manufacturer.`,
      },
      {
        id: `${C}.l02`,
        title: 'The Master Cylinder and Reservoir',
        blurb: 'A dual-circuit pump that turns pedal force into line pressure.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-air-in-lines',
        anchors: parts('master_cylinder', 'fluid_reservoir', 'brake_light_switch', 'brake_fluid'),
        body: `Modern master cylinders are tandem (dual) designs: two pistons in one bore, called the primary and the secondary, each feeding a separate hydraulic circuit. Circuits are commonly split front/rear or diagonally, depending on the vehicle. If one circuit loses fluid, the other can still brake the vehicle, though the pedal travels farther and stopping distance grows.

The fluid reservoir sits on top and feeds both circuits. Many reservoirs are divided so a leak in one circuit cannot drain the other. Small passages (ports) let fluid refill the bore when the pedal is released, and let fluid return to the reservoir as it expands with heat. As pads wear, the level in the reservoir drops slowly, because caliper pistons sit farther out. A level that falls quickly points to a leak, and the correct answer is to find the leak, not to keep topping off.

Internal seals can wear. When the primary seal leaks past the piston, the pedal may slowly sink under steady foot pressure even though there is no external leak. Fluid may also appear on the booster side of the master cylinder, which points to the rear seal.

Brake fluid level and pressure-differential switches can light the red brake warning lamp. The brake light switch is a separate part: it is operated by the pedal and turns on the rear stop lamps. Always bench-bleed or follow the factory procedure for a replacement master cylinder before installing it.`,
      },
      {
        id: `${C}.l03`,
        title: 'Power Brake Boosters: Vacuum, Hydraulic and Electric',
        blurb: 'How each booster type adds force, and how to test for loss of assist.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-vacuum-loss',
        anchors: parts('brake_booster', 'pushrod', 'brake_pedal', 'master_cylinder'),
        body: `The booster sits between the pedal pushrod and the master cylinder and reduces the effort the driver needs. There are three common types.

A vacuum booster has a large diaphragm. When the pedal is pressed, a valve admits outside air to one side while the other side stays connected to vacuum, and the pressure difference across the diaphragm pushes on the master cylinder. Gasoline engines make vacuum in the intake manifold; engines that do not make enough, such as many diesels, use a separate vacuum pump. A one-way check valve in the vacuum hose keeps stored vacuum in the booster after the engine stops.

A hydraulic booster, often called hydro-boost, uses pressurized fluid from the power steering pump or a dedicated pump and an accumulator. An electric booster uses a motor to push on the master cylinder and is common on hybrid and electric vehicles, where there is no engine vacuum.

Typical vacuum booster test: with the engine off, pump the pedal several times to use up stored vacuum. Hold moderate pressure on the pedal and start the engine. The pedal should drop slightly as assist returns. A pedal that stays rock hard suggests loss of assist, which may come from a leaking hose, a failed check valve or a ruptured diaphragm. Listen for a hiss near the pedal. Loss of assist does not mean loss of brakes, but it does mean longer stopping distance for the same effort.`,
      },
      {
        id: `${C}.l04`,
        title: 'Lines, Hoses and Brake Balance',
        blurb: 'Where the fluid travels, and why the rear brakes get less pressure.',
        minutes: 8,
        asOf: '2026-10',
        anchors: parts('brake_line', 'flex_hose', 'proportioning_valve', 'master_cylinder'),
        body: `Rigid brake lines are made of steel tubing, often with a protective coating, joined by flared fittings that must be formed and seated correctly. Never replace a brake line with ordinary plumbing tube or a fitting that is not rated for brake pressure. Flexible hoses connect the chassis lines to the moving suspension and steering at each wheel. Hoses can crack on the outside, swell internally so that fluid goes out but returns slowly (which makes a brake drag), or bulge under pedal pressure. Inspect them for cracks, chafing, leaks and kinks.

When a vehicle brakes, weight shifts toward the front axle, so the front tires can carry more braking force and the rear tires carry less. If front and rear brakes got equal pressure, the rear wheels would lock first and the vehicle could become unstable. Designers handle this with brake balance: larger front brakes, and in many older vehicles a proportioning valve that limits pressure rise to the rear above a certain line pressure. Many newer vehicles with ABS use electronic brake force distribution instead, which uses the ABS modulator to trim rear pressure.

A combination valve may bundle a proportioning section, a metering section that briefly holds back the front discs until rear drum shoes have started to move, and a differential-pressure switch for the warning lamp. Replacement parts must match the original vehicle, because the valve is part of the brake balance design.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l01`, 1, 1, `Which expression gives the pressure in a hydraulic brake line?`, [`Force multiplied by area`, `Force divided by area`, `Area divided by force`, `Force plus area`], 1, `Think of pounds per square inch.`, `Pressure is force divided by area (P = F / A), which is why units such as psi (pounds per square inch) are used.`),
    mcq(`${C}.l01`, 2, 2, `A master cylinder piston receives 480 lbf and has an area of 0.7854 in squared. About what line pressure does it make?`, [`380 psi`, `611 psi`, `755 psi`, `1,920 psi`], 1, `Divide force by area.`, `480 divided by 0.7854 is about 611 psi, and that pressure is the same everywhere in the sealed system, ignoring small losses.`),
    mcq(`${C}.l01`, 3, 3, `The same 611 psi acts on a caliper piston with 3.1416 in squared of area. About how much force does that piston produce?`, [`1,920 lbf, since force equals pressure times area`, `195 lbf, since the larger piston divides the force`, `611 lbf, since pressure and force are always equal`, `480 lbf, the same as the master cylinder piston`], 0, `Force equals pressure times area.`, `611 x 3.1416 is about 1,920 lbf, four times the master cylinder force because the piston area is four times as large.`),
    mcq(`${C}.l01`, 4, 3, `In the worked example, the caliper piston has four times the area of the master cylinder piston. What is the trade for the extra force?`, [`The caliper piston moves only about one quarter as far`, `The fluid pressure falls to a quarter of its original value`, `The pedal ratio automatically changes to 1:4 to compensate`, `The brake fluid must boil at a lower temperature to keep the volume constant`], 0, `Fluid volume is conserved.`, `The same volume of fluid moves a piston with four times the area one quarter as far, so more force means less travel.`),
    mcq(`${C}.l01`, 5, 2, `A pedal has a 4:1 lever ratio and the driver pushes with 50 lbf. How much force reaches the pushrod, ignoring the booster?`, [`12.5 lbf`, `54 lbf`, `200 lbf`, `250 lbf`], 2, `Multiply by the ratio.`, `A 4:1 lever multiplies the foot force by four, so 50 x 4 = 200 lbf at the pushrod.`),
    tf(`${C}.l01`, 6, 2, `In a sealed hydraulic brake system, line pressure is ideally the same at the master cylinder and at the caliper pistons.`, 0, `Pascal's principle.`, `In a closed incompressible fluid, pressure is transmitted equally, so each piston's force differs only because its area differs.`),

    mcq(`${C}.l02`, 1, 1, `Why do modern master cylinders have two pistons and two circuits?`, [`To double the fluid pressure available at each wheel brake`, `To keep some braking available if one hydraulic circuit fails`, `To make the pedal feel softer at low speeds`, `To remove the need for a power brake booster`], 1, `Think about redundancy.`, `A tandem design means one hydraulic circuit can still work if the other leaks, though braking is weaker.`),
    mcq(`${C}.l02`, 2, 2, `A brake fluid reservoir level drops a little at a time over many months as the pads wear. What is the most likely explanation?`, [`The master cylinder gradually turns the fluid into vapor that leaves through the vent`, `The caliper pistons sit farther out, so more fluid fills the calipers`, `The booster slowly absorbs fluid through its diaphragm as it ages`, `The brake light switch leaks a little fluid every time the pedal is pressed`], 1, `Think about pistons moving out as friction material thins.`, `As pads wear, caliper pistons extend farther, which holds more fluid out in the calipers, so the reservoir level gradually falls.`),
    mcq(`${C}.l02`, 3, 2, `A technician sees the level in the reservoir falling fast and no visible leak at the wheels. What should be checked next?`, [`Where the master cylinder mounts to the booster, and the carpet under the dash`, `Only at the rear drums, because front calipers cannot leak internally`, `The power steering pump, since it shares fluid with the brake system`, `The fuel tank, since brake fluid is returned there when the booster fails`], 0, `Fluid can leak into places you cannot see from outside.`, `A failing rear seal in the master cylinder can leak fluid into the booster, so the area where the cylinder meets the booster must be inspected.`),
    mcq(`${C}.l02`, 4, 3, `A pedal slowly sinks to the floor under steady pressure, with the fluid level normal and no leaks outside. Which cause is most consistent?`, [`A worn internal master cylinder seal letting fluid bypass`, `A seized rear slide pin that keeps a pad pressed against the rotor`, `A glazed pad surface that has hardened from earlier overheating`, `A damaged tone ring that sends the ABS module the wrong speed`], 0, `Fluid is going somewhere inside the master cylinder.`, `Internal bypass lets fluid slip past the piston seals under pressure, so the pedal sinks even without an external leak.`),
    mcq(`${C}.l02`, 5, 2, `What is the correct reaction to a reservoir that needs fluid again and again?`, [`Keep topping it off to the maximum line each week`, `Find and repair the source of fluid loss`, `Switch to a thicker fluid`, `Disconnect the warning lamp`], 1, `Fluid does not simply get used up.`, `A system that loses fluid has a leak or a fault, and the right fix is to find and repair it rather than keep adding fluid.`),
    mcq(`${C}.l02`, 6, 1, `Which part is operated by the brake pedal to turn on the rear stop lamps?`, [`The brake light switch`, `The proportioning valve`, `The fluid reservoir level sensor`, `The ABS control module`], 0, `It is a pedal-operated switch.`, `The brake light switch is operated by the pedal and turns on the stop lamps; it does not measure hydraulic pressure.`),

    mcq(`${C}.l03`, 1, 1, `Which source of assist does a typical gasoline-engine vacuum booster use?`, [`Pressure from the power steering pump acting on an accumulator`, `A pressure difference between engine vacuum and outside air`, `An electric motor mounted directly on the brake pedal`, `Heat from the exhaust expanding a sealed chamber`], 1, `The word vacuum is in the name.`, `A vacuum booster uses the difference between manifold vacuum on one side of a diaphragm and outside air on the other.`),
    mcq(`${C}.l03`, 2, 1, `Which vehicles most commonly use an electric booster?`, [`Older carbureted trucks that always had manual brakes`, `Hybrid and electric vehicles with no engine vacuum`, `Only race cars that are driven on a closed track`, `Vehicles with drum brakes at all four wheels`], 1, `Think about vehicles that may not run an engine.`, `Electric boosters supply assist without engine vacuum, so they suit hybrids and electric vehicles.`),
    mcq(`${C}.l03`, 3, 2, `With the engine off, you pump the pedal several times, hold light pressure and start the engine. What should a healthy vacuum booster do?`, [`The pedal drops slightly as assist returns`, `The pedal becomes harder`, `The pedal pulses with each engine revolution`, `Nothing at all should change`], 0, `Vacuum is restored when the engine starts.`, `The pedal should sink slightly as the engine builds vacuum and the diaphragm starts assisting.`),
    mcq(`${C}.l03`, 4, 3, `A driver reports a very hard pedal and a hiss near the pedal when braking. Which fault fits best?`, [`A leak in the booster diaphragm or vacuum supply`, `A stuck slide pin that keeps one pad dragging`, `A glazed rotor surface left from earlier overheating`, `A dirty tone ring that confuses one wheel sensor`], 0, `A hiss suggests air moving where it should not.`, `Leaking vacuum components cause hissing and loss of assist, so the pedal needs far more effort even though the hydraulic brakes still function.`),
    mcq(`${C}.l03`, 5, 2, `What is the job of the one-way check valve in a vacuum booster hose?`, [`It filters moisture out of the brake fluid`, `It holds stored vacuum when engine vacuum drops`, `It regulates line pressure to the rear brakes`, `It switches on the brake lights when the pedal moves`], 1, `Vacuum should not drain back into the engine.`, `The check valve keeps stored vacuum in the booster so a few assisted stops are possible even after engine vacuum falls or the engine stops.`),
    tf(`${C}.l03`, 6, 2, `Losing booster assist means the hydraulic brakes no longer work at all.`, 1, `Think about what the booster adds.`, `Without assist the brakes still work but the pedal is very hard and stopping needs far more driver force.`),

    mcq(`${C}.l04`, 1, 1, `Why do brake systems use flexible hoses at each wheel?`, [`Steel is too weak to carry brake fluid at pressure`, `The wheels move with the suspension and steering`, `Hoses are lighter than steel and reduce unsprung weight`, `The hose helps to cool the fluid before it reaches the caliper`], 1, `Look at what each wheel does over bumps.`, `Hoses allow the wheel to move up, down and steer without breaking a rigid line.`),
    mcq(`${C}.l04`, 2, 2, `A flex hose swells inside and acts like a one-way valve. What symptom might result?`, [`The pedal pulses at idle as the engine speed changes`, `A wheel drags after release because pressure cannot return`, `The brake light stays dark until the pedal is fully pressed`, `The booster hisses each time the pedal is released`], 1, `Fluid goes out but does not come back easily.`, `A collapsed or swollen inner lining can trap pressure at one wheel, so that brake keeps rubbing and may overheat.`),
    mcq(`${C}.l04`, 3, 2, `Why does weight transfer matter for brake balance?`, [`Load shifts forward, so front tires can use more braking force`, `Load shifts rearward, so the rear tires can use more braking force`, `Load stays evenly spread, so equal pressure suits all four tires`, `Load shifts to the outside tires only, so left and right pressure differ`], 0, `Think about passengers leaning forward.`, `Braking shifts load forward, so the front tires can handle more braking force, and the rear brakes are given less to avoid early lockup.`),
    mcq(`${C}.l04`, 4, 3, `A customer asks the shop to fit a larger-bore replacement proportioning valve from a different vehicle because it was cheap. What is the best response?`, [`Install it, since all proportioning valves behave the same way`, `Decline: it is matched to the original brake balance design`, `Install it on the front circuit instead, where balance does not matter`, `Install it and disable the warning lamp to avoid false alarms`], 1, `Brake balance is designed for the vehicle.`, `Pressure limits and split points are tuned to the original vehicle, so a wrong valve can upset balance and cause early rear lockup.`),
    mcq(`${C}.l04`, 5, 2, `What does electronic brake force distribution do on many ABS vehicles?`, [`Uses the ABS modulator to trim rear pressure like a valve`, `Makes the front brakes lock first by adding pressure at the pedal`, `Replaces the master cylinder with an electric pump on all cars`, `Charges the battery by converting braking energy on every vehicle`], 0, `It borrows hardware from ABS.`, `EBD uses the ABS valves and wheel speed signals to trim rear pressure, which takes over the job of a mechanical proportioning valve.`),
    tf(`${C}.l04`, 6, 1, `Ordinary copper plumbing tube is an acceptable substitute for steel brake line if the diameter matches.`, 1, `Think about vibration and pressure ratings.`, `Brake lines must be a material and flare type designed for brake pressure and vibration; ordinary plumbing tube can crack or burst.`),
    mcq(`${C}.l01`, 7, 2, `A driver applies 30 lbf to a pedal with a 5:1 ratio, and the booster multiplies pushrod force by 3. What force reaches the master cylinder piston?`, [`450 lbf`, `150 lbf`, `90 lbf`, `600 lbf`], 0, `Multiply by the pedal ratio, then by the booster factor.`, `30 x 5 = 150 lbf at the pushrod, and 150 x 3 = 450 lbf on the master cylinder piston.`),
    mcq(`${C}.l03`, 7, 2, `A diesel engine makes little useful intake vacuum. Which assist arrangement is commonly used instead of manifold vacuum?`, [`A mechanical or electric vacuum pump, or a hydraulic booster`, `No assist is ever fitted to a diesel`, `A longer pedal arm only`, `A second master cylinder with no booster`], 0, `Think about what supplies the assist.`, `Diesels often use a dedicated vacuum pump, and some vehicles use hydraulic or electric boosters instead of intake vacuum.`),
  ],
};

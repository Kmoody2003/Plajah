import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-g68';

export const PART: CoursePart = {
  track: {
    id: `${C}.t2`,
    title: 'From Pedal to Wheel',
    blurb: 'Follow the push from your foot through the hydraulic system to disc and drum brakes.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: `${C}.l05`,
        title: 'The Path From Pedal to Wheel',
        blurb: 'Seven steps from your foot to a stopped wheel.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('brake_pedal', 'pushrod', 'brake_booster', 'master_cylinder', 'brake_line', 'flex_hose', 'caliper'),
        body: `Follow one brake application from start to finish. First, your foot pushes the brake pedal. The pedal lever pushes a pushrod. The pushrod goes into the brake booster, which adds extra force. The booster pushes on the master cylinder, a pump that pressurizes brake fluid. From the master cylinder, the fluid flows through steel brake lines that run along the underside of the vehicle.

Near each wheel the rigid steel line connects to a short flexible rubber brake hose, called a flex hose. The hose is flexible because the wheel moves up and down and turns left and right, and a rigid pipe would crack. At the wheel, the fluid pressure enters a brake caliper (on a disc brake) or a wheel cylinder (on a drum brake) and pushes on pistons. The pistons press friction material against a spinning surface, and the wheel slows.

Most cars split the hydraulic system into two separate circuits, so if one circuit loses fluid the other can still stop the car, though with weaker braking. That split is a safety design, not a reason to keep driving with a known leak.`,
      },
      {
        id: `${C}.l06`,
        title: 'Disc Brakes',
        blurb: 'A caliper squeezes pads on a spinning rotor, like a hand gripping a bicycle wheel rim.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('caliper', 'caliper_piston', 'brake_pads', 'rotor', 'hub'),
        body: `A disc brake has a flat metal disc, the rotor, bolted to the wheel hub so it spins with the wheel. Straddling the edge of the rotor is the caliper, which holds two brake pads, one on each side of the rotor. Inside the caliper is at least one piston. When brake fluid pressure pushes the piston out, the pads are clamped against both faces of the rotor and friction slows it.

Many calipers are floating calipers: the piston pushes one pad directly, and the caliper body slides on pins so it pulls the other pad against the far side. Other calipers hold pistons on both sides of the rotor and do not slide.

Disc brakes are open to the air, so heat escapes easily and water throws off the spinning rotor quickly. That is a big reason most cars use disc brakes at least on the front wheels, where most of the braking work is done when a car slows down. Pads wear away slowly with use and must be replaced before the metal backing plate touches the rotor.`,
      },
      {
        id: `${C}.l07`,
        title: 'Drum Brakes',
        blurb: 'Curved shoes push outward against the inside of a spinning drum.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'fault-drum-adjuster',
        anchors: parts('drum', 'wheel_cylinder', 'brake_shoes', 'return_springs', 'shoe_adjuster'),
        body: `A drum brake hides its parts inside a round metal drum that spins with the wheel. Inside sit two curved brake shoes covered with friction material. When fluid pressure reaches a small hydraulic cylinder called the wheel cylinder, its pistons push the shoes outward against the inside surface of the drum. Friction slows the drum and the wheel.

When the driver lets go of the pedal, return springs pull the shoes back so they stop touching the drum. As the friction material wears, the shoes sit farther from the drum, so many drum brakes have a self-adjuster that moves the shoes a little closer when needed. If the adjuster fails, the pedal may feel low because the shoes have farther to travel.

Drum brakes keep dust and water inside, which protects the parts but also traps heat. They cost less to build, so many cars use them on the rear wheels, where the brakes do less of the work. Many drum designs also include the parking brake mechanism.`,
      },
      {
        id: `${C}.l08`,
        title: 'Fluid, Reservoir and the Problem With Air',
        blurb: 'Why brake fluid must be clean, full and free of air bubbles.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'fault-air-in-lines',
        anchors: parts('fluid_reservoir', 'brake_fluid', 'bleeder_screw', 'master_cylinder'),
        body: `Brake fluid is stored in the fluid reservoir, a clear or marked container mounted on the master cylinder. As brake pads wear down, the caliper pistons move out slightly, so the fluid level in the reservoir slowly drops. A level that drops much faster than normal, or drops suddenly, can mean a leak.

Brake fluid absorbs water from the air over time. Water in the fluid lowers the temperature at which the fluid boils, and it can cause rust inside the system. Because of this, car makers list a service interval for changing the fluid. Check the owner's manual for your vehicle.

Air is the enemy of hydraulic brakes. A liquid is hard to squeeze, but air bubbles squeeze easily. If air gets into the lines, part of the pedal push goes into squeezing the bubbles rather than moving the pistons, so the pedal feels spongy or sinks closer to the floor. Technicians remove trapped air by bleeding the brakes. Each wheel has a small bleeder screw where air and old fluid can be let out while new fluid is pushed through.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l05`, 1, 1, `Which order correctly lists the parts that carry the push from your foot to the wheel brakes?`, [`Master cylinder, pedal, booster, brake line, wheel`, `Pedal, pushrod, booster, master cylinder, brake line, caliper`, `Booster, pedal, brake line, master cylinder, caliper`, `Caliper, brake line, master cylinder, booster, pushrod, brake pedal`], 1, `The push starts at your foot and ends at the wheel.`, `The push goes pedal to pushrod to booster to master cylinder, then fluid flows through brake lines to the caliper at the wheel.`),
    mcq(`${C}.l05`, 2, 1, `Why does the last stretch of line to each wheel use a flexible hose?`, [`Rubber makes the fluid colder`, `Hose is cheaper than steel, so makers use it to cut the cost of the whole system`, `The wheel moves up, down and sideways, so a rigid pipe would crack`, `Steel cannot hold brake fluid`], 2, `Think about how a wheel moves over bumps and when steering.`, `Wheels move with the suspension and steering, so the final connection needs to flex without breaking.`),
    mcq(`${C}.l05`, 3, 2, `A car's hydraulic system is split into two separate circuits. What is the safety reason?`, [`It makes the pedal feel firmer`, `It lets the system hold twice as much fluid, so the brakes can be used twice as hard`, `If one circuit leaks, the other may still be able to slow the car`, `It means the car never needs brake repairs`], 2, `Imagine one of the two circuits failing.`, `A split system keeps part of the braking available if one circuit fails, although stopping power is weaker.`),
    mcq(`${C}.l05`, 4, 2, `A driver learns of a brake fluid leak, but the second circuit still works. What is the best decision?`, [`Keep driving as usual, since the spare circuit makes the leak harmless for now`, `Get the leak repaired promptly, because the second circuit is only a backup`, `Drive normally until the fluid warning light turns red`, `Top up the reservoir each week and ignore the leak itself`], 1, `Safety design is a backup, not a permission.`, `The second circuit is only a backup for emergencies, and a leak will probably get worse, so the car needs repair promptly.`),

    mcq(`${C}.l06`, 1, 1, `In a disc brake, what is squeezed against the rotor to slow it?`, [`Brake shoes pressed outward`, `The fluid reservoir`, `Brake pads held by the caliper`, `The pushrod directly`], 2, `The rotor is clamped from both sides.`, `The caliper holds a pad on each side of the rotor, and the piston clamps the pads against it.`),
    mcq(`${C}.l06`, 2, 1, `Why do disc brakes handle heat and water well?`, [`The rotor is open to the air, so heat escapes and water flings off`, `They are sealed inside a metal housing that keeps heat in and water out for the pads`, `They never use friction`, `They have no moving parts at all`], 0, `Look at how exposed the rotor is.`, `The rotor spins in the open air, so heat is carried away and water is thrown off quickly.`),
    mcq(`${C}.l06`, 3, 2, `A technician says a floating caliper slides on pins. What does the sliding let it do?`, [`Pull the far pad against the rotor while the piston pushes the near pad`, `Change the brake fluid without a bleeder screw by letting the pistons push old fluid out`, `Let the rotor spin faster than the wheel`, `Hold the car still when the engine is off`], 0, `Only one side has a piston in a floating design.`, `The piston pushes one pad, and the caliper body slides on its pins so it pulls the other pad against the rotor.`),
    tf(`${C}.l06`, 4, 1, `Brake pads must be replaced before the metal backing plate wears down enough to touch the rotor.`, 0, `What would metal rubbing on metal do?`, `Worn-through pads let metal grind on the rotor, which damages it, reduces stopping power and costs more to fix.`),

    mcq(`${C}.l07`, 1, 1, `In a drum brake, the shoes push in which direction?`, [`Outward against the inside of the drum`, `Inward toward the axle`, `Sideways against a flat disc`, `Straight up toward the hood`], 0, `The shoes sit inside the drum.`, `Wheel cylinder pistons push the curved shoes outward so their friction material presses on the inside surface of the drum.`),
    mcq(`${C}.l07`, 2, 2, `What do the return springs in a drum brake do?`, [`Add extra clamping force during hard stops so the shoes press the drum with more pressure`, `Pull the shoes back away from the drum when the pedal is released`, `Store brake fluid until the next stop`, `Measure how worn the friction material is`], 1, `Think about what must happen when you let go of the pedal.`, `Return springs retract the shoes so they stop dragging on the drum after braking.`),
    mcq(`${C}.l07`, 3, 2, `A car's rear drum brakes have worn shoes and a stuck self-adjuster, and the pedal now feels low. The most likely reason is`, [`The shoes have farther to travel before touching the drum`, `The brake fluid has become too clean and slippery, so the shoes cannot grip the drum`, `The tires are rolling too fast`, `The booster is giving too much help`], 0, `Worn shoes sit farther from the drum.`, `If the adjuster does not take up the gap left by wear, the shoes must move farther before they grip, so the pedal drops lower.`),
    mcq(`${C}.l07`, 4, 1, `Why do many cars use cheaper drum brakes on the rear wheels?`, [`Rear brakes do less of the stopping work because weight shifts forward`, `Drums stop a car better than discs in every situation, so rear wheels get the best parts`, `Rear wheels never get warm, so heat is not a concern at all`, `Disc brakes cannot be fitted to any rear wheel safely`], 0, `Weight shifts forward when a car brakes.`, `Weight moves toward the front during braking, so front brakes do most of the work and cheaper rear drums are often enough.`),

    mcq(`${C}.l08`, 1, 1, `A brake fluid level that drops much faster than normal most likely suggests`, [`Cold weather`, `A possible leak`, `The pads are too thick`, `The tires are overinflated`], 1, `Fluid only leaves the system a few ways.`, `Fluid level falls slowly as pads wear, but a fast or sudden drop points to a leak that needs checking.`),
    mcq(`${C}.l08`, 2, 1, `Why is air in the brake lines a problem?`, [`Air makes the fluid thicker, so it cannot flow through the narrow brake lines`, `Air bubbles squeeze easily, so the pedal feels spongy`, `Air melts the rubber hoses`, `Air makes the pads wear faster`], 1, `Compare how easily air and liquid can be squeezed.`, `Air compresses, so part of the pedal motion is wasted squeezing bubbles instead of moving the pistons.`),
    mcq(`${C}.l08`, 3, 2, `Why do car makers list a service interval for changing brake fluid?`, [`Fluid turns into engine oil over time`, `Fluid only works for the first year after it is made`, `The fluid fills with brake dust over time, which blocks the lines and locks the pedal`, `Fluid absorbs moisture, which lowers its boiling point and can cause rust`], 3, `Think about what the fluid takes in from the air.`, `Brake fluid absorbs water over time, which lowers its boiling temperature and can corrode parts, so it is replaced on a schedule.`),
    tf(`${C}.l08`, 4, 1, `Technicians remove trapped air from the brake system by opening a bleeder screw at the wheel while fluid is pushed through.`, 0, `The screw is named for what it lets out.`, `Bleeding opens a small bleeder screw so air and old fluid leave while fresh fluid is pushed in.`),
  ],
};

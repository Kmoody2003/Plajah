import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-hs';

export const PART: CoursePart = {
  track: {
    id: `${C}.t2`,
    title: 'Friction Assemblies: Discs, Pads, Rotors and Drums',
    blurb: 'Caliper types, pad and rotor wear and measurement, and drum brake operation and adjustment.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: `${C}.l05`,
        title: 'Disc Brake Calipers: Floating and Fixed',
        blurb: 'How each design applies the pads, and why slide pins matter.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-stuck-slide-pin',
        anchors: parts('caliper', 'caliper_piston', 'piston_seal', 'caliper_bracket', 'slide_pins'),
        body: `A caliper converts hydraulic pressure into clamping force. Inside it, a caliper piston runs in a machined bore sealed by a piston seal, a square-section ring seated in a groove. A dust boot keeps dirt and water off the piston.

A floating (sliding) caliper has a piston on only one side, usually the inboard side. When pressure acts, the piston pushes the inner pad onto the rotor, and the same pressure on the closed end of the bore pushes the caliper body the opposite way, so the outer pad is pulled onto the rotor. The caliper body slides on slide pins, which ride in bushings in the caliper bracket, and that bracket is bolted to the steering knuckle or axle housing. A fixed caliper is bolted rigidly to the bracket and has pistons on both sides of the rotor, so it does not need to slide. Fixed calipers are costly but strong and are common on higher-performance applications.

The seal does more than keep fluid in. As pressure is released, the seal flexes slightly back to its resting shape and pulls the piston back a very small distance, giving the pad running clearance. This is called seal rollback. As pads wear, the piston slips farther through the seal, which keeps the clearance near constant.

Slide pins must move freely and be lubricated with the high-temperature grease the manufacturer specifies. A seized pin can leave one pad dragging, causing uneven pad wear, heat, a pull to one side and, if the pad drags enough, a burning smell. Worn bushings or missing hardware can cause clunks and noise.`,
      },
      {
        id: `${C}.l06`,
        title: 'Brake Pads, Friction Materials and Glazing',
        blurb: 'Pad types, wear indicators, bedding in and what glazing means.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-glazed',
        anchors: parts('brake_pads', 'pad_wear_indicator', 'rotor'),
        body: `A brake pad is friction material bonded or riveted to a steel backing plate. The material is a blend of fibers, fillers, lubricants and abrasives held in a resin, and no one formula is best for every use. Three broad families are common. Organic (non-asbestos organic) pads are generally softer and quiet. Semi-metallic pads contain metal fibers, tolerate heat well and may be noisier and more abrasive to the rotor. Ceramic pads are generally quiet, produce lighter-colored dust and are stable across temperatures, and often cost more. Choose a pad that meets the vehicle manufacturer's requirements; consult the factory service manual.

Wear is checked by measuring remaining friction material thickness, usually in millimeters, and comparing it with the manufacturer's service limit. Many pads have a wear indicator: a small metal tab that contacts the rotor when the pad is thin, producing a squeal. Some vehicles use an electrical wear sensor that triggers a dash message.

Glazing happens when pads are overheated or used lightly in a way that bakes the surface into a hard, shiny layer. A glazed pad has less grip, may squeal, and can lengthen stopping distance. The surface may appear polished and the rotor may show blue-ish heat discoloration. The cure is to correct the cause (a dragging caliper, wrong pad, hard use) and normally replace the pads and recondition or replace the rotor.

After new pads are fitted, many manufacturers call for a bedding-in (burnishing) procedure: a series of moderate stops that transfers an even layer of friction material to the rotor. Follow the pad maker's instructions, and always pump the pedal until firm before moving the vehicle.`,
      },
      {
        id: `${C}.l07`,
        title: 'Rotors: Thickness, Runout and Pulsation',
        blurb: 'Measuring a rotor with a micrometer and a dial indicator, with worked numbers.',
        minutes: 9,
        asOf: '2026-10',
        atlasScenario: 'fault-warped-rotor',
        anchors: parts('rotor', 'hub', 'brake_pads'),
        body: `A rotor is a heat sink as well as a friction surface. Many are vented: two friction faces joined by vanes that pump air. Every rotor has a minimum (discard) thickness, often cast or stamped on the hat or edge, such as MIN TH. Once worn below it, the rotor has less metal to absorb heat and is no longer safe to reuse.

Three measurements matter. Thickness is measured with a micrometer. Thickness variation (parallelism) is the difference between the thickest and thinnest readings taken at several evenly spaced points around the rotor, and it is a common cause of pedal pulsation because the pads are pushed in and out as the rotor turns. Lateral runout is how much a face wobbles side to side as it spins, measured with a dial indicator mounted on a stable point with the rotor installed on its hub, and compared with the manufacturer's limit. Excess runout, often from rust on the hub face or a poorly seated rotor, can cause uneven wear and later cause thickness variation.

Worked example (illustrative numbers). The stamped minimum is 22.0 mm and the rotor measures 22.4 mm. A technician considers resurfacing, which removes material from both faces, say 0.15 mm each. Final thickness = 22.4 - 0.15 - 0.15 = 22.1 mm. That is above 22.0 mm, so it is allowed once, but a second machining would not be. If a measurement had been 22.2 mm, machining 0.30 mm total would leave 21.9 mm, below the limit, so the rotor must be replaced.

The word warped is used often, but heat-related pulsation is frequently traced to uneven pad material deposits or thickness variation rather than a literally bent rotor. The rotor face and hub mating surface must be clean before installation.`,
      },
      {
        id: `${C}.l08`,
        title: 'Drum Brakes, Self-Adjusters and the Parking Brake',
        blurb: 'Shoe action, adjuster operation and how the parking brake applies the rear brakes.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-drum-adjuster',
        anchors: parts('drum', 'wheel_cylinder', 'brake_shoes', 'return_springs', 'shoe_adjuster', 'parking_brake_cable'),
        body: `In a drum brake, hydraulic pressure acts on pistons in the wheel cylinder, which push the brake shoes outward against the inside of the rotating drum. Return springs pull the shoes back when pressure is released. The leading shoe is dragged into the drum by the rotation, which helps apply it. This self-energizing effect gives drums strong braking for their size, but it also makes them more sensitive to friction changes, such as when grease or fluid contaminates a lining.

Because linings wear, the gap between shoe and drum would slowly grow. A self-adjuster, commonly a star-wheel screw moved by a lever or cable, takes up slack during use. On some designs it works when the vehicle is braked while reversing, or when the parking brake is applied. If an adjuster seizes, the pedal gets low and the rear brakes do less work. Adjuster repair is part of a normal drum service.

A leaking wheel cylinder lets fluid onto the shoes. Contaminated shoes must be replaced, and the leak repaired. Never blow brake dust off with compressed air; use an approved vacuum or wet cleaning method.

The parking brake is a separate mechanical system. A cable from the lever or pedal pulls an equalizer, then cables to each rear wheel, where a lever expands the shoes inside a drum, or a small drum inside a disc rotor, or acts on a rear caliper. Cables can stretch or seize. Some vehicles use an electronic parking brake with a motor on the caliper; those calipers often need a scan tool service mode before the piston is retracted. Follow the factory service manual.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l05`, 1, 1, `In a floating caliper, which statement is correct?`, [`Pistons sit on opposite sides and the body never moves relative to the bracket`, `A piston on one side pushes one pad; the body slides to bring in the other`, `The caliper body is fixed and the rotor slides sideways to meet the pads`, `Pressure moves both pads outward with no sliding parts involved`], 1, `Think about slide pins.`, `A floating caliper has a piston on one side, and the body slides on pins so the opposite pad is pulled onto the rotor.`),
    mcq(`${C}.l05`, 2, 2, `What does the caliper piston seal do besides keeping fluid in?`, [`It pulls the piston back slightly when pressure is released`, `It cools the brake fluid as it passes the piston and boot`, `It stops the pad from sliding sideways along the rotor`, `It sets the pedal height by limiting master cylinder travel`], 0, `It is called rollback.`, `The seal flexes back to its resting shape and pulls the piston back slightly, giving the pad running clearance.`),
    mcq(`${C}.l05`, 3, 2, `A technician finds one inner pad worn much faster than the outer pad on the same caliper. Which cause is most likely?`, [`A weak 12 volt battery that leaves the module underpowered`, `A sticking slide pin or hardware problem`, `Contaminated brake fluid in the reservoir`, `An over-torqued wheel on the same axle`], 1, `Uneven pad wear on one caliper is a mechanical clue.`, `If the caliper cannot slide freely, one pad stays pressed on the rotor and wears faster.`),
    mcq(`${C}.l05`, 4, 3, `A car pulls to the right under light braking and the right front wheel is much hotter than the left after a drive. Which finding best fits?`, [`A seized right front slide pin or piston dragging the pad`, `A worn left front tone ring that misreads wheel speed`, `A weak vacuum booster check valve that lets assist leak away`, `A failed brake light switch at the top of the pedal`], 0, `Heat means constant friction.`, `A dragging pad rubs constantly, creating heat, and can make the brake apply on that side even when the pedal is light.`),
    mcq(`${C}.l05`, 5, 2, `Which lubricant is appropriate on slide pins?`, [`Any multipurpose chassis grease, since all greases tolerate heat equally`, `The high-temperature brake grease the manufacturer specifies`, `Engine oil, applied sparingly to the pin and boot`, `Penetrating spray, left on to keep the pin loose`], 1, `Heat and rubber boots are both concerns.`, `Pins need a grease rated for brake temperatures and compatible with rubber boots, as the manufacturer specifies.`),
    mcq(`${C}.l05`, 6, 1, `Which description matches a fixed caliper?`, [`Pistons on both sides of the rotor, bolted rigidly so it does not slide`, `A single piston on the inboard side with the body riding on slide pins`, `A caliper that clamps the rotor with no pistons at all`, `A caliper mounted on the wheel and spun with the tire`], 0, `Fixed means it does not move on pins.`, `A fixed caliper has opposed pistons on both sides of the rotor and is bolted rigidly to the bracket, so it has no sliding body.`),

    mcq(`${C}.l06`, 1, 1, `What does a squealing brake pad wear indicator tab tell you?`, [`The pad is thin and needs inspection`, `The brake fluid is due for replacement soon`, `The tire pressure is low on that corner`, `The booster is losing vacuum at idle`], 0, `It touches the rotor on purpose.`, `The tab contacts the rotor when the pad material is thin, making a noise to warn the driver.`),
    mcq(`${C}.l06`, 2, 2, `Which statement best describes ceramic pads in general?`, [`Quiet with light-colored dust, but often higher in price`, `Very abrasive on rotors, noisy, and the dustiest choice`, `Always the lowest cost and wear the fastest of all pads`, `Designed only for racing, and unsafe in everyday driving`], 0, `Think of trade-offs.`, `Ceramic pads are generally quiet with light dust and stable behavior, but cost is often higher, and the correct pad is one the vehicle maker approves.`),
    mcq(`${C}.l06`, 3, 2, `A pad surface looks shiny and hard, and the car squeals and stops weakly after repeated hard use. What is the likely diagnosis?`, [`Glazed pads from overheating`, `Pads contaminated with brake fluid on the surface`, `A cracked caliper bracket allowing pad movement`, `A seized wheel bearing on that axle`], 0, `Heat can bake the surface.`, `Overheating bakes the friction surface into a hard, glossy layer that grips poorly and often squeals.`),
    mcq(`${C}.l06`, 4, 3, `After replacing glazed pads, the glazing returns in a few weeks. What should the technician consider?`, [`Fit even harder pads and tell the customer glazing is normal wear`, `Look for a root cause such as a dragging caliper or unsuitable compound`, `Replace the pads again and move on without any further checks`, `Lubricate the pad faces with grease so they stop squealing`], 1, `Treat the cause, not just the symptom.`, `Repeat glazing points to excess heat, so the technician should find the cause, such as drag or an unsuitable material.`),
    mcq(`${C}.l06`, 5, 2, `Why is bedding in (burnishing) done after fitting new pads?`, [`To transfer an even layer of pad material to the rotor`, `To burn off the oil film that coats a new hub bearing`, `To compress the caliper piston seal to its final shape`, `To test the booster under load before the road test`], 0, `The pad and rotor need to mate.`, `A controlled series of moderate stops deposits an even layer of friction material on the rotor, which supports smooth braking.`),
    mcq(`${C}.l06`, 6, 1, `Which rule should guide the choice of replacement pads?`, [`Pick any pad as long as it fits the caliper bracket`, `Choose whichever pad is quietest, whatever the maker specifies`, `Use pads that meet the vehicle maker's requirements`, `Always choose the pad with the thickest backing plate`], 2, `Safety systems follow specifications.`, `The pad should meet the vehicle maker's requirements; noise and dust are factors, but not the only ones.`),

    mcq(`${C}.l07`, 1, 1, `What does the minimum thickness stamped on a rotor mean?`, [`The thickness at which the rotor must be discarded`, `The thickness of a brand-new rotor as measured at the factory`, `The thickness the pad must have when it first touches the rotor`, `The thickness of the hub face where the rotor seats`], 0, `Also called discard thickness.`, `Below that thickness, a rotor has too little metal to handle heat safely and must be replaced.`),
    mcq(`${C}.l07`, 2, 2, `Which tool measures lateral runout of a rotor face?`, [`A micrometer`, `A dial indicator`, `A feeler gauge on the pad`, `A tire gauge`], 1, `It reads side-to-side wobble.`, `A dial indicator on a stable mount reads how much the face moves in and out as the rotor spins.`),
    mcq(`${C}.l07`, 3, 3, `A rotor is stamped MIN TH 22.0 mm and measures 22.4 mm. A machine cut removes 0.15 mm from each face. What is the result?`, [`22.1 mm, above the limit, so this one cut is allowed`, `21.8 mm, below the limit, so the rotor must be replaced`, `22.25 mm, so a second cut of the same size is also possible`, `22.55 mm, because machining a face can add a little metal`], 0, `22.4 minus 0.30 total.`, `22.4 - 0.15 - 0.15 = 22.1 mm, which is above the 22.0 mm minimum, so one cut is allowed; a second identical cut would leave 21.8 mm and fail.`),
    mcq(`${C}.l07`, 4, 3, `Which measurement is the most direct cause of pedal pulsation during braking?`, [`Variation in rotor thickness around its circumference`, `Pad friction material that is too soft for the rotor`, `A booster pushrod that is a little too long`, `Caliper pistons that retract slightly too far each time`], 0, `Pads get pushed in and out.`, `If the thickness varies around the rotor, the pads are pushed back and forth on each revolution, which the driver feels as pulsation.`),
    mcq(`${C}.l07`, 5, 2, `Why must the hub face be cleaned of rust before installing a rotor?`, [`Rust adds weight`, `Debris can tilt the rotor and create runout`, `Rust makes the fluid boil`, `Clean hubs make the pads last longer by cooling the fluid`], 1, `Think about a rotor seating flat.`, `Rust or dirt between hub and rotor holds the rotor slightly crooked, so runout appears and wear becomes uneven.`),
    tf(`${C}.l07`, 6, 2, `Pulsation can often be traced to thickness variation or pad deposits rather than a literally bent rotor.`, 0, `The word warped is common but not always exact.`, `Uneven wear and deposits change effective thickness, so measuring thickness variation and runout is more reliable than assuming warping.`),

    mcq(`${C}.l08`, 1, 1, `Which part pulls drum brake shoes away from the drum when pressure is released?`, [`Return springs`, `The wheel cylinder`, `The tone ring`, `The reservoir cap`], 0, `Springs pull parts back.`, `Return springs retract the shoes so they do not drag.`),
    mcq(`${C}.l08`, 2, 2, `What does a drum brake self-adjuster do?`, [`Takes up the gap that grows as the linings wear`, `Raises line pressure when the shoes become thin`, `Cleans glaze and rust from the inside of the drum`, `Measures wheel speed from the drum teeth`], 0, `The lining wears, so something must move the shoes closer.`, `Self-adjusters, often star wheels, take up slack so pedal travel and shoe clearance stay in range.`),
    mcq(`${C}.l08`, 3, 3, `A car has a low pedal that improves when pumped. Fluid level and the front brakes are fine, and a rear drum shows worn linings and a seized star wheel. Which explains the low pedal?`, [`A seized adjuster leaves the shoes too far from the drum`, `The booster has too much vacuum assist stored in reserve`, `The front pads are too thick and hold fluid in the calipers`, `A stuck proportioning valve is blocking the rear circuit`], 0, `Slack that is never taken up lengthens pedal travel.`, `With a seized adjuster the shoes have too much clearance, so more pedal travel is needed and pumping helps shoes reach the drum.`),
    mcq(`${C}.l08`, 4, 2, `Brake fluid is found on the inside of a drum with contaminated linings. What is the correct repair?`, [`Wash the shoes in brake cleaner, let them dry and reinstall them`, `Replace the shoes and repair the leaking wheel cylinder`, `Roughen the lining surface with sandpaper and reinstall`, `Add a dab of grease to the shoe pads to seal in the fluid`], 1, `Contamination does not wash out.`, `Shoes soaked in fluid grip poorly and must be replaced, and the leak that caused it must be repaired.`),
    mcq(`${C}.l08`, 5, 2, `Why should compressed air not be used to blow brake dust off parts?`, [`It chills the parts and makes the linings crack`, `It spreads dust that can be hazardous to breathe`, `It strips the grease from the backing plate ledges`, `It lowers the friction of the linings for good`], 1, `Think about the technician's lungs.`, `Brake dust can be hazardous, so an approved vacuum or wet method keeps it from becoming airborne.`),
    tf(`${C}.l08`, 6, 1, `Electronic parking brake calipers often need a scan-tool service mode before the piston is retracted.`, 0, `A motor drives the piston.`, `Forcing the piston back without the service mode can damage the motor mechanism, so follow the manual.`),
    mcq(`${C}.l07`, 7, 3, `A rotor stamped MIN TH 22.0 mm measures 21.9 mm at its thinnest point. What is the correct action?`, [`Replace the rotor, since it is below the discard thickness`, `Resurface it lightly to flatten the surface`, `Reuse it, because 0.1 mm makes no practical difference`, `Fit thicker pads to make up for the missing metal`], 0, `Compare the reading with the stamped limit.`, `A rotor below its stamped minimum has too little metal to handle heat safely and cannot be machined or reused; it must be replaced.`),
  ],
};

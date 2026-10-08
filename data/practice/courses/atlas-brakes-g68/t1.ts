import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-g68';

export const PART: CoursePart = {
  track: {
    id: `${C}.t1`,
    title: 'The Science Behind Stopping',
    blurb: 'Friction, heat, pressure and leverage: the four ideas that every brake system is built on.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: `${C}.l01`,
        title: 'Friction Does the Stopping',
        blurb: 'Brakes slow a car by rubbing surfaces together on purpose.',
        minutes: 6,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('brake_pads', 'rotor', 'brake_pedal'),
        body: `Friction is the force that resists two surfaces sliding against each other. Rub your hands together quickly and you feel it. A car's brakes use friction on purpose. When the driver presses the brake pedal, parts called brake pads are squeezed against a spinning metal disc called a rotor. The rotor is bolted to the wheel, so slowing the rotor slows the wheel.

Friction depends on the materials and on how hard the surfaces are pressed together. Pads are made from a special friction material that grips well and survives high heat. Rotors are made from metal that stays strong when it gets very hot. Press the pedal harder and the pads squeeze harder, so the stopping force goes up.

There is a second place where friction matters: between the tire and the road. The brakes slow the wheel, but it is the grip of the tire on the road that actually slows the car. A tire that keeps rolling usually grips better than a tire that is skidding. That is why a locked, skidding wheel often stops a car worse than a wheel that is still turning, and it is the reason anti-lock brakes exist, which you will meet later in this course.`,
      },
      {
        id: `${C}.l02`,
        title: 'Where the Energy Goes: Heat',
        blurb: 'A moving car has energy, and brakes turn it into heat.',
        minutes: 6,
        asOf: '2026-10',
        atlasScenario: 'heat',
        anchors: parts('rotor', 'brake_pads', 'brake_fluid'),
        body: `A moving car carries energy of motion, called kinetic energy. Energy cannot just disappear, so when brakes slow a car, that energy has to go somewhere. Friction changes it into heat. This is why brake parts get hot, sometimes too hot to touch after a long downhill drive.

Kinetic energy grows quickly with speed. If you double your speed, the car has four times as much energy to get rid of, not twice as much. That is why a car going 60 miles per hour needs much more than twice the distance to stop that it needs at 30 miles per hour. Heavier vehicles also have more energy at the same speed, so trucks need stronger brakes.

Brake parts are designed to soak up heat and then release it into the air. If brakes are used hard again and again, such as on a long steep hill, they can get so hot that they grip less. This is called brake fade. Very hot brakes can even heat the brake fluid until it starts to boil, which makes the pedal feel soft. Good habits and well-kept brakes reduce these risks.`,
      },
      {
        id: `${C}.l03`,
        title: 'Pressure and Pascal in Plain Terms',
        blurb: 'Liquids carry pressure to every corner, which lets one push work four wheels.',
        minutes: 7,
        asOf: '2026-10',
        anchors: parts('master_cylinder', 'brake_fluid', 'caliper_piston', 'brake_line'),
        body: `Pressure is how hard a force is pressing on each bit of area. A thumb pushing on a thumbtack makes a lot of pressure on the sharp point because all the push is squeezed onto a tiny area.

A scientist named Blaise Pascal described an idea that is now called Pascal's principle: when you push on a liquid that is trapped in a closed space, the pressure spreads through the liquid equally in all directions. Liquids are very hard to squeeze smaller, so they pass the push along almost perfectly.

Brakes use this. The driver pushes a small piston in the master cylinder, which pressurizes the brake fluid in sealed tubes called brake lines. The pressure travels through the fluid to each wheel, where it pushes on pistons in the brakes. Because the fluid carries pressure to every wheel at once, one foot can work all four brakes. A piston with a bigger face receives a bigger force from the same pressure, which is one way brakes can multiply the driver's push. The system only works if it is sealed and full of fluid.`,
      },
      {
        id: `${C}.l04`,
        title: 'Leverage and the Power Assist',
        blurb: 'The pedal is a lever, and a booster adds extra push.',
        minutes: 6,
        asOf: '2026-10',
        atlasScenario: 'apply',
        anchors: parts('brake_pedal', 'pushrod', 'brake_booster'),
        body: `A lever lets a small push over a long distance become a big push over a short distance. The brake pedal is a lever. It is hinged at the top, and your foot pushes near the bottom, so the part of the pedal that connects to the rest of the brake system moves less but pushes harder than your foot does.

A rod called the pushrod carries that push from the pedal to the next part, the brake booster. A booster is a helper that adds force so the driver does not have to push very hard. Many cars use the difference between engine intake vacuum and outside air pressure to power a booster. Other cars use a hydraulic or electric booster instead. After the booster adds its force, the push goes to the master cylinder, where it becomes fluid pressure.

If the booster stops helping, the brakes still work, but the pedal feels very hard and takes much more leg force to get the same stop. A hard pedal that needs a lot of effort is a warning sign that should be checked by a technician right away.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l01`, 1, 1, `Which force do brake pads use to slow the rotor and the wheel?`, [`Friction between the pads and the rotor`, `Gravity pulling the car toward the ground`, `Magnetism between the pad and the wheel`, `The weight of the driver's foot alone`], 0, `Think about what happens when you rub your hands together.`, `Brakes squeeze the pads against the rotor, and the rubbing friction slows the rotor, which is attached to the wheel.`),
    mcq(`${C}.l01`, 2, 1, `Pressing the brake pedal harder usually makes the pads do what to the rotor?`, [`Release it a little, so the wheel can spin more freely under the car`, `Squeeze it harder, which raises the stopping force`, `Spin it faster to build up energy`, `Heat it without touching it at all`], 1, `Pressing harder means more squeeze.`, `A harder pedal push raises the clamping force of the pads, and a bigger clamp force means more friction and a stronger stop.`),
    mcq(`${C}.l01`, 3, 2, `A tire that keeps rolling usually grips the road better than one that is skidding. What does this mean for braking?`, [`Locking the wheels is the best way to stop, because a sliding tire grips the road harder`, `Tires have no effect on how a car stops`, `Brakes only work when the tires are completely dry`, `A wheel that keeps turning often stops the car better than a locked one`], 3, `Compare a rolling tire with a sliding one.`, `A rolling tire usually keeps more grip than a sliding one, so a locked skidding wheel often stops the car worse than one that is still turning.`),
    mcq(`${C}.l01`, 4, 1, `Which statement about tire grip and braking is most accurate?`, [`Tire grip on the road is part of what actually slows the car`, `Only the brake pads matter, since the road plays no part`, `The tires slow the car only when the engine is switched off`, `Grip matters for steering but never changes how fast the car stops`], 0, `Brakes slow the wheel, but something else slows the car.`, `The brakes slow the wheel, but the tire's grip on the road is what transfers the stopping force to the road and slows the vehicle.`),

    mcq(`${C}.l02`, 1, 1, `When brakes slow a car, where does the car's energy of motion mostly go?`, [`Into heat in the brake parts`, `Into the fuel tank`, `Into the tires, which store it for later`, `Nowhere, because energy is used up`], 0, `Energy cannot vanish; it changes form.`, `Friction changes the car's kinetic energy into heat, which is why brake parts get hot.`),
    mcq(`${C}.l02`, 2, 2, `A car's speed doubles from 30 to 60 miles per hour. Compared with the energy at 30, the energy at 60 is about`, [`four times as large`, `twice as large`, `the same`, `half as large`], 0, `Energy grows faster than speed does.`, `Kinetic energy depends on the square of speed, so doubling the speed makes about four times the energy that the brakes must remove.`),
    mcq(`${C}.l02`, 3, 2, `Why can brakes used very hard on a long steep hill start to work worse?`, [`The tires shrink as they spin`, `The road surface gets slicker as the car goes downhill, so the tires lose grip on it`, `The gas pedal gets stuck from the heat of the engine`, `Heat builds up faster than it can escape, which can cause brake fade`], 3, `Think about what happens to heat when brakes keep working.`, `Repeated hard braking builds heat faster than the parts can release it, and overheated brakes can grip less, which is called brake fade.`),
    tf(`${C}.l02`, 4, 2, `A heavier vehicle going the same speed has more energy for its brakes to remove than a lighter one.`, 0, `Energy of motion depends on mass and on speed.`, `Kinetic energy rises with mass as well as speed, so heavy vehicles need stronger brakes to stop from the same speed.`),

    mcq(`${C}.l03`, 1, 1, `Which statement best describes Pascal's principle as used in brakes?`, [`Liquids shrink a lot when squeezed`, `Pressure on a trapped liquid spreads through it equally in all directions`, `Air in a pipe carries pressure better than a liquid because gases are so easy to squeeze`, `Pressure always stays at the place where the push began`], 1, `The liquid is trapped in a closed space.`, `Pascal's principle says pressure applied to a trapped liquid spreads equally through it, which lets one push reach every wheel.`),
    mcq(`${C}.l03`, 2, 1, `What fills the sealed brake lines so that pressure can travel to the wheels?`, [`Brake fluid`, `Engine oil`, `Water from a hose`, `Compressed air from a tank`], 0, `It is a special liquid that does not squeeze smaller easily.`, `Brake fluid is the liquid in the lines, and because it is hard to compress it passes the master cylinder's pressure to the wheel pistons.`),
    mcq(`${C}.l03`, 3, 2, `The same fluid pressure acts on a small piston and on a larger piston. Which piston gets the larger force?`, [`The larger one`, `The smaller one`, `Both get exactly the same force`, `Neither, because pressure makes no force`], 0, `Force is pressure acting over an area.`, `Force equals pressure times area, so with the same pressure the piston with the larger face gets the larger force.`),
    mcq(`${C}.l03`, 4, 2, `What happens if a leak lets brake fluid escape from the lines?`, [`The brakes cannot pass full pressure to the wheels`, `The pedal gets firmer because there is less fluid to move`, `Pascal's principle makes the leak seal itself under pressure`, `Nothing changes until the fluid tank is completely empty`], 0, `Pascal's principle needs a trapped liquid.`, `The idea works only when the liquid is trapped, so a leak lets pressure and fluid escape and the pedal and stopping power suffer.`),

    mcq(`${C}.l04`, 1, 1, `The brake pedal acts as which kind of simple machine?`, [`A pulley`, `A lever`, `A wedge`, `A screw`], 1, `It pivots at one end.`, `The pedal is hinged and pivots, so it is a lever that turns your foot's push into a stronger push on the pushrod.`),
    mcq(`${C}.l04`, 2, 1, `What job does the brake booster do?`, [`It adds extra force so the driver needs less leg effort`, `It stores brake fluid for the wheel brakes`, `It measures how fast each wheel is turning`, `It cools the rotor after hard stops`], 0, `The word booster gives a hint.`, `The booster is a power assist that adds force to the driver's push before it reaches the master cylinder.`),
    mcq(`${C}.l04`, 3, 2, `A driver finds the brake pedal has become very hard to push and the car still slows only with great effort. What is the most sensible next step?`, [`Pump the pedal quickly and keep driving as usual`, `Get a technician to check the brake system soon`, `Wait a month to see whether it fixes itself`, `Add extra fluid to the windshield washer tank`], 1, `Brakes are a safety system.`, `A very hard pedal can mean the booster is not helping, which is a safety concern that a technician should check promptly.`),
    tf(`${C}.l04`, 4, 2, `If the booster stops helping, the brakes stop working completely.`, 1, `Think about the difference between less help and no brakes.`, `Without the booster the brakes usually still work, but the pedal is hard and much more force is needed, so stopping takes more effort and distance.`),
  ],
};

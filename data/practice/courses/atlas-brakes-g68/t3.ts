import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-g68';

export const PART: CoursePart = {
  track: {
    id: `${C}.t3`,
    title: 'Smart Braking and Safe Habits',
    blurb: 'How anti-lock brakes help, how drivers can brake safely, and how to notice trouble early.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: `${C}.l09`,
        title: 'Why ABS Exists',
        blurb: 'Anti-lock brakes keep wheels turning so the driver can still steer.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'abs',
        anchors: parts('wheel_speed_sensor', 'tone_ring', 'abs_ecu', 'abs_hcu'),
        body: `If a driver slams the brakes on a slippery road, a wheel can stop turning while the car is still moving. A locked, skidding tire grips less, and a tire that is sliding cannot steer the car. The driver may keep sliding straight toward whatever is ahead.

Anti-lock brake systems, or ABS, were designed to prevent this. Each wheel has a wheel speed sensor that reads a notched ring, the tone ring, that spins with the wheel. A small computer, the ABS control module, watches those signals. If one wheel starts slowing much faster than the car, it is about to lock. The computer then commands a valve block, the hydraulic control unit, to release some pressure to that wheel and apply it again, many times a second.

This rapid pumping keeps the wheel turning so the tire keeps some steering ability. The driver may feel the pedal pulse and hear a buzzing. That is normal. The correct response is to keep firm pressure on the pedal and steer where you want to go. ABS cannot create grip that the road does not offer, and it does not shorten the stop on every surface.`,
      },
      {
        id: `${C}.l10`,
        title: 'Safe Driving Habits',
        blurb: 'Space, speed and smooth braking save more than any gadget.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'heat',
        anchors: parts('brake_pedal', 'brake_pads', 'rotor'),
        body: `The best brake habit is to leave enough space. Stopping distance has two parts: the distance you travel while you react, and the distance the brakes need to stop the car. Doubling your speed roughly quadruples the braking part, and it doubles the distance covered during your reaction time. Many driver manuals teach a following gap of about three seconds, and more in rain, snow or when towing. Check your local driver handbook.

Brake early and smoothly. Look far ahead so you can ease off the gas and brake gently, rather than jabbing the pedal at the last moment. Wet and icy roads give far less grip, so every stop takes longer.

On a long downhill, shift to a lower gear so the engine helps hold your speed, and use the brakes in moderate amounts instead of keeping your foot on the pedal all the way down. This helps prevent overheated brakes. Do not rest your foot lightly on the pedal while driving, because the pads can drag and wear faster. Finally, keep loads reasonable: a heavy load needs more distance to stop.`,
      },
      {
        id: `${C}.l11`,
        title: 'Warning Signs of Brake Trouble',
        blurb: 'Sounds, feelings and lights that mean it is time for a check.',
        minutes: 7,
        asOf: '2026-10',
        atlasScenario: 'fault-worn-pads',
        anchors: parts('pad_wear_indicator', 'brake_pads', 'rotor', 'brake_fluid'),
        body: `Brakes usually warn you before they fail, if you pay attention. A high-pitched squeal when braking can come from a small metal tab on the pad, the wear indicator, that touches the rotor when the pad gets thin. It is a reminder to have the pads checked soon. A deep grinding or scraping sound is more serious: it can mean the friction material is gone and metal is rubbing on the rotor.

A pedal that feels soft, spongy or sinks toward the floor can mean air or a leak in the system, or very hot brake fluid. A very hard pedal can mean the booster has stopped helping. If the car pulls to one side when you brake, one side may be gripping more than the other. A shaking steering wheel or a pulsing pedal during normal braking, with no ABS activity, can come from a rotor that is uneven.

Dashboard lights matter too. A red brake light can mean low fluid or a parking brake still on. An amber ABS light usually means the anti-lock function is off but the normal brakes still work. Do not ignore either light. Have the car inspected by a qualified technician.`,
      },
      {
        id: `${C}.l12`,
        title: 'Parking Brake, Brake Lights and Getting Help',
        blurb: 'Other parts that keep you safe, and how to talk to a repair shop.',
        minutes: 6,
        asOf: '2026-10',
        anchors: parts('parking_brake_cable', 'brake_light_switch', 'brake_pads'),
        body: `Two more systems are part of braking. The parking brake holds the car when it is parked. On many cars it pulls a steel cable that applies the rear brakes by mechanical force rather than by fluid, so it can work even if the hydraulic system has failed. It also needs to be used and checked from time to time, because cables can stick or stretch.

The brake light switch is a small sensor near the top of the brake pedal. When you press the pedal it turns on the red lights at the back of the car, telling the drivers behind you that you are slowing. A failed switch or bulb can leave you slowing down with no warning to others. Ask a friend to watch the lights, or look at their reflection on a wall, to check them.

When you take a car to a shop, describe what you see, hear and feel, and when it happens: for example, a squeal when braking gently, or a pull to the left at high speed. You can ask the shop to show you the old parts and to explain the work in plain words. Brake repair is a safety job, so choose a qualified technician and ask what is included in the price.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l09`, 1, 1, `What problem does ABS help prevent?`, [`Brake fluid becoming old`, `Wheels locking up and skidding during hard braking`, `Tires losing air slowly`, `Brake pads wearing too fast`], 1, `ABS stands for anti-lock braking system.`, `ABS stops a wheel from locking by releasing and reapplying brake pressure, so the tire keeps turning and can still help steer.`),
    mcq(`${C}.l09`, 2, 2, `What does the wheel speed sensor tell the ABS computer?`, [`How much fluid is in the reservoir`, `How hot the rotor has become`, `How fast each wheel is turning`, `How worn the brake pads are`], 2, `Each wheel is measured separately.`, `The ABS module compares wheel speeds, and a wheel that slows much faster than the others may be about to lock.`),
    mcq(`${C}.l09`, 3, 2, `During a hard stop on a wet road you feel the pedal pulse under your foot and hear buzzing. What should you do?`, [`Lift off the pedal right away`, `Pump the pedal slowly with your toe so the wheels cannot lock`, `Turn the engine off`, `Keep firm steady pressure and steer where you want to go`], 3, `The pulsing is the system working.`, `Pulsing and buzzing are normal during ABS operation, and the driver should keep firm pressure and steer around the hazard.`),
    tf(`${C}.l09`, 4, 2, `ABS can create extra grip that the road surface does not provide.`, 1, `What limits how much a tire can grip?`, `ABS only manages brake pressure to keep tires turning; it cannot make a slippery road grippier.`),

    mcq(`${C}.l10`, 1, 1, `If a car's speed doubles, how does its braking distance change, roughly?`, [`It stays the same`, `It roughly doubles`, `It roughly quadruples`, `It is cut in half`], 2, `Energy goes with the square of speed.`, `Braking distance grows with the square of speed, so doubling speed roughly quadruples the distance the brakes need.`),
    mcq(`${C}.l10`, 2, 2, `Which habit helps keep the brakes from overheating on a long steep hill?`, [`Holding the pedal steadily down all the way so the brakes never get a chance to rest`, `Shifting to a lower gear and braking in moderate amounts`, `Putting the car in neutral and coasting`, `Turning off the engine`], 1, `The engine can help hold the speed.`, `A lower gear lets engine resistance help control speed, so the brakes handle less heat.`),
    mcq(`${C}.l10`, 3, 2, `Why is resting your foot lightly on the brake pedal while driving a bad idea?`, [`It turns off the brake lights`, `It drains the booster, so the brakes feel weaker the next time you really need them`, `It uses the booster up for the day`, `The pads can drag and wear faster, and the lights confuse drivers behind you`], 3, `Think about the pads and the brake lights.`, `Light pressure can keep pads rubbing, which wears them and heats the brakes, and it keeps brake lights on without a reason to slow.`),
    tf(`${C}.l10`, 4, 1, `Wet or icy roads give less grip, so stopping distances are longer than on dry roads.`, 0, `Friction depends on the surface.`, `Less friction between the tire and a wet or icy road means the car needs more distance to stop.`),

    mcq(`${C}.l11`, 1, 1, `A deep grinding sound whenever you brake most likely means`, [`The pads may be worn through and metal is rubbing the rotor`, `The brake fluid is old and has turned thick, which makes the pads vibrate`, `The tires are brand new`, `The windshield wipers are on`], 0, `Think about what happens with no friction material left.`, `A grinding sound can mean the pad material is gone, so metal grinds on the rotor, which is serious and needs inspection.`),
    mcq(`${C}.l11`, 2, 2, `A shaking steering wheel during ordinary braking, with no ABS activity, may point to`, [`A dead battery`, `An overfilled washer tank`, `A rotor that has become uneven`, `A loose license plate`], 2, `The shake happens only when braking.`, `Uneven rotors can make the brakes pulse, which shows up as steering wheel or pedal vibration.`),
    mcq(`${C}.l11`, 3, 2, `An amber ABS warning light comes on while the red brake light stays off. The best description is`, [`The anti-lock function may be off, normal brakes usually still work, and the car should be checked`, `All the brakes have failed completely and the car can no longer be stopped, so you should push it to the shop`, `The car must be pushed to the shop`, `The light is a sign the battery is fully charged`], 0, `Two different lights mean two different things.`, `An ABS light usually means the anti-lock function is disabled but the base brakes work, so the car should be inspected soon.`),
    tf(`${C}.l11`, 4, 1, `A high-pitched squeal from the brakes can be a built-in reminder that the pads are getting thin.`, 0, `Some pads have a small metal tab.`, `Some pads have a wear indicator tab that contacts the rotor and squeals when the friction material is nearly used up.`),

    mcq(`${C}.l12`, 1, 1, `On many cars the parking brake works by`, [`Filling the cylinders with extra fluid`, `Turning off the engine`, `Pulling a steel cable that applies the rear brakes`, `Locking the steering wheel`], 2, `It does not rely on the pedal.`, `Many parking brakes pull a cable that mechanically applies the rear brakes, so it is separate from the hydraulic pedal circuit.`),
    mcq(`${C}.l12`, 2, 1, `What is the job of the brake light switch?`, [`It turns on the rear lights when the pedal is pressed`, `It measures the thickness of the pads`, `It adds fluid to the reservoir`, `It controls the ABS pump`], 0, `It is near the top of the pedal.`, `The switch senses the pedal and turns on the brake lights to warn the drivers behind you.`),
    mcq(`${C}.l12`, 3, 2, `Which is the most helpful way to describe a brake problem to a repair shop?`, [`Say only that something feels weird and let the shop decide what to replace first`, `Tell them what you hear, feel and see and when it happens`, `Ask for a full repair without describing anything`, `Wait until the pedal hits the floor`], 1, `Details help the technician find the cause.`, `A clear description, such as a squeal at low speed or a pull to the left, helps the technician diagnose the problem faster.`),
    mcq(`${C}.l12`, 4, 2, `Why is it sensible to choose a qualified technician for brake work?`, [`Brakes are a safety system, so mistakes can be costly`, `Brake parts cannot be bought without a license from the state`, `Technicians are the only people allowed to open the hood`, `Repairs from a qualified technician never cost any money`], 0, `Think about the cost of a mistake.`, `Brake work affects safety, so qualified service and a clear explanation of the work and price protect you.`),
  ],
};

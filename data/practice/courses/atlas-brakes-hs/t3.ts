import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-hs';

export const PART: CoursePart = {
  track: {
    id: `${C}.t3`,
    title: 'Fluid, Bleeding and Electronic Brake Control',
    blurb: 'Brake fluid types and boiling points, bleeding basics, ABS, traction control and stability control.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: `${C}.l09`,
        title: 'Brake Fluid: DOT 3, DOT 4, DOT 5.1 and DOT 5',
        blurb: 'Why fluid is hygroscopic, what boiling point means and why types must not be mixed carelessly.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-fluid-boil',
        anchors: parts('brake_fluid', 'fluid_reservoir', 'bleeder_screw'),
        body: `Brake fluid must stay liquid at high temperature, resist compression, protect metal and rubber, and flow in cold weather. U.S. grades are labeled DOT 3, DOT 4, DOT 5.1 and DOT 5, set by a federal standard (FMVSS 116). DOT 3, DOT 4 and DOT 5.1 are glycol-based and can generally be mixed with each other, though a service manual may say otherwise. DOT 5 is silicone-based and does not mix with glycol fluids; its use is generally not recommended for ABS-equipped vehicles, so check the manual.

Glycol fluids are hygroscopic: they pull moisture from the air, through hose walls and the reservoir vent, so water content slowly rises even in a sealed-looking system. Water lowers the boiling point and encourages corrosion. Two numbers are published. The dry boiling point applies to fresh fluid. The wet boiling point is measured after the fluid has absorbed a stated amount of water, and it is meant to mimic aged fluid in service.

Commonly cited minimums in the standard, approximately and to be verified against the current standard, are: DOT 3 about 205 C dry and 140 C wet; DOT 4 about 230 C dry and 155 C wet; DOT 5.1 about 260 C dry and 180 C wet. Many products exceed the minimums. Practically, a higher grade gives more heat margin, but only when the system is designed for it and the fluid is fresh.

If fluid boils in a caliper, vapor bubbles form. Vapor compresses, so the pedal feels soft or sinks, usually after repeated hard use, and recovers as the brakes cool. Fluid condition can be checked with a moisture tester or test strips, and replacement intervals are set by the manufacturer. Use only the type the vehicle specifies, store containers tightly closed, and keep fluid off paint, because it damages finishes. Dispose of used fluid according to local rules.`,
      },
      {
        id: `${C}.l10`,
        title: 'Bleeding and Flushing Basics',
        blurb: 'Removing air and old fluid, in the right order and without running the reservoir dry.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-air-in-lines',
        anchors: parts('bleeder_screw', 'master_cylinder', 'fluid_reservoir', 'brake_fluid', 'caliper'),
        body: `Bleeding removes air that has entered the hydraulic system after the system was opened, or when the fluid ran low. Flushing replaces old fluid with fresh fluid. Both use the bleeder screw, a small hollow screw on each caliper and wheel cylinder, placed high on the part so air can rise to it.

Common methods are: manual two-person bleeding, where one person presses the pedal and the other opens and closes the screw; one-person bleeders with a check valve; vacuum bleeding at the screw; and pressure bleeding, where the reservoir is pressurized with fluid through an adapter. The factory service manual gives the order of wheels, which is often farthest from the master cylinder first, but some systems use a different order.

Key habits: keep the reservoir topped up so air is not drawn in; use only fresh fluid from a sealed container; do not push the pedal to the floor on an old master cylinder if the manual warns against it, because the seals can be damaged by corrosion at the end of the bore; close the screw before releasing the pedal during manual bleeding; and use the correct wrench to avoid rounding a corroded screw. Bleeder screws can seize or snap, so gentle penetrating treatment and careful work help.

Many ABS vehicles need a scan tool to cycle the modulator valves during bleeding, so air trapped in the hydraulic control unit can be cleared. After bleeding, check that the pedal is firm, there are no leaks, the fluid is at the correct level, and test drive at low speed before returning the vehicle.`,
      },
      {
        id: `${C}.l11`,
        title: 'ABS, Traction Control and Stability Control',
        blurb: 'Sensors, the control module, the hydraulic unit and what each system does.',
        minutes: 9,
        asOf: '2026-10',
        atlasScenario: 'fault-wss',
        anchors: parts('wheel_speed_sensor', 'tone_ring', 'abs_ecu', 'abs_hcu', 'hub'),
        body: `An anti-lock brake system has four main parts. A wheel speed sensor at each wheel reads a toothed or magnetic tone ring that turns with the wheel or axle, and sends a signal whose frequency rises with speed. Passive sensors generate their own small alternating voltage; active sensors use a powered chip and send a digital pulse signal, and can read down to very low speed. The ABS control module (ECU) compares the wheels. The hydraulic control unit (HCU, or modulator) holds solenoid valves and a pump motor.

When one wheel decelerates much faster than the others, the module commands its valves to hold, then release, then reapply pressure to that wheel, several times each second. The driver feels a pulsing pedal, and the pump motor may buzz. Normal brakes work if ABS is not active.

Traction control uses the same sensors to detect a driven wheel that is spinning faster than the others, then brakes that wheel, reduces engine torque, or both. Electronic stability control (ESC) adds a yaw-rate sensor, lateral acceleration sensor and steering angle sensor. If the vehicle turns differently from what the driver steers, ESC brakes individual wheels to help bring it back. ESC is required on new passenger vehicles in the United States from about the 2012 model year; verify the exact rule.

Common faults: a dirty or damaged sensor, a damaged tone ring or wiring, a wrong tire size that changes wheel speed, or low battery voltage. The module stores a trouble code and turns on the ABS lamp. When the lamp is on, ABS and often traction and stability control are disabled, but the base brakes normally still work. A scan tool is used to read codes and live wheel speed data.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l09`, 1, 1, `What does hygroscopic mean when applied to glycol brake fluid?`, [`It absorbs moisture from the air over time`, `It thickens quickly when the temperature drops`, `It cannot be compressed even by very high pressure`, `It dissolves rubber seals and softens them in days`], 0, `Think of water.`, `Hygroscopic fluids pull water from the air, which lowers the boiling point and encourages corrosion.`),
    mcq(`${C}.l09`, 2, 2, `Which grade is silicone-based and should not be mixed with glycol fluids?`, [`DOT 3`, `DOT 4`, `DOT 5`, `DOT 5.1`], 2, `Look for the one that is not glycol.`, `DOT 5 is silicone-based, while DOT 3, 4 and 5.1 are glycol-based.`),
    mcq(`${C}.l09`, 3, 2, `Compared with its dry boiling point, a fluid's wet boiling point is`, [`higher, because water adds heat capacity to the fluid`, `lower, since absorbed water cuts the boiling point`, `identical, because water leaves through the reservoir vent`, `undefined, because the wet value cannot be measured`], 1, `Water boils at a lower temperature than brake fluid.`, `Absorbed water lowers the temperature at which the fluid vaporizes, so the wet value is lower than the dry value.`),
    mcq(`${C}.l09`, 4, 3, `After a long mountain descent, a driver finds the pedal soft but firm again after the brakes cool. Which explanation fits best?`, [`Hot fluid boiled and formed vapor bubbles, which compress`, `The pads permanently shrank and then expanded again`, `The rotor grew thicker with heat, then returned to size`, `The wheel bearings loosened and then tightened again`], 0, `The cure was cooling.`, `Boiling creates compressible vapor in the lines, and the pedal recovers once the temperature drops and the vapor condenses.`),
    mcq(`${C}.l09`, 5, 2, `Which statement about boiling-point figures in this lesson is the safest to repeat to a customer?`, [`The figures are exact guarantees for every product on the shelf, so quote them as fact`, `They are approximate minimums to verify against the current standard and label`, `They apply only to silicone fluid and are irrelevant to glycol grades`, `They never change as fluid ages, so a bottle is good for decades`], 1, `Be careful with numbers.`, `The numbers are approximate minimums from a standard that can be revised, so the product label and current standard are the reliable sources.`),
    tf(`${C}.l09`, 6, 1, `Brake fluid can damage paint, so spills should be cleaned up quickly.`, 0, `Think about glycol.`, `Glycol brake fluid strips and softens many paint finishes, so spills must be wiped and rinsed promptly.`),

    mcq(`${C}.l10`, 1, 1, `Why is a bleeder screw located high on the caliper?`, [`So air can rise to it and leave the system`, `So fluid drains out of the caliper by gravity alone`, `So the screw stays cooler than the pads and the piston`, `So the piston boot does not touch the screw seat`], 0, `Air floats upward.`, `Air collects at the highest point, so the screw is placed there to let it escape.`),
    mcq(`${C}.l10`, 2, 2, `During manual bleeding, which mistake lets air be drawn into the system?`, [`Closing the screw before releasing the pedal`, `Letting the reservoir run low or empty`, `Using fresh sealed fluid`, `Following the manual's wheel order`], 1, `The master cylinder must have fluid to push.`, `If the reservoir runs dry, air enters the master cylinder and the job must start again.`),
    mcq(`${C}.l10`, 3, 2, `Why do some ABS vehicles need a scan tool for bleeding?`, [`To warm the fluid so that it flows through the lines`, `To cycle the valves so trapped air can be cleared`, `To reset the pad wear indicator after a pad change`, `To calibrate the pedal height on the booster pushrod`], 1, `Think about air inside the hydraulic unit.`, `Valves inside the HCU can trap air that normal pedal bleeding does not reach, so the scan tool cycles them.`),
    mcq(`${C}.l10`, 4, 3, `After bleeding, the pedal is still spongy. Which next step is most sensible?`, [`Drive at highway speed for several miles so that the heat and vibration force the air out`, `Recheck for leaks, bleed again in the specified order, and look for a cause`, `Add a thicker fluid to the reservoir, which hides the sponginess`, `Replace the brake pads again to firm up the pedal`], 1, `Diagnose rather than guess.`, `Persistent sponginess means air or a mechanical cause remains, so recheck and repeat the correct procedure instead of road testing at speed.`),
    mcq(`${C}.l10`, 5, 2, `Why does the shop warn against pushing the pedal to the full end of its travel during bleeding on an old master cylinder?`, [`The booster diaphragm could tear from the extra stroke`, `Corrosion in the bore can damage seals travelling into rough areas`, `The stop lamps would stay lit until the engine is switched off and restarted`, `The ABS module would store a fault and need to be reset`], 1, `Seals ride on the bore wall.`, `Seals can be cut by rusted or pitted parts of the bore that they do not normally reach, so the manual may limit stroke.`),
    mcq(`${C}.l10`, 6, 1, `What should decide the wheel order and method used to bleed a particular vehicle?`, [`The factory service manual for that vehicle`, `Whatever order the previous technician used`, `Always start at the wheel nearest the master cylinder`, `Customer preference, since the order has no effect`], 0, `Systems differ.`, `Circuit layouts and ABS designs differ between vehicles, so the manual's order and method apply.`),

    mcq(`${C}.l11`, 1, 1, `What does a wheel speed sensor read?`, [`The tone ring turning with the wheel`, `The thickness of the friction material on the pad`, `The temperature of the brake fluid in the caliper`, `The pressure inside the hose near the wheel`], 0, `The ring has teeth.`, `The sensor detects the teeth of the tone ring as they pass and produces a signal related to wheel speed.`),
    mcq(`${C}.l11`, 2, 2, `Which part contains the solenoid valves and pump motor that change brake pressure?`, [`The hydraulic control unit`, `The wheel cylinder behind the drum`, `The pushrod between pedal and booster`, `The proportioning valve on the rear line`], 0, `Also called the modulator.`, `The HCU holds the valves and pump motor that hold, release and reapply pressure at each wheel.`),
    mcq(`${C}.l11`, 3, 2, `How does traction control typically act on a spinning drive wheel?`, [`By brakes on that wheel, reduced engine torque or both`, `By raising brake fluid pressure at the other three wheels only`, `By locking the parking brake`, `By adding fluid to the reservoir`], 0, `It uses the same sensors as ABS.`, `Traction control brakes the spinning wheel and or reduces engine torque to restore grip.`),
    mcq(`${C}.l11`, 4, 3, `A car shows the ABS lamp after new tires of a very different diameter were fitted on one axle only. Which explanation is most plausible?`, [`The brake pads on that axle have become glazed`, `Different wheel speeds look like a fault to the module`, `The fluid has absorbed water from the new wheels`, `The parking brake cable stretched during tire fitting`], 1, `The module compares wheel speeds.`, `Tire diameter changes how fast the wheel turns for a given vehicle speed, which can look like a sensor error or slip.`),
    mcq(`${C}.l11`, 5, 2, `The ABS lamp is on and a sensor code is stored. What is usually true about the base brakes?`, [`They still work, though anti-lock help is likely off`, `They have all failed at once, so the vehicle must be towed away`, `They work better because ABS no longer interferes`, `Only the rear axle brakes work and the front is disabled`], 0, `ABS is an add-on to normal hydraulics.`, `With the lamp on, the module usually disables ABS but the hydraulic base brakes still function.`),
    tf(`${C}.l11`, 6, 2, `Electronic stability control uses a yaw-rate sensor and a steering angle sensor in addition to wheel speed signals.`, 0, `It compares what the driver wants with what the car is doing.`, `ESC compares steering input with actual rotation of the vehicle to decide which wheel to brake.`),
    mcq(`${C}.l09`, 7, 2, `Which list puts the glycol grades in order of their minimum dry boiling points, from lowest to highest?`, [`DOT 3, DOT 4, DOT 5.1`, `DOT 5.1, DOT 4, DOT 3`, `DOT 4, DOT 3, DOT 5.1`, `DOT 3, DOT 5.1, DOT 4`], 0, `Higher number after 3 generally means more heat margin.`, `The standard's minimums rise from DOT 3 to DOT 4 to DOT 5.1, which is why DOT 5.1 gives the most margin among the glycol grades.`),
    mcq(`${C}.l11`, 7, 3, `A wheel speed signal drops out only at higher road speed. What is the most sensible next check?`, [`Wiring and connector condition, sensor air gap, and the tone ring for damage or debris`, `Replace the hydraulic control unit`, `Bleed all four brakes`, `Replace the master cylinder`], 0, `Start with the cheapest and most likely items.`, `Intermittent signals usually come from wiring, connectors, sensor position or a damaged tone ring, which are checked before replacing expensive parts.`),
  ],
};

import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-college';

export const PART: CoursePart = {
  track: {
    id: `${C}.t4`,
    title: 'Service Methods and Electrified Braking',
    blurb: 'Bleeding methods, regenerative and blended braking in hybrids and EVs, and electronic parking and by-wire systems.',
    level: 'ADVANCED',
    lessons: [
      {
        id: `${C}.l09`,
        title: 'Bleeding Methods: Concepts and Trade-offs',
        blurb: 'Manual, pressure, vacuum, gravity and scan-tool bleeding compared.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'fault-air-in-lines',
        anchors: parts('bleeder_screw', 'master_cylinder', 'fluid_reservoir', 'abs_hcu', 'brake_fluid'),
        body: `The goal of bleeding is to replace the trapped gas with fluid so that the pedal stroke displaces fluid and not compressible bubbles. A bubble of volume V_air at line pressure P is compressed in proportion to pressure, so even a small amount of air consumes pedal travel and lowers the pressure produced at a given stroke; a simplified isothermal model gives V = V0 x P0 / P, so a bubble at 1 bar shrinks to a tenth of its volume at 10 bar, which absorbs a noticeable share of the small fluid volumes a caliper needs.

Manual two-person bleeding uses the pedal stroke to push fluid and air out of the bleeder screw. It needs good coordination: the screw is closed before the pedal is released to prevent air being sucked back past the threads. Single-person check-valve bleeders and clear hoses help but can still draw air around the screw threads. Pressure bleeding adds a pressurized tank to the reservoir adapter so fluid is pushed through the circuit at low pressure (often in the range of roughly 10 to 20 psi, but follow the vehicle and equipment instructions). It is fast and keeps the reservoir full, but the adapter must fit and the setting must not exceed the specification. Vacuum bleeding pulls fluid from the bleeder screw; it is quick but can pull air past thread seals, giving false bubbles, which is reduced by sealing the threads where the manufacturer allows. Gravity bleeding lets the fluid run on its own, which is slow but gentle.

ABS and stability hydraulic units contain valves, accumulators and a pump with internal passages that may trap air. Many manufacturers require a scan-tool procedure that cycles the valves and pump while fluid is bled. A purely manual method may leave a spongy pedal that returns later. Order of bleeding follows the service information, since circuit layouts differ. Reverse bleeding pushes fluid up from the caliper toward the reservoir to float air out of difficult spots.

Always keep the reservoir level above the minimum, use sealed new fluid of the type specified, avoid cross-contamination of fluid types, inspect for leaks, verify a firm pedal and brake lamp function, and record the work. Dispose of the fluid correctly. Fluid exchanges should also respect any rule that low-pressure systems or hybrid boosters need a particular procedure. Follow the factory service manual.`,
      },
      {
        id: `${C}.l10`,
        title: 'Regenerative and Blended Braking in Hybrids and EVs',
        blurb: 'Motor-generator braking, energy recovered, blending logic and the service consequences. Conceptual only.',
        minutes: 13,
        asOf: '2026-10',
        atlasScenario: 'fault-vacuum-loss',
        anchors: parts('brake_pedal', 'brake_booster', 'rotor', 'brake_pads', 'master_cylinder'),
        body: `High-voltage safety first. Hybrid and electric vehicles contain high-voltage components, usually identified by orange cabling, that can cause severe injury or death. This lesson is conceptual. Do not work on or near these systems without the training, protective equipment, and the manufacturer's procedure for de-energizing and verifying them.

In regenerative braking the drive motor acts as a generator when the driver lifts off the accelerator or presses the brake pedal. The motor torque opposes motion, slowing the vehicle, and the electrical energy flows through the inverter to the battery. The friction brakes remain because regeneration alone is limited. Regeneration capacity depends on speed (it fades near a stop), battery state of charge (a full battery cannot accept more), battery temperature, and motor and inverter limits.

Rough energy illustration (not a specification). Stopping a 1,500 kg vehicle from 27.78 m/s releases about 579 kJ. If, say, 60 percent of that were recovered into the battery, that is 347 kJ, or 347,280 / 3,600,000 = about 0.097 kWh. Recovery is a fraction of the total because of losses in the tires, motor, inverter and battery and because friction brakes share the work. The actual fraction varies with the vehicle and conditions.

Blended braking means that the control system splits the driver's requested deceleration between regenerative torque and hydraulic friction braking so the driver feels one consistent pedal. In many designs the pedal is decoupled from the wheel hydraulics by a pedal simulator and an electrically driven pressure source (a brake-by-wire layout); in others a conventional master cylinder is used with a hydraulic modulator. In either case the software ramps hydraulic pressure up as regeneration drops off, for example at low speed, to keep deceleration smooth.

Service consequences. Friction pads may last longer because regeneration does part of the work, but rotors can corrode and glaze from light use, so inspection still matters. Brake fluid still absorbs moisture and has a service interval. Brake-by-wire and electric boosters may need special procedures for bleeding, pad replacement and system initialization. Some models need scan-tool service modes to retract pistons or exercise the system. Use the manufacturer's information, and tell customers that a regen-capable vehicle may feel different, for example a pedal that does not behave like a vacuum-boosted one.`,
      },
      {
        id: `${C}.l11`,
        title: 'Electronic Parking Brakes, By-Wire Systems and Driver-Assistance Braking',
        blurb: 'Actuator types, service modes, calibration and the link between braking and driver assistance.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'fault-drum-adjuster',
        anchors: parts('parking_brake_cable', 'caliper', 'caliper_piston', 'abs_hcu'),
        body: `An electronic parking brake (EPB) replaces the lever or pedal with a switch and one or two electric actuators. In one common layout a motor on the rear caliper drives a spindle through a gearbox to push the piston, replacing the cable, so the clamp force comes from motor current and spindle mechanics. In another, a motor pulls the parking brake cable. A control module estimates force from motor current and position, and may release the brake automatically when the driver accelerates.

Service consequences. Before the piston is retracted for a pad change, the actuator must usually be driven back with a scan tool in a service or maintenance mode. Forcing a motor-driven piston with a tool as one would on a normal caliper can damage the gear train. After new pads or a new actuator, a calibration or learning routine may be required so the system knows the contact position and the force it can apply. The system also needs a stable supply voltage during these procedures. Dash messages, a stuck brake or an inability to release in an emergency each need diagnosis with the manufacturer's information; there are manual release procedures that vary by model.

Brake-by-wire. In such systems the pedal movement and force are measured by sensors, and an electronic controller applies brake pressure, which may use an electrohydraulic unit or motorized pressure generator. A pedal simulator gives feel. Redundancy is built in: if the electrical path fails, a hydraulic backup push-through is provided on many designs. The safety case rests on redundant power, sensors and software, so servicing means following precise procedures.

Driver assistance. Automatic emergency braking, adaptive cruise control and stability control all use the same hydraulic unit to apply pressure without the driver pressing the pedal. The wheel speed sensors, yaw and steering sensors, radar and cameras feed the decision. This has service implications: repairs that change sensor position or vehicle geometry, such as alignment, windshield replacement or bumper work, may require calibration of the driver assistance sensors. A repair that disables or degrades them must be disclosed to the customer and documented. When in doubt consult the manufacturer's position statements and service information, which override general rules.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l09`, 1, 1, `What is the main goal of bleeding the brake system?`, [`To replace trapped air with fluid so the pedal stroke moves liquid`, `To make the fluid colder so it holds more pressure`, `To increase engine vacuum for the booster diaphragm`, `To balance the tires against the wheel hubs`], 0, `Air compresses.`, `Bleeding removes compressible gas so the pedal displaces incompressible fluid and builds pressure.`),
    mcq(`${C}.l09`, 2, 2, `In a simple isothermal model, an air bubble of 1.0 mL at 1 bar is taken to 10 bar. What is its volume?`, [`About 0.1 mL`, `About 10 mL`, `About 1.0 mL`, `About 0.01 mL`], 0, `V = V0 x P0 / P.`, `1.0 x 1 / 10 = 0.1 mL, so the bubble is compressed to a tenth of its volume, absorbing pedal travel.`),
    mcq(`${C}.l09`, 3, 2, `Why does vacuum bleeding at the bleeder screw sometimes show a constant stream of bubbles that do not stop?`, [`Air can be pulled past the screw threads rather than from the system`, `The system has been emptied of fluid down to the master cylinder, so only air is left to be drawn through`, `The ABS pump is running and pushing air through the lines`, `The fluid has reached its boiling point from the suction`], 0, `Where else can air enter?`, `Suction can pull air around the screw threads, giving false bubbles; sealing the threads where allowed helps.`),
    mcq(`${C}.l09`, 4, 3, `After a manual bleed on an ABS vehicle the pedal is firm, but a few days later it becomes spongy again. What is the likely reason?`, [`Air remained trapped in the hydraulic unit and worked out later`, `The pads have grown thicker with heat and are slowly pushing the caliper pistons back into their bores`, `The booster has recharged and now needs less pedal travel`, `The rotor has lost mass and lets the pads sit deeper`], 0, `Look at where air hides.`, `Internal passages in the hydraulic unit can trap air that only a scan-tool cycle of valves and pump clears.`),
    mcq(`${C}.l09`, 5, 3, `Which practice is most consistent with sound bleeding technique?`, [`Keep the reservoir above minimum, use sealed new fluid of the specified type, and follow the manual's order`, `Let the reservoir run low between strokes so that fluid does not overflow the cap`, `Mix any compatible-looking fluids on the shelf, since all brake fluids are interchangeable`, `Skip the final pedal check to save time, because bleeding always works the first time and the pedal always feels firm`], 0, `Air enters when the reservoir empties.`, `Keeping the reservoir full prevents drawing air in, and fluid type and order come from the service information.`),
    tf(`${C}.l09`, 6, 2, `Pressure bleeding equipment should be set to the vehicle and adapter specification, not simply to the highest available pressure.`, 0, `Too much pressure can damage parts.`, `Excess pressure can damage the reservoir or seals, so the specified low pressure applies.`),

    mcq(`${C}.l10`, 1, 1, `In regenerative braking the drive motor acts as`, [`a generator that sends energy to the battery`, `a pump that fills the brake lines with extra fluid`, `a heater that warms the rotors for cold weather`, `a diaphragm that boosts the pedal force directly`], 0, `It runs in reverse.`, `The motor produces opposing torque and electrical energy, which flows via the inverter to the battery.`),
    mcq(`${C}.l10`, 2, 2, `Which condition most reduces available regenerative braking?`, [`A fully charged battery`, `A half-charged battery`, `Mild weather`, `A lightly loaded vehicle`], 0, `The battery must accept energy.`, `A full battery cannot accept more charge, so the friction brakes must supply more of the deceleration.`),
    mcq(`${C}.l10`, 3, 2, `If 60 percent of 579 kJ is recovered, about how much energy in kilowatt-hours goes to the battery?`, [`About 0.097 kWh`, `About 0.58 kWh`, `About 9.7 kWh`, `About 0.0097 kWh`], 0, `1 kWh equals 3.6 MJ.`, `0.60 x 579 kJ = 347 kJ, and 347,280 J / 3,600,000 J per kWh = about 0.097 kWh.`),
    mcq(`${C}.l10`, 4, 3, `What does blended braking software do as vehicle speed falls toward zero and regeneration fades?`, [`Raises hydraulic friction braking to keep the deceleration the driver asked for`, `Locks the rear wheels to make up the lost torque`, `Turns off the brake lamps to save electrical energy`, `Stops all braking to avoid overloading the traction battery`], 0, `The total request is unchanged.`, `Blending shifts the share to friction brakes as regeneration drops, so the driver feels a smooth, consistent stop.`),
    mcq(`${C}.l10`, 5, 3, `A high-mileage hybrid has thick pads but rusty, pitted rotor faces. What is the most plausible explanation?`, [`Regeneration reduced friction use, so the rotors saw little wiping and corroded`, `The pads are far too hard for the rotor, which pits and scores the surface every time the brakes are used`, `The fluid has been replaced too often, which attacked the rotor face`, `The ABS sensor has failed, which allows the rotor to rust`], 0, `Rarely used surfaces rust.`, `Heavy regenerative use means the pads rarely clean the rotor face, so corrosion and pitting can occur.`),
    tf(`${C}.l10`, 6, 1, `Technicians may work on orange high-voltage cables if the vehicle is simply switched off, with no special procedure.`, 1, `High voltage can be lethal.`, `High-voltage systems need the manufacturer's de-energizing and verification procedure and trained personnel; switching off is not enough.`),

    mcq(`${C}.l11`, 1, 1, `Before retracting the piston on a motor-driven EPB caliper for a pad change, what is usually required?`, [`Putting the actuator into a service mode with a scan tool`, `Hammering the piston back with a punch and a light hammer`, `Draining the brake fluid so the piston can retract easily`, `Disconnecting the wheel speed sensor to avoid a fault code`], 0, `Do not force a geared piston.`, `A motor-driven piston is retracted by the actuator in service mode; forcing it can damage the gear train.`),
    mcq(`${C}.l11`, 2, 2, `Why might an EPB need a calibration routine after new pads are fitted?`, [`The system must learn the new contact position and the force to apply`, `To change the color of the fluid to match the new pads`, `To reset the odometer so the service interval can restart for the next scheduled brake inspection`, `To stretch the parking brake cable to its working length`], 0, `The geometry changed.`, `New friction material changes the contact position, so the module must relearn the actuator travel and force.`),
    mcq(`${C}.l11`, 3, 2, `Which statement best describes a brake-by-wire pedal simulator?`, [`It gives the driver pedal feel while sensors read the request and a controller applies pressure`, `It pushes the pistons mechanically with a cable from the pedal`, `It replaces the front tires with an electrically driven wheel`, `It stores brake fluid in a pressurized tank behind the dash`], 0, `The pedal is decoupled.`, `The simulator provides pedal feel and sensors send the request to the controller, which applies braking.`),
    mcq(`${C}.l11`, 4, 3, `A windshield is replaced on a car with automatic emergency braking. What follow-up is most appropriate?`, [`Check the manufacturer's information for camera calibration and document it`, `Nothing is needed, since cameras never move once installed and a new windshield cannot change their aim`, `Bleed all four brakes to remove air from the windshield area`, `Replace the rotors, since glass replacement affects the hubs`], 0, `The sensor position changed.`, `Camera position affects what the system sees, so calibration may be required and must be documented.`),
    mcq(`${C}.l11`, 5, 3, `Why is it important to disclose to a customer if a repair leaves a driver-assistance function disabled?`, [`The customer may rely on a function that is not working`, `It makes the invoice longer and raises the shop's labor total`, `It lowers the parts cost, since disabled systems need no parts`, `It has no safety significance, so it can be left off the record`], 0, `Reliance on a safety system.`, `A customer might rely on an assist that is off, so disclosure and documentation are part of safe, honest service.`),
    tf(`${C}.l11`, 6, 2, `Stability control and automatic emergency braking can apply brake pressure without the driver pressing the pedal.`, 0, `They use the hydraulic unit.`, `These systems use the ABS or stability hydraulic unit to build pressure at selected wheels independent of pedal force.`),
  ],
};

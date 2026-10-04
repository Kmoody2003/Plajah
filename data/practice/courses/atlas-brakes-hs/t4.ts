import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-hs';

export const PART: CoursePart = {
  track: {
    id: `${C}.t4`,
    title: 'In the Shop: Inspection, Diagnosis and Customers',
    blurb: 'Safe inspection, symptom-based diagnosis, estimating concepts and honest customer communication.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: `${C}.l12`,
        title: 'Brake Inspection and Shop Safety',
        blurb: 'What to check, what to measure and how to protect yourself and the customer.',
        minutes: 8,
        asOf: '2026-10',
        atlasScenario: 'fault-worn-pads',
        anchors: parts('brake_pads', 'rotor', 'flex_hose', 'brake_line', 'brake_fluid', 'caliper'),
        body: `A brake inspection is a systematic look at every part that can affect stopping. Start with the customer's complaint and a road test if it is safe. Then raise the vehicle on a lift or on jack stands rated for the weight; never rely on a jack alone. Remove the wheels and check the following.

Pads: measure remaining thickness in millimeters on both the inner and outer pads, and compare with the manufacturer's limit. Look for uneven wear between inner and outer or side to side, which points to a caliper or slide pin problem. Rotors: look for scoring, cracks, a lip at the edge, heat spots and rust, and measure thickness against the stamped minimum. Calipers: look for fluid at the piston, torn dust boots and sticking. Hoses and lines: check for cracks, bulges, leaks and corrosion. Fluid: check the level and color, and test for moisture if equipment is available. Also inspect the parking brake operation and wheel bearings for play.

Shop safety is part of the job. Treat brake dust as hazardous; use an enclosed vacuum with proper filtration or a wet method, and do not blow it with compressed air. Wear eye protection and gloves; brake cleaner is a solvent, so use it with ventilation and keep it from heat sources. Keep brake fluid, grease and oil off friction surfaces. Torque lug nuts to specification in a star pattern with a torque wrench rather than an impact gun alone.

Finish with a safety check. Pump the pedal until firm before moving the vehicle, confirm the fluid level, and road test at low speed first. Record measurements on the repair order so they can be shown to the customer.`,
      },
      {
        id: `${C}.l13`,
        title: 'Diagnosing Common Symptoms',
        blurb: 'Squeal, grind, pulsation, pull, spongy or hard pedal and the ABS light.',
        minutes: 9,
        asOf: '2026-10',
        atlasScenario: 'fault-stuck-slide-pin',
        anchors: parts('pad_wear_indicator', 'brake_pads', 'rotor', 'slide_pins', 'brake_booster', 'wheel_speed_sensor', 'flex_hose'),
        body: `Diagnosis is a method: gather the complaint, verify it, inspect, test, and only then decide on parts. Each symptom has a short list of likely causes; rank them by how easy they are to check.

Squeal. A high squeal during light braking may be a pad wear indicator, glazed pads, missing anti-noise hardware or a lack of lubricant on the contact points. A squeal that stops when the pedal is pressed can be the indicator tab.

Grinding. A harsh metallic grind usually means friction material is gone, or a stone or debris is trapped. Stop driving it and inspect: the rotor may need replacement.

Pulsation. A pulsing pedal, often with a vibrating steering wheel, usually comes from rotor thickness variation or runout. Measure before replacing. If the pulsing happens only in hard stops on loose surfaces, it may be normal ABS activity.

Pull. The vehicle pulls to one side when braking. Look for a sticking caliper or slide pin, a collapsed hose, contaminated pads, or mismatched pads and tires. Check tire pressure and alignment, because they also cause pull.

Spongy pedal. Air in the lines, a swollen hose, a leaking master cylinder seal or boiled fluid. Hard pedal. Loss of booster assist, a vacuum leak, a stuck piston or glazed friction material.

ABS light. Read the codes with a scan tool, check wheel speed sensor data and wiring, inspect the tone ring and sensor air gap, and check battery voltage. Document each step, because a good diagnosis can be explained to the customer in plain words and supported by readings.`,
      },
      {
        id: `${C}.l14`,
        title: 'Estimating, Parts Ranges and Talking With Customers',
        blurb: 'What drives a brake estimate and how to explain it honestly.',
        minutes: 8,
        asOf: '2026-10',
        anchors: parts('brake_pads', 'rotor', 'caliper', 'brake_fluid'),
        body: `An estimate is the shop's written best prediction of what a repair will cost. It has two parts: parts and labor, plus fees and taxes where they apply. This lesson explains what moves each part; it does not give prices, because prices vary by region, vehicle and shop.

Labor is usually calculated from labor time: a guide gives a book time for each job, which is multiplied by the shop's hourly labor rate. Rate depends on location, overhead, technician skill and equipment. Jobs that go beyond the book, such as rusted fasteners, can raise the time, which is why the estimate should say what is included and that further findings need approval before extra work.

Parts cost is a range because it depends on the vehicle, the number of axles serviced, and the quality tier chosen (economy, original-equipment-equivalent or premium). A pad set costs differently from pads plus rotors. Hardware kits, caliper rebuilds or replacements, and a fluid service are separate line items. Parts from different tiers can differ in noise, dust and wear life, which a technician can explain.

Good communication is part of the trade. Describe findings with measurements: this pad measures a certain thickness and the manufacturer's limit is another. Separate what is unsafe now from what can wait and what is only maintenance. Show worn parts when possible and provide options with their trade-offs. Get the customer's authorization before work begins; rules for written estimates differ by state, so know your local requirements. Never pressure or frighten a customer into repairs they do not need, and never claim work you did not perform.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l12`, 1, 1, `Which support should be used when working under a raised vehicle?`, [`A single hydraulic jack placed under the control arm`, `Jack stands rated for the weight, or a lift`, `A stack of wood blocks under the frame rail`, `The spare tire placed under the frame rail`], 1, `Jacks can fail.`, `A jack is for lifting, not holding; rated stands or a lift hold the load safely.`),
    mcq(`${C}.l12`, 2, 2, `What is a safe way to clean brake dust from a brake assembly?`, [`Blow it off with compressed air, wearing a basic dust mask`, `Brush it away with a dry rag and wash up later`, `Use an enclosed filtered vacuum or a wet cleaning method`, `Sweep it into a pile and let it settle before lifting it`], 2, `Do not make it airborne.`, `Controlled methods keep the dust from being breathed, which is why compressed air is avoided.`),
    mcq(`${C}.l12`, 3, 2, `An inner pad is worn much more than the outer pad. What does that most likely suggest?`, [`A caliper or slide pin problem`, `A weak booster or vacuum leak`, `Contaminated or old brake fluid`, `A bad hub bearing on that wheel`], 0, `Look at how the caliper moves.`, `Uneven wear between pads on the same caliper usually points to a sliding or sticking fault.`),
    mcq(`${C}.l12`, 4, 3, `A technician finishes a pad swap and the pedal sinks nearly to the floor on the first press. What should happen before moving the vehicle?`, [`Pump until firm, confirm the fluid level, and check for leaks first`, `Road test at highway speed so the pads seat and the pedal firms up`, `Return the keys and tell the customer the pedal will firm up on its own`, `Top off the reservoir and release the vehicle if no leaks show`], 0, `The pistons were pushed back during the job.`, `Pistons retracted during service need to be pumped out, and a technician should confirm a firm pedal and no leaks before driving.`),
    mcq(`${C}.l12`, 5, 2, `Why are lug nuts torqued with a torque wrench in a star pattern?`, [`To make the wheel studs stretch a little so they stay tight`, `To seat the wheel evenly without distorting the rotor`, `To align the wheel balance weights on the rim`, `To reset the tire pressure monitoring sensor`], 1, `Think about even clamping.`, `Uneven or excessive torque can distort the rotor or leave the wheel not seated flat.`),
    tf(`${C}.l12`, 6, 1, `Measurements should be written on the repair order so they can be shown to the customer.`, 0, `Evidence builds trust.`, `Recorded readings support the recommendation and let the customer see the basis for the work.`),

    mcq(`${C}.l13`, 1, 1, `A harsh metallic grinding during braking most often means`, [`The rotor surface is glazed from the earlier overheating`, `Friction material may be gone, so metal contacts metal`, `A dry slide pin is making noise but no wear is involved`, `The wheel bearing is slightly loose and only needs grease`], 1, `Think about what protects the rotor.`, `Grinding usually means the pad material is worn through, which damages the rotor and reduces braking.`),
    mcq(`${C}.l13`, 2, 2, `A vehicle pulls left only when braking. Which item is a likely cause?`, [`A sticking caliper or a collapsed hose on one side`, `A leaking master cylinder seal in the secondary circuit`, `A seized parking brake cable on both rear wheels`, `Air in both front brake circuits after a fluid change`], 0, `One side is working differently.`, `Unequal braking force from side to side is typically caused by a sticking caliper, bad hose or contamination.`),
    mcq(`${C}.l13`, 3, 3, `A customer complains of a pulsing pedal. Which first step best follows good diagnostic practice?`, [`Replace the master cylinder, because it controls pedal feel`, `Measure rotor thickness variation and runout first`, `Flush the brake fluid, because old fluid causes pulsing`, `Replace the ABS module, since it pulses the pressure`], 1, `Measure first.`, `Pulsation most often traces to rotor variation or runout, and measuring prevents replacing the wrong part.`),
    mcq(`${C}.l13`, 4, 2, `Which cause fits a spongy pedal that improves when pumped twice?`, [`Air in the lines or a swollen hose`, `A seized tone ring`, `A stuck proportioning valve in the open position`, `A flat spare`], 0, `Pumping pushes fluid up into the calipers.`, `Air or hose expansion absorbs pedal travel at first, so a second stroke improves firmness.`),
    mcq(`${C}.l13`, 5, 3, `Which sequence best describes diagnosing an ABS lamp?`, [`Replace the HCU first, since the module cannot be tested any other way`, `Read codes and live data, inspect sensor, tone ring and wiring, check voltage`, `Clear the code and, if the lamp stays off during a short drive, return the vehicle`, `Replace all four wheel speed sensors, since they wear out as a set`], 1, `Proceed from simple to complex.`, `Good practice checks codes, data and simple causes such as sensor condition, wiring and voltage before replacing expensive parts.`),
    tf(`${C}.l13`, 6, 2, `A pulsing pedal during a hard stop on gravel can be normal ABS activity.`, 0, `ABS pulses the pressure.`, `On loose surfaces the ABS can activate at lower decel and pulse the pedal normally.`),

    mcq(`${C}.l14`, 1, 1, `How is shop labor on an estimate commonly calculated?`, [`Guide labor time multiplied by the shop's hourly rate`, `The vehicle weight multiplied by a fixed rate per pound`, `The number of fasteners removed multiplied by one fee`, `A flat percentage of the parts total, whatever the job`], 0, `Time multiplied by rate.`, `Labor guides give a time per job, which is multiplied by the shop's rate.`),
    mcq(`${C}.l14`, 2, 2, `Which factor most directly makes the parts line of two brake estimates differ?`, [`Parts quality tier and what is being replaced`, `How many miles the customer drove last year`, `The air temperature at the time of the estimate`, `Whether the customer pays by card or cash`], 0, `Look at what is being replaced.`, `Quality tier and the list of parts, such as pads only or pads plus rotors, change the parts total.`),
    mcq(`${C}.l14`, 3, 3, `While working, a technician finds a seized caliper that was not on the estimate. What is the right next step?`, [`Replace it now and add it to the final bill without telling anyone`, `Pause, show the evidence, and get the customer's approval first`, `Skip it and say nothing, since it was not on the estimate`, `Replace it at cost and mention it only if the customer asks`], 1, `Customers authorize work.`, `Added work should be explained with evidence and approved by the customer first.`),
    mcq(`${C}.l14`, 4, 2, `Which statement best uses measurements to communicate with a customer?`, [`Your brakes are probably dangerous, so you should replace everything today`, `The front pad measures below the maker's limit, so it is due`, `The computer in the shop says that these parts always fail now`, `It is better to be safe, so we recommend the premium package`], 1, `Be specific and honest.`, `Stating a measurement and the limit lets the customer understand why the recommendation is made.`),
    mcq(`${C}.l14`, 5, 2, `Why does this lesson avoid giving specific prices?`, [`Prices differ by region, vehicle, shop and parts tier`, `Real prices change daily, so printed figures are always wrong`, `Customers are not allowed to ask what a repair costs`, `Shops are legally forbidden from publishing any price`], 0, `Think about variation.`, `Costs depend on many local variables, so ranges and drivers are more honest than a single figure.`),
    tf(`${C}.l14`, 6, 1, `A technician should separate what is unsafe now from what can wait and what is only maintenance.`, 0, `Prioritizing helps the customer decide.`, `Clear priority levels let customers make informed decisions without being pressured.`),
    mcq(`${C}.l13`, 7, 2, `A customer reports a squeal that goes away when the brake pedal is pressed firmly. Which cause fits best?`, [`A pad wear indicator tab touching the rotor`, `Air in the master cylinder`, `A leaking wheel cylinder`, `A failed booster check valve`], 0, `The noise is there only when the pedal is lightly applied or off.`, `A wear indicator or lightly dragging contact can squeal while rolling and quiet down when firm pressure seats the pad.`),
  ],
};

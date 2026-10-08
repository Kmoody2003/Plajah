import { mcq, tf, type CoursePart } from '../../courseKit';
import { parts } from '../../atlasKit';

const C = 'atlas-brakes-college';

export const PART: CoursePart = {
  track: {
    id: `${C}.t3`,
    title: 'ABS Control Theory and Diagnosis',
    blurb: 'Slip ratio, the mu-slip curve, apply/hold/release control, wheel speed sensor signals and scan-tool diagnosis.',
    level: 'ADVANCED',
    lessons: [
      {
        id: `${C}.l06`,
        title: 'Slip Ratio and the Mu-Slip Curve',
        blurb: 'Why braking force peaks at partial slip, and why steering is lost at full lock.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'abs',
        anchors: parts('wheel_speed_sensor', 'tone_ring', 'rotor'),
        body: `During braking a tire turns slower than the road passes beneath it. Longitudinal slip ratio is lambda = (v - w R) / v, where v is vehicle speed, w the wheel angular speed and R the effective rolling radius, so w R is the wheel's peripheral speed. Free rolling gives lambda = 0, and a locked wheel (w = 0) gives lambda = 1.

Worked examples. At v = 20 m/s and a wheel peripheral speed of 17 m/s, lambda = (20 - 17) / 20 = 0.15, or 15 percent. At the same vehicle speed, a wheel peripheral speed of 14 m/s gives lambda = 0.30. If lambda is known to be 0.20 at v = 25 m/s, the wheel peripheral speed is (1 - 0.20) x 25 = 20 m/s.

The braking friction coefficient mu_b = F_x / F_z (longitudinal tire force over vertical load) varies with slip in a characteristic way. It rises roughly linearly at small slip, peaks at a modest slip value, then falls to a lower sliding value at lambda = 1. The slip at the peak and the shapes depend on surface and tire. Commonly cited peak slip values lie around 10 to 30 percent, and the dry-asphalt peak coefficient is commonly given as roughly 0.8 to 1.0, wet asphalt lower, snow and ice far lower; treat these as rough values to verify against tire data. The descending side of the curve is unstable: if slip increases, braking torque exceeds what the tire can supply, the wheel decelerates more, slip grows further, and the wheel locks within a fraction of a second.

Lateral force follows a different curve. The tire's cornering ability is greatest at low slip and falls toward near zero at full lock, because a sliding tire cannot resist sideways motion. That is why a locked front wheel loses steering and a locked rear wheel can let the tail slide.

An ABS controller therefore aims to keep slip in the region near the peak: close to the maximum longitudinal force while leaving lateral force for steering. It is not trying to hold exactly 100 percent of the peak, and on loose surfaces such as gravel or deep snow a locked wheel can build a wedge that stops sooner than a rolling one, so ABS stopping distance can be longer there. The benefit is steering control more than distance in every case.`,
      },
      {
        id: `${C}.l07`,
        title: 'The ABS Cycle: Apply, Hold, Release',
        blurb: 'Valve states, the pump, reference speed estimation and control strategies.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'abs',
        anchors: parts('abs_hcu', 'abs_ecu', 'wheel_speed_sensor', 'master_cylinder'),
        body: `The hydraulic control unit places, for each controlled wheel, an inlet solenoid valve between the master cylinder circuit and the wheel brake, and an outlet solenoid valve between the wheel brake and a low-pressure accumulator. A return pump moves fluid from the accumulator back toward the master cylinder circuit. The ECU switches the valves in three states.

Apply (pressure build): inlet open, outlet closed. The wheel pressure follows the driver's. Hold: inlet closed, outlet closed. The wheel pressure is trapped and stays constant even if the driver pushes harder. Release (pressure decrease): inlet closed, outlet open. Fluid flows from the wheel brake into the accumulator, and the pump returns it, so wheel pressure falls. Typical cycles repeat several times a second, and the driver feels the returned fluid as pedal pulsation and hears the pump.

The ECU needs a measure of vehicle speed it cannot see directly. It estimates a reference speed from the wheel speeds, often by taking a value just below the fastest wheel and limiting how quickly it may fall, and may add inputs such as a longitudinal acceleration sensor. A wheel is flagged when its deceleration exceeds a threshold or its estimated slip exceeds a value. The strategy then runs: release to let the wheel spin back up, hold while it recovers, then apply again in small steps until the next threshold is crossed. This is an example of threshold-based control; more advanced systems use model-based or adaptive logic.

Wheel control can be individual or grouped. Front wheels are usually controlled individually to maximize braking on split-friction surfaces, while the rear wheels may be controlled together by select-low, using the slower wheel to decide, so that both rear tires keep lateral grip and the vehicle stays stable. On a split surface the front wheel on the slippery side may be limited, and some systems ramp up yaw-moment pressure slowly to protect steering.

Faults the ECU monitors include sensor signal plausibility, valve and pump relay circuits, voltage and the pump motor. If a fault is found, the ECU switches ABS off and lights the lamp but leaves the normal hydraulic path to the wheels available.`,
      },
      {
        id: `${C}.l08`,
        title: 'Wheel Speed Sensors and Scan-Tool Diagnosis',
        blurb: 'Sensor types, signal frequency calculations, live-data checks and common root causes.',
        minutes: 12,
        asOf: '2026-10',
        atlasScenario: 'fault-wss',
        anchors: parts('wheel_speed_sensor', 'tone_ring', 'hub', 'abs_ecu'),
        body: `A passive (variable reluctance) wheel speed sensor is a coil around a magnet that produces an alternating voltage as ferrous teeth of the tone ring pass. Its amplitude grows with speed, so the signal is weak at very low speed. An active sensor contains a magnetoresistive or Hall element with electronics and is powered by the ECU; it sends a square-wave current or digital pulse train whose amplitude does not depend on speed, so it can read down to near standstill, and some also report direction.

Signal frequency is f = (teeth x wheel revolutions per second). Worked example: tone ring with 48 teeth, rolling circumference 2.0 m, vehicle speed 20 m/s. Wheel revolutions per second = 20 / 2.0 = 10, so f = 48 x 10 = 480 Hz. At 5 km/h = 1.389 m/s, revolutions are 0.694 per second and f = 33.3 Hz, which is why passive sensors need a minimum speed to be read reliably.

Common faults: contamination or iron debris on the sensor tip; damaged, corroded, cracked or missing teeth on the tone ring; excessive air gap from a loose sensor, worn hub bearing or rust; broken wiring or connector corrosion; and body damage to the harness. Wrong tire sizes change the ratio of wheel speed to vehicle speed, and the ECU compares wheels with one another and with other modules.

Scan-tool procedure: read the codes and freeze-frame data; note whether the fault is current. View live wheel speed for all four wheels. In a straight drive they should agree within a small percentage. In a turn the outer wheels spin faster. Example: radius 50 m, track width 1.5 m, speed 10 m/s at the center gives outer 10.15 m/s and inner 9.85 m/s, a difference of 0.30 m/s or about 3 percent. A wheel reading zero, erratic or dropping out at higher speed points to that circuit. Inspect, clean and check the air gap and resistance or voltage as the service information specifies, and use a scope to look at waveform shape, amplitude and dropouts. Bi-directional tests may cycle valves and the pump to prove they work.

Clear codes and verify. Do not replace the ECU or hydraulic unit until wiring, power and grounds, sensors and the tone ring are cleared. Use the factory service manual for specifications.`,
      },
    ],
  },
  questions: [
    mcq(`${C}.l06`, 1, 1, `A wheel that is rolling freely without any slip has a slip ratio of`, [`0`, `0.5`, `1`, `Undefined`], 0, `Slip compares wheel and vehicle speeds.`, `Slip ratio is (v - wR)/v, so a freely rolling wheel with wR = v gives zero.`),
    mcq(`${C}.l06`, 2, 2, `A vehicle travels at 20 m/s and a braked wheel has a peripheral speed of 14 m/s. What is the slip ratio?`, [`0.30`, `0.70`, `0.43`, `6.0`], 0, `(v - wR) / v.`, `(20 - 14) / 20 = 0.30. The value 0.70 is wR/v, and 0.43 divides by the wrong speed.`),
    mcq(`${C}.l06`, 3, 2, `Slip is 0.20 at 25 m/s vehicle speed. What is the wheel peripheral speed?`, [`20 m/s`, `5 m/s`, `30 m/s`, `24.8 m/s`], 0, `wR = (1 - lambda) v.`, `0.80 x 25 = 20 m/s; 5 m/s is the speed difference rather than the wheel speed.`),
    mcq(`${C}.l06`, 4, 3, `Why does ABS try to hold slip near the peak of the mu-slip curve rather than allowing the wheel to lock?`, [`Near the peak braking force is high and the tire keeps some lateral force for steering`, `At full lock lateral force is at its maximum, because a sliding tire resists sideways motion best of all`, `The curve is flat, so slip level makes no difference to the stop`, `Locked wheels cool the brakes, which protects the fluid`], 0, `Compare longitudinal and lateral force.`, `At the peak the tire still delivers high longitudinal force and keeps useful lateral force, while at lock lateral force falls toward zero.`),
    mcq(`${C}.l06`, 5, 3, `Which statement about the descending side of the mu-slip curve is correct?`, [`It is unstable: more slip lowers tire force, so the wheel decelerates faster and can lock`, `It is stable: friction rises with slip, so the wheel recovers by itself`, `It only appears on dry roads, where the tire force stays high`, `It has no effect on wheel speed because slip is measured at the road`], 0, `Think about the feedback.`, `On the falling side, extra slip reduces the force the tire can provide, which increases wheel deceleration and leads quickly to lock.`),
    mcq(`${C}.l06`, 6, 3, `On loose gravel or deep snow, how can ABS stopping distance compare with a locked-wheel stop?`, [`It can be longer, though the driver keeps steering control`, `It is always shorter, since ABS holds slip at the peak on every surface`, `It is identical, since loose surfaces ignore wheel speed`, `It cannot be compared, since ABS turns off below 30 km/h on gravel`], 0, `A wedge of material can build up in front of a locked tire.`, `On loose surfaces a locked wheel can build a wedge that helps stopping, so ABS may lengthen distance there while preserving steering.`),

    mcq(`${C}.l07`, 1, 1, `In the release state of an ABS cycle, which valve condition applies?`, [`Inlet closed and outlet open`, `Inlet open and outlet closed`, `Both valves open`, `Both valves closed`], 0, `Fluid must leave the wheel brake.`, `In release the outlet opens to the accumulator and the inlet closes so pressure at the wheel falls.`),
    mcq(`${C}.l07`, 2, 2, `What is the purpose of the hold state?`, [`To keep wheel pressure constant while the wheel spins back up`, `To raise pressure above the driver's pedal pressure for a firmer stop`, `To empty the accumulator before the next apply phase`, `To lock the wheel briefly and measure the road surface`], 0, `Both valves are closed.`, `With both valves closed the pressure is trapped, giving the wheel time to spin back up.`),
    mcq(`${C}.l07`, 3, 2, `Why does the ABS ECU estimate a vehicle reference speed from wheel speeds?`, [`It has no direct vehicle speed measurement, so slip is judged against an estimate`, `Wheel speeds are always identical in a stop, so any one wheel is a perfect speed reference at every moment`, `The estimate is used to set the tire pressure monitoring thresholds`, `The estimate lets the module avoid reading the wheel speed sensors`], 0, `Slip needs vehicle speed.`, `Slip depends on true vehicle speed, which is not measured directly, so the ECU infers it from the wheels, sometimes with acceleration input.`),
    mcq(`${C}.l07`, 4, 3, `Rear wheels are often controlled together by select-low. What is the reason?`, [`The slower wheel sets the pressure, so neither rear tire exceeds its grip and lateral stability holds`, `It makes the rear brakes stronger by adding pressure from both wheels`, `It saves valve cost on the front axle, where more control would be needed`, `It lets the rear lock first, which steadies the vehicle in a turn`], 0, `Stability matters more at the rear.`, `Select-low sets pressure by the wheel with less grip, so neither rear tire locks and the rear keeps lateral force.`),
    mcq(`${C}.l07`, 5, 3, `The ECU detects an implausible sensor signal and turns on the ABS lamp. What is the usual result for the base brakes?`, [`ABS is disabled but the normal hydraulic path to the wheels remains`, `All braking is lost until the module is reset by a technician`, `Only the rear brakes work, since the front valves close on a fault`, `The pump runs continuously to supply brake pressure in place of the pedal`], 0, `The valves return to their rest state.`, `On a detected fault ABS is switched off and the valves return to rest, leaving ordinary hydraulic braking.`),
    tf(`${C}.l07`, 6, 2, `A pulsing pedal and a buzzing pump during an ABS stop indicate that the system is working normally.`, 0, `Fluid is cycled back toward the master cylinder.`, `Returning fluid and valve switching cause pedal pulsation and pump noise, which are normal during activation.`),

    mcq(`${C}.l08`, 1, 1, `Which sensor type can read down to nearly zero speed because its signal amplitude does not depend on speed?`, [`Active (Hall or magnetoresistive) type`, `Passive (variable reluctance) type`, `A mercury switch in the hub`, `A float-type sensor in the caliper`], 0, `It is powered by the ECU.`, `Active sensors send pulses with constant amplitude, so they work at very low speed; passive sensors weaken at low speed.`),
    mcq(`${C}.l08`, 2, 2, `A tone ring has 48 teeth, rolling circumference is 2.0 m and speed is 20 m/s. What signal frequency results?`, [`480 Hz`, `960 Hz`, `10 Hz`, `240 Hz`], 0, `Revolutions per second times teeth.`, `20 / 2.0 = 10 rev/s, and 10 x 48 = 480 Hz.`),
    mcq(`${C}.l08`, 3, 2, `At 1.389 m/s the same wheel produces about what frequency?`, [`33.3 Hz`, `66.7 Hz`, `0.694 Hz`, `480 Hz`], 0, `Scale by speed.`, `1.389 / 2.0 = 0.694 rev/s and 48 x 0.694 = 33.3 Hz.`),
    mcq(`${C}.l08`, 4, 3, `In a 50 m radius turn with a 1.5 m track, the outer wheels run about 3 percent faster than the inner ones at 10 m/s. What does this mean for the scan-tool check?`, [`Small differences in a turn are normal and must be separated from a true fault`, `Any difference proves a faulty sensor and justifies replacing all four`, `Only the rear wheels may differ, so check the front readings first`, `Wheel speeds must match exactly in every drive, or the tone ring is damaged`], 0, `Geometry changes wheel speeds in turns.`, `Outer wheels travel a larger arc, so some difference is normal, and a fault shows up as large, erratic or zero readings.`),
    mcq(`${C}.l08`, 5, 3, `A wheel speed reading drops to zero only at higher road speed and the sensor tests well statically. Which check is most useful next?`, [`Scope the signal while driving; inspect the tone ring, air gap and harness flexing`, `Replace the hydraulic control unit, since sensor tests were fine at rest`, `Flush the brake fluid, since old fluid can drop a wheel speed signal`, `Replace the brake pads on that axle to remove the pad-to-sensor interference`], 0, `An intermittent fault needs a dynamic test.`, `Dropouts that appear under motion point to wiring flex, a damaged tone ring or air gap, which are found with dynamic testing.`),
    tf(`${C}.l08`, 6, 1, `Tires of very different size on the same vehicle can cause wheel speed disagreement that the ABS ECU may treat as a fault.`, 0, `Rolling circumference sets wheel speed.`, `Wheel speed at a given vehicle speed depends on rolling circumference, so mismatched sizes produce disagreement.`),
  ],
};

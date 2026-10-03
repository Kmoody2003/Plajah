import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Rotate the choices (keeping their cyclic order) so the correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = (target - answer + 4) % 4;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'lab-engineering.l01';
const L02 = 'lab-engineering.l02';
const L03 = 'lab-engineering.l03';
const L04 = 'lab-engineering.l04';
const L05 = 'lab-engineering.l05';
const L06 = 'lab-engineering.l06';
const L07 = 'lab-engineering.l07';
const L08 = 'lab-engineering.l08';
const L09 = 'lab-engineering.l09';
const L10 = 'lab-engineering.l10';
const L11 = 'lab-engineering.l11';
const L12 = 'lab-engineering.l12';
const L13 = 'lab-engineering.l13';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-engineering',
    label: 'Engineering',
    blurb: 'Turn the laws of nature into machines, structures and systems: forces, materials, energy, circuits and feedback.',
    accent: '#FFA94D',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-engineering.t1',
        title: 'Forces and Materials',
        blurb: 'How structures stay still and how materials stretch and bend under load.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Static Equilibrium',
            blurb: 'A structure at rest has zero net force and zero net moment.',
            minutes: 6,
            body: `Every structural analysis starts with one idea: if a body is not accelerating, the forces on it must balance. Engineers write this as two conditions. The sum of all forces is zero, and the sum of all moments is zero. A moment is a turning effect, force times the perpendicular distance from a pivot, measured in newton-metres (N·m).

You need both conditions. Two equal and opposite forces cancel as forces only; if they act along different lines they form a couple. The net force is zero, yet the body still spins, because the moments do not cancel.

A seesaw shows the moment condition. A heavy child sits close to the pivot and a light child sits far away. The turning effects balance when weight times distance matches on both sides. For example, a 400 N child at 1 m balances a 200 N child at 2 m, since 400 x 1 equals 200 x 2.

Once forces and moments balance, engineers can find the unknown support reactions of a beam, bridge or crane before checking whether the material can survive them.`,
          },
          {
            id: L02,
            title: 'Stress and Strain',
            blurb: 'Stress is force per area, strain is fractional stretch, and Young\'s modulus links them.',
            minutes: 7,
            body: `Force alone does not tell you whether a material will fail. A 1000 N pull is trivial for a thick steel bar and fatal to a thin thread. Engineers therefore use stress, the internal force carried per unit area. Stress is measured in pascals (Pa), which is newtons per square metre.

Strain describes how much the material deforms as a fraction of its original length. If a 2 m rod stretches by 2 mm, the strain is 0.002 m divided by 2 m, which is 0.001. Strain has no units.

In the elastic range, the two are proportional. This is Hooke's law: stress equals Young's modulus times strain, written sigma = E x epsilon. Young's modulus E is the material's stiffness. Steel is about 200 GPa, while rubber is thousands of times less stiff.

Pull far enough and the material passes its yield point. It then deforms permanently, and with more load it eventually fractures. A tensile test pulls a specimen to failure and records the whole stress-strain curve, which reveals stiffness, strength, ductility and toughness in a single plot.

Everyday example: a paperclip bends back elastically when flexed slightly, but stays bent once you push it beyond yield.`,
          },
          {
            id: L03,
            title: 'Axial Deformation',
            blurb: 'How much a bar stretches under load: delta = PL / AE.',
            minutes: 6,
            body: `Stress and strain combine into a handy formula for how far a straight bar stretches when pulled or squashed along its length. The elongation is delta = P x L / (A x E), where P is the axial load, L the bar length, A the cross-sectional area and E the elastic modulus.

Read the formula like a sentence. A heavier load stretches the bar more. A longer bar stretches more, because every extra metre adds its own strain. A thicker bar stretches less, because the same load is spread over more area. A stiffer material stretches less. Doubling the length doubles the stretch, while doubling the area halves it.

Units matter. Use newtons, metres, square metres and pascals, and the answer comes out in metres. A steel cable of 10 m with a 10 kN load and an area of 100 mm2 (0.0001 m2) and E of 200 GPa stretches by 10000 x 10 / (0.0001 x 200e9), which is 0.005 m, or 5 mm.

Engineers use this to check deflection limits. A bridge hanger or a lift cable that is strong enough can still stretch too much to be usable.`,
          },
          {
            id: L04,
            title: 'Bending of Beams',
            blurb: 'Bending stress sigma = Mc / I is largest at the outer fibres.',
            minutes: 7,
            body: `When a beam carries a load across a span, it bends. The top fibres are squeezed and the bottom fibres are stretched, with a neutral axis between them that carries no bending stress. The flexure formula gives the stress at any point: sigma = M x c / I.

M is the bending moment at that section, in N·m. c is the distance from the neutral axis to the point you care about, in metres. I is the second moment of area of the cross-section, in m^4. It measures how effectively the shape's material is arranged to resist bending, and it depends strongly on shape, not just on how much material there is.

Two lessons follow. First, the stress is greatest at the outermost fibres, where c is biggest, which is why beams crack or yield at their surfaces. Second, because I grows fast when material is placed far from the neutral axis, engineers shape beams as I-sections, with wide flanges at top and bottom and a thin web between.

Everyday example: a plank laid flat on two supports sags readily, but the same plank turned on its edge is far stiffer, because more of its material sits far from the neutral axis.`,
          },
        ],
      },
      {
        id: 'lab-engineering.t2',
        title: 'Structures and Safety',
        blurb: 'How slender members fail by instability, and how designers build in a margin.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'Buckling and Stability',
            blurb: 'Slender columns fail by bowing sideways, not by crushing.',
            minutes: 8,
            body: `Press down on the ends of a thin plastic ruler. Long before the plastic could be crushed, the ruler suddenly bows sideways. This is buckling, a stability failure rather than a strength failure.

Leonhard Euler derived the critical axial load for a slender elastic column in 1744: P_cr = pi^2 x E x I / (K x L)^2. E is the elastic modulus, I the second moment of area, L the column length, and K an effective-length factor that captures the end conditions, such as pinned, fixed or free.

The formula shows what matters. Stiffer material and a larger I raise the critical load. Length is squared in the denominator, so doubling the length cuts the critical load to a quarter. A smaller K, meaning better-restrained ends, raises it.

This is why long, thin struts need bracing, why tubes are favoured over solid rods of the same weight (a tube has a larger I), and why designers check slenderness as well as crushing strength. Laboratory tests on slender struts confirm that lateral bowing occurs far below the stress that would crush the material.

Buckling is dangerous because it can be sudden, so engineers treat it as its own design check.`,
          },
          {
            id: L06,
            title: 'Factor of Safety',
            blurb: 'The margin between failure strength and working load absorbs uncertainty.',
            minutes: 6,
            body: `No engineer knows the real loads on a structure exactly. Wind gusts, crowds, corrosion, manufacturing flaws and material variations all add uncertainty. The factor of safety is the number that absorbs it: FS = failure stress divided by allowable working stress, or sigma_ult / sigma_allow.

If a steel part fails at 400 MPa and the design uses an allowable stress of 200 MPa, the factor of safety is 2. The part is designed to work at half the stress that would break it. Choosing a larger factor gives a bigger margin but costs more material, weight and money.

Selecting the factor is a judgement. It rises when consequences of failure are severe, when loads are uncertain, or when the material is variable. It can be lower when loads are well known and weight is critical, as in aircraft. Redundancy and failure analysis work alongside the factor: if one member fails, another carries the load.

Notice the word working. A factor of safety of 1 would mean the part runs at its failure stress every day, with no margin whatsoever.

Everyday example: a lift cable rated for many times the weight of a full car is deliberately over-built so that wear, shock loads and manufacturing variation cannot bring it down.`,
          },
        ],
      },
      {
        id: 'lab-engineering.t3',
        title: 'Energy and Fluids',
        blurb: 'Heat, work and flow: why engines have limits and how liquids behave.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L07,
            title: 'The First Law of Thermodynamics',
            blurb: 'Energy is conserved: delta U = Q - W.',
            minutes: 7,
            body: `Thermodynamics governs heat, work and energy conversion, and its first law is conservation of energy. The internal energy of a system changes by the heat added to it minus the work it does: delta U = Q - W.

The signs matter in this convention. Heat added to the system, Q, raises its internal energy. Work done by the system on its surroundings, W, lowers it. Suppose a gas absorbs 500 J of heat and pushes a piston, doing 200 J of work. Its internal energy rises by 500 - 200 = 300 J.

Joule's paddle-wheel experiment of 1845 showed that mechanical work and heat are interchangeable forms of energy, by stirring water with falling weights and measuring the temperature rise.

For an engine running in a repeating cycle, the system returns to its starting state, so delta U over a full cycle is zero. That forces the net work out to equal the net heat in. No engine can deliver more work than the heat it absorbs, and a machine claiming to do so breaks the first law.

The second law adds direction: heat flows spontaneously only from hot to cold, and no cyclic engine turns heat completely into work.`,
          },
          {
            id: L08,
            title: 'Carnot Efficiency',
            blurb: 'The absolute efficiency ceiling set by two temperatures.',
            minutes: 7,
            body: `In 1824 Sadi Carnot asked how much work a heat engine could possibly extract. His answer depends only on the temperatures of the hot and cold reservoirs: eta = 1 - T_C / T_H.

Temperatures must be absolute, in kelvin. An engine taking heat at 600 K and rejecting it at 300 K has a maximum efficiency of 1 - 300/600 = 0.5, or 50 percent. No design, however clever, can exceed that, and real engines fall short because of friction and irreversibility.

The formula explains engineering practice. To raise the ceiling you either raise the hot temperature or lower the cold one, which is why power plants chase ever-higher combustion temperatures, limited by what materials can survive. Efficiency reaches 100 percent only if the cold reservoir sits at absolute zero, which is unattainable.

Carnot imagined a reversible ideal cycle as the benchmark. It founded the second law of thermodynamics, even though it was written when steam engines were already running and engineers wanted to understand their limits.

Everyday example: a car engine is nowhere near Carnot's limit, but the same logic tells designers why running hotter and rejecting heat to cooler surroundings improves efficiency.`,
          },
          {
            id: L09,
            title: 'Fluid Flow: Bernoulli and Reynolds',
            blurb: 'Pressure trades off against speed, and Reynolds number predicts turbulence.',
            minutes: 8,
            body: `Fluid mechanics follows pressure, speed and energy through liquids and gases. Bernoulli's equation says that along a streamline of ideal flow, P + (1/2) x rho x v^2 + rho x g x h stays constant. Pressure, kinetic energy and height trade off against each other.

For a horizontal pipe, the height term is fixed, so where the fluid speeds up the pressure falls. Water squeezing through a narrowed section moves faster, and its static pressure drops there. This is the idea behind flow meters, and it contributes to the lift on a wing.

The Reynolds number, Re = rho x v x L / mu, compares inertial forces with viscous forces. Low values mean smooth, layered laminar flow. High values mean chaotic turbulence. Osborne Reynolds revealed the transition in 1883 by injecting dye into pipe flow.

For water (density 1000 kg/m3, viscosity 0.001 Pa·s) moving at 2 m/s in a pipe of 0.05 m diameter, Re = 1000 x 2 x 0.05 / 0.001 = 100,000, which is firmly turbulent.

These ideas size everything from aircraft wings to municipal pipe networks.`,
          },
        ],
      },
      {
        id: 'lab-engineering.t4',
        title: 'Circuits, Control and Information',
        blurb: 'Electrical networks, feedback loops and the limits of communication.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L10,
            title: 'Ohm\'s Law and Electrical Power',
            blurb: 'V = IR and P = VI = I^2 R, the most-used relations in electronics.',
            minutes: 6,
            body: `Georg Ohm showed in 1827 that the voltage across a resistor is proportional to the current through it: V = I x R. Voltage is measured in volts, current in amperes and resistance in ohms. A 12 V supply across a 4 ohm resistor drives a current of 12 / 4 = 3 A.

The electrical power delivered to or dissipated in a circuit element is P = V x I. Combine this with Ohm's law and you get P = I^2 x R. For the 4 ohm resistor carrying 3 A, the power is 3^2 x 4 = 36 W, which equals 12 V x 3 A.

The I^2 form shows why current is so important to heating. Double the current in a fixed resistor and the heat rises fourfold. This is how engineers size conductors, heat sinks and power supplies: a wire that is too thin for its current wastes energy as heat and can become dangerous.

Ohm's law applies to ideal resistors. Many devices, such as diodes and transistors, do not follow a straight-line voltage-current relation, but the law remains the starting point for analysing real circuits.

Everyday example: a phone charger cable that runs warm is dissipating I^2 x R in its small internal resistance.`,
          },
          {
            id: L11,
            title: 'Kirchhoff\'s Laws',
            blurb: 'Conservation of charge and energy lets you solve any linear circuit.',
            minutes: 7,
            body: `Ohm's law handles a single resistor. To solve a whole network, Gustav Kirchhoff formalised two conservation rules in 1845.

The current law says that the currents entering any node add up to zero, counting currents leaving as negative. In plain terms, whatever current flows into a junction must flow out, because charge cannot pile up at a point. If 5 A and 2 A flow into a junction and 4 A leaves along one branch, the remaining branch must carry 5 + 2 - 4 = 3 A.

The voltage law says the voltage rises and drops around any closed loop sum to zero. A charge that travels all the way round a loop and returns to its start gains and loses the same energy overall, so this is conservation of energy. In a loop with a 12 V source and two resistors in series, if one resistor drops 5 V, the other must drop 7 V.

Write one equation per node and per loop, add Ohm's law for each resistor, and you obtain enough equations to solve every unknown in any linear circuit. The same node-and-loop bookkeeping scales from a flashlight to the power distribution inside a microprocessor.`,
          },
          {
            id: L12,
            title: 'Feedback and PID Control',
            blurb: 'Measure the output, compare with the target and correct the error.',
            minutes: 8,
            body: `A feedback controller measures a system's output, compares it with a desired setpoint and acts on the difference, called the error: error = setpoint minus measurement. Thermostats, cruise control and autopilots all work this way. James Watt's centrifugal governor of 1788, which regulated steam-engine speed automatically, was an early hardware example, and Maxwell's 1868 paper On Governors founded the mathematics of control.

The workhorse design is the PID controller: u(t) = Kp x e(t) + Ki x (integral of e) + Kd x (rate of change of e). The proportional term reacts to the present error, the integral term reacts to the accumulated past error and removes lingering offset, and the derivative term anticipates the future error from its trend.

Suppose a heating system with Kp = 2 sees a room 3 degrees below the setpoint. The proportional output is 2 x 3 = 6 units of heating command.

Negative feedback stabilises a system and rejects disturbances, but too much gain or too much delay makes it overcorrect, then overcorrect again the other way, so the loop oscillates or becomes unstable. Harold Black's negative-feedback amplifier of 1927 traded raw gain for stability and low distortion, making long-distance telephone repeaters practical.`,
          },
          {
            id: L13,
            title: 'Semiconductors and Information Limits',
            blurb: 'Transistors switch and amplify; Shannon set the ceiling on data rates.',
            minutes: 8,
            body: `A semiconductor such as silicon conducts only under the right conditions of doping and bias. That lets a small voltage or current control a much larger one, which is the essence of both switching and amplification. In 1947 Bardeen, Brattain and Shockley at Bell Labs demonstrated amplification in a point-contact germanium device, the first transistor. It was a solid-state device with no moving parts, and in 1958-59 Kilby and Noyce showed how to place many devices on a single chip, the integrated circuit.

Once switching is cheap, the next question is how fast information can be sent. Claude Shannon's 1948 work defined the bit and proved a ceiling on error-free communication over a noisy channel. The Shannon-Hartley formula is C = B x log2(1 + S/N), where B is bandwidth in hertz and S/N the signal-to-noise ratio.

With B = 1 MHz and S/N = 3, C = 1,000,000 x log2(4) = 2,000,000 bit/s, or 2 Mbit/s. More bandwidth or a cleaner signal raises the ceiling, but no coding trick can exceed it.

Modems, mobile networks and Wi-Fi all approach this limit as closely as they can.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-engineering',
    questions: [
      // L01 Static Equilibrium
      mc(L01, 1, 1, 'Which pair of conditions must hold for a body to be in static equilibrium?',
        ['The sum of forces is zero, and the body is made of rigid material', 'The sum of forces is zero and the sum of moments is zero', 'The sum of moments is zero and the total mass of the body is zero', 'The sum of forces equals the total weight of the body and its load'], 1,
        'There are two conditions, one about pushes and one about turning.',
        'Static equilibrium requires both the net force and the net moment to be zero.'),
      mc(L01, 2, 1, 'What are the usual SI units of a moment?',
        ['N·m', 'N', 'Pa', 'N/m2 per second'], 0,
        'A moment is a force multiplied by a distance.',
        'A moment is force times perpendicular distance, so it is measured in newton-metres.'),
      mc(L01, 3, 2, 'A seesaw is balanced on a central pivot. A child weighing 300 N sits 2 m from the pivot. What force at 1.5 m on the other side will balance it?',
        ['225 N', '300 N', '400 N', '450 N'], 2,
        'Set weight times distance equal on both sides.',
        'Moments balance: 300 N x 2 m = 600 N·m, so the other force is 600 / 1.5 = 400 N.'),
      mc(L01, 4, 3, 'Two equal and opposite forces act on a plank at different points along it. The net force is zero, yet the plank rotates. Why?',
        ['The forces are not really equal once the plank starts to move', 'Friction with the air creates an extra unbalanced force on it', 'The moments of the two forces do not cancel', 'Equilibrium only needs forces in the vertical direction'], 2,
        'Think about which of the two equilibrium conditions is violated.',
        'The pair forms a couple: the force condition is met but the net moment is not zero, so the plank spins.'),

      // L02 Stress and Strain
      mc(L02, 1, 1, 'What is stress?',
        ['Fractional change in length of the body', 'Internal force per unit area', 'Total force applied to a body', 'The energy stored in a spring'], 1,
        'It is measured in pascals.',
        'Stress is the internal force carried per unit area, in pascals.'),
      mc(L02, 2, 1, 'Strain is best described as',
        ['A dimensionless fractional deformation', 'A force in newtons', 'A pressure in pascals', 'The stiffness of a material under tensile loading'], 0,
        'Think of change in length divided by original length.',
        'Strain is deformation divided by original length, so it has no units.'),
      mc(L02, 3, 2, 'A steel bar has Young\'s modulus of 200 GPa and is stretched elastically to a strain of 0.001. What is the stress?',
        ['0.2 MPa', '20 MPa', '200 MPa', '2000 MPa'], 2,
        'Use stress = E x strain and watch the prefixes.',
        'Stress = 200 GPa x 0.001 = 0.2 GPa = 200 MPa.'),
      mc(L02, 4, 3, 'Steel has a much larger Young\'s modulus than rubber. What does this tell you?',
        ['Steel stretches farther than rubber under the same stress', 'Steel needs much more stress than rubber to reach the same strain', 'Steel always fails at a lower stress than rubber', 'Steel cannot deform elastically'], 1,
        'Rearrange sigma = E x epsilon for the same strain.',
        'For equal strain, stress is proportional to E, so the stiffer steel requires far more stress.'),

      // L03 Axial Deformation
      mc(L03, 1, 1, 'In the axial deformation formula delta = PL / AE, what happens to the elongation if the bar length doubles (all else equal)?',
        ['It falls to one half', 'It stays the same', 'It doubles', 'It quadruples'], 2,
        'Length sits in the numerator.',
        'Elongation is proportional to length, so doubling L doubles delta.'),
      mc(L03, 2, 1, 'Which property of a material appears in the axial deformation formula?',
        ['Elastic modulus E', 'Melting point of the metal', 'Mass density of the bar', 'Electrical resistance'], 0,
        'It is the stiffness constant of Hooke\'s law.',
        'The formula uses the elastic modulus E, in pascals, as the stiffness of the bar.'),
      mc(L03, 3, 2, 'A steel bar (E = 200 GPa) is 2 m long with a cross-sectional area of 500 mm2 (0.0005 m2) and carries an axial load of 10 kN. How much does it stretch?',
        ['0.02 mm', '0.2 mm', '2 mm', '20 mm'], 1,
        'Convert everything to newtons, metres and pascals before substituting.',
        'delta = 10,000 x 2 / (0.0005 x 200e9) = 20,000 / 1e8 = 0.0002 m = 0.2 mm.'),
      mc(L03, 4, 3, 'A rod carries the same load, but its diameter is doubled while its length and material stay the same. By what factor does its elongation change?',
        ['It halves', 'It becomes one quarter', 'It stays the same', 'It doubles'], 1,
        'Area depends on the square of the diameter.',
        'Area grows by a factor of 4 when the diameter doubles, so delta falls to one quarter.'),

      // L04 Bending
      mc(L04, 1, 1, 'Where in a beam cross-section is the bending stress greatest?',
        ['At the neutral axis, where the fibres carry the most stress', 'At the outermost fibres, farthest from the neutral axis', 'Exactly at the centre of mass of the load', 'It is equal everywhere'], 1,
        'Look at what c means in the formula.',
        'Stress is proportional to c, the distance from the neutral axis, so it peaks at the outer surface.'),
      mc(L04, 2, 1, 'In sigma = Mc / I, what does I represent?',
        ['Current through the beam', 'Impact force', 'The second moment of area of the cross-section', 'The internal bending moment acting on the beam section'], 2,
        'Its unit is m to the fourth power.',
        'I is the second moment of area, a shape property measuring resistance to bending.'),
      mc(L04, 3, 2, 'A beam section carries a bending moment of 1000 N·m. The farthest fibre is 0.1 m from the neutral axis and I = 5 x 10^-5 m^4. What is the maximum bending stress?',
        ['0.5 MPa', '2 MPa', '20 MPa', '200 MPa'], 1,
        'Compute M x c first, then divide by I.',
        'sigma = 1000 x 0.1 / 5e-5 = 100 / 5e-5 = 2,000,000 Pa = 2 MPa.'),
      mc(L04, 4, 3, 'Why are steel beams commonly shaped as I-sections rather than solid squares of the same weight?',
        ['The web adds electrical insulation', 'Placing material far from the neutral axis greatly increases I, so the beam resists bending better for its weight', 'I-sections have no neutral axis', 'It makes the beam longer'], 1,
        'Think about where in the section the material does the most work.',
        'Material in the flanges is far from the neutral axis, which raises I efficiently and reduces bending stress for the same weight.'),

      // L05 Buckling
      mc(L05, 1, 1, 'Buckling of a slender column is best described as',
        ['A crushing failure of the material under compression', 'A sideways bowing stability failure', 'A brittle fracture in tension', 'A slow creep failure from heat'], 1,
        'Think of pressing the ends of a ruler.',
        'Buckling is a stability failure where the column suddenly bows sideways, usually below the crushing stress.'),
      mc(L05, 2, 1, 'In Euler\'s critical load formula P_cr = pi^2 EI / (KL)^2, which change raises the critical load?',
        ['Increasing the length L of the column', 'Increasing the stiffness EI', 'Increasing the effective-length factor K', 'Reducing the elastic modulus E'], 1,
        'EI is in the numerator.',
        'P_cr grows with EI and falls with the square of the effective length KL.'),
      mc(L05, 3, 2, 'A pinned column of length 3 m has a critical load of 40 kN. Another identical column, but 6 m long, has what critical load?',
        ['20 kN', '5 kN', '80 kN', '10 kN'], 3,
        'Length appears squared in the denominator.',
        'Doubling L multiplies (KL)^2 by 4, so P_cr falls to 40 / 4 = 10 kN.'),
      mc(L05, 4, 3, 'Why can a long, thin strut fail at a load far below what would crush the same material in a short block?',
        ['Long struts weigh more', 'Its critical load falls with the square of length, so instability occurs before the crushing stress is reached', 'Thin struts have a lower elastic modulus', 'Crushing only happens in tension'], 1,
        'Compare which limit is reached first as the member gets longer.',
        'Because P_cr scales as 1/L^2, a slender member reaches its buckling load long before the material is crushed.'),

      // L06 Factor of Safety
      mc(L06, 1, 1, 'What does the factor of safety measure?',
        ['The ratio of failure stress to allowable working stress', 'The weight of the structure divided by its length', 'The number of workers needed to build it', 'The ratio of the total material cost to the strength gained'], 0,
        'It is a ratio of two stresses.',
        'FS = ultimate (failure) stress divided by allowable working stress.'),
      tf(L06, 2, 1, 'A factor of safety of exactly 1 means the part is designed to work at its failure stress, leaving no margin.', 0,
        'Plug FS = 1 into the ratio.',
        'FS = 1 means working stress equals failure stress, so there is no reserve for uncertainty.'),
      mc(L06, 3, 2, 'A steel part fails at an ultimate stress of 400 MPa. If the design uses a factor of safety of 2.5, what is the allowable working stress?',
        ['100 MPa', '200 MPa', '1000 MPa', '160 MPa'], 3,
        'Divide the ultimate stress by the factor of safety.',
        'sigma_allow = 400 / 2.5 = 160 MPa.'),
      mc(L06, 4, 3, 'Why do engineers not simply use a very large factor of safety on every design?',
        ['Large factors are forbidden by law', 'It would weaken the material', 'It adds cost and weight, so the factor must balance risk against practicality', 'The factor can never exceed 2'], 2,
        'Consider what extra margin costs.',
        'A bigger factor means more material, weight and expense, so engineers choose it by weighing uncertainty and consequences of failure.'),

      // L07 First Law
      mc(L07, 1, 1, 'The first law of thermodynamics is a statement of',
        ['Conservation of energy', 'Conservation of momentum', 'The direction of heat flow', 'The maximum engine efficiency'], 0,
        'Heat and work are both forms of energy transfer.',
        'The first law says energy is conserved: delta U = Q - W.'),
      mc(L07, 2, 1, 'In delta U = Q - W, what does a positive W mean?',
        ['Heat is added to the system', 'The system does work on its surroundings, lowering its internal energy', 'The surroundings do work on the system', 'The temperature is below zero'], 1,
        'W is defined as work done by the system.',
        'With this convention, work done by the system takes energy out, reducing internal energy.'),
      mc(L07, 3, 2, 'A gas absorbs 500 J of heat and does 200 J of work on a piston. What is the change in its internal energy?',
        ['700 J', '300 J', '-300 J', '100 J'], 1,
        'Subtract the work done by the system from the heat added.',
        'delta U = Q - W = 500 - 200 = 300 J.'),
      mc(L07, 4, 3, 'An inventor claims a cyclic engine absorbs 1000 J of heat per cycle and delivers 1200 J of work per cycle. What is wrong?',
        ['Nothing, engines can exceed their heat input', 'Over a full cycle delta U is zero, so work out cannot exceed net heat in', 'Heat cannot be measured in joules', 'Work must always equal exactly half the heat'], 1,
        'What is delta U after the engine returns to its starting state?',
        'Over a cycle delta U = 0, so W = Q. Delivering more work than heat absorbed would violate energy conservation.'),

      // L08 Carnot
      mc(L08, 1, 1, 'The Carnot efficiency of a heat engine depends only on',
        ['The specific working fluid and its chemical composition', 'The temperatures of the hot and cold reservoirs', 'The size of the piston', 'The fuel cost'], 1,
        'Look at the variables in 1 - Tc/Th.',
        'eta = 1 - T_C / T_H uses only the two reservoir temperatures.'),
      mc(L08, 2, 1, 'Which temperature scale must be used in the Carnot formula?',
        ['Celsius (degrees centigrade)', 'Fahrenheit (degrees F)', 'Either Celsius or Fahrenheit', 'Kelvin (absolute)'], 3,
        'The ratio needs a true zero point.',
        'The formula uses ratios of absolute temperatures, so kelvin is required.'),
      mc(L08, 3, 2, 'An ideal engine takes heat at 600 K and rejects it at 300 K. What is its maximum efficiency?',
        ['25 percent', '75 percent', '50 percent', '100 percent'], 2,
        'Compute 1 minus the temperature ratio.',
        'eta = 1 - 300/600 = 0.5, which is 50 percent.'),
      mc(L08, 4, 3, 'A manufacturer claims a heat engine running between 600 K and 300 K is 60 percent efficient. What can you conclude?',
        ['It is plausible if the engine is built and maintained carefully', 'It is impossible, since the Carnot limit is 50 percent', 'It is plausible if the fuel is diesel', 'The claim is exactly the Carnot value'], 1,
        'Compare the claim with the Carnot ceiling.',
        'No engine can beat the Carnot limit, which here is 50 percent, so 60 percent cannot be achieved.'),

      // L09 Fluids
      mc(L09, 1, 1, 'According to Bernoulli\'s principle, in steady ideal flow along a horizontal streamline, where the fluid speeds up the static pressure',
        ['Rises', 'Falls', 'Stays exactly constant', 'Becomes zero'], 1,
        'Pressure and speed trade off.',
        'The sum of pressure and kinetic terms is conserved, so faster flow means lower static pressure.'),
      mc(L09, 2, 1, 'The Reynolds number compares which two quantities?',
        ['Pressure and temperature', 'Inertial forces and viscous forces', 'Gravitational forces and surface friction forces', 'Speed and density only'], 1,
        'The formula contains density, speed, length and viscosity.',
        'Re is the ratio of inertial to viscous forces and predicts laminar versus turbulent flow.'),
      mc(L09, 3, 2, 'Water (density 1000 kg/m3, viscosity 0.001 Pa·s) flows at 2 m/s in a pipe of 0.05 m diameter. What is the Reynolds number?',
        ['1,000', '10,000', '1,000,000', '100,000'], 3,
        'Multiply density, speed and diameter, then divide by viscosity.',
        'Re = 1000 x 2 x 0.05 / 0.001 = 100 / 0.001 = 100,000, which is turbulent.'),
      mc(L09, 4, 3, 'Water flows through a horizontal pipe that narrows. What happens in the narrow section?',
        ['Speed increases and static pressure falls', 'Speed decreases and static pressure rises', 'Speed and pressure both rise', 'Nothing changes'], 0,
        'Think of continuity (same flow through a smaller area) together with Bernoulli.',
        'Through a narrower area the water must move faster, and by Bernoulli its static pressure drops.'),

      // L10 Ohm and Power
      mc(L10, 1, 1, 'Ohm\'s law states that',
        ['V = I / R', 'V = I x R', 'V = R / I', 'V = I + R'], 1,
        'Voltage equals current times resistance.',
        'The voltage across a resistor equals the current through it multiplied by its resistance.'),
      mc(L10, 2, 1, 'Which expression gives the power dissipated in a resistor in terms of current and resistance?',
        ['I x R', 'I / R', 'I^2 x R', 'V / I^2'], 2,
        'Combine P = VI with Ohm\'s law.',
        'Substituting V = IR into P = VI gives P = I^2 R.'),
      mc(L10, 3, 2, 'A 10 ohm resistor carries a current of 2 A. How much power does it dissipate?',
        ['20 W', '5 W', '80 W', '40 W'], 3,
        'Use P = I^2 R.',
        'P = 2^2 x 10 = 4 x 10 = 40 W.'),
      mc(L10, 4, 3, 'The current through a fixed resistor is doubled. What happens to the heat it produces?',
        ['It doubles in direct proportion', 'It halves', 'It becomes four times larger', 'It stays the same'], 2,
        'Power depends on the square of current.',
        'Since P = I^2 R, doubling I multiplies the power by 4.'),

      // L11 Kirchhoff
      mc(L11, 1, 1, 'Kirchhoff\'s current law says that at any node',
        ['Current always splits equally among branches', 'The currents into the node sum to zero (current in equals current out)', 'Voltage is the same on every branch', 'Resistance adds up to zero'], 1,
        'It is a conservation law for charge.',
        'Charge cannot accumulate at a node, so total current in equals total current out.'),
      mc(L11, 2, 1, 'Kirchhoff\'s voltage law is a consequence of conservation of',
        ['Momentum of the charge carriers', 'Mass of the charges', 'Energy', 'Temperature'], 2,
        'A charge going round a loop returns to its starting potential.',
        'Voltage rises and drops around a closed loop sum to zero because energy is conserved.'),
      mc(L11, 3, 2, 'At a junction, 5 A and 2 A flow in. One branch carries 4 A out. What current does the other branch carry out?',
        ['1 A', '3 A', '7 A', '11 A'], 1,
        'Total in must equal total out.',
        'Current in is 7 A; 4 A leaves on one branch, leaving 7 - 4 = 3 A on the other.'),
      mc(L11, 4, 3, 'A 12 V source drives two resistors in series. If the first resistor drops 5 V, the second drops 7 V. Why must these drops add to 12 V?',
        ['Resistors always share voltage equally', 'Around the closed loop, the voltage rise from the source equals the total drop, reflecting conservation of energy', 'Voltage is destroyed by the second resistor', 'Because current is zero in the loop'], 1,
        'Think about a charge going once around the loop.',
        'KVL: the source raises potential by 12 V and the resistor drops remove the same total, so 5 + 7 = 12.'),

      // L12 Feedback
      mc(L12, 1, 1, 'In a feedback controller, the error is',
        ['Measurement minus setpoint, ignoring sign', 'Setpoint minus measurement', 'The controller gain applied to the error', 'The sensor noise on the measurement'], 1,
        'It is the gap the controller tries to close.',
        'Error is the setpoint minus the measured output, and the controller acts to shrink it.'),
      mc(L12, 2, 1, 'Which term of a PID controller responds to the accumulated past error?',
        ['Proportional', 'Derivative', 'Integral', 'Setpoint'], 2,
        'Accumulating is what an integral does.',
        'The integral term sums error over time, which removes lingering offset.'),
      mc(L12, 3, 2, 'A proportional controller has Kp = 2 and the measured error is 3 degrees. What is the proportional output?',
        ['1.5', '5', '6', '9'], 2,
        'Multiply gain by error.',
        'u = Kp x e = 2 x 3 = 6.'),
      mc(L12, 4, 3, 'Why can too much feedback gain make a system oscillate?',
        ['Large gains slow the sensor', 'The controller overcorrects, overshoots the setpoint and then overcorrects the other way', 'High gain removes the error entirely', 'Gain only affects the setpoint'], 1,
        'Picture steering a car with huge steering movements.',
        'Excessive gain (or delay) makes each correction too big, so the loop swings past the target repeatedly or becomes unstable.'),

      // L13 Semiconductors and Information
      mc(L13, 1, 1, 'What key capability does a transistor provide?',
        ['A small voltage or current controls a much larger one, enabling switching and amplification', 'It stores energy like a battery', 'It generates heat for chips', 'It transmits light through fibre'], 0,
        'Consider what amplification means.',
        'The control of a larger current by a small input is the basis of amplifiers and digital switches.'),
      mc(L13, 2, 1, 'Where and when was the first transistor demonstrated?',
        ['Bell Labs, 1947', 'IBM Research, 1971', 'Westinghouse, 1888', 'Intel Corporation, 1958'], 0,
        'Bardeen, Brattain and Shockley.',
        'The point-contact transistor was demonstrated at Bell Labs in 1947.'),
      mc(L13, 3, 2, 'A channel has a bandwidth of 1 MHz and a signal-to-noise ratio of 3. What is its Shannon capacity?',
        ['1 Mbit/s', '3 Mbit/s', '4 Mbit/s', '2 Mbit/s'], 3,
        'Evaluate log2(1 + 3) first.',
        'C = 1,000,000 x log2(4) = 1,000,000 x 2 = 2 Mbit/s.'),
      mc(L13, 4, 3, 'A vendor claims error-free transmission at 5 Mbit/s over the channel above (capacity 2 Mbit/s). What does Shannon\'s theorem say?',
        ['It is possible with a smarter modem', 'It is impossible, since no coding can exceed the channel capacity for error-free communication', 'It is possible only at night', 'It is possible if the bandwidth is reduced'], 1,
        'Capacity is a hard ceiling.',
        'The Shannon-Hartley capacity is the maximum error-free rate, so 5 Mbit/s cannot be reached.'),
    ],
  },
};

# Machine Atlas — 3D mechanical models, simulation engine and trades curriculum

Status: SCOPING (2026-10-04). Nothing here is built yet. Directive from Kenne: start with cars (gas),
then diesel, motorcycles, trains, boats, aircraft. Every field gets the full educational stack; the
automotive one is built first and everything is designed so it can be reused for any machine.

Related: `docs/ACADEMIA_LAW_MEDICINE_BLUEPRINT.md`, `docs/KNOWLEDGE_LAYER_DECISION.md`,
`services/verticalPacks/` (auto repair pack), `services/ticketCore.ts` (repair orders), Cell Atlas / Combat Atlas
(naming precedent), `components/HumanBodyExperience.tsx` (GLB + mesh-name part-info precedent).

## 1. How much of an auto curriculum can live on the platform

Estimates, not measurements.

| Slice | Share we can deliver | Notes |
|---|---|---|
| Theory: how systems work, parts and function, shop math, safety, shop business | ~85-90% | Pure knowledge; the same content/mastery/verification stack as Law/Medicine. |
| Diagnostic reasoning (symptom -> cause -> test) | ~70% | Fault-injection simulations ("break a part, see the symptoms") are the strongest teaching tool here. |
| Procedures (generic R&R, torque-and-sequence concepts, inspection) | ~60% | Generic per part ARCHETYPE only. Vehicle-specific procedures, specs and wiring are licensed (ALLDATA/Mitchell/OEM) and are not free. |
| Hands-on skill (tool feel, torque, seized bolts) | ~0% | Needs a shop. Simulation is pre-lab prep only. Pair with real shops via the Business side. |
| Certification | 0% | ASE tests are theirs. We can ALIGN lessons to the published ASE task-list topics and the ASE Education Foundation program areas (verify exact current area names before labelling anything). |

Ladder: PreK-5 "how machines move" (simple machines, wheels, gears) -> 6-8 "how a car works" ->
9-12 Auto Tech I/II (CTE-style) -> post-secondary: engine repair, drivetrain, steering/suspension, brakes,
electrical/electronics, HVAC, engine performance/diagnostics, hybrid/EV (high-voltage safety) -> shop business and
estimating (links to Plajah Business). Roughly 8 areas x 8-12 units = 80-100 units, 400-600 lessons,
3-5k practice questions. All content is AI-drafted until verified. Brakes, steering, airbags and high-voltage
content is safety-critical: it needs review by an ASE-certified master technician before any "verified" label.
The two-blind-verifier pipeline only proves AI agreement, not truth (see content-integrity memory).

## 2. The core idea: a Mechanism Graph (not a car model)

A car is a data file. The engine is generic.

- **PartArchetype** — id, name, category, geometry (procedural generator OR GLB with license/attribution),
  parameters, ports, materials, behaviors, content.
- **Ports** are typed: mechanical (shaft/joint), fluid (oil, coolant, brake fluid, fuel, air), thermal (contact),
  electrical, hydraulic-pressure, signal.
- **System** — parts + connections + scenarios (cold start, overheat, stuck thermostat, low oil, brake fade,
  ABS panic stop, dead cell, sticking latch).
- **Content per part** — name, what it does, what happens inside, wear and failure modes with symptoms,
  diagnostic tests, generic repair instruction (tools, difficulty, safety gates, time RANGE), cost RANGE
  (parts + labor hours, regional multiplier, shop override), ASE area, links to lessons.
- **Machine class profile** — which systems exist for car / diesel / motorcycle / rail / marine / aircraft.

This is the same shape as Modelica/bond-graph "acausal" modeling, kept small. Cars, diesels, motorcycles,
locomotives, outboards and piston aircraft share most archetypes (piston, crank, valve, bearing, gear, shaft,
pump, heat exchanger, brake, hydraulic cylinder, battery, motor). New field = new profile + new archetypes + content.

## 3. Simulation tiers (be honest about which is which)

| Tier | What | Examples | Method |
|---|---|---|---|
| S0 | Animated kinematics | crank-slider, cam/valve timing, gear trains, steering linkage, door latch | analytic constraints |
| S1 | Analytic models | Otto/Diesel P-V cycle, gear ratios, hydraulic pressure and booster, tire slip | closed-form / small ODE |
| S2 | Lumped-parameter networks | heat flow (thermal RC network painted as a heat map), coolant and oil loops (pipe/pump/valve network, flow and pressure), brake fade, battery/charging | 1D network solver |
| S3 | Illustrative field flow | flow through a water jacket, oil film in a bearing, airflow in a section | 2D lattice-Boltzmann or particle flow in WebGL/WebGPU, labelled "illustrative" |
| S4 | True 3D CFD / FEA | full coolant jacket CFD | NOT in browser. Possible later as precomputed OpenFOAM flow textures for a few canonical parts. |

Every simulation shows its tier badge and its assumptions. Do not present S3 as engineering-grade.
ABS: wheel-slip ODE with a simplified tire model plus a controller state machine (S1). Heat moving through a
piston, rings, oil: S2 network with S3 section view.

## 4. 3D asset strategy and the hard constraint

- Manufacturer CAD is proprietary and trademarked. We model GENERIC ARCHETYPES (inline-4 DOHC gasoline engine,
  MacPherson strut, 2-piston floating caliper, rack-and-pinion with hydraulic and electric assist, 6-speed manual,
  planetary automatic, open/limited-slip differential, cable-and-rod door latch with actuator), and generic body
  classes (sedan, SUV, pickup). No make/model branding.
- Authoring: (a) PARAMETRIC procedural generators in code for mechanisms (gears, pistons, cams, springs,
  discs) — owned outright, tiny files, simulation-coupled; (b) Blender headless pipeline (already proven for
  anatomy; Blender 4.2 exists via the MSIX copy) for housings/castings; (c) open-license assets only when the license is
  recorded per asset (CC-BY needs attribution; CC-BY-SA is viral; GrabCAD-type licenses are mostly NOT usable).
- Every asset carries `{license, author, sourceUrl, attributionText}`; the viewer shows attribution (Z-Anatomy precedent).
- Rendering: React Three Fiber + drei (already installed). Viewer shell: explode, isolate, x-ray, section cut,
  search, label, play/pause/scrub scenario, compare healthy vs failed part. Follow the R3F traps memory
  (onBeforeCompile and uv, shared cached GLTF geometry, additive-volume near fade).

## 5. Pilot scope and order (effort, not calendar promises)

| Phase | Deliver |
|---|---|
| 0 Foundation | PartArchetype/System schema + validator, viewer shell, solver interfaces, content template, licensing ledger, Learn-map subject "Machines & Trades" |
| 1 Pilot: BRAKES | disc + drum, master cylinder, booster, lines, caliper, ABS modulator; S1 hydraulics + friction heat (S2) + ABS slip sim; fault injection (fade, stuck caliper, air in lines, worn pads); full lesson set, repair + cost ranges; DVI link |
| 2 Engine | block, crank, rods, pistons and rings, head, valvetrain, timing, intake/exhaust; 4-stroke S0/S1; lubrication loop (S2); cooling loop and thermal map (S2/S3); scenarios (low oil, stuck thermostat, head gasket) |
| 3 Drivetrain and chassis | clutch + manual, automatic (torque converter, planetary sets, valve body), differential, CV axles, steering (manual/hydraulic/electric), suspension and alignment geometry |
| 4 Body and electrical | door latch/lock/window, battery, alternator, starter, basic circuits, HVAC refrigeration cycle, exhaust/emissions |
| 5 Hybrid/EV | high-voltage safety first; motor/inverter/battery archetypes |
| Next fields | Diesel (common rail, turbo, DPF/SCR) -> motorcycles -> rail -> marine -> aviation (piston first; turbine and airframe later; maintenance regulations differ per field and must be checked) |

Per field the Educational Stack is the same: archetype library + systems + simulations + curriculum + practice +
verification + business pack synergies.

## 6. Synergies with the business side (the reason to build both)

1. **DVI explainer**: tap a failed item and show the 3D part with the worn component highlighted, inside the
   customer approval link. Customers approve more when they understand.
2. **Shared part IDs**: archetype id = DVI checklist item = estimate line template = service-interval item =
   ticket line. One taxonomy.
3. **Estimate library**: generic labor-hour and part-cost ranges seed the shop's price book (shop overrides).
4. **Apprentice pipeline**: shop assigns modules to employees (Team + classroom reuse); verified mastery feeds the
   hiring board (Learner Ledger / Open Badges).
5. **Parts store / inventory pack**: archetype taxonomy becomes the product category tree with fitment later.
6. **Diagnostic trainer**: customer symptom -> fault scenario -> test steps; also powers the AI service advisor.
7. Other businesses on the same atlas: tire shop, collision/body, diesel and fleet, motorcycle, marine, small-engine
   and lawn-equipment, EV conversion, driving school, dealership product education.

## 7. Risks and decisions needed

- **Liability**: brake/steering/airbag/high-voltage content must carry safety gates and "consult the factory
  service manual" language, and needs expert review before it is called verified.
- **Costs**: no free authoritative repair-cost dataset exists. Ship authored RANGES labelled as estimates, shop
  overrides, regional multiplier; licensed data is a later paid add-on.
- **Model quality is the long pole**, not the code. Decide the visual bar: stylized-clean procedural vs.
  realistic sculpted. Recommendation: stylized-clean for mechanisms (always correct motion), realistic only for
  hero parts.
- **Naming**: "Machine Atlas" proposed (matches Cell Atlas / Combat Atlas). Not confirmed.
- **Performance**: 400-600 parts needs instancing, LOD, lazy per-system loading; target mid-range phones and the
  TV/Fire TV shells separately (TV: video only, no heavy 3D).

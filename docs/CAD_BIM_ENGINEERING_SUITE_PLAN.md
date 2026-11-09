# CAD, BIM and engineering suite: build-vs-borrow plan

Status: plan only, nothing built. Written 2026-11-08 for Kenne.
Working label in this doc: **Tela Build**. That's a description, not a product name. Naming is Kenne's call.

## The ask

- CAD and BIM on Plajah for makers, people with 3D printers, small businesses and professionals.
- Schematics, full drawing support, and a searchable patent library.
- Check a design against regulations.
- No new file format. Models, drawings and simulations live inside Tela documents.
- Open industry formats (DWG, DXF, IFC, STEP and others), aiming at about 90% of AutoCAD plus Revit.
- Order of disciplines: architecture, structural, civil and construction first. Then mechanical, automotive and robotics. Then electronics and chip design. Then biology (cell modelling and simulation).
- Every discipline can run simulations. The whole thing also works as an open MATLAB.
- It plugs into Museion, Academia and the existing plugin and API layer.

## Short answer

**Yes, it can be built.** The way to do it is to **borrow the hard numerical kernels and build everything people see and touch.**

- **Borrow (about 35% of the effort, most of the deep maths):** the solid-geometry kernel, file translators, meshers and the big solvers (FEA, CFD, SPICE, chip place-and-route, biology simulators). Each of these took decades of PhD work. Rebuilding them gains nothing and delays the product by years.
- **Build (about 65% of the effort, all of the product):** the Tela document model, 2D drafting, BIM authoring, drawing sheets, sketch constraints (later on), the rule checker, the maker workflow, the patent library, collaboration, the AI layer, simulation set-up and results, the compute notebook, and the marketplace. That's where Plajah is different, and none of it exists in open source in a form we could use.

**How close to 90% we can get, honestly:**

| Target | Realistic coverage | Why |
|---|---|---|
| AutoCAD 2D (drafting, layers, blocks, dimensions, hatches, layouts, plotting) | **85-90% in about 12 months** | All of it is vector work, and Tela's geometry engine already does booleans, offsets, hit testing and snapping. DWG reading and writing comes from ACadSharp (MIT). |
| AutoCAD 3D and mechanical-style solids | **70-80%** | OpenCASCADE gives us the solids. Our own work is the feature history and the user interface. |
| AutoLISP and scripts | **60-70%** of common scripts | A subset interpreter is feasible. Old ARX/.NET plugins will never run. |
| Revit | **60-70% of what a small or mid-size firm uses in about 24 months.** A literal 90% isn't realistic soon. | Revit's real moats are its family library, worksharing at scale and the closed `.rvt` format. We go through IFC as the open BIM standard, which also covers civil work since IFC 4.3. Direct `.rvt` needs a paid ODA SDK or a plugin running inside Revit. |
| MATLAB core (matrices, plots, ODEs, optimisation, signals) | **80%+ of everyday use** | Python plus NumPy, SciPy and Pyodide, plus Tela Sheet, cover it. We don't clone MATLAB's language, and Simulink is replaced by Modelica. |

## 1. Licence rules, which decide where each piece can run

The desktop app ships as an MSIX package, so anything we link into it counts as distribution.

| Licence | Rule |
|---|---|
| MIT, BSD, Apache, ISC | Link anywhere: web, desktop, server. |
| LGPL, MPL | Link only as a separate replaceable module (WASM or DLL). Publish any changes we make to that module. |
| GPL | Separate process only: on the server, or a user-installed helper the app calls. Never bundled into our code. |
| AGPL | Server use triggers source disclosure, so avoid it. If needed, hand off to a user-installed app or run an unmodified separate binary. |
| Custom or non-commercial (OpenSees and similar) | Don't use without a written licence. |

## 2. Building blocks: borrow or build

### Geometry core
| Layer | Pick | Licence | Decision |
|---|---|---|---|
| B-rep solid kernel (solids, booleans, fillets, shells, STEP/IGES) | **OpenCASCADE (OCCT)**: WASM in the browser (opencascade.js / replicad), native in the desktop engine | LGPL-2.1 + exception | **Borrow.** A home-grown kernel like Parasolid is a ten-year project. |
| Fast mesh booleans (printing, repair) | **Manifold** | Apache-2.0 | Borrow |
| 2D sketch constraint solver | Start on **PlaneGCS** (FreeCAD) as a WASM module | LGPL | **Borrow first, own later.** About 3-4 months to write our own Newton/LM solver with graph decomposition. It's worth owning because it is the "feel" of the product. |
| Feature tree (sketch, extrude, revolve, fillet, pattern, mirror, loft, sweep, shell) | Ours | — | **Build.** Stored as Tela operations, so co-editing and undo come free from `services/coedit`. |
| 2D drafting engine | Ours, on `services/tela/geometry` | — | **Build.** It already has bezier, boolean, offset, clip, hittest and snapping. |
| Hidden-line views for drawings | OCCT HLR | LGPL | Borrow the maths, build the views |
| Viewport | three.js / R3F (already in production), WebGPU | MIT | Already here |

### File formats
| Format | Source | Notes |
|---|---|---|
| DXF | Ours (the spec is public), **ACadSharp** for checking | Easy |
| **DWG** | **ACadSharp** (MIT, C#) on the desktop (WinUI is .NET) and in a .NET service on Cloud Run | Reads most versions. Write support is strongest for older versions (AC1018 = 2004 is the most stable; newer versions are filling in). Test against real files. **Optional upgrade:** an ODA Drawings SDK membership (paid, by quote) if we need full fidelity. That's Kenne's call. LibreDWG is GPL, so server-side only. |
| **IFC 2x3 / 4 / 4.3** | **web-ifc** (MPL-2.0, WASM) in the browser; **IfcOpenShell** (LGPL) on the server | IFC 4.3 covers roads, rail, bridges and ports, so civil work is included |
| Revit `.rvt` | Through IFC export; or an **open-source Speckle connector** (Apache-2.0) running inside the user's Revit; or the ODA BimRv SDK (paid) | We can't read `.rvt` freely, and nobody can |
| STEP, IGES, BREP | OCCT | |
| STL, OBJ, GLB, **3MF** | three.js, lib3mf (BSD) | 3MF matters most for printers: colour, multiple materials, print settings |
| PDF / SVG plotting | Tela export (already here) | |
| G-code (FDM printers, CNC, laser) | **Kiri:Moto** (MIT, slices in the browser) + handing off to the user's own Orca/Bambu/Prusa slicer | CuraEngine, PrusaSlicer and Orca are AGPL, so we don't bundle them |
| LandXML, GeoJSON, terrain | Ours + Terra + USGS 3DEP (public domain) + OpenStreetMap (ODbL) | Terra's city layer is already here |
| KiCad (`.kicad_sch` / `.kicad_pcb`), Gerber, Excellon | Ours (all three formats are documented) | KiCad itself is GPL. We read and write its files, we don't link its code. |
| SBML, SBGN, CellML | libSBML (LGPL), our own viewer | |
| FMI / FMU, Modelica | Modelica Standard Library (BSD-3), OpenModelica (separate process) | |

### Simulation, by discipline
| Discipline | Borrow (the solver) | Build (ours) |
|---|---|---|
| Structural frames (beams, columns, trusses) | PyNite (MIT) as a reference | **Our own 3D frame stiffness solver** in TS/WGSL. It's matrix-method work and very doable, and it's the heart of building structural software: load combinations, member checks, deflection |
| Solid FEA (parts, connections) | **CalculiX** (GPL, separate process), Gmsh / Netgen meshing | Setup UI, results field, report |
| Seismic / nonlinear | Not OpenSees (licence). Code_Aster (GPL, process) if needed | |
| CFD / wind / air flow | OpenFOAM (GPL, process) for heavy runs | **Our GPU lattice-Boltzmann solver** for quick runs, reusing the fluid-sim generators already built |
| Civil water / storm | **EPA SWMM, EPANET** (public domain / MIT) | Drainage and water-network design rooms |
| Energy / daylight | EnergyPlus (BSD-3), Radiance (BSD-ish) | |
| Multibody, robotics | **MuJoCo** (Apache-2.0), Project Chrono (BSD-3), Rapier (Apache, WASM), ROS 2 / URDF | Robot assembly → URDF, motion studies |
| Systems (automotive, controls) | Modelica (BSD lib) + OpenModelica (process) | Block-diagram room as the Simulink replacement |
| Circuits | **ngspice** (BSD, WASM ports exist) | Schematic capture, PCB layout, DRC, Gerber |
| Chip design | **Yosys** (ISC), **OpenROAD / OpenLane 2** (BSD / Apache), Verilator, **SkyWater SKY130 and GF180 PDKs** (Apache) | Server-side runs, layout viewer, course flow |
| Biology | **libRoadRunner / Tellurium** (Apache), COPASI (Artistic-2.0), **PhysiCell** (BSD-3), **Mol\*** (MIT) viewer, OpenMM (MIT), PDB and AlphaFold DB (CC-BY) | Pathway editor, cell sim rooms |
| Compute ("open MATLAB") | **Pyodide** (NumPy/SciPy/SymPy, BSD) in the browser; native Python and Julia (MIT) on the desktop | Notebook cells inside Tela, live links to model parameters, plots on the existing chart engine |

Heavy solvers run on the desktop app's native engine first (NVIDIA GPU, separate processes), then on Cloud Run, and the browser handles light jobs. That's the same desktop-first rule the AI features follow.

## 3. Staying inside Tela: no new file format

A Tela document is already frames plus devices plus stable-ID operations, and a sheet engine already lives inside it (`services/tela/sheet`). CAD fits the same way. **New device kinds, not a new format:**

| Device | Holds | Shows |
|---|---|---|
| `MODEL_PART` | Feature tree as Tela operations + parameters. B-rep cache and display mesh stored as assets | 3D viewport, editable in place |
| `MODEL_ASSEMBLY` | Part references, mates, joints | |
| `BIM_MODEL` | Building elements stored **with IFC meaning** (IfcWall, IfcSlab, IfcBeam, property sets) as Tela-native JSON. IFC is just how they enter and leave | Model, schedules |
| `DRAWING_VIEW` | A live view of a model: plan, section, elevation, detail, isometric. Dimensions and tags attached to model geometry | Sits on a normal Tela page. Title blocks are ordinary Tela templates |
| `DRAFT_2D` | AutoCAD-style 2D entities with layers, blocks and xrefs (Tela vector objects + a `cad` extension field, the same pattern as the `geom` field in `geometry/model.ts`) | |
| `SCHEMATIC` / `PCB` | Netlist + symbols / board stack | |
| `SIM_STUDY` | Setup (loads, mesh, boundary conditions) + a reference to the results field | Colour maps, charts, report |
| `CALC` | Notebook cells (Python, sheet formulas) bound to model parameters | Equations, plots |

So **a drawing set is just a Tela document.** Page 1 is the cover, pages 2-40 are sheets whose `DRAWING_VIEW` devices all point at the one `BIM_MODEL` in the same document. Change a wall and every sheet updates. Print and PDF export already keep real page sizes. Autosave, versions and co-editing come from the existing Creative Cloud and coedit layers. The `.tela` package stays the single file. DWG, IFC, STEP and 3MF are import and export doors, never the source of truth.

## 4. Schematics, drawings and the patent library

**Patents (buildable, and a real differentiator):**
- Sources: **USPTO PatentsView and bulk full text** (public, with an API), **EPO OPS** (free, needs registration), **WIPO PATENTSCOPE**, and Google Patents Public Datasets.
- Build: ingest → embed on our own model → search by meaning, CPC class and drawing. **"Find patents like my design"** from a Tela model or sketch.
- **Expired-patent shelf:** expired patents are free for anyone to build. This reuses the public-domain rights engine (`services/publicDomainRights`). It's a great hook for makers.
- Patent drawings become a large source of schematics.
- Always labelled "research, not legal advice, not a freedom-to-operate opinion."

**Open schematics and models:** NASA 3D (public domain), Smithsonian Open Access 3D (CC0), the OSHWA certified-hardware directory, KiCad libraries (CC-BY-SA with exception), Wikimedia technical drawings, plus whatever our own users publish. Every item shows its licence, using the existing rights engine. Copyrighted service manuals: no.

## 5. Checking a design against regulations

Buildable as a **pre-check that shows its sources**, never as a permit or an engineer's stamp.

- **Engine:** deterministic rules over the model. Use buildingSMART **IDS** (Information Delivery Specification) and IfcTester (LGPL) for BIM, plus our own rule packs for other areas. AI (Gemma on the desktop) helps turn rule text into checks and explain failures. The **pass/fail itself is never decided by AI.**
- **Free to encode now (US federal rules are public domain):** 2010 ADA Standards (ramps, door clearances, turning space, reach), OSHA 29 CFR (guards, stairs, railings), CPSC 16 CFR (small parts, toy safety for maker products), FCC Part 15 (electronics labelling), FDA basics.
- **Needs legal review before use:** model building codes (IBC, IRC), NFPA 70 (NEC), ASCE 7 loads, Eurocodes. These are copyrighted model codes. Court rulings (ICC v. UpCodes, ASTM v. Public.Resource.Org) support using codes once adopted into law, but that has to go past counsel first. Licensing the text is the other option.
- **Output:** a report that cites each rule, picks the jurisdiction, flags each item pass/fail/needs review, and is exported into the Tela document. A "send to a licensed PE or architect" marketplace pays the professional directly, with no held money.

## 6. The maker track runs in parallel from day one

It's cheap, and it's what builds the community:
- Import STL/3MF, repair with Manifold, measure, scale, add text and emboss, split for print bed size, then export 3MF with print settings.
- Slice in the browser (Kiri:Moto) or hand off to Orca/Bambu/Prusa. Send to the printer over OctoPrint / Moonraker (open APIs) from the desktop app.
- The existing Argilla clay and image-to-3D pipeline feeds in: sculpt → solid → printable.
- **Community:** remixable projects (with licence + lineage), build logs as Tela docs, print profiles, makerspace orgs, and selling files or finished products in the Store (5% fee without Plajah+, paid straight to the seller).
- Merch Designer and Tela print already exist. Laser and CNC come next.

## 7. Phases, in Kenne's order

Each phase ends with a gate checked in the lab, the same way Argilla works.

| Phase | Scope | Est. |
|---|---|---|
| **0. Foundations** | OCCT WASM + desktop native, Tela device kinds, viewport, import of DWG/DXF/IFC/STEP/STL/3MF, licence boundaries in place | 2-3 mo |
| **M. Maker lane** (parallel after 0) | Print prep, slicing handoff, community, Store | 2 mo |
| **1. AEC drafting + BIM** | 2D drafting (AutoCAD core), layers/blocks/xrefs, layouts, DWG round trip; walls, slabs, doors, windows, stairs, roofs, grids, levels; schedules; drawing sheets from the model; IFC round trip | 6-9 mo |
| **1b. Rules + patents** | ADA/OSHA rule packs, IDS checks, patent search + expired shelf | 3 mo (parallel) |
| **2. Structural + civil + construction** | Frame solver, load combos, member checks; CalculiX for solids; terrain, alignments, grading, SWMM/EPANET; 4D schedule (model + timeline) and 5D quantity takeoff / cost; RFIs and submittals as Tela docs | 6-9 mo |
| **3. Mechanical** | Sketch constraints, feature tree, assemblies, sheet metal, drawings with GD&T, CalculiX, CFD | 6 mo |
| **4. Automotive + robotics** | Multibody (MuJoCo/Chrono), URDF/ROS 2, Modelica systems | 4-6 mo |
| **5. Electronics** | Schematic, ngspice, PCB, DRC, Gerber, KiCad round trip | 6 mo |
| **6. Chip design** | Verilog → Yosys → OpenROAD on SKY130 on the server, layout viewer, Academia course | 4 mo |
| **7. Biology** | SBML pathways (RoadRunner), cell sims (PhysiCell), Mol\* molecules | 4-6 mo |
| **Throughout** | Compute notebook (`CALC` device), Labs integration | — |

## 8. Where it shows up

- **Tela:** authoring. Insert → Model / Drawing / Schematic / Simulation / Calc.
- **Museion** (the Labs components already exist: `LabsNotebook`, `LabsFormulaEditor`, `LabsDataVisualizer`, `LabsDisciplineView`): the open-MATLAB and simulation face, and a gallery of runnable studies.
- **Academia:** an engineering and architecture school on the Art College pattern, with each lesson a live Tela doc and model.
- **Plugins / API:** each solver is a registered adapter (the same pattern as `telaGenerativeRegistry`) so outside tools can join.
- **Store + orgs:** maker sales, firm workspaces, the PE/architect marketplace.

## 9. Decisions for Kenne

1. **ODA SDK membership** (paid) for full-fidelity DWG and `.rvt`, or start on free ACadSharp + IFC/Speckle and decide later? Recommendation: start free.
2. Approve the **licence rules** in section 1 (GPL/AGPL as separate processes only).
3. **Legal review** before encoding copyrighted model codes (IBC, NEC, ASCE 7).
4. The **product name**.
5. Host our own **Speckle server** for live Revit/Rhino/AutoCAD links? It's optional and helps adoption by firms.

## 10. Kenne's decisions (2026-11-08)

- **Free for the whole build.** Only free licences, following each one's rules. Where the only option costs money (ODA DWG/RVT SDKs, paid code texts), we build our own instead.
  - DWG: ACadSharp (MIT). Revit: IFC, plus our own small Revit add-in later. Speckle: not needed.
- **Codes:** write our own machine rules in our own words, each citing the adopted section number. Never copy the code text. Public permit and inspection data helps decide which rules to do first. Have a lawyer read the approach once before launch.
- **Name:** working favourite is "Plajah Build" (not final).
- **Shared physics core:** the real-time solvers (rigid bodies, GPU fluids, springs/modal, plate modes, reaction-diffusion, particles) should be one WebGPU layer used by Build simulations and by the music visualizers, which already run a GPU fluid sim.

## 11. Phase 0 status (2026-11-08)

Built, not committed:
- `services/cad/`:
  - `model.ts`: the in-memory model.
  - `dxf.ts`: our own DXF reader, R12 writer and SVG plot.
  - `mesh.ts`: STL/OBJ/3MF readers and print checks.
  - `ifc.ts`: web-ifc reader with classes, storeys and property sets.
  - `step.ts`: occt-import-js reader for STEP/IGES/BREP.
  - `importer.ts`: format detection.
  - `engines.ts`: browser WASM loaders.
  - `scene.ts`: three.js scene and GLB in/out.
  - `telaCad.ts`: Tela device.
  - `licences.ts`: licence rules, enforced by a test.
- `components/cad/CadRoom.tsx`: the room (2D view, 3D view, layers, model tree, properties, size, print check, DXF/SVG export, "Add to document").
- Tela: a `cad` field on MEDIA devices (`TelaCadRef` in types.ts). Entry points are an "Open in CAD" button on the board, Insert → "CAD & BIM file", the "CAD & BIM" button on Tela home, and Tela's import (CAD files open the room).
- Lab: `cad-lab` on :3229 (`?file=/tests/fixtures/cad/example.ifc`). Tests: `npm run test:cad` (16 pass). Type check: `npm run typecheck:cad`.
- Checked in the real app as a guest: DXF imported → room → added to the document → "Open in CAD" reopened it from the kept original.
- Not checked: signed-in upload to tela-media, and reopening after a page reload.

Added later the same day:
- **DWG** through ACadSharp 3.8.35 (MIT). `windows-native/Plajah.WinUI/CadDwgService.cs` converts DWG to DXF and our DXF reader does the rest.
  - The desktop app gets it through the `CAD_DWG_TO_DXF` bridge message; the browser uses it only when running inside the desktop app.
  - `windows-native/tools/CadDwg` is the same code as a command-line tool, built with `npm run build:cad-dwg`. Tests use it, and a server can later.
  - ACadSharp's own 2004 and 2018 sample files read the same drawing in about 0.5 s.
- **DXF reader** now also draws MULTILEADER, MLINE (centre line), TOLERANCE and MESH. It skips paper-space and invisible entities, and hides XLINE/RAY with a note.
- **Viewer:**
  - Measure, with point snapping in 2D.
  - Section cut along X, Y or Z in 3D.
  - Narrow screens (under 900 px): the side panels become drawers and the buttons go icon-only. The camera fit accounts for portrait screens.

Phase 0 still to do:
- DWG on the web without the desktop app: a .NET WASM build, or a server service.
- The OCCT modelling kernel (not only import).
- IFC write.
- Large-model streaming.
- Snapping for the 3D measure tool.
- ACIS solids (3DSOLID/REGION) in DWG/DXF. ACIS is a closed format with no free reader, so this needs our own SAT parser later.

## 12. Biology Lab, phase 0 (2026-11-08)

Built (not committed at writing). All our own code except three.js; the data sources are open.

**Molecules (`services/bio/structure.ts`, `molScene.ts`, `sources.ts`)**
- Our own PDB and mmCIF readers, handling alternate locations, multiple models, waters, ligands and element guessing.
- Bonds found from distances, plus CONECT records; disulfides found. Chains, sequences and protein mass.
- Secondary structure: taken from the file, or worked out from C-alpha geometry when the file lists none (all AlphaFold models). It's a simplified P-SEA-style rule, not DSSP.
- Styles: cartoon (tube by helix/sheet/coil), ball-and-stick, space-filling.
- Colours: by structure, element, chain, or AlphaFold confidence (pLDDT bands).
- Live fetch from RCSB PDB (CC0) and AlphaFold DB (CC-BY 4.0). The credit travels with the Tela item.

**Pathways (`sbml.ts`, `math.ts`, `ode.ts`, `models.ts`)**
- Our own SBML level 2/3 core reader and writer: compartments, species, parameters, function definitions, initial assignments, assignment and rate rules, local parameters. Events and algebraic rules are reported, not simulated.
- MathML is read into our own expression tree; there's no `eval`. An infix parser handles rate laws people type.
- Solvers:
  - Dormand–Prince 5(4) for smooth models.
  - Rosenbrock 2(3) (the ode23s scheme) for stiff ones.
  - Auto mode detects stiffness (Hairer's test) and switches; Robertson takes 222 steps instead of 34,574.
- Five starter models written from the published equations: enzyme kinetics, repressilator (Elowitz & Leibler 2000), predator–prey, SIR, Robertson. Checked against reference values: Robertson at t=40 to 5 digits, SIR final size 0.9405.
- Sliders re-run the model live; the repressilator takes about 47 ms per run.

**Room and Tela:**
- `components/bio/BioRoom.tsx` has two tabs, Molecule and Pathway, and a phone layout.
- Opened from Tela home ("Biology Lab"), Insert → Biology Lab, or the "Open in Biology Lab" button on a molecule item.
- A molecule becomes a MODEL_3D media device with `bio: TelaBioStructureRef`: a GLB, the original file kept, and the credit.
- A simulation becomes a native CHART device with `bio: TelaBioSimulationRef`, holding the SBML with the slider values used.
- Lab: `bio-lab` on :3230 (`?tab=pathway`). `npm run test:bio` (13 pass), `npm run typecheck:bio`.

**Checked:**
- Crambin, hemoglobin (4 chains, 4 hemes, 574 residues) and AlphaFold P69905 loaded live in the lab.
- Molecule and chart devices built in the lab.
- The chart was added to a real Tela document (guest) and rendered.

**Not checked:** reopening a saved molecule after a page reload, and signed-in uploads.

**Added later the same day:**
- **SBML events:** triggers are located exactly by bisection between output points. Delays, values taken at trigger time, re-arming triggers, and events that set parameters or boundary species all work. The writer saves events too.
- **Compiled formulas:** each rate law becomes closures once instead of being walked as a tree on every call. That's 5–10× faster; a 300-reaction model runs in 57 ms.
  - The tolerance scales to the model's own magnitudes (femtolitre models hold amounts near 1e-21).
  - A rejected step counts toward the step limit, a not-a-number error estimate shrinks the step, and a wall-clock budget stops any run that would freeze the page.
- **Stochastic simulation:** Gillespie's direct method, seeded and repeatable, with a molecules-per-unit setting. The "Run again" button gives a new random draw.
- **BioModels:** search, load by ID, and eight famous curated models. Curated models are CC0, and the credit is shown.
  - Their search backend returned nothing on 2026-11-08 while downloads worked, so loading by ID and the picks don't depend on search.
- **Real models checked:** BIOMD 1–20 plus eight famous models. 27 of 28 run cleanly. The 100-species EGF model (BIOMD19) hits the time budget.
- **Reopening:** a Biology Lab chart in Tela has an "Open in Biology Lab" button that reopens the model with the slider values it was made with. Checked in the real app as a guest.
- `npm run test:bio`: 19 pass.

**Next for biology:**
- Real ribbon cartoons (flat helices and arrows).
- Reopening a chart's simulation from Tela.
- A faster stiff solver (higher-order BDF) for big signalling models like BIOMD19.
- Tau-leaping for large stochastic runs.
- Cell populations and reaction-diffusion on the shared GPU physics core.
- Molecular dynamics through OpenMM on the desktop app.
- Sequence tools.

**Safety:** this lab is for teaching and research modelling. Pathogen-enhancement tooling stays out of scope.

## 13. Drafting editor and faster, sharper biology (2026-11-08, later)

**CAD: the 2D room is now an editor (`components/cad/DraftView.tsx`, `services/cad/draft.ts`).**
- **Tools:** select, pan, line (chains), polyline (C closes, U undoes a point), rectangle, circle, arc (centre/start/end), aligned dimension, text, move, copy (repeats), measure.
- **Object snaps:** endpoint, midpoint, centre, quadrant, intersection, perpendicular, grid, with AutoCAD-style markers and labels. Toggles: OSNAP (F3), GRID (F7/F9), ORTHO (F8).
- **Selection:** click, Shift to add or remove, window (left to right), crossing (right to left). Grips show; Delete erases. The status bar shows length and area of what is selected, a quick takeoff.
- **Command line:** aliases (L, PL, REC, C, A, DIM, T, M, CO, E, U, Z, DI) and typed points (`x,y`, `@dx,dy`, `@d<angle`, or a bare distance along the cursor). Typing anywhere goes to the command line.
- **Undo/redo:** 200 steps, Ctrl+Z / Ctrl+Y.
- **View:** stays put while you edit; Z zooms to extents.
- **Drawings:**
  - "New drawing" starts with US National CAD Standard layer names (A-WALL, A-DOOR, A-GLAZ, A-FLOR, S-GRID, A-ANNO-DIMS, A-ANNO-TEXT).
  - Clicking a layer makes it current, and you can add layers.
  - An edited drawing is saved to Tela as DXF, so edited DWG originals are kept as DXF.
- **Dimensions:** a new entity type, drawn architectural style with ticks and upright text, and written to DXF as lines and text.
- **Checked in the lab, all by typed input:** a 6 × 4 m room as a closed polyline, a dimension, a label, a column. Then with the mouse: endpoint snap reads exactly 6, 4 m; picking the wall reports a 20 m perimeter and 24 m² area; move by `@0,1000` changes the drawing depth from 4.86 to 5.86 m; undo and redo restore it; "Add to document" saves a DXF with all layers.
- **Next:** offset, trim/extend, fillet, mirror, rotate, scale, hatch, blocks, walls with thickness (the start of BIM authoring), layouts/sheets.

**Biology:**
- **Sparse Jacobians:** the dependency pattern comes from the rate laws (following assignment rules and functions), then columns are grouped (Curtis–Powell–Reid). The 93-species EGF model (BIOMD19) needs 20 evaluations per Jacobian instead of 93, with bit-identical results. A full 3600 s run takes 2.5 s in node. All 28 real models tested now run.
- **Background worker:** `services/bio/sim.worker.ts`. Bursts of slider moves are coalesced and stale answers dropped. During a multi-second run the page's worst pause was 17 ms.
- **Ribbons:**
  - Flat helix ribbons and β-strand arrows, oriented by each residue's C=O vector (flipped to stay consistent on strands); loops stay tubes.
  - CA-only files fall back to tubes.
- `npm run test:bio`: 21 pass. `npm run test:cad`: 22 pass.
- **Next:** a higher-order stiff solver (Rodas4 or variable-order BDF) for fewer steps; sparse LU.

## 14. Architectural library and edit tools (2026-11-08, later)

**Library (`services/cad/library.ts`, `components/cad/LibraryPanel.tsx`).** 51 parametric items, all our own drawings and none copied from a vendor library:
- **Doors:** single, double, sliding, pocket, bi-fold, overhead, cased opening.
- **Windows:** fixed, casement (1 or 2 sashes), sliding, bay.
- **Stairs:** straight with break line and UP, L with landing, spiral, 1:12 ramp.
- **Furniture:** beds Single to King, sofa by seats, armchair, chair, dining table with chairs, round table with chairs, desk, wardrobe, bookshelf.
- **Kitchen:** counter run, sink, range, fridge, dishwasher, island with stools.
- **Bathroom:** WC, basin, bath, shower, urinal, 1525 mm ADA turning space, grab bar.
- **Structure:** square, round and steel-H columns, grid line with bubble.
- **Electrical:** receptacle, switch, ceiling light, downlight, smoke detector.
- **Landscape:** tree, shrub, person.
- **Vehicles and parking:** car, parking row with an accessible aisle.
- **Annotation:** north arrow, section mark, elevation marker, level, scale bar, ISO sheet border and title block.

How it behaves:
- Each item is built from its parameters and placed as a real block reference. The block name encodes the settings, so the same settings reuse the same block.
- Items land on National CAD Standard layers (A-DOOR, A-FURN, P-FIXT, S-COLS…), created with colours as needed.
- Parameters show in the drawing's own units; inch drawings scale correctly.
- Placing: type an angle, R rotates 90, F flips, Esc stops.
- **Your own libraries:** "Blocks in this drawing" lists the named blocks of any opened DWG/DXF. "Load blocks from a DWG/DXF" merges another file's blocks (nested ones too) and layers, converting units.

**Edit tools:**
- **Rotate:** base point, then a click or typed angle.
- **Scale:** base point, then a typed factor or a reference point and a new point.
- **Mirror:** copies by default, keeps text readable (MIRRTEXT 0) and mirrors block references correctly.
- **Offset:** typed or picked distance. Lines, circles and arcs work; polylines get mitred corners, and a closed outline offsets in or out regardless of drawing direction. This is the quick way from a room outline to wall faces.
- Aliases: RO, SC, MI, O.

**Checked in the lab:**
- Room outline, offset 200 outward (6.4 × 4.4 m).
- Library door set to a 200 mm wall placed on the wall line; king bed placed rotated 90° with R.
- Door mirrored across the centre line, then the copy rotated 180° by typed angle.
- DOOR900 loaded from a DXF.
- `npm run test:cad`: 27 pass.

**Next:** trim/extend, fillet/chamfer, hatching tool, wall tool with thickness, cleanups at joins, and door/window insertion that cuts the wall automatically (BIM authoring begins). Then layouts/sheets with viewports.

## 15. Walls, hosted openings, hatching, trim/extend/fillet (2026-11-08, later)

- **Walls** (`services/cad/walls.ts`): a centreline with thickness and height.
  - Where exactly two walls share an end, the corner mitres; free ends get square caps.
  - Doors, windows and openings are hosted: each sits at a distance along its wall and on a side, and the wall's faces break around it.
  - The opening is drawn with its library symbol and moves, rotates and mirrors with the wall. Mirroring flips the swing side and the hinge correctly.
  - DXF export explodes walls together, so corners stay mitred.
- **Wall tool (`W`):** chain clicks or typed points, `C` closes, and a thickness field (default 200 mm).
- **Library doors and windows snap into walls:** placed over a wall they become hosted openings, centred on the click and facing the side the cursor is on, rejected if they don't fit or overlap. Anywhere else they stay free blocks.
- **Hatching** (`services/cad/hatchPatterns.ts`): SOLID, ANSI31, ANSI37, NET, AR-BRSTD brick and LINE, clipped even-odd so holes work.
  - The `H` tool picks the smallest closed shape around the click.
  - Imported DXF hatches now show their patterns, reading pattern scale (41) and angle (52).
  - Patterns are written to R12 DXF as lines.
  - Brick defaults to real size; line patterns default to plan scale.
- **Trim (`TR`):** lines, circles and arcs, with everything else acting as cutting edges.
- **Extend (`EX`):** lines and wall centrelines.
- **Fillet (`F`):** lines with a radius, or radius 0 for a sharp corner. Walls always join at their centrelines and then mitre.
- **Fix:** pointer maths reads the canvas size at the moment of the event, so a layout change can't misplace a click before the resize observer reports.
- **Checked in the lab:**
  - A closed room of 4 walls.
  - A library door hosted in the south wall at 1050 (centred on the click) swinging inward.
  - An 1800 window hosted in the east wall.
  - Two separate walls joined into a corner by fillet.
  - Brick and ANSI31 hatches.
- `npm run test:cad`: 32 pass.

## 16. Winning architects: delighters, and the Autodesk pain points we design out

**Delighters, roughly in build order (most stand on things already built):**
1. **Schedules that write themselves.** Door and window schedules from hosted openings, room area tags and wall takeoffs, live as you draw. The data is already in the wall model.
2. **Code check while you draw.** ADA clearances (turning circle, door manoeuvring space), egress widths, stair riser/tread, ramp slope: shown green or red on the plan as you place things, not at plan review.
3. **Share a link, not a file.** Clients and consultants open the drawing or model in a browser (Tela), comment on the spot, and approve. No viewer install and no seat for them.
4. **Live co-editing** (the coedit layer already exists). No central-model sync, no worksharing conflicts.
5. **Visual diff between versions.** Red/green overlay of what changed between issues; revision clouds drafted automatically.
6. **Napkin sketch or site photo to plan.** A hand sketch becomes clean walls, doors and dimensions, using the image-understanding work from Plajah 3D, run on device.
7. **Context in one step.** Type an address and get the site, terrain (Terra and USGS 3DEP), sun path and shadows.
8. **Plain-language command line.** "Add a 900 door here", "make this room 12 m²", alongside the AutoCAD aliases people already know.
9. **Cost as you draw.** Quantities from walls, floors and openings feed a running estimate.
10. **On-site markup from a phone.** Photo plus markup goes back into the drawing as a task.

**Autodesk pain points, and our answer:**
| Pain | Our answer |
|---|---|
| Subscription cost (thousands a year per seat; Revit is subscription only) | Free core, kept free through development |
| DWG/RVT version lock-in: newer files won't open in older versions, no save-down for Revit | Open formats first: read any DWG version, write DXF, IFC as the BIM exchange, and our own documents open in a browser |
| Revit is Windows-only and needs heavy hardware | Browser plus the desktop app; runs on Mac, Chromebook, tablet and phone. Heavy work in workers or on the GPU |
| Collaboration costs extra (BIM 360 / Autodesk Construction Cloud), central files conflict | Live co-editing and comments built in, free |
| Licence friction: sign-in, named users, offline problems | Works offline, syncs later; nothing to activate |
| Hunting for blocks and families | Parametric library plus your firm's own DWG/DXF block files |
| AutoCAD isn't BIM, and Revit's 2D drafting is weak | One tool: AutoCAD-style drafting and BIM walls/openings in the same drawing |
| Plotting setup (page setups, CTB pen tables) | Tela pages are the sheets; PDF output at true size |
| Steep learning curve | Same command aliases, plain-language help, Academia courses |
| Data locked in a vendor cloud | Your files stay yours, and everything exports |

## 17. Schedules that write themselves and live accessibility checks (2026-11-08, later)

- **Rooms** (`services/cad/rooms.ts`):
  - Wall centrelines are split at crossings and T-junctions into a planar graph, and its enclosed faces are traced as rooms.
  - Each room's net polygon is pulled in by half of each bounding wall's thickness, so its area is floor area inside the faces.
  - **Room tags** (`RT`): click inside a room and type a name. Numbering is automatic (101, 102…). The tag shows number, name and area, live: move a wall and the area changes. Areas are in m², or ft² in imperial drawings.
- **Schedules** (`services/cad/schedules.ts`, `components/cad/SchedulesPanel.tsx`), computed on every edit:
  - **Doors:** mark, type, width, height, hinge, room it opens into, wall, hosted or free.
  - **Windows:** mark, type, width, height, sill, head, room.
  - **Rooms:** number, name, net area, perimeter, gross area, total.
  - **Walls:** grouped by thickness, with count, length, and face area less openings.
  - Imperial drawings show feet-and-inches (3'-0").
  - Free library door/window blocks count too; their parameters are read back from the block name.
  - Each schedule has CSV download and "Add to document", which makes a native Tela grid.
- **Plan marks:** D01, D02, W01 sit next to each opening (MARKS toggle), from the same source as the schedules.
- **Accessibility pre-checks** (`services/cad/codeCheck.ts`): rules in our own words, each citing the 2010 ADA Standards (public-domain federal regulation):
  - §404.2.3 door clear width ≥ 815 mm. Estimated as leaf width minus 50 mm; one leaf of a pair.
  - §404.2.4.1 latch-side clearance ≥ 455 mm on the pull side, stopping at the wall's end or the next opening.
  - §603.2.1 / §304.3.1 a 1525 mm turning circle in rooms named bath/toilet/WC/restroom/washroom (largest inscribed circle).
  - §604.2 toilet centreline 405–455 mm from a parallel side wall.
  - §504.2 stair treads ≥ 279 mm (riser height not modelled yet).
  - Results show as counts and a list with citations, red "!" markers and green dots on the plan, and a CHECKS n toggle in the status bar. A disclaimer says it is a pre-check, not a code review.
- **Picking:** clicking inside a wall's thickness selects the wall.
- **Checked in the lab:**
  - A two-room plan tagged Living (15.96 m²) and Bath (5.32 m²).
  - A 900 door passes; a 750 door into the bath fails clear width (about 700 mm).
  - The 1400 mm-wide bath fails turning space. Moving the partition 300 mm makes it 6.46 m² and the check passes (1700 mm), live.
  - The door schedule was sent to the document as a table.
- `npm run test:cad`: 35 pass.
- **Next:** door manoeuvring clearances on the push side; toilet clear floor space (§604.3); corridor width on named corridors (§403.5.1); hatching rooms from walls; schedules placed on sheets; then the 3D view from walls (heights already stored) and IFC export of walls, doors and windows.

## 18. Plajah BIM stack: our own 3D model and IFC4 writer (2026-11-08, later)

Kenne, 2026-11-08: we are building our own BIM stack. Open-source engines are for checking our output, not for producing it.

- **3D from the plan** (`services/cad/bim3d.ts`, all ours):
  - Walls rise to their stored height in pieces around each opening. A door keeps the wall above its head; a window keeps it below the sill and above the head. Ends use the mitred plan corners.
  - Door leaves and glazing fill the openings; each room gets a floor slab (ear-clipped).
  - Every piece is a closed solid (tested).
  - The output is a CadModel whose elements carry IFC classes (IfcWall, IfcDoor, IfcWindow, IfcSlab) and dimensions.
  - The "3D" button in the CAD room flips the plan into it, with the Model tree, properties, section cut and measure.
- **IFC4 writer** (`services/cad/ifcWrite.ts`, all ours):
  - Spatial structure: IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey.
  - **IfcWall:** an extruded arbitrary profile, the true mitred plan shape, plus Qto_WallBaseQuantities.
  - **Openings:** an IfcOpeningElement plus IfcRelVoidsElement for each opening.
  - **Doors and windows:** IfcDoor/IfcWindow plus IfcRelFillsElement, with mark, overall size and operation type (single swing left/right, double, sliding, folding, rolling up).
  - **Rooms:** an IfcSpace for each room (number, long name, net floor polygon, Qto_SpaceBaseQuantities: NetFloorArea m², NetPerimeter, Height), and an IfcSlab .FLOOR. under it.
  - Encoding: lengths in mm, areas in m²; GlobalIds in IFC base-64; strings escaped (\X2\) and REALs formatted per STEP.
  - The "IFC" button exports the file.
- **Independent check:** tests read our IFC back with web-ifc (a separate engine). It sees 5 walls, door, window, 2 spaces, 2 slabs and the spatial structure, at the right size (6.2 m outer, 2.7 m tall). Its geometry engine applies our voids, and space areas come through.
- **Importer fix:** web-ifc doesn't mesh IfcSpace, and our importer only read properties for meshed elements, so room areas were lost from any opened IFC. Spaces and zones now keep their property and quantity sets.
- **3D view fix:** drei's infinite grid scales its plane by fadeDistance, which in millimetre models made a plane about 600 km across. Depth precision broke and the grid drew through every solid. The view now uses a finite grid sized to the model, and the unneeded polygon offset is gone.
- **Checked in the lab:**
  - Two-room plan with two doors and two windows.
  - 3D shows walls cut around openings, door leaves, glazing and slabs.
  - The exported IFC (15 KB: 5 walls, 2 doors, 2 windows, 4 openings, 2 spaces, 2 slabs) re-opens through web-ifc in the browser with every class.
- `npm run test:cad`: 38 pass.
- **Next for the BIM stack:**
  - Levels/storeys (multiple floors, wall base and top constraints).
  - Slabs and roofs as objects of their own.
  - Columns and beams to IFC.
  - Wall types (layered: finish, stud, insulation) into IfcMaterialLayerSet.
  - Property sets for fire rating and acoustics.
  - Read IFC back into editable walls (round trip).
  - BCF issues.
  - Our own CSG for arbitrary voids.

## 19. Mechanical parts, Electronics Lab, and fabrication (2026-11-08, later)

**Mechanical parts (CC0).** `services/mech/geometry.ts` (extrude with holes, lathe, helix tube, STL
writer) and `services/mech/parts.ts`: 11 parametric standard parts built from published standard
dimensions (hex bolt, socket screw, nut, washer, ball bearing, involute spur gear, 2020 extrusion,
NEMA 17 plate, L-bracket, spacer, compression spring). All closed solids (tested). CAD room: **Parts**
button and tab, STL export in mm.

**Electronics Lab** (`services/elec`, `components/elec/ElecRoom.tsx`, lab `elec-lab` on :3231):
- Component library with symbols, ratings and models: passives, LED, diodes, NPN, N-MOSFET,
  batteries (incl. CR2032), USB 5 V, DC supply, AC mains, switch, fuse, speaker, 555, 7805.
- Our own simulator (`sim.ts`): nodal analysis, Newton-Raphson with junction limiting (and limiting
  counted against convergence), backward-Euler C/L, behavioural 555 (5k divider, flip-flop) and
  7805 (regulation, dropout, quiescent). Matches textbook results: 555 f = 1.44/((R1+2R2)C) within
  1%, RC charge to 1 − e⁻¹ at τ, divider, LED currents.
- Seven starter designs released CC0 (USB LED lamp, coin-cell keychain light, 555 blinker, 555 tone
  into a speaker, 5 V regulated supply, transistor switch, RC filter), verified wire-by-wire.
- Checks (`checks.ts`): wiring (open pins, shorted supplies, no ground), stress with 50% resistor
  derating, LED/diode/capacitor/transistor/regulator limits, 7805 junction temperature, USB budget,
  battery life; regulatory pre-checks in our own words citing the source: FCC Part 15 (15.3(k),
  15.103(h), 15.5, 2.906/2.938, 15.19, 15.105), Reese's Law (16 CFR 1263, PL 117-171), OSHA
  1910.303/1910.7 NRTL, toy rules (16 CFR 1250/1107), EU LVD 2014/35, EMC 2014/30, RoHS 2011/65 +
  2015/863, WEEE 2012/19, Battery Regulation 2023/1542 Art. 11. Market switch US / EU / both.
- Editor: place/rotate/move (wires follow), orthogonal wires, undo, live LED glow and net voltages,
  transient playback, 4-channel scope, part properties with live readings, parts list.
- Exports: SVG sheet, SPICE netlist (ngspice/LTspice/KiCad), circuit JSON. Tela: **Add to
  document** puts the sheet (MEDIA with `elec` ref, reopens in the lab) plus the parts list as a
  GRID; Insert menu and home button.

**Fabrication: Plajah Build Make** (`services/fab`, `components/fab/MakePanel.tsx`, CAD room
**Make** tab). Not just printing: every way a design reaches a machine.
- 23 processes with design rules: FDM, resin, SLS, MJF, material jetting; metal LPBF/SLM/DMLS,
  EBM, binder jetting, bound-metal extrusion, DED/WAAM; 3-axis and 5-axis mills, router, lathe,
  wire EDM; CO₂/fiber/diode lasers, plasma, waterjet, drag knife; press brake.
- 30 machine profiles with dialect and link: Klipper (Moonraker), PrusaLink, OctoPrint, Duet,
  Marlin USB, GRBL/FluidNC, LinuxCNC, Fanuc/Haas-style ISO, lathes, plasma (QtPlasmaC), fiber, Ruida
  (file), resin and closed printers (3MF handoff), metal machines (CLI + 3MF).
- Our own CAM: polygon offsetting (no clipping library), kerf-compensated cutting with holes first
  and lead-ins from scrap, router depth passes, pocketing, a basic FDM slicer (walls, rectilinear
  infill, solid skins), lathe roughing + finish from the turned profile, CLI layers for powder bed,
  3MF writer (with sintering shrink scale).
- Post-processors: Marlin, Klipper, RepRapFirmware, GRBL, GRBL laser (M4 dynamic power), LinuxCNC,
  ISO (program number, tool change, coolant), plasma, ISO lathe (G18/G7 diameter mode).
- DFM: machine fit, thin walls (slice and shrink), overhangs, sintering shrink, turning axis, small
  holes (plasma 1.5× thickness), sharp inside corners vs tool radius, max thickness, PVC-on-laser
  block.
- Connectors: Moonraker, OctoPrint, PrusaLink, Duet upload-and-start; USB streaming with the
  firmware "ok" handshake over Web Serial; CORS caveat noted (desktop app has none).
- Tests: `npm run test:elec` (13), `npm run test:fab` (15), mech tests in `test:cad` (40 total);
  `typecheck:elec`, `typecheck:cad`.

**Next:** 3D surfacing CAM (waterline/parallel), adaptive clearing, tabs/onion-skin for routers,
supports for FDM/resin, sheet-metal flat patterns with K-factor and bend tables, PCB layout from the
schematic (footprints, Gerber/Excellon export, DRC), CPU designer (logic simulator, HDL), the desktop
app's serial/LAN bridge.

## 20. Safety first, prompt-to-design, boards, printing gaps, Maker Exchange (2026-11-08, later)

**Safety is rule number one.** Every stage now carries hazards and acknowledgements:
- `services/safety/hazards.ts`: design hazards (mains, coin cells, batteries / Li-ion, hot parts, radio exposure, connected-device security, children's products, magnets, soldering) and machine hazards per process (laser fire/eyes/fumes, router/mill entanglement and dust, lathe, plasma, waterjet, press brake, printer fires and VOCs, resin, metal powders, DED, EDM, sewing). Critical hazards must be ticked before export, Add to document, Prepare or Send.
- Component advisories (uncertified AC-DC modules, counterfeit cells and chips, coin-cell products, USB chargers, LED strip adapters) and live recall lookups: US CPSC Recall API (public, no key) proxied and cached at `GET /api/build/safety/recalls`; EU Safety Gate, UK PSD and Health Canada as search links (no stable public API we can rely on). A failed lookup is shown as unavailable, never as "no recalls".
- Maker terms (`services/safety/terms.ts`, versioned, plain-language draft for counsel to review): design aid not certification, safety responsibility, assumption of risk and release (as far as the law allows), IP responsibility (we run no clearance searches; generated designs are CC0 and avoid brand shapes), indemnity, independent suppliers with direct payments, recall duties. Gate on first use in the Electronics Lab and the Make tab; acceptance stored locally and, when signed in, server-side at `buildTermsAcceptance/{uid}`. A waiver cannot remove every liability (consumer-protection law, gross negligence, a seller's product liability), so the design-stage warnings are the real protection.

**Boards and smart devices** (`services/elec/boards.ts`): Raspberry Pi (Pi 5/4/Zero 2 W/3B+ with recommended supplies), Pico (W variants), ESP32, Arduino Nano, class-D amp, certified AC-DC module, BME280, signal source, guitar pickup, output jack, USB load, LED strip. Simulated (supply draw, 3V3 regulator, GPIO drive; lagged supply currents use the source state the solve actually used, or the fixed point oscillates). Checks: pin current, 3V3 rail, under/over-voltage, Pi supply vs recommendation, radio rules (FCC 15.212/15.247 modular approval, EU RED + Delegated Reg 2022/30 cybersecurity, CRA timeline, UK PSTI, California SB-327).

**Prompt to design** (`services/elec/recipes.ts`): 8 product recipes (lamp, smart Wi-Fi lamp, USB wall charger, powered speaker, USB MIDI controller, electric guitar/bass, Wi-Fi environment sensor, Raspberry Pi hub). Rules-based prompt reader (counts, colours, scale lengths, markets); the desktop app can pre-read with the on-device model, validated against the recipe params. Each build gives a wired schematic (verified pin-to-pin), simulation, firmware (CircuitPython USB MIDI, ESPHome YAML with secrets file, Python gpiozero service), extras, steps, and an enclosure (`enclosure.ts`: packing, cutouts, printable base + lid, laser panels DXF) or, for guitars, a body plan (`guitar.ts`: our own Arc outline, pockets from scale length, slotted fretboard DXF).

**Printing gaps closed:** raster supports (bed-only or everywhere), skirt/brim, retraction + Z-hop, fan control, 11 filament presets, resin slicing with raft + pillar supports to SL1 (own PNG encoder; UVtools converts to vendor formats), resin presets.

**Maker Exchange** (`services/supply/*`, `routes/makerBuild.ts`, `components/supply/*`): directory of 35 suppliers (distributors, PCB fabs, mechanical, machining/printing services, print-on-demand textiles and apparel, fabric by the yard, plush and cut-and-sew manufacturers); BOM sourcing with DigiKey v4 and Mouser search when the operator sets `DIGIKEY_CLIENT_ID/SECRET` and `MOUSER_API_KEY`; local maker shops (incl. sewing, plush, embroidery) and requests for quotes with the design's safety notes attached; quotes carry the maker's own payment link (no held money). Firestore collections `makerShops`, `makerRequests`, `buildTermsAcceptance` are server-only (no client rules needed).

**Next:** counsel review of the terms, PCB layout, 3D CAM.

## 21. Sewing & Plush: soft-goods patterns (2026-11-08, later)

**Where:** `services/soft/{geometry,patterns,layout,pdf}.ts`, `services/safety/softHazards.ts`, `components/soft/PatternRoom.tsx`; opens from the Tela home row ("Sewing"), the app menu, and "Sew it" in the Merch Designer. Lab `sew-lab` on :3233. `npm run test:soft` (13), `tsconfig.soft.json`.

**Templates (our own drafts, millimetres):** plush critter (two panels + oval base, silhouette from a smooth-union SDF traced by marching squares, scaled to the exact height; base perimeter = front + back bottom seams), plush ball (N gores), envelope pillow cover, throw/blanket (turned or bound, optional weighted channels), duvet cover (US/EU sizes), fitted sheet (depth + tuck corner notches, elastic about 65% of the edge, crib size), tote, tee and hoodie (own size chart 2T-14 and XS-3XL, three fits, sleeve cap solved to the armhole length, hood fitted to the neckline), gathered skirt. Wide pieces split into a full-width centre and two sides.

**Outputs:** per-edge seam allowance (0 on folds, deeper on hems); fold pieces unfold for single-layer cutting; marker per fabric (skyline packing, grain parallel to the selvedge) with yardage (+10%); print-at-home PDF tiled at 1:1 (Letter/A4, test square, assembly map, cut list) and copy-shop A0 / 36″ roll; rectangles go in a cut-by-measurement chart instead of being printed; DXF (cut-only for drag-knife/laser, notches as 4 mm slits) and SVG per fabric; tech pack PDF (cover, pieces, BOM with yardage/notions/fill, measurements and grading, construction, quality checks, safety and labels).

**Safety:** who it is for (adult / 3+ / under 3 / baby) and "I plan to sell it" drive the hazards. Blocked outright (`Hazard.block`, cannot be acknowledged away): plastic eyes/buttons/beads on under-3 toys, battery sound modules for under-3s, hood/neck drawstrings in children's sizes, weighted blankets for under-3s, pillows/duvets/throws for babies. Critical acknowledgements: children's sleepwear flammability (16 CFR 1615/1616), crib sheet fit, batteries. Selling children's products adds CPSIA testing/certificate/tracking label; labels list (16 CFR 303, 423, stuffed-article law labels). Laser cutting faux leather (PVC) is gated by the existing laser hazards. Recall lookups: plush toy, stuffed animal, hooded sweatshirt, weighted blanket, crib sheet.

**Next:** plush from the user's own drawing (trace an outline), more garments (trousers, dress bodice, kids' sizes graded per piece), pattern grading across sizes in one print, Printful/Printify/Gooten hand-off for all-over-print cut-and-sew.

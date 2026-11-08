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
- Lab: `cad-lab` on :3229 (`?file=/tests/fixtures/cad/example.ifc`). Tests: `npm run test:cad` (15 pass). Type check: `npm run typecheck:cad`.
- Checked in the real app as a guest: DXF imported → room → added to the document → "Open in CAD" reopened it from the kept original.
- Not checked: signed-in upload to tela-media, and reopening after a page reload.

Phase 0 still to do:
- DWG through ACadSharp (.NET, desktop bridge + server).
- The OCCT modelling kernel (not only import).
- IFC write.
- Large-model streaming.
- Measuring and sections in the viewport.

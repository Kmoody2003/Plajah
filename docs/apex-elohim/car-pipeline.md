# Car pipeline: reference art to a drivable, trainable car

Every car in Apex Elohim goes through the same steps. Each step writes its numbers into the car's `spec.json` and one line into
`games/apex/car/_training/runs.jsonl`, so the next car starts from measured priors instead of guesses.
First car through it: Kestrel Sovereign GT-R (`games/apex/car/sovereign/`).

## Rule zero (Kenne, 2026-11-16): never reference the texture atlas picture
Do not open or use the scan's baked texture atlas image (a jumbled collage of car fragments) as a reference; it misleads about where
windows, lamps and intakes are. Take positions from the video frames (`views/frame*.png`), the design sheet, and ray casts of the scan geometry.
The scan body itself is the shell: a lofted body built only from the silhouette profile and width rows (`src/sovbody.ts`, spec `body: "modelled"`)
was tried and rejected, it came out as a different car (side silhouette 80%, wrong hood / greenhouse proportions). The mesh surgery in
`scanparts.ts` (planar cuts, gaps, liners) works on the scan once the cut planes are measured from it, so the panels, glass, grille and intakes
are real pieces on the scan body.

## Rules that came out of the first car
- The generated mesh is only the **shell**. Paint, glass, wheels, brakes, suspension, engine, exhaust, lamps and trim are real parts
  built from the spec. Never keep the baked image as paint: it carries studio reflections and smears and reads as a decal.
- Paint is one solid clearcoat colour. The baked texture is only read to find things (glass, old wheel spokes).
- Measure positions from the scan itself (its own wheels, its own surfaces). Do not reuse numbers from a stand-in car: the first
  wheel placement was 16 cm (front) and 34 cm (rear) off because it came from the stand-in.
- Place anything that sits on the body (lamps) by ray cast against the scan surface, not by typed coordinates.
- Never leave floating hardware: check every added part from the side, front and rear before calling a step done.
- Score against the reference from several angles and report each number; do not average a good view into a bad one.
  Gate is 95% silhouette on side, front, rear and top. The Sovereign is at 79.1% side (single-image mesh), so it is not at the gate.

## Steps
1. **Intake.** Put the turntable video frames in `views/` (`frame0..7.png`). Cut the car out of each (`cutouts.py`, rembg) to `cut0..7.png`.
2. **Profile fit.** `fit_profile.py` reads the side cut-outs and writes `fit.json` (roofline, ride height, wheel columns, front/rear widths).
3. **Mesh.** `gen_hunyuan.mjs [frame]` calls the local Tela 3D runtime (Hunyuan3D-2mini, port 51124) for one frame. `orient.py` rotates it
   (nose +Z, ground at y = 0, 4.78 m) to `sov_base.glb`; the painted copy goes to `public/games/apex/car/`.
   Single-image meshes are guessed on the far side. Prefer a multi-view mesh when one is available.

   **Which Plajah workflow:** the shape generator is **Tela 3D**, also used by Argilla's generated-geometry route
   (`services/tela/tela3dService.ts`, `services/argilla/understand/`). The desktop starts it through
   `TELA3D_ENSURE`; the dev server starts it with `POST /api/local-ai/tela3d/ensure` (`routes/localAi.ts`).
   A failed health request does not prove the engine is missing: `connect EACCES` means the caller cannot
   access that local socket. Do not substitute Argilla's procedural car block-outs or the old asset-sheet
   meshes for the measured shell-and-parts assembly described here.

   For a file-based job without the HTTP service, use the installed Tela Python:
   `"D:\Plajah Runtime\tela3d-py\Scripts\python.exe" -u games/apex/car/run_tela_shell.py --car corsair --frame 0`.
   This imports the existing `engines/tela-3d/tela3d_runtime.py` and calls its own `cut_out` and `image_to_mesh`
   functions. It uses the Sovereign settings (Hunyuan-mini, 380 octree, 5 steps, 60k faces, 0.92 foreground),
   existing offline weights, and the engine's temperature guard. `--check` reports installed backend and GPU
   readiness. The runner refuses to overwrite a shell and records the engine's metrics. Generation is only
   the shell step; orientation, each car's own measurements, panel surgery and visual review still follow.

4. **Measure the scan.** Open `car.html?scan=1&nodisc=1` (shows the baked wheels without the replacements). From the side view read the baked
   wheel centres and the px/metre (car length / pixels), and write `wheels` into `spec.json`.
5. **Spec.** `spec.json` holds: `glb`, `paint`, `wheels` (z, x, scale, discard radius), `panels` (door/hood/trunk boxes, hinge, axis, open angle),
   `engine`, `exhaust`. Coordinates are the car frame: x across (+left), y up from the ground, z along (+nose), metres, origin centred.
6. **Build (src/scancar.ts, `loadScanCar(spec)`).**
   - Shell is split into fixed body + panels: a triangle belongs to a panel when all three vertices are inside its box. Panels pivot on their hinge.
   - Shader: solid paint, seams where the surface crosses a panel box, black bumpers / skirts / arch lips, honeycomb grille and intakes, glass
     (tinted, keeps the baked pattern), black roof, back faces dark.
   - Parts: wheels (10 split-Y spokes, drilled discs, calipers), suspension (arms, coil springs, dampers, anti-roll bars, driveshaft), engine bay
     and V8, quad exhaust, diffuser, splitter, headlight and taillight assemblies (ray cast onto the surface).
   - Smooth normals by shared position (the generated mesh is lumpy and flat normals make the clearcoat blotchy).
7. **Review.** `car.html?scan=1` has views, door/hood/trunk toggles, `?nodisc=1`, and `carScore()` for silhouette scoring.
8. **Log the run** (see below).

## Making the tools learn
- `car/_training/runs.jsonl`: one JSON line per build or correction, appended by hand or by `car/log_run.py`:
  `{ "car", "step", "date", "predicted": {...}, "measured": {...}, "score": {...}, "note": "what was wrong and the rule it produced" }`.
- Wheel positions, panel boxes and lamp positions are logged as fractions of overall length / width / height as well as metres, so the
  next car's first guess is `length * fraction`, then measured and corrected.
- When a correction repeats across two cars it graduates to a rule in this file and to a default in the spec generator.
- Corrections to date: wheel z measured from the scan (front 0.287 L, rear -0.333 L); hood box must stay inside the fender line or
  one-sided scan sheets show as black fins; exhaust tips sit flush in the bumper, diffuser tucked under; lamp parts ray-cast to the surface.

## Cinematic target
The game should reach the graphic fidelity of the stills and videos in the racer folder (aerial coastal turn, trackside telephoto with the
REPLAY tag and timing tower, kerb-level sparks, aerial dune highway). The replay system (`src/replay.ts`) records the drive and a camera
director cuts aerial / trackside telephoto / kerb / chase / nose / wheel shots with TV overlays. Fidelity work still open: sparks and tyre
smoke, depth of field and motion blur in replay, reflections and wet surfaces, night lights, crowd and trackside props.

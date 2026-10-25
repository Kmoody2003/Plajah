// The Ravencrest Canon — what building Ravencrest (games/ravencrest, Oct 2026) taught us, kept as standing
// principles for the Game Developer & Interactive Experiences Council and every interactive experience
// and game on Plajah. Each principle names the council seat that guards it and the evidence it came from.
//
// No imports on purpose: ariaCreativeRoles.ts and gameCouncilService.ts both read this file.
// Add to it when a new game teaches something; don't fork per-game copies.

export type CanonSeat = 'HARDWARE_PIONEER' | 'REALTIME_3D_GURU' | 'GAMEPLAY_VIRTUOSO' | 'JAPANESE_AUTEUR';

export type CanonPillar =
  | 'TARGETS'      // who it must run for, and how fast
  | 'MEASURE'      // how we know
  | 'GPU_CRAFT'    // what actually costs time on the GPU/CPU, and the fixes that worked
  | 'ENGINE'       // three.js r184 / WebGPU / TSL traps that cost us days
  | 'FIDELITY'     // matching the art
  | 'FEEL'         // controls, camera, combat, testing
  | 'SOUND'        // score and sound rules
  | 'ASSETS'       // characters, models, textures, budgets
  | 'SHIP';        // packaging, hosting, platform integration

export interface CanonPrinciple {
  id: string;
  pillar: CanonPillar;
  seat: CanonSeat;
  rule: string;
  /** What happened in Ravencrest that made this a rule. */
  evidence: string;
}

export const RAVENCREST_CANON: CanonPrinciple[] = [
  // ── Targets ──────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'igpu-baseline', pillar: 'TARGETS', seat: 'HARDWARE_PIONEER',
    rule: 'The baseline player is a laptop integrated GPU (Intel Arc iGPU class) in a browser: it must hold 60 fps at a 720p internal render upscaled to the display. Discrete GPUs (the Windows desktop app, a 4070) get the "ultra" tier on top of that; never the other way round.',
    evidence: 'Windows browsers ignore WebGPU powerPreference, so even this RTX 4070 laptop renders the browser game on its Arc iGPU. The first build ran 222 ms/frame there.',
  },
  {
    id: 'tiers-by-adapter', pillar: 'TARGETS', seat: 'REALTIME_3D_GURU',
    rule: 'Pick the quality tier from the GPU adapter (vendor/architecture), not the screen. Shadows, SSR, full bloom, 2k textures and big light pools are discrete-GPU features; the iGPU tier gets lean glow, no shadow map, 1k textures and dynamic resolution. Phones get their own tier.',
    evidence: 'Moon shadow map alone was ~6 ms on the iGPU; 12-pass bloom → 3-pass lean glow; desktop WebView2 forces the discrete GPU and selects ultra.',
  },
  // ── Measure ──────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'profile-per-pass', pillar: 'MEASURE', seat: 'REALTIME_3D_GURU',
    rule: 'Measure per render pass on the target GPU before optimizing (GPU timestamp queries labelled by pass, like ravencrest.passProfile). Then attribute scene cost by hiding one thing at a time. Fix what the numbers name, not what looks expensive.',
    evidence: 'The biggest win (~5 ms) was a post-processing bug nobody suspected; bark and leaves had the same triangle count but leaves cost 6 ms and bark ~0.',
  },
  {
    id: 'ab-in-page', pillar: 'MEASURE', seat: 'REALTIME_3D_GURU',
    rule: 'Compare A/B/A inside one page on frozen frames using the best (minimum) frame time, several reps. Never compare separate runs across machine load, reboots or driver versions; record the driver version with every benchmark. Close anything else rendering on the same GPU first.',
    evidence: 'The same view measured 12 ms and 29 ms minutes apart under background load; a driver update made everything ~2× slower; the app\'s own browser pane rendering the game skewed results.',
  },
  {
    id: 'verify-visuals-same-frame', pillar: 'MEASURE', seat: 'JAPANESE_AUTEUR',
    rule: 'Every optimization must prove it looks the same: compare old vs new on the identical frozen frame (keep a direct/reference path to diff against). A speed-up that changes the art is a regression unless the director signs off.',
    evidence: 'The baked-sky first pass was vertically flipped; only a same-frame comparison against the direct shader caught it.',
  },
  // ── GPU craft ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'pixels-over-triangles', pillar: 'GPU_CRAFT', seat: 'REALTIME_3D_GURU',
    rule: 'On integrated GPUs pixels cost more than triangles: per-pixel procedural noise, alpha-tested overdraw and full-resolution passes are the usual suspects. Shade less per pixel before cutting geometry.',
    evidence: 'Sky fbm (7 octaves) ~5 ms, road noise up to 6 ms, foliage overdraw ~6 ms; 1.6M forest triangles were not the problem.',
  },
  {
    id: 'internal-res-everywhere', pillar: 'GPU_CRAFT', seat: 'REALTIME_3D_GURU',
    rule: 'Every pass after the scene runs at the internal resolution until the final upscale. Check the profiler\'s target sizes: three\'s blur/TRAA/FSR nodes auto-size their input RTTs to the drawing buffer unless you size them.',
    evidence: 'Bloom + TAA ran at 1080p while the scene was 720p, so FSR upscaled 1080p→1080p; fixing it took post from ~10 to 4.7 ms and removed a per-frame WebGPU copy error.',
  },
  {
    id: 'bake-the-static', pillar: 'GPU_CRAFT', seat: 'HARDWARE_PIONEER',
    rule: 'Anything that doesn\'t change per frame doesn\'t get computed per pixel per frame: bake static noise masks into textures once (bakedMasks), compute soft slow-moving fields at low resolution (sky clouds at ⅓ res), stand far objects up as impostors.',
    evidence: 'Road (12 octaves → 2) and sky both went from several ms to ~0 with identical frames.',
  },
  {
    id: 'foliage-prepass', pillar: 'GPU_CRAFT', seat: 'REALTIME_3D_GURU',
    rule: 'Alpha-cut foliage gets an alpha-test-only depth prepass and diffuse-only (Lambert) lighting; the lit pass tests depth without writing it so only the front leaf is shaded.',
    evidence: 'Alpha test defeats early-Z; leaves were the costliest surface (~6 ms) until prepass + Lambert saved ~4 ms with no visible change.',
  },
  {
    id: 'cull-per-instance', pillar: 'GPU_CRAFT', seat: 'HARDWARE_PIONEER',
    rule: 'An InstancedMesh spread across a level is one bounding volume, so it is never culled. Cull per instance (pack visible instances each frame) and keep per-instance data in attributes that move with the instance, never derived from instanceIndex.',
    evidence: '~2,100 trees drew every frame including behind the camera; per-instance culling saved 0.9–1.7 ms. Tree sway keyed on instanceIndex would have twitched as trees were repacked.',
  },
  {
    id: 'cpu-draw-budget', pillar: 'GPU_CRAFT', seat: 'HARDWARE_PIONEER',
    rule: 'Count draw calls: three r184 costs ~0.1 ms CPU each. Batch static geometry by material, cache identical materials so batching merges across modules, put all flames/particles in one instanced draw, and keep a fixed pool of K real lights fed from many virtual ones so shader variants never change.',
    evidence: 'Static batching took the hall from 595 to 30 meshes and CPU submit from 22 to 11 ms; exterior CPU 26 → 6.9 ms.',
  },
  {
    id: 'hardware-facts', pillar: 'GPU_CRAFT', seat: 'HARDWARE_PIONEER',
    rule: 'Know the target silicon: never dynamically index local arrays or vector components in shaders on the D3D path (100× slowdown on this Arc); Intel iGPU fp16 is unreliable; the iGPU shares one power/thermal budget with the CPU, so background CPU load and power modes slow the GPU.',
    evidence: 'A background app pinning one core plus a power-state change swung Arc frame times by 2×.',
  },
  // ── Engine traps (three.js r184 / WebGPU / TSL) ──────────────────────────────────────────────────────
  {
    id: 'rtt-v-flip', pillar: 'ENGINE', seat: 'REALTIME_3D_GURU',
    rule: 'Render targets are stored top-down under WebGPU: flip V when sampling an RTT you rendered (impostors, baked masks, screen-space caches).',
    evidence: 'Upside-down impostor trees; the flipped baked sky.',
  },
  {
    id: 'tsl-if-in-fn', pillar: 'ENGINE', seat: 'REALTIME_3D_GURU',
    rule: 'TSL If/Else must sit inside an Fn; an RTT referenced only inside a branch never updates; textures sampled in non-uniform branches need explicit gradients or WGSL rejects the shader.',
    evidence: 'A top-level If crashed the whole page load; a debug branch showed a blank sky.',
  },
  {
    id: 'frames-and-time', pillar: 'ENGINE', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'Run game events, door fades and cutscene beats on simulation time, never setTimeout or wall clocks. Pass nodes only re-render when the node frame advances, and hidden tabs don\'t tick rAF; captures and tests must advance frames themselves.',
    evidence: 'Timers stalled in background tabs; captures repeated stale frames until capture() called nodeFrame.update().',
  },
  {
    id: 'r184-known-limits', pillar: 'ENGINE', seat: 'REALTIME_3D_GURU',
    rule: 'Known r184 limits: SMAA breaks once two pipelines exist (use FXAA/TAA); TRAA renders black offscreen; shadow.autoUpdate=false crashes; InstancedBufferGeometry with infinite instanceCount crashes (use BufferGeometry + InstancedBufferAttribute); materials writing an MRT target the pass lacks render flat; reversed depth + AA-before-upscale fixes texture tearing.',
    evidence: 'Each cost a debugging session in Ravencrest rounds 2–7.',
  },
  // ── Fidelity ─────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'art-is-authority', pillar: 'FIDELITY', seat: 'JAPANESE_AUTEUR',
    rule: 'When a world comes from concept art, the art is the authority: calibrate a camera to the painting and place landmarks by the pixel where they appear (ArtAnchor), so the reference shot registers by construction and everywhere else is a consistent 3D place.',
    evidence: 'The old exhibition had wrong topology and competing painted backdrops; the anchored rebuild matched the 44 art plates.',
  },
  {
    id: 'evidence-gates', pillar: 'FIDELITY', seat: 'JAPANESE_AUTEUR',
    rule: 'Councils review with captured evidence (art on top, engine below), not opinions and not local LLM batch runs. A slice passes a gate only with paired captures.',
    evidence: 'Local council batches overloaded the laptop; paired captures in games/ravencrest/review made decisions fast and honest.',
  },
  {
    id: 'materials-match-art', pillar: 'FIDELITY', seat: 'JAPANESE_AUTEUR',
    rule: 'Choose materials by what the art shows, not by the scan\'s name; desaturate warm CC0 scans to the palette; reflections are additive (they only add light).',
    evidence: '"castle" brick was red clay → grey slate; replace-blended SSR punched black holes into wet roads.',
  },
  {
    id: 'atmosphere-is-content', pillar: 'FIDELITY', seat: 'JAPANESE_AUTEUR',
    rule: 'Atmosphere is content: trees leaning over the road, low mist, a living sky. Keep screen effects (lens blood, splatter) small by default with the occasional big hit.',
    evidence: 'Kenne liked the overgrown road; asked for mostly small lens blood.',
  },
  // ── Feel ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'camera-respects-steering', pillar: 'FEEL', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'The camera never turns on its own while the player steers; it follows behind, the mouse steers, and it settles back behind the character only after idle. Collision-check the boom so it never clips.',
    evidence: 'An auto-turning camera spun Kenne in circles; the follow camera became the default at his request.',
  },
  {
    id: 'ask-before-reworking-controls', pillar: 'FEEL', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'When a player says controls are hard, ask what specifically before reworking them again.',
    evidence: 'Several control reworks in a row missed the actual complaint.',
  },
  {
    id: 'fights-escalate', pillar: 'FEEL', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'Enemies are aggressive and smart, bosses are long and strategic and escalate (Ravencrest: Dracula ≥ 3× the troll), the hero faces an attacker on hit, and every hit has juice. Give players healing/evade/block tools so difficulty is fair.',
    evidence: 'Kenne asked for smarter monsters, a strategic troll fight and a much bigger Dracula; block/evade/orb healing followed.',
  },
  {
    id: 'never-stuck', pillar: 'FEEL', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'Players never get stuck or lost: capsule collision with step-up probes, ledge guards, anti-stuck nudges, respawn on the last safe ground, and a clear sightline landmark.',
    evidence: 'Falls into the moat and wedged capsules were early playtest failures.',
  },
  {
    id: 'test-by-simulation', pillar: 'FEEL', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'Test gameplay with deterministic simulation hooks (simulate(), walkTo, scripted fights), yielding between chunks so async loads resolve, not by watching rAF.',
    evidence: 'Automated walks verified the whole route road → hall → galleries; rAF-based tests were flaky in hidden panes.',
  },
  {
    id: 'input-detection', pillar: 'FEEL', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'Support keyboard/mouse, gamepad and touch from the start, and never detect phones by touch points (touchscreen laptops exist); pointer lock may be refused, so keep a drag-to-look fallback.',
    evidence: 'The dev laptop reports 10 touch points; the app\'s pane refuses pointer lock.',
  },
  // ── Sound ────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'score-has-rules', pillar: 'SOUND', seat: 'JAPANESE_AUTEUR',
    rule: 'The score follows the owner\'s rules, not a random shuffle: Ravencrest\'s overture always leads, exploration tracks crossfade, and the boss theme plays only from the bell onward. Ask for the rules up front on every game.',
    evidence: 'Kenne set exact cue rules for the Ravencrest score.',
  },
  {
    id: 'recorded-over-synth', pillar: 'SOUND', seat: 'JAPANESE_AUTEUR',
    rule: 'Prefer a curated recorded (CC0) sound bank over synthesized effects for anything physical; time voice lines against real transcripts.',
    evidence: 'The recorded SFX bank replaced synth hits; comic timecodes for voice lines were only approximate.',
  },
  // ── Assets ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'no-unapproved-spend', pillar: 'ASSETS', seat: 'HARDWARE_PIONEER',
    rule: 'No paid generation credits without the owner\'s approval; prefer the local pipeline (image→3D on the discrete GPU, one model at a time) and never run local LLM batches that overload the machine.',
    evidence: 'Character credit spend needed approval each time; local council batches green-screened the laptop.',
  },
  {
    id: 'rig-safety', pillar: 'ASSETS', seat: 'REALTIME_3D_GURU',
    rule: 'Snapshot rest transforms instead of calling skeleton.pose() on imported rigs; check mirrored rigs before retargeting; facing corrections are pure rotations about up.',
    evidence: 'Meshy rigs shrank 100× under skeleton.pose(); a mirrored retarget flipped Jack\'s head.',
  },
  {
    id: 'gpu-compressed-assets', pillar: 'ASSETS', seat: 'HARDWARE_PIONEER',
    rule: 'Ship GPU-compressed textures (KTX2) and packed maps (AO/rough/height in one file, bump from derivatives); load only the maps shaders sample; 1k tier for integrated GPUs, 2k for discrete.',
    evidence: 'Triplanar fetches 18 → 6 per pixel; KTX2 cut load time and VRAM for the cast, vehicles and surfaces.',
  },
  // ── Ship ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'standalone-module', pillar: 'SHIP', seat: 'REALTIME_3D_GURU',
    rule: 'Each game is a standalone module (own Vite config and dev port) built to public/games/<name>/play and mounted in the app as a same-origin iframe; it talks to the host by postMessage (achievements, "watch this film").',
    evidence: 'The old preview hung scanning the whole repo; the iframe kept the game\'s renderer and memory out of the main app.',
  },
  {
    id: 'ship-fresh-builds', pillar: 'SHIP', seat: 'GAMEPLAY_VIRTUOSO',
    rule: 'Rebuild the game bundle from the committed tree right before shipping and keep game builds out of the PWA precache, so players never run a stale game.',
    evidence: 'A ship nearly went out without three performance commits in the prebuilt bundle; precached builds kept serving old game versions.',
  },
];

/** The principles a council seat guards. */
export function canonForSeat(seat: CanonSeat): CanonPrinciple[] {
  return RAVENCREST_CANON.filter((p) => p.seat === seat);
}

/** One line per principle (its first sentence): light enough to ride along with every game-surface prompt. */
export function ravencrestCanonDigest(): string {
  const first = (r: string) => { const i = r.search(/[.;:] /); return i > 0 ? r.slice(0, i + 1) : r; };
  return ['Ravencrest Canon — standing lessons for every Plajah game and interactive experience (binding unless the creator overrides):',
    ...RAVENCREST_CANON.map((p) => `- ${first(p.rule)}`)].join('\n');
}

/**
 * Compact text for prompts and briefs. `seat` lists that seat's own principles in full and the rest as
 * one-liners; without it every rule is included (no evidence) for a whole-council brief.
 */
export function ravencrestCanonBrief(seat?: CanonSeat): string {
  const head = 'Ravencrest Canon (standing lessons for every Plajah game and interactive experience):';
  if (!seat) return [head, ...RAVENCREST_CANON.map((p) => `- [${p.pillar}] ${p.rule}`)].join('\n');
  const own = canonForSeat(seat).map((p) => `- ${p.rule} (Why: ${p.evidence})`);
  const rest = RAVENCREST_CANON.filter((p) => p.seat !== seat).map((p) => `- ${p.id}`);
  return [head, 'You guard:', ...own, 'Also binding (owned by other seats):', rest.join(' ')].join('\n');
}
